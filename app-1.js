
const $=id=>document.getElementById(id), G={lat:37.1773,lon:-3.5986}, MC=1.5;
let local=[], world=[], localMapObj=null, fullLocalMapObj=null, worldMapObj=null, selectedWorld=null, model=null, interacted=false, lastAlertState=false, sourceMeta={local:null,world:null,fetchedAt:null};
let localLatestMarker=null,worldLatestMarker=null,lastLatestLocalId=null,lastLatestWorldId=null;
const localMapPanels=new WeakMap(),localSelectedIds=new WeakMap(),latestMarkers=new WeakMap();
let sensorRunning=false,sensorWakeLock=null,sensorCalibrating=false,sensorCalibration=[],sensorBaseline=.02,sensorSensitivity=2,sensorPersistStart=0,sensorLastAlert=0,sensorLastEvent=0,sensorHzSamples=[],sensorGravity={x:0,y:0,z:0},sensorUsingLinear=false;
let accHistory=[],gyroHistory=[],sensorWindow=[],sensorMaxPoints=180;
let selectedLocal=null,forecastHorizon=3,historyLocal=[],historyWorld=[],historyLoaded=false,historyMetrics=null;
let previousVisit=null,nightMode=false,nightEvents=[];
const VAPID_PUBLIC_KEY='BDjf8QsYspKoIrZ1l50L1WnWr3aJLgAhc-1I84LsKtFXBK_ZRdOPCn3XM88EROK8cp3pjN-ZX8TF8U8Jg_OqHJk';
let anonDeviceId;try{anonDeviceId=localStorage.getItem('sismia-device-v9');if(!anonDeviceId){anonDeviceId=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now());localStorage.setItem('sismia-device-v9',anonDeviceId)}}catch(_){anonDeviceId='session-'+Math.random().toString(36).slice(2)}
const towns=[['Granada',37.1773,-3.5986],['Alhendín',37.108,-3.645],['Gójar',37.104,-3.605],['La Zubia',37.119,-3.584],['Ogíjares',37.119,-3.607],['Villa de Otura',37.088,-3.633],['Armilla',37.143,-3.626],['Las Gabias',37.136,-3.670],['Dílar',37.073,-3.602],['Monachil',37.132,-3.538],['Cájar',37.133,-3.572],['Huétor Vega',37.145,-3.570],['Cenes de la Vega',37.160,-3.537],['Churriana de la Vega',37.145,-3.647],['Padul',37.024,-3.626],['Atarfe',37.224,-3.686],['Santa Fe',37.189,-3.718],['Albolote',37.230,-3.656],['Maracena',37.207,-3.634]];
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}function rad(x){return x*Math.PI/180}function deg(x){return x*180/Math.PI}
function hav(a,b,c,d){const R=6371,p=rad(c-a),q=rad(d-b),x=Math.sin(p/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(q/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function age(t){const s=Math.max(0,(Date.now()-t)/1000);if(s<60)return Math.round(s)+' s';if(s<3600)return Math.round(s/60)+' min';if(s<86400)return (s/3600).toFixed(s<10800?1:0)+' h';return (s/86400).toFixed(1)+' d'}
function dateLocal(t){return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(t))}
function nearestTown(lat,lon){let best=null;for(const t of towns){const d=hav(lat,lon,t[1],t[2]);if(!best||d<best.d)best={name:t[0],d}}return best}
function percentile(a,p){if(!a.length)return 0;let s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l)}
function median(a){return percentile(a,.5)}
function toast(t,p){$('toastT').textContent=t;$('toastP').textContent=p;$('toast').style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>$('toast').style.display='none',3600)}
function severity(m){return m>=5?'FUERTE':m>=4?'MODERADO':m>=3?'PERCEPTIBLE':m>=2?'PEQUEÑO':'MICROSISMO'}
function quakeTone(m){return m>=5?'mag-deep':m>=4?'mag-red':m>=3?'mag-orange':m>=2?'mag-yellow':'mag-blue'}
function recentEventMarkup(e,index=0){const t=nearestTown(e.lat,e.lon),dG=hav(e.lat,e.lon,G.lat,G.lon),depth=Number.isFinite(e.depth)?e.depth.toFixed(1)+' km':'—',latest=index===0;return `<button class="recentEvent ${quakeTone(e.mag)} ${latest?'isLatest':''}" onclick="openLocal('${String(e.id).replaceAll("'","\\'")}')"><div class="recentMagnitude"><span>M</span><strong>${e.mag.toFixed(1)}</strong></div><div class="recentEventBody"><div class="recentEventTop"><b>${t.name}</b><span class="recentCategory">${severity(e.mag)}</span>${latest?'<em>ÚLTIMO</em>':''}</div><div class="recentEventMeta"><span><strong>${age(e.time)}</strong> hace</span><span>${dateLocal(e.time)}</span><span>Prof. <strong>${depth}</strong></span><span>${dG.toFixed(1)} km de Granada</span><span>${e.source}</span></div></div></button>`}
function popupHTML(e){const town=nearestTown(e.lat,e.lon),dG=hav(e.lat,e.lon,G.lat,G.lon);return `<div class="popupMag">M${e.mag.toFixed(1)}</div><div class="popupPlace">${town.name}${town.d>1?' · '+town.d.toFixed(1)+' km':''}</div><div class="popupGrid"><div class="popupCell"><span>Hace</span><b>${age(e.time)}</b></div><div class="popupCell"><span>Hora local</span><b>${dateLocal(e.time)}</b></div><div class="popupCell"><span>Profundidad</span><b>${Number.isFinite(e.depth)?e.depth.toFixed(1)+' km':'—'}</b></div><div class="popupCell"><span>Clase</span><b>${severity(e.mag)}</b></div><div class="popupCell"><span>Dist. Granada</span><b>${dG.toFixed(1)} km</b></div><div class="popupCell"><span>Intensidad oficial</span><b>${e.intensity||'no incluida'}</b></div></div>`}
function circlePoly(lat,lon,rKm,n=64){const pts=[];for(let i=0;i<=n;i++){const br=2*Math.PI*i/n,dr=rKm/6371,la=rad(lat),lo=rad(lon);const la2=Math.asin(Math.sin(la)*Math.cos(dr)+Math.cos(la)*Math.sin(dr)*Math.cos(br));const lo2=lo+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(la),Math.cos(dr)-Math.sin(la)*Math.sin(la2));pts.push([deg(lo2),deg(la2)])}return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[pts]}}}
function eventFC(es){const latest=newest(es);return {type:'FeatureCollection',features:es.map(e=>({type:'Feature',id:String(e.id),properties:{id:String(e.id),mag:e.mag,place:e.place,time:e.time,depth:e.depth,source:e.source,isLatest:!!latest&&String(e.id)===String(latest.id)},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}))}}
function shiftLatLon(lat,lon,km,bearingDeg){const d=km/6371,br=rad(bearingDeg),la=rad(lat),lo=rad(lon),la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(br)),lo2=lo+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));return{lat:deg(la2),lon:deg(lo2)}}
function forecastProjection(h=forecastHorizon){if(!model)return{center:G,radius:6,events:[]};const b=model.migrationBearing??0,shift=Math.min(model.radius*.65,(model.migration||0)*Math.max(0.3,h/6)*.35),c=shiftLatLon(model.center.lat,model.center.lon,shift,b),radius=clamp(model.radius*(1+.18*h/24),3,32),events=(model.e24.length?model.e24:model.e72).map(e=>{const q=shiftLatLon(e.lat,e.lon,shift,b);return{...e,lat:q.lat,lon:q.lon}});return{center:c,radius,events}}
function snapshotNow(){if(!model)return null;return{at:Date.now(),events72:model.e72.length,events6:model.e6.length,max:model.max,score:model.score,center:model.center,radius:model.radius,p3:model.p3}}
function deltaText(v,suffix=''){if(!Number.isFinite(v))return'—';return`${v>0?'+':''}${typeof v==='number'&&Math.abs(v)<10?v.toFixed(1):Math.round(v)}${suffix}`}
function saveVisitSnapshot(){const snap=snapshotNow();if(snap)try{localStorage.setItem('sismia-last-visit-v9',JSON.stringify(snap))}catch(_){}}
function renderChanges(){const es=local.slice().sort((a,b)=>b.time-a.time).slice(0,5);$('changeBadge').textContent=es.length?`${es.length} ÚLTIMOS`:'SIN DATOS';$('changeGrid').innerHTML=es.map((e,i)=>recentEventMarkup(e,i)).join('')||'<div class="notice">No hay eventos locales disponibles.</div>'}
function renderScenarios(){if(!model)return;let decay=clamp(60-(model.accel-1)*28-model.p3*.18,8,88),persistent=clamp(28+Math.abs(model.accel-1)*18+model.e24*.25,8,75),escalation=clamp(8+model.p3*.35+Math.max(0,model.max-3)*9,3,65),sum=decay+persistent+escalation;decay=100*decay/sum;persistent=100*persistent/sum;escalation=100*escalation/sum;$('scenarioGrid').innerHTML=[['Decaimiento',decay,'Menor ritmo y progresiva relajación de la secuencia.'],['Persistencia',persistent,'Continúan microeventos/M2–M3 sin cambio brusco.'],['Escalada',escalation,'Aumenta el peso relativo de un evento significativamente mayor.']].map(x=>`<div class="scenario"><div class="pct">${Math.round(x[1])}%</div><b>${x[0]}</b><small>${x[2]} Peso heurístico, no probabilidad calibrada.</small></div>`).join('')}
function setForecastHorizon(h){forecastHorizon=Number(h)||3;document.querySelectorAll('#horizonBtns button').forEach(b=>b.classList.toggle('on',Number(b.dataset.h)===forecastHorizon));$('horizonBadge').textContent=(forecastHorizon===3?'0–3':forecastHorizon===6?'3–6':forecastHorizon===12?'6–12':'12–24')+' H';renderLocalMap()}
function dnaVector(m=model){if(!m)return[];return[['Frecuencia',clamp(m.rate/3,0,1),m.rate.toFixed(2)+'/h'],['Magnitud',clamp(m.max/5,0,1),'M'+m.max.toFixed(1)],['Superficial',clamp(m.shallow,0,1),Math.round(m.shallow*100)+'%'],['Cluster',clamp(1-m.radius/30,0,1),m.radius.toFixed(1)+' km'],['b-value',clamp((m.b||0)/1.8,0,1),m.b?m.b.toFixed(2):'N/D'],['Aceleración',clamp(m.accel/2.5,0,1),m.accel.toFixed(2)+'×']]}
function renderDNA(){if(!model)return;const v=dnaVector();$('dnaGrid').innerHTML=v.map(x=>`<div class="dnaCell"><span>${x[0]}</span><strong>${x[2]}</strong><div class="miniTrack"><i style="width:${Math.round(x[1]*100)}%"></i></div></div>`).join('')}



