// =====================================================
// СОХРАНЕНИЯ
// =====================================================
const LEVEL_COUNT = LEVELS.length;

const Save = {
  stars: new Array(LEVEL_COUNT).fill(0),
  best: new Array(LEVEL_COUNT).fill(0),
  unlocked: 1,
  music: true,
  sfx: true,
  shake: true,
  seen: {},

  total() {
    return this.best.reduce((a, b) => a + b, 0);
  },

  totalStars() {
    return this.stars.reduce((a, b) => a + b, 0);
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
      v: 2, stars: this.stars, best: this.best, unlocked: this.unlocked,
      music: this.music, sfx: this.sfx, shake: this.shake, seen: this.seen
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
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const s = Math.floor(Number(stars[i]));
      const b = Math.floor(Number(best[i]));
      if (s > 0) this.stars[i] = Math.max(this.stars[i], Math.min(s, 3));
      if (b > 0 && Number.isSafeInteger(b)) this.best[i] = Math.max(this.best[i], b);
      if (this.stars[i] > 0) this.unlocked = Math.max(this.unlocked, Math.min(i + 2, LEVEL_COUNT));
    }
    if (Number.isFinite(d.unlocked)) this.unlocked = clamp(Math.max(this.unlocked, Math.floor(d.unlocked)), 1, LEVEL_COUNT);
    if (typeof d.music === 'boolean') this.music = d.music;
    if (typeof d.sfx === 'boolean') this.sfx = d.sfx;
    if (typeof d.shake === 'boolean') this.shake = d.shake;
    if (d.seen && typeof d.seen === 'object') Object.assign(this.seen, d.seen);
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
      const m = /[?&]lang=([a-z-]+)/i.exec(location.search);
      if (m) tag = m[1];
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
    $('btn-pause').addEventListener('click', () => this.show('pause'));
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-resume').addEventListener('click', () => this.show(null));
    $('btn-pause-restart').addEventListener('click', () => this.restart());
    $('btn-pause-levels').addEventListener('click', () => this.show('levels', 'pause'));
    $('btn-levels-back').addEventListener('click', () => this.handleEsc());
    $('btn-next').addEventListener('click', () => {
      Sound.ui();
      if (level >= LEVEL_COUNT - 1) this.showFinal();
      else this.startLevel(level + 1);
    });
    $('btn-retry').addEventListener('click', () => this.restart());
    $('btn-result-levels').addEventListener('click', () => this.show('levels', 'result'));
    $('btn-final-replay').addEventListener('click', () => this.startLevel(0));
    $('btn-final-levels').addEventListener('click', () => this.show('levels', 'final'));

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
    [['tgl-music', Save.music], ['tgl-sfx', Save.sfx], ['tgl-shake', Save.shake]].forEach(([id, on]) => {
      const el = $(id);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.querySelector('.state').textContent = on ? t('on') : t('off');
    });
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
  },

  setScore(v) {
    $('hud-score').textContent = formatNumber(v);
  },

  setHint(text) {
    const el = $('hint');
    if (text) el.textContent = text;
    el.classList.toggle('visible', !!text);
  },

  banner(title, sub, big) {
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
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
  },

  clearBanner() {
    $('banner').classList.remove('play');
  },

  // Вспышка не чаще 2 раз в секунду: безопасно для людей со светочувствительностью
  screenFlash() {
    const now = performance.now();
    if (!Save.shake || now - this.flashAt < 500) return;
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
  },

  buildLevels() {
    const grid = $('levels-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const open = i < Save.unlocked;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-card' + (open ? '' : ' locked') + (i === level ? ' current' : '');
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
    $('result-tip').classList.toggle('hidden', r.win);
    $('result-tip').textContent = levelFails[r.level] <= MAX_EXTRA_HEROES ? t('loseTipExtra') : t('loseTip');
    $('btn-next').classList.toggle('hidden', !r.win);
    $('btn-next').textContent = r.level >= LEVEL_COUNT - 1 ? t('finish') : t('next');
    $('btn-retry').classList.toggle('primary', !r.win);
    $('result-score-wrap').classList.toggle('hidden', !r.win);

    const stars = $('result-stars');
    stars.classList.toggle('hidden', !r.win);
    stars.querySelectorAll('.star').forEach((el) => el.classList.remove('lit'));
    this.show('result');
    if (r.win) {
      for (let i = 0; i < r.stars; i++) {
        later(280 + i * 340, () => {
          stars.querySelectorAll('.star')[i].classList.add('lit');
          Sound.star(i);
        });
      }
    }
  },

  showFinal() {
    const total = Save.totalStars();
    $('final-stars').textContent = `${total}/${LEVEL_COUNT * 3}`;
    $('final-best').textContent = formatNumber(Save.total());
    $('final-note').textContent = total >= LEVEL_COUNT * 3 ? t('finalAllStars') : t('finalMoreStars');
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

async function boot() {
  // Тем, кто просил систему меньше анимировать, сразу отключаем тряску и вспышки
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) Save.shake = false;

  Platform.init();
  Sound.init();

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

  UI.init();
  document.body.classList.add('booted');
  UI.show('title');
  Platform.markReady();
}

boot();
