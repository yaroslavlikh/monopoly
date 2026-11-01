import * as THREE from 'three';
import {APPEARANCE} from './appearance.js';

// Игровые миниатюры: узнаваемые силуэты, а не точные архитектурные копии.
const cube=new THREE.BoxGeometry(1,1,1);
const ball=new THREE.SphereGeometry(1,16,10);
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.08,...extra});
const stone=material('#b5aa92'),pale=material('#d3cbb8'),brick=material('#995f54'),roof=material('#405958'),dark=material('#253a42'),steel=material('#a1b2ba',{metalness:.72,roughness:.36});
const glass=material('#496b77',{metalness:.35,roughness:.3});
const lit=material(APPEARANCE.windowColor,{emissive:APPEARANCE.windowColor,emissiveIntensity:APPEARANCE.windowGlow}),red=material('#a53f3e'),green=material('#59806c');
function box(g,w,h,d,x=0,y=h/2,z=0,m=stone){const mesh=new THREE.Mesh(cube,m);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
function sphere(g,r,x,y,z,m=stone){const mesh=new THREE.Mesh(ball,m);mesh.scale.setScalar(r);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
function cyl(g,top,bottom,h,x,y,z,m=stone,n=16){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,n),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
function cone(g,r,h,x,y,z,m=roof,n=4){return cyl(g,0,r,h,x,y,z,m,n);}
const signs=new Map();
function sign(g,text,w,x,y,z,color='#e1d5ba',bg='#253a42'){
  const key=text+color+bg;let texture=signs.get(key);
  if(!texture){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 62px Arial';ctx.fillText(text,256,69,480);texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;signs.set(key,texture);}
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
function windows(g,w,h,d,{x=0,y=0,z=0,floors=4,columns=7,m=lit}={}){
  const sets=[[],[]];
  for(let row=0;row<floors;row++)for(let col=0;col<columns;col++){
    const px=x-w/2+(col+.5)*w/columns,py=y+(row+.6)*h/floors;
    sets[(col+row)%4===0?1:0].push([px,py,z+d/2+.009]);
  }
  const dummy=new THREE.Object3D();sets.forEach((points,i)=>{if(!points.length)return;const mesh=new THREE.InstancedMesh(cube,i?dark:m,points.length);mesh.userData.windows=true;points.forEach((p,index)=>{dummy.position.set(...p);dummy.scale.set(Math.min(.09,w/columns*.4),Math.min(.13,h/floors*.5),.012);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);});g.add(mesh);});
}
function block(g,w,h,d,x=0,z=0,m=stone,floors=4){box(g,w,h,d,x,h/2,z,m);box(g,w+.05,.055,d+.05,x,h+.02,z,roof);windows(g,w,h,d,{x,z,floors,columns:Math.max(3,Math.round(w*5))});}
function clock(g,x,y,z,r=.11){const face=cyl(g,r,r,.025,0,0,0,pale,24);face.rotation.x=Math.PI/2;face.position.set(x,y,z);box(g,.014,r*.9,.012,x,y+r*.22,z+.025,dark);const hand=box(g,r*.7,.013,.012,x+r*.22,y,z+.025,dark);hand.rotation.z=-.2;}
function star(g,x,y,z,r=.09){const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,rr=i%2?r*.42:r;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;if(!i)shape.moveTo(px,py);else shape.lineTo(px,py);}shape.closePath();const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#d3b575',side:THREE.DoubleSide}));mesh.position.set(x,y,z);g.add(mesh);}

export function createLandmark(kind='estate'){
  const g=new THREE.Group();g.userData.landmark=kind;
  if(kind==='mgu'){
    block(g,2.6,.52,.6,0,0,pale,3);block(g,.68,1.65,.66,0,0,pale,8);box(g,.5,.42,.5,0,1.86,0,pale);windows(g,.5,.4,.5,{y:1.66,floors:2,columns:3});
    box(g,.36,.25,.4,0,2.2,0,brick);cone(g,.22,.3,0,2.47,0,roof,4);cyl(g,.014,.038,.7,0,2.97,0,steel);star(g,0,3.36,0,.105);
    for(const x of [-.97,.97]){block(g,.4,.9,.57,x,0,pale,4);cone(g,.25,.25,x,1.05,0,roof,4);clock(g,x,.76,.3,.1);}
    box(g,1.05,.07,.83,0,.03,.06,stone);sign(g,'МГУ',.55,0,.38,.34);
  }else if(kind==='petronas'){
    for(const x of [-.43,.43]){
      cyl(g,.24,.29,1.9,x,.95,0,glass,16);
      for(let y=.12;y<1.9;y+=.13)cyl(g,.253,.253,.028,x,y,0,steel,16);
      cyl(g,.18,.23,.35,x,2.04,0,glass,16);cyl(g,.12,.18,.28,x,2.35,0,steel,16);cone(g,.12,.32,x,2.64,0,steel,16);cyl(g,.008,.02,.4,x,2.99,0,steel,8);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,.018,1.9,.018,x+Math.cos(a)*.29,.95,Math.sin(a)*.29,steel);}
    }
    box(g,.9,.12,.22,0,1.22,.02,steel);for(const s of [-1,1]){const brace=box(g,.018,.55,.018,s*.19,1.0,.09,steel);brace.rotation.z=s*-.65;}
    box(g,1.65,.12,1.0,0,.06,0,dark);sign(g,'KUALA LUMPUR',1.2,0,.2,.51,'#8fccc4');
  }else if(kind==='telegraph'){
    block(g,1.95,1.0,.62,0,0,stone,5);block(g,.55,1.22,.8,-.66,.07,stone,5);
    for(const x of [-.88,-.65,-.42,-.19,.04,.27,.5,.73,.94])box(g,.035,.92,.04,x,.49,.34,pale);
    cyl(g,.025,.035,.28,-.65,1.38,.04,steel);sphere(g,.22,-.65,1.68,.04,glass);
    const meridian=new THREE.Mesh(new THREE.TorusGeometry(.225,.012,5,32),steel);meridian.position.set(-.65,1.68,.04);g.add(meridian);const equator=meridian.clone();equator.rotation.x=Math.PI/2;g.add(equator);clock(g,-.65,.99,.49,.13);sign(g,'ТЕЛЕГРАФ',1.15,.22,.22,.35);
  }else if(kind==='tanuki'){
    block(g,1.7,.52,.95,0,0,material('#73594b'),2);box(g,1.85,.13,1.12,0,.62,0,dark);box(g,1.5,.14,.93,0,.75,0,dark);
    for(const x of [-.6,-.2,.2,.6])box(g,.25,.27,.015,x,.26,.49,material('#bca578',{emissive:'#745337',emissiveIntensity:.12}));
    sign(g,'ТАНУКИ',1.13,0,.57,.58,'#edd9b7','#7b3535');
    for(const x of [-.78,.78]){cyl(g,.045,.045,.35,x,.23,.56,red,10);box(g,.12,.035,.12,x,.42,.56,dark);}
    box(g,1.85,.06,1.15,0,.02,.05,stone);
  }else if(kind==='lyceum'){
    block(g,2.1,.82,.52,0,0,brick,4);block(g,.62,1.12,.65,.52,-.07,brick,5);block(g,.65,.55,.9,-.65,-.19,brick,3);
    box(g,.5,.16,.2,0,.39,.35,pale);box(g,.36,.32,.05,0,.17,.33,dark);sign(g,'ЛИЦЕЙ 1502',1.02,0,.77,.29,'#eee2c6','#39534f');
    for(let i=0;i<3;i++)box(g,.6+i*.13,.04,.14,0,.08-i*.03,.48+i*.06,stone);
    cyl(g,.012,.012,.45,-.88,1.08,0,steel,8);box(g,.25,.12,.012,-.75,1.22,0,red);
  }else if(kind==='goldengate'){
    const facade=material('#b4b3a7'),bronze=material('#857860',{metalness:.32});
    block(g,2.15,.23,.9,0,0,glass,1);block(g,.62,2.15,.61,-.64,0,facade,12);block(g,.64,1.92,.67,.67,-.02,glass,12);
    box(g,1.95,.31,.62,.08,1.8,0,glass);box(g,2.0,.055,.66,.08,1.99,0,bronze);box(g,.65,.04,.64,-.64,2.18,0,steel);
    for(let y=.28;y<1.95;y+=.15)box(g,.66,.018,.7,.67,y,-.02,steel);
    for(const x of [-.89,-.69,-.49])box(g,.025,2.1,.025,x,1.08,.32,bronze);
    for(let x=-.65;x<1;x+=.18)box(g,.012,.3,.015,x,1.8,.32,steel);
    sign(g,'67',.45,-.64,1.89,.32,'#eee6ce','#3a4d54');sign(g,'GOLDEN GATE',1.25,0,.19,.47,'#bfb08a');
  }else if(kind==='arch'){
    for(const x of [-.56,.56]){box(g,.38,1.08,.55,x,.54,0,dark);for(const dz of [-.28,.28])for(const dx of [-.12,.12])cyl(g,.04,.05,.92,x+dx,.48,dz,stone,10);}
    box(g,1.65,.33,.67,0,1.15,0,dark);box(g,1.8,.08,.75,0,1.36,0,stone);box(g,.65,.13,.47,0,1.46,0,roof);
    for(const x of [-.28,0,.28]){sphere(g,.07,x,1.64,0,dark);box(g,.05,.18,.07,x,1.55,0,dark);}
  }else if(['palace','estate','petrovsky','tsaritsyno'].includes(kind)){
    const ornate=kind==='tsaritsyno'||kind==='petrovsky',m=ornate?brick:stone;block(g,2.1,.63,.65,0,0,m,3);block(g,.67,.95,.8,0,.02,m,4);
    for(const x of [-.9,.9]){block(g,.45,.83,.6,x,0,m,4);cone(g,.32,.35,x,1.02,0,roof,kind==='petrovsky'?8:4);}
    for(const x of [-.22,-.07,.07,.22])cyl(g,.025,.025,.4,x,.28,.47,pale,8);
    const pediment=cone(g,.47,.23,0,1.07,0,roof,4);pediment.rotation.y=Math.PI/4;
    if(ornate)for(const x of [-.75,-.5,-.25,0,.25,.5,.75])box(g,.03,.68,.04,x,.35,.36,pale);
  }else if(kind==='rotunda'){
    cyl(g,.66,.68,.55,0,.3,0,stone,24);for(let i=0;i<12;i++){const a=i*Math.PI/6;cyl(g,.032,.04,.6,Math.cos(a)*.65,.35,Math.sin(a)*.65,pale,8);}
    cyl(g,.73,.73,.06,0,.66,0,pale,24);cone(g,.73,.35,0,.86,0,roof,24);sphere(g,.1,0,1.07,0,roof);
    for(const x of [-.85,.85])block(g,.45,.35,.5,x,0,stone,2);
  }else if(kind==='monastery'){
    box(g,1.9,.3,.08,0,.15,.57,brick);for(const x of [-.9,.9]){cyl(g,.12,.14,.55,x,.28,.57,brick);cone(g,.17,.25,x,.67,.57,roof,8);}
    block(g,.75,.65,.65,0,-.1,pale,3);for(const x of [-.23,0,.23]){cyl(g,.08,.1,.22,x,.8,-.1,pale);sphere(g,.11,x,.98,-.1,roof);cyl(g,.009,.009,.16,x,1.13,-.1,steel,6);}
  }else if(kind==='market'){
    cyl(g,.85,.88,.3,0,.17,0,stone,12);const dome=sphere(g,.85,0,.4,0,roof);dome.scale.y=.32;sign(g,'ДАНИЛОВСКИЙ',1.3,0,.23,.8);
  }else if(kind==='melnikov'){
    for(const [x,z,h]of [[-.28,.18,1.05],[.28,-.18,1.4]]){cyl(g,.42,.42,h,x,h/2,z,pale,32);for(let row=0;row<4;row++)for(let i=0;i<4;i++){const a=-1.05+i*.7;const win=cyl(g,.055,.055,.013,0,0,0,dark,6);win.rotation.x=Math.PI/2;win.rotation.z=Math.PI/6;win.position.set(x+Math.sin(a)*.425,.2+row*.26,z+Math.cos(a)*.425);win.rotation.y=a;}}
  }else if(kind==='city'){
    for(const[x,h,z,w]of [[-.6,1.5,0,.4],[-.1,2.4,-.12,.45],[.5,1.9,0,.5],[.25,.6,.35,.8]]){block(g,w,h,.45,x,z,glass,Math.round(h*7));for(let y=.13;y<h;y+=.17)box(g,w+.03,.018,.48,x,y,z,steel);}
    const tower=box(g,.35,2.5,.35,.15,1.25,-.5,glass);tower.rotation.y=.45;
  }else if(kind==='riverport'||kind==='clocktower'||kind==='railway'){
    block(g,2.0,.45,.55,0,0,pale,3);block(g,.42,1.25,.55,.1,0,stone,6);clock(g,.1,1.02,.29,.12);cone(g,.31,.25,.1,1.42,0,roof,4);cyl(g,.012,.025,.37,.1,1.73,0,steel,8);star(g,.1,1.95,0,.07);
    if(kind==='railway'){for(const x of [-.8,-.4,.4,.8])cone(g,.16,.3,x,.64,0,roof,6);}
  }else if(kind==='park'||kind==='artists'){
    for(const x of [-.6,.4]){block(g,.55,.36,.5,x,x*.25,stone,2);cone(g,.4,.3,x,.5,x*.25,roof,4).rotation.y=Math.PI/4;}
    for(const[x,z]of [[-.85,-.5],[.7,-.4],[0,.45],[.8,.3]]){cyl(g,.015,.025,.3,x,.15,z,brick,6);const tree=sphere(g,.2,x,.43,z,green);tree.scale.y=1.6;}
  }else{
    const m=kind==='factory'?brick:stone;block(g,1.8,.55,.75,0,0,m,3);block(g,.5,.9,.6,.6,-.12,m,4);
    if(kind==='factory'){for(const x of [-.55,-.2])cyl(g,.07,.09,1.2,x,.6,-.2,brick,10);}
    if(kind==='stadium'){box(g,2.0,.12,1.05,0,.67,0,steel);sign(g,'ЯНТАРЬ',1.0,0,.5,.4);}
    if(kind==='institute')sign(g,'КУРЧАТОВ',1.0,0,.45,.4);
    if(kind==='museum')sign(g,'ДАРВИН',1.0,0,.45,.4);
    if(kind==='pioneers'){box(g,2.0,.07,.9,0,.63,0,pale);sign(g,'ДВОРЕЦ ПИОНЕРОВ',1.2,0,.46,.4);}
    if(kind==='mosfilm'){sign(g,'МОСФИЛЬМ',1.2,0,.46,.4);const reel=cyl(g,.17,.17,.08,-.4,.94,0,steel);reel.rotation.x=Math.PI/2;for(const x of [-.55,-.25])sphere(g,.12,x,1.03,0,dark);}
  }
  const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  g.position.set(-center.x,-bounds.min.y,-center.z);
  const root=new THREE.Group();root.add(g);root.userData.landmark=kind;root.userData.height=size.y;root.userData.width=size.x;root.userData.depth=size.z;
  root.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.windows;o.receiveShadow=!o.userData.windows;}});return root;
}

