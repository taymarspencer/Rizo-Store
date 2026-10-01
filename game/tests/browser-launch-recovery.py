from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'), name, detail)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # A healthy boot must retire the shell but retain it dormant for future resume recovery.
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(False),wait_until='load',timeout=120000)
    page.wait_for_timeout(250)
    status=page.evaluate('RizoBoot.status()')
    shell=page.evaluate('''()=>{const n=document.getElementById('rizoBootShell');return {exists:!!n,hidden:n?.hidden,recovery:n?.classList.contains('is-recovery')}}''')
    record('healthy runtime reports exact v87 visual build', status['ready'] and status['expected']=='v87-first-ten-visual-nuance', str(status))
    record('healthy boot keeps recovery shell dormant instead of deleting it', shell['exists'] and shell['hidden'] and not shell['recovery'], str(shell))
    record('healthy boot has no page errors', not errors, '; '.join(errors[:3]))

    # Simulate the WebKit/PWA resume failure class: runtime exists but every primary surface is gone.
    page.evaluate('''()=>{for(const id of ['originScreen','gameShell','miniGameOverlay']){const n=document.getElementById(id);if(n)n.hidden=true;}RizoBoot.heartbeat('qa-surface-loss')}''')
    page.wait_for_timeout(520)
    recovery=page.evaluate('''()=>{const n=document.getElementById('rizoBootShell');return {hidden:n.hidden,recovery:n.classList.contains('is-recovery'),title:n.querySelector('[data-rizo-boot-title]').textContent,reason:n.querySelector('[data-rizo-boot-reason]').textContent,actions:getComputedStyle(n.querySelector('.rizo-boot-actions')).display}}''')
    record('bad foreground restore becomes visible recovery instead of blank screen', (not recovery['hidden']) and recovery['recovery'] and recovery['actions']!='none' and 'resumed without a visible game surface' in recovery['reason'], str(recovery))
    page.close()

    # The inline guard must work without any external game/runtime file at all.
    html=build_inline_app(False)
    # Remove runtime code after the inline boot tag, leaving the dependency-free guard + shell.
    marker='<script src="./rizo-config.js"></script>'
    # build_inline_app already replaced external scripts, so cut at the first owner config body script marker by source content signature.
    runtime_signature='/**\n * RIZO.GAME LAUNCH CONFIG'
    idx=html.find(runtime_signature)
    if idx!=-1:
        # Find the script start immediately before the config signature and drop all JS bodies through </body>,
        # while retaining the already-parsed HTML shell.
        start=html.rfind('<script>',0,idx)
        end=html.rfind('</body>')
        html=html[:start]+'<script>/* intentionally missing runtime */</script>'+html[end:]
    page=browser.new_page(viewport={'width':390,'height':844})
    page.set_content(html,wait_until='load',timeout=120000)
    page.evaluate("RizoBoot.showRecovery('Simulated runtime fetch failure')")
    page.wait_for_timeout(50)
    fallback=page.evaluate('''()=>({status:RizoBoot.status(),hidden:document.getElementById('rizoBootShell').hidden,title:document.querySelector('[data-rizo-boot-title]').textContent,reason:document.querySelector('[data-rizo-boot-reason]').textContent})''')
    record('inline guard survives total external runtime loss', not fallback['hidden'] and fallback['status']['recoveryVisible'] and fallback['reason']=='Simulated runtime fetch failure', str(fallback))
    page.close()
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} launch recovery checks passed")
raise SystemExit(1 if failed else 0)
