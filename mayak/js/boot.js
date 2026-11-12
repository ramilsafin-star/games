import("./main.js?v=092eaf93").catch((error) => {
  document.getElementById("load").textContent = "Маяк не зажёгся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
