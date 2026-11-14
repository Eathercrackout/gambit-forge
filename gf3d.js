/* Gambit Forge 3D board — Three.js, lazy-loaded, phone-friendly */
(function(G){
'use strict';
const api={};
G.GF3D=api;

let T, scene, camera, renderer, root, boardG, pieceG, markG, fxG, rimG, labG;
let host=null, raf=0, reduced=false, coordsOn=true, flipped=false, theme='wood';
let onClick=null, onFallback=null, tweens=[], parts=[], shake=0, dirty=true, running=false;
let view={th:0, ph:1.02, d:13.6}, vDef={th:0, ph:1.02, d:13.6};
let drag=false, didMove=false, px=0, py=0, pid=null, pins={}, tiles=[], lastHint=null;
let lights={}, mats={}, geos=null, pieceCache={}, labels=[], fpsWin=[], failN=0, tPrev=0;
let lowHint=false, mountedAt=0, envMap=null, envRT=null, matCache={}, palCache={}, sprTex=null, partPool=[], fxLights=[];

const COL={
 w:{body:0xf6eedd, pearl:0xfff8ee, acc:0xd4af37, ink:0x4a3420, sheen:0xfff4e4},
 b:{body:0x16181e, pearl:0x23262e, acc:0xc5ccd6, ink:0x07070a, sheen:0x8a92a4}
};
const THEME3D={
 wood:{rim:0x3a200d, emit:0x000000, gloss:.25, metal:0, light:0xfff0d8, amb:.55, fog:null, edge:0},
 slate:{rim:0x1c222b, emit:0x000000, gloss:.4, metal:.05, light:0xe8eef6, amb:.6, fog:null, edge:0},
 marble:{rim:0x3f464f, emit:0x000000, gloss:.7, metal:.08, light:0xf6f7fa, amb:.65, fog:null, edge:0},
 volcano:{rim:0x120604, emit:0x3a1208, gloss:.35, metal:.05, light:0xffc8a0, amb:.4, fog:[0x1a0804,18,32], edge:0xff4a10},
 underwater:{rim:0xa8875a, emit:0x042030, gloss:.55, metal:0, light:0xb8fff6, amb:.55, fog:[0x0a3a4a,16,30], edge:0x4ad0c8},
 ebony:{rim:0x0d0805, emit:0x000000, gloss:.3, metal:0, light:0xffe6c0, amb:.5, fog:null, edge:0},
 cherry:{rim:0x3c0d08, emit:0x2a0806, gloss:.3, metal:0, light:0xffd4c0, amb:.55, fog:null, edge:0},
 greenmarble:{rim:0x0c2419, emit:0x000000, gloss:.65, metal:.06, light:0xe8ffe8, amb:.6, fog:null, edge:0},
 neon:{rim:0x05050c, emit:0x0a0a22, gloss:.8, metal:.2, light:0xccffff, amb:.35, fog:[0x05050c,20,36], edge:0x00f0ff},
 minimal:{rim:0xf2f2f2, emit:0x000000, gloss:.15, metal:0, light:0xffffff, amb:.8, fog:null, edge:0},
 tournament:{rim:0x2d3a1e, emit:0x000000, gloss:.28, metal:0, light:0xfff6d8, amb:.6, fog:null, edge:0},
 ocean:{rim:0x0b3f7a, emit:0x062040, gloss:.5, metal:0, light:0xd8f0ff, amb:.6, fog:[0x0c3466,22,40], edge:0x66ccff},
 desert:{rim:0x8a5a22, emit:0x000000, gloss:.22, metal:0, light:0xffefc8, amb:.65, fog:null, edge:0},
 midnight:{rim:0x1a1030, emit:0x140820, gloss:.4, metal:.05, light:0xd8c8ff, amb:.4, fog:[0x12081c,16,30], edge:0x9b8cc9},
 ice:{rim:0x7aa8c0, emit:0x204050, gloss:.8, metal:.1, light:0xf2fbff, amb:.7, fog:[0xd0e8f4,24,40], edge:0xb8e0f4},
 paper:{rim:0xc8c0b0, emit:0x000000, gloss:.05, metal:0, light:0xfffaf0, amb:.85, fog:null, edge:0},
 contrast:{rim:0x222222, emit:0x000000, gloss:.1, metal:0, light:0xffffff, amb:.85, fog:null, edge:0}
};

api.supported=function(){try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl'))}catch(e){return false}};
api.active=()=>!!(renderer&&host);
api.ready=()=>!!T;

function hex(c){return new T.Color(c)}
function cssHex(v,fb){v=(v||'').trim();if(/^#/.test(v))return parseInt(v.slice(1),16);if(/^rgb/.test(v)){const n=v.match(/\d+/g)||[];return ((n[0]<<16)|(n[1]<<8)|n[2])>>>0}return fb}
function SG(){return reduced?8:16}
function SM(){return reduced?8:12}
function SLo(){return reduced?6:10}

function lathe(pts,seg){
 return new T.LatheGeometry(pts.map(p=>new T.Vector2(p[0],p[1])), seg||SG());
}
function wingShape(span,chord,sweep){
 const sh=new T.Shape();
 sh.moveTo(0,0);
 sh.quadraticCurveTo(span*.42, chord*.85, span, chord*(sweep||.18));
 sh.quadraticCurveTo(span*.72, -chord*.22, span*.32, -chord*.18);
 sh.lineTo(0,-.03);sh.closePath();
 const bev=!reduced;
 return new T.ExtrudeGeometry(sh,{depth:reduced?.02:.036,bevelEnabled:bev,bevelThickness:bev?.012:0,bevelSize:bev?.018:0,bevelSegments:bev?2:0,curveSegments:reduced?5:10});
}

function geoLib(){
 if(geos)return geos;
 const g={}, S=SG(), M=SM(), L=SLo();
 const cyl=(a,b,h,s)=>new T.CylinderGeometry(a,b,h,s||S);
 const sph=(r,w,h)=>new T.SphereGeometry(r,w||S,h||M);
 const box=(x,y,z)=>new T.BoxGeometry(x,y,z);
 const cone=(r,h,s)=>new T.ConeGeometry(r,h,s||L);
 const cap=(r,len,s)=> new T.CapsuleGeometry(r,len,s||M,s||S);
 g.foot=lathe([[0,0],[.36,0],[.36,.025],[.31,.045],[.28,.07],[.22,.1],[.18,.12],[0,.12]],S);
 g.ring=lathe([[0,0],[.22,0],[.24,.02],[.2,.05],[.16,.055],[0,.055]],S);
 g.stem=lathe([[0,0],[.105,0],[.09,.5],[.11,.92],[.14,1],[0,1]],S);
 g.collar=lathe([[0,0],[.16,0],[.17,.02],[.15,.05],[.12,.055],[0,.055]],S);
 g.ball=sph(.16,S,M); g.ballS=sph(.11,M,L); g.ballL=sph(.22,S,M);
 g.box=box(1,1,1); g.cone=cone(.16,.28,L); g.coneS=cone(.08,.16,L);
 g.tor=new T.TorusGeometry(.16,.03,L,S);
 g.tile=box(.96,.1,.96);
 g.merlon=box(.11,.15,.11);
 g.plane=new T.PlaneGeometry(1,1);
 g.wing=wingShape(.72,.42,.2);
 g.wingS=wingShape(.52,.58,.12);
 g.part=sph(.045,6,5);
 g.chip=box(.08,.05,.06);
 g.capS=cap(.07,.28,L);
 g.capM=cap(.08,.38,L);
 g.cyl=cyl; g.sph=sph; g.box=box; g.cone=cone; g.mkCone=cone; g.cap=cap; g.lathe=lathe;
 geos=g;return g;
}

function clearMats(){
 Object.values(matCache).forEach(m=>{if(m&&m.dispose)m.dispose()});
 matCache={};palCache={};
}

function mat(color, o){
 o=o||{};
 const kind=o.kind||'std';
 const key=[reduced?'R':'Q',kind,color,o.roughness,o.metalness,o.emissive,o.emissiveIntensity,o.transparent,o.opacity,o.side,o.clearcoat,o.sheen,o.sheenColor,o.env,o.depthWrite].join('|');
 if(matCache[key])return matCache[key];
 if(reduced){
  const m=new T.MeshLambertMaterial({color,emissive:o.emissive||0x000000,emissiveIntensity:o.emissiveIntensity==null?1:o.emissiveIntensity,transparent:!!o.transparent,opacity:o.opacity,side:o.side,depthWrite:o.depthWrite});
  matCache[key]=m;return m;
 }
 const phys=kind==='body'||kind==='metal'||kind==='gem'||kind==='phys'||o.clearcoat||o.sheen;
 const Ctor=phys&&T.MeshPhysicalMaterial?T.MeshPhysicalMaterial:T.MeshStandardMaterial;
 const base={
  color,
  roughness:o.roughness==null?.42:o.roughness,
  metalness:o.metalness==null?.16:o.metalness,
  envMapIntensity:o.env==null?(kind==='metal'?1.2:kind==='gem'?1.25:.7):o.env
 };
 if(o.emissive!=null)base.emissive=o.emissive;
 if(o.emissiveIntensity!=null)base.emissiveIntensity=o.emissiveIntensity;
 if(o.transparent){base.transparent=true;base.opacity=o.opacity==null?.7:o.opacity;base.depthWrite=o.depthWrite!==false}
 if(o.side)base.side=o.side;
 if(phys&&Ctor===T.MeshPhysicalMaterial){
  if(kind==='body'){base.clearcoat=o.clearcoat==null?.3:o.clearcoat;base.clearcoatRoughness=.38;base.sheen=o.sheen==null?.45:o.sheen;if(o.sheenColor!=null)base.sheenColor=new T.Color(o.sheenColor)}
  else if(kind==='metal'){base.clearcoat=o.clearcoat==null?.2:o.clearcoat;base.clearcoatRoughness=.4}
  else if(kind==='gem'){base.clearcoat=o.clearcoat==null?1:o.clearcoat;base.clearcoatRoughness=o.clearcoatRoughness==null?.07:o.clearcoatRoughness}
  if(o.clearcoat!=null)base.clearcoat=o.clearcoat;
  if(o.clearcoatRoughness!=null)base.clearcoatRoughness=o.clearcoatRoughness;
  if(o.sheen!=null)base.sheen=o.sheen;
  if(o.sheenColor!=null)base.sheenColor=new T.Color(o.sheenColor);
 }
 const m=new Ctor(base);
 matCache[key]=m;return m;
}

function mesh(geo, m){const x=new T.Mesh(geo,m);x.castShadow=!reduced;x.receiveShadow=false;return x}
function add(p, geo, m, y, sx,sy,sz){const x=mesh(geo,m);if(y!=null)x.position.y=y;if(sx!=null)x.scale.set(sx,sy==null?sx:sy,sz==null?sx:sz);p.add(x);return x}

function sideTint(acc,c){
 const col=new T.Color(acc);
 if(c==='b')col.offsetHSL(.03,-.04,-.16);else col.offsetHSL(-.02,.06,.05);
 return col.getHex();
}
function pal(c, accent){
 const C=COL[c]||COL.w;
 const acc=sideTint(accent||C.acc,c);
 const key=c+'|'+acc+'|'+(reduced?'R':'Q');
 if(palCache[key])return palCache[key];
 const metalCol=c==='w'?0xd4af37:0xc8d0dc;
 const P={
  body:mat(C.body,{kind:'body',roughness:c==='w'?.36:.3,metalness:c==='w'?.06:.14,sheen:c==='w'?.55:.18,sheenColor:C.sheen,clearcoat:c==='w'?.38:.22}),
  acc:mat(acc,{kind:'metal',metalness:.78,roughness:.26,emissive:acc,emissiveIntensity:.2}),
  metal:mat(metalCol,{kind:'metal',metalness:.92,roughness:.18}),
  ink:mat(C.ink,{roughness:.68,metalness:.06}),
  glow:mat(acc,{kind:'gem',emissive:acc,emissiveIntensity:.62,roughness:.12,metalness:.22,clearcoat:1}),
  gem:mat(acc,{kind:'gem',emissive:acc,emissiveIntensity:.85,roughness:.07,metalness:.12,clearcoat:1,transparent:true,opacity:.9})
 };
 palCache[key]=P;return P;
}

function pedestal(g,P,h,fat){
 fat=fat||1;const G=geoLib();
 add(g,G.foot,P.body,0,fat,1,fat);
 add(g,G.ring,P.metal,.10,fat,1,fat);
 const st=add(g,G.stem,P.body,.12,fat,h,fat);
 st.position.y=.12+h/2;
 add(g,G.collar,P.metal,.12+h,fat*.95,1,fat*.95);
 add(g,G.tor,P.acc,.12+h+.02,fat*.7,1,fat*.7).rotation.x=Math.PI/2;
 return .12+h+.06;
}

function accOf(type,accent){
 if(accent){const n=parseInt(String(accent).replace('#',''),16);if(!isNaN(n)&&n)return n}
 return ACCENT[type]!=null?ACCENT[type]:0xc9a227;
}
const ACCENT={
 K:0xd4a72c,Q:0xe8c547,R:0x90a4ae,B:0x8d6bd1,N:0x8d6e63,P:0xc9b896,
 k:0xe53935,o:0xffb300,h:0xb388ff,
 E:0xce93d8,O:0xec407a,m:0x43a047,
 t:0x6d4c41,r:0xa1887f,w:0xab47bc,
 d:0xe53935,e:0xbdbdbd,p:0x8e24aa,
 c:0xd4a017,z:0x37474f,n:0x7986cb,C:0xffd54f,L:0xffc107,
 Y:0xa1887f,J:0x6d4c41,U:0x78909c,Z:0x9ccc65,I:0x26a69a,S:0xff9800,H:0x607d8b,
 V:0x26a69a,W:0x9c27b0,F:0x4fc3f7,A:0x66bb6a,G:0xb39ddb,X:0xff3d00,
 D:0xff5722,y:0x00897b,q:0x29b6f6,s:0x81d4fa
};
const BADGE={
 K:'K',Q:'Q',R:'R',B:'B',N:'N',P:'P',
 k:'WL',o:'MN',h:'PH',E:'EM',O:'PN',m:'AZ',
 t:'TW',r:'RM',w:'WD',d:'CD',e:'EL',p:'PR',
 c:'CM',z:'ZB',n:'NR',C:'LC',L:'PD',
 Y:'BR',J:'SG',U:'SB',Z:'ST',I:'RN',S:'SQ',H:'BW',
 V:'VA',W:'KP',F:'FR',A:'LB',G:'WH',X:'BB',
 D:'DR',y:'WY',q:'OR',s:'SR'
};
const PNAME={
 K:'King',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn',
 k:'Warlord',o:'Monarch',h:'Phantom King',E:'Empress',O:'Princess',m:'Amazon',
 t:'Tower',r:'Ram',w:'Warden',d:'Cardinal',e:'Elephant',p:'Priest',
 c:'Camel',z:'Zebra',n:'Nightrider',C:'Lancer',L:'Paladin',
 Y:'Berolina',J:'Sergeant',U:'Shieldbearer',Z:'Scout',I:'Runner',S:'Squire',H:'Bulwark',
 V:'Vaulter',W:'Keeper',F:'Frostcaller',A:'Longbow',G:'Wraith',X:'Bombard',
 D:'Dragon',y:'Wyvern',q:'Oracle',s:'Seer'
};
const badgeCache={};
function badgeTex(text,col){
 const key=text+'|'+col;
 if(badgeCache[key])return badgeCache[key];
 const c=document.createElement('canvas');c.width=128;c.height=72;
 const g=c.getContext('2d');
 g.clearRect(0,0,128,72);
 const r=18;g.beginPath();
 g.moveTo(r,8);g.arcTo(120,8,120,64,r);g.arcTo(120,64,8,64,r);g.arcTo(8,64,8,8,r);g.arcTo(8,8,120,8,r);
 g.closePath();g.fillStyle='rgba(10,12,18,.88)';g.fill();
 g.lineWidth=5;g.strokeStyle='#'+('000000'+col.toString(16)).slice(-6);g.stroke();
 g.fillStyle='#fff';g.font='bold '+(text.length>1?36:46)+'px system-ui,sans-serif';
 g.textAlign='center';g.textBaseline='middle';g.fillText(text,64,40);
 const tex=new T.CanvasTexture(c);if(T.SRGBColorSpace)tex.colorSpace=T.SRGBColorSpace;
 tex.needsUpdate=true;badgeCache[key]=tex;return tex;
}
function addBadge(g,type,acc,topY,fullName){
 if(!badgesOn&&!fullName)return topY;
 const label=fullName||BADGE[type]||type;
 const tex=badgeTex(label,acc);
 const w=fullName?Math.max(.7,label.length*.11):.38,h=fullName?.22:.22;
 const pl=new T.Mesh(new T.PlaneGeometry(w,h), new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
 pl.position.y=topY+(fullName?.2:.16);pl.userData.billboard=1;g.add(pl);
 return pl.position.y+h*.5;
}
function namePlate(g,type,acc){
 const nm=PNAME[type]||type;
 const c=document.createElement('canvas');c.width=384;c.height=80;
 const ctx=c.getContext('2d');
 ctx.clearRect(0,0,384,80);
 ctx.fillStyle='rgba(10,12,18,.92)';
 ctx.beginPath();if(ctx.roundRect)ctx.roundRect(6,8,372,64,14);else ctx.rect(6,8,372,64);ctx.fill();
 ctx.strokeStyle='#'+('000000'+acc.toString(16)).slice(-6);ctx.lineWidth=6;ctx.stroke();
 ctx.fillStyle='#fff';ctx.font='bold 36px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(nm,192,42);
 const tex=new T.CanvasTexture(c);if(T.SRGBColorSpace)tex.colorSpace=T.SRGBColorSpace;
 const pl=new T.Mesh(new T.PlaneGeometry(.95,.22), new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
 pl.position.y=0.03;pl.position.z=0.48;pl.rotation.x=-Math.PI/2;g.add(pl);
}

let badgesOn=true, orbitLock=false;

function addHorse(g,P,t,o){
 o=o||{};const G=geoLib();
 const sc=o.sc||1;
 add(g,G.ballL,P.body,t+.16*sc,1.15*sc,.95*sc,1.22*sc);
 if(o.hump)add(g,G.ball,o.humpMat||P.acc,t+.34*sc).position.set(0,t+.34*sc,-.08*sc);
 const neck=add(g,G.capM,P.body,0,sc, (o.neckLen||1)*sc, sc);
 neck.position.set(0,t+.30*sc,.10*sc);
 neck.rotation.x=o.bend||-.85;
 const hy=t+(o.hy||.46)*sc, hz=(o.hz||.30)*sc;
 add(g,G.ball,P.body,0,.95*sc,.78*sc,1.12*sc).position.set(0,hy,hz);
 const sn=add(g,G.cyl(.05,.085,.22,SM()),P.body,0,sc,sc,sc);
 sn.position.set(0,hy-.05*sc,hz+.20*sc);sn.rotation.x=-.5;
 add(g,G.ballS,P.body,0,.75*sc,.5*sc,.95*sc).position.set(0,hy-.1*sc,hz+.32*sc);
 add(g,G.box(.09,.035,.13),P.body,0).position.set(0,hy-.12*sc,hz+.18*sc);
 if(o.ears!==false){
  for(const s of[-1,1]){
   const e=add(g,G.cone(.036,.18,SLo()),o.earMat||P.acc,0);
   e.position.set(s*.075*sc,hy+.15*sc,hz-.05*sc);
   e.rotation.z=s*.18;e.rotation.x=-.18;
  }
 }
 if(o.mane){
  for(let i=0;i<6;i++){
   const mn=add(g,G.box(.04,.12,.045),o.maneMat||P.ink,0);
   mn.position.set(0,hy-.04+i*.045,hz-.12-i*.035);
   mn.rotation.x=.3;
  }
 }
 if(o.eyes){
  for(const s of[-1,1])add(g,G.ballS,P.glow,0,.28,.28,.28).position.set(s*.065*sc,hy+.05*sc,hz+.12*sc);
 }
 return {hy,hz};
}
function addWing(g,matW,side,x,y,z,rot,geo){
 const wr=new T.Group();wr.position.set(x,y,z);wr.rotation.set(rot[0],side*rot[1],side*rot[2]);wr.userData.wing=side;
 const m=add(wr,geo||geoLib().wing,matW,0);m.rotation.y=side>0?0:Math.PI;if(side<0)m.position.z=.036;
 g.add(wr);return wr;
}

function pieceMesh(type, color, accent){
 const acc=accOf(type,accent);
 const G=geoLib(), P=pal(color, acc), g=new T.Group();
 g.userData={type,color};
 let topY=.8;
 const ring=(y,r)=>{const m=add(g,new T.TorusGeometry(r,.024,SLo(),SG()),P.glow,y);m.rotation.x=Math.PI/2;return m};
 const S=SG(),M=SM();
 switch(type){
  case 'K':{ // King — tall gold cross, the tallest royal with a clear +
   const t=pedestal(g,P,.62,1.0);
   add(g,G.cyl(.2,.24,.12,S),P.metal,t+.06);
   add(g,G.cyl(.18,.18,.08,S),P.glow,t+.14);
   const cx=add(g,G.cap(.035,.28,SLo()),P.metal,t+.36);cx.scale.set(1,1.05,1);
   add(g,G.cap(.035,.16,SLo()),P.metal,t+.34).rotation.z=Math.PI/2;
   add(g,G.ballS,P.gem,t+.54);
   ring(t,.2);topY=t+.66;break;}
  case 'k':{ // Warlord — squat iron helm, red spikes, battle-axe (no cross)
   const t=pedestal(g,P,.28,1.25);
   add(g,G.box(.44,.28,.4),P.body,t+.14);
   add(g,G.cyl(.22,.22,.16,S),P.metal,t+.32);
   add(g,G.box(.36,.06,.1),P.ink,t+.34).position.z=.14; // visor slit
   for(let i=0;i<8;i++){const a=i*Math.PI/4,s=add(g,G.cone(.045,.22,SLo()),P.glow,0);s.position.set(Math.cos(a)*.22,t+.46,Math.sin(a)*.22)}
   const axe=add(g,G.cyl(.02,.02,.58,SLo()),P.ink,t+.3);axe.position.x=.32;axe.rotation.z=-.25;
   const blade=add(g,G.lathe([[0,0],[.02,0],[.14,.04],[.16,.1],[.02,.16],[0,.16]],SLo()),P.glow,0);
   blade.position.set(.42,t+.52,0);blade.rotation.z=Math.PI/2;
   topY=t+.62;break;}
  case 'o':{ // Monarch — huge radiating crown + orb scepter, widest royal
   const t=pedestal(g,P,.58,1.15);
   add(g,G.cyl(.26,.28,.1,S),P.metal,t+.05);
   for(let i=0;i<8;i++){const a=i*Math.PI/4,s=add(g,G.cone(.05,.34,SLo()),P.metal,0);s.position.set(Math.cos(a)*.22,t+.28,Math.sin(a)*.22);add(g,G.ballS,P.gem,0).position.set(Math.cos(a)*.22,t+.46,Math.sin(a)*.22)}
   add(g,G.ball,P.gem,t+.5);
   const sc=add(g,G.cyl(.018,.018,.72,SLo()),P.metal,t+.3);sc.position.x=.3;
   add(g,G.ballS,P.gem,t+.68).position.set(.3,t+.68,0);
   topY=t+.74;break;}
  case 'h':{ // Phantom King — floating, no solid foot, hollow rings, ghost cape
   const Pg={body:mat(0x7e57c2,{kind:'gem',transparent:true,opacity:.42,emissive:0x4a2080,emissiveIntensity:.55,roughness:.12,clearcoat:.8}),acc:mat(0xe1bee7,{kind:'gem',transparent:true,opacity:.78,emissive:0xb388ff,emissiveIntensity:.75,roughness:.1})};
   add(g,new T.TorusGeometry(.28,.035,SLo(),S),Pg.acc,.12).rotation.x=Math.PI/2;
   add(g,new T.TorusGeometry(.2,.028,SLo(),S),Pg.acc,.4).rotation.x=Math.PI/2;
   add(g,G.cap(.03,.22,SLo()),Pg.acc,.72);
   add(g,G.cap(.03,.12,SLo()),Pg.acc,.68).rotation.z=Math.PI/2;
   const cp=add(g,new T.PlaneGeometry(.5,.55),Pg.body,.35);cp.position.z=-.16;cp.rotation.x=.25;cp.material.side=T.DoubleSide;
   topY=1.02;break;}
  case 'Q':{ // Queen — 8-point coronet, large central orb
   const t=pedestal(g,P,.52,1.0);
   add(g,G.cyl(.2,.22,.09,S),P.metal,t+.045);
   for(let i=0;i<8;i++){const a=i*Math.PI/4,s=add(g,G.cone(.038,.22,SLo()),P.metal,0);s.position.set(Math.cos(a)*.17,t+.2,Math.sin(a)*.17);if(i%2===0)add(g,G.ballS,P.gem,0,.55,.55,.55).position.set(Math.cos(a)*.17,t+.32,Math.sin(a)*.17)}
   add(g,G.ball,P.gem,t+.38);
   topY=t+.54;break;}
  case 'E':{ // Empress — double crown + jewel belt, taller than queen
   const t=pedestal(g,P,.62,1.08);
   add(g,G.cyl(.22,.24,.08,S),P.metal,t+.04);
   add(g,G.cyl(.16,.2,.08,S),P.glow,t+.14);
   for(let i=0;i<10;i++){const a=i*Math.PI/5,s=add(g,G.cone(.038,.28,SLo()),P.metal,0);s.position.set(Math.cos(a)*.2,t+.3,Math.sin(a)*.2)}
   for(let i=0;i<6;i++){const a=i*Math.PI/3;add(g,G.ballS,P.gem,t+.02,.55,.55,.55).position.set(Math.cos(a)*.22,t+.02,Math.sin(a)*.22)}
   add(g,G.ball,P.gem,t+.5);
   topY=t+.64;break;}
  case 'O':{ // Princess — slim floral tiara (petals, not spikes), shorter
   const t=pedestal(g,P,.4,.82);
   ring(t,.14);
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5,s=add(g,G.ballS,P.gem,0);s.position.set(Math.cos(a)*.14,t+.16,Math.sin(a)*.14);s.scale.set(1.15,.5,1.15)}
   add(g,G.ballS,P.gem,t+.26);
   topY=t+.42;break;}
  case 'm':{ // Amazon — warrior helm + long spear (no coronet)
   const t=pedestal(g,P,.4,1.1);
   add(g,G.cyl(.18,.2,.22,S),P.body,t+.12);
   add(g,G.cone(.16,.16,SLo()),P.metal,t+.3);
   add(g,G.box(.22,.05,.08),P.ink,t+.22).position.z=.12;
   const sp=add(g,G.cyl(.016,.016,.98,SLo()),P.metal,t+.42);sp.position.set(.22,t+.42,0);sp.rotation.z=-.2;
   add(g,G.cone(.055,.16,SLo()),P.glow,t+.9).position.set(.22,t+.9,0);
   topY=t+1.0;break;}
  case 'R':{ // Rook — classic 4 merlons
   const t=pedestal(g,P,.3,1.2);
   add(g,G.cyl(.24,.26,.34,S),P.body,t+.17);
   add(g,G.box(.5,.08,.5),P.metal,t+.38);
   for(const[x,z] of [[-.18,-.18],[-.18,.18],[.18,-.18],[.18,.18]]){add(g,G.merlon,P.body,t+.5).position.set(x,t+.5,z);add(g,G.box(.12,.03,.12),P.metal,t+.58).position.set(x,t+.58,z)}
   ring(t+.08,.2);
   topY=t+.62;break;}
  case 't':{ // Tower — much taller two-tier keep, 8 merlons
   const t=pedestal(g,P,.22,1.15);
   add(g,G.cyl(.22,.24,.28,S),P.body,t+.14);
   add(g,G.cyl(.17,.2,.4,S),P.body,t+.46);
   add(g,G.box(.44,.07,.44),P.metal,t+.68);
   for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*.16,z=Math.sin(a)*.16;add(g,G.merlon,P.body,t+.8).position.set(x,t+.8,z);add(g,G.box(.08,.03,.08),P.metal,t+.88).position.set(x,t+.88,z)}
   topY=t+.97;break;}
  case 'r':{ // Ram — long horizontal battering ram + horns, squat
   const t=pedestal(g,P,.18,1.3);
   add(g,G.box(.4,.28,.4),P.body,t+.16);
   const ram=add(g,G.cyl(.07,.11,.72,S),P.metal,t+.18);ram.rotation.x=Math.PI/2;ram.position.set(0,t+.18,.4);
   add(g,G.ball,P.glow,t+.18).position.set(0,t+.18,.78);
   const h1=add(g,G.cone(.055,.24,SLo()),P.acc,0);h1.position.set(-.18,t+.34,.08);h1.rotation.z=.45;
   const h2=h1.clone();h2.position.x=.18;h2.rotation.z=-.45;g.add(h2);
   topY=t+.5;break;}
  case 'w':{ // Warden — watch-dome and glowing eye, not merlons
   const t=pedestal(g,P,.34,1.15);
   add(g,G.cyl(.24,.26,.3,S),P.body,t+.15);
   add(g,new T.SphereGeometry(.28,S,M,0,Math.PI*2,0,Math.PI/2),P.metal,t+.3);
   add(g,G.ball,P.gem,t+.22).scale.set(1.1,.7,1.1);
   ring(t+.44,.2);
   topY=t+.6;break;}
  case 'B':{ // Bishop — tall mitre + slit
   const t=pedestal(g,P,.5,.82);
   add(g,G.lathe([[0,0],[.16,0],[.17,.08],[.12,.28],[.05,.4],[.04,.44],[0,.44]],S),P.body,t);
   add(g,G.box(.04,.26,.09),P.ink,t+.22);
   add(g,G.ballS,P.gem,t+.48);
   topY=t+.62;break;}
  case 'd':{ // Cardinal — huge flat red galero, widest hat
   const t=pedestal(g,P,.32,.9);
   add(g,G.cone(.14,.22,S),P.body,t+.12);
   add(g,G.cyl(.42,.42,.045,S+4),P.glow,t+.24);
   add(g,G.cone(.12,.12,S),P.acc,t+.32);
   add(g,G.ballS,P.gem,t+.42);
   topY=t+.54;break;}
  case 'e':{ // Elephant — animal, trunk, ears, tusks (no hat)
   const t=pedestal(g,P,.16,1.2);
   add(g,G.ballL,P.body,t+.2).scale.set(1.28,1.08,1.32);
   const ear=add(g,G.box(.04,.3,.36),P.acc,t+.26);ear.position.set(-.36,t+.26,0);ear.rotation.z=.15;
   const ear2=ear.clone();ear2.position.x=.36;ear2.rotation.z=-.15;g.add(ear2);
   const tr=add(g,G.cap(.055,.36,SLo()),P.body,0);tr.position.set(0,t+.02,.34);tr.rotation.x=1.05;
   const tu=add(g,G.cyl(.018,.03,.3,SLo()),P.metal,0);tu.position.set(-.1,t+.08,.3);tu.rotation.x=.75;
   const tu2=tu.clone();tu2.position.x=.1;g.add(tu2);
   topY=t+.5;break;}
  case 'p':{ // Priest — hood + tall staff + high halo
   const t=pedestal(g,P,.36,.8);
   add(g,G.cone(.2,.16,S),P.body,t+.22);
   add(g,G.ball,P.body,t+.12);
   const st=add(g,G.cyl(.016,.016,.78,SLo()),P.metal,t+.36);st.position.x=.22;
   add(g,G.ballS,P.gem,t+.76).position.set(.22,t+.76,0);
   const halo=add(g,new T.TorusGeometry(.16,.022,SLo(),S),P.glow,t+.6);halo.rotation.x=Math.PI/2;
   topY=t+.74;break;}
  case 'N':{ // Knight — classic horse head
   const t=pedestal(g,P,.22,1.05);
   addHorse(g,P,t,{mane:true,hy:.46,hz:.3});
   topY=t+.76;break;}
  case 'c':{ // Camel — long S-neck, big hump, no pointed ears
   const t=pedestal(g,P,.2,1.15);
   addHorse(g,P,t,{hump:true,bend:-1.05,neckLen:1.35,hy:.64,hz:.38,ears:false,sc:1});
   add(g,G.ballS,P.acc,t+.68).position.set(-.06,t+.7,.34);
   add(g,G.ballS,P.acc,t+.68).position.set(.06,t+.7,.34);
   topY=t+.86;break;}
  case 'z':{ // Zebra — horse with bold stripes + bristly mane
   const t=pedestal(g,P,.22,1.05);
   addHorse(g,P,t,{mane:true,maneMat:P.ink,earMat:P.body,hy:.46,hz:.3});
   for(let i=0;i<5;i++){const r=add(g,G.box(.24,.03,.045),P.ink,0);r.position.set(0,t+.1+i*.1,.14+i*.04)}
   topY=t+.76;break;}
  case 'n':{ // Nightrider — long ground-length cape, glowing eyes, taller
   const t=pedestal(g,P,.26,1.05);
   addHorse(g,P,t,{eyes:true,mane:true,neckLen:1.15,hy:.52,hz:.28});
   const cp=add(g,new T.PlaneGeometry(.55,.72),mat(0x3949ab,{kind:'gem',side:T.DoubleSide,transparent:true,opacity:.9,emissive:0x5c6bc0,emissiveIntensity:.3,roughness:.35}),0);
   cp.position.set(0,t+.22,-.22);cp.rotation.x=.2;
   topY=t+.84;break;}
  case 'C':{ // Lancer — compact horse + very long diagonal lance
   const t=pedestal(g,P,.2,1.0);
   addHorse(g,P,t,{sc:.9,hy:.4,hz:.26,mane:false});
   const ln=add(g,G.cyl(.018,.018,1.18,SLo()),P.metal,0);ln.position.set(.16,t+.5,.2);ln.rotation.x=-.7;
   add(g,G.cone(.065,.18,SLo()),P.glow,0).position.set(.16,t+.98,.58);
   topY=t+1.08;break;}
  case 'L':{ // Paladin — HUMANOID armored knight (not a horse), shield + cross
   const t=pedestal(g,P,.18,1.1);
   add(g,G.cyl(.16,.2,.3,S),P.metal,t+.17);
   add(g,G.ball,P.body,t+.4);
   add(g,G.cyl(.14,.16,.12,S),P.metal,t+.52);
   add(g,G.box(.05,.16,.05),P.glow,t+.6);
   add(g,G.box(.16,.05,.05),P.glow,t+.56);
   const sh=add(g,G.cyl(.16,.18,.05,S),P.glow,t+.24);sh.position.set(-.28,t+.24,.06);sh.rotation.y=Math.PI/2;sh.rotation.z=.15;
   const sw=add(g,G.cyl(.016,.016,.4,SLo()),P.metal,t+.28);sw.position.set(.22,t+.28,0);
   topY=t+.74;break;}
  case 'P':{ // Pawn — smallest classic ball
   const t=pedestal(g,P,.22,.95);
   add(g,G.cyl(.13,.15,.08,S),P.metal,t+.04);
   add(g,G.ball,P.body,t+.14);
   topY=t+.3;break;}
  case 'Y':{ // Berolina — diamond/pyramid head, no sphere
   const t=pedestal(g,P,.2,.95);
   const d=add(g,new T.OctahedronGeometry(.16,0),P.glow,t+.16);d.rotation.y=Math.PI/4;
   add(g,G.cone(.12,.16,4),P.acc,t+.34);
   topY=t+.48;break;}
  case 'J':{ // Sergeant — crested helm, wider shoulders, taller than pawn
   const t=pedestal(g,P,.28,1.15);
   add(g,G.box(.36,.16,.28),P.body,t+.1);
   add(g,G.cyl(.14,.16,.16,S),P.metal,t+.22);
   add(g,G.box(.045,.22,.16),P.glow,t+.38);
   topY=t+.52;break;}
  case 'U':{ // Shieldbearer — huge forward shield hiding the body
   const t=pedestal(g,P,.16,1.05);
   add(g,G.ball,P.body,t+.1);
   const sh=add(g,G.cyl(.28,.3,.055,S),P.metal,t+.22);sh.rotation.x=Math.PI/2;sh.position.set(0,t+.22,.22);
   add(g,G.box(.04,.24,.04),P.acc,t+.22).position.set(0,t+.22,.26);
   add(g,G.box(.16,.04,.04),P.acc,t+.22).position.set(0,t+.22,.26);
   topY=t+.44;break;}
  case 'Z':{ // Scout — slim, long visor cap brim forward, taller thin
   const t=pedestal(g,P,.36,.7);
   add(g,G.cyl(.09,.11,.2,S),P.body,t+.1);
   add(g,G.ballS,P.body,t+.24);
   add(g,G.cyl(.14,.16,.05,S),P.glow,t+.3);
   const brim=add(g,G.box(.16,.025,.24),P.glow,t+.3);brim.position.set(0,t+.3,.16);
   topY=t+.44;break;}
  case 'I':{ // Runner — body leaning forward, elongated, teal stripe
   const t=pedestal(g,P,.3,.7);
   const bod=add(g,G.cyl(.08,.12,.42,S),P.body,t+.2);bod.rotation.x=-.45;bod.position.set(0,t+.22,.1);
   add(g,G.ballS,P.body,t+.42).position.set(0,t+.42,.22);
   add(g,G.box(.07,.36,.07),P.glow,t+.22).rotation.x=-.45;
   topY=t+.6;break;}
  case 'S':{ // Squire — little figure, sword and cape, capped head
   const t=pedestal(g,P,.2,1.0);
   add(g,G.cyl(.11,.15,.22,S),P.body,t+.12);
   add(g,G.cyl(.1,.12,.08,S),P.acc,t+.28);
   const sw=add(g,G.cyl(.015,.015,.36,SLo()),P.metal,t+.26);sw.position.set(.2,t+.26,0);
   add(g,G.box(.12,.03,.03),P.acc,t+.12).position.set(.2,t+.12,0);
   const cp=add(g,new T.PlaneGeometry(.22,.28),P.acc,t+.1);cp.position.set(0,t+.1,-.16);cp.rotation.x=.2;cp.material.side=T.DoubleSide;
   topY=t+.52;break;}
  case 'H':{ // Bulwark — widest iron bunker, shortest, almost a block
   const t=pedestal(g,P,.1,1.4);
   add(g,G.box(.56,.32,.56),P.metal,t+.16);
   add(g,G.box(.4,.1,.4),P.body,t+.36);
   ring(t+.08,.22);
   topY=t+.44;break;}
  case 'V':{ // Vaulter — visible coil spring + leaping arc
   const t=pedestal(g,P,.16,.9);
   for(let i=0;i<4;i++){const sp=add(g,new T.TorusGeometry(.12,.028,SLo(),S),P.glow,t+.08+i*.08);sp.rotation.x=Math.PI/2}
   add(g,G.ball,P.body,t+.42);
   const a=add(g,new T.TorusGeometry(.22,.022,SLo(),S,Math.PI),P.acc,t+.55);a.rotation.x=Math.PI/2;a.rotation.z=Math.PI;
   topY=t+.74;break;}
  case 'W':{ // Keeper — giant key as the head
   const t=pedestal(g,P,.28,1.0);
   add(g,G.ball,P.body,t+.12);
   const bow=add(g,new T.TorusGeometry(.14,.038,SLo(),S),P.glow,t+.4);bow.rotation.x=Math.PI/2;
   add(g,G.box(.055,.28,.055),P.metal,t+.22);
   add(g,G.box(.14,.045,.045),P.metal,t+.16).position.set(.1,t+.16,0);
   add(g,G.box(.1,.045,.045),P.metal,t+.1).position.set(.08,t+.1,0);
   topY=t+.6;break;}
  case 'F':{ // Frostcaller — cluster of ice shards, no round head
   const t=pedestal(g,P,.2,.95);
   const ice=P.gem;
   const hs=[.42,.3,.36,.24,.38,.28];
   for(let i=0;i<6;i++){const a=i*Math.PI/3,s=add(g,G.cone(.065,hs[i],5),ice,0);s.position.set(Math.cos(a)*.12,t+hs[i]/2,Math.sin(a)*.12);s.rotation.z=(i%2?-.15:.2)}
   add(g,G.ballS,ice,t+.36);
   topY=t+.57;break;}
  case 'A':{ // Longbow — large C-shaped bow + nocked arrow
   const t=pedestal(g,P,.22,.85);
   add(g,G.ballS,P.body,t+.12);
   const bow=add(g,new T.TorusGeometry(.32,.028,SLo(),S,Math.PI),P.glow,t+.32);bow.rotation.y=Math.PI/2;
   const st=add(g,G.cyl(.01,.01,.62,6),P.ink,t+.32);st.rotation.z=Math.PI/2;
   const ar=add(g,G.cyl(.014,.014,.55,SLo()),P.metal,t+.32);ar.position.z=.1;ar.rotation.x=-.15;
   add(g,G.cone(.04,.1,5),P.glow,t+.32).position.set(0,t+.32,.4);
   topY=t+.64;break;}
  case 'G':{ // Wraith — tall wispy corkscrew, no solid foot
   const W={body:mat(0x8e7cc3,{kind:'gem',transparent:true,opacity:.42,emissive:0x4a3870,emissiveIntensity:.5,roughness:.12}),acc:mat(0xede7f6,{kind:'gem',transparent:true,opacity:.72,emissive:0xb39ddb,emissiveIntensity:.6,roughness:.1})};
   add(g,new T.TorusGeometry(.18,.028,SLo(),S),W.acc,.08).rotation.x=Math.PI/2;
   add(g,G.cone(.16,.7,S),W.body,.48);
   add(g,G.cone(.1,.3,S),W.acc,.95);
   add(g,G.ballS,W.acc,1.12);
   topY=1.26;break;}
  case 'X':{ // Bombard — squat cannon, barrel at 45°, wheels
   const t=pedestal(g,P,.1,1.3);
   add(g,G.box(.4,.16,.36),P.body,t+.1);
   const br=add(g,G.cyl(.1,.14,.58,S),P.metal,t+.24);br.rotation.x=-.95;br.position.set(0,t+.24,.16);
   const w1=add(g,new T.TorusGeometry(.14,.038,SLo(),S),P.ink,t+.12);w1.position.set(-.24,t+.12,0);w1.rotation.z=Math.PI/2;
   const w2=w1.clone();w2.position.x=.24;g.add(w2);
   add(g,G.ballS,P.glow,t+.36).position.set(0,t+.3,.42);
   topY=t+.52;break;}
  case 'D':{ // Dragon — wide spread wings, horns, tail
   const t=pedestal(g,P,.2,1.15);
   add(g,G.ballL,P.body,t+.18);
   add(g,G.box(.16,.14,.3),P.body,t+.16).position.set(0,t+.16,.26);
   const tail=add(g,G.cyl(.03,.08,.52,SLo()),P.body,0);tail.position.set(0,t+.12,-.32);tail.rotation.x=-.7;
   const wmat=mat(acc,{kind:'gem',side:T.DoubleSide,transparent:true,opacity:.92,emissive:acc,emissiveIntensity:.28,roughness:.4});
   addWing(g,wmat,-1,-.28,t+.34,.02,[-.25,.55,.7],G.wing);
   addWing(g,wmat, 1, .28,t+.34,.02,[-.25,.55,.7],G.wing);
   add(g,G.cone(.04,.22,5),P.glow,0).position.set(-.08,t+.38,.12);
   add(g,G.cone(.04,.22,5),P.glow,0).position.set(.08,t+.38,.12);
   topY=t+.66;break;}
  case 'y':{ // Wyvern — swept-back wings, long barbed tail, slimmer
   const t=pedestal(g,P,.16,.85);
   add(g,G.ball,P.body,t+.12);
   add(g,G.box(.1,.1,.26),P.body,t+.12).position.set(0,t+.12,.2);
   const tail=add(g,G.cyl(.02,.05,.72,SLo()),P.body,0);tail.position.set(0,t+.1,-.36);tail.rotation.x=-.35;
   add(g,G.cone(.06,.16,5),P.glow,0).position.set(0,t-.02,-.7);
   const wmat=mat(acc,{kind:'gem',side:T.DoubleSide,transparent:true,opacity:.88,emissive:acc,emissiveIntensity:.18,roughness:.42});
   addWing(g,wmat,-1,-.18,t+.28,-.08,[-.05,1.05,1.05],G.wingS);
   addWing(g,wmat, 1, .18,t+.28,-.08,[-.05,1.05,1.05],G.wingS);
   topY=t+.6;break;}
  case 'q':{ // Oracle — huge glowing orb as the main body
   const t=pedestal(g,P,.22,.85);
   add(g,G.cyl(.03,.03,.2,SLo()),P.metal,t+.12);
   add(g,new T.SphereGeometry(.28,S,M),mat(0x29b6f6,{kind:'gem',emissive:0x29b6f6,emissiveIntensity:.8,transparent:true,opacity:.86,roughness:.08,metalness:.15,clearcoat:1}),t+.42);
   const halo=add(g,new T.TorusGeometry(.32,.026,SLo(),S),P.glow,t+.42);halo.rotation.x=Math.PI/2;
   topY=t+.78;break;}
  case 's':{ // Seer — hooded smaller orb, no staff, crouched
   const t=pedestal(g,P,.16,.9);
   add(g,G.cone(.22,.28,S),P.body,t+.24);
   add(g,new T.SphereGeometry(.16,S,M),mat(0x81d4fa,{kind:'gem',emissive:0x4fc3f7,emissiveIntensity:.7,transparent:true,opacity:.9,roughness:.12,clearcoat:1}),t+.16);
   topY=t+.44;break;}
  default:{
   const t=pedestal(g,P,.3,1);add(g,G.ball,P.body,t+.12);topY=t+.3;
  }
 }
 g.traverse(o=>{if(o.isMesh){o.castShadow=!reduced;o.receiveShadow=false}});
 addBadge(g,type,acc,topY);
 g.userData.topY=topY;
 return g;
}

function sqPos(i){ // x along file, z along rank (r=7 / rank 1 at +z)
 const r=i>>3,c=i&7;
 return {x:c-3.5, z:r-3.5};
}
function worldOf(i){const p=sqPos(i);return new T.Vector3(p.x, 0, p.z)}

function applyView(){
 const {th,ph,d}=view;
 const x=d*Math.sin(ph)*Math.sin(th);
 const y=d*Math.cos(ph);
 const z=d*Math.sin(ph)*Math.cos(th);
 camera.position.set(x,y,z);
 camera.lookAt(0,0.2,0);
 dirty=true;
}

function setDefaultView(){
 view.th=flipped?Math.PI:0;
 view.ph=1.02; view.d=13.6;
 vDef={th:view.th, ph:view.ph, d:view.d};
 applyView();
}

function themeColors(){
 const cs=getComputedStyle(document.body);
 const t=THEME3D[theme]||THEME3D.wood;
 const light=cssHex(cs.getPropertyValue('--light'), (G.THEMES&&G.THEMES[theme]&&parseInt(G.THEMES[theme][1].slice(1),16))||0xe8cfa6);
 const dark=cssHex(cs.getPropertyValue('--dark'), 0xa8703f);
 return {light, dark, t};
}

function buildBoard(){
 if(boardG){boardG.removeFromParent();boardG.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry!==geoLib().tile){/* keep shared */}})}
 boardG=new T.Group();root.add(boardG);tiles.length=0;
 const G=geoLib(), C=themeColors(), t=C.t;
 const ml=mat(C.light,{roughness:1-t.gloss, metalness:t.metal, emissive:t.emit||0});
 const md=mat(C.dark,{roughness:1-t.gloss*.8, metalness:t.metal, emissive:t.emit||0});
 mats.light=ml;mats.dark=md;
 // felt / base
 const base=mesh(new T.BoxGeometry(9.4,.35,9.4), mat(t.rim,{roughness:.6,metalness:.05}));
 base.position.y=-.24;base.receiveShadow=true;base.castShadow=false;boardG.add(base);
 // rim raised
 const rimM=mat(t.rim,{roughness:.5,metalness:.08});
 const mkRim=(w,h,d,x,y,z)=>{const m=mesh(new T.BoxGeometry(w,h,d),rimM);m.position.set(x,y,z);boardG.add(m)};
 mkRim(9.4,.32,0.55,0,.04,-4.7);mkRim(9.4,.32,0.55,0,.04,4.7);
 mkRim(0.55,.32,8.3,-4.7,.04,0);mkRim(0.55,.32,8.3,4.7,.04,0);
 for(let i=0;i<64;i++){
  const p=sqPos(i), even=((i>>3)+(i&7))%2===0;
  const m=mesh(G.tile, even?md:ml); // r+c odd is dark in 2D: (r+c)%2 ? d : l  so odd=dark
  // i=r*8+c, (r+c)%2===1 -> dark. even=(r+c)%2===0 -> light.
  m.material = ((i>>3)+(i&7))%2 ? md : ml;
  m.position.set(p.x, 0, p.z);
  m.userData.sq=i;m.receiveShadow=true;m.castShadow=false;
  boardG.add(m);tiles[i]=m;
 }
 if(t.edge){
  const eg=new T.EdgesGeometry(new T.BoxGeometry(8,0.02,8));
  const lines=new T.LineSegments(eg, new T.LineBasicMaterial({color:t.edge}));
  lines.position.y=.07;boardG.add(lines);
 }
 if(theme==='volcano'){
  const lava=mesh(new T.BoxGeometry(8.2,.04,8.2), mat(0x1a0804,{emissive:0xff3a0a,emissiveIntensity:.35,roughness:.8}));
  lava.position.y=-.08;boardG.add(lava);
 }
 buildLabels();
 dirty=true;
}

function buildLabels(){
 if(labG){labG.removeFromParent();labG.traverse(o=>{if(o.material&&o.material.map)o.material.map.dispose()})}
 labG=new T.Group();root.add(labG);labels.length=0;
 if(!coordsOn)return;
 const col= theme==='minimal'||theme==='paper'||theme==='contrast'?'#333':'#f4efe4';
 const files='abcdefgh', ranks='87654321';
 for(let i=0;i<8;i++){
  const f=makeLabel(files[i],col), r=makeLabel(ranks[i],col);
  f.position.set(i-3.5, 0.30, 4.48); f.rotation.x=-Math.PI/2;
  r.position.set(-4.48, 0.30, i-3.5); r.rotation.x=-Math.PI/2;
  labG.add(f,r);
 }
}
function makeLabel(text,color){
 const c=document.createElement('canvas');c.width=64;c.height=64;
 const g=c.getContext('2d');g.clearRect(0,0,64,64);g.fillStyle=color;g.font='700 40px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,32,36);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace||T.sRGBEncoding;
 const m=new T.Mesh(new T.PlaneGeometry(.28,.28), new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
 m.userData.tex=tex;return m;
}

function setupLights(){
 Object.values(lights).forEach(l=>{if(l&&l.parent)l.removeFromParent()});
 lights={};
 const t=(THEME3D[theme]||THEME3D.wood);
 const amb=new T.HemisphereLight(t.light, 0x2a2622, reduced?1.05:0.55);
 scene.add(amb);lights.amb=amb;
 const dir=new T.DirectionalLight(0xfff4e6, reduced?1.15:1.35);
 dir.position.set(5.2, 11, 6.5);
 dir.castShadow=!reduced;
 if(dir.castShadow){
  dir.shadow.mapSize.set(host&&host.clientWidth<500?512:1024, host&&host.clientWidth<500?512:1024);
  const s=dir.shadow.camera;s.left=s.bottom=-7.5;s.right=s.top=7.5;s.near=1;s.far=26;dir.shadow.bias=-0.0007;dir.shadow.normalBias=0.03;
  if(dir.shadow.radius!=null)dir.shadow.radius=2;
 }
 scene.add(dir);lights.dir=dir;
 const fill=new T.DirectionalLight(0xa8c0ff, reduced?.2:.42);fill.position.set(-7,3.5,-4);scene.add(fill);lights.fill=fill;
 if(!reduced){
  const rim=new T.DirectionalLight(0xffe6c8, .55);rim.position.set(-2.5,6,-8);scene.add(rim);lights.rim=rim;
  const bounce=new T.DirectionalLight(0xfff0d8, .18);bounce.position.set(0,-4,2);scene.add(bounce);lights.bounce=bounce;
 }
 if(theme==='neon'&&!reduced){const p=new T.PointLight(0x00f0ff,.8,18);p.position.set(-3,3,3);scene.add(p);lights.p=p;
  const p2=new T.PointLight(0xff00c8,.45,18);p2.position.set(3,2,-3);scene.add(p2);lights.p2=p2}
 if(theme==='volcano'&&!reduced){const p=new T.PointLight(0xff5510,.9,16);p.position.set(0,1.2,0);scene.add(p);lights.p=p}
 if(theme==='underwater'&&!reduced){const p=new T.PointLight(0x66ffe0,.6,16);p.position.set(2,4,1);scene.add(p);lights.p=p}
 if(scene.fog)scene.fog=null;
 if(t.fog&&!reduced)scene.fog=new T.Fog(t.fog[0], t.fog[1], t.fog[2]);
}

function ensureEnv(){
 if(reduced||!renderer||!T.PMREMGenerator){if(scene)scene.environment=null;return null}
 if(envMap){scene.environment=envMap;return envMap}
 const pm=new T.PMREMGenerator(renderer);
 const s=new T.Scene();
 const box=new T.BoxGeometry(1,1,1);
 const addB=(c,x,y,z,sx,sy,sz)=>{const m=new T.Mesh(box,new T.MeshBasicMaterial({color:c}));m.position.set(x,y,z);m.scale.set(sx,sy,sz);s.add(m)};
 addB(0xd8e0ea, 0, 8, 0, 16, .2, 16);
 addB(0x3a3530, 0,-2, 0, 16, .2, 16);
 addB(0xf0e4d0, 0, 3,-7, 16, 8, .2);
 addB(0xc8d2dc, 0, 3, 7, 16, 8, .2);
 addB(0xffe8c4,-7, 3, 0, .2, 8, 16);
 addB(0x9ab4d8, 7, 3, 0, .2, 8, 16);
 addB(0xffffff,-2, 7.6,-2, 3.2, .06, 3.2);
 addB(0xfff2d0, 3, 7.6, 2, 2.2, .06, 2.2);
 addB(0x88bbff,-5.5, 2.2, 3, .08, 2.2, 2.2);
 const rt=pm.fromScene(s, 0.04, 0.1, 24);
 envMap=rt.texture;envRT=rt;pm.dispose();
 s.traverse(o=>{if(o.geometry&&o.geometry!==box)o.geometry.dispose();if(o.material)o.material.dispose()});
 box.dispose();
 scene.environment=envMap;
 return envMap;
}

function clearGroup(g){while(g&&g.children.length){const c=g.children[0];g.remove(c);if(c.geometry&&!isShared(c.geometry))c.geometry.dispose()}}
function isShared(geo){const G=geos;if(!G)return false;return Object.values(G).includes(geo)}

function placePieces(bd, opts){
 opts=opts||{};
 if(!opts.keep){clearGroup(pieceG);pins={}}
 const used={};
 for(let i=0;i<64;i++){
  const p=bd[i];if(!p)continue;
  let m=pins[i];
  if(!m||m.userData.type!==p.t||m.userData.color!==p.c){
   if(m){pieceG.remove(m);delete pins[i]}
   const acc=(G.GF&&G.GF.P&&G.GF.P[p.t]&&G.GF.P[p.t].col)||null;
   m=pieceMesh(p.t,p.c,acc);m.userData.sq=i;m.userData.type=p.t;m.userData.color=p.c;
   const pos=sqPos(i);m.position.set(pos.x, 0, pos.z);
   if(p.c==='b')m.rotation.y=Math.PI;
   pieceG.add(m);pins[i]=m;
  }
  used[i]=1;
  m.visible=true;
  if(p.z){m.traverse(o=>{if(o.isMesh&&o.material&&o.material.emissive){o.userData._em=o.userData._em||o.material.emissive.getHex();o.material.emissive.setHex(0x3fa7ff);o.material.emissiveIntensity=.45}})}
  else {m.traverse(o=>{if(o.userData._em!=null){o.material.emissive.setHex(o.userData._em);o.material.emissiveIntensity=.2}})}
 }
 Object.keys(pins).forEach(k=>{if(!used[k]){pieceG.remove(pins[k]);delete pins[k]}});
}

function markSquare(i, kind){
 const G=geoLib(), p=sqPos(i);
 let mesh_;
 if(kind==='dot'||kind==='cap'||kind==='spc'){
  const col=kind==='cap'?0xe53935:kind==='spc'?0x7c4dff:0x43a047;
  mesh_=new T.Mesh(new T.CircleGeometry(kind==='dot'?0.14:0.28, 20), new T.MeshBasicMaterial({color:col,transparent:true,opacity:.85,depthWrite:false}));
  mesh_.rotation.x=-Math.PI/2;mesh_.position.set(p.x, .08, p.z);
 } else if(kind==='sel'||kind==='last'||kind==='chk'||kind==='hint'){
  const col=kind==='sel'?0xffd400:kind==='last'?0xf0d060:kind==='chk'?0xe53935:0xffd400;
  mesh_=new T.Mesh(new T.RingGeometry(.32,.46,24), new T.MeshBasicMaterial({color:col,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide}));
  mesh_.rotation.x=-Math.PI/2;mesh_.position.set(p.x, .09, p.z);
  mesh_.userData.pulse=kind==='chk'||kind==='hint';
 } else {
  return;
 }
 mesh_.userData.mark=kind;markG.add(mesh_);
}

function setMarks(opts){
 clearGroup(markG);
 const moves=opts.moves||[];
 const seen={};
 if(opts.sel!=null){markSquare(opts.sel,'sel');seen[opts.sel]=1}
 if(opts.last){if(!seen[opts.last.f])markSquare(opts.last.f,'last');if(!seen[opts.last.t])markSquare(opts.last.t,'last')}
 (opts.checked||[]).forEach(i=>markSquare(i,'chk'));
 moves.forEach(m=>{
  const k=m.k;
  const kind=(k==='m'&&!m.x)||(k==='v'&&!m.x)||k==='cs'?'dot':(k==='m'||k==='v')&&m.x?'cap':'spc';
  markSquare(m.t, kind);
 });
 if(opts.hint&&opts.hint.f!=null){markSquare(opts.hint.f,'hint');if(opts.hint.t!=null)markSquare(opts.hint.t,'hint')}
 dirty=true;
}

function ease(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
function easeOut(t){return 1-Math.pow(1-t,3)}
function easeIn(t){return t*t*t}
function easeOutBack(t){const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)}
function tween(obj, prop, to, dur, ondone, opts){
 opts=opts||{};
 const from=opts.from!=null?opts.from:(obj[prop]&&obj[prop].clone?obj[prop].clone():obj[prop]);
 tweens.push({obj,prop,from,to,dur,t:0,delay:opts.delay||0,ease:opts.ease,arc:opts.arc,custom:opts.custom,ondone});dirty=true;
}

function softTex(){
 if(sprTex)return sprTex;
 const c=document.createElement('canvas');c.width=64;c.height=64;
 const g=c.getContext('2d');
 const grd=g.createRadialGradient(32,32,0,32,32,32);
 grd.addColorStop(0,'rgba(255,255,255,1)');
 grd.addColorStop(.22,'rgba(255,255,255,.85)');
 grd.addColorStop(.5,'rgba(255,255,255,.28)');
 grd.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=grd;g.fillRect(0,0,64,64);
 sprTex=new T.CanvasTexture(c);sprTex.needsUpdate=true;return sprTex;
}
function sprMat(color){
 return new T.SpriteMaterial({map:softTex(),color,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:1});
}
function maxPart(){return reduced?18:80}
function allocSpr(color,size){
 let p=partPool.pop();
 if(!p){p={m:new T.Sprite(sprMat(color)),v:new T.Vector3(),life:.5,age:0,g:0,s0:1,s1:.2,kind:'spr',spin:0}}
 else {p.m.material.color.setHex(color);p.m.material.opacity=1;p.m.material.blending=T.AdditiveBlending;p.m.visible=true}
 p.m.scale.setScalar(size||.18);p.s0=size||.18;p.s1=(size||.18)*.25;p.kind='spr';p.spin=0;p.bounce=0;
 return p;
}
function freePart(p){
 if(!p||!p.m)return;
 if(p.m.parent)p.m.parent.remove(p.m);
 if(p.kind==='spr'){p.m.visible=false;partPool.push(p)}
 else {if(p.m.material&&p.m.material.dispose)p.m.material.dispose()}
}
function spark(pos,color,n,spd,life,opts){
 opts=opts||{};
 n=Math.min(n, reduced?4:28);
 const cap=maxPart();
 for(let i=0;i<n && parts.length<cap;i++){
  const sz=opts.size||(.1+Math.random()*.14);
  const p=allocSpr(color,sz);
  p.m.position.copy(pos);
  p.v.set(Math.random()-.5, Math.random()*(opts.up||1)+.12, Math.random()-.5).normalize().multiplyScalar(spd*(.5+Math.random()));
  if(opts.dir){p.v.add(opts.dir.clone().multiplyScalar(spd*.45))}
  p.life=life*(.65+Math.random()*.5);p.age=0;p.g=opts.g==null?5.5:opts.g;p.s0=sz;p.s1=sz*(opts.grow||.2);
  parts.push(p);fxG.add(p.m);
 }
}
function burst(pos,color,n,spd,life){
 spark(pos,color,n,spd,life||.45,{g:7});
}
function glowAt(pos,color,size,life,opts){
 opts=opts||{};
 if(reduced)size*=.65;
 const p=allocSpr(color,size);
 p.m.position.copy(pos);p.v.set(0,opts.vy||0,0);p.g=0;p.life=life||.5;p.age=0;p.s0=size;p.s1=size*(opts.grow==null?1.8:opts.grow);
 parts.push(p);fxG.add(p.m);return p;
}
function ribbon(a,b,color,life,opts){
 opts=opts||{};
 const n=nPart(opts.n||(reduced?4:12));
 for(let i=0;i<n;i++){
  const u=n===1?.5:i/(n-1);
  const p=a.clone().lerp(b,u);
  if(opts.arc)p.y+=Math.sin(u*Math.PI)*opts.arc;
  const sz=(opts.size||.22)*(1-u*.25);
  const s=allocSpr(color,sz);
  s.m.position.copy(p);s.v.set(0,opts.vy||0,0);s.g=0;s.life=(life||.5)*(.75+u*.3);s.age=0;s.s0=sz;s.s1=sz*.3;
  if(parts.length<maxPart()){parts.push(s);fxG.add(s.m)}
 }
}
function debris(pos,color,n,spd){
 if(reduced){spark(pos,color,nPart(n),spd,.35,{g:14});return}
 n=nPart(n);const G=geoLib();
 for(let i=0;i<n && parts.length<maxPart();i++){
  const m=new T.Mesh(G.chip,new T.MeshBasicMaterial({color,transparent:true,opacity:1}));
  m.position.copy(pos);m.position.y+=.15;m.scale.setScalar(.45+Math.random()*.7);m.rotation.set(Math.random(),Math.random(),Math.random());
  const v=new T.Vector3(Math.random()-.5,Math.random()*.9+.35,Math.random()-.5).normalize().multiplyScalar(spd*(.6+Math.random()));
  const p={m,v,life:.7+Math.random()*.3,age:0,g:16,spin:(Math.random()-.5)*10,kind:'deb',bounce:1,s0:1,s1:1};
  parts.push(p);fxG.add(m);
 }
}
function flash(pos,color,intensity,life){
 if(reduced||!T.PointLight)return;
 while(fxLights.length>=2){const o=fxLights.shift();if(o.parent)o.parent.remove(o)}
 const l=new T.PointLight(color,intensity,7);
 l.position.copy(pos);scene.add(l);fxLights.push(l);
 tweens.push({obj:l,prop:'intensity',from:intensity,to:0,dur:life||.35,t:0,ondone:()=>{if(l.parent)l.parent.remove(l);fxLights=fxLights.filter(x=>x!==l)}});
}
function later(fn,sec){
 tweens.push({obj:{n:0},prop:'n',from:0,to:1,dur:Math.max(.01,sec),t:0,ondone:fn});
}
function shockwave(pos,color){
 if(reduced){fxRingAt(pos,color,.15,1.4,.35);return}
 glowAt(new T.Vector3(pos.x,.15,pos.z),color,1.1,.45,{grow:2.4});
 const m=new T.Mesh(new T.RingGeometry(.1,.2,28), new T.MeshBasicMaterial({color,transparent:true,opacity:.95,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
 m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.12;fxG.add(m);
 tweens.push({obj:m,prop:'scale',from:new T.Vector3(1,1,1),to:new T.Vector3(9,9,9),dur:.6,t:0,ondone:()=>{fxG.remove(m);if(m.geometry)m.geometry.dispose()}});
 tweens.push({obj:m.material,prop:'opacity',from:.95,to:0,dur:.6,t:0});
 const m2=new T.Mesh(new T.RingGeometry(.08,.14,24), new T.MeshBasicMaterial({color,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
 m2.rotation.x=-Math.PI/2;m2.position.copy(pos);m2.position.y=.13;fxG.add(m2);
 tweens.push({obj:m2,prop:'scale',from:new T.Vector3(1,1,1),to:new T.Vector3(6,6,6),dur:.7,t:0,delay:.08,ondone:()=>{fxG.remove(m2);if(m2.geometry)m2.geometry.dispose()}});
 tweens.push({obj:m2.material,prop:'opacity',from:.7,to:0,dur:.7,t:0,delay:.08});
}

function isHop(m){
 if(!m||m.k==='v'||m.k==='sw'||m.k==='os'||m.k==='tp')return m.k==='v'||m.k==='sw'||m.k==='os';
 if(m.k!=='m')return false;
 const dr=Math.abs((m.t>>3)-(m.f>>3)), dc=Math.abs((m.t&7)-(m.f&7));
 return dr&&dc&&dr!==dc;
}
function between(f,t){
 const r0=f>>3,c0=f&7,r1=t>>3,c1=t&7,dr=Math.sign(r1-r0),dc=Math.sign(c1-c0);
 const n=Math.max(Math.abs(r1-r0),Math.abs(c1-c0));const out=[];
 if(!n||(dr&&dc&&Math.abs(r1-r0)!==Math.abs(c1-c0)))return out;
 for(let i=1;i<n;i++)out.push((r0+dr*i)*8+(c0+dc*i));
 return out;
}
function preType(anim,m){
 const pre=anim&&anim.pre, bd=pre&&(pre.bd||pre);
 if(bd&&m&&m.f>=0&&bd[m.f])return bd[m.f].t;
 if(m&&m.k==='ex')return'X';
 return null;
}
function preBd(anim){const p=anim&&anim.pre;return p&&(p.bd||p)}

/* Every piece has a unique signature trail; special powers have a second unique id. */
const FXMAP={
 K:{sig:'royalStep',special:'castleBanners',name:'King'},
 Q:{sig:'queenFan',name:'Queen'},
 R:{sig:'rookBattlement',name:'Rook'},
 B:{sig:'bishopMitre',name:'Bishop'},
 N:{sig:'knightHorseshoe',name:'Knight'},
 P:{sig:'pawnMarch',special:'pawnAscend',name:'Pawn'},
 V:{sig:'vaulterStep',special:'vaulterLeap',name:'Vaulter'},
 W:{sig:'keeperKey',special:'keeperSwirl',name:'Keeper'},
 F:{sig:'frostSpread',name:'Frostcaller'},
 A:{sig:'longbowDraw',special:'longbowArrow',name:'Longbow'},
 S:{sig:'squireSalute',special:'squireKnighting',name:'Squire'},
 L:{sig:'paladinCross',name:'Paladin'},
 H:{sig:'bulwarkStomp',name:'Bulwark'},
 G:{sig:'wraithPhase',name:'Wraith'},
 X:{sig:'bombardFuse',special:'bombardBlast',name:'Bombard'},
 C:{sig:'lancerThrust',name:'Lancer'},
 Y:{sig:'berolinaBias',name:'Berolina'},
 J:{sig:'sergeantChevron',name:'Sergeant'},
 U:{sig:'shieldWall',name:'Shieldbearer'},
 Z:{sig:'scoutDash',name:'Scout'},
 I:{sig:'runnerStreak',name:'Runner'},
 c:{sig:'camelLunge',name:'Camel'},
 z:{sig:'zebraStripe',name:'Zebra'},
 n:{sig:'nightriderChain',name:'Nightrider'},
 d:{sig:'cardinalRobe',name:'Cardinal'},
 e:{sig:'elephantTusk',name:'Elephant'},
 p:{sig:'priestHalo',name:'Priest'},
 t:{sig:'towerShadow',name:'Tower'},
 r:{sig:'ramTrot',special:'ramCharge',name:'Ram'},
 w:{sig:'wardenDome',name:'Warden'},
 E:{sig:'empressRegalia',name:'Empress'},
 O:{sig:'princessBloom',name:'Princess'},
 m:{sig:'amazonSpear',name:'Amazon'},
 k:{sig:'warlordHelm',name:'Warlord'},
 o:{sig:'monarchCrown',name:'Monarch'},
 h:{sig:'phantomDrift',special:'phantomWarp',name:'Phantom King'},
 D:{sig:'dragonStep',special:'dragonBreath',name:'Dragon'},
 y:{sig:'wyvernGust',name:'Wyvern'},
 q:{sig:'oracleGlow',special:'oracleVision',name:'Oracle'},
 s:{sig:'seerWisp',special:'seerGlimpse',name:'Seer'}
};
let lastFx=null;
function pickFx(type,m,anim){
 const spec=FXMAP[type];if(!spec)return'sigTrail';
 if(!m)return spec.sig;
 if(type==='K'&&m.k==='cs')return spec.special;
 if(type==='P'&&m.pr)return spec.special;
 if(type==='V'&&m.k==='v')return spec.special;
 if(type==='W'&&m.k==='sw')return spec.special;
 if(type==='A'&&m.k==='sh')return spec.special;
 if(type==='S'&&m.x)return spec.special;
 if(type==='X'&&m.k==='ex')return spec.special;
 if(type==='r'&&m.k==='pu')return spec.special;
 if(type==='h'&&m.k==='tp')return spec.special;
 if(type==='q'&&m.k==='os')return spec.special;
 if(type==='s'&&m.k==='os')return spec.special;
 if(type==='D'){
  const pre=preBd(anim);const mid=between(m.f,m.t);
  const jumped=pre&&mid.some(i=>pre[i]);const diag=(()=>{const dr=Math.abs((m.t>>3)-(m.f>>3)),dc=Math.abs((m.t&7)-(m.f&7));return dr&&dr===dc})();
  if(diag||jumped||m.x)return spec.special;
 }
 return spec.sig;
}


function nPart(n){return reduced?Math.min(4,n):n}
function tempMesh(geo,color,pos,life,opts){
 opts=opts||{};
 const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:opts.op==null?1:opts.op,depthWrite:false,side:opts.side||T.FrontSide,blending:opts.add?T.AdditiveBlending:T.NormalBlending});
 const m=new T.Mesh(geo,mat);if(pos)m.position.copy(pos);fxG.add(m);
 const dur=life==null?.55:life;
 tweens.push({obj:mat,prop:'opacity',from:mat.opacity,to:0,dur,t:0,delay:opts.delay||0,ondone:()=>{fxG.remove(m);if(opts.disposeGeo&&m.geometry)m.geometry.dispose()}});
 if(opts.scaleTo)tweens.push({obj:m,prop:'scale',from:m.scale.clone(),to:opts.scaleTo,dur,t:0,delay:opts.delay||0});
 return m;
}
function dotsAlong(a,b,color,n,y,spread){
 n=nPart(n);const out=[];
 for(let i=0;i<n;i++){
  const u=n===1?0.5:i/(n-1);
  const p=a.clone().lerp(b,u);p.y=(y==null?.28:y)+(spread?Math.sin(u*Math.PI)*spread:0);
  glowAt(p,color, reduced?.12:.2, reduced?.28:.5,{grow:.4});
  out.push(p);
 }
 return out;
}
function fxRingAt(pos,color,fromR,toR,life){
 if(reduced&&toR>2)toR=Math.min(toR,2.4);
 const g=new T.RingGeometry(fromR,fromR*1.28, reduced?12:28);
 const m=new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:true,opacity:.92,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
 m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.1;fxG.add(m);
 const s=toR/fromR;
 tweens.push({obj:m,prop:'scale',from:new T.Vector3(1,1,1),to:new T.Vector3(s,s,s),dur:life||.5,t:0,ondone:()=>{fxG.remove(m);g.dispose()}});
 tweens.push({obj:m.material,prop:'opacity',from:.92,to:0,dur:life||.5,t:0});
 return m;
}
function fxBeam(a,b,color,r,life){
 const dir=b.clone().sub(a);const len=dir.length()||.01;
 const g=new T.CylinderGeometry(r,r*.35,len, reduced?6:12);
 const m=new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false,blending:T.AdditiveBlending}));
 m.position.copy(a.clone().add(b).multiplyScalar(.5));
 m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());
 fxG.add(m);
 tweens.push({obj:m.material,prop:'opacity',from:.95,to:0,dur:life||.4,t:0,ondone:()=>{fxG.remove(m);g.dispose()}});
 glowAt(a.clone().lerp(b,.5),color,Math.min(1.2,len*.25),.4,{grow:1.2});
 return m;
}
function fxFly(a,b,color,r,life,onend){
 const g=new T.SphereGeometry(r,8,6);
 const m=new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));
 m.position.copy(a);fxG.add(m);
 glowAt(a,color,r*4,life||.32,{grow:1.1});
 if(!reduced)ribbon(a,b,color,life||.32,{n:8,size:r*3,arc:.05});
 tweens.push({obj:m,prop:'pos',from:a.clone(),to:b.clone(),dur:life||.32,t:0,ondone:()=>{fxG.remove(m);g.dispose();if(onend)onend()}});
 return m;
}

function playFx(id,ctx){
 lastFx=id;const m=ctx.m,A=worldOf(m.f>=0?m.f:m.t||0),B=worldOf(m.t>=0?m.t:m.f||0);
 A.y=0;B.y=0;const mid=A.clone().lerp(B,.5);mid.y=0;
 const lift=(p,y)=>{const q=p.clone();q.y=y;return q};
 const lo=reduced;
 switch(id){
  case'royalStep':
   glowAt(lift(B,.4),0xffd400,.7,.45);burst(lift(B,.35),0xffe082,nPart(12),1.7,.45);
   fxRingAt(B,0xffe082,.12,.65,.45);
   break;
  case'castleBanners':
   ribbon(lift(A,.25),lift(B,.25),0xffd400,.7,{n:14,size:.28,arc:.2});
   if(m.rf!=null)ribbon(lift(worldOf(m.rf),.25),lift(worldOf(m.rt),.25),0xc9a227,.7,{n:10,size:.24,arc:.15});
   glowAt(lift(B,.55),0xfff0a0,1.2,.7,{grow:2});flash(lift(B,.6),0xffe082,1.4,.45);
   burst(lift(B,.5),0xfff0a0,nPart(18),2.4,.6);fxRingAt(B,0xffd400,.2,1.4,.65);
   if(!lo){for(let i=0;i<4;i++){const p=lift(B,.2+i*.15);later(()=>{const fl=tempMesh(new T.PlaneGeometry(.16,.28),0xffd400,p,.6,{disposeGeo:true,add:true,op:.9});fl.position.x+=(i-1.5)*.12;tweens.push({obj:fl.position,prop:'y',from:p.y,to:p.y+.45,dur:.55,t:0})}, .06*i)}}
   break;
  case'queenFan':{
   ribbon(lift(A,.32),lift(B,.32),0xffe082,.55,{n:14,size:.22,arc:.1});
   glowAt(lift(B,.4),0xffd400,.8,.5);
   if(!lo)for(let i=0;i<8;i++){const ang=i*Math.PI/4,p=lift(B,.35);p.x+=Math.cos(ang)*.28;p.z+=Math.sin(ang)*.28;const c=tempMesh(geoLib().coneS,0xffd400,p,.5,{add:true});c.rotation.x=Math.PI;later(()=>glowAt(p,0xffe082,.25,.35),.08)}
   break;}
  case'rookBattlement':
   ribbon(lift(A,.16),lift(B,.16),0xb0a090,.45,{n:10,size:.18});
   if(!lo){const g=new T.BoxGeometry(.22,.18,.22);for(let u of[.3,.6,.9]){const p=A.clone().lerp(B,u);p.y=.2;tempMesh(g,0x8d7a68,p,.45)}}
   debris(lift(B,.1),0xa1887f,nPart(6),1.4);
   break;
  case'bishopMitre':
   ribbon(lift(A,.38),lift(B,.48),0xc5b8ff,.55,{n:12,size:.2,arc:.22});
   glowAt(lift(B,.55),0xd4c4ff,.7,.5);
   if(!lo)tempMesh(geoLib().cone(.08,.22,8),0xd4c4ff,lift(B,.55),.55,{add:true});
   break;
  case'knightHorseshoe':
   fxRingAt(B,0xd4a574,.16,.8,.45);glowAt(lift(B,.3),0xc9a227,.7,.4);
   burst(lift(B,.25),0xc9a227,nPart(14),2.5,.5);debris(lift(B,.08),0x8d6e63,nPart(5),1.6);
   break;
  case'pawnMarch':
   spark(lift(A,.08),0xc2b280,nPart(7),1.15,.38,{g:10,up:.4});
   if(m.x){burst(lift(B,.2),0xc2b280,nPart(10),1.7,.42);debris(lift(B,.1),0xc2b280,nPart(4),1.5)}
   break;
  case'pawnAscend':
   glowAt(lift(B,.5),0xffd400,1.3,.8,{grow:2.2});flash(lift(B,.7),0xfff0a0,1.6,.5);
   burst(lift(B,.5),0xffd400,nPart(24),3.1,.75);fxRingAt(B,0xfff6c0,.15,1.6,.7);
   {const pillar=tempMesh(new T.CylinderGeometry(.08,.16,1.5,10),0xfff0a0,lift(B,.75),.8,{op:.85,disposeGeo:true,add:true});pillar.scale.y=.2;tweens.push({obj:pillar,prop:'scale',from:new T.Vector3(1,.2,1),to:new T.Vector3(1,1,1),dur:.5,t:0,ease:easeOut})}
   if(!lo)for(let i=0;i<8;i++)later(()=>spark(lift(B,.2+i*.1),0xffe082,3,1.2,.5,{g:2,up:1.2}),.05*i);
   break;
  case'vaulterStep':
   burst(lift(B,.15),0x2a9d8f,nPart(7),1.3,.32);fxRingAt(B,0x2a9d8f,.1,.45,.32);glowAt(lift(B,.25),0x5ee0c8,.4,.3);
   break;
  case'vaulterLeap':
   glowAt(lift(A,.3),0x2a9d8f,.6,.35);fxRingAt(A,0x2a9d8f,.2,.7,.4);
   ribbon(lift(A,.15),lift(B,.15),0x7dffe0,.55,{n:10,size:.24,arc:1.0});
   later(()=>{fxRingAt(B,0x5ee0c8,.18,1.2,.6);burst(lift(B,.3),0x2a9d8f,nPart(16),2.6,.55);glowAt(lift(B,.4),0x5ee0c8,.9,.5);flash(lift(B,.5),0x7dffe0,.8,.3)}, lo?0.08:.22);
   break;
  case'keeperKey':
   burst(lift(B,.3),0x9b59b6,nPart(9),1.5,.38);tempMesh(geoLib().tor,0xce93d8,lift(B,.55),.5,{add:true});glowAt(lift(B,.5),0xce93d8,.55,.4);
   break;
  case'keeperSwirl':{
   const c=0xab47bc;
   if(!lo)for(let i=0;i<12;i++){const u=i/12,p=new T.Vector3(),ang=u*Math.PI*2*1.4,r=.2+u*.5;
    p.set((A.x+B.x)/2+Math.cos(ang)*r,.2+u*.35,(A.z+B.z)/2+Math.sin(ang)*r);glowAt(p,c,.2,.55,{grow:.6})}
   ribbon(lift(A,.3),lift(B,.3),c,.55,{n:10,size:.2,arc:.25});
   fxRingAt(A,c,.15,.9,.55);fxRingAt(B,c,.15,.9,.55);glowAt(lift(mid,.4),0xce93d8,.8,.5);
   break;}
  case'frostSpread':{
   const origin=m.t>=0?m.t:m.f, r=origin>>3,c=origin&7;
   glowAt(lift(worldOf(origin),.4),0x8ad8ff,1.1,.7,{grow:2});flash(lift(worldOf(origin),.5),0xb3ecff,1.1,.45);
   burst(lift(worldOf(origin),.35),0x8ad8ff,nPart(16),2,.55);
   fxRingAt(worldOf(origin),0xb3ecff,.15,1.3,.7);
   for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr<0||rr>7||cc<0||cc>7)continue;
    const i=rr*8+cc,p=lift(worldOf(i),.15);
    later(()=>{
     if(!lo)for(let k=0;k<3;k++){const cr=tempMesh(geoLib().cone(.08,.24,8),0xb3ecff,p.clone(),.85,{op:.95,add:true});cr.position.y=.12+k*.1;cr.position.x+=(k-1)*.06;cr.position.z+=(k-1)*.05;cr.scale.set(.45+k*.15,.5+k*.2,.45)}
     glowAt(p,0xd6f5ff,.45,.55);
     const q=ctx.bd&&ctx.bd[i];
     if(q||(ctx.pre&&ctx.pre[i]&&ctx.pre[i].c!==ctx.side)){
      fxRingAt(worldOf(i),0x8ad8ff,.12,.7,.65);
      const meshP=pins[i];
      if(meshP)meshP.traverse(o=>{if(o.isMesh&&o.material&&o.material.emissive){o.material.emissive.setHex(0x3fa7ff);o.material.emissiveIntensity=.55}});
      if(meshP&&!lo){const shell=tempMesh(new T.IcosahedronGeometry(.4,0),0xa8e4ff,meshP.position.clone(),1.0,{op:.5,disposeGeo:true,side:T.DoubleSide,add:true});shell.position.y=.28;shell.scale.set(1.1,1.4,1.1)}
     }
    }, lo?0.02:0.06*(Math.abs(dr)+Math.abs(dc)));
   }
   break;}
  case'longbowDraw':
   glowAt(lift(A,.35),0x66bb6a,.5,.35);fxRingAt(A,0x27ae60,.1,.5,.32);burst(lift(A,.3),0x66bb6a,nPart(6),1.1,.32);
   break;
  case'longbowArrow':{
   const a=lift(A,.42),b=lift(B,.42);
   glowAt(a,0x7cff6b,.55,.3);
   later(()=>{
    fxBeam(a,b,0x7cff6b,.04,.2);
    fxFly(a,b,0xb6ff8a,.075,lo?.12:.34,()=>{burst(b,0x7cff6b,nPart(18),3.2,.55);fxRingAt(B,0x7cff6b,.15,1.05,.5);glowAt(b,0xc8ffb0,1.0,.45);flash(b,0xb6ff8a,1.3,.3);if(!lo)shake=.16;debris(b,0x7cb342,nPart(6),2.2)});
   }, lo?0:.12);
   break;}
  case'squireSalute':
   ribbon(lift(A,.22),lift(B,.22),0xe67e22,.4,{n:8,size:.16,arc:.08});
   break;
  case'squireKnighting':
   glowAt(lift(B,.5),0xffd400,1.1,.7,{grow:2});flash(lift(B,.6),0xffe082,1.3,.45);
   burst(lift(B,.45),0xf39c12,nPart(22),3.1,.7);fxRingAt(B,0xffd400,.2,1.35,.65);
   if(!lo){tempMesh(geoLib().cone(.08,.22,8),0xffd400,lift(B,.7),.6,{add:true});tempMesh(new T.BoxGeometry(.06,.3,.06),0xffd400,lift(B,.64),.6,{disposeGeo:true,add:true});tempMesh(new T.BoxGeometry(.2,.06,.06),0xffd400,lift(B,.64),.6,{disposeGeo:true,add:true})}
   break;
  case'paladinCross':
   ribbon(lift(A,.3),lift(B,.3),0xf5d76e,.5,{n:10,size:.2,arc:.12});
   {const p=lift(B,.55);tempMesh(new T.BoxGeometry(.07,.34,.07),0xfff3c0,p,.55,{disposeGeo:true,add:true});tempMesh(new T.BoxGeometry(.24,.07,.07),0xfff3c0,p,.55,{disposeGeo:true,add:true});fxRingAt(B,0xffe082,.14,.8,.5);glowAt(p,0xfff3c0,.7,.45)}
   break;
  case'bulwarkStomp':
   if(!lo)shake=.22;shockwave(B,0x90a4ae);burst(lift(B,.08),0x78909c,nPart(12),2,.45);debris(lift(B,.06),0x607d8b,nPart(8),2.2);glowAt(lift(B,.15),0xb0bec5,.7,.35);
   break;
  case'wraithPhase':{
   ribbon(lift(A,.38),lift(B,.38),0xb39ddb,.6,{n:12,size:.22,arc:.18});
   const pre=ctx.pre;between(m.f,m.t).forEach(i=>{const p=lift(worldOf(i),.4);tempMesh(geoLib().ball,0x8e7cc3,p,.6,{op:.5,add:true});if(pre&&pre[i])tempMesh(new T.IcosahedronGeometry(.42,0),0xce93d8,lift(worldOf(i),.3),.55,{op:.35,disposeGeo:true,side:T.DoubleSide,add:true})});
   if(ctx.actor){ctx.actor.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.4}});tweens.push({obj:{n:0},prop:'n',from:0,to:1,dur:.5,t:0,ondone:()=>{ctx.actor.traverse(o=>{if(o.material)o.material.opacity=1})}})}
   glowAt(lift(mid,.45),0xce93d8,.7,.5);
   break;}
  case'bombardFuse':
   ribbon(lift(A,.2),lift(B,.2),0xff7043,.4,{n:6,size:.16});spark(lift(B,.25),0xffa726,nPart(6),1.1,.32,{g:3});
   break;
  case'bombardBlast':{
   const p=lift(A,.35);
   glowAt(p,0xffa726,.6,.25);
   if(!lo){const ball=tempMesh(geoLib().ballL,0x333,p,.28,{op:1});tweens.push({obj:ball.position,prop:null,from:0,to:1,dur:.2,t:0,custom:(o,k)=>{ball.position.y=.35+k*.85},ondone:()=>{fxG.remove(ball)}})}
   later(()=>{
    shockwave(A,0xff5522);glowAt(p,0xff7a2a,1.8,.7,{grow:2.6});flash(p,0xff9a40,2.2,.5);
    burst(p,0xff7a2a,nPart(28),5.2,.8);burst(p,0xffe082,nPart(14),3.2,.55);
    debris(p,0x5d4037,nPart(12),3.4);if(!lo)shake=.62;
    (m.x||[]).forEach(i=>{fxRingAt(worldOf(i),0xff6e40,.12,.85,.5);glowAt(lift(worldOf(i),.3),0xff8a50,.55,.4)});
   }, lo?.04:.2);
   break;}
  case'lancerThrust':
   later(()=>{fxBeam(lift(A,.35),lift(B,.35),0xc9a227,.05,.45);ribbon(lift(A,.35),lift(B,.35),0xffe082,.4,{n:8,size:.18});burst(lift(B,.3),0xffe082,nPart(12),2.4,.45);glowAt(lift(B,.35),0xffe082,.6,.35)}, lo?0:.08);
   break;
  case'berolinaBias':
   ribbon(lift(A,.22),lift(B,.22),0xa1887f,.45,{n:8,size:.16,arc:.14});
   if(!lo){const d=tempMesh(new T.BoxGeometry(.12,.12,.12),0xd7ccc8,lift(B,.35),.45,{disposeGeo:true});d.rotation.set(Math.PI/4,Math.PI/4,0)}
   break;
  case'sergeantChevron':
   ribbon(lift(A,.14),lift(B,.14),0x8d6e63,.4,{n:8,size:.16});
   if(!lo)for(const u of[.4,.75]){const p=A.clone().lerp(B,u);p.y=.2;const a=tempMesh(new T.ConeGeometry(.1,.12,3),0xbcaaa4,p,.42,{disposeGeo:true});a.rotation.x=Math.PI/2}
   break;
  case'shieldWall':{
   const behind=ctx.side==='w'?m.t+8:m.t-8;
   const sh=tempMesh(new T.CylinderGeometry(.3,.3,.06,16),0x90a4ae,lift(B,.3),.65,{disposeGeo:true,op:.9});
   sh.rotation.x=Math.PI/2;sh.scale.set(.4,.4,.4);tweens.push({obj:sh,prop:'scale',from:new T.Vector3(.4,.4,.4),to:new T.Vector3(1,1,1),dur:.3,t:0,ease:easeOutBack});
   glowAt(lift(B,.3),0xb0bec5,.7,.45);
   if(behind>=0&&behind<64){fxBeam(lift(B,.3),lift(worldOf(behind),.3),0xb0bec5,.045,.5);fxRingAt(worldOf(behind),0x90a4ae,.15,.6,.45)}
   break;}
  case'scoutDash':
   ribbon(lift(A,.1),lift(B,.1),0x9ccc65,.35,{n:10,size:.16});
   if(!lo)fxBeam(lift(A,.1),lift(B,.1),0x7cb342,.02,.3);
   spark(lift(B,.08),0x9ccc65,nPart(6),1.3,.3,{g:8,up:.3});
   break;
  case'runnerStreak':
   fxBeam(lift(A,.22),lift(B,.22),0x26a69a,.07,.45);ribbon(lift(A,.22),lift(B,.22),0x80cbc4,.45,{n:12,size:.22});glowAt(lift(B,.25),0x80cbc4,.6,.35);
   break;
  case'camelLunge':
   ribbon(lift(A,.12),lift(B,.12),0xe0c090,.45,{n:8,size:.18,arc:.28});
   burst(lift(A,.06),0xd7ccc8,nPart(9),1.5,.42);burst(lift(B,.06),0xd7ccc8,nPart(9),1.7,.42);
   break;
  case'zebraStripe':
   if(!lo){const cols=[0x111111,0xeeeeee];for(let i=0;i<8;i++){const p=A.clone().lerp(B,i/7);p.y=.3;tempMesh(new T.BoxGeometry(.16,.06,.08),cols[i%2],p,.5,{disposeGeo:true})}}
   else ribbon(lift(A,.25),lift(B,.25),0x455a64,.35,{n:6,size:.16,arc:.2});
   break;
  case'nightriderChain':{
   const path=[];let cur=m.f;path.push(cur);
   const kn=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
   for(let guard=0;guard<8&&cur!==m.t;guard++){
    let best=-1,bd=99;for(const[a,b]of kn){const r=(cur>>3)+a,c=(cur&7)+b;if(r<0||r>7||c<0||c>7)continue;const j=r*8+c,d=Math.abs((m.t>>3)-r)+Math.abs((m.t&7)-c);if(d<bd){bd=d;best=j}}
    if(best<0)break;path.push(best);cur=best}
   for(let i=0;i<path.length-1;i++){const p=worldOf(path[i]),q=worldOf(path[i+1]);ribbon(lift(p,.28),lift(q,.28),0x5c6bc0,.45,{n:5,size:.18,arc:.38});later(()=>fxRingAt(q,0x7986cb,.1,.45,.38), .07*i)}
   glowAt(lift(B,.35),0x9fa8da,.7,.45);
   break;}
  case'cardinalRobe':
   ribbon(lift(A,.32),lift(B,.32),0xc62828,.5,{n:10,size:.2,arc:.1});
   burst(lift(B,.3),0xe57373,nPart(10),1.6,.45);glowAt(lift(B,.35),0xef9a9a,.55,.4);
   break;
  case'elephantTusk':
   if(!lo)shake=.26;shockwave(B,0x8d8d8d);burst(lift(B,.08),0xa0a0a0,nPart(16),2.4,.55);debris(lift(B,.08),0xbdbdbd,nPart(8),2.2);glowAt(lift(B,.2),0xeeeeee,.7,.35);
   break;
  case'priestHalo':{
   const h=tempMesh(geoLib().tor,0xce93d8,lift(B,.7),.75,{op:.95,add:true});h.rotation.x=Math.PI/2;h.scale.set(1.3,1.3,1.3);
   tweens.push({obj:h.position,prop:null,from:0,to:1,dur:.6,t:0,custom:(o,k)=>{h.position.y=.55+k*.4}});
   glowAt(lift(B,.55),0xce93d8,.8,.55);burst(lift(B,.4),0xce93d8,nPart(10),1.3,.45);
   break;}
  case'towerShadow':{
   const sh=tempMesh(new T.BoxGeometry(.4,1.15,.4),0x5d4037,lift(B,.58),.55,{op:.4,disposeGeo:true});
   sh.scale.y=.2;tweens.push({obj:sh,prop:'scale',from:new T.Vector3(1,.2,1),to:new T.Vector3(1,1,1),dur:.45,t:0,ease:easeOut});
   ribbon(lift(A,.15),lift(B,.15),0x6d4c41,.4,{n:8,size:.16});
   break;}
  case'ramTrot':
   spark(lift(A,.06),0x8d6e63,nPart(6),1.1,.32,{g:12,up:.3});spark(lift(B,.06),0x8d6e63,nPart(6),1.3,.32,{g:12,up:.3});
   break;
  case'ramCharge':{
   glowAt(lift(A,.25),0xa1887f,.5,.25);
   later(()=>{
    fxBeam(lift(A,.25),lift(B,.25),0x6d4c41,.08,.4);ribbon(lift(A,.2),lift(B,.2),0xd7ccc8,.4,{n:10,size:.22});
    burst(lift(A,.08),0xd7ccc8,nPart(12),2.1,.5);burst(lift(B,.15),0xd7ccc8,nPart(16),2.8,.55);
    shockwave(B,0x8d6e63);if(!lo)shake=.3;debris(lift(B,.1),0x8d6e63,nPart(8),2.4);
    if(m.pt!=null){fxRingAt(B,0x8d6e63,.2,.9,.45);
     const pushed=pins[m.pt];if(pushed){const from=sqPos(m.t),to=sqPos(m.pt);pushed.position.set(from.x,0,from.z);tweens.push({obj:pushed,prop:'pos',from:new T.Vector3(from.x,0,from.z),to:new T.Vector3(to.x,0,to.z),dur:.3,t:0,ease:easeOut})}}
   }, lo?0:.1);
   break;}
  case'wardenDome':{
   glowAt(lift(B,.2),0xab47bc,.5,.3);
   later(()=>{
    const dome=tempMesh(new T.SphereGeometry(.75,16,10,0,Math.PI*2,0,Math.PI/2),0x9b59b6,lift(B,0),.9,{op:.45,disposeGeo:true,side:T.DoubleSide,add:true});
    dome.scale.set(.15,.15,.15);tweens.push({obj:dome,prop:'scale',from:new T.Vector3(.15,.15,.15),to:new T.Vector3(1,1,1),dur:.5,t:0,ease:easeOutBack});
    fxRingAt(B,0xab47bc,.2,1.2,.6);glowAt(lift(B,.35),0xce93d8,1.0,.65,{grow:1.8});flash(lift(B,.4),0xce93d8,.9,.4);
    if(!lo)fxRingAt(B,0xe1bee7,.3,1.6,.8);
   }, lo?0:.1);
   break;}
  case'empressRegalia':
   ribbon(lift(A,.32),lift(B,.32),0xce93d8,.55,{n:12,size:.22,arc:.12});
   burst(lift(B,.45),0xea80fc,nPart(16),2.5,.55);glowAt(lift(B,.5),0xea80fc,.85,.5);
   if(!lo)for(let i=0;i<6;i++){const a=i*Math.PI/3,p=lift(B,.5);p.x+=Math.cos(a)*.22;p.z+=Math.sin(a)*.22;tempMesh(geoLib().ballS,0xe040fb,p,.5,{add:true});glowAt(p,0xea80fc,.25,.4)}
   break;
  case'princessBloom':
   ribbon(lift(A,.3),lift(B,.3),0xf48fb1,.55,{n:12,size:.2,arc:.2});
   glowAt(lift(B,.35),0xf8bbd0,.8,.55);
   if(!lo)for(let i=0;i<8;i++){const a=i*Math.PI/4,p=lift(B,.35);const dest=p.clone();dest.x+=Math.cos(a)*.45;dest.z+=Math.sin(a)*.45;const petal=tempMesh(new T.SphereGeometry(.07,8,6),0xf8bbd0,p,.6,{disposeGeo:true,add:true});tweens.push({obj:petal,prop:'pos',from:p,to:dest,dur:.55,t:0,ease:easeOut})}
   else burst(lift(B,.3),0xf48fb1,nPart(8),1.6,.4);
   break;
  case'amazonSpear':
   fxBeam(lift(A,.4),lift(B,.55),0x2e7d32,.045,.5);ribbon(lift(A,.28),lift(B,.28),0x81c784,.45,{n:10,size:.18,arc:.1});burst(lift(B,.4),0xa5d6a7,nPart(12),2.1,.45);glowAt(lift(B,.45),0xa5d6a7,.55,.35);
   break;
  case'warlordHelm':
   burst(lift(B,.4),0xe53935,nPart(16),2.8,.55);glowAt(lift(B,.45),0xff1744,.8,.45);fxRingAt(B,0xc62828,.15,.8,.45);
   if(!lo)for(let i=0;i<6;i++){const a=i*Math.PI/3,s=tempMesh(geoLib().coneS,0xb71c1c,lift(B,.5),.5,{add:true});s.position.x+=Math.cos(a)*.16;s.position.z+=Math.sin(a)*.16}
   if(!lo)shake=.12;
   break;
  case'monarchCrown':
   burst(lift(B,.55),0xffd54f,nPart(20),2.4,.6);glowAt(lift(B,.55),0xffe082,1.0,.6,{grow:2});flash(lift(B,.6),0xffe082,1.1,.4);
   if(!lo)for(let i=0;i<8;i++){const a=i*Math.PI/4,s=tempMesh(geoLib().cone(.08,.22,8),0xffb300,lift(B,.55),.55,{add:true});s.position.x+=Math.cos(a)*.2;s.position.z+=Math.sin(a)*.2;s.scale.set(.7,1.15,.7)}
   fxRingAt(B,0xffe082,.2,1.25,.6);
   break;
  case'phantomDrift':
   ribbon(lift(A,.32),lift(B,.32),0xb39ddb,.5,{n:8,size:.2,arc:.1});
   glowAt(lift(mid,.4),0xb39ddb,.55,.4);
   if(ctx.actor){ctx.actor.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.5}})}
   break;
  case'phantomWarp':{
   glowAt(lift(A,.45),0x7e57c2,.9,.5);fxRingAt(A,0x7e57c2,.2,1.25,.55);burst(lift(A,.4),0x7e57c2,nPart(16),2.6,.55);
   flash(lift(A,.5),0xb388ff,1.2,.3);
   if(ctx.actor){ctx.actor.visible=false}
   if(!lo){const rift=tempMesh(new T.TorusGeometry(.35,.04,8,18),0xce93d8,lift(A,.5),.55,{disposeGeo:true,add:true});rift.rotation.x=Math.PI/2}
   later(()=>{
    fxRingAt(B,0x7e57c2,.2,1.25,.55);burst(lift(B,.4),0xb39ddb,nPart(16),2.6,.55);
    glowAt(lift(B,.45),0xe1bee7,1.0,.55);flash(lift(B,.5),0xb388ff,1.2,.3);
    if(ctx.actor)ctx.actor.visible=true;
    if(!lo){const r2=tempMesh(new T.TorusGeometry(.35,.04,8,18),0xce93d8,lift(B,.5),.5,{disposeGeo:true,add:true});r2.rotation.x=Math.PI/2}
   }, lo?.08:.3);
   break;}
  case'dragonStep':
   spark(lift(B,.12),0xff8a65,nPart(9),1.5,.42,{g:6});glowAt(lift(B,.2),0xff6d00,.45,.3);
   break;
  case'dragonBreath':{
   glowAt(lift(A,.4),0xff6d00,.7,.3);flash(lift(A,.45),0xff6d00,.8,.25);
   later(()=>{
    const n=nPart(26);
    const dir=B.clone().sub(A).normalize();
    for(let i=0;i<n;i++){
     const u=i/(n-1||1),p=A.clone().lerp(B,u);p.y=.28+Math.random()*.2;
     const col=i%3?0xff6d00:0xffe082;
     spark(p,col,2,1.8,.4+u*.25,{dir,g:2,up:.8,size:.16+u*.1,grow:1.4});
    }
    fxBeam(lift(A,.35),lift(B,.35),0xff3d00,.1,.45);
    ribbon(lift(A,.35),lift(B,.4),0xff8a00,.5,{n:12,size:.3,arc:.12});
    later(()=>{burst(lift(B,.3),0xff6d00,nPart(16),2.8,.55);fxRingAt(B,0xff3d00,.18,1.1,.5);glowAt(lift(B,.35),0xffe082,1.1,.5);flash(lift(B,.4),0xff8a00,1.5,.4);if(!lo)shake=.28;debris(lift(B,.15),0x5d4037,nPart(6),2)}, lo?.08:.22);
   }, lo?0:.12);
   break;}
  case'wyvernGust':{
   const n=nPart(16);
   for(let i=0;i<n;i++){
    const u=i/(n-1||1),p=A.clone().lerp(B,u);p.y=.2;
    const side=(i%2?1:-1)*.3,ang=u*Math.PI;
    p.x+=Math.cos(ang)*side;p.z+=Math.sin(ang)*side;
    glowAt(p,0x4db6ac,.28,.5,{grow:1.5});
    if(!lo){const w=tempMesh(new T.PlaneGeometry(.3,.16),0x4db6ac,p,.55,{side:T.DoubleSide,disposeGeo:true,op:.85,add:true});w.lookAt(B);const to=p.clone();to.y+=.4;tweens.push({obj:w,prop:'pos',from:p,to,dur:.5,t:0})}
   }
   fxRingAt(B,0x00897b,.18,1.0,.5);glowAt(lift(B,.3),0x4db6ac,.7,.4);
   break;}
  case'oracleGlow':
   tempMesh(geoLib().ballL,0x29b6f6,lift(A,.5),.5,{op:.75,add:true});fxRingAt(A,0x29b6f6,.12,.55,.4);glowAt(lift(A,.5),0x4fc3f7,.8,.45);
   break;
  case'oracleVision':{
   glowAt(lift(A,.55),0x29b6f6,1.0,.4);
   later(()=>{
    fxRingAt(A,0x29b6f6,.2,2.4,.8);fxRingAt(B,0x4fc3f7,.2,1.55,.7);
    if(!lo){fxRingAt(A,0xb3e5fc,.3,3.4,1.0);tempMesh(geoLib().ballL,0x29b6f6,lift(A,.6),.75,{op:.65,add:true});flash(lift(A,.6),0x4fc3f7,1.4,.5)}
    burst(lift(A,.4),0x29b6f6,nPart(14),2.1,.55);burst(lift(B,.4),0x4fc3f7,nPart(14),2.1,.55);
    glowAt(lift(A,.55),0xb3e5fc,1.4,.8,{grow:2.2});glowAt(lift(B,.45),0x4fc3f7,1.0,.65);
    if(!lo){const shaft=tempMesh(new T.CylinderGeometry(.12,.22,2.2,12),0x81d4fa,lift(A,1.1),.7,{op:.45,disposeGeo:true,add:true});shaft.scale.y=.2;tweens.push({obj:shaft,prop:'scale',from:new T.Vector3(1,.2,1),to:new T.Vector3(1,1,1),dur:.45,t:0})}
   }, lo?0:.1);
   break;}
  case'seerWisp':
   burst(lift(B,.3),0x81d4fa,nPart(7),1.2,.38);tempMesh(geoLib().ballS,0x4fc3f7,lift(B,.45),.45,{op:.75,add:true});glowAt(lift(B,.4),0x81d4fa,.5,.4);
   break;
  case'seerGlimpse':
   fxRingAt(A,0x4fc3f7,.15,1.2,.55);fxRingAt(B,0x81d4fa,.12,1.0,.55);
   if(!lo)fxRingAt(A,0xe1f5fe,.25,1.8,.75);
   burst(lift(A,.35),0x4fc3f7,nPart(10),1.7,.45);burst(lift(B,.35),0x81d4fa,nPart(10),1.7,.45);
   glowAt(lift(A,.4),0xe1f5fe,.9,.55);glowAt(lift(B,.4),0x81d4fa,.7,.5);
   break;
  default:
   ribbon(lift(A,.2),lift(B,.2),0xcccccc,.4,{n:6,size:.16});
 }
}

