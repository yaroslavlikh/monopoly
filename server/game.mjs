import { randomInt, randomUUID } from 'node:crypto';
import { BOARD, BOARD_VERSION, GROUPS, TOKENS } from '../shared/board.mjs';

const fail = message => { throw new Error(message); };
const integer = (n, min=0, max=100000) => Number.isSafeInteger(n) && n >= min && n <= max;
export const owned = (g, id) => BOARD.filter(t => g.properties[t.id]?.owner === id);
const setOf = group => BOARD.filter(t => t.group === group);
export const complete = (g, id, group) => setOf(group).every(t => g.properties[t.id]?.owner === id);
export const worth = (g,p) => p.cash + owned(g,p.id).reduce((v,t) => v + (g.properties[t.id].mortgaged ? t.price/2 : t.price) + (g.properties[t.id].houses||0)*(GROUPS[t.group]?.build||0)/2,0);
export const bankStock=g=>({houses:32-Object.values(g.properties).reduce((n,v)=>n+(v.houses<5?v.houses:0),0),hotels:12-Object.values(g.properties).filter(v=>v.houses===5).length});
const availableCash=(g,p)=>p.cash-(g.auction?.highest===p.id?g.auction.bid:0);
function cardDecks(g,p){
  if(!p.freeCardDecks||p.freeCardDecks.length!==p.freeCards){const used=g.players.filter(x=>x!==p).flatMap(x=>x.freeCardDecks||[]);p.freeCardDecks=['chance','community'].filter(d=>!used.includes(d)).slice(0,p.freeCards);p.freeCards=p.freeCardDecks.length;}
  return p.freeCardDecks;
}
function giveCards(g,from,to,count){const cards=cardDecks(g,from).splice(0,count);if(to){cardDecks(g,to).push(...cards);to.freeCards=to.freeCardDecks.length;}else for(const deck of cards)returnCard(g,deck);from.freeCards=from.freeCardDecks.length;}
function returnCard(g,type){const deck=type==='chance'?CHANCE:COMMUNITY;const index=deck.findIndex(c=>c.action==='free');if(!g.cards[type].includes(index))g.cards[type].unshift(index);}
export function normalizeGame(g){
  g.bankAuctions??=[];
  for(const p of g.players)cardDecks(g,p);
  if(g.rulesVersion!==2){g.rulesVersion=2;for(const type of ['chance','community'])g.cards[type]=[];}
  return g;
}
export function log(g, text, kind='info', extra={}) {
  const event = {id: ++g.sequence, text, kind, at:Date.now(), ...extra};
  g.events.push(event); g.events = g.events.slice(-70); g.updatedAt=Date.now();
  return event;
}
export function newGame(code, options={}) {
  return {code, boardVersion:BOARD_VERSION, status:'lobby', host:null, players:[], properties:{}, current:0, phase:'roll', dice:[1,1], doubles:0,
    sequence:0, events:[], turn:1, settings:{turnSeconds:90, maxRounds:0,...options}, createdAt:Date.now(), updatedAt:Date.now(), deadline:0,
    auction:null, debt:null, trade:null, winner:null, rulesVersion:2, bankAuctions:[], cards:{chance:[],community:[]}};
}
export function addPlayer(g, name, token, bot=false) {
  if(g.status!=='lobby') fail('Партия уже началась. В неё можно вернуться с прежнего устройства.');
  if(g.players.length >= 6) fail('Все шесть мест заняты.');
  name=String(name||'').trim().slice(0,20);
  if(!name) fail('Введите имя.');
  if(!TOKENS.some(t=>t.id===token) || g.players.some(p=>p.token===token)) token=TOKENS.find(t=>!g.players.some(p=>p.token===t.id))?.id;
  const p={id:randomUUID(), name, token, bot, cash:1500, position:0, jail:0, jailed:false, freeCards:0, freeCardDecks:[], bankrupt:false, online:bot, ready:bot};
  g.players.push(p); if(!g.host)g.host=p.id;
  log(g,`${name} в городе`, 'join'); return p;
}
function resetDeadline(g) { g.deadline=Date.now() + g.settings.turnSeconds*1000; }
function finish(g) {
  const living=g.players.filter(p=>!p.bankrupt);
  if(living.length<=1 || (g.settings.maxRounds && g.turn>g.settings.maxRounds*g.players.length)){
    g.status='finished'; g.winner=[...living].sort((a,b)=>worth(g,b)-worth(g,a))[0]?.id||null;
    log(g,`${g.players.find(p=>p.id===g.winner)?.name||'Никто'} побеждает!`, 'win'); return true;
  } return false;
}
export function nextTurn(g) {
  if(finish(g))return;
  do {g.current=(g.current+1)%g.players.length;} while(g.players[g.current].bankrupt);
  g.phase='roll'; g.doubles=0; g.dice=[1,1]; g.turn++; g.trade=null; resetDeadline(g);
  if(finish(g))return;
  log(g,`Ход ${g.players[g.current].name}`, 'turn');
}
function endLanding(g) { g.phase='end'; resetDeadline(g); }
function transfer(g, p, amount, to=null, continuation='land',reason=to?'rent':'payment') {
  if(p.cash<amount) {
    g.debt={player:p.id, to, amount, continuation,reason,tile:p.position}; g.phase='debt'; resetDeadline(g);
    log(g,`${p.name}: нужно ещё ${amount-p.cash} ₽`, 'debt'); return false;
  }
  const before=p.cash;
  p.cash-=amount; if(to)g.players.find(x=>x.id===to).cash+=amount;
  log(g,`${p.name} платит ${amount} ₽${to?' → '+g.players.find(x=>x.id===to).name:''}`, 'payment', {player:p.id,to,amount,before,after:p.cash,tile:p.position,reason});
  return true;
}
function jail(g,p) {p.position=10;p.jailed=true;p.jail=0;g.doubles=0;endLanding(g);log(g,`${p.name} отправляется в тюрьму`, 'jail',{player:p.id});}
function move(g,p,steps,absolute=false) {
  const from=p.position;
  const total=absolute?steps:from+steps;
  p.position=((total%40)+40)%40;
  if((absolute && steps<from) || (!absolute && total>=40)) {p.cash+=200;log(g,`${p.name}: +200 ₽ за круг`, 'bonus',{player:p.id,amount:200});}
  log(g,`${p.name} → ${BOARD[p.position].name}`, 'move',{player:p.id,from,to:p.position,steps:absolute?(p.position-from+40)%40:steps});
}
export function rent(g,t,dice=7) {
  const prop=g.properties[t.id]; if(!prop||prop.mortgaged)return 0;
  if(t.type==='station')return 25*2**(owned(g,prop.owner).filter(x=>x.type==='station').length-1);
  if(t.type==='utility')return dice*(owned(g,prop.owner).filter(x=>x.type==='utility').length===2?10:4);
  const base=t.rent[prop.houses||0]; return !prop.houses && complete(g,prop.owner,t.group)?base*2:base;
}
const CHANCE=[
  {text:'Ночной автобус довёз до старта. Москва ждёт.',action:'start'},
  {text:'Удачная инвестиция. Получите 150 ₽.',cash:150},
  {text:'Оставили самокат не там. Заплатите 50 ₽.',cash:-50},
  {text:'Ваша вечеринка окупилась. Получите 100 ₽.',cash:100},
  {text:'Проверка документов затянулась. В тюрьму.',action:'jail'},
  {text:'Связи в нужном месте. Сохраните выход из тюрьмы.',action:'free'},
  {text:'Успели на последний поезд. К ближайшей станции метро.',action:'station'},
  {text:'Проехали станцию в наушниках. Назад на три клетки.',action:'back'},
  {text:'Ремонт фасадов: 25 ₽ за дом, 100 ₽ за отель.',action:'repairs'},
  {text:'Городской грант. Получите 200 ₽.',cash:200},
];
const COMMUNITY=[
  {text:'Кэшбэк за месяц. Получите 100 ₽.',cash:100},
  {text:'Соседи оплатили общую доставку. Получите 50 ₽.',cash:50},
  {text:'Срочный ремонт самоката. Заплатите 100 ₽.',cash:-100},
  {text:'Удачно продали вещи в районном чате. Получите 200 ₽.',cash:200},
  {text:'Забыли оплатить подписки. Заплатите 50 ₽.',cash:-50},
  {text:'Ночной город зовёт. Отправляйтесь на старт.',action:'start'},
  {text:'Знакомый адвокат. Сохраните выход из тюрьмы.',action:'free'},
  {text:'Неудачный розыгрыш. Отправляйтесь в тюрьму.',action:'jail'},
  {text:'Премия за хороший квартал. Получите 150 ₽.',cash:150},
  {text:'Вы нашли купюру в старой куртке. Получите 20 ₽.',cash:20},
];
function card(g,p,type,depth) {
  const deck=type==='chance'?CHANCE:COMMUNITY;
  if(!g.cards[type].length) {const held=g.players.some(x=>cardDecks(g,x).includes(type));g.cards[type]=deck.map((_,i)=>i).filter(i=>!(held&&deck[i].action==='free'));for(let i=g.cards[type].length-1;i>0;i--){const j=randomInt(i+1);[g.cards[type][i],g.cards[type][j]]=[g.cards[type][j],g.cards[type][i]];}}
  const index=g.cards[type].pop(),c=deck[index];if(c.action!=='free')g.cards[type].unshift(index);g.lastCard={...c,type,id:g.sequence+1};log(g,c.text,'card',{player:p.id});
  if(c.cash>0)p.cash+=c.cash;
  if(c.cash<0 && !transfer(g,p,-c.cash))return;
  if(c.action==='jail'){jail(g,p);return;}
  if(c.action==='free'){cardDecks(g,p).push(type);p.freeCards=p.freeCardDecks.length;}
  if(c.action==='repairs') {const amount=owned(g,p.id).reduce((s,t)=>s+((g.properties[t.id].houses||0)===5?100:25*(g.properties[t.id].houses||0)),0);if(amount && !transfer(g,p,amount))return;}
  if(['start','station','back'].includes(c.action)) {
    if(c.action==='start')move(g,p,0,true);
    if(c.action==='station')move(g,p,((5+10*Math.floor((p.position+5)/10))-p.position+40)%40);
    if(c.action==='back')move(g,p,-3);
    land(g,p,depth+1);return;
  }endLanding(g);
}
function land(g,p,depth=0) {
  if(depth>4){endLanding(g);return;}
  const t=BOARD[p.position],prop=g.properties[t.id];
  if(t.price) {
    if(!prop){g.phase='buy';resetDeadline(g);return;}
    if(prop.owner!==p.id){const amount=rent(g,t,g.dice[0]+g.dice[1]);if(amount && !transfer(g,p,amount,prop.owner))return;}
  } else if(t.type==='tax') {if(!transfer(g,p,t.amount))return;}
  else if(t.type==='goJail'){jail(g,p);return;}
  else if(t.type==='chance'||t.type==='community'){card(g,p,t.type,depth);return;}
  endLanding(g);
}
function settleDebt(g) {
  if(!g.debt)return;
  const d=g.debt,p=g.players.find(p=>p.id===d.player);
  if(p.cash<d.amount)return;
  g.debt=null;
  transfer(g,p,d.amount,d.to,d.continuation,d.reason);
  if(d.continuation==='bail'){p.jailed=false;p.jail=0;move(g,p,g.dice[0]+g.dice[1]);land(g,p);}
  else if(d.continuation==='release'){p.jailed=false;p.jail=0;g.phase='roll';resetDeadline(g);}
  else if(d.continuation==='inheritance')finishInheritance(g);
  else endLanding(g);
}
function buildOptions(g,p,kind){return owned(g,p.id).filter(t=>t.group&&!g.properties[t.id].mortgaged&&complete(g,p.id,t.group)&&!setOf(t.group).some(x=>g.properties[x.id]?.mortgaged)&&g.properties[t.id].houses<5&&(kind==='hotel'?g.properties[t.id].houses===4:g.properties[t.id].houses<4)&&setOf(t.group).every(x=>g.properties[x.id].houses>=g.properties[t.id].houses)&&g.debt?.player!==p.id);}
function startBuildingAuction(g,p,t,kind){
  if(g.auction)fail('Сначала завершите текущий аукцион.');
  const players=g.players.filter(p=>!p.bankrupt&&p.cash>0&&buildOptions(g,p,kind).length);
  if(players.length<2)return false;
  clearTrade(g);const resume={phase:g.phase,current:g.current};
  g.auction={source:'building',building:kind,tile:t.id,bid:0,highest:null,actor:p.id,placements:{[p.id]:t.id},passed:g.players.filter(x=>!players.includes(x)).map(x=>x.id),resume};g.phase='auction';resetDeadline(g);log(g,`Аукцион последнего ${kind==='hotel'?'отеля':'дома'} банка`,'auction');return true;
}
function auctionNext(g) {
  const a=g.auction;
  const active=g.players.filter(p=>!p.bankrupt && !a.passed.includes(p.id));
  if(active.length===0 || (active.length===1 && a.highest===active[0].id)){
    if(a.highest){const p=g.players.find(p=>p.id===a.highest);p.cash-=a.bid;if(a.source==='building'){const tile=a.placements[p.id];g.properties[tile].houses++;log(g,`${p.name} покупает ${a.building==='hotel'?'отель':'дом'} для ${BOARD[tile].name} за ${a.bid} ₽`,'build',{player:p.id,tile});}else{g.properties[a.tile]={owner:p.id,houses:0,mortgaged:false};log(g,`${p.name} выигрывает ${BOARD[a.tile].name} за ${a.bid} ₽`,'purchase',{player:p.id,tile:a.tile});}}
    else log(g,'Аукцион завершён без покупателя');
    const source=a.source;g.auction=null;if(source==='building'){g.phase=a.resume.phase;g.current=a.resume.current;resetDeadline(g);}else if(source==='bankruptcy')continueBankAuctions(g);else endLanding(g);return;
  }
  const idx=g.players.findIndex(p=>p.id===a.actor);
  for(let n=1;n<=g.players.length;n++){const p=g.players[(idx+n)%g.players.length];if(!p.bankrupt&&!a.passed.includes(p.id)){a.actor=p.id;break;}}
  resetDeadline(g);
}
function startAuction(g,tile=g.players[g.current].position,source='landing') {
  const actor=g.players[g.current].bankrupt?g.players.find(p=>!p.bankrupt):g.players[g.current];
  g.phase='auction';g.auction={tile,bid:0,highest:null,actor:actor.id,passed:[],source};
  resetDeadline(g);log(g,`Аукцион: ${BOARD[tile].name}`,'auction');
}
function endBankruptcy(g){const after=g.bankruptcyAfter;delete g.bankruptcyAfter;delete g.inheritance;g.bankAuctions=[];if(after!==undefined)g.current=after;if(!finish(g))nextTurn(g);}
function continueBankAuctions(g){if(g.players.filter(p=>!p.bankrupt).length>1&&g.bankAuctions.length)startAuction(g,g.bankAuctions.shift(),'bankruptcy');else endBankruptcy(g);}
function finishInheritance(g){const i=g.inheritance;if(i.redeem)g.properties[i.tiles[0]].mortgaged=false;i.tiles.shift();delete i.redeem;if(i.tiles.length){g.phase='inheritance';resetDeadline(g);}else endBankruptcy(g);}

