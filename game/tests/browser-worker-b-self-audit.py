from pathlib import Path
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_harness import build_inline_app, start_defense

results = []

def record(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), name, detail)


def reset(page, viewport=(390, 844)):
    page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({cash:10000})')


def tick_frames(page, count):
    page.evaluate('(n)=>{for(let i=0;i<n;i++)RizoRuntimeQA.defenseTickForQA(1/60)}', count)


with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append("pageerror " + str(error)))
    page.on("console", lambda message: errors.append("console " + message.type + " " + message.text) if message.type == "error" else None)
    page.set_content(build_inline_app(True), wait_until="load", timeout=120000)

    # Primary Factory path: equal simulation time must be speed-invariant.
    produced_equal = {}
    sim_equal = {}
    for speed, frames in ((1, 480), (2, 240)):
        reset(page)
        page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.20)')
        page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
        page.evaluate(f'RizoRuntimeQA.defenseSetSpeedForQA({speed})')
        tick_frames(page, frames)
        produced_equal[speed] = page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory").totalProduced')
        sim_equal[speed] = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().simulationClock')
    record(
        "Factory income matches at equal simulation time in 1x/2x",
        produced_equal[1] == produced_equal[2] and produced_equal[1] > 0 and abs(sim_equal[1] - sim_equal[2]) <= 0.10,
        f"produced={produced_equal} sim={sim_equal}",
    )

    # Equal real time at 2x should produce twice the simulation opportunity, not a different payout formula.
    produced_real = {}
    for speed in (1, 2):
        reset(page)
        page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.20)')
        page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
        page.evaluate(f'RizoRuntimeQA.defenseSetSpeedForQA({speed})')
        tick_frames(page, 480)
        produced_real[speed] = page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory").totalProduced')
    record(
        "2x Factory income only accelerates through faster simulation time",
        produced_real[1] > 0 and produced_real[2] == produced_real[1] * 2,
        str(produced_real),
    )

    # Real pause path: simulation clock and economy must be frozen throughout the hold.
    reset(page)
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.20);RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
    page.wait_for_timeout(120)
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true)')
    paused_a = page.evaluate('({s:RizoRuntimeQA.defenseSnapshotForQA(),f:RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")})')
    page.wait_for_timeout(700)
    paused_b = page.evaluate('({s:RizoRuntimeQA.defenseSnapshotForQA(),f:RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")})')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(false)')
    tick_frames(page, 480)
    resumed = page.evaluate('({s:RizoRuntimeQA.defenseSnapshotForQA(),f:RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory")})')
    record(
        "Pause freezes Factory clock and payout; resume continues production",
        abs(paused_a["s"]["simulationClock"] - paused_b["s"]["simulationClock"]) < 1e-9
        and paused_a["f"]["totalProduced"] == paused_b["f"]["totalProduced"]
        and resumed["f"]["totalProduced"] > paused_b["f"]["totalProduced"],
        f"clock={paused_a['s']['simulationClock']}->{paused_b['s']['simulationClock']} produced={paused_a['f']['totalProduced']}->{paused_b['f']['totalProduced']}->{resumed['f']['totalProduced']}",
    )

    # Edge case: overlapping Beacon fields select one strongest source instead of multiplying.
    reset(page)
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.35,.14)')
    first = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id')
    for _ in range(4):
        page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{first}")')
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.89,.14)')
    second = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.at(-1).id')
    for _ in range(3):
        page.evaluate(f'RizoRuntimeQA.defenseBuyUpgradeForQA("{second}")')
    page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.59,.14)')
    overlap_factory = page.evaluate('RizoRuntimeQA.defenseStructuresForQA().find(x=>x.type==="factory").factory')
    record(
        "Overlapping Beacons use strongest-field-only support",
        abs(overlap_factory["cadenceMultiplier"] - 0.70) < 1e-9,
        str(overlap_factory),
    )

    # Low-power presentation must keep both structure identities readable rather than deleting the semantic layer.
    low = page.evaluate('RizoRuntimeQA.defenseSetLowPerformanceForQA(true)')
    low_dom = page.evaluate('''() => ({factory:Boolean(document.querySelector('.defense-structure-factory .defense-structure-art')),beacon:Boolean(document.querySelector('.defense-structure-beacon .defense-structure-art')),field:Boolean(document.querySelector('.defense-structure-beacon .defense-structure-field'))})''')
    record("Low-power mode preserves Factory/Beacon semantic art", bool(low["performanceLow"] and low_dom["factory"] and low_dom["beacon"] and low_dom["field"]), str(low_dom))

    # Phone-first audit: structures are intentionally later in the roster but must be reachable, touchable, and inspectable.
    reset(page, (375, 667))
    # Reachability is asserted per card rather than by scrolling to one extreme. The
    # integrated bench is "Captain, universal kit, discovered wings", so the structures
    # are no longer the last two cards and no single scroll position shows both at once.
    # What matters on a phone is that each card can be brought fully into view and is
    # touch-sized, with no document-level horizontal overflow.
    roster = page.evaluate('''() => {
      const host=document.querySelector('#defenseRoster');
      const before={scrollLeft:host.scrollLeft,scrollWidth:host.scrollWidth,clientWidth:host.clientWidth};
      const measure=id=>{const card=document.querySelector(`[data-defense-roster-id="${id}"]`);
        if(!card)return null;
        card.scrollIntoView({block:'nearest',inline:'center'});
        const r=card.getBoundingClientRect();
        return {l:r.left,r:r.right,w:r.width,h:r.height,scrollLeft:host.scrollLeft};};
      const factory=measure('defense-structure-factory');
      const beacon=measure('defense-structure-beacon');
      return {before,after:host.scrollWidth-host.clientWidth,overflow:getComputedStyle(host).overflowX,
              factory,beacon,docW:document.documentElement.scrollWidth,vw:innerWidth};}''')
    roster_ok = (roster["overflow"] == "auto" and roster["after"] > 0
                 and roster["docW"] <= roster["vw"] + 1
                 and roster["factory"] and roster["beacon"]
                 and roster["factory"]["l"] >= -1 and roster["factory"]["r"] <= roster["vw"] + 1
                 and roster["beacon"]["l"] >= -1 and roster["beacon"]["r"] <= roster["vw"] + 1
                 and roster["factory"]["h"] >= 44 and roster["beacon"]["h"] >= 44)
    record("375x667 roster brings each structure card fully into view with touch-size controls", roster_ok, json.dumps(roster))

    for pet_id, node_selector, label in (
        ("defense-structure-factory", ".defense-structure-factory", "Factory"),
        ("defense-structure-beacon", ".defense-structure-beacon", "Beacon"),
    ):
        reset(page, (375, 667))
        page.evaluate(f'RizoRuntimeQA.defensePlaceForQA("{pet_id}",.35,.18)')
        page.locator(node_selector).first.dispatch_event("pointerdown", {"pointerType": "touch", "clientX": 120, "clientY": 250})
        panel = page.evaluate('''() => {const e=document.querySelector('#defenseTowerPanel'),r=e.getBoundingClientRect();return{hidden:e.hidden,l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,docW:document.documentElement.scrollWidth}}''')
        panel_ok = (not panel["hidden"]) and panel["l"] >= -1 and panel["r"] <= panel["vw"] + 1 and panel["docW"] <= panel["vw"] + 1
        record(f"{label} inspect/upgrade panel stays contained on 375x667", panel_ok, json.dumps(panel))

    # Unrelated Defense smoke with Worker B content present.
    reset(page, (390, 844))
    main_count = page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    total_count = page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.89,.14)')
    started = page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    tick_frames(page, 180)
    smoke = page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record(
        "Unrelated Defense combat still launches and advances with structures present",
        main_count >= 1 and total_count >= 2 and started == 1 and smoke["currentWave"] == 1 and smoke["phase"] in ("countdown", "combat", "packet-break", "wave-complete"),
        f"towers={len(smoke['towers'])} enemies={len(smoke['enemies'])} phase={smoke['phase']}",
    )

    record("Worker B self-audit browser path has no runtime errors", not errors, "; ".join(errors[:5]))
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} Worker B self-audit checks passed.")
if passed != len(results):
    raise SystemExit(1)
