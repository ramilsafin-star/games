import { WORLDS, clamp } from './game.js?v=ccdbda82';

export const UPGRADES = {
  health: { name: 'Здоровье', step: '+15 к максимуму', costs: [60, 140, 260] },
  power: { name: 'Урон', step: '+15% к урону оружия', costs: [80, 180, 320] },
  duration: { name: 'Супероружие', step: '+1,5 с работы', costs: [70, 160, 300] },
  magnet: { name: 'Магнит', step: '+0,9 м притяжения', costs: [50, 120, 220] },
  shield: { name: 'Щиты', step: 'Чаще выпадают с монстров', costs: [150, 300, 450] },
};
export const MAX_RANK = 3;
const amount = (n, max) => typeof n === 'number' && Number.isFinite(n) ? clamp(Math.floor(n), 0, max) : 0;

export function loadProfile(raw) {
  return {
    gems: amount(raw?.gems, 99999999),
    unlocked: amount(raw?.unlocked, WORLDS.length - 1),
    best: WORLDS.map((_, i) => amount(raw?.best?.[i], 99999999)),
    ranks: Object.fromEntries(Object.keys(UPGRADES).map(key => [key, amount(raw?.ranks?.[key], MAX_RANK)])),
  };
}

export function price(key, rank) {
  return UPGRADES[key].costs[rank];
}
