import("./game.js?v=c710c864").catch((error) => {
  document.getElementById("load-status").textContent =
    "Не удалось запустить 3D-сцену. Проверьте поддержку WebGL 2 и обновите страницу.";
  console.error(error);
});
