// =====================================================
// СОХРАНЕНИЯ
// =====================================================
const LEVEL_COUNT = LEVELS.length;

const Save = {
  stars: new Array(LEVEL_COUNT).fill(0),
  best: new Array(LEVEL_COUNT).fill(0),
  gems: new Array(LEVEL_COUNT).fill(0),
  unlocked: 1,
  music: true,
  sfx: true,
  shake: true,
  seen: {},
  medals: 0,        // битовая маска: медаль уровня i — бит i
  trail: 0,         // выбранный след за пуфом (индекс в TRAILS)
  newTrail: false,  // открыт след, который игрок ещё не видел
  gfx: 'auto',      // графика: 'auto' или постоянная ступень 0–2

  hasMedal(i) {
    return (this.medals & (1 << i)) !== 0;
  },

  setMedal(i) {
    this.medals |= 1 << i;
  },

  totalMedals() {
    let n = 0;
    for (let i = 0; i < LEVEL_COUNT; i++) if (this.hasMedal(i)) n++;
    return n;
  },

  total() {
    return this.best.reduce((a, b) => a + b, 0);
  },

  totalStars() {
    return this.stars.reduce((a, b) => a + b, 0);
  },

  totalGems() {
    return this.gems.reduce((a, b) => a + b, 0);
  },

  nextLevel() {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      if (!this.stars[i]) return i;
    }
    return 0;
  },

  recordWin(i, stars, score) {
    this.stars[i] = Math.max(this.stars[i], stars);
    const improved = score > this.best[i];
    this.best[i] = Math.max(this.best[i], score);
    this.unlocked = Math.max(this.unlocked, Math.min(i + 2, LEVEL_COUNT));
    Platform.requestSave();
    if (improved) Platform.sendBest();
  },

  serialize() {
    return JSON.stringify({
      v: 3, stars: this.stars, best: this.best, gems: this.gems, unlocked: this.unlocked,
      music: this.music, sfx: this.sfx, shake: this.shake, seen: this.seen,
      md: this.medals, tr: this.trail, nt: this.newTrail ? 1 : 0, gfx: this.gfx
    });
  },

  // Принимает данные любых прошлых версий и никогда не падает на них
  apply(json) {
    let d = null;
    try {
      d = JSON.parse(json);
    } catch (e) {
      return;
    }
    if (!d || typeof d !== 'object') return;
    const stars = Array.isArray(d.stars) ? d.stars : Array.isArray(d.levelStars) ? d.levelStars : [];
    const best = Array.isArray(d.best) ? d.best : [];
    const gems = Array.isArray(d.gems) ? d.gems : [];
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const s = Math.floor(Number(stars[i]));
      const b = Math.floor(Number(best[i]));
      const g = Math.floor(Number(gems[i]));
      if (g > 0) this.gems[i] = Math.max(this.gems[i], Math.min(g, LEVELS[i].gems || 0));
      if (s > 0) this.stars[i] = Math.max(this.stars[i], Math.min(s, 3));
      if (b > 0 && Number.isSafeInteger(b)) this.best[i] = Math.max(this.best[i], b);
      if (this.stars[i] > 0) this.unlocked = Math.max(this.unlocked, Math.min(i + 2, LEVEL_COUNT));
    }
    if (Number.isFinite(d.unlocked)) this.unlocked = clamp(Math.max(this.unlocked, Math.floor(d.unlocked)), 1, LEVEL_COUNT);
    if (typeof d.music === 'boolean') this.music = d.music;
    if (typeof d.sfx === 'boolean') this.sfx = d.sfx;
    if (typeof d.shake === 'boolean') this.shake = d.shake;
    if (d.seen && typeof d.seen === 'object') Object.assign(this.seen, d.seen);
    // Версия 3: медали, след, графика. В старых сохранениях их нет — остаются как есть
    if (Number.isSafeInteger(d.md) && d.md > 0) this.medals |= d.md & ((1 << LEVEL_COUNT) - 1);
    if (Number.isInteger(d.tr) && d.tr >= 0 && d.tr < TRAILS.length) this.trail = d.tr;
    if (d.nt === 1) this.newTrail = true;
    if (d.gfx === 'auto' || d.gfx === 0 || d.gfx === 1 || d.gfx === 2) this.gfx = d.gfx;
  }
};