function newest(es){return es?.length?es.reduce((a,b)=>!a||b.time>a.time?b:a,null):null}
function markerClock(t){return new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(new Date(t))}
function safeMapText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* MAPA V21 — base raster ligera + satélite nativo + capas sísmicas independientes. */
const satelliteState=new WeakMap();

function localQuakeColor(){return ['step',['to-number',['get','mag'],0],'#26A7FF',2,'#FFE04B',3,'#FF8A24',4,'#FF4438',5,'#D71932']}
function worldQuakeColor(){return ['step',['to-number',['get','mag'],0],'#26A7FF',6.3,'#FFE04B',7.1,'#FF8A24',8,'#FF4438',8.7,'#D71932']}
function localPointRadius(){return ['*',
  ['interpolate',['linear'],['zoom'],7,.70,10,1,13,1.24],
  ['interpolate',['linear'],['to-number',['get','mag'],0],1.5,4.0,2,4.5,3,5.7,4,7.0,5,8.4]
]}
function localHaloRadius(){return ['*',
  ['interpolate',['linear'],['zoom'],7,.78,10,1,13,1.22],
  ['interpolate',['linear'],['to-number',['get','mag'],0],1.5,11,2,13,3,16,4,21,5,26]
]}
function worldPointRadius(){return ['*',
  ['interpolate',['linear'],['zoom'],0,.72,2,1,4,1.28],
  ['interpolate',['linear'],['to-number',['get','mag'],0],5.5,4.3,6.5,5.4,7.5,7.0,9,9.6]
]}
function emptyFC(){return {type:'FeatureCollection',features:[]}}
function pointFC(e){return e?{type:'FeatureCollection',features:[{type:'Feature',properties:{id:String(e.id),mag:e.mag},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}]}:emptyFC()}

