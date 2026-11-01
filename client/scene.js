import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BOARD,GROUPS,TOKENS,coordinates} from '../shared/board.mjs';
import {APPEARANCE} from './appearance.js';
import {createLandmark} from './landmarks.js';

const TAU=Math.PI*2;
const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.12,...opts});
const glow=(color,intensity=.8)=>mat(color,{emissive:color,emissiveIntensity:intensity});
const dark=mat('#15222e'),roof=mat('#202d3a'),white=mat('#e3e6e3'),ink=mat('#0c141e');
const boxGeo=new THREE.BoxGeometry(1,1,1);
const roundGeo=new RoundedBoxGeometry(1,1,1,2,.08);
const ballGeo=new THREE.SphereGeometry(1,18,12);
function box(parent,size,pos,material,rounded=false){const m=new THREE.Mesh(rounded?roundGeo:boxGeo,material);m.scale.set(...size);m.position.set(...pos);parent.add(m);return m;}
function sphere(parent,size,pos,material){const m=new THREE.Mesh(ballGeo,material);m.scale.set(...size);m.position.set(...pos);parent.add(m);return m;}
function cylinder(parent,r1,r2,h,pos,material,segments=20){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material);m.position.set(...pos);parent.add(m);return m;}
function ring(parent,radius,tube,pos,material){const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,48),material);m.rotation.x=-Math.PI/2;m.position.set(...pos);parent.add(m);return m;}
function canvasTexture(width,height,draw){const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function plane(parent,w,h,pos,texture){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(...pos);parent.add(m);return m;}
const tileIcon={start:'↗',chance:'?',community:'✦',jail:'▥',goJail:'↪',parking:'KL',tax:'₽',station:'М',utility:'ϟ'};
function tileTexture(t){return canvasTexture(384,384,ctx=>{
  ctx.textAlign='center';ctx.textBaseline='middle';
  const wrap=(text,max)=>{const out=[''];for(const word of text.split(' ')){const next=(out.at(-1)?out.at(-1)+' ':'')+word;if(ctx.measureText(next).width>max&&out.at(-1))out.push(word);else out[out.length-1]=next;}return out;};
  if(t.type==='property'){
    ctx.fillStyle='#f1eee6';ctx.font='600 55px Arial';
    const lines=wrap(t.name.replace(/[«»]/g,''),350);lines.forEach((line,i)=>ctx.fillText(line,192,174+(i-(lines.length-1)/2)*58,350));
    
  }else{
    ctx.fillStyle=t.lineColor||({chance:'#a8baca',community:'#c2afdb',parking:'#d4be8c',start:'#98c9b4'}[t.type])||'#cfbd98';
    ctx.font='600 76px Arial';ctx.fillText(tileIcon[t.type]||'✦',192,112);
    ctx.fillStyle='#f0ede4';ctx.font='600 44px Arial';const lines=wrap(t.name,350);lines.forEach((line,i)=>ctx.fillText(line,192,208+(i-(lines.length-1)/2)*46,350));
    if(t.line){ctx.fillStyle=t.lineColor;ctx.font='600 22px Arial';ctx.fillText(`ЛИНИЯ ${t.line}`,192,42);}
  }
  const price=t.price?`${t.price} ₽`:t.type==='start'?'+200 ₽':t.type==='tax'?`−${t.amount} ₽`:t.tag||'';
  if(price){ctx.strokeStyle='#7d8b9e';ctx.lineWidth=2;ctx.strokeRect(84,300,216,48);ctx.fillStyle='#eee8dc';ctx.font='600 38px Arial';ctx.fillText(price,192,326,204);}
});}

export function makeToken(type,color) {
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.userData.body=body;
  const m=mat(color,{roughness:.35,metalness:.22}),eyes=ink,cheek=mat('#f3a3bd');
  cylinder(root,.26,.28,.035,[0,.025,0],mat(color,{metalness:.25,roughness:.5}));
  if(type==='cat'){
    sphere(body,[.19,.24,.15],[0,.28,0],m);sphere(body,[.22,.19,.18],[0,.58,.02],m);
    for(const x of [-.14,.14]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.095,.21,3),m);ear.position.set(x,.77,.01);ear.rotation.z=x>0?-.2:.2;body.add(ear);sphere(body,[.075,.05,.1],[x*.75,.11,.07],m);}
    for(const x of [-.095,.095]){box(body,[.155,.105,.045],[x,.615,.185],ink,true);const shine=box(body,[.047,.008,.008],[x-.022,.639,.214],mat('#9fc5ce'));shine.rotation.z=.2;}box(body,[.035,.025,.055],[0,.615,.205],ink);
    sphere(body,[.025,.02,.025],[0,.54,.195],cheek);
    const tail=new THREE.Mesh(new THREE.TorusGeometry(.17,.045,7,16,Math.PI*1.3),m);tail.position.set(.19,.22,-.08);tail.rotation.y=.8;body.add(tail);
  }else if(type==='ufo'){
    sphere(body,[.29,.07,.29],[0,.35,0],m);sphere(body,[.16,.16,.16],[0,.45,0],mat('#bbc6e9',{transparent:true,opacity:.85,metalness:.5}));
    ring(body,.28,.025,[0,.36,0],glow(color,.8));
    for(let i=0;i<6;i++){const a=i*TAU/6;sphere(body,[.025,.025,.025],[Math.cos(a)*.23,.38,Math.sin(a)*.23],glow('#e3f8ff',.8));}

  }else if(type==='duck'){
    sphere(body,[.25,.18,.28],[0,.25,0],m);sphere(body,[.17,.18,.17],[0,.49,.11],m);
    sphere(body,[.14,.05,.13],[0,.46,.28],mat('#ff934e'));sphere(body,[.025,.032,.021],[.095,.55,.245],eyes);sphere(body,[.025,.032,.021],[-.095,.55,.245],eyes);
    sphere(body,[.06,.11,.17],[.22,.28,-.03],m);sphere(body,[.06,.11,.17],[-.22,.28,-.03],m);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.12,.2,4),m);tail.position.set(0,.3,-.25);tail.rotation.x=-.8;body.add(tail);
  }else if(type==='robot'){
    box(body,[.32,.28,.23],[0,.29,0],m,true);box(body,[.4,.28,.27],[0,.61,0],m,true);box(body,[.31,.15,.02],[0,.63,.146],ink,true);
    for(const x of [-.08,.08])sphere(body,[.025,.035,.015],[x,.64,.17],glow('#9dfce0',1));
    for(const x of [-.22,.22]){sphere(body,[.06,.065,.06],[x,.4,0],m);box(body,[.08,.16,.09],[x,.28,0],m,true);box(body,[.11,.11,.15],[x*.5,.1,.01],m,true);}
    cylinder(body,.015,.015,.14,[0,.82,0],m);sphere(body,[.04,.04,.04],[0,.91,0],glow(color,1));
  }else if(type==='rocket'){
    cylinder(body,.11,.14,.4,[0,.4,0],m);const top=new THREE.Mesh(new THREE.ConeGeometry(.11,.22,16),white);top.position.y=.71;body.add(top);
    sphere(body,[.07,.07,.025],[0,.45,.12],mat('#80e2fa',{metalness:.7}));
    for(let i=0;i<3;i++){const f=box(body,[.07,.22,.2],[0,.22,0],m);f.position.x=Math.sin(i*TAU/3)*.14;f.position.z=Math.cos(i*TAU/3)*.14;f.rotation.y=i*TAU/3;}
    const fire=new THREE.Mesh(new THREE.ConeGeometry(.075,.16,8),glow('#ffc87a',1));fire.rotation.z=Math.PI;fire.position.y=.12;body.add(fire);
  }else{
    sphere(body,[.23,.25,.2],[0,.46,0],m);cylinder(body,.23,.26,.22,[0,.28,0],m);
    for(let i=0;i<5;i++)sphere(body,[.07,.08,.07],[Math.sin(i*TAU/5)*.19,.17,Math.cos(i*TAU/5)*.16],m);
    for(const x of [-.08,.08])sphere(body,[.035,.05,.025],[x,.49,.19],eyes);
    sphere(body,[.035,.045,.025],[0,.38,.205],eyes);
  }
  root.traverse(o=>{if(o.isMesh)o.castShadow=true;});return root;
}

