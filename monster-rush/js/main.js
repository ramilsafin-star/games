import { Game, WORLDS, WEAPONS, clamp } from './game.js';
import { View } from './view.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const audio = new Audio();
let view;
let game;
let last = performance.now();
let lastMode;
let pointer = null;
let pointerX = 0;
let startX = 0;
let toastTimer;
let flashTimer;
let bannerTimer;
let best = 0;
const keys = new Set();

try {
  best = Number(localStorage.getItem('monster-rush-best')) || 0;
  audio.muted = localStorage.getItem('monster-rush-muted') === 'true';
} catch { /* без сохранения тоже можно играть */ }
$('best').textContent = best.toLocaleString('ru');

function updateSound() {
  $('sound').classList.toggle('muted', audio.muted);
  $('sound').setAttribute('aria-label', audio.muted ? 'Включить звук' : 'Выключить звук');
  $('sound').setAttribute('aria-pressed', String(!audio.muted));
}
updateSound();

function clearInput() {
  keys.clear();
  pointer = null;
  if (game) game.targetX = game.x;
}

function toast(text, delay = 2200) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), delay);
}

function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// Большая надпись с названием новой пушки
function banner(title, hint, color) {
  clearTimeout(bannerTimer);
  const el = $('banner');
  $('banner-title').textContent = title;
  $('banner-hint').textContent = hint;
  el.style.setProperty('--tone', color);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1700);
}

function onEvent(e) {
  view?.event(e);
  audio.fx(e);
  switch (e.type) {
    case 'start':
      clearInput();
      audio.active = true;
      toast('Веди пальцем, огонь автоматический', 2600);
      break;
    case 'stage':
      clearInput();
      audio.active = true;
      toast(WORLDS[game.level].name);
      break;
    case 'pause':
      clearInput();
      audio.active = false;
      break;
    case 'end':
      clearInput();
      audio.active = false;
      if (game.score > best) {
        best = game.score;
        try {
          localStorage.setItem('monster-rush-best', String(best));
        } catch { /* рекорд останется до перезагрузки */ }
        $('best').textContent = best.toLocaleString('ru');
      }
      break;
    case 'resume':
      audio.active = true;
      break;
    case 'cage':
      if (e.first) toast('Стреляй по клетке: внутри супероружие!', 3400);
      break;
    case 'cageBreak':
      toast('Хватай пушку!', 1300);
      break;
    case 'weapon': {
      const w = WEAPONS[e.weapon];
      banner(`${w.name.toUpperCase()}!`, w.hint, hex(w.color));
      break;
    }
    case 'weaponOut':
      toast('Супероружие закончилось', 1200);
      break;
    case 'boss':
      toast(`СУПЕРМОНСТР: ${e.name}`, 3200);
      break;
    case 'pickup':
      if (e.pickupType === 'heal') toast('Здоровье +25', 1200);
      if (e.pickupType === 'shield') toast('Энергощит', 1200);
      break;
    case 'shield':
      toast('Щит поглотил удар', 900);
      break;
    case 'bonus':
      toast('Разбей все столбы: сундук откроется!', 3000);
      break;
    case 'chest':
      banner('СУНДУК ОТКРЫТ!', `+${e.gems} кристаллов`, '#ffd24a');
      break;
    case 'hurt':
      clearTimeout(flashTimer);
      $('damage-flash').classList.add('show');
      flashTimer = setTimeout(() => $('damage-flash').classList.remove('show'), 220);
      break;
    default:
      break;
  }
}

