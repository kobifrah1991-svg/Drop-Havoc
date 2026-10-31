// One game server may host up to 15 human players across all rooms.
export const PLAYER_LIMIT=15;
export const ROOM_CAPACITIES=[2,4,8,12,15];
export const ffaCapacity=value=>ROOM_CAPACITIES.includes(Number(value))?Number(value):PLAYER_LIMIT;
