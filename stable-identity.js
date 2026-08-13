(() => {
  const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';
  const version=(()=>{try{return new URL(document.currentScript?.src||location.href).searchParams.get('v')||Date.now()}catch{return Date.now()}})();
  const CATALOG_URL=`./data/nasa-total-eclipses.json?v=${version}`;
  const specialOld={'20260812':'#9b6cff','20270802':'#ff8a3d'};
  const specialVivid={'20260812':'#b45cff','20270802':'#ff7a1a'};
  const state={THREE:null,catalog:[],byColor:new Map(),ready:false,globe:null,lastItems:[]};

  function hashString(value){let h=2166136261;for(const c of String(value||'eclipse')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
  function oldStyle(meta){if(specialOld[meta.nasaId])return specialOld[meta.nasaId];const n=Number(meta.catalogNumber)||hashString(meta.id);const hue=(n*137.50776405)%360;return `hsl(${hue.toFixed(1)} ${72+(n%13)}% ${48+(n%9)}%)`}
  function vivid(meta){const c=new state.THREE.Color();if(specialVivid[meta.nasaId])return c.set(specialVivid[meta.nasaId]);const n=Number(meta.catalogNumber)||hashString(meta.id);return c.setHSL(((n*137.50776405)%360)/360,.96,[.56,.62,.68][Math.abs(n)%3])}
  function key(r,g,b){return `${Math.round(r*1e6)},${Math.round(g*1e6)},${Math.round(b*1e6)}`}
  function arrayKey(a,v){const o=v*3;return key(a[o],a[o+1],a[o+2])}

  function segments(alpha,count){
    if(!alpha||count<4)return[{start:0,end:count}];
    const starts=[0],pairs=Math.floor(count/2);
    for(let p=1;p<pairs;p++)if(Math.abs(alpha.getX((p-1)*2))<=1e-5&&Math.abs(alpha.getX(p*2))<=1e-5)starts.push(p*2);
    return starts.map((start,i)=>({start,end:i+1<starts.length?starts[i+1]:count})).filter(s=>s.end-s.start>=4);
  }

  function capture(items){
    for(const item of items||[]){
      if(item?.kind!=='ribbons')continue;
      const g=item.mesh?.geometry,c=g?.getAttribute?.('aColor');
      if(!g||!c)continue;
      g.userData=g.userData||{};
      if(!g.userData.stableOriginalColors){const original=g.userData.eclipseOriginalColors;g.userData.stableOriginalColors=original?new Float32Array(original):new Float32Array(c.array)}
    }
  }

  function closest(original,start){
    const exact=state.byColor.get(arrayKey(original,start));
    if(exact)return exact;
    const o=start*3,r=original[o],g=original[o+1],b=original[o+2];
    let best=null,dBest=Infinity;
    for(const meta of state.catalog){const t=meta._oldColor,dr=r-t.r,dg=g-t.g,db=b-t.b,d=dr*dr+dg*dg+db*db;if(d<dBest){dBest=d;best=meta}}
    return best;
  }

  function patch(mesh){
    if(!state.ready)return;
    const g=mesh?.geometry,c=g?.getAttribute?.('aColor'),a=g?.getAttribute?.('aAlpha');
    const original=g?.userData?.stableOriginalColors||g?.userData?.eclipseOriginalColors;
    if(!g||!c||!original)return;
    const ks=new Float32Array(c.count);
    for(const s of segments(a,c.count)){
      const meta=closest(original,s.start);if(!meta)continue;
      const col=vivid(meta);
      for(let v=s.start;v<s.end;v++){ks[v]=meta._hoverKey;c.setXYZ(v,col.r,col.g,col.b)}
    }
    g.setAttribute('aEclipseKey',new state.THREE.Float32BufferAttribute(ks,1));
    c.needsUpdate=true;g.getAttribute('aEclipseKey').needsUpdate=true;
  }

  function patchItems(items=state.lastItems){capture(items);for(const item of items||[])if(item?.kind==='ribbons')patch(item.mesh)}
  function schedule(items){state.lastItems=Array.isArray(items)?items:[];capture(state.lastItems);queueMicrotask(()=>patchItems());setTimeout(()=>patchItems(),0);setTimeout(()=>patchItems(),50);setTimeout(()=>patchItems(),150)}
  function attach(globe){if(!globe||globe.__exactEclipseIdentity)return;globe.__exactEclipseIdentity=true;state.globe=globe;const previous=globe.customLayerData.bind(globe);globe.customLayerData=function(value){if(!arguments.length)return previous();const items=Array.isArray(value)?value:[];capture(items);const out=previous(value);schedule(items);return out};try{const current=globe.customLayerData();if(Array.isArray(current))schedule(current)}catch{}}
  function wait(){if(window.eclipseGlobeInstance)return attach(window.eclipseGlobeInstance);let n=0;const timer=setInterval(()=>{if(window.eclipseGlobeInstance){clearInterval(timer);attach(window.eclipseGlobeInstance)}else if(++n>100)clearInterval(timer)},50)}

  Promise.all([import(THREE_URL),fetch(CATALOG_URL,{cache:'no-store'})]).then(async([THREE,response])=>{
    if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();
    state.THREE=THREE;state.catalog=(data.eclipses||[]).map((meta,index)=>({...meta,_hoverKey:index+1}));
    for(const meta of state.catalog){meta._oldColor=new THREE.Color(oldStyle(meta));state.byColor.set(key(meta._oldColor.r,meta._oldColor.g,meta._oldColor.b),meta)}
    state.ready=true;wait();if(state.globe)patchItems();
  }).catch(error=>console.warn('Identité stable des éclipses indisponible :',error));
})();
