from pathlib import Path
import json, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_harness import build_inline_app, SETUP_STATE
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports'/'final-player-experience-qa.json'
SHOTS=ROOT/'reports'
APP=build_inline_app(True, embed_assets=False)
CAPTURE=False
checks=[]
def record(name, ok, detail=None):
    checks.append({'name':name,'pass':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'),name,'' if detail is None else detail)

def boot(browser,w=390,h=844,map_id='grove'):
    page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m: errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(APP,wait_until='domcontentloaded',timeout=30000)
    page.evaluate(SETUP_STATE)
    page.evaluate('(id)=>RizoRuntimeQA.startMiniGame("defense",{mapId:id})',map_id)
    page.wait_for_timeout(100)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove();RizoRuntimeQA.defenseSetCashForQA(9999)')
    page.wait_for_timeout(30)
    return page,errors

def first_valid(page):
    return page.evaluate('''()=>{for(let y=.14;y<=.82;y+=.04)for(let x=.10;x<=.90;x+=.04){const r=RizoRuntimeQA.defensePlacementEvaluationForQA(x,y);if(r.valid)return{x,y};}return null}''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Opening composition at every required viewport + desktop.
    for w,h in [(320,568),(375,812),(390,844),(430,932),(1280,900)]:
        page,errors=boot(browser,w,h)
        data=page.evaluate('''()=>{const world=document.querySelector('#defenseWorld').getBoundingClientRect(),shell=document.querySelector('.defense-shell').getBoundingClientRect(),roster=document.querySelector('#defenseRoster').getBoundingClientRect(),cards=[...document.querySelectorAll('[data-defense-roster-id]')].slice(0,4).map(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('.defense-roster-info b'),s=n.querySelector('.defense-roster-info small');return{id:n.dataset.defenseRosterId,text:n.innerText,rect:r.toJSON(),name:{text:b?.innerText||'',overflow:b?getComputedStyle(b).textOverflow:'',white:b?getComputedStyle(b).whiteSpace:''},role:s?.innerText||''};}),buttons=[...document.querySelectorAll('#defenseDecisionRail button')].map(n=>n.getBoundingClientRect().toJSON()),commands=[...document.querySelectorAll('.defense-command-actions button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect().toJSON()),preview=getComputedStyle(document.querySelector('#defenseWavePreview')).display,coach=getComputedStyle(document.querySelector('#defensePlacementCoach')).display;return{world:world.toJSON(),shell:shell.toJSON(),roster:roster.toJSON(),cards,buttons,commands,preview,coach};}''')
        if w<600:
            first4=all(c['rect']['left']>=data['roster']['left']-1 and c['rect']['right']<=data['roster']['right']+1 for c in data['cards'])
            names=[c['name']['text'] for c in data['cards']]
            roles=[c['role'] for c in data['cards']]
            record(f'{w}x{h}: Captain + Basic + Factory + Beacon fit first bench frame',first4,[(c['id'],round(c['rect']['width'],1)) for c in data['cards']])
            record(f'{w}x{h}: opening names remain complete',names[1:] == ['BASIC DEFENSE RIZO','CLOTHING FACTORY','BEACON'],names)
            record(f'{w}x{h}: universal roles read combat/economy/support',roles[1:] == ['COMBAT','ECONOMY','SUPPORT'],roles)
            record(f'{w}x{h}: opening hides duplicate coach and premature wave preview',data['coach']=='none' and data['preview']=='none',{'coach':data['coach'],'preview':data['preview']})
            record(f'{w}x{h}: authored battlefield remains square',abs(data['world']['width']-data['world']['height'])<1,{'w':data['world']['width'],'h':data['world']['height']})
            record(f'{w}x{h}: decision targets stay separated and usable',all(b['height']>=37.5 for b in data['buttons']) and (data['buttons'][1]['left']-data['buttons'][0]['right'])>=3,[(round(b['width'],1),round(b['height'],1)) for b in data['buttons']])
            record(f'{w}x{h}: recurring command targets remain thumb-sized',all(b['width']>=43.5 and b['height']>=43.5 for b in data['commands']),[(round(b['width'],1),round(b['height'],1)) for b in data['commands']])
        else:
            record('desktop: mobile pass does not disturb shell containment',data['shell']['right']<=w+1 and data['shell']['bottom']<=h+1,data['shell'])
        record(f'{w}x{h}: opening state has no runtime errors',not errors,errors[:3])
        CAPTURE and page.screenshot(path=str(SHOTS/f'final-px-opening-{w}x{h}.png'))
        page.close()

    # Captain selected + first upgrade presentation.
    page,errors=boot(browser,390,844)
    pt=first_valid(page); page.evaluate('(p)=>RizoRuntimeQA.defensePlaceForQA(null,p.x,p.y)',pt);page.wait_for_timeout(40)
    preview=page.evaluate('''()=>{const n=document.querySelector('#defenseWavePreview'),r=n.getBoundingClientRect();return{display:getComputedStyle(n).display,h:r.height,text:n.innerText}}''')
    record('post-placement NEXT preview returns as a compact secondary read',preview['display']!='none' and preview['h']<=31 and len(preview['text'])<60,preview)
    page.locator('.defense-tower').first.click();page.wait_for_timeout(30)
    panel=page.locator('.defense-tower-panel')
    pbox=panel.bounding_box();ptext=panel.inner_text()
    record('Captain inspector stays contained and prioritizes upgrade choice',pbox and pbox['x']>=0 and pbox['x']+pbox['width']<=390 and pbox['y']>=0 and pbox['y']+pbox['height']<=844 and 'LEVEL UP' in ptext,{'box':pbox,'text':ptext[:180]})
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].upgrade')
    page.locator('[data-defense-upgrade]').click();page.wait_for_timeout(30)
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].upgrade')
    upgrade_state=page.evaluate('''()=>({tower:document.querySelector('.defense-tower')?.className||'',deltas:[...document.querySelectorAll('.defense-upgrade-deltas u')].map(n=>n.innerText),cash:document.querySelector('#defenseCashDelta')?.innerText||''})''')
    record('first upgrade has immediate battlefield + signed HUD feedback',after==before+1 and 'just-upgraded' in upgrade_state['tower'] and upgrade_state['cash'].startswith('−'),upgrade_state)
    record('upgrade sheet previews concise deltas before secondary prose',len(upgrade_state['deltas'])>=2 and all(len(x)<=14 for x in upgrade_state['deltas']),upgrade_state['deltas'])
    CAPTURE and page.screenshot(path=str(SHOTS/'final-px-captain-upgrade-390x844.png'))
    page.close()

    # Basic / Factory / Beacon selected presentation and structure feedback.
    for key,selector,label,role in [
        ('basic','.defense-universal-tower','BASIC DEFENSE RIZO','UNIVERSAL TOOL'),
        ('factory','.defense-structure-factory','CLOTHING FACTORY','ECONOMY'),
        ('beacon','.defense-structure-beacon','BEACON','SUPPORT')]:
        page,errs=boot(browser,390,844)
        if key=='basic': page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-tool-basic",.35,.14)')
        elif key=='factory': page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-factory",.35,.20)')
        else: page.evaluate('RizoRuntimeQA.defensePlaceForQA("defense-structure-beacon",.35,.14)')
        page.wait_for_timeout(30)
        page.locator(selector).first.click();page.wait_for_timeout(25)
        text=page.locator('.defense-tower-panel').inner_text()
        box=page.locator('.defense-tower-panel').bounding_box()
        record(f'{label}: inspector is contained and role-identifiable',label in text and role in text and box and box['y']>=0 and box['y']+box['height']<=844,{'box':box,'head':text[:160]})
        record(f'{label}: selected state has no runtime errors',not errs,errs[:3])
        CAPTURE and page.screenshot(path=str(SHOTS/f'final-px-{key}-selected-390x844.png'))
        page.close()

    # Factory: first payout is visible and mirrored by gold feedback.
    page,errs=boot(browser,390,844)
    page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA();q.defensePlaceNextForQA(\"defense-structure-factory\");q.defenseStartWaveForQA();for(let i=0;i<330;i++)q.defenseTickForQA(1/30);}''')
    page.wait_for_timeout(20)
    factory=page.evaluate('''()=>{const p=document.querySelector('.defense-factory-payout'),f=document.querySelector('.defense-structure-factory');return{payout:!!p,text:p?.innerText||'',font:p?getComputedStyle(p).fontSize:'',produced:f?.classList.contains('factory-produced')||false,cash:document.querySelector('#defenseCashDelta')?.innerText||'',total:RizoRuntimeQA.defenseSnapshotForQA().towers.find(t=>t.structureType==='factory')?.totalProduced||0};}''')
    record('first Factory cycle visibly reads as money production',factory['total']>0 and factory['payout'] and factory['text'].strip()!='',factory)
    CAPTURE and page.screenshot(path=str(SHOTS/'final-px-factory-payout-390x844.png'))
    record('Factory payout sample has no runtime errors',not errs,errs[:3]);page.close()

    # Beacon: relation is visible via range field + supported tower reaction.
    page,errs=boot(browser,390,844)
    page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA(\"defense-structure-beacon\");const b=q.defenseSnapshotForQA().towers.find(t=>t.structureType===\"beacon\");let pt=null;for(let r=.095;r<=.19&&!pt;r+=.012){for(let i=0;i<48&&!pt;i++){const a=Math.PI*2*i/48,x=b.x+Math.cos(a)*r,y=b.y+Math.sin(a)*r;if(x<.05||x>.95||y<.08||y>.9)continue;const e=q.defensePlacementEvaluationForQA(x,y);if(e.valid)pt={x,y};}}if(pt)q.defensePlaceForQA(null,pt.x,pt.y);return{beacon:b,point:pt,towers:q.defenseSnapshotForQA().towers};}''');page.wait_for_timeout(40)
    beacon=page.evaluate('''()=>{const b=document.querySelector('.defense-structure-beacon'),ally=[...document.querySelectorAll('.defense-tower')].find(n=>!n.classList.contains('defense-structure-beacon'));const field=b?.querySelector('.defense-structure-field');return{buffed:ally?.classList.contains('beacon-buffed')||false,fieldOpacity:field?getComputedStyle(field).opacity:null,fieldDisplay:field?getComputedStyle(field).display:null,beacon:b?.className||'',ally:ally?.className||''};}''')
    record('Beacon visually links support field to a buffed combat unit',beacon['buffed'] and beacon['fieldDisplay']!='none' and float(beacon['fieldOpacity'] or 0)>0,beacon)
    CAPTURE and page.screenshot(path=str(SHOTS/'final-px-beacon-buff-390x844.png'))
    record('Beacon support sample has no runtime errors',not errs,errs[:3]);page.close()

    # Ability: ready state, grouped tray, and activation reaction.
    page,errs=boot(browser,390,844)
    page.evaluate('RizoRuntimeQA.defensePlaceForQA(null,.35,.14)')
    tower_id=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().towers[0].id')
    page.evaluate('(id)=>RizoRuntimeQA.defenseSetAbilityStateForQA(id,{upgrade:2,doctrine:"power",remaining:0,phase:"combat"})',tower_id);page.wait_for_timeout(40)
    ready=page.evaluate('''()=>({cls:document.querySelector('#defenseAbilitiesButton')?.className||'',count:document.querySelector('#defenseAbilityCount')?.innerText||''})''')
    page.locator('#defenseAbilitiesButton').click();page.wait_for_timeout(25)
    tray=page.locator('#defenseAbilityTray');tray_text=tray.inner_text()
    record('ability readiness is obvious before opening the tray','ready' in ready['cls'] and ready['count'] not in ('','WAIT','0'),ready)
    record('ability tray is contained and names actionable power state',not tray.is_hidden() and 'READY' in tray_text,tray_text[:220])
    group=page.evaluate('RizoRuntimeQA.defenseAbilityGroupsForQA()[0]?.id||""')
    act=page.evaluate('(id)=>RizoRuntimeQA.defenseActivateAbilityGroupForQA(id)',group) if group else False
    page.wait_for_timeout(20)
    cast=page.evaluate('document.querySelector(".defense-tower")?.className||""')
    record('ability activation creates immediate battlefield reaction',bool(act) and 'ability-cast' in cast,{'activated':act,'class':cast})
    CAPTURE and page.screenshot(path=str(SHOTS/'final-px-ability-390x844.png'))
    record('ability presentation sample has no runtime errors',not errs,errs[:3]);page.close()

    # Boss hierarchy shift.
    page,errs=boot(browser,390,844)
    page.evaluate('RizoRuntimeQA.defensePlaceForQA(null,.35,.14);RizoRuntimeQA.defenseSetRunForQA({phase:"paused",paused:true});RizoRuntimeQA.defenseSpawnBossForQA("warden");RizoRuntimeQA.defenseSetRunForQA({phase:"paused",paused:true})');page.wait_for_timeout(40)
    boss=page.evaluate('''()=>{const bar=document.querySelector('#defenseBossBar'),wave=document.querySelector('.defense-wave-banner'),preview=document.querySelector('#defenseWavePreview');return{barHidden:bar?.hidden,barText:bar?.innerText||'',waveVisibility:wave?getComputedStyle(wave).visibility:'',previewVisibility:preview?getComputedStyle(preview).visibility:''};}''')
    record('boss moment takes HUD priority over normal wave information',boss['barHidden'] is False and boss['waveVisibility']=='hidden' and boss['previewVisibility']=='hidden',boss)
    CAPTURE and page.screenshot(path=str(SHOTS/'final-px-boss-390x844.png'))
    record('boss presentation sample has no runtime errors',not errs,errs[:3]);page.close()

    # Map guidance: one concise label, clipped nowhere, detailed paragraph hidden on phone.
    page,errs=boot(browser,320,568)
    map_rows={}
    for map_id in ['grove','ember','moon','storm','blizzard','eclipse']:
        page.evaluate('(m)=>RizoRuntimeQA.defenseSetMapForQA(m)',map_id);page.wait_for_timeout(25)
        card=page.locator('.defense-roster-pet:not([disabled])').first
        card.click();page.wait_for_timeout(20)
        row=page.evaluate('''()=>{const w=document.querySelector('#defenseWorld'),wr=w.getBoundingClientRect();const labels=[...w.querySelectorAll('.defense-map-mechanic>span')].filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect(),strong=n.querySelector('strong'),em=n.querySelector('em');return{text:strong?.innerText||'',detailDisplay:em?getComputedStyle(em).display:'',clipped:r.left<wr.left-.5||r.right>wr.right+.5||r.top<wr.top-.5||r.bottom>wr.bottom+.5};});return{labels};}''')
        map_rows[map_id]=row
        page.evaluate('document.querySelector("[data-defense-cancel-placement]")?.click()')
    map_ok=all(v['labels'] and not any(x['clipped'] for x in v['labels']) and all(x['detailDisplay']=='none' for x in v['labels']) for v in map_rows.values())
    record('320px map guidance stays concise and on-field across all maps',map_ok,map_rows)
    record('map guidance sample has no runtime errors',not errs,errs[:3]);page.close()

    browser.close()

summary={'passed':sum(1 for c in checks if c['pass']),'total':len(checks),'failures':[c for c in checks if not c['pass']]}
REPORT.write_text(json.dumps({'checks':checks,**summary},indent=2))
print(f"\n{summary['passed']}/{summary['total']} final player-experience QA checks passed")
if summary['failures']:
    for row in summary['failures']: print('FAILURE',row['name'],row['detail'])
    raise SystemExit(1)
