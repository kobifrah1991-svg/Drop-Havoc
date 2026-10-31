// 0.16.26: driving bots — pure helpers (testable).
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
export const BOT_DRIVE={enterR:4.5,fightR:18,exitEnemyR:12,exitHp:0.35,cooldownMs:3000,arriveR:10,stuckS:1.5,reverseS:0.9,enterChance:0.22};
// Car forward is (-sin yaw,-cos yaw); steer s>0 lowers yaw. Returns stick {f,s} toward (toX,toZ).
export function wantDriveInput(yaw,fromX,fromZ,toX,toZ,clear=Infinity){
  const dx=toX-fromX,dz=toZ-fromZ,dist=Math.hypot(dx,dz);
  if(dist<0.5)return {f:0,s:0};
  const d=wrap(Math.atan2(-dx,-dz)-yaw);
  const s=Math.max(-1,Math.min(1,-d*1.6));
  let f=Math.abs(d)>2.3?0.35:Math.abs(d)>1.2?0.55:1;
  if(dist<20)f=Math.min(f,0.4+dist/40);
  if(clear<6)f=Math.min(f,0.25);else if(clear<12)f=Math.min(f,0.55);
  return {f,s};
}
export function shouldEnterCar({inVehicle,enemyNear,car,dist,los,cooldown,wpFar,roll}){
  if(inVehicle||enemyNear||!car||cooldown||!los)return false;
  if(car.driver||car.wrecked||car.owner)return false;
  if(!(dist<BOT_DRIVE.enterR))return false;
  return wpFar||roll<BOT_DRIVE.enterChance;
}
export function shouldExitCar({hpFrac,wrecked,enemyDist,enemyVisible,arrived,cooldown}){
  if(wrecked)return true;
  if(cooldown)return false;
  if(hpFrac<BOT_DRIVE.exitHp)return true;
  if(enemyVisible&&enemyDist<BOT_DRIVE.exitEnemyR)return true;
  return !!arrived;
}