function asset(g,p,id) {
  if(!integer(id,0,39)||!g.properties[id]||g.properties[id].owner!==p.id)fail('Это не ваша недвижимость.');
  return {t:BOARD[id],v:g.properties[id]};
}
function clearTrade(g) {if(g.trade) {g.trade=null;log(g,'Предложение обмена закрыто');}}
function bankrupt(g,p) {
  if(p.bankrupt)fail('Вы уже выбыли.');
  g.bankruptcyAfter??=g.current;
  const creditor=g.debt?.player===p.id?g.players.find(x=>x.id===g.debt.to):null;
  if(creditor)creditor.cash+=p.cash;
  p.cash=0;p.bankrupt=true;const inherited=[];
  for(const t of owned(g,p.id)) {
    const v=g.properties[t.id];
    if(creditor){creditor.cash+=(v.houses||0)*(GROUPS[t.group]?.build||0)/2;v.owner=creditor.id;v.houses=0;if(v.mortgaged)inherited.push(t.id);}
    else {g.bankAuctions.push(t.id);delete g.properties[t.id];}
  }
  giveCards(g,p,creditor,p.freeCards);clearTrade(g);log(g,`${p.name} объявляет банкротство`,'bankrupt',{player:p.id});
  g.debt=null;delete g.inheritance;
  if(creditor&&inherited.length){g.current=g.players.indexOf(creditor);g.inheritance={player:creditor.id,tiles:inherited};g.phase='inheritance';resetDeadline(g);}
  else if(creditor)endBankruptcy(g);else continueBankAuctions(g);
}

