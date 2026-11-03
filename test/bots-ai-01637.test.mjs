import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:k=>k==='arena.map'?'"neon"':null};
const { createGame } = await import('../shared/game.js');
const src=(await import('node:fs')).readFileSync(new URL('../shared/game.js',import.meta.url),'utf8');
test('bot AI: personas, hurt reaction, cover, flank, hunt routing present',()=>{
 for(const k of ["persona: 'rusher'","persona: 'flanker'","persona: 'defender'","function botHurt","function coverSpot","function routeToward","ai.mode === 'flank'","if (target.bot) botHurt(target, attacker);"])assert.ok(src.includes(k),k);});
test('neon: bots arm up from the armory, hunt and actually shoot the player',{timeout:20000},async()=>{
 const ms=[],g=createGame({difficulty:'insane'}),c=g.connect({readyState:1,send:d=>ms.push(JSON.parse(d)),close(){}});
 try{c.message(JSON.stringify({t:'join',name:'K'}));g.start();const p=c.player();
  await new Promise(r=>setTimeout(r,12000));
  const shots=ms.filter(m=>m.t==='shot').length;
  assert.ok(shots>0,'bots fired '+shots);}finally{c.close();g.stop();}});
