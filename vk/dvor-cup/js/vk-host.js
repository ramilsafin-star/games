(() => {
  const bridge = window.vkBridge;
  const appId = new URLSearchParams(location.search).get("vk_app_id");
  const inVk = bridge.isWebView() || (bridge.isIframe() && /^[1-9]\d*$/.test(appId ?? ""));
  if (!inVk) return;

  const host = { hidden: false };
  window.vkGameHost = host;
  bridge.subscribe(({ detail }) => {
    if (detail.type === "VKWebAppViewHide") host.hidden = true;
    else if (detail.type === "VKWebAppViewRestore") host.hidden = false;
    else return;

    window.dispatchEvent(new Event("vk-game-visibility"));
  });
  bridge.send("VKWebAppInit").catch(() => console.warn("Не удалось подтвердить запуск в VK."));
})();
