"""Focused deterministic-equivalence gates for Rizo Defense.

Usage:
  python tests/browser-worker-j-determinism.py --pair speed   # 1x vs 2x
  python tests/browser-worker-j-determinism.py --pair low     # 2x vs 2x low-power

The canonical browser-first-ten.py remains the broader strategy/style gate.
"""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pair', choices=['speed', 'low'], default='low')
args = parser.parse_args()
checks = []

def check(name, ok, detail=''):
    checks.append((name, bool(ok)))
    print(('PASS' if ok else 'FAIL'), name, detail, flush=True)

def html():
    text = build_inline_app(True, True).replace('mini.frame = requestAnimationFrame(updateMiniFrame);', 'mini.frame = 0;')
    driver = (ROOT / 'tests/defense-slice-driver.js').read_text()
    return text.replace('defenseSnapshotForQA: () =>', driver + '\n    defenseSnapshotForQA: () =>')

def setup(browser):
    page = browser.new_page(viewport={'width':390,'height':844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html())
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(40)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    return page, errors

modes = [('mixed-1x', 1, False), ('mixed-2x', 2, False)] if args.pair == 'speed' else [('mixed-2x', 2, False), ('mixed-2x-low', 2, True)]
reports = {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    for key, speed, low in modes:
        page, errors = setup(browser)
        result = page.evaluate('([speed,low])=>RizoRuntimeQA.defenseSliceDrive("mixed",speed,low)', [speed, low])
        reports[key] = result
        check(key + ' has no runtime errors', not errors, str(errors[:3]))
        check(key + ' resolves all ten authored waves', len(result['waves']) == 10 and all(row['clear'] == row['wave'] and row['resolved'] == row['total'] for row in result['waves']))
        check(key + ' respects gameplay budgets', result['peak'] <= 14 and result['projectiles'] <= 160, str({'peak':result['peak'],'projectiles':result['projectiles']}))
        page.close()
    left, right = modes[0][0], modes[1][0]
    label = '1x and 2x preserve exact gameplay outcomes' if args.pair == 'speed' else 'low-power presentation preserves exact 2x gameplay outcomes'
    check(label, reports[left]['waves'] == reports[right]['waves'])
    browser.close()

(ROOT / 'reports').mkdir(exist_ok=True)
(ROOT / 'reports' / f'worker-j-determinism-{args.pair}.json').write_text(json.dumps(reports, indent=2) + '\n', encoding='utf-8')
print(f"\n{sum(ok for _,ok in checks)}/{len(checks)} Worker J determinism ({args.pair}) checks passed.")
raise SystemExit(0 if all(ok for _,ok in checks) else 1)
