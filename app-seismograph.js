
(()=>{
const $=id=>document.getElementById(id);
let active=false, alarmOn=true, peak=0, started=0, samples=[], raf=0, audioCtx=null;
const MAX=240, THRESH=.18;
function mag(e){
 const a=e.accelerationIncludingGravity||e.acceleration||{};
 let x=Number(a.x)||0,y=Number(a.y)||0,z=Number(a.z)||0;
 const total=Math.sqrt(x*x+y*y+z*z);
 return Math.abs(total-9.80665);
}
function paint(){
 const c=$('seismoCanvas'); if(!c)return;
 const dpr=Math.min(devicePixelRatio||1,2),w=c.clientWidth,h=c.clientHeight;
 if(c.width!==w*dpr||c.height!==h*dpr){c.width=w*dpr;c.height=h*dpr}
 const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
 g.strokeStyle='rgba(255,255,255,.045)';g.lineWidth=1;
 for(let i=1;i<5;i++){g.beginPath();g.moveTo(0,h*i/5);g.lineTo(w,h*i/5);g.stroke()}
 if(samples.length>1){g.beginPath();samples.forEach((v,i)=>{const x=i/(MAX-1)*w,y=h/2-Math.max(-1,Math.min(1,v/.55))*h*.38;i?g.lineTo(x,y):g.moveTo(x,y)});g.strokeStyle='#ff8b2c';g.lineWidth=1.8;g.shadowColor='#ff8b2c';g.shadowBlur=7;g.stroke();g.shadowBlur=0}
 raf=requestAnimationFrame(paint)
}
function beep(){
 if(!alarmOn)return;
 try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();let o=audioCtx.createOscillator(),gain=audioCtx.createGain();o.frequency.value=760;gain.gain.setValueAtTime(.0001,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.12,audioCtx.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.22);o.connect(gain).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.24)}catch{}
}
let lastAlarm=0;
function onMotion(e){
 if(!active)return;
 const v=mag(e);samples.push(v);if(samples.length>MAX)samples.shift();peak=Math.max(peak,v);
 const lvl=Math.min(100,Math.round(v/.5*100));
 $('seismoLevel').textContent=lvl+'%';$('seismoPeak').textContent=peak.toFixed(3)+' m/s²';$('seismoDuration').textContent=((performance.now()-started)/1000).toFixed(1)+' s';
 let label=v>THRESH?'MOVIMIENTO FUERTE':v>.06?'VIBRACIÓN':'NORMAL';$('seismoLabel').textContent=label;
 const st=$('seismoState');st.classList.toggle('alert',v>THRESH);st.classList.toggle('live',v<=THRESH);st.querySelector('b').textContent=label;
 if(v>THRESH&&Date.now()-lastAlarm>1800){lastAlarm=Date.now();beep()}
}
async function start(){
 if(active){active=false;window.removeEventListener('devicemotion',onMotion);$('seismoStart').textContent='INICIAR MEDICIÓN';$('seismoState').className='seismoState';$('seismoState').querySelector('b').textContent='EN ESPERA';return}
 try{if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){const p=await DeviceMotionEvent.requestPermission();if(p!=='granted')throw Error('Permiso no concedido')}}
 catch(e){alert('Para usar el sismógrafo debes permitir el acceso a Movimiento y orientación.');return}
 active=true;peak=0;started=performance.now();samples=[];window.addEventListener('devicemotion',onMotion,{passive:true});$('seismoStart').textContent='DETENER';$('seismoState').className='seismoState live';$('seismoState').querySelector('b').textContent='MIDIENDO';
}
$('seismoStart')?.addEventListener('click',start);$('seismoAlarm')?.addEventListener('click',e=>{alarmOn=!alarmOn;e.currentTarget.textContent='ALARMA: '+(alarmOn?'ON':'OFF')});paint();