// =====================================================
// YOUTUBE PLAYABLES SDK
// =====================================================
const Platform = {
  sdk: typeof ytgame !== 'undefined' ? ytgame : null,
  inEnv: false,
  cloudLoaded: false,
  firstFrameDone: false,
  readyDone: false,
  saving: false,
  saveQueued: false,

  init() {
    this.inEnv = !!(this.sdk && this.sdk.IN_PLAYABLES_ENV);
    window.addEventListener('error', () => this.logError());
    window.addEventListener('unhandledrejection', () => this.logError());
    if (!this.inEnv) return;
    this.sdk.system.onPause(() => systemPause());
    this.sdk.system.onResume(() => systemResume());
    Sound.setYouTubeAudio(this.sdk.system.isAudioEnabled());
    this.sdk.system.onAudioEnabledChange((enabled) => Sound.setYouTubeAudio(enabled));
  },

  logError() {
    if (!this.inEnv) return;
    try {
      this.sdk.health.logError();
    } catch (e) { /* журнал не должен ронять игру */ }
  },

  // Вызывается при отрисовке первого кадра; таймер страхует скрытый WebView
  markFirstFrame() {
    if (this.firstFrameDone) return;
    this.firstFrameDone = true;
    if (this.inEnv) this.sdk.game.firstFrameReady();
  },

  markReady() {
    if (this.readyDone) return;
    this.markFirstFrame();
    this.readyDone = true;
    if (this.inEnv) this.sdk.game.gameReady();
  },

  async loadLanguage() {
    let tag = 'ru';
    if (this.inEnv) {
      tag = 'en';
      try {
        tag = await this.sdk.system.getLanguage();
      } catch (e) { /* остаётся английский */ }
    } else {
      // Локальный запуск: можно проверить язык через ?lang=en
      const m = /[?&](?:vk_language|lang)=([a-z-]+)/i.exec(location.search);
      if (m && /^en\b/i.test(m[1])) tag = 'en';
    }
    setLanguage(tag);
  },

  async loadSave() {
    if (this.inEnv) {
      try {
        const data = await this.sdk.game.loadData();
        this.cloudLoaded = true;
        if (data) Save.apply(data);
      } catch (e) {
        this.logError();
      }
    } else {
      // Только для запуска вне YouTube: там единственным хранилищем остаётся облако
      await window.vkGameHost?.ready;
      try {
        const data = localStorage.getItem('puff_slingers_save');
        if (data) Save.apply(data);
      } catch (e) { /* хранилище недоступно */ }
    }
  },

  requestSave() {
    if (this.saving) {
      this.saveQueued = true;
      return;
    }
    this.flushSave();
  },

  async flushSave() {
    const payload = Save.serialize();
    if (!this.inEnv) {
      try {
        localStorage.setItem('puff_slingers_save', payload);
      } catch (e) { /* хранилище недоступно */ }
      return;
    }
    if (this.saving) {
      this.saveQueued = true;
      return;
    }
    this.saving = true;
    try {
      // saveData до успешного loadData YouTube отклоняет: пробуем загрузить ещё раз и объединить
      if (!this.cloudLoaded) await this.loadSave();
      if (this.cloudLoaded) await this.sdk.game.saveData(Save.serialize());
    } catch (e) {
      this.logError();
    }
    this.saving = false;
    if (this.saveQueued) {
      this.saveQueued = false;
      this.flushSave();
    }
  },

  async sendBest() {
    if (!this.inEnv) return;
    try {
      await this.sdk.engagement.sendScore({ value: Math.floor(Save.total()) });
    } catch (e) {
      this.logError();
    }
  }
};

// =====================================================
// ИНТЕРФЕЙС
// =====================================================
const $ = (id) => document.getElementById(id);