function sismiaBaseStyle(){
  return {
    version:8,
    sources:{
      'sismia-dark-base':{
        type:'raster',
        tiles:['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        tileSize:256,
        attribution:'© OpenStreetMap contributors © CARTO'
      },
      'sismia-satellite-base':{
        type:'raster',
        tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize:256,
        attribution:'Tiles © Esri'
      }
    },
    layers:[
      {id:'sismia-background',type:'background',paint:{'background-color':'#050608'}},
      {id:'sismia-dark-layer',type:'raster',source:'sismia-dark-base',layout:{visibility:'visible'},paint:{
        'raster-opacity':1,'raster-saturation':-.18,'raster-contrast':.08,'raster-brightness-min':.02,'raster-brightness-max':.82
      }},
      {id:'sismia-satellite-layer',type:'raster',source:'sismia-satellite-base',layout:{visibility:'none'},paint:{
        'raster-opacity':1,'raster-saturation':-.05,'raster-contrast':.07
      }}
    ]
  }
}

function setSatelliteMode(map,on){
  if(!map)return false;
  const dark=map.getLayer?.('sismia-dark-layer'),sat=map.getLayer?.('sismia-satellite-layer');
  if(!dark||!sat)return false;
  try{
    map.setLayoutProperty('sismia-dark-layer','visibility',on?'none':'visible');
    map.setLayoutProperty('sismia-satellite-layer','visibility',on?'visible':'none');
    satelliteState.set(map,!!on);
    return true;
  }catch(e){console.warn('SISMIA satellite mode',e);return false}
}
function satelliteControl(){let map,button,pending=false;const paint=on=>{
  if(!button)return;button.classList.toggle('on',on);
  button.innerHTML=on?'<span>◇</span><b>MAPA</b>':'<span>◉</span><b>SATÉLITE</b>';
  button.setAttribute('aria-label',on?'Volver a vista de mapa':'Cambiar a vista satélite');
};
return{
  onAdd(m){
    map=m;
    const wrap=document.createElement('div');wrap.className='maplibregl-ctrl maplibregl-ctrl-group sismiaSatelliteCtrl';
    button=document.createElement('button');button.type='button';button.className='sismiaSatelliteBtn';paint(false);
    button.onclick=ev=>{
      ev.preventDefault();ev.stopPropagation();
      if(pending)return;
      const next=!satelliteState.get(map);
      if(setSatelliteMode(map,next)){paint(next);map.triggerRepaint?.();return}
      pending=true;button.innerHTML='<span>◌</span><b>CARGANDO…</b>';
      let tries=0;
      const retry=()=>{
        tries++;
        if(setSatelliteMode(map,next)){pending=false;paint(next);map.triggerRepaint?.();return}
        if(tries<30)setTimeout(retry,100);
        else{pending=false;paint(!!satelliteState.get(map));toast('Satélite no disponible','No se ha podido activar la capa satélite. Comprueba la conexión.')}
      };
      retry();
    };
    wrap.appendChild(button);return wrap
  },
  onRemove(){button?.parentNode?.remove();button=null;map=null}
}}

function addGranada(map){
  if(map.getSource('granada'))return;
  map.addSource('granada',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[G.lon,G.lat]}}});
  map.addLayer({id:'granada-ring',type:'circle',source:'granada',paint:{'circle-radius':7,'circle-color':'rgba(255,255,255,.10)','circle-stroke-color':'#fff','circle-stroke-width':1.6}});
  map.addLayer({id:'granada-label',type:'symbol',source:'granada',layout:{'text-field':'GRANADA','text-size':11,'text-offset':[0,1.4],'text-anchor':'top'},paint:{'text-color':'#fff','text-halo-color':'#050608','text-halo-width':1.6}})
}

