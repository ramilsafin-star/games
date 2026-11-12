import("./main.js?v=151d9996").catch((error) => {
  document.getElementById("load").textContent =
    "Подводная сцена не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
