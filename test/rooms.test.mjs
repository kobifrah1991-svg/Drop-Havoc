import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';
import {GAME_PROTOCOL} from '../shared/protocol.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function waitFor(client,predicate){
  const old=client.messages.find(predicate);if(old)return Promise.resolve(old);
  return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{client.ws.off('message',on);reject(Error('Message timed out: '+predicate.toString()+'; received: '+client.messages.map(m=>m.t).join(',')));},8000);function on(raw){const m=JSON.parse(raw);if(predicate(m)){clearTimeout(timeout);client.ws.off('message',on);resolve(m);}}client.ws.on('message',on);});
}
async function client(port){
  const ws=new WebSocket(`ws://127.0.0.1:${port}`),c={ws,messages:[],send:m=>ws.send(JSON.stringify(m))};
  ws.on('message',m=>c.messages.push(JSON.parse(m)));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  c.send({t:'auth',protocol:GAME_PROTOCOL,guestToken:randomUUID()});await waitFor(c,m=>m.t==='authed');return c;
}
test('real server: 1V1, four-client 2V2, privacy, capacity and protocol compatibility',{timeout:20000},async()=>{
  const data=fs.mkdtempSync(path.join(root,'.test-data-')),port=4178,sockets=[];
  const proc=spawn(process.execPath,['server.js'],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),BOTS:'0',DATA_DIR:data,GOOGLE_CLIENT_ID:'',ADMIN_CODE:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:''},stdio:['ignore','pipe','pipe']});
  proc.stderr.on('data',d=>process.stderr.write(d));
  try{
    await new Promise((resolve,reject)=>{let errors='';const timer=setTimeout(()=>reject(Error('Server did not start: '+errors)),6000);proc.stderr.on('data',d=>{errors+=d;});proc.stdout.on('data',d=>{if(String(d).includes('running on')){clearTimeout(timer);resolve();}});proc.once('error',reject);proc.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+errors));});});
    const a=await client(port);sockets.push(a.ws);a.send({t:'create',mode:'duel',public:true});const room=await waitFor(a,m=>m.t==='room');a.send({t:'join',name:'One'});await waitFor(a,m=>m.t==='welcome');
    let list=await (await fetch(`http://127.0.0.1:${port}/rooms`)).json();assert.equal(list[0].code,room.code);assert.equal(list[0].capacity,2);assert.equal(list[0].players,1);
    const b=await client(port);sockets.push(b.ws);b.send({t:'joinCode',code:room.code});await waitFor(b,m=>m.t==='room');b.send({t:'join',name:'Two'});await waitFor(b,m=>m.t==='welcome');
    list=await(await fetch(`http://127.0.0.1:${port}/rooms`)).json();assert.equal(list[0].players,2);
    a.send({t:'ready',v:true});b.send({t:'ready',v:true});await Promise.all([waitFor(a,m=>m.t==='match'&&m.state==='playing'),waitFor(b,m=>m.t==='match'&&m.state==='playing')]);
    await waitFor(a,m=>m.t==='spawn');await waitFor(b,m=>m.t==='spawn');
    const c=await client(port);sockets.push(c.ws);c.send({t:'create',mode:'team2',public:false});const hidden=await waitFor(c,m=>m.t==='room');
    list=await(await fetch(`http://127.0.0.1:${port}/rooms`)).json();assert.ok(!list.some(r=>r.code===hidden.code));
    c.send({t:'join',name:'Squad One'});await waitFor(c,m=>m.t==='welcome');
    const squad=[c];
    for(let i=0;i<3;i++){
      const peer=await client(port);sockets.push(peer.ws);peer.send({t:'joinCode',code:hidden.code});await waitFor(peer,m=>m.t==='room');peer.send({t:'join',name:'Squad '+(i+2)});await waitFor(peer,m=>m.t==='welcome');squad.push(peer);
      if(i===0){c.send({t:'ready',v:true});peer.send({t:'ready',v:true});const lobby=await waitFor(peer,m=>m.t==='lobby'&&m.players.length===2&&m.players.every(p=>p.ready));assert.equal(lobby.countdownAt,0,'2V2 must wait for four humans');}
    }
    const config=await(await fetch(`http://127.0.0.1:${port}/config`)).json();assert.equal(config.protocol,GAME_PROTOCOL);
    const oldWs=new WebSocket(`ws://127.0.0.1:${port}`),old={ws:oldWs,messages:[]};sockets.push(oldWs);oldWs.on('message',raw=>old.messages.push(JSON.parse(raw)));
    await new Promise((resolve,reject)=>{oldWs.once('open',resolve);oldWs.once('error',reject);});
    oldWs.send(JSON.stringify({t:'create',mode:'ffa'}));assert.equal((await waitFor(old,m=>m.t==='lobbyError')).key,'rooms.version');
    old.messages=[];oldWs.send(JSON.stringify({t:'auth',protocol:'old-version'}));assert.equal((await waitFor(old,m=>m.t==='lobbyError')).key,'rooms.version');
    for(const peer of squad)peer.send({t:'ready',v:true});
    await Promise.all(squad.map(peer=>waitFor(peer,m=>m.t==='match'&&m.state==='playing')));
    const snapshots=await Promise.all(squad.map(peer=>waitFor(peer,m=>m.t==='snap'&&m.players.length===4)));
    const ids=snapshots[0].players.map(p=>p.id).sort();
    for(const snap of snapshots){assert.deepEqual(snap.players.map(p=>p.id).sort(),ids);assert.ok(snap.players.every(p=>p.parachuting&&p.hp===200&&p.p[1]===110));}
    const overflow=await client(port);sockets.push(overflow.ws);overflow.send({t:'joinCode',code:hidden.code});assert.equal((await waitFor(overflow,m=>m.t==='lobbyError')).key,'sys.roomFull');
    for(const ws of sockets)ws.terminate();
    for(let retry=0;retry<20;retry++){
      const cfg=await(await fetch(`http://127.0.0.1:${port}/config`)).json();if(!cfg.online)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    const swarm=[];let largeRoom;
    for(let i=0;i<15;i++){
      const peer=await client(port);sockets.push(peer.ws);swarm.push(peer);
      peer.send(i?{t:'joinCode',code:largeRoom.code}:{t:'create',mode:'ffa',capacity:15,public:true});
      const assigned=await waitFor(peer,m=>m.t==='room');if(!i)largeRoom=assigned;
      assert.equal(assigned.capacity,15);peer.send({t:'join',name:'Network '+i});await waitFor(peer,m=>m.t==='welcome');
    }
    const all=await Promise.all(swarm.map(peer=>waitFor(peer,m=>m.t==='snap'&&m.players.length===15)));
    const allIds=all[0].players.map(p=>p.id).sort();for(const snap of all)assert.deepEqual(snap.players.map(p=>p.id).sort(),allIds);
    for(let round=0;round<5;round++){
      for(const peer of swarm)peer.send({t:'ping',c:round});
      await Promise.all(swarm.map(peer=>waitFor(peer,m=>m.t==='pong'&&m.c===round)));
    }
    const extra=await client(port);sockets.push(extra.ws);
    for(const action of [{t:'joinCode',code:largeRoom.code},{t:'create',mode:'ffa',capacity:2},{t:'quickMatch'}]){
      extra.messages=[];extra.send(action);assert.equal((await waitFor(extra,m=>m.t==='lobbyError')).key,'rooms.serverFull');
    }
    const fullConfig=await(await fetch(`http://127.0.0.1:${port}/config`)).json();assert.equal(fullConfig.online,15);assert.equal(fullConfig.maxPlayers,15);
    list=await(await fetch(`http://127.0.0.1:${port}/rooms`)).json();assert.equal(list[0].capacity,15);assert.equal(list[0].players,15);
  }finally{for(const ws of sockets)ws.terminate();if(proc.exitCode===null&&!proc.killed){const ended=new Promise(resolve=>proc.once('exit',resolve));proc.kill();await ended;}const prefix=path.join(root,'.test-data-');if(!path.resolve(data).startsWith(prefix))throw Error('Unexpected test cleanup path');fs.rmSync(data,{recursive:true,force:true});}
});
