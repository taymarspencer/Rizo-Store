from pathlib import Path
import sys, json, math
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_harness import build_inline_app, start_defense

ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name, ok, detail=''):
    checks.append((name,bool(ok),detail)); print(('PASS' if ok else 'FAIL'),name,detail)

def approx(a,b,tol=.018): return abs(a-b)<=tol

def page_for(browser,map_id,viewport=(390,844)):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]}); errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m:errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000); page.wait_for_timeout(60)
    start_defense(page,'grove')
    if map_id!='grove':
        actual=page.evaluate('m=>RizoRuntimeQA.defenseSetMapForQA(m)',map_id)
        if actual!=map_id: raise AssertionError((map_id,actual))
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:2000})')
    return page,errors

def route(page,map_id): return page.evaluate('m=>RizoRuntimeQA.defenseMapRoutesForQA()[m]',map_id)

def zone_point(page,map_id,zone_index,min_ratio=0,max_ratio=1):
    z=route(page,map_id)['mechanicZones'][zone_index]
    for frac in [min_ratio+(max_ratio-min_ratio)*i/12 for i in range(13)]:
        if frac<=0: frac=.02
        for i in range(72):
            a=math.tau*i/72; x=z['x']+z['r']*frac*math.cos(a); y=z['y']+z['r']*frac*math.sin(a)
            if not (.03<x<.97 and .06<y<.92): continue
            e=page.evaluate('([x,y])=>RizoRuntimeQA.defensePlacementEvaluationForQA(x,y)',[x,y])
            if e['valid']: return (x,y,frac)
    return None

def plain_point(page,map_id):
    zones=route(page,map_id)['mechanicZones']
    for y in [i/100 for i in range(12,87,3)]:
        for x in [i/100 for i in range(8,93,3)]:
            if any(math.hypot(x-z['x'],y-z['y'])<=z['r']+.03 for z in zones): continue
            e=page.evaluate('([x,y])=>RizoRuntimeQA.defensePlacementEvaluationForQA(x,y)',[x,y])
            if e['valid']: return (x,y)
    return None

