/* Gambit Forge 3D board — Three.js, lazy-loaded, phone-friendly */
(function(G){
'use strict';
const api={};
G.GF3D=api;

let T, scene, camera, renderer, root, boardG, pieceG, markG, fxG, rimG, labG;
let host=null, raf=0, reduced=false, coordsOn=true, flipped=false, theme='wood';
let onClick=null, onFallback=null, tweens=[], parts=[], shake=0, dirty=true, running=false;
let view={th:0, ph:0.95, d:11.5}, vDef={th:0, ph:0.95, d:11.5};
let drag=false, didMove=false, px=0, py=0, pid=null, pins={}, tiles=[], lastHint=null;
let lights={}, mats={}, geos=null, pieceCache={}, labels=[], fpsWin=[], failN=0, tPrev=0;
let lowHint=false, mountedAt=0;

const COL={w:{body:0xf1e6cf, acc:0xc9a227, ink:0x5a4020}, b:{body:0x2a2d36, acc:0xc5ccd6, ink:0x0c0c10}};
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

function geoLib(){
 if(geos)return geos;
 const g={};
 const cyl=(a,b,h,s)=>new T.CylinderGeometry(a,b,h,s||12);
 const sph=(r,w,h)=>new T.SphereGeometry(r,w||12,h||8);
 const box=(x,y,z)=>new T.BoxGeometry(x,y,z);
 const cone=(r,h,s)=>new T.ConeGeometry(r,h,s||10);
 g.foot=cyl(.30,.34,.07,16); g.ring=cyl(.22,.28,.055,14);
 g.stem=cyl(.10,.18,.36,12); g.collar=cyl(.15,.15,.05,12);
 g.ball=sph(.16,12,10); g.ballS=sph(.11,10,8); g.ballL=sph(.22,12,10);
 g.box=box(1,1,1); g.cone=cone(.16,.28,10); g.coneS=cone(.08,.16,8);
 g.tor=new T.TorusGeometry(.16,.03,8,16);
 g.tile=box(.98,.12,.98);
 g.merlon=box(.12,.14,.12);
 g.plane=new T.PlaneGeometry(1,1);
 g.wing=new T.PlaneGeometry(.55,.4);
 g.part=sph(.045,6,5);
 g.cyl=cyl; g.sph=sph; g.box=box; g.cone=cone;
 geos=g;return g;
}

function mat(color, o){
 o=o||{};
 const base={color, roughness:o.roughness==null?.48:o.roughness, metalness:o.metalness==null?.16:o.metalness};
 if(o.emissive!=null)base.emissive=o.emissive;
 if(o.emissiveIntensity!=null)base.emissiveIntensity=o.emissiveIntensity;
 if(o.transparent){base.transparent=true;base.opacity=o.opacity==null?.7:o.opacity;base.depthWrite=o.depthWrite!==false?true:false}
 if(o.side)base.side=o.side;
 if(reduced)return new T.MeshLambertMaterial({color, emissive:base.emissive||0x000000, transparent:!!o.transparent, opacity:base.opacity, side:base.side, depthWrite:base.depthWrite});
 return new T.MeshStandardMaterial(base);
}

function mesh(geo, m){const x=new T.Mesh(geo,m);x.castShadow=x.receiveShadow=!reduced;return x}
function add(p, geo, m, y, sx,sy,sz){const x=mesh(geo,m);if(y!=null)x.position.y=y;if(sx!=null)x.scale.set(sx,sy==null?sx:sy,sz==null?sx:sz);p.add(x);return x}

function pal(c, accent){
 const C=COL[c]||COL.w;
 return {body:mat(C.body), acc:mat(accent||C.acc,{metalness:.35,roughness:.35}), ink:mat(C.ink), glow:mat(accent||C.acc,{emissive:accent||C.acc,emissiveIntensity:.55,roughness:.3})};
}

function pedestal(g, P, h, fat){
 fat=fat||1;const G=geoLib();
 add(g,G.foot,P.body, .035, fat,1,fat);
 add(g,G.ring,P.body, .09, fat,1,fat);
 const st=add(g,G.stem,P.body, .10+h/2, fat,1,fat);st.scale.y=h/.36;
 add(g,G.collar,P.body, .10+h+.025, fat,1,fat);
 return .12+h+.05;
}

function pieceMesh(type, color, accent){
 const key=type+'|'+color+'|'+(accent||'')+'|'+(reduced?1:0);
 // Don't cache groups we mutate (freeze/fall); build fresh but reuse geos/mats via pal
 const G=geoLib(), P=pal(color, accent), g=new T.Group();
 g.userData={type,color};
 const acc=accent?parseInt(String(accent).replace('#',''),16)||COL[color].acc:COL[color].acc;
 const Pa=pal(color, acc);
 let top;
 switch(type){
  case 'K':{ // King — cross
   top=pedestal(g,P, .55, 1.05);
   add(g,G.cyl(.20,.22,.12,14),P.acc, top+.06);
   const cr=new T.Group();cr.position.y=top+.22;g.add(cr);
   add(cr,G.box(.06,.28,.06),P.acc,0);add(cr,G.box(.18,.06,.06),P.acc, .04);
   break;}
  case 'k':{ // Warlord — spiked helm
   top=pedestal(g,P, .42, 1.15);
   add(g,G.box(.36,.22,.36),P.body, top+.1);
   add(g,G.cone(.18,.22,8),P.acc, top+.28);
   for(let i=0;i<6;i++){const s=add(g,G.coneS,P.acc, top+.22);s.position.set(Math.cos(i)* .2, top+.22, Math.sin(i)*.2);s.rotation.z=i?0.5:-.5}
   break;}
  case 'o':{ // Monarch — ornate crown
   top=pedestal(g,P, .58, 1.1);
   add(g,G.cyl(.22,.24,.1,16),P.acc, top+.05);
   for(let i=0;i<8;i++){const a=i*Math.PI/4, s=add(g,G.cone(.05,.2,6),P.glow,0);s.position.set(Math.cos(a)*.18, top+.2, Math.sin(a)*.18)}
   add(g,G.ballS,P.glow, top+.32);
   break;}
  case 'h':{ // Phantom King — ghostly
   const Pg={body:mat(0x7e57c2,{transparent:true,opacity:.45,emissive:0x4a2080,emissiveIntensity:.4,roughness:.2}),acc:mat(0xc5b0ff,{transparent:true,opacity:.7,emissive:0x8866ff,emissiveIntensity:.5})};
   top=pedestal(g,Pg, .55, .9);
   const cr=new T.Group();cr.position.y=top+.2;g.add(cr);
   add(cr,G.box(.05,.24,.05),Pg.acc,0);add(cr,G.box(.16,.05,.05),Pg.acc,.03);
   add(g,G.tor,Pg.acc, top+.08);
   break;}
  case 'Q':{ // Queen
   top=pedestal(g,P, .52, 1);
   add(g,G.cyl(.18,.2,.1,14),P.acc, top+.05);
   for(let i=0;i<8;i++){const a=i*Math.PI/4,s=add(g,G.cone(.035,.16,6),P.acc,0);s.position.set(Math.cos(a)*.16, top+.18, Math.sin(a)*.16)}
   add(g,G.ballS,P.glow, top+.28);
   break;}
  case 'E':{ // Empress — taller crown + jewels
   top=pedestal(g,P, .56, 1.05);
   add(g,G.cyl(.2,.22,.12,14),P.acc, top+.06);
   for(let i=0;i<10;i++){const a=i*Math.PI/5,s=add(g,G.cone(.04,.22,6),P.acc,0);s.position.set(Math.cos(a)*.18, top+.22, Math.sin(a)*.18);if(i%2===0)add(g,G.ballS,P.glow, top+.12).position.set(Math.cos(a)*.2, top+.12, Math.sin(a)*.2)}
   add(g,G.ball,P.glow, top+.36);
   break;}
  case 'O':{ // Princess — slender floral
   top=pedestal(g,P, .48, .85);
   for(let i=0;i<6;i++){const a=i*Math.PI/3,s=add(g,G.cone(.03,.12,6),P.acc,0);s.position.set(Math.cos(a)*.12, top+.14, Math.sin(a)*.12)}
   add(g,G.ballS,P.glow, top+.22);
   add(g,G.tor,P.acc, top+.05).scale.set(.8,.8,.8);
   break;}
  case 'm':{ // Amazon — queen + spear + helm
   top=pedestal(g,P, .52, 1.05);
   add(g,G.cyl(.18,.2,.1,14),P.acc, top+.05);
   for(let i=0;i<6;i++){const a=i*Math.PI/3,s=add(g,G.cone(.03,.14,6),P.acc,0);s.position.set(Math.cos(a)*.15, top+.16, Math.sin(a)*.15)}
   const sp=add(g,G.cyl(.02,.02,.7,6),P.acc, top+.2);sp.position.x=.16;sp.rotation.z=-.25;
   add(g,G.cone(.05,.14,6),P.glow, top+.52).position.set(.16,top+.52,0);
   add(g,G.ballS,P.glow, top+.26);
   break;}
  case 'R':{ // Rook
   top=pedestal(g,P, .32, 1.15);
   add(g,G.cyl(.22,.24,.32,10),P.body, top+.16);
   add(g,G.box(.48,.08,.48),P.body, top+.36);
   for(const [x,z] of [[-.18,-.18],[-.18,.18],[.18,-.18],[.18,.18]]){const m=add(g,G.merlon,P.acc, top+.46);m.position.set(x,top+.46,z)}
   break;}
  case 't':{ // Tower — taller, extra battlement
   top=pedestal(g,P, .28, 1.2);
   add(g,G.cyl(.2,.22,.28,10),P.body, top+.14);
   add(g,G.cyl(.18,.2,.28,10),P.body, top+.4);
   add(g,G.box(.46,.08,.46),P.body, top+.56);
   for(const [x,z] of [[-.17,-.17],[-.17,.17],[.17,-.17],[.17,.17],[0,-.2],[0,.2],[-.2,0],[.2,0]]){const m=add(g,G.merlon,P.acc, top+.66);m.position.set(x,top+.66,z);m.scale.set(.8,1.2,.8)}
   break;}
  case 'r':{ // Ram — battering ram + horns
   top=pedestal(g,P, .32, 1.2);
   add(g,G.cyl(.22,.24,.3,10),P.body, top+.15);
   add(g,G.box(.48,.08,.48),P.body, top+.34);
   const ram=add(g,G.cyl(.07,.1,.5,8),P.acc, top+.18);ram.rotation.x=Math.PI/2;ram.position.set(0,top+.18,.32);
   add(g,G.sph(.1,8,6),P.acc, top+.18).position.set(0,top+.18,.55);
   break;}
  case 'w':{ // Warden — watch eye
   top=pedestal(g,P, .36, 1.15);
   add(g,G.cyl(.22,.24,.34,10),P.body, top+.17);
   add(g,G.box(.48,.08,.48),P.body, top+.38);
   for(const [x,z] of [[-.18,-.18],[-.18,.18],[.18,-.18],[.18,.18]]){const m=add(g,G.merlon,P.acc, top+.48);m.position.set(x,top+.48,z)}
   add(g,G.ball,P.glow, top+.2).scale.set(1,.7,1);
   break;}
  case 'B':{ // Bishop
   top=pedestal(g,P, .48, .85);
   add(g,G.cone(.16,.36,10),P.body, top+.2);
   add(g,G.ballS,P.body, top+.4);
   const slit=add(g,G.box(.04,.2,.08),P.ink, top+.22);
   add(g,G.ballS,P.acc, top+.5);
   break;}
  case 'd':{ // Cardinal — wide hat
   top=pedestal(g,P, .44, .85);
   add(g,G.cone(.15,.3,10),P.body, top+.16);
   add(g,G.cyl(.28,.28,.05,16),P.acc, top+.28);
   add(g,G.cone(.14,.16,10),P.acc, top+.38);
   add(g,G.ballS,P.glow, top+.48);
   break;}
  case 'e':{ // Elephant — stout + ears + trunk
   top=pedestal(g,P, .28, 1.25);
   add(g,G.ballL,P.body, top+.16).scale.set(1.15,1,1.2);
   const ear=add(g,G.box(.06,.22,.28),P.body, top+.2);ear.position.set(-.28,top+.2,0);
   const ear2=ear.clone();ear2.position.x=.28;g.add(ear2);
   const tr=add(g,G.cyl(.05,.07,.36,8),P.body, top+.02);tr.position.set(0,top+.02,.28);tr.rotation.x=.9;
   break;}
  case 'p':{ // Priest — halo
   top=pedestal(g,P, .46, .8);
   add(g,G.cone(.14,.3,10),P.body, top+.16);
   add(g,G.ballS,P.body, top+.34);
   const halo=add(g,G.tor,P.glow, top+.5);halo.rotation.x=Math.PI/2;halo.scale.set(1.1,1.1,1.1);
   break;}
  case 'N': case 'c': case 'z': case 'n': case 'C': case 'L':{
   const isC=type==='c', isZ=type==='z', isNR=type==='n', isL=type==='C', isP=type==='L';
   top=pedestal(g,P, isC?.28:.24, isC?1.1:1);
   // neck
   const neckH=isC?.42:.32, neck=add(g,G.cyl(isC?.07:.08, .12, neckH, 8),P.body, top+neckH/2);
   neck.position.set(0, top+neckH/2, .04); neck.rotation.x=-.45;
   // head
   const hd=add(g,G.box(isC?.16:.18, isC?.16:.2, isC?.32:.28),P.body, 0);
   hd.position.set(0, top+neckH+.06, .16);
   const sn=add(g,G.box(.12,.1,.16),P.body,0);sn.position.set(0, top+neckH+.02, .34);
   // ears
   const e1=add(g,G.coneS,P.body,0);e1.position.set(-.08, top+neckH+.18, .08);e1.rotation.z=.4;
   const e2=e1.clone();e2.position.x=.08;e2.rotation.z=-.4;g.add(e2);
   if(isZ){ // zebra ridges
    for(let i=0;i<3;i++){const r=add(g,G.box(.2,.03,.04),P.ink,0);r.position.set(0, top+.12+i*.08, .12)}
   }
   if(isC){ // camel hump
    add(g,G.ball,P.body, top+.16).position.set(0,top+.2,-.06);
   }
   if(isNR){ // nightrider cape
    const cp=add(g,G.plane, mat(0x5c6bc0,{side:T.DoubleSide,transparent:true,opacity:.85,roughness:.6}), 0);
    cp.geometry=new T.PlaneGeometry(.36,.5);cp.position.set(0,top+.1,-.16);cp.rotation.x=.3;
   }
   if(isL){ // lance
    const ln=add(g,G.cyl(.018,.018,.7,6),P.acc,0);ln.position.set(.16, top+.3, .1);ln.rotation.x=-.6;
    add(g,G.coneS,P.acc,0).position.set(.16, top+.58, .32);
   }
   if(isP){ // paladin cross + shield
    const sh=add(g,G.box(.04,.22,.18),P.acc,0);sh.position.set(-.2, top+.16, .1);
    add(g,G.box(.04,.14,.04),P.glow,0).position.set(0, top+neckH+.28, .16);
   }
   break;}
  case 'P': case 'Y': case 'J': case 'U': case 'Z': case 'I': case 'S': case 'H':{
   const fat=type==='H'?1.25:type==='I'?.75:1;
   const h=type==='Z'||type==='I'?.32:type==='H'?.2:.26;
   top=pedestal(g,P, h, fat);
   add(g, type==='H'?G.ballL:G.ball, P.body, top+.12, type==='H'?1.05:type==='I'?.8:1);
   if(type==='Y'){ // berolina diamond
    const d=add(g,G.box(.12,.12,.12),P.acc, top+.22);d.rotation.set(Math.PI/4,Math.PI/4,0);
   }
   if(type==='J'){ // sergeant chevron
    const c1=add(g,G.box(.2,.04,.06),P.acc, top+.02);c1.rotation.y=.4;
    const c2=c1.clone();c2.rotation.y=-.4;g.add(c2);
   }
   if(type==='U'){ // shield
    const sh=add(g,G.box(.22,.26,.05),P.acc, top+.05);sh.position.set(0,top+.08,.22);
   }
   if(type==='Z'){ // scout cap
    add(g,G.cyl(.16,.18,.05,10),P.acc, top+.22);
    add(g,G.box(.12,.03,.16),P.acc, top+.22).position.set(0,top+.22,.16);
   }
   if(type==='S'){ // squire sword
    const sw=add(g,G.box(.03,.28,.03),P.acc, top+.16);sw.position.set(.16,top+.16,0);
    add(g,G.box(.1,.03,.03),P.acc, top+.06).position.set(.16,top+.06,0);
   }
   if(type==='H'){ // bulwark plates
    add(g,G.box(.4,.16,.4),P.acc, top+.02);
   }
   if(type==='I'){ // runner lean stripe
    add(g,G.box(.06,.28,.06),P.acc, top+.1);
   }
   break;}
  case 'V':{ // Vaulter — spring / arc
   top=pedestal(g,P, .28, .95);
   add(g,G.ball,P.body, top+.12);
   const a=add(g, new T.TorusGeometry(.2,.03,6,12,Math.PI), P.acc, top+.2);a.rotation.x=Math.PI/2;a.rotation.z=Math.PI;
   break;}
  case 'W':{ // Keeper — key / swap ring
   top=pedestal(g,P, .34, 1);
   add(g,G.ball,P.body, top+.12);
   add(g,G.tor,P.glow, top+.28);
   const k=add(g,G.box(.04,.2,.04),P.acc, top+.1);k.position.x=.2;
   break;}
  case 'F':{ // Frostcaller — crystals
   top=pedestal(g,P, .32, 1);
   const ice=mat(0xa8e4ff,{emissive:0x3fa7ff,emissiveIntensity:.45,roughness:.2,metalness:.3,transparent:true,opacity:.9});
   for(let i=0;i<6;i++){const a=i*Math.PI/3,s=add(g,G.cone(.06,.28,5),ice,0);s.position.set(Math.cos(a)*.12, top+.18, Math.sin(a)*.12);s.rotation.z=(i%2?-.2:.2)}
   add(g,G.ballS,ice, top+.3);
   break;}
  case 'A':{ // Longbow
   top=pedestal(g,P, .28, .9);
   add(g,G.ballS,P.body, top+.1);
   const bow=add(g, new T.TorusGeometry(.26,.025,6,16,Math.PI), P.acc, top+.2);bow.rotation.y=Math.PI/2;
   const st=add(g,G.cyl(.01,.01,.5,4),P.ink, top+.2);st.rotation.z=Math.PI/2;st.position.set(0,top+.2,0);
   break;}
  case 'G':{ // Wraith
   const W={body:mat(0x8e7cc3,{transparent:true,opacity:.5,emissive:0x4a3870,emissiveIntensity:.35,roughness:.2}),acc:mat(0xccc0ff,{transparent:true,opacity:.7,emissive:0x8866cc,emissiveIntensity:.4})};
   top=pedestal(g,W, .4, .75);
   add(g,G.cone(.14,.36,8),W.body, top+.2);
   add(g,G.ballS,W.acc, top+.38);
   break;}
  case 'X':{ // Bombard — barrel
   top=pedestal(g,P, .2, 1.2);
   const br=add(g,G.cyl(.12,.14,.44,10),P.acc, top+.2);br.rotation.x=-1.1;br.position.set(0,top+.2,.12);
   add(g,G.cyl(.16,.16,.1,12),P.body, top+.08);
   add(g,G.ballS, mat(0x222,{emissive:0xe74c3c,emissiveIntensity:.4}), top+.28).position.set(0,top+.16,.34);
   break;}
  case 'D':{ // Dragon — wings + horns
   top=pedestal(g,P, .28, 1.15);
   add(g,G.ballL,P.body, top+.16);
   add(g,G.box(.14,.12,.28),P.body, top+.2).position.set(0,top+.14,.22);
   const tail=add(g,G.cyl(.03,.07,.4,6),P.body,0);tail.position.set(0,top+.1,-.28);tail.rotation.x=-.8;
   const mkWing=(side)=>{const w=add(g,G.wing, mat(acc,{side:T.DoubleSide,transparent:true,opacity:.85,emissive:acc,emissiveIntensity:.15,roughness:.55}),0);w.position.set(side*.28, top+.28, 0);w.rotation.set(-.3, side*.7, side*.6);w.userData.wing=side;return w};
   mkWing(-1);mkWing(1);
   const h1=add(g,G.coneS,P.acc,0);h1.position.set(-.07,top+.32,.1);
   const h2=h1.clone();h2.position.x=.07;g.add(h2);
   break;}
  case 'y':{ // Wyvern — one pair swept wings, thinner, barbed tail
   top=pedestal(g,P, .24, .9);
   add(g,G.ball,P.body, top+.12);
   add(g,G.box(.1,.1,.24),P.body, top+.14).position.set(0,top+.12,.18);
   const tail=add(g,G.cyl(.02,.05,.46,6),P.body,0);tail.position.set(0,top+.08,-.28);tail.rotation.x=-.5;
   add(g,G.coneS,P.acc,0).position.set(0, top-.02, -.5);
   const mk=(side)=>{const w=add(g,G.wing, mat(acc,{side:T.DoubleSide,transparent:true,opacity:.8,roughness:.5}),0);w.scale.set(.8,1.2,1);w.position.set(side*.22, top+.24, -.04);w.rotation.set(-.15, side*.9, side*.9);w.userData.wing=side};
   mk(-1);mk(1);
   break;}
  case 'q':{ // Oracle — large orb
   top=pedestal(g,P, .34, .9);
   add(g,G.cyl(.04,.04,.28,6),P.acc, top+.16);
   add(g,G.ballL, mat(0x29b6f6,{emissive:0x29b6f6,emissiveIntensity:.6,transparent:true,opacity:.85,roughness:.15,metalness:.2}), top+.4);
   add(g,G.tor,P.glow, top+.4);
   break;}
  case 's':{ // Seer — smaller orb, hood
   top=pedestal(g,P, .28, .85);
   add(g,G.cone(.18,.22,10),P.body, top+.16);
   add(g,G.ball, mat(0x4fc3f7,{emissive:0x4fc3f7,emissiveIntensity:.5,transparent:true,opacity:.85,roughness:.2}), top+.22);
   break;}
  default:{
   top=pedestal(g,P, .3, 1);
   add(g,G.ball,P.body, top+.12);
  }
 }
 g.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=!reduced}});
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
 view.ph=0.95; view.d=11.5;
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
  f.position.set(i-3.5, 0.22, 4.55); f.rotation.x=-Math.PI/2;
  r.position.set(-4.55, 0.22, i-3.5); r.rotation.x=-Math.PI/2;
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
 const amb=new T.HemisphereLight(t.light, 0x3a3228, reduced?1.1:0.85);
 scene.add(amb);lights.amb=amb;
 const dir=new T.DirectionalLight(0xfff6e8, reduced?1.1:1.25);
 dir.position.set(4.5, 10, 6);
 dir.castShadow=!reduced;
 if(dir.castShadow){dir.shadow.mapSize.set(host&&host.clientWidth<500?512:1024, host&&host.clientWidth<500?512:1024);
  const s=dir.shadow.camera;s.left=s.bottom=-8;s.right=s.top=8;s.near=1;s.far=24;dir.shadow.bias=-0.0008}
 scene.add(dir);lights.dir=dir;
 const fill=new T.DirectionalLight(0xb0c4ff, .25);fill.position.set(-6,4,-3);scene.add(fill);lights.fill=fill;
 if(theme==='neon'&&!reduced){const p=new T.PointLight(0x00f0ff,.8,18);p.position.set(-3,3,3);scene.add(p);lights.p=p;
  const p2=new T.PointLight(0xff00c8,.45,18);p2.position.set(3,2,-3);scene.add(p2);lights.p2=p2}
 if(theme==='volcano'&&!reduced){const p=new T.PointLight(0xff5510,.9,16);p.position.set(0,1.2,0);scene.add(p);lights.p=p}
 if(theme==='underwater'&&!reduced){const p=new T.PointLight(0x66ffe0,.6,16);p.position.set(2,4,1);scene.add(p);lights.p=p}
 if(scene.fog)scene.fog=null;
 if(t.fog&&!reduced)scene.fog=new T.Fog(t.fog[0], t.fog[1], t.fog[2]);
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
function tween(obj, prop, to, dur, ondone){
 const from=obj[prop].clone?obj[prop].clone():obj[prop];
 tweens.push({obj,prop,from,to,dur,t:0,ondone});dirty=true;
}

