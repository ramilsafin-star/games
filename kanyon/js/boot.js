import("./main.js?v=4a3b319e").catch((error) => {
  document.getElementById("load").textContent =
    "Каньон не открылся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
