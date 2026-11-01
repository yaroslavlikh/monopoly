import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes, timingSafeEqual,randomUUID} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import {newGame,addPlayer,act,botAction,publicGame,log,normalizeGame} from './game.mjs';
import {BOARD_VERSION} from '../shared/board.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.PORT)||3000;
const DATA=process.env.DATA_DIR||path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true,mode:0o700});
const savePath=path.join(DATA,'rooms.json');
let rooms=new Map();
try { if(fs.existsSync(savePath))rooms=new Map(JSON.parse(fs.readFileSync(savePath,'utf8'))); }
catch(error){console.error('Не удалось прочитать сохранения. Исправьте rooms.json перед запуском.',error.message);process.exit(1);}
for(const r of rooms.values()) {normalizeGame(r.game);r.messages??=[];r.reads??={};for(const p of r.game.players)p.online=p.bot;}
const clients=new Set();
const save=()=>{try{fs.writeFileSync(savePath+'.tmp',JSON.stringify([...rooms]),{mode:0o600});fs.renameSync(savePath+'.tmp',savePath);}catch(e){console.error('Сохранение не удалось:',e.message);throw new Error('Не удалось сохранить ход. Попробуйте ещё раз.');}};
const connected=(code,id)=>[...clients].some(c=>c.room===code&&c.player===id&&c.ws.readyState===WebSocket.OPEN);
function send(c,data){if(c.ws.readyState===WebSocket.OPEN)c.ws.send(JSON.stringify(data));}
function privateHistory(c){const r=rooms.get(c.room),messages=r.messages.filter(m=>m.from===c.player||m.to===c.player),unread={};for(const m of messages)if(m.to===c.player&&m.at>(r.reads[c.player]?.[m.from]||0))unread[m.from]=(unread[m.from]||0)+1;send(c,{type:'messages',messages,unread});}
function broadcast(code){const r=rooms.get(code);if(!r)return;for(const p of r.game.players)p.online=p.bot||connected(code,p.id);for(const c of clients)if(c.room===code)send(c,{type:'state',game:publicGame(r.game,c.player),you:c.player});}
function mutate(code,fn){const r=rooms.get(code),before=structuredClone(r);try{fn(r.game);save();}catch(e){Object.assign(r,before);throw e;}broadcast(code);}
function appendMessage(r,from,to,text,extra={}){const msg={id:randomUUID(),from,to,text,at:Date.now(),...extra};r.messages.push(msg);if(r.messages.length>2000)r.messages.splice(0,r.messages.length-2000);return msg;}
function deliverMessage(code,msg){for(const other of clients)if(other.room===code&&[msg.from,msg.to].includes(other.player))send(other,{type:'message',message:msg});}
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){let code;do{code=Array.from(randomBytes(6),b=>alphabet[b%alphabet.length]).join('');}while(rooms.has(code));return code;}
function equalSecret(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
const dev=process.argv.includes('--dev');
const vite=dev?await (await import('vite')).createServer({root:ROOT,server:{middlewareMode:true},appType:'spa'}):null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  if(req.url==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,version:'1.0.0'}));return;}
  if(vite){vite.middlewares(req,res);return;}
  let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  let file=path.resolve(ROOT,'dist','.'+url);
  if(file!==path.join(ROOT,'dist')&&!file.startsWith(path.join(ROOT,'dist')+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(ROOT,'dist','index.html');
  if(!fs.existsSync(file)){res.writeHead(503);res.end('Run npm run build first');return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control',file.includes('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  const stream=fs.createReadStream(file);stream.on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();});stream.pipe(res);
});
const wss=new WebSocketServer({noServer:true,maxPayload:16*1024});
server.on('upgrade',(req,socket,head)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/ws')return;
  const origin=req.headers.origin;
  if(origin){let host;try{host=new URL(origin).host;}catch{socket.destroy();return;}if(host!==req.headers.host){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
  const c={ws,room:null,player:null,messages:0,window:Date.now(),alive:true};clients.add(c);
  ws.on('pong',()=>c.alive=true);
  ws.on('error',()=>{});
  ws.on('message',bytes=>{
    try{
      if(Date.now()-c.window>10000){c.window=Date.now();c.messages=0;}
      if(++c.messages>45)throw new Error('Слишком много действий. Подождите несколько секунд.');
      let m;try{m=JSON.parse(bytes.toString());}catch{throw new Error('Неверный формат сообщения.');}
      if(!m||typeof m!=='object')throw new Error('Неверное сообщение.');
      if(['create','join','resume'].includes(m.type)){
        if(c.room)throw new Error('Вы уже в комнате. Сначала выйдите.');
        if(m.type==='create'){
          // ponytail: один процесс и JSON-снимки для частных комнат; при росте перейти на БД и отдельные игровые процессы.
          if(rooms.size>=1000)throw new Error('Сервер заполнен. Свяжитесь с владельцем.');
          const code=newCode(),game=newGame(code),p=addPlayer(game,m.name,m.token),secret=randomBytes(24).toString('hex');
          const r={game,secrets:{[p.id]:secret},messages:[],reads:{}};
          if(m.demo){for(let i=0;i<3;i++)addPlayer(game,['Луна','Байт','Ника'][i],'',true);act(game,p.id,{type:'start'});}
          rooms.set(code,r);try{save();}catch(e){rooms.delete(code);throw e;}
          c.room=code;c.player=p.id;send(c,{type:'session',code,player:p.id,secret});broadcast(code);privateHistory(c);return;
        }
        const code=String(m.code||'').toUpperCase(),r=rooms.get(code);
        if(!r)throw new Error('Комната не найдена. Проверьте код.');
        if(r.game.boardVersion!==BOARD_VERSION)throw new Error('Эта комната создана на прежнем поле. Начните новую московскую партию.');
        if(m.type==='resume'){
          if(!equalSecret(r.secrets[m.player],m.secret))throw new Error('Не удалось восстановить вход. Проверьте устройство.');
          if(r.game.status==='playing'&&![...clients].some(other=>other.room===code)&&r.game.settings.turnSeconds>0){r.game.deadline=Date.now()+r.game.settings.turnSeconds*1000;save();}
          c.room=code;c.player=m.player;send(c,{type:'session',code,player:m.player,secret:m.secret});broadcast(code);privateHistory(c);return;
        }
        const secret=randomBytes(24).toString('hex');let p;
        mutate(code,g=>{p=addPlayer(g,m.name,m.token);r.secrets[p.id]=secret;});
        c.room=code;c.player=p.id;send(c,{type:'session',code,player:p.id,secret});broadcast(code);privateHistory(c);return;
      }
      if(!c.room)throw new Error('Сначала войдите в комнату.');
      if(m.type==='leave'){
        const code=c.room,r=rooms.get(code);
        if(r.game.status==='lobby')mutate(code,g=>{g.players=g.players.filter(p=>p.id!==c.player);delete r.secrets[c.player];if(g.host===c.player)g.host=g.players.find(p=>!p.bot)?.id||null;});
        c.room=null;c.player=null;send(c,{type:'left'});broadcast(code);return;
      }
      if(m.type==='react'){
        if(!['🔥','😂','💸','😈','🤝','😭'].includes(m.emoji))return;
        for(const other of clients)if(other.room===c.room)send(other,{type:'reaction',player:c.player,emoji:m.emoji});return;
      }
      if(m.type==='dm'){
        const r=rooms.get(c.room),to=r.game.players.find(p=>p.id===m.to);
        if(!to||to.id===c.player||to.bot)throw new Error('Выберите другого игрока для личного сообщения.');
        if(typeof m.text!=='string'||!m.text.trim()||m.text.length>1000)throw new Error('Сообщение: от 1 до 1000 символов.');
        let msg;mutate(c.room,()=>{msg=appendMessage(r,c.player,to.id,m.text.trim());});deliverMessage(c.room,msg);return;
      }
      if(m.type==='read'){
        const r=rooms.get(c.room);if(!r.game.players.some(p=>p.id===m.peer&&p.id!==c.player))return;
        r.reads[c.player]??={};r.reads[c.player][m.peer]=Date.now();save();
        for(const other of clients)if(other.room===c.room&&other.player===c.player)send(other,{type:'read',peer:m.peer});return;
      }
      if(m.type==='action'){
        const r=rooms.get(c.room),previous=r.game.trade;let msg;
        mutate(c.room,g=>{
          act(g,c.player,m.action);
          if(m.action.type==='trade'&&g.trade){const t=g.trade;msg=appendMessage(r,t.from,t.to,t.message||'Предлагаю обмен.',{kind:'trade',trade:structuredClone(t)});}
          if(previous&&!g.trade&&['tradeAccept','tradeReject'].includes(m.action.type))msg=appendMessage(r,c.player,c.player===previous.from?previous.to:previous.from,m.action.type==='tradeAccept'?'Сделка принята 🤝':'Предложение отклонено',{kind:'tradeResult',tradeId:previous.id});
        });if(msg)deliverMessage(c.room,msg);return;
      }
      throw new Error('Неизвестная команда.');
    }catch(error){send(c,{type:'error',message:error.message});}
  });
  ws.on('close',()=>{clients.delete(c);if(c.room)broadcast(c.room);});
});
const botTimes=new Map();
const ticker=setInterval(()=>{
  const now=Date.now();
  for(const [code,r] of rooms){
    const g=r.game;if(g.status!=='playing')continue;
    if(![...clients].some(c=>c.room===code))continue;
    const actor=g.auction?g.players.find(p=>p.id===g.auction.actor):g.players[g.current];
    const tradeBot=g.trade&&g.players.find(p=>p.id===g.trade.to&&p.bot);
    const timedOut=g.settings.turnSeconds>0 && now>g.deadline;
    const bot=tradeBot||actor;
    if(bot.bot||timedOut){
      const delay=tradeBot?1400:g.phase==='roll'?1900:g.phase==='end'?2800:1700;
      if(now-(botTimes.get(code)||0)<delay)continue;
      try{const action=botAction(g,bot.id);if(action){mutate(code,game=>{if(!bot.bot)log(game,`${bot.name}: действие по таймеру`);act(game,bot.id,action);});botTimes.set(code,now);}}
      catch(error){console.error('Auto action:',error.message);botTimes.set(code,now);}
    }else botTimes.set(code,now);
  }
},350);
const heartbeat=setInterval(()=>{for(const c of clients){if(!c.alive){c.ws.terminate();continue;}c.alive=false;c.ws.ping();}},25000);
server.listen(PORT,'0.0.0.0',()=>console.log(`КВАРТАЛ · http://localhost:${PORT}${dev?' (development)':''}`));
function stop(){clearInterval(ticker);clearInterval(heartbeat);for(const c of clients)c.ws.close(1001,'Server restarting');wss.close();server.close();vite?.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
