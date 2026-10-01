#!/usr/bin/env python3
"""Static merge-safety audit for Rizo Defense.

This does not require future Worker A-I implementations. It guards the live seams
those implementations are expected to attach to, plus the save/reward/lifecycle
invariants that must survive integration.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
GAME = (ROOT / 'game-v79-defense.js').read_text(encoding='utf-8')
CORE = (ROOT / 'defense-core-v79.js').read_text(encoding='utf-8')
INDEX = (ROOT / 'index.html').read_text(encoding='utf-8')
SW = (ROOT / 'sw.js').read_text(encoding='utf-8')

checks = []
def check(name, condition, detail=''):
    checks.append({'name': name, 'pass': bool(condition), 'detail': detail})

# Deployment / boot anchors.
core_pos = INDEX.find('defense-core-v79.js')
canvas_pos = INDEX.find('defense-canvas-v79.js')
game_pos = INDEX.find('game-v79-defense.js')
check('deployment root contains index.html', (ROOT / 'index.html').is_file())
check('Defense scripts load core before canvas/game', -1 < core_pos < canvas_pos < game_pos, f'{core_pos},{canvas_pos},{game_pos}')
check('service worker remains present', (ROOT / 'sw.js').is_file() and 'serviceWorker' in INDEX + GAME + SW)

# Single authoritative live registries / systems. Multiple definitions are a merge-danger signal.
for symbol in ['DEFENSE_MAPS', 'DEFENSE_ENEMIES', 'DEFENSE_BOSSES', 'DEFENSE_ABILITIES']:
    count = len(re.findall(rf'\bconst\s+{symbol}\s*=', GAME))
    check(f'single canonical {symbol}', count == 1, f'count={count}')
for symbol in ['defenseRoster', 'normalizeDefenseCheckpoint', 'buildDefenseCheckpoint', 'restoreDefenseCheckpoint',
               'startDefenseWave', 'spawnDefenseEnemy', 'updateDefenseProjectiles', 'completeDefenseWave',
               'rewardDefenseRun', 'recordDefenseRun', 'stepDefenseSimulation', 'advanceDefenseFixedFrame']:
    count = len(re.findall(rf'\bfunction\s+{symbol}\s*\(', GAME))
    check(f'single canonical {symbol}()', count == 1, f'count={count}')

# Checkpoint / progression safety anchors.
check('runtime checkpoint version delegates to DefenseCore.VERSION', bool(re.search(r'const\s+DEFENSE_CHECKPOINT_VERSION\s*=\s*DefenseCore\.VERSION', GAME)))
# Every legacy schema must stay explicitly accepted alongside the current one. Derived
# from DefenseCore.VERSION rather than pinned to a literal list, so a deliberate forward
# bump is fine while dropping a legacy version (which would reject real old saves) fails.
_core_version = int(re.search(r'const\s+VERSION\s*=\s*(\d+)', CORE).group(1))
_accepted = re.search(r'\[((?:\d+,)+)DEFENSE_CHECKPOINT_VERSION\]', GAME)
_legacy = [int(v) for v in _accepted.group(1).rstrip(',').split(',')] if _accepted else []
check(f'all legacy checkpoint schemas stay accepted after the v{_core_version} bump',
      bool(_accepted) and _legacy == list(range(1, _core_version)),
      f'accepted={_legacy} current={_core_version}')
check('checkpoint builder enforces projectile cap', '.slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_PROJECTILES).map(shot=>' in GAME)
check('checkpoint normalizer enforces projectile cap', '.slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_PROJECTILES).filter(shot=>' in GAME)
check('checkpoint core budget is 32', bool(re.search(r'MAX_CHECKPOINT_PROJECTILES:\s*32\b', CORE)))
check('current signature includes tactical continuation', 'tacticalContinuation' in CORE and 'signatureVersion>=9' in CORE)
check('permanent rewards use clearedWave', bool(re.search(r'function\s+rewardDefenseRun\([^)]*\)\{[^\n]*clearedWave', GAME)))
check('mastery requires a cleared wave', 'if(clearedWave>0)for(const row of persistentLeaders)' in GAME)
check('guest crew excluded from permanent mastery', '!row.petId.startsWith("defense-crew-")' in GAME)
check('checkpoint enemy ids are canonicalized uniquely', 'const enemyIds=new Set()' in GAME and 'enemyIds.has(id)' in GAME)
check('checkpoint scheduler contradictions are repaired', 'checkpoint-scheduler' in GAME and 'packetRemaining' in GAME)
check('checkpoint reached progress cannot skip cleared waves', 'checkpoint-wave-gap' in GAME and 'clearedWave+1' in GAME)
check('checkpoint stale combat for cleared progress fails safe', 'checkpoint-stale-combat' in GAME)
check('wave completion requires resolution accounting', 'd&&d.waveResolved>=d.waveTotal&&d.packetIndex' in GAME)
check('max supported cleared wave cannot be replay-started', 'd.clearedWave>=DEFENSE_LIMITS.MAX_SUPPORTED_WAVE' in GAME)

# Determinism / performance contracts.
check('simulation remains fixed at 30 Hz', bool(re.search(r'stepHz:\s*30\b', CORE)))
check('catch-up remains bounded at four steps', bool(re.search(r'maxCatchUpSteps:\s*4\b', CORE)))
check('density cap stays quality/speed invariant', 'void low; void speed;' in CORE)
check('low-power mode changes presentation budget', 'lowPresentationHz: 30' in CORE and 'visualBudget' in CORE)

# Lifecycle recovery anchors expected on real mobile/PWA.
for event in ['visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume', 'beforeunload']:
    check(f'lifecycle hook: {event}', event in GAME)
check('runtime has explicit suspend/resume functions', 'function suspendRuntime(' in GAME and 'function resumeRuntime(' in GAME)
check('Defense interruption pause exists', 'function pauseDefenseForInterruption(' in GAME and 'function surfaceDefenseInterruptionPause(' in GAME)

# Integration seams: smoke guards only. They deliberately do not require final Factory/Beacon/etc implementations.
seams = {
    'economy': ['queueDefenseIncome', 'flushDefenseIncome', 'defenseDeployCost', 'defenseUpgradeCost'],
    'roster': ['defenseRoster', 'defenseRosterMarkup', 'updateDefenseRoster'],
    'abilities': ['DEFENSE_ABILITIES', 'defenseAbilityGroups', 'activateDefenseAbilityGroup'],
    'maps': ['DEFENSE_MAPS', 'defenseMapSvgPath', 'defensePlacementAllowed', 'defensePlacementEvaluation'],
    'waves/endless-range': ['defenseWavePlan', 'startDefenseWave', 'createWavePlan'],
    'ui events': ['updateDefenseHud', 'flushDefenseUi', 'defenseContextSurface', 'defenseHandleContextKeydown'],
}
for seam, symbols in seams.items():
    missing = [symbol for symbol in symbols if symbol not in GAME + CORE]
    check(f'integration seam available: {seam}', not missing, 'missing=' + ','.join(missing) if missing else 'anchors=' + ','.join(symbols))

# QA must not leak in production: existing runtime gate is itself a contract.
check('QA namespace remains environment/query gated', bool(re.search(r'const\s+IS_QA_BUILD\s*=.*URLSearchParams.*get\("qa"\).*==="1"', GAME)) and 'if(IS_QA_BUILD)window.RizoRuntimeQA=' in GAME)

future_probe = {
    'factory_named_in_baseline': bool(re.search(r'\bFactory\b|\bFACTORY\b', GAME)),
    'beacon_named_in_baseline': bool(re.search(r'\bBeacon\b|\bBEACON\b', GAME)),
    'explicit_endless_mode_named_in_baseline': bool(re.search(r'\bendless\b', GAME, re.I)),
    'interactive_map_hook_named_in_baseline': bool(re.search(r'interactive.{0,16}map|map.{0,16}interaction', GAME, re.I)),
}

report = {
    'worker': 'J',
    'purpose': 'merge-safety static audit; future feature names are informational, not required',
    'checks': checks,
    'future_feature_probe': future_probe,
    'passed': sum(row['pass'] for row in checks),
    'failed': sum(not row['pass'] for row in checks),
}
report_dir = ROOT / 'reports'
report_dir.mkdir(exist_ok=True)
(report_dir / 'worker-j-integration-risk-audit.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

for row in checks:
    print(('PASS' if row['pass'] else 'FAIL'), row['name'], ('- ' + row['detail']) if row['detail'] else '')
print('\nFuture hooks (informational only):', json.dumps(future_probe, sort_keys=True))
print(f"\n{report['passed']}/{len(checks)} Worker J integration checks passed.")
if report['failed']:
    sys.exit(1)