function showMode() {
  const mode = game.mode;
  if (mode === lastMode) return;
  lastMode = mode;
  const menu = mode === 'menu';
  document.body.dataset.mode = mode;
  document.body.classList.toggle('menu-mode', menu);
  $('menu').classList.toggle('hidden', !menu);
  $('hud').classList.toggle('hidden', menu);
  // В бою лишних кнопок нет: звук переключается на паузе
  $('fullscreen').classList.toggle('hidden', !menu);
  $('sound').classList.toggle('hidden', mode === 'playing' || mode === 'clear');
  $('pause').classList.toggle('hidden', mode !== 'playing' && mode !== 'paused');
  const modal = ['paused', 'upgrade', 'gameover', 'victory'].includes(mode);
  $('overlay').classList.toggle('hidden', !modal);
  $('upgrades').classList.toggle('hidden', mode !== 'upgrade');
  $('continue').classList.toggle('hidden', mode === 'upgrade');
  $('results').classList.toggle('hidden', !['gameover', 'victory', 'upgrade'].includes(mode));
  $('overlay').dataset.mode = mode;
  if (modal) {
    const text = {
      paused: ['Передышка', 'Монстры подождут.'],
      upgrade: ['Супермонстр повержен!', 'Выбери усиление для следующего мира. Здоровье +45.'],
      gameover: ['Ещё один забег?', 'Монстры выиграли этот раунд. Разбивай клетки: супероружие решает.'],
      victory: ['Ты легенда!', 'Три мира спасены, три супербосса повержены.'],
    }[mode];
    $('modal-title').textContent = text[0];
    $('modal-copy').textContent = text[1];
    $('continue-text').textContent = mode === 'paused' ? 'ПРОДОЛЖИТЬ' : 'ЕЩЁ РАЗ';
    $('results').innerHTML = `<div><strong>${game.score.toLocaleString('ru')}</strong><small>очков</small></div><div><strong>${game.kills}</strong><small>монстров</small></div><div><strong>${game.cagesBroken}</strong><small>клеток</small></div><div><strong>${game.coins}</strong><small>кристаллов</small></div>`;
    (mode === 'upgrade' ? document.querySelector('[data-upgrade]') : $('continue')).focus({ preventScroll: true });
  }
  if (menu) {
    audio.active = false;
    view.setWorld(0);
  }
}

function hud() {
  $('hp').textContent = Math.ceil(game.hp);
  $('hp-fill').style.width = `${game.hp}%`;
  $('hp-fill').classList.toggle('low', game.hp < 30);
  $('shield-count').textContent = game.shield ? `🛡 ${game.shield}` : '';
  $('stage-label').textContent = `ЭТАП ${game.level + 1} / 3`;
  $('world-name').textContent = WORLDS[game.level].name;
  $('stage-fill').style.width = `${Math.min(100, (game.time / game.stageTime) * 100)}%`;
  $('score').textContent = game.score.toLocaleString('ru');
  $('coin-count').textContent = game.coins;
  const w = WEAPONS[game.weapon];
  $('weapon').textContent = w.name;
  $('power').textContent = `Сила ×${game.power.toFixed(1)}`;
  const box = $('weapon-box');
  box.style.setProperty('--tone', hex(w.color));
  box.classList.toggle('super', Boolean(w.time));
  box.classList.toggle('ending', Boolean(w.time) && game.weaponTime < 3);
  $('weapon-fill').style.width = w.time ? `${Math.min(100, (game.weaponTime / w.time) * 100)}%` : '0%';
  const charged = game.novaCharge >= 100;
  const nova = $('nova');
  nova.classList.toggle('charging', !charged);
  nova.setAttribute('aria-disabled', String(!charged));
  nova.style.setProperty('--charge', `${game.novaCharge * 3.6}deg`);
  $('nova-percent').textContent = charged ? 'ГОТОВ' : `${Math.floor(game.novaCharge)}%`;
  $('boss-health').classList.toggle('hidden', !game.boss);
  if (game.boss) {
    const p = Math.max(0, (game.boss.hp / game.boss.maxHp) * 100);
    $('boss-name').textContent = WORLDS[game.level].boss;
    $('boss-fill').style.width = `${p}%`;
    $('boss-percent').textContent = `${Math.ceil(p)}%`;
  }
  $('combo').innerHTML = game.combo >= 5 ? `×${Math.min(4, 1 + Math.floor(game.combo / 5))}<small>серия ${game.combo}</small>` : '';
  $('touch-hint').style.opacity = game.mode === 'playing' && game.runTime < 5 ? '1' : '0';
}

function start() {
  audio.unlock();
  game.start();
  showMode();
  $('start').blur();
}

