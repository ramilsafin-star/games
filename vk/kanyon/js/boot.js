await window.vkGameHost?.ready;
import("./main.js?v=8c0d46b5").catch((error) => {
  document.getElementById("load").classList.add("failed");
  document.getElementById("load").textContent =
    "Каньон не открылся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
