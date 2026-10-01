const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const listeners={};
const store=new Map();
let networkMode='online';
const keyOf=req=>typeof req==='string'?new URL(req,'https://play.rizo.store/').href:req.url;
const cache={
  async put(req,res){store.set(keyOf(req),res.clone())},
  async match(req){const r=store.get(keyOf(req));return r?r.clone():undefined},
  async add(){}, async addAll(){}
};
const caches={
  async open(){return cache},
  async match(req){return cache.match(req)},
  async keys(){return ['rizo-game-v87-first-ten']},
  async delete(){return true}
};
const context={
  URL,Set,Map,Promise,Response,Request,console,caches,
  fetch:async req=>{
    if(networkMode==='offline') throw new Error('offline');
    const url=keyOf(req);
    const make=(body,init={})=>{const r=new Response(body,init);Object.defineProperty(r,'type',{value:'basic'});return r};
    if(url.endsWith('game-v79-defense.js')) return make('NETWORK_RUNTIME',{status:200,headers:{'Content-Type':'application/javascript'}});
    if(url.endsWith('index.html')||url.endsWith('/')) return make('<!doctype html>NETWORK_HTML',{status:200,headers:{'Content-Type':'text/html'}});
    return make('NETWORK_ASSET',{status:200});
  },
  self:{
    location:new URL('https://play.rizo.store/sw.js'),
    addEventListener(type,fn){listeners[type]=fn},
    clients:{claim:async()=>true}, skipWaiting:async()=>true
  }
};
vm.createContext(context);vm.runInContext(code,context,{filename:'sw.js'});
async function dispatch(url,{mode='same-origin'}={}){
  const request=new Request(url,{method:'GET'});
  // Request.mode is readonly; provide the minimal request-shaped object used by worker.
  const shaped={url:request.url,method:'GET',mode};
  let promise=null;listeners.fetch({request:shaped,respondWith(value){promise=Promise.resolve(value)}});
  return promise?await promise:null;
}
(async()=>{
  let passed=0;const test=async(name,fn)=>{try{await fn();passed++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}};
  await test('runtime JS is network-first even with poisoned cache',async()=>{
    const url='https://play.rizo.store/game-v79-defense.js';
    store.set(url,new Response('STALE_CACHE_RUNTIME_EXECUTED',{status:200}));networkMode='online';
    const r=await dispatch(url);assert.equal(await r.text(),'NETWORK_RUNTIME');
    assert.equal(await (await cache.match(url)).text(),'NETWORK_RUNTIME');
  });
  await test('runtime JS falls back to repaired cache offline',async()=>{
    const url='https://play.rizo.store/game-v79-defense.js';networkMode='offline';
    const r=await dispatch(url);assert.equal(await r.text(),'NETWORK_RUNTIME');
  });
  await test('navigation is network-first and cache-backed offline',async()=>{
    const url='https://play.rizo.store/index.html';networkMode='online';
    let r=await dispatch(url,{mode:'navigate'});assert((await r.text()).includes('NETWORK_HTML'));
    networkMode='offline';r=await dispatch(url,{mode:'navigate'});assert((await r.text()).includes('NETWORK_HTML'));
  });
  await test('worker has versioned release cache and optional best-effort install',async()=>{
    assert(code.includes('rizo-game-v87-first-ten'));
    assert(code.includes('Promise.allSettled'));
    assert(code.includes('cache.addAll(REQUIRED_SHELL)'));
    assert(code.includes('./arcade-v84-depth.css'));
    assert(code.includes('./rizo-v85-handmade.css'));
    assert(code.includes('await self.skipWaiting()'));
  });
  console.log(`\n${passed}/4 service-worker policy checks passed`);
  if(process.exitCode)process.exit(process.exitCode);
})().catch(e=>{console.error(e);process.exit(1)});
