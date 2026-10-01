from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app

ROOT=Path(__file__).resolve().parents[1]
results=[]
def rec(name,ok,detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'),name,detail)

LOAD_STATE='''n=>{const s=RizoRuntimeQA.defaultState();s.pet.stage="kid";s.pet.variant="classic";s.pet.hiddenVariant="classic";s.pet.energy=100;s.pet.hunger=100;s.pet.mood=100;s.pet.health=100;s.pet.resting=false;s.pet.sleeping=false;s.player.tutorialDismissed=true;s.player.defenseSchool={dismissed:true,completed:["route","placement","targeting","intel","doctrine","abilities"],replay:false};s.collection.classic=1;s.farm.roster=[];const vars=["ember","frost","moss","shadow","golden"];for(let i=0;i<n;i++){const r=JSON.parse(JSON.stringify(s.pet));r.id="HOUSE-"+(i+1);r.number=i+2;r.name="HOUSE "+(i+1);r.variant=vars[i];r.hiddenVariant=vars[i];r.homeRoom=0;r.stage="kid";s.farm.roster.push(r);}RizoRuntimeQA.loadForQA(s);return RizoRuntimeQA.defenseRosterConfigForQA();}'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    page.evaluate('document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked")')

    cfg=page.evaluate(LOAD_STATE,0)
    rec('solo player always has Captain',len(cfg['configured'])>=1 and cfg['configured'][0]['source']=='active',str(cfg['configured']))
    rec('solo onboarding grants only one loaner',len(cfg['configured'])==2 and sum(r['source']=='guest' for r in cfg['configured'])==1,str(cfg['configured']))

    cfg=page.evaluate(LOAD_STATE,1)
    rec('one owned resident joins alongside one trial',len(cfg['configured'])==3 and sum(r['source']=='house' for r in cfg['configured'])==1 and sum(r['source']=='guest' for r in cfg['configured'])==1,str(cfg['configured']))

    cfg=page.evaluate(LOAD_STATE,2)
    rec('loaners retire once house has two residents',not cfg['guestAllowed'] and all(r['source']!='guest' for r in cfg['configured']),str(cfg['configured']))

    cfg=page.evaluate(LOAD_STATE,5)
    rec('deep collection remains Captain plus three wings',len(cfg['configured'])==4 and cfg['configured'][0]['source']=='active',str(cfg['configured']))
    picked=page.evaluate('RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-4","HOUSE-5","HOUSE-2"])')
    rec('collector can choose strategic owned trio',[r['id'] for r in picked[1:]]==['HOUSE-4','HOUSE-5','HOUSE-2'],str(picked))

    lobby=page.evaluate('''()=>{RizoRuntimeQA.defenseShowLobbyForQA("grove");const c=document.querySelector("#modalOverlay .defense-world-lobby");return{scrollHeight:c.scrollHeight,clientHeight:c.clientHeight,overflow:getComputedStyle(c).overflowY,captainLocked:!!c.querySelector(".defense-roster-build-card.captain[disabled]"),graduated:(c.textContent||"").includes("LOANERS RETIRED"),breadthCopy:(c.textContent||"").includes("DIFFERENT RIZOS, DIFFERENT ANSWERS")};}''')
    rec('Captain is visibly locked in pre-run roster',lobby['captainLocked'],str(lobby))
    rec('short-phone roster lobby remains scrollable',lobby['overflow'] in ('auto','scroll') and lobby['scrollHeight']>=lobby['clientHeight'],str(lobby))
    rec('collector graduation and breadth framing are explicit',lobby['graduated'] and lobby['breadthCopy'],str(lobby))

    page.evaluate('document.querySelector("#modalOverlay")?.replaceChildren();document.querySelector("#modalOverlay")?.classList.remove("show")')
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(180)
    page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()')
    page.wait_for_timeout(90)
    roster_ids=page.evaluate('[...document.querySelectorAll("[data-defense-roster-id]")].map(x=>x.dataset.defenseRosterId)')
    # Integrated bench interleaves the universal Defense kit after the Captain, so
    # assert on the crew rows themselves rather than on raw bench positions.
    crew_order=[i for i in roster_ids if not (i.startswith('defense-structure-') or i.startswith('defense-tool-'))]
    rec('chosen crew is frozen into run roster',len(crew_order)==4 and crew_order[1:4]==['HOUSE-4','HOUSE-5','HOUSE-2'],str(roster_ids))
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
    placed=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('first Captain deployment is free',placed>=1 and after['cash']==before and after['towers'][0]['petId'] not in ['HOUSE-4','HOUSE-5','HOUSE-2'],f'before={before} after={after["cash"]} tower={after["towers"][0]}')

    page.evaluate(LOAD_STATE,0)
    trial=page.evaluate('''()=>{RizoRuntimeQA.defenseShowLobbyForQA("grove");const c=document.querySelector("#modalOverlay .defense-world-lobby");return{copy:(c.textContent||"").includes("NO MVP • NO MASTERY"),guestButtons:c.querySelectorAll(".guest-pool [data-defense-roster-pick]").length};}''')
    rec('trial roster labels permanent reward exclusion',trial['copy'] and trial['guestButtons']>=1,str(trial))
    rec('no Worker C runtime errors',not errors,'; '.join(errors[:3]))
    browser.close()

out={'passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(ROOT/'reports'/'browser-worker-c-roster.json').write_text(json.dumps(out,indent=2))
print(f"\n{out['passed']}/{out['total']} Worker C roster checks passed")
if out['passed']!=out['total']: raise SystemExit(1)
