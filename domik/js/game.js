// Ход игры: шаги стройки, касания, подсказки, сохранение. Читать ребёнку ничего не нужно.
import * as T from "../vendor/three/three.module.min.js?v=88d2ca30";
import { World, TREES } from "./world.js?v=88d2ca30";
import { TreeHouse, DECK_Y } from "./house.js?v=88d2ca30";
import { Room, CATS, ITEMS, WALLPAPERS, FLOORS, swatchOf } from "./room.js?v=88d2ca30";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const PAINTS = ["#ff5d5d", "#ffb02e", "#ffe14d", "#6fd36a", "#39c3f0", "#b07cff", "#ff8cc6", "#ffffff"];
const ROOF_COLORS = ["#ff5148", "#ffb02e", "#39c3f0", "#6fd36a", "#b07cff", "#ff8cc6"];
const TRIMS = ["#ffffff", "#ffd23f", "#39c3f0", "#ff8cc6", "#6fd36a"];
const STAGES = ["tree", "deck", "paint", "roof", "window", "way", "decor", "done"];
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const ROOFS = {
  gable: svg('<path d="M4 30 24 10l20 20z" fill="currentColor"/><rect x="11" y="30" width="26" height="12" fill="#d29a60"/>'),
  mushroom: svg('<path d="M4 30C4 16 14 8 24 8s20 8 20 22z" fill="currentColor"/><circle cx="16" cy="20" r="3.4" fill="#fff"/><circle cx="29" cy="16" r="3" fill="#fff"/><circle cx="34" cy="25" r="2.6" fill="#fff"/><rect x="13" y="30" width="22" height="12" fill="#d29a60"/>'),
  tower: svg('<path d="M9 31 24 4l15 27z" fill="currentColor"/><circle cx="24" cy="5" r="2.6" fill="#ffd23f"/><rect x="13" y="31" width="22" height="11" fill="#d29a60"/>'),
  straw: svg('<path d="M5 31c4-14 12-22 19-22s15 8 19 22z" fill="currentColor"/><path d="M12 24h24M16 17h16" stroke="#fff" stroke-opacity=".6" stroke-width="2"/><rect x="13" y="31" width="22" height="11" fill="#d29a60"/>'),
};
const WINDOWS = {
  round: svg('<circle cx="24" cy="24" r="16" fill="#7fd2ee" stroke="currentColor" stroke-width="5"/><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="3"/>'),
  arch: svg('<path d="M10 42V22a14 14 0 0 1 28 0v20z" fill="#7fd2ee" stroke="currentColor" stroke-width="5"/><path d="M24 8v34M10 25h28" stroke="currentColor" stroke-width="3"/>'),
  heart: svg('<path d="M24 42C6 30 6 12 16 11c4 0 7 3 8 7 1-4 4-7 8-7 10 1 10 19-8 31z" fill="#7fd2ee" stroke="currentColor" stroke-width="5"/>'),
  star: svg('<path d="m24 5 6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 20l14-2z" fill="#7fd2ee" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>'),
};
const WAYS = {
  ladder: svg('<path d="M15 4v40M33 4v40" stroke="#b67e46" stroke-width="5"/><path d="M15 12h18M15 22h18M15 32h18" stroke="#d29a60" stroke-width="5"/>'),
  rope: svg('<path d="M15 4c2 13-2 27 0 40M33 4c-2 13 2 27 0 40" stroke="#d9c08a" stroke-width="3.4" fill="none"/><path d="M13 13h22M13 24h22M13 35h22" stroke="#b67e46" stroke-width="5"/>'),
  spiral: svg('<rect x="19" y="3" width="10" height="42" rx="3" fill="#8a5a33"/><path d="M12 39h16M20 31h17M12 23h16M20 15h17M12 8h15" stroke="#ffb02e" stroke-width="5" stroke-linecap="round"/>'),
  climb: svg('<rect x="9" y="4" width="30" height="40" rx="4" fill="#d29a60"/><circle cx="17" cy="35" r="3.4" fill="#ff5d5d"/><circle cx="31" cy="28" r="3.4" fill="#39c3f0"/><circle cx="18" cy="20" r="3.4" fill="#ffd23f"/><circle cx="31" cy="12" r="3.4" fill="#6fd36a"/>'),
};
const DECOR = {
  flags: { icon: "🚩", name: "Флажки" },
  lanterns: { icon: "🏮", name: "Фонарики" },
  flowers: { icon: "🌼", name: "Цветы" },
  swing: { icon: svg('<path d="M15 4v30M33 4v30" stroke="#d9c08a" stroke-width="3"/><rect x="9" y="33" width="30" height="7" rx="3" fill="#ff8a3c"/>'), name: "Качели" },
  slide: { icon: svg('<path d="M9 10c10 2 11 28 31 29v4C16 42 13 18 7 15z" fill="#ffb02e"/><path d="M8 13v31" stroke="#39c3f0" stroke-width="4"/>'), name: "Горка" },
  birdhouse: { icon: "🐦", name: "Скворечник" },
  telescope: { icon: "🔭", name: "Телескоп" },
  pinwheel: { icon: "🌀", name: "Вертушка" },
  bucket: { icon: "🪣", name: "Ведёрко" },
};
const VOICE = {
  tree: "Выбери дерево!",
  deck: "Подавай доски!",
  nails: "Забей гвоздики!",
  paint: "Покрась стены пальчиком!",
  roof: "Выбери крышу!",
  window: "Выбери окошки!",
  way: "Как будем забираться?",
  decor: "Укрась домик!",
  done: "Какой красивый домик!",
  room: "Обустрой домик внутри!",
  inside: "Загляни внутрь!",
};

