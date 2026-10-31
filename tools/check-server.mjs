import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import {GAME_PROTOCOL} from '../shared/protocol.js';

const base=new URL(process.argv[2]||'http://127.0.0.1:4174');
if(!['http:','https:'].includes(base.protocol))throw Error('Use an HTTP or HTTPS server URL');
base.pathname='/';base.search='';base.hash='';
try{
 const health=await fetch(new URL('health',base),{signal:AbortSignal.timeout(70000)});
 if(!health.ok||(await health.text()).trim()!=='ok')throw Error('Health endpoint failed: '+health.status);
 const response=await fetch(new URL('config',base),{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Config endpoint failed: '+response.status);
 const config=await response.json();if(config.protocol!==GAME_PROTOCOL)throw Error('Server/game version mismatch');
 const rooms=await fetch(new URL('rooms',base),{signal:AbortSignal.timeout(10000)});
 if(!rooms.ok||!Array.isArray(await rooms.json()))throw Error('Room listing is not working');
 const url=new URL(base);url.protocol=base.protocol==='https:'?'wss:':'ws:';
 await new Promise((resolve,reject)=>{
  const ws=new WebSocket(url),timer=setTimeout(()=>{ws.terminate();reject(Error('WebSocket authentication timed out'));},12000);
  const finish=error=>{clearTimeout(timer);ws.terminate();error?reject(error):resolve();};
  ws.once('error',finish);ws.once('open',()=>ws.send(JSON.stringify({t:'auth',protocol:GAME_PROTOCOL,guestToken:randomUUID()})));
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='authed')finish();else if(m.t==='lobbyError')finish(Error(m.key));});
 });
 console.log('PASS: health, game version, public room listing and WebSocket guest authentication at '+base.origin);
}catch(error){console.error('FAIL: '+error.message);process.exitCode=1;}
