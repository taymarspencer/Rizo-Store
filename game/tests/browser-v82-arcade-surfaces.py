from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'),name,detail)

viewports=[(320,568),(390,844),(844,390)]
modes=['power','spark','forage','rush','walk','rhythm','memory','glide','breaker','maze']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    for w,h in viewports:
        page=browser.new_page(viewport={'width':w,'height':h})
        errors=[]; page.on('pageerror',lambda e, errors=errors:errors.append(str(e)))
        page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000)
        page.wait_for_timeout(160);page.evaluate(SETUP_STATE)
        for mode in modes:
            page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")');page.wait_for_timeout(220 if mode=='rhythm' else 130)
            shell=page.locator('.minigame-shell').bounding_box();arena=page.locator('#miniArena').bounding_box();quit_rect=page.locator('#miniQuit').bounding_box()
            contained=bool(shell and shell['x']>=-1 and shell['y']>=-1 and shell['x']+shell['width']<=w+1 and shell['y']+shell['height']<=h+1)
            arena_ok=bool(arena and arena['width']>=min(280,w-20) and arena['height']>=145)
            quit_ok=bool(quit_rect and quit_rect['width']>=44 and quit_rect['height']>=30 and quit_rect['y']+quit_rect['height']<=h+1)
            record(f'{mode} contained {w}x{h}',contained,shell)
            record(f'{mode} usable playfield {w}x{h}',arena_ok,arena)
            record(f'{mode} quit reachable {w}x{h}',quit_ok,quit_rect)
            if mode=='maze':
                board=page.locator('#mazeBoard').bounding_box();controls=page.locator('.maze-controls').bounding_box()
                board_ok=bool(board and arena and board['x']>=arena['x']-1 and board['y']>=arena['y']-1 and board['x']+board['width']<=arena['x']+arena['width']+1 and board['y']+board['height']<=arena['y']+arena['height']+1)
                controls_ok=bool(controls and arena and controls['x']>=arena['x']-1 and controls['y']>=arena['y']-1 and controls['x']+controls['width']<=arena['x']+arena['width']+1 and controls['y']+controls['height']<=arena['y']+arena['height']+1)
                record(f'runaway board stays inside arena {w}x{h}',board_ok,board)
                record(f'runaway controls stay reachable {w}x{h}',controls_ok,controls)
            page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})');page.wait_for_timeout(20)
        record(f'no v82 arcade runtime errors {w}x{h}',not errors,'; '.join(errors[:4]))
        page.close()
    browser.close()
failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} v82 arcade surface checks passed")
raise SystemExit(1 if failed else 0)