def place(page,pt):
    return page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',[pt[0],pt[1]])

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Ember: the field is no longer a binary circle; exact distance creates a visible risk/reward tier.
    for tier,lo,hi,rate,reach in [('core',.66,.74,1.28,.88),('draft',.78,.98,1.16,.96)]:
        page,errors=page_for(browser,'ember'); pt=zone_point(page,'ember',0,lo,hi); plain=plain_point(page,'ember')
        check(f'Ember {tier} tier has a legal placement',bool(pt),str(pt))
        if pt and plain:
            place(page,pt); place(page,plain); stats=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
            b,u=stats[0],stats[1]
            check(f'Ember {tier} tier has distinct live tradeoff',b['mapBond']['tier']==tier and approx(b['rate']/u['rate'],rate) and approx(b['range']/u['range'],reach),f'{b} / {u}')
            visual=page.evaluate("""()=>{const n=document.querySelector('.mechanic-vent');return {core:getComputedStyle(n,'::after').content,opacity:getComputedStyle(n,'::after').opacity};}""")
            check('Ember heat band is communicated by the map, not copy alone',visual['core'] not in ('none','normal',''),str(visual))
        check(f'Ember {tier} sample has no runtime errors',not errors,'; '.join(errors[:3])); page.close()

    # Moon: the basin becomes a timed offensive window when the existing moonlight state arrives.
    page,errors=page_for(browser,'moon'); bpt=zone_point(page,'moon',0,.7,.96); upt=plain_point(page,'moon'); place(page,bpt); place(page,upt)
    before=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()'); page.evaluate("RizoRuntimeQA.defenseForceWeatherForQA('moon')"); after=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
    check('Moonlight wakes a real basin attack-speed window',approx(before[0]['rate']/before[1]['rate'],1) and approx(after[0]['rate']/after[1]['rate'],1.18) and approx(after[0]['range']/after[1]['range'],1.08) and after[0]['mapBond']['state']=='moonlit' and after[0]['mapBond']['preview'].startswith('MOONLIT BASIN'),f'before={before} after={after}')
    check('Moon basin retains veil sight outside and inside its power window',before[0]['mapBond']['camoSight'] and after[0]['mapBond']['camoSight'])
    check('Moon depth sample has no runtime errors',not errors,'; '.join(errors[:3])); page.close()

    # Storm: both pylon positions now form a spatial combo and break back apart when one is sold.
    page,errors=page_for(browser,'storm'); p0=zone_point(page,'storm',0,.8,.99); place(page,p0); single=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]')
    p1=zone_point(page,'storm',1,.8,.99); check('Storm has legal placements on both pylons',bool(p0 and p1),str((p0,p1))); place(page,p1); page.wait_for_timeout(260)
    linked=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()'); link_visual=page.evaluate("""()=>({opacity:parseFloat(getComputedStyle(document.querySelector('.link-pylon')).opacity),linked:[...document.querySelectorAll('.map-bond-state-circuit')].length})""")
    check('Storm circuit rewards split occupancy instead of duplicate circles',approx(single['mapBond']['rate'],1.08) and len(linked)==2 and all(approx(s['mapBond']['rate'],1.16) and s['mapBond']['state']=='circuit' for s in linked),f'single={single} linked={linked}')
    check('Storm circuit completion is visible directly on the battlefield',link_visual['opacity']>.5 and link_visual['linked']==2,str(link_visual))
    page.evaluate("RizoRuntimeQA.defenseForceWeatherForQA('storm')"); surge=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
    check('Closed Storm circuit compounds with the existing surge window',all(approx(s['mapBond']['rate'],1.34) and s['mapBond']['preview'].startswith('CIRCUIT SURGE') for s in surge),str(surge))
    # New page for sell because forced weather moved into combat where selling is correctly locked.
    page.close(); page,errors2=page_for(browser,'storm'); p0=zone_point(page,'storm',0,.8,.99); place(page,p0); p1=zone_point(page,'storm',1,.8,.99); place(page,p1); page.evaluate('RizoRuntimeQA.defenseSellLastForQA()'); page.wait_for_timeout(260); reverted=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]'); dim=page.evaluate("parseFloat(getComputedStyle(document.querySelector('.link-pylon')).opacity)")
    check('Storm circuit cleanly breaks when one pylon is vacated',approx(reverted['mapBond']['rate'],1.08) and reverted['mapBond']['state']=='' and dim<.5,f'{reverted} opacity={dim}')
    check('Storm depth samples have no runtime errors',not errors and not errors2,'; '.join((errors+errors2)[:3])); page.close()

    # Whiteout: shelter is a counter-window, not merely immunity.
    page,errors=page_for(browser,'blizzard'); bpt=zone_point(page,'blizzard',0,.05,.9) or zone_point(page,'blizzard',1,.75,.98); upt=plain_point(page,'blizzard'); place(page,bpt); place(page,upt)
    before=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()'); page.evaluate("RizoRuntimeQA.defenseForceWeatherForQA('blizzard')"); after=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
    check('Whiteout turns a shelter into a positive range window',approx(before[0]['range']/before[1]['range'],1.04) and approx(after[0]['range']/before[1]['range'],1.14) and approx(after[1]['range']/before[1]['range'],.82) and after[0]['mapBond']['preview'].startswith('SHELTER OPEN'),f'before={before} after={after}')
    check('Whiteout depth sample has no runtime errors',not errors,'; '.join(errors[:3])); page.close()

    # Eclipse: both strategic halves of the route can now actually be occupied and resonate.
    page,errors=page_for(browser,'eclipse'); p0=zone_point(page,'eclipse',0,.15,.9); place(page,p0); single=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]'); p1=zone_point(page,'eclipse',1,.15,.9)
    check('Eclipse inner and late-ridge seals are both legally usable',bool(p0 and p1),str((p0,p1))); place(page,p1); page.wait_for_timeout(260); linked=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()'); link_visual=page.evaluate("""()=>({opacity:parseFloat(getComputedStyle(document.querySelector('.link-seal')).opacity),linked:[...document.querySelectorAll('.map-bond-state-resonance')].length})""")
    check('Eclipse seal resonance creates a two-position mastery layer',approx(single['mapBond']['range'],1.06) and len(linked)==2 and all(approx(s['mapBond']['range'],1.14) and s['mapBond']['camoSight'] and s['mapBond']['state']=='resonance' for s in linked),f'single={single} linked={linked}')
    check('Eclipse resonance is visible as a completed map connection',link_visual['opacity']>.5 and link_visual['linked']==2,str(link_visual))
    page.evaluate('RizoRuntimeQA.defenseSellLastForQA()'); page.wait_for_timeout(260); reverted=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]')
    check('Eclipse resonance is reversible and derived from current placement',approx(reverted['mapBond']['range'],1.06) and reverted['mapBond']['state']=='',str(reverted))
    check('Eclipse depth sample has no runtime errors',not errors,'; '.join(errors[:3])); page.close()

    # Restraint: first map remains obvious and unchanged as the learning baseline.
    page,errors=page_for(browser,'grove'); pt=zone_point(page,'grove',0,.5,.95); plain=plain_point(page,'grove'); place(page,pt); place(page,plain); stats=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
    check('Pine Bend remains intentionally simple onboarding terrain',approx(stats[0]['range']/stats[1]['range'],1.12) and stats[0]['mapBond']['state']=='' and stats[0]['mapBond']['tier']=='bonded',str(stats[0]))
    check('Pine restraint sample has no runtime errors',not errors,'; '.join(errors[:3])); page.close()

    browser.close()

summary={'passed':sum(ok for _,ok,_ in checks),'total':len(checks),'failures':[{'name':n,'detail':d} for n,ok,d in checks if not ok]}
(ROOT/'reports/worker-g-depth-pass.json').write_text(json.dumps(summary,indent=2))
print(f"\n{summary['passed']}/{summary['total']} Worker G depth checks passed")
if summary['failures']:
    for f in summary['failures']: print('FAILURE',f['name'],'::',f['detail'])
raise SystemExit(0 if summary['passed']==summary['total'] else 1)
