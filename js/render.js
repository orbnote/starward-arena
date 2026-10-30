/* 星之翼 · 球体竞技场 —— 渲染层 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U, Fx = SW.Fx;
  const B = SW.Battle;
  const KRISTA_LEN = (SW.TUNE && SW.TUNE.kristaLen) || 3;

  function rgba(hex, a) {
    let h = String(hex || '#ff3b52').replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16) || 0xff3b52;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  const R = {
    cv: null, ctx: null, dpr: 1, W: 0, H: 0,
    bg: null, bgW: 0, bgH: 0, stars: [],
    t: 0,
  };

  R.init = function (cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  };

  /* 舞台自己会变高变矮（下注条随系统字体换行、地址栏收起、键盘弹出），
     这些都不会触发 window.resize。画布是写死的 px 尺寸，不重新量就会
     比舞台高出一截，多出来的那截被 #stage 的 overflow:hidden 切掉 ——
     看上去就是底部的技能字幕被下注条压住了。所以每次变化都对比一次。 */
  R.fit = function () {
    if (!this.cv) return false;
    const rect = this.cv.parentElement.getBoundingClientRect();
    if (Math.abs(rect.width - this.W) < 0.5 && Math.abs(rect.height - this.H) < 0.5) return false;
    this.resize();
    return true;
  };

  R.resize = function () {
    if (!this.cv) return;
    const rect = this.cv.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(200, rect.width);
    this.H = Math.max(200, rect.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    if (B.W > 0) B.layout(this.W, this.H);
    else B.layout(this.W, this.H);
    this.buildBG();
  };

  /* ============================ 背景 ============================ */
  R.buildBG = function () {
    const dpr = this.dpr, W = this.W, H = this.H;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* 深空底色 */
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#070d1c');
    bg.addColorStop(0.55, '#050a16');
    bg.addColorStop(1, '#02040b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    /* 星点 */
    g.save();
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const s = Math.random() < 0.85 ? 1 : 2;
      const a = 0.12 + Math.random() * 0.55;
      g.fillStyle = `rgba(${160 + Math.random() * 80 | 0},${200 + Math.random() * 55 | 0},255,${a})`;
      g.fillRect(x, y, s, s);
    }
    g.restore();

    /* 场地外六边形网格 */
    const f = B.field;
    g.strokeStyle = 'rgba(70,140,220,.1)';
    g.lineWidth = 1;
    const hexR = 26;
    const hh = hexR * Math.sqrt(3);
    for (let row = -1; row * hh < H + hh; row++) {
      for (let col = -1; col * hexR * 1.5 < W + hexR * 2; col++) {
        const cx = col * hexR * 1.5;
        const cy = row * hh + (col % 2 ? hh / 2 : 0);
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 180 * (60 * k - 30);
          const px = cx + Math.cos(a) * hexR, py = cy + Math.sin(a) * hexR;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }

    /* 场地地面 */
    g.save();
    U.roundRect(g, f.x, f.y, f.w, f.h, 6);
    g.clip();

    const fg = g.createRadialGradient(
      f.x + f.w / 2, f.y + f.h * 0.46, 10,
      f.x + f.w / 2, f.y + f.h * 0.46, Math.max(f.w, f.h) * 0.75
    );
    fg.addColorStop(0, 'rgba(20,48,92,.55)');
    fg.addColorStop(0.55, 'rgba(9,20,40,.72)');
    fg.addColorStop(1, 'rgba(3,7,16,.92)');
    g.fillStyle = fg;
    g.fillRect(f.x, f.y, f.w, f.h);

    /* 地面细网格 */
    g.strokeStyle = 'rgba(80,160,255,.055)';
    g.lineWidth = 1;
    const step = 42;
    for (let x = f.x; x < f.x + f.w; x += step) {
      g.beginPath(); g.moveTo(x, f.y); g.lineTo(x, f.y + f.h); g.stroke();
    }
    for (let y = f.y; y < f.y + f.h; y += step) {
      g.beginPath(); g.moveTo(f.x, y); g.lineTo(f.x + f.w, y); g.stroke();
    }

    /* 中央星盘 */
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    g.strokeStyle = 'rgba(90,180,255,.12)';
    g.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) {
      g.beginPath();
      g.arc(cx, cy, Math.min(f.w, f.h) * 0.11 * i, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - f.w * 0.18, cy); g.lineTo(cx + f.w * 0.18, cy);
    g.moveTo(cx, cy - f.h * 0.14); g.lineTo(cx, cy + f.h * 0.14);
    g.stroke();

    /* 中央六边形 */
    g.strokeStyle = 'rgba(110,200,255,.16)';
    g.lineWidth = 1.6;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 30);
      const px = cx + Math.cos(a) * Math.min(f.w, f.h) * 0.075;
      const py = cy + Math.sin(a) * Math.min(f.w, f.h) * 0.075;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.stroke();

    /* 边角装饰 */
    g.strokeStyle = 'rgba(90,180,255,.2)';
    g.lineWidth = 2;
    const L = 26;
    const corners = [
      [f.x + 8, f.y + 8, 1, 1], [f.x + f.w - 8, f.y + 8, -1, 1],
      [f.x + 8, f.y + f.h - 8, 1, -1], [f.x + f.w - 8, f.y + f.h - 8, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      g.beginPath();
      g.moveTo(x + L * sx, y); g.lineTo(x, y); g.lineTo(x, y + L * sy);
      g.stroke();
    }
    g.restore();

    /* 场地边框 */
    g.save();
    g.strokeStyle = 'rgba(80,170,255,.5)';
    g.lineWidth = 1.6;
    g.shadowColor = 'rgba(70,180,255,.8)';
    g.shadowBlur = 14;
    U.roundRect(g, f.x, f.y, f.w, f.h, 6);
    g.stroke();
    g.restore();

    this.bg = c;
    this.bgW = W; this.bgH = H;
  };

  /* ============================ 绘制入口 ============================ */
  R.draw = function (dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.t += dt;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0, this.W, this.H);
    }

    ctx.save();
    ctx.translate(B.shakeX, B.shakeY);

    this.drawDecor(ctx);
    this.drawZones(ctx);
    this.drawBloodFields(ctx);
    this.drawGems(ctx);
    this.drawPveTelegraph(ctx);
    this.drawHole(ctx);
    this.drawProjectiles(ctx);
    this.drawPacks(ctx);
    this.drawShuraSlash(ctx);
    this.drawFighters(ctx);
    this.drawMines(ctx);
    this.drawPveShots(ctx);
    this.drawShura(ctx);
    this.drawFx(ctx);

    ctx.restore();

    this.drawOverlay(ctx);
  };

  /* ============================ PvE 敌情预警 ============================ */
  /* 蓄力线 / 下劈红圈：让远程兵种「看得见、躲得掉」 */
  R.drawPveTelegraph = function (ctx) {
    if (!B.pveOn) return;
    const pv = B.pve;
    if (!pv) return;
    const sc = B.scale();
    const t = this.t;

    for (const m of B.fighters) {
      if (!m.isMob || m.dead || !(m.windT > 0) || !m.kind || !m.kind.aiP) continue;
      const P = m.kind.aiP;
      const isBeam = m.kind.ai === 'beam';
      const k = 1 - Math.min(1, m.windT / (P.wind || 0.5));
      const a = m.aimA || 0;
      const len = (isBeam ? (P.len || 400) : 250) * sc;

      ctx.save();
      ctx.globalAlpha = 0.3 + k * 0.62;
      ctx.strokeStyle = isBeam ? 'rgba(255,72,120,.95)' : 'rgba(255,228,150,.95)';
      ctx.lineWidth = 2.4 * sc;
      ctx.setLineDash([9 * sc, 9 * sc]);
      ctx.lineDashOffset = -t * 46;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + Math.cos(a) * len, m.y + Math.sin(a) * len);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 枪口聚光 + 收束环（环越小 = 越快开火） */
      const px = m.x + Math.cos(a) * (m.r + 8 * sc);
      const py = m.y + Math.sin(a) * (m.r + 8 * sc);
      ctx.beginPath();
      ctx.arc(px, py, (3 + k * 5) * sc, 0, Math.PI * 2);
      ctx.fillStyle = isBeam ? 'rgba(255,120,160,.95)' : 'rgba(255,240,190,.95)';
      ctx.fill();
      if (isBeam) {
        ctx.beginPath();
        ctx.arc(px, py, (26 - k * 18) * sc, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,110,150,' + (0.35 + k * 0.5).toFixed(2) + ')';
        ctx.lineWidth = 2 * sc;
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 破烂女士：黑洞（跟随玩家）。视觉沿用 1v1 的 drawHole —— 双翅 + 黑心 + 白环 + 吸入碎光 */
    const wh = pv.weapons && pv.weapons.akigumo_broken;
    if (wh && wh.lvl > 0 && pv.player && !pv.player.dead) {
      const sc0 = B.scale();
      /* 视觉半径锁判定半径：黑洞要一眼看出是黑洞，不能再是个小圈 */
      const st = B.weaponStats ? B.weaponStats('akigumo_broken') : null;
      const RR = (st && st.r ? st.r : 104) * sc0;
      const cx = pv.player.x, cy = pv.player.y;
      const pulse = 0.94 + Math.sin(t * 2.4) * 0.06;
      const ringIn = RR * 0.865, ringOut = RR * 1.0;
      const spin = (pv.holeSpin = (pv.holeSpin || 0) + 0.016);

      /* 外光晕 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(cx, cy, ringOut * 0.9, cx, cy, RR * 1.9);
      halo.addColorStop(0, 'rgba(140,185,255,.20)');
      halo.addColorStop(.40, 'rgba(55,105,235,.09)');
      halo.addColorStop(1, 'rgba(10,30,90,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, RR * 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* 双翅 */
      ctx.save();
      ctx.translate(cx, cy);
      const wing = dir => {
        ctx.save();
        ctx.scale(dir, 1);
        const wg = ctx.createLinearGradient(RR * 0.64, 0, RR * 1.72, 0);
        wg.addColorStop(0, 'rgba(226,238,255,.85)');
        wg.addColorStop(.35, 'rgba(255,255,255,.92)');
        wg.addColorStop(.72, 'rgba(232,243,255,.88)');
        wg.addColorStop(1, 'rgba(150,190,255,.08)');
        ctx.beginPath();
        ctx.moveTo(RR * 0.70, -RR * 0.27);
        ctx.bezierCurveTo(RR * 1.02, -RR * 0.34, RR * 1.42, -RR * 0.21, RR * 1.68, -RR * 0.025);
        ctx.quadraticCurveTo(RR * 1.75, 0, RR * 1.68, RR * 0.025);
        ctx.bezierCurveTo(RR * 1.42, RR * 0.21, RR * 1.02, RR * 0.34, RR * 0.70, RR * 0.27);
        ctx.closePath();
        ctx.fillStyle = wg;
        ctx.fill();
        ctx.restore();
      };
      wing(-1); wing(1);
      ctx.restore();

      /* 进化·磁铁：外圈多两层反向旋转的紫色轨道（黑腔已经不是原来那个圈了） */
      if (pv.evolved && pv.evolved.akigumo_broken) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
          const rr = RR * (0.74 + i * 0.24);
          const sp = t * (i ? -1.5 : 1.9);
          ctx.beginPath();
          ctx.arc(cx, cy, rr, sp, sp + Math.PI * 1.35);
          ctx.strokeStyle = 'rgba(190,140,255,' + (0.5 - i * 0.16).toFixed(3) + ')';
          ctx.lineWidth = 2.4 - i * 0.8;
          ctx.stroke();
        }
        ctx.restore();
      }

      /* 黑心 */
      ctx.save();
      const core = ctx.createRadialGradient(cx, cy, RR * .05, cx, cy, ringIn * 1.02);
      core.addColorStop(0, 'rgba(2,5,14,.38)');
      core.addColorStop(.55, 'rgba(2,5,14,.58)');
      core.addColorStop(.86, 'rgba(3,8,22,.80)');
      core.addColorStop(1, 'rgba(10,19,48,.94)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, ringIn * 1.02, 0, Math.PI * 2); ctx.fill();

      /* 白环 */
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(cx, cy, ringIn, cx, cy, ringOut);
      rg.addColorStop(0, 'rgba(105,150,225,' + (0.30 * pulse).toFixed(3) + ')');
      rg.addColorStop(.16, 'rgba(196,220,255,' + (0.78 * pulse).toFixed(3) + ')');
      rg.addColorStop(.48, 'rgba(253,254,255,' + (0.99 * pulse).toFixed(3) + ')');
      rg.addColorStop(.74, 'rgba(238,246,255,' + (0.97 * pulse).toFixed(3) + ')');
      rg.addColorStop(.92, 'rgba(178,208,255,' + (0.72 * pulse).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(120,165,240,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, ringOut, 0, Math.PI * 2);
      ctx.arc(cx, cy, ringIn, 0, Math.PI * 2, true);
      ctx.fill();

      /* 环上高光 */
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * pulse).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.2, RR * 0.045);
      const mid = (ringIn + ringOut) * .5;
      for (let i = 0; i < 3; i++) {
        const a0 = spin * 0.85 + i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.arc(cx, cy, mid, a0, a0 + 0.55 + i * 0.22);
        ctx.stroke();
      }

      /* 吸入碎光 */
      for (let i = 0; i < 16; i++) {
        const ph = ((t * 0.5 + i / 16) % 1);
        const a = i * 2.399 + spin * 0.4;
        const rr = RR * (1.7 - 1.3 * ph);
        const al = Math.sin(ph * Math.PI) * 0.75;
        ctx.fillStyle = 'rgba(185,220,255,' + al.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 1.2 + (1 - ph) * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* 净化之光：照射本体 */
    for (const m of B.fighters) {
      if (!m.isMob || m.dead || !m.beam) continue;
      const b = m.beam;
      const k = Math.max(0, Math.min(1, b.t / 0.5));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,150,215,' + (0.22 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * 2.6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,205,240,' + (0.55 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * 1.15;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (1.0 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * 0.34;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.restore();
    }

    /* 米米：G·诺伦 爆炸领域 —— 直接复用 1v1 的领域画法，两边长一个样 */
    const nukes = pv.zones || [];
    const nz = nukes.length;
    for (let i = 0; i < nz; i++) {
      const z = nukes[i];
      const age = (z.dur || 0) - z.t;
      this.drawZoneOne(ctx, {
        x: z.x, y: z.y, t: age, rad: z.r, R: z.R,
        grow: z.grow || 0,
        hold: Math.max(0.2, (z.dur || 0) - (z.grow || 0) - 1.1),
        color: z.color || '#ffc24a',
        alpha: 1.6, fill: .30,
      }, t, Math.max(1, nz), { lite: i < nz - 1 });
    }

    const p = pv.player;

    /* 血月修女「血域」：预警圈 → 落地圈，两者都以锁定的玩家坐标为圆心（= 判定位置） */
    for (const m of B.fighters) {
      if (!m.isMob || m.dead || !m.kind || m.kind.ai !== 'blood') continue;
      if (!(m.fieldOn > 0) && !(m.fieldWind > 0)) continue;
      const R = ((m.kind.aiP && m.kind.aiP.fieldR) || 190) * sc;
      const T = m.kind.tint || [224, 40, 70];
      const fx = m.fieldX != null ? m.fieldX : m.x;
      const fy = m.fieldY != null ? m.fieldY : m.y;
      const line = 'rgba(' + Math.min(255, T[0] + 30) + ',' + Math.min(255, T[1] + 44) + ','
        + Math.min(255, T[2] + 40) + ',';
      ctx.save();
      if (m.fieldWind > 0) {
        /* 0.6 秒预警：外圈定死落点，内圈往里收，收到边就落 */
        const k = Math.max(0, Math.min(1, 1 - m.fieldWind / 0.6));
        ctx.beginPath();
        ctx.arc(fx, fy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',' + (0.05 + 0.07 * k).toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = line + (0.35 + 0.3 * k).toFixed(3) + ')';
        ctx.lineWidth = 2 * sc;
        ctx.setLineDash([10 * sc, 10 * sc]);
        ctx.lineDashOffset = t * 40;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(6, R * (0.92 - 0.8 * k)), 0, Math.PI * 2);
        ctx.strokeStyle = line + (0.55 + 0.35 * k).toFixed(3) + ')';
        ctx.lineWidth = 2.4 * sc;
        ctx.setLineDash([]);
        ctx.stroke();
      } else {
        const fade = Math.min(1, m.fieldOn / 0.4);
        ctx.beginPath();
        ctx.arc(fx, fy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',' + (0.11 * fade).toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = line + (0.72 * fade).toFixed(3) + ')';
        ctx.lineWidth = 2 * sc;
        ctx.setLineDash([12 * sc, 9 * sc]);
        ctx.lineDashOffset = -t * 44;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  };

  /* ============================ PvE 敌方弹幕 ============================ */
  R.drawPveShots = function (ctx) {
    if (!B.pveOn) return;
    const pv = B.pve;
    if (!pv) return;
    const t = this.t;
    const p = pv.player;

    /* 秋云：挥砍刀光（透视椭圆弧带） */
    for (const f of (pv.whipFx || [])) {
      if (f.delay > 0) continue;
      const k = Math.max(0, Math.min(1, f.t / f.life));
      const a = Math.pow(k, 0.42);
      const prog = 1 - k;
      const outer = f.reach * (0.86 + 0.20 * prog);
      const thick = f.reach * 0.17;
      const inner = outer - thick;
      const sq = f.squash || 0.55;
      const sweep = -f.half + f.half * 2 * Math.min(1, prog * 1.55);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.dir);
      ctx.scale(1, sq);

      /* 刀光：实心扇带（不是只描一道边）—— 整片填满，尾端渐隐、刀尖接近纯白。
         用「一条路径 + 线性渐变」一次填完，分段填会在接缝处留下一排梳齿。 */
      ctx.globalCompositeOperation = 'lighter';
      const evo = !!(pv.evolved && pv.evolved.akigumo);
      const arcA = Math.pow(k, 0.5);
      const P0x = Math.cos(-f.half) * outer, P0y = Math.sin(-f.half) * outer;
      const P1x = Math.cos(sweep) * outer, P1y = Math.sin(sweep) * outer;
      const far = Math.hypot(P1x - P0x, P1y - P0y) > 8;

      ctx.beginPath();
      ctx.arc(0, 0, outer, -f.half, sweep);
      ctx.arc(0, 0, inner, sweep, -f.half, true);
      ctx.closePath();
      let bandFill;
      if (far) {
        bandFill = ctx.createLinearGradient(P0x, P0y, P1x, P1y);
        if (evo) {
          bandFill.addColorStop(0, 'rgba(255,170,60,0.05)');
          bandFill.addColorStop(0.45, 'rgba(255,196,92,0.40)');
          bandFill.addColorStop(0.85, 'rgba(255,240,190,0.80)');
          bandFill.addColorStop(1, 'rgba(255,255,255,0.96)');
        } else {
          bandFill.addColorStop(0, 'rgba(255,130,110,0.05)');
          bandFill.addColorStop(0.45, 'rgba(255,150,130,0.36)');
          bandFill.addColorStop(0.85, 'rgba(255,224,200,0.74)');
          bandFill.addColorStop(1, 'rgba(255,255,255,0.94)');
        }
      } else {
        bandFill = evo ? 'rgba(255,210,120,0.45)' : 'rgba(255,160,140,0.40)';
      }
      ctx.fillStyle = bandFill;
      ctx.globalAlpha = arcA;
      ctx.fill();

      /* 外缘刃口：一道实心亮弧，让"刀在哪"一眼能看见 */
      ctx.beginPath();
      ctx.arc(0, 0, outer, -f.half, sweep);
      ctx.strokeStyle = evo ? 'rgba(255,250,225,.96)' : 'rgba(255,246,236,.94)';
      ctx.lineWidth = Math.max(2.2, thick * 0.34);
      ctx.stroke();
      /* 内缘余烬：压住扇带的下沿，避免糊成一片 */
      ctx.beginPath();
      ctx.arc(0, 0, inner + thick * 0.10, -f.half, sweep);
      ctx.strokeStyle = evo ? 'rgba(255,160,60,.46)' : 'rgba(255,110,90,.42)';
      ctx.lineWidth = Math.max(1.6, thick * 0.24);
      ctx.stroke();
      ctx.globalAlpha = 1;

      /* 刀尖亮点 */
      const tx = Math.cos(sweep) * outer, ty = Math.sin(sweep) * outer * sq;
      const rg = ctx.createRadialGradient(tx, ty, 0, tx, ty, thick * 1.6);
      rg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * k).toFixed(3) + ')');
      rg.addColorStop(0.4, evo
        ? 'rgba(255,210,120,' + (0.6 * k).toFixed(3) + ')'
        : 'rgba(255,190,160,' + (0.5 * k).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,150,120,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(tx, ty, thick * 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }


    /* 玩家武器：血环（吸血鬼小修女） */
    const wv = pv.weapons && pv.weapons.vampkrista;
    if (wv && wv.lvl > 0 && p && !p.dead) {
      const rad = (118 + (wv.lvl - 1) * 10) * B.scale();
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224,64,90,.09)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,96,126,.34)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 26;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    /* 玩家武器：环绕大剑（照 1v1 的画法：从身体伸出、根部粗剑尖细） */
    const wk = pv.weapons && pv.weapons.krista;
    if (wk && wk.lvl > 0 && p && !p.dead) {
      const n = wk.lvl >= 5 ? 2 : 1;
      const len = p.r * KRISTA_LEN;
      const evoK = !!(pv.evolved && pv.evolved.krista);
      const wB = p.r * 0.46, wT = p.r * 0.1;
      for (let i = 0; i < n; i++) {
        const ang = (pv.orbitA || 0) + i / n * Math.PI * 2;
        const x1 = p.x + Math.cos(ang) * p.r * 0.9;
        const y1 = p.y + Math.sin(ang) * p.r * 0.9;
        const x2 = p.x + Math.cos(ang) * (p.r * 0.9 + len);
        const y2 = p.y + Math.sin(ang) * (p.r * 0.9 + len);
        const nx = -Math.sin(ang), ny = Math.cos(ang);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        /* 外层光晕 */
        ctx.fillStyle = evoK ? 'rgba(255,214,120,.20)' : 'rgba(70,255,140,.16)';
        ctx.beginPath();
        ctx.moveTo(x1 + nx * wB * 1.7, y1 + ny * wB * 1.7);
        ctx.lineTo(x1 - nx * wB * 1.7, y1 - ny * wB * 1.7);
        ctx.lineTo(x2 - nx * wT * 2.4, y2 - ny * wT * 2.4);
        ctx.lineTo(x2 + nx * wT * 2.4, y2 + ny * wT * 2.4);
        ctx.closePath();
        ctx.fill();
        /* 剑体渐变（进化后整把转金） */
        const gg = ctx.createLinearGradient(x1, y1, x2, y2);
        if (evoK) {
          gg.addColorStop(0, '#ff9f2e');
          gg.addColorStop(0.45, '#ffe8a8');
          gg.addColorStop(1, 'rgba(255,255,255,.98)');
        } else {
          gg.addColorStop(0, '#2fe07c');
          gg.addColorStop(0.45, '#8dffb0');
          gg.addColorStop(1, 'rgba(255,255,255,.95)');
        }
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(x1 + nx * wB, y1 + ny * wB);
        ctx.lineTo(x1 - nx * wB, y1 - ny * wB);
        ctx.lineTo(x2 - nx * wT, y2 - ny * wT);
        ctx.lineTo(x2 + nx * wT, y2 + ny * wT);
        ctx.closePath();
        ctx.fill();
        /* 白芯 */
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* 克丽丝塔进化：地面上的金色十字架（横竖两条矩形就是判定区） */
    for (const c of (pv.crosses || [])) {
      const kk = Math.min(1, c.t / 0.45);
      const grow = Math.min(1, c.drawT / 0.22);
      const L = c.len * grow, W = c.wid;
      const pulse = 0.78 + 0.22 * Math.sin(t * 9 + c.x * 0.01);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = kk;
      const bar = (horiz) => {
        const x = horiz ? c.x - L : c.x - W;
        const y = horiz ? c.y - W : c.y - L;
        const w = horiz ? L * 2 : W * 2;
        const h = horiz ? W * 2 : L * 2;
        const g = horiz
          ? ctx.createLinearGradient(0, c.y - W, 0, c.y + W)
          : ctx.createLinearGradient(c.x - W, 0, c.x + W, 0);
        g.addColorStop(0, 'rgba(255,190,70,0)');
        g.addColorStop(0.34, 'rgba(255,206,98,' + (0.46 * pulse).toFixed(3) + ')');
        g.addColorStop(0.5, 'rgba(255,250,226,' + (0.86 * pulse).toFixed(3) + ')');
        g.addColorStop(0.66, 'rgba(255,206,98,' + (0.46 * pulse).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,190,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        /* 两端收口 */
        ctx.strokeStyle = 'rgba(255,244,206,' + (0.5 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      };
      /* 先横后竖 —— 像真的在"画"一个十字 */
      if (grow > 0) bar(true);
      if (grow > 0.5) bar(false);
      /* 中心交点 */
      const cr = W * (1.1 + 0.18 * Math.sin(t * 12));
      const rg2 = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, cr);
      rg2.addColorStop(0, 'rgba(255,255,245,' + (0.9 * pulse).toFixed(3) + ')');
      rg2.addColorStop(0.5, 'rgba(255,214,120,' + (0.45 * pulse).toFixed(3) + ')');
      rg2.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = rg2;
      ctx.beginPath(); ctx.arc(c.x, c.y, cr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* 莱茵进化：三叉持续照射（方向锁死，起点跟着人走） */
    const LZ = pv.lance;
    if (LZ && p) {
      const life = Math.min(1, LZ.t / 0.3) * Math.min(1, (LZ.dur - LZ.t) / 0.18);
      const fld = B.field;
      const flick = 0.86 + 0.14 * Math.sin(t * 40);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < LZ.count; i++) {
        const ang = LZ.a + (i - (LZ.count - 1) / 2) * LZ.spread;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        /* 打到场地边界就停，别让光柱穿过边框糊到黑底上 */
        let len = 1200;
        if (dx > 0.001) len = Math.min(len, (fld.x + fld.w - p.x) / dx);
        if (dx < -0.001) len = Math.min(len, (fld.x - p.x) / dx);
        if (dy > 0.001) len = Math.min(len, (fld.y + fld.h - p.y) / dy);
        if (dy < -0.001) len = Math.min(len, (fld.y - p.y) / dy);
        len = Math.max(60, len);
        const ex = p.x + dx * len, ey = p.y + dy * len;
        const w0 = 13 * (i === 1 ? 1.25 : 1);
        ctx.strokeStyle = 'rgba(58,150,255,' + (0.22 * life * flick).toFixed(3) + ')';
        ctx.lineWidth = w0 * 3.0;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,205,255,' + (0.55 * life * flick).toFixed(3) + ')';
        ctx.lineWidth = w0 * 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,252,255,' + (0.92 * life * flick).toFixed(3) + ')';
        ctx.lineWidth = w0 * 0.55;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        /* 枪口 */
        ctx.fillStyle = 'rgba(220,246,255,' + (0.85 * life).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * p.r, p.y + Math.sin(ang) * p.r, w0 * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    /* 净化类激光残留（保留通道）；gold = 进化后的圣光激光 */
    for (const b of (pv.beams || [])) {
      const k = Math.max(0, Math.min(1, b.t / (b.life || 0.26)));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = b.gold
        ? 'rgba(255,205,110,' + (0.26 * k).toFixed(3) + ')'
        : 'rgba(255,170,225,' + (0.20 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * (b.gold ? 3.0 : 2.4);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = b.gold
        ? 'rgba(255,238,180,' + (0.62 * k).toFixed(3) + ')'
        : 'rgba(255,215,240,' + (0.55 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * 0.95;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.92 * k).toFixed(3) + ')';
      ctx.lineWidth = b.wid * 0.3;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.restore();
    }


    for (const s of (pv.shots || [])) {
      ctx.save();
      if (s.side === 'p') {
        const r = s.r;
        /* 影：分身（直接复用 1v1 的虚影画法，不跟随弹道旋转） */
        if (s.kind === 'clone') {
          const ch = SW.Data.get('shadow');
          const urls = ch && ch.faces && ch.faces.clones;
          const url = urls ? urls[Math.floor(Math.abs(s.spin) * 1.7) % urls.length] : null;
          drawShadowGhost(ctx, ch, s.x, s.y, r * 3.6, 'blue', 0.95, url);
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 4.1, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(122,150,255,.5)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
          continue;
        }
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        if (s.kind === 'nuke') {
          /* 米米：诺伦核弹 —— 与 1v1 同一个东西：高速拖尾 + 行李箱 + 收缩危险环 */
          const blink = 0.55 + 0.45 * Math.sin(t * 34 + s.spin);
          const fk = s.stuck ? Math.max(0, s.life / (s.fuse || 0.45)) : 1;
          const hot = 1 - fk;
          ctx.globalCompositeOperation = 'lighter';

          /* 飞行拖尾（黏住后不再拖） */
          if (!s.stuck) {
            const tg = ctx.createLinearGradient(0, 0, -r * 11, 0);
            tg.addColorStop(0, 'rgba(160,235,255,.62)');
            tg.addColorStop(1, 'rgba(60,150,255,0)');
            ctx.strokeStyle = tg;
            ctx.lineWidth = r * 1.1;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 11, 0); ctx.stroke();
          }

          /* 危险环：往中心收，收到底就炸 */
          ctx.strokeStyle = 'rgba(255,150,90,' + (0.55 + 0.45 * hot).toFixed(2) + ')';
          ctx.lineWidth = 2 + 2 * hot;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.7 + 2.6 * fk), 0, Math.PI * 2);
          ctx.stroke();

          /* 外光 */
          ctx.fillStyle = 'rgba(95,208,240,' + (0.16 + 0.26 * hot).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(0, 0, r * (2.2 + 1.6 * hot), 0, Math.PI * 2); ctx.fill();

          /* 背包本体：缩比的 G·诺伦 行李箱 */
          ctx.globalCompositeOperation = 'source-over';
          const bs = r * 2.6;
          ctx.shadowColor = '#7fe8ff';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#16324f';
          U.roundRect(ctx, -bs * .78, -bs * .92, bs * 1.56, bs * 1.9, 3);
          ctx.fill();
          ctx.fillStyle = '#2f76b8';
          U.roundRect(ctx, -bs * .78, -bs * .92, bs * 1.56, bs * .78, 3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(180,240,255,.92)';
          ctx.lineWidth = 1.3;
          U.roundRect(ctx, -bs * .78, -bs * .92, bs * 1.56, bs * 1.9, 3);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.moveTo(-bs * .78, bs * .16);
          ctx.lineTo(bs * .78, bs * .16);
          ctx.strokeStyle = 'rgba(200,245,255,.5)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          /* 核心宝石 */
          ctx.fillStyle = '#e6fbff';
          ctx.beginPath();
          ctx.moveTo(0, -bs * .3);
          ctx.lineTo(bs * .3, bs * .02);
          ctx.lineTo(0, bs * .34);
          ctx.closePath();
          ctx.fill();
          /* 引信白闪 */
          if (s.stuck) {
            ctx.fillStyle = 'rgba(255,255,255,' + blink.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(0, 0, bs * .26, 0, Math.PI * 2); ctx.fill();
          }
        } else if (s.kind === 'lance') {
          /* 莱茵：龙炮光枪（加长弹体 + 双层尾焰，不然贴着玩家时看不见） */
          ctx.globalCompositeOperation = 'lighter';
          const tail = ctx.createLinearGradient(-r * 6, 0, r * 1.2, 0);
          tail.addColorStop(0, 'rgba(40,120,255,0)');
          tail.addColorStop(0.55, 'rgba(70,170,255,.42)');
          tail.addColorStop(1, 'rgba(150,220,255,.85)');
          ctx.fillStyle = tail;
          ctx.beginPath();
          ctx.ellipse(-r * 2.6, 0, r * 4.2, r * 1.35, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(160,225,255,.96)';
          ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 1.5, r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.72, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (s.kind === 'disc') {
          /* 天剑·TransAM：双头剑高速旋转（两头刀身 + 中心轮毂 + 旋转残光） */
          const L = r * 2.5, W = r * 0.32;
          ctx.globalCompositeOperation = 'lighter';
          /* 旋转残光：两圈半透明刀路，转速快到糊成光轮 */
          for (let i = 0; i < 2; i++) {
            const rr = L * (0.60 + i * 0.18);
            ctx.strokeStyle = 'rgba(130,220,255,' + (0.20 - i * 0.06).toFixed(2) + ')';
            ctx.lineWidth = r * (1.5 - i * 0.45);
            ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.rotate(t * 26 + s.spin);
          for (let i = 0; i < 2; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI);
            const g2 = ctx.createLinearGradient(-L * 0.2, 0, L, 0);
            g2.addColorStop(0, 'rgba(110,190,255,.30)');
            g2.addColorStop(0.55, 'rgba(196,236,255,.92)');
            g2.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.fillStyle = g2;
            ctx.beginPath();
            ctx.moveTo(-L * 0.24, W);
            ctx.lineTo(L * 0.9, W * 0.34);
            ctx.lineTo(L, 0);
            ctx.lineTo(L * 0.9, -W * 0.34);
            ctx.lineTo(-L * 0.24, -W);
            ctx.closePath();
            ctx.fill();
            /* 护手 */
            ctx.fillStyle = 'rgba(92,172,236,.95)';
            ctx.fillRect(-L * 0.26, -W * 2.3, L * 0.12, W * 4.6);
            ctx.restore();
          }
          /* 轮毂 */
          ctx.fillStyle = 'rgba(120,205,255,.5)';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(236,252,255,.98)';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
        } else if (s.kind === 'snipe') {
          /* 雪鸮：狙击弹（长拖尾 + 白芯，弹速降下来后能看清轨迹） */
          ctx.globalCompositeOperation = 'lighter';
          const sg = ctx.createLinearGradient(-r * 26, 0, r * 1.4, 0);
          sg.addColorStop(0, 'rgba(150,185,215,0)');
          sg.addColorStop(0.6, 'rgba(190,215,240,.42)');
          sg.addColorStop(1, 'rgba(240,248,255,.92)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.moveTo(r * 1.4, 0);
          ctx.lineTo(-r * 26, -r * 2.3);
          ctx.lineTo(-r * 26, r * 2.3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.beginPath(); ctx.ellipse(r * 0.2, 0, r * 1.6, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
        } else if (s.kind === 'blade') {
          /* 天剑：飞刀（旋转刀身 + 冷光） */
          ctx.rotate(s.spin * 2.2);
          const L2 = r * 3.2, W2 = r * 0.9;
          ctx.fillStyle = 'rgba(190,225,255,.30)';
          ctx.beginPath(); ctx.ellipse(0, 0, L2 * 0.75, W2 * 2.0, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(222,240,255,.98)';
          ctx.beginPath();
          ctx.moveTo(L2, 0);
          ctx.lineTo(-L2 * 0.55, W2);
          ctx.lineTo(-L2 * 0.9, 0);
          ctx.lineTo(-L2 * 0.55, -W2);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.fillRect(-L2 * 0.2, -W2 * 0.18, L2 * 0.9, W2 * 0.36);
        } else {
          /* 天剑：光矢（细长光针 + 尾迹，原本太小看不见） */
          const L = r * 4.2;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(110,190,255,.30)';
          ctx.beginPath();
          ctx.ellipse(-L * 0.5, 0, L * 0.78, r * 0.95, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(205,240,255,.98)';
          ctx.beginPath();
          ctx.moveTo(L, 0);
          ctx.lineTo(-r * 0.5, r * 0.68);
          ctx.lineTo(-r * 1.5, 0);
          ctx.lineTo(-r * 0.5, -r * 0.68);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.beginPath(); ctx.arc(r * 0.45, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        continue;
      }
      if (s.kind === 'cross') {
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin * 0.55);
        const L = s.r * 2.8, W = s.r * 0.9;
        ctx.fillStyle = 'rgba(120,200,255,.35)';
        ctx.fillRect(-L / 2 - W * 0.4, -W * 0.85, L + W * 0.8, W * 1.7);
        ctx.fillRect(-W * 0.85, -L / 2 - W * 0.4, W * 1.7, L + W * 0.8);
        ctx.fillStyle = 'rgba(205,238,255,.95)';
        ctx.fillRect(-L / 2, -W / 2, L, W);
        ctx.fillRect(-W / 2, -L / 2, W, L);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.fillRect(-s.r * 0.55, -s.r * 0.26, s.r * 1.1, s.r * 0.52);
        ctx.fillRect(-s.r * 0.26, -s.r * 0.55, s.r * 0.52, s.r * 1.1);
      } else if (s.kind === 'ring') {
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin * 1.4);
        const r = s.r;
        const dia = k => {
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.35 * k);
          ctx.lineTo(r * 1.05 * k, 0);
          ctx.lineTo(0, r * 1.35 * k);
          ctx.lineTo(-r * 1.05 * k, 0);
          ctx.closePath();
        };
        ctx.fillStyle = 'rgba(255,120,200,.32)';
        dia(1.45); ctx.fill();
        ctx.fillStyle = 'rgba(255,175,225,.95)';
        dia(1); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'moon') {
        /* 修女·三日月：向前推的月牙刀光，后面拖着一条血尾 */
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        const r = s.r;
        ctx.globalCompositeOperation = 'lighter';
        /* 刃风：跟着月牙一起收窄，不然像块板子 */
        const tg2 = ctx.createLinearGradient(-r * 9, 0, r * 2.2, 0);
        tg2.addColorStop(0, 'rgba(255,40,100,0)');
        tg2.addColorStop(0.55, 'rgba(255,60,120,.07)');
        tg2.addColorStop(1, 'rgba(255,130,180,.28)');
        ctx.fillStyle = tg2;
        ctx.beginPath();
        ctx.moveTo(-r * 9, -r * 0.3);
        ctx.lineTo(r * 1.0, -r * 1.3);
        ctx.lineTo(r * 1.0, r * 1.3);
        ctx.lineTo(-r * 9, r * 0.3);
        ctx.closePath();
        ctx.fill();
        /* 月牙：两条二次曲线夹出来的对称薄刃，中间最厚、两端收尖 */
        const W = r * 1.5, T = r * 0.9;
        ctx.beginPath();
        ctx.moveTo(0, -W);
        ctx.quadraticCurveTo(r * 3.2, -r * 0.1, 0, W);
        ctx.quadraticCurveTo(r * 3.2 - T * 2, r * 0.1, 0, -W);
        ctx.closePath();
        const mg = ctx.createLinearGradient(0, 0, r * 1.4, 0);
        mg.addColorStop(0, 'rgba(255,255,255,.98)');
        mg.addColorStop(0.45, 'rgba(255,140,190,.96)');
        mg.addColorStop(1, 'rgba(190,8,70,.85)');
        ctx.fillStyle = mg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,246,250,.95)';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.stroke();
        /* 刃口：沿外弧再压一道白芯 */
        ctx.beginPath();
        ctx.moveTo(0, -W * 0.86);
        ctx.quadraticCurveTo(r * 2.8, -r * 0.08, 0, W * 0.86);
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = Math.max(1, r * 0.26);
        ctx.stroke();
      } else {
        const pulse = 1 + Math.sin(t * 9 + s.spin) * 0.08;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * pulse * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,140,255,.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(205,175,255,.5)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(238,226,255,.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x - s.r * 0.18, s.y - s.r * 0.2, s.r * 0.26, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.fill();
      }
      ctx.restore();
    }
  };

  /* ============================ PvE 经验宝石 ============================ */
  R.drawGems = function (ctx) {
    const pv = B.pve;
    if (!B.pveOn || !pv || !pv.gems || !pv.gems.length) return;
    const sc = B.scale();
    const t = this.t;
    for (const g of pv.gems) {
      const big = g.v >= 5;
      const r = (big ? 6 : 3.2) * sc;
      const pulse = 1 + Math.sin(t * 6 + g.x * 0.06) * 0.12;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = big ? 'rgba(255,214,120,.85)' : 'rgba(110,230,255,.62)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(g.x, g.y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fill();
    }
  };

  /* ============================ G·诺伦 爆炸领域 ============================ */
  /* 十六进制 → rgb，用于把工坊里可调的爆炸配色还原成 rgba */
  function hexRgb(hex) {
    let s = String(hex || '#ffc24a').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s, 16);
    if (isNaN(v)) return [255, 194, 74];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mixWhite(rgb, k) {
    return rgb.map(c => Math.round(c + (255 - c) * k));
  }

  /* ============================ 破破烂烂-秋云：场地中心黑洞 ============================ */
  R.drawHole = function (ctx) {
    const h = B.hole;
    if (!h) return;
    /* 裁到竞技场内：洞可以撑满整张图，但不能盖住场外的标题和边框外的东西 */
    const fl0 = B.field;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fl0.x, fl0.y, fl0.w, fl0.h);
    ctx.clip();
    const t = this.t;
    const k = h.born;
    const left = h.total - h.t;
    const collapse = left < .5 ? Math.max(0, left / .5) : 1;
    const RR = Math.max(12, h.r * 0.68 * (0.62 + 0.38 * k)) * (0.78 + 0.22 * collapse);
    const pulse = 0.94 + Math.sin(t * 2.4) * 0.06;
    const cx = h.x, cy = h.y;
    const ringIn = RR * 0.865;      /* 白环内沿 */
    const ringOut = RR * 1.0;       /* 白环外沿 */

    /* 外光晕：深色地图上也要读得出轮廓 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, ringOut * 0.9, cx, cy, RR * 2.7);
    halo.addColorStop(0, 'rgba(140,185,255,.26)');
    halo.addColorStop(.40, 'rgba(55,105,235,.12)');
    halo.addColorStop(1, 'rgba(10,30,90,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, RR * 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 左右两个凸起：从白环向外挑起，与环同为白，根部被中间黑压住 */
    ctx.save();
    ctx.translate(cx, cy);
    const wing = dir => {
      ctx.save();
      ctx.scale(dir, 1);
      const wg = ctx.createLinearGradient(RR * 0.64, 0, RR * 1.88, 0);
      wg.addColorStop(0, 'rgba(226,238,255,.95)');
      wg.addColorStop(.35, 'rgba(255,255,255,.99)');
      wg.addColorStop(.72, 'rgba(232,243,255,.97)');
      wg.addColorStop(.93, 'rgba(178,208,255,.85)');
      wg.addColorStop(1, 'rgba(150,190,255,.10)');
      ctx.beginPath();
      ctx.moveTo(RR * 0.70, -RR * 0.27);
      ctx.bezierCurveTo(RR * 1.10, -RR * 0.34, RR * 1.56, -RR * 0.21, RR * 1.86, -RR * 0.025);
      ctx.quadraticCurveTo(RR * 1.93, 0, RR * 1.86, RR * 0.025);
      ctx.bezierCurveTo(RR * 1.56, RR * 0.21, RR * 1.10, RR * 0.34, RR * 0.70, RR * 0.27);
      ctx.closePath();
      ctx.fillStyle = wg;
      ctx.shadowColor = '#a8c8ff';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();
    };
    wing(-1); wing(1);
    ctx.restore();

    /* 中间黑：纯黑视界压住凸起根部 */
    ctx.save();
    const core = ctx.createRadialGradient(cx, cy, RR * .05, cx, cy, ringIn * 1.02);
    core.addColorStop(0, '#000000');
    core.addColorStop(.70, '#000000');
    core.addColorStop(.93, '#02050c');
    core.addColorStop(1, '#0a1330');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, ringIn * 1.02, 0, Math.PI * 2);
    ctx.fill();

    /* 外圈白：厚环。用径向渐变填环面，中心偏亮、内外沿收边，做出有厚度的金属环 */
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(cx, cy, ringIn, cx, cy, ringOut);
    rg.addColorStop(0, 'rgba(105,150,225,' + (0.30 * pulse).toFixed(3) + ')');
    rg.addColorStop(.16, 'rgba(196,220,255,' + (0.78 * pulse).toFixed(3) + ')');
    rg.addColorStop(.48, 'rgba(253,254,255,' + (0.99 * pulse).toFixed(3) + ')');
    rg.addColorStop(.74, 'rgba(238,246,255,' + (0.97 * pulse).toFixed(3) + ')');
    rg.addColorStop(.92, 'rgba(178,208,255,' + (0.72 * pulse).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(120,165,240,0)');
    ctx.fillStyle = rg;
    ctx.shadowColor = '#cfe4ff';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, ringOut, 0, Math.PI * 2);
    ctx.arc(cx, cy, ringIn, 0, Math.PI * 2, true);
    ctx.fill();

    /* 内外沿各一条细亮线，把环的边缘收利落 */
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.72 * pulse).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, RR * 0.012);
    ctx.beginPath(); ctx.arc(cx, cy, ringIn + ctx.lineWidth * .5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(226,240,255,' + (0.55 * pulse).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, ringOut - ctx.lineWidth * .5, 0, Math.PI * 2); ctx.stroke();

    /* 环面缓慢游走的细高光：三段不等长弧，避免整体太死 */
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * pulse).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.2, RR * 0.045);
    const mid = (ringIn + ringOut) * .5;
    for (let i = 0; i < 3; i++) {
      const a0 = h.spin * 0.85 + i * (Math.PI * 2 / 3);
      const len = 0.55 + i * 0.22;
      ctx.beginPath();
      ctx.arc(cx, cy, mid, a0, a0 + len);
      ctx.stroke();
    }
    ctx.restore();

    /* 吸入的碎光 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 20; i++) {
      const ph = ((t * 0.5 + i / 20) % 1);
      const a = i * 2.399 + h.spin * 0.4;
      const rr = RR * (1.75 - 1.3 * ph);
      const al = Math.sin(ph * Math.PI) * 0.8;
      ctx.fillStyle = 'rgba(185,220,255,' + al.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 1.2 + (1 - ph) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* 敌人到黑洞的吸引线 */
    const foe = h.owner ? (B.fighters[0] === h.owner ? B.fighters[1] : B.fighters[0]) : null;
    if (foe && !foe.dead) {
      const d = Math.hypot(foe.x - cx, foe.y - cy);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 9;
        const nx = -(foe.y - cy) / Math.max(1, d) * off;
        const ny = (foe.x - cx) / Math.max(1, d) * off;
        const lg = ctx.createLinearGradient(foe.x, foe.y, cx, cy);
        lg.addColorStop(0, 'rgba(150,195,255,0)');
        lg.addColorStop(0.55, 'rgba(140,185,255,' + (0.2 - i * 0.045) + ')');
        lg.addColorStop(1, 'rgba(230,245,255,.5)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -t * 120 - i * 7;
        ctx.beginPath();
        ctx.moveTo(foe.x + nx, foe.y + ny);
        ctx.lineTo(cx + nx * 0.3, cy + ny * 0.3);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  };

  R.drawShuraSlash = function (ctx) {
    const t = this.t;
    for (const f of B.fighters) {
      /* ---- 阴阳流・一刀 ---- */
      const c = f.shuraSlash;
      if (!c) continue;
      const elapsed = c.t - c.windup;

      if (elapsed < 0) {
        /* 前摇：天顶落刀预警 */
        const k = Math.max(0, c.t / Math.max(.01, c.windup));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createLinearGradient(c.x, c.y - c.range * 1.6, c.x, c.y + c.range * .5);
        gl.addColorStop(0, 'rgba(255,59,82,0)');
        gl.addColorStop(0.7, 'rgba(255,59,82,' + (0.28 * k).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,140,150,' + (0.5 * k).toFixed(3) + ')');
        ctx.strokeStyle = gl;
        ctx.lineWidth = 3 + 7 * k;
        ctx.shadowColor = '#ff3b52';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - c.range * 1.6);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        /* 地面预兆环 */
        ctx.strokeStyle = 'rgba(255,70,90,' + (0.5 * k).toFixed(3) + ')';
        ctx.lineWidth = 2.6;
        ctx.setLineDash([10, 12]);
        ctx.lineDashOffset = -t * 60;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        /* 4 帧劈砍 + 红色染血刀光 */
        const idx = Math.min(3, Math.floor(elapsed / .16));
        const url = SHURA_FRAMES[idx];
        const img = SW.Assets ? SW.Assets.get(url) : null;
        const red = tintedImage(url, '#ff2a44', .58);
        const fade = Math.min(1, (c.total - c.t) / .3);
        const H = c.range * .78;
        const W = H * (img ? img.width / img.height : 1.55);
        const flip = Math.cos(c.ang) >= 0 ? 1 : -1;
        ctx.save();
        /* 背后红色灵压 */
        ctx.globalCompositeOperation = 'lighter';
        const bg = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, H * .95);
        bg.addColorStop(0, 'rgba(255,40,70,' + (0.3 * fade).toFixed(3) + ')');
        bg.addColorStop(.55, 'rgba(180,10,40,' + (0.14 * fade).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(120,0,20,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(c.x, c.y, H * .95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(c.x, c.y - H * .06);
        ctx.scale(flip, 1);
        /* 贴图的刀锋朝右，整体右移让刀尖压住目标点 */
        const ox = -W * .34;
        ctx.globalAlpha = Math.max(0, fade) * .82;
        if (img) ctx.drawImage(img, ox, -H * 0.5, W, H);
        if (red) {
          ctx.globalAlpha = Math.max(0, fade) * .62;
          ctx.drawImage(red, ox, -H * 0.5, W, H);
        }
        ctx.restore();

        /* 刀光扩散 */
        if (elapsed < .5) {
          const kk = 1 - elapsed / .5;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,235,240,' + (0.75 * kk).toFixed(3) + ')';
          ctx.lineWidth = 6 * kk + 1;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.range * (0.4 + elapsed * 1.6), c.ang - 1.1, c.ang + 1.1);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  };

  /* ============================ 破破烂烂-秋云：修罗丸 / 一刀 ============================ */
  const tintCache = {};
  function tintedImage(url, color, amount) {
    const img = SW.Assets ? SW.Assets.get(url) : null;
    if (!img) return null;
    const key = url + '|' + color + '|' + amount;
    let c = tintCache[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = amount == null ? .55 : amount;
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      tintCache[key] = c;
    }
    return c;
  }

  const SHURA_STAND = 'assets/shura_stand.webp';
  const SHURA_FRAMES = [
    'assets/shura_slash_1.webp', 'assets/shura_slash_2.webp',
    'assets/shura_slash_3.webp', 'assets/shura_slash_4.webp',
  ];

  R.drawShura = function (ctx) {
    const t = this.t;
    for (const f of B.fighters) {
      /* ---- 一刀命中瞬间的红色弧光（画在角色之上，保证可读） ---- */
      const sl = f.shuraSlash;
      if (sl && sl.t >= sl.windup) {
        const el = sl.t - sl.windup;
        const k = Math.max(0, 1 - el / .55);
        const RR = sl.range;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(sl.x, sl.y);
        ctx.rotate(sl.ang);
        for (let i = 0; i < 3; i++) {
          const r0 = RR * (0.55 + i * 0.18);
          ctx.strokeStyle = i === 0
            ? 'rgba(255,235,240,' + (0.9 * k).toFixed(3) + ')'
            : 'rgba(255,60,86,' + ((0.55 - i * 0.14) * k).toFixed(3) + ')';
          ctx.lineWidth = (12 - i * 3.4) * k + 1;
          ctx.shadowColor = '#ff3b52';
          ctx.shadowBlur = 26;
          ctx.beginPath();
          ctx.arc(0, 0, r0, -1.15, 1.15);
          ctx.stroke();
        }
        /* 刀锋直线 */
        if (el < .22) {
          const kk = 1 - el / .22;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * kk).toFixed(3) + ')';
          ctx.lineWidth = 3 * kk + 1;
          ctx.beginPath();
          ctx.moveTo(-RR * 1.25, 0);
          ctx.lineTo(RR * 1.25, 0);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* ---- 守护灵：半透明站立 ---- */
      if (f.shura) {
        const s = f.shura;
        const img = SW.Assets ? SW.Assets.get(SHURA_STAND) : null;
        const fadeIn = Math.min(1, s.t / .28);
        const fadeOut = Math.min(1, (s.total - s.t) / .32);
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.62;
        const H = f.r * 2.25;
        const W = H * 0.985;
        if (img) {
          ctx.save();
          /* 背后蓝色灵光 */
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, H * 0.72);
          g.addColorStop(0, 'rgba(70,130,255,.34)');
          g.addColorStop(0.55, 'rgba(40,90,220,.16)');
          g.addColorStop(1, 'rgba(20,50,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, H * 0.72, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = alpha * (s.flash > 0 ? 1.35 : 1);
          ctx.translate(s.x, s.y - H * 0.06);
          const bob = Math.sin(t * 3.4) * H * 0.014;
          ctx.drawImage(img, -W / 2, -H * 0.58 + bob, W, H);
          ctx.restore();
        }

        /* 格挡弧：面向敌人的护盾 */
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.55 + Math.sin(t * 7) * 0.25;
        ctx.strokeStyle = 'rgba(120,170,255,' + (0.34 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = '#5b8cff';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 1.15, -0.95, 0.95);
        ctx.stroke();
        if (s.flash > 0) {
          ctx.strokeStyle = 'rgba(230,245,255,' + (s.flash * 4).toFixed(3) + ')';
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.arc(0, 0, s.r * 1.2, -0.95, 0.95);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  };

  R.drawZones = function (ctx) {
    const t = this.t;
    /* 多层爆炸叠加时按层数等分亮度：避免连爆把整块画面刷成一片黄 */
    const stack = Math.max(1, B.zones.length);
    for (const z of B.zones) this.drawZoneOne(ctx, z, t, stack);
  };

  /* 单个爆炸领域的画法：1v1 与 VS 模式共用，保证核弹长一个样。
     opt.lite = true 时只画底色 + 主环（叠层里的旧火海用这个，省掉 3 个渐变和阴影模糊） */
  R.drawZoneOne = function (ctx, z, t, stack, opt) {
  const simple = !!(opt && opt.lite);
  const fadeAt = z.grow + z.hold;
  const fade = z.t > fadeAt ? Math.max(0, 1 - (z.t - fadeAt) / 1.1) : 1;
  const rad = Math.max(12, z.rad);
  const rgb = hexRgb(z.color);
  const lite = mixWhite(rgb, .62);
  const mul = (z.alpha != null ? z.alpha : 1.9) / stack;
  /* 内部填充单独压一档：领域半径有半张地图，全强度铺满会把整屏刷黄 */
  const fm = z.fill != null ? z.fill : .34;
  const C = a => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + Math.min(1, a * mul).toFixed(3) + ')';
  const L = a => 'rgba(' + lite[0] + ',' + lite[1] + ',' + lite[2] + ',' + Math.min(1, a * mul).toFixed(3) + ')';
  const CF = a => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + Math.min(1, a * mul * fm).toFixed(3) + ')';
  const LF = a => 'rgba(' + lite[0] + ',' + lite[1] + ',' + lite[2] + ',' + Math.min(1, a * mul * fm).toFixed(3) + ')';
  ctx.save();
  ctx.globalAlpha = fade;

  /* 领域内爆光 */
  const g = ctx.createRadialGradient(z.x, z.y, rad * .16, z.x, z.y, rad);
  g.addColorStop(0, LF(.16));
  g.addColorStop(.45, CF(.18));
  g.addColorStop(.82, CF(.34));
  g.addColorStop(1, CF(.04));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(z.x, z.y, rad, 0, Math.PI * 2); ctx.fill();

  /* 内部翻涌的熔金层（叠层里的旧火海省掉） */
  if (!simple) {
  ctx.globalCompositeOperation = 'lighter';
  const g2 = ctx.createRadialGradient(
    z.x + Math.cos(t * 1.4) * rad * .08, z.y + Math.sin(t * 1.1) * rad * .08, rad * .05,
    z.x, z.y, rad * .95
  );
  g2.addColorStop(0, LF(.10));
  g2.addColorStop(.42, CF(.10));
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(z.x, z.y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  }

  /* 边缘主环 + 内侧副环 */
  ctx.strokeStyle = L(.95);
  ctx.lineWidth = 3.2;
  ctx.shadowColor = z.color || '#ffc24a';
  ctx.shadowBlur = simple ? 0 : 30;
  ctx.beginPath();
  ctx.arc(z.x, z.y, rad * (0.99 + Math.sin(t * 3) * 0.008), 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 12;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = C(.55);
  ctx.beginPath(); ctx.arc(z.x, z.y, rad * .82, 0, Math.PI * 2); ctx.stroke();

  /* 旋转电弧刻度（叠层里的旧火海省掉） */
  if (!simple) {
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = L(.65);
  for (let i = 0; i < 10; i++) {
    const a = t * .6 + i * (Math.PI * 2 / 10);
    const r1 = rad * .9, r2 = rad * (0.96 + (i % 2 ? .02 : 0));
    ctx.beginPath();
    ctx.moveTo(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1);
    ctx.lineTo(z.x + Math.cos(a) * r2, z.y + Math.sin(a) * r2);
    ctx.stroke();
  }

  /* 中心爆芯 */
  /* 半径必须夹到正数：rad 扩张初期只有 12，+sin 抖一下会变成负数，
     createRadialGradient 直接抛 IndexSizeError，整帧渲染就此中断 */
  const core = Math.max(4, rad * .1 + Math.sin(t * 5) * 3);
  const cg = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, core * 2.4);
  cg.addColorStop(0, L(1));
  cg.addColorStop(.4, L(.5));
  cg.addColorStop(1, C(0));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(z.x, z.y, core * 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  };

  /* ============================ 血月圣域 ============================ */
  /* 与原版「圣十字庇护」同构的圆形领域，配色红黑，无碰撞体积 */
  R.drawBloodFields = function (ctx) {
    const t = this.t;
    for (const f of B.fighters) {
      if (!f || f.dead) continue;
      if (!f.char.awaken || f.char.awaken.type !== 'vamp_awaken' || f.awaken <= 0) continue;

      const p = f.char.awaken.params || {};
      const R0 = f.r * (p.radius != null ? p.radius : 3.2);
      const dur = p.duration || 8;
      const k = U.clamp(f.awaken / dur, 0, 1);
      const pulse = 0.5 + Math.sin(t * 3.2) * 0.5;

      /* 底层黑雾（普通混合，压暗背景） */
      ctx.save();
      ctx.translate(f.x, f.y);
      const dark = ctx.createRadialGradient(0, 0, R0 * 0.08, 0, 0, R0);
      dark.addColorStop(0, 'rgba(6,0,3,.20)');
      dark.addColorStop(0.62, 'rgba(12,0,5,.38)');
      dark.addColorStop(1, 'rgba(38,0,12,.62)');
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.globalCompositeOperation = 'lighter';

      /* 血色雾霭 */
      const g = ctx.createRadialGradient(0, 0, R0 * 0.12, 0, 0, R0);
      g.addColorStop(0, 'rgba(40,0,8,.04)');
      g.addColorStop(0.45, 'rgba(96,0,18,.10)');
      g.addColorStop(0.82, 'rgba(150,8,34,.20)');
      g.addColorStop(1, 'rgba(255,30,60,.34)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.fill();

      /* 外壁 */
      ctx.strokeStyle = 'rgba(255,60,90,' + (0.62 + pulse * 0.3).toFixed(2) + ')';
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, R0 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();

      /* 两道反向旋转的血环（替代原版十字架） */
      ctx.shadowBlur = 12;
      for (let ring = 0; ring < 2; ring++) {
        const rr = R0 * (ring === 0 ? 0.62 : 0.86);
        const dir = ring === 0 ? 1 : -1;
        const base = t * (ring === 0 ? 1.1 : -0.8);
        ctx.strokeStyle = ring === 0 ? 'rgba(190,10,40,.78)' : 'rgba(255,70,100,.55)';
        ctx.lineWidth = ring === 0 ? 3 : 1.6;
        for (let i = 0; i < 3; i++) {
          const a0 = base + i * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.arc(0, 0, rr, a0, a0 + 1.25 * dir);
          ctx.stroke();
        }
      }

      /* 向心血流：从圣域边缘吸向自身 */
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 10;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.45;
        const ph = ((t * 0.85 + i * 0.137) % 1);
        const r1 = R0 * (0.98 - ph * 0.62);
        const r2 = r1 - R0 * 0.17;
        const alpha = Math.sin(ph * Math.PI) * 0.6;
        ctx.strokeStyle = 'rgba(255,' + (34 + i * 9) + ',72,' + alpha.toFixed(2) + ')';
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }

      /* 剩余时间进度环 */
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,190,205,.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, R0 * 1.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* ============================ 场地装饰 ============================ */
  R.drawDecor = function (ctx) {
    const f = B.field;
    const t = this.t;

    /* 出生点 / 复活倒计时 */
    if (B.state === 'ready' || B.state === 'fight') {
      for (const ft of B.fighters) {
        if (!ft) continue;
        const sp = B.spawnPoint(ft.team);

        if (ft.dead && ft.respawnT > 0) {
          const k = 1 - ft.respawnT / 2.6;
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = ft.char.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, ft.r * 1.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.95;
          ctx.strokeStyle = ft.char.color;
          ctx.shadowColor = ft.char.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, ft.r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = '800 11px "PingFang SC",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(220,235,255,.9)';
          ctx.fillText('复活 ' + ft.respawnT.toFixed(1), sp.x, sp.y + ft.r * 1.6 + 16);
          ctx.restore();
          continue;
        }
        if (ft.dead) continue;

        const a = 0.25 + Math.sin(t * 2 + ft.team) * 0.1;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = ft.char.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ft.r * (2.2 + Math.sin(t * 1.5 + ft.team) * 0.15), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  /* ============================ 角色 ============================ */
  function drawSilhouette(ctx, kind, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = 'round';

    if (kind === 'sword') {
      /* 头 */
      ctx.beginPath(); ctx.arc(0, -s * 0.42, s * 0.2, 0, Math.PI * 2); ctx.fill();
      /* 身体 */
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, -s * 0.18);
      ctx.lineTo(s * 0.22, -s * 0.18);
      ctx.lineTo(s * 0.3, s * 0.42);
      ctx.lineTo(-s * 0.3, s * 0.42);
      ctx.closePath(); ctx.fill();
      /* 剑 */
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(s * 0.16, s * 0.06);
      ctx.lineTo(s * 0.62, -s * 0.62);
      ctx.stroke();
      ctx.lineWidth = s * 0.045;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.12);
      ctx.lineTo(s * 0.4, -s * 0.08);
      ctx.stroke();
    } else if (kind === 'shrine') {
      /* 长发 */
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.02, s * 0.34, s * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, -s * 0.4, s * 0.2, 0, Math.PI * 2); ctx.fill();
      /* 和服 */
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.02);
      ctx.lineTo(s * 0.24, s * 0.02);
      ctx.lineTo(s * 0.34, s * 0.46);
      ctx.lineTo(-s * 0.34, s * 0.46);
      ctx.closePath(); ctx.fill();
      /* 太刀 */
      ctx.lineWidth = s * 0.068;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, s * 0.3);
      ctx.lineTo(s * 0.56, -s * 0.5);
      ctx.stroke();
    } else if (kind === 'cannon') {
      ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.21, 0, Math.PI * 2); ctx.fill();
      /* 龙角 */
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, -s * 0.5); ctx.lineTo(-s * 0.34, -s * 0.76);
      ctx.moveTo(s * 0.16, -s * 0.5); ctx.lineTo(s * 0.34, -s * 0.76);
      ctx.stroke();
      /* 身体 */
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, -s * 0.14);
      ctx.lineTo(s * 0.26, -s * 0.14);
      ctx.lineTo(s * 0.3, s * 0.44);
      ctx.lineTo(-s * 0.3, s * 0.44);
      ctx.closePath(); ctx.fill();
      /* 炮 */
      ctx.fillRect(s * 0.18, -s * 0.12, s * 0.5, s * 0.16);
    } else {
      /* wing */
      ctx.beginPath(); ctx.arc(0, -s * 0.34, s * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.12);
      ctx.lineTo(s * 0.3, s * 0.44);
      ctx.lineTo(-s * 0.3, s * 0.44);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, -s * 0.3);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, -s * 0.5, s * 0.42);
      ctx.quadraticCurveTo(-s * 0.3, s * 0.1, -s * 0.16, -s * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.16, -s * 0.3);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.5, s * 0.42);
      ctx.quadraticCurveTo(s * 0.3, s * 0.1, s * 0.16, -s * 0.3);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 按战斗状态选图：咬住 / 吃饱（冷却中）/ 就绪 */
  function faceOf(char, f) {
    const fc = char.faces;
    if (!fc) return char.avatar;
    /* 陷阱就绪时换成「倒地」表情（雪鸮专属） */
    if (f && fc.trap && char.skill && char.skill.type === 'snowowl_snipe' && f.counterCd <= 0) return fc.trap;
    if (f && char.skill && char.skill.type === 'mimi_pack') {
      if (f.bite) return fc.charge || char.avatar;          /* 背包充能束缚 */
      if (f.awaken > 0) return fc.awaken || char.avatar;    /* 青冰觉醒 */
      if (f.form === 'light') return fc.light || char.avatar;/* 轻装 */
      return fc.ready || char.avatar;                       /* 重装携包 */
    }
    /* 胧雷-影：按战况换脸 */
    if (f && char.skill && char.skill.type === 'shadow_dash') {
      if (f.shadowBurst) return fc.trap || char.avatar;          /* 无间影狱·时停中：缩进帽子底下 */
      if (f.awaken > 0) return fc.awaken || char.avatar;         /* 红觉醒：武器燃火 */
      if (f.hp / f.maxHp < .35) return fc.deny || char.avatar;   /* 残血：举牌拒绝 */
      if (f.skillCd <= 0) return fc.flower || char.avatar;       /* 影袭就绪：簪花蓄势 */
      return fc.idle || char.avatar;                             /* 冷却中：抱着猫打盹 */
    }
    if (f && f.awaken > 0 && fc.awaken) return fc.awaken;
    if (f && f.bite) return fc.bite || char.avatar;
    if (f && f.char && f.char.skill && f.char.skill.type === 'vamp_bite' && f.skillCd > 0) {
      return fc.full || char.avatar;
    }
    return fc.ready || char.avatar;
  }

  /* 圆形头像（贴纸徽章） */
  function drawAvatar(ctx, char, x, y, r, f) {
    const img = SW.Assets ? SW.Assets.get(faceOf(char, f)) : null;
    if (!img) return false;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    /* 边缘压暗，融入球体 */
    const vg = ctx.createRadialGradient(x, y, r * 0.62, x, y, r);
    vg.addColorStop(0, 'rgba(6,12,26,0)');
    vg.addColorStop(1, 'rgba(6,12,26,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    /* 白色内圈 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = Math.max(1.4, r * 0.055);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    /* 角色色外环 */
    ctx.save();
    ctx.strokeStyle = char.color || '#6fd0ff';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.shadowColor = char.color || '#6fd0ff';
    ctx.shadowBlur = r * 0.55;
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(2, r * 0.08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  /* 猎剑修女的大剑：剑根在身前，剑尖压着锁定朝向。
     蓄力时刃口烧红、突刺时拖出速度线 —— 玩家靠这把剑判断她要去哪。 */
  function drawLanceSword(ctx, f) {
    const a = f.headA || 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = -sa, ny = ca;
    const drift = f.r * 0.16;
    const r0 = f.r * 0.3;
    const len = f.r * 3.0;
    const x0 = f.x + ca * r0, y0 = f.y + sa * r0 - drift;
    const x2 = f.x + ca * (r0 + len), y2 = f.y + sa * (r0 + len) - drift;
    const xm = f.x + ca * (r0 + len * 0.5), ym = f.y + sa * (r0 + len * 0.5) - drift;
    const wB = f.r * 0.17, wM = f.r * 0.32;
    const hot = f.lungeWind > 0 ? 0.55 + 0.45 * Math.sin(performance.now() / 60) : 0;
    const rush = f.lungeT > 0 ? 1 : 0;

    ctx.save();

    /* 突刺速度线：剑身两侧各拉一道，长度跟着冲刺走 */
    if (rush) {
      ctx.globalCompositeOperation = 'lighter';
      const L = f.r * 5.2;
      const g = ctx.createLinearGradient(x2, y2, x2 - ca * L, y2 - sa * L);
      g.addColorStop(0, 'rgba(170,255,200,.55)');
      g.addColorStop(1, 'rgba(40,210,120,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = f.r * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xm, ym);
      ctx.lineTo(xm - ca * L, ym - sa * L);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* 剑身：护手最宽，向剑尖收成一条线 */
    ctx.beginPath();
    ctx.moveTo(x0 + nx * wB, y0 + ny * wB);
    ctx.lineTo(xm + nx * wM, ym + ny * wM);
    ctx.lineTo(x2, y2);
    ctx.lineTo(xm - nx * wM, ym - ny * wM);
    ctx.lineTo(x0 - nx * wB, y0 - ny * wB);
    ctx.closePath();
    const bg = ctx.createLinearGradient(x0, y0, x2, y2);
    bg.addColorStop(0, 'rgba(216,255,228,.95)');
    bg.addColorStop(0.45, 'rgba(122,246,166,.92)');
    bg.addColorStop(1, 'rgba(238,255,246,.98)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(36,196,110,.9)';
    ctx.lineWidth = Math.max(1, f.r * 0.07);
    ctx.stroke();

    /* 剑脊 */
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(232,255,240,.85)';
    ctx.lineWidth = Math.max(1, f.r * 0.06);
    ctx.stroke();

    /* 护手 */
    ctx.beginPath();
    ctx.moveTo(x0 + nx * wB * 2.8, y0 + ny * wB * 2.8);
    ctx.lineTo(x0 - nx * wB * 2.8, y0 - ny * wB * 2.8);
    ctx.strokeStyle = 'rgba(96,232,152,.95)';
    ctx.lineWidth = Math.max(2, f.r * 0.16);
    ctx.stroke();

    /* 剑尖与蓄力火光 */
    ctx.globalCompositeOperation = 'lighter';
    const tipR = f.r * (0.3 + hot * 0.28);
    const tg = ctx.createRadialGradient(x2, y2, 0, x2, y2, tipR);
    tg.addColorStop(0, 'rgba(238,255,246,' + (0.85 + hot * 0.15).toFixed(2) + ')');
    tg.addColorStop(0.4, 'rgba(126,248,172,' + (0.45 + hot * 0.4).toFixed(2) + ')');
    tg.addColorStop(1, 'rgba(40,200,110,0)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(x2, y2, tipR, 0, Math.PI * 2);
    ctx.fill();

    /* 蓄力：剑尖到落点一条细虚线，告诉玩家「这一下是直着来的」 */
    if (hot > 0) {
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(150,255,190,' + (0.25 + hot * 0.4).toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 + ca * f.r * 4.2, y2 + sa * f.r * 4.2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /* PvE 小怪：立绘 + 兵种光环（比球体好认，克丽丝塔的表情能看清） */
  function drawMobBody(ctx, f) {
    const sc = B.scale();
    const col = f.char.color || '#8fd8ff';
    const k = f.spawnT > 0 ? Math.max(0, 1 - f.spawnT / 0.35) : 1;
    /* artScale：专属立绘的视觉放大系数。碰撞半径不能为了「看得清」去改，
       否则贴脸判定会跟着变，只能在这里单独放大贴图（蚊子只有一颗头，26px 撑不住表情） */
    const R0 = f.r * (1.05 + (1 - k) * 0.7) * (f.char.artScale || 1);
    /* 立绘是异步加载的：刚刷出来的第一只可能还没解码完，
       这里每帧再问一次，别让「第一只怪」永久退化成共用立绘 */
    const artSrc = (f.kind && f.kind.art && SW.Assets.get(f.kind.art)) ? f.kind.art : f.char.avatar;
    const img = SW.Assets ? SW.Assets.get(artSrc) : null;
    const cy = f.y - f.r * 0.22;

    ctx.save();
    ctx.globalAlpha = 0.4 + k * 0.6;

    /* 兵种色底座：堆成一片时靠这个分辨兵种，也不会被立绘盖住
       用双层描边代替 shadowBlur —— 场上百来只怪时 shadow 会直接拖垮帧率
       有专属立绘的兵种（haveArt）把它压成一层软阴影，颜色留着，别像个盘子 */
    const hasArt = !!(f.kind && f.kind.art && artSrc === f.kind.art);
    const bx = f.r * (hasArt ? 1.02 : 1.28);
    const by = f.r * (hasArt ? 0.40 : 0.52);
    const baseY = f.y + f.r * (hasArt ? 0.74 : 0.62);
    ctx.beginPath();
    ctx.ellipse(f.x, baseY, bx, by, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgba(col, hasArt ? .30 : .26);
    ctx.fill();
    ctx.strokeStyle = rgba(col, hasArt ? .30 : .26);
    ctx.lineWidth = Math.max(4, f.r * (hasArt ? 0.22 : 0.3));
    ctx.stroke();
    ctx.strokeStyle = rgba(col, hasArt ? .8 : .95);
    ctx.lineWidth = Math.max(1.4, f.r * (hasArt ? 0.10 : 0.11));
    ctx.stroke();

    /* 追猎者的拖尾：它是唯一比玩家快的杂兵，必须一眼认出来，
       否则「为什么甩不掉」会变成纯体感问题 */
    if (f.kindId === 'hound') {
      const sp = Math.hypot(f.vx, f.vy) || 1;
      const ux = f.vx / sp, uy = f.vy / sp;
      const L = f.r * 3.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(f.x - ux * L, f.y - uy * L, f.x, f.y);
      g.addColorStop(0, 'rgba(80,240,140,0)');
      g.addColorStop(1, 'rgba(130,255,175,.42)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(f.x + uy * f.r * 0.5, f.y - ux * f.r * 0.5);
      ctx.lineTo(f.x - ux * L, f.y - uy * L);
      ctx.lineTo(f.x - uy * f.r * 0.5, f.y + ux * f.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      /* 蓄力：把「它要往哪冲」画在地上。转向已经慢到掰不回来，
         不给这条线的话玩家只能靠猜 */
      if (f.lungeWind > 0) {
        const full = (f.kind.aiP && f.kind.aiP.lungeWind) || 0.5;
        const k = 1 - Math.max(0, f.lungeWind) / full;
        const len = f.r * (3.2 + 15 * k);
        const ex = f.x + Math.cos(f.headA) * len;
        const ey = f.y + Math.sin(f.headA) * len;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        /* 外圈光晕 */
        ctx.strokeStyle = 'rgba(70,220,130,.20)';
        ctx.lineWidth = f.r * 0.9;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();

        /* 主光束，随蓄力变亮变实 */
        ctx.strokeStyle = 'rgba(150,255,190,' + (0.25 + 0.6 * k).toFixed(2) + ')';
        ctx.lineWidth = Math.max(1.6, f.r * 0.2);
        ctx.setLineDash([f.r * 1.5, f.r * 0.9]);
        ctx.lineDashOffset = -SW.Render.t * f.r * 3;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);

        /* 剑尖那一下亮点 */
        const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, f.r * (0.7 + 1.1 * k));
        gr.addColorStop(0, 'rgba(210,255,225,' + (0.5 + 0.45 * k).toFixed(2) + ')');
        gr.addColorStop(1, 'rgba(90,240,150,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(ex, ey, f.r * (0.7 + 1.1 * k), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      /* 撞墙后的僵直：头上转圈的小星，玩家一眼知道「现在可以打它」 */
      if (f.stunT > 0) {
        ctx.save();
        for (let i = 0; i < 3; i++) {
          const a = SW.Render.t * 4.2 + i * Math.PI * 2 / 3;
          const px = f.x + Math.cos(a) * f.r * 0.95;
          const py = f.y + Math.sin(a) * f.r * 0.34 - f.r * 1.45;
          ctx.fillStyle = 'rgba(180,255,205,' + (0.55 + 0.35 * Math.sin(a * 2)).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.1, f.r * 0.14), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    /* 立绘：原图直接贴，不做任何染色 */
    if (img) {
      const s = R0 * 2;
      ctx.drawImage(img, f.x - s / 2, cy - s / 2, s, s);
    } else {
      ctx.beginPath();
      ctx.arc(f.x, cy, f.r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }

    /* 受击白闪 */
    if (f.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f.flash * 0.42;
      ctx.beginPath();
      ctx.arc(f.x, cy, f.r * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;


    /* 猎剑修女：举着大剑直冲（剑的朝向就是她的判定朝向） */
    if (f.kind && f.kind.ai === 'lance') drawLanceSword(ctx, f);

    /* 血月修女：环绕红剑（剑长/角度与 mobBlood 的判定完全一致） */
    if (f.kind && f.kind.ai === 'blood' && f.kind.aiP.bladeN) {
      const P = f.kind.aiP;
      const n = P.bladeN || 0;
      const len = f.r * (P.bladeLen || 3.4);
      const rot = f.bladeA || 0;
      const r0 = f.r * 0.7;
      const wB = f.r * 0.13, wM = f.r * 0.26;
      /* 四档 BOSS 用不同色相区分：红 → 玫红 → 紫红 → 紫 */
      const T = f.kind.tint || [255, 48, 88];
      const hi = 'rgba(' + Math.min(255, T[0] + 90) + ',' + Math.min(255, T[1] + 130) + ','
        + Math.min(255, T[2] + 120) + ',.95)';
      const mid = 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',.85)';
      const low = 'rgba(' + Math.round(T[0] * .8) + ',' + Math.round(T[1] * .3) + ','
        + Math.round(T[2] * .45) + ',.55)';
      const edge = 'rgba(' + Math.min(255, T[0] + 60) + ',' + Math.min(255, T[1] + 120) + ','
        + Math.min(255, T[2] + 110) + ',.62)';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      /* 刀光：沿旋转方向扫出的环形残影（剑根到剑尖），让剑像在「砍」而不是在「摆」 */
      const trail = Math.min(0.95, 0.26 * (P.spin || 1.2));
      for (let i = 0; i < n; i++) {
        const ang = rot + i / n * Math.PI * 2;
        const g2 = ctx.createRadialGradient(f.x, f.y, r0, f.x, f.y, r0 + len);
        g2.addColorStop(0, 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',0)');
        g2.addColorStop(0.14, mid.replace(',.85)', ',.24)'));
        g2.addColorStop(0.9, hi.replace(',.95)', ',.16)'));
        g2.addColorStop(1, 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r0 + len, ang - trail, ang);
        ctx.arc(f.x, f.y, r0, ang, ang - trail, true);
        ctx.closePath();
        ctx.fill();
      }

      for (let i = 0; i < n; i++) {
        const ang = rot + i / n * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = -sa, ny = ca;
        const x0 = f.x + ca * r0, y0 = f.y + sa * r0;
        const x2 = f.x + ca * (r0 + len), y2 = f.y + sa * (r0 + len);
        /* 中段最宽：护手 → 剑身 → 剑尖收细 */
        const xm = f.x + ca * (r0 + len * 0.34), ym = f.y + sa * (r0 + len * 0.34);

        ctx.beginPath();
        ctx.moveTo(x0 + nx * wB, y0 + ny * wB);
        ctx.lineTo(xm + nx * wM, ym + ny * wM);
        ctx.lineTo(x2, y2);
        ctx.lineTo(xm - nx * wM, ym - ny * wM);
        ctx.lineTo(x0 - nx * wB, y0 - ny * wB);
        ctx.closePath();
        const g = ctx.createLinearGradient(x0, y0, x2, y2);
        g.addColorStop(0, hi);
        g.addColorStop(0.3, mid);
        g.addColorStop(0.8, low);
        g.addColorStop(1, edge.replace(',.62)', ',.25)'));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        /* 剑脊 + 护手：这两笔一上才像剑，不然是三角风车 */
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(255,238,244,.72)';
        ctx.lineWidth = Math.max(1, f.r * 0.055);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0 + nx * wB * 2.4, y0 + ny * wB * 2.4);
        ctx.lineTo(x0 - nx * wB * 2.4, y0 - ny * wB * 2.4);
        ctx.strokeStyle = 'rgba(255,190,210,.8)';
        ctx.lineWidth = Math.max(1.4, f.r * 0.1);
        ctx.stroke();

        /* 剑尖高光 */
        const tipR = f.r * 0.19;
        const tg = ctx.createRadialGradient(x2, y2, 0, x2, y2, tipR);
        tg.addColorStop(0, hi);
        tg.addColorStop(0.45, mid.replace(',.85)', ',.5)'));
        tg.addColorStop(1, 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',0)');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(x2, y2, tipR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* 血月轮爆发：一圈实体化的血月从剑尖炸开，越外越薄 */
      if (f.swingFlash > 0) {
        const k = f.swingFlash / 0.34;                     /* 1 → 0 */
        const R = f.r * (P.bladeLen || 3.4) * 1.06;
        const grow = R * (0.88 + 0.2 * (1 - k));
        const wdt = Math.max(R * 0.3 * k, 3);
        const col = T[0] + ',' + T[1] + ',' + T[2] + ',';
        const rg = ctx.createRadialGradient(f.x, f.y, Math.max(1, grow - wdt), f.x, f.y, grow + wdt * 0.3);
        rg.addColorStop(0, 'rgba(' + col + '0)');
        rg.addColorStop(0.42, 'rgba(255,150,190,' + (0.9 * k).toFixed(2) + ')');
        rg.addColorStop(0.7, 'rgba(255,60,110,' + (0.98 * k).toFixed(2) + ')');
        rg.addColorStop(1, 'rgba(' + col + '0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(f.x, f.y, grow + wdt * 0.3, 0, Math.PI * 2);
        ctx.arc(f.x, f.y, Math.max(1, grow - wdt), 0, Math.PI * 2, true);
        ctx.fill();
        /* 刃口：环带外沿一道纯白亮线，是这一下的"刀口" */
        ctx.beginPath();
        ctx.arc(f.x, f.y, grow, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * k).toFixed(2) + ')';
        ctx.lineWidth = Math.max(1.5, 5 * k);
        ctx.stroke();
        /* 内圈余晖：让爆发有个"张开的嘴" */
        const rg2 = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, grow);
        rg2.addColorStop(0, 'rgba(' + col + (0.3 * k).toFixed(2) + ')');
        rg2.addColorStop(0.8, 'rgba(' + col + '0)');
        ctx.fillStyle = rg2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, grow, 0, Math.PI * 2);
        ctx.fill();
      }

      /* 血月轮蓄力：外圈虚线定死扫击半径，内圈往里收，缺口那段不画线 —— 
         玩家看见缺口就知道该往哪躲 */
      if (P.swingCd && f.swingWind > 0) {
        const R = f.r * (P.bladeLen || 3.4) * 1.06;
        const k = U.clamp(1 - f.swingWind / (P.swingWind || 0.5), 0, 1);
        const gapHalf = 0.42;
        const gp = f.swingGap || 0;
        const col = T[0] + ',' + T[1] + ',' + T[2] + ',';
        /* 缺口扇区先压一层暗底，把"安全区"标出来 */
        ctx.fillStyle = 'rgba(' + col + (0.05 + 0.1 * k).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, R, gp - gapHalf, gp + gapHalf);
        ctx.closePath();
        ctx.fill();
        /* 安全区边界：两条亮刃，越接近爆发越亮 */
        ctx.strokeStyle = 'rgba(' + col + (0.35 + 0.5 * k).toFixed(2) + ')';
        ctx.lineWidth = 2;
        for (const sgn of [-1, 1]) {
          const a = gp + sgn * gapHalf;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r);
          ctx.lineTo(f.x + Math.cos(a) * R * 1.1, f.y + Math.sin(a) * R * 1.1);
          ctx.stroke();
        }
        /* 外圈虚线 */
        ctx.setLineDash([8, 7]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(' + col + (0.3 + 0.45 * k).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(f.x, f.y, R, gp + gapHalf, gp - gapHalf + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        /* 收拢的内圈：收到外圈就炸 */
        const rr = Math.max(2, R * (1 - k * 0.88));
        ctx.strokeStyle = 'rgba(' + col + (0.55 + 0.4 * k).toFixed(2) + ')';
        ctx.lineWidth = 3 + 5 * k;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 精英 / BOSS：头顶血条（BOSS 加名字，条也更宽更高） */
    if (f.isElite) {
      const isBoss = !!(f.kind && f.kind.ai === 'blood');
      const w = f.r * (isBoss ? 2.8 : 2.0), h = (isBoss ? 6 : 4) * sc;
      const x0 = f.x - w / 2, y0 = cy - R0 - (isBoss ? 16 : 10) * sc;
      const p = Math.max(0, Math.min(1, f.hp / f.maxHp));
      ctx.fillStyle = 'rgba(6,12,26,.82)';
      ctx.fillRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3);
      ctx.fillStyle = rgba(col, .95);
      ctx.fillRect(x0, y0, w * p, h);
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, w, h);
      if (isBoss && f.kind.name) {
        ctx.font = '900 ' + Math.round(11 * sc) + 'px "PingFang SC",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(6,12,26,.75)';
        ctx.fillText(f.kind.name, f.x + 1, y0 - 3 * sc + 1);
        ctx.fillStyle = rgba(col, 1);
        ctx.fillText(f.kind.name, f.x, y0 - 3 * sc);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();
  }

  function drawFighter(ctx, f) {
    if (!f) return;
    const t = R.t;
    const char = f.char;
    const awak = f.awaken > 0;
    /* PvE 玩家的 1v1 技能不跑了，剑体也别画，否则会看到一把不会动的光剑 */
    const pvePlayer = !!(B.pveOn && B.pve && f === B.pve.player);

    /* 拖尾 */
    for (let i = 0; i < f.trail.length; i++) {
      const tr = f.trail[i];
      const k = tr.life / 0.3;
      ctx.save();
      /* 叠加发光而不是半透明覆盖：覆盖会在地面上糊出一块发暗的饼 */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.55, k * 0.36);
      ctx.fillStyle = tr.color || '#ffffff';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, f.r * 0.72 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (f.dead) return;

    /* PvE 的怪直接贴立绘：不套球体，玩家一眼能认出是哪个兵种 */
    if (f.isMob) { drawMobBody(ctx, f); return; }

    /* 觉醒：大范围红色光晕 + 脉冲环 */
    if (awak) {
      const awc = char.awakenColor || '#ff3b52';
      const pulse = 0.5 + Math.sin(t * 3.4) * 0.5;
      ctx.save();
      const gg = ctx.createRadialGradient(f.x, f.y, f.r * 0.5, f.x, f.y, f.r * 3.6);
      gg.addColorStop(0, rgba(awc, .34));
      gg.addColorStop(0.4, rgba(awc, .14));
      gg.addColorStop(1, rgba(awc, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 1.15 + i * 0.33) % 1);
        ctx.globalAlpha = (1 - ph) * 0.55;
        ctx.strokeStyle = awc;
        ctx.lineWidth = 2.6;
        ctx.shadowColor = awc;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.15 + ph * 2.4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* 旋转红色能量弧 */
      ctx.save();
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.strokeStyle = awc;
      ctx.lineWidth = 3;
      ctx.shadowColor = awc;
      ctx.shadowBlur = 18;
      for (let i = 0; i < 3; i++) {
        const a0 = t * 2.6 + i * 2.09;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 1.45, a0, a0 + 0.9);
        ctx.stroke();
      }
      ctx.restore();

      /* 胧雷-影：红色觉醒外围缠着蓝色雷电 */
      if (char.id === 'shadow') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 2.6 + i * 0.37) % 1);
          const a0 = (t * 2.2 + i * 2.1) % (Math.PI * 2);
          const rr = f.r * (1.5 + ph * 1.3);
          ctx.strokeStyle = 'rgba(96,176,255,' + (0.75 * (1 - ph)).toFixed(3) + ')';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#5aa8ff';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a0) * rr, f.y + Math.sin(a0) * rr);
          for (let k = 1; k <= 4; k++) {
            const aa = a0 + k * 0.24;
            const rrr = rr * (1 + Math.sin(k * 2.7 + t * 12) * 0.24);
            ctx.lineTo(f.x + Math.cos(aa) * rrr, f.y + Math.sin(aa) * rrr);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* 地面投影 */
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y + f.r * 0.72, f.r * 0.86, f.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 进化边框 */
    const evo = f.evoLevel || 0;
    if (evo > 0) {
      ctx.save();
      for (let i = 0; i < evo; i++) {
        ctx.strokeStyle = `rgba(90,255,220,${0.22 - i * 0.05})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r + 6 + i * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 残心边框 */
    if (f.reshin > 0) {
      const cols = ['rgba(235,245,255,.9)', 'rgba(255,215,90,.95)', 'rgba(255,80,95,.95)'];
      const col = cols[Math.min(2, f.reshin - 1)];
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* G·诺伦 爆炸定身：金色锁环 + 楔形钉 */
    if (f.rootT > 0) {
      ctx.save();
      const pl = 0.5 + Math.sin(t * 8) * 0.5;
      ctx.strokeStyle = 'rgba(255,214,120,' + (0.55 + pl * 0.4).toFixed(2) + ')';
      ctx.lineWidth = 2.6;
      ctx.shadowColor = '#ffc24a';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 8, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = t * 1.6 + i * Math.PI / 2;
        const c = Math.cos(a), s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(f.x + c * (f.r + 10), f.y + s * (f.r + 10));
        ctx.lineTo(f.x + c * (f.r + 22), f.y + s * (f.r + 22));
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 球体 */
    ctx.save();
    if (awak) {
      ctx.shadowColor = char.awakenColor || '#ff4d5e';
      ctx.shadowBlur = 24;
    } else {
      ctx.shadowColor = char.color;
      ctx.shadowBlur = 16;
    }
    const g = ctx.createRadialGradient(
      f.x - f.r * 0.34, f.y - f.r * 0.38, f.r * 0.08,
      f.x, f.y, f.r
    );
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, char.color2);
    g.addColorStop(0.68, char.color);
    g.addColorStop(1, '#081426');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 内圈 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    /* 阴阳流・星落：红色冲锋箭头 */
    if (f.chargeState && !f.chargeState.generic) {
      const cs = f.chargeState;
      const aiming = cs.phase === 'aim' && cs.tx != null;
      const a = aiming
        ? Math.atan2(cs.ty - f.y, cs.tx - f.x)
        : Math.atan2(cs.vy, cs.vx);
      const pulse = 0.72 + Math.sin(t * 42) * 0.28;
      ctx.save();
      ctx.lineJoin = 'round';
      const baseAlpha = aiming ? 0.5 : 1;
      for (let k = 3; k >= 1; k--) {
        const back = f.r * (0.55 + k * 1.0);
        const ax = f.x - Math.cos(a) * back;
        const ay = f.y - Math.sin(a) * back;
        const s = f.r * (0.4 + k * 0.12) * (k === 3 ? pulse : 1);
        ctx.globalAlpha = (0.28 + k * 0.22) * baseAlpha;
        ctx.fillStyle = '#ff3b52';
        ctx.shadowColor = '#ff3b52';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(a) * s, ay + Math.sin(a) * s);
        ctx.lineTo(ax + Math.cos(a + 2.45) * s * 0.68, ay + Math.sin(a + 2.45) * s * 0.68);
        ctx.lineTo(ax + Math.cos(a - 2.45) * s * 0.68, ay + Math.sin(a - 2.45) * s * 0.68);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    /* 头像优先，无头像时用剪影；带旋转剑的角色连头像一起转 */
    if (char.sword && !pvePlayer) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.swordAngle || 0);
      if (!drawAvatar(ctx, char, 0, 0, f.r * 0.86, f)) {
        drawSilhouette(ctx, char.sprite, f.r * 1.05, 'rgba(3,7,18,.86)');
      }
      ctx.restore();
    } else if (!drawAvatar(ctx, char, f.x, f.y, f.r * 0.86, f)) {
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.translate(f.x, f.y);
      ctx.scale(f.facing >= 0 ? 1 : -1, 1);
      drawSilhouette(ctx, char.sprite, f.r * 1.05, 'rgba(3,7,18,.86)');
      ctx.restore();
    }

    /* 克丽丝塔：环绕激光大剑（根部粗、剑尖细） */
    if (char.sword && !pvePlayer) {
      const a = f.swordAngle || 0;
      const len = f.r * (char.sword.length || 3);
      const x1 = f.x + Math.cos(a) * f.r * 0.9;
      const y1 = f.y + Math.sin(a) * f.r * 0.9;
      const x2 = f.x + Math.cos(a) * (f.r * 0.9 + len);
      const y2 = f.y + Math.sin(a) * (f.r * 0.9 + len);
      const nx = -Math.sin(a), ny = Math.cos(a);
      const wB = f.r * 0.46, wT = f.r * 0.1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      /* 外层光晕 */
      ctx.fillStyle = 'rgba(70,255,140,.16)';
      ctx.beginPath();
      ctx.moveTo(x1 + nx * wB * 1.7, y1 + ny * wB * 1.7);
      ctx.lineTo(x1 - nx * wB * 1.7, y1 - ny * wB * 1.7);
      ctx.lineTo(x2 - nx * wT * 2.4, y2 - ny * wT * 2.4);
      ctx.lineTo(x2 + nx * wT * 2.4, y2 + ny * wT * 2.4);
      ctx.closePath();
      ctx.fill();

      /* 剑体渐变 */
      const gg = ctx.createLinearGradient(x1, y1, x2, y2);
      gg.addColorStop(0, '#2fe07c');
      gg.addColorStop(0.45, '#8dffb0');
      gg.addColorStop(1, 'rgba(255,255,255,.95)');
      ctx.fillStyle = gg;
      ctx.shadowColor = '#6dff9a';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * wB, y1 + ny * wB);
      ctx.lineTo(x1 - nx * wB, y1 - ny * wB);
      ctx.lineTo(x2 - nx * wT, y2 - ny * wT);
      ctx.lineTo(x2 + nx * wT, y2 + ny * wT);
      ctx.closePath();
      ctx.fill();

      /* 白芯 */
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      /* 剑尖 */
      ctx.fillStyle = '#eafff2';
      ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* 圣十字庇护：大范围护罩 + 十字架 */
    if (f.bastion) {
      const k = 1 - f.bastion.t / f.bastion.total;
      const R = f.r * 2.6;
      ctx.save();
      ctx.translate(f.x, f.y);

      /* 半球护罩 */
      const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
      g.addColorStop(0, 'rgba(110,255,170,.05)');
      g.addColorStop(0.7, 'rgba(140,255,180,.12)');
      g.addColorStop(1, 'rgba(255,206,110,.30)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      /* 罩壁 */
      ctx.strokeStyle = 'rgba(150,255,190,.9)';
      ctx.shadowColor = '#6dff9a';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, R + Math.sin(t * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();

      /* 十字架：外金内绿 */
      const s = R * 0.95;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(255,214,120,.95)';
      ctx.lineWidth = Math.max(9, f.r * 0.46);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.72, -s * 0.12);
      ctx.lineTo(s * 0.72, -s * 0.12);
      ctx.stroke();

      ctx.shadowColor = '#6dff9a';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(110,255,170,.95)';
      ctx.lineWidth = Math.max(5, f.r * 0.28);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.72, -s * 0.12);
      ctx.lineTo(s * 0.72, -s * 0.12);
      ctx.stroke();

      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = Math.max(2, f.r * 0.09);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.72, -s * 0.12);
      ctx.lineTo(s * 0.72, -s * 0.12);
      ctx.stroke();

      /* 进度环 */
      ctx.strokeStyle = 'rgba(255,220,140,.55)';
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k));
      ctx.stroke();
      ctx.restore();
    }

    /* 受击白闪 */
    if (f.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, f.flash * 0.75);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* 黄锁护罩 */
    if (f.invuln > 0.05) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,90,.95)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255,200,70,.9)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k - 30 + t * 26);
        const px = f.x + Math.cos(a) * f.r * 1.22;
        const py = f.y + Math.sin(a) * f.r * 1.22;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    /* 麻痹 */
    if (f.stun > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,140,255,.9)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const a = t * 9 + i * 2.1;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * f.r * 0.9, f.y + Math.sin(a) * f.r * 0.9);
        ctx.lineTo(f.x + Math.cos(a + 0.5) * f.r * 1.3, f.y + Math.sin(a + 0.5) * f.r * 1.3);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 纳刀读条 */
    if (f.iaidoCast) {
      const k = U.clamp(f.iaidoCast.t / f.iaidoCast.total, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
      ctx.restore();
      /* 刀光蓄力 */
      ctx.save();
      ctx.globalAlpha = 0.25 + k * 0.5;
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 2 + k * 3;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 20, t * 6, t * 6 + 1.9);
      ctx.stroke();
      ctx.restore();

      /* 脚底旋转刀阵 */
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(t * 1.6);
      ctx.globalAlpha = 0.3 + k * 0.45;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(f.r * 0.75, 0);
        ctx.lineTo(f.r * (1.9 + k * 0.5), 0);
        ctx.stroke();
      }
      ctx.restore();

      /* 上方进度条 */
      const bw = f.r * 2.7, bh = 4;
      const bx = f.x - bw / 2;
      const by = f.y - f.r - 32;
      ctx.save();
      ctx.fillStyle = 'rgba(4,8,16,.8)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.strokeStyle = 'rgba(255,209,102,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = k >= 0.999 ? '#fff6d8' : '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      ctx.fillRect(bx, by, bw * k, bh);
      ctx.restore();
    }

    /* 招架 */
    if (f.parryCast) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,225,140,.9)';
      ctx.lineWidth = 2.4;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.5 + Math.sin(t * 8) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* 咬合束流：血色（吸血）/ 蓝色（背包充能）：目标 → 自身 */
    if (f.bite) {
      const blue = !!f.bite.blue;
      const be = B.fighters[1 - f.team];
      if (be && !be.dead) {
        const dx = f.x - be.x, dy = f.y - be.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const wob = Math.sin(t * 7 + i * 2.1) * 7;
          const sx = be.x + nx * wob, sy = be.y + ny * wob;
          const ex = f.x + nx * wob * 0.35, ey = f.y + ny * wob * 0.35;
          const mx = (sx + ex) / 2 + nx * (12 + Math.sin(t * 5 + i * 1.7) * 9);
          const my = (sy + ey) / 2 + ny * (12 + Math.sin(t * 5 + i * 1.7) * 9);
          const alpha = (0.45 + 0.3 * Math.sin(t * 6 + i)).toFixed(2);
          ctx.strokeStyle = blue
            ? 'rgba(' + (110 + i * 40 | 0) + ',' + (215 - i * 25 | 0) + ',255,' + alpha + ')'
            : 'rgba(255,' + (40 + i * 26 | 0) + ',' + (72 + i * 14 | 0) + ',' + alpha + ')';
          ctx.lineWidth = 2.4 - i * 0.5;
          ctx.shadowColor = blue ? '#3fa9ff' : '#ff2244';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(mx, my, ex, ey);
          ctx.stroke();
        }
        /* 被咬处脉动环 */
        ctx.shadowBlur = 16;
        ctx.strokeStyle = blue ? 'rgba(120,220,255,.78)' : 'rgba(255,60,90,.75)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(be.x, be.y, be.r * (1.05 + 0.08 * Math.sin(t * 9)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* 吸血时环绕的血色大剑：与本家克丽丝塔同构（根部粗、剑尖细），配色换成血 */
    if (f.bite && !f.bite.blue) {
      const b = f.bite;
      const fade = Math.min(1, b.t / .16) * Math.min(1, Math.max(0, b.total - b.t) / .22);
      /* 剑不旋转：锁定被吸血的目标，整段咬合一直指着它 */
      let a = b.aim;
      if (a == null) {
        const foe = B.fighters && B.fighters.find(o => o && o !== f && !o.dead);
        a = foe ? Math.atan2(foe.y - f.y, foe.x - f.x) : (f.facing >= 0 ? 0 : Math.PI);
      }
      const len = f.r * (2.85 + Math.sin(t * 6) * .14);
      const x1 = f.x + Math.cos(a) * f.r * 0.86;
      const y1 = f.y + Math.sin(a) * f.r * 0.86;
      const x2 = f.x + Math.cos(a) * (f.r * 0.86 + len);
      const y2 = f.y + Math.sin(a) * (f.r * 0.86 + len);
      const nx = -Math.sin(a), ny = Math.cos(a);
      const wB = f.r * 0.54, wT = f.r * 0.1;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = 'lighter';

      /* 外层血雾光晕 */
      ctx.fillStyle = 'rgba(255,20,60,.15)';
      ctx.beginPath();
      ctx.moveTo(x1 + nx * wB * 1.8, y1 + ny * wB * 1.8);
      ctx.lineTo(x1 - nx * wB * 1.8, y1 - ny * wB * 1.8);
      ctx.lineTo(x2 - nx * wT * 2.6, y2 - ny * wT * 2.6);
      ctx.lineTo(x2 + nx * wT * 2.6, y2 + ny * wT * 2.6);
      ctx.closePath();
      ctx.fill();

      /* 剑体：暗红根 → 亮红 → 白尖 */
      const bg = ctx.createLinearGradient(x1, y1, x2, y2);
      bg.addColorStop(0, '#4d0010');
      bg.addColorStop(.30, '#c00b2c');
      bg.addColorStop(.62, '#ff2748');
      bg.addColorStop(1, 'rgba(255,180,195,.95)');
      ctx.fillStyle = bg;
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * wB, y1 + ny * wB);
      ctx.lineTo(x1 - nx * wB, y1 - ny * wB);
      ctx.lineTo(x2 - nx * wT, y2 - ny * wT);
      ctx.lineTo(x2 + nx * wT, y2 + ny * wT);
      ctx.closePath();
      ctx.fill();

      /* 血槽：一条更亮的细芯 */
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(255,235,240,.62)';
      ctx.lineWidth = Math.max(1.1, f.r * 0.042);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      /* 剑尖 */
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff2f4';
      ctx.beginPath();
      ctx.arc(x2, y2, Math.max(2.4, f.r * 0.1), 0, Math.PI * 2);
      ctx.fill();

      /* 剑身两侧的血气：贴着剑身向剑尖收束，不做旋转拖尾 */
      ctx.shadowBlur = 0;
      for (let i = 0; i < 2; i++) {
        const sgn = i ? 1 : -1;
        const off = wB * (1.10 + 0.08 * Math.sin(t * 7 + i * 2.1));
        ctx.strokeStyle = 'rgba(255,60,95,.30)';
        ctx.lineWidth = Math.max(1.2, f.r * 0.05);
        ctx.beginPath();
        ctx.moveTo(x1 + nx * off * sgn, y1 + ny * off * sgn);
        ctx.lineTo(x2 + nx * wT * 1.5 * sgn, y2 + ny * wT * 1.5 * sgn);
        ctx.stroke();
      }
      /* 沿剑身向尖端滑动的血光 */
      const hk = (t * 1.5) % 1;
      const hk2 = Math.min(1, hk + 0.16);
      ctx.strokeStyle = 'rgba(255,225,232,.55)';
      ctx.lineWidth = Math.max(1.4, f.r * 0.06);
      ctx.beginPath();
      ctx.moveTo(x1 + (x2 - x1) * hk, y1 + (y2 - y1) * hk);
      ctx.lineTo(x1 + (x2 - x1) * hk2, y1 + (y2 - y1) * hk2);
      ctx.stroke();
      ctx.restore();
    }

    /* 雪鸮：架枪蓄力（瞄准线 / 锁定框 / 充能环 / 枪口蓄能） */
    if (f.snipe && f.snipe.total > 0) {
      const s = f.snipe, tg = s.target;
      const k = Math.min(1, s.t / s.total);
      const sc2 = f.r / 34;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (tg && !tg.dead) {
        /* 红线始终咬住敌人本体（身后那个滞后点是真正开火的位置，不画出来） */
        const ax = tg.x, ay = tg.y;
        const dx = ax - f.x, dy = ay - f.y;
        const dd = Math.hypot(dx, dy) || 1;
        const ux = dx / dd, uy = dy / dd;
        /* 红色实线瞄准线：越蓄越亮越细，终点是滞后的瞄准点 */
        ctx.strokeStyle = 'rgba(255,64,64,' + (0.22 + 0.62 * k).toFixed(3) + ')';
        ctx.shadowColor = 'rgba(255,40,40,.85)';
        ctx.shadowBlur = 8 * sc2;
        ctx.lineWidth = Math.max(1, (2.2 - 1.5 * k) * sc2);
        ctx.beginPath();
        ctx.moveTo(f.x + ux * f.r, f.y + uy * f.r);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.shadowBlur = 0;
        /* 锁定角标：随蓄力向内收拢 */
        const R0 = tg.r * (2.0 - 0.55 * k);
        ctx.strokeStyle = 'rgba(216,224,232,' + (0.35 + 0.5 * k).toFixed(3) + ')';
        ctx.lineWidth = 2 * sc2;
        for (let i = 0; i < 4; i++) {
          const a0 = i * Math.PI / 2 + Math.PI / 4 - 0.22;
          ctx.beginPath();
          ctx.arc(tg.x, tg.y, R0, a0, a0 + 0.44);
          ctx.stroke();
        }
      }
      /* 自身充能环：蓄力阶段是进度环，连发阶段换成「还剩几枪」的刻度 */
      if (s.phase === 'shots') {
        for (let i = 0; i < s.shots; i++) {
          const a0 = -Math.PI / 2 + (i / s.shots) * Math.PI * 2;
          ctx.strokeStyle = i < s.shot ? 'rgba(255,86,96,.42)' : 'rgba(240,246,252,.95)';
          ctx.lineWidth = 3 * sc2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 1.32, a0, a0 + (Math.PI * 2 / s.shots) * .62);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(206,215,224,.92)';
        ctx.lineWidth = 3 * sc2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 1.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        ctx.stroke();
      }
      /* 枪口蓄能：和红线同一条指向（始终对着敌人本体），只有实际弹道才会有偏移 */
      const aimA = (tg && !tg.dead) ? Math.atan2(tg.y - f.y, tg.x - f.x) : (f.facing >= 0 ? 0 : Math.PI);
      const mx = f.x + Math.cos(aimA) * (f.r + 12 * sc2);
      const my = f.y + Math.sin(aimA) * (f.r + 12 * sc2);
      const gr = (2.2 + 4.4 * k) * sc2;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, gr * 2.2);
      mg.addColorStop(0, 'rgba(250,252,254,.95)');
      mg.addColorStop(.5, 'rgba(170,180,190,.5)');
      mg.addColorStop(1, 'rgba(105,114,124,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, gr * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* 头顶数值 */
    drawNamePlate(ctx, f);

    /* 觉醒外环 */
    if (awak) {
      ctx.save();
      const a = 0.5 + Math.sin(t * 7) * 0.2;
      ctx.strokeStyle = rgba(char.awakenColor || '#ff5060', a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 8, t * 3, t * 3 + 2.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 8, t * 3 + Math.PI, t * 3 + Math.PI + 2.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================ 胧雷-影：影分身 ============================ */
  /* 分身形象 = 角色头像的虚化：把表情图离线模糊、去色、染色、羽化成圆，
     一次生成后缓存，渲染时只 drawImage，静止分身与飞出的分身共用同一形态 */
  const ghostCache = {};
  function ghostOf(url, tone) {
    if (!url) return null;
    const key = url + '|' + tone;
    if (key in ghostCache) return ghostCache[key];
    const src = SW.Assets ? SW.Assets.get(url) : null;
    if (!src) return null;                     /* 图还没加载完，下一帧再试 */
    const S = 192;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (g.filter !== undefined) g.filter = 'blur(1.8px) brightness(1.34) saturate(.9)';
    const sw = src.naturalWidth, sh = src.naturalHeight;
    const k = Math.max(S / sw, S / sh);
    g.drawImage(src, (S - sw * k) / 2, (S - sh * k) / 2, sw * k, sh * k);
    g.filter = 'none';
    /* 染色：常态冷蓝，觉醒赤红 */
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tone === 'red' ? 'rgba(158,22,46,.3)' : 'rgba(26,54,126,.18)';
    g.fillRect(0, 0, S, S);
    /* 边缘羽化，让头像像从暗里浮出来的一团虚影 */
    g.globalCompositeOperation = 'destination-in';
    const rad = g.createRadialGradient(S / 2, S / 2, S * .16, S / 2, S / 2, S * .5);
    rad.addColorStop(0, 'rgba(0,0,0,1)');
    rad.addColorStop(.58, 'rgba(0,0,0,.92)');
    rad.addColorStop(.84, 'rgba(0,0,0,.42)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, S, S);
    ghostCache[key] = cv;
    return cv;
  }

  function drawShadowGhost(ctx, char, x, y, r, tone, alpha, url) {
    if (!char) return;
    const src = url || (char.faces && (char.faces.ready || char.avatar)) || char.avatar;
    const img = ghostOf(src, tone);
    const glow = tone === 'red' ? '#ff3b52' : '#6a8cf0';
    const D = r * 2.34;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = glow;
    ctx.shadowBlur = r * .62;
    if (img) {
      ctx.drawImage(img, x - D / 2, y - D / 2, D, D);
    } else {
      ctx.fillStyle = tone === 'red' ? 'rgba(52,10,20,.9)' : 'rgba(10,16,34,.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShadowClones(ctx, f) {
    const list = f.shadowClones;
    if (!list || !list.length) return;
    const awak = f.awaken > 0;
    const tone = awak ? 'red' : 'blue';
    const glow = awak ? '#ff3b52' : '#5a78e0';
    for (const c of list) {
      const born = c.born == null ? 1 : c.born;
      const fade = Math.min(1, Math.max(0, (c.max - c.t) / .7));
      const k = Math.min(born, fade);
      const t = R.t || 0;
      const bob = Math.sin(t * 2.1 + c.x * .02) * 2.5;
      const sway = Math.sin(t * 1.7 + c.y * .03) * 1.5;
      const r = f.r * .92;

      /* 地面投影 */
      ctx.save();
      ctx.globalAlpha = .3 * k;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + r * .82, r * .78, r * .24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* 虚影头像（每个分身一张不同的表情） */
      drawShadowGhost(ctx, f.char, c.x + sway, c.y + bob, r, tone, .9 * k, c.img);

      /* 能量环 */
      ctx.save();
      ctx.globalAlpha = (.28 + .22 * Math.sin(t * 3 + c.x * .05)) * k;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(c.x + sway, c.y + bob, r * 1.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  R.drawFighters = function (ctx) {
    /* 影分身垫在角色下层 */
    for (const f of B.fighters) if (f && f.shadowClones && f.shadowClones.length) drawShadowClones(ctx, f);
    /* 咬人者最后画，压在被咬目标之上；PvE 里玩家永远在最上层 */
    const rank = f => (f.isMob ? 0 : 2) + (f.bite ? 1 : 0);
    const order = B.fighters.filter(Boolean).sort((a, b) => rank(a) - rank(b));
    for (const f of order) {
      /* PvE 玩家：脚下脉冲光环，被怪围住也能一眼找到自己 */
      if (B.pveOn && B.pve && f === B.pve.player && !f.dead) drawPlayerHalo(ctx, f);
      drawFighter(ctx, f);
      /* PvE 玩家：已获得的角色头像环绕（纯视觉，不参与碰撞） */
      if (B.pveOn && B.pve && f === B.pve.player && !f.dead) drawPveCompanions(ctx, f);
    }
  };

  /* 已获得的角色：小头像绕主角缓慢公转，只做表现 */
  function drawPveCompanions(ctx, f) {
    const pv = B.pve;
    if (!pv || !pv.weapons || !pv.weaponOrder) return;
    const D = SW.Data;
    const ids = [];
    for (const id of pv.weaponOrder) {
      if (id === f.char.id) continue;
      const st = pv.weapons[id];
      if (st && st.lvl > 0 && D && D.get(id)) ids.push(id);
    }
    const n = ids.length;
    if (!n) return;
    const orbitR = f.r * 1.72 + 8;
    const d = Math.max(17, f.r * 0.62);
    const t = R.t;
    for (let i = 0; i < n; i++) {
      const c = D.get(ids[i]);
      const ang = t * 0.55 + i * Math.PI * 2 / n;
      const x = f.x + Math.cos(ang) * orbitR;
      const y = f.y + Math.sin(ang) * orbitR * 0.62 - f.r * 0.15;
      const img = SW.Assets ? SW.Assets.get(c.avatar) : null;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, d * 0.5 + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6,12,24,.66)';
      ctx.fill();
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, d * 0.5, 0, Math.PI * 2);
        ctx.clip();
        const k = Math.max(d / img.width, d / img.height);
        const w = img.width * k, h = img.height * k;
        ctx.globalAlpha = 0.94;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, d * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(c.color || '#8fd0ff', 0.9);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, d * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(c.color || '#8fd0ff', 0.85);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayerHalo(ctx, f) {
    const t = R.t;
    const r = f.r * (2.05 + Math.sin(t * 3) * 0.08);
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,235,255,.32)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(f.x, f.y + f.r * 0.62, f.r * 1.15, f.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,220,255,.18)';
    ctx.fill();

    /* 觉醒：脚下的金色光环，随剩余时间收束 */
    const pv = B.pve;
    if (pv && pv.awakenT > 0) {
      const k = Math.min(1, pv.awakenT / (pv.awakenDur || 2.2));
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1.72 + 0.28 * Math.sin(t * 14)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,230,160,' + (0.35 + 0.5 * k).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    /* 圣光护盾：觉醒技期间的金色罩子 */
    if (pv && pv.shieldT > 0) {
      const pulse = 0.75 + Math.sin(t * 8) * 0.15;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.25 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,236,175,.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,175,.78)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    /* 进化：每进化一把，脚下多一圈金色轨道 + 绕身符文点。
       不看武器也能一眼知道「这局进化了几次」。 */
    const evN = pv && pv.evolved ? Object.keys(pv.evolved).length : 0;
    if (evN > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < evN; i++) {
        const rr = f.r * (2.15 + i * 0.26);
        const sp = t * (1.1 + i * 0.28) + i * 1.7;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rr, sp, sp + Math.PI * 1.15);
        ctx.strokeStyle = 'rgba(255,214,120,' + (0.42 - i * 0.06).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const n = 5 + evN * 2;
      for (let i = 0; i < n; i++) {
        const a = -t * 1.7 + i / n * Math.PI * 2;
        const rr = f.r * 2.15;
        const x = f.x + Math.cos(a) * rr;
        const y = f.y + Math.sin(a) * rr * 0.62;
        const s = 1.6 + Math.sin(t * 6 + i) * 0.5;
        ctx.fillStyle = 'rgba(255,232,170,.75)';
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ============================ 雪鸮格反手雷 ============================ */
  R.drawMines = function (ctx) {
    for (const m of B.mines) {
      const k = Math.min(1, m.t / m.delay);
      const blink = 0.5 + 0.5 * Math.sin(R.t * (16 + 30 * k));
      const r = 7;
      ctx.save();
      ctx.translate(m.x, m.y);
      /* 地面阴影 */
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.95, r * 1.2, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      /* 外壳：枪铁 */
      const g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, 1, 0, 0, r);
      g.addColorStop(0, '#d3dbe3');
      g.addColorStop(.55, '#6c7681');
      g.addColorStop(1, '#1e242a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,240,248,.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      /* 引信红灯 */
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,58,58,' + (0.35 + 0.65 * blink).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      /* 收缩的引爆环 + 爆炸范围虚线 */
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = 'rgba(255,88,88,.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, m.radius * (1 - k * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = 'rgba(232,240,248,.9)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };

  /* ============================ 投射物 ============================ */
  R.drawProjectiles = function (ctx) {
    for (const p of B.projectiles) {
      ctx.save();
      if (p.snipe) {
        /* 狙击弹：枪铁黑弹体 + 冷银描边 + 灰白锥形拖尾 */
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const L = p.len, Wd = p.wid;
        const tg = ctx.createLinearGradient(-L * 2.6, 0, L * 0.6, 0);
        tg.addColorStop(0, 'rgba(88,96,104,0)');
        tg.addColorStop(.5, p.aug ? 'rgba(120,180,230,.30)' : 'rgba(146,156,166,.26)');
        tg.addColorStop(1, p.aug ? 'rgba(170,222,255,.85)' : 'rgba(226,233,239,.80)');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(-L * 2.6, 0);
        ctx.lineTo(L * 0.5, Wd * 2.2);
        ctx.lineTo(L * 0.5, -Wd * 2.2);
        ctx.closePath();
        ctx.fill();
        /* 弹体：黑枪铁 */
        ctx.shadowColor = 'rgba(16,20,24,.9)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#191d22';
        U.roundRect(ctx, -L * 0.5, -Wd * 0.5, L, Wd, Wd * 0.5);
        ctx.fill();
        /* 描边：常态冷银，觉醒转蓝 */
        ctx.shadowBlur = p.aug ? 10 : 0;
        ctx.shadowColor = 'rgba(90,180,255,.9)';
        ctx.strokeStyle = p.aug ? 'rgba(150,210,255,.95)' : 'rgba(222,230,238,.92)';
        ctx.lineWidth = Math.max(1, Wd * 0.2);
        ctx.stroke();
        /* 弹芯 */
        ctx.fillStyle = p.aug ? '#c6e6ff' : '#dfe6ec';
        U.roundRect(ctx, -L * 0.34, -Wd * 0.15, L * 0.88, Wd * 0.3, Wd * 0.15);
        ctx.fill();
        /* 弹头 */
        ctx.fillStyle = p.aug ? '#eaf7ff' : '#f5f8fa';
        ctx.beginPath();
        ctx.arc(L * 0.5, 0, Wd * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'beam') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        const g = ctx.createLinearGradient(-p.len / 2, 0, p.len / 2, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.35, p.color);
        g.addColorStop(0.72, '#ffffff');
        g.addColorStop(1, 'rgba(180,240,255,0)');
        ctx.fillStyle = g;
        U.roundRect(ctx, -p.len / 2, -p.wid / 2, p.len, p.wid, p.wid / 2);
        ctx.fill();
        /* 枪口拖尾 */
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = p.color;
        U.roundRect(ctx, -p.len * 1.6, -p.wid * 0.28, p.len * 1.1, p.wid * 0.56, p.wid * 0.28);
        ctx.fill();
      } else if (p.kind === 'blade') {
        /* 直线飞刀：不再自旋，刀身始终沿飞行方向 */
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.shadowColor = '#cfe6ff';
        ctx.shadowBlur = 20;
        const L = p.len, Wd = p.wid;
        /* 拖尾 */
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#8fc4ff';
        ctx.beginPath();
        ctx.moveTo(-L * 1.9, 0);
        ctx.lineTo(-L * 0.45, Wd * 0.26);
        ctx.lineTo(-L * 0.45, -Wd * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        /* 刀身：细长直线菱形 */
        ctx.fillStyle = '#eef4ff';
        ctx.beginPath();
        ctx.moveTo(L * 0.62, 0);
        ctx.lineTo(L * 0.1, Wd * 0.5);
        ctx.lineTo(-L * 0.5, Wd * 0.18);
        ctx.lineTo(-L * 0.5, -Wd * 0.18);
        ctx.lineTo(L * 0.1, -Wd * 0.5);
        ctx.closePath();
        ctx.fill();
        /* 刃线 */
        ctx.fillStyle = 'rgba(120,180,255,.8)';
        ctx.fillRect(-L * 0.5, -Wd * 0.06, L * 1.0, Wd * 0.12);
      } else if (p.kind === 'missile') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        /* 尾焰 */
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#3fa9ff';
        ctx.beginPath();
        ctx.ellipse(-p.len * 0.75, 0, p.len * 0.55, p.wid * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        /* 弹体 */
        ctx.fillStyle = '#e8fffb';
        ctx.beginPath();
        ctx.moveTo(p.len * 0.55, 0);
        ctx.lineTo(-p.len * 0.35, p.wid * 0.5);
        ctx.lineTo(-p.len * 0.15, 0);
        ctx.lineTo(-p.len * 0.35, -p.wid * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3fa9ff';
        ctx.beginPath();
        ctx.moveTo(p.len * 0.55, 0);
        ctx.lineTo(p.len * 0.05, p.wid * 0.32);
        ctx.lineTo(p.len * 0.05, -p.wid * 0.32);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'cloneRush') {
        /* 影分身飞出扑击：形态与静止分身一致（头像虚影），不翻转不缩放 */
        const sc2 = B.scale();
        const rr = 30 * sc2;
        const owner = p.owner;
        const tone = (owner && owner.awaken > 0) ? 'red' : 'blue';
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const ux = p.vx / sp, uy = p.vy / sp;
        /* 尾迹 */
        const tg2 = ctx.createLinearGradient(p.x - ux * 110 * sc2, p.y - uy * 110 * sc2, p.x, p.y);
        tg2.addColorStop(0, 'rgba(80,120,220,0)');
        tg2.addColorStop(1, tone === 'red' ? 'rgba(255,90,120,.30)' : 'rgba(120,160,255,.30)');
        ctx.fillStyle = tg2;
        ctx.beginPath();
        ctx.moveTo(p.x - ux * 110 * sc2, p.y - uy * 110 * sc2);
        ctx.lineTo(p.x - uy * 13 * sc2, p.y + ux * 13 * sc2);
        ctx.lineTo(p.x + uy * 13 * sc2, p.y - ux * 13 * sc2);
        ctx.closePath();
        ctx.fill();
        /* 同一形态的淡拖影 */
        drawShadowGhost(ctx, owner && owner.char, p.x - ux * 18 * sc2, p.y - uy * 18 * sc2, rr * .9, tone, .3, p.img);
        /* 分身本体 */
        drawShadowGhost(ctx, owner && owner.char, p.x, p.y, rr, tone, .95, p.img);
        /* 起飞高亮：白闪一下再暗回去 */
        const age = p.age || 0;
        if (age < .24) {
          const hk = 1 - age / .24;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const hg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, rr * 2.4);
          hg.addColorStop(0, `rgba(255,255,255,${Math.min(1, 1.1 * hk)})`);
          hg.addColorStop(.34, tone === 'red' ? `rgba(255,110,130,${.6 * hk})` : `rgba(170,205,255,${.6 * hk})`);
          hg.addColorStop(1, 'rgba(120,160,255,0)');
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr * 2.4, 0, Math.PI * 2);
          ctx.fill();
          /* 高亮描边环 */
          ctx.strokeStyle = `rgba(255,255,255,${.95 * hk})`;
          ctx.lineWidth = 3 * hk;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr * (1 + .5 * (1 - hk)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        /* 飞行加速环 */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = tone === 'red' ? 'rgba(255,110,130,.45)' : 'rgba(110,150,255,.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * .96, p.angle + 2.2, p.angle + 4.1);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'shuriken') {
        /* 三分叉手里剑：枪铁黑刃 + 冷银描边，自旋 */
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + (R.t || 0) * 20);
        const L = p.len;
        ctx.shadowColor = p.main ? 'rgba(170,200,255,.9)' : 'rgba(90,120,224,.8)';
        ctx.shadowBlur = 14;
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate(i * Math.PI * 2 / 3);
          ctx.fillStyle = p.main ? '#1b2233' : '#28324d';
          ctx.beginPath();
          ctx.moveTo(L * .05, -L * .07);
          ctx.lineTo(L * .72, -L * .18);
          ctx.lineTo(L * .26, L * .05);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = p.main ? 'rgba(206,222,255,.9)' : 'rgba(130,158,242,.75)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#0b0f1a';
        ctx.beginPath();
        ctx.arc(0, 0, L * .16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,206,255,.95)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else if (p.kind === 'laser') {
        const ex = p.x + Math.cos(p.angle) * p.len;
        const ey = p.y + Math.sin(p.angle) * p.len;
        const flick = 0.75 + Math.sin(R.t * 30 + p.angle * 8) * 0.18;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(60,220,190,.13)';
        ctx.lineWidth = p.wid * 1.7;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = `rgba(90,255,220,${0.55 * flick})`;
        ctx.lineWidth = p.wid;
        ctx.shadowColor = '#3fa9ff';
        ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.lineWidth = Math.max(1.5, p.wid * 0.34);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* ============================ 粒子 / 飘字 ============================ */
  /* ============================ G·诺伦 背包弹体 ============================ */
  R.drawPacks = function (ctx) {
    for (const p of B.packs) {
      const s = 17;
      /* 高速拖尾 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createLinearGradient(
        p.x, p.y,
        p.x - Math.cos(p.angle) * 74, p.y - Math.sin(p.angle) * 74);
      tg.addColorStop(0, 'rgba(160,235,255,.6)');
      tg.addColorStop(1, 'rgba(60,150,255,0)');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.angle) * 74, p.y - Math.sin(p.angle) * 74);
      ctx.stroke();
      ctx.restore();

      /* 背包本体 */
      ctx.save();
      ctx.translate(p.x, p.y);
      /* 危险脉冲环 */
      const pr = s * (1.5 + Math.sin(R.t * 12) * 0.25);
      ctx.strokeStyle = 'rgba(160,235,255,.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(Math.sin(p.spin) * .22);
      ctx.shadowColor = '#7fe8ff';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#16324f';
      U.roundRect(ctx, -s * .78, -s * .92, s * 1.56, s * 1.9, 4);
      ctx.fill();
      ctx.fillStyle = '#2f76b8';
      U.roundRect(ctx, -s * .78, -s * .92, s * 1.56, s * .78, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,240,255,.9)';
      ctx.lineWidth = 1.8;
      U.roundRect(ctx, -s * .78, -s * .92, s * 1.56, s * 1.9, 4);
      ctx.stroke();
      /* 扣带 */
      ctx.beginPath();
      ctx.moveTo(-s * .78, s * .16);
      ctx.lineTo(s * .78, s * .16);
      ctx.strokeStyle = 'rgba(200,245,255,.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      /* 核心宝石 */
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#e6fbff';
      ctx.beginPath();
      ctx.moveTo(0, -s * .3);
      ctx.lineTo(s * .3, s * .02);
      ctx.lineTo(0, s * .34);
      ctx.lineTo(-s * .3, s * .02);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  };

  /* ---------------- 赛博书法字 ----------------
     行楷打底 + 青蓝色差残影 + 横向扫描切片，用于「无间影狱」的汉字 */
  const BRUSH_FONT = '"STXingkai","华文行楷","STXinwei","华文新魏","KaiTi","STKaiti","楷体",serif';

  function drawBrushText(ctx, t, k) {
    const age = 1 - k;
    const inK = Math.min(1, age / .14);
    const outK = Math.min(1, k / .32);
    const pop = 1 + (1 - inK) * .52;
    if (t.seed == null) t.seed = Math.random() * 997;
    /* 入场瞬间抖动 + 尾段故障跳动 */
    const jit = (1 - inK) * 9 + (k < .38 ? (Math.random() - .5) * 6 : 0);

    ctx.save();
    ctx.globalAlpha = Math.min(1, inK * 1.5) * outK;
    ctx.translate(t.x + jit, t.y);
    ctx.rotate(t.rot || 0);
    ctx.scale(pop, pop);
    /* 轻微右倾，写出运笔的势 */
    ctx.transform(1, 0, -.07, 1, 0, 0);
    /* 行楷本身笔画够重，不加字重，避免浏览器伪粗体把字腔糊死 */
    ctx.font = `${t.size}px ${BRUSH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    /* 色差残影：青 / 赤各偏一份，赛博显示屏的错位 */
    const gl = .02 * t.size + (k < .38 ? .016 * t.size : 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(60,196,255,.42)';
    ctx.fillText(t.str, -gl, -gl * .5);
    ctx.fillStyle = 'rgba(255,32,64,.34)';
    ctx.fillText(t.str, gl, gl * .5);
    ctx.globalCompositeOperation = 'source-over';

    /* 外辉光只做一层薄的，保证字形轮廓清楚 */
    ctx.shadowColor = 'rgba(255,40,72,.8)';
    ctx.shadowBlur = t.size * .09;
    ctx.lineWidth = Math.max(1, t.size * .022);
    ctx.strokeStyle = 'rgba(16,0,6,.9)';
    ctx.strokeText(t.str, 0, 0);
    ctx.shadowColor = 'rgba(80,200,255,.6)';
    ctx.shadowBlur = t.size * .05;
    ctx.strokeText(t.str, 0, 0);
    ctx.shadowBlur = 0;

    /* 主体：上亮下浓，模拟毛笔提按的墨色浓淡 */
    const g = ctx.createLinearGradient(0, -t.size * .5, 0, t.size * .5);
    g.addColorStop(0, '#ffe3e9');
    g.addColorStop(.34, t.color);
    g.addColorStop(1, '#6a0014');
    ctx.fillStyle = g;
    ctx.fillText(t.str, 0, 0);

    /* 笔锋高光描边 */
    ctx.lineWidth = Math.max(.8, t.size * .022);
    ctx.strokeStyle = 'rgba(255,236,242,.75)';
    ctx.strokeText(t.str, 0, 0);

    /* 横向扫描切片 */
    ctx.globalCompositeOperation = 'lighter';
    const base = ctx.globalAlpha;
    for (let i = 0; i < 3; i++) {
      const sy = -t.size * .44 + (((t.seed + i * 41) % 100) / 100) * t.size * .88;
      ctx.globalAlpha = base * .4;
      ctx.fillStyle = 'rgba(96,206,255,.55)';
      ctx.fillRect(-t.size * .62, sy + Math.sin(age * 26 + i * 2) * 2.5,
        t.size * 1.24, Math.max(1, t.size * .04));
    }
    ctx.restore();
  }

  R.drawFx = function (ctx) {
    for (const p of Fx.parts) {
      if (p.delay > 0) continue;
      const k = p.life / p.max;
      if (p.boom) {
        const kk = Math.max(0, p.life / p.max);
        const age = 1 - kk;
        /* 前 55% 保持明亮，后 45% 淡出 */
        const fade = age < 0.55 ? 1 : Math.max(0, 1 - (age - 0.55) / 0.45);
        const grow = Math.min(1, age / 0.35);
        const rr = p.r * (0.5 + grow * 0.55 + age * 0.25);
        const c = p.color || '#5cb8ff';

        if (!p.seed) {
          p.seed = [];
          for (let i = 0; i < 6; i++) {
            p.seed.push({ a: Math.random() * Math.PI * 2, d: 0.15 + Math.random() * 0.5, s: 0.16 + Math.random() * 0.22 });
          }
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        /* 外层热浪 */
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 1.28);
        g2.addColorStop(0, rgba(c, 0.55 * fade));
        g2.addColorStop(0.45, rgba(c, 0.26 * fade));
        g2.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 1.28, 0, Math.PI * 2);
        ctx.fill();

        /* 内部火团 */
        for (const sp of p.seed) {
          const px = p.x + Math.cos(sp.a) * rr * sp.d;
          const py = p.y + Math.sin(sp.a) * rr * sp.d;
          const pr = rr * sp.s * (0.75 + age * 0.5);
          const gi = ctx.createRadialGradient(px, py, 0, px, py, pr);
          gi.addColorStop(0, rgba('#ffffff', 0.42 * fade));
          gi.addColorStop(0.4, rgba(c, 0.35 * fade));
          gi.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = gi;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }

        /* 冲击环 */
        ctx.strokeStyle = rgba(c, 0.8 * fade);
        ctx.lineWidth = 1.5 + 3.5 * fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.stroke();

        /* 核心白闪 */
        if (age < 0.18) {
          ctx.globalAlpha = (1 - age / 0.18) * 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      if (p.cone) {
        /* 穿甲锥：枪铁黑锥体 + 冷银棱线，沿弹道方向扩张 */
        const kk = Math.max(0, p.life / p.max);
        const age = 1 - kk;
        const len = p.len * (0.34 + 1.0 * age);
        const halfW = Math.tan(p.half) * len;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.globalAlpha = Math.min(1, kk * 1.6);
        /* 金属锥体：冷银内芯 + 枪铁边缘 */
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(226,233,240,.62)');
        g.addColorStop(.45, 'rgba(150,160,170,.30)');
        g.addColorStop(1, 'rgba(60,68,76,.10)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, -halfW);
        ctx.lineTo(len, halfW);
        ctx.closePath();
        ctx.fill();
        /* 枪铁锥缘（深色描边）+ 冷银内缘 */
        ctx.strokeStyle = 'rgba(12,15,18,.72)';
        ctx.lineWidth = Math.max(2, 5.2 * kk);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(len, -halfW);
        ctx.moveTo(0, 0); ctx.lineTo(len, halfW);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(p.color, 0.98);
        ctx.lineWidth = Math.max(1.2, 2.4 * kk);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(len, -halfW);
        ctx.moveTo(0, 0); ctx.lineTo(len, halfW);
        ctx.stroke();
        /* 内部放射棱线 */
        ctx.lineWidth = Math.max(.8, 1.4 * kk);
        ctx.strokeStyle = rgba(p.color, 0.55);
        for (let i = -2; i <= 2; i++) {
          if (i === 0) continue;
          const a2 = (i / 2) * p.half * 0.82;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a2) * len * 0.94, Math.sin(a2) * len * 0.94);
          ctx.stroke();
        }
        /* 中轴亮线 + 穿透白芯 */
        ctx.strokeStyle = rgba(p.color, 0.8);
        ctx.lineWidth = Math.max(1, 1.8 * kk);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(len * 0.9, 0);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * kk).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, p.len * 0.05 * (1 + age * 1.2)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.line) {
        const kk = Math.max(0, p.life / p.max);
        ctx.save();
        ctx.globalAlpha = Math.min(1, kk * 1.4);
        ctx.strokeStyle = p.color;
        const w0 = p.w || 3.4;
        ctx.lineWidth = Math.max(1, w0 * kk);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = Math.max(14, w0 * 2.2);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (p.ring) {
        const r = U.lerp(p.r, p.r1, 1 - k);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + k * 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.3);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }

    for (const t of Fx.texts) {
      const k = t.life / t.max;
      if (t.brush) { drawBrushText(ctx, t, k); continue; }
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `${t.bold ? 900 : 700} ${t.size}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  };


  /* ============================ 侧栏：技能 / 战况 ============================ */
  function wrapText(ctx, text, maxW, maxLines) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
        if (lines.length >= (maxLines || 99)) break;
      } else line += ch;
    }
    if (line && lines.length < (maxLines || 99)) lines.push(line);
    return lines;
  }

  function panelBg(ctx, x, y, w, h, mirror) {
    const g = mirror
      ? ctx.createLinearGradient(x + w, 0, x, 0)
      : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(4,10,20,.72)');
    g.addColorStop(0.72, 'rgba(4,10,20,.38)');
    g.addColorStop(1, 'rgba(4,10,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  function drawCharCard(ctx, f, x, y, w, h) {
    if (!f) return;
    const c = f.char;
    const pad = 7;
    const innerW = w - pad * 2;
    let cy = y + 10;

    panelBg(ctx, x, y, w, h, false);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.font = '900 12.5px "PingFang SC",sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2,6,14,.85)';
    ctx.strokeText(c.name, x + pad, cy);
    ctx.fillStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 8;
    ctx.fillText(c.name, x + pad, cy);
    ctx.shadowBlur = 0;
    cy += 13;

    ctx.font = '700 7px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(255,209,102,.8)';
    ctx.fillText('COST ' + c.cost + '　HP ' + c.hp, x + pad, cy);
    cy += 12;

    const sk = SW.Data.SKILL_DEFS[c.skill.type];
    ctx.font = '800 8px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(160,235,255,.95)';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(2,6,14,.8)';
    ctx.strokeText('◆ ' + (sk ? sk.name : c.skill.type), x + pad, cy);
    ctx.fillText('◆ ' + (sk ? sk.name : c.skill.type), x + pad, cy);
    cy += 10;

    ctx.font = '400 7px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(168,192,220,.92)';
    const skLines = wrapText(ctx, sk ? sk.desc : '', innerW, 4);
    for (const ln of skLines) {
      ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(2,6,14,.75)';
      ctx.strokeText(ln, x + pad, cy);
      ctx.fillText(ln, x + pad, cy); cy += 9;
    }

    cy += 4;

    const aw = SW.Data.AWAKEN_DEFS[c.awaken.type];
    ctx.font = '800 8px "PingFang SC",sans-serif';
    ctx.fillStyle = c.awakenColor || '#ff8b96';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(2,6,14,.8)';
    ctx.strokeText('◇ ' + (aw ? aw.name : c.awaken.type), x + pad, cy);
    ctx.fillText('◇ ' + (aw ? aw.name : c.awaken.type), x + pad, cy);
    cy += 10;

    ctx.font = '400 7px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(168,192,220,.86)';
    const awLines = wrapText(ctx, aw ? aw.desc : '', innerW, 5);
    for (const ln of awLines) {
      ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(2,6,14,.75)';
      ctx.strokeText(ln, x + pad, cy);
      ctx.fillText(ln, x + pad, cy); cy += 9;
    }

    if (f.awaken > 0) {
      ctx.font = '900 7.5px "PingFang SC",sans-serif';
      ctx.fillStyle = c.awakenColor || '#ff5c6e';
      ctx.globalAlpha = 0.6 + Math.sin(R.t * 6) * 0.35;
      ctx.fillText('AWAKEN ' + f.awaken.toFixed(1) + 's', x + pad, cy + 4);
    }
    ctx.restore();
  }

  function drawLogPanel(ctx, x, y, w, h) {
    const pad = 7;
    panelBg(ctx, x, y, w, h, true);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.font = '900 8px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(120,170,220,.55)';
    ctx.fillText('战 况', x + pad, y + 10);

    let cy = y + 26;
    ctx.font = '700 7.5px "PingFang SC",sans-serif';
    for (const lg of B.logs) {
      const a = Math.min(1, lg.life / 0.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = lg.color;
      const txt = wrapText(ctx, lg.text, w - pad - 2, 2);
      for (const ln of txt) {
        ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(2,6,14,.8)';
        ctx.strokeText(ln, x + pad, cy);
        ctx.fillText(ln, x + pad, cy);
        cy += 9;
      }
      cy += 6;
      if (cy > y + h - 8) break;
    }
    ctx.restore();
  }


  /* ============================ 顶部技能条 ============================ */
  function drawSkillCard(ctx, f, x, y, w, h, right) {
    if (!f) return;
    const c = f.char;
    const pad = 9;
    const tx = right ? x + w - pad : x + pad;
    const align = right ? 'right' : 'left';

    ctx.save();
    ctx.fillStyle = 'rgba(6,12,24,.92)';
    U.roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = c.color + '66';
    ctx.lineWidth = 1;
    U.roundRect(ctx, x, y, w, h, 4);
    ctx.stroke();

    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    /* 名字 */
    ctx.font = '900 18px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 10;
    ctx.fillText(c.name, tx, y + 15);
    ctx.shadowBlur = 0;

    /* COST / HP */
    ctx.font = '700 11px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(255,209,102,.85)';
    ctx.fillText('COST ' + c.cost + '　HP ' + c.hp, tx, y + 35);

    /* 技能 */
    const sk = SW.Data.SKILL_DEFS[c.skill.type];
    ctx.font = '800 14px "PingFang SC",sans-serif';
    ctx.fillStyle = '#9fe8ff';
    ctx.fillText('◆ ' + (sk ? sk.name : c.skill.type), tx, y + 56);

    ctx.font = '400 11px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(170,195,222,.9)';
    const skLines = wrapText(ctx, sk ? sk.desc : '', w - pad * 2, 2);
    let yy = y + 74;
    for (const ln of skLines) { ctx.fillText(ln, tx, yy); yy += 13; }

    /* 觉醒 */
    const aw = SW.Data.AWAKEN_DEFS[c.awaken.type];
    ctx.font = '800 12px "PingFang SC",sans-serif';
    ctx.fillStyle = c.awakenColor || '#ff8b96';
    ctx.fillText('◇ ' + (aw ? aw.name : c.awaken.type), tx, y + h - 10);

    ctx.restore();
  }

  R.drawTopSkills = function (ctx) {
    if (!B.fighters.length || B.state === 'idle') return;
    const W = this.W;
    const gap = 8;
    const w = (W - gap * 3) / 2;
    const y = 44;
    const h = 118;
    drawSkillCard(ctx, B.fighters[0], gap, y, w, h, false);
    drawSkillCard(ctx, B.fighters[1], W - gap - w, y, w, h, true);
  };

  /* ============================ 底部战况 ============================ */
  R.drawBottomLog = function (ctx) {
    if (!B.fighters.length || B.state === 'idle') return;
    const W = this.W, H = this.H;
    const h = 78;
    const y = H - h;

    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, 'rgba(6,12,24,.55)');
    g.addColorStop(1, 'rgba(4,8,16,.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, h);
    ctx.strokeStyle = 'rgba(90,160,230,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 12px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(120,180,235,.75)';
    ctx.fillText('战况', 12, y + 13);

    let ly = y + 13;
    ctx.font = '700 11.5px "PingFang SC",sans-serif';
    for (const lg of B.logs.slice(0, 4)) {
      const a = Math.min(1, lg.life / 0.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = lg.color;
      ctx.fillText(lg.text, 54, ly);
      ly += 17;
    }
    ctx.restore();
  };

  /* ============================ HUD ============================ */
  function drawCostPips(ctx, x, y, n, dir, color) {
    /* dir: 1 从左往右，-1 从右往左 */
    const gap = 11.5;
    for (let i = 0; i < 6; i++) {
      const px = x + dir * (i * gap);
      const on = i < n;
      ctx.beginPath();
      ctx.moveTo(px, y - 5);
      ctx.lineTo(px + 6.5, y);
      ctx.lineTo(px, y + 5);
      ctx.lineTo(px - 6.5, y);
      ctx.closePath();
      if (on) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(120,150,190,.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }


  /* 觉醒百分比圆环 */
  function drawAwakenOrb(ctx, f, x, y, r) {
    const active = f.awaken > 0;
    const dur = (f.char.awaken && f.char.awaken.params && f.char.awaken.params.duration) || 8;
    const pct = active ? U.clamp(f.awaken / dur, 0, 1) : U.clamp(f.awak / 100, 0, 1);
    const ready = !active && pct >= 0.5;
    const acol = f.char.awakenColor || '#ff3b52';
    const col = (ready || active) ? acol : 'rgba(132,152,178,.8)';

    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4,10,20,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,155,195,.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (ready || active) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = '900 11.5px "PingFang SC",sans-serif';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(active ? String(Math.ceil(f.awaken)) : String(Math.round(pct * 100)), x, y + 1);

    if (active) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(acol, .55);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = acol;
      ctx.shadowBlur = 14;
      ctx.stroke();
    }
    ctx.restore();
  }

  R.drawHUD = function (ctx) {
    if (!B.fighters.length) return;
    /* PvE 的顶部信息走 DOM 的 #pveHud */
    if (B.pveOn) return;
    const W = this.W;
    const pad = 16;

    for (let i = 0; i < 2; i++) {
      const f = B.fighters[i];
      if (!f) continue;
      const right = i === 1;
      const nameX = right ? W - pad : pad;

      ctx.save();
      ctx.font = '900 18px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = right ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(f.char.name, nameX, 23);
      ctx.fillStyle = f.char.color;
      ctx.shadowColor = f.char.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.char.name, nameX, 23);

      const tw = ctx.measureText(f.char.name).width;
      ctx.restore();

      const costLeft = Math.max(0, Math.ceil(f.costPool));
      drawCostPips(ctx, right ? nameX - tw - 15 : nameX + tw + 15, 23, costLeft, right ? -1 : 1, '#ffd166');
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 14px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(150,180,220,.6)';
    ctx.fillText('1v1', W / 2, 17);
    ctx.font = '800 13px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(120,150,190,.7)';
    if (B.state !== 'idle') ctx.fillText(B.time.toFixed(0) + 's', W / 2, 40);
    ctx.restore();
  };

  /* 跟随角色的血条 + 觉醒 */

  /* 角色特殊资源：进化 / 残心 */
  function drawCharBadge(ctx, f, cx, y) {
    const type = f.char.skill.type;

    if (type === 'rhine_evo') {
      const maxed = f.awaken > 0;
      const lvl = f.evoLevel || 0;
      const per = f.char.skill.params.evoPerLevel || 100;
      const prog = maxed ? 1 : U.clamp((f.evo || 0) / per, 0, 1);
      const col = maxed ? '#ff3b52' : '#5cb8ff';
      const col2 = maxed ? '#ffc0c8' : '#a8d8ff';
      const w = 42, h = 4;
      const x0 = cx - w / 2 - 17;
      ctx.save();
      ctx.fillStyle = 'rgba(4,12,20,.85)';
      ctx.fillRect(x0, y - 1, w + 2, h + 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = maxed ? 12 : 6;
      ctx.fillRect(x0 + 1, y, w * prog, h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = maxed ? 'rgba(255,59,82,.55)' : 'rgba(107,255,224,.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y - 0.5, w + 1, h + 1);

      ctx.font = '900 12px "PingFang SC",sans-serif';
      ctx.fillStyle = col2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const txt = maxed ? '完全之龙！' : '进化' + (lvl <= 0 ? '—' : ['Ⅰ', 'Ⅱ', 'Ⅲ'][Math.min(2, lvl - 1)]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2,8,16,.85)';
      ctx.strokeText(txt, x0 + w + 7, y + 2);
      ctx.fillText(txt, x0 + w + 7, y + 2);
      ctx.restore();
      return;
    }

    if (type === 'akigumo_iaido' || type === 'akigumo_broken') {
      const n = f.reshin || 0;
      const max = (f.char.skill.params.reshinMax || 3);
      const cols = ['rgba(235,245,255,.95)', '#ffd75a', '#ff4d5e'];
      const col = n > 0 ? cols[Math.min(2, n - 1)] : 'rgba(120,145,175,.38)';
      const x0 = cx - 25;
      ctx.save();
      for (let i = 0; i < max; i++) {
        const px = x0 + i * 17;
        const on = i < n;
        ctx.fillStyle = on ? col : 'rgba(120,145,175,.3)';
        if (on) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.moveTo(px, y - 1.5);
        ctx.lineTo(px + 5.6, y + 4.3);
        ctx.lineTo(px, y + 10);
        ctx.lineTo(px - 5.6, y + 4.3);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.font = '900 12px "PingFang SC",sans-serif';
      ctx.fillStyle = n > 0 ? col : 'rgba(150,170,195,.65)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2,8,16,.85)';
      const txt = '残心' + n;
      ctx.strokeText(txt, x0 + max * 17 + 1, y + 4);
      ctx.fillText(txt, x0 + max * 17 + 1, y + 4);
      ctx.restore();
    }
  }

  /* COST 余量图形：每格 1 COST，可部分填充 */
  function drawCostGauge(ctx, x, y, left, total, dir, k) {
    const step = 7.6 * k, half = 3.3 * k;
    const col = left <= 0 ? '#ff5566' : (left <= 2 ? '#ffb04d' : '#ffd166');
    ctx.save();
    for (let i = 0; i < total; i++) {
      const v = U.clamp(left - i, 0, 1);
      const cx = x + dir * (i * step);
      ctx.beginPath();
      ctx.moveTo(cx, y - half);
      ctx.lineTo(cx + half, y);
      ctx.lineTo(cx, y + half);
      ctx.lineTo(cx - half, y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(3,9,18,.9)';
      ctx.fill();
      ctx.strokeStyle = v > 0 ? 'rgba(255,209,102,.35)' : 'rgba(120,150,190,.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (v > 0.02) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6;
        ctx.fillRect(cx - half, y + half - v * half * 2, half * 2, v * half * 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawNamePlate(ctx, f) {
    if (f.dead) return;
    /* PvE 走 HUD，不画 canvas 名牌（怪会堆成一片横条） */
    if (f.isMob) return;
    if (B.pveOn) return;
    const w = 134, bh = 8;
    /* 咬合时向右让开，避免与目标的名字牌叠在一起 */
    const shift = f.bite ? 74 : 0;
    const barX = U.clamp(f.x - w / 2 + shift, 36, R.W - 56 - w);
    /* 两名角色贴身时名牌错层，避免互相压字 */
    const tier = B.fighters && B.fighters.indexOf(f) === 1 ? 30 : 0;
    const y = Math.max(58, f.y - f.r - 44 - tier);

    /* 名字 */
    ctx.save();
    ctx.font = '900 16.5px "PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(2,6,14,.85)';
    const nameCx = barX + w / 2;
    ctx.strokeText(f.char.name, nameCx, y - 15);
    ctx.fillStyle = f.char.color;
    ctx.fillText(f.char.name, nameCx, y - 15);
    const nameW = ctx.measureText(f.char.name).width;
    ctx.restore();

    /* 名字右侧：剩余 COST / 总 COST */
    const gTotal = 6, gK = 1.6, gStep = 7.6 * gK, gHalf = 3.3 * gK;
    let gx = nameCx + nameW / 2 + 11 + gHalf;
    gx = Math.min(gx, R.W - 8 - (gTotal - 1) * gStep - gHalf);
    drawCostGauge(ctx, gx, y - 15, Math.max(0, f.costPool), gTotal, 1, gK);

    /* 底槽 */
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,20,.9)';
    U.roundRect(ctx, barX - 1, y - 1, w + 2, bh + 2, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,210,.3)';
    ctx.lineWidth = 1;
    U.roundRect(ctx, barX - 1, y - 1, w + 2, bh + 2, 2);
    ctx.stroke();

    /* 掉血残影 */
    const ratio = U.clamp(f.hp / f.maxHp, 0, 1);
    const ghost = f._npGhost === undefined ? ratio : f._npGhost;
    f._npGhost = ghost + (ratio - ghost) * 0.08;
    if (f._npGhost > ratio + 0.002) {
      ctx.fillStyle = 'rgba(255,196,96,.55)';
      U.roundRect(ctx, barX, y, w * f._npGhost, bh, 2);
      ctx.fill();
    }

    /* 血量 */
    const grad = ctx.createLinearGradient(barX, y, barX + w, y);
    if (ratio > 0.3) {
      grad.addColorStop(0, f.char.color2);
      grad.addColorStop(1, f.char.color);
    } else {
      grad.addColorStop(0, '#ff9aa6');
      grad.addColorStop(1, '#c31f31');
    }
    ctx.fillStyle = grad;
    if (ratio > 0.01) {
      U.roundRect(ctx, barX, y, w * ratio, bh, 2);
      ctx.fill();
    }

    /* 数值 */
    ctx.font = '900 13.5px "PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2,6,14,.8)';
    const txt = Math.ceil(f.hp) + '';
    ctx.strokeText(txt, barX + w + 8, y + bh / 2);
    ctx.fillStyle = 'rgba(235,245,255,.95)';
    ctx.fillText(txt, barX + w + 8, y + bh / 2);
    ctx.restore();

    /* 特殊资源 */
    drawCharBadge(ctx, f, barX + w / 2, y + bh + 15);

    /* 觉醒圆环 */
    drawAwakenOrb(ctx, f, barX - 20, y + bh / 2, 12.5);
  }

  /* ============================ 覆盖层 ============================ */
  R.drawOverlay = function (ctx) {
    const W = this.W, H = this.H, t = this.t;

    /* ---- 慢动作演出：黑边 + 红黑压角 + 速度线 ---- */
    if (B.slowT > 0) {
      const k = Math.min(1, B.slowT / 1.5);
      ctx.save();
      /* 上下黑边 */
      const bar = H * 0.085 * k;
      ctx.fillStyle = 'rgba(0,0,0,.92)';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      /* 红黑压角 */
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.7, 'rgba(40,0,10,' + (0.28 * k).toFixed(3) + ')');
      vg.addColorStop(1, 'rgba(90,0,16,' + (0.5 * k).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      /* 横向速度线 */
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const yy = (i * 97 + (t * 640) % 97) % H;
        const len = 60 + ((i * 53) % 180);
        const xx = ((i * 211 + t * 900) % (W + 300)) - 150;
        ctx.strokeStyle = 'rgba(255,90,110,' + (0.05 + (i % 5) * 0.016).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + len, yy);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- PvE 进化：全屏金闪 + 放射光带 + 大字（比觉醒更重的一档演出） ---- */
    if (B.pveOn && B.pve && B.pve.evoFlashT > 0) {
      const pv = B.pve;
      const k = Math.min(1, pv.evoFlashT / 1.6);
      const cx = W / 2, cy = H * 0.46;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.95);
      eg.addColorStop(0, 'rgba(255,250,235,' + (0.52 * k).toFixed(3) + ')');
      eg.addColorStop(0.3, 'rgba(255,220,140,' + (0.28 * k).toFixed(3) + ')');
      eg.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, W, H);

      /* 放射光带：从中心甩出去，随时间变长变淡 */
      ctx.translate(cx, cy);
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + t * 0.55;
        const r0 = Math.min(W, H) * (0.14 + 0.40 * (1 - k));
        const r1 = Math.max(W, H) * (0.5 + 0.55 * (1 - k));
        ctx.strokeStyle = 'rgba(255,236,180,' + (0.30 * k).toFixed(3) + ')';
        ctx.lineWidth = 1.5 + 6 * k;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();

      /* 文字：EVOLUTION / 武器 → 进化名 / 效果 */
      ctx.save();
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffcf6a';
      ctx.shadowBlur = 28 * k;
      ctx.fillStyle = 'rgba(255,248,224,' + (0.96 * k).toFixed(3) + ')';
      ctx.font = '900 30px "PingFang SC",sans-serif';
      ctx.fillText('E V O L U T I O N', cx, cy - 8);
      ctx.font = '900 19px "PingFang SC",sans-serif';
      ctx.fillStyle = 'rgba(255,214,120,' + (0.98 * k).toFixed(3) + ')';
      ctx.fillText(pv.evoFlashName || '', cx, cy + 24);
      if (pv.evoFlashDesc) {
        ctx.font = '700 12.5px "PingFang SC",sans-serif';
        ctx.fillStyle = 'rgba(255,240,208,' + (0.86 * k).toFixed(3) + ')';
        ctx.fillText(pv.evoFlashDesc, cx, cy + 46);
      }
      ctx.restore();
    }

    /* ---- 招架成功：全屏金色裁决 ---- */
    if (B.parryFlash > 0) {
      const k = Math.min(1, B.parryFlash / 1.6);
      const cx = B.parryX || W / 2;
      const cy = B.parryY || H / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.9);
      g.addColorStop(0, 'rgba(255,248,225,' + (0.55 * k) + ')');
      g.addColorStop(0.28, 'rgba(255,214,120,' + (0.28 * k) + ')');
      g.addColorStop(0.6, 'rgba(255,170,60,' + (0.1 * k) + ')');
      g.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      /* 贯穿全屏的十字光带 */
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * k) + ')';
      ctx.lineWidth = 2 + 4 * k;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.stroke();

      /* 四道斜向光刃 */
      ctx.strokeStyle = 'rgba(255,236,180,' + (0.5 * k) + ')';
      ctx.lineWidth = 1.6;
      const R = Math.max(W, H);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.08, cy + Math.sin(a) * R * 0.08);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }

      /* 屏幕边框脉冲 */
      ctx.strokeStyle = 'rgba(255,220,140,' + (0.6 * k) + ')';
      ctx.lineWidth = 6 * k;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.restore();
    }


    /* 时停 */
    if (B.timeStop) {
      const k = B.timeStop.t / B.timeStop.total;
      const own = B.timeStop.owner;
      const cyber = !!(own && own.char && own.char.id === 'shadow');
      const cx = own ? own.x : W / 2;
      const cy = own ? own.y : H / 2;
      ctx.save();
      ctx.fillStyle = cyber
        ? `rgba(26,2,14,${0.46 * Math.min(1, k * 3)})`
        : `rgba(30,18,50,${0.32 * Math.min(1, k * 3)})`;
      ctx.fillRect(0, 0, W, H);

      if (cyber) {
        /* 赛博时停：扫描线 + 断裂方框 + 数据环 */
        const fade = Math.min(1, k * 3);
        ctx.globalAlpha = 0.09 * fade;
        ctx.fillStyle = '#5cd0ff';
        for (let sy = (t * 70) % 7; sy < H; sy += 7) ctx.fillRect(0, sy, W, 1);
        ctx.globalAlpha = 1;

        /* 交错旋转定位框 */
        ctx.strokeStyle = `rgba(255,60,90,${0.5 * fade})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const s = 54 + i * 40 + Math.sin(t * 4 + i) * 8;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.PI / 4 + t * (i % 2 ? -0.5 : 0.6) * 0.4);
          ctx.strokeRect(-s, -s, s * 2, s * 2);
          ctx.restore();
        }
        /* 青色刻度环 */
        ctx.strokeStyle = `rgba(92,208,255,${0.62 * fade})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const r = 62 + i * 36 + Math.sin(t * 5 + i) * 6;
          ctx.globalAlpha = (0.42 - i * 0.1) * fade;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        /* 四角 HUD 括线 */
        ctx.globalAlpha = 0.55 * fade;
        ctx.strokeStyle = 'rgba(255,70,96,.85)';
        ctx.lineWidth = 2;
        const m = 26, L = 30;
        for (const [ax, ay, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
          ctx.beginPath();
          ctx.moveTo(ax + dx * L, ay); ctx.lineTo(ax, ay); ctx.lineTo(ax, ay + dy * L);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.font = '900 13px "Consolas","Courier New",monospace';
        ctx.fillStyle = 'rgba(92,208,255,.95)';
        ctx.textAlign = 'center';
        ctx.fillText('无间影狱 // SYSTEM HALT', cx, cy - 118);
        ctx.font = '700 11px "Consolas","Courier New",monospace';
        ctx.fillStyle = 'rgba(255,80,104,.9)';
        ctx.fillText('>> 瞬 · 暗 · 影 · 刃 · 狱 · 杀', cx, cy + 132);
      } else {
        /* 时间刻度环 */
        ctx.strokeStyle = 'rgba(255,225,150,.75)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const r = 60 + i * 34 + Math.sin(t * 5 + i) * 6;
          ctx.globalAlpha = 0.45 - i * 0.1;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.font = '900 13px "PingFang SC",sans-serif';
        ctx.fillStyle = 'rgba(255,230,170,.9)';
        ctx.textAlign = 'center';
        ctx.fillText('TIME STOP', cx, cy - 78);
      }
      ctx.restore();
    }

    /* 受击闪白 */
    if (B.hitFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = B.hitFlash * 0.3;
      ctx.fillStyle = `rgba(${B.flashColor},1)`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* 暗角 */
    ctx.save();
    const vg = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* 准备倒计时 */
    if (B.state === 'ready') {
      const n = Math.ceil(B.cd);
      const frac = B.cd - Math.floor(B.cd);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sc = 1 + (1 - frac) * 0.25;
      ctx.translate(W / 2, H * 0.44);
      ctx.scale(sc, sc);
      ctx.font = '900 64px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const txt = n > 0 ? String(n) : 'GO';
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = '#eaf6ff';
      ctx.shadowColor = '#5ac8ff';
      ctx.shadowBlur = 30;
      ctx.fillText(txt, 0, 0);
      ctx.restore();
    }

    /* 开场技能预告（PvE 不显示，怪是一群没法拼名字） */
    if (B.state === 'fight' && B.time < 2.4 && !B.pveOn) {
      const k = 1 - B.time / 2.4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.textAlign = 'center';
      ctx.font = '900 26px "PingFang SC",sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#5ac8ff';
      ctx.shadowBlur = 24;
      const nm = B.fighters.map(f => f.char.name).join('  VS  ');
      ctx.fillText(nm, W / 2, H * 0.2);
      ctx.restore();
    }

    /* 技能字幕（最上层） */
    if (B.cutinFx) this.drawCutin(ctx, B.cutinFx);
  };

  /* ============================ 技能字幕 ============================ */
  R.drawCutin = function (ctx, c) {
    const W = this.W, H = this.H;
    if (!c) return;
    /* PvE 里角色技能还在自动放，但字幕会盖住半个屏幕 */
    if (B.pveOn) return;

    const cfg = (SW.Data && SW.Data.fx) || {};
    const T = c.total, tt = c.t;
    const inT = cfg.cutinIn != null ? cfg.cutinIn : 0.2;
    const outT = cfg.cutinOut != null ? cfg.cutinOut : 0.3;
    const kIn = Math.min(1, tt / inT);
    const kOut = tt > T - outT ? Math.max(0, (T - tt) / outT) : 1;
    const eIn = 1 - Math.pow(1 - kIn, 3);
    const eOut = kOut * kOut;
    const alpha = Math.min(eIn, eOut);
    if (alpha <= 0) return;

    /* 入场从左侧滑入，退场向右滑出 */
    const sx = (1 - eIn) * (-W * 0.42) + (1 - eOut) * (W * 0.42);

    /* 位置：竞技场下方空隙内，绝不遮挡战场 */
    const fld = (B && B.field && B.field.h) ? B.field : { x: 0, y: 0, w: W, h: H };
    const gap = Math.max(20, H - (fld.y + fld.h));
    const want = cfg.cutinBandH != null ? cfg.cutinBandH : 0;
    const bh = U.clamp(want > 0 ? want : gap * 0.94, 20, Math.max(20, gap));
    const padB = Math.max(1, (gap - bh) * 0.5);
    const cy = H - padB - bh / 2;
    const y1 = cy - bh / 2, y2 = cy + bh / 2;
    const skew = bh * 0.3;
    const col = c.color || '#ffd166';

    const band = (off, pad) => {
      ctx.beginPath();
      ctx.moveTo(-W * 0.2 + off - skew - pad, y1 - pad * 0.35);
      ctx.lineTo(W * 1.2 + off - skew + pad, y1 - pad * 0.35);
      ctx.lineTo(W * 1.2 + off + skew + pad, y2 + pad * 0.35);
      ctx.lineTo(-W * 0.2 + off + skew - pad, y2 + pad * 0.35);
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 1.1);

    /* 底衬：暗色斜切光带 */
    ctx.save();
    band(sx, 0);
    const g = ctx.createLinearGradient(0, y1, 0, y2);
    g.addColorStop(0, 'rgba(3,7,16,0)');
    g.addColorStop(0.28, 'rgba(5,10,22,.9)');
    g.addColorStop(0.72, 'rgba(5,10,22,.9)');
    g.addColorStop(1, 'rgba(3,7,16,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    /* 上下边缘光 */
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    band(sx, 0);
    ctx.stroke();
    ctx.restore();

    /* 内侧细亮线 */
    ctx.save();
    ctx.globalAlpha *= 0.7;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    band(sx * 0.9, -3);
    ctx.stroke();
    ctx.restore();

    /* 带内内容：文字 + 流光 */
    ctx.save();
    band(sx, 0);
    ctx.clip();

    /* 掠过的高光 */
    const sweep = U.clamp((tt - inT) / Math.max(0.01, T - inT), 0, 1);
    const lx = -W * 0.35 + sweep * W * 1.7;
    const sg = ctx.createLinearGradient(lx - 90, 0, lx + 90, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,.16)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, y1, W, bh);

    /* 速度线 */
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = y1 + bh * (0.12 + i * 0.25);
      const len = W * (0.12 + (i % 3) * 0.06) * eIn;
      ctx.globalAlpha *= 0.72;
      ctx.beginPath();
      ctx.moveTo(sx + W * 0.06 + skew * 0.5, yy);
      ctx.lineTo(sx + W * 0.06 + skew * 0.5 + len, yy);
      ctx.stroke();
    }
    ctx.restore();

    /* 主文字 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = '6px'; } catch (e) { /* 旧浏览器忽略 */ }

    /* 字号按光带高度算，但竖屏高的手机上场地底下的空隙特别大，
       字会一路撑到画面外面去。按实际宽度压一道上限。 */
    let fs = Math.round(bh * (cfg.cutinScale != null ? cfg.cutinScale : 0.62));
    const maxTW = W * 0.84;
    ctx.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const tw = ctx.measureText(c.text).width;
    if (tw > maxTW) fs = Math.max(10, Math.floor(fs * maxTW / tw));
    ctx.save();
    ctx.translate(W / 2 + sx, cy + bh * 0.13);
    ctx.transform(1, 0, -0.13, 1, 0, 0);          /* 轻微斜体 */
    ctx.scale(1 + (1 - eIn) * 0.12, 1 + (1 - eIn) * 0.12);
    ctx.font = `900 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.lineWidth = Math.max(3, fs * 0.12);
    ctx.strokeStyle = 'rgba(2,6,14,.92)';
    ctx.strokeText(c.text, 0, 0);
    ctx.shadowColor = col;
    ctx.shadowBlur = Math.max(8, fs * 0.6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = col;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();

    /* 副标题：角色名 */
    if (c.sub) {
      const fs2 = Math.max(8, Math.round(fs * 0.36));
      ctx.save();
      ctx.translate(W / 2 + sx, Math.max(y1 + fs2 * 0.62, cy - bh * 0.4));
      ctx.globalAlpha *= 0.92;
      ctx.font = `900 ${fs2}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillStyle = 'rgba(230,242,255,.95)';
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fillText(c.sub, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
    ctx.restore();
  };

  SW.Render = R;
  R.drawSilhouette = drawSilhouette;
  R.drawAvatar = drawAvatar;
})(window.SW);