const baseStyle={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'}},layers:[{id:'osm',type:'raster',source:'osm',paint:{'raster-opacity':.72}}]};
const faults=[
 ['Falla de Alfacar',[[-3.59,37.29],[-3.55,37.24],[-3.52,37.19]]],
 ['Falla de Atarfe',[[-3.72,37.25],[-3.66,37.22],[-3.61,37.18]]],
 ['Falla de Granada',[[-3.62,37.23],[-3.60,37.17],[-3.58,37.11]]],
 ['Belicena-Alhendín',[[-3.68,37.20],[-3.65,37.13],[-3.62,37.07]]],
 ['Falla de Dílar',[[-3.61,37.12],[-3.57,37.06],[-3.53,37.00]]],
 ['Padul-Nigüelas',[[-3.64,37.04],[-3.60,36.98],[-3.55,36.91]]],
 ['Santa Fe',[[-3.76,37.22],[-3.70,37.17],[-3.66,37.11]]],
 ['Pinos Puente',[[-3.80,37.30],[-3.72,37.27],[-3.65,37.24]]]
];
function makeMap(id,mode){
 const el=$(id);if(!el||!window.maplibregl)return;
 const m=new maplibregl.Map({container:id,style:baseStyle,center:mode==='regional'?[-3.6,37.2]:[-3.61,37.16],zoom:mode==='regional'?6.7:9.3,attributionControl:true,interactive:true});
 m.on('load',()=>{
  if(mode==='fault'){
   m.addSource('faults',{type:'geojson',data:{type:'FeatureCollection',features:faults.map((f,i)=>({type:'Feature',properties:{name:f[0],i},geometry:{type:'LineString',coordinates:f[1]}}))}});
   m.addLayer({id:'faultGlow',type:'line',source:'faults',paint:{'line-color':'#ff6a2b','line-width':7,'line-opacity':.13,'line-blur':5}});
   m.addLayer({id:'faultLines',type:'line',source:'faults',paint:{'line-color':'#ff5b21','line-width':2.2,'line-opacity':.9}});
  } else if(mode==='ground'){
   const zones={type:'FeatureCollection',features:[
    {type:'Feature',properties:{c:'#ff493d',o:.24},geometry:{type:'Polygon',coordinates:[[[-3.82,37.30],[-3.54,37.30],[-3.50,37.12],[-3.72,37.05],[-3.82,37.30]]]}},
    {type:'Feature',properties:{c:'#ffb02e',o:.22},geometry:{type:'Polygon',coordinates:[[[-3.72,37.15],[-3.47,37.18],[-3.46,36.98],[-3.66,36.94],[-3.72,37.15]]]}}
   ]};m.addSource('zones',{type:'geojson',data:zones});m.addLayer({id:'zones',type:'fill',source:'zones',paint:{'fill-color':['get','c'],'fill-opacity':['get','o'],'fill-outline-color':'rgba(255,255,255,.5)'}});
  } else if(mode==='basin'){
   const basin={type:'Feature',geometry:{type:'Polygon',coordinates:[[[-3.86,37.32],[-3.55,37.34],[-3.43,37.20],[-3.49,36.99],[-3.72,36.96],[-3.88,37.10],[-3.86,37.32]]]},properties:{}};
   m.addSource('basin',{type:'geojson',data:basin});m.addLayer({id:'basinFill',type:'fill',source:'basin',paint:{'fill-color':'#ff8b2c','fill-opacity':.18,'fill-outline-color':'#ff8b2c'}});
  } else {
   const region={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[-6.2,36.4],[-4.8,36.7],[-3.6,37.2],[-2.4,37.5],[-1.2,38.0]]},properties:{}}]};
   m.addSource('betic',{type:'geojson',data:region});m.addLayer({id:'betic',type:'line',source:'betic',paint:{'line-color':'#ff7b25','line-width':5,'line-opacity':.55,'line-blur':1}});
  }
 });
}
makeMap('faultMap','fault');makeMap('groundMap','ground');makeMap('basinMap','basin');makeMap('regionalMap','regional');
})();