function fadeCaptures(anim,m){
 (anim.dead||[]).forEach(d=>{
  if(m.k==='sh'||m.k==='ex'||(m.x&&m.x.includes(d.i))){
   const acc=(G.GF&&G.GF.P&&G.GF.P[d.t]&&G.GF.P[d.t].col)||null;
   const g=pieceMesh(d.t,d.c,acc);const p=sqPos(d.i);g.position.set(p.x,0,p.z);if(d.c==='b')g.rotation.y=Math.PI;
   pieceG.add(g);
   if(reduced){g.visible=false;return}
   burst(new T.Vector3(p.x,.3,p.z), d.c==='w'?0xf1e6cf:0x445566, 12, 2.8, .55);debris(new T.Vector3(p.x,.25,p.z), d.c==='w'?0xe8d9b0:0x333844, 6, 2.2);if(!reduced)flash(new T.Vector3(p.x,.4,p.z),0xffe0a0,.7,.25);
   tweens.push({obj:g.scale,prop:null,from:1,to:.2,dur:.4,t:0,custom:(o,k)=>g.scale.setScalar(Math.max(.2,1-k))});
   tweens.push({obj:g,prop:'visible',from:1,to:0,dur:.4,t:0,ondone:()=>pieceG.remove(g),custom:(o,k)=>{g.traverse(c=>{if(c.material){if(!c.userData._tr){c.material=c.material.clone();c.material.transparent=true;c.userData._tr=1}c.material.opacity=1-k}})}});
  }
 });
}

