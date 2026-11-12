// Общий слой VK-версий игр (games-portal/vk). Подключается обычным скриптом до кода игры:
//   <script src="./js/vk-host.js" data-keys="ключ-сохранения" data-ad-gap="120"></script>
// Вне VK ничего не делает, игра работает как на портале.
// В VK: сообщает о запуске (VKWebAppInit), шлёт событие «vk-game-visibility» при сворачивании,
// показывает рекламу между экранами не чаще data-ad-gap секунд и хранит сохранения из data-keys
// в облаке VK, чтобы прогресс был одинаковым на телефоне и компьютере (правило 2.3.8).
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
  };
  window.vkGameHost = host;
  if (!inVk) return;

  const send = (method, params) => bridge.send(method, params);
  const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  // VKWebAppInit — сразу, до загрузки ресурсов: VK ждёт его не дольше 30 секунд
  send("VKWebAppInit").catch(() => console.warn("Не удалось подтвердить запуск в VK."));

  bridge.subscribe(({ detail }) => {
    if (detail.type === "VKWebAppViewHide") {
      host.hidden = true;
      pushAll();
    } else if (detail.type === "VKWebAppViewRestore") host.hidden = false;
    else return;
    fire("vk-game-visibility");
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
    let shown = false;
    try {
      shown = !!(await send("VKWebAppShowNativeAds", { ad_format: format })).result;
    } catch {}
    host.adShowing = false;
    if (shown) lastAd = Date.now();
    fire("vk-ad", { on: false, format, shown });
    setTimeout(preload, 1000);
    return shown;
  }
  host.interstitial = () => (Date.now() - lastAd < gap ? Promise.resolve(false) : show("interstitial"));
  // Ролик за награду — только по нажатию игрока на кнопку, где написано, что он получит
  host.rewarded = () => show("reward");
})();
