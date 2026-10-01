from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'),name,detail)

selectors={
 'power':'.power-dx','spark':'.spark-dx','forage':'.forage-dx','rush':'.rush-dx','walk':'.walk-world',
 'rhythm':'.rhythm-world','memory':'.memory-dx','glide':'.glide-world','breaker':'.breaker-world','maze':'.maze-world'
}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000)
    page.wait_for_timeout(220); page.evaluate(SETUP_STATE)

    # Save migration: every Arcade score field is bounded, including the two V75 fields
    # that were previously omitted from the clamp loop and the new Runaway score.
    payload=page.evaluate('RizoRuntimeQA.defaultState()')
    payload['scores']['glide']=-90; payload['scores']['breaker']=999999999999; payload['scores']['maze']=-4
    normalized=page.evaluate('(p)=>RizoRuntimeQA.normalizeState(p)',payload)
    scores=normalized['scores']
    record('all arcade score fields normalize safely',scores['glide']==0 and scores['breaker']==1000000000 and scores['maze']==0,str({k:scores[k] for k in ['glide','breaker','maze']}))
    envelope=page.evaluate('(p)=>RizoRuntimeQA.buildStateEnvelopeForQA(p)',normalized)
    envelope['state']['scores']['maze']=77
    record('save signature protects new arcade scores',not page.evaluate('(e)=>RizoRuntimeQA.verifyStateEnvelopeForQA(e)',envelope))

    # Every non-Defense cabinet still boots in one shared runtime after the pass.
    for mode,selector in selectors.items():
        page.evaluate(SETUP_STATE)
        page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")')
        page.wait_for_timeout(360 if mode=='rhythm' else 180)
        visible=page.locator(selector).count()==1 and not page.locator('#miniGameOverlay').get_attribute('hidden')
        record(f'{mode} boots cleanly',visible)
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})'); page.wait_for_timeout(25)

    # Spark Catch now has a payoff phase instead of being an endless same-tempo tap test.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("spark")');page.wait_for_timeout(60)
    spark=page.evaluate('RizoRuntimeQA.arcadeSparkCatchForQA("normal",5)')
    record('spark clean chain triggers Spark Rush',spark['frenzy'] and spark['frenzies']==1,str(spark))
    record('spark rush is visibly surfaced',page.locator('.spark-world.frenzy').count()==1)
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})');page.wait_for_timeout(25)

    # Memory rule manipulation is now real gameplay, not a label-only flourish.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("memory")');page.wait_for_timeout(80)
    mem=page.evaluate('RizoRuntimeQA.arcadeMemoryRoundForQA(5)')
    record('memory round five introduces ROTATE corruption',mem['mode']=='rotate',str(mem))
    record('memory corruption transforms the shown sequence',mem['expected']!=mem['sequence'],str(mem))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})');page.wait_for_timeout(25)

    # Runaway: connected board, real Rizo, three distinct hunters, queued movement.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("maze")');page.wait_for_timeout(120)
    maze=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze')
    record('runaway starts with full chase state',maze['lives']==3 and maze['pellets']>=120 and len(maze['hunters'])==3,str(maze))
    record('runaway hunters have distinct behavior roles',sorted(h['kind'] for h in maze['hunters'])==['ambush','chase','wander'],str(maze['hunters']))
    context=page.locator('#mazeRizo .mini-pet').get_attribute('data-rizo-context')
    record('runaway uses shared arcade Rizo renderer',context=='arcade',str(context))
    before=maze['player'];page.evaluate('RizoRuntimeQA.arcadeMazeDirectionForQA("down")');page.wait_for_timeout(190)
    after=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze.player')
    record('runaway continuously moves from queued direction',(after['r']!=before['r'] or after['c']!=before['c']),f'{before}->{after}')
    page.keyboard.press('ArrowUp');page.wait_for_timeout(500)
    queued=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze.player.nextDir')
    record('runaway keyboard/touch direction queue works',queued=='up',str(queued))
    page.keyboard.press('ArrowDown');page.wait_for_timeout(300)
    page.keyboard.press('ArrowLeft');page.wait_for_timeout(500)
    page.evaluate('RizoRuntimeQA.finishMiniGame(false)');page.wait_for_timeout(70)
    record('runaway result offers instant replay',page.locator('[data-replay-game="maze"]').count()==1)
    result_text=page.locator('#modalOverlay').inner_text()
    record('runaway result reports chase-specific mastery',all(x in result_text for x in ['MAZE REACHED','BEST HUNT CHAIN','SHADOW TAGS','PRISM HUNTS']))
    page.locator('[data-close-modal]').click();page.wait_for_timeout(30)

    # Skybound retro variants: generic retro animation must not override flight positioning.
    state=page.evaluate('RizoRuntimeQA.defaultState()');state['pet']['stage']='kid';state['pet']['variant']='retro';state['pet']['hiddenVariant']='retro';state['pet']['energy']=100;state['player']['tutorialDismissed']=True
    page.evaluate('(s)=>RizoRuntimeQA.loadForQA(s)',state);page.evaluate('RizoRuntimeQA.startMiniGame("glide")');page.wait_for_timeout(100)
    retro=page.locator('#miniPet.glide-rizo')
    animation=retro.evaluate('(n)=>getComputedStyle(n).animationName')
    transform=retro.evaluate('(n)=>getComputedStyle(n).transform')
    record('skybound retro no longer overrides flight transform',animation=='none' and transform!='none',f'animation={animation} transform={transform}')
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    record('arcade soul regression has no page errors',not errors,'; '.join(errors[:6]))
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} arcade soul regression checks passed")
raise SystemExit(1 if failed else 0)
