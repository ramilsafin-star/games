import("./main.js?v=d37e4584").catch((error) => {
  document.getElementById("load").textContent =
    "Каньон не открылся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
