import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path.cwd()/"tests"))
from browser_harness import build_inline_app, SETUP_STATE

out={"checks":[],"notes":[]}
def rec(name, ok, detail=None):
    out["checks"].append({"name":name,"pass":bool(ok),"detail":detail})
    print(("PASS" if ok else "FAIL"), name, "" if detail is None else detail)

def boot(page,w=390,h=844):
    page.set_viewport_size({"width":w,"height":h})
    page.set_content(build_inline_app(qa=True,embed_assets=True),wait_until="domcontentloaded")
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})')
    page.wait_for_timeout(100)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    page.evaluate('RizoRuntimeQA.defenseSetCashForQA(100000)')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={"width":390,"height":844},device_scale_factor=3)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    boot(page)

    # Invest into the first Rizo and verify the field keeps a readable memory of that investment.
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    tower=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0]')
    page.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"power",remaining:0,phase:"combat"})',tower['id'])
    field_mark=page.evaluate('''()=>{const t=document.querySelector('.defense-tower'),m=t?.querySelector('.defense-power-mark'),before=m?getComputedStyle(m,'::before'):null;return{towerClass:t?.className||'',opacity:m?getComputedStyle(m).opacity:null,glyph:before?.content||'',lit:[...m?.querySelectorAll('i')||[]].map(i=>getComputedStyle(i).backgroundColor)}}''')
    rec('invested Rizo keeps a persistent field progression mark', field_mark['opacity'] not in (None,'0') and 'defense-doctrine-power' in field_mark['towerClass'] and '◆' in field_mark['glyph'], field_mark)

    page.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
    rail=page.evaluate('''()=>{const r=document.querySelector('.defense-evolution-rail');return{exists:!!r,label:r?.getAttribute('aria-label')||'',nodes:[...r?.querySelectorAll('.defense-evolution-track>i')||[]].map(n=>({text:n.textContent,cls:n.className})),rect:r?.getBoundingClientRect().toJSON()||null}}''')
    current=[n for n in rail['nodes'] if 'current' in n['cls']]
    rec('upgrade sheet exposes a five-step evolution arc', rail['exists'] and len(rail['nodes'])==5 and len(current)==1 and 'path-node' in current[0]['cls'], rail)
    rec('evolution arc carries doctrine identity without extra instructions', 'POWER PATH' in rail['label'] and rail['nodes'][2]['text']=='◆', rail['label'])
    page.screenshot(path='reports/worker-h-depth-upgrade.png')
    page.locator('[data-defense-close-panel]').click()

    # Add a second copy and stagger the same power so repeated-run timing becomes visible.
    pet_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].petId')
    page.evaluate('(id)=>RizoRuntimeQA.defensePlaceNextForQA(id)',pet_id)
    ids=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers.map(t=>t.id)')
    page.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"power",remaining:0,phase:"combat"})',ids[0])
    page.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"power",remaining:8,phase:"combat"})',ids[1])
    page.locator('#defenseAbilitiesButton').click()
    charge=page.evaluate('''()=>{const g=document.querySelector('.defense-ability-group'),c=g?.querySelector('.defense-ability-charge'),bar=g?.querySelector('.defense-ability-charge-rail>i');return{group:!!g,pips:c?.querySelectorAll('.defense-ability-charge-pips>i').length||0,charged:c?.querySelectorAll('.defense-ability-charge-pips>i.charged').length||0,chargeVar:c?.style.getPropertyValue('--ability-charge')||'',barWidth:bar?getComputedStyle(bar).width:null,text:g?.textContent.replace(/\\s+/g,' ').trim()||''}}''')
    pct=float(charge['chargeVar'].strip('%') or 0)
    rec('grouped powers expose per-copy charge reserves', charge['group'] and charge['pips']==2 and charge['charged']==1, charge)
    rec('grouped power rail exposes the next staggered cooldown', 0 < pct < 100, charge)
    page.screenshot(path='reports/worker-h-depth-powers.png')
    page.locator('[data-defense-toggle-abilities]').last.click()

    # Existing clear semantics now receive distinct visual punctuation without changing reward state.
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    perfect=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    rec('perfect clear has distinct authored treatment', 'tone-perfect' in perfect['className'] and 'PERFECT CLEAR' in perfect['text'] and perfect['kind']=='money', perfect)
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(10)')
    milestone=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    rec('milestone clear has distinct authored treatment', 'tone-milestone' in milestone['className'] and 'WAVE 10 CLEAR' in milestone['text'] and milestone['kind']=='money', milestone)
    page.screenshot(path='reports/worker-h-depth-milestone.png')

    rec('depth surfaces emit no runtime errors', not errors, errors[:5])
    page.close()

    # Restraint check on the smallest supported phone: new detail may scroll vertically but must not widen/obscure the field.
    phone=browser.new_page(viewport={"width":320,"height":568},device_scale_factor=2)
    phone_errors=[];phone.on('pageerror',lambda e: phone_errors.append(str(e)))
    boot(phone,w=320,h=568)
    phone.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    tid=phone.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].id')
    phone.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"control",remaining:0,phase:"combat"})',tid)
    phone.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
    compact=phone.evaluate('''()=>{const p=document.querySelector('#defenseTowerPanel').getBoundingClientRect(),r=document.querySelector('.defense-evolution-rail').getBoundingClientRect();return{innerWidth,innerHeight,p:p.toJSON(),r:r.toJSON(),scrollWidth:document.documentElement.scrollWidth}}''')
    rec('depth additions stay horizontally contained at 320×568', compact['scrollWidth']<=321 and compact['p']['left']>=-1 and compact['p']['right']<=321 and compact['r']['left']>=compact['p']['left']-1 and compact['r']['right']<=compact['p']['right']+1, compact)
    rec('compact depth pass emits no runtime errors', not phone_errors, phone_errors[:5])
    phone.screenshot(path='reports/worker-h-depth-320x568.png')
    phone.close()
    browser.close()

out['passed']=sum(1 for c in out['checks'] if c['pass'])
out['total']=len(out['checks'])
out['all_passed']=out['passed']==out['total']
Path('reports/worker-h-depth-audit.json').write_text(json.dumps(out,indent=2))
print(f"\\n{out['passed']}/{out['total']} Worker H depth checks passed")
if not out['all_passed']: raise SystemExit(1)
