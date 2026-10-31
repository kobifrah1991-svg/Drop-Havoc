import { rayWorld, stanceOf } from './physics.js';
export function createChests(map,{broadcast,send,reward,grantEquipment,now=Date.now,random=Math.random}){
  const chests=(map.chests||[]).map(c=>({...c,opened:false}));
  let drops=[];
  const dropState=()=>drops.filter(d=>!d.taken).map(({id,p,kind,loot,origin})=>({id,p,kind,loot,origin}));
  const state=()=>chests.map(c=>({id:c.id,p:c.p,rare:c.rare,opened:c.opened}));
  function open(player,id){
    if(!player?.alive || typeof id!=='string')return false;
    const chest=chests.find(c=>c.id===id);
    if(!chest||chest.opened||Math.hypot(...player.p.map((n,i)=>n-chest.p[i]))>2.8)return false;
    const eye=[player.p[0],player.p[1]+stanceOf(player.stance).eye,player.p[2]];
    const target=[chest.p[0],chest.p[1]+0.45,chest.p[2]],dist=Math.hypot(...target.map((n,i)=>n-eye[i]));
    if(dist>0.01&&rayWorld(eye,target.map((n,i)=>(n-eye[i])/dist),map.boxes,dist)<dist-0.05)return false;
    // Claim synchronously before any callbacks: duplicate packets and simultaneous openers lose.
    chest.opened=true;
    const weapon=(chest.rare?['sniper','m4','shotgun']:['rifle','smg','pistol'])[Math.min(2,Math.floor(random()*3))];
    const loot={credits:chest.rare?60:15,xp:chest.rare?100:25,armor:chest.rare?70:25,helmet:chest.rare?45:15,weapon};
    const packs=[['weapon',{weapon}],['armor',{armor:loot.armor}],['helmet',{helmet:loot.helmet}],['credits',{credits:loot.credits,xp:loot.xp}]];
    packs.forEach(([kind,contents],i)=>{const angle=i*Math.PI/2;drops.push({id:chest.id+'-'+kind,p:[chest.p[0]+Math.cos(angle)*0.95,chest.p[1],chest.p[2]+Math.sin(angle)*0.95],origin:[...chest.p],kind,loot:contents,taken:false});});
    broadcast({t:'chests',chests:state(),drops:dropState(),opened:chest.id,by:player.id});
    return true;
  }
  function pickup(player,id){
    const item=drops.find(d=>d.id===id&&!d.taken);
    if(!player?.alive||!item||Math.hypot(...player.p.map((n,i)=>n-item.p[i]))>2.2)return false;
    const eye=[player.p[0],player.p[1]+stanceOf(player.stance).eye,player.p[2]],target=[item.p[0],item.p[1]+0.3,item.p[2]],distance=Math.hypot(...target.map((n,i)=>n-eye[i]));
    if(distance>0.01&&rayWorld(eye,target.map((n,i)=>(n-eye[i])/distance),map.boxes,distance)<distance-0.05)return false;
    item.taken=true;grantEquipment(player,item.loot);if(item.kind==='credits')reward?.(player,item.loot);
    send(player,{t:'chestReward',kind:item.kind,...item.loot});
    broadcast({t:'chests',chests:state(),drops:dropState()});return true;
  }
  function reset(){for(const c of chests)c.opened=false;drops=[];broadcast({t:'chests',chests:state(),drops:[]});}
  return {state,open,pickup,dropState,reset};
}
