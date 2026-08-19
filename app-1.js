
const $=id=>document.getElementById(id), G={lat:37.1773,lon:-3.5986}, MC=1.5;
let local=[], world=[], localMapObj=null, fullLocalMapObj=null, worldMapObj=null, selectedWorld=null, model=null, interacted=false, lastAlertState=false, sourceMeta={local:null,world:null,fetchedAt:null};
let localLatestMarker=null,worldLatestMarker=null,lastLatestLocalId=null,lastLatestWorldId=null,worldPopup=null;
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
/* El popup usaba siempre nearestTown(), que solo conoce municipios del área de
   Granada: un sismo mundial aparecía rotulado como "Padul · 5352 km". Si el
   evento está lejos se usa su propia localización (place) del catálogo. */
function eventPlaceLabel(e){const town=nearestTown(e.lat,e.lon);if(town.d>60)return e.place||'Localización no disponible';return town.name+(town.d>1?' · '+town.d.toFixed(1)+' km':'')}
function popupHTML(e){const dG=hav(e.lat,e.lon,G.lat,G.lon);return `<div class="popupMag">M${e.mag.toFixed(1)}</div><div class="popupPlace">${safeMapText(eventPlaceLabel(e))}</div><div class="popupGrid"><div class="popupCell"><span>Hace</span><b>${age(e.time)}</b></div><div class="popupCell"><span>Hora local</span><b>${dateLocal(e.time)}</b></div><div class="popupCell"><span>Profundidad</span><b>${Number.isFinite(e.depth)?e.depth.toFixed(1)+' km':'—'}</b></div><div class="popupCell"><span>Clase</span><b>${severity(e.mag)}</b></div><div class="popupCell"><span>Dist. Granada</span><b>${dG.toFixed(1)} km</b></div><div class="popupCell"><span>Intensidad oficial</span><b>${e.intensity||'no incluida'}</b></div></div>`}
function circlePoly(lat,lon,rKm,n=64){const pts=[];for(let i=0;i<=n;i++){const br=2*Math.PI*i/n,dr=rKm/6371,la=rad(lat),lo=rad(lon);const la2=Math.asin(Math.sin(la)*Math.cos(dr)+Math.cos(la)*Math.sin(dr)*Math.cos(br));const lo2=lo+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(la),Math.cos(dr)-Math.sin(la)*Math.sin(la2));pts.push([deg(lo2),deg(la2)])}return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[pts]}}}
function eventFC(es){return {type:'FeatureCollection',features:es.map(e=>({type:'Feature',id:String(e.id),properties:{id:String(e.id),mag:e.mag,place:e.place,time:e.time,depth:e.depth,source:e.source},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}))}}
function shiftLatLon(lat,lon,km,bearingDeg){const d=km/6371,br=rad(bearingDeg),la=rad(lat),lo=rad(lon),la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(br)),lo2=lo+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));return{lat:deg(la2),lon:deg(lo2)}}
function forecastProjection(h=forecastHorizon){if(!model)return{center:G,radius:6,events:[]};const b=model.migrationBearing??0,shift=Math.min(model.radius*.65,(model.migration||0)*Math.max(0.3,h/6)*.35),c=shiftLatLon(model.center.lat,model.center.lon,shift,b),radius=clamp(model.radius*(1+.18*h/24),3,32),events=(model.e24.length?model.e24:model.e72).map(e=>{const q=shiftLatLon(e.lat,e.lon,shift,b);return{...e,lat:q.lat,lon:q.lon}});return{center:c,radius,events}}
function snapshotNow(){if(!model)return null;return{at:Date.now(),events72:model.e72.length,events6:model.e6.length,max:model.max,score:model.score,center:model.center,radius:model.radius,p3:model.p3}}
function deltaText(v,suffix=''){if(!Number.isFinite(v))return'—';return`${v>0?'+':''}${typeof v==='number'&&Math.abs(v)<10?v.toFixed(1):Math.round(v)}${suffix}`}
function saveVisitSnapshot(){const snap=snapshotNow();if(snap)try{localStorage.setItem('sismia-last-visit-v9',JSON.stringify(snap))}catch(_){}}
function renderChanges(){const es=local.slice().sort((a,b)=>b.time-a.time).slice(0,5);$('changeBadge').textContent=es.length?`${es.length} ÚLTIMOS`:'SIN DATOS';$('changeGrid').innerHTML=es.map((e,i)=>recentEventMarkup(e,i)).join('')||'<div class="notice">No hay eventos locales disponibles.</div>'}
/* Los bloques "escenarios", "ADN sísmico" y "horizonte" no están en index.html
   (quedaron de una versión anterior). Se comprueba el contenedor antes de escribir
   para que no lancen TypeError si se vuelven a llamar. */