function addLocalLayers(map){
  if(map.getSource('local-quakes'))return;
  map.addSource('cluster-zone',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'cluster-zone-fill',type:'fill',source:'cluster-zone',paint:{'fill-color':'#ff9b4a','fill-opacity':.018}});
  map.addLayer({id:'cluster-zone-line',type:'line',source:'cluster-zone',paint:{'line-color':'#ff9b4a','line-width':1.15,'line-dasharray':[3,2],'line-opacity':.34}});
  map.addSource('local-quakes',{type:'geojson',data:emptyFC()});

  /* Una sola temperatura suave: barata de dibujar y suficiente para mostrar proximidad. */
  map.addLayer({id:'local-heat',type:'heatmap',source:'local-quakes',maxzoom:12.5,paint:{
    'heatmap-weight':['interpolate',['linear'],['to-number',['get','mag'],0],1.5,.14,2,.24,3,.48,4,.76,5,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],7,.30,10,.47,12.5,.54],
    'heatmap-radius':['interpolate',['linear'],['zoom'],7,14,10,21,12.5,27],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],7,.11,10,.17,12.5,.14],
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.22,'rgba(38,167,255,.12)',.48,'rgba(255,224,75,.16)',.68,'rgba(255,138,36,.18)',.88,'rgba(255,68,56,.21)',1,'rgba(215,25,50,.25)']
  }});

  /* Aura + esfera. Reducimos capas frente a V20 para mejorar rendimiento en móvil. */
  map.addLayer({id:'local-aura',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localHaloRadius(),'circle-color':localQuakeColor(),'circle-opacity':['interpolate',['linear'],['zoom'],7,.15,10,.22,13,.26],'circle-blur':.86
  }});
  map.addLayer({id:'local-shadow',type:'circle',source:'local-quakes',paint:{
    'circle-radius':['*',localPointRadius(),1.08],'circle-color':'#000','circle-opacity':.40,'circle-blur':.30,'circle-translate':[1.5,1.8]
  }});
  map.addLayer({id:'local-points',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localPointRadius(),'circle-color':localQuakeColor(),'circle-stroke-color':'rgba(255,255,255,.90)',
    'circle-stroke-width':['interpolate',['linear'],['zoom'],7,.75,10,1.05,13,1.30],'circle-opacity':1
  }});
  map.addLayer({id:'local-shine',type:'circle',source:'local-quakes',paint:{
    'circle-radius':['*',localPointRadius(),.25],'circle-color':'#fff','circle-opacity':.70,'circle-blur':.20,'circle-translate':[-1.7,-1.9]
  }});
  map.addLayer({id:'local-latest-glow',type:'circle',source:'local-quakes',filter:['==',['get','isLatest'],true],paint:{
    'circle-radius':['*',localHaloRadius(),1.16],'circle-color':'#44FF88','circle-opacity':.30,'circle-blur':.84
  }});
  map.addLayer({id:'local-latest-core',type:'circle',source:'local-quakes',filter:['==',['get','isLatest'],true],paint:{
    'circle-radius':['*',localPointRadius(),1.17],'circle-color':'#44F886','circle-opacity':1,'circle-stroke-color':'#F1FFF5','circle-stroke-width':1.9
  }});
  map.addLayer({id:'local-hit',type:'circle',source:'local-quakes',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],7,8,10,10.5,13,12.5],'circle-color':'#000','circle-opacity':.001
  }});
  map.addSource('local-selected',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'local-selected-ring',type:'circle',source:'local-selected',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],7,8,10,11,13,14],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#fff','circle-stroke-width':2.6
  }});
  const pick=ev=>{const f=ev.features?.[0];if(!f)return;const e=local.find(x=>String(x.id)===String(f.properties.id));if(e)showLocalEvent(e,map)};
  map.on('click','local-hit',pick);
  map.on('mouseenter','local-hit',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','local-hit',()=>map.getCanvas().style.cursor='')
}

