from pathlib import Path
import sys, json, math
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_harness import build_inline_app, start_defense

ROOT=Path(__file__).resolve().parents[1]
MAPS=['grove','ember','moon','storm','blizzard','eclipse']
checks=[]
def check(name, ok, detail=''):
    checks.append((name,bool(ok),detail))
    print(('PASS' if ok else 'FAIL'), name, detail)

def new_page(browser, viewport=(390,844)):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]})
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m: errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(True, embed_assets=True), wait_until='load', timeout=120000)
    page.wait_for_timeout(80)
    return page,errors

def start_map(page,map_id):
    start_defense(page,'grove')
    if map_id!='grove':
        actual=page.evaluate('m=>RizoRuntimeQA.defenseSetMapForQA(m)',map_id)
        if actual!=map_id: raise AssertionError(f'map switch failed {map_id}->{actual}')
    return page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')

def route_data(page,map_id):
    return page.evaluate('m=>RizoRuntimeQA.defenseMapRoutesForQA()[m]',map_id)

def legal_bond_point(page,map_id):
    zones=route_data(page,map_id)['mechanicZones']
    for z in zones:
        for frac in (.55,.7,.82,.92,.35):
            for i in range(32):
                a=math.tau*i/32
                x=z['x']+z['r']*frac*math.cos(a); y=z['y']+z['r']*frac*math.sin(a)
                if not (.03<x<.97 and .06<y<.92): continue
                e=page.evaluate('([x,y])=>RizoRuntimeQA.defensePlacementEvaluationForQA(x,y)',[x,y])
                if e['valid']: return x,y
    return None

def legal_unbond_point(page,map_id):
    zones=route_data(page,map_id)['mechanicZones']
    for y in [i/100 for i in range(14,83,4)]:
        for x in [i/100 for i in range(10,91,4)]:
            if any(math.hypot(x-z['x'],y-z['y']) <= z['r']+.025 for z in zones): continue
            e=page.evaluate('([x,y])=>RizoRuntimeQA.defensePlacementEvaluationForQA(x,y)',[x,y])
            if e['valid']: return x,y
    return None

