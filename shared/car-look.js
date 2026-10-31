// 0.16.24: touch/mouse/keyboard/gyro look while driving. Independent offsets on top of the car's
// network yaw, so the server-driven heading no longer wipes the player's look-around.
export const CAR_LOOK_YAW_MAX = Math.PI * 0.95;
export const CAR_LOOK_PITCH_MIN = -0.5, CAR_LOOK_PITCH_MAX = 0.9;
export function clampCarLook(yaw, pitch) {
  const y = Math.max(-CAR_LOOK_YAW_MAX, Math.min(CAR_LOOK_YAW_MAX, Number(yaw) || 0));
  const p = Math.max(CAR_LOOK_PITCH_MIN, Math.min(CAR_LOOK_PITCH_MAX, Number(pitch) || 0));
  return { yaw: y, pitch: p };
}
// Applies a look delta: in a vehicle it goes to the car-look offsets, on foot to me.yaw/pitch.
export function applyLook(me, look, dYaw, dPitch) {
  if (me.vehicle) { const c = clampCarLook(look.yaw + dYaw, look.pitch + dPitch); look.yaw = c.yaw; look.pitch = c.pitch; }
  else { me.yaw += dYaw; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch + dPitch)); }
}
// CAM button / V key: in a car cycle car cameras, on foot toggle first/third person.
export function viewButtonAction(inVehicle) { return inVehicle ? 'cycleCarCam' : 'toggleView'; }