export function act(g,id,a) {
  normalizeGame(g);
  const p=g.players.find(p=>p.id===id);if(!p)fail('Игрок не найден.');
  if(!a || typeof a.type!=='string')fail('Неизвестное действие.');
  if(a.type==='ready'&&g.status==='lobby'){p.ready=!p.ready;return;}
  if(a.type==='token'&&g.status==='lobby') {if(!TOKENS.some(t=>t.id===a.token)||g.players.some(x=>x.id!==id&&x.token===a.token))fail('Фишка уже занята.');p.token=a.token;return;}
  if(a.type==='addBot'&&g.status==='lobby'){if(id!==g.host)fail('Только хозяин комнаты добавляет ботов.');const names=['Луна','Байт','Ника','Лис','Неон'];return addPlayer(g,names[g.players.filter(p=>p.bot).length]||'Бот','',true);}
  if(a.type==='removeBot'&&g.status==='lobby'){if(id!==g.host)fail('Только хозяин комнаты.');g.players=g.players.filter(x=>x.id!==a.player||!x.bot);return;}
  if(a.type==='settings'&&g.status==='lobby') {if(id!==g.host)fail('Только хозяин комнаты.');if(![45,90,180,0].includes(a.turnSeconds)||![0,15,25,40].includes(a.maxRounds))fail('Некорректные настройки.');g.settings={turnSeconds:a.turnSeconds,maxRounds:a.maxRounds};return;}
  if(a.type==='start'){
    if(g.status!=='lobby'||id!==g.host)fail('Начать игру может хозяин комнаты.');
    if(g.players.length<2)fail('Нужно минимум два игрока. Добавьте друга или бота.');
    if(g.players.some(x=>x.id!==g.host&&!x.ready))fail('Дождитесь готовности всех игроков.');
    g.status='playing';g.phase='roll';resetDeadline(g);log(g,'Ночь начинается. Город ваш.','start');return;
  }
  if(g.status!=='playing'||p.bankrupt)fail('Сейчас это действие недоступно.');
  const myTurn=g.players[g.current].id===id;
  if(a.type==='tradeReject') {if(!g.trade||![g.trade.from,g.trade.to].includes(id))fail('Нет предложения.');if(a.tradeId!==g.trade.id)fail('Предложение изменилось. Откройте его заново.');clearTrade(g);return;}
  if(a.type==='tradeAccept'){
    const tr=g.trade;if(!tr||tr.to!==id)fail('Нет предложения.');if(a.tradeId!==tr.id)fail('Предложение изменилось. Откройте его заново.');
    const fees=validateTrade(g,tr,a.unmortgageOffer||[]);
    const from=g.players.find(x=>x.id===tr.from),to=p;
    from.cash+=tr.askCash-tr.offerCash-fees.from;to.cash+=tr.offerCash-tr.askCash-fees.to;
    tr.offer.forEach(i=>g.properties[i].owner=to.id);tr.ask.forEach(i=>g.properties[i].owner=from.id);
    for(const i of [...(tr.unmortgageAsk||[]),...(a.unmortgageOffer||[])])g.properties[i].mortgaged=false;
    const offered=cardDecks(g,from).splice(0,tr.offerCards||0),asked=cardDecks(g,to).splice(0,tr.askCards||0);from.freeCardDecks.push(...asked);to.freeCardDecks.push(...offered);from.freeCards=from.freeCardDecks.length;to.freeCards=to.freeCardDecks.length;
    log(g,`${from.name} и ${to.name} заключили сделку`,'trade');g.trade=null;settleDebt(g);return;
  }
  if(a.type==='trade'){
    if(!['roll','end','debt','buy','inheritance'].includes(g.phase))fail('Дождитесь завершения аукциона.');
    if(g.trade)fail('Сначала закройте текущее предложение обмена.');
    const tr={id:randomUUID(),from:id,to:a.to,offer:a.offer,ask:a.ask,offerCash:a.offerCash,askCash:a.askCash,offerCards:a.offerCards||0,askCards:a.askCards||0,unmortgageAsk:a.unmortgageAsk||[],message:typeof a.message==='string'?a.message.trim().slice(0,500):''};validateTrade(g,tr);
    if(tr.from===tr.to)fail('Выберите другого игрока.');
    g.trade=tr;log(g,`${p.name} предлагает обмен`,'trade');return;
  }
  if(!myTurn && !['build','sell','sellGroup','mortgage'].includes(a.type) && !(g.phase==='auction'&&a.type==='bid') && !(g.phase==='auction'&&a.type==='pass'))fail('Сейчас ход другого игрока.');
  if(a.type==='bid'||a.type==='pass') {
    const au=g.auction;if(g.phase!=='auction'||!au||au.actor!==id)fail('Дождитесь своей очереди на аукционе.');
    if(a.type==='bid'){if(!integer(a.amount,au.bid+1)||a.amount>p.cash)fail('Ставка должна быть выше минимум на 1 ₽ и по средствам.');if(au.source==='building'){const tile=a.tile??buildOptions(g,p,au.building)[0]?.id;if(!buildOptions(g,p,au.building).some(t=>t.id===tile))fail('Выберите свой участок для равномерной застройки.');au.placements[p.id]=tile;}au.bid=a.amount;au.highest=id;log(g,`${p.name}: ставка ${a.amount} ₽`,'bid');}
    else au.passed.push(id);
    auctionNext(g);return;
  }
  if(['build','sell','sellGroup','mortgage'].includes(a.type)){
    const {t,v}=asset(g,p,a.tile);if(g.auction?.source==='building'&&(a.type==='build'||(g.auction.highest===id&&BOARD[g.auction.placements[id]].group===t.group)))fail('Завершите аукцион здания перед изменением этой группы.');if(g.inheritance?.tiles.includes(a.tile))fail('Сначала выберите условия получения наследства.');if(g.trade&&[g.trade.from,g.trade.to].includes(id))clearTrade(g);
    if(a.type==='build'){
      if((g.debt?.player===id)||t.type!=='property'||!complete(g,id,t.group)||setOf(t.group).some(t=>g.properties[t.id]?.mortgaged))fail('Для строительства нужен весь район без залогов.');
      if(v.houses>=5)fail('Здесь уже отель.');
      if(setOf(t.group).some(t=>g.properties[t.id].houses<v.houses))fail('Застраивайте район равномерно.');
      const stock=bankStock(g);if(v.houses===4?stock.hotels<1:stock.houses<1)fail(v.houses===4?'В банке нет отелей.':'В банке нет домов.');
      if((v.houses===4?stock.hotels:stock.houses)===1&&startBuildingAuction(g,p,t,v.houses===4?'hotel':'house'))return;
      const cost=GROUPS[t.group].build;if(availableCash(g,p)<cost)fail('Не хватает денег.');
      p.cash-=cost;v.houses++;log(g,`${p.name}: ${v.houses===5?'отель':'новый дом'} · ${t.name}`,'build',{tile:t.id,player:id});
    }
    if(a.type==='sell'){
      if(!v.houses)fail('Здесь нет зданий.');
      if(setOf(t.group).some(t=>g.properties[t.id].houses>v.houses))fail('Продавайте здания равномерно.');
      if(v.houses===5&&bankStock(g).houses<4)fail('В банке не хватает 4 домов для размена отеля. Можно продать все здания группы.');
      v.houses--;p.cash+=GROUPS[t.group].build/2;log(g,`${p.name} продаёт здание · ${t.name}`,'sell');
    }
    if(a.type==='sellGroup'){if(!t.group)fail('Это не район.');const group=setOf(t.group);if(group.some(t=>g.properties[t.id]?.houses&&g.properties[t.id].owner!==id))fail('Это не ваша группа.');for(const t of group){const prop=g.properties[t.id];if(prop?.owner===id){p.cash+=(prop.houses||0)*GROUPS[t.group].build/2;prop.houses=0;}}log(g,`${p.name} продаёт все здания группы`,'sell',{player:id});}
    if(a.type==='mortgage'){
      if(v.mortgaged){const cost=Math.ceil(t.price*55/100);if(availableCash(g,p)<cost)fail('Не хватает денег на выкуп.');p.cash-=cost;v.mortgaged=false;}
      else {if(t.group&&setOf(t.group).some(t=>g.properties[t.id]?.houses>0))fail('Сначала продайте все здания района.');v.mortgaged=true;p.cash+=t.price/2;}
      log(g,`${p.name} ${v.mortgaged?'закладывает':'выкупает'} ${t.name}`,'mortgage');
    }settleDebt(g);return;
  }
  if(a.type==='inherit'){
    if(g.phase!=='inheritance'||g.inheritance?.player!==id||a.tile!==g.inheritance.tiles[0]||typeof a.redeem!=='boolean')fail('Нет ожидающего наследства.');
    const tile=g.inheritance.tiles[0];g.inheritance.redeem=a.redeem;
    if(transfer(g,p,Math.ceil(BOARD[tile].price*(a.redeem?55:5)/100),null,'inheritance','mortgageInterest'))finishInheritance(g);
    return;
  }
  if(a.type==='bankrupt'){if(g.phase==='auction')fail('Сначала завершите аукцион.');bankrupt(g,p);return;}
  if(a.type==='bail'||a.type==='freeCard'){
    if(g.phase!=='roll'||!p.jailed)fail('Вы сейчас не в тюрьме.');
    if(a.type==='freeCard'){if(!p.freeCards)fail('Нет карты выхода.');const deck=cardDecks(g,p).shift();p.freeCards=p.freeCardDecks.length;returnCard(g,deck);p.jailed=false;p.jail=0;}
    else {if(!transfer(g,p,50,null,'release'))return;p.jailed=false;p.jail=0;}
    log(g,`${p.name} выходит из тюрьмы`);return;
  }
  if(a.type==='roll'){
    if(g.phase!=='roll')fail('Сейчас нельзя бросать кубики.');clearTrade(g);g.lastCard=null;
    resolveRoll(g,p,[randomInt(1,7),randomInt(1,7)]);return;
  }
  if(a.type==='buy'){
    if(g.phase!=='buy')fail('Сейчас нечего покупать.');const t=BOARD[p.position];
    if(g.properties[t.id]||p.cash<t.price)fail('Не хватает денег для покупки.');
    p.cash-=t.price;g.properties[t.id]={owner:id,houses:0,mortgaged:false};
    log(g,`${p.name} покупает ${t.name}`,'purchase',{player:id,tile:t.id});endLanding(g);return;
  }
  if(a.type==='auction'){if(g.phase!=='buy')fail('Сейчас нельзя начать аукцион.');clearTrade(g);startAuction(g);return;}
  if(a.type==='end'){
    if(g.phase!=='end')fail('Сначала завершите действие.');clearTrade(g);
    if(g.doubles && !p.jailed){g.phase='roll';resetDeadline(g);log(g,`${p.name}: дубль — ещё один бросок!`,'double');}
    else nextTurn(g);return;
  }
  fail('Неизвестное действие.');
}
// Trusted engine helper; client actions always use crypto.randomInt above.
export function resolveRoll(g,p,dice){
  g.dice=dice;const sum=g.dice[0]+g.dice[1],double=g.dice[0]===g.dice[1];
    log(g,`${p.name} бросает ${g.dice.join(' + ')}`,'roll',{player:p.id,dice:g.dice,balanceBefore:p.cash});
    if(p.jailed){
      p.jail++;
      if(double){p.jailed=false;p.jail=0;g.doubles=0;}
      else if(p.jail>=3){g.doubles=0;if(!transfer(g,p,50,null,'bail'))return;p.jailed=false;p.jail=0;}
      else {endLanding(g);return;}
    } else {g.doubles=double?g.doubles+1:0;if(g.doubles>=3){jail(g,p);return;}}
    move(g,p,sum);land(g,p);return;
}
function validateTrade(g,tr,unmortgageOffer=[]) {
  const from=g.players.find(p=>p.id===tr.from&&!p.bankrupt),to=g.players.find(p=>p.id===tr.to&&!p.bankrupt);
  if(!from||!to||from.id===to.id)fail('Выберите действующего игрока.');
  if(!integer(tr.offerCash)||!integer(tr.askCash)||from.cash<tr.offerCash||to.cash<tr.askCash)fail('Некорректные суммы обмена.');
  if(!Array.isArray(tr.offer)||!Array.isArray(tr.ask)||tr.offer.length>28||tr.ask.length>28||new Set([...tr.offer,...tr.ask]).size!==tr.offer.length+tr.ask.length)fail('Некорректная недвижимость.');
  if(!integer(tr.offerCards||0,0,2)||!integer(tr.askCards||0,0,2)||(tr.offerCards||0)>from.freeCards||(tr.askCards||0)>to.freeCards)fail('Недостаточно карт выхода.');
  if(!tr.offer.length&&!tr.ask.length&&!tr.offerCash&&!tr.askCash&&!tr.offerCards&&!tr.askCards)fail('Добавьте деньги, недвижимость или карты выхода.');
  for(const [ids,p] of [[tr.offer,from],[tr.ask,to]])for(const i of ids){const{t}=asset(g,p,i);if(t.group&&setOf(t.group).some(t=>g.properties[t.id]?.houses>0))fail('Нельзя обменять район со зданиями.');}
  const fees=(ids,redeem)=>{if(!Array.isArray(redeem)||new Set(redeem).size!==redeem.length||redeem.some(i=>!ids.includes(i)||!g.properties[i].mortgaged))fail('Некорректный выбор выкупа залога.');return ids.reduce((n,i)=>n+(g.properties[i].mortgaged?Math.ceil(BOARD[i].price*(redeem.includes(i)?55:5)/100):0),0);};
  const costs={from:fees(tr.ask,tr.unmortgageAsk||[]),to:fees(tr.offer,unmortgageOffer)};
  if(from.cash+tr.askCash-tr.offerCash<costs.from||to.cash+tr.offerCash-tr.askCash<costs.to)fail('После обмена не хватит денег на проценты по залогу.');
  if(g.phase==='auction')fail('Сначала завершите аукцион.');
  if(g.inheritance&&[...tr.offer,...tr.ask].some(i=>g.inheritance.tiles.includes(i)))fail('Сначала оплатите получение наследства.');
  return costs;
}

