import './style.css';
import './tabletop.css';
import {CityScene,tokenPortraits} from './scene.js';
import {audio} from './audio.js';
import {portfolioGroups,portfolioTotals} from './portfolio.js';
import {landmarkPortrait} from './landmarks.js';
import {BOARD,GROUPS,TOKENS,money} from '../shared/board.mjs';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={dice:'⚄',chevron:'↗',close:'×',chat:'↗',sound:'◖))',help:'?',settings:'⚙',home:'⌂',copy:'▣',arrow:'→'};
const icon=n=>`<span aria-hidden="true">${icons[n]||n}</span>`;
const tokenOf=p=>TOKENS.find(t=>t.id===p?.token)||TOKENS[0];
const portraits=tokenPortraits();
const tokenArt=t=>portraits[t.id]?`<img src="${portraits[t.id]}" alt="" draggable="false" />`:t.icon;
const badge=(p,size='')=>`<span class="avatar ${size}" style="--player:${tokenOf(p).color}">${tokenArt(tokenOf(p))}</span>`;
function propertyArt(tile){const image=landmarkPortrait(tile);return `<div class="property-art landmark-art" style="--district:${GROUPS[tile.group]?.color||tile.lineColor||'#91b4b4'}">${image?`<img src="${image}" alt="Миниатюра: ${esc(tile.landmarkName)}" draggable="false">`:`<span>${tileSymbol(tile)}</span>`}</div>`;}
function deedTitle(tile){return `<div class="deed-title" style="--district:${GROUPS[tile.group]?.color||tile.lineColor||'#7b715e'}">${esc(tile.name)}</div>`;}
function landmarkCaption(tile){return tile.landmarkName?`<p class="landmark-caption">${tile.line?`<span class="metro-line" style="--line-color:${tile.lineColor}">М ${tile.line}</span>`:''}${esc(tile.landmarkName)}${tile.tag?`<span class="location-tag">${esc(tile.tag)}</span>`:''}</p>`:'';}
const allOwned=id=>BOARD.filter(t=>game?.properties[t.id]?.owner===id);
const me=()=>game?.players.find(p=>p.id===you);
const current=()=>game?.players[game.current];
const turn=()=>current()?.id===you;
const hasSession=()=>{try{return JSON.parse(localStorage.getItem('kvartal.session')||'null');}catch{return null;}};
let game=null,you=null,socket=null,connecting=false,retry=0,reconnectTimer,selected=null,modal=null,chatOpen=false,chatPeer=null,messages=[],unread={},pending=false,lastSeq=0,animationUntil=0,latestError=null;
let pageMode='create';
const chatDrafts={};
const rememberedName=localStorage.getItem('kvartal.name')||'';
let chosenToken=localStorage.getItem('kvartal.token')||'cat';
const urlRoom=new URL(location.href).searchParams.get('room');if(urlRoom)pageMode='join';
$('#app').innerHTML=`
<div class="shell mode-home">
  <header class="header">
    <a href="/" class="brand" aria-label="Монополия — главная"><span class="brand-word">Монополия<small>Москва</small></span></a>
    <div id="room-header"></div>
    <div class="header-actions"><span id="connection" class="connection"><i></i> Подключение</span><button class="icon-button" data-cmd="sound" title="Звук" aria-label="Переключить звук">${icon('sound')}</button><button class="icon-button" data-cmd="rules" title="Правила" aria-label="Открыть правила">?</button></div>
  </header>
  <main class="game-layout">
    <aside id="left-panel" class="left-panel"></aside>
    <section class="stage" aria-label="Игровое поле">
      <div class="stage-grid"></div><div id="scene" class="scene"></div>
      <div id="stage-label" class="stage-label"></div>
      <button class="board-list-button" data-cmd="boardList" title="Районы и места Москвы">▦ Карта районов</button>
      <div class="camera-controls"><button data-cmd="cameraHome" title="Вернуть камеру" aria-label="Вернуть камеру">⌂</button><button data-cmd="cameraTop" title="Вид сверху" aria-label="Вид сверху">▧</button><span></span><button data-cmd="zoomIn" aria-label="Приблизить">+</button><button data-cmd="zoomOut" aria-label="Отдалить">−</button></div>
      <div class="stage-hint">Вращайте поле мышью <span>·</span> Колесо — масштаб</div>
      <div id="tile-tooltip" class="tile-tooltip" hidden></div><div id="reactions-layer" class="reactions-layer" aria-hidden="true"></div>
      <div id="map-fallback"></div>
    </section>
    <aside id="right-panel" class="right-panel"></aside>
  </main>
  <footer id="bottom-bar" class="bottom-bar"></footer>
</div>
<div id="modal-root"></div><div id="chat-root"></div>`;
const scene=new CityScene($('#scene'),{onHover:(id,x,y)=>{const el=$('#tile-tooltip');el.hidden=id===null;if(id===null)return;const t=BOARD[id];el.style.setProperty('--district',GROUPS[t.group]?.color||t.lineColor||'#b3c5dc');el.style.left=`${Math.max(8,Math.min(x+18,$('#scene').clientWidth-238))}px`;el.style.top=`${Math.max(8,y-112)}px`;el.innerHTML=`<strong>${esc(t.name)}</strong><span>${esc(t.landmarkName||t.tag||'')}</span><b>${t.price?money(t.price):t.type==='start'?'+200 ₽':''}</b>`;},onSelect:id=>{if(game?.status==='playing'){selected=id;renderRight();}else previewLocation(id);},onError:()=>renderMap()});
const preview={players:TOKENS.slice(0,4).map((t,i)=>({id:'preview'+i,name:t.name,token:t.id,position:[9,8,20,25][i],cash:1500})),properties:{},current:0,sequence:0,events:[],status:'preview'};
for(const [id,owner,houses]of [[1,0,1],[3,0,1],[6,1,1],[8,1,1],[9,1,1],[11,1,1],[37,2,1],[39,2,1],[31,3,1],[32,3,1],[34,3,1]])preview.properties[id]={owner:preview.players[owner].id,houses,mortgaged:false};scene.update(preview,true);