const world = new World(canvas);
const house = new TreeHouse(world);
const room = new Room(world, house);
window.Domik = { world, house, room };

const save = { sound: true, house: null };
try {
  const old = JSON.parse(localStorage.getItem("domik_save") || "{}");
  if (typeof old.sound === "boolean") save.sound = old.sound;
  if (old.house && TREES[old.house.tree]) save.house = old.house;
} catch (_) {}
function store() {
  try {
    localStorage.setItem("domik_save", JSON.stringify(save));
  } catch (_) {}
}

const state = {
  stage: null,
  tree: "oak",
  paint: PAINTS[0],
  painted: 0,
  nextPlank: 0,
  nailsLeft: 0,
  roof: null,
  roofColor: ROOF_COLORS[0],
  window: null,
  trim: TRIMS[0],
  hint: null,
  idle: 0,
  busy: false,
  edit: false,
  roomHint: true,
};
window.Domik.state = state;

// ---------- интерфейс ----------
function chip(html, label, onTap, extra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip " + extra;
  b.innerHTML = html;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", () => {
    Sound.unlock();
    onTap(b);
    state.idle = 0;
  });
  return b;
}
function row(items) {
  const r = document.createElement("div");
  r.className = "row";
  r.append(...items);
  $("tray").appendChild(r);
  return r;
}
function markOne(rowEl, target) {
  for (const c of rowEl.children) c.setAttribute("aria-pressed", String(c === target));
}
function clearTray() {
  $("tray").textContent = "";
}
function colorRow(list, current, onPick) {
  const r = row(
    list.map((c) =>
      chip("", "Цвет", (b) => {
        markOne(r, b);
        Sound.tap();
        onPick(c);
      }, "swatch"),
    ),
  );
  [...r.children].forEach((b, i) => {
    b.style.setProperty("--swatch", list[i]);
    b.setAttribute("aria-pressed", String(list[i] === current));
  });
  return r;
}
function showOk(on) {
  $("btn-ok").hidden = !on;
}
function say(key) {
  Voice.say(VOICE[key] || key);
}
function drawSteps() {
  const index = STAGES.indexOf(state.stage);
  [...$("steps").children].forEach((d, i) => {
    d.classList.toggle("on", i <= index);
    d.classList.toggle("now", i === index);
  });
}
function cheer(at, colors = ["#ffe14d", "#ffffff", "#ff8cc6", "#39c3f0"], n = 18) {
  world.burst(at, colors, n);
}
// Подсказка-рука: показывает на деталь на сцене или на кнопку
function hintAt(target) {
  state.hint = target;
  state.idle = 0;
}
function updateHint(dt) {
  state.idle += dt;
  const hand = $("hand");
  let pos = null;
  if (state.idle > 1.1 && state.hint) {
    if (state.hint.isObject3D) {
      const v = new T.Vector3();
      state.hint.getWorldPosition(v);
      const s = world.toScreen(v);
      if (s.front) pos = s;
    } else if (state.hint instanceof Element) {
      const r = state.hint.getBoundingClientRect();
      if (r.width) pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else if (typeof state.hint === "function") pos = state.hint();
  }
  hand.style.opacity = pos ? "1" : "0";
  if (pos) hand.style.transform = `translate(${pos.x - 26}px, ${pos.y - 8}px)`;
}

// ---------- шаги ----------
function enter(stage, how) {
  state.stage = stage;
  state.busy = false;
  clearTray();
  showOk(false);
  hintAt(null);
  drawSteps();
  world.yaw = 0;
  world.pitch = 0;
  world.zoom = 1;
  document.body.dataset.stage = stage;
  document.body.classList.toggle("free", state.edit || stage === "room");
  STAGE[stage](how);
}
function next() {
  if (state.edit) {
    state.edit = false;
    enter("done", "back");
  } else enter(STAGES[STAGES.indexOf(state.stage) + 1]);
}
// В финале можно вернуться к любому шагу и поменять только его
function editStep(stage) {
  state.edit = true;
  world.nightTarget = 0;
  enter(stage);
}
const STAGE = {
  tree() {
    world.setTree(state.tree);
    world.focus([0, 8.2, 0.5], 12.5, 0.12, 0.05);
    house.moveSquirrel(-5.2, 0.05, 6.4, 0.5);
    const r = row(
      Object.entries(TREES).map(([id, t]) => {
        const b = chip(`<i style="background:radial-gradient(circle at 35% 30%, ${t.leaves[2]}, ${t.leaves[0]})"></i><u style="background:${t.bark}"></u>`, t.name, (el) => {
          markOne(r, el);
          state.tree = id;
          world.setTree(id);
          Sound.pop();
          Voice.say(t.name);
          house.jump("squirrel");
          cheer(new T.Vector3(0, 11, 2), t.leaves, 26);
          hintAt($("btn-ok"));
        }, "tree-chip");
        return b;
      }),
    );
    markOne(r, r.children[Object.keys(TREES).indexOf(state.tree)]);
    showOk(true);
    hintAt(r.children[1]);
    say("tree");
  },
  deck() {
    house.buildFrame();
    house.buildPile();
    state.nextPlank = 0;
    world.focus([1.2, 3.9, 4.8], 8.6, 0.28, 0.14);
    house.moveSquirrel(4.2, 0.05, 9.4, 0.6);
    hintAt(house.pile[house.pile.length - 1]);
    Sound.gift();
    say("deck");
  },
  paint() {
    if (!state.edit) house.buildWalls();
    state.painted = house.boards.filter((b) => b.userData.color).length;
    state.paint = PAINTS[0];
    world.focus([0, DECK_Y + 1.7, 3.7], 4.5, 0, 0.04);
    Sound.whee();
    house.moveSquirrel(3.4, DECK_Y + 0.08, 4.4, -0.3);
    colorRow(PAINTS, state.paint, (c) => {
      state.paint = c;
      hintAt(house.boards[3 + (state.painted % 4)]);
    });
    hintAt(house.boards[2]);
    if (state.edit) showOk(true);
    say("paint");
  },
  roof() {
    world.focus([0, DECK_Y + 3.4, 2.4], 5.6, 0.32, 0.12);
    state.roof = state.edit ? house.config.roof : null;
    state.roofColor = state.edit ? house.config.roofColor : ROOF_COLORS[0];
    const r = row(
      Object.entries(ROOFS).map(([id, icon]) =>
        chip(icon, "Крыша", (b) => {
          markOne(r, b);
          state.roof = id;
          house.setRoof(id, state.roofColor);
          Sound.whee();
          world.tween(0.5, () => {}, () => {
            Sound.land();
            cheer(new T.Vector3(0, DECK_Y + 3.3, 3), ["#ffffff", state.roofColor], 18);
            house.jump("squirrel");
          });
          showOk(true);
          hintAt($("btn-ok"));
        }, "shape"),
      ),
    );
    r.style.setProperty("--tone", state.roofColor);
    colorRow(ROOF_COLORS, state.roofColor, (c) => {
      state.roofColor = c;
      r.style.setProperty("--tone", c);
      if (state.roof) house.setRoof(state.roof, c, true);
    });
    if (state.edit) {
      markOne(r, r.children[Object.keys(ROOFS).indexOf(state.roof)]);
      showOk(true);
    }
    hintAt(r.children[0]);
    say("roof");
  },
  window() {
    world.focus([0, DECK_Y + 1.6, 3.7], 4.3, 0, 0.05);
    state.window = state.edit ? house.config.window : null;
    state.trim = state.edit ? house.config.trim : TRIMS[0];
    const r = row(
      Object.entries(WINDOWS).map(([id, icon]) =>
        chip(icon, "Окошко", (b) => {
          markOne(r, b);
          state.window = id;
          house.setWindow(id, state.trim);
          Sound.pop();
          cheer(new T.Vector3(0, DECK_Y + 2, 4), ["#7fd2ee", "#ffffff"], 14);
          house.jump("squirrel");
          showOk(true);
          hintAt($("btn-ok"));
        }, "shape dark"),
      ),
    );
    r.style.setProperty("--tone", "#ffffff");
    colorRow(TRIMS, state.trim, (c) => {
      state.trim = c;
      if (state.window) house.setWindow(state.window, c, true);
    });
    if (state.edit) {
      markOne(r, r.children[Object.keys(WINDOWS).indexOf(state.window)]);
      showOk(true);
    }
    hintAt(r.children[2]);
    say("window");
  },
  way() {
    world.focus([1.8, 3.6, 5.8], 7.6, 0.42, 0.12);
    house.moveSquirrel(-1.5, 0.05, 9, 0.5);
    const r = row(
      Object.entries(WAYS).map(([id, icon]) =>
        chip(icon, "Подъём", (b) => {
          markOne(r, b);
          house.setWay(id);
          Sound.pop();
          house.jump("squirrel");
          showOk(true);
          hintAt($("btn-ok"));
        }, "shape"),
      ),
    );
    if (state.edit) {
      markOne(r, r.children[Object.keys(WAYS).indexOf(house.config.way)]);
      showOk(true);
    }
    hintAt(r.children[0]);
    say("way");
  },
  decor() {
    world.focus([-0.6, 6.6, 3.2], 10.2, -0.18, 0.08);
    const r = row(
      Object.entries(DECOR).map(([id, d]) =>
        chip(typeof d.icon === "string" && d.icon.startsWith("<") ? d.icon : `<span>${d.icon}</span>`, d.name, (b) => {
          const on = house.toggleDecor(id);
          b.setAttribute("aria-pressed", String(on));
          on ? Sound.gift() : Sound.tap();
          if (on) {
            Voice.say(d.name);
            house.jump("squirrel");
          }
        }, "shape deco"),
      ),
    );
    r.classList.add("wide");
    [...r.children].forEach((b, i) => b.setAttribute("aria-pressed", String(!!house.decorItems[Object.keys(DECOR)[i]])));
    showOk(true);
    hintAt(r.children[0]);
    say("decor");
  },
  done(how) {
    const restored = how === true;
    world.focus([-0.5, 6.1, 3], 10.6, -0.1, 0.06);
    house.rabbit.visible = true;
    house.setLights(true);
    remember();
    clearTray();
    const inside = chip("<span>🛋️</span>", "Обустроить внутри", () => {
      Sound.whee();
      enter("room");
    }, "shape deco hero");
    const outside = chip("<span>🎨</span>", "Поменять снаружи", () => {
      Sound.tap();
      if (steps.hidden) {
        steps.hidden = false;
        Voice.say("Что поменяем?");
      } else steps.hidden = true;
    }, "shape deco");
    const night = chip(world.nightTarget > 0.5 ? "<span>☀️</span>" : "<span>🌙</span>", "Ночь и день", (b) => {
      world.nightTarget = world.nightTarget > 0.5 ? 0 : 0.92;
      b.querySelector("span").textContent = world.nightTarget > 0.5 ? "☀️" : "🌙";
      Sound.tap();
    }, "shape deco");
    const fresh = chip("<span>🔨</span>", "Новый домик", (b) => {
      if (b.classList.contains("sure")) {
        newHouse();
        return;
      }
      b.classList.add("sure");
      Voice.say("Построим новый домик?");
      Sound.boing();
      setTimeout(() => b.classList.remove("sure"), 3200);
    }, "shape deco");
    row([inside, outside, night, fresh]);
    const steps = row([
      chip("<span>🖌️</span>", "Покрасить стены", () => editStep("paint"), "shape deco"),
      chip(ROOFS.gable, "Поменять крышу", () => editStep("roof"), "shape deco"),
      chip(WINDOWS.round, "Поменять окна", () => editStep("window"), "shape deco dark"),
      chip(WAYS.ladder, "Поменять подъём", () => editStep("way"), "shape deco"),
      chip("<span>🚩</span>", "Поменять украшения", () => editStep("decor"), "shape deco"),
    ]);
    steps.classList.add("wide");
    steps.hidden = true;
    if (how === "back") {
      house.moveSquirrel(1.2, DECK_Y + 0.08, 4.5, 0.2);
      world.tween(0.9, () => {}, bakeWhenCalm);
      return;
    }
    if (restored) {
      house.bake();
      return;
    }
    // Когда салют отгремит, рука зовёт заглянуть внутрь
    world.tween(5.5, () => {}, () => {
      if (state.stage !== "done") return;
      say("inside");
      hintAt(inside);
      world.tween(9, () => {}, () => {
        if (state.hint === inside) hintAt(null);
      });
    });
    world.tween(1.4, () => {}, bakeWhenCalm);
    house.moveSquirrel(1.2, DECK_Y + 0.08, 4.5, 0.2, () => house.jump("squirrel", 1.4));
    house.jump("rabbit", 1.2);
    Sound.fanfare();
    say("done");
    for (let i = 0; i < 6; i++)
      world.tween(0.25 + i * 0.32, () => {}, () => {
        cheer(new T.Vector3((i - 2.5) * 2.4, 12 + (i % 2) * 2, 4), ["#ff5d5d", "#ffd23f", "#39c3f0", "#6fd36a", "#ff8cc6", "#ffffff"], 44);
        Sound.firework();
      });
    // Сам собой наступает вечер, и в окнах загорается свет
    world.tween(4, () => {}, () => {
      if (state.stage !== "done") return;
      world.nightTarget = 0.92;
      night.querySelector("span").textContent = "☀️";
    });
  },
  room() {
    room.open();
    const cats = row(
      CATS.map((c) =>
        chip(`<span>${c.icon}</span>`, c.name, (b) => {
          markOne(cats, b);
          Sound.tap();
          Voice.say(c.name);
          showCat(c.id);
          state.idle = 0;
        }, "shape cat"),
      ),
    );
    cats.classList.add("wide");
    markOne(cats, cats.children[0]);
    showCat("furniture");
    showOk(true);
    if (state.roomHint) hintAt($("tray").children[1].children[0]);
    say("room");
  },
};
// Вторая строка лотка: вещи выбранного раздела или обои и пол
function showCat(id) {
  const tray = $("tray");
  while (tray.children.length > 1) tray.lastChild.remove();
  if (id === "style") {
    const papers = (list, name, current, setter) => {
      const r = row(
        list.map((look, i) => {
          const b = chip("", name, (el) => {
            markOne(r, el);
            setter(i);
            Sound.pop();
            remember();
          }, "paper");
          b.style.backgroundImage = `url(${swatchOf(look)})`;
          b.setAttribute("aria-pressed", String(i === current));
          return b;
        }),
      );
      r.classList.add("wide");
    };
    papers(WALLPAPERS, "Обои", room.wallIndex, (i) => room.setWall(i));
    papers(FLOORS, "Пол", room.floorIndex, (i) => room.setFloor(i));
  } else {
    const r = row(
      Object.entries(ITEMS)
        .filter(([, d]) => d.cat === id)
        .map(([key, d]) =>
          chip(d.icon.startsWith("<") ? d.icon : `<span>${d.icon}</span>`, d.name, () => addItem(key), "shape thing"),
        ),
    );
    r.classList.add("wide");
  }
  fitRoom();
}
function fitRoom() {
  const top = $("tray").getBoundingClientRect().top;
  room.fit(innerHeight - top);
}
addEventListener("resize", () => {
  if (state.stage === "room") setTimeout(fitRoom, 60);
});
function addItem(id) {
  const it = room.add(id);
  if (!it) {
    Sound.boing();
    Voice.say("Тут уже тесно!");
    return;
  }
  Sound.gift();
  Voice.say(it.def.name);
  house.jump("squirrel", 0.8);
  remember();
  if (state.roomHint) {
    state.roomHint = false;
    hintAt(it.group);
    world.tween(4, () => {}, () => {
      if (state.hint === it.group) hintAt(null);
    });
  } else hintAt(null);
}
// За это время ребёнок мог уже начать новый домик или новую правку: тогда сливать нечего
function bakeWhenCalm() {
  if (state.stage === "done" || state.stage === "room") house.bake();
}
function remember() {
  save.house = {
    tree: state.tree,
    colors: house.paintedColors(),
    roof: house.config.roof,
    roofColor: house.config.roofColor,
    window: house.config.window,
    trim: house.config.trim,
    way: house.config.way,
    decor: Object.keys(house.config.decor),
    room: room.serialize(),
  };
  store();
}
function newHouse() {
  save.house = null;
  store();
  world.nightTarget = 0;
  house.reset();
  room.reset();
  state.roomHint = true;
  state.tree = "oak";
  enter("tree");
}
function restore(h) {
  state.tree = h.tree;
  world.setTree(h.tree);
  house.buildFrame(true);
  house.placeDeck();
  house.buildRails(true);
  house.buildWalls(true);
  house.applyColors(h.colors || []);
  house.setRoof(h.roof || "gable", h.roofColor || ROOF_COLORS[0], true);
  house.setWindow(h.window || "round", h.trim || TRIMS[0], true);
  house.setWay(h.way || "ladder", true);
  for (const id of h.decor || []) if (DECOR[id]) house.toggleDecor(id, true);
  house.squirrel.position.set(1.2, DECK_Y + 0.08, 4.5);
  house.squirrel.rotation.y = 0.2;
  room.load(h.room);
  state.stage = "done";
  drawSteps();
  document.body.dataset.stage = "done";
  STAGE.done(true);
}

// ---------- действия стройки ----------
function flyNextPlank() {
  if (state.nextPlank >= house.pile.length || state.busy) return;
  const m = house.pile[house.pile.length - 1 - state.nextPlank];
  state.nextPlank++;
  state.idle = 0;
  Sound.whoosh();
  house.flyPlank(m, () => {
    Sound.land();
    world.burst(m.userData.home, ["#e8c79a", "#ffffff"], 10, 2.6);
    house.jump("squirrel", 0.7);
  });
  const left = house.pile.length - state.nextPlank;
  if (left > 0) hintAt(house.pile[left - 1]);
  else {
    hintAt(null);
    state.busy = true;
    world.tween(0.9, () => {}, startNails);
  }
}
function startNails() {
  state.busy = false;
  house.buildNails();
  state.nailsLeft = house.nails.length;
  world.focus([0, DECK_Y + 0.5, 2.7], 6, 0, 0.42);
  house.moveSquirrel(-1.6, DECK_Y + 0.1, 3.2, 0.5);
  hintAt(house.nails[0]);
  say("nails");
}
function hammerNail(n) {
  if (!n || n.userData.done) return;
  n.userData.done = true;
  state.idle = 0;
  house.hitNail(n, () => {
    Sound.land();
    Sound.tap();
    world.burst(n.position, ["#ffe14d", "#ffffff"], 12, 3);
    state.nailsLeft--;
    if (state.nailsLeft === 0) {
      house.buildRails();
      Sound.gift();
      Voice.say("Молодец!");
      house.jump("squirrel", 1.2);
      state.busy = true;
      world.tween(1.2, () => {}, next);
    } else hintAt(house.nails.find((x) => !x.userData.done));
  });
}
let lastPaintSound = 0;
function paintAt(x, y) {
  const hit = world.raycast(x, y, house.boards);
  if (!hit) return false;
  if (house.paintBoard(hit.object, state.paint)) {
    state.painted = house.boards.filter((b) => b.userData.color).length;
    world.burst(hit.point, [state.paint, "#ffffff"], 7, 2.2);
    const now = performance.now();
    if (now - lastPaintSound > 90) {
      lastPaintSound = now;
      Sound.pop();
    }
    if (state.painted >= 6 && $("btn-ok").hidden) {
      showOk(true);
      hintAt($("btn-ok"));
      Voice.say("Красота!");
    } else if ($("btn-ok").hidden) hintAt(house.boards.find((b) => !b.userData.color && b.position.z > 3));
  }
  state.idle = 0;
  return true;
}
function finishPaint() {
  // Что не докрасили, докрашивается само с весёлой волной
  const rest = house.boards.filter((b) => !b.userData.color);
  rest.forEach((b, i) =>
    world.tween(0.05 + i * 0.05, () => {}, () => {
      house.paintBoard(b, state.paint);
      Sound.tap();
    }),
  );
  showOk(false);
  state.busy = true;
  world.tween(0.5 + rest.length * 0.05, () => {}, next);
}
$("btn-ok").addEventListener("click", () => {
  Sound.unlock();
  if (state.busy) return;
  Sound.gift();
  if (state.stage === "room") {
    room.close();
    enter("done", "back");
  } else if (state.stage === "paint") finishPaint();
  else next();
});

// ---------- касания сцены ----------
let press = null,
  pinch = null;
const fingers = new Map();
function fingerGap() {
  const [a, b] = [...fingers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function lift(e) {
  fingers.delete(e.pointerId);
  if (fingers.size < 2) pinch = null;
}
// Отпустили вещь: над корзиной она исчезает, иначе остаётся на новом месте
function letGo(p, e) {
  const bin = $("bin"),
    binned = p.moved && e && !p.item.resident && overBin(e);
  document.body.classList.remove("dragging");
  bin.classList.remove("hot");
  if (binned) {
    room.remove(p.item);
    Sound.whoosh();
  } else if (p.moved) room.drop(p.item);
  else if (e) room.tap(p.item);
  else room.settle(p.item);
  remember();
}
function overBin(e) {
  const r = $("bin").getBoundingClientRect();
  return e.clientX > r.left - 34 && e.clientX < r.right + 34 && e.clientY > r.top - 34 && e.clientY < r.bottom + 34;
}
canvas.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // Двумя пальцами домик можно приблизить
  if (fingers.size === 2) {
    if (press?.item) letGo(press);
    press = null;
    pinch = { gap: fingerGap(), zoom: world.zoom };
    return;
  }
  if (fingers.size > 2) return;
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, painting: false };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
  if (state.stage === "paint" && paintAt(e.clientX, e.clientY)) press.painting = true;
  if (state.stage === "room") {
    const it = room.pick(e.clientX, e.clientY);
    if (it) {
      press.item = it;
      room.grab(it, e.clientX, e.clientY);
      state.idle = 0;
    }
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    world.zoom = T.MathUtils.clamp((pinch.zoom * pinch.gap) / Math.max(fingerGap(), 20), 0.42, 1.35);
    return;
  }
  if (!press || press.id !== e.pointerId) return;
  if (press.painting) {
    paintAt(e.clientX, e.clientY);
    return;
  }
  if (press.item) {
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return;
    press.moved = true;
    if (!press.item.resident) document.body.classList.add("dragging");
    room.dragTo(press.item, e.clientX, e.clientY);
    $("bin").classList.toggle("hot", !press.item.resident && overBin(e));
    if (state.roomHint === false) hintAt(null);
    return;
  }
  const dx = e.clientX - press.x,
    dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) < 12) return;
  press.moved = true;
  // Сцену можно покрутить пальцем
  const reach = state.stage === "room" ? 0.42 : 1.05;
  world.yaw = T.MathUtils.clamp(world.yaw - dx * 0.0045, -reach, reach);
  world.pitch = T.MathUtils.clamp(world.pitch + dy * 0.0028, -0.1, 0.32);
  press.x = e.clientX;
  press.y = e.clientY;
});
function release(e) {
  lift(e);
  if (!press || press.id !== e.pointerId) return;
  const was = press;
  press = null;
  if (was.item) letGo(was, e);
  else if (!was.moved && !was.painting) tapScene(e.clientX, e.clientY);
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", (e) => {
  lift(e);
  if (press?.item) letGo(press);
  press = null;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function pulseHand() {
  state.idle = 2;
}
function tapScene(x, y) {
  if (state.stage === "deck") {
    if (house.nails.length) hammerNail(world.nearest(x, y, house.nails.filter((n) => !n.userData.done), 140) || pulseHand());
    else flyNextPlank();
    return;
  }
  if (state.stage === "done") tapFinal(x, y);
  else if (state.stage === "room") {
    if (room.tapEmpty(x, y)) remember();
  } else pulseHand();
}
// Финал: откликается всё, чего коснётся палец
function tapFinal(x, y) {
  const ask = (objects, reach) => world.nearest(x, y, objects, reach);
  const hit = world.raycast(x, y, [house.friends, house.decorGroup, house.windowGroup, house.door, house.roofGroup, world.tree].filter(Boolean)),
    obj = hit?.object;
  const find = (o, key) => {
    while (o) {
      if (o.userData?.[key]) return o.userData[key];
      o = o.parent;
    }
    return null;
  };
  const inside = (o, parent) => {
    while (o) {
      if (o === parent) return true;
      o = o.parent;
    }
    return false;
  };
  if (obj && inside(obj, house.squirrel)) {
    house.jump("squirrel", 1.4);
    Sound.giggle();
    return;
  }
  if (obj && inside(obj, house.rabbit)) {
    house.jump("rabbit", 1.4);
    Sound.boing();
    return;
  }
  const act = obj && find(obj, "act"),
    // Флажки и перила не должны мешать попасть в дверь
    doorAt = world.toScreen(new T.Vector3(0, DECK_Y + 1.1, 3.8)),
    nearDoor = Math.hypot(doorAt.x - x, doorAt.y - y) < 46;
  if (act === "door" || nearDoor || (obj && inside(obj, house.door))) {
    // Открытая дверь ведёт внутрь
    const open = house.toggleDoor();
    Sound.tap();
    if (open) {
      Sound.giggle();
      world.tween(0.6, () => {}, () => {
        if (state.stage === "done") enter("room");
      });
    }
    return;
  }
  if (act === "window") {
    house.setLights(house.lightsOn === false);
    world.nightTarget = Math.max(world.nightTarget, 0.5);
    Sound.tap();
    return;
  }
  if (act === "swing" && house.swingItem) {
    house.swingItem.boost = 0.26;
    Sound.whee();
    return;
  }
  if (act === "slide") {
    house.slideSquirrel(() => {
      Sound.land();
      house.jump("squirrel", 1);
    });
    Sound.whee();
    return;
  }
  if (act === "bird") {
    house.birdFly = 5;
    Sound.gift();
    return;
  }
  if (act === "bucket") {
    Sound.splash();
    return;
  }
  if (obj && inside(obj, house.decorGroup)) {
    Sound.pop();
    cheer(hit.point, ["#ffe14d", "#ffffff"], 12);
    for (const s of house.spinners) s.speed = s.speed > 8 ? 3 : 14;
    return;
  }
  if (obj && inside(obj, house.roofGroup)) {
    Sound.boing();
    cheer(hit.point, [house.config.roofColor, "#ffffff"], 14);
    return;
  }
  if (obj && inside(obj, world.tree)) {
    Sound.pop();
    const colors = TREES[state.tree].leaves;
    world.burst(hit.point, colors, 26, 3.4);
    return;
  }
  // По траве белочка сама прибежит к пальцу
  const near = ask([house.squirrel, house.rabbit], 90);
  if (near === house.rabbit) {
    house.jump("rabbit", 1.2);
    Sound.boing();
    return;
  }
  if (near === house.squirrel) {
    house.jump("squirrel", 1.2);
    Sound.giggle();
    return;
  }
  const ground = new T.Vector3();
  world.ray.setFromCamera(new T.Vector2((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1), world.camera);
  if (world.ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), ground) && ground.length() < 34) {
    house.moveSquirrel(ground.x, 0.05, ground.z, Math.atan2(ground.x, ground.z));
    Sound.tap();
  }
}
// Клавиатура для взрослых и компьютера
addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") world.yaw = Math.max(-1.05, world.yaw - 0.08);
  if (e.key === "ArrowRight") world.yaw = Math.min(1.05, world.yaw + 0.08);
  if ((e.key === " " || e.key === "Enter") && document.activeElement?.tagName !== "BUTTON") {
    e.preventDefault();
    Sound.unlock();
    if (state.stage === "deck") {
      if (house.nails.length) hammerNail(house.nails.find((n) => !n.userData.done));
      else flyNextPlank();
    } else if (!$("btn-ok").hidden) $("btn-ok").click();
  }
});

