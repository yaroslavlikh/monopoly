import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const port=3099;
async function start(data){const proc=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:['ignore','pipe','pipe']});let output='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout: '+output)),5000);proc.stdout.on('data',b=>{output+=b;if(output.includes('http://localhost')){clearTimeout(timer);resolve();}});proc.stderr.on('data',b=>output+=b);proc.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+output));});});return proc;}
async function stop(proc){if(proc.exitCode!==null)return;const ended=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await ended;}
async function client(){const ws=new WebSocket(`ws://localhost:${port}/ws`);const inbox=[];const waiting=new Set();ws.on('message',b=>{const m=JSON.parse(b);inbox.push(m);for(const f of waiting)f();});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,inbox,send:m=>ws.send(JSON.stringify(m)),wait(predicate,from=0){return new Promise((resolve,reject)=>{const check=()=>{const item=inbox.slice(from).find(predicate);if(item){clearTimeout(timer);waiting.delete(check);resolve(item);}};const timer=setTimeout(()=>{waiting.delete(check);reject(new Error('Message timeout: '+JSON.stringify(inbox.slice(from))));},3000);waiting.add(check);check();});},close(){ws.terminate();}};}

test('комната: личные чаты, приватность трейда, аутентификация и восстановление после перезапуска',async()=>{
  const data=await mkdtemp(path.join(tmpdir(),'kvartal-test-'));let proc,people=[];
  try{
    proc=await start(data);
    assert.equal((await fetch(`http://localhost:${port}/api/health`)).status,200);
    const root=await fetch(`http://localhost:${port}/?room=TEST`);assert.ok([200,503].includes(root.status),`Корневая страница: ${root.status}`);
    const[a,b,c]=await Promise.all([client(),client(),client()]);people=[a,b,c];
    a.send({type:'create',name:'Аня',token:'cat'});const sa=await a.wait(m=>m.type==='session');
    b.send({type:'join',code:sa.code,name:'Боря',token:'ufo'});const sb=await b.wait(m=>m.type==='session');
    c.send({type:'join',code:sa.code,name:'Саша',token:'duck'});const sc=await c.wait(m=>m.type==='session');
    const before=c.inbox.length;
    a.send({type:'dm',to:sb.player,text:'Секретная набережная'});await b.wait(m=>m.type==='message'&&m.message.text==='Секретная набережная');
    await c.wait(m=>m.type==='state',before);assert.ok(!c.inbox.some(m=>JSON.stringify(m).includes('Секретная набережная')));
    b.send({type:'action',action:{type:'ready'}});await b.wait(m=>m.type==='state'&&m.game.players.find(p=>p.id===sb.player)?.ready);
    c.send({type:'action',action:{type:'ready'}});await c.wait(m=>m.type==='state'&&m.game.players.find(p=>p.id===sc.player)?.ready);
    a.send({type:'action',action:{type:'start'}});await a.wait(m=>m.type==='state'&&m.game.status==='playing');
    a.send({type:'action',action:{type:'trade',to:sb.player,offer:[],ask:[],offerCash:10,askCash:0,message:'Приватный комментарий'}});
    const offer=await b.wait(m=>m.type==='state'&&m.game.trade?.message==='Приватный комментарий');assert.equal(offer.game.trade.offerCash,10);
    await c.wait(m=>m.type==='state'&&m.game.sequence===offer.game.sequence);
    assert.ok(!c.inbox.some(m=>JSON.stringify(m).includes('Приватный комментарий')));
    b.send({type:'action',action:{type:'tradeAccept',tradeId:offer.game.trade.id}});const accepted=await b.wait(m=>m.type==='state'&&m.game.players.find(p=>p.id===sb.player)?.cash===1510);assert.equal(accepted.game.trade,null);
    b.send({type:'read',peer:sa.player});await b.wait(m=>m.type==='read'&&m.peer===sa.player);
    const attacker=await client();people.push(attacker);attacker.send({type:'resume',code:sa.code,player:sa.player,secret:'bad'});await attacker.wait(m=>m.type==='error');assert.ok(!attacker.inbox.some(m=>m.type==='state'||m.type==='messages'));
    people.forEach(p=>p.close());people=[];await stop(proc);proc=await start(data);
    const resumed=await client();people.push(resumed);resumed.send({type:'resume',code:sa.code,player:sa.player,secret:sa.secret});const restored=await resumed.wait(m=>m.type==='state');assert.equal(restored.game.players.find(p=>p.id===sa.player).cash,1490);
    const history=await resumed.wait(m=>m.type==='messages');assert.ok(history.messages.some(m=>m.text==='Секретная набережная'));assert.ok(history.messages.some(m=>m.text==='Приватный комментарий'));assert.ok(history.messages.some(m=>m.kind==='tradeResult'));
    assert.equal(restored.game.players.find(p=>p.id===sa.player).online,true);
    const returned=await client();people.push(returned);returned.send({type:'resume',code:sb.code,player:sb.player,secret:sb.secret});const readHistory=await returned.wait(m=>m.type==='messages');assert.equal(readHistory.unread[sa.player]||0,0);
  }finally{people.forEach(p=>p.close());if(proc)await stop(proc);await rm(data,{recursive:true,force:true});}
});
