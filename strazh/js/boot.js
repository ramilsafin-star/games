import("./game.js?v=98456336").catch((error) => {
  document.getElementById("load-status").textContent =
    "Не удалось запустить 3D-сцену. Проверьте поддержку WebGL 2 и обновите страницу.";
  console.error(error);
});
