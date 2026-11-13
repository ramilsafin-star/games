import { WORLDS, clamp } from './game.js?v=4d3622b6';

export const UPGRADES = {
  health: { name: 'Здоровье', step: '+10 к максимуму', cost: 160 },
  power: { name: 'Бластер', step: '+12% к урону бластера', cost: 200 },
  duration: { name: 'Супероружие', step: '+2 с работы', cost: 180 },
  magnet: { name: 'Магнит', step: '+0,6 м притяжения', cost: 120 },
  shield: { name: 'Щиты', step: 'Чаще выпадают с монстров', cost: 150 },
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
  return UPGRADES[key].cost * (1 + rank);
}
