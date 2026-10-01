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

    # Player-facing naming no longer leaks patch-history/dev metadata.
    page.evaluate(SETUP_STATE);page.locator('[data-nav="arcade"]').click();page.wait_for_timeout(40)
    body=page.locator('#viewArcade').inner_text()
    for stale in ['POWER TAP DX','SPARK CATCH DX','FOREST FORAGE DX','RIZO RUSH DX','FOREST MEMORY DX','REBUILT']:
        record(f'arcade hides dev label {stale}',stale not in body)
    for name in ['POWER TAPE','SPARK STASH','FOREST LUNCH','RIZO COURIER','EMBER BEAT','LOST SIGNAL','SKYBOUND','EMBER FORGE','RIZO RUNAWAY']:
        record(f'arcade exposes authored cabinet {name}',name in body)

    # Power Tape: technique choice changes the outcome; correct call is not just timing skin.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("power")');page.wait_for_timeout(60)
    before=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().power')
    wrong={'jab':'body','body':'hook','hook':'jab'}[before['call']]
    after_wrong=page.evaluate('(t)=>RizoRuntimeQA.arcadePowerStrikeForQA(t)',wrong)
    record('Power wrong technique is a real mistake',after_wrong['wrongCalls']>=1,str(after_wrong))
    page.wait_for_timeout(190)
    snap=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().power')
    after_right=page.evaluate('(t)=>RizoRuntimeQA.arcadePowerStrikeForQA(t)',snap['call'])
    record('Power correct called strike can land',after_right['callsRead']>snap['callsRead'],str(after_right))
    record('Power exposes three deliberate strike buttons',page.locator('[data-power-tech]').count()==3)
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Spark Stash: points are at risk before banking, so catch-spam alone is not the strategy.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("spark")');page.wait_for_timeout(30)
    page.evaluate('RizoRuntimeQA.arcadeSparkCatchForQA("normal",0)');s1=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().spark')
    record('Spark catch builds risky stash before bank',s1['stash']>0 and s1['banked']==0,str(s1))
    bank=page.evaluate('RizoRuntimeQA.arcadeSparkBankForQA()')
    record('Spark bank converts risk into permanent run score',bank['stash']==0 and bank['banked']>0 and bank['banks']>=1,str(bank))
    page.evaluate('RizoRuntimeQA.arcadeSparkCatchForQA("normal",0)');lost=page.evaluate('RizoRuntimeQA.arcadeSparkCatchForQA("shadow")')
    record('Shadow signal wipes unbanked greed',lost['stash']==0 and lost['lost']>0,str(lost))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Forest Lunch: order length evolves and every second completed ticket changes the spawn phase.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("forage")');page.wait_for_timeout(30)
    f0=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().forage')
    f1=page.evaluate('RizoRuntimeQA.arcadeForageCompleteOrderForQA()');f2=page.evaluate('RizoRuntimeQA.arcadeForageCompleteOrderForQA()')
    record('Forage ticket progresses instead of one endless catch loop',f2['ordersDone']==2,str(f2))
    record('Forage earns a distinct Picnic Panic phase',f2['panic'],str(f2))
    record('Forage ticket difficulty grows with completed lunches',len(f2['order'])>=len(f0['order']),f"{len(f0['order'])}->{len(f2['order'])}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Lost Signal stacks rules instead of just extending Simon sequences.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("memory")');page.wait_for_timeout(30)
    m7=page.evaluate('RizoRuntimeQA.arcadeMemoryRoundForQA(7)');m9=page.evaluate('RizoRuntimeQA.arcadeMemoryRoundForQA(9)')
    record('Lost Signal reaches stacked reverse/opposite corruption',m7['mode']=='reverse-opposite',str(m7))
    record('Lost Signal later reaches reverse/rotate corruption',m9['mode']=='reverse-rotate',str(m9))
    record('Lost Signal transforms expected input, not only copy text',m9['expected']!=m9['sequence'],str(m9))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Skybound and Forge surface their mastery loops immediately.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("glide")');page.wait_for_timeout(30)
    record('Skybound shows center-thread draft objective','DRAFT' in page.locator('#miniArena').inner_text() and 'THERMAL' in page.locator('#miniArena').inner_text())
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("breaker")');page.wait_for_timeout(30)
    b0=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().breaker');b1=page.evaluate('RizoRuntimeQA.arcadeBreakerCollapseCoreForQA()')
    record('Forge loads an authored named wall pattern',bool(b0['pattern']),str(b0))
    record('Forge core is a functional board-collapse objective',b1['coresBroken']>b0['coresBroken'],f"{b0}->{b1}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Runaway hunter learns repeated directional preference.
    page.evaluate(SETUP_STATE);page.evaluate('RizoRuntimeQA.startMiniGame("maze")');page.wait_for_timeout(30)
    for _ in range(6): page.evaluate('RizoRuntimeQA.arcadeMazeDirectionForQA("right")')
    maze=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().maze')
    record('Runaway records a player movement habit for ambush AI',maze['favoriteDir']=='right',str(maze))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

    # Cabinet-specific mechanical language is visible from Home too.
    page.evaluate(SETUP_STATE);page.locator('[data-nav="home"]').click();page.locator('[data-action="play"]').click();page.wait_for_timeout(30)
    sheet=page.locator('#sheetBody').inner_text()
    record('Home play sheet uses current cabinet identities',all(x in sheet for x in ['SPARK STASH','FOREST LUNCH','RIZO COURIER','LOST SIGNAL','EMBER FORGE','POWER TAPE']))
    record('Home play sheet explains actual unique loops',all(x in sheet for x in ['unbanked','Picnic Panic','parcel','pirate transmission','CORE','Coach calls']))

    record('v84 lame test has no page errors',not errors,'; '.join(errors[:6]))
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} v84 lame-test checks passed")
raise SystemExit(1 if failed else 0)
