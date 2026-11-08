import test from 'node:test';import assert from 'node:assert/strict';
import { wantDriveInput, shouldEnterCar, shouldExitCar } from '../shared/bot-drive.js';
test('straight ahead = full throttle, no steer',()=>{const r=wantDriveInput(0,0,0,0,-80);assert.equal(r.f,1);assert.ok(Math.abs(r.s)<1e-9);});
test('target to the right steers positive, left negative',()=>{assert.ok(wantDriveInput(0,0,0,30,-30).s>0);assert.ok(wantDriveInput(0,0,0,-30,-30).s<0);});
test('behind = slow and full steer',()=>{const r=wantDriveInput(0,0,0,0,50);assert.ok(r.f<0.5);assert.equal(Math.abs(r.s),1);});
test('obstacle ahead slows',()=>{assert.ok(wantDriveInput(0,0,0,0,-80,4).f<=0.25);});
const car={driver:null,wrecked:false,owner:null};
test('enter rules',()=>{
  assert.ok(shouldEnterCar({car,dist:3,los:true,wpFar:true,roll:0.9}));
  assert.ok(!shouldEnterCar({car,dist:3,los:true,enemyNear:true,wpFar:true}));
  assert.ok(!shouldEnterCar({car:{...car,owner:'p1'},dist:3,los:true,wpFar:true}));
  assert.ok(!shouldEnterCar({car:{...car,wrecked:true},dist:3,los:true,wpFar:true}));
  assert.ok(!shouldEnterCar({car,dist:6,los:true,wpFar:true}));
  assert.ok(!shouldEnterCar({car,dist:3,los:true,cooldown:true,wpFar:true}));
});
test('exit rules',()=>{
  assert.ok(shouldExitCar({hpFrac:0.2}));assert.ok(shouldExitCar({hpFrac:1,enemyVisible:true,enemyDist:8}));
  assert.ok(!shouldExitCar({hpFrac:1,enemyVisible:true,enemyDist:30}));assert.ok(!shouldExitCar({hpFrac:0.2,cooldown:true}));
  assert.ok(shouldExitCar({wrecked:true,cooldown:true}));
});
import fs from 'node:fs';
test('version current everywhere',async()=>{const {APP_VERSION}=await import('../shared/app-version.js');assert.equal(APP_VERSION,'0.16.43');
 assert.equal(JSON.parse(fs.readFileSync(new URL('../public/version.json',import.meta.url))).version,'0.16.43');
 const am=fs.readFileSync(new URL('../android/AndroidManifest.xml',import.meta.url),'utf8');assert.match(am,/versionName="0.16.43"/);assert.match(am,/versionCode="37"/);});