let portraitRenderer,portraitScene,portraitCamera;
const portraits=new Map();
export function landmarkPortrait(tile){
  if(!tile?.landmark)return null;if(portraits.has(tile.landmark))return portraits.get(tile.landmark);
  try{
    if(!portraitRenderer){portraitRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});portraitRenderer.setSize(440,320);portraitRenderer.outputColorSpace=THREE.SRGBColorSpace;portraitRenderer.toneMapping=THREE.ACESFilmicToneMapping;portraitRenderer.toneMappingExposure=1.15;
      portraitScene=new THREE.Scene();portraitScene.add(new THREE.HemisphereLight(0xe2e7ee,0x3a4748,2.5));const key=new THREE.DirectionalLight(0xffe6c2,3);key.position.set(-4,6,6);portraitScene.add(key);const rim=new THREE.DirectionalLight(0x88c2e1,1.7);rim.position.set(4,3,-4);portraitScene.add(rim);portraitCamera=new THREE.PerspectiveCamera(31,440/320,.1,30);}
    const model=createLandmark(tile.landmark),h=model.userData.height,w=model.userData.width;
    const distance=Math.max(h*2.3,w*1.65,3.3);portraitCamera.position.set(distance*.42,h*.48+distance*.36,distance);portraitCamera.lookAt(0,h*.45,0);
    portraitScene.add(model);portraitRenderer.render(portraitScene,portraitCamera);const image=portraitRenderer.domElement.toDataURL('image/png');portraitScene.remove(model);
    model.traverse(o=>{if(o.geometry&&o.geometry!==cube&&o.geometry!==ball)o.geometry.dispose();});portraits.set(tile.landmark,image);return image;
  }catch{return null;}
}
