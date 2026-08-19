const { createHash, randomUUID } = require('node:crypto');

const UA='SISMIA-V9-Vercel-Rebuild/1.0';
const STATE=globalThis.__SISMIA_V9_STATE__ ??= {felt:[],sensors:[],subscriptions:new Map(),monitor:null};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=(v)=>createHash('sha256').update(String(v??'')).digest('hex');

function out(res,status,data){res.status(status);res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store, max-age=0');return res.json(data)}
async function read(req){if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{}}return{}}
async function fetchJSON(url,source,timeoutMs=15000){const started=Date.now(),c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{'user-agent':UA,accept:'application/json'},signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error(`${source} HTTP ${r.status}`);return{ok:true,data:await r.json(),latencyMs:Date.now()-started}}catch(error){return{ok:false,error:String(error?.message||error),latencyMs:Date.now()-started}}finally{clearTimeout(t)}}
function parseWorld(j){return(j?.features||[]).map(f=>({id:f.id,time:Number(f?.properties?.time),mag:Number(f?.properties?.mag)||0,place:f?.properties?.place||'Sin localización',lon:Number(f?.geometry?.coordinates?.[0]),lat:Number(f?.geometry?.coordinates?.[1]),depth:Number(f?.geometry?.coordinates?.[2])||0,source:'USGS',intensity:f?.properties?.mmi??null,url:f?.properties?.url||null})).filter(e=>Number.isFinite(e.time)&&Number.isFinite(e.lat)&&Number.isFinite(e.lon))}
function parseLocal(j){return(j?.features||[]).map((f,i)=>{const p=f?.properties||{},c=f?.geometry?.coordinates||[],raw=p.time||p.lastupdate||p.datetime;return{id:p.unid||p.source_id||p.eventid||`${raw||'event'}-${i}`,time:typeof raw==='number'?raw:Date.parse(String(raw||'')),mag:Number(p.mag)||0,place:p.flynn_region||p.region||p.place||'Granada / entorno',lon:Number(c[0]??p.lon),lat:Number(c[1]??p.lat),depth:Number(c[2]??p.depth)||0,source:'EMSC',intensity:p.intensity||p.mmi||null}}).filter(e=>Number.isFinite(e.time)&&Number.isFinite(e.lat)&&Number.isFinite(e.lon))}
async function currentLocal(hours=720,minmag=1){const start=new Date(Date.now()-hours*3600e3).toISOString(),q=new URLSearchParams({format:'json',starttime:start,minlatitude:'36.45',maxlatitude:'37.85',minlongitude:'-4.55',maxlongitude:'-2.75',minmagnitude:String(minmag),limit:'10000'}),r=await fetchJSON('https://www.seismicportal.eu/fdsnws/event/1/query?'+q,'EMSC');if(!r.ok)return{...r,source:'EMSC',events:[]};const events=parseLocal(r.data);return{ok:true,source:'EMSC',latencyMs:r.latencyMs,count:events.length,events}}
async function currentWorld(){const r=await fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson','USGS');if(!r.ok)return{...r,source:'USGS',events:[]};return{ok:true,source:'USGS',latencyMs:r.latencyMs,upstreamUpdated:Number(r.data?.metadata?.generated)||null,count:r.data?.metadata?.count??(r.data?.features||[]).length,events:parseWorld(r.data)}}
async function earthquakes(req,res){const fetchedAt=Date.now(),scope=String(req.query?.scope||'sync');if(scope==='local'){const local=await currentLocal();return out(res,local.ok?200:502,{fetchedAt,...local})}if(scope==='world'){const world=await currentWorld();return out(res,world.ok?200:502,{fetchedAt,...world})}const[local,world]=await Promise.all([currentLocal(),currentWorld()]);return out(res,local.ok||world.ok?200:502,{ok:local.ok||world.ok,fetchedAt,local,world})}
async function history(req,res){const start=new Date(Date.now()-365*864e5).toISOString();try{const lq=new URLSearchParams({format:'json',starttime:start,minlatitude:'36.45',maxlatitude:'37.85',minlongitude:'-4.55',maxlongitude:'-2.75',minmagnitude:'1.5',limit:'10000',orderby:'time-asc'}),wq=new URLSearchParams({format:'geojson',starttime:start,minmagnitude:'7',orderby:'time-asc',limit:'2000'}),[l,w]=await Promise.all([fetchJSON('https://www.seismicportal.eu/fdsnws/event/1/query?'+lq,'EMSC',25000),fetchJSON('https://earthquake.usgs.gov/fdsnws/event/1/query?'+wq,'USGS',25000)]);if(!l.ok||!w.ok)throw new Error(l.error||w.error||'Histórico no disponible');return out(res,200,{ok:true,fetchedAt:Date.now(),local:parseLocal(l.data),world:parseWorld(w.data)})}catch(error){return out(res,502,{ok:false,error:String(error?.message||error),fetchedAt:Date.now(),local:[],world:[]})}}
const MC=1.5;
const rad=x=>x*Math.PI/180;
function hav(a,b,c,d){const R=6371,p=rad(c-a),q=rad(d-b),x=Math.sin(p/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(q/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function percentile(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l)}
function weightedCenter(es,now){if(!es.length)return{lat:37.1773,lon:-3.5986};let sw=0,la=0,lo=0;for(const e of es){const ageH=Math.max(.05,(now-e.time)/36e5),w=(1+Math.max(0,e.mag-MC))*(1/(1+ageH/6));sw+=w;la+=e.lat*w;lo+=e.lon*w}return{lat:la/sw,lon:lo/sw}}
/* Mismos componentes y mismos topes que calcModel() en app-2.js, para que
   "Último score servidor" sea comparable con el score que ve el usuario.
   Única diferencia: aquí no hay feed mundial, así que falta el término remoto
   (0–10). Antes se usaba un valor fijo de 10 para la concentración espacial y
   un reescalado *(100/85) que inflaba el resultado ~18 %. */
function monitorScore(es){
  const now=Date.now(),
    e6=es.filter(e=>now-e.time<=6*3600e3),
    e24=es.filter(e=>now-e.time<=24*3600e3),
    prev=es.filter(e=>now-e.time>6*3600e3&&now-e.time<=12*3600e3),
    max=es.length?Math.max(...es.map(e=>e.mag)):0,
    depths=es.map(e=>e.depth).filter(Number.isFinite),
    shallow=depths.length?depths.filter(d=>d<=10).length/depths.length:0,
    acc=prev.length?e6.length/prev.length:e6.length?2:1,
    base=e24.length?e24:es,
    center=weightedCenter(base,now),
    radius=clamp(percentile(base.map(e=>hav(center.lat,center.lon,e.lat,e.lon)),.8)||5,3,25);
  const rateScore=clamp(e6.length*2.2,0,30),
    magScore=clamp(Math.max(0,max-2)*10,0,20),
    accelScore=clamp((acc-1)*10+5,0,15),
    clusterScore=clamp(15*(1-radius/25),0,15),
    depthScore=clamp(shallow*10,0,10);
  return Math.round(clamp(rateScore+magScore+accelScore+clusterScore+depthScore,0,100))
}
async function runMonitor(){const result=await currentLocal(72,1.5);if(!result.ok)throw new Error(result.error||'EMSC no disponible');const events=result.events.sort((a,b)=>b.time-a.time),latest=events[0]||null,latestM3=events.find(e=>e.mag>=3)||null,currentScore=monitorScore(events),prev=STATE.monitor||{},newM3=latestM3&&String(latestM3.id)!==String(prev.latestM3Id||''),crossed=currentScore>=80&&(prev.lastScore??0)<80;STATE.monitor={ok:true,lastRun:Date.now(),lastScore:currentScore,localCount:events.length,latestId:latest?.id||null,latestMag:latest?.mag||null,latestM3Id:latestM3?.id||prev.latestM3Id||null,sent:0,reason:newM3?'detección':crossed?'anomalía':null,persistent:false,pushConfigured:false};return STATE.monitor}
async function stateRoute(req,res,action){if(action==='felt'){if(req.method==='POST'){const b=await read(req),level=clamp(Number(b.level)||0,0,3),at=Number(b.at)||Date.now();STATE.felt.push({id:randomUUID(),level,at,eventId:b.eventId?String(b.eventId).slice(0,120):null,eventMag:Number.isFinite(Number(b.eventMag))?Number(b.eventMag):null,region:'Granada'});STATE.felt=STATE.felt.filter(x=>Date.now()-x.at<48*3600e3).slice(-1000);return out(res,200,{ok:true,persistent:false})}const recent=STATE.felt.filter(x=>x.at>=Date.now()-24*3600e3),counts=[0,0,0,0];for(const r of recent)counts[clamp(Number(r.level)||0,0,3)]++;return out(res,200,{ok:true,total:recent.length,counts,persistent:false})}
if(action==='sensor'){if(req.method==='POST'){const b=await read(req),at=Number(b.at)||Date.now();STATE.sensors.push({id:randomUUID(),at,rms:Number(b.rms)||0,peak:Number(b.peak)||0,gyro:Number(b.gyro)||0,device:hash(b.deviceId).slice(0,18),region:'Granada'});STATE.sensors=STATE.sensors.filter(x=>Date.now()-x.at<48*3600e3).slice(-3000);return out(res,200,{ok:true,persistent:false})}const now=Date.now(),d10=new Set(),d60=new Set();for(const d of STATE.sensors){const age=now-d.at;if(age<=3600e3)d60.add(d.device);if(age<=10*60e3)d10.add(d.device)}const n10=d10.size,n60=d60.size;return out(res,200,{ok:true,n10,n60,confidence:Math.min(100,Math.round(n10*24+n60*3)),persistent:false})}
if(action==='push'){if(req.method==='POST')return out(res,503,{ok:false,error:'Push 24/7 pendiente de almacenamiento persistente en Vercel',subscriptions:0,persistent:false,pushConfigured:false});if(!STATE.monitor){try{await runMonitor()}catch{}}return out(res,200,{ok:true,subscriptions:0,lastRun:STATE.monitor?.lastRun||null,monitor:STATE.monitor||null,persistent:false,pushConfigured:false})}
if(action==='monitor'){try{return out(res,200,await runMonitor())}catch(error){return out(res,500,{ok:false,lastRun:Date.now(),error:String(error?.message||error),persistent:false})}}return out(res,404,{ok:false,error:'Acción no encontrada'})}
module.exports=async function handler(req,res){const action=String(req.query?.action||'earthquakes');try{if(action==='earthquakes')return await earthquakes(req,res);if(action==='history')return await history(req,res);return await stateRoute(req,res,action)}catch(error){return out(res,500,{ok:false,error:String(error?.message||error)})}}
