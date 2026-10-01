from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def record(name, ok, detail=''):
    checks.append((name,bool(ok),detail))
    print(('PASS' if ok else 'FAIL'), name, detail)

def activate(page,selector):
    page.eval_on_selector(selector, "el=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}))")

def boot(browser,w=390,h=844):
    page=browser.new_page(viewport={'width':w,'height':h})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(qa=True,embed_assets=False),wait_until='domcontentloaded',timeout=120000)
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(80)
    page.locator('[data-defense-skip-map-intro]').click()
    page.wait_for_timeout(30)
    return page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Primary player path uses real controls from intro -> placement -> start -> pause -> resume.
    page,errors=boot(browser)
    opening=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',placement:document.querySelector('.defense-shell')?.classList.contains('has-placement')||false,towers:RizoRuntimeQA.defenseSnapshotForQA().towers.length})''')
    record('opening arms the main Rizo and asks for placement', opening['placement'] and opening['towers']==0 and opening['title']=='PLACE YOUR RIZO', str(opening))
    world=page.locator('#defenseWorld').bounding_box()
    page.mouse.click(world['x']+world['width']*.50,world['y']+world['height']*.15)
    page.wait_for_timeout(30)
    planned=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.textContent||'',towers:RizoRuntimeQA.defenseSnapshotForQA().towers.length,surface:RizoRuntimeQA.defenseOverlayForQA().surface})''')
    record('placement immediately becomes a spend-or-send decision', planned['towers']==1 and planned['title'].startswith('SPEND OR SEND?') and planned['primary'].startswith('START WAVE') and planned['surface'] is None, str(planned))
    activate(page,'#defenseDecisionPrimary')
    page.wait_for_timeout(20)
    incoming=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('contextual START WAVE uses the canonical countdown path', incoming['currentWave']==1 and incoming['phase']=='countdown', str({'wave':incoming['currentWave'],'phase':incoming['phase']}))
    activate(page,'#defenseWaveButton')
    page.wait_for_timeout(20)
    paused=page.evaluate('''()=>({snap:RizoRuntimeQA.defenseSnapshotForQA(),title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.textContent||''})''')
    sim_before=paused['snap']['simulationClock']
    page.wait_for_timeout(180)
    sim_after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().simulationClock')
    record('pause freezes simulation and the flow rail becomes RESUME', paused['snap']['paused'] and paused['title']=='FIELD FROZEN' and paused['primary']=='RESUME' and abs(sim_after-sim_before)<1e-9, str({'before':sim_before,'after':sim_after,'rail':paused['title']}))
    activate(page,'#defenseDecisionPrimary')
    page.wait_for_timeout(20)
    resumed=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('contextual RESUME returns to the exact prior phase', not resumed['paused'] and resumed['phase']=='countdown', str({'phase':resumed['phase'],'paused':resumed['paused']}))

    # Live quick actions stay field-first, then the rail deliberately gives the player breathing room.
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat",cash:1000}); RizoRuntimeQA.defenseGateFlameForQA(.45); RizoRuntimeQA.defenseSetRunForQA({cash:1000,phase:"combat"})')
    rail=page.evaluate('''()=>({primary:document.querySelector('#defenseDecisionPrimary')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})''')
    record('live affordable level is surfaced as a quick decision', rail['action']=='upgrade', str(rail))
    activate(page,'#defenseDecisionPrimary'); page.wait_for_timeout(20)
    quick_upgrade=page.evaluate('''()=>({tower:RizoRuntimeQA.defenseSnapshotForQA().towers[0],surface:RizoRuntimeQA.defenseOverlayForQA().surface,title:document.querySelector('#defenseDecisionTitle')?.textContent||''})''')
    record('quick live upgrade keeps battlefield visible', quick_upgrade['tower']['upgrade']==1 and quick_upgrade['surface'] is None, str({'upgrade':quick_upgrade['tower']['upgrade'],'surface':quick_upgrade['surface']}))
    record('after a live call, the rail briefly stops nagging for another tap', quick_upgrade['title'].startswith('CALL MADE'), str({'title':quick_upgrade['title']}))

    page.wait_for_timeout(1400)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:0,phase:"combat"}); RizoRuntimeQA.defenseGateFlameForQA(.45); RizoRuntimeQA.defenseSetRunForQA({cash:0,phase:"combat"})')
    aim_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].targetMode')
    aim_action=page.evaluate('document.querySelector("#defenseDecisionPrimary")?.dataset.defenseFlowAction')
    record('calm field exposes an explicit next targeting choice', aim_action=='target', str({'action':aim_action,'label':page.locator('#defenseDecisionPrimary').inner_text()}))
    activate(page,'#defenseDecisionPrimary'); page.wait_for_timeout(20)
    aim_after=page.evaluate('''()=>({mode:RizoRuntimeQA.defenseSnapshotForQA().towers[0].targetMode,surface:RizoRuntimeQA.defenseOverlayForQA().surface})''')
    record('quick AIM cycles targeting without opening a sheet', aim_after['mode']!=aim_before and aim_after['surface'] is None, str({'before':aim_before,'after':aim_after}))

    # Reaching the doctrine fork must never advertise a dead LEVEL UP action.
    page.wait_for_timeout(1400)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:1000,phase:"combat"})')
    pre_path=page.evaluate('document.querySelector("#defenseDecisionPrimary")?.dataset.defenseFlowAction')
    record('after the quiet beat, investment re-enters the decision cadence', pre_path=='upgrade', str({'action':pre_path}))
    activate(page,'#defenseDecisionPrimary'); page.wait_for_timeout(20)  # upgrade 1 -> 2, path panel intentionally opens
    activate(page,'[data-defense-close-panel]')
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat",cash:1000})')
    doctrine=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||'',upgrade:RizoRuntimeQA.defenseSnapshotForQA().towers[0].upgrade,doctrine:RizoRuntimeQA.defenseSnapshotForQA().towers[0].doctrine})''')
    record('doctrine fork is surfaced as CHOOSE PATH instead of a dead upgrade tap', doctrine['upgrade']>=2 and doctrine['doctrine'] is None and doctrine['action']=='inspect' and 'PATH' in doctrine['primary'], str(doctrine))

    # A ready power is banked on a calm field, then promoted when real pressure appears.
    tower_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].id')
    page.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"power",remaining:0,phase:"combat"})',tower_id)
    calm_power=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||'',secondary:document.querySelector('#defenseDecisionSecondary')?.dataset.defenseFlowAction||'',pulse:document.querySelector('#defenseDecisionRail')?.classList.contains('pulse')||false})''')
    record('ready Field Power stays banked instead of always demanding an immediate cast', calm_power['title'].endswith('BANKED') and calm_power['secondary']=='power', str(calm_power))
    record('a newly meaningful option creates a visible decision beat', calm_power['pulse'], str(calm_power))
    page.evaluate('RizoRuntimeQA.defenseSpawnBossForQA("crown"); RizoRuntimeQA.defenseSetRunForQA({cash:0,phase:"combat"})')
    pressure_power=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})''')
    record('boss pressure promotes the banked Field Power to the primary call', pressure_power['action']=='power' and ('BOSS' in pressure_power['title'] or 'PRESSURE' in pressure_power['title']), str(pressure_power))
    activate(page,'#defenseDecisionPrimary'); page.wait_for_timeout(20)
    power_after=page.evaluate('''()=>({groups:RizoRuntimeQA.defenseAbilityGroupsForQA(),surface:RizoRuntimeQA.defenseOverlayForQA().surface})''')
    remaining=power_after['groups'][0]['instances'][0]['remaining'] if power_after['groups'] else 0
    record('quick power fires and keeps battlefield visible', remaining>0 and power_after['surface'] is None, str({'remaining':remaining,'surface':power_after['surface']}))

    # Direct field reads recommend a specific target rather than forcing blind cycling.
    page.wait_for_timeout(1400)
    page.evaluate('RizoRuntimeQA.defenseTargetForQA("first"); RizoRuntimeQA.defenseGateFlameForQA(.45); RizoRuntimeQA.defenseSetRunForQA({cash:0,phase:"combat"})')
    boss_read=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',label:document.querySelector('#defenseDecisionPrimary')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})''')
    record('boss read offers a direct TOUGHEST targeting call', boss_read['action']=='target:strong' and 'TOUGHEST' in boss_read['label'], str(boss_read))
    activate(page,'#defenseDecisionPrimary'); page.wait_for_timeout(20)
    direct_target=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].targetMode')
    record('direct tactical target call lands on the recommended mode', direct_target=='strong', str({'mode':direct_target}))

    # 1x/2x readability and checkpoint contract.
    page.evaluate('RizoRuntimeQA.defenseSetSpeedForQA(1); RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
    one=page.evaluate('RizoRuntimeQA.defenseAttemptPhaseForQA("packet-break")')
    one_speed=page.locator('#defenseSpeedValue').inner_text()
    record('1x packet break stays 1x', one['after']=='packet-break' and one_speed=='1×', str({'phase':one['after'],'display':one_speed}))
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true); RizoRuntimeQA.defensePauseForQA(false); RizoRuntimeQA.defenseSetSpeedForQA(2); RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
    two=page.evaluate('RizoRuntimeQA.defenseAttemptPhaseForQA("packet-break")')
    two_now=page.evaluate('''()=>({display:document.querySelector('#defenseSpeedValue')?.textContent||'',checkpoint:RizoRuntimeQA.defenseBuildCheckpointForQA('worker-a-depth').speed,title:document.querySelector('#defenseDecisionTitle')?.textContent||''})''')
    record('2x packet break visibly eases to 1x without changing saved 2x', two['after']=='packet-break' and two_now['display']=='1×' and two_now['checkpoint']==2 and two_now['title'].startswith('BREATHER'), str(two_now))
    record('primary path has no runtime errors', not errors, str(errors))

    # 320px phone safety on a clean planning field: rail stays inside its reserved feed and does not cover the field.
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"}); document.querySelector("#defenseMapIntro")?.remove(); RizoRuntimeQA.defensePlaceNextForQA()')
    page.set_viewport_size({'width':320,'height':568})
    page.wait_for_timeout(60)
    geometry=page.evaluate("""()=>{const r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height}};const feed=document.querySelector('.defense-field-feed'),rail=document.querySelector('#defenseDecisionRail'),world=document.querySelector('#defenseWorld'),a=document.querySelector('#defenseDecisionPrimary'),b=document.querySelector('#defenseDecisionSecondary');return{feed:r(feed),rail:r(rail),world:r(world),a:r(a),b:r(b),overflow:getComputedStyle(document.documentElement).overflowX,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}}""")
    inside=(geometry['rail']['x']>=geometry['feed']['x']-.5 and geometry['rail']['right']<=geometry['feed']['right']+.5 and geometry['rail']['y']>=geometry['feed']['y']-.5 and geometry['rail']['bottom']<=geometry['feed']['bottom']+.5)
    separate=geometry['rail']['y']>=geometry['world']['bottom']-1
    record('320px decision rail stays in the reserved feed and off the battlefield', inside and separate and geometry['scrollWidth']<=geometry['clientWidth']+1, str(geometry))
    record('320px flow controls remain tappable', geometry['a']['h']>=32 and geometry['b']['h']>=32 and geometry['a']['w']>=60 and geometry['b']['w']>=60, str({'a':geometry['a'],'b':geometry['b']}))
    record('320px phone path has no runtime errors', not errors, str(errors))

    # Post-wave settle window must never advertise a temporarily blocked START action.
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"}); document.querySelector("#defenseMapIntro")?.remove(); RizoRuntimeQA.defensePlaceNextForQA(); RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    settling=page.evaluate("""()=>({phase:RizoRuntimeQA.defenseSnapshotForQA().phase,title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})""")
    record('post-wave settling offers a real planning action instead of a blocked START', settling['phase']=='wave-complete' and settling['title'].startswith('FIELD SETTLING') and settling['action']!='start', str(settling))
    page.wait_for_timeout(780)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"planning"})')
    ready=page.evaluate("""()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})""")
    record('after settling, canonical planning returns START WAVE', ready['title'].startswith('SPEND OR SEND?') and ready['action']=='start', str(ready))

    # Experienced cadence: Auto Waves can be held for one boundary without disabling the global setting.
    activate(page,'[data-defense-toggle-field-menu]')
    activate(page,'[data-defense-auto-start]')
    activate(page,'[data-defense-toggle-field-menu]')
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"}); RizoRuntimeQA.defenseCompleteWaveForQA(2)')
    page.wait_for_timeout(1050)
    auto_call=page.evaluate('''()=>({title:document.querySelector('#defenseDecisionTitle')?.textContent||'',primary:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||'',secondary:document.querySelector('#defenseDecisionSecondary')?.dataset.defenseFlowAction||''})''')
    record('Auto Waves creates a send-now versus hold-this-boundary decision', auto_call['title'].startswith('AUTO COMMIT') and auto_call['primary']=='start' and auto_call['secondary']=='hold-auto', str(auto_call))
    activate(page,'#defenseDecisionSecondary'); page.wait_for_timeout(20)
    held=page.evaluate('''()=>({snap:RizoRuntimeQA.defenseSnapshotForQA(),title:document.querySelector('#defenseDecisionTitle')?.textContent||'',action:document.querySelector('#defenseDecisionPrimary')?.dataset.defenseFlowAction||''})''')
    record('HOLD FIELD keeps Auto Waves enabled but gives this boundary back to the player', held['snap']['phase']=='wave-complete' and held['title'].startswith('FIELD HELD') and held['action']=='start', str({'phase':held['snap']['phase'],'title':held['title'],'action':held['action']}))
    page.wait_for_timeout(3000)
    still_held=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('a held auto boundary does not silently restart after the normal countdown', still_held['currentWave']==2 and still_held['phase']=='wave-complete', str({'wave':still_held['currentWave'],'phase':still_held['phase']}))

    # Unrelated Defense smoke: preserve the authored map/route registry and launch the fresh-state unlocked field.
    registry=page.evaluate("""()=>({maps:RizoRuntimeQA.defenseMapsForQA(),routes:RizoRuntimeQA.defenseMapRoutesForQA()})""")
    expected={'grove','ember','moon','storm','blizzard','eclipse'}
    actual={row['id'] for row in registry['maps']['all']}
    record('all six authored Defense map/route definitions remain registered', actual==expected and set(registry['routes'].keys())==expected, str({'maps':sorted(actual),'routes':sorted(registry['routes'].keys())}))
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"}); document.querySelector("#defenseMapIntro")?.remove()')
    fresh=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('fresh unlocked Defense field still launches normally', fresh['map']=='grove' and fresh['lives']>0 and fresh['cash']>=0 and fresh['phase']=='planning', str({'map':fresh['map'],'lives':fresh['lives'],'cash':fresh['cash'],'phase':fresh['phase']}))
    if not page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.length'):
        page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    tower=page.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
    activate(page,'[data-defense-close-panel]')
    bench_state=page.evaluate('RizoRuntimeQA.defenseToggleBenchForQA(true)')
    bench=bench_state['open']
    page.evaluate('RizoRuntimeQA.defenseToggleBenchForQA(false); RizoRuntimeQA.defenseToggleIntelForQA(true)')
    intel=page.evaluate('RizoRuntimeQA.defenseOverlayForQA().surface')
    record('unrelated tower, bench, and intel surfaces still function', bool(tower and tower['shown']) and bench and intel=='intel', str({'tower':bool(tower and tower['shown']),'benchOpen':bench,'intelOverlay':intel}))
    record('unrelated Defense smoke has no runtime errors', not errors, str(errors))
    page.close(); browser.close()

failed=[row for row in checks if not row[1]]
print(f"\n{len(checks)-len(failed)}/{len(checks)} Worker A flow/depth checks passed")
if failed:
    for row in failed: print('FAILED:',row)
    raise SystemExit(1)