function burst(pos, color, n, spd, life){
 if(reduced||lowHint)return;
 const G=geoLib();
 n=Math.min(n, 28);
 for(let i=0;i<n;i++){
  const m=new T.Mesh(G.part, new T.MeshBasicMaterial({color,transparent:true,opacity:1}));
  m.position.copy(pos);m.position.y+=.2;
  const v=new T.Vector3(Math.random()-.5, Math.random()*.9+.15, Math.random()-.5).normalize().multiplyScalar(spd*(.5+Math.random()));
  parts.push({m,v,life,age:0,g:18});fxG.add(m);
 }
}
function shockwave(pos, color){
 if(reduced)return;
 const m=new T.Mesh(new T.RingGeometry(.1,.18,24), new T.MeshBasicMaterial({color,transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));
 m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.12;fxG.add(m);
 tweens.push({obj:m,prop:'scale',from:new T.Vector3(1,1,1),to:new T.Vector3(8,8,8),dur:.55,t:0,ondone:()=>{fxG.remove(m);if(m.geometry)m.geometry.dispose()}});
 tweens.push({obj:m.material,prop:'opacity',from:.9,to:0,dur:.55,t:0});
}

function isHop(m){
 if(!m||m.k==='v'||m.k==='sw')return true;
 if(m.k!=='m')return false;
 const dr=Math.abs((m.t>>3)-(m.f>>3)), dc=Math.abs((m.t&7)-(m.f&7));
 return dr&&dc&&dr!==dc;
}

function animateMove(anim, bd){
 if(!anim||!anim.m){placePieces(bd);return}
 const m=anim.m;
 // build post-move pieces, then move the actor back to origin for tween
 placePieces(bd);
 if(m.k==='pass')return;
 const dur=reduced?0.12:0.32;
 const hop=isHop(m)&&!reduced;
 // dead pieces (captures) — re-add as fading ghosts
 (anim.dead||[]).forEach(d=>{
  if(m.k==='sh'||m.k==='ex'||(m.x&&m.x.includes(d.i))){
   const acc=(G.GF&&G.GF.P&&G.GF.P[d.t]&&G.GF.P[d.t].col)||null;
   const g=pieceMesh(d.t,d.c,acc);const p=sqPos(d.i);g.position.set(p.x,0,p.z);if(d.c==='b')g.rotation.y=Math.PI;
   pieceG.add(g);
   if(reduced){g.visible=false;return}
   burst(new T.Vector3(p.x,.3,p.z), d.c==='w'?0xf1e6cf:0x445, 16, 3.2, .55);
   tweens.push({obj:g.scale,prop:null,from:1,to:.2,dur:.4,t:0,custom:(o,k)=>g.scale.setScalar(k)});
   tweens.push({obj:g,prop:'visible',from:1,to:0,dur:.4,t:0,ondone:()=>pieceG.remove(g),custom:(o,k)=>{g.traverse(c=>{if(c.material){c.material=c.material.clone();c.material.transparent=true;c.material.opacity=1-k}})}});
  }
 });
 const moveOne=(from,to,mesh,arc)=>{
  if(!mesh)return;
  const a=sqPos(from), b=sqPos(to);
  mesh.position.set(a.x,0,a.z);
  tweens.push({obj:mesh,prop:'pos',from:new T.Vector3(a.x,0,a.z),to:new T.Vector3(b.x,0,b.z),dur,t:0,arc:arc?1.15:0,ondone:()=>{mesh.position.set(b.x,0,b.z);dirty=true}});
 };
 if(m.k==='sh'){
  // piece stays; bolt flies
  const a=worldOf(m.f), b=worldOf(m.t);a.y=.45;b.y=.45;
  const bolt=mesh(new T.CylinderGeometry(.03,.03,.02,6), new T.MeshBasicMaterial({color:0x7cff6b}));
  bolt.position.copy(a);fxG.add(bolt);
  const mid=b.clone().sub(a);bolt.scale.y=Math.max(.2, mid.length());bolt.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), mid.clone().normalize());
  tweens.push({obj:bolt,prop:'pos',from:a,to:b,dur:reduced?.1:.28,t:0,ondone:()=>{fxG.remove(bolt);burst(b,0x7cff6b,18,3,.5)}});
  return;
 }
 if(m.k==='ex'){
  const p=worldOf(m.f);p.y=.2;shockwave(p,0xff5522);burst(p,0xff7a2a,28,5,.7);shake=reduced?0:.55;
  return;
 }
 if(m.k==='sw'){
  const A=pins[m.t], B=pins[m.f];
  // after swap, A is at t (came from f), B at f (came from t)
  if(A)moveOne(m.f,m.t,A,true);if(B)moveOne(m.t,m.f,B,true);
  burst(worldOf(m.f).setY(.3),0xc9a227,8,2,.4);burst(worldOf(m.t).setY(.3),0xc9a227,8,2,.4);
  return;
 }
 if(m.k==='cs'){
  const k=pins[m.t], r=m.rt!=null?pins[m.rt]:null;
  if(k)moveOne(m.f,m.t,k,false);if(r)moveOne(m.rf,m.rt,r,false);
  return;
 }
 // standard move / vault
 const actor=pins[m.t];
 if(actor)moveOne(m.f,m.t,actor,hop||m.k==='v');
 if(m.pr){ // promotion flash
  const p=worldOf(m.t);p.y=.5;burst(p,0xffd400,20,3,.6);shockwave(p,0xffd400);
  if(actor){actor.scale.setScalar(1.35);tweens.push({obj:actor.scale,prop:null,from:1.35,to:1,dur:.4,t:0,custom:(o,k)=>actor.scale.setScalar(1.35-k*.35)})}
 }
 // frostcaller
 const preType=actor&&actor.userData.type;
 if(preType==='F'||(anim.pre&&anim.pre.t==='F')){
  const r=m.t>>3,c=m.t&7;
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
   if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr<0||rr>7||cc<0||cc>7)continue;
   const i=rr*8+cc,q=bd[i];if(q&&q.c!==(anim.side)){const p=worldOf(i);p.y=.3;burst(p,0x8ad8ff,10,1.6,.6)}
  }
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
  const tw=tweens[i];tw.t+=dt;const u=Math.min(1,tw.t/tw.dur),k=ease(u);
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
  const p=parts[i];p.age+=dt;p.v.y-=p.g*dt;p.m.position.addScaledVector(p.v,dt);
  const mat=p.m.material;if(mat)mat.opacity=Math.max(0,1-p.age/p.life);
  if(p.age>=p.life){fxG.remove(p.m);parts.splice(i,1)}
  animating=true;
 }
 // pulses
 markG.children.forEach(c=>{if(c.userData.pulse){const s=1+Math.sin(now*0.008)*.12;c.scale.set(s,s,s);animating=true}});
 // wing idle
 if(!reduced)pieceG.children.forEach(p=>{p.children.forEach(ch=>{if(ch.userData.wing){ch.rotation.z=ch.userData.wing*(.55+Math.sin(now*0.004)*.2);animating=true}})});
 // camera
 let shx=0,shy=0;
 if(shake>0){shake=Math.max(0,shake-dt);shx=(Math.random()-.5)*shake*.25;shy=(Math.random()-.5)*shake*.2;animating=true}
 if(animating||dirty){
  applyView();
  if(shake>0){camera.position.x+=shx;camera.position.y+=shy;camera.lookAt(0,.2,0)}
  renderer.render(scene,camera);dirty=false;
 }
}

