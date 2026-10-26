const VERSION='gambit-forge-v15';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
 const ks=await caches.keys();const hadOld=ks.some(k=>k!==VERSION);await Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)));
 const before=new Set((await self.clients.matchAll({type:'window'})).map(c=>c.id));await self.clients.claim();
 // Pages from older versions have no controllerchange auto-reload: navigate any that didn't reload themselves.
 if(hadOld){await new Promise(r=>setTimeout(r,1500));for(const c of await self.clients.matchAll({type:'window'}))if(before.has(c.id)&&'navigate'in c)c.navigate(c.url).catch(()=>{})}})())});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
 const isPage=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
 if(isPage){ // network-first so the installed app picks up new versions; cache fallback offline
  e.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put('./index.html',cp))}return res})
   .catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));return}
 e.respondWith(caches.match(req,{ignoreSearch:true}).then(r=>r||fetch(req).then(res=>{if(res.ok){const cp=res.clone();caches.open(VERSION).then(c=>c.put(req,cp))}return res})))});
