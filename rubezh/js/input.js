// Управление: телефон (джойстик слева, взгляд — правой половиной, кнопки) и компьютер
// (WASD, мышь с захватом указателя, без захвата — перетаскиванием). Собирает кнопки на кадр.
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts; // { sens, tsens, inv, enabled() }
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.touchMode = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0, ox: 0, oy: 0 };
    this.lookT = { id: -1, x: 0, y: 0 };
    this.hold = {}; // кнопки, которые держат
    this.taps = {}; // нажатия на один кадр
    this.mouse = { left: false, right: false, drag: false, lx: 0, ly: 0 };
    this.locked = false;
    this.lockFailed = false;
    this.crouchToggle = false;
    this.aimToggle = false;
    this.wheel = 0;
    this.bind();
  }
  enabled() {
    return this.opts.enabled ? this.opts.enabled() : true;
  }
  // ---------- клавиатура и мышь ----------
  bind() {
    addEventListener("keydown", (e) => {
      if (!this.enabled()) return;
      if (e.repeat) return;
      const c = e.code;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyC", "Space"].includes(c)) e.preventDefault();
      this.keys.add(c);
      const map = { KeyR: "reload", KeyG: "grenade", KeyF: "melee", KeyV: "melee", KeyQ: "last", KeyT: "squad", KeyH: "kit", KeyX: "kit", Space: "jump", Tab: "gnext" };
      if (map[c]) this.taps[map[c]] = true;
      if (c === "Tab") e.preventDefault();
      if (c === "Digit1") this.taps.slot = "pri";
      if (c === "Digit2") this.taps.slot = "sec";
      if (c === "Digit3") this.taps.slot = "melee";
      if (c === "Digit4") this.taps.grenade = true;
      this.touchMode = false;
      document.body.classList.remove("touch");
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
      this.hold = {};
    });
    const cv = this.canvas;
    cv.addEventListener("mousedown", (e) => {
      if (!this.enabled() || this.touchMode) return;
      if (!this.locked && !this.lockFailed) this.lock();
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this.mouse.drag = !this.locked;
      this.mouse.lx = e.clientX;
      this.mouse.ly = e.clientY;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (!this.mouse.left && !this.mouse.right) this.mouse.drag = false;
    });
    addEventListener("mousemove", (e) => {
      if (!this.enabled() || this.touchMode) return;
      const k = 0.0022 * this.opts.sens();
      if (this.locked) {
        this.look.x -= e.movementX * k;
        this.look.y -= e.movementY * k * (this.opts.inv() ? -1 : 1);
      } else if (this.mouse.drag) {
        this.look.x -= (e.clientX - this.mouse.lx) * k * 1.6;
        this.look.y -= (e.clientY - this.mouse.ly) * k * 1.6 * (this.opts.inv() ? -1 : 1);
        this.mouse.lx = e.clientX;
        this.mouse.ly = e.clientY;
      }
    });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("wheel", (e) => {
      if (!this.enabled()) return;
      this.taps.next = true;
    }, { passive: true });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === cv;
      if (!this.locked && this.onUnlock) this.onUnlock();
    });
    document.addEventListener("pointerlockerror", () => {
      this.lockFailed = true;
    });
    // ---------- касания ----------
    const zone = $("touch-look");
    const stickZone = $("stick-zone");
    const pt = (t) => ({ x: t.clientX, y: t.clientY });
    stickZone.addEventListener("pointerdown", (e) => {
      if (!this.enabled() || e.pointerType === "mouse") return;
      this.touchMode = true;
      document.body.classList.add("touch");
      if (this.stick.id !== -1) return;
      const p = pt(e);
      this.stick.id = e.pointerId;
      this.stick.ox = p.x;
      this.stick.oy = p.y;
      this.stick.dx = this.stick.dy = 0;
      stickZone.setPointerCapture?.(e.pointerId);
      this.paintStick();
      e.preventDefault();
    });
    stickZone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.stick.id) return;
      const R = this.stickR();
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const L = Math.hypot(dx, dy);
      if (L > R) {
        this.stick.ox += (dx / L) * (L - R);
        this.stick.oy += (dy / L) * (L - R);
        dx = e.clientX - this.stick.ox;
        dy = e.clientY - this.stick.oy;
      }
      this.stick.dx = dx;
      this.stick.dy = dy;
      this.paintStick();
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = -1;
      this.stick.dx = this.stick.dy = 0;
      this.paintStick();
    };
    for (const n of ["pointerup", "pointercancel", "lostpointercapture"]) stickZone.addEventListener(n, endStick);
    // взгляд: правая часть экрана
    zone.addEventListener("pointerdown", (e) => {
      if (!this.enabled() || e.pointerType === "mouse") return;
      this.touchMode = true;
      document.body.classList.add("touch");
      if (this.lookT.id !== -1) return;
      this.lookT.id = e.pointerId;
      this.lookT.x = e.clientX;
      this.lookT.y = e.clientY;
      zone.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.lookT.id) return;
      this.lookMove(e.clientX - this.lookT.x, e.clientY - this.lookT.y);
      this.lookT.x = e.clientX;
      this.lookT.y = e.clientY;
    });
    const endLook = (e) => {
      if (e.pointerId === this.lookT.id) this.lookT.id = -1;
    };
    for (const n of ["pointerup", "pointercancel", "lostpointercapture"]) zone.addEventListener(n, endLook);
    // кнопки: удержание и нажатие; с кнопки огня и прицела можно вести взгляд, не отпуская
    const btn = (id, name, kind = "hold") => {
      const el = $(id);
      if (!el) return;
      let pid = -1, lx = 0, ly = 0;
      el.addEventListener("pointerdown", (e) => {
        if (!this.enabled()) return;
        e.preventDefault();
        e.stopPropagation();
        this.touchMode = e.pointerType !== "mouse" || this.touchMode;
        pid = e.pointerId;
        lx = e.clientX;
        ly = e.clientY;
        el.setPointerCapture?.(e.pointerId);
        el.classList.add("on");
        if (kind === "hold") this.hold[name] = true;
        else if (kind === "toggle") this[name + "Toggle"] = !this[name + "Toggle"];
        else this.taps[name] = true;
        if (this.onButton) this.onButton(name);
      });
      el.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pid || (name !== "fire" && name !== "aim")) return;
        this.lookMove(e.clientX - lx, e.clientY - ly);
        lx = e.clientX;
        ly = e.clientY;
      });
      const up = (e) => {
        if (e.pointerId !== pid) return;
        pid = -1;
        el.classList.remove("on");
        if (kind === "hold") this.hold[name] = false;
      };
      for (const n of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(n, up);
    };
    btn("t-fire", "fire");
    btn("t-fire2", "fire");
    btn("t-aim", "aim", "toggle");
    btn("t-crouch", "crouch", "toggle");
    btn("t-reload", "reload", "tap");
    btn("t-jump", "jump", "tap");
    btn("t-nade", "grenade", "tap");
    btn("t-gswap", "gnext", "tap");
    btn("t-swap", "next", "tap");
    btn("t-knife", "melee", "tap");
    btn("t-use", "use");
    btn("t-kit", "kit", "tap");
    btn("t-squad", "squad", "tap");
  }
  lookMove(dx, dy) {
    const k = 0.0052 * this.opts.tsens() * (this.assistK || 1);
    this.look.x -= dx * k;
    this.look.y -= dy * k * 0.85 * (this.opts.inv() ? -1 : 1);
  }
  stickR() {
    return Math.max(40, Math.min(64, Math.min(innerWidth, innerHeight) * 0.13));
  }
  paintStick() {
    const s = $("stick"), k = $("knob");
    const on = this.stick.id !== -1;
    s.classList.toggle("active", on);
    if (on) {
      s.style.left = this.stick.ox + "px";
      s.style.top = this.stick.oy + "px";
    } else {
      s.style.left = "";
      s.style.top = "";
    }
    k.style.transform = `translate(${this.stick.dx}px, ${this.stick.dy}px)`;
  }
  lock() {
    if (this.lockFailed || !this.canvas.requestPointerLock) return;
    const fail = () => {
      this.lockFailed = true;
    };
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch)
        r.catch(() => {
          // без «сырого» движения или вовсе нельзя — пробуем обычный захват, иначе перетаскивание
          try {
            const r2 = this.canvas.requestPointerLock();
            if (r2 && r2.catch) r2.catch(fail);
          } catch {
            fail();
          }
        });
    } catch {
      fail();
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
  // кнопки на этот кадр
  read() {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) mz += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mz -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (this.stick.id !== -1) {
      const R = this.stickR(), L = Math.hypot(this.stick.dx, this.stick.dy);
      if (L > 6) {
        const m = Math.min(1, L / (R * 0.8));
        mx = (this.stick.dx / L) * m;
        mz = (-this.stick.dy / L) * m;
      }
    }
    const crouchKey = k.has("ControlLeft") || k.has("ControlRight") || k.has("KeyC");
    const inp = {
      mx, mz,
      fire: this.mouse.left || !!this.hold.fire,
      aim: this.mouse.right || this.aimToggle,
      crouch: crouchKey || this.crouchToggle,
      walk: k.has("ShiftLeft") || k.has("ShiftRight") || (this.stick.id !== -1 && Math.hypot(this.stick.dx, this.stick.dy) < this.stickR() * 0.45),
      use: k.has("KeyE") || !!this.hold.use,
      lookDX: this.look.x,
      lookDY: this.look.y,
      ...this.taps,
    };
    this.look.x = this.look.y = 0;
    this.taps = {};
    return inp;
  }
  reset() {
    this.hold = {};
    this.taps = {};
    this.keys.clear();
    this.mouse.left = this.mouse.right = false;
    this.aimToggle = false;
    this.crouchToggle = false;
    this.look.x = this.look.y = 0;
    this.stick.id = -1;
    this.stick.dx = this.stick.dy = 0;
    this.lookT.id = -1;
    for (const el of document.querySelectorAll("#touch .on")) el.classList.remove("on");
    this.paintStick();
  }
}
