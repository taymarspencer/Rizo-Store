from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app

ROOT=Path(__file__).resolve().parents[1]
results=[]
def rec(name,ok,detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'),name,detail)

LOAD='''()=>{const s=RizoRuntimeQA.defaultState();s.pet.stage="kid";s.pet.variant="classic";s.pet.hiddenVariant="classic";s.pet.name="CAPTAIN TEST";s.pet.skills={power:8,speed:3,instinct:2,stamina:2,luck:0};s.pet.energy=100;s.pet.hunger=100;s.pet.mood=100;s.pet.health=100;s.pet.resting=false;s.pet.sleeping=false;s.player.tutorialDismissed=true;s.player.defenseSchool={dismissed:true,completed:["route","placement","targeting","intel","doctrine","abilities"],replay:false};s.collection.classic=1;s.scores.defense=80;s.scores.defenseMaps={grove:20,ember:20,moon:20,storm:20,blizzard:20,eclipse:20};s.scores.defenseMastery={};s.farm.roster=[];const specs=[["ember",20,2,2,2],["frost",2,18,4,2],["moss",2,2,16,3],["shadow",10,3,8,2],["golden",2,3,4,15]];for(let i=0;i<specs.length;i++){const [v,pw,sp,ins,st]=specs[i],r=JSON.parse(JSON.stringify(s.pet));r.id="HOUSE-"+(i+1);r.number=i+2;r.name="HOUSE "+(i+1);r.variant=v;r.hiddenVariant=v;r.skills={power:pw,speed:sp,instinct:ins,stamina:st,luck:0};r.homeRoom=0;r.stage="kid";s.farm.roster.push(r);}s.scores.defenseMastery["HOUSE-1"]={petId:"HOUSE-1",name:"HOUSE 1",variant:"ember",runs:8,waves:86,bestWave:20,pops:900,damage:12000,bosses:3,powerPaths:8,controlPaths:1,lastAt:Date.now()};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-1","HOUSE-2","HOUSE-3"]);RizoRuntimeQA.defenseShowLobbyForQA("storm");return RizoRuntimeQA.defenseRosterConfigForQA();}'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    page.evaluate('document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked")')
    cfg=page.evaluate(LOAD)
    rec('crew read exposes both Captain doctrine powers','RALLY' in cfg['read']['captainPower'] and 'GUARD LINE' in cfg['read']['captainPower'],str(cfg['read']))
    rec('storm trail exposes real opening-deal matches',set(cfg['read']['fitIds'])=={'HOUSE-2','HOUSE-3'} and '20% OFF' in cfg['read']['openingLabel'],str(cfg['read']))
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("ember")')
    ember_cfg=page.evaluate('RizoRuntimeQA.defenseRosterConfigForQA()')
    rec('changing trail changes which selected Rizo can claim the opening deal',ember_cfg['read']['fitIds']==['HOUSE-1'],str(ember_cfg['read']))
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("grove")')
    grove_cfg=page.evaluate('RizoRuntimeQA.defenseRosterConfigForQA()')
    rec('balanced trail does not fake a missing roster deal',not grove_cfg['read']['hasOpeningDeal'] and grove_cfg['read']['openingLabel']=='BALANCED OPENING',str(grove_cfg['read']))
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("storm")')
    house1=next(x for x in cfg['configured'] if x['id']=='HOUSE-1')
    rec('owned Rizo exposes care-trained combat identity',house1['training']=='POWER-TRAINED',str(house1))
    rec('mastery history exposes doctrine tendency',house1['masteryLean']=='POWER-LEANING',str(house1))
    rec('variant cards expose tactical language',house1['tags']==['BURN','PRESSURE'],str(house1['tags']))
    dom=page.evaluate('''()=>{const l=document.querySelector("#modalOverlay .defense-world-lobby");return{read:l?.querySelector("[data-defense-roster-read]")?.textContent||"",trail:l?.querySelectorAll(".defense-roster-build-card.trail-fit").length||0,chips:[...l.querySelectorAll(".defense-roster-build-card.selected u i")].map(x=>x.textContent),lean:l?.textContent.includes("POWER-LEANING"),training:l?.textContent.includes("POWER-TRAINED")};}''')
    rec('crew read is visible without opening guide',all(x in dom['read'] for x in ['CAPTAIN FIELD POWER','CREW TOOLS','TRAIL OPENING']),str(dom))
    rec('matching Rizos are visually flagged for selected trail',dom['trail']>=2,str(dom['trail']))
    rec('selected crew communicates identity, training, mastery',dom['lean'] and dom['training'] and 'BURN' in dom['chips'],str(dom))

    page.evaluate('document.querySelector("#modalOverlay")?.replaceChildren();document.querySelector("#modalOverlay")?.classList.remove("show")')
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"storm"})')
    page.wait_for_timeout(160);page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()');page.wait_for_timeout(80)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()');page.wait_for_timeout(40)
    cap=page.evaluate('''()=>{const n=document.querySelector(".defense-tower.defense-captain-tower");return{exists:!!n,mark:n?.querySelector(".defense-captain-mark")?.textContent||"",aria:n?.getAttribute("aria-label")||""};}''')
    rec('Captain remains visually authored on the field',cap['exists'] and cap['mark']=='CAPTAIN',str(cap))

    page.set_viewport_size({'width':320,'height':568})
    page.evaluate('RizoRuntimeQA.defenseClearCheckpointForQA()')
    page.evaluate('RizoRuntimeQA.defenseShowLobbyForQA("storm")')
    phone=page.evaluate('''()=>{const l=document.querySelector("#modalOverlay .defense-world-lobby"),r=l?.querySelector(".defense-roster-read")?.getBoundingClientRect(),b=l?.querySelector("[data-defense-roster-pick]")?.getBoundingClientRect();return{scroll:getComputedStyle(l).overflowY,sh:l.scrollHeight,ch:l.clientHeight,readW:r?.width||0,buttonH:b?.height||0};}''')
    rec('depth layer remains phone-scrollable and touch-safe',phone['scroll'] in ('auto','scroll') and phone['sh']>phone['ch'] and phone['readW']>200 and phone['buttonH']>=44,str(phone))
    rec('depth pass produced no runtime errors',not errors,'; '.join(errors[:5]))
    browser.close()

out={'passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(ROOT/'reports'/'browser-worker-c-depth.json').write_text(json.dumps(out,indent=2))
print(f"\n{out['passed']}/{out['total']} Worker C depth checks passed")
if out['passed']!=out['total']: raise SystemExit(1)
