from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

results=[]
def record(name, ok, detail=''):
    results.append((name,bool(ok),detail))
    print(('PASS' if ok else 'FAIL'),name,detail)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m:errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    start_defense(page)

    factory_card=page.locator('[data-defense-roster-id="defense-structure-factory"]')
    beacon_card=page.locator('[data-defense-roster-id="defense-structure-beacon"]')
    record('universal Factory and Beacon are immediately deployable from the bench',factory_card.count()==1 and beacon_card.count()==1,(factory_card.inner_text()+' | '+beacon_card.inner_text()).replace('\n',' / '))
    guide=page.evaluate('RizoRuntimeQA.defenseFieldGuideMarkupForQA("rizos")')
    record('structures do not pollute Rizo mastery/field-guide semantics','CLOTHING FACTORY' not in guide and '>BEACON<' not in guide)

    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:10000})')
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.length')
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.55,.2)')
    beacon_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id')
    for _ in range(4): page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{beacon_id}")')
    beacon=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="beacon")')
    record('Beacon upgrades reach the private-sun support state',beacon and beacon['upgrade']==4 and abs(beacon['beacon']['rateMultiplier']-1.55)<1e-9 and abs(beacon['beacon']['damageMultiplier']-1.30)<1e-9,str(beacon))
    record('max Beacon is visibly represented as a maxed structure',page.locator('.defense-structure-beacon.structure-maxed').count()==1,page.locator('.defense-structure-beacon').get_attribute('class') or '')

    placed=page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.2)')
    factory=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")')
    record('Factory inside max Beacon inherits the visible production-line cadence bonus',placed==before+2 and factory and abs(factory['factory']['cadenceMultiplier']-.70)<1e-9 and abs(factory['factory']['interval']-5.04)<1e-9,str(factory))

    cash_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
    for _ in range(65): page.evaluate('RizoRuntimeQA.defenseTickForQA(.1)')
    factory_after=page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")')
    cash_after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
    record('Factory pays only after live simulation time advances',factory_after and factory_after['totalProduced']>=12 and cash_after>cash_before,f"produced={factory_after['totalProduced'] if factory_after else None} cash {cash_before}->{cash_after}")

    # Separate page: prove the Beacon cause/effect reaches combat Rizos, not only economy structures.
    page2=browser.new_page(viewport={'width':390,'height':844}); errors2=[]
    page2.on('pageerror',lambda e:errors2.append(str(e)))
    page2.set_content(build_inline_app(True),wait_until='load',timeout=120000); start_defense(page2)
    page2.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:10000})')
    page2.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.55,.2)')
    beacon2=page2.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].id')
    for _ in range(4): page2.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{beacon2}")')
    page2.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-crew-violet",.35,.2)')
    page2.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseTickForQA(.1)')
    violet=page2.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.find(x=>x.petId==="defense-crew-violet")')
    record('Rizo inside Beacon field receives support and a readable halo',violet and violet['beaconBuffed'] and page2.locator('[data-defense-tower="'+violet['id']+'"].beacon-buffed').count()==1,str(violet))

    # Checkpoint roundtrip: structure identity and derived spend survive without trusting cosmetic timers.
    checkpoint=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("worker-b")')
    normalized=page.evaluate('(cp)=>RizoRuntimeQA.defenseNormalizeCheckpointForQA(cp)',checkpoint)
    rows={r['structureType']:r for r in normalized['towers'] if r.get('structureType')} if normalized else {}
    record('signed checkpoint canonicalization preserves structures and derives investment','factory' in rows and 'beacon' in rows and rows['beacon']['spent']==1980 and rows['factory']['spent']==160,str(rows))

    # Golden keeps a distinct economic role: Factories amplify Payday rather than replacing it.
    def payday_delta(with_factory):
        p3=browser.new_page(viewport={'width':390,'height':844})
        p3.set_content(build_inline_app(True),wait_until='load',timeout=120000); start_defense(p3)
        p3.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:10000});RizoRuntimeQA.defenseSetPetVariantForQA("golden");RizoRuntimeQA.defensePlaceNextForQA()')
        if with_factory: p3.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.55,.2)')
        before=p3.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
        p3.evaluate('RizoRuntimeQA.defenseCastForQA()')
        after=p3.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
        p3.close(); return after-before
    payday_base=payday_delta(False); payday_factory=payday_delta(True)
    record('Factory amplifies Golden Rizo Payday without replacing Golden identity',payday_factory>payday_base>0,f'Payday {payday_base} -> {payday_factory}')

    record('Worker B browser scenario has no runtime errors',not errors and not errors2,'; '.join((errors+errors2)[:5]))
    browser.close()

passed=sum(1 for _,ok,_ in results if ok)
print(f"\n{passed}/{len(results)} Worker B browser checks passed.")
if passed != len(results): raise SystemExit(1)
