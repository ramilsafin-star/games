import("./main.js?v=40ce2712").catch((error) => {
  document.getElementById("load").textContent =
    "Каньон не открылся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
