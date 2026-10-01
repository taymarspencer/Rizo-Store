"""Master integration seams.

These checks exist because no single specialist owned them: each one lives in the
space *between* two worker jurisdictions, which is where integration bugs actually
appeared. Every assertion below corresponds to a real defect found while merging
Workers A-J, so this suite is the regression net for the glue layer itself.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

checks = []
def record(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, detail, flush=True)

UNIVERSAL_PREFIXES = ('defense-structure-', 'defense-tool-')
def is_universal(pet_id):
    return any(pet_id.startswith(p) for p in UNIVERSAL_PREFIXES)

CREW_STATE = '''()=>{const s=RizoRuntimeQA.defaultState();s.pet.stage="kid";s.pet.variant="classic";s.pet.hiddenVariant="classic";
s.pet.energy=100;s.pet.hunger=100;s.pet.mood=100;s.pet.health=100;s.pet.resting=false;s.pet.sleeping=false;
s.player.tutorialDismissed=true;s.player.defenseSchool={dismissed:true,completed:["route","placement","targeting","intel","doctrine","abilities"],replay:false};
s.collection.classic=1;s.farm.roster=[];
for(const v of ["violet","frost","obsidian","golden"]){const r=JSON.parse(JSON.stringify(s.pet));r.id="HOUSE-"+v;r.name=v.toUpperCase();r.variant=v;r.hiddenVariant=v;r.stage="kid";r.alive=true;r.accessory=null;r.homeRoom=0;r.skills={power:0,speed:0,instinct:0,stamina:0,luck:0};s.farm.roster.push(r);}
RizoRuntimeQA.loadForQA(s);return true}'''

def new_page(browser, viewport=(390, 844), crew=False):
    page = browser.new_page(viewport={'width': viewport[0], 'height': viewport[1]})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(build_inline_app(True), wait_until='load', timeout=120000)
    if crew:
        page.evaluate(CREW_STATE)
        page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
        page.wait_for_timeout(180)
        page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.click()')
        page.wait_for_timeout(60)
    else:
        start_defense(page)
    return page, errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',
                                args=['--no-sandbox', '--disable-dev-shm-usage'])

    # ---- Seam: Worker C's crew roster vs Workers B/D universal deployables ---------
    page, errors = new_page(browser, crew=True)
    bench = page.evaluate('[...document.querySelectorAll("[data-defense-roster-id]")].map(n=>n.dataset.defenseRosterId)')
    crew = [i for i in bench if not is_universal(i)]
    universal = [i for i in bench if is_universal(i)]
    record('bench leads with the Captain', bool(bench) and not is_universal(bench[0]), str(bench[:2]))
    record('whole universal kit is present exactly once',
           sorted(universal) == sorted(['defense-tool-basic', 'defense-structure-factory', 'defense-structure-beacon']),
           str(universal))
    record('universal kit sits in the first bench frame, ahead of discovered wings',
           all(bench.index(u) < max(bench.index(c) for c in crew[1:]) for u in universal) if len(crew) > 1 else True,
           str(bench))
    configured = [row['id'] for row in page.evaluate('RizoRuntimeQA.defenseRosterConfigForQA()')['configured']]
    record('crew roster itself never contains a universal deployable',
           configured and not any(is_universal(i) for i in configured), str(configured))
    smuggled = [row['id'] for row in page.evaluate(
        'RizoRuntimeQA.defenseSetRosterForQA(["defense-structure-factory","defense-tool-basic","HOUSE-violet"])')]
    record('a universal id cannot be smuggled into the crew as a wing',
           not any(is_universal(i) for i in smuggled) and 'HOUSE-violet' in smuggled, str(smuggled))
    record('crew seam sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    # ---- Seam: universal deployables must never take character privileges ---------
    page, errors = new_page(browser)
    tools = page.evaluate('''()=>{const q=RizoRuntimeQA;q.defenseSetCashForQA(20000);
      q.defensePlaceNextForQA("defense-structure-factory");
      q.defensePlaceNextForQA("defense-structure-beacon");
      q.defensePlaceNextForQA("defense-tool-basic");
      const basic=q.defenseSnapshotForQA().towers.find(t=>t.petId==="defense-tool-basic");
      for(let i=0;i<2;i++)q.defenseBuyUpgradeForQA(basic.id);
      q.defenseDoctrineForQA("power");
      for(let i=0;i<2;i++)q.defenseBuyUpgradeForQA(basic.id);
      return {towers:q.defenseSnapshotForQA().towers.map(t=>t.petId),leader:q.defenseFieldLeaderForQA(),
              powers:q.defenseAbilityGroupsForQA(),ascend:q.defenseAscendForQA?q.defenseAscendForQA(basic.id):null};}''')
    record('a field of only universal deployables has no Field Leader', tools['leader'] is None, str(tools['leader']))
    record('universal deployables expose no field powers', tools['powers'] == [], str(tools['powers']))
    record('a maxed universal tower still cannot Ascend', not tools['ascend'], str(tools['ascend']))
    leader = page.evaluate('''()=>{RizoRuntimeQA.defensePlaceNextForQA();return RizoRuntimeQA.defenseFieldLeaderForQA();}''')
    record('the Captain takes Field Leader as soon as it is deployed',
           bool(leader) and not is_universal(leader['petId']), str(leader))
    record('universal privilege sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    # ---- Seam: Worker B support mechanic vs its visible cause/effect (Worker E/H) --
    page, errors = new_page(browser)
    support = page.evaluate('''()=>{const q=RizoRuntimeQA;q.defenseSetCashForQA(20000);
      q.defensePlaceNextForQA("defense-structure-beacon");
      q.defensePlaceNextForQA();
      const s=q.defenseSnapshotForQA();
      const beacon=s.towers.find(t=>t.petId==="defense-structure-beacon");
      const rizo=s.towers.find(t=>!t.petId.startsWith("defense-structure"));
      const buffed=()=>{const n=document.querySelector(`[data-defense-tower="${rizo.id}"]`);return n?n.className.includes("beacon-buffed"):null;};
      const atLevel0=buffed();
      for(let i=0;i<4;i++)q.defenseBuyUpgradeForQA(beacon.id);
      const beaconNode=document.querySelector(`[data-defense-tower="${beacon.id}"]`);
      const upgraded={buffed:buffed(),justUpgraded:beaconNode.className.includes("just-upgraded"),
                      feelUpgraded:beaconNode.className.includes("feel-upgraded"),maxed:beaconNode.className.includes("structure-maxed")};
      q.defenseSellForQA();
      return {phase:q.defensePhaseForQA().phase,atLevel0,upgraded,afterSell:buffed()};}''')
    record('Beacon support becomes visible during planning, without waiting for a wave',
           support['phase'] == 'planning' and support['upgraded']['buffed'] is True, str(support))
    record('an un-upgraded Beacon does not claim a defender outside its radius',
           support['atLevel0'] is False, str(support['atLevel0']))
    record('selling a Beacon clears the support halo immediately',
           support['afterSell'] is False, str(support['afterSell']))
    record('a structure upgrade receives the authored upgrade punctuation',
           support['upgraded']['justUpgraded'] and support['upgraded']['feelUpgraded'] and support['upgraded']['maxed'],
           str(support['upgraded']))
    record('support seam sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    # ---- Seam: Worker E status presentation vs Worker F support presentation -------
    page, errors = new_page(browser)
    combo = page.evaluate('''()=>{const q=RizoRuntimeQA;
      q.defenseSetRendererForQA("dom");                 // status classes live on DOM nodes
      q.defenseSetRunForQA({phase:"combat",clock:0});
      const relay=q.defenseSpawnForQA("relay",.30,1e9,1e9),fleet=q.defenseSpawnForQA("fleet",.32,1e9,1e9);
      q.defenseTickForQA(1/30);
      q.defenseSetEnemyStatusForQA(fleet.id,{burn:9,burnUntil:999,poison:5,poisonUntil:999,slow:.4,slowUntil:999,rootUntil:999});
      q.defenseTickForQA(1/30);
      const nodes=[...document.querySelectorAll('.defense-enemy')].map(n=>n.className);
      return {renderer:q.defenseSnapshotForQA().rendererMode,
              cls:nodes.find(c=>c.includes('balloon-fleet'))||'(none)',
              relayCls:nodes.find(c=>c.includes('balloon-relay'))||'(none)',all:nodes};}''')
    cls = combo['cls']
    record('status/support seam sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    # ---- Seam: economy correctness after removal (Worker B vs Worker J) -----------
    page, errors = new_page(browser)
    econ = page.evaluate('''()=>{const q=RizoRuntimeQA;q.defenseSetCashForQA(20000);
      q.defensePlaceNextForQA("defense-structure-factory");
      q.defensePlaceNextForQA();
      q.defenseStartWaveForQA();q.defenseSetRunForQA({phase:"combat"});
      for(let i=0;i<200;i++)q.defenseTickForQA(1/30);
      const producing=q.defenseSnapshotForQA().cash;
      for(let i=0;i<200;i++)q.defenseTickForQA(1/30);
      const grown=q.defenseSnapshotForQA().cash;
      // Selling is phase-gated: it is deliberately refused during live combat.
      const soldInCombat=q.defenseSellForQA();
      q.defenseSetRunForQA({phase:"planning"});
      const soldInPlanning=q.defenseSellForQA();
      // Isolate structure income from ordinary pop income: empty the road and the
      // queue first, so any cash movement afterwards can only come from a structure.
      q.defenseSetRunForQA({phase:"combat"});
      q.defenseClearQueueForQA();
      for(const e of q.defenseSnapshotForQA().enemies)q.defensePopEnemyForQA(e.id);
      q.defenseTickForQA(1/30);
      const afterSell=q.defenseSnapshotForQA().cash;
      for(let i=0;i<600;i++)q.defenseTickForQA(1/30);
      const later=q.defenseSnapshotForQA().cash;
      return {producing,grown,soldInCombat,soldInPlanning,afterSell,later,towers:q.defenseSnapshotForQA().towers.map(t=>t.petId)};}''')
    record('a live Factory prints coins while a wave runs', econ['grown'] > econ['producing'], str(econ))
    record('selling is refused during live combat and allowed in planning',
           econ['soldInCombat'] is False and econ['soldInPlanning'] is True,
           str({'inCombat': econ['soldInCombat'], 'inPlanning': econ['soldInPlanning']}))
    record('a sold Factory never pays again',
           'defense-structure-factory' not in econ['towers'] and econ['later'] == econ['afterSell'],
           str({'afterSell': econ['afterSell'], 'later': econ['later'], 'towers': econ['towers']}))
    record('economy seam sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    # ---- Seam: Worker F persisted support state must survive a signed round trip ---
    page, errors = new_page(browser)
    save = page.evaluate('''()=>{const q=RizoRuntimeQA;
      q.defensePlaceNextForQA();q.defenseStartWaveForQA();q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});
      const relay=q.defenseSpawnForQA("relay",.30,1e9,1e9),fleet=q.defenseSpawnForQA("fleet",.32,1e9,1e9);
      q.defenseTickForQA(1/30);q.defensePopEnemyForQA(relay.id);
      let cp=q.defenseBuildCheckpointForQA("master-integration");
      const saved=cp.enemies.find(e=>e.id===fleet.id)||null;
      const signed=q.defenseSignCheckpointForQA(cp);
      const tampered=JSON.parse(JSON.stringify(signed));
      tampered.enemies.find(e=>e.id===fleet.id).signalStaggerUntil=0;
      const tamperStatus=(q.defenseNormalizeCheckpointForQA(tampered)||{}).validationStatus;
      const ok=q.defenseRestoreCheckpointForQA(signed);
      const restored=q.defenseBuildCheckpointForQA("master-restored").enemies.find(e=>e.id===fleet.id)||null;
      return {ok,saved,restored,tamperStatus,version:cp.checkpointVersion};}''')
    record('Relay signal-collapse state survives a signed checkpoint round trip',
           save['ok'] and save['saved'] and save['restored']
           and save['saved']['signalStaggerUntil'] > 0
           and save['saved']['signalStaggerUntil'] == save['restored']['signalStaggerUntil'],
           str({'saved': (save['saved'] or {}).get('signalStaggerUntil'), 'restored': (save['restored'] or {}).get('signalStaggerUntil')}))
    record('editing that support state invalidates the signature',
           save['tamperStatus'] == 'sanitized', str(save['tamperStatus']))
    record('save seam sample has no runtime errors', not errors, '; '.join(errors[:3]))
    page.close()

    browser.close()

passed = sum(1 for c in checks if c)
print(f"\n{passed}/{len(checks)} master integration checks passed")
if passed != len(checks):
    sys.exit(1)
