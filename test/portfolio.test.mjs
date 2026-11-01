import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioGroups,portfolioTotals} from '../client/portfolio.js';
import {newGame,addPlayer,publicGame} from '../server/game.mjs';
const setup=()=>{const g=newGame('PORTFOLIO'),a=addPlayer(g,'A','cat'),b=addPlayer(g,'B','ufo');return {g,a,b};};
test('портфель группирует собственность по цветам, метро и службам; чужие участки не попадают',()=>{
 const{g,a,b}=setup();for(const id of [6,8,9,11,5,12])g.properties[id]={owner:a.id,houses:0,mortgaged:false};g.properties[39]={owner:b.id,houses:5,mortgaged:false};const groups=portfolioGroups(publicGame(g,a.id),a.id);assert.deepEqual(groups.map(x=>x.id),['east','metro','utilities']);assert.equal(groups[0].complete,true);assert.equal(groups[0].total,4);delete g.properties[11];assert.equal(portfolioGroups(g,a.id)[0].complete,false);
});
test('отель считается одним отелем, не пятью домами; залоги и аренда берутся из игрового состояния',()=>{
 const{g,a}=setup();g.properties[1]={owner:a.id,houses:5,mortgaged:false};g.properties[3]={owner:a.id,houses:3,mortgaged:false};g.properties[5]={owner:a.id,houses:0,mortgaged:true};const groups=portfolioGroups(publicGame(g,a.id),a.id);assert.deepEqual(portfolioTotals(groups),{properties:3,houses:3,hotels:1,mortgages:1});assert.equal(groups[0].tiles[0].rent,250);assert.equal(groups[1].tiles[0].rent,0);
});
test('обновлённое владение сразу меняет сводку; построение портфеля не меняет игру',()=>{
 const{g,a,b}=setup();g.properties[1]={owner:a.id,houses:0,mortgaged:false};const before=JSON.stringify(g);portfolioGroups(g,a.id);assert.equal(JSON.stringify(g),before);g.properties[1].owner=b.id;assert.deepEqual(portfolioGroups(g,a.id),[]);assert.equal(portfolioTotals(portfolioGroups(g,b.id)).properties,1);
});
