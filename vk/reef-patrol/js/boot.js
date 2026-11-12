import("./main.js?v=387c2c1e").catch((error) => {
  document.getElementById("load").textContent =
    "Подводная сцена не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