function animateMove(anim, bd){
 if(!anim||!anim.m){placePieces(bd);return}
 const m=anim.m;
 placePieces(bd);
 if(m.k==='pass'){lastFx='pass';return}
 const dur=reduced?0.12:0.4;
 const hop=isHop(m)&&!reduced;
 fadeCaptures(anim,m);
 const moveOne=(from,to,mesh,arc)=>{
  if(!mesh||from===to)return;
  const a=sqPos(from), b=sqPos(to);
  mesh.position.set(a.x,0,a.z);
  tweens.push({obj:mesh,prop:'pos',from:new T.Vector3(a.x,0,a.z),to:new T.Vector3(b.x,0,b.z),dur,t:0,arc:arc?(m.k==='v'?1.7:1.2):0,ease:easeOut,ondone:()=>{mesh.position.set(b.x,0,b.z);dirty=true}});
 };
 const typ=preType(anim,m)||(pins[m.t]&&pins[m.t].userData.type)||(pins[m.f]&&pins[m.f].userData.type);
 // motion
 if(m.k==='sh'){/* shooter stays */}
 else if(m.k==='ex'){/* self may vanish */}
 else if(m.k==='sw'||m.k==='os'){
  const A=pins[m.t],B=pins[m.f];
  if(A)moveOne(m.f,m.t,A,true);if(B)moveOne(m.t,m.f,B,true);
 }
 else if(m.k==='cs'){
  const k=pins[m.t], r=m.rt!=null?pins[m.rt]:null;
  if(k)moveOne(m.f,m.t,k,false);if(r)moveOne(m.rf,m.rt,r,false);
 }
 else if(m.k==='tp'){
  const actor=pins[m.t];if(actor){actor.position.set(sqPos(m.t).x,0,sqPos(m.t).z)}
 }
 else if(m.k==='pu'){
  const actor=pins[m.t];if(actor)moveOne(m.f,m.t,actor,false);
 }
 else {
  const actor=pins[m.t];
  if(actor)moveOne(m.f,m.t,actor,hop||m.k==='v');
 }
 const actor=pins[m.t]||pins[m.f];
 const id=pickFx(typ,m,anim);
 lastFx=id;
 playFx(id,{m,bd,pre:preBd(anim),side:anim.side,actor,anim});
 if(m.pr&&id!=='pawnAscend'){
  // already handled for pawns; other second-rank promotions still get a small flash unique? keep modest so it doesn't collide
  burst(worldOf(m.t).setY(.4),0xffd400,nPart(8),2,.4);
 }
}


