from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def record(name, ok, detail=''):
    checks.append((name,bool(ok),detail)); print(('PASS' if ok else 'FAIL'), name, detail)

def find_valid(page):
    return page.evaluate('''()=>{for(let y=.1;y<=.9;y+=.04)for(let x=.1;x<=.9;x+=.04){const e=RizoRuntimeQA.defensePlacementEvaluationForQA(x,y);if(e.valid)return{x,y,e};}return null}''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Consumer-facing world select should behave like a game menu, not a dashboard.
    page=browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=3)
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(qa=True,embed_assets=True),wait_until='domcontentloaded')
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.showDefenseLobbyForQA("grove")')
    lobby=page.locator('.defense-world-lobby.v79-simple')
    text=lobby.inner_text()
    record('world select leads with one obvious trail choice', lobby.count()==1 and 'CHOOSE A TRAIL' in text and 'PLAY' in text, text[:240].replace('\n',' | '))
    record('challenges and school are out of the primary path', 'DAILY CHALLENGE' not in text and 'TRAIL SCHOOL' not in text and 'AUTO PICK' not in text, text[:240].replace('\n',' | '))
    page.locator('[data-defense-lobby-more]').click()
    extra=page.locator('.defense-world-extras').inner_text()
    record('advanced Defense material is intentionally behind MORE', 'RECORDS' in extra and 'GUIDE' in extra and 'TRAIL SCHOOL' in extra and 'DAILY CHALLENGE' in extra, extra.replace('\n',' | '))
    record('lobby pass has no runtime errors', not errors, str(errors))
    page.close()

    # iPad: tower must be tappable/upgradable while combat is live and panel must remain reachable.
    ipad=browser.new_page(viewport={'width':1024,'height':1366}, device_scale_factor=2)
    ipad_errors=[]; ipad.on('pageerror',lambda e:ipad_errors.append(str(e)))
    ipad.set_content(build_inline_app(qa=True,embed_assets=True),wait_until='domcontentloaded')
    ipad.evaluate('RizoRuntimeQA.defenseSetRendererForQA("canvas")')
    ipad.evaluate(SETUP_STATE)
    ipad.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    ipad.wait_for_timeout(120); ipad.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    pt=find_valid(ipad); assert pt
    ipad.evaluate('(p)=>RizoRuntimeQA.defensePlaceForQA(null,p.x,p.y)',pt)
    ipad.evaluate('RizoRuntimeQA.defenseSetCashForQA(5000);RizoRuntimeQA.defenseStartWaveForQA();RizoRuntimeQA.defenseTickForQA(2.0)')
    ipad.locator('.defense-tower').first.click()
    panel=ipad.locator('#defenseTowerPanel')
    box=panel.bounding_box(); panel_text=panel.inner_text()
    record('iPad tower inspector is visible and stays inside the viewport', not panel.is_hidden() and box and box['x']>=0 and box['y']>=0 and box['x']+box['width']<=1025 and box['y']+box['height']<=1367, str(box))
    before=ipad.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].upgrade')
    ipad.locator('[data-defense-upgrade]').click()
    after=ipad.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].upgrade')
    record('Rizos can be upgraded in the middle of a live wave on iPad', before==0 and after==1, f'{before}->{after}')
    panel_text=panel.inner_text()
    record('upgrade UI is a shop choice instead of a stat spreadsheet', 'LEVEL UP' in panel_text and 'POWER' in panel_text and 'RANGE' in panel_text and len(panel_text)<700, panel_text[:300].replace('\n',' | '))
    record('tower targeting uses human labels', any(word in panel_text for word in ['FRONT','TOUGHEST','BACK','NEAREST']), panel_text[:260].replace('\n',' | '))
    record('normal combat hides internal phase diagnostics', ipad.locator('#defensePhaseIndicator').is_hidden(), ipad.locator('#defensePhaseIndicator').get_attribute('hidden') or '')
    record('iPad consumer pass has no runtime errors', not ipad_errors, str(ipad_errors))
    ipad.close()

    # Phone: geometry, Canvas crispness contract, concise wave UX, residue fix, and Gate Flame.
    phone=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3)
    phone_errors=[]; phone.on('pageerror',lambda e:phone_errors.append(str(e)))
    phone.set_content(build_inline_app(qa=True,embed_assets=True),wait_until='domcontentloaded')
    phone.evaluate('RizoRuntimeQA.defenseSetRendererForQA("canvas")'); phone.evaluate(SETUP_STATE)
    phone.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})'); phone.wait_for_timeout(100); phone.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    pt=find_valid(phone); phone.evaluate('(p)=>RizoRuntimeQA.defensePlaceForQA(null,p.x,p.y)',pt)
    snap=phone.evaluate('RizoRuntimeQA.defenseSnapshotForQA()'); geom=phone.evaluate('RizoRuntimeQA.defensePlacementGeometryForQA()')
    tower=snap['towers'][0]; near=phone.evaluate('(t)=>RizoRuntimeQA.defenseNearestPathForQA(t.x,t.y)',tower)
    record('placed Rizo body has intentional road clearance', near['distance']>=geom['pathClearance'], str({'distance':near['distance'],'required':geom['pathClearance']}))
    record('auto-placement magnet is now subtle', geom['snap']<=10/min(390,390)+.001, str(geom['snap']))
    record('normal Canvas quality keeps a crisp 2x backing scale before pressure', 1.9<=snap['canvasRenderer']['dpr']<=2.0, str(snap['canvasRenderer']))
    preview=phone.locator('#defenseWavePreview').inner_text()
    record('default next-wave preview hides counts and packet jargon', 'READ THE ROAD' in preview and 'PACKET' not in preview and 'ARRIVAL' not in preview and 'BALLOON' not in preview and len(preview)<180, preview.replace('\n',' | '))
    residue=phone.evaluate('RizoRuntimeQA.defenseResidueResolutionForQA()')
    record('stale projectile visuals can no longer strand a cleared round', residue['before']>=1 and residue['resolved'] and residue['completed'] and residue['after']==0, str(residue))

    # New emergency flame is a tactical road placement, not auto-placement of towers.
    phone.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    enemy=phone.evaluate('RizoRuntimeQA.defenseSpawnForQA("shell",.5,200,200)')
    hp_before=phone.evaluate('(id)=>RizoRuntimeQA.defenseEnemyStateForQA(id).hp',enemy['id'])
    flame=phone.evaluate('RizoRuntimeQA.defenseGateFlameForQA(.5)')
    phone.evaluate('RizoRuntimeQA.defenseTickForQA(.6)')
    hp_after=phone.evaluate('(id)=>RizoRuntimeQA.defenseEnemyStateForQA(id)?.hp',enemy['id'])
    record('Gate Flame burns a chosen road segment for a timed window', flame['until']>0 and hp_after is not None and hp_after<hp_before and not phone.locator('#defenseGateFlameLive').is_hidden(), str({'flame':flame,'hp':(hp_before,hp_after)}))
    record('Gate Flame exposes a visible cooldown instead of hidden rules', phone.locator('#defenseGateFlameState').inner_text() not in ['', 'READY'], phone.locator('#defenseGateFlameState').inner_text())

    # Firing and abilities must move the character itself, not only spawn a projectile.
    phone.evaluate('RizoRuntimeQA.defenseRapidFireForQA(1)')
    firing=phone.locator('.defense-tower').first.get_attribute('class') or ''
    record('Rizo receives a firing animation state when it shoots', 'firing' in firing or 'doctrine-strike' in firing, firing)
    phone.evaluate('RizoRuntimeQA.defenseSetAbilityStateForQA(RizoRuntimeQA.defenseSnapshotForQA().towers[0].id,{upgrade:2,doctrine:"power",remaining:0,phase:"combat"})')
    phone.evaluate('RizoRuntimeQA.defenseCastForQA()')
    ability_cls=phone.locator('.defense-tower').first.get_attribute('class') or ''
    record('Rizo receives an ability-cast animation state', 'ability-cast' in ability_cls, ability_cls)
    record('phone consumer pass has no runtime errors', not phone_errors, str(phone_errors))
    phone.screenshot(path='reports/v79-consumer-phone.png',full_page=True)
    phone.close(); browser.close()

failed=[x for x in checks if not x[1]]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v79 consumer checks passed")
if failed: raise SystemExit(1)