function addWorldLayers(map){
  if(map.getSource('world-quakes'))return;
  map.addSource('world-quakes',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'world-aura',type:'circle',source:'world-quakes',paint:{
    'circle-radius':['*',worldPointRadius(),2.8],'circle-color':worldQuakeColor(),'circle-opacity':.22,'circle-blur':.84
  }});
  map.addLayer({id:'world-shadow',type:'circle',source:'world-quakes',paint:{
    'circle-radius':['*',worldPointRadius(),1.08],'circle-color':'#000','circle-opacity':.40,'circle-blur':.3,'circle-translate':[1.4,1.7]
  }});
  map.addLayer({id:'world-points',type:'circle',source:'world-quakes',paint:{
    'circle-radius':worldPointRadius(),'circle-color':worldQuakeColor(),'circle-stroke-color':'rgba(255,255,255,.90)','circle-stroke-width':1.05,'circle-opacity':1
  }});
  map.addLayer({id:'world-shine',type:'circle',source:'world-quakes',paint:{
    'circle-radius':['*',worldPointRadius(),.25],'circle-color':'#fff','circle-opacity':.70,'circle-blur':.18,'circle-translate':[-1.6,-1.8]
  }});
  map.addLayer({id:'world-latest-glow',type:'circle',source:'world-quakes',filter:['==',['get','isLatest'],true],paint:{
    'circle-radius':['*',worldPointRadius(),3.5],'circle-color':'#44FF88','circle-opacity':.30,'circle-blur':.84
  }});
  map.addLayer({id:'world-latest-core',type:'circle',source:'world-quakes',filter:['==',['get','isLatest'],true],paint:{
    'circle-radius':['*',worldPointRadius(),1.18],'circle-color':'#44F886','circle-opacity':1,'circle-stroke-color':'#F1FFF5','circle-stroke-width':1.8
  }});
  map.on('click','world-points',ev=>{const f=ev.features?.[0];if(f)selectWorld(String(f.properties.id))});
  map.addSource('world-link',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'world-link-line',type:'line',source:'world-link',paint:{'line-color':'#ff9b4a','line-width':2,'line-dasharray':[2,2],'line-opacity':.78}})
}

