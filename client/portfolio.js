import {BOARD,GROUPS} from '../shared/board.mjs';

// One grouping for the compact player cards and the expanded portfolio.
export function portfolioGroups(game,player){
  const groups=[...Object.entries(GROUPS).map(([id,g])=>({id,...g,members:BOARD.filter(t=>t.group===id)})),
    {id:'metro',name:'Метро',color:'#a4b6c9',members:BOARD.filter(t=>t.type==='station')},
    {id:'utilities',name:'Городские службы',color:'#96a8b1',members:BOARD.filter(t=>t.type==='utility')}];
  return groups.map(g=>{const tiles=g.members.filter(t=>game.properties[t.id]?.owner===player).map(t=>{const v=game.properties[t.id];return {...t,level:v.houses||0,houses:v.houses===5?0:v.houses||0,hotel:v.houses===5,mortgaged:!!v.mortgaged,rent:game.rents?.[t.id]};});return {...g,total:g.members.length,complete:tiles.length===g.members.length,tiles};}).filter(g=>g.tiles.length);
}
export function portfolioTotals(groups){return groups.reduce((n,g)=>{for(const t of g.tiles){n.properties++;n.houses+=t.houses;n.hotels+=Number(t.hotel);n.mortgages+=Number(t.mortgaged);}return n;},{properties:0,houses:0,hotels:0,mortgages:0});}
