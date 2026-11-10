import("./game.js?v=9ef72205").catch((error) => {
  document.getElementById("load-status").textContent =
    "Не удалось запустить 3D-сцену. Проверьте поддержку WebGL 2 и обновите страницу.";
  console.error(error);
});