$('start').addEventListener('click', start);
$('continue').addEventListener('click', () => {
  audio.unlock();
  if (game.mode === 'paused') game.resume();
  else start();
  showMode();
});
$('pause').addEventListener('click', () => {
  if (game.mode === 'paused') game.resume();
  else game.pause();
  showMode();
});
$('back-menu').addEventListener('click', () => {
  clearInput();
  game.reset();
  showMode();
  $('start').focus();
});
document.querySelectorAll('[data-upgrade]').forEach((el) => el.addEventListener('click', () => {
  audio.unlock();
  game.next(el.dataset.upgrade);
  showMode();
  el.blur();
}));
$('sound').addEventListener('click', () => {
  audio.unlock();
  audio.toggle();
  updateSound();
  try {
    localStorage.setItem('monster-rush-muted', String(audio.muted));
  } catch { /* настройка останется до перезагрузки */ }
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('Для полного экрана добавь игру на главный экран');
  } catch {
    toast('Полный экран недоступен в этом окне');
  }
});
$('nova').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  audio.unlock();
  game.nova();
});
$('nova').addEventListener('click', (e) => {
  if (e.detail === 0) game.nova();
});
$('viewport').addEventListener('pointerdown', (e) => {
  if (game.mode !== 'playing' || pointer !== null) return;
  e.preventDefault();
  audio.unlock();
  pointer = e.pointerId;
  pointerX = e.clientX;
  startX = game.targetX;
  $('viewport').setPointerCapture(e.pointerId);
});
$('viewport').addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer || game.mode !== 'playing') return;
  const width = $('viewport').clientWidth;
  game.targetX = clamp(startX + ((e.clientX - pointerX) / Math.min(width, 750)) * 15, -4.3, 4.3);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('viewport').addEventListener(type, (e) => {
    if (e.pointerId === pointer) pointer = null;
  });
}
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD', 'Escape', 'KeyP'].includes(e.code)) e.preventDefault();
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space' && game.mode === 'playing') game.nova();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.mode === 'paused') game.resume();
    else game.pause();
    showMode();
  }
  if (e.code === 'Enter' && game.mode === 'menu' && e.target.tagName !== 'BUTTON') start();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function pauseAway() {
  clearInput();
  game?.pause();
  if (game) showMode();
}
window.addEventListener('blur', pauseAway);
window.addEventListener('resize', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAway();
  last = performance.now();
});
$('overlay').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const focusable = [...$('overlay').querySelectorAll('button')].filter((el) => el.offsetParent !== null);
  const first = focusable[0];
  const final = focusable.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    final.focus();
  }
  if (!e.shiftKey && document.activeElement === final) {
    e.preventDefault();
    first.focus();
  }
});

try {
  game = new Game({ onEvent });
  view = new View($('viewport'), game);
  $('start').disabled = false;
  $('start-text').textContent = 'ИГРАТЬ';
  let hudTimer = 0;
  function frame(now) {
    const ms = now - last;
    const dt = Math.min(0.05, ms / 1000);
    last = now;
    if (!document.hidden) {
      const axis = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      game.update(dt, axis);
      audio.beam(game.beamOn && game.mode === 'playing');
      view.update(dt, ms);
      showMode();
      hudTimer += dt;
      if (hudTimer > 0.07) {
        hud();
        hudTimer = 0;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.monsterRush = {
    snapshot: () => ({
      mode: game.mode, phase: game.phase, level: game.level, hp: game.hp, score: game.score, kills: game.kills, x: game.x, targetX: game.targetX,
      enemies: game.enemies.length, bullets: game.bullets.length, weapon: game.weapon, novaCharge: game.novaCharge, time: game.time, audio: audio.ctx?.state, muted: audio.muted,
      cagesBroken: game.cagesBroken, renderer: view.renderer.info.render, quality: view.quality,
    }),
  };
  if (new URLSearchParams(location.search).has('qa')) window.monsterRush.test = { game, view, audio, showMode, hud, start };
  view.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pauseAway();
    $('error').classList.remove('hidden');
    $('error-detail').textContent = 'Графический контекст потерян. Перезагрузи страницу.';
  });
} catch (error) {
  console.error(error);
  $('error').classList.remove('hidden');
  $('error-detail').textContent = 'Не удалось запустить 3D-сцену. Проверь поддержку WebGL 2 и перезагрузи страницу.';
}