function renderScenarios(){if(!model||!$('scenarioGrid'))return;let decay=clamp(60-(model.accel-1)*28-model.p3*.18,8,88),persistent=clamp(28+Math.abs(model.accel-1)*18+model.e24*.25,8,75),escalation=clamp(8+model.p3*.35+Math.max(0,model.max-3)*9,3,65),sum=decay+persistent+escalation;decay=100*decay/sum;persistent=100*persistent/sum;escalation=100*escalation/sum;$('scenarioGrid').innerHTML=[['Decaimiento',decay,'Menor ritmo y progresiva relajación de la secuencia.'],['Persistencia',persistent,'Continúan microeventos/M2–M3 sin cambio brusco.'],['Escalada',escalation,'Aumenta el peso relativo de un evento significativamente mayor.']].map(x=>`<div class="scenario"><div class="pct">${Math.round(x[1])}%</div><b>${x[0]}</b><small>${x[2]} Peso heurístico, no probabilidad calibrada.</small></div>`).join('')}
function setForecastHorizon(h){forecastHorizon=Number(h)||3;document.querySelectorAll('#horizonBtns button').forEach(b=>b.classList.toggle('on',Number(b.dataset.h)===forecastHorizon));if($('horizonBadge'))$('horizonBadge').textContent=(forecastHorizon===3?'0–3':forecastHorizon===6?'3–6':forecastHorizon===12?'6–12':'12–24')+' H';renderLocalMap()}
function dnaVector(m=model){if(!m)return[];return[['Frecuencia',clamp(m.rate/3,0,1),m.rate.toFixed(2)+'/h'],['Magnitud',clamp(m.max/5,0,1),'M'+m.max.toFixed(1)],['Superficial',clamp(m.shallow,0,1),Math.round(m.shallow*100)+'%'],['Cluster',clamp(1-m.radius/30,0,1),m.radius.toFixed(1)+' km'],['b-value',clamp((m.b||0)/1.8,0,1),m.b?m.b.toFixed(2):'N/D'],['Aceleración',clamp(m.accel/2.5,0,1),m.accel.toFixed(2)+'×']]}
function renderDNA(){if(!model||!$('dnaGrid'))return;const v=dnaVector();$('dnaGrid').innerHTML=v.map(x=>`<div class="dnaCell"><span>${x[0]}</span><strong>${x[2]}</strong><div class="miniTrack"><i style="width:${Math.round(x[1]*100)}%"></i></div></div>`).join('')}



/* Etiqueta única para la insignia de la pestaña Análisis: la calculaban por
   separado renderAnalysis() (siempre "DATOS EN VIVO") y renderSourceMeta(), así
   que al abrir Análisis sin conexión se anunciaban datos en vivo inexistentes. */
function analysisStateLabel(){const lm=sourceMeta.local;return lm?.ok?'EMSC LIVE':lm?.cached?'EMSC CACHÉ':'SIN DATOS'}
function newest(es){return es?.length?es.reduce((a,b)=>!a||b.time>a.time?b:a,null):null}
function markerClock(t){return new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(new Date(t))}
function safeMapText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* MAPA V16 — base estable V5/V15 + esferas, aura térmica y satélite. */
function localQuakeColor(){return ['step',['to-number',['get','mag'],0],'#2F9CFF',2,'#FFD84D',3,'#FF922E',4,'#FF4B3E',5,'#D91932']}
function worldQuakeColor(){return ['step',['to-number',['get','mag'],0],'#2F9CFF',6.3,'#FFD84D',7.1,'#FF922E',8,'#FF4B3E',8.7,'#D91932']}
/* Radio = f(zoom, magnitud). El factor `scale` se aplica DENTRO de las paradas:
   MapLibre rechaza ['*',<expresión con zoom>,k] porque "zoom" solo puede ser
   entrada de un interpolate/step de primer nivel. */