def approx(a,b,tol=.015): return abs(a-b)<=tol

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])

    # Primary feature + actual mechanic math on all six maps.
    for map_id in MAPS:
        page,errors=new_page(browser,(390,844)); start_map(page,map_id)
        route=route_data(page,map_id); bond_pt=legal_bond_point(page,map_id); plain_pt=legal_unbond_point(page,map_id)
        check(f'{map_id}: legal bonded and ordinary placements exist', bool(bond_pt and plain_pt), f'bond={bond_pt} plain={plain_pt}')
        if bond_pt and plain_pt:
            page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:1000})')
            page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',bond_pt)
            page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',plain_pt)
            snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
            stats=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
            panel=page.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
            dom=page.evaluate('''()=>{const w=document.querySelector('#defenseWorld');const mechanics=[...w.querySelectorAll('.defense-map-mechanic')];return {cls:w.className,background:getComputedStyle(w).backgroundImage,mechanics:mechanics.length,pointers:mechanics.map(n=>getComputedStyle(n).pointerEvents),badges:w.querySelectorAll('.defense-map-bond-badge').length,label:w.querySelector('[data-defense-tower]')?.getAttribute('aria-label')||'',bondCopy:Boolean(document.querySelector('.defense-map-bond-copy'))};}''')
            check(f'{map_id}: correct world and mechanic layer render', f'map-{map_id}' in dom['cls'] and dom['mechanics']==len(route['mechanicZones']) and dom['background']!='none', f"class={dom['cls']} mechanics={dom['mechanics']}")
            check(f'{map_id}: map overlay cannot steal placement input', all(v=='none' for v in dom['pointers']), str(dom['pointers']))
            check(f'{map_id}: bond is visible in state, tower, and panel', bool(snap['towers'][0]['mapBond']) and snap['towers'][1]['mapBond'] is None and dom['badges']==1 and 'map bond' in dom['label'].lower() and panel and 'MAP BOND' in panel['text'] and dom['bondCopy'], f"bond={snap['towers'][0]['mapBond']} badges={dom['badges']}")
            bonded,plain=stats[0],stats[1]
            if map_id=='grove':
                ok=approx(bonded['range']/plain['range'],1.12)
            elif map_id=='ember':
                hot=bonded['mapBond']['tier']=='core'; ok=approx(bonded['rate']/plain['rate'],1.28 if hot else 1.16) and approx(bonded['range']/plain['range'],.88 if hot else .96)
            elif map_id=='moon':
                ok=approx(bonded['range']/plain['range'],1.08) and bonded['mapBond']['camoSight']
            elif map_id=='storm':
                ok=approx(bonded['rate']/plain['rate'],1.08)
            elif map_id=='blizzard':
                ok=approx(bonded['range']/plain['range'],1.04) and bonded['mapBond']['whiteoutProof']
            else:
                ok=approx(bonded['range']/plain['range'],1.06) and bonded['mapBond']['camoSight']
            check(f'{map_id}: Map Bond changes live combat stats as designed',ok,f"bonded={bonded} plain={plain}")
            # Derived-state checkpoint safety: same coordinates should recreate the bond after restore.
            cp=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("worker-g-audit")')
            restored=page.evaluate('cp=>RizoRuntimeQA.defenseRestoreCheckpointForQA(cp)',cp)
            after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
            check(f'{map_id}: checkpoint restore recreates derived bond without schema state', restored and after['map']==map_id and after['towers'][0]['mapBond']==snap['towers'][0]['mapBond'] and after['towers'][1]['mapBond'] is None, str([t['mapBond'] for t in after['towers']]))
        check(f'{map_id}: primary feature path has no runtime errors',not errors,'; '.join(errors[:3]))
        page.close()

    # Weather-linked mechanics: actual stats and visual state.
    for map_id,weather in [('storm','storm'),('blizzard','blizzard'),('eclipse','eclipse')]:
        page,errors=new_page(browser,(390,844)); start_map(page,map_id)
        b=legal_bond_point(page,map_id); u=legal_unbond_point(page,map_id)
        page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:1000})')
        page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',b);page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',u)
        before=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
        page.evaluate('w=>RizoRuntimeQA.defenseForceWeatherForQA(w)',weather)
        after=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()')
        cls=page.evaluate('document.querySelector("#defenseWorld").className')
        if map_id=='storm': ok=approx(after[0]['rate']/after[1]['rate'],1.28)
        elif map_id=='blizzard': ok=approx(after[0]['range']/before[1]['range'],1.14) and approx(after[1]['range']/before[1]['range'],.82)
        else: ok=after[0]['mapBond']['camoSight'] and 'weather-active' in cls
        check(f'{map_id}: weather interaction changes the intended map-side mechanic',ok,f'before={before} after={after} class={cls}')
        check(f'{map_id}: weather sample has no runtime errors',not errors,'; '.join(errors[:3]))
        page.close()

    # 1x/2x and pause/resume while a map bond is active.
    page,errors=new_page(browser,(390,844)); start_map(page,'storm')
    b=legal_bond_point(page,'storm');page.evaluate('p=>RizoRuntimeQA.defensePlaceForQA(null,p[0],p[1])',b)
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA();RizoRuntimeQA.defenseTickForQA(.8)')
    page.evaluate('RizoRuntimeQA.defenseSetSpeedForQA(1)');s1=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]')
    page.evaluate('RizoRuntimeQA.defenseSetSpeedForQA(2)');s2=page.evaluate('RizoRuntimeQA.defenseTowerCombatStatsForQA()[0]')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true)');p0=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()');page.evaluate('RizoRuntimeQA.defenseTickForQA(1.5)');p1=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(false);RizoRuntimeQA.defenseTickForQA(.25)');p2=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    check('Map Bond combat stats are invariant between 1x and 2x',approx(s1['rate'],s2['rate'],1e-9) and approx(s1['range'],s2['range'],1e-9) and s1['mapBond']['label']==s2['mapBond']['label'],f'1x={s1} 2x={s2}')
    check('pause freezes bonded-map simulation after pause transition',p0['paused'] and p1['simulationClock']==p0['simulationClock'] and p1['towers'][0]['mapBond']=='LIVE PYLONS',f"{p0['simulationClock']}->{p1['simulationClock']}")
    check('resume advances bonded-map simulation without losing bond',not p2['paused'] and p2['simulationClock']>p1['simulationClock'] and p2['towers'][0]['mapBond']=='LIVE PYLONS',f"{p1['simulationClock']}->{p2['simulationClock']}")
    check('1x/2x/pause sample has no runtime errors',not errors,'; '.join(errors[:3]));page.close()

    # Small-phone placement readability: mechanic explanation labels must remain on-field.
    for map_id in MAPS:
        page,errors=new_page(browser,(320,568));start_map(page,map_id)
        page.click('.defense-roster-pet:not([disabled])');page.wait_for_timeout(30)
        rows=page.evaluate('''()=>{const w=document.querySelector('#defenseWorld'),wr=w.getBoundingClientRect();return [...w.querySelectorAll('.defense-map-mechanic span')].filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent.trim().replace(/\\s+/g,' '),left:r.left,right:r.right,top:r.top,bottom:r.bottom,clipped:r.left<wr.left-.5||r.right>wr.right+.5||r.top<wr.top-.5||r.bottom>wr.bottom+.5};});}''')
        check(f'{map_id}: 320x568 mechanic labels remain readable on-field',rows and not any(r['clipped'] for r in rows),str(rows))
        check(f'{map_id}: 320x568 map path has no runtime errors',not errors,'; '.join(errors[:3]));page.close()

    # Restore-only map bypass must not weaken tampered-checkpoint unlock safety.
    page,errors=new_page(browser,(390,844));start_map(page,'grove');page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    forged=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("worker-g-forged-map")')
    forged['mapId']='eclipse'
    normalized=page.evaluate('cp=>RizoRuntimeQA.defenseNormalizeCheckpointForQA(cp)',forged)
    restored=page.evaluate('cp=>RizoRuntimeQA.defenseRestoreCheckpointForQA(cp)',forged)
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    check('tampered later-world checkpoint cannot bypass normal map unlock gating',restored and normalized and normalized['validationStatus']=='sanitized' and snap['map']=='grove',str({'status':normalized.get('validationStatus') if normalized else None,'map':snap.get('map')}))
    check('tampered-map restore safety sample has no runtime errors',not errors,'; '.join(errors[:3]));page.close()

    # Unrelated Defense systems still launch and work.
    page,errors=new_page(browser,(390,844));start_map(page,'grove');page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    page.click('#defenseMenuButton');menu=page.evaluate('RizoRuntimeQA.defenseOverlayForQA()');page.keyboard.press('Escape');closed=page.evaluate('RizoRuntimeQA.defenseOverlayForQA()')
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA();RizoRuntimeQA.defenseTickForQA(.8)');live=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    check('unrelated Defense context menu still opens/closes',menu['surface']=='menu' and closed['surface'] is None,str({'menu':menu['surface'],'closed':closed['surface']}))
    check('unrelated Defense wave loop still launches',live['currentWave']==1 and live['phase'] in ('countdown','combat','packet-break'),str({'wave':live['currentWave'],'phase':live['phase']}))
    check('unrelated Defense smoke path has no runtime errors',not errors,'; '.join(errors[:3]));page.close()
    browser.close()

summary={'passed':sum(ok for _,ok,_ in checks),'total':len(checks),'failures':[{'name':n,'detail':d} for n,ok,d in checks if not ok]}
(ROOT/'reports/worker-g-self-audit.json').write_text(json.dumps(summary,indent=2))
print(f"\n{summary['passed']}/{summary['total']} Worker G self-audit checks passed")
if summary['failures']:
    for f in summary['failures']: print('FAILURE',f['name'],'::',f['detail'])
raise SystemExit(0 if summary['passed']==summary['total'] else 1)