const UI = {
  current: null,
  previous: null,
  flashAt: 0,
  backTarget: null,
  keyboardUser: false,

  init() {
    window.addEventListener('keydown', () => { this.keyboardUser = true; });
    window.addEventListener('pointerdown', () => { this.keyboardUser = false; });
    $('btn-restart').setAttribute('aria-label', t('restart'));
    $('btn-pause').setAttribute('aria-label', t('paused'));
    $('btn-play').addEventListener('click', () => {
      Sound.ui();
      this.startLevel(Save.nextLevel());
    });
    $('btn-title-levels').addEventListener('click', () => this.show('levels', 'title'));
    $('btn-title-trails').addEventListener('click', () => this.show('trails', 'title'));
    $('btn-trails-back').addEventListener('click', () => this.handleEsc());
    // Графика: Авто → Высокая → Средняя → Низкая → Авто
    $('tgl-gfx').addEventListener('click', () => {
      const order = ['auto', 2, 1, 0];
      Save.gfx = order[(order.indexOf(Save.gfx) + 1) % order.length];
      applyGfx();
      this.syncSettings();
      Sound.ui();
      Platform.requestSave();
    });
    $('btn-pause').addEventListener('click', () => this.show('pause'));
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-resume').addEventListener('click', () => this.show(null));
    $('btn-pause-restart').addEventListener('click', () => this.restart());
    $('btn-pause-levels').addEventListener('click', () => this.show('levels', 'pause'));
    $('btn-levels-back').addEventListener('click', () => this.handleEsc());
    $('btn-next').addEventListener('click', async () => {
      Sound.ui();
      if (!(await vkAdBreak())) return;
      if (level >= LEVEL_COUNT - 1) this.showFinal();
      else this.startLevel(level + 1);
    });
    $('btn-retry').addEventListener('click', async () => {
      if (await vkAdBreak()) this.restart();
    });
    $('btn-result-levels').addEventListener('click', () => this.show('levels', 'result'));
    $('btn-final-replay').addEventListener('click', async () => {
      if (await vkAdBreak()) this.startLevel(0);
    });
    $('btn-final-levels').addEventListener('click', () => this.show('levels', 'final'));
    // Главное меню: заставка с живой сценой, как при запуске
    $('vk-menu-pause').textContent = LANG === 'ru' ? 'Меню' : 'Menu';
    document.querySelectorAll('[data-vk-menu]').forEach((el) => {
      if (!el.textContent) el.setAttribute('aria-label', LANG === 'ru' ? 'Главное меню' : 'Main menu');
      el.addEventListener('click', () => {
        Sound.ui();
        loadLevel(level, { attract: true });
        this.show('title');
      });
    });
    // Кнопка звука выключает и включает сразу музыку и эффекты; по отдельности — в паузе
    document.querySelectorAll('.vk-sound').forEach((el) => {
      el.addEventListener('click', () => {
        const on = !(Save.music || Save.sfx);
        Save.music = on;
        Save.sfx = on;
        this.syncSettings();
        Sound.ui();
        Platform.requestSave();
      });
    });

    [['tgl-music', 'music'], ['tgl-sfx', 'sfx'], ['tgl-shake', 'shake']].forEach(([id, key]) => {
      $(id).addEventListener('click', () => {
        Save[key] = !Save[key];
        this.syncSettings();
        Sound.ui();
        Platform.requestSave();
      });
    });
    this.syncSettings();
  },

  syncSettings() {
    Sound.musicOn = Save.music;
    Sound.sfxOn = Save.sfx;
    Sound.applyGains();
    const loud = Save.music || Save.sfx;
    document.querySelectorAll('.vk-sound').forEach((el) => {
      el.classList.toggle('off', !loud);
      el.setAttribute('aria-pressed', loud ? 'true' : 'false');
      el.setAttribute('aria-label', LANG === 'ru' ? (loud ? 'Выключить звук' : 'Включить звук') : loud ? 'Sound off' : 'Sound on');
    });
    [['tgl-music', Save.music], ['tgl-sfx', Save.sfx], ['tgl-shake', Save.shake]].forEach(([id, on]) => {
      const el = $(id);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.querySelector('.state').textContent = on ? t('on') : t('off');
    });
    const gfx = $('tgl-gfx');
    gfx.classList.add('on');
    gfx.querySelector('.state').textContent = Save.gfx === 'auto' ? `${t('gfxAuto')} · ${t('gfx')[quality]}` : t('gfx')[Save.gfx];
  },

  show(name, back) {
    this.previous = this.current;
    if (back !== undefined) this.backTarget = back;
    this.current = name;
    document.querySelectorAll('.screen').forEach((el) => {
      el.classList.toggle('active', el.id === `screen-${name}`);
    });
    const inGame = !name || name === 'pause';
    $('hud').classList.toggle('hidden', !inGame || phase === 'attract');
    if (name === 'levels') this.buildLevels();
    if (name === 'title') this.buildTitle();
    if (name === 'trails') this.buildTrails();
    if (name) {
      // Фокус переводим только тем, кто играет с клавиатуры
      const primaryBtn = document.querySelector(`#screen-${name} .primary, #screen-${name} button`);
      if (primaryBtn && this.keyboardUser) primaryBtn.focus({ preventScroll: true });
      if (name !== 'title') Sound.ui();
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  },

  // На паузе и в меню уровней симуляция не идёт
  pausesSim() {
    return this.current === 'pause' || (this.current === 'levels' && this.backTarget === 'pause');
  },

  handleEsc() {
    if (this.current === 'pause') this.show(null);
    else if (this.current === 'levels') this.show(this.backTarget || 'title');
    else if (this.current === 'trails') this.show('title');
    else if (this.current === 'result' || this.current === 'final') this.show('levels', this.current);
  },

  startLevel(i) {
    this.show(null);
    $('hud').classList.remove('hidden');
    loadLevel(i);
  },

  restart() {
    Sound.ui();
    this.show(null);
    $('hud').classList.remove('hidden');
    loadLevel(level, { quick: true });
  },

  updateHud() {
    $('hud-level').textContent = level + 1;
    this.setScore(score);
    this.updateGems();
  },

  updateGems() {
    $('hud-gems-wrap').classList.toggle('hidden', !gems.length);
    $('hud-gems').textContent = `${gemsTaken}/${gems.length}`;
  },

  setScore(v) {
    $('hud-score').textContent = formatNumber(v);
  },

  setHint(text) {
    const el = $('hint');
    if (text) el.textContent = text;
    el.classList.toggle('visible', !!text);
  },

  banner(title, sub, big, goal) {
    const el = $('banner');
    el.innerHTML = '';
    const a = document.createElement('div');
    a.className = 'banner-title' + (big ? ' big' : '');
    a.textContent = title;
    el.appendChild(a);
    if (sub) {
      const b = document.createElement('div');
      b.className = 'banner-sub';
      b.textContent = sub;
      el.appendChild(b);
    }
    // Задание на медаль — третьей строкой при начале уровня
    if (goal) {
      const c = document.createElement('div');
      c.className = 'banner-goal' + (Save.hasMedal(level) ? ' had' : '');
      c.innerHTML = '<i class="medal-ico"></i>';
      c.appendChild(document.createTextNode(goal));
      el.appendChild(c);
    }
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
  },

  clearBanner() {
    $('banner').classList.remove('play');
  },

  // Вспышка не чаще 2 раз в секунду: безопасно для людей со светочувствительностью
  screenFlash(big) {
    const now = performance.now();
    if (!Save.shake || now - this.flashAt < 500) return;
    $('flash').classList.toggle('big', !!big);
    this.flashAt = now;
    const el = $('flash');
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
  },

  buildTitle() {
    const has = Save.totalStars() > 0;
    $('btn-play').textContent = has ? t('continue') : t('play');
    $('title-best-wrap').classList.toggle('hidden', !has);
    $('title-best').textContent = formatNumber(Save.total());
    $('title-stars').textContent = `${Save.totalStars()}/${LEVEL_COUNT * 3}`;
    const allGems = LEVELS.reduce((a, lv) => a + (lv.gems || 0), 0);
    $('title-gems').textContent = `${Save.totalGems()}/${allGems}`;
    $('title-gems-wrap').classList.toggle('hidden', Save.totalGems() === 0);
    $('title-medals').textContent = `${Save.totalMedals()}/${LEVEL_COUNT}`;
    $('title-medals-wrap').classList.toggle('hidden', Save.totalMedals() === 0);
    $('trails-dot').classList.toggle('hidden', !Save.newTrail);
  },

  // ---------- Следы за пуфом ----------
  buildTrails() {
    if (Save.newTrail) {
      Save.newTrail = false;
      Platform.requestSave();
    }
    $('trails-note').textContent = t('trailsNote').replace('{n}', trailPoints());
    const grid = $('trails-grid');
    grid.innerHTML = '';
    TRAILS.forEach((tr, i) => {
      const open = trailOpen(i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `trail-card trail-${tr.id}` + (open ? '' : ' locked') + (Save.trail === i ? ' on' : '');
      btn.disabled = !open;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      for (let k = 0; k < 5; k++) sw.appendChild(document.createElement('i'));
      btn.appendChild(sw);
      const name = document.createElement('b');
      name.textContent = t('trailNames')[i];
      btn.appendChild(name);
      const sub = document.createElement('small');
      sub.textContent = !open ? t('trailNeed').replace('{n}', tr.need) : Save.trail === i ? t('trailOn') : '';
      btn.appendChild(sub);
      if (open) {
        btn.addEventListener('click', () => {
          Save.trail = i;
          Sound.ui();
          Platform.requestSave();
          this.buildTrails();
        });
      }
      grid.appendChild(btn);
    });
  },

  // ---------- Медаль уровня и разрушомер в HUD ----------
  updateGoal(fresh) {
    const el = $('hud-goal');
    if (!el || !Goals.kind) return;
    $('hud-goal-text').textContent = `${t('goalShort_' + Goals.kind)} ${Goals.short()}`;
    el.classList.toggle('done', Goals.done);
    el.classList.toggle('failed', Goals.failed);
    el.classList.toggle('had', Save.hasMedal(level) && !Goals.done);
    if (fresh) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  },

  // Разрушомер в HUD: стиль меняется, только когда полоска заметно сдвинулась
  tickMeter(dt) {
    const want = Goals.meterShare();
    Goals.shownMeter += (want - Goals.shownMeter) * Math.min(1, dt * 6);
    const v = Goals.bonusGiven ? 1 : Math.round(Goals.shownMeter * 200) / 200;
    const state = `${v}|${Goals.meterMax > 0}|${Goals.bonusGiven}`;
    if (state === this.meterState) return;
    this.meterState = state;
    $('hud-meter-fill').style.transform = `scaleX(${v})`;
    $('hud-meter').classList.toggle('hidden', Goals.meterMax <= 0);
    $('hud-meter').classList.toggle('used', Goals.bonusGiven);
  },

  meterFull() {
    const el = $('hud-meter');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  },

  buildLevels(chapter) {
    if (chapter === undefined) chapter = CHAPTERS.findIndex(([a, b]) => level >= a && level <= b);
    this.chapter = chapter;
    const tabs = $('chapter-tabs');
    tabs.innerHTML = '';
    CHAPTERS.forEach(([a, b], c) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      const open = a < Save.unlocked;
      tab.className = 'tab' + (c === chapter ? ' on' : '') + (open ? '' : ' locked') + (c === CHAPTERS.length - 1 ? ' new' : '');
      tab.setAttribute('aria-selected', c === chapter ? 'true' : 'false');
      let stars = 0;
      let medals = 0;
      for (let i = a; i <= b; i++) {
        stars += Save.stars[i];
        if (Save.hasMedal(i)) medals++;
      }
      const name = document.createElement('b');
      name.textContent = t('chapters')[c];
      tab.appendChild(name);
      const sub = document.createElement('small');
      sub.innerHTML = `<i class="star-ico"></i>${stars}/${(b - a + 1) * 3} <i class="medal-ico"></i>${medals}/${b - a + 1}`;
      tab.appendChild(sub);
      tab.addEventListener('click', () => {
        Sound.ui();
        this.buildLevels(c);
      });
      tabs.appendChild(tab);
    });
    const grid = $('levels-grid');
    grid.innerHTML = '';
    const [from, to] = CHAPTERS[chapter];
    LEVELS.forEach((lv, i) => {
      if (i < from || i > to) return;
      const open = i < Save.unlocked;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-card' + (open ? '' : ' locked') + (i === level ? ' current' : '') + (lv.boss ? ' boss' : '');
      btn.disabled = !open;
      btn.setAttribute('aria-label', `${t('level')} ${i + 1}${open ? '' : ` — ${t('locked')}`}`);
      const thumb = biomeThumb(lv.biome, 200, 120);
      thumb.className = 'thumb';
      btn.appendChild(thumb);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = open ? i + 1 : '';
      if (!open) num.innerHTML = '<svg viewBox="0 0 24 24" class="lock" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z" fill="currentColor"/></svg>';
      btn.appendChild(num);
      const stars = document.createElement('span');
      stars.className = 'mini-stars';
      for (let s = 0; s < 3; s++) {
        const st = document.createElement('i');
        if (s < Save.stars[i]) st.className = 'lit';
        stars.appendChild(st);
      }
      btn.appendChild(stars);
      if (open) {
        const md = document.createElement('i');
        md.className = 'medal-ico mini-medal' + (Save.hasMedal(i) ? ' lit' : '');
        btn.appendChild(md);
      }
      if (lv.gems) {
        const row = document.createElement('span');
        row.className = 'mini-gems';
        for (let g = 0; g < lv.gems; g++) {
          const ge = document.createElement('i');
          if (g < Save.gems[i]) ge.className = 'lit';
          row.appendChild(ge);
        }
        btn.appendChild(row);
      }
      if (open) {
        btn.addEventListener('click', () => {
          Sound.ui();
          this.startLevel(i);
        });
      }
      grid.appendChild(btn);
    });
    $('levels-total').textContent = formatNumber(Save.total());
  },

  showResult(r) {
    $('result-title').textContent = r.win ? t('levelClear') : t('outOfPuffs');
    $('result-card').classList.toggle('lose', !r.win);
    $('result-score').textContent = formatNumber(r.score);
    $('result-best').textContent = formatNumber(Save.best[r.level]);
    $('result-new').classList.toggle('hidden', !r.newBest);
    $('result-bonus-wrap').classList.toggle('hidden', !r.bonus);
    $('result-bonus').textContent = `+${formatNumber(r.bonus)}`;
    $('result-gems-wrap').classList.toggle('hidden', !r.win || !gems.length);
    $('result-gems').textContent = `${gemsTaken}/${gems.length}`;
    $('result-tip').classList.toggle('hidden', r.win);
    $('result-tip').textContent = levelFails[r.level] <= MAX_EXTRA_HEROES ? t('loseTipExtra') : t('loseTip');
    $('btn-next').classList.toggle('hidden', !r.win);
    $('btn-next').textContent = r.level >= LEVEL_COUNT - 1 ? t('finish') : t('next');
    $('btn-retry').classList.toggle('primary', !r.win);
    $('result-score-wrap').classList.toggle('hidden', !r.win);
    // Медаль уровня: получена сейчас, была раньше или нет
    const medal = r.medal || { earned: false };
    const had = Save.hasMedal(r.level);
    const mrow = $('result-medal');
    mrow.classList.toggle('hidden', !r.win);
    mrow.classList.toggle('got', medal.earned);
    mrow.classList.toggle('had', !medal.earned && had);
    mrow.classList.remove('pop');
    $('result-medal-text').textContent = medal.earned ? t('medalGot') : (had ? t('medalHad') + ' ✓ · ' : t('medalMissed') + ' · ') + (medal.earned ? '' : Goals.text().replace(/^[^:]*:\s*/, ''));
    const trail = $('result-trail');
    const fresh = (r.trails || []).map((i) => t('trailNames')[i]);
    trail.classList.toggle('hidden', !fresh.length);
    trail.textContent = fresh.length ? t('newTrail').replace('{name}', fresh.join(', ')) : '';
    // Очки набегают с подпрыгиванием цифр
    this.countUp($('result-score'), r.score);

    const stars = $('result-stars');
    stars.classList.toggle('hidden', !r.win);
    stars.querySelectorAll('.star').forEach((el) => el.classList.remove('lit'));
    this.show('result');
    if (r.win) {
      for (let i = 0; i < r.stars; i++) {
        later(280 + i * 340, () => {
          const st = stars.querySelectorAll('.star')[i];
          st.classList.add('lit');
          this.sparkle(st, i === 1 ? 14 : 10);
          Sound.star(i);
        });
      }
      if (medal.earned) {
        later(280 + r.stars * 340 + 200, () => {
          mrow.classList.add('pop');
          this.sparkle(mrow.querySelector('.medal-ico'), 12);
          Sound.medal();
        });
      }
    }
  },

  // Счёт набегает за ~0,9 с, цифры подпрыгивают
  countUp(el, value) {
    const t0 = performance.now();
    const dur = Save.shake ? 900 : 1;
    clearInterval(this.countTimer);
    el.classList.add('counting');
    this.countTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = formatNumber(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) {
        clearInterval(this.countTimer);
        el.classList.remove('counting');
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    }, 40);
  },

  // Искры вокруг элемента интерфейса (звёзды и медаль на экране итога)
  sparkle(el, count) {
    if (!el || !Save.shake) return;
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      s.className = 'ui-spark';
      const a = (i / count) * TAU + Math.random() * 0.4;
      const d = 40 + Math.random() * 46;
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      s.style.background = i % 3 ? '#ffd23f' : '#ffffff';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  },

  showFinal() {
    const total = Save.totalStars();
    $('final-stars').textContent = `${total}/${LEVEL_COUNT * 3}`;
    $('final-medals').textContent = `${Save.totalMedals()}/${LEVEL_COUNT}`;
    $('final-best').textContent = formatNumber(Save.total());
    $('final-note').textContent = total >= LEVEL_COUNT * 3 && Save.totalMedals() >= LEVEL_COUNT ? t('finalAllStars') : t('finalMoreStars');
    this.show('final');
    Sound.win();
    for (let i = 0; i < 4; i++) {
      later(i * 340, () => FX.confetti(cam.x, cam.y - vh / 2 / cam.zoom, quality > 0 ? 60 : 30, vw / cam.zoom, 120));
    }
  }
};