function magRadius(stops,scale=1){const out=['interpolate',['linear'],['to-number',['get','mag'],0]];for(const [m,r] of stops)out.push(m,+(r*scale).toFixed(3));return out}
function localPointRadius(scale=1){return ['interpolate',['linear'],['zoom'],
  7,magRadius([[1.5,2.7],[2,3.0],[3,3.8],[4,4.8],[5,5.9]],scale),
  10,magRadius([[1.5,4.2],[2,4.7],[3,5.8],[4,7.1],[5,8.5]],scale),
  13,magRadius([[1.5,5.2],[2,5.9],[3,7.2],[4,8.9],[5,10.6]],scale)
]}
function localHaloRadius(){return ['interpolate',['linear'],['zoom'],
  7,['interpolate',['linear'],['to-number',['get','mag'],0],1.5,7,2,8,3,10,4,13,5,16],
  10,['interpolate',['linear'],['to-number',['get','mag'],0],1.5,10,2,12,3,15,4,19,5,23],
  13,['interpolate',['linear'],['to-number',['get','mag'],0],1.5,14,2,16,3,20,4,25,5,31]
]}
function worldPointRadius(scale=1){return ['interpolate',['linear'],['zoom'],
  1,magRadius([[5.5,4.0],[6.5,5.0],[7.5,6.3],[9,8.2]],scale),
  3,magRadius([[5.5,5.2],[6.5,6.5],[7.5,8.3],[9,11.5]],scale)
]}
function emptyFC(){return {type:'FeatureCollection',features:[]}}
function pointFC(e){return e?{type:'FeatureCollection',features:[{type:'Feature',properties:{id:String(e.id),mag:e.mag},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}]}:emptyFC()}

function addGranada(map){
  if(map.getSource('granada'))return;
  map.addSource('granada',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[G.lon,G.lat]}}});
  map.addLayer({id:'granada-ring',type:'circle',source:'granada',paint:{'circle-radius':8,'circle-color':'rgba(255,255,255,.12)','circle-stroke-color':'#fff','circle-stroke-width':1.8}});
  map.addLayer({id:'granada-label',type:'symbol',source:'granada',layout:{'text-field':'GRANADA','text-size':12,'text-offset':[0,1.5],'text-anchor':'top'},paint:{'text-color':'#fff','text-halo-color':'#050608','text-halo-width':1.7}})
}

