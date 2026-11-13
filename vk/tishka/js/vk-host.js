// Общий слой VK-версий игр (games-portal/vk). Подключается обычным скриптом до кода игры:
//   <script src="./js/vk-host.js" data-keys="ключ-сохранения" data-ad-gap="120"></script>
// Вне VK ничего не делает, игра работает как на портале.
// В VK: сообщает о запуске (VKWebAppInit), шлёт событие «vk-game-visibility» при сворачивании,
// показывает рекламу между экранами не чаще data-ad-gap секунд и хранит сохранения из data-keys
// в облаке VK, чтобы прогресс был одинаковым на телефоне и компьютере (правило 2.3.8).
// Баннер VK внизу экрана — только на спокойных экранах, которые называет сама игра:
//   vkGameHost.bannerWhen(() => меню, выбор уровня, итоги или пауза)   — или вручную vkGameHost.banner(true | false).
// Пока баннер на экране, у <html> класс vk-banner (для отступов в VK-версии), на window — событие «vk-banner».
(() => {
  const me = document.currentScript;
  const bridge = window.vkBridge;
  const appId = new URLSearchParams(location.search).get("vk_app_id");
  const inVk = !!bridge && (bridge.isWebView() || (bridge.isIframe() && /^[1-9]\d*$/.test(appId ?? "")));

  const host = {
    inVk,
    hidden: false,
    adShowing: false,
    // Код игры ждёт ready перед чтением сохранения: облачная копия к этому времени уже в localStorage
    ready: Promise.resolve(),
    interstitial: async () => false,
    rewardReady: false,
    rewarded: async () => false,
    // Баннер: вне VK вызовы ничего не делают
    banner: () => {},
    bannerWhen: () => {},
    bannerOn: false,
    bannerHeight: 0,
  };
  window.vkGameHost = host;
  if (!inVk) return;

  const send = (method, params) => bridge.send(method, params);
  const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  // VKWebAppInit — сразу, до загрузки ресурсов: VK ждёт его не дольше 30 секунд.
  // Баннер просим только после ответа на VKWebAppInit.
  let launched = false;
  send("VKWebAppInit")
    .then(() => {
      launched = true;
      syncBanner();
    })
    .catch(() => console.warn("Не удалось подтвердить запуск в VK."));

  bridge.subscribe(({ detail }) => {
    if (detail.type === "VKWebAppBannerAdUpdated" || detail.type === "VKWebAppBannerAdClosedByUser") {
      bannerEvent(detail.type, detail.data || {});
      return;
    }
    if (detail.type === "VKWebAppViewHide") {
      host.hidden = true;
      pushAll();
    } else if (detail.type === "VKWebAppViewRestore") {
      host.hidden = false;
      calmDown();
    } else return;
    fire("vk-game-visibility");
    syncBanner();
  });

  // ---------- Сохранения в облаке VK ----------
  // В облаке лежит {t: время записи, v: строка из localStorage}; в localStorage рядом — время
  // последней записи. При запуске побеждает более свежая копия.
  const keys = (me?.dataset.keys || "").split(",").map((k) => k.trim()).filter(Boolean);
  const LIMIT = 4000; // VK хранит до 4096 байт на ключ
  const nativeSet = Storage.prototype.setItem;
  const stamp = (k) => "vk-t:" + k;
  const local = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        nativeSet.call(localStorage, k, v);
      } catch {}
    },
  };
  const dirty = new Set();
  let pushTimer = 0;
  function pushAll() {
    clearTimeout(pushTimer);
    pushTimer = 0;
    for (const k of dirty) {
      const v = local.get(k);
      if (v == null) continue;
      const box = JSON.stringify({ t: Number(local.get(stamp(k))) || Date.now(), v });
      if (new Blob([box]).size > LIMIT) {
        console.warn("Сохранение слишком большое для облака VK:", k);
        continue;
      }
      send("VKWebAppStorageSet", { key: k, value: box }).catch(() => dirty.add(k));
    }
    dirty.clear();
  }
  if (keys.length) {
    // Перехват записи: игра пишет в localStorage как обычно, мы отмечаем время и через 2 с шлём в облако
    Storage.prototype.setItem = function (k, v) {
      nativeSet.call(this, k, v);
      if (this === window.localStorage && keys.includes(k)) {
        local.set(stamp(k), String(Date.now()));
        dirty.add(k);
        if (!pushTimer) pushTimer = setTimeout(pushAll, 2000);
      }
    };
    addEventListener("pagehide", pushAll);

    const pull = send("VKWebAppStorageGet", { keys })
      .then(({ keys: got }) => {
        for (const { key, value } of got || []) {
          let box = null;
          try {
            box = value ? JSON.parse(value) : null;
          } catch {}
          const mine = Number(local.get(stamp(key))) || 0;
          if (box && typeof box.v === "string" && box.t > mine) {
            local.set(key, box.v);
            local.set(stamp(key), String(box.t));
          } else if (local.get(key) != null && (!box || mine > box.t)) dirty.add(key);
        }
        if (dirty.size) pushAll();
      })
      .catch(() => console.warn("Облачное сохранение VK недоступно, играем с локальным."));
    // Если VK не ответил за 2,5 с, игра стартует с локальным сохранением
    host.ready = Promise.race([pull, new Promise((r) => setTimeout(r, 2500))]);
  }

  // ---------- Реклама ----------
  // Только между экранами (переход к следующему матчу или уровню) и не чаще gap секунд.
  // Отсчёт идёт от запуска: при входе в игру рекламы не бывает (правило 5.1.5.2).
  const gap = (Number(me?.dataset.adGap) || 120) * 1000;
  let lastAd = Date.now();
  const check = (format) =>
    send("VKWebAppCheckNativeAds", { ad_format: format })
      .then((r) => !!r.result)
      .catch(() => false);
  const preload = () => {
    check("interstitial");
    check("reward").then((ok) => {
      host.rewardReady = ok;
      fire("vk-reward-ready", ok);
    });
  };
  preload();
  setInterval(() => {
    if (!host.adShowing) preload();
  }, 60000);

  async function show(format) {
    if (host.adShowing) return false;
    host.adShowing = true;
    fire("vk-ad", { on: true, format });
    // На время ролика баннер убирается (ждём VK не дольше 1,5 с, чтобы ролик не застрял)
    await Promise.race([syncBanner(), new Promise((r) => setTimeout(r, 1500))]);
    let shown = false;
    try {
      shown = !!(await send("VKWebAppShowNativeAds", { ad_format: format })).result;
    } catch {}
    host.adShowing = false;
    if (shown) lastAd = Date.now();
    fire("vk-ad", { on: false, format, shown });
    setTimeout(preload, 1000);
    // После ролика баннер вернётся, только если игра через секунду всё ещё на спокойном экране
    calmDown();
    syncBanner();
    return shown;
  }
  host.interstitial = () => (Date.now() - lastAd < gap ? Promise.resolve(false) : show("interstitial"));
  // Ролик за награду — только по нажатию игрока на кнопку, где написано, что он получит
  host.rewarded = () => show("reward");

  // ---------- Баннер ----------
  // Правила VK 5.1.4: баннер сверху или снизу, не на онбординге, не поверх нужных кнопок,
  // его не закрывают элементы игры. Мы ставим его снизу с layout_type "resize": VK делает окно игры
  // ниже на высоту баннера, и баннер стоит под игрой, а не поверх неё. Игра сама решает, где он уместен
  // (меню, выбор уровня, итоги, пауза), и прячет его, как только начинается игра.
  // Показ — после секунды спокойного экрана: баннер не выскакивает под палец, который только что играл
  // (правило 5.1.4.2б). Скрыт на время ролика и пока игра свёрнута. Закрыл игрок баннер крестиком — он не
  // возвращается, пока игрок снова не поиграет. Если VK положил баннер поверх игры (overlay), он убирается
  // до конца запуска: экраны игр под наложение не размечены. Нет поддержки или рекламы — тихо ничего не делаем.
  const SETTLE = 1000;
  const b = {
    want: false, // игра на спокойном экране
    readyAt: 0, // раньше этого времени не показываем
    maybe: false, // VK, возможно, показывает баннер: прятать при уходе со спокойного экрана
    closed: false, // игрок закрыл баннер на этом экране
    miss: false, // на этом экране VK баннер не дал
    overlay: false, // VK поставил баннер поверх игры — больше не просим
    job: null,
    timer: 0,
    poll: 0,
  };
  // Ответ VK ждём не дольше 4 с: зависший запрос не должен застопорить баннер навсегда
  const ask = (method, params) =>
    Promise.race([send(method, params), new Promise((_, no) => setTimeout(() => no(new Error("VK не ответил")), 4000))]);
  const wanted = () =>
    b.want && !b.closed && !b.miss && !b.overlay && launched && !host.adShowing && !host.hidden && !document.hidden;
  const calmDown = () => (b.readyAt = Math.max(b.readyAt, Date.now() + SETTLE));

  // Баннер на экране (по ответу VK): класс vk-banner у <html>, высота в --vk-banner-h и событие vk-banner
  function paint(on, data = {}) {
    const height = on ? Math.max(0, Math.round(Number(data.banner_height) || 0)) : 0;
    if (on === host.bannerOn && height === host.bannerHeight) return;
    host.bannerOn = on;
    host.bannerHeight = height;
    const root = document.documentElement;
    root.classList.toggle("vk-banner", on);
    root.style.setProperty("--vk-banner-h", height + "px");
    fire("vk-banner", { on, height, layout: on ? data.layout_type || "" : "" });
  }

  async function showBanner() {
    const params = { banner_location: "bottom", layout_type: "resize" };
    // Телефон боком: низкий вариант баннера, чтобы меню и итоги не теснились
    if (innerWidth > innerHeight) params.height_type = "compact";
    b.maybe = true;
    let r = null;
    try {
      r = await ask("VKWebAppShowBannerAd", params);
    } catch {
      // Рекламы нет, платформа не умеет или баннер уже показан — спросим VK, что на экране
      r = await ask("VKWebAppCheckBannerAd").catch(() => null);
      if (!r?.result) {
        b.miss = true;
        b.maybe = !r; // VK не ответил — на всякий случай спрячем
        return;
      }
    }
    if (!r?.result) {
      b.miss = true;
      b.maybe = false;
      return;
    }
    if (r.layout_type === "overlay") b.overlay = true;
    else paint(true, r);
  }
  async function hideBanner() {
    const done = await ask("VKWebAppHideBannerAd").then(
      () => true,
      () => false,
    );
    if (!done) {
      const r = await ask("VKWebAppCheckBannerAd").catch(() => null);
      if (r?.result) await ask("VKWebAppHideBannerAd").catch(() => {});
    }
    b.maybe = false;
    paint(false);
  }
  // Приводит баннер к нужному состоянию; запросы к VK идут строго по одному
  async function runBanner() {
    for (let n = 0; n < 4; n++) {
      const want = wanted() && Date.now() >= b.readyAt;
      if (want && !b.maybe) await showBanner();
      else if (!wanted() && b.maybe) await hideBanner();
      else return;
    }
  }
  function syncBanner() {
    clearTimeout(b.timer);
    const early = b.readyAt - Date.now();
    if (early > 0 && wanted() && !b.maybe) b.timer = setTimeout(syncBanner, early + 20);
    if (!b.job) {
      b.job = runBanner()
        .catch(() => {})
        .finally(() => {
          b.job = null;
          // пока шёл запрос, игра могла сменить экран
          if ((wanted() && !b.maybe && Date.now() >= b.readyAt) || (!wanted() && b.maybe)) syncBanner();
        });
    }
    return b.job;
  }
  function bannerEvent(type, data) {
    if (type === "VKWebAppBannerAdClosedByUser") {
      b.closed = true;
      b.maybe = false;
      paint(false);
    } else if (data.result && host.bannerOn) paint(true, data); // новая высота
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) calmDown();
    syncBanner();
  });

  host.banner = (on) => {
    on = !!on;
    if (on === b.want) return;
    b.want = on;
    if (on) {
      b.closed = b.miss = false;
      calmDown();
    }
    syncBanner();
  };
  // Игра даёт проверку «спокойный ли экран»; слой сверяется с ней 10 раз в секунду
  host.bannerWhen = (calm) => {
    clearInterval(b.poll);
    const check = () => {
      let on = false;
      try {
        on = !!calm();
      } catch {}
      host.banner(on);
    };
    check();
    b.poll = setInterval(check, 100);
  };
})();