function kingFall(state){
 if(reduced||!state||!state.over||state.over==='draw')return;
 const loser=state.over==='w'?'b':'w';
 let ki=-1;for(let i=0;i<64;i++){const p=state.bd[i];if(p&&p.c===loser&&(p.t==='K'||p.t==='k'||p.t==='o'||p.t==='h'||(G.GF&&G.GF.isK&&G.GF.isK(p.t)))){ki=i;break}}
 const m=pins[ki];if(!m)return;
 shake=.5;
 tweens.push({obj:m.rotation,prop:'x',from:0,to:Math.PI/2,dur:.8,t:0});
}

function tick(now){
 if(!running)return;
 raf=requestAnimationFrame(tick);
 const dt=Math.min(.05,(now-(tPrev||now))/1000);tPrev=now;
 // fps watch
 fpsWin.push(dt);if(fpsWin.length>90)fpsWin.shift();
 if(now-mountedAt>2500&&fpsWin.length>60){
  const avg=fpsWin.reduce((a,b)=>a+b,0)/fpsWin.length;
  if(avg>0.055){failN++;if(failN>2){failN=0;if(!reduced){api.setReduced(true);lowHint=true}else if(onFallback){onFallback('performance');return}}}
  else failN=0;
 }
 let animating=tweens.length||parts.length||shake>0;
 // tweens
 for(let i=tweens.length-1;i>=0;i--){
  const tw=tweens[i];
  if(tw.delay>0){tw.delay-=dt;if(tw.delay>0){animating=true;continue}}
  tw.t+=dt;const u=Math.min(1,tw.t/tw.dur),k=(tw.ease||ease)(u);
  if(tw.custom)tw.custom(tw.obj,k);
  else if(tw.prop==='pos'){
   const p=tw.from.clone().lerp(tw.to,k);
   if(tw.arc)p.y+=Math.sin(k*Math.PI)*tw.arc;
   tw.obj.position.copy(p);
  } else if(tw.from&&tw.from.clone){
   tw.obj[tw.prop].copy(tw.from.clone().lerp(tw.to,k));
  } else if(typeof tw.from==='number' && tw.prop){
   tw.obj[tw.prop]=tw.from+(tw.to-tw.from)*k;
  }
  if(u>=1){tweens.splice(i,1);if(tw.ondone)tw.ondone()}
  animating=true;
 }
 // particles
 for(let i=parts.length-1;i>=0;i--){
  const p=parts[i];p.age+=dt;p.v.y-=(p.g||0)*dt;p.m.position.addScaledVector(p.v,dt);
  if(p.bounce&&p.m.position.y<.05&&p.v.y<0){p.v.y*=-.35;p.m.position.y=.05;p.v.x*=.65;p.v.z*=.65}
  if(p.spin){p.m.rotation.x+=p.spin*dt;p.m.rotation.z+=p.spin*.6*dt}
  const mat=p.m.material;if(mat)mat.opacity=Math.max(0,1-p.age/p.life);
  if(p.s0!=null&&p.m.scale&&p.kind!=='deb')p.m.scale.setScalar(p.s0+(p.s1-p.s0)*Math.min(1,p.age/p.life));
  if(p.age>=p.life){freePart(p);parts.splice(i,1)}
  animating=true;
 }
 // pulses
 markG.children.forEach(c=>{if(c.userData.pulse){const s=1+Math.sin(now*0.008)*.12;c.scale.set(s,s,s);animating=true}});
 // wing idle
 pieceG.children.forEach(p=>{p.children.forEach(ch=>{if(ch.userData.wing&&!reduced){ch.rotation.z=ch.userData.wing*(.55+Math.sin(now*0.004)*.2);animating=true}if(ch.userData.billboard&&camera){ch.quaternion.copy(camera.quaternion);animating=true}})});
 // camera
 let shx=0,shy=0;
 if(shake>0){shake=Math.max(0,shake-dt);shx=(Math.random()-.5)*shake*.25;shy=(Math.random()-.5)*shake*.2;animating=true}
 if(animating||dirty){
  applyView();
  if(shake>0){camera.position.x+=shx;camera.position.y+=shy;camera.lookAt(0,.2,0)}
  renderer.render(scene,camera);dirty=false;
 }
}