function addLocalLayers(map){
  if(map.getSource('local-quakes'))return;
  map.addSource('cluster-zone',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'cluster-zone-fill',type:'fill',source:'cluster-zone',paint:{'fill-color':'#ff9b4a','fill-opacity':.018}});
  map.addLayer({id:'cluster-zone-line',type:'line',source:'cluster-zone',paint:{'line-color':'#ff9b4a','line-width':1.2,'line-dasharray':[3,2],'line-opacity':.40}});

  map.addSource('local-quakes',{type:'geojson',data:emptyFC()});

  /* Aura térmica muy suave: solo refuerza zonas donde coinciden proximidad + magnitud. */
  map.addLayer({id:'local-heat',type:'heatmap',source:'local-quakes',maxzoom:13,paint:{
    'heatmap-weight':['interpolate',['linear'],['to-number',['get','mag'],0],1.5,.12,2,.22,3,.48,4,.78,5,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],7,.30,10,.48,13,.60],
    'heatmap-radius':['interpolate',['linear'],['zoom'],7,13,10,20,13,27],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],7,.12,10,.18,13,.13],
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.18,'rgba(47,156,255,.10)',.38,'rgba(255,216,77,.13)',.63,'rgba(255,146,46,.18)',.82,'rgba(255,75,62,.22)',1,'rgba(217,25,50,.25)']
  }});

  /* Sombra inferior: aporta volumen sin perder el color de magnitud. */
  map.addLayer({id:'local-sphere-shadow',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localPointRadius(),'circle-color':'#000','circle-opacity':.34,'circle-blur':.28,'circle-translate':[1.4,1.8]
  }});
  /* Halo individual que se funde con el aura térmica. */
  map.addLayer({id:'local-halo',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localHaloRadius(),'circle-color':localQuakeColor(),
    'circle-opacity':['interpolate',['linear'],['zoom'],7,.14,10,.20,13,.24],'circle-blur':.84,'circle-stroke-width':0
  }});
  /* Esfera central. */
  map.addLayer({id:'local-points',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localPointRadius(),'circle-color':localQuakeColor(),
    'circle-stroke-color':'rgba(255,255,255,.94)','circle-stroke-width':['interpolate',['linear'],['zoom'],7,.8,10,1.15,13,1.45],'circle-opacity':1
  }});
  /* Brillo desplazado = sensación de esfera/degradado. */
  map.addLayer({id:'local-sphere-shine',type:'circle',source:'local-quakes',paint:{
    'circle-radius':localPointRadius(.42),'circle-color':'#fff','circle-opacity':.40,'circle-blur':.28,'circle-translate':[-1.5,-1.7]
  }});
  /* Capa invisible de toque. */
  map.addLayer({id:'local-hit',type:'circle',source:'local-quakes',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],7,8,10,10,13,12],'circle-color':'#000','circle-opacity':.001,'circle-stroke-width':0
  }});
  map.addSource('local-selected',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'local-selected-ring',type:'circle',source:'local-selected',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],7,8,10,11,13,14],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#fff','circle-stroke-width':3,'circle-opacity':1
  }});

  const pick=ev=>{const f=ev.features?.[0];if(!f)return;const e=local.find(x=>String(x.id)===String(f.properties.id));if(e)showLocalEvent(e,map)};
  map.on('click','local-hit',pick);
  map.on('mouseenter','local-hit',()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','local-hit',()=>map.getCanvas().style.cursor='')
}

function addWorldLayers(map){
  if(map.getSource('world-quakes'))return;
  map.addSource('world-quakes',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'world-heat',type:'heatmap',source:'world-quakes',maxzoom:5,paint:{
    'heatmap-weight':['interpolate',['linear'],['to-number',['get','mag'],0],5.5,.18,6.5,.42,7.5,.72,9,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],0,.32,3,.52,5,.62],
    'heatmap-radius':['interpolate',['linear'],['zoom'],0,13,3,23,5,31],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],0,.10,3,.17,5,.12],
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.2,'rgba(47,156,255,.08)',.42,'rgba(255,216,77,.12)',.65,'rgba(255,146,46,.16)',.84,'rgba(255,75,62,.21)',1,'rgba(217,25,50,.24)']
  }});
  map.addLayer({id:'world-shadow',type:'circle',source:'world-quakes',paint:{'circle-radius':worldPointRadius(),'circle-color':'#000','circle-opacity':.34,'circle-blur':.28,'circle-translate':[1.3,1.6]}});
  map.addLayer({id:'world-glow',type:'circle',source:'world-quakes',paint:{'circle-radius':worldPointRadius(2.8),'circle-color':worldQuakeColor(),'circle-opacity':.20,'circle-blur':.82}});
  map.addLayer({id:'world-points',type:'circle',source:'world-quakes',paint:{'circle-radius':worldPointRadius(),'circle-color':worldQuakeColor(),'circle-stroke-color':'rgba(255,255,255,.94)','circle-stroke-width':1.2,'circle-opacity':1}});
  map.addLayer({id:'world-shine',type:'circle',source:'world-quakes',paint:{'circle-radius':worldPointRadius(.42),'circle-color':'#fff','circle-opacity':.40,'circle-blur':.25,'circle-translate':[-1.4,-1.6]}});
  map.on('click','world-points',ev=>{const f=ev.features?.[0];if(f)selectWorld(String(f.properties.id))});
  map.addSource('world-link',{type:'geojson',data:emptyFC()});
  map.addLayer({id:'world-link-line',type:'line',source:'world-link',paint:{'line-color':'#ff9b4a','line-width':2,'line-dasharray':[2,2],'line-opacity':.78}})
}

