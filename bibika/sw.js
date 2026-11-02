const CACHE = "bibika-v28-icecream-guests";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./icecream/",
  "./icecream/icons.js",
  "./icecream/index.html",
  "./icecream/models.js",
  "./icecream/park.js",
  "./icecream/shop.css",
  "./icecream/shop.js",
  "./icecream/voices/bear.mp3",
  "./icecream/voices/berry.mp3",
  "./icecream/voices/bunny.mp3",
  "./icecream/voices/cat.mp3",
  "./icecream/voices/choco.mp3",
  "./icecream/voices/fox.mp3",
  "./icecream/voices/mint.mp3",
  "./icecream/voices/panda.mp3",
  "./icecream/voices/perfect.mp3",
  "./icecream/voices/pig.mp3",
  "./icecream/voices/surprise.mp3",
  "./icecream/voices/top-cherry.mp3",
  "./icecream/voices/top-stars.mp3",
  "./icecream/voices/top-syrup.mp3",
  "./icecream/voices/two-berry-choco.mp3",
  "./icecream/voices/two-mint-choco.mp3",
  "./icecream/voices/two-vanilla-berry.mp3",
  "./icecream/voices/two-vanilla-mint.mp3",
  "./icecream/voices/vanilla.mp3",
  "./manifest.webmanifest",
  "./js/audio.js",
  "./js/art.js",
  "./js/cars.js",
  "./js/world.js",
  "./js/game.js",
  "./js/missions.js",
  "./js/powers.js",
  "./js/3d/blasts.js",
  "./js/3d/boot.js",
  "./js/3d/scenery.js",
  "./js/3d/vehicles.js",
  "./js/3d/view.js",
  "./vendor/three/BufferGeometryUtils.js",
  "./vendor/three/GLTFLoader.js",
  "./vendor/three/RoomEnvironment.js",
  "./vendor/three/RoundedBoxGeometry.js",
  "./vendor/three/three.core.min.js",
  "./vendor/three/three.module.min.js",
  "./assets/models/car-concept.glb",
  "./assets/models/CREDITS.md",
  "./vendor/three/LICENSE",
  "./assets/scenery/facades.webp",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("bibika-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== self.location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