function installLocalMapLayers(map){
  if(!map||map.__sismiaInstalled)return;
  if(!map.isStyleLoaded?.())return;
  try{
    addGranada(map);
    addLocalLayers(map);
    map.__sismiaInstalled=true;
    renderLocalMap();
    updateLatestMarkers();
    setTimeout(()=>map.resize?.(),40);
  }catch(e){console.error('SISMIA local map install',e)}
}
function installWorldMapLayers(map){
  if(!map||map.__sismiaInstalled)return;
  if(!map.isStyleLoaded?.())return;
  try{
    addGranada(map);
    addWorldLayers(map);
    map.__sismiaInstalled=true;
    renderWorldMap();
    updateLatestMarkers();
    setTimeout(()=>map.resize?.(),40);
  }catch(e){console.error('SISMIA world map install',e)}
}

function makeLocalMap(container,full=false){
  const el=typeof container==='string'?$(container):container;
  if(!el)return null;
  if(!window.maplibregl){el.innerHTML='<div class="mapError">No se pudo cargar MapLibre. Comprueba Internet y recarga.</div>';return null}
  const map=new maplibregl.Map({
    container:el,style:sismiaBaseStyle(),center:[-3.62,37.12],zoom:full?9.45:9.6,pitch:0,bearing:0,
    attributionControl:true,fadeDuration:0,renderWorldCopies:false
  });
  satelliteState.set(map,false);
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  map.addControl(satelliteControl(),'bottom-right');
  const install=()=>installLocalMapLayers(map);
  map.on('style.load',install);
  map.on('load',install);
  map.on('error',e=>{const msg=e?.error?.message||e?.message||'';if(msg&&!/tile/i.test(msg))console.warn('SISMIA map',msg)});
  setTimeout(()=>{install();map.resize?.()},120);
  return map
}
function ensureLocalMap(){if(localMapObj)return localMapObj;localMapObj=makeLocalMap('localMap',false);return localMapObj}
function ensureFullLocalMap(){if(fullLocalMapObj)return fullLocalMapObj;fullLocalMapObj=makeLocalMap('fullLocalMap',true);return fullLocalMapObj}
function ensureWorldMap(){
  if(worldMapObj)return worldMapObj;
  if(!window.maplibregl){if($('worldMap'))$('worldMap').innerHTML='<div class="mapError">No se pudo cargar el mapa mundial.</div>';return null}
  worldMapObj=new maplibregl.Map({
    container:'worldMap',style:sismiaBaseStyle(),center:[8,25],zoom:1.2,attributionControl:true,fadeDuration:0,renderWorldCopies:true
  });
  satelliteState.set(worldMapObj,false);
  worldMapObj.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  worldMapObj.addControl(satelliteControl(),'bottom-right');
  const install=()=>installWorldMapLayers(worldMapObj);
  worldMapObj.on('style.load',install);worldMapObj.on('load',install);
  worldMapObj.on('error',e=>{const msg=e?.error?.message||e?.message||'';if(msg&&!/tile/i.test(msg))console.warn('SISMIA world map',msg)});
  setTimeout(()=>{install();worldMapObj.resize?.()},120);
  return worldMapObj
}

