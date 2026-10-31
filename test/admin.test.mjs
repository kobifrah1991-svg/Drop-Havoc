import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAdmin} from '../admin.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('only Owner can change persistent roles; last owner cannot remove own role',()=>{
 const dir=fs.mkdtempSync(path.join(root,'.test-admin-'));const staffFile=path.join(dir,'admins.json');
 fs.writeFileSync(staffFile,JSON.stringify({'owner@example.test':'Owner'}));
 const messages=[];const owner={user:{email:'owner@example.test'},send:m=>messages.push(m)},player={user:{email:'player@example.test'},send:m=>messages.push(m)};
 const sessions=new Set([owner,player]);const admin=createAdmin({dataDir:dir,rooms:new Map(),sessions});
 try{
  admin.onAuth(owner);admin.onAuth(player);assert.equal(owner.role,'Owner');assert.equal(player.role,'Player');
  admin.handle(player,'setrole',['player@example.test','Owner']);assert.equal(player.role,'Player');
  assert.equal(JSON.parse(fs.readFileSync(staffFile)).hasOwnProperty('player@example.test'),false);
  admin.handle(owner,'setrole',['player@example.test','Admin']);assert.equal(player.role,'Admin');
  assert.equal(JSON.parse(fs.readFileSync(staffFile))['player@example.test'],'Admin');
  admin.handle(owner,'setrole',['owner@example.test','Player']);assert.equal(owner.role,'Owner');
  const again=createAdmin({dataDir:dir,rooms:new Map(),sessions});again.onAuth(player);assert.equal(player.role,'Admin');
 }finally{if(!path.resolve(dir).startsWith(path.join(root,'.test-admin-')))throw Error('Unexpected cleanup path');fs.rmSync(dir,{recursive:true,force:true});}
});
