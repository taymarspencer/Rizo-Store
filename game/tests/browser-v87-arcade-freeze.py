"""v87 arcade freeze/pause integrity.

Proves that no meaningful gameplay state advances while a run is held, for all
three hold paths (manual pause, background suspension, stacked ad+background),
and that a held run resumes with exactly the delay it had left.
"""
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import sys

results = []
def record(name, passed, detail=''):
    results.append((name, bool(passed)))
    print(('PASS' if passed else 'FAIL'), name, detail)

HOLD = {
    'manual pause':  ('RizoRuntimeQA.arcadePauseForQA()',   'RizoRuntimeQA.arcadeResumeForQA()'),
    'background':    ('RizoRuntimeQA.suspendRuntimeForQA("background")', 'RizoRuntimeQA.resumeRuntimeForQA("visible")'),
    'ad break':      ('document.dispatchEvent(new CustomEvent("rizo:ad-start"))', 'document.dispatchEvent(new CustomEvent("rizo:ad-end"))'),
}

def boot(browser):
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(build_inline_app(True, embed_assets=True), wait_until='load', timeout=120000)
    page.wait_for_timeout(250)
    page.evaluate(SETUP_STATE)
    return page, errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    page, errors = boot(browser)

    # ---------- 1. Lost Signal: the sequence must not advance while held ----------
    # A Memory round is a chain of scheduled jobs: light each rune, then drop
    # memoryShowing so input is accepted. Freezing mid-chain used to let the whole
    # sequence play to the empty screen behind the pause panel.
    for label, (hold, release) in HOLD.items():
        page.evaluate(SETUP_STATE)
        page.evaluate('RizoRuntimeQA.startMiniGame("memory")')
        page.wait_for_timeout(120)          # inside the 500ms pre-roll, before round 1
        before = page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().memory')
        jobs_before = page.evaluate('RizoRuntimeQA.arcadeJobsForQA()')
        page.evaluate(hold)
        page.wait_for_timeout(1400)         # long enough to run the whole round chain
        held = page.evaluate('RizoRuntimeQA.arcadeJobsForQA()')
        during = page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().memory')
        record(f'lost signal: {label} advances no round', during['round'] == before['round'],
               f"round {before['round']} -> {during['round']}")
        record(f'lost signal: {label} advances no sequence', during['sequence'] == before['sequence'],
               f"{before['sequence']} -> {during['sequence']}")
        record(f'lost signal: {label} disarms every scheduled job',
               held['held'] and held['armed'] == 0 and held['count'] > 0,
               f"{held['armed']} armed of {held['count']}, holds={held['holds']}")
        page.evaluate(release)
        page.wait_for_timeout(900)
        after = page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().memory')
        record(f'lost signal: {label} resumes the sequence', after['round'] > before['round'],
               f"round {before['round']} -> {after['round']}")
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(40)

    # ---------- 2. Remaining delay is preserved, not restarted or lost ----------
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("memory")')
    page.wait_for_timeout(60)
    page.evaluate('RizoRuntimeQA.arcadeProbeJobForQA(1000)')
    page.wait_for_timeout(300)
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    banked = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('a held job banks only the delay it had left',
           250 <= banked['remaining'] <= 780 and not banked['fired'],
           f"{banked['remaining']}ms left")
    page.wait_for_timeout(1500)
    still = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('a held job does not fire no matter how long the hold lasts', not still['fired'],
           f"fired={still['fired']} after 1.5s held")
    record('the banked delay does not drain during the hold',
           abs(still['remaining'] - banked['remaining']) < 30,
           f"{banked['remaining']} -> {still['remaining']}")
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    page.wait_for_timeout(400)
    part = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('the released job is still waiting out its remainder', not part['fired'], f"fired={part['fired']} at +400ms")
    page.wait_for_timeout(500)
    done = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('the released job fires once its remainder elapses', done['fired'] and done['count'] == 1,
           f"fired={done['fired']} count={done['count']}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ---------- 3. Stacked ad + background must not release early ----------
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("memory")')
    page.wait_for_timeout(60)
    page.evaluate('RizoRuntimeQA.arcadeProbeJobForQA(600)')
    page.evaluate('document.dispatchEvent(new CustomEvent("rizo:ad-start"))')
    page.evaluate('RizoRuntimeQA.suspendRuntimeForQA("background")')
    stacked = page.evaluate('RizoRuntimeQA.arcadeClockForQA()')
    record('stacked ad + background register two holds',
           stacked['jobHolds'] == ['ad', 'background'] and stacked['sources'] == ['ad', 'background'],
           str(stacked['jobHolds']))
    page.evaluate('RizoRuntimeQA.resumeRuntimeForQA("visible")')
    page.wait_for_timeout(900)
    mid = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    held_mid = page.evaluate('RizoRuntimeQA.arcadeJobsForQA()')
    record('background ending during an ad does not release the queue',
           not mid['fired'] and held_mid['held'] and held_mid['armed'] == 0,
           f"fired={mid['fired']} holds={held_mid['holds']}")
    page.evaluate('document.dispatchEvent(new CustomEvent("rizo:ad-end"))')
    page.wait_for_timeout(900)
    end = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('the last hold to lift releases the queue exactly once',
           end['fired'] and end['count'] == 1, f"count={end['count']}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ...and in the other release order. Registering a job hold only for the
    # first freeze source meant ending the ad released the whole queue while the
    # app was still backgrounded.
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("memory")')
    page.wait_for_timeout(60)
    page.evaluate('RizoRuntimeQA.arcadeProbeJobForQA(600)')
    page.evaluate('document.dispatchEvent(new CustomEvent("rizo:ad-start"))')
    page.evaluate('RizoRuntimeQA.suspendRuntimeForQA("background")')
    page.evaluate('document.dispatchEvent(new CustomEvent("rizo:ad-end"))')
    page.wait_for_timeout(900)
    still_bg = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    holds_bg = page.evaluate('RizoRuntimeQA.arcadeClockForQA()')
    record('an ad ending while still backgrounded does not release the queue',
           not still_bg['fired'] and holds_bg['jobHolds'] == ['background'] and holds_bg['sources'] == ['background'],
           f"fired={still_bg['fired']} holds={holds_bg['jobHolds']}")
    record('the Lost Signal round is still frozen behind the background hold',
           page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().memory.round') == 0)
    page.evaluate('RizoRuntimeQA.resumeRuntimeForQA("visible")')
    page.wait_for_timeout(900)
    done_bg = page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA()')
    record('lifting the final background hold releases it exactly once',
           done_bg['fired'] and done_bg['count'] == 1, f"count={done_bg['count']}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ---------- 4. Rhythm countdown ----------
    # "3 / 2 / 1 / GO" gates scoring via rhythmReady. It used to run to completion
    # behind a pause while the chart clock was credited, landing desynced.
    for label, (hold, release) in HOLD.items():
        page.evaluate(SETUP_STATE)
        page.evaluate('RizoRuntimeQA.startMiniGame("rhythm")')
        page.wait_for_timeout(200)
        record(f'rhythm: countdown has not finished yet ({label})',
               not page.evaluate('RizoRuntimeQA.arcadeStateForQA().rhythmReady'))
        page.evaluate(hold)
        page.wait_for_timeout(3600)         # longer than the whole 3s countdown
        record(f'rhythm: {label} does not run the countdown out',
               not page.evaluate('RizoRuntimeQA.arcadeStateForQA().rhythmReady'))
        page.evaluate(release)
        page.wait_for_timeout(3400)
        record(f'rhythm: countdown completes after {label} lifts',
               page.evaluate('RizoRuntimeQA.arcadeStateForQA().rhythmReady'))
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(40)

    # ---------- 5. Delayed round transitions ----------
    # Ember Forge rebuilds its wall on a 650ms delay; Runaway rebuilds its maze
    # on 520ms. Both are gameplay state changes riding on a scheduled job.
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("breaker")')
    page.wait_for_timeout(200)
    level_before = page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().breaker.level')
    page.evaluate('RizoRuntimeQA.arcadeClearBreakerBoardForQA()')
    page.wait_for_timeout(60)
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    page.wait_for_timeout(1500)
    held_level = page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().breaker')
    record('ember forge: a pending wall rebuild does not land while paused',
           held_level['pattern'] != '' and page.evaluate('RizoRuntimeQA.arcadeJobsForQA().armed') == 0,
           f"armed jobs={page.evaluate('RizoRuntimeQA.arcadeJobsForQA().armed')}")
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    page.wait_for_timeout(900)
    record('ember forge: the wall rebuild lands after resume',
           page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().breaker.level') > level_before,
           f"level {level_before} -> {page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().breaker.level')}")
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ---------- 6. Buffs and invulnerability windows ----------
    # These are absolute now() stamps, so a hold used to burn them in real time.
    for label, (hold, release) in HOLD.items():
        page.evaluate(SETUP_STATE)
        page.evaluate('RizoRuntimeQA.startMiniGame("breaker")')
        page.wait_for_timeout(150)
        page.evaluate('RizoRuntimeQA.arcadeGrantBuffsForQA()')
        before = page.evaluate('RizoRuntimeQA.arcadeDeadlinesForQA()')
        page.evaluate(hold)
        page.wait_for_timeout(1200)
        page.evaluate(release)
        page.wait_for_timeout(30)
        after = page.evaluate('RizoRuntimeQA.arcadeDeadlinesForQA()')
        drift = {k: before[k] - after.get(k, 0) for k in ('breakerBoostUntil', 'breakerPierceUntil')}
        record(f'ember forge buffs survive {label}',
               all(abs(v) < 200 for v in drift.values()), str(drift))
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(40)

    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("glide")')
    page.wait_for_timeout(150)
    page.evaluate('RizoRuntimeQA.arcadeGrantBuffsForQA()')
    before = page.evaluate('RizoRuntimeQA.arcadeDeadlinesForQA()')
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    page.wait_for_timeout(1200)
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    page.wait_for_timeout(30)
    after = page.evaluate('RizoRuntimeQA.arcadeDeadlinesForQA()')
    record('skybound thermal + i-frames survive a pause',
           abs(before.get('glideThermalUntil', 0) - after.get('glideThermalUntil', 0)) < 200
           and abs(before.get('glideInvulnerableUntil', 0) - after.get('glideInvulnerableUntil', 0)) < 200,
           f"thermal {before.get('glideThermalUntil')} -> {after.get('glideThermalUntil')}")
    record('an already-expired deadline is not resurrected by a hold',
           page.evaluate('RizoRuntimeQA.arcadeExpiredDeadlineSurvivesForQA()'))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ---------- 7. Every timed mode: nothing at all moves while held ----------
    for mode in ['power', 'spark', 'forage', 'rush', 'walk', 'memory', 'glide', 'breaker', 'maze']:
        page.evaluate(SETUP_STATE)
        page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")')
        page.wait_for_timeout(300)
        page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
        a = page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
        page.wait_for_timeout(1300)
        b = page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
        record(f'{mode}: no game state advances across a 1.3s pause', a == b,
               '' if a == b else f'{a} != {b}')
        page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
        page.wait_for_timeout(40)
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(40)

    # ---------- 7b. Ember Beat's chart, once the countdown has cleared ----------
    # Rhythm is excluded from the loop above because it needs its lead-in first.
    # Its chart rides performance.now() minus rhythmStartClock, so a hold has to
    # credit the clock and freeze the note stream together or notes jump on resume.
    for label, (hold, release) in HOLD.items():
        page.evaluate(SETUP_STATE)
        page.evaluate('RizoRuntimeQA.startMiniGame("rhythm")')
        page.wait_for_timeout(4200)         # past the 3s countdown, into live notes
        record(f'rhythm: the song is live before the {label} hold',
               page.evaluate('RizoRuntimeQA.arcadeStateForQA().rhythmReady'))
        page.evaluate(hold)
        a = page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
        timing_a = page.evaluate('RizoRuntimeQA.rhythmTimingForQA()')
        page.wait_for_timeout(1300)
        b = page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
        record(f'rhythm: no chart state advances across a {label} hold', a == b,
               '' if a == b else 'chart advanced')
        page.evaluate(release)
        page.wait_for_timeout(60)
        timing_b = page.evaluate('RizoRuntimeQA.rhythmTimingForQA()')
        record(f'rhythm: song position is credited across a {label} hold',
               abs((timing_b['elapsed'] or 0) - (timing_a['elapsed'] or 0)) < 0.25,
               f"elapsed {timing_a['elapsed']:.2f}s -> {timing_b['elapsed']:.2f}s")
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(40)

    # ---------- 8. Defense keeps its own architecture but holds its queue ----------
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense")')
    page.wait_for_timeout(600)
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    dj = page.evaluate('RizoRuntimeQA.arcadeJobsForQA()')
    record('defense: a manual pause holds its scheduled callbacks',
           dj['held'] and dj['armed'] == 0, f"armed={dj['armed']} of {dj['count']}")
    # d.paused is an accessor that drives d.phase to PAUSED, which is what the
    # fixed-step simulation actually gates on. Assert the simulation, not the flag.
    sim_a = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.wait_for_timeout(900)
    sim_b = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('defense: the simulation clock does not advance while paused',
           sim_a['simulationClock'] == sim_b['simulationClock'],
           f"{sim_a['simulationClock']} -> {sim_b['simulationClock']}")
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    page.wait_for_timeout(120)
    dj2 = page.evaluate('RizoRuntimeQA.arcadeJobsForQA()')
    record('defense: resume re-arms them', not dj2['held'])
    record('defense: the run leaves the paused phase on resume',
           page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().phase') != 'paused',
           page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().phase'))
    record('defense run clock is untouched by the shared freeze',
           page.evaluate('RizoRuntimeQA.arcadeClockForQA().endless'))
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    # ---------- 9. Teardown ----------
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("memory")')
    page.wait_for_timeout(150)
    page.evaluate('RizoRuntimeQA.arcadeProbeJobForQA(400)')
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(900)
    record('ending a run cancels its queue instead of leaking timers',
           not page.evaluate('RizoRuntimeQA.arcadeProbeStateForQA().fired')
           and page.evaluate('RizoRuntimeQA.arcadeJobsForQA().count') == 0)

    # ---------- 10. Coverage guard ----------
    # Deadline crediting is discovered by naming convention. If someone adds a
    # new mini.somethingUntil / somethingAt, this fails so they classify it as
    # either a credited run deadline or an explicit exemption.
    EXPECTED_DEADLINES = [
        'breakerBoostUntil', 'breakerPierceUntil', 'breakerResetAt', 'forageRushUntil',
        'glideInvulnerableUntil', 'glideSpawnAt', 'glideThermalUntil', 'glideWindAt',
        'invulnerableUntil', 'mazeHuntUntil', 'mazeHunterWakeAt', 'mazeInvulnerableUntil',
        'powerCallAt', 'powerGuardAt', 'powerGuardUntil', 'powerTapLockUntil',
        'sparkExpiresAt', 'sparkFeverUntil',
    ]
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("breaker")')
    page.wait_for_timeout(150)
    keys = page.evaluate('RizoRuntimeQA.arcadeDeadlineKeysForQA()')
    record('every absolute deadline is accounted for by the credit pass',
           keys == EXPECTED_DEADLINES,
           f"new/unclassified: {sorted(set(keys) ^ set(EXPECTED_DEADLINES))}" if keys != EXPECTED_DEADLINES else '18 keys')
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(40)

    record('no page errors across the freeze suite', not errors, '; '.join(errors[:4]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} v87 arcade freeze checks passed")
sys.exit(1 if failed else 0)
