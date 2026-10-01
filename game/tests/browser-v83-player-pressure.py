from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'),name,detail)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000)
    page.wait_for_timeout(180)

    # Live menu truth: exact energy rules and cabinet-specific verbs survive renderAll().
    st=page.evaluate('RizoRuntimeQA.defaultState()');st['pet']['stage']='kid';st['pet']['energy']=10;st['player']['tutorialDismissed']=True
    page.evaluate('(s)=>RizoRuntimeQA.loadForQA(s)',st);page.locator('[data-nav="arcade"]').click();page.wait_for_timeout(30)
    def txt(mode): return page.locator(f'[data-minigame="{mode}"]').inner_text()
    record('10 energy really unlocks Skybound',txt('glide')=='FLY',txt('glide'))
    record('10 energy really unlocks Spark at its real cost',txt('spark')=='CHASE',txt('spark'))
    record('10 energy really unlocks Runaway',txt('maze')=='RUN',txt('maze'))
    record('Breaker truthfully asks for 11',txt('breaker')=='NEED 11 ENERGY',txt('breaker'))
    record('Forage truthfully asks for 11',txt('forage')=='NEED 11 ENERGY',txt('forage'))
    record('Power truthfully asks for 15',txt('power')=='NEED 15 ENERGY',txt('power'))
    record('Rush truthfully asks for 15',txt('rush')=='NEED 15 ENERGY',txt('rush'))
    record('12-energy cabinets stay locked at 10',txt('rhythm')=='NEED 12 ENERGY',txt('rhythm'))

    # Home Play sheet must expose current games/mechanics instead of the stale pre-pass list.
    page.locator('[data-nav="home"]').click();page.wait_for_timeout(30)
    page.locator('[data-action="play"]').click();page.wait_for_timeout(40)
    sheet=page.locator('#sheetBody').inner_text()
    record('home Play sheet includes Skybound', 'SKYBOUND' in sheet)
    record('home Play sheet includes Forge', 'EMBER FORGE' in sheet)
    record('home Play sheet includes Runaway', 'RIZO RUNAWAY' in sheet)
    record('home Play sheet explains Lost Signal corruption', all(x in sheet for x in ['reverse','opposite','rotate']))
    page.evaluate('document.querySelector("#sheetBackdrop")?.classList.remove("show")')

    # Passive run farming: a scoreless/no-input launch gets no permanent economy credit.
    page.evaluate(SETUP_STATE)
    before=page.evaluate('RizoRuntimeQA.snapshot()')
    page.evaluate('RizoRuntimeQA.startMiniGame("power")');page.wait_for_timeout(80);page.evaluate('RizoRuntimeQA.finishMiniGame(false)');page.wait_for_timeout(50)
    after=page.evaluate('RizoRuntimeQA.snapshot()');modal=page.locator('#modalOverlay').inner_text()
    record('AFK Power grants no Embers',after['wallet']['embers']==before['wallet']['embers'],f"{before['wallet']['embers']}->{after['wallet']['embers']}")
    record('AFK Power spends no Energy',after['pet']['energy']==before['pet']['energy'],f"{before['pet']['energy']}->{after['pet']['energy']}")
    record('AFK Power gets explicit warm-up result','NO PERMANENT CREDIT' in modal,modal[:120])
    page.locator('[data-close-modal]').click();page.wait_for_timeout(30)

    # Qualified runs pay exactly the same energy number advertised at the cabinet.
    st=page.evaluate('RizoRuntimeQA.defaultState()');st['pet']['stage']='kid';st['pet']['energy']=15;st['player']['tutorialDismissed']=True
    page.evaluate('(s)=>RizoRuntimeQA.loadForQA(s)',st);before=page.evaluate('RizoRuntimeQA.snapshot()')
    page.evaluate('RizoRuntimeQA.startMiniGame("power")');page.evaluate('RizoRuntimeQA.arcadeQualifyForQA("power")');page.evaluate('RizoRuntimeQA.finishMiniGame(false)');page.wait_for_timeout(35)
    after=page.evaluate('RizoRuntimeQA.snapshot()')
    record('qualified Power spends exactly advertised 15 Energy',before['pet']['energy']-after['pet']['energy']==15,f"{before['pet']['energy']}->{after['pet']['energy']}")
    record('qualified Power still earns permanent reward',after['wallet']['embers']>before['wallet']['embers'],f"{before['wallet']['embers']}->{after['wallet']['embers']}")
    page.locator('[data-close-modal]').click();page.wait_for_timeout(25)

    # Power spam: whiffs are attempts, not fake successful hits, and one timing window cannot multi-score.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("power")');page.wait_for_timeout(70)
    arena=page.locator('#miniArena'); box=arena.bounding_box();
    for _ in range(5): page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    snap=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA()')
    record('Power whiffs do not count as landed hits',snap['hits']==0,str(snap))
    record('Power rejects duplicate taps in one timing window',snap['hits']<=1,str(snap['hits']))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Runaway fairness: no forced head-on opening, and hunters visibly wait before pressure starts.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("maze")');page.wait_for_timeout(60)
    a=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze')
    page.wait_for_timeout(650);b=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze')
    record('Runaway opens away from side hunters',a['player']['dir']=='down',str(a['player']))
    record('Runaway gives a readable hunter wake-up grace',a['hunters']==b['hunters'],f"{a['hunters']} -> {b['hunters']}")
    page.keyboard.press('ArrowLeft');page.wait_for_timeout(40);c=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze')
    record('Runaway records real direction input',c['inputs']>=1,str(c['inputs']))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Maze cannot farm its automatically eaten opening pellets without player intent.
    page.evaluate(SETUP_STATE);before=page.evaluate('RizoRuntimeQA.snapshot()');page.evaluate('RizoRuntimeQA.startMiniGame("maze")');page.wait_for_timeout(760)
    passive_score=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().score');page.evaluate('RizoRuntimeQA.finishMiniGame(false)');page.wait_for_timeout(40)
    after=page.evaluate('RizoRuntimeQA.snapshot()');modal=page.locator('#modalOverlay').inner_text()
    record('Runaway may move but passive score is not bankable',passive_score>0 and after['wallet']['embers']==before['wallet']['embers'],f"score={passive_score}, embers {before['wallet']['embers']}->{after['wallet']['embers']}")
    record('passive Runaway does not become a personal best',after['scores']['maze']==before['scores']['maze'],f"{before['scores']['maze']}->{after['scores']['maze']}")
    record('passive Runaway result explains no credit','NO PERMANENT CREDIT' in modal)
    page.locator('[data-close-modal]').click();page.wait_for_timeout(25)

    # Repeated cabinet hopping must tear down timers/animation state cleanly.
    page.evaluate(SETUP_STATE)
    modes=['power','spark','forage','rush','walk','rhythm','memory','glide','breaker','maze']
    for _ in range(2):
        for mode in modes:
            page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")');page.wait_for_timeout(12);page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    final_snap=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA()')
    record('20 rapid cabinet swaps leave Arcade inactive and clean',not final_snap['active'],str(final_snap['mode']))

    record('pressure pass has no page errors',not errors,'; '.join(errors[:5]))
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} v83 player-pressure checks passed")
raise SystemExit(1 if failed else 0)
