import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path.cwd()/"tests"))
from browser_harness import build_inline_app, SETUP_STATE

out={"checks":[],"notes":[]}
def rec(name, ok, detail=None):
    out["checks"].append({"name":name,"pass":bool(ok),"detail":detail})
    print(("PASS" if ok else "FAIL"), name, "" if detail is None else detail)

def boot(page,map_id="grove",w=390,h=844):
    page.set_viewport_size({"width":w,"height":h})
    page.set_content(build_inline_app(qa=True,embed_assets=True),wait_until="domcontentloaded")
    page.evaluate(SETUP_STATE)
    page.evaluate('(id)=>RizoRuntimeQA.startMiniGame("defense",{mapId:id})', map_id)
    page.wait_for_timeout(120)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')

def valid_point(page):
    return page.evaluate('''()=>{for(let y=.18;y<=.82;y+=.05)for(let x=.12;x<=.88;x+=.05){const r=RizoRuntimeQA.defenseResolvePlacementForQA(x,y);if(r.valid)return r.point;}return null}''')

def click_world_point(page, pt):
    r=page.locator('#defenseWorld').bounding_box();
    page.mouse.click(r['x']+r['width']*pt['x'],r['y']+r['height']*pt['y'])

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={"width":390,"height":844},device_scale_factor=3)
    errors=[]
    page.on('pageerror',lambda e: errors.append('pageerror '+str(e)))
    page.on('console',lambda m: errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    boot(page)

    # Primary UI path: bench -> placement mode -> field placement.
    rec('opening requires a first placement before wave start', page.locator('#defenseWaveButton').is_disabled() and 'PLACE' in page.locator('#defenseWaveLabel').inner_text(), page.locator('#defenseWaveLabel').inner_text())
    first=page.locator('[data-defense-roster-id]').first
    first.click()
    rec('tapping a roster card enters visible placement mode', 'placement-mode' in (page.locator('#defenseWorld').get_attribute('class') or ''), page.locator('#defenseWorld').get_attribute('class'))
    pt=valid_point(page); rec('placement resolver exposes valid open ground', bool(pt), pt)
    click_world_point(page,pt)
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('field tap completes real UI placement', len(snap['towers'])==1 and not page.locator('#defenseWaveButton').is_disabled(), {'towers':len(snap['towers']),'waveDisabled':page.locator('#defenseWaveButton').is_disabled()})

    # Selection, upgrade and affordability feedback.
    page.evaluate('RizoRuntimeQA.defenseSetCashForQA(100000)')
    page.locator('.defense-tower').first.click()
    rec('placed Rizo is selectable with a normal locator click', page.locator('.defense-tower-panel').count()==1 and not page.locator('.defense-tower-panel').is_hidden())
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.locator('[data-defense-upgrade]').click()
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    delta=page.locator('#defenseCashDelta').inner_text()
    rec('upgrade purchase advances the selected Rizo', after['towers'][0]['upgrade']==before['towers'][0]['upgrade']+1, {'before':before['towers'][0]['upgrade'],'after':after['towers'][0]['upgrade']})
    rec('upgrade spend gets signed immediate gold feedback', delta.startswith('−') and delta[1:].replace(',','').isdigit(), delta)

    # Second upgrade exposes path choice; choose a path to make power UI meaningful.
    page.locator('[data-defense-upgrade]').click()
    doctrine=page.locator('[data-defense-doctrine="%s:power"]' % after['towers'][0]['id'])
    if doctrine.count()==0:
        doctrine=page.locator('[data-defense-doctrine]').first
    rec('level-three investment exposes an upgrade path choice', doctrine.count()>0)
    if doctrine.count(): doctrine.click()
    page.locator('[data-defense-close-panel]').click()
    power_button=page.locator('#defenseAbilitiesButton')
    rec('Powers button communicates that unlocked powers wait for live combat', 'ready' not in (power_button.get_attribute('class') or '') and page.locator('#defenseAbilityCount').inner_text()=='WAIT', {'class':power_button.get_attribute('class'),'count':page.locator('#defenseAbilityCount').inner_text()})
    power_button.click()
    rec('Powers button opens the grouped ability tray', page.locator('#defenseAbilityTray').count()==1 and not page.locator('#defenseAbilityTray').is_hidden() and 'START A WAVE' in page.locator('#defenseAbilityTray').inner_text(), page.locator('#defenseAbilityTray').inner_text()[:180])
    page.locator('[data-defense-toggle-abilities]').last.click()

    # 1x -> 2x, wave start, pause and resume all through visible controls.
    rec('speed control begins at 1×', page.locator('#defenseSpeedValue').inner_text()=='1×', page.locator('#defenseSpeedValue').inner_text())
    page.locator('[data-defense-speed]').click()
    rec('visible speed control cycles directly to 2×', page.locator('#defenseSpeedValue').inner_text()=='2×', page.locator('#defenseSpeedValue').inner_text())
    page.locator('#defenseWaveButton').click()
    page.wait_for_timeout(40)
    started=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('START WAVE begins an active wave', started['currentWave']==1 and started['phase'] in ('countdown','combat','packet-break'), {'wave':started['currentWave'],'phase':started['phase']})
    page.wait_for_function("RizoRuntimeQA.defenseSnapshotForQA().phase === 'combat'", timeout=4000)
    # Combat state flips just before the throttled HUD refresh; allow one normal UI interval.
    page.wait_for_timeout(600)
    rec('unlocked power becomes READY once combat is live', 'ready' in (power_button.get_attribute('class') or '') and page.locator('#defenseAbilityCount').inner_text()!='WAIT', {'class':power_button.get_attribute('class'),'count':page.locator('#defenseAbilityCount').inner_text()})
    page.locator('#defenseWaveButton').click()
    paused=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('main wave control pauses the run', paused['paused'] and paused['phase']=='paused' and page.locator('#defenseWaveLabel').inner_text()=='RESUME', {'phase':paused['phase'],'label':page.locator('#defenseWaveLabel').inner_text()})
    page.locator('#defenseWaveButton').click()
    resumed=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    rec('main wave control resumes without resetting the wave', not resumed['paused'] and resumed['currentWave']==1 and page.locator('#defenseSpeedValue').inner_text()=='2×', {'phase':resumed['phase'],'wave':resumed['currentWave'],'speed':page.locator('#defenseSpeedValue').inner_text()})

    # Boss authority: battlefield boss bar takes over, ordinary wave badge yields.
    # Freeze simulation before the synthetic boss spawn so the upgraded test Rizo cannot delete it before the HUD samples it.
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"paused",paused:true})')
    page.evaluate('RizoRuntimeQA.defenseSpawnBossForQA("warden")')
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"paused",paused:true})')
    page.wait_for_timeout(30)
    boss_hidden=page.locator('#defenseBossBar').is_hidden()
    wave_vis=page.locator('.defense-wave-banner').evaluate('(n)=>getComputedStyle(n).visibility')
    rec('boss event owns the battlefield HUD', (not boss_hidden) and wave_vis=='hidden', {'bossHidden':boss_hidden,'waveVisibility':wave_vis})

    rec('primary portrait path emits no runtime errors', not errors, errors[:5])
    page.screenshot(path='reports/worker-h-self-audit-primary.png')
    page.close()

    # Compact phone: command access and field remain inside viewport.
    phone=browser.new_page(viewport={"width":320,"height":568},device_scale_factor=2)
    phone_errors=[]; phone.on('pageerror',lambda e: phone_errors.append(str(e)))
    boot(phone,w=320,h=568)
    layout=phone.evaluate('''()=>{const v={w:innerWidth,h:innerHeight},s=document.querySelector('.defense-shell').getBoundingClientRect(),f=document.querySelector('.defense-stage-frame').getBoundingClientRect();const bs=[...document.querySelectorAll('.defense-command-actions button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>{const r=b.getBoundingClientRect();return{w:r.width,h:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}});return{v,s:s.toJSON(),f:f.toJSON(),buttons:bs}}''')
    inside=layout['s']['left']>=-1 and layout['s']['right']<=321 and layout['s']['top']>=-1 and layout['s']['bottom']<=569
    targets=all(b['w']>=44-0.5 and b['h']>=44-0.5 and b['left']>=-1 and b['right']<=321 for b in layout['buttons'])
    field_ratio=(layout['f']['width']*layout['f']['height'])/(320*568)
    rec('320×568 shell remains fully contained', inside, layout['s'])
    rec('320×568 recurring command targets remain thumb-sized', targets, layout['buttons'])
    rec('320×568 battlefield keeps substantial visual authority', field_ratio>=.32, field_ratio)
    rec('compact phone boot emits no runtime errors', not phone_errors, phone_errors[:5])
    phone.screenshot(path='reports/worker-h-self-audit-320x568.png')
    phone.close()

    # Reduced motion: H-owned repeating/tactile animation surfaces become non-animated.
    ctx=browser.new_context(viewport={"width":390,"height":844},reduced_motion='reduce')
    rm=ctx.new_page(); boot(rm)
    anim=rm.evaluate('''()=>({wave:getComputedStyle(document.querySelector('.defense-stage-frame > .defense-wave-button')).animationName,power:getComputedStyle(document.querySelector('#defenseAbilitiesButton > i:first-child')).animationName})''')
    rec('reduced-motion preference suppresses Worker H repeating animations', anim['wave']=='none' and anim['power']=='none', anim)
    ctx.close()

    # Unrelated map launch smoke: all six canonical Defense maps still mount their world.
    map_rows={}
    for map_id in ['grove','ember','moon','storm','blizzard','eclipse']:
        mp=browser.new_page(viewport={"width":390,"height":844})
        errs=[]; mp.on('pageerror',lambda e,errs=errs: errs.append(str(e)))
        boot(mp,'grove')
        selected=mp.evaluate('(id)=>RizoRuntimeQA.defenseSetMapForQA(id)', map_id)
        row=mp.evaluate('''()=>({world:!!document.querySelector('#defenseWorld'),map:document.querySelector('#defenseWorld')?.dataset.defenseMap,wave:document.querySelector('#defenseWave')?.textContent})''')
        row['selected']=selected
        row['errors']=errs; map_rows[map_id]=row; mp.close()
    rec('all canonical Defense maps still launch independently', all(r['world'] and r['selected']==m and r['map']==m and not r['errors'] for m,r in map_rows.items()), map_rows)

    browser.close()

out['passed']=sum(1 for c in out['checks'] if c['pass'])
out['total']=len(out['checks'])
out['all_passed']=out['passed']==out['total']
Path('reports/worker-h-self-audit.json').write_text(json.dumps(out,indent=2))
print(f"\n{out['passed']}/{out['total']} Worker H deliberate self-audit checks passed")
if not out['all_passed']: raise SystemExit(1)
