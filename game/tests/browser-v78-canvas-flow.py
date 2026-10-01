from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def record(name, ok, detail=''):
    checks.append((name,bool(ok),detail))
    print(('PASS' if ok else 'FAIL'), name, detail)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path="/usr/bin/chromium",args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844}, device_scale_factor=3)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(build_inline_app(qa=True, embed_assets=True), wait_until='domcontentloaded')
    page.evaluate('RizoRuntimeQA.defenseSetRendererForQA("canvas")')
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(180)
    page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()')
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('canvas renderer becomes the production combat presentation path', snap['rendererMode']=='canvas' and bool(snap['canvasRenderer'] and snap['canvasRenderer']['enabled']), str({k:snap.get(k) for k in ['rendererMode','canvasRenderer']}))
    record('canvas backing store keeps crisp normal-quality balloons without exceeding 2x', 1.9 <= snap['canvasRenderer']['dpr'] <= 2.0, str(snap['canvasRenderer']))

    # Consumer flow surface: preview should communicate the wave without engine jargon.
    preview=page.locator('#defenseWavePreview').inner_text()
    record('next-wave preview is glanceable instead of exposing packet internals', 'NEXT' in preview and 'WAVE' in preview and 'PACKET' not in preview and 'ARRIVAL' not in preview and not any(ch.isdigit() for ch in preview.split('\n')[-1]), preview.replace('\n',' | '))
    placed=page.evaluate('RizoRuntimeQA.defensePlaceForQA(null,.50,.15)')
    wave_button=page.locator('#defenseWaveLabel').inner_text()
    record('manual wave button reads like an intentional start action', placed>=1 and wave_button.startswith('START WAVE'), wave_button)
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    spawned=page.evaluate('RizoRuntimeQA.defenseSpawnForQA("shell",.32,1000000,1000000)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.12)')
    page.wait_for_timeout(80)
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    dom_count=page.locator('.defense-enemy').count()
    record('canvas enemies do not allocate moving DOM balloon nodes', placed>=1 and dom_count==0 and snap['canvasRenderer']['enemies']>=1, str({'dom':dom_count,'canvas':snap['canvasRenderer']['enemies']}))

    rapid=page.evaluate('RizoRuntimeQA.defenseRapidFireForQA(48)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.04)')
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    projectile_dom=page.locator('.defense-shot').count()
    record('rapid fire remains logical while visual tracer emission is bounded on canvas', rapid['logical']>=1 and rapid['visible'] <= rapid['budget']['maxVisibleProjectiles'] and projectile_dom==0, str({'rapid':rapid,'dom':projectile_dom}))
    record('canvas receives presentation frames', snap['canvasFrames']>0 and snap['canvasRenderer']['frames']>0, str({'canvasFrames':snap['canvasFrames'],'renderer':snap['canvasRenderer']}))

    # Governor may lower canvas DPR before touching gameplay density.
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    for _ in range(150): page.evaluate('RizoRuntimeQA.defenseRecordFrameForQA(36)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.05)')
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('stress lowers presentation quality without changing gameplay density', after['governorTier']>=1 and after['densityCap']==before['densityCap'] and after['canvasRenderer']['dpr']<=before['canvasRenderer']['dpr'], str({'before':(before['governorTier'],before['densityCap'],before['canvasRenderer']['dpr']),'after':(after['governorTier'],after['densityCap'],after['canvasRenderer']['dpr'])}))

    # Update UX exists globally and in Settings.
    update=page.evaluate('''()=>({bar:!!document.getElementById("rizoUpdateBar"), button:!!document.querySelector("[data-update-now]")})''')
    page.evaluate('document.querySelector("[data-nav=journal]").click(); document.querySelector("[data-journal-tab=settings]").click()')
    refresh_count=page.locator('[data-refresh-latest]').count()
    record('immediate-update controls exist in global shell and settings', update['bar'] and update['button'] and refresh_count==1, str({'global':update,'settings':refresh_count}))
    record('canvas flow test has no runtime errors', not errors, str(errors))
    page.close()

    # If iOS/browser loses the 2D context, the same live enemies are rebuilt into
    # pooled DOM nodes instead of disappearing from the match.
    fallback=browser.new_page(viewport={"width":390,"height":844})
    fallback_errors=[]
    fallback.on('pageerror', lambda e: fallback_errors.append(str(e)))
    fallback.set_content(build_inline_app(qa=True, embed_assets=True), wait_until='domcontentloaded')
    fallback.evaluate('RizoRuntimeQA.defenseSetRendererForQA("canvas")')
    fallback.evaluate(SETUP_STATE)
    fallback.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    fallback.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    fallback.evaluate('RizoRuntimeQA.defensePlaceForQA(null,.50,.15);RizoRuntimeQA.defenseStartWaveForQA();RizoRuntimeQA.defenseSpawnForQA("shell",.3,500,500);RizoRuntimeQA.defenseTickForQA(.08)')
    fallback_result=fallback.evaluate('RizoRuntimeQA.defenseDisableCanvasForQA()')
    record('canvas context loss rehydrates live combat into DOM fallback', fallback_result['rendererMode']=='dom' and fallback_result['enemyNodes']>=1 and fallback_result['canvasFallbacks']>=1 and not fallback_errors, str({'fallback':fallback_result,'errors':fallback_errors}))
    fallback.close()
    browser.close()

failed=[x for x in checks if not x[1]]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v78 canvas/flow checks passed")
if failed: raise SystemExit(1)