function onPtrDown(e){
 if(!renderer)return;
 if(e.touches&&e.touches.length===2){pinch0=distT(e.touches);e.preventDefault();return}
 const ev=e.touches?e.touches[0]:e;
 drag=true;didMove=false;px=ev.clientX;py=ev.clientY;pid=ev.pointerId;
 try{e.target.setPointerCapture&&e.target.setPointerCapture(pid)}catch(_){}
}
function distT(t){const a=t[0],b=t[1];return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)}
let pinch0=0;
function onPtrMove(e){
 if(e.touches&&e.touches.length===2){
  const d=distT(e.touches);if(pinch0){view.d=clamp(view.d*(pinch0/d),7,18);pinch0=d;applyView()}e.preventDefault();didMove=true;return;
 }
 if(!drag)return;
 const ev=e.touches?e.touches[0]:e;
 const dx=ev.clientX-px, dy=ev.clientY-py;
 if(!didMove&&Math.hypot(dx,dy)<7)return;
 didMove=true;px=ev.clientX;py=ev.clientY;
 view.th-=dx*0.007;view.ph=clamp(view.ph+dy*0.005, 0.35, 1.25);
 applyView();
}
function onPtrUp(e){
 if(e.touches&&e.touches.length){if(e.touches.length<2)pinch0=0;return}
 const ev=e.changedTouches?e.changedTouches[0]:e;
 const was=didMove;drag=false;didMove=false;pinch0=0;
 if(!was)pick(ev.clientX, ev.clientY);
}
function onWheel(e){e.preventDefault();view.d=clamp(view.d+e.deltaY*0.01,7,18);applyView()}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