// =====================================================
// ЗАПУСК
// =====================================================
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

// Трёхмерная версия включается, только если браузер с ней справится. Иначе игра идёт в двумерной
async function start3D() {
  const m = /[?&]gl=([01])/.exec(location.search);
  if (m && m[1] === '0') return;
  try {
    const gl = document.getElementById('gl');
    const mod = await withTimeout(import('./gl/scene3d.js?v=7f585ca2').then((x) => x.createScene3D(gl, !!m)), 15000);
    if (!mod) return;
    scene3d = mod;
    gl.addEventListener('webglcontextlost', () => disable3D('потерян контекст WebGL'));
    gl.hidden = false;
    document.getElementById('vignette').hidden = true;
  } catch (e) {
    console.warn('3D недоступно, работает двумерная версия:', e && e.message);
  }
}

async function boot() {
  // Тем, кто просил систему меньше анимировать, сразу отключаем тряску и вспышки
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) Save.shake = false;

  Platform.init();
  Sound.init();
  await start3D();

  // Сразу рисуем живую сцену: это и есть экран загрузки для YouTube
  resize();
  loadLevel(0, { attract: true });
  if (viewReady) snapCamera();
  startLoop();
  setTimeout(() => Platform.markFirstFrame(), 400);

  const fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('900 40px Rubik', 'PUFF'), document.fonts.load('900 40px Rubik', 'ПУФ')]).catch(() => {})
    : Promise.resolve();
  await Promise.all([Platform.loadLanguage(), Platform.loadSave(), withTimeout(fonts, 1500)]);

  applyGfx();
  UI.init();
  document.body.classList.add('booted');
  UI.show('title');
  Platform.markReady();
}