const TAP=14;
let pinch0=0,holdT=null,holdFired=false;
function distT(t){const a=t[0],b=t[1];return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)}
function onPtrDown(e){
 if(!renderer)return;
 if(e.touches&&e.touches.length===2){pinch0=distT(e.touches);clearTimeout(holdT);e.preventDefault();return}
 const ev=e.touches?e.touches[0]:e;
 drag=true;didMove=false;holdFired=false;px=ev.clientX;py=ev.clientY;pid=ev.pointerId;
 try{e.target.setPointerCapture&&e.target.setPointerCapture(pid)}catch(_){}
 clearTimeout(holdT);
 holdT=setTimeout(()=>{if(drag&&!didMove){holdFired=true;showHoldTip(px,py)}},450);
}
function onPtrMove(e){
 if(e.touches&&e.touches.length===2){
  const d=distT(e.touches);if(pinch0){view.d=clamp(view.d*(pinch0/d),10,17);pinch0=d;applyView()}e.preventDefault();didMove=true;clearTimeout(holdT);return;
 }
 if(!drag)return;
 const ev=e.touches?e.touches[0]:e;
 const dx=ev.clientX-px, dy=ev.clientY-py;
 if(Math.hypot(dx,dy)>TAP){
  didMove=true;clearTimeout(holdT);hideHoldTip();
  if(!orbitLock){view.th-=dx*0.007;view.ph=clamp(view.ph+dy*0.005,0.40,1.22);px=ev.clientX;py=ev.clientY;applyView()}
 }
}
function onPtrUp(e){
 if(e.touches&&e.touches.length){if(e.touches.length<2)pinch0=0;return}
 const ev=e.changedTouches?e.changedTouches[0]:e;
 const was=didMove,held=holdFired;drag=false;didMove=false;pinch0=0;holdFired=false;clearTimeout(holdT);
 if(!was&&!held)pick(ev.clientX, ev.clientY);
 setTimeout(hideHoldTip,1600);
}
function onWheel(e){e.preventDefault();view.d=clamp(view.d+e.deltaY*0.01,10,17);applyView()}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