const ray=()=>new T.Raycaster();
function pick(cx,cy){
 if(!renderer||!onClick)return;
 const rec=renderer.domElement.getBoundingClientRect();
 const ndc=new T.Vector2(((cx-rec.left)/rec.width)*2-1, -((cy-rec.top)/rec.height)*2+1);
 const R=ray();R.setFromCamera(ndc,camera);
 const hits=R.intersectObjects(tiles,false);
 if(hits.length){const i=hits[0].object.userData.sq;onClick(i)}
}

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
 reduced=!!opts.reduced;theme=opts.theme||theme;flipped=!!opts.flipped;coordsOn=opts.coords!==false;
 if(!renderer){
  scene=new T.Scene();
  camera=new T.PerspectiveCamera(42,1,0.1,80);
  renderer=new T.WebGLRenderer({antialias:!reduced,alpha:false,powerPreference:'high-performance'});
  renderer.shadowMap.enabled=!reduced;
  if(T.PCFSoftShadowMap)renderer.shadowMap.type=T.PCFSoftShadowMap;
  if(T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace;
  else if(T.sRGBEncoding)renderer.outputEncoding=T.sRGBEncoding;
  if(T.ACESFilmicToneMapping){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05}
  renderer.domElement.id='gf3d';
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;z-index:3;border-radius:inherit';
  root=new T.Group();scene.add(root);
  pieceG=new T.Group();markG=new T.Group();fxG=new T.Group();
  root.add(pieceG);root.add(markG);root.add(fxG);
 }
 host.classList.add('view3d');
 if(renderer.domElement.parentNode!==host)host.appendChild(renderer.domElement);
 bind(renderer.domElement);
 geoLib();buildBoard();setupLights();setDefaultView();resize();
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
 host=null;tweens.length=0;parts.length=0;shake=0;
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
 if(renderer){renderer.shadowMap.enabled=!reduced;setupLights();resize();placePiecesRebuild();dirty=true}
};
function placePiecesRebuild(){
 const snap={};Object.keys(pins).forEach(k=>{const m=pins[k];snap[k]={t:m.userData.type,c:m.userData.color}});
 const bd=Array.from({length:64},(_,i)=>snap[i]||null);
 placePieces(bd,{keep:false});
}
api.resetView=function(){
 view={th:vDef.th, ph:vDef.ph, d:vDef.d};applyView();
};
api.resize=resize;
api.tap=function(i){if(onClick)onClick(i)};
api.setClick=function(fn){onClick=fn};
api.setFallback=function(fn){onFallback=fn};
Object.defineProperty(api,'reduced',{get:()=>reduced});
})(typeof globalThis!=='undefined'?globalThis:this);