export function botAction(g,id) {
  const p=g.players.find(x=>x.id===id);
  if(g.trade?.to===id){const tr=g.trade;try{validateTrade(g,tr);}catch{return {type:'tradeReject',tradeId:tr.id};}const value=ids=>ids.reduce((s,i)=>s+BOARD[i].price,0);return {type:value(tr.offer)+tr.offerCash>=value(tr.ask)+tr.askCash? 'tradeAccept':'tradeReject',tradeId:tr.id};}
  if(g.phase==='auction') {const a=g.auction,tile=a.source==='building'?buildOptions(g,p,a.building)[0]:BOARD[a.tile];if(!tile)return {type:'pass'};const value=a.source==='building'?GROUPS[tile.group].build:tile.price;return a.bid+10<=Math.min(p.cash-100,value*.9)?{type:'bid',tile:tile.id,amount:a.bid+10}:{type:'pass'};}
  if(g.phase==='inheritance')return {type:'inherit',tile:g.inheritance.tiles[0],redeem:false};
  if(g.phase==='debt'){
    const houses=owned(g,id).filter(t=>g.properties[t.id].houses>0).sort((a,b)=>g.properties[b.id].houses-g.properties[a.id].houses);
    if(houses.length)return {type:g.properties[houses[0].id].houses===5&&bankStock(g).houses<4?'sellGroup':'sell',tile:houses[0].id};
    const prop=owned(g,id).find(t=>!g.properties[t.id].mortgaged);if(prop)return {type:'mortgage',tile:prop.id};
    return {type:'bankrupt'};
  }
  if(g.phase==='buy')return {type:p.cash>=BOARD[p.position].price+70?'buy':'auction'};
  if(g.phase==='roll'){
    if(p.jailed&&p.freeCards)return {type:'freeCard'};
    if(p.jailed&&p.cash>400)return {type:'bail'};
    return {type:'roll'};
  }
  if(g.phase==='end') {
    const build=owned(g,id).find(t=>t.type==='property'&&complete(g,id,t.group)&&!setOf(t.group).some(t=>g.properties[t.id]?.mortgaged)&&g.properties[t.id].houses<5&&(g.properties[t.id].houses===4?bankStock(g).hotels>0:bankStock(g).houses>0)&&setOf(t.group).every(x=>g.properties[x.id].houses>=g.properties[t.id].houses)&&p.cash>GROUPS[t.group].build+250);
    if(build)return {type:'build',tile:build.id};return {type:'end'};
  }return null;
}
export function publicGame(g, viewer=null) { const {cards,...rest}=g;return {...rest,rents:Object.fromEntries(BOARD.filter(t=>g.properties[t.id]).map(t=>[t.id,rent(g,t,g.dice[0]+g.dice[1])])),bankStock:bankStock(g),auction:g.auction?.source==='building'?{...g.auction,buildOptions:Object.fromEntries(g.players.map(p=>[p.id,buildOptions(g,p,g.auction.building).map(t=>t.id)]))}:g.auction,trade:g.trade&&[g.trade.from,g.trade.to].includes(viewer)?g.trade:null}; }
