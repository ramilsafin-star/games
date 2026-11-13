// Приборы боя поверх 3D: прицел, отметки попаданий, лента отключений, направление урона,
// щит и броня, патроны, цель задания, метки на экране, радар, рация, всплывающие награды.
import { WEAPONS, GRENADES, KITS } from "./data.js?v=fe308c19";
import { fmtTime, wrap, yawTo, clamp } from "./util.js?v=fe308c19";
import { TRAINING } from "./sim.js?v=fe308c19";

const $ = (id) => document.getElementById(id);
function text(el, v) {
  v = String(v);
  if (el && el.textContent !== v) el.textContent = v;
}
function show(el, on) {
  if (el && el.hidden === on) el.hidden = !on;
}
const ICON = {
  pistol: "▬", revolver: "▬", smg: "▰", shotgun: "▰", rifle: "▰", dmr: "▰", sniper: "▰", lmg: "▰", knife: "⟋",
};
const NADE_ICON = { frag: "◆", emp: "ϟ", smoke: "☁" };

export class Hud {
  constructor(view) {
    this.view = view;
    this.marks = new Map();
    this.feedN = 0;
    this.radarT = 0;
    this.lastHp = 100;
    this.heartT = 0;
    this.radar = $("radar").getContext("2d");
    this.markBox = $("marks");
    this.creditsShown = 0;
  }
  reset() {
    $("feed").innerHTML = "";
    $("dmg").innerHTML = "";
    $("pops").innerHTML = "";
    $("radio").innerHTML = "";
    this.markBox.innerHTML = "";
    this.marks.clear();
    $("banner").className = "";
  }
  // ---------- события ----------
  handle(g, e) {
    switch (e.type) {
      case "hitmark": {
        const h = $("hitmark");
        h.className = "";
        void h.offsetWidth;
        h.className = "on" + (e.core ? " core" : "") + (e.kill ? " kill" : "") + (e.shield ? " shield" : "");
        break;
      }
      case "kill": {
        if (!e.byPlayer && !e.quiet && e.type !== "mishen") break;
        const last = g.feed[g.feed.length - 1];
        if (!last) break;
        const li = document.createElement("li");
        const w = WEAPONS[last.weapon];
        li.innerHTML = `<b>${last.who}</b><i class="w">${last.knife ? "нож" : w ? w.name : last.weapon === "frag" ? "граната" : last.weapon === "emp" ? "ЭМИ" : "взрыв"}</i><span>${last.what}</span>${last.core ? '<i class="core" title="в ядро">◉</i>' : ""}`;
        $("feed").prepend(li);
        while ($("feed").children.length > 5) $("feed").lastChild.remove();
        setTimeout(() => li.classList.add("old"), 4200);
        setTimeout(() => li.remove(), 5000);
        if (e.byPlayer && last.core) this.popup("ЯДРО", "core");
        break;
      }
      case "hurt": {
        const p = g.player;
        const ang = wrap(yawTo(p.x, p.z, e.fromX, e.fromZ) - p.yaw);
        const el = document.createElement("i");
        el.className = "arc";
        el.style.transform = `rotate(${-ang}rad)`;
        el.style.opacity = String(clamp(0.45 + e.amount / 25, 0.5, 1));
        $("dmg").append(el);
        setTimeout(() => el.remove(), 1100);
        break;
      }
      case "credits":
        this.popup("+" + e.amount, e.core ? "money core" : "money");
        break;
      case "radio":
        this.radio(e.who, e.text);
        break;
      case "alarm":
        this.banner("ТРЕВОГА!", "alarm");
        break;
      case "planted":
        this.banner("Заряд установлен", "good");
        break;
      case "bombFound":
        this.banner("Бомба найдена: точка " + e.label, "warn");
        break;
      case "hacked":
        this.banner("Данные получены", "good");
        break;
      case "defused":
        this.banner("Бомба обезврежена", "good");
        break;
      case "rescued":
        this.banner(e.name + " с нами", "good");
        break;
      case "shieldBreak":
        this.popup("ЩИТ СБИТ", "core");
        break;
      case "needAim":
        this.hint("Нужен прицел: правая кнопка мыши или кнопка прицела");
        break;
      case "trainStep": {
        const st = TRAINING[e.step];
        if (st) this.banner(`Шаг ${e.step + 1} из ${e.total}`, "good small");
        break;
      }
      case "ventOpen":
        this.banner("Ядро открыто!", "warn small");
        break;
      case "bossPhase":
        this.banner(e.phase === 1 ? "«Наковальня» в ярости" : "Последний рывок!", "alarm");
        break;
      case "kit":
        this.popup(e.kind === "battery" ? "+50 ЩИТ" : "СКАНЕР", "money");
        break;
      case "mateDown":
        this.popup(e.name + " выбыл", "warn");
        break;
    }
  }
  popup(t, cls = "") {
    const el = document.createElement("b");
    el.className = "pop " + cls;
    el.textContent = t;
    el.style.setProperty("--dx", (Math.random() * 40 - 20).toFixed(0) + "px");
    $("pops").append(el);
    setTimeout(() => el.remove(), 1200);
  }
  radio(who, t) {
    const box = $("radio");
    const el = document.createElement("p");
    el.innerHTML = `<b>${who}:</b> `;
    el.append(t);
    box.append(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => el.classList.add("old"), 4300);
    setTimeout(() => el.remove(), 5000);
  }
  banner(t, cls = "") {
    const b = $("banner");
    b.className = "";
    b.textContent = t;
    void b.offsetWidth;
    b.className = "on " + cls;
  }
  hint(t) {
    const h = $("hint");
    text(h, t);
    h.classList.add("on");
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => h.classList.remove("on"), 2500);
  }
  // ---------- каждый кадр ----------
  update(g, dt, o = {}) {
    const p = g.player, W = g.weapon(), A = p.ammo[p.cur], ob = g.obj;
    // прицел: расходится вместе с разбросом
    const moving = clamp(p.speedNow / 3.5, 0, 1);
    const spread = (W.hip + (W.ads - W.hip) * p.aim) * (1 + (W.move - 1) * moving) + p.bloom;
    const px = clamp(spread * 7, 3, 70);
    const x = $("xhair");
    x.style.setProperty("--gap", px.toFixed(1) + "px");
    const scoped = W.scope && p.aim > 0.9;
    x.classList.toggle("ads", p.aim > 0.6 && !W.melee);
    x.classList.toggle("hot", !!o.onTarget);
    x.classList.toggle("knife", !!W.melee);
    show(x, !scoped && p.alive);
    const sc = $("scope");
    show(sc, scoped);
    if (scoped) sc.dataset.zoom = W.scope;
    // щит и броня
    const hp = Math.ceil(p.hp);
    text($("hp-n"), hp);
    $("hp-bar").style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    text($("ar-n"), Math.ceil(p.armor));
    $("ar-bar").style.transform = `scaleX(${clamp(p.armor / 100, 0, 1)})`;
    $("vitals").classList.toggle("low", p.hp < 35);
    $("vitals").classList.toggle("noarmor", p.armor <= 0);
    if (hp < this.lastHp - 1) {
      $("vitals").classList.remove("hit");
      void $("vitals").offsetWidth;
      $("vitals").classList.add("hit");
    }
    this.lastHp = hp;
    if (p.hp < 30 && p.alive) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.9;
        o.heart && o.heart();
      }
    }
    // патроны
    text($("w-name"), W.name);
    if (W.melee) {
      text($("ammo-mag"), "—");
      text($("ammo-res"), "");
    } else {
      text($("ammo-mag"), A.mag);
      text($("ammo-res"), "/ " + A.res);
    }
    $("ammo").classList.toggle("empty", !W.melee && A.mag === 0);
    $("ammo").classList.toggle("lowammo", !W.melee && A.mag > 0 && A.mag <= Math.ceil(W.mag * 0.25));
    $("ammo").classList.toggle("reloading", p.reloadT > 0);
    const nd = p.grenades.map((k, i) => `<i class="n-${k}${i === 0 ? " selected" : ""}" title="${GRENADES[k].name}${i === 0 ? " · выбрана" : ""}">${NADE_ICON[k]}</i>`).join("") || '<i class="none">—</i>';
    if (this.nadesHtml !== nd) {
      this.nadesHtml = nd;
      $("nades").innerHTML = nd;
    }
    const kitOn = p.kit !== "none" && p.kit !== "sapper" && !p.kitUsed;
    text($("kit"), p.kit === "none" ? "" : KITS[p.kit].name + (p.kitUsed ? " ✓" : ""));
    // цель
    text($("obj-text"), ob.text || "");
    let timer = "";
    if (ob.kind === "defuse") timer = fmtTime(ob.left);
    if (ob.kind === "plant" && ob.planted) timer = fmtTime(ob.planted.left);
    if (ob.kind === "skirmish") timer = ob.planted ? fmtTime(ob.planted.left) : fmtTime(ob.clock);
    if (ob.kind === "hold") timer = fmtTime(ob.need - ob.held);
    text($("obj-time"), timer);
    const context = o.match ? `Раунд ${o.match.round} · ${o.match.wins} : ${o.match.losses}` : o.daily?.name;
    show($("battle-context"), !!context);
    text($("battle-context"), context || "");
    $("obj").classList.toggle("urgent", (ob.kind === "defuse" && ob.left < 20) || (ob.kind === "hold" && !ob.inZone));
    // босс
    const boss = g.boss;
    show($("boss"), !!(boss && boss.alive));
    if (boss && boss.alive) {
      $("boss-bar").style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
      $("boss").classList.toggle("vent", boss.vent > 0);
    }
    // действие (держать)
    const use = $("use");
    show(use, !!ob.useHint && p.alive);
    if (ob.useHint) {
      text($("use-text"), (o.touch ? "" : "E — ") + ob.useHint);
      $("use-ring").style.setProperty("--k", clamp(ob.useK || 0, 0, 1).toFixed(3));
    }
    show($("t-use"), !!ob.useHint);
    show($("t-kit"), kitOn);
    const mate = g.agents.find((a) => a.team === "squad" && a.alive);
    const squad = $("t-squad");
    show(squad, !!mate);
    squad.classList.toggle("ordered", mate?.cmd === "hold");
    const tn = $("t-nade");
    tn.dataset.n = p.grenades.length;
    tn.dataset.kind = p.grenades[0] || "";
    show($("t-gswap"), p.grenades.length > 1 && p.grenades[0] !== p.grenades[1]);
    // подсказка тренировки
    if (ob.kind === "training") {
      const st = TRAINING[ob.step];
      text($("train"), st ? `${ob.step + 1}/${TRAINING.length} · ${st.hint}` : "");
    }
    show($("train"), ob.kind === "training");
    this.updateMarks(g, o);
    this.radarT -= dt;
    if (this.radarT <= 0) {
      this.radarT = 0.1;
      this.drawRadar(g);
    }
  }
  // метки целей на экране (за краем — стрелка у края)
  updateMarks(g, o) {
    const want = [];
    const ob = g.obj, p = g.player;
    const add = (key, x, y, z, label, cls, progress = null) => want.push({ key, x, y, z, label, cls, progress });
    if (ob.sites && !ob.planted && ob.kind !== "defuse") for (const s of ob.sites) add("site" + s.label, s.x, s.y + 1.6, s.z, s.label, "site");
    if (ob.planted) add("charge", ob.planted.x, ob.planted.y + 1.2, ob.planted.z, ob.planted.label, "site charge");
    if (ob.kind === "defuse") {
      if (ob.bomb.found) add("bomb", ob.bomb.x, ob.bomb.y + 1.2, ob.bomb.z, "!", "site bomb");
      else for (const s of ob.sites) add("site" + s.label, s.x, s.y + 1.6, s.z, s.label + "?", "site");
    }
    if (g.vip && g.vip.alive) add("vip", g.vip.x, g.vip.y + 2.1, g.vip.z, g.vip.name, g.vip.down || g.vip.state === "captive" ? "vip warn" : "vip");
    if (ob.exit && (ob.kind === "rescue" ? g.vip.state !== "captive" : ob.stage === "exit")) add("exit", ob.exit.x, ob.exit.y + 1.2, ob.exit.z, "ВЫХОД", "exit");
    if (ob.kind === "stealth" && ob.stage === "go") add("target", ob.target.x, ob.target.y + 1.5, ob.target.z, "ПУЛЬТ", "site");
    if (ob.zone) add("zone", ob.zone.x, g.player.y + 1.4, ob.zone.z, "ТОЧКА", ob.inZone ? "zone in" : "zone");
    if (ob.marker) add("marker", ob.marker.x, ob.marker.y + 1, ob.marker.z, "▼", "site");
    // бойцы и настороженные роботы
    for (const a of g.agents) {
      if (!a.alive) continue;
      if (a.team === "squad") add("m" + a.id, a.x, a.y + 2.15, a.z, a.name, "mate");
      if (a.team === "robot" && g.mission.stealth && !g.alarm && !a.def.dummy && (a.aware > 0.2 || a.state === "alert" || a.alarmT > 0)) {
        const sending = a.alarmT > 0;
        const progress = sending ? 1 - a.alarmT / (a.def.camera ? 0.05 : 1.7) : a.aware;
        add("r" + a.id, a.x, a.y + (a.fly ? 0.7 : a.h + 0.35), a.z, sending ? "Тревога" : "?", sending ? "det hot" : "det", progress);
      }
      if (a.team === "robot" && g.reveal > 0 && !a.def.dummy) add("s" + a.id, a.x, a.y + (a.fly ? 0 : a.h * 0.6), a.z, "", "scan");
    }
    const seen = new Set();
    const W = innerWidth, H = innerHeight;
    for (const m of want) {
      seen.add(m.key);
      let el = this.marks.get(m.key);
      if (!el) {
        el = document.createElement("div");
        el.innerHTML = "<b></b><small></small>";
        this.markBox.append(el);
        this.marks.set(m.key, el);
      }
      if (el.className !== "mk " + m.cls) el.className = "mk " + m.cls;
      text(el.firstChild, m.label);
      const s = this.view.project(m.x, m.y, m.z);
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      const near = m.cls.startsWith("det") || m.cls === "scan" || m.cls === "mate";
      text(el.lastChild, near ? "" : Math.round(d) + " м");
      if (m.progress !== null) el.style.setProperty("--detection", `${Math.round(clamp(m.progress, 0, 1) * 100)}%`);
      let x = s.x, y = s.y, edge = false;
      if (near && (s.behind || x < 0 || x > W || y < 0 || y > H)) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      if (s.behind) {
        x = W - x;
        y = H - 30;
        edge = true;
      }
      const pad = 34;
      if (x < pad || x > W - pad || y < pad + 40 || y > H - pad) edge = true;
      x = clamp(x, pad, W - pad);
      y = clamp(y, pad + 40, H - pad);
      el.classList.toggle("edge", edge);
      el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    }
    for (const [k, el] of this.marks)
      if (!seen.has(k)) {
        el.remove();
        this.marks.delete(k);
      }
  }
  drawRadar(g) {
    const c = this.radar, W = c.canvas.width, R = W / 2, p = g.player;
    const S = R / 32; // 32 м до края
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "rgba(8,14,22,0.55)";
    c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(p.yaw);
    // стены рядом
    c.fillStyle = "rgba(160,190,220,0.28)";
    const list = g.world.near(p.x - 34, p.z - 34, p.x + 34, p.z + 34);
    for (const b of list) {
      if (b.inv || b.y1 < p.y + 0.9 || b.y0 > p.y + 2.5 || b.floorOnly) continue;
      c.save();
      c.translate((b.cx - p.x) * S, (b.cz - p.z) * S);
      c.rotate(-b.yaw);
      c.fillRect(-b.hw * S, -b.hd * S, b.hw * 2 * S, b.hd * 2 * S);
      c.restore();
    }
    const dot = (x, z, color, r = 3) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc((x - p.x) * S, (z - p.z) * S, r, 0, Math.PI * 2);
      c.fill();
    };
    const ob = g.obj;
    if (ob.sites) for (const s of ob.sites) dot(s.x, s.z, "#ffb02e", 5);
    if (ob.zone) {
      c.strokeStyle = "#ffb02e";
      c.beginPath();
      c.arc((ob.zone.x - p.x) * S, (ob.zone.z - p.z) * S, ob.zone.r * S, 0, Math.PI * 2);
      c.stroke();
    }
    if (ob.exit) dot(ob.exit.x, ob.exit.z, "#5fff9a", 5);
    if (ob.target) dot(ob.target.x, ob.target.z, "#ffb02e", 5);
    for (const a of g.agents) {
      if (!a.alive) continue;
      if (a.team === "squad") dot(a.x, a.z, "#5fd8ff", 3.2);
      else if (a.team === "vip") dot(a.x, a.z, "#ffd27a", 3.6);
      // роботы видны, если стреляют, близко или включён сканер
      else if (g.reveal > 0 || (a.lastShotAt && g.t - a.lastShotAt < 2) || Math.hypot(a.x - p.x, a.z - p.z) < 9 || a.def.boss) dot(a.x, a.z, a.def.camera ? "#ff9a9a" : "#ff4a3a", a.def.boss ? 6 : 3);
    }
    c.restore();
    // игрок и конус взгляда
    c.fillStyle = "rgba(95,216,255,0.16)";
    c.beginPath();
    c.moveTo(R, R);
    c.arc(R, R, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(R, R - 6);
    c.lineTo(R - 4.5, R + 4.5);
    c.lineTo(R + 4.5, R + 4.5);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.3)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(R, R, R - 1.5, 0, Math.PI * 2);
    c.stroke();
  }
}
void ICON;