function addSatelliteLayer(map){
  try{
    if(map.getSource('sismia-satellite'))return;
    map.addSource('sismia-satellite',{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'© Esri'});
    const firstSymbol=(map.getStyle()?.layers||[]).find(l=>l.type==='symbol')?.id;
    map.addLayer({id:'sismia-satellite-layer',type:'raster',source:'sismia-satellite',layout:{visibility:'none'},paint:{'raster-opacity':.96,'raster-saturation':-.05,'raster-contrast':.05}},firstSymbol)
  }catch(e){console.warn('SISMIA satellite layer',e)}
}
function satelliteControl(){let map,button;return{
  onAdd(m){map=m;const wrap=document.createElement('div');wrap.className='maplibregl-ctrl maplibregl-ctrl-group sismiaSatelliteCtrl';button=document.createElement('button');button.type='button';button.className='sismiaSatelliteBtn';button.setAttribute('aria-label','Cambiar a vista satélite');button.innerHTML='<span>◉</span><b>SATÉLITE</b>';button.onclick=()=>{const layer=map.getLayer('sismia-satellite-layer');if(!layer){toast('Satélite no disponible','La capa todavía no ha terminado de cargar.');return}const sat=map.getLayoutProperty('sismia-satellite-layer','visibility')!=='visible';map.setLayoutProperty('sismia-satellite-layer','visibility',sat?'visible':'none');button.classList.toggle('on',sat);button.innerHTML=sat?'<span>◇</span><b>MAPA</b>':'<span>◉</span><b>SATÉLITE</b>';button.setAttribute('aria-label',sat?'Volver a vista de mapa':'Cambiar a vista satélite')};wrap.appendChild(button);return wrap},
  onRemove(){button?.parentNode?.remove();map=undefined}
}}

function tuneLocalBaseMap(map){
  /* Solo retoque cosmético; cualquier incompatibilidad se ignora y nunca bloquea el mapa. */
  for(const layer of map.getStyle()?.layers||[]){const id=(layer.id||'').toLowerCase();try{
    if(layer.type==='background')map.setPaintProperty(layer.id,'background-color','#050608');
    else if(layer.type==='line'&&/motorway|trunk|primary/.test(id)){map.setPaintProperty(layer.id,'line-color','#9b6848');map.setPaintProperty(layer.id,'line-opacity',.62)}
    else if(layer.type==='symbol'&&layer.layout?.['text-field']){map.setPaintProperty(layer.id,'text-color','#cfd3d8');map.setPaintProperty(layer.id,'text-halo-color','#050608');map.setPaintProperty(layer.id,'text-halo-width',1.2)}
  }catch(_){}}
}