// =====================================================
// VK: пауза и тишина при сворачивании и во время рекламы
// =====================================================
let vkAdOn = false;
let vkAdBusy = false;
function vkSync() {
  const away = document.hidden || !!window.vkGameHost?.hidden;
  if (away || vkAdOn) {
    systemPause();
    // Начатый уровень ждёт на экране паузы: дальше — по нажатию «Продолжить»
    if (away && UI.current === null && phase !== 'attract' && !levelOver) UI.show('pause');
  } else systemResume();
}
document.addEventListener('visibilitychange', vkSync);
addEventListener('vk-game-visibility', vkSync);
addEventListener('vk-ad', (e) => {
  vkAdOn = !!e.detail.on;
  vkSync();
});
// Пока идёт ролик, нажатия и клавиши до игры не доходят (иначе нажатие включило бы звук)
['pointerdown', 'pointerup', 'click', 'keydown'].forEach((type) => {
  window.addEventListener(type, (e) => {
    if (!vkAdBusy) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
});
// Реклама VK между уровнями: не чаще раза в 2 минуты и никогда сразу после запуска
async function vkAdBreak() {
  if (vkAdBusy) return false;
  vkAdBusy = true;
  try {
    await window.vkGameHost?.interstitial();
  } finally {
    vkAdBusy = false;
  }
  return true;
}
// Баннер VK внизу — только на экранах заставки, уровней, паузы, итога и финала; пока летят пушинки, его нет
window.vkGameHost?.bannerWhen(() => !!UI.current);

boot();