function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.add('visible');el.classList.toggle('error',error);clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove('visible'),4500);if(error)audio.play('error');}
function connect(){
  if(socket?.readyState===WebSocket.OPEN||connecting)return;
  connecting=true;socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  socket.addEventListener('open',()=>{connecting=false;retry=0;setConnection(true);const saved=hasSession();if(saved){send({type:'resume',...saved});}else if(queued){const q=queued;queued=null;send(q);}});
  socket.addEventListener('message',e=>{
    let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.type==='session'){localStorage.setItem('kvartal.session',JSON.stringify({code:m.code,player:m.player,secret:m.secret}));you=m.player;const u=new URL(location.href);u.searchParams.set('room',m.code);history.replaceState(null,'',u);}
    if(m.type==='state'){
      const first=!game,previousSequence=lastSeq;game=m.game;you=m.you;pending=false;
      if(!first){const events=game.events.filter(e=>e.id>lastSeq);for(const ev of events){if(['roll','purchase','payment','card','win'].includes(ev.kind))audio.play(ev.kind);if(ev.kind==='turn'&&turn())audio.play('turn');}
        const roll=events.find(e=>e.kind==='roll');if(roll){animationUntil=Date.now()+1150+(roll.dice[0]+roll.dice[1])*145;setTimeout(()=>{renderRight();},Math.max(0,animationUntil-Date.now())+50);}
      }lastSeq=game.sequence;
      scene.update(game,first);render();if(!first){for(const ev of game.events.filter(e=>e.id>previousSequence&&e.kind==='payment'&&e.player===you&&e.to)){const recipient=game.players.find(p=>p.id===ev.to)?.name,tileName=BOARD[ev.tile??me().position].name,roomCode=game.code;setTimeout(()=>{if(game?.code===roomCode)toast(`Аренда ${tileName}: −${money(ev.amount)} → ${recipient}${Number.isFinite(ev.before)?` · ${money(ev.before)} → ${money(ev.after)}`:''}`);},Math.max(0,animationUntil-Date.now()));}}if(modal?.type==='trade'&&!game.players.some(p=>p.id===modal.to&&!p.bankrupt)){closeModal();}if(modal?.type==='tradeView'&&modal.id!==game.trade?.id){closeModal();toast('Предложение обмена уже закрыто.');}if(chatOpen)renderChat();
    }
    if(m.type==='messages'){messages=m.messages;unread=m.unread||{};if(chatOpen&&chatPeer){unread[chatPeer]=0;send({type:'read',peer:chatPeer});renderChat();}renderBottom();renderLeft();}
    if(m.type==='read'){unread[m.peer]=0;renderBottom();renderLeft();}
    if(m.type==='message'){if(!messages.some(x=>x.id===m.message.id))messages.push(m.message);const peer=m.message.from===you?m.message.to:m.message.from;
      if(m.message.to===you){audio.play('message');if(!chatOpen||chatPeer!==peer){unread[peer]=(unread[peer]||0)+1;toast(`Личное сообщение: ${game.players.find(p=>p.id===peer)?.name||'игрок'}`);}else send({type:'read',peer});}
      renderBottom();renderLeft();if(chatOpen)renderChat();}
    if(m.type==='reaction')reaction(m.player,m.emoji);
    if(m.type==='left'){localStorage.removeItem('kvartal.session');game=null;you=null;messages=[];selected=null;chatOpen=false;closeModal();$('#chat-root').innerHTML='';history.replaceState(null,'',location.pathname);scene.moves=[];scene.update(preview,true);render();}
    if(m.type==='error'){pending=false;toast(m.message,true);latestError=m.message;if(!game&&hasSession()){localStorage.removeItem('kvartal.session');render();}if(game)renderRight();else renderHomePending(false);}
  });
  socket.addEventListener('close',()=>{connecting=false;pending=false;setConnection(false);if(game||hasSession()){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(8000,1000*2**retry++));}});
  socket.addEventListener('error',()=>{connecting=false;setConnection(false);if(!game){renderHomePending(false);toast('Не удалось подключиться к серверу. Проверьте, что он запущен.',true);}});
}
let queued=null;
function send(message){if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(message));return true;}queued=message;connect();return false;}
function action(type,extra={}){if(pending)return;audio.unlock();audio.play('click');pending=true;send({type:'action',action:{type,...extra}});renderRight();}
function setConnection(ok){const el=$('#connection');el.classList.toggle('offline',!ok);el.innerHTML=`<i></i> ${ok?(game?'В сети':'Готовы к игре'):'Соединение…'}`;}
function render(){
  $('.shell').className=`shell mode-${game?game.status:'home'}`;
  $('#room-header').innerHTML=game?`<button class="room-code" data-cmd="invite" title="Скопировать приглашение"><small>Комната</small><span>${esc(game.code)} ${icon('copy')}</span></button>`:'<span class="header-note">Настольная игра</span>';
  setConnection(socket?.readyState===WebSocket.OPEN);renderLeft();renderRight();renderBottom();renderStageLabel();renderMap();if(modal?.type==='portfolio')portfolio(modal.player,true);
}
function renderStageLabel(){
  $('#stage-label').innerHTML=!game||game.status==='lobby'?'':`<span class="stage-chip"><i></i> ${game.status==='finished'?'Партия окончена':`Круг ${Math.floor((game.turn-1)/game.players.length)+1}${game.settings.maxRounds?' / '+game.settings.maxRounds:''}`} <span>·</span> ${game.players.filter(p=>!p.bankrupt).length} в игре</span>`;
}
function homeLeft(){return `<div class="home-intro"><span class="eyebrow"></span><h1>Монополия<br>в Москве</h1><p>Покупайте районы, стройте здания и договаривайтесь об обменах.</p></div>
  <div class="entry-card"><div class="tabs"><button data-cmd="tabCreate" class="${pageMode==='create'?'active':''}">Создать комнату</button><button data-cmd="tabJoin" class="${pageMode==='join'?'active':''}">По коду</button></div>
    <form id="entry-form"><label class="field-label" for="player-name">Имя</label><input id="player-name" name="name" maxlength="20" placeholder="Твоё имя" value="${esc(rememberedName||localStorage.getItem('kvartal.name')||'')}" autocomplete="nickname" required />
    ${pageMode==='join'?`<label class="field-label" for="room-code-input">КОД КОМНАТЫ</label><input id="room-code-input" name="code" class="code-input" maxlength="6" minlength="6" placeholder="ABC123" value="${esc(urlRoom||'')}" autocomplete="off" required />`:''}
    <label class="field-label">Фишка</label><div class="token-picker">${TOKENS.map(t=>`<button type="button" data-cmd="pickToken" data-token="${t.id}" class="token-option ${chosenToken===t.id?'selected':''}" title="${t.name}" aria-label="Фишка ${t.name}" aria-pressed="${chosenToken===t.id}" style="--player:${t.color}"><span>${tokenArt(t)}</span><small>${t.name}</small></button>`).join('')}</div>
    <button type="submit" class="button primary entry-submit">${pageMode==='join'?'Присоединиться':'Создать комнату'} ${icon('arrow')}</button></form>
    <button class="demo-button" data-cmd="demo">${icon('dice')} Играть с ботами</button>${sessionStorage.getItem('kvartal.return')?'<button class="return-button" data-cmd="returnGame">↩ Вернуться в предыдущую партию</button>':''}
  </div><div class="home-specs"><span><i></i> 2–6 игроков</span><span>Без регистрации</span></div>`;}
function buildingLabel(t){return t.mortgaged?'Залог':t.hotel?'Отель':t.houses?`${t.houses} дом.`:'Без построек';}
function compactPortfolio(groups,player){return groups.length?`<div class="player-assets" aria-label="Собственность ${esc(player.name)} по цветным группам">${groups.map(g=>`<div class="mini-set ${g.complete?'complete-set':''}" style="--district:${g.color}" title="${esc(g.name)}: ${g.tiles.length}/${g.total} · ${g.tiles.map(t=>esc(t.name)).join(', ')}" aria-label="${esc(g.name)}: ${g.tiles.length} из ${g.total}">${g.tiles.map(t=>`<button class="asset-slot ${t.hotel?'hotel-slot':''} ${t.mortgaged?'pledged-slot':''}" data-cmd="portfolioSelect" data-tile="${t.id}" title="${esc(t.name)} · ${buildingLabel(t)}" aria-label="${esc(t.name)}: ${buildingLabel(t)}">${t.hotel?'О':t.houses|| (t.mortgaged?'З':'•')}</button>`).join('')}</div>`).join('')}</div>`:'';}