function tipEl(){if(!host)return null;let t=host.querySelector('.pcTip');if(!t){t=document.createElement('div');t.className='pcTip hide';host.appendChild(t)}return t}
function showHoldTip(cx,cy){
 const i=sqAt(cx,cy);if(i==null)return;const p=pins[i];if(!p)return;
 const t=tipEl();if(!t)return;const rec=host.getBoundingClientRect();
 t.textContent=(PNAME[p.userData.type]||p.userData.type);t.classList.remove('hide');
 t.style.left=(cx-rec.left)+'px';t.style.top=(cy-rec.top)+'px';
}
function hideHoldTip(){const t=host&&host.querySelector('.pcTip');if(t)t.classList.add('hide')}
function sqAt(cx,cy){
 if(!renderer)return null;
 const rec=renderer.domElement.getBoundingClientRect();
 const ndc=new T.Vector2(((cx-rec.left)/rec.width)*2-1, -((cy-rec.top)/rec.height)*2+1);
 const R=new T.Raycaster();R.setFromCamera(ndc,camera);
 const hits=R.intersectObjects(tiles,false);
 return hits.length?hits[0].object.userData.sq:null;
}
const ray=()=>new T.Raycaster();
function pick(cx,cy){if(!onClick)return;const i=sqAt(cx,cy);if(i!=null)onClick(i)}