function latestMarkerElement(kind,e){
  const el=document.createElement('button'),place=kind==='world'?(e.place||'Actividad mundial'):nearestTown(e.lat,e.lon).name;
  el.type='button';el.className='latest-seismo-marker '+(kind==='world'?'world':'local');
  el.setAttribute('aria-label',`Último seísmo ${kind==='world'?'mundial':'de Granada'}: magnitud ${e.mag.toFixed(1)} a las ${markerClock(e.time)}`);
  el.innerHTML=`<span class="latest-pin"></span><span class="latest-card"><em>ÚLTIMO</em><strong>M${e.mag.toFixed(1)} <i>${markerClock(e.time)}</i></strong><small>${safeMapText(place)}</small></span>`;
  el.onclick=ev=>{ev.stopPropagation();kind==='world'?selectWorld(e.id):showLocalEvent(e,mapForMarker(el))};return el
}
function mapForMarker(el){return [localMapObj,fullLocalMapObj,worldMapObj].find(m=>m&&m.getContainer()?.contains(el))||localMapObj}
function syncLatestMarker(kind,e,map){
  if(!map)return;const old=latestMarkers.get(map);if(old){try{old.remove()}catch(_){}}
  if(!e)return;
  try{const marker=new maplibregl.Marker({element:latestMarkerElement(kind,e),anchor:'bottom'}).setLngLat([e.lon,e.lat]).addTo(map);latestMarkers.set(map,marker)}
  catch(err){console.warn('SISMIA latest marker',err)}
}
function updateLatestMarkers(){
  const es=model?.e72||local.filter(e=>Date.now()-e.time<=72*36e5);
  if(localMapObj)syncLatestMarker('local',newest(es),localMapObj);
  if(fullLocalMapObj)syncLatestMarker('local',newest(es),fullLocalMapObj);
  if(worldMapObj)syncLatestMarker('world',newest(world),worldMapObj)
}

