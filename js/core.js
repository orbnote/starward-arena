/* 星之翼 · 球体竞技场 —— 核心工具层 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const U = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
    dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    len(x, y) { return Math.sqrt(x * x + y * y); },
    norm(x, y) { const l = Math.sqrt(x * x + y * y) || 1; return { x: x / l, y: y / l }; },
    angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    /* 最短角差：结果落在 (-π, π] */
    angDiff(a, b) {
      let d = a - b;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d <= -Math.PI) d += Math.PI * 2;
      return d;
    },
    approach(v, target, step) {
      if (v < target) return Math.min(v + step, target);
      return Math.max(v - step, target);
    },
    fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)); },
    now() { return performance.now() / 1000; },
  };

  /* 引擎与渲染共用的几何参数：判定和画面必须读同一份，否则会出现
     「看着砍到了其实没砍到」。 */
  SW.TUNE = {
    kristaLen: 2.2,      /* 圣剑长度 = 玩家半径 × 此值 */
    kristaHitCd: 0.85,   /* 同一目标被剑扫到后的免疫时间 */
    whipHalf: 0.92,      /* 鞭子半张角（弧度） */
    touchScale: 0.85,       /* 接触伤害总倍率（密度抬高后靠它压单次伤害） */
  };

  /* 线段与圆相交（投射物判定） */
  U.segCircle = function (x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-6) return (fx * fx + fy * fy) <= r * r;
    let t = -(fx * dx + fy * dy) / a;
    t = U.clamp(t, 0, 1);
    const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
    return (px * px + py * py) <= r * r;
  };

  U.roundRect = function (g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  /* ---------- 图片资源 ---------- */
  const Assets = {
    cache: {},
    /* 换图之后把这里 +1，浏览器和 Service Worker 才会重新去拿。
       不带这个后缀的话，同名文件改了手机端能一直吃旧缓存。 */
    ver: 3,
    url(u) {
      if (!u || u.indexOf('?') >= 0 || u.indexOf('data:') === 0) return u;
      return u + '?v=' + this.ver;
    },
    load(url) {
      if (!url) return null;
      url = this.url(url);
      if (!this.cache[url]) {
        const im = new Image();
        im.decoding = 'async';
        im.src = url;
        this.cache[url] = im;
      }
      return this.cache[url];
    },
    get(url) {
      if (!url) return null;
      url = this.url(url);
      const im = this.cache[url];
      return (im && im.complete && im.naturalWidth > 0) ? im : null;
    },
  };

  /* ---------- 音效（WebAudio 合成） ---------- */
  const Audio = {
    ctx: null,
    muted: false,
    master: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, vol, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filterFreq || 1200;
      f.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.value = vol || 0.15;
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },
    shot() { this.tone(760, 0.09, 'square', 0.05, 300); },
    /* 雪鸮狙击：蓄力上升音 / 枪响 / 金属命中 */
    snipeCharge() {
      this.tone(120, 0.85, 'sawtooth', 0.05, 660);
      this.tone(240, 0.85, 'triangle', 0.03, 1320);
      this.noise(0.9, 0.04, 1800);
    },
    snipeShot() {
      this.noise(0.26, 0.26, 800);
      this.tone(92, 0.3, 'sawtooth', 0.13, 38);
      this.tone(1600, 0.1, 'square', 0.05, 240);
      this.noise(0.05, 0.2, 5200);
    },
    snipeHit() {
      this.tone(1250, 0.07, 'square', 0.07, 520);
      this.noise(0.18, 0.2, 1400);
      this.tone(150, 0.16, 'triangle', 0.08, 60);
    },
    blade() { this.noise(0.16, 0.14, 2600); this.tone(1400, 0.1, 'sawtooth', 0.03, 500); },
    hit() { this.noise(0.09, 0.13, 900); this.tone(180, 0.1, 'square', 0.07, 70); },
    crit() { this.noise(0.14, 0.18, 700); this.tone(130, 0.18, 'sawtooth', 0.09, 50); },
    laser() {
      /* 照射蓄力：渐强上升 */
      this.tone(180, 0.5, 'sawtooth', 0.06, 1200);
      this.tone(360, 0.45, 'square', 0.03, 1500);
      this.noise(0.5, 0.07, 2400);
    },
    laserBlast() {
      /* 照射发射：厚重轰鸣 + 高频闪耀 */
      this.tone(90, 0.7, 'sawtooth', 0.16, 55);
      this.tone(2400, 0.36, 'sawtooth', 0.05, 420);
      this.tone(4800, 0.2, 'square', 0.028, 2400);
      this.noise(0.6, 0.15, 1300);
      this.noise(0.5, 0.08, 5200);
    },
    awaken() { this.tone(220, 0.5, 'sawtooth', 0.07, 880); this.noise(0.5, 0.08, 1600); },
    ko() { this.tone(320, 0.6, 'sawtooth', 0.1, 40); this.noise(0.8, 0.2, 400); },
    ui() { this.tone(880, 0.05, 'square', 0.035, 1200); },
    win() { this.tone(660, 0.12, 'square', 0.07, 660); setTimeout(() => this.tone(990, 0.22, 'square', 0.07, 990), 110); },
    lose() { this.tone(330, 0.16, 'square', 0.06, 220); setTimeout(() => this.tone(220, 0.26, 'square', 0.06, 130), 140); },
  };

  /* ---------- 伤害飘字 / 粒子 ---------- */
  SW.Fx = {
    texts: [],
    parts: [],
    clear() { this.texts.length = 0; this.parts.length = 0; },
    text(x, y, str, color, size, opt) {
      /* 不超出画面 */
      const BW = (window.SW.Battle && window.SW.Battle.W) || 0;
      if (BW > 80) x = U.clamp(x, 34, BW - 34);
      /* 同位置连续飘字错开，避免叠成一团 */
      let dy = U.rand(-5, 5);
      const n = this.texts.length;
      for (let i = Math.max(0, n - 5); i < n; i++) {
        const t = this.texts[i];
        if (t.life > t.max - 0.22 && Math.abs(t.x - x) < 34 && Math.abs(t.y - y) < 20) {
          dy -= 16;
        }
      }
      const life = (opt && opt.life) || 0.9;
      const o = opt || {};
      this.texts.push({
        x, y, str, color: color || '#fff', size: size || 15,
        life, max: life, vy: (o.vy != null) ? o.vy : -46,
        vx: (o.vx != null) ? o.vx : U.rand(-14, 14),
        stroke: o.stroke || 'rgba(0,0,0,.85)',
        bold: !o.thin,
        /* 书法字：走毛笔渲染路径 */
        brush: !!o.brush,
        rot: o.rot || 0,
        ink: o.ink || null,
      });
    },
    burst(x, y, n, color, spd, size, life) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, Math.PI * 2);
        const s = U.rand(spd * 0.35, spd);
        this.parts.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: U.rand((life || 0.5) * 0.5, life || 0.5),
          max: life || 0.5,
          color, size: U.rand(1.5, size || 3.5),
          drag: U.rand(2.2, 4.5),
        });
      }
    },
    ring(x, y, color, r0, r1, life) {
      this.parts.push({ ring: true, x, y, r: r0, r1, life, max: life, color });
    },
    boom(x, y, r, color, life) {
      const lf = life || 2;
      /* 限制同屏爆风数量，避免叠成一团 */
      const bs = this.parts.filter(pp => pp.boom);
      if (bs.length >= 8) {
        const idx = this.parts.indexOf(bs[0]);
        if (idx >= 0) this.parts.splice(idx, 1);
      }
      this.parts.push({
        boom: true, x, y, r,
        color: color || '#5cb8ff',
        life: lf, max: lf, delay: 0,
      });
    },
    /* 穿甲锥形：命中点沿弹道方向炸开的放射锥 */
    cone(x, y, ang, len, half, color, life) {
      const lf = life || .34;
      this.parts.push({
        cone: true, x, y, ang, len, half: half || .32,
        color: color || '#dfe6ec', life: lf, max: lf,
      });
    },
    slash(x1, y1, x2, y2, color, life, delay, width) {
      const lf = life || 0.32;
      this.parts.push({
        line: true, x: x1, y: y1, x2, y2,
        color: color || 'rgba(255,255,255,.92)',
        life: lf, max: lf, delay: delay || 0, w: width || 0,
      });
    },
    update(dt) {
      const T = this.texts;
      for (let i = T.length - 1; i >= 0; i--) {
        const t = T[i];
        t.life -= dt;
        if (t.life <= 0) { T.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.x += t.vx * dt;
        t.vy += 30 * dt;
      }
      const P = this.parts;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.life -= dt;
        if (p.life <= 0) { P.splice(i, 1); continue; }
        if (p.ring || p.line || p.boom || p.cone) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const d = 1 - Math.min(1, p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
    },
  };

  SW.U = U;
  SW.Audio = Audio;
  SW.Assets = Assets;
})(window.SW);