function makeLocalMap(container,full=false){
  const el=typeof container==='string'?$(container):container;
  if(!el)return null;
  if(!window.maplibregl){el.innerHTML='<div class="mapError">No se pudo cargar MapLibre. Comprueba Internet y recarga.</div>';return null}
  const map=new maplibregl.Map({container:el,style:'https://tiles.openfreemap.org/styles/dark',center:[-3.62,37.12],zoom:full?9.45:9.6,pitch:0,bearing:0,attributionControl:true});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  map.addControl(satelliteControl(),'bottom-right');
  map.on('load',()=>{
    try{tuneLocalBaseMap(map)}catch(_){}
    try{addSatelliteLayer(map)}catch(e){console.warn('SISMIA satélite',e)}
    try{addGranada(map)}catch(e){console.warn('SISMIA capa Granada',e)}
    try{addLocalLayers(map)}catch(e){console.warn('SISMIA capas locales',e)}
    try{renderLocalMap()}catch(e){console.warn('SISMIA render mapa local',e)}
    map.once('idle',()=>{try{renderLocalMap()}catch(_){}});
  });
  map.on('error',e=>{const msg=e?.error?.message||e?.message||'';if(msg&&!/tile/i.test(msg))console.warn('SISMIA map',msg)});
  return map
}
function ensureLocalMap(){if(localMapObj)return localMapObj;localMapObj=makeLocalMap('localMap',false);return localMapObj}
function ensureFullLocalMap(){if(fullLocalMapObj)return fullLocalMapObj;fullLocalMapObj=makeLocalMap('fullLocalMap',true);return fullLocalMapObj}
function ensureWorldMap(){
  if(worldMapObj)return worldMapObj;
  if(!$('worldMap'))return null;
  if(!window.maplibregl){$('worldMap').innerHTML='<div class="mapError">No se pudo cargar el mapa mundial. Comprueba Internet y recarga.</div>';return null}
  worldMapObj=new maplibregl.Map({container:'worldMap',style:'https://tiles.openfreemap.org/styles/dark',center:[8,25],zoom:1.2,attributionControl:true});
  worldMapObj.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  worldMapObj.addControl(satelliteControl(),'bottom-right');
  worldMapObj.on('error',e=>{const msg=e?.error?.message||e?.message||'';if(msg&&!/tile/i.test(msg))console.warn('SISMIA world map',msg)});
  worldMapObj.on('load',()=>{
    try{tuneLocalBaseMap(worldMapObj)}catch(_){}
    try{addSatelliteLayer(worldMapObj)}catch(e){console.warn('SISMIA satélite mundo',e)}
    try{addGranada(worldMapObj)}catch(e){console.warn('SISMIA capa Granada mundo',e)}
    try{addWorldLayers(worldMapObj)}catch(e){console.warn('SISMIA capas mundo',e)}
    try{renderWorldMap()}catch(e){console.warn('SISMIA render mapa mundo',e)}
    worldMapObj.once('idle',()=>{try{renderWorldMap()}catch(_){}})
  });
  return worldMapObj
}

function latestMarkerElement(kind,e){const el=document.createElement('button'),place=kind==='world'?(e.place||'Actividad mundial'):nearestTown(e.lat,e.lon).name;el.type='button';el.className='latest-seismo-marker '+(kind==='world'?'world':'local');el.setAttribute('aria-label',`Último seísmo ${kind==='world'?'mundial':'de Granada'}: magnitud ${e.mag.toFixed(1)} a las ${markerClock(e.time)}`);el.innerHTML=`<span class="latest-pin"></span><span class="latest-card"><em>ÚLTIMO</em><strong>M${e.mag.toFixed(1)} <i>${markerClock(e.time)}</i></strong><small>${safeMapText(place)}</small></span>`;el.onclick=ev=>{ev.stopPropagation();kind==='world'?selectWorld(e.id):showLocalEvent(e,mapForMarker(el))};return el}
function mapForMarker(el){return [localMapObj,fullLocalMapObj,worldMapObj].find(m=>m&&m.getContainer()?.contains(el))||localMapObj}
function syncLatestMarker(kind,e,map){if(!map)return;const old=latestMarkers.get(map);if(old){try{old.remove()}catch(_){}}if(!e)return;try{const marker=new maplibregl.Marker({element:latestMarkerElement(kind,e),anchor:'bottom'}).setLngLat([e.lon,e.lat]).addTo(map);latestMarkers.set(map,marker)}catch(err){console.warn('SISMIA latest marker',err)}}
function updateLatestMarkers(){const es=model?.e72||local.filter(e=>Date.now()-e.time<=72*36e5);if(localMapObj)syncLatestMarker('local',newest(es),localMapObj);if(fullLocalMapObj)syncLatestMarker('local',newest(es),fullLocalMapObj);if(worldMapObj)syncLatestMarker('world',newest(world),worldMapObj)}

