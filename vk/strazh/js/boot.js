await window.vkGameHost?.ready;
import("./game.js?v=ab118089").catch((error) => {
  document.getElementById("load-status").classList.add("failed");
  document.getElementById("load-status").textContent =
    "Не удалось запустить 3D-сцену. Проверьте поддержку WebGL 2 и обновите страницу.";
  console.error(error);
});
