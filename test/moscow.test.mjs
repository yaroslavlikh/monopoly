import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOARD,GROUPS} from '../shared/board.mjs';
import {newGame,addPlayer,act,complete,rent} from '../server/game.mjs';
import {createLandmark} from '../client/landmarks.js';

test('восточная группа включает все четыре обязательных района',()=>{
  assert.deepEqual(BOARD.filter(t=>t.group==='east').map(t=>t.name),['Новокосино','Новогиреево','Перово','Лефортово']);
  assert.equal(BOARD.find(t=>t.name==='Новокосино').landmarkName,'Тануки');
  assert.equal(BOARD.find(t=>t.name==='Новогиреево').landmarkName,'Лицей 1502');
  assert.equal(BOARD.find(t=>t.name==='Перово').landmarkName,'Перовский парк');
  assert.equal(Object.keys(GROUPS).length,8);
});
test('особые здания закреплены за нужными остановками',()=>{
  const university=BOARD.find(t=>t.name==='Университет');assert.equal(university.landmark,'mgu');assert.equal(university.line,'1');
  assert.equal(BOARD.find(t=>t.name==='Театральная').landmark,'telegraph');
  const ilyicha=BOARD.find(t=>t.name==='Площадь Ильича');assert.equal(ilyicha.landmark,'goldengate');assert.equal(ilyicha.address,'бульвар Энтузиастов, 2');assert.equal(ilyicha.line,'8');
  const kl=BOARD.find(t=>t.name==='Куала-Лумпур');assert.equal(kl.landmark,'petronas');assert.equal(kl.type,'parking');assert.equal(kl.price,undefined);
});
test('для монополии и строительства на Востоке нужны четыре участка',()=>{
  const g=newGame('MOSCOW');const p=addPlayer(g,'Москвич','cat',true);addPlayer(g,'Сосед','duck',true);act(g,p.id,{type:'start'});
  for(const tile of [6,8,9])g.properties[tile]={owner:p.id,houses:0,mortgaged:false};
  assert.equal(complete(g,p.id,'east'),false);assert.equal(rent(g,BOARD[6]),6);assert.throws(()=>act(g,p.id,{type:'build',tile:6}));
  g.properties[11]={owner:p.id,houses:0,mortgaged:false};assert.equal(complete(g,p.id,'east'),true);assert.equal(rent(g,BOARD[6]),12);act(g,p.id,{type:'build',tile:6});assert.equal(g.properties[6].houses,1);
});
test('все миниатюры строятся без ошибок и имеют конечные габариты',()=>{
  // Для табличек нужен Canvas 2D; геометрия проверяется без браузера и WebGL.
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})};
  try{for(const kind of new Set(BOARD.filter(t=>t.landmark).map(t=>t.landmark))){
    const model=createLandmark(kind),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0),`Неверные габариты: ${kind}`);assert.ok(model.children.length);
  }}finally{globalThis.document=previous;}
});