function renderLeft(){
  if(!game){$('#left-panel').innerHTML=homeLeft();return;}
  const live=game.status==='playing';
  $('#left-panel').innerHTML=`<div class="panel-heading"><span>Игроки <small class="assets-key" title="Цифры — дома, О — отель, З — залог. Наведите на клетку, чтобы увидеть район.">1–4 дома · О отель</small></span><small>${game.players.length} / 6</small></div>
    <div class="players">${game.players.map(p=>{
      const groups=portfolioGroups(game,p.id),totals=portfolioTotals(groups),props=allOwned(p.id);const active=live&&current().id===p.id;
      return `<div class="player-card ${active?'active':''} ${p.bankrupt?'eliminated':''}" style="--player:${tokenOf(p).color}">
        <button class="profile-trigger" data-cmd="playerPortfolio" data-player="${p.id}" aria-label="Портфель игрока ${esc(p.name)}" title="Посмотреть портфель">${badge(p)}</button><div class="player-info"><div class="player-name">${esc(p.name)} ${p.id===you?'<small>ты</small>':''}</div><strong>${money(p.cash)}</strong><div class="player-meta">${game.status==='lobby'?p.bot?'Бот · готов':p.id===game.host?'Хозяин комнаты':p.ready?'✓ Готов к игре':'Ждём готовности':p.bankrupt?'Банкрот':`${props.length} участк. <span>·</span> ${totals.houses} дом.${totals.hotels?` · ${totals.hotels} от.`:''} ${p.jailed?'· ▥':''}`}</div></div>
        <span class="presence ${p.online?'online':''}" title="${p.online?'В сети':'Не в сети'}"></span>
        ${p.id!==you&&!p.bot?`<button class="player-message" data-cmd="chatPeer" data-player="${p.id}" aria-label="Написать ${esc(p.name)}" title="Личное сообщение">✉${unread[p.id]?`<b>${unread[p.id]}</b>`:''}</button>`:''}
        ${p.bot&&you===game.host&&game.status==='lobby'?`<button class="remove-bot" data-cmd="removeBot" data-player="${p.id}" aria-label="Убрать бота">×</button>`:''}
      ${game.status!=='lobby'?compactPortfolio(groups,p):''}</div>`;}).join('')}</div>
    ${game.status==='lobby'&&game.players.length<6?`<div class="empty-seat"><span>+</span> Здесь может быть твой друг</div>${you===game.host?'<button class="button subtle" data-cmd="addBot">+ Добавить бота</button>':''}`:''}
    ${live?`<div class="sidebar-actions"><button class="button subtle" data-cmd="portfolio" aria-label="Моя недвижимость" title="Моя недвижимость"><span class="toolbar-glyph">▦</span><small>Моё · ${allOwned(you).length}</small></button><button class="button subtle" data-cmd="trade" aria-label="Предложить обмен" title="Предложить обмен" ${me().bankrupt?'disabled':''}><span class="toolbar-glyph">⇄</span><small>Обмен</small></button><button class="button subtle" data-cmd="chat" aria-label="Личные сообщения" title="Личные сообщения"><span class="toolbar-glyph">✉</span><small>Чат</small></button></div>`:''}
    <div class="sidebar-foot"><span class="tiny-dot"></span> ${game.status==='lobby'?'Пригласи друзей по ссылке':'Партия сохраняется автоматически'}<button data-cmd="leave" class="text-button">Выйти из комнаты ↗</button></div>`;
}
function disabled(extra=false){return pending||extra?'disabled':'';}
function renderRight(){
  const el=$('#right-panel');
  if(!game){el.innerHTML='';return;}
  if(game.status==='lobby'){
    el.innerHTML=`<div class="panel-heading">Настройки игры</div><div class="lobby-heading"><h2>Новая партия</h2><p>Стартовый капитал — 1 500 ₽. Пригласите игроков или добавьте ботов.</p></div>
    <button class="button primary" data-cmd="invite">Пригласить друзей ${icon('copy')}</button>
    <div class="setting-block"><label for="turn-time">Время на действие</label><select id="turn-time" ${you!==game.host?'disabled':''}><option value="45" ${game.settings.turnSeconds===45?'selected':''}>45 секунд</option><option value="90" ${game.settings.turnSeconds===90?'selected':''}>90 секунд</option><option value="180" ${game.settings.turnSeconds===180?'selected':''}>3 минуты</option><option value="0" ${game.settings.turnSeconds===0?'selected':''}>Без таймера</option></select><label for="max-rounds">Длительность</label><select id="max-rounds" ${you!==game.host?'disabled':''}>${[[0,'До последнего игрока'],[15,'15 кругов · быстрая партия'],[25,'25 кругов'],[40,'40 кругов']].map(([v,t])=>`<option value="${v}" ${game.settings.maxRounds===v?'selected':''}>${t}</option>`).join('')}</select></div>
    <label class="field-label">Фишка</label><div class="token-picker compact">${TOKENS.map(t=>{const taken=game.players.some(p=>p.token===t.id&&p.id!==you);return `<button class="token-option ${me().token===t.id?'selected':''}" data-cmd="changeToken" data-token="${t.id}" style="--player:${t.color}" ${taken?'disabled':''} aria-label="Фишка ${t.name}" title="${t.name}"><span>${tokenArt(t)}</span></button>`;}).join('')}</div>
    <div class="lobby-start">${you===game.host?`<button class="button primary" data-cmd="start" ${disabled(game.players.length<2)}>Начать игру ${icon('arrow')}</button><small>${game.players.length<2?'Для начала нужны хотя бы два игрока.':'Все приглашённые должны нажать «Я готов». '}</small>`:`<button class="button ${me().ready?'subtle':'primary'}" data-cmd="ready">${me().ready?'✓ Я готов · отменить':'Я готов к игре'}</button>`}</div>`;return;
  }
  if(game.status==='finished'){
    const winner=game.players.find(p=>p.id===game.winner);el.innerHTML=`<div class="panel-heading">Игра окончена</div><div class="winner-hero">${badge(winner,'large')}<span class="eyebrow">ВЛАДЕЛЕЦ ГОРОДА</span><h2>${esc(winner?.name||'Город')}</h2><p>${money(netWorth(winner))} капитал</p></div><div class="standings">${[...game.players].sort((a,b)=>netWorth(b)-netWorth(a)).map((p,i)=>`<div><span>${i+1}. ${esc(p.name)}</span><strong>${money(netWorth(p))}</strong></div>`).join('')}</div><button class="button primary" data-cmd="newGame">Новая партия ${icon('arrow')}</button><button class="button subtle" data-cmd="chat">Открыть личные чаты</button>`;return;
  }
  if(selected!==null){el.innerHTML=propertyDetails(selected);return;}
  const p=current(),mine=turn(),tile=BOARD[p.position],v=game.properties[tile.id],animating=Date.now()<animationUntil;
  let content='';
  if(game.phase==='auction'){
    const a=game.auction,actor=game.players.find(p=>p.id===a.actor),t=BOARD[a.tile];content=`<span class="action-kicker">АУКЦИОН</span><h2>${a.source==='building'?a.building==='hotel'?'Последний отель':'Последний дом':esc(t.name)}</h2><div class="auction-price">${money(a.bid)}<small>${a.highest?'Лидер: '+esc(game.players.find(p=>p.id===a.highest).name):'Первую ставку делаешь ты?'}</small></div><div class="auction-actor">${badge(actor,'small')} Ставка: ${esc(actor.name)}</div>${a.actor===you?`${a.source==='building'?`<label class="field-label" for="build-target">Участок для здания</label><select id="build-target">${(a.buildOptions?.[you]||[]).map(id=>`<option value="${id}">${esc(BOARD[id].name)}</option>`).join('')}</select>`:''}<div class="bid-input"><label for="bid-amount">Твоя ставка</label><input id="bid-amount" type="number" min="${a.bid+1}" step="1" max="${me().cash}" value="${a.bid+1}"></div><button class="button primary" data-cmd="bid" ${disabled(me().cash<a.bid+1)}>Повысить ставку ↗</button><button class="button subtle" data-cmd="pass" ${disabled()}>Пас — выйти из торгов</button>`:'<p class="muted">Подождём его решения.</p>'}`;
  }else if(game.phase==='inheritance'){
    const t=BOARD[game.inheritance.tiles[0]];content=`<span class="action-kicker">Получение заложенного участка</span>${deedTitle(t)}${propertyArt(t)}<p class="muted">${mine?'Выберите, погасить ли залог сейчас.':'Владелец выбирает условия получения.'} Осталось участков: ${game.inheritance.tiles.length}.</p>${mine?`<button class="button primary" data-cmd="inherit" data-tile="${t.id}" data-redeem="true" ${disabled()}>Выкупить · ${money(Math.ceil(t.price*55/100))}</button><button class="button subtle" data-cmd="inherit" data-tile="${t.id}" data-redeem="false" ${disabled()}>Оставить залог · ${money(Math.ceil(t.price*5/100))}</button>`:''}`;
  }else if(game.phase==='debt'){
    const d=game.debt;content=`<span class="action-kicker danger">НУЖНО РЕШИТЬ</span><h2>Нужен платёж</h2><p class="debt-value">${money(d.amount)}</p><p class="muted">${mine?`Не хватает ${money(Math.max(0,d.amount-p.cash))}. Продай здания, заложи участок или договорись об обмене.`:`${esc(p.name)} ищет средства для платежа.`}</p>${mine?`<button class="button primary" data-cmd="portfolio">Управлять недвижимостью</button><button class="button subtle" data-cmd="trade">⇄ Предложить обмен</button><button class="text-button danger" data-cmd="bankrupt">Объявить банкротство</button>`:''}`;
  }else if(game.phase==='buy'){
    content=`<span class="action-kicker">${mine?'Участок свободен':'ВЫБИРАЕТ НЕДВИЖИМОСТЬ'}</span>${deedTitle(tile)}${propertyArt(tile)}${landmarkCaption(tile)}<div class="purchase-price">${money(tile.price)}</div><p class="district-name"><i style="background:${GROUPS[tile.group]?.color||'#86b7cf'}"></i>${GROUPS[tile.group]?.name|| (tile.type==='station'?'Метро Москвы':'Коммунальные службы')}</p>${mine?`<button class="button primary" data-cmd="buy" ${disabled(p.cash<tile.price||animating)}>Купить участок ${icon('arrow')}</button><button class="button subtle" data-cmd="auction" ${disabled(animating)}>Выставить на аукцион</button>${p.cash<tile.price?'<small class="muted">Не хватает денег. Можно заложить собственность.</small>':''}`:`<p class="muted">${esc(p.name)} решает: купить или начать аукцион.</p>`}<button class="text-button" data-cmd="select" data-tile="${tile.id}">Посмотреть аренду ↗</button>`;
  }else if(game.phase==='roll'){
    content=`<span class="action-kicker">${p.jailed?'В ТЮРЬМЕ':mine?'Бросок кубиков':'Ожидание хода'}</span><div class="turn-portrait" style="--player:${tokenOf(p).color}">${tokenArt(tokenOf(p))}<span>✦</span></div><h2>${mine?(p.jailed?'Пора на свободу.':'Ваш ход'):`Ходит<br>${esc(p.name)}.`}</h2><p class="muted">${p.jailed?`Дубль освободит тебя. Попытка ${p.jail+1} из 3. После третьей — сбор 50 ₽.`:mine?'Бросьте кубики, чтобы переместить фишку.':'Можно обсудить следующую сделку в личном чате.'}</p>${mine?`<button class="button primary roll-button" data-cmd="roll" ${disabled(animating)}>${icon('dice')} Бросить кубики <kbd>R</kbd></button>${p.jailed?`<button class="button subtle" data-cmd="bail" ${disabled()}>Выйти за 50 ₽</button>${p.freeCards?'<button class="button subtle" data-cmd="freeCard">Использовать карту выхода</button>':''}`:''}`:''}`;
  }else{
    content=`<span class="action-kicker">${mine?'Результат хода':'ХОД ПРОДОЛЖАЕТСЯ'}</span><div class="dice-summary"><span>${['','⚀','⚁','⚂','⚃','⚄','⚅'][game.dice[0]]}</span><span>${['','⚀','⚁','⚂','⚃','⚄','⚅'][game.dice[1]]}</span><small>${game.dice[0]+game.dice[1]} КЛЕТОК</small></div><h2>${esc(tile.name)}</h2>${v?`<p class="muted">${v.owner===you?'Твоя территория.':'Владелец: '+esc(game.players.find(p=>p.id===v.owner)?.name)}</p>`:'<p class="muted">Можно завершить ход или управлять недвижимостью.</p>'}${game.lastCard?`<div class="event-card"><span>✦ ${game.lastCard.type==='chance'?'МОСКОВСКИЙ СЛУЧАЙ':'СОСЕДСКИЙ ЧАТ'}</span><p>${esc(game.lastCard.text)}</p></div>`:''}${mine?`<button class="button primary" data-cmd="end" ${disabled(animating)}>${game.doubles&&!p.jailed?'Дубль — продолжить ход':'Передать ход'} ${icon('arrow')}</button><button class="button subtle" data-cmd="portfolio">Застроить свой район</button>`:''}`;
  }
  const turnStart=[...game.events].reverse().find(e=>e.kind==='turn');
  const lastRoll=[...game.events].reverse().find(e=>e.kind==='roll'&&e.player===p.id&&e.id>(turnStart?.id||0));
  const payments=lastRoll?game.events.filter(e=>e.kind==='payment'&&e.player===p.id&&e.to&&e.id>lastRoll.id):[];
  const paymentHTML=payments.map(e=>{const bonus=game.events.filter(x=>x.kind==='bonus'&&x.player===p.id&&x.id>lastRoll.id&&x.id<e.id).reduce((n,x)=>n+x.amount,0);return `<div class="payment-summary"><span>Аренда · ${esc(BOARD[e.tile??p.position].name)}</span><strong>−${money(e.amount)} → ${esc(game.players.find(x=>x.id===e.to)?.name)}</strong>${Number.isFinite(lastRoll.balanceBefore)?`<small>До броска: ${money(lastRoll.balanceBefore)}${bonus?` · Старт +${money(bonus)}`:''}</small>`:''}${Number.isFinite(e.before)?`<small>Баланс: ${money(e.before)} → ${money(e.after)}</small>`:''}</div>`;}).join('');
  const displayPlayer=game.auction?game.players.find(x=>x.id===game.auction.actor):p;
  el.innerHTML=`<div class="panel-heading"><span>${displayPlayer.id===you?'Ваш ход':'СЕЙЧАС ИГРАЕТ'}</span><span id="turn-timer" class="turn-timer"></span></div><div class="current-strip" style="--player:${tokenOf(p).color}">${badge(displayPlayer,'small')}<strong>${esc(displayPlayer.name)}</strong><span>${money(displayPlayer.cash)}</span></div><div class="action-content">${paymentHTML}${content}</div>${game.trade?`<button class="trade-notice" data-cmd="tradeView">⇄ ${game.trade.to===you?'Тебе предлагают обмен':'Предложение отправлено'} <span>↗</span></button>`:''}`;
}
function propertyDetails(id){
  const t=BOARD[id],v=game.properties[id],owner=game.players.find(p=>p.id===v?.owner),mine=v?.owner===you,group=GROUPS[t.group];
  return `<div class="panel-heading"><span>Участок ${id+1} из 40</span><button class="close-small" data-cmd="closeProperty" aria-label="Вернуться к ходу">×</button></div>${deedTitle(t)}${propertyArt(t)}${landmarkCaption(t)}<p class="district-name"><i style="background:${group?.color||'#83a8ba'}"></i>${group?.name||(t.type==='station'?'Метро Москвы':'Особая остановка')}</p>
    ${t.group?`<div class="district-members"><small>Группа: ${BOARD.filter(x=>x.group===t.group).length} района</small><p>${BOARD.filter(x=>x.group===t.group).map(x=>`<span class="${x.id===t.id?'here':''}">${esc(x.name)}</span>`).join('')}</p></div>`:''}${t.price?`<div class="detail-price"><span>Стоимость</span><strong>${money(t.price)}</strong></div><div class="owner-line">Владелец <strong>${owner?esc(owner.name):'Можно купить'}</strong></div>${v?.mortgaged?'<div class="notice">Участок в залоге. Аренда не взимается.</div>':''}${t.rent?`<div class="rent-table"><span class="field-label">Аренда</span>${t.rent.map((r,i)=>`<div class="${v?.houses===i?'current-rent':''}"><span>${['Без построек','1 дом','2 дома','3 дома','4 дома','Отель'][i]}</span><strong>${money(r)}</strong></div>`).join('')}<small>Вся цветная группа без зданий: двойная аренда.</small></div>`:`<p class="muted">${t.type==='station'?'Аренда: 25 / 50 / 100 / 200 ₽ за 1 / 2 / 3 / 4 станции.':'Аренда: сумма кубиков ×4. Если обе службы у одного владельца — ×10.'}</p>`}
    ${mine&&game.status==='playing'?`<div class="asset-buttons">${group?`<button class="button primary" data-cmd="build" data-tile="${id}" ${disabled()}>${v.houses===4?'Построить отель':'Построить дом'} · ${money(group.build)}</button>${v.houses?`<button class="button subtle" data-cmd="sell" data-tile="${id}" ${disabled()}>Продать здание · ${money(group.build/2)}</button>`:''}`:''}${v.houses?`<button class="button subtle" data-cmd="sellGroup" data-tile="${id}">Продать все здания группы</button>`:''}<button class="button subtle" data-cmd="mortgage" data-tile="${id}" ${disabled()}>${v.mortgaged?'Выкупить · '+money(Math.ceil(t.price*55/100)):'Заложить · +'+money(t.price/2)}</button></div>`:''}`:`<p class="muted">${t.story||{start:'За каждый проход старта — 200 ₽.',chance:'Случайное событие: деньги, путешествие или неожиданный поворот.',community:'Город умеет удивлять. Вытяни карту.',jail:'Просто проходишь мимо? Всё хорошо. Заключённым нужен дубль, карта выхода или 50 ₽.',goJail:'Прямо в тюрьму, без премии за старт.',parking:'Передышка. Никаких платежей.',tax:`Заплати городской сбор: ${money(t.amount)}.`}[t.type]||''}</p>`}<button class="button subtle" data-cmd="closeProperty">← Вернуться к ходу</button>`;
}
function tileSymbol(t){return ({chance:'?',community:'✦',tax:'₽',start:'↗',jail:'▥',goJail:'↪',parking:'P',station:'↔',utility:'ϟ'})[t.type]||'◆';}
function netWorth(p){return p?p.cash+allOwned(p.id).reduce((s,t)=>s+t.price*(game.properties[t.id].mortgaged?.5:1)+(game.properties[t.id].houses||0)*(GROUPS[t.group]?.build||0)/2,0):0;}
function renderBottom(){
  $('#bottom-bar').innerHTML=!game?`<div class="bottom-note"> 2–6 игроков. Комнаты, обмены и личные сообщения.</div><button class="text-button" data-cmd="rules">Как играть ${icon('arrow')}</button>`:`<div class="feed-title"><i></i> Ходы</div><div class="event-feed">${game.events.slice(-3).reverse().map(e=>`<div class="feed-item"><span>${{purchase:'↗',roll:'⚄',payment:'₽',card:'✦',trade:'⇄',build:'⌂',join:'+'}[e.kind]||'·'}</span>${esc(e.text)}</div>`).join('')}</div><div class="footer-tools"><button class="icon-button" data-cmd="history" aria-label="Вся история" title="История партии">☷</button><button class="chat-toggle" data-cmd="chat" title="Личные сообщения">✉ ${Object.values(unread).reduce((a,b)=>a+b,0)?`<b>${Object.values(unread).reduce((a,b)=>a+b,0)}</b>`:''}</button><div class="reaction-picker">${['🔥','😂','💸','😈','🤝','😭'].map(e=>`<button data-cmd="react" data-emoji="${e}" aria-label="Реакция ${e}">${e}</button>`).join('')}</div></div>`;
}
function renderMap(){if(!$('#scene').classList.contains('no-webgl')||!game){$('#map-fallback').innerHTML='';return;}$('#map-fallback').innerHTML=`<div class="flat-map">${BOARD.map(t=>`<button data-cmd="select" data-tile="${t.id}" style="--district:${GROUPS[t.group]?.color||'#8098ac'}"><small>${t.id+1}</small>${esc(t.name)}<span>${game.players.filter(p=>p.position===t.id&&!p.bankrupt).map(p=>tokenOf(p).icon).join('')}</span></button>`).join('')}</div>`;}
function reaction(id,emoji){const layer=$('#reactions-layer'),el=document.createElement('div');el.className='floating-reaction';const p=game?.players.find(p=>p.id===id);el.innerHTML=`<span>${emoji}</span><small>${esc(p?.name||'')}</small>`;el.style.left=`${25+Math.random()*50}%`;layer.append(el);setTimeout(()=>el.remove(),2600);}
function renderHomePending(value){const b=$('.entry-submit');if(b){b.disabled=value;b.textContent=value?'Открываем город…':pageMode==='join'?'Присоединиться →':'Создать комнату →';}}
function enter(demo=false){const name=($('#player-name')?.value||localStorage.getItem('kvartal.name')||'').trim();if(!name){$('#player-name')?.focus();toast('Как тебя называть?',true);return;}audio.unlock();localStorage.setItem('kvartal.name',name);localStorage.setItem('kvartal.token',chosenToken);localStorage.removeItem('kvartal.session');renderHomePending(true);send({type:demo||pageMode==='create'?'create':'join',name,token:chosenToken,demo,code:$('#room-code-input')?.value.trim().toUpperCase()});}
async function copyInvite(){const link=new URL(location.href);link.searchParams.set('room',game.code);try{await navigator.clipboard.writeText(link.href);toast('Приглашение скопировано. Отправь друзьям.');}catch{modal={type:'invite'};showModal(`<span class="eyebrow">ПРИГЛАСИ СВОИХ</span><h2>Комната ${esc(game.code)}</h2><input value="${esc(link.href)}" readonly onclick="this.select()"><p class="muted">Скопируйте ссылку и отправьте друзьям.</p>`);}}
function showModal(html,wide=false,focus=true){$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${modal?.type==='rules'?'Правила игры':'Окно игры'}"><button class="modal-close" data-cmd="closeModal" aria-label="Закрыть">×</button>${html}</section></div>`;if(focus)setTimeout(()=>$('.modal button:not(.modal-close),.modal input')?.focus(),30);}
function closeModal(){modal=null;$('#modal-root').innerHTML='';}
function rules(){modal={type:'rules'};showModal(`<span class="eyebrow">ПРАВИЛА НОЧНОГО ГОРОДА</span><h2>Улицы. Сделки.<br>Большие планы.</h2><div class="rules-grid"><article><b>01 / ЗАБИРАЙ</b><p>Бросай два кубика. Попал на свободный участок — купи его или начни аукцион. Каждый проход старта приносит 200 ₽.</p></article><article><b>02 / ЗАСТРАИВАЙ</b><p>Собери всю цветную группу районов. На Востоке их четыре. Аренда пустых участков удвоится. Строй равномерно: до 4 уровней, затем отель. У каждого участка своя миниатюра здания. В банке 32 дома и 12 отелей. Последнее здание при нескольких претендентах продаётся на аукционе. Если для размена отеля не хватает домов, можно продать все здания группы.</p></article><article><b>03 / ДОГОВАРИВАЙСЯ</b><p>Предлагай обмен в любой ход: участки, деньги, карты выхода и личное сообщение. Второй игрок должен принять условия. Перед передачей участка нужно продать здания его группы. Залоги передаются с оплатой процентов.</p></article><article><b>04 / ПЛАТИ</b><p>На чужой собственности заплати аренду. Не хватает? Продавай здания за половину цены, закладывай участки за 50% цены или обменяйся. Выкуп залога стоит 55% цены участка.</p></article><article><b>05 / ВЫХОДИ НА СВОБОДУ</b><p>Три дубля подряд отправят в тюрьму. Выйти можно за 50 ₽, по карте или выбросив дубль. После третьего неудачного броска сбор обязателен.</p></article><article><b>06 / ЗАБИРАЙ ГОРОД</b><p>Последний платёжеспособный игрок побеждает. В партии с лимитом кругов победит наибольший капитал: деньги + участки с учётом залогов + половина цены зданий.</p></article></div><p class="muted">Таймер отсчитывается на каждое решение. По истечении сервер выбирает действие автоматически. Если все отключатся, автоматические действия приостановятся до возвращения. Кнопка R — бросить кубики. Камеру можно вращать и приближать.</p>`,true);}
function portfolio(player=you,refresh=false){
  const p=game.players.find(p=>p.id===player);if(!p)return;
  const groups=portfolioGroups(game,player),totals=portfolioTotals(groups),oldScroll=refresh?$('.modal')?.scrollTop||0:0;
  const focused=refresh&&$('.modal')?.contains(document.activeElement)?{cmd:document.activeElement.dataset.cmd,tile:document.activeElement.dataset.tile}:null;
  modal={type:'portfolio',player};
  const rentLabel=t=>t.mortgaged?'Аренда не взимается':t.type==='utility'?`Кубики ×${allOwned(player).filter(x=>x.type==='utility').length===2?10:4}`:Number.isFinite(t.rent)?`${money(t.rent)} аренда`:'';
  showModal(`<div class="profile-heading">${badge(p,'large')}<div><h2>${esc(p.name)}${player===you?' <small>ты</small>':''}</h2><p>${p.bankrupt?'Выбыл из игры':p.jailed?'В тюрьме':`На клетке «${esc(BOARD[p.position].name)}»`}</p></div></div>
  <div class="profile-stats"><div><strong>${money(p.cash)}</strong><span>Деньги</span></div><div><strong>${money(netWorth(p))}</strong><span>Капитал</span></div><div><strong>${totals.houses} / ${totals.hotels}</strong><span>Дома / отели</span></div><div><strong>${totals.properties} / ${totals.mortgages}</strong><span>Участки / залоги</span></div></div>
  <div class="profile-legend"><span>⌂ — число домов</span><span>Отель — вместо четырёх домов</span><span>З — участок в залоге</span></div>
  ${groups.length?`<div class="profile-groups">${groups.map(g=>`<section class="profile-group" style="--district:${g.color}"><h3><i></i>${esc(g.name)}<small>${g.tiles.length} из ${g.total}${g.complete?' · полный набор':''}</small></h3>${g.tiles.map(t=>`<button class="profile-property ${t.mortgaged?'mortgaged':''}" data-cmd="portfolioSelect" data-tile="${t.id}"><span class="profile-property-name"><strong>${esc(t.name)}</strong><small>${esc(t.landmarkName||'')}</small></span><span class="profile-building ${t.hotel?'has-hotel':''}">${t.houses?`⌂ ${t.houses}`:buildingLabel(t)}</span><span class="profile-property-rent">${rentLabel(t)}</span><span aria-hidden="true">↗</span></button>`).join('')}</section>`).join('')}</div>`:'<p class="profile-empty">У игрока пока нет недвижимости.</p>'}
  <div class="profile-footer"><span>Карт выхода из тюрьмы: ${p.freeCards}. В банке: дома — ${game.bankStock?.houses??32}, отели — ${game.bankStock?.hotels??12}.</span>${player!==you&&!p.bankrupt&&game.status==='playing'?`<div class="profile-actions">${!p.bot?`<button class="button subtle" data-cmd="tradeChat" data-player="${p.id}">Личное сообщение</button>`:''}<button class="button primary" data-cmd="chatTrade" data-player="${p.id}">Предложить обмен</button></div>`:''}</div>`,true,!refresh);
  if(refresh&&$('.modal')){$('.modal').scrollTop=oldScroll;if(focused?.cmd)$(`.modal [data-cmd="${focused.cmd}"]${focused.tile?`[data-tile="${focused.tile}"]`:''}`)?.focus({preventScroll:true});}
}

function locationRow(t){
  const v=game?.properties[t.id],owner=game?.players.find(p=>p.id===v?.owner);
  return `<button class="location-row" data-cmd="portfolioSelect" data-tile="${t.id}" style="--district:${GROUPS[t.group]?.color||t.lineColor||'#8098ac'}"><span class="location-number">${String(t.id+1).padStart(2,'0')}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.landmarkName||t.story||'Московское событие')}${owner?' · '+esc(owner.name):''}</small></span><b>${t.price?money(t.price):t.landmark?'↗':tileSymbol(t)}</b></button>`;
}
function boardList(){
  modal={type:'boardList'};
  showModal(`<span class="eyebrow">22 РАЙОНА · 4 СТАНЦИИ · ОДИН ПОВОРОТ ЗА МКАД</span><h2>Своя карта Москвы.</h2><div class="district-catalog">${Object.entries(GROUPS).map(([id,g])=>`<section class="catalog-group" style="--district:${g.color}"><h3><i></i>${g.name}<small>${BOARD.filter(t=>t.group===id).length} района</small></h3>${BOARD.filter(t=>t.group===id).map(locationRow).join('')}</section>`).join('')}<section class="catalog-group"><h3>МЕТРО МОСКВЫ</h3>${BOARD.filter(t=>t.type==='station').map(locationRow).join('')}</section><section class="catalog-group bonus-group"><h3>ВНЕ МКАДА</h3>${locationRow(BOARD[20])}<p>Петронасы и свободная остановка.<br>Иногда из Москвы нужно выехать чуть дальше.</p></section><section class="catalog-group"><h3>ГОРОДСКИЕ СЛУЖБЫ</h3>${BOARD.filter(t=>t.type==='utility').map(locationRow).join('')}</section><section class="catalog-group civic-group"><h3>ГОРОДСКИЕ КЛЕТКИ</h3>${BOARD.filter(t=>!t.price&&!t.landmark).map(locationRow).join('')}</section></div>`,true);
}
function previewLocation(id){
  const t=BOARD[id];scene.select(id);modal={type:'location'};
  showModal(`<span class="eyebrow">${GROUPS[t.group]?.name|| (t.line?'МЕТРО МОСКВЫ':t.tag||'МОСКВА')}</span>${propertyArt(t)}${landmarkCaption(t)}<h2>${esc(t.name)}</h2><p class="location-story">${esc(t.story|| (t.type==='tax'?'Городской платёж.':t.type==='jail'?'Просто в гостях — или ждёшь выхода.':'Московская остановка в вашей партии.'))}</p>${t.group?`<div class="district-members"><small>В ОДНОЙ ЦВЕТНОЙ ГРУППЕ</small><p>${BOARD.filter(x=>x.group===t.group).map(x=>`<span class="${x.id===id?'here':''}">${esc(x.name)}</span>`).join('')}</p></div>`:''}${t.price?`<div class="detail-price"><span>Игровая стоимость</span><strong>${money(t.price)}</strong></div>`:''}<button class="button subtle" data-cmd="boardList">← Вернуться к карте</button>`);
}

function tradeForm(to=null){
  if(game.status!=='playing'||me().bankrupt){toast('Обмен сейчас недоступен.',true);return;}
  if(game.trade){viewTrade();return;}
  const peers=game.players.filter(p=>p.id!==you&&!p.bankrupt);if(!peers.length)return;
  to=to||peers[0].id;modal={type:'trade',to};const other=game.players.find(p=>p.id===to);
  const tradeAssets=id=>allOwned(id).filter(t=>(!t.group||!BOARD.some(x=>x.group===t.group&&game.properties[x.id]?.houses>0)));
  const items=(id,name)=>{const assets=tradeAssets(id);return assets.length?assets.map(t=>`<label class="trade-asset" style="--district:${GROUPS[t.group]?.color||'#8098ac'}"><input type="checkbox" name="${name}" value="${t.id}"><span>${esc(t.name)}</span><small>${money(t.price)}${game.properties[t.id].mortgaged?' · залог':''}</small></label>${name==='ask'&&game.properties[t.id].mortgaged?`<label class="redeem-choice"><input type="checkbox" name="unmortgageAsk" value="${t.id}">Сразу выкупить · ${money(Math.ceil(t.price*55/100))}</label>`:''}`).join(''):'<p class="muted">Нет доступных участков.</p>';};
  showModal(`<span class="eyebrow">Обмен</span><h2>Предложить обмен</h2><form id="trade-form"><label class="field-label" for="trade-to">КОМУ ПРЕДЛОЖИТЬ</label><select id="trade-to" name="to">${peers.map(p=>`<option value="${p.id}" ${p.id===to?'selected':''}>${esc(p.name)}${p.bot?' · бот':''}</option>`).join('')}</select><div class="trade-columns"><section><h3>Ты отдаёшь</h3><div class="trade-assets">${items(you,'offer')}</div><label class="field-label" for="offer-cash">ДЕНЬГИ · ДО ${money(me().cash)}</label><input id="offer-cash" type="number" name="offerCash" min="0" max="${me().cash}" value="0" required><label class="field-label" for="offer-cards">Карты выхода из тюрьмы</label><input id="offer-cards" name="offerCards" type="number" min="0" max="${me().freeCards}" value="0"></section><section><h3>Ты получаешь</h3><div class="trade-assets">${items(to,'ask')}</div><label class="field-label" for="ask-cash">ДЕНЬГИ · ДО ${money(other.cash)}</label><input id="ask-cash" type="number" name="askCash" min="0" max="${other.cash}" value="0" required><label class="field-label" for="ask-cards">Карты выхода из тюрьмы</label><input id="ask-cards" name="askCards" type="number" min="0" max="${other.freeCards}" value="0"></section></div><p class="muted small">За полученный залог банк берёт 10% от суммы залога. Можно сразу выкупить его, доплатив основную сумму.</p><label class="field-label" for="trade-message">Сообщение к предложению</label><textarea id="trade-message" name="message" maxlength="500" placeholder="Например: тебе до полного района одна улица. Забирай её, а мне — набережную." rows="3"></textarea><p class="muted small">Условия и сообщение видны только вам двоим. Обмен состоится после принятия.</p><button class="button primary" type="submit">Отправить предложение ${icon('arrow')}</button></form>`,true);
}
function tradeSummary(tr){const names=ids=>ids.map(i=>`<span class="trade-property"><i style="background:${GROUPS[BOARD[i].group]?.color||'#83a8ba'}"></i>${esc(BOARD[i].name)}</span>`).join('');return `<div class="trade-columns summary"><section><h4>ОТДАЁТ ${esc(game.players.find(p=>p.id===tr.from)?.name)}</h4>${names(tr.offer)}<strong>${money(tr.offerCash)}</strong>${tr.offerCards?`<small>Карт выхода: ${tr.offerCards}</small>`:''}</section><section><h4>ОТДАЁТ ${esc(game.players.find(p=>p.id===tr.to)?.name)}</h4>${names(tr.ask)}<strong>${money(tr.askCash)}</strong>${tr.askCards?`<small>Карт выхода: ${tr.askCards}</small>`:''}</section></div>`;}
function viewTrade(){const tr=game.trade;if(!tr){toast('Предложение уже закрыто.');return;}modal={type:'tradeView',id:tr.id};showModal(`<span class="eyebrow">${tr.to===you?'ТЕБЕ ПРЕДЛАГАЮТ ОБМЕН':'ТВОЁ ПРЕДЛОЖЕНИЕ'}</span><h2>Хорошая сделка?</h2>${tradeSummary(tr)}${tr.message?`<blockquote>${esc(tr.message)}</blockquote>`:''}${tr.to===you?tr.offer.filter(i=>game.properties[i]?.mortgaged).map(i=>`<label class="redeem-choice"><input type="checkbox" name="unmortgageOffer" value="${i}">Выкупить ${esc(BOARD[i].name)} сейчас · ${money(Math.ceil(BOARD[i].price*55/100))}. Без выкупа: проценты ${money(Math.ceil(BOARD[i].price*5/100))}.</label>`).join(''):''}<div class="modal-actions">${tr.to===you?`<button class="button primary" data-cmd="acceptTrade" data-trade-id="${tr.id}">Принять обмен 🤝</button>`:''}<button class="button subtle" data-cmd="rejectTrade" data-trade-id="${tr.id}">${tr.to===you?'Отклонить':'Отозвать предложение'}</button><button class="button subtle" data-cmd="tradeChat" data-player="${tr.from===you?tr.to:tr.from}">Обсудить лично ↗</button></div>`,true);}
function openChat(peer=null){if(!game)return;const input=$('#dm-text');if(input?.dataset.peer)chatDrafts[input.dataset.peer]=input.value;chatOpen=true;const peers=game.players.filter(p=>p.id!==you&&!p.bot);chatPeer=peer||chatPeer||peers[0]?.id||null;unread[chatPeer]=0;if(chatPeer)send({type:'read',peer:chatPeer});renderChat();renderBottom();renderLeft();}
function renderChat(){
  if(!chatOpen||!game){$('#chat-root').innerHTML='';return;}
  const existing=$('#dm-text');if(existing?.dataset.peer)chatDrafts[existing.dataset.peer]=existing.value;
  const previous=chatDrafts[chatPeer]||'',focused=document.activeElement?.id==='dm-text';
  const oldMessages=$('.chat-messages'),oldScroll=oldMessages?.scrollTop||0,atBottom=!oldMessages||oldMessages.scrollHeight-oldMessages.clientHeight-oldScroll<50;
  const peers=game.players.filter(p=>p.id!==you&&!p.bot),peer=game.players.find(p=>p.id===chatPeer&&!p.bot);
  if(!peer&&peers.length)chatPeer=peers[0].id;
  const other=game.players.find(p=>p.id===chatPeer),history=messages.filter(m=>(m.from===you&&m.to===chatPeer)||(m.to===you&&m.from===chatPeer));
  $('#chat-root').innerHTML=`<section class="chat-panel" role="dialog" aria-label="Личные сообщения"><div class="chat-heading"><div><span class="eyebrow">ТОЛЬКО МЕЖДУ ВАМИ</span><h3>Личные сообщения</h3></div><button class="icon-button" data-cmd="closeChat" aria-label="Закрыть сообщения">×</button></div><div class="chat-tabs">${peers.map(p=>`<button data-cmd="chatPeer" data-player="${p.id}" class="${chatPeer===p.id?'active':''}">${badge(p,'small')}<span>${esc(p.name)}</span>${unread[p.id]?`<b>${unread[p.id]}</b>`:''}</button>`).join('')}</div>${!peers.length?'<div class="empty-state">Здесь будут личные чаты с друзьями.<br>Боты не читают сообщения.</div>':`<div class="chat-person"><i class="presence ${other?.online?'online':''}"></i>${esc(other?.name)}<span>${other?.online?'В сети':'Прочитает после возвращения'}</span>${game.status==='playing'?`<button class="text-button" data-cmd="chatTrade" data-player="${chatPeer}">⇄ Обмен</button>`:''}</div><div class="chat-messages" role="log" aria-live="polite">${history.length?history.map(m=>`<article class="chat-message ${m.from===you?'outgoing':''} ${m.kind==='trade'?'with-trade':''}"><small>${m.from===you?'Ты':esc(other?.name)} · ${new Date(m.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small><p>${esc(m.text)}</p>${m.kind==='trade'?`${tradeSummary(m.trade)}${game.trade?.id===m.trade.id?`<button class="button subtle" data-cmd="tradeView">Посмотреть предложение ↗</button>`:'<span class="chat-deal-closed">Предложение закрыто</span>'}`:''}</article>`).join(''):'<div class="chat-empty">Любая хорошая сделка<br>начинается с разговора.<span>Переписка доступна только вам двоим.</span></div>'}</div><form id="dm-form"><label class="sr-only" for="dm-text">Личное сообщение</label><textarea id="dm-text" data-peer="${chatPeer}" name="text" rows="2" maxlength="1000" placeholder="Давай договоримся…" required>${esc(previous)}</textarea><button class="send-message" type="submit" aria-label="Отправить сообщение">↗</button></form><div class="chat-footnote">Enter — отправить · Shift+Enter — новая строка</div>`}</section>`;
  const body=$('.chat-messages');if(body)body.scrollTop=atBottom||existing?.dataset.peer!==chatPeer?body.scrollHeight:oldScroll;if(focused){$('#dm-text')?.focus();$('#dm-text')?.setSelectionRange(previous.length,previous.length);}
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-cmd]');if(!b||b.disabled)return;const cmd=b.dataset.cmd;audio.unlock();
  const map={roll:'roll',buy:'buy',auction:'auction',end:'end',bail:'bail',freeCard:'freeCard',pass:'pass',ready:'ready',start:'start',addBot:'addBot'};
  if(map[cmd]){selected=null;action(map[cmd]);return;}
  if(cmd==='sound'){const enabled=audio.toggle();b.classList.toggle('muted',!enabled);b.title=enabled?'Выключить звук':'Включить звук';toast(enabled?'Звук включён':'Звук выключен');}
  if(cmd==='rules')rules();
  if(cmd==='tabCreate'||cmd==='tabJoin'){const name=$('#player-name')?.value;if(name)localStorage.setItem('kvartal.name',name);pageMode=cmd==='tabCreate'?'create':'join';renderLeft();}
  if(cmd==='pickToken'){chosenToken=b.dataset.token;document.querySelectorAll('.token-option').forEach(x=>{x.classList.toggle('selected',x.dataset.token===chosenToken);x.setAttribute('aria-pressed',x.dataset.token===chosenToken);});}
  if(cmd==='changeToken')action('token',{token:b.dataset.token});
  if(cmd==='demo')enter(true);
  if(cmd==='returnGame'){try{const saved=JSON.parse(sessionStorage.getItem('kvartal.return'));localStorage.setItem('kvartal.session',JSON.stringify(saved));send({type:'resume',...saved});sessionStorage.removeItem('kvartal.return');}catch{toast('Сохранённый вход не найден.',true);}}
  if(cmd==='invite')copyInvite();
  if(cmd==='cameraHome')scene.home();if(cmd==='cameraTop')scene.top();if(cmd==='zoomIn')scene.zoom(.85);if(cmd==='zoomOut')scene.zoom(1.15);
  if(cmd==='removeBot')action('removeBot',{player:b.dataset.player});
  if(cmd==='select'||cmd==='portfolioSelect'){const id=Number(b.dataset.tile);if(!game||game.status!=='playing'){previewLocation(id);}else{selected=id;scene.select(selected);closeModal();renderRight();}}
  if(cmd==='closeProperty'){selected=null;scene.highlight&&(scene.highlight.visible=false);renderRight();}
  if(cmd==='portfolio')portfolio();
  if(cmd==='playerPortfolio')portfolio(b.dataset.player);
  if(cmd==='boardList')boardList();
  if(['build','sell','sellGroup','mortgage'].includes(cmd))action(cmd,{tile:Number(b.dataset.tile)});
  if(cmd==='inherit')action('inherit',{tile:Number(b.dataset.tile),redeem:b.dataset.redeem==='true'});
  if(cmd==='bid')action('bid',{amount:Number($('#bid-amount').value),...($('#build-target')?{tile:Number($('#build-target').value)}:{})});
  if(cmd==='trade')tradeForm();if(cmd==='tradeView')viewTrade();
  if(cmd==='acceptTrade'||cmd==='rejectTrade'){action(cmd==='acceptTrade'?'tradeAccept':'tradeReject',{tradeId:b.dataset.tradeId,unmortgageOffer:[...document.querySelectorAll('[name=unmortgageOffer]:checked')].map(x=>Number(x.value))});closeModal();}
  if(cmd==='tradeChat'){const other=game.players.find(p=>p.id===b.dataset.player);if(other?.bot){toast('Боты отвечают на предложение автоматически.');return;}closeModal();openChat(b.dataset.player);}
  if(cmd==='chatTrade'){tradeForm(b.dataset.player);}
  if(cmd==='chat'||cmd==='chatPeer')openChat(b.dataset.player);
  if(cmd==='closeChat'){chatOpen=false;$('#chat-root').innerHTML='';}
  if(cmd==='react')send({type:'react',emoji:b.dataset.emoji});
  if(cmd==='closeModal')closeModal();
  if(cmd==='history'){modal={type:'history'};showModal(`<span class="eyebrow">Ходы</span><h2>Всё, что было.</h2><div class="history-list">${[...game.events].reverse().map(ev=>`<div><time>${new Date(ev.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time><p>${esc(ev.text)}</p></div>`).join('')}</div>`);}
  if(cmd==='bankrupt'){modal={type:'bankrupt'};showModal('<span class="eyebrow">ПОСЛЕДНЕЕ РЕШЕНИЕ</span><h2>Уйти красиво?</h2><p class="muted">Ты выйдешь из партии. Имущество и остаток денег перейдут кредитору, если есть долг. Это действие нельзя отменить.</p><button class="button danger-button" data-cmd="confirmBankrupt">Объявить банкротство</button><button class="button subtle" data-cmd="closeModal">Остаться в игре</button>');}
  if(cmd==='confirmBankrupt'){selected=null;action('bankrupt');closeModal();}
  if(cmd==='leave'){modal={type:'leave'};showModal(`<span class="eyebrow">ГОРОД ПОДОЖДЁТ</span><h2>Выйти из комнаты?</h2><p class="muted">${game.status==='lobby'?'Твоё место в лобби освободится.':'Партия продолжится. Сохранится возможность вернуться с этого устройства, пока ты не начнёшь другую игру. При включённом таймере сервер сделает ход за тебя.'}</p><button class="button primary" data-cmd="confirmLeave">Выйти</button><button class="button subtle" data-cmd="closeModal">Остаться</button>`);}
  if(cmd==='confirmLeave'){if(game.status==='lobby')send({type:'leave'});else{sessionStorage.setItem('kvartal.return',JSON.stringify(hasSession()));localStorage.removeItem('kvartal.session');send({type:'leave'});}closeModal();}
  if(cmd==='newGame'){localStorage.removeItem('kvartal.session');send({type:'leave'});}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='entry-form'){e.preventDefault();enter();}
  if(e.target.id==='trade-form'){e.preventDefault();const f=new FormData(e.target);action('trade',{to:f.get('to'),offer:f.getAll('offer').map(Number),ask:f.getAll('ask').map(Number),offerCash:Number(f.get('offerCash')),askCash:Number(f.get('askCash')),message:f.get('message'),offerCards:Number(f.get('offerCards')),askCards:Number(f.get('askCards')),unmortgageAsk:f.getAll('unmortgageAsk').map(Number).filter(i=>f.getAll('ask').map(Number).includes(i))});closeModal();}
  if(e.target.id==='dm-form'){e.preventDefault();const input=$('#dm-text'),text=input.value.trim();if(!text)return;send({type:'dm',to:chatPeer,text});input.value='';chatDrafts[chatPeer]='';input.focus();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='trade-to')tradeForm(e.target.value);
  if(['turn-time','max-rounds'].includes(e.target.id))action('settings',{turnSeconds:Number($('#turn-time').value),maxRounds:Number($('#max-rounds').value)});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();if(chatOpen){chatOpen=false;$('#chat-root').innerHTML='';}return;}
  if(e.target.id==='dm-text'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#dm-form').requestSubmit();return;}
  if(modal&&e.key==='Tab'){const items=[...document.querySelectorAll('.modal button:not(:disabled),.modal input,.modal select,.modal textarea')];if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||modal||chatOpen)return;
  if(e.key.toLowerCase()==='r'&&turn()&&game?.phase==='roll'&&Date.now()>animationUntil){selected=null;action('roll');}
});
setInterval(()=>{const el=$('#turn-timer');if(!el||!game)return;if(!game.settings.turnSeconds){el.textContent='∞';return;}const remaining=Math.max(0,Math.ceil((game.deadline-Date.now())/1000));el.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;el.classList.toggle('urgent',remaining<15);},400);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&game&&socket?.readyState!==WebSocket.OPEN)connect();});
render();connect();
