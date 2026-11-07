import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicles, GRIP } from '../shared/vehicles.js';
// GTA-style handling: normal grip holds the line, the handbrake makes the car slide (drift) and turn sharper.
const open = () => ({ boxes: Object.assign([], { ramps: [] }), ramps: [], bounds: 400 });
function drive({ handbrake }) {
  const map = open(), sent = [];
  const driver = { id: 'p1', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, stance: 0 };
  const v = createVehicles(map, { send: () => {}, broadcast: (m) => sent.push(m), playerById: (id) => (id === 'p1' ? driver : null) });
  const car = v._cars[0];
  car.p = [0, 0, 0]; car.yaw = 0; driver.p = [0, 0, 0];
  assert.equal(v.interact(driver), true);
  let maxSlip = 0, turned = 0;
  for (let i = 0; i < 90; i++) { v.input(driver, 1, 0); v.tick(1 / 30); } // 3 s straight: build speed
  const yaw0 = car.yaw;
  for (let i = 0; i < 30; i++) { v.input(driver, 1, 1, handbrake ? 1 : 0); v.tick(1 / 30); maxSlip = Math.max(maxSlip, Math.abs(car.slip || 0)); }
  turned = Math.abs(car.yaw - yaw0);
  const drifting = v.state().find((c) => c.id === car.id).drift;
  return { maxSlip, turned, drifting, speed: car.speed };
}
test('normal grip: the car turns without sliding', () => {
  const r = drive({ handbrake: false });
  assert.ok(r.maxSlip < GRIP.drift, `slip ${r.maxSlip}`);
  assert.ok(r.turned > 0.3, `turned ${r.turned}`);
});
test('handbrake turn: the rear slides out (drift), the car turns sharper and loses speed', () => {
  const grip = drive({ handbrake: false }), hb = drive({ handbrake: true });
  assert.ok(hb.maxSlip > GRIP.drift, `slip ${hb.maxSlip}`);
  assert.ok(hb.turned > grip.turned, `${hb.turned} > ${grip.turned}`);
  assert.ok(hb.speed < grip.speed, `${hb.speed} < ${grip.speed}`);
});