function ensureLocalEventPanel(map){let panel=localMapPanels.get(map);if(panel?.isConnected)return panel;const wrap=map.getContainer()?.closest('.mapWrap,.fullMapShell')||map.getContainer()?.parentElement;if(!wrap)return null;panel=document.createElement('aside');panel.className='mapEventPanel';panel.setAttribute('aria-live','polite');wrap.appendChild(panel);localMapPanels.set(map,panel);return panel}
function setSelectedLocalPoint(map,e){const src=map?.getSource?.('local-selected');if(src)src.setData(pointFC(e))}
function clearSelectedLocalPoint(map){const src=map?.getSource?.('local-selected');if(src)src.setData(emptyFC())}
function closeLocalEventPanel(map){if(!map)return;clearSelectedLocalPoint(map);const panel=localMapPanels.get(map);if(panel)panel.classList.remove('on')}
window.closeLocalMapEvent=()=>{[localMapObj,fullLocalMapObj].filter(Boolean).forEach(closeLocalEventPanel);selectedLocal=null};
function localEventPanelHTML(e){const t=nearestTown(e.lat,e.lon),dG=hav(e.lat,e.lon,G.lat,G.lon),depth=Number.isFinite(e.depth)?e.depth.toFixed(1)+' km':'—';return `<button type="button" class="mapEventClose" aria-label="Cerrar información">×</button><div class="mapEventKicker">${severity(e.mag)}</div><div class="mapEventHeadline"><strong>M${e.mag.toFixed(1)}</strong><div><b>${safeMapText(t.name)}</b><span>${age(e.time)} · ${dateLocal(e.time)}</span></div></div><div class="mapEventFacts"><span><small>Profundidad</small><b>${depth}</b></span><span><small>Granada</small><b>${dG.toFixed(1)} km</b></span><span><small>Fuente</small><b>${safeMapText(e.source)}</b></span></div>`}
function showLocalEvent(e,map=ensureLocalMap()){
  if(!map||!e)return;
  /* Solo una ficha abierta en toda la app. */
  [localMapObj,fullLocalMapObj].filter(Boolean).forEach(m=>{if(m!==map)closeLocalEventPanel(m)});
  const panel=ensureLocalEventPanel(map);if(!panel)return;
  selectedLocal=e;setSelectedLocalPoint(map,e);
  panel.innerHTML=localEventPanelHTML(e);panel.className=`mapEventPanel on ${quakeTone(e.mag)}`;
  panel.querySelector('.mapEventClose')?.addEventListener('click',ev=>{ev.stopPropagation();closeLocalEventPanel(map);selectedLocal=null});
  const full=map===fullLocalMapObj,mobile=window.innerWidth<=760;
  const padding=mobile?{top:28,right:16,bottom:205,left:16}:{top:28,right:24,bottom:48,left:full?350:340};
  try{map.easeTo({center:[e.lon,e.lat],zoom:Math.max(map.getZoom(),full?10.05:10.35),padding,duration:430,essential:true})}catch(_){try{map.flyTo({center:[e.lon,e.lat],zoom:10.3,essential:true})}catch(__){}}
}
window.openLocal=id=>{const e=local.find(x=>String(x.id)===String(id));if(!e)return;const nowBtn=document.querySelector('[data-view="now"]');if(nowBtn&&!nowBtn.classList.contains('on'))nowBtn.click();requestAnimationFrame(()=>{const wrap=$('localMap')?.closest('.mapWrap')||$('localMap');wrap?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>{const nav=document.querySelector('.nav');const offset=(nav?.getBoundingClientRect().height||0)+8;window.scrollBy({top:-offset,behavior:'smooth'});const m=ensureLocalMap();m?.resize?.();setTimeout(()=>showLocalEvent(e,m),120)},280)})};
function sizeFullMapPage(){const nav=document.querySelector('.nav'),top=nav?Math.ceil(nav.getBoundingClientRect().bottom+4):116;document.documentElement.style.setProperty('--sismia-map-top',top+'px');setTimeout(()=>fullLocalMapObj?.resize(),30)}
window.addEventListener('resize',()=>{if(document.getElementById('map')?.classList.contains('on'))sizeFullMapPage()});
function weightedCenter(es){if(!es.length)return {lat:G.lat,lon:G.lon};const now=Date.now();let sw=0,la=0,lo=0;for(const e of es){const ageH=Math.max(.05,(now-e.time)/36e5),w=(1+Math.max(0,e.mag-MC))*(1/(1+ageH/6));sw+=w;la+=e.lat*w;lo+=e.lon*w}return {lat:la/sw,lon:lo/sw}}
