await window.vkGameHost?.ready;
import("./main.js?v=a3d819ef").catch((error) => {
  document.getElementById("load").classList.add("failed");
  document.getElementById("load").textContent =
    "Каньон не открылся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
