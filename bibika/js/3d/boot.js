import { DriveView } from "./view.js";
import { prepareFacades } from "./scenery.js";
import { prepareConcept } from "./vehicles.js";
// Игра (js/game.js) уже загружена обычным скриптом: гараж виден сразу, а 3D догоняет.
function progress(event) {
  if (event.lengthComputable)
    window.dispatchEvent(
      new CustomEvent("bibika-progress", {
        detail: event.loaded / event.total,
      }),
    );
}
(async () => {
  try {
    window.driveView = new DriveView(document.getElementById("game"));
    const assets = Promise.allSettled([
      prepareConcept(progress),
      prepareFacades(),
    ]).then((results) => {
      for (const result of results)
        if (result.status === "rejected")
          console.warn("Using procedural material or geometry", result.reason);
      // Если играть начали раньше, красивая модель подменит простую, когда появится
      if (window.driveView.ready)
        window.dispatchEvent(new Event("bibika-detail"));
    });
    // На медленном интернете ребёнок не ждёт: через 8 секунд едем на простых машинах
    await Promise.race([
      assets,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    window.driveView.ready = true;
    window.dispatchEvent(new Event("bibika-ready"));
  } catch (error) {
    console.error("3D startup", error);
    window.bibikaFail();
  }
})();
