"""Hostile-order / invariant stress gate for Worker J.

This intentionally attacks legal and internally-corrupted action orders without
changing gameplay design. It is meant to catch duplicate credit, checkpoint
scheduler corruption, lifecycle races, and phone/performance regressions.
"""
from pathlib import Path
import json, sys
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

ROOT = Path(__file__).resolve().parents[1]
results = []

def record(name, passed, detail=""):
    passed = bool(passed)
    results.append({"name": name, "passed": passed, "detail": str(detail)})
    print(("PASS" if passed else "FAIL"), name, detail, flush=True)

def fresh(page):
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    return page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on('pageerror', lambda e: errors.append('pageerror ' + str(e)))
    page.on('console', lambda m: errors.append('console ' + m.type + ' ' + m.text) if m.type == 'error' else None)
    page.set_content(build_inline_app(True), wait_until='load', timeout=120000)

    # Start-wave spam must be idempotent while a wave is active.
    fresh(page)
    page.evaluate('Array.from({length:30},()=>RizoRuntimeQA.defenseStartWaveForQA())')
    spam = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('start-wave spam cannot advance or duplicate an active wave', spam['currentWave'] == 1 and spam['clearedWave'] == 0 and spam['packetCount'] > 0 and spam['waveTotal'] > 0,
           {k: spam[k] for k in ['currentWave','clearedWave','phase','packetCount','waveTotal']})

    # Pause in countdown, mutate speed repeatedly, and prove frozen game time.
    paused = page.evaluate('''()=>{
      const before=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defensePauseForQA(true);
      for(const speed of [2,.5,1,2,1,.5,2])RizoRuntimeQA.defenseSetSpeedForQA(speed);
      const frozen=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defenseTickForQA(3);
      const after=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defensePauseForQA(false);
      RizoRuntimeQA.defenseTickForQA(.25);
      const resumed=RizoRuntimeQA.defenseSnapshotForQA();
      return {before,frozen,after,resumed};
    }''')
    record('pause during countdown survives speed spam and freezes simulation', paused['frozen']['paused'] and abs(paused['after']['simulationClock']-paused['frozen']['simulationClock']) < 1e-9 and paused['resumed']['simulationClock'] > paused['after']['simulationClock'],
           {'phase':paused['frozen']['phase'],'speedAfter':paused['after']['visualBudget'],'clock':paused['after']['simulationClock'],'resumed':paused['resumed']['simulationClock']})

    # Pause exactly in a packet-break transition and prove the transition deadline freezes.
    fresh(page)
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    packet_pause = page.evaluate('''()=>{
      let guard=0;
      while(guard++<500&&RizoRuntimeQA.defensePhaseForQA().phase!=='packet-break')RizoRuntimeQA.defenseTickForQA(.033);
      const reached=RizoRuntimeQA.defensePhaseForQA();
      const before=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defensePauseForQA(true);
      for(const speed of [2,.5,2,1,.5,2])RizoRuntimeQA.defenseSetSpeedForQA(speed);
      for(let i=0;i<90;i++)RizoRuntimeQA.defenseTickForQA(.033);
      const held=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defensePauseForQA(false);
      const resumed=RizoRuntimeQA.defensePhaseForQA();
      for(let i=0;i<120;i++)RizoRuntimeQA.defenseTickForQA(.033);
      const after=RizoRuntimeQA.defensePhaseForQA();
      return {guard,reached,before,held,resumed,after};
    }''')
    record('pause during packet-break freezes the transition and resumes the same phase', packet_pause['reached']['phase'] == 'packet-break' and packet_pause['held']['phase'] == 'paused' and abs(packet_pause['held']['simulationClock']-packet_pause['before']['simulationClock']) < 1e-9 and packet_pause['resumed']['phase'] == 'packet-break' and packet_pause['after']['phase'] != 'paused',
           {'reached':packet_pause['reached']['phase'],'heldClock':packet_pause['held']['simulationClock'],'resume':packet_pause['resumed']['phase'],'after':packet_pause['after']['phase']})

    # Upgrade/sell edge ordering: combat sell must fail; max upgrade spam must not overspend.
    fresh(page)
    economy = page.evaluate('''()=>{
      RizoRuntimeQA.defenseSetCashForQA(100000);
      const start=RizoRuntimeQA.defenseSnapshotForQA();
      const towerId=start.towers[0].id;
      for(let i=0;i<3;i++)RizoRuntimeQA.defenseBuyUpgradeForQA(towerId);
      RizoRuntimeQA.defenseDoctrineForQA('power');
      for(let i=0;i<30;i++)RizoRuntimeQA.defenseBuyUpgradeForQA(towerId);
      const maxed=RizoRuntimeQA.defenseSnapshotForQA();
      const cashAtMax=maxed.cash;
      for(let i=0;i<20;i++)RizoRuntimeQA.defenseBuyUpgradeForQA(towerId);
      const afterSpam=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defenseStartWaveForQA();
      const soldCombat=RizoRuntimeQA.defenseSellForQA();
      const during=RizoRuntimeQA.defenseSnapshotForQA();
      RizoRuntimeQA.defensePauseForQA(true);
      const soldPaused=RizoRuntimeQA.defenseSellForQA();
      const paused=RizoRuntimeQA.defenseSnapshotForQA();
      return {maxed,afterSpam,cashAtMax,soldCombat,soldPaused,during,paused};
    }''')
    record('upgrade spam stops at max level without extra charges', economy['maxed']['towers'][0]['upgrade'] == 4 and economy['afterSpam']['towers'][0]['upgrade'] == 4 and abs(economy['afterSpam']['cash']-economy['cashAtMax']) < 1e-9 and economy['afterSpam']['cash'] >= 0,
           {'upgrade':economy['afterSpam']['towers'][0]['upgrade'],'cash':economy['afterSpam']['cash']})
    record('sell is rejected during combat and paused combat', economy['soldCombat'] is False and economy['soldPaused'] is False and len(economy['paused']['towers']) == 1,
           {'combat':economy['soldCombat'],'paused':economy['soldPaused'],'towers':len(economy['paused']['towers'])})

    # Planning sell refund may happen once only.
    fresh(page)
    sell_once = page.evaluate('''()=>{
      RizoRuntimeQA.defenseSetCashForQA(10000);
      const tower=RizoRuntimeQA.defenseSnapshotForQA().towers[0];
      RizoRuntimeQA.defenseBuyUpgradeForQA(tower.id);
      const before=RizoRuntimeQA.defenseSnapshotForQA();
      const first=RizoRuntimeQA.defenseSellForQA();
      const after=RizoRuntimeQA.defenseSnapshotForQA();
      const second=RizoRuntimeQA.defenseSellForQA();
      const final=RizoRuntimeQA.defenseSnapshotForQA();
      return {before,first,after,second,final};
    }''')
    record('sell spam cannot duplicate a refund', sell_once['first'] is True and sell_once['second'] is False and len(sell_once['after']['towers']) == 0 and abs(sell_once['final']['cash']-sell_once['after']['cash']) < 1e-9,
           {'first':sell_once['first'],'second':sell_once['second'],'cash':sell_once['final']['cash']})

    # Completion itself must also be idempotent if event handlers or a merge call it twice.
    fresh(page)
    complete_spam = page.evaluate('''()=>{
      const first=RizoRuntimeQA.defenseCompleteWaveForQA(1);
      const afterFirst=RizoRuntimeQA.defenseSnapshotForQA();
      const repeats=Array.from({length:20},()=>RizoRuntimeQA.defenseTryCompleteWaveForQA());
      const afterSpam=RizoRuntimeQA.defenseSnapshotForQA();
      return {first,afterFirst,repeats,afterSpam};
    }''')
    record('wave-complete spam cannot duplicate wave gold or clear credit', complete_spam['first']['completed'] is True and all(not row['completed'] for row in complete_spam['repeats']) and complete_spam['afterSpam']['clearedWave'] == 1 and abs(complete_spam['afterSpam']['cash']-complete_spam['afterFirst']['cash']) < 1e-9,
           {'cleared':complete_spam['afterSpam']['clearedWave'],'cash':complete_spam['afterSpam']['cash'],'repeatAccepts':sum(1 for row in complete_spam['repeats'] if row['completed'])})

    # Bank/end spam must grant permanent rewards exactly once.
    fresh(page)
    bank = page.evaluate('''()=>{
      RizoRuntimeQA.defenseCompleteWaveForQA(1);
      const before=RizoRuntimeQA.snapshot();
      const calls=Array.from({length:12},()=>RizoRuntimeQA.defenseEndRunForQA('banked'));
      return {before,calls};
    }''')
    page.wait_for_timeout(900)
    after_state = page.evaluate('RizoRuntimeQA.snapshot()')
    after_records = page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    history_delta = len(after_records['history']) - len(bank['before']['scores'].get('defenseHistory', []))
    games_delta = after_state['meta']['totalGames'] - bank['before']['meta']['totalGames']
    ember_delta = after_state['wallet']['embers'] - bank['before']['wallet']['embers']
    record('bank/end spam grants one run record and one permanent reward event', sum(1 for value in bank['calls'] if value) == 1 and history_delta == 1 and games_delta == 1 and ember_delta > 0,
           {'accepted':sum(1 for value in bank['calls'] if value),'historyDelta':history_delta,'gamesDelta':games_delta,'embersDelta':ember_delta})

    # Restart immediately while cinematic/upgrade effects have queued cleanup callbacks.
    fresh(page)
    restart = page.evaluate('''()=>{
      RizoRuntimeQA.defenseSetCashForQA(10000);
      const id=RizoRuntimeQA.defenseSnapshotForQA().towers[0].id;
      RizoRuntimeQA.defenseBuyUpgradeForQA(id);
      RizoRuntimeQA.defenseMomentForQA('clear',{duration:1200,title:'HOSTILE RESTART'});
      RizoRuntimeQA.finishMiniGame(true,null,{discard:true});
      return RizoRuntimeQA.miniSnapshot();
    }''')
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    page.wait_for_timeout(1650)
    restart_after = page.evaluate('''()=>({mini:RizoRuntimeQA.miniSnapshot(),snap:RizoRuntimeQA.defenseSnapshotForQA(),effects:document.querySelectorAll('.defense-upgrade-burst').length})''')
    record('restart during queued effects cannot poison the next Defense run', restart_after['mini']['active'] and restart_after['mini']['mode'] == 'defense' and restart_after['snap']['currentWave'] == 0 and restart_after['effects'] == 0,
           {'active':restart_after['mini']['active'],'mode':restart_after['mini']['mode'],'wave':restart_after['snap']['currentWave'],'effects':restart_after['effects']})

    # Checkpoint scheduler corruption: signed internal contradictions must normalize safely.
    fresh(page)
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    page.evaluate('RizoRuntimeQA.defenseSpawnForQA("shell",.3,100,100)')
    base = page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("hostile-base")')

    duplicate = json.loads(json.dumps(base))
    duplicate['enemies'].append(json.loads(json.dumps(duplicate['enemies'][0])))
    duplicate['enemies'][-1]['progress'] = .7
    dup_norm = page.evaluate('''raw=>{const signed=RizoRuntimeQA.defenseSignCheckpointForQA(raw);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(signed)}''', duplicate)
    dup_ids = [enemy['id'] for enemy in dup_norm['enemies']]
    record('checkpoint normalization canonicalizes duplicate enemy ids', len(dup_ids) == len(set(dup_ids)), dup_ids)

    bad_index = json.loads(json.dumps(base))
    bad_index['packetIndex'] = 999
    bad_index['packetEnemyIndex'] = 999
    idx_norm = page.evaluate('''raw=>{const signed=RizoRuntimeQA.defenseSignCheckpointForQA(raw);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(signed)}''', bad_index)
    remaining_packet_count = sum(len(packet['enemies']) for packet in idx_norm['wavePackets'][idx_norm['packetIndex']+1:]) if idx_norm['packetIndex'] < len(idx_norm['wavePackets']) else 0
    if idx_norm['packetIndex'] < len(idx_norm['wavePackets']):
        remaining_packet_count += max(0, len(idx_norm['wavePackets'][idx_norm['packetIndex']]['enemies']) - idx_norm['packetEnemyIndex'])
    record('checkpoint normalization repairs impossible packet indexes without losing queued threats', idx_norm['packetIndex'] <= len(idx_norm['wavePackets']) and remaining_packet_count == len(idx_norm['spawnQueue']),
           {'packetIndex':idx_norm['packetIndex'],'packetEnemyIndex':idx_norm['packetEnemyIndex'],'packets':len(idx_norm['wavePackets']),'schedulerRemaining':remaining_packet_count,'spawnQueue':len(idx_norm['spawnQueue'])})

    bad_counts = json.loads(json.dumps(base))
    bad_counts['waveResolved'] = 999999
    bad_counts['waveTotal'] = 0
    count_norm = page.evaluate('''raw=>{const signed=RizoRuntimeQA.defenseSignCheckpointForQA(raw);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(signed)}''', bad_counts)
    outstanding = len(count_norm['spawnQueue']) + len(count_norm['childSpawnQueue']) + len(count_norm['enemies'])
    record('checkpoint normalization keeps wave resolution counts internally possible', count_norm['waveResolved'] + outstanding <= count_norm['waveTotal'],
           {'resolved':count_norm['waveResolved'],'outstanding':outstanding,'total':count_norm['waveTotal']})

    skipped = json.loads(json.dumps(base))
    skipped['spawnQueue'] = []
    skipped['packetIndex'] = len(skipped['wavePackets'])
    skipped['packetEnemyIndex'] = 0
    skipped['enemies'] = []
    skipped['projectiles'] = []
    skipped['waveResolved'] = 0
    skipped['waveTotal'] = max(1, skipped['waveTotal'])
    skip_signed = page.evaluate('(raw)=>RizoRuntimeQA.defenseSignCheckpointForQA(raw)', skipped)
    page.evaluate('(raw)=>RizoRuntimeQA.defenseRestoreCheckpointForQA(raw)', skip_signed)
    page.evaluate('RizoRuntimeQA.defensePauseForQA(false)')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.25)')
    skip_after = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('missing unresolved threats cannot auto-credit a wave after restore', skip_after['clearedWave'] == 0,
           {k:skip_after[k] for k in ['currentWave','clearedWave','phase','waveTotal','waveResolved']})

    # Phase/progress contradictions are dangerous because start/completion can otherwise skip waves.
    fresh(page)
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    phase_base = page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("hostile-phase")')

    unfinished_noncombat = json.loads(json.dumps(phase_base))
    unfinished_noncombat.update({'phase':'wave-complete','currentWave':1,'clearedWave':0})
    unfinished_signed = page.evaluate('(raw)=>RizoRuntimeQA.defenseSignCheckpointForQA(raw)', unfinished_noncombat)
    unfinished_norm = page.evaluate('(raw)=>RizoRuntimeQA.defenseNormalizeCheckpointForQA(raw)', unfinished_signed)
    page.evaluate('(raw)=>RizoRuntimeQA.defenseRestoreCheckpointForQA(raw)', unfinished_signed)
    start_after_bad_phase = page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    unfinished_after = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('unfinished checkpoint mislabeled noncombat is forced paused and cannot skip a wave', unfinished_norm['phase'] == 'paused' and unfinished_norm['currentWave'] == 1 and unfinished_norm['clearedWave'] == 0 and unfinished_after['currentWave'] == 1 and unfinished_after['clearedWave'] == 0,
           {'normalizedPhase':unfinished_norm['phase'],'startReturn':start_after_bad_phase,'current':unfinished_after['currentWave'],'cleared':unfinished_after['clearedWave']})

    wave_gap = json.loads(json.dumps(phase_base))
    wave_gap.update({'phase':'combat','currentWave':10,'clearedWave':0})
    gap_norm = page.evaluate('''raw=>{const signed=RizoRuntimeQA.defenseSignCheckpointForQA(raw);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(signed)}''', wave_gap)
    record('checkpoint cannot jump reached progress more than one wave past cleared progress', gap_norm['currentWave'] == gap_norm['clearedWave'] + 1,
           {'current':gap_norm['currentWave'],'cleared':gap_norm['clearedWave'],'phase':gap_norm['phase']})

    cleared_combat = json.loads(json.dumps(phase_base))
    cleared_combat.update({'phase':'combat','currentWave':1,'clearedWave':1})
    cleared_norm = page.evaluate('''raw=>{const signed=RizoRuntimeQA.defenseSignCheckpointForQA(raw);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(signed)}''', cleared_combat)
    record('stale combat payload for an already-cleared wave is stripped instead of deadlocking', cleared_norm['phase'] == 'wave-complete' and len(cleared_norm['spawnQueue']) == 0 and len(cleared_norm['enemies']) == 0 and cleared_norm['waveTotal'] == 0 and cleared_norm['waveResolved'] == 0,
           {'phase':cleared_norm['phase'],'queue':len(cleared_norm['spawnQueue']),'enemies':len(cleared_norm['enemies']),'total':cleared_norm['waveTotal']})

    # Hard endless-range cap: after the last supported wave is cleared, spam start must not replay it for credit.
    # Read the ceiling from the runtime: the endless ceiling was raised from 250 to
    # 9,999 by the enemy/endless layer, and the invariant under test is the ceiling
    # itself, not that particular number.
    fresh(page)
    ceiling = page.evaluate('RizoRuntimeQA.defenseCoreForQA().limits.MAX_SUPPORTED_WAVE')
    page.evaluate('w=>RizoRuntimeQA.defenseForceWaveForQA(w)', ceiling)
    page.evaluate('w=>RizoRuntimeQA.defenseCompleteWaveForQA(w)', ceiling)
    page.evaluate('RizoRuntimeQA.defenseTickForQA(1)')
    max_before = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('Array.from({length:12},()=>RizoRuntimeQA.defenseStartWaveForQA())')
    max_after = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('max supported wave cannot be replay-started after it is cleared', max_before['clearedWave'] == ceiling and max_after['clearedWave'] == ceiling and max_after['phase'] == 'wave-complete' and max_after['currentWave'] == ceiling,
           {'before':{k:max_before[k] for k in ['currentWave','clearedWave','phase']},'after':{k:max_after[k] for k in ['currentWave','clearedWave','phase']}})

    # Endless-range planning at the supported ceiling stays bounded before runtime stress.
    fresh(page)
    endless_plans = page.evaluate('''()=>[50,100,150,200,249,250].map(w=>RizoRuntimeQA.defensePlanForQA(w))''')
    record('late/endless-range authored plans stay inside the hard planned-enemy budget', all(row['total'] <= 46 and len(row['packets']) <= 12 for row in endless_plans),
           [{'wave':row['wave'],'total':row['total'],'packets':len(row['packets'])} for row in endless_plans])

    # High-wave density/performance stress under repeated speed switching.
    fresh(page)
    page.evaluate('RizoRuntimeQA.defenseLoadQueueForQA(64,"shell",249,2)')
    for i in range(180):
        if i % 20 == 0:
            page.evaluate('(s)=>RizoRuntimeQA.defenseSetSpeedForQA(s)', [2,1,.5,2][(i//20)%4])
        page.evaluate('RizoRuntimeQA.defenseTickForQA(.033)')
    stress = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('late-wave stress respects active-enemy and catch-up budgets', stress['maxActiveEnemiesObserved'] <= stress['densityCap'] and stress['maxCatchUpObserved'] <= 4,
           {'peak':stress['maxActiveEnemiesObserved'],'cap':stress['densityCap'],'catchUp':stress['maxCatchUpObserved'],'projectiles':stress['maxLogicalProjectilesObserved']})

    # Phone resize smoke: preserve viewport-safe critical surfaces and no horizontal document overflow.
    phone_rows = []
    for width, height in [(320,568),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('RizoRuntimeQA.syncRuntimeViewportForQA()')
        row = page.evaluate('''()=>{const shell=document.querySelector('.defense-shell'),stage=document.querySelector('.defense-stage-frame'),run=document.querySelector('[data-defense-run-control]');const r=n=>n?({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}):null;return{inner:[innerWidth,innerHeight],scroll:document.documentElement.scrollWidth,shell:r(shell),stage:r(stage),run:r(run)}}''')
        phone_rows.append(row)
    phone_ok = all(row['scroll'] <= row['inner'][0] + 2 and row['shell'] and row['shell']['w'] > 0 and row['stage'] and row['stage']['w'] > 0 and row['run'] and row['run']['w'] >= 40 and row['run']['h'] >= 40 for row in phone_rows)
    record('phone-size resizes keep critical Defense surfaces usable without horizontal overflow', phone_ok, phone_rows)

    record('hostile-order browser run has no runtime errors', not errors, '; '.join(errors[:8]))
    browser.close()

report = {"passed": sum(row['passed'] for row in results), "failed": sum(not row['passed'] for row in results), "results": results}
(ROOT / 'reports').mkdir(exist_ok=True)
(ROOT / 'reports' / 'worker-j-hostile-order.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f"\n{report['passed']}/{len(results)} hostile-order checks passed.")
if report['failed']:
    raise SystemExit(1)
