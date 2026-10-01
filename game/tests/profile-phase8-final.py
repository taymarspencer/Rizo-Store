from pathlib import Path
import json, statistics, math
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense
ROOT=Path(__file__).resolve().parents[1]

def percentile(values,p):
    if not values:return 0
    ordered=sorted(values);idx=(len(ordered)-1)*p;lo=math.floor(idx);hi=math.ceil(idx)
    return ordered[lo] if lo==hi else ordered[lo]*(hi-idx)+ordered[hi]*(idx-lo)

def prepare(page,towers=8):
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    page.evaluate('document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked")')
    start_defense(page)
    page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))')
    page.evaluate(f'RizoRuntimeQA.defenseSetCashForQA(100000);for(let i=0;i<{towers};i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseWarmPoolsForQA()')

def profile_speed(browser,speed,duration_ms=6500):
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    prepare(page)
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate(f'RizoRuntimeQA.defenseLoadQueueForQA(46,"puff",18,{speed})')
    page.evaluate('''(()=>{window.__defenseFrameSamples=[];let last=performance.now();function sample(t){if(!window.__defenseFrameSamples)return;const d=t-last;last=t;if(d>0&&d<250)window.__defenseFrameSamples.push(d);requestAnimationFrame(sample)}requestAnimationFrame(sample)})()''')
    page.wait_for_timeout(duration_ms)
    samples=page.evaluate('window.__defenseFrameSamples.splice(5)')
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    dom=page.evaluate('''()=>({enemy:document.querySelectorAll("#defenseEnemies .defense-enemy").length,projectile:document.querySelectorAll("#defenseProjectiles .defense-shot").length,effect:document.querySelectorAll("#defenseEffects > *").length,total:document.querySelectorAll("#defenseWorld *").length,heap:performance.memory?.usedJSHeapSize||null})''')
    seconds=duration_ms/1000
    result={
      'speed':speed,'durationSeconds':seconds,'sampleCount':len(samples),
      'averageFrameMs':round(statistics.fmean(samples),3) if samples else None,
      'p95FrameMs':round(percentile(samples,.95),3) if samples else None,
      'worstFrameMs':round(max(samples),3) if samples else None,
      'estimatedFps':round(1000/statistics.fmean(samples),1) if samples else None,
      'maxActiveEnemies':snap['maxActiveEnemiesObserved'],
      'densityCap':snap['densityCap'],
      'maxProjectileNodes':snap['maxProjectileNodesObserved'],
      'maxEffectNodes':snap['maxEffectNodesObserved'],
      'enemyNodesCreated':snap['poolStats']['enemyCreated'],
      'projectileNodesCreated':snap['poolStats']['projectileCreated'],
      'effectNodesCreated':snap['poolStats']['impactCreated'],
      'targetScansPerSecond':round((snap['targetScans']-before['targetScans'])/seconds,2),
      'targetSnapshotBuildsPerSecond':round((snap['targetSnapshotBuilds']-before['targetSnapshotBuilds'])/seconds,2),
      'hudWritesPerSecond':round((snap['hudRenderCount']-before['hudRenderCount'])/seconds,2),
      'cashWritesPerSecond':round((snap['cashWriteCount']-before['cashWriteCount'])/seconds,2),
      'enemyPositionWritesPerSecond':round((snap['visualWrites']['enemyPosition']-before['visualWrites']['enemyPosition'])/seconds,2),
      'projectilePositionWritesPerSecond':round((snap['visualWrites']['projectilePosition']-before['visualWrites']['projectilePosition'])/seconds,2),
      'visualBudget':snap['visualBudget'],'realClock':snap['realClock'],'simulationClock':snap['simulationClock'],
      'activeDom':dom,'renderTier':snap['renderTier'],'performanceLow':snap['performanceLow'],
      'runtimeErrors':errors
    }
    page.close();return result

