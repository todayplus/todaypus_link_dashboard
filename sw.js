const V='dash-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg',
             'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(V);
    await Promise.allSettled(SHELL.map(u=>c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k!==V) await caches.delete(k);
    self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET') return;
  const fresh = /\.json(\?|$)/.test(r.url) || r.mode==='navigate';
  e.respondWith((async()=>{
    const c=await caches.open(V);
    if(fresh){
      try{ const n=await fetch(r); c.put(r,n.clone()); return n; }
      catch(err){ return (await c.match(r)) || (await c.match('./index.html')) || Response.error(); }
    }
    const hit=await c.match(r);
    if(hit) return hit;
    try{ const n=await fetch(r); if(n.ok) c.put(r,n.clone()); return n; }
    catch(err){ return Response.error(); }
  })());
});

// 대시보드의 [오프라인 저장] 버튼
self.addEventListener('message',e=>{
  if(e.data?.type!=='cache') return;
  e.waitUntil((async()=>{
    const c=await caches.open(V);
    await Promise.allSettled((e.data.urls||[]).map(u=>c.add(u)));
    const cl=await self.clients.matchAll();
    cl.forEach(x=>x.postMessage({type:'cached'}));
  })());
});
