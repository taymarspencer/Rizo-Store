from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app

ROOT=Path(__file__).resolve().parents[1]
results=[]
def rec(name, ok, detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'), name, detail)

LOAD_STATE='''n=>{const s=RizoRuntimeQA.defaultState();s.pet.stage="kid";s.pet.variant="classic";s.pet.hiddenVariant="classic";s.pet.energy=100;s.pet.hunger=100;s.pet.mood=100;s.pet.health=100;s.pet.resting=false;s.pet.sleeping=false;s.player.tutorialDismissed=true;s.player.defenseSchool={dismissed:true,completed:["route","placement","targeting","intel","doctrine","abilities"],replay:false};s.collection.classic=1;s.farm.roster=[];const vars=["ember","frost","moss","shadow","golden"];for(let i=0;i<n;i++){const r=JSON.parse(JSON.stringify(s.pet));r.id="HOUSE-"+(i+1);r.number=i+2;r.name="HOUSE "+(i+1);r.variant=vars[i];r.hiddenVariant=vars[i];r.homeRoom=0;r.stage="kid";s.farm.roster.push(r);}RizoRuntimeQA.loadForQA(s);return RizoRuntimeQA.defenseRosterConfigForQA();}'''

def roster_dom(page):
    return page.evaluate('[...document.querySelectorAll("[data-defense-roster-id]")].map(x=>x.dataset.defenseRosterId)')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':320,'height':568})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    page.evaluate('document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked")')

    # Explicit solo / empty crew remains viable.
    page.evaluate(LOAD_STATE,0)
    empty=page.evaluate('RizoRuntimeQA.defenseSetRosterForQA([])')
    rec('explicit empty crew keeps Captain only', len(empty)==1 and empty[0]['source']=='active', str(empty))
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(160); page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()'); page.wait_for_timeout(80)
    ids=roster_dom(page)
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
    placed=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    # Integrated bench contract: the crew is Captain-only, while the universal
    # Defense-only structures (Worker B) always remain available to any player.
    def is_universal(i): return i.startswith('defense-structure-') or i.startswith('defense-tool-')
    crew_ids=[i for i in ids if not is_universal(i)]
    universal_ids=[i for i in ids if is_universal(i)]
    rec('Captain-only run launches and can deploy', len(crew_ids)==1 and len(universal_ids)==3 and placed==1 and after['cash']==before, f'crew={crew_ids} universal={universal_ids} placed={placed} cash={before}->{after["cash"]}')

    # Guest selection enforces one trial at a time.
    page.evaluate(LOAD_STATE,0)
    chosen=page.evaluate('RizoRuntimeQA.defenseSetRosterForQA(["defense-crew-violet","defense-crew-frost"])')
    guests=[x for x in chosen if x['source']=='guest']
    rec('saved config normalizes to one loaner maximum', len(guests)==1, str(chosen))

    # Deep collector run roster survives speed and pause changes.
    page.evaluate(LOAD_STATE,5)
    page.evaluate('RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-4","HOUSE-5","HOUSE-2"])')
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(160); page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()'); page.wait_for_timeout(80)
    baseline=roster_dom(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.5)')
    speed1=roster_dom(page)
    page.evaluate('RizoRuntimeQA.defenseSetSpeedForQA(2)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.5)')
    speed2=roster_dom(page)
    snap2=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('1x to 2x keeps frozen crew unchanged', baseline==speed1==speed2 and snap2['simulationClock']>0, f'base={baseline} speed={snap2.get("visualBudget")}')

    paused=page.evaluate('RizoRuntimeQA.defensePauseForQA(true)')
    pause_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.75)')
    pause_after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    pause_ids=roster_dom(page)
    resumed=page.evaluate('RizoRuntimeQA.defensePauseForQA(false)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.25)')
    resume_after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('pause freezes simulation without changing crew', paused and pause_before['simulationClock']==pause_after['simulationClock'] and pause_ids==baseline, f'clock={pause_before["simulationClock"]}->{pause_after["simulationClock"]}')
    rec('resume returns combat and preserves crew', not resumed and resume_after['simulationClock']>pause_after['simulationClock'] and roster_dom(page)==baseline, f'phase={resume_after["phase"]}')

    # Checkpoint round trip preserves placed owned Rizo and run lineup.
    # Give enough cash and place an owned wing, then build raw checkpoint.
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true)')
    page.evaluate('RizoRuntimeQA.defenseSetCashForQA(5000)')
    # Resume then force planning-like placement permission via fresh run for deterministic placement.
    page.evaluate(LOAD_STATE,5)
    page.evaluate('RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-4","HOUSE-5","HOUSE-2"])')
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(140); page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()'); page.wait_for_timeout(60)
    page.evaluate('RizoRuntimeQA.defenseSetCashForQA(5000)')
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("HOUSE-4")')
    checkpoint=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("worker-c-audit")')
    page.evaluate('RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-1","HOUSE-2","HOUSE-3"])')
    restored=page.evaluate('(cp)=>RizoRuntimeQA.defenseRestoreCheckpointForQA(cp)',checkpoint)
    restored_ids=roster_dom(page)
    restored_snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('checkpoint restore preserves placed owned Rizo', restored and any(t['petId']=='HOUSE-4' for t in restored_snap['towers']) and 'HOUSE-4' in restored_ids, f'ids={restored_ids} towers={restored_snap["towers"]}')

    # Tiny-phone lobby: actual controls are reachable, not merely scrollable.
    page.evaluate(LOAD_STATE,5)
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("grove")')
    metrics=page.evaluate('''()=>{const c=document.querySelector("#modalOverlay .defense-world-lobby");const btn=c?.querySelector("[data-defense-roster-pick]");const r=btn?.getBoundingClientRect();return{scrollHeight:c?.scrollHeight||0,clientHeight:c?.clientHeight||0,overflow:c?getComputedStyle(c).overflowY:"",buttonHeight:r?.height||0,buttonWidth:r?.width||0,play:!!c?.querySelector("[data-enter-defense-world]")};}''')
    rec('320x568 roster lobby is scrollable with usable roster control', metrics['overflow'] in ('auto','scroll') and metrics['scrollHeight']>metrics['clientHeight'] and metrics['buttonHeight']>=44 and metrics['buttonWidth']>=44 and metrics['play'], str(metrics))

    # Owned mastery appears in pre-run roster, and unrelated Defense surfaces still launch.
    page.evaluate('RizoRuntimeQA.defenseClearCheckpointForQA()')
    page.evaluate('RizoRuntimeQA.defenseSetMasteryForQA("HOUSE-1",50)')
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("grove")')
    mastery_text=page.evaluate('document.querySelector("#modalOverlay .defense-world-lobby")?.textContent||""')
    rec('owned Rizo mastery is surfaced in roster lobby', 'TRAIL' in mastery_text or 'FIELD' in mastery_text or 'VETERAN' in mastery_text, mastery_text[-500:])
    records=page.evaluate('RizoRuntimeQA.defenseShowRecordsForQA()')
    rec('unrelated Defense records surface still launches', bool(records and records.get('shown')), str(records)[:180])
    rec('audit produced no runtime errors', not errors, '; '.join(errors[:5]))
    browser.close()

out={'passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(ROOT/'reports'/'browser-worker-c-self-audit.json').write_text(json.dumps(out,indent=2))
print(f"\n{out['passed']}/{out['total']} Worker C self-audit checks passed")
if out['passed']!=out['total']: raise SystemExit(1)