function bind(el){
 const opt={passive:false};
 el.addEventListener('pointerdown',onPtrDown);
 el.addEventListener('pointermove',onPtrMove);
 el.addEventListener('pointerup',onPtrUp);
 el.addEventListener('pointercancel',onPtrUp);
 el.addEventListener('touchstart',onPtrDown,opt);
 el.addEventListener('touchmove',onPtrMove,opt);
 el.addEventListener('touchend',onPtrUp);
 el.addEventListener('wheel',onWheel,opt);
}
function unbind(el){
 if(!el)return;
 el.removeEventListener('pointerdown',onPtrDown);
 el.removeEventListener('pointermove',onPtrMove);
 el.removeEventListener('pointerup',onPtrUp);
 el.removeEventListener('pointercancel',onPtrUp);
 el.removeEventListener('touchstart',onPtrDown);
 el.removeEventListener('touchmove',onPtrMove);
 el.removeEventListener('touchend',onPtrUp);
 el.removeEventListener('wheel',onWheel);
}

function resize(){
 if(!renderer||!host)return;
 const w=Math.max(1,host.clientWidth), h=Math.max(1,host.clientHeight);
 const pr=reduced?1:Math.min(window.devicePixelRatio||1, host.clientWidth<500?1.5:2);
 renderer.setPixelRatio(pr);renderer.setSize(w,h,false);
 camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;
}

