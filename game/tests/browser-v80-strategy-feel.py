from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def record(name, ok, detail=''):
    checks.append((name,bool(ok),detail)); print(('PASS' if ok else 'FAIL'), name, detail)

def start(page,w=390,h=844):
    page.set_viewport_size({'width':w,'height':h})
    page.set_content(build_inline_app(qa=True,embed_assets=True),wait_until='domcontentloaded')
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(100)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')

def place_next(page, pet_id=None):
    return page.evaluate('(id)=>RizoRuntimeQA.defensePlaceNextForQA(id)', pet_id)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Landscape ownership: controls cannot sit on top of field or roster.
    land=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=2)
    errors=[]; land.on('pageerror',lambda e:errors.append(str(e)))
    start(land,844,390)
    land.evaluate('RizoRuntimeQA.defenseToggleBenchForQA(true)')
    layout=land.evaluate('''()=>{
      const deck=document.querySelector('.defense-command-deck'),stage=document.querySelector('.defense-stage-frame'),world=document.querySelector('#defenseWorld'),card=document.querySelector('[data-defense-roster-id]');
      const rb=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
      const d=rb(deck),s=rb(stage),w=rb(world),c=rb(card),wave=rb(document.querySelector('.defense-stage-frame > .defense-wave-button'));
      const controls=[...document.querySelectorAll('.defense-command-actions button')].filter(n=>getComputedStyle(n).display!=='none').map(rb);
      const controlsInside=controls.every(r=>r.x>=d.x-.5&&r.right<=d.right+.5&&r.y>=d.y-.5&&r.bottom<=d.bottom+.5);
      const waveInside=wave.x>=s.x-.5&&wave.right<=s.right+.5&&wave.y>=s.y-.5&&wave.bottom<=s.bottom+.5;
      const top=document.elementFromPoint(c.x+c.w/2,c.y+c.h/2);
      const rosterOwned=Boolean(top?.closest?.('[data-defense-roster-id]'));
      let stolen=0,total=0;
      for(let yi=1;yi<=5;yi++)for(let xi=1;xi<=5;xi++){
        total++; const x=w.x+w.w*xi/6,y=w.y+w.h*yi/6,hit=document.elementFromPoint(x,y);
        if(hit?.closest?.('.defense-command-actions, .defense-command-deck'))stolen++;
      }
      return{d,s,w,c,wave,controlsInside,waveInside,rosterOwned,stolen,total};
    }''')
    record('landscape command buttons stay inside their deck', layout['controlsInside'], str(layout))
    record('landscape START WAVE owns a dedicated battlefield position', layout['waveInside'], str(layout['wave']))
    record('landscape roster owns its own touch surface', layout['rosterOwned'], str(layout['c']))
    record('landscape command deck steals zero sampled battlefield touches', layout['stolen']==0, f"{layout['stolen']}/{layout['total']}")
    record('landscape strategy pass has no runtime errors', not errors, str(errors))
    land.close()

    # Consumer state: semantic wave intel, field leader, sell confirmation, pause cancellation.
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3)
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    start(page)
    place_next(page); page.evaluate('RizoRuntimeQA.defenseSetCashForQA(100000)'); place_next(page)
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()'); leader=page.evaluate('RizoRuntimeQA.defenseFieldLeaderForQA()')
    record('first placed Rizo remains the Field Leader', leader and leader['id']==snap['towers'][0]['id'], str({'leader':leader,'towers':[t['id'] for t in snap['towers']]}))
    preview=page.locator('#defenseWavePreview').inner_text()
    record('default wave intel hides enemy counts', 'BALLOON' not in preview and 'PACKET' not in preview and 'ARRIVAL' not in preview, preview.replace('\n',' | '))

    page.locator('.defense-tower').first.click(); before=len(page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers'))
    page.locator('[data-defense-sell]').click(); confirm=page.locator('.defense-sell-confirm')
    record('SELL asks for confirmation instead of instantly deleting a Rizo', confirm.count()==1 and len(page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers'))==before, confirm.inner_text().replace('\n',' | ') if confirm.count() else '')
    page.locator('[data-defense-cancel-sell]').click(); record('canceling SELL keeps the Rizo', len(page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers'))==before)

    # Ember Pod aim must be destroyed by pause, not carried through frozen combat.
    page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()'); page.wait_for_timeout(30)
    page.locator('#defenseGateFlameButton').click(); armed_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().gateFlame.armed')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true)'); after_pause=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('pausing cancels an armed Ember Pod placement', armed_before and not after_pause['gateFlame']['armed'] and after_pause['lastInputCancelReason']=='pause', str({'before':armed_before,'after':after_pause['gateFlame'],'reason':after_pause['lastInputCancelReason']}))

    # Tactical power state survives signed checkpoint restore.
    page.evaluate('RizoRuntimeQA.defensePauseForQA(false)')
    first=page.evaluate('RizoRuntimeQA.defenseGateFlameForQA(.43)')
    checkpoint=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("v80-gate")')
    page.evaluate('RizoRuntimeQA.defenseGateFlameForQA(.78)')
    restored_ok=page.evaluate('(cp)=>RizoRuntimeQA.defenseRestoreCheckpointForQA(cp)',checkpoint)
    restored=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().gateFlame')
    record('Ember Pod cooldown and position survive checkpoint restore', restored_ok and abs(restored['readyAt']-first['readyAt'])<1e-6 and abs(restored['until']-first['until'])<1e-6 and abs(restored['progress']-first['progress'])<1e-6, str({'first':first,'restored':restored}))
    record('consumer-state strategy pass has no runtime errors', not errors, str(errors))
    page.close()

    # Heavy threats replace slots rather than increasing density.
    planp=browser.new_page(viewport={'width':390,'height':844})
    start(planp)
    plan=planp.evaluate('RizoRuntimeQA.defensePlanForQA(40)')
    types=[]
    for packet in plan['packets']:
        for item in packet['enemies']:
            types.append(item.get('type') if isinstance(item,dict) else item)
    record('late waves contain durable Ceramic/Lead-style threats', 'brick' in types and 'lead' in types, str({'total':plan['total'],'types':sorted(set(types))}))
    record('heavy threats preserve the bounded enemy-count budget', plan['total']<=46 and len(types)==plan['total'], str({'total':plan['total'],'flattened':len(types)}))
    planp.close()

    # Super Rizo: 10 same copies collapse into one explicit capstone.
    sup=browser.new_page(viewport={'width':768,'height':1024},device_scale_factor=2)
    sup_errors=[]; sup.on('pageerror',lambda e:sup_errors.append(str(e)))
    start(sup,768,1024); sup.evaluate('RizoRuntimeQA.defenseSetCashForQA(1000000)')
    for _ in range(10): place_next(sup)
    before=sup.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    sup.evaluate('RizoRuntimeQA.defenseUpgradeForQA(5)'); sup.evaluate('RizoRuntimeQA.defenseDoctrineForQA("power")')
    leader=sup.evaluate('RizoRuntimeQA.defenseFieldLeaderForQA()')
    ascended=sup.evaluate('(id)=>RizoRuntimeQA.defenseAscendForQA(id)',leader['id'])
    after=sup.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('10 matching Rizos can sacrifice into one Super Rizo', ascended and len(before['towers'])==10 and len(after['towers'])==1 and after['towers'][0].get('superForm')=='power', str({'before':len(before['towers']),'after':after['towers']}))
    record('Super Rizo has an unmistakable upgraded visual class', 'defense-super-power' in (sup.locator('.defense-tower').first.get_attribute('class') or ''), sup.locator('.defense-tower').first.get_attribute('class') or '')
    record('Super Rizo pass has no runtime errors', not sup_errors, str(sup_errors))
    sup.close(); browser.close()

failed=[x for x in checks if not x[1]]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v80 strategy/feel checks passed")
if failed: raise SystemExit(1)
