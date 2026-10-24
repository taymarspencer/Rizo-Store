import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.env.REVIEW_DIR || '/tmp/skeleton-origin';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const page=await browser.newPage({ignoreHTTPSErrors:true,reducedMotion:'reduce'});
const checks=[];
function check(name,result){assert.ok(result,name);checks.push({name,passed:true});}
try {
 for(const width of [320,375,390,430,1440]){
  await page.setViewportSize({width,height:1800});
  await page.goto('https://rizo.store/?preview_theme_id=155243118670',{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>document.fonts.ready);
  check(`Preview theme ${width}`,await page.evaluate(()=>Shopify.theme.id===155243118670&&Shopify.theme.role==='unpublished'));
  const teaser=page.locator('.skeleton-origin-teaser');
  await teaser.scrollIntoViewIfNeeded();
  await teaser.locator('img').evaluate(i=>i.decode());
  check(`Portrait loaded ${width}`,await teaser.locator('img').evaluate(i=>i.naturalWidth>0));
  check(`Homepage fits ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`Price preserved ${width}`,(await page.locator('.skeleton-meta').textContent()).includes('$39.99'));
  if(width===390||width===1440) await teaser.screenshot({path:`${out}/Origin-home-${width}.png`});
  await teaser.locator('a').click();
  await page.waitForURL('**/pages/outside#skeleton-origin');
  const story=page.locator('#skeleton-origin');
  await story.scrollIntoViewIfNeeded();
  await story.locator('img').evaluate(i=>i.decode());
  check(`History link works ${width}`,await story.isVisible());
  check(`Original drawing loaded ${width}`,await story.locator('img').evaluate(i=>i.naturalWidth>0&&i.src.includes('original-drawing-process')));
  check(`History credits artist ${width}`,(await story.textContent()).includes('Artwork by Taymar Spencer'));
  check(`Archive fits ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width===390||width===1440)await story.screenshot({path:`${out}/Origin-story-${width}.png`});
 }
 console.log(`${checks.length} origin checks passed`);
} finally {await fs.writeFile(`${out}/checks.json`,JSON.stringify(checks,null,2));await browser.close();}
