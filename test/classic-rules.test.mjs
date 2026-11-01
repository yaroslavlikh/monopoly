import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,addPlayer,act,resolveRoll,bankStock,normalizeGame,botAction} from '../server/game.mjs';
import {BOARD,GROUPS} from '../shared/board.mjs';
function setup(n=3){const g=newGame('RULES',{turnSeconds:0});for(let i=0;i<n;i++)addPlayer(g,'P'+i,'',true);act(g,g.host,{type:'start'});return g;}
const own=(g,p,ids,houses=0,mortgaged=false)=>ids.forEach(i=>g.properties[i]={owner:p.id,houses,mortgaged});
const trade=(g,a,b,extra={})=>act(g,a.id,{type:'trade',to:b.id,offer:[],ask:[],offerCash:0,askCash:0,...extra});

test('Щукино: старт +200 и аренда −320 списываются с обоих балансов и содержат до/после',()=>{
 const g=setup(),[a,b]=g.players;a.cash=330;a.position=39;own(g,b,[1,3],4);
 resolveRoll(g,a,[2,2]);assert.equal(a.position,3);assert.equal(a.cash,210);assert.equal(b.cash,1820);
 const e=g.events.find(e=>e.reason==='rent');assert.equal(e.before,530);assert.equal(e.after,210);assert.equal(e.amount,320);assert.equal(e.tile,3);
});
test('аренда: все 22 района, уровни построек, залоги, метро и службы',()=>{
 for(const t of BOARD.filter(t=>t.type==='property'))for(let h=0;h<=5;h++)for(const mortgaged of [false,true]){
  const g=setup(),[a,b]=g.players;a.position=(t.id+37)%40;a.cash=10000;const set=BOARD.filter(x=>x.group===t.group);own(g,b,set.map(x=>x.id),h);g.properties[t.id].mortgaged=mortgaged;
  const bonus=a.position+3>=40?200:0,amount=mortgaged?0:t.rent[h]*(h===0?2:1);resolveRoll(g,a,[1,2]);assert.equal(a.cash,10000+bonus-amount);assert.equal(b.cash,1500+amount);
 }
 for(let n=1;n<=4;n++){const g=setup(),[a,b]=g.players;a.position=2;own(g,b,[5,15,25,35].slice(0,n));resolveRoll(g,a,[1,2]);assert.equal(a.cash,1500-25*2**(n-1));}
 for(let n=1;n<=2;n++){const g=setup(),[a,b]=g.players;a.position=9;own(g,b,[12,28].slice(0,n));resolveRoll(g,a,[1,2]);assert.equal(a.cash,1500-3*(n===2?10:4));}
});
test('карта выхода остаётся вне колоды до использования и возвращается после',()=>{
 const g=setup(),a=g.players[0];g.cards.chance=[5];a.position=4;resolveRoll(g,a,[1,2]);assert.equal(a.freeCards,1);assert.deepEqual(a.freeCardDecks,['chance']);
 for(let n=0;n<25;n++){a.position=4;a.jailed=false;g.phase='roll';resolveRoll(g,a,[1,2]);assert.equal(a.freeCards,1);assert.ok(!g.cards.chance.includes(5));}
 a.jailed=true;g.phase='roll';act(g,a.id,{type:'freeCard'});assert.equal(a.freeCards,0);assert.ok(g.cards.chance.includes(5));
});
test('банк останавливает 33-й дом; отель возвращает четыре дома в банк',()=>{
 const g=setup(),a=g.players[0];a.cash=100000;own(g,a,BOARD.filter(t=>t.type==='property').map(t=>t.id));
 let built=0;for(let round=0;round<4&&built<32;round++)for(const t of BOARD.filter(t=>t.type==='property')){if(built===32)break;act(g,a.id,{type:'build',tile:t.id});built++;}
 assert.equal(bankStock(g).houses,0);const candidate=BOARD.find(t=>t.group&&g.properties[t.id].houses===Math.min(...BOARD.filter(x=>x.group===t.group).map(x=>g.properties[x.id].houses)));assert.throws(()=>act(g,a.id,{type:'build',tile:candidate.id}),/нет домов/);
 const h=setup(),p=h.players[0];own(h,p,[1,3],4);act(h,p.id,{type:'build',tile:1});assert.deepEqual(bankStock(h),{houses:28,hotels:11});
});
test('13-й отель запрещён; при дефиците домов отель продаётся вместе с группой',()=>{
 const g=setup(),a=g.players[0];a.cash=100000;const properties=BOARD.filter(t=>t.type==='property');own(g,a,properties.map(t=>t.id));for(const t of properties.slice(0,12))g.properties[t.id].houses=5;const t=properties[12];for(const x of properties.filter(x=>x.group===t.group))if(g.properties[x.id].houses<5)g.properties[x.id].houses=4;assert.throws(()=>act(g,a.id,{type:'build',tile:t.id}),/нет отелей/);
 const h=setup(),p=h.players[0];own(h,p,properties.map(t=>t.id));h.properties[1].houses=5;h.properties[3].houses=5;for(const x of properties.filter(t=>![1,3].includes(t.id)).slice(0,8))h.properties[x.id].houses=4;assert.equal(bankStock(h).houses,0);assert.throws(()=>act(h,p.id,{type:'sell',tile:1}),/размена/);act(h,p.id,{type:'sellGroup',tile:1});assert.equal(h.properties[1].houses,0);assert.equal(h.properties[3].houses,0);assert.equal(p.cash,1750);
});
test('строить, продавать, закладывать и предлагать обмен можно в чужой ход',()=>{
 const g=setup(),[a,b]=g.players;own(g,b,[1,3]);act(g,b.id,{type:'build',tile:1});act(g,b.id,{type:'sell',tile:1});act(g,b.id,{type:'mortgage',tile:1});trade(g,b,a,{offer:[1],askCash:50});assert.equal(g.trade.from,b.id);assert.equal(g.current,0);
});
test('заложенная собственность передаётся с процентами; немедленный выкуп не берёт проценты дважды',()=>{
 for(const redeem of [false,true]){const g=setup(),[a,b]=g.players;own(g,a,[1],0,true);trade(g,a,b,{offer:[1],askCash:50});act(g,b.id,{type:'tradeAccept',tradeId:g.trade.id,unmortgageOffer:redeem?[1]:[]});assert.equal(a.cash,1550);assert.equal(b.cash,1450-(redeem?33:3));assert.equal(g.properties[1].mortgaged,!redeem);if(!redeem){act(g,b.id,{type:'mortgage',tile:1});assert.equal(b.cash,1414);}}
});
test('получатель залога не может принять обмен без денег на проценты',()=>{
 const g=setup(),[a,b]=g.players;own(g,a,[39],0,true);b.cash=19;assert.throws(()=>trade(g,a,b,{offer:[39]}),/проценты/);assert.equal(g.properties[39].owner,a.id);
});
test('карта выхода передаётся в обмене и при банкротстве с сохранением колоды',()=>{
 const g=setup(),[a,b,c]=g.players;a.freeCardDecks=['chance'];a.freeCards=1;trade(g,a,b,{offerCards:1,askCash:20});act(g,b.id,{type:'tradeAccept',tradeId:g.trade.id});assert.equal(a.freeCards,0);assert.deepEqual(b.freeCardDecks,['chance']);g.current=1;g.phase='debt';g.debt={player:b.id,to:c.id,amount:9999,continuation:'land'};act(g,b.id,{type:'bankrupt'});assert.deepEqual(c.freeCardDecks,['chance']);assert.equal(c.freeCards,1);
});
test('имущество банкрота перед банком проходит последовательные аукционы',()=>{
 const g=setup(),[a,b,c]=g.players;own(g,a,[1,3],0,true);g.phase='debt';g.debt={player:a.id,to:null,amount:9999,continuation:'land'};act(g,a.id,{type:'bankrupt'});assert.equal(g.auction.tile,1);
 act(g,b.id,{type:'bid',amount:10});act(g,c.id,{type:'pass'});assert.equal(g.auction.tile,3);act(g,b.id,{type:'pass'});act(g,c.id,{type:'bid',amount:10});assert.equal(g.auction,null);assert.equal(g.properties[1].owner,b.id);assert.equal(g.properties[1].mortgaged,false);assert.equal(g.properties[3].owner,c.id);assert.equal(g.current,1);assert.equal(g.phase,'roll');
});
test('наследство: выбор выкупа, нехватка процентов и повторное банкротство не теряют очередь',()=>{
 const g=setup(),[a,b,c]=g.players;own(g,a,[39],0,true);a.cash=0;b.cash=0;own(g,b,[1]);g.phase='debt';g.debt={player:a.id,to:b.id,amount:9999,continuation:'land'};act(g,a.id,{type:'bankrupt'});assert.equal(g.inheritance.player,b.id);act(g,b.id,{type:'inherit',tile:g.inheritance.tiles[0],redeem:false});assert.equal(g.debt.amount,20);act(g,b.id,{type:'mortgage',tile:1});assert.equal(g.debt,null);assert.equal(b.cash,10);assert.equal(g.current,1);assert.equal(g.phase,'roll');
 const h=setup(),[x,y,z]=h.players;own(h,x,[39],0,true);x.cash=y.cash=0;h.phase='debt';h.debt={player:x.id,to:y.id,amount:9999,continuation:'land'};act(h,x.id,{type:'bankrupt'});act(h,y.id,{type:'inherit',tile:h.inheritance.tiles[0],redeem:false});act(h,y.id,{type:'bankrupt'});assert.equal(h.status,'finished');assert.equal(h.winner,z.id);
});
test('деньги ведущей ставки нельзя потратить на стройку во время аукциона',()=>{
 const g=setup(),[a,b]=g.players;own(g,a,[1,3]);a.position=6;g.phase='buy';act(g,a.id,{type:'auction'});act(g,a.id,{type:'bid',amount:1490});assert.throws(()=>act(g,a.id,{type:'build',tile:1}),/денег/);act(g,a.id,{type:'mortgage',tile:3});assert.ok(a.cash>=g.auction.bid);
});
test('старое сохранение получает идентичности карт без потери балансов и владения',()=>{
 const g=setup(),a=g.players[0];delete g.rulesVersion;delete a.freeCardDecks;a.freeCards=1;own(g,a,[1]);const before=a.cash;normalizeGame(g);assert.equal(g.rulesVersion,2);assert.equal(a.cash,before);assert.equal(g.properties[1].owner,a.id);assert.equal(a.freeCardDecks.length,1);
});
test('проценты залога считаются без лишнего рубля из-за floating point',()=>{
 for(const t of BOARD.filter(t=>t.price)){const g=setup(),[a]=g.players;own(g,a,[t.id],0,true);act(g,a.id,{type:'mortgage',tile:t.id});assert.equal(a.cash,1500-Math.ceil(t.price*55/100),t.name);}
 const g=setup(),[a,b]=g.players;own(g,a,[39],0,true);a.cash=0;g.phase='debt';g.debt={player:a.id,to:b.id,amount:9999,continuation:'land'};act(g,a.id,{type:'bankrupt'});act(g,b.id,{type:'inherit',tile:g.inheritance.tiles[0],redeem:true});assert.equal(b.cash,1280);assert.equal(g.properties[39].mortgaged,false);
});
test('повторное подтверждение наследства из другой вкладки не списывает деньги за следующий участок',()=>{
 const g=setup(),[a,b]=g.players;own(g,a,[1,3],0,true);a.cash=0;g.phase='debt';g.debt={player:a.id,to:b.id,amount:9999,continuation:'land'};act(g,a.id,{type:'bankrupt'});act(g,b.id,{type:'inherit',tile:1,redeem:false});const cash=b.cash;assert.throws(()=>act(g,b.id,{type:'inherit',tile:1,redeem:false}));assert.equal(b.cash,cash);assert.equal(g.inheritance.tiles[0],3);
});
test('последний дом продаётся на аукционе с выбором участка; затем возобновляется прерванный ход',()=>{
 const g=setup(),[a,b,c]=g.players;own(g,a,[1,3]);own(g,b,[6,8,9,11]);const rest=BOARD.filter(t=>t.group&&!['northwest','east'].includes(t.group));own(g,c,rest.map(t=>t.id));rest.forEach((t,i)=>g.properties[t.id].houses=i===rest.length-1?1:2);assert.equal(bankStock(g).houses,1);
 act(g,a.id,{type:'build',tile:1});assert.equal(g.auction.source,'building');assert.equal(g.phase,'auction');
 act(g,a.id,{type:'bid',amount:1,tile:1});assert.throws(()=>act(g,a.id,{type:'mortgage',tile:3}),/аукцион/);assert.throws(()=>act(g,b.id,{type:'build',tile:6}),/аукцион/);
 act(g,b.id,{type:'bid',amount:2,tile:6});act(g,c.id,{type:'pass'});act(g,a.id,{type:'pass'});
 assert.equal(g.auction,null);assert.equal(g.properties[6].houses,1);assert.equal(g.properties[1].houses,0);assert.equal(b.cash,1498);assert.equal(bankStock(g).houses,0);assert.equal(g.phase,'roll');assert.equal(g.current,0);
});
test('аукцион здания не перезаписывает аукцион собственности и отвергает чужой участок',()=>{
 const g=setup(),[a,b,c]=g.players;own(g,a,[1,3]);own(g,b,[6,8,9,11]);const rest=BOARD.filter(t=>t.group&&!['northwest','east'].includes(t.group));own(g,c,rest.map(t=>t.id));rest.forEach((t,i)=>g.properties[t.id].houses=i===rest.length-1?1:2);
 g.phase='buy';a.position=5;act(g,a.id,{type:'auction'});assert.throws(()=>act(g,a.id,{type:'build',tile:1}),/аукцион/);assert.equal(g.auction.tile,5);
 const h=setup(),[x,y,z]=h.players;own(h,x,[1,3]);own(h,y,[6,8,9,11]);own(h,z,rest.map(t=>t.id));rest.forEach((t,i)=>h.properties[t.id].houses=i===rest.length-1?1:2);act(h,x.id,{type:'build',tile:1});assert.throws(()=>act(h,x.id,{type:'bid',amount:1,tile:6}),/свой участок/);assert.equal(h.auction.highest,null);
});
