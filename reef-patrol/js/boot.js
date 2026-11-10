import("./main.js?v=d76d4a47").catch((error) => {
  document.getElementById("load").textContent =
    "Подводная сцена не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