api.mount=function(el, opts){
 opts=opts||{};
 T=G.THREE||window.THREE;
 if(!T)throw new Error('Three.js missing');
 host=el;onClick=opts.onClick||onClick;onFallback=opts.onFallback||onFallback;
 reduced=!!opts.reduced;theme=opts.theme||theme;flipped=!!opts.flipped;coordsOn=opts.coords!==false;if(opts.orbitLock!=null)orbitLock=!!opts.orbitLock;if(opts.badges!=null)badgesOn=!!opts.badges;
 if(!renderer){
  scene=new T.Scene();scene.background=new T.Color(0x14171f);
  camera=new T.PerspectiveCamera(40,1,0.1,80);
  renderer=new T.WebGLRenderer({antialias:!reduced,alpha:false,powerPreference:'high-performance'});
  renderer.shadowMap.enabled=!reduced;
  if(T.PCFSoftShadowMap)renderer.shadowMap.type=T.PCFSoftShadowMap;
  if(T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace;
  else if(T.sRGBEncoding)renderer.outputEncoding=T.sRGBEncoding;
  if(T.ACESFilmicToneMapping){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=reduced?1.0:1.2}
  renderer.domElement.id='gf3d';
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;z-index:3;border-radius:inherit';
  root=new T.Group();scene.add(root);
  pieceG=new T.Group();markG=new T.Group();fxG=new T.Group();
  root.add(pieceG);root.add(markG);root.add(fxG);
 }
 host.classList.add('view3d');
 if(renderer.domElement.parentNode!==host)host.appendChild(renderer.domElement);
 bind(renderer.domElement);
 geoLib();ensureEnv();buildBoard();setupLights();setDefaultView();resize();
 if(!api._ro&&typeof ResizeObserver!=='undefined'){api._ro=new ResizeObserver(()=>resize());}
 if(api._ro)api._ro.observe(host);
 window.addEventListener('resize',resize);
 running=true;mountedAt=performance.now();fpsWin=[];failN=0;tPrev=0;dirty=true;
 cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
};

api.unmount=function(){
 running=false;cancelAnimationFrame(raf);raf=0;
 if(renderer){unbind(renderer.domElement);if(renderer.domElement.parentNode)renderer.domElement.parentNode.removeChild(renderer.domElement)}
 if(host){host.classList.remove('view3d');if(api._ro)try{api._ro.unobserve(host)}catch(_){}}
 host=null;tweens.length=0;parts.forEach(freePart);parts.length=0;fxLights.forEach(l=>{if(l.parent)l.parent.remove(l)});fxLights=[];shake=0;
};

api.sync=function(state, opts){
 if(!renderer||!state)return;
 opts=opts||{};
 if(opts.flipped!=null&&opts.flipped!==flipped){flipped=opts.flipped;setDefaultView()}
 if(opts.coords!=null&&opts.coords!==coordsOn){coordsOn=opts.coords;buildLabels()}
 if(opts.theme&&opts.theme!==theme){theme=opts.theme;buildBoard();setupLights()}
 if(opts.reduced!=null&&opts.reduced!==reduced)api.setReduced(opts.reduced);
 if(opts.onClick)onClick=opts.onClick;
 if(opts.anim&&opts.anim.m)animateMove(opts.anim, state.bd);
 else placePieces(state.bd);
 setMarks({sel:opts.sel,last:opts.last,moves:opts.moves,checked:opts.checked,hint:opts.hint});
 if(opts.anim&&state.over&&state.over!=='draw')setTimeout(()=>kingFall(state), reduced?50:380);
 dirty=true;
};

api.setTheme=function(t){if(!t||t===theme)return;theme=t;if(renderer){buildBoard();setupLights();dirty=true}};
api.setFlipped=function(v){if(!!v===flipped)return;flipped=!!v;setDefaultView()};
api.setCoords=function(v){coordsOn=!!v;if(renderer)buildLabels()};
api.setReduced=function(v){
 v=!!v;if(v===reduced&&renderer){if(renderer.shadowMap)renderer.shadowMap.enabled=!reduced;return}
 reduced=v;
 if(renderer){
  renderer.shadowMap.enabled=!reduced;
  if(renderer.toneMappingExposure!=null)renderer.toneMappingExposure=reduced?1.0:1.2;
  tweens.length=0;parts.forEach(freePart);parts.length=0;if(fxG)clearGroup(fxG);
  fxLights.forEach(l=>{if(l.parent)l.parent.remove(l)});fxLights=[];
  if(geos){Object.values(geos).forEach(g=>{if(g&&g.dispose)g.dispose()});geos=null}
  clearMats();pieceCache={};
  if(reduced){if(scene)scene.environment=null}else ensureEnv();
  setupLights();geoLib();buildBoard();resize();placePiecesRebuild();dirty=true;
 }
};
function placePiecesRebuild(){
 const snap={};Object.keys(pins).forEach(k=>{const m=pins[k];snap[k]={t:m.userData.type,c:m.userData.color}});
 const bd=Array.from({length:64},(_,i)=>snap[i]||null);
 placePieces(bd,{keep:false});
}
api.resetView=function(){view={th:vDef.th, ph:vDef.ph, d:vDef.d};applyView()};
api.setOrbitLock=function(v){orbitLock=!!v};
api.orbitLocked=function(){return !!orbitLock};
api.setBadges=function(v){badgesOn=!!v;dirty=true};

api.resize=resize;
api.tap=function(i){if(onClick)onClick(i)};
api.setClick=function(fn){onClick=fn};
api.setFallback=function(fn){onFallback=fn};
api.cameraPose=function(){return{th:view.th,ph:view.ph,d:view.d,x:camera?camera.position.x:0,y:camera?camera.position.y:0,z:camera?camera.position.z:0}};
api.fxTable=function(){const o={};Object.keys(FXMAP).forEach(k=>{const s=FXMAP[k];o[k]={name:s.name,sig:s.sig,special:s.special||null}});return o};
api.fxIds=function(){const ids=[];Object.keys(FXMAP).forEach(k=>{const s=FXMAP[k];ids.push(s.sig);if(s.special)ids.push(s.special)});return ids};
api.lastFx=function(){return lastFx};
api.pickFx=pickFx;
api.demo=function(spec){
 if(!renderer)return null;
 const preBd=Array(64).fill(null), postBd=Array(64).fill(null);
 (spec.pieces||[]).forEach(p=>{preBd[p.i]={t:p.t,c:p.c};postBd[p.i]={t:p.t,c:p.c}});
 const m=spec.m;const typ=preBd[m.f]&&preBd[m.f].t;
 // apply a shallow post
 const after=spec.post||{};
 Object.keys(after).forEach(i=>{const n=+i;postBd[n]=after[n]});
 if(m.k==='m'||m.k==='v'||m.k==='tp'||m.k==='pu'){postBd[m.t]=preBd[m.f];postBd[m.f]=null;if(m.pr)postBd[m.t]={t:m.pr,c:preBd[m.f]&&preBd[m.f].c}}
 if(m.k==='ex'){postBd[m.f]=null;(m.x||[]).forEach(i=>postBd[i]=null)}
 if(m.k==='sh'){(m.x||[]).forEach(i=>postBd[i]=null)}
 if(m.k==='sw'||m.k==='os'){const a=preBd[m.f],b=preBd[m.t];postBd[m.t]=a;postBd[m.f]=b}
 const dead=spec.dead||[];
 animateMove({m,dead,pre:{bd:preBd},side:spec.side||'w'}, postBd);
 return lastFx;
};
const LINEUP=['K','k','o','h','Q','E','O','m','R','t','r','w','B','d','e','p','N','c','z','n','C','L','V','W','P','Y','J','U','Z','I','S','H','F','A','G','X','D','y','q','s'];
let _savedView=null,_lineupOn=false;
api.showLineup=function(){
 if(!renderer)return null;
 _lineupOn=true;_savedView={th:view.th,ph:view.ph,d:view.d};
 clearGroup(pieceG);pins={};clearGroup(markG);
 const accOfP=t=>ACCENT[t]||0xc9a227;
 for(let i=0;i<LINEUP.length;i++){
  const t=LINEUP[i],col=i%8,row=(i/8)|0;
  const m=pieceMesh(t,'w',accOfP(t));
  // sit on ranks 2–6 so every model stays inside the frame
  m.position.set(col-3.5,0,row-2.0);
  namePlate(m,t,accOfP(t));
  pieceG.add(m);
 }
 view.th=0;view.ph=0.55;view.d=15.2;applyView();
 if(camera){camera.lookAt(0,0.1,0.2)}
 renderer.render(scene,camera);
 return {n:LINEUP.length,order:LINEUP.slice(),names:LINEUP.map(t=>PNAME[t])};
};
api.hideLineup=function(){
 _lineupOn=false;clearGroup(pieceG);pins={};
 if(_savedView){view={th:_savedView.th,ph:_savedView.ph,d:_savedView.d};_savedView=null}
 else setDefaultView();
 dirty=true;
};
api.lineupOn=function(){return _lineupOn};
Object.defineProperty(api,'reduced',{get:()=>reduced});

Object.defineProperty(api,'FXMAP',{get:()=>FXMAP});
})(typeof globalThis!=='undefined'?globalThis:this);
