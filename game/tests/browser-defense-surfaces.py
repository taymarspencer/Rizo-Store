from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense
ROOT=Path(__file__).resolve().parents[1]
results=[]
def rec(name,ok,detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS' if ok else 'FAIL'),name,detail)

def scan(page,selector):
    return page.evaluate('''sel=>{const root=document.querySelector(sel);if(!root)return{missing:true};const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0};const r=root.getBoundingClientRect(),tiny=[...root.querySelectorAll("*")].filter(visible).map(e=>({text:(e.textContent||"").trim().replace(/\\s+/g," ").slice(0,60),size:parseFloat(getComputedStyle(e).fontSize),cls:String(e.className||"")})).filter(x=>x.text&&x.size<10.5);const controls=[...root.querySelectorAll("button,a,[role=button]")].filter(visible).map(e=>{const x=e.getBoundingClientRect();return{label:e.getAttribute("aria-label")||e.textContent.trim().slice(0,40),left:x.left,right:x.right,top:x.top,bottom:x.bottom,w:x.width,h:x.height}});return{rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:r.width,h:r.height},tiny,controls};}''',selector)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for vp in [(320,568),(390,844),(844,390),(768,1024)]:
        page=browser.new_page(viewport={'width':vp[0],'height':vp[1]})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
        page.evaluate('document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked")')
        start_defense(page)
        page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))')
        page.wait_for_timeout(500)
        page.evaluate('RizoRuntimeQA.defenseSetCashForQA(2000);RizoRuntimeQA.defensePlaceNextForQA()')
        surfaces=[
          ('tower','#defenseTowerPanel','RizoRuntimeQA.defenseShowTowerPanelForQA()'),
          ('field-menu','#defenseFieldMenu','RizoRuntimeQA.defenseToggleFieldMenuForQA(true)'),
          ('powers','#defenseAbilityTray','RizoRuntimeQA.defenseToggleFieldMenuForQA(false);RizoRuntimeQA.defenseOpenAbilitiesForQA(true)'),
          ('intel','#defenseIntelTray','RizoRuntimeQA.defenseOpenAbilitiesForQA(false);RizoRuntimeQA.defenseToggleIntelForQA(true)'),
        ]
        for name,sel,action in surfaces:
            page.evaluate(action);page.wait_for_timeout(40);data=scan(page,sel);r=data.get('rect')
            inside=bool(r and r['left']>=-2 and r['right']<=vp[0]+2 and r['top']>=-2 and r['bottom']<=vp[1]+2)
            minhit=all(c['w']>=35 and c['h']>=35 for c in data.get('controls',[]))
            rec(f'{name} surface contained {vp[0]}x{vp[1]}',inside,str(r))
            rec(f'{name} type floor {vp[0]}x{vp[1]}',not data.get('tiny'),str(data.get('tiny',[])[:4]))
            rec(f'{name} usable controls {vp[0]}x{vp[1]}',minhit,str([c for c in data.get('controls',[]) if c['w']<35 or c['h']<35][:3]))
        # modal surfaces are tested one at a time
        for name,action,sel in [
          ('field-guide','RizoRuntimeQA.defenseShowFieldGuideForQA("rizos")','#modalOverlay .defense-field-guide'),
          ('records','RizoRuntimeQA.defenseShowRecordsForQA()','#modalOverlay .defense-records-modal'),
          ('lobby','RizoRuntimeQA.defenseShowLobbyForQA("grove")','#modalOverlay .defense-world-lobby')]:
            page.evaluate(action);page.wait_for_timeout(50);data=scan(page,sel);r=data.get('rect')
            inside=bool(r and r['left']>=-2 and r['right']<=vp[0]+2 and r['top']>=-2 and r['bottom']<=vp[1]+2)
            rec(f'{name} modal contained {vp[0]}x{vp[1]}',inside,str(r))
            rec(f'{name} modal type floor {vp[0]}x{vp[1]}',not data.get('tiny'),str(data.get('tiny',[])[:4]))
            page.evaluate('document.querySelector("#modalOverlay")?.replaceChildren();document.querySelector("#modalOverlay")?.classList.remove("show")')
        rec(f'no runtime errors surface suite {vp[0]}x{vp[1]}',not errors,';'.join(errors[:3]))
        page.close()
    browser.close()

out={'passed':sum(r['passed'] for r in results),'total':len(results),'results':results}
(ROOT/'reports'/'browser-defense-surfaces.json').write_text(json.dumps(out,indent=2))
print(f"\n{out['passed']}/{out['total']} surface checks passed")
if out['passed']!=out['total']:raise SystemExit(1)