def income_scheduler(browser,speed,seconds=2):
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    prepare(page,1)
    result=page.evaluate(f'''(()=>{{RizoRuntimeQA.defenseSetSpeedForQA({speed});RizoRuntimeQA.defenseSetRunForQA({{wave:1,phase:"planning"}});const before=RizoRuntimeQA.defenseSnapshotForQA();for(let i=0;i<{int(seconds*100)};i++){{if(i%5===0)RizoRuntimeQA.defensePendingIncomeForQA(3);RizoRuntimeQA.defenseTickForQA(.01)}}for(let i=0;i<20;i++)RizoRuntimeQA.defenseTickForQA(.01);const after=RizoRuntimeQA.defenseSnapshotForQA();return{{before,after}}}})()''')
    before=result['before'];after=result['after'];expected=int(seconds*100/5)*3
    row={
      'speed':speed,'realSeconds':round(after['realClock']-before['realClock'],3),
      'simulationSeconds':round(after['simulationClock']-before['simulationClock'],3),
      'queuedIncome':expected,'settledIncome':after['cash']-before['cash'],'pendingIncome':after['pendingIncome'],
      'cashWrites':after['cashWriteCount']-before['cashWriteCount'],
      'cashWritesPerSecond':round((after['cashWriteCount']-before['cashWriteCount'])/max(.001,after['realClock']-before['realClock']),2),
      'lastBatch':after['lastIncomeBatch'],'runtimeErrors':errors
    }
    page.close();return row

def long_session(browser,waves=20):
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    prepare(page)
    page.evaluate('globalThis.gc?.()')
    baseline=page.evaluate('''()=>({snap:RizoRuntimeQA.defenseSnapshotForQA(),dom:document.querySelectorAll("#defenseWorld *").length,heap:performance.memory?.usedJSHeapSize||null})''')
    created=[];dom_after=[]
    for i in range(waves):
        page.evaluate(f'RizoRuntimeQA.defenseLoadQueueForQA(46,"puff",{20+i},2)')
        page.wait_for_timeout(80)
        page.evaluate(f'RizoRuntimeQA.defenseCompleteWaveForQA({20+i})')
        row=page.evaluate('''()=>{const s=RizoRuntimeQA.defenseSnapshotForQA();return{enemyCreated:s.poolStats.enemyCreated,projectileCreated:s.poolStats.projectileCreated,effectCreated:s.poolStats.impactCreated,activeEnemies:s.enemies.length,projectiles:s.projectiles.length,dom:document.querySelectorAll("#defenseWorld *").length}}''')
        created.append(row);dom_after.append(row['dom'])
    page.evaluate('globalThis.gc?.()');page.wait_for_timeout(100)
    final=page.evaluate('''()=>({snap:RizoRuntimeQA.defenseSnapshotForQA(),dom:document.querySelectorAll("#defenseWorld *").length,activeEnemyDom:document.querySelectorAll("#defenseEnemies .defense-enemy").length,activeProjectileDom:document.querySelectorAll("#defenseProjectiles .defense-shot").length,heap:performance.memory?.usedJSHeapSize||null})''')
    result={
      'waves':waves,
      'baselineDomNodes':baseline['dom'],'finalDomNodes':final['dom'],'domNodeGrowth':final['dom']-baseline['dom'],
      'baselineHeapBytes':baseline['heap'],'finalHeapBytes':final['heap'],
      'heapGrowthBytes':(final['heap']-baseline['heap']) if final['heap'] is not None and baseline['heap'] is not None else None,
      'enemyNodesCreatedStart':baseline['snap']['poolStats']['enemyCreated'],'enemyNodesCreatedEnd':final['snap']['poolStats']['enemyCreated'],
      'projectileNodesCreatedStart':baseline['snap']['poolStats']['projectileCreated'],'projectileNodesCreatedEnd':final['snap']['poolStats']['projectileCreated'],
      'effectNodesCreatedStart':baseline['snap']['poolStats']['impactCreated'],'effectNodesCreatedEnd':final['snap']['poolStats']['impactCreated'],
      'activeEnemyDomAfterClear':final['activeEnemyDom'],'activeProjectileDomAfterClear':final['activeProjectileDom'],
      'peakDomNodes':max(dom_after) if dom_after else baseline['dom'],
      'creationSeries':created,'runtimeErrors':errors
    }
    page.close();return result

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--enable-precise-memory-info','--js-flags=--expose-gc'])
    report={'environment':'Headless Chromium on the build host; 390x844 CSS viewport; real requestAnimationFrame timing. This is comparative QA, not a physical iPhone benchmark.','profiles':[profile_speed(browser,1),profile_speed(browser,2)],'incomeScheduler':[income_scheduler(browser,1),income_scheduler(browser,2)],'longSession':long_session(browser,50)}
    browser.close()
(ROOT/'reports'/'phase8-performance-profile.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
