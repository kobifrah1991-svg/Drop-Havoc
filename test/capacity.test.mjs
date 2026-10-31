import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../shared/game.js';
import {ROOM_CAPACITIES} from '../shared/limits.js';

for(const capacity of ROOM_CAPACITIES)test(`selected ${capacity}-player room accepts that many humans and rejects one more`,()=>{
 const game=createGame({bots:0,capacity}),connections=[];
 try{
  assert.equal(game.config.capacity,capacity);
  for(let i=0;i<capacity+1;i++){
   const messages=[],conn=game.connect({readyState:1,send:s=>messages.push(JSON.parse(s)),close(){}});connections.push(conn);
   conn.message(JSON.stringify({t:'join',name:'Player '+i}));
   assert.equal(messages.some(m=>m.t==='welcome'),i<capacity);
   assert.equal(messages.some(m=>m.t==='full'),i===capacity);
  }
  assert.equal(game.humanCount(),capacity);
 }finally{for(const conn of connections)conn.close();game.stop();}
});
test('team modes keep their own capacities and invalid sizes cannot exceed 15',()=>{
 for(const [opts,expected]of [[{mode:'duel',capacity:15},2],[{mode:'team2',capacity:15},4],[{capacity:1000},15],[{capacity:-1},15]]){
  const game=createGame(opts);assert.equal(game.config.capacity,expected);game.stop();
 }
});
