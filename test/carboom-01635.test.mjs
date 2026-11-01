import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { createVehicles, carBlastDmg, CAR_HP } from '../shared/vehicles.js';
import { APP_VERSION, cmpVer } from '../shared/app-version.js';
const m=()=>({boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111,noVehicles:false});
test('0.16.35 wreck triggers a car explosion with position and driver',()=>{
 const booms=[];const v=createVehicles(m(),{send(){},broadcast(){},playerById:()=>null,onBoom:(c,e)=>booms.push(e)});
 const c=v._cars[0];v.damage(c.id,9999,'p1');assert.ok(c.wrecked);assert.equal(booms.length,1);assert.equal(booms[0].by,'p1');
 v.damage(c.id,9999);assert.equal(booms.length,1);});
test('0.16.35 blast damage: heavy in car, falloff, none far away',()=>{
 assert.ok(carBlastDmg(0,true)>=100);assert.ok(carBlastDmg(0)>carBlastDmg(5));assert.ok(carBlastDmg(5)>0);
 assert.equal(carBlastDmg(CAR_HP.blastRadius+0.5),0);assert.equal(carBlastDmg(30),0);});
test('0.16.35 game wires carBoom to players',()=>{const g=fs.readFileSync('shared/game.js','utf8');assert.match(g,/onBoom:\(c,e\)=>carBoom\(e\)/);assert.match(g,/carBlastDmg\(d,inCar\)/);});
test('0.16.35 wrecked cars still never self-repair',()=>{const v=createVehicles(m(),{send(){},broadcast(){},playerById:()=>null});const c=v._cars[0];v.damage(c.id,9999);for(let i=0;i<50;i++)v.tick?.(0.5,Date.now()+i*60000);assert.ok(c.wrecked);});
test('0.16.35+ version',()=>assert.ok(cmpVer(APP_VERSION,'0.16.35')>=0));