function ensureLocalEventPanel(map){
  let panel=localMapPanels.get(map);if(panel?.isConnected)return panel;
  const wrap=map.getContainer()?.closest('.mapWrap,.fullMapShell')||map.getContainer()?.parentElement;if(!wrap)return null;
  panel=document.createElement('aside');panel.className='mapEventPanel';panel.setAttribute('aria-live','polite');wrap.appendChild(panel);localMapPanels.set(map,panel);return panel
}
function setSelectedLocalPoint(map,e){const src=map?.getSource?.('local-selected');if(src)src.setData(pointFC(e))}
function clearSelectedLocalPoint(map){const src=map?.getSource?.('local-selected');if(src)src.setData(emptyFC())}
function closeLocalEventPanel(map){if(!map)return;clearSelectedLocalPoint(map);const panel=localMapPanels.get(map);if(panel)panel.classList.remove('on')}
window.closeLocalMapEvent=()=>{[localMapObj,fullLocalMapObj].filter(Boolean).forEach(closeLocalEventPanel);selectedLocal=null};
function localEventPanelHTML(e){
  const t=nearestTown(e.lat,e.lon),dG=hav(e.lat,e.lon,G.lat,G.lon),depth=Number.isFinite(e.depth)?e.depth.toFixed(1)+' km':'—';
  return `<button type="button" class="mapEventClose" aria-label="Cerrar información">×</button><div class="mapEventKicker">${severity(e.mag)}</div><div class="mapEventHeadline"><strong>M${e.mag.toFixed(1)}</strong><div><b>${safeMapText(t.name)}</b><span>${age(e.time)} · ${dateLocal(e.time)}</span></div></div><div class="mapEventFacts"><span><small>Profundidad</small><b>${depth}</b></span><span><small>Granada</small><b>${dG.toFixed(1)} km</b></span><span><small>Fuente</small><b>${safeMapText(e.source)}</b></span></div>`
}
function showLocalEvent(e,map=ensureLocalMap()){
  if(!map||!e)return;
  [localMapObj,fullLocalMapObj].filter(Boolean).forEach(m=>{if(m!==map)closeLocalEventPanel(m)});
  const panel=ensureLocalEventPanel(map);if(!panel)return;
  selectedLocal=e;setSelectedLocalPoint(map,e);
  panel.innerHTML=localEventPanelHTML(e);panel.className=`mapEventPanel on ${quakeTone(e.mag)}`;
  panel.querySelector('.mapEventClose')?.addEventListener('click',ev=>{ev.stopPropagation();closeLocalEventPanel(map);selectedLocal=null});
  const full=map===fullLocalMapObj,mobile=window.innerWidth<=760;
  const padding=mobile?{top:28,right:16,bottom:205,left:16}:{top:28,right:24,bottom:48,left:full?350:340};
  try{map.easeTo({center:[e.lon,e.lat],zoom:Math.max(map.getZoom(),full?10.05:10.35),padding,duration:360,essential:true})}
  catch(_){try{map.flyTo({center:[e.lon,e.lat],zoom:10.3,essential:true})}catch(__){}}
}
window.openLocal=id=>{
  const e=local.find(x=>String(x.id)===String(id));if(!e)return;
  const nowBtn=document.querySelector('[data-view="now"]');if(nowBtn&&!nowBtn.classList.contains('on'))nowBtn.click();
  requestAnimationFrame(()=>{
    const wrap=$('localMap')?.closest('.mapWrap')||$('localMap');wrap?.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>{
      const nav=document.querySelector('.nav');const offset=(nav?.getBoundingClientRect().height||0)+8;
      window.scrollBy({top:-offset,behavior:'smooth'});
      const m=ensureLocalMap();m?.resize?.();setTimeout(()=>showLocalEvent(e,m),100)
    },260)
  })
};
function sizeFullMapPage(){
  const nav=document.querySelector('.nav'),top=nav?Math.ceil(nav.getBoundingClientRect().bottom+4):116;
  document.documentElement.style.setProperty('--sismia-map-top',top+'px');
  requestAnimationFrame(()=>fullLocalMapObj?.resize?.())
}
window.addEventListener('resize',()=>{if(document.getElementById('map')?.classList.contains('on'))sizeFullMapPage()});
function weightedCenter(es){if(!es.length)return {lat:G.lat,lon:G.lon};const now=Date.now();let sw=0,la=0,lo=0;for(const e of es){const ageH=Math.max(.05,(now-e.time)/36e5),w=(1+Math.max(0,e.mag-MC))*(1/(1+ageH/6));sw+=w;la+=e.lat*w;lo+=e.lon*w}return {lat:la/sw,lon:lo/sw}}
