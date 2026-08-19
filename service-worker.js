const CACHE='sismia-v9-vercel-rebuild-20260819-2';
const CORE=['/','/index.html','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE)
    /* addAll() falla en bloque si un solo recurso da error: se cachea uno a uno. */
    .then(c=>Promise.all(CORE.map(u=>c.add(u).catch(err=>console.warn('SW core',u,err)))))
    .then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/api/')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
  /* Terceros (MapLibre CDN, teselas): red primero y caché como respaldo offline. */
  if(u.origin!==self.location.origin){
    e.respondWith(fetch(e.request).then(r=>{if(r&&(r.ok||r.type==='opaque')){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy).catch(()=>{}))}return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request,{cache:'no-store'})
      .then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy).catch(()=>{}))}return r})
      /* Solo las navegaciones caen a index.html. Devolver HTML a una petición de
         .js/.css provocaba un error de tipo MIME en lugar de un fallo limpio. */
      .catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('/index.html'):Response.error())))
  );
});
self.addEventListener('push',e=>{let d={title:'SISMIA',body:'Nueva alerta sísmica'};try{d=e.data.json()}catch(_){}e.waitUntil(self.registration.showNotification(d.title||'SISMIA',{body:d.body||'',icon:'/icon-192.png',badge:'/icon-192.png',data:{url:d.url||'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs[0]?cs[0].focus():clients.openWindow(e.notification.data?.url||'/')))});
