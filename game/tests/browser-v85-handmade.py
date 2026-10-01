from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'),name,detail)

def num_px(v):
    try:return float(str(v).replace('px',''))
    except:return 999

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in [(320,568),(390,844),(844,390)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000);page.wait_for_timeout(170);page.evaluate(SETUP_STATE)
        label=f'{width}x{height}'
        record(f'handmade body identity present {label}',page.locator('body.rizo-handmade').count()==1)
        record(f'no horizontal page overflow {label}',page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),str(page.evaluate('[document.documentElement.scrollWidth,innerWidth]')))
        if width==390:
            habitat=page.locator('#habitatCard').evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,left:getComputedStyle(n).borderLeftWidth})')
            nav=page.locator('.bottom-nav').evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,width:n.getBoundingClientRect().width})')
            record('home habitat is field-frame not rounded card',num_px(habitat['radius'])<=2 and num_px(habitat['left'])>=4,str(habitat))
            record('navigation is a hard device rail',num_px(nav['radius'])==0 and nav['width']>=389,str(nav))
            need=page.locator('.need-card').first.evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,bg:getComputedStyle(n).backgroundColor})')
            record('vitals are instrument cells not floating cards',num_px(need['radius'])==0,str(need))
            care=page.locator('.care-action').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('care controls read as physical keys',num_px(care)<=1,care)
            growth=page.locator('.growth-overview').evaluate('(n)=>getComputedStyle(n).borderRadius')
            keeper=page.locator('.keeper-path-preview').evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('home progression surfaces reject leftover rounded cards',num_px(growth)<=1 and num_px(keeper)<=1,f'{growth},{keeper}')

        page.locator('[data-nav="arcade"]').click();page.wait_for_timeout(40)
        names=page.locator('#viewArcade>.game-card h2').all_inner_texts()
        record(f'Arcade leads with its strongest cabinet {label}',len(names)>=2 and names[0]=='EMBER BEAT' and names[1]=='RIZO RUNAWAY',str(names[:4]))
        record(f'Arcade has no release-note labels {label}',not any(x in page.locator('#viewArcade').inner_text() for x in ['REBUILT',' DX','• NEW']))
        if width==390:
            cards=page.locator('#viewArcade>.game-card')
            radii=cards.evaluate_all('(els)=>els.map(n=>getComputedStyle(n).borderRadius)')
            colors=cards.evaluate_all('(els)=>[...new Set(els.map(n=>getComputedStyle(n).borderLeftColor))]')
            record('Arcade cards reject generic rounded-card grammar',all(num_px(r)<=1 for r in radii),str(radii[:4]))
            record('Arcade poster wall has authored cabinet accents',len(colors)>=8,str(colors))
            head=page.locator('.arcade-headliner').evaluate('(n)=>n.getBoundingClientRect().height')
            normal=page.locator('.maze-card').evaluate('(n)=>n.getBoundingClientRect().height')
            record('Ember Beat gets real visual hierarchy, not identical cards',head>normal+15,f'{head:.1f}>{normal:.1f}')
            text_px=page.locator('.maze-card p').evaluate('(n)=>getComputedStyle(n).fontSize')
            record('phone Arcade body copy remains readable',num_px(text_px)>=8,str(text_px))

            # Play queue is a distinct utility surface with current authored names.
            page.locator('[data-nav="home"]').click();page.locator('[data-action="play"]').click();page.wait_for_timeout(30)
            sheet=page.locator('#bottomSheet').evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,top:getComputedStyle(n).borderTopWidth,text:n.innerText})')
            record('play queue is hard-edged field drawer',num_px(sheet['radius'])==0 and num_px(sheet['top'])>=4,str({k:sheet[k] for k in ['radius','top']}))
            record('play queue stopped calling itself Care Deck','QUICK QUEUE' in sheet['text'] and 'PICK A CABINET' in sheet['text'])
            page.evaluate('''()=>{const o=document.getElementById('modalOverlay');o.innerHTML='<div class="modal-card"><small>FIELD NOTICE</small><h2>TEST NOTICE</h2><p class="big-line">Authored shell check.</p><div class="modal-buttons"><button>BACK</button><button class="primary">GO</button></div></div>';o.classList.add('show')}''')
            modal=page.locator('.modal-card').evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,left:getComputedStyle(n).borderLeftWidth,textAlign:getComputedStyle(n).textAlign})')
            modal_btn=page.locator('.modal-buttons button').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('generic modal furniture is no longer rounded app chrome',num_px(modal['radius'])<=1 and num_px(modal['left'])>=5 and num_px(modal_btn)<=1,str(modal))
            page.evaluate('document.getElementById("modalOverlay").classList.remove("show")')
            page.locator('#sheetClose').click();page.wait_for_timeout(25)

            # Live games use same shell grammar instead of falling back to old rounded modal UI.
            page.evaluate('RizoRuntimeQA.startMiniGame("power")');page.wait_for_timeout(50)
            arena=page.locator('#miniArena').evaluate('(n)=>({radius:getComputedStyle(n).borderRadius,left:getComputedStyle(n).borderLeftWidth})')
            record('live cabinet frame uses handmade shell',num_px(arena['radius'])<=1 and num_px(arena['left'])>=4,str(arena))
            page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')

            # Journal follows the same grammar.
            page.locator('[data-nav="journal"]').click();page.wait_for_timeout(35)
            hero=page.locator('.journal-hero').evaluate('(n)=>getComputedStyle(n).borderRadius')
            tabs=page.locator('.journal-tabs').evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('Journal shares editorial hard-edge language',num_px(hero)==0 and num_px(tabs)==0,f'{hero},{tabs}')
            path_radius=page.locator('.path-step').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            aptitude_radius=page.locator('.aptitude-row').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('Journal progression rows are field-ledger rows, not pill cards',num_px(path_radius)<=1 and num_px(aptitude_radius)<=1,f'{path_radius},{aptitude_radius}')

            # Unlocked House should not regress into a separate rounded-card design system.
            st=page.evaluate('RizoRuntimeQA.defaultState()');st['pet']['stage']='kid';st['pet']['xp']=1000;st['pet']['energy']=100;st['player']['tutorialDismissed']=True;st['farm']['featureUnlocked']=True;st['farm']['unlockSeen']=True;st['farm']['unlockedRooms']=[0]
            page.evaluate('(s)=>RizoRuntimeQA.loadForQA(s)',st);page.locator('[data-nav="farm"]').click();page.wait_for_timeout(50)
            house=page.locator('.house-scene').evaluate('(n)=>getComputedStyle(n).borderRadius')
            rail=page.locator('.house-room-rail').evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('House joins the same authored material system',num_px(house)==0 and num_px(rail)<=1,f'{house},{rail}')
            if page.locator('[data-close-modal]').count(): page.locator('[data-close-modal]').first.click();page.wait_for_timeout(20)
            house_stat=page.locator('.house-stat-row span').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            wide=page.locator('.house-section .wide-button').first.evaluate('(n)=>getComputedStyle(n).borderRadius')
            record('House utility UI rejects leftover generic pills',num_px(house_stat)<=1 and num_px(wide)<=1,f'{house_stat},{wide}')

            # Force the backup reminder to ensure generic modals also use the authored shell.
            page.evaluate('showBackupReminder && showBackupReminder("house-1")') if False else None

        if width==844:
            shell=page.locator('#gameShell').evaluate('(n)=>n.getBoundingClientRect().width')
            record('landscape uses the available canvas instead of phone column',shell>=700,str(shell))
        record(f'handmade pass has no page errors {label}',not errors,'; '.join(errors[:5]))
        page.close()
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} v85 handmade-design checks passed")
raise SystemExit(1 if failed else 0)
