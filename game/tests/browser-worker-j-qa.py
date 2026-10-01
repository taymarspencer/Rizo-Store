from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

ROOT = Path(__file__).resolve().parents[1]
V86_FIXTURE = json.loads((ROOT / 'tests/fixtures/v86-live-checkpoint.json').read_text())
results = []

def record(name, passed, detail=''):
    results.append({'name': name, 'passed': bool(passed), 'detail': detail})
    print(('PASS' if passed else 'FAIL'), name, detail)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append('pageerror ' + str(e)))
    page.on('console', lambda m: errors.append('console ' + m.type + ' ' + m.text) if m.type == 'error' else None)
    page.set_content(build_inline_app(True), wait_until='load', timeout=120000)
    page.wait_for_timeout(150)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')

    # Runtime builder and normalizer must both enforce the core projectile budget.
    burst = page.evaluate('RizoRuntimeQA.defenseRapidFireForQA(120)')
    cp = page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("worker-j-projectile-cap")')
    limits = page.evaluate('RizoRuntimeQA.defenseCoreForQA()')
    max_checkpoint_projectiles = page.evaluate('RizoDefenseCore.LIMITS.MAX_CHECKPOINT_PROJECTILES')
    record('checkpoint builder caps in-flight projectiles', len(cp['projectiles']) <= max_checkpoint_projectiles and max_checkpoint_projectiles == 32,
           f"logical={burst['logical']} saved={len(cp['projectiles'])} cap={max_checkpoint_projectiles}")

    normalized_count = page.evaluate('''(()=>{
      let c=RizoRuntimeQA.defenseBuildCheckpointForQA("worker-j-normalize-cap");
      const sample=c.projectiles[0];
      if(!sample)return -1;
      c.projectiles=Array.from({length:80},(_,i)=>({...sample,x:Math.min(.99,sample.x+i*.0001)}));
      c=RizoRuntimeQA.defenseSignCheckpointForQA(c);
      const n=RizoRuntimeQA.defenseNormalizeCheckpointForQA(c);
      return n?.projectiles?.length ?? -2;
    })()''')
    record('checkpoint normalizer caps signed oversized projectile payloads', normalized_count == 32, f'normalized={normalized_count}')

    roundtrip = page.evaluate('''(checkpoint)=>{
      const restored=RizoRuntimeQA.defenseRestoreCheckpointForQA(checkpoint);
      const snap=RizoRuntimeQA.defenseSnapshotForQA();
      return {restored, projectiles:snap?.projectiles||[], enemies:(snap?.enemies||[]).map(e=>e.id), towers:(snap?.towers||[]).map(t=>t.id)};
    }''', cp)
    refs_ok = roundtrip['restored'] and len(roundtrip['projectiles']) == len(cp['projectiles']) and all(
        shot['towerId'] in roundtrip['towers'] and shot['targetId'] in roundtrip['enemies'] for shot in roundtrip['projectiles'])
    record('checkpoint round trip restores only referentially valid in-flight projectiles', refs_ok,
           f"saved={len(cp['projectiles'])} restored={len(roundtrip['projectiles'])}")

    # v8 migration remains trusted, while v9 protects newly covered tactical fields.
    migration = page.evaluate('''(()=>{
      let legacy=RizoRuntimeQA.defenseBuildCheckpointForQA("worker-j-v8");
      legacy=RizoRuntimeQA.defenseSignCheckpointForQA(legacy,8);
      legacy.towers[0].abilityReadyAt=(legacy.towers[0].abilityReadyAt||0)+12;
      const migrated=RizoRuntimeQA.defenseNormalizeCheckpointForQA(legacy);
      let current=RizoRuntimeQA.defenseBuildCheckpointForQA("worker-j-v9");
      current.towers[0].abilityReadyAt=(current.towers[0].abilityReadyAt||0)+12;
      const sanitized=RizoRuntimeQA.defenseNormalizeCheckpointForQA(current);
      return {migrated:migrated?.validationStatus, migratedReady:migrated?.towers?.[0]?.abilityReadyAt,
              current:sanitized?.validationStatus, currentReady:sanitized?.towers?.[0]?.abilityReadyAt};
    })()''')
    record('v8 checkpoint remains migratable after v9 schema bump', migration['migrated'] == 'migrated' and migration['migratedReady'] >= 12, str(migration))
    record('v9 tactical timer tamper fails closed', migration['current'] == 'sanitized' and migration['currentReady'] == 0, str(migration))

    real_v86 = page.evaluate('''fixture=>{
      const q=RizoRuntimeQA, realNow=Date.now;
      Date.now=()=>fixture.checkpoint.savedAt+1000;
      try{
        q.loadForQA(fixture.state); q.startMiniGame('defense',{mapId:'grove'});
        const ok=q.defenseRestoreCheckpointForQA(fixture.checkpoint), after=q.defenseBuildCheckpointForQA('worker-j-v86-fixture');
        return {ok, after};
      } finally { Date.now=realNow; }
    }''', V86_FIXTURE)
    original = V86_FIXTURE['checkpoint']; migrated = real_v86['after']
    # Pin the current schema from the runtime rather than a literal: the guard is that a
    # real old signed checkpoint migrates forward intact, not that the schema stays at 9.
    current_version = page.evaluate('RizoRuntimeQA.defenseCoreForQA().version')
    fixture_ok = (real_v86['ok'] and migrated['checkpointVersion'] == current_version and migrated['cash'] == original['cash'] and
                  migrated['currentWave'] == original['currentWave'] and migrated['clearedWave'] == original['clearedWave'] and
                  len(migrated['towers']) == len(original['towers']) and migrated['wavePackets'] == original['wavePackets'] and
                  migrated['spawnQueue'] == original['spawnQueue'])
    record('real v86 signed checkpoint migrates to the current schema without losing run credit/queue state', fixture_ok,
           str({'ok':real_v86['ok'],'version':migrated['checkpointVersion'],'wave':migrated['currentWave'],'cleared':migrated['clearedWave'],'cash':migrated['cash']}))

    # Restore a fresh normal run after the fixture migration before lifecycle checks.
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')

    # Mobile lifecycle interruption must pause simulation and leave an explicit user-resume surface.
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    before = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    suspended = page.evaluate('RizoRuntimeQA.suspendRuntimeForQA("worker-j-background")')
    interrupted = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(1)')
    after_tick = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    resumed_runtime = page.evaluate('RizoRuntimeQA.resumeRuntimeForQA("worker-j-visible")')
    resume_ui = page.evaluate(r'''()=>({state:RizoRuntimeQA.defenseResumeSurfaceForQA(),message:(document.querySelector('#defenseMessage')?.textContent||'').replace(/\s+/g,' ').trim()})''')
    surfaced = resume_ui['state']
    record('runtime suspension auto-pauses active Defense', suspended['changed'] and interrupted['paused'] and interrupted['autoPaused'], str({'before':before['phase'],'interrupted':interrupted['phase'],'suspended':suspended}))
    record('paused interruption does not advance simulation clock', abs(after_tick['simulationClock'] - interrupted['simulationClock']) < 1e-9,
           f"before={interrupted['simulationClock']} after={after_tick['simulationClock']}")
    record('return-to-foreground visibly surfaces the pause without resuming combat', resumed_runtime['changed'] and surfaced['paused'] and not surfaced['autoPaused'] and 'AUTO-PAUSED' in resume_ui['message'] and 'WELCOME BACK' in resume_ui['message'], str({'runtime':resumed_runtime,'surface':surfaced,'message':resume_ui['message']}))

    record('Worker J browser guard has no runtime errors', not errors, '; '.join(errors[:5]))
    browser.close()

report = {'passed': sum(row['passed'] for row in results), 'failed': sum(not row['passed'] for row in results), 'results': results}
(ROOT / 'reports').mkdir(exist_ok=True)
(ROOT / 'reports' / 'worker-j-browser-qa.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f"\n{report['passed']}/{len(results)} Worker J browser QA checks passed.")
if report['failed']:
    raise SystemExit(1)