export function tokenPortraits(){
  try{
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(192,192);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xe9e6df,0x202632,1.8));const light=new THREE.DirectionalLight(0xfff2df,2.5);light.position.set(-3,5,4);scene.add(light);const rim=new THREE.DirectionalLight(0xb9cbe9,1);rim.position.set(3,2,-2);scene.add(rim);
    const camera=new THREE.PerspectiveCamera(32,1,.1,10);camera.position.set(.9,.95,2.1);camera.lookAt(0,.43,0);
    const images={};for(const t of TOKENS){const model=makeToken(t.id,t.color);scene.add(model);renderer.render(scene,camera);images[t.id]=renderer.domElement.toDataURL('image/png');scene.remove(model);}renderer.dispose();return images;
  }catch{return {};}
}

export class CityScene {
  constructor(host,{onSelect=()=>{},onHover=()=>{},onReady=()=>{},onError=()=>{}}={}){
    this.host=host;this.onSelect=onSelect;this.onHover=onHover;this.hovered=null;this.selected=null;this.tokens=new Map();this.properties=new Map();this.moves=[];this.particles=[];this.popups=[];this.lastSeq=0;this.active=-1;this.dead=false;this.time=0;
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setClearColor(0x07101b,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=APPEARANCE.exposure;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
      this.renderer.domElement.setAttribute('aria-label','Объёмное игровое поле. Выберите участок мышью или в списке недвижимости.');
      host.append(this.renderer.domElement);
      this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(28,1,.1,100);this.camera.position.set(...APPEARANCE.camera);
      this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,.2,0);this.controls.enableDamping=true;this.controls.dampingFactor=.06;
      this.controls.enablePan=false;this.controls.minDistance=11;this.controls.maxDistance=50;this.controls.minPolarAngle=.15;this.controls.maxPolarAngle=Math.PI*.39;this.controls.enableZoom=true;
      this.scene.add(new THREE.HemisphereLight(0xe9e6df,0x242630,APPEARANCE.ambient));
      const key=new THREE.DirectionalLight(0xfff0d8,APPEARANCE.moonlight);key.position.set(-6,12,8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.bias=-.0005;this.scene.add(key);
      const rim=new THREE.DirectionalLight(0xb7c5df,.8);rim.position.set(6,5,-8);this.scene.add(rim);
      this.world=new THREE.Group();this.scene.add(this.world);this.tileMeshes=[];this.makeBoard();this.makeCity();this.makeDice();
      this.lastFrame=performance.now();this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
      let down;
      const hitAt=e=>{const rect=host.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.intersectObjects(this.tileMeshes)[0]?.object.userData.tile??null;};
      const hover=e=>{const id=hitAt(e);this.hovered=id;this.renderer.domElement.style.cursor=id===null?'grab':'pointer';const rect=host.getBoundingClientRect();this.onHover(id,e.clientX-rect.left,e.clientY-rect.top);};
      this.renderer.domElement.addEventListener('pointermove',e=>{if(!e.buttons)hover(e);});
      this.renderer.domElement.addEventListener('pointerleave',()=>{this.hovered=null;this.onHover(null);});
      this.renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];this.hovered=null;this.onHover(null);});
      this.renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const id=hitAt(e);if(id!==null){this.select(id);this.onSelect(id);if(e.pointerType!=='touch')hover(e);}});
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();this.animate();onReady();
    }catch(e){this.renderer?.dispose();this.renderer=null;host.classList.add('no-webgl');host.innerHTML='<div class="webgl-fallback">3D-поле недоступно на этом устройстве.<br>Игра продолжает работать в режиме карты.</div>';onError(e);}
  }
  makeBoard(){
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.38}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.58;shadow.receiveShadow=true;this.scene.add(shadow);
    const base=new THREE.Mesh(new RoundedBoxGeometry(11.65,.55,11.65,4,.12),mat('#191d25',{roughness:.4,metalness:.25}));base.position.y=-.27;base.castShadow=true;base.receiveShadow=true;this.world.add(base);
    box(this.world,[11.4,.045,11.4],[0,.025,0],mat('#a8b1bd',{metalness:.8,roughness:.28}));
    box(this.world,[11.23,.05,11.23],[0,.055,0],mat('#202731'));
    box(this.world,[9,.06,9],[0,.04,0],mat('#20344c'));
    const tileGeo=new RoundedBoxGeometry(.956,.24,.956,3,.035);
    BOARD.forEach(t=>{
      const [x,z]=coordinates(t.id),group=new THREE.Group();group.position.set(x,0,z);this.world.add(group);
      const tile=new THREE.Mesh(tileGeo,mat('#333944',{roughness:.4,metalness:.22}));tile.position.y=.145;group.add(tile);tile.castShadow=true;tile.receiveShadow=true;tile.userData.tile=t.id;this.tileMeshes.push(tile);
      const text=plane(group,.92,.92,[0,.269,0],tileTexture(t));
      const rotation=t.id<10?0:t.id<20?Math.PI/2:t.id<30?Math.PI:-Math.PI/2;text.rotation.z=0;
      if(t.group){const stripe=box(group,[.91,.025,.13],[0,.279,-.4],mat(GROUPS[t.group].color));stripe.position.set(0,.279,-.4);stripe.rotation.y=0;}
      if([0,10,20,30].includes(t.id))tile.material=mat('#3c4450',{roughness:.4,metalness:.22});
      if(t.landmark&&(t.type==='station'||t.type==='parking')){
        const building=createLandmark(t.landmark),size=t.type==='parking'?.82:.7;
        building.scale.setScalar(size/Math.max(building.userData.width,building.userData.depth,1));
        const inset=t.type==='parking'?.82:.83;
        building.position.set(x===-5?inset:x===5?-inset:0,.13,z===-5?inset:z===5?-inset:0);
        building.rotation.y=-rotation;group.add(building);
      }
    });
    const outlineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.48,0,-.48),new THREE.Vector3(.48,0,-.48),new THREE.Vector3(.48,0,.48),new THREE.Vector3(-.48,0,.48)]);
    this.highlight=new THREE.LineLoop(outlineGeo,new THREE.LineBasicMaterial({color:'#f4d19b',transparent:true,opacity:1,depthTest:false}));this.highlight.renderOrder=5;this.highlight.visible=false;this.world.add(this.highlight);
    this.hoverOutline=new THREE.LineLoop(outlineGeo,new THREE.LineBasicMaterial({color:'#e9b76a',transparent:true,opacity:1,depthTest:false}));this.hoverOutline.renderOrder=5;this.hoverOutline.visible=false;this.world.add(this.hoverOutline);
    this.turnRing=new THREE.Mesh(new THREE.RingGeometry(.35,.385,48),new THREE.MeshBasicMaterial({color:'#99f5d9',side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));this.turnRing.rotation.x=-Math.PI/2;this.world.add(this.turnRing);this.turnRing.visible=false;
    this.route=[];for(let i=0;i<12;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),glow('#99f5d9',1));dot.visible=false;this.world.add(dot);this.route.push(dot);}
  }
  makeCity(){
    this.city=new THREE.Group();this.world.add(this.city);this.cars=[];
    const felt=canvasTexture(1024,1024,ctx=>{
      ctx.fillStyle='#20344c';ctx.fillRect(0,0,1024,1024);
      let seed=17;for(let i=0;i<22000;i++){seed=(seed*1664525+1013904223)>>>0;const x=(seed>>>8)%1024;seed=(seed*1664525+1013904223)>>>0;const y=(seed>>>8)%1024;ctx.fillStyle=i%2?'#ffffff03':'#00000005';ctx.fillRect(x,y,1,2);}
      ctx.strokeStyle='#bfa8780b';ctx.lineWidth=1;for(let r=36;r<690;r+=12){ctx.beginPath();ctx.arc(512,512,r,0,Math.PI*2);ctx.stroke();}
      ctx.textAlign='center';ctx.fillStyle='#d5c6a775';ctx.font='500 23px Arial';ctx.fillText('МОСКВА',512,635);
    });
    plane(this.city,8.94,8.94,[0,.092,0],felt);
    const metal=mat('#8294a9',{metalness:.8,roughness:.28});
    for(const x of [-4.52,4.52])box(this.city,[.025,.025,9.05],[x,.105,0],metal);
    for(const z of [-4.52,4.52])box(this.city,[9.05,.025,.025],[0,.105,z],metal);
    ['СОСЕДСКИЙ ЧАТ','МОСКОВСКИЙ СЛУЧАЙ'].forEach((name,i)=>{
      const deck=new THREE.Group();deck.position.set(i?1.9:-1.9,.12,i?-1.8:1.8);deck.rotation.y=i?-.3:.3;this.city.add(deck);
      for(let n=0;n<4;n++)box(deck,[1.05,.028,1.5],[0,.025+n*.03,0],mat(n===3?'#26334a':'#c8c4b8',{roughness:.88}));
      const texture=canvasTexture(512,768,ctx=>{ctx.fillStyle='#26334a';ctx.fillRect(0,0,512,768);ctx.strokeStyle='#b8a078';ctx.lineWidth=3;ctx.strokeRect(18,18,476,732);ctx.lineWidth=1;ctx.strokeRect(28,28,456,712);ctx.save();ctx.translate(256,338);for(let j=0;j<6;j++){ctx.rotate(Math.PI/6);ctx.strokeRect(-105,-105,210,210);}ctx.restore();ctx.fillStyle='#c6b591';ctx.textAlign='center';ctx.font='500 23px Arial';ctx.fillText(name,256,600,440);ctx.font='600 33px Arial';ctx.fillText('К',256,350);});
      plane(deck,1.04,1.49,[0,.151,0],texture);
    });
  }
  makeDice(){
    const layouts={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
    const faces=[3,4,1,6,2,5].map(n=>mat('#faf5e8',{map:canvasTexture(192,192,ctx=>{ctx.fillStyle='#eeeadd';ctx.fillRect(0,0,192,192);ctx.fillStyle='#24313b';for(const [x,y]of layouts[n]){ctx.beginPath();ctx.arc(96+x*47,96+y*47,15,0,TAU);ctx.fill();}}),roughness:.3}));
    this.diceGroup=new THREE.Group();this.diceGroup.position.set(0,.55,0);this.world.add(this.diceGroup);this.dice=[];
    for(let i=0;i<2;i++){const die=new THREE.Mesh(new RoundedBoxGeometry(.53,.53,.53,3,.055),faces);die.position.set(i===0?-.37:.37,0,0);die.castShadow=true;die.rotation.y=i===0?.2:-.2;this.diceGroup.add(die);this.dice.push(die);}
    this.rollStart=0;this.rollValues=[1,1];
  }
  resize(){if(!this.renderer)return;const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.home();}
  home(){this.camera.position.set(...APPEARANCE.camera);this.controls.target.set(0,.2,0);this.controls.update();this.camera.updateMatrixWorld();for(let iteration=0;iteration<2;iteration++){let mx=0,my=0;for(const x of [-5.64,5.64])for(const z of [-5.64,5.64]){const p=new THREE.Vector3(x,.15,z).project(this.camera);mx=Math.max(mx,Math.abs(p.x));my=Math.max(my,Math.abs(p.y));}const scale=Math.max(mx/.98,my/.93);this.camera.position.sub(this.controls.target).multiplyScalar(scale).add(this.controls.target);this.controls.update();this.camera.updateMatrixWorld();}}
  top(){this.camera.position.set(.01,21,.01);this.controls.target.set(0,0,0);this.controls.update();}
  zoom(delta){this.camera.position.sub(this.controls.target).multiplyScalar(delta).add(this.controls.target);this.controls.update();}
  update(game,initial=false){
    if(!this.renderer)return;
    const first=initial||!this.game;this.game=game;
    const events=first?[]:game.events.filter(e=>e.id>this.lastSeq);this.lastSeq=game.sequence;
    game.players.forEach((p,i)=>{
      if(!this.tokens.has(p.id)){const token=makeToken(p.token,TOKENS.find(t=>t.id===p.token).color);token.userData.type=p.token;this.world.add(token);this.tokens.set(p.id,token);const [x,z]=coordinates(p.position);token.position.set(x,.21,z);}
      const token=this.tokens.get(p.id);token.visible=!p.bankrupt;
      if(token.userData.type!==p.token){this.world.remove(token);this.tokens.delete(p.id);this.update(game,true);return;}
      if(first){const [x,z]=coordinates(p.position),offset=this.tokenOffset(p.id);token.position.set(x+offset[0],.21,z+offset[1]);}
    });
    for(const [id,t]of this.tokens)if(!game.players.some(p=>p.id===id)){this.world.remove(t);this.tokens.delete(id);}
    if(first){this.rollValues=game.dice||[1,1];this.rollStart=performance.now()-1500;}
    if(!first){
      let startAt=performance.now();
      for(const e of events){
        if(e.kind==='roll'){this.rollStart=performance.now();this.rollValues=e.dice;startAt=this.rollStart+1050;}
        if(e.kind==='move'){this.moves.push({player:e.player,from:e.from,to:e.to,steps:e.steps,start:Math.max(startAt,this.moves.at(-1)?.end||0),end:Math.max(startAt,this.moves.at(-1)?.end||0)+Math.min(Math.abs(e.steps),40)*145+100});startAt=this.moves.at(-1).end;}
        if(e.kind==='jail'){const token=this.tokens.get(e.player);if(token&&!events.some(x=>x.kind==='move'&&x.to===10)){this.moves.push({player:e.player,from:game.players.find(p=>p.id===e.player).position,to:10,steps:0,start:startAt,end:startAt+350,teleport:true});}}
        if(['purchase','build','win'].includes(e.kind))this.burst(e.tile??game.players.find(p=>p.id===e.player)?.position??0);
        if(['purchase','build','payment','bonus'].includes(e.kind)){const token=this.tokens.get(e.player);if(token)token.userData.reaction={kind:e.kind==='payment'?'sad':'happy',born:performance.now()};if(e.to&&e.kind==='payment'){const owner=this.tokens.get(e.to);if(owner)owner.userData.reaction={kind:'happy',born:performance.now()};}}
        if(e.kind==='payment'||e.kind==='bonus'){const p=game.players.find(p=>p.id===e.player);if(p)this.moneyPopup(p.position,`${e.kind==='bonus'?'+':'−'}${e.amount} ₽`,e.kind==='bonus'?'#8af0cd':'#ff9eac');}
      }
      for(const p of game.players)if(!this.moves.some(m=>m.player===p.id)){const token=this.tokens.get(p.id);const[x,z]=coordinates(p.position);if(token&&Math.hypot(token.position.x-x,token.position.z-z)>.5)token.position.set(x,.21,z);}
    }
    this.active=game.players[game.current]?.position??-1;this.turnRing.visible=game.status==='playing';if(game.players[game.current])this.turnRing.material.color.set(TOKENS.find(t=>t.id===game.players[game.current].token).color);
    for(const t of BOARD){const v=game.properties[t.id],prev=this.properties.get(t.id);const sig=v?`${v.owner}:${v.houses}:${v.mortgaged}`:'';if(prev?.sig===sig)continue;if(prev){this.world.remove(prev.group);prev.group.traverse(o=>{if(o.geometry&&!['BoxGeometry','SphereGeometry'].includes(o.geometry.type))o.geometry.dispose();});this.properties.delete(t.id);}if(!v)continue;
      const g=new THREE.Group();const[x,z]=coordinates(t.id);g.position.set(x,0,z);this.world.add(g);
      const owner=game.players.find(p=>p.id===v.owner);const color=TOKENS.find(t=>t.id===owner?.token)?.color||'#fff';
      const rot=t.id<10?0:t.id<20?Math.PI/2:t.id<30?Math.PI:-Math.PI/2;
      const border=box(g,[.88,.025,.035],[0,.24,.43],glow(color,v.mortgaged?.03:.6));border.rotation.y=-rot;border.position.x=Math.sin(rot)*.43;border.position.z=Math.cos(rot)*.43;
      if(v.houses>0&&t.landmark){
        const b=new THREE.Group(),model=createLandmark(t.landmark),scale=.56/Math.max(model.userData.width,model.userData.depth,1)*(.72+v.houses*.065);
        model.scale.setScalar(scale);b.add(model);b.position.set(-Math.sin(rot)*.64,.15,-Math.cos(rot)*.64);b.rotation.y=-rot;g.add(b);
        for(let level=0;level<v.houses;level++)sphere(g,[.027,.012,.027],[(level-(v.houses-1)/2)*.085,.25,.33],glow(color,.25));
        if(!first){b.userData.grow=performance.now();b.scale.setScalar(.01);}
      }
      this.properties.set(t.id,{sig,group:g});
    }
  }
  select(id){if(!this.renderer)return;const[x,z]=coordinates(id);this.selected=id;this.highlight.position.set(x,.33,z);this.highlight.visible=true;}
  moneyPopup(id,text,color){const[x,z]=coordinates(id);const texture=canvasTexture(384,128,ctx=>{ctx.textAlign='center';ctx.font='700 65px Arial';ctx.fillStyle=color;ctx.shadowColor='#07101b';ctx.shadowBlur=10;ctx.fillText(text,192,87);});const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.position.set(x,1.1,z);sprite.scale.set(1.7,.56,1);this.world.add(sprite);this.popups.push({sprite,born:performance.now()});}
  tokenOffset(id){const p=this.game?.players.find(p=>p.id===id);if(!p)return[0,0];const peers=this.game.players.filter(x=>!x.bankrupt&&x.position===p.position);if(peers.length<2)return[0,0];const i=peers.findIndex(x=>x.id===id),positions=[[-.23,-.22],[.23,-.22],[-.23,.22],[.23,.22],[0,.4],[0,-.4]];return positions[i]||[0,0];}
  burst(id){const[x,z]=coordinates(id);for(let i=0;i<14;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.045,.045,.045),glow(i%2?'#89e4c7':'#e7be7c',.5));mesh.position.set(x,.3,z);this.world.add(mesh);this.particles.push({mesh,born:performance.now(),vx:(Math.random()-.5)*2,vz:(Math.random()-.5)*2,vy:1+Math.random()*1.4});}}
  animate=()=>{
    if(this.dead||!this.renderer)return;requestAnimationFrame(this.animate);const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000,.05);this.lastFrame=now;this.time+=dt;
    this.controls.update();
    for(const tile of this.tileMeshes){const id=tile.userData.tile,hot=id===this.hovered,chosen=id===this.selected,target=hot?.12:chosen?.045:0;tile.parent.position.y=THREE.MathUtils.lerp(tile.parent.position.y,target,APPEARANCE.reducedMotion?1:Math.min(1,dt*16));tile.material.emissive.set(hot?(GROUPS[BOARD[id].group]?.color||'#a8bedb'):chosen?'#8baccb':'#000000');tile.material.emissiveIntensity=hot?.32:chosen?.1:0;}
    this.hoverOutline.visible=this.hovered!==null;if(this.hovered!==null){const[x,z]=coordinates(this.hovered);this.hoverOutline.position.set(x,.29+this.tileMeshes[this.hovered].parent.position.y,z);this.hoverOutline.material.color.set(GROUPS[BOARD[this.hovered].group]?.color||'#c5d7ed');}
    if(this.selected!==null){const[x,z]=coordinates(this.selected);this.highlight.position.set(x,.29+this.tileMeshes[this.selected].parent.position.y,z);}
    this.route.forEach(dot=>dot.visible=false);
    for(const move of this.moves){if(now<move.start)continue;const token=this.tokens.get(move.player);if(!token)continue;const f=APPEARANCE.reducedMotion?1:Math.min(1,(now-move.start)/(move.end-move.start));
      if(move.teleport){const[x,z]=coordinates(move.to);token.position.set(x,.21+Math.sin(f*Math.PI)*1.2,z);}
      else{const progress=f*Math.abs(move.steps),step=Math.floor(progress),fract=progress-step,dir=Math.sign(move.steps);const [ax,az]=coordinates((move.from+dir*step+400)%40),[bx,bz]=coordinates((move.from+dir*(step+1)+400)%40);const ease=fract*fract*(3-2*fract);token.position.set(ax+(bx-ax)*ease,.21+Math.sin(fract*Math.PI)*.22,az+(bz-az)*ease);token.rotation.y=Math.atan2(bx-ax,bz-az);for(let n=step+1;n<=Math.abs(move.steps)&&n<step+13;n++){const dot=this.route[n-step-1], [x,z]=coordinates((move.from+dir*n+400)%40);dot.visible=true;dot.position.set(x,.26,z);}}
      if(f>=1){const[x,z]=coordinates(move.to),offset=this.tokenOffset(move.player);token.position.set(x+offset[0],.21,z+offset[1]);move.done=true;}
    }this.moves=this.moves.filter(m=>!m.done);
    if(!APPEARANCE.reducedMotion)for(const[id,t]of this.tokens){const body=t.userData.body;body.rotation.z=Math.sin(this.time*2+id.length)*.025;body.rotation.y=0;body.scale.setScalar(1);if(t.userData.type==='ufo'||t.userData.type==='ghost')body.position.y=Math.sin(this.time*2.1)*.04;else body.position.y=Math.sin(this.time*2.3)*.008;const r=t.userData.reaction;if(r){const f=(now-r.born)/1200;if(f>1)delete t.userData.reaction;else if(r.kind==='happy'){body.position.y+=Math.abs(Math.sin(f*Math.PI*3))*.12;body.rotation.y=Math.sin(f*TAU)*.3;}else{body.rotation.z+=Math.sin(f*TAU*2)*.13;body.scale.y=1-Math.sin(f*Math.PI)*.13;}}}
    if(this.rollStart){const t=(now-this.rollStart)/1000;this.dice.forEach((d,i)=>{if(t<1){d.rotation.set(t*13+i,t*11,t*9);d.position.y=Math.abs(Math.sin(t*Math.PI*3))*(1-t)*1.1;}else{const rots={1:[0,0,0],2:[-Math.PI/2,0,0],3:[0,0,Math.PI/2],4:[0,0,-Math.PI/2],5:[Math.PI/2,0,0],6:[Math.PI,0,0]};d.rotation.set(...rots[this.rollValues[i]]);d.position.y=0;}});if(t>1.1)this.rollStart=0;}
    this.cars.forEach((c,i)=>{const f=(this.time*.22+i*4)%16;const[x,z]=f<4?[-2.5,-2.3+f]:f<8?[-2.5+(f-4)*1.25,1.7]:f<12?[2.5,1.7-(f-8)]:[2.5-(f-12)*1.25,-2.3];c.position.set(x,.11,z);c.rotation.y=f<4?0:f<8?Math.PI/2:f<12?Math.PI:-Math.PI/2;});
    for(const p of this.particles){const t=(now-p.born)/1000;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.vy-=3*dt;p.mesh.rotation.x+=dt*4;p.mesh.scale.setScalar(Math.max(0,1-t));if(t>1){this.world.remove(p.mesh);p.mesh.geometry.dispose();p.dead=true;}}
    this.particles=this.particles.filter(p=>!p.dead);this.highlight.material.opacity=.55+Math.sin(this.time*3)*.2;
    const activeToken=this.tokens.get(this.game?.players[this.game.current]?.id);if(activeToken){this.turnRing.position.set(activeToken.position.x,.225,activeToken.position.z);this.turnRing.material.opacity=.4+Math.sin(this.time*3)*.15;}
    for(const {group}of this.properties.values())for(const b of group.children)if(b.userData.grow){const f=Math.max(0,Math.min(1,(now-b.userData.grow)/500)),s=1+2.70158*(f-1)**3+1.70158*(f-1)**2;b.scale.setScalar(Math.max(.01,s));if(f>=1)delete b.userData.grow;}
    for(const p of this.popups){const t=(now-p.born)/1700;p.sprite.position.y+=dt*.55;p.sprite.material.opacity=Math.min(1,(1-t)*2);if(t>1){this.world.remove(p.sprite);p.sprite.material.map.dispose();p.sprite.material.dispose();p.dead=true;}}this.popups=this.popups.filter(p=>!p.dead);
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.dead=true;this.resizeObserver?.disconnect();this.controls?.dispose();this.scene?.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});this.renderer?.dispose();this.host.innerHTML='';}
}