// ---------- звук ----------
function syncSound() {
  Sound.setOn(save.sound);
  Sound.setLevels(0.34, 0.85);
  $("btn-sound").textContent = save.sound ? "🔊" : "🔇";
  $("btn-sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
  if (!save.sound) Voice.stop();
}
$("btn-sound").addEventListener("click", () => {
  Sound.unlock();
  save.sound = !save.sound;
  syncSound();
  store();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    Voice.stop();
    Sound.ctx?.suspend().catch(() => {});
  }
});
// iPad разрешает звук только в конце касания
addEventListener("pointerup", () => Sound.unlock());

// ---------- старт ----------
for (let i = 0; i < STAGES.length; i++) $("steps").appendChild(document.createElement("i"));
syncSound();
Music.setTrack(3);
if (save.house) restore(save.house);
else enter("tree");
$("load").hidden = true;
window.Domik.enter = enter;
window.Domik.tapScene = tapScene;
window.Domik.ready = true;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.max((now - last) / 1000, 0),
    dt = Math.min(elapsed, 0.1);
  last = now;
  if (document.hidden) return;
  world.adapt(elapsed);
  house.frame(dt, world.time, world.night);
  room.frame(dt, world.time, world.night);
  world.frame(dt);
  updateHint(dt);
  Music.tick();
}
requestAnimationFrame(frame);
