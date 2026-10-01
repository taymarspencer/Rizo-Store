from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

results=[]
def record(name, ok, detail=''):
    results.append((name,bool(ok),detail)); print(('PASS' if ok else 'FAIL'),name,detail)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m:errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000); start_defense(page)
    page.evaluate('RizoRuntimeQA.defenseSetMapForQA("grove");RizoRuntimeQA.defenseSetRunForQA({cash:50000})')

    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.20)')
    factory_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id')
    for _ in range(2): page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{factory_id}")')
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.55,.20)')
    beacon_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id')
    for _ in range(4): page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{beacon_id}")')

    # Level one remains obvious; the deeper network only activates after HALO ARRAY + mixed field.
    pre=page.evaluate('RizoRuntimeQA.defenseStructuresForQA()')
    beacon_pre=next(x for x in pre if x['type']=='beacon')
    factory_pre=next(x for x in pre if x['type']=='factory')
    record('Private Sun alone does not invent a hidden economy bonus without a combat Rizo',not beacon_pre['beacon']['network']['brandLoop'],str(beacon_pre['beacon']['network']))

    pet=page.evaluate('RizoRuntimeQA.defenseSetPetVariantForQA("golden")')
    count_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.length')
    count_after=page.evaluate(f'RizoRuntimeQA.defensePlaceForQA("{pet["petId"]}",.42,.36)')
    golden_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id') if count_after>count_before else None
    if golden_id:
        for _ in range(2): page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{golden_id}")')
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseTickForQA(.1)')
    rows=page.evaluate('RizoRuntimeQA.defenseStructuresForQA()')
    beacon=next(x for x in rows if x['type']=='beacon'); factory=next(x for x in rows if x['type']=='factory')
    net=beacon['beacon']['network']
    record('Mixed Beacon field becomes a Brand Loop through placement, not another menu',count_after==count_before+1 and net['brandLoop'] and net['privateSun'] and net['combat']>=1 and net['factories']==1,str(net))
    record('Beacon cadence is felt immediately by preserving in-progress Factory work',factory['nextProductionAt'] < factory_pre['nextProductionAt']-1 and factory['nextProductionAt'] < 4.2,f'before={factory_pre["nextProductionAt"]:.3f}, after={factory["nextProductionAt"]:.3f}, supportedInterval={factory["factory"]["interval"]:.3f}')
    record('Awakened Golden in the same Brand Loop creates a spatial Golden License',factory['factory']['goldenLicensed'] and net['golden']==1,str(factory['factory']))
    record('Brand Loop shortens PRINT LINE drop cycle from four clean prints to three',factory['factory']['dropEvery']==3,str(factory['factory']))
    record('Brand Loop and Golden License are visible on the actual field',page.locator(f'[data-defense-tower="{beacon_id}"].brand-loop.private-sun-network.golden-license').count()==1 and page.locator(f'[data-defense-tower="{factory_id}"].brand-loop.golden-license').count()==1)

    # Two clean payouts arm the third PRINT LINE payout as a branded drop.
    for _ in range(79): page.evaluate('RizoRuntimeQA.defenseTickForQA(.1)')
    armed=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")')
    record('Clean survival builds visible Factory momentum toward the next drop',armed['cleanCycles']>=2 and armed['factory']['momentumMultiplier']>1 and armed['factory']['isDrop'],str(armed))
    record('Factory visually signals when the next production cycle is a drop',page.locator(f'[data-defense-tower="{factory_id}"].drop-ready').count()==1)

    produced_before=armed['totalProduced']
    expected_drop=armed['factory']['payout']
    for _ in range(41): page.evaluate('RizoRuntimeQA.defenseTickForQA(.1)')
    after_drop=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")')
    record('Golden Private-Sun RIZO DROP lands as a materially larger payout',after_drop['totalProduced']-produced_before>=expected_drop and expected_drop>100,f'expected>={expected_drop}, delta={after_drop["totalProduced"]-produced_before}')

    # Greed has a cost: a leak immediately breaks accumulated Factory momentum.
    page.evaluate('RizoRuntimeQA.defenseLeakForQA("puff",1);RizoRuntimeQA.defenseTickForQA(.1)')
    broken=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")')
    record('A leak breaks the Factory clean streak and removes momentum',broken['cleanCycles']==0 and abs(broken['factory']['momentumMultiplier']-1)<1e-9,str(broken))

    # Performance restraint: the new authored pulses must disappear on the existing low-FX tier.
    page.evaluate('RizoRuntimeQA.defenseSetLowPerformanceForQA(true)')
    lowfx=page.evaluate('''() => {const f=document.querySelector('[data-defense-tower="%s"]'),b=document.querySelector('[data-defense-tower="%s"]');f.classList.add('factory-drop');b.classList.add('brand-pulse');return {world:document.querySelector('.defense-world')?.className||'',factory:getComputedStyle(f.querySelector('.structure-art-factory')).animationName,beacon:getComputedStyle(b.querySelector('.defense-structure-field')).animationName}}''' % (factory_id, beacon_id))
    record('Depth effects honor the existing low-performance tier',lowfx['factory']=='none' and lowfx['beacon']=='none',str(lowfx))
    page.evaluate('RizoRuntimeQA.defenseSetLowPerformanceForQA(false)')

    # Mobile/readability restraint: richer states must not grow the controls or document width.
    page.set_viewport_size({'width':375,'height':667})
    page.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
    mobile=page.evaluate('''() => {const p=document.querySelector('#defenseTowerPanel').getBoundingClientRect();return {doc:document.documentElement.scrollWidth,vw:innerWidth,left:p.left,right:p.right,width:p.width,text:document.querySelector('.defense-structure-readout')?.innerText||''}}''')
    record('Depth readout remains phone-safe and explains itself without a new control layer',mobile['doc']<=mobile['vw']+1 and mobile['left']>=-1 and mobile['right']<=mobile['vw']+1 and 'CLEAN STREAK' in mobile['text'],str(mobile))

    record('Depth scenario has no runtime errors',not errors,'; '.join(errors[:5]))
    browser.close()

passed=sum(1 for _,ok,_ in results if ok)
print(f"\n{passed}/{len(results)} Worker B depth checks passed.")
if passed != len(results): raise SystemExit(1)
