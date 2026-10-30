/* 星之翼 · 球体竞技场 —— PvE 操控与 HUD */
(function () {
  'use strict';
  const SW = window.SW;
  const B = SW.Battle, D = SW.Data;
  const P = SW.PvE = {};

  const KEYS = {
    w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
    arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0],
  };
  const held = Object.create(null);
  let stick = null;
  let lastChar = null;
  let raf = 0;

  /* URL 参数：?t=<秒>&mobs=<场上上限>，默认 10 分钟
     ?t=180 试玩 / ?t=600 标准 / ?t=1800 完整，发不同链接用 */
  function qnum(name, def) {
    const m = location.search.match(new RegExp('[?&]' + name + '=(\\d+(?:\\.\\d+)?)'));
    return m ? parseFloat(m[1]) : def;
  }
  const SEC_PRESETS = [180, 600, 1800];
  const CFG = {
    sec: qnum('t', 600),
    limit: qnum('mobs', 0) || null,
  };
  /* 手动选的时长优先，其次 URL，最后默认 */
  let pickSec = 0;

  P.active = false;
  P.resultShown = false;

  const $ = id => document.getElementById(id);

  /* 首次说明卡：看过一次就不再弹（清缓存/换设备会重来，可接受） */
  const INTRO_KEY = 'sw_pve_intro_v1';
  function introSeen() {
    try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return true; }
  }
  /* 首局箭头指引：说明卡看完之后，再点一下摇杆和闪避键的位置。
     只有真的不知道该按哪的人才会卡在这里，所以只指两处，指完就永远不弹。 */
  const COACH_KEY = 'sw_pve_coach_v1';
  let coachAt = -1;
  let coachSteps = [];
  function coachClear() {
    document.querySelectorAll('.coach-focus').forEach(el => el.classList.remove('coach-focus'));
  }
  function coachStep() {
    const box = $('pveCoach'), txt = $('pcText');
    const bub = box && box.querySelector('.pc-bubble');
    coachAt++;
    coachClear();
    if (coachAt >= coachSteps.length) {
      if (box) box.classList.add('hidden');
      try { localStorage.setItem(COACH_KEY, '1'); } catch (_) {}
      if (B.pve) B.pve.paused = false;
      showTip('角色满级 ＋ 对应星导核心 ＝ 进化　·　点左下「图鉴」查看全部说明');
      return;
    }
    const st = coachSteps[coachAt];
    const a = st.anchor();
    if (txt) txt.textContent = st.text;
    if (box) box.classList.remove('hidden');
    if (bub) {
      bub.style.left = a.x + 'px';
      bub.style.top = (a.y - 8) + 'px';
    }
    if (st.focus) st.focus.classList.add('coach-focus');
    if (B.pve) B.pve.paused = true;
  }
  function coachStart() {
    try { if (localStorage.getItem(COACH_KEY) === '1') return; } catch (_) { return; }
    /* 开局第一波怪死得很快，升级卡经常比指引先弹出来。
       卡片在的时候先等着，等玩家选完再指，不然气泡被卡片压住。 */
    const up = $('pveUp');
    if (up && !up.classList.contains('hidden')) {
      setTimeout(coachStart, 500);
      return;
    }
    if (!P.active) return;
    /* 指引出来的时候顶部那条进化提示先收起来，两行字挤一起看不清 */
    hideTip();
    const db = $('pveDashBtn');
    /* 桌面端闪避键是 display:none，只有手机才指它 */
    const dashOn = !!(db && db.offsetParent !== null);
    coachSteps = [{
      text: '按住左下这块地方拖动，机体就跟着走',
      anchor: () => ({ x: Math.round(innerWidth * 0.26), y: Math.round(innerHeight * 0.60) }),
    }];
    if (dashOn) {
      coachSteps.push({
        text: '右下「闪」是冲刺。被围死的时候按它，那一下无敌',
        anchor: () => {
          const r = db.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top - 10) };
        },
        focus: db,
      });
    }
    coachAt = -1;
    coachStep();
  }

  /* ============================ 输入 ============================ */
  function readInput() {
    let x = 0, y = 0;
    for (const k in held) {
      if (!held[k] || !KEYS[k]) continue;
      x += KEYS[k][0];
      y += KEYS[k][1];
    }
    if (x || y) {
      const m = Math.hypot(x, y);
      return { x: x / m, y: y / m };
    }
    if (stick) {
      const d = Math.hypot(stick.dx, stick.dy);
      if (d > 10) {
        const k = Math.min(1, (d - 10) / 52);
        return { x: stick.dx / d * k, y: stick.dy / d * k };
      }
    }
    return { x: 0, y: 0 };
  }

  function bindInput() {
    window.addEventListener('keydown', e => {
      const k = String(e.key || '').toLowerCase();
      if (KEYS[k]) {
        held[k] = 1;
        if (P.active) e.preventDefault();
      }
      if (k === 'escape' && P.active) P.stop();
      if (k === 'p' && !e.repeat) {
        if (P.active) P.stop();
        else if (!B.pveOn && B.state === 'fight' && B.fighters.length === 2) P.fromVersus();
      }
      if (P.active && (k === ' ' || k === 'shift')) { e.preventDefault(); P.dash(); }
    });
    window.addEventListener('keyup', e => {
      const k = String(e.key || '').toLowerCase();
      if (KEYS[k]) held[k] = 0;
    });
    window.addEventListener('blur', () => { for (const k in held) held[k] = 0; });

    const cv = $('cv');
    if (!cv) return;
    const dot = $('pveStick');

    /* 独立闪避键：手机右下角那颗圆键。跟摇杆互不干扰，
       按下就算一次闪避，冷却没好的时候 P.dash 自己会拒掉 */
    const dbtn = $('pveDashBtn');
    if (dbtn) {
      dbtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!P.active) return;
        P.dash();
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
      });
    }

    cv.addEventListener('pointerdown', e => {
      if (!P.active) return;
      /* 双击 = 冲刺 */
      const now = performance.now();
      if (P.lastTap && now - P.lastTap < 280) { P.dash(); P.lastTap = 0; }
      else P.lastTap = now;
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      if (dot) {
        dot.classList.remove('hidden');
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
        dot.firstElementChild.style.transform = 'translate(-50%,-50%)';
      }
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', e => {
      if (!stick || e.pointerId !== stick.id) return;
      stick.dx = e.clientX - stick.ox;
      stick.dy = e.clientY - stick.oy;
      if (dot) {
        const d = Math.hypot(stick.dx, stick.dy) || 0;
        const k = Math.min(1, d / 62);
        const ax = d > 1 ? stick.dx / d * k * 26 : 0;
        const ay = d > 1 ? stick.dy / d * k * 26 : 0;
        dot.firstElementChild.style.transform =
          `translate(calc(-50% + ${ax}px), calc(-50% + ${ay}px))`;
      }
    });
    const release = e => {
      if (!stick || (e && e.pointerId !== stick.id)) return;
      stick = null;
      if (dot) dot.classList.add('hidden');
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('pointerleave', release);
  }

  /* ============================ 冲刺 ============================ */
  P.dash = function () {
    const pv = B.pve;
    if (!pv || !pv.player || pv.player.dead || pv.paused) return;
    if (pv.dashCd > 0) return;
    const inp = readInput();
    let dx = inp.x, dy = inp.y;
    if (Math.hypot(dx, dy) < 0.1) { dx = pv.player.facing || 1; dy = 0; }
    const m = Math.hypot(dx, dy) || 1;
    pv.dashT = pv.dashDur;
    pv.dashCd = pv.dashCdMax;
    pv.dashHit = null;              /* 进化·村好刀：每次闪避重新记「撞过谁」 */
    pv.dashVX = dx / m * pv.player.speedBase * 4.4;
    pv.dashVY = dy / m * pv.player.speedBase * 4.4;
    if (SW.Audio) SW.Audio.ui();
  };

  /* ============================ 升级三选一（VS 竖版卡片） ============================ */
  let upOpen = false;
  const ICON = { hp: '命', heal: '鸡' };

  /* 数字格式：整数不显示小数点，其它保一位 */
  function nf(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    const p = Math.pow(10, dec || 0);
    const r = Math.round(v * p) / p;
    return String(r);
  }
  function sgn(v) { return (v > 0 ? '+' : '') + v; }

  /* 武器这张卡到底变了什么：把「买完之后的真实数值」摆出来，
     不能只写「数值强化」——玩家要判断这一张值不值。 */
  function weaponDelta(wid, lv) {
    const a = B.weaponStatsAt(wid, lv), b = B.weaponStatsAt(wid, lv + 1);
    if (!a || !b) return '';
    const keys = [
      ['伤害', 'dmg', 0], ['冷却', 'cd', 2], ['范围', 'reach', 0],
      ['半径', 'r', 0], ['爆炸', 'boom', 0], ['火海', 'zdps', 0],
      ['数量', 'n', 0], ['持续', 'dur', 2], ['弹速', 'speed', 0], ['转速', 'spin', 2],
    ];
    const out = [];
    for (const [label, k, dec] of keys) {
      if (a[k] == null || b[k] == null) continue;
      const x = a[k], y = b[k];
      if (Math.abs(y - x) < (dec ? 0.005 : 0.4)) continue;
      out.push(label + ' ' + nf(x, dec) + '→' + nf(y, dec) + (k === 'cd' ? 's' : ''));
      if (out.length >= 3) break;
    }
    return out.join('　');
  }

  /* 配件每级成长（移速 +20% → +30% 这种；第一次拿就只写结果值） */
  function passiveDelta(id, lv) {
    const per = (B.passivePer || {})[id];
    if (!per) return '';
    const a = lv * per.step, b = (lv + 1) * per.step;
    if (lv <= 0) return per.label + ' ' + sgn(b) + per.unit;
    return per.label + ' ' + sgn(a) + per.unit + ' → ' + sgn(b) + per.unit;
  }
  function passiveAt(id, lv) {
    const per = (B.passivePer || {})[id];
    if (!per) return '—';
    return per.label + ' ' + sgn(lv * per.step) + per.unit;
  }
  /* 只留数值部分（"移速 +10%" → "+10%"），图鉴里和「每级 / 满级」拼成横排标签 */
  function passiveNum(id, lv) {
    const t = passiveAt(id, lv), i = t.indexOf(' ');
    return i >= 0 ? t.slice(i + 1) : t;
  }

  function renderUp() {
    const pv = B.pve;
    const box = $('pveUp'), list = $('pveUpList'), lv = $('pveUpLvl');
    if (!box || !list || !pv) return;
    const opts = B.pveRoll(3);
    if (!opts.length) {
      pv.pendingUp = 0;
      pv.paused = false;
      box.classList.add('hidden');
      upOpen = false;
      return;
    }
    if (lv) lv.textContent = pv.lvl;
    list.innerHTML = '';
    /* 卡不满三张时按实际数量均分，避免右侧留空档 */
    list.style.gridTemplateColumns = 'repeat(' + opts.length + ',minmax(0,1fr))';
    for (const u of opts) {
      const cur = u.cur != null ? u.cur : (pv.upLvl[u.id] || 0);
      const kind = u.weapon ? '角色' : (u.passive ? '星导核心' : '补给');
      const isNew = cur === 0 && !!u.weapon;
      const d = document.createElement('button');
      d.className = 'pve-card'
        + (u.weapon ? ' pve-card-w' : '')
        + (u.passive ? ' pve-card-p' : '')
        + (isNew ? ' is-new' : '');
      let pips = '';
      if (u.max <= 8) for (let i = 0; i < u.max; i++) pips += '<i class="' + (i < cur ? 'on' : '') + '"></i>';

      /* 卡面必须讲清楚「这一张买到什么」：数值差 + 那一级的特殊效果 */
      let desc = u.desc || '', delta = '';
      if (u.weapon) {
        const W = (B.weaponDefs || {})[u.weapon] || {};
        const notes = (B.weaponNotes || {})[u.weapon] || [];
        if (isNew) {
          const s = B.weaponStatsAt(u.weapon, 1) || {};
          desc = W.desc || '';
          delta = 'Lv1　' + [
            s.dmg != null ? '伤害 ' + nf(s.dmg) : '',
            s.cd != null ? '冷却 ' + nf(s.cd, 2) + 's' : '',
            s.r != null ? '半径 ' + nf(s.r) : '',
          ].filter(Boolean).join('　');
        } else {
          desc = notes[cur] || W.desc || '';
          delta = weaponDelta(u.weapon, cur) || ('升到 Lv' + (cur + 1));
        }
      } else if (u.passive) {
        const P = (B.passiveDefs || {})[u.passive] || {};
        desc = u.desc || P.desc || '';
        delta = passiveDelta(u.passive, cur);
      }

      d.innerHTML = '<span class="pc-kind">' + kind + '</span>'
        + '<span class="pc-ico">' + (u.ico || ICON[u.id] || '?') + '</span>'
        + '<span class="pc-name">' + u.name + '</span>'
        + '<span class="pc-desc">' + desc + '</span>'
        + (delta ? '<span class="pc-delta">' + delta + '</span>' : '')
        + '<span class="pc-pips">' + pips + '</span>'
        + '<span class="pc-lv">' + (isNew ? 'NEW' : 'Lv ' + cur + ' / ' + u.max) + '</span>';
      d.addEventListener('click', () => {
        B.pvePick(u.id);
        box.classList.add('hidden');
        upOpen = false;
        if (SW.Audio) SW.Audio.ui();
      });
      list.appendChild(d);
    }
    box.classList.remove('hidden');
  }

  function checkUp() {
    const pv = B.pve;
    if (!pv) return;
    const box = $('pveUp');
    if (pv.bookPaused) {          /* 图鉴开着，先不弹升级卡 */
      if (upOpen && box) { box.classList.add('hidden'); upOpen = false; }
      return;
    }
    if (!pv.paused) {
      if (upOpen) {
        if (box) box.classList.add('hidden');
        upOpen = false;
      }
      return;
    }
    if (upOpen) return;
    upOpen = true;
    renderUp();
  }

  /* ============================ 获得列表（角色 / 星导核心） ============================ */
  let buildSig = '';
  let dashPct = -1;
  function renderBuild() {
    const pv = B.pve, box = $('pveBuild');
    if (!box || !pv) return;
    const WD = B.weaponDefs || {}, PD = B.passiveDefs || {};
    const chars = [];
    for (const id of (pv.weaponOrder || [])) {
      const st = pv.weapons[id];
      if (st && st.lvl > 0) chars.push(id);
    }
    const pass = [];
    for (const id in PD) if ((pv.passives || {})[id] > 0) pass.push(id);

    /* 只在持有情况变化时重建 DOM，避免每帧刷 */
    let sig = '';
    for (const id of chars) {
      sig += id + ':' + pv.weapons[id].lvl + ((pv.evolved || {})[id] ? 'E' : '') + ',';
    }
    sig += '|';
    for (const id of pass) sig += id + ':' + pv.passives[id] + ',';
    if (sig === buildSig) return;
    buildSig = sig;

    const EI = B.evoInfo || {};
    let html = '';
    /* 角色专属被动：本局一直在生效，跟着列表一起展示 */
    const cp = (B.charPassives || {})[pv.player.char.id];
    if (cp) html += '<div class="pb-pass">被动 · ' + cp.name + ' —— ' + cp.desc + '</div>';
    if (chars.length) {
      html += '<div class="pb-h">角色</div>';
      for (const id of chars) {
        const W = WD[id] || {};
        const c = D.get(id);
        const av = c && c.avatar;
        const evo = !!(pv.evolved || {})[id];
        const info = EI[id];
        html += '<div class="pb-row' + (evo ? ' evolved' : '') + '">'
          + '<i class="pb-av"' + (av ? ' style="background-image:url(\'' + av + '\')"' : '') + '>'
          + (av ? '' : (W.ico || '?')) + '</i>'
          + '<div class="pb-b">'
          + '<span class="pb-n">' + (W.name || id)
          + (evo ? '<em class="pb-evo">进化</em>' : '')
          + '<b>Lv' + pv.weapons[id].lvl + '/' + (W.max || 5) + '</b></span>'
          + '<span class="pb-d">' + (evo && info ? '进化 · ' + info.short : (W.desc || '')) + '</span>'
          + '</div></div>';
      }
    }
    if (pass.length) {
      html += '<div class="pb-h">星导核心</div>';
      for (const id of pass) {
        const P = PD[id];
        html += '<div class="pb-row">'
          + '<i class="pb-av pb-ico">' + (P.ico || '核') + '</i>'
          + '<div class="pb-b">'
          + '<span class="pb-n">' + P.name + '<b>Lv' + pv.passives[id] + '/' + (P.max || 5) + '</b></span>'
          + '<span class="pb-d">' + (P.desc || '') + '</span>'
          + '</div></div>';
      }
    }
    box.innerHTML = html;
    /* 条目多时收起介绍行，保证一屏放得下 */
    box.classList.toggle('pb-tight', chars.length + pass.length > 9);
    /* 面板高度会随装备数变化（两行 / 三行）。把它写进 CSS 变量，
       退出、图鉴、闪避键就永远踩在面板正上方，不用猜一个固定值。
       桌面端面板在左侧竖排，不吃这块地，不用写。 */
    if (window.innerWidth <= 700) {
      document.documentElement.style.setProperty('--pvb', box.offsetHeight + 'px');
    }
  }

  /* ============================ 提示条 ============================ */
  let tipTimer = 0;
  function showTip(text, ms) {
    const el = $('pveTip');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => el.classList.add('hidden'), ms || 7000);
  }
  function hideTip() {
    const el = $('pveTip');
    clearTimeout(tipTimer);
    if (el) el.classList.add('hidden');
  }

  /* ============================ 图鉴 ============================ */
  /* 图鉴 = 实拍截图 + 短句。
     截图是 tools/codex_shot.js 跑真实对局抓的（assets/codex/*.png），
     文案只写「这一招怎么用、多少伤害、有什么条件」，不写形容词。 */
  let codexTab = 'evo';
  let evoBookBuilt = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function avHtml(charId, size) {
    const c = charId ? D.get(charId) : null;
    const av = c && c.avatar;
    const cls = 'cdx-av' + (size === 'lg' ? ' lg' : '');
    if (av) return '<i class="' + cls + '" style="background-image:url(\'' + av + '\')"></i>';
    return '<i class="' + cls + ' cdx-ico">' + esc((c && c.short ? c.short[0] : '?')) + '</i>';
  }

  /* 实拍截图：文件在 assets/codex/ */
  function shot(name, cls) {
    return '<img class="cdx-shot' + (cls ? ' ' + cls : '') + '" src="assets/codex/'
      + name + '.png" alt="" loading="lazy" decoding="async">';
  }

  /* 一件武器「满级 vs 1 级」的真实数值差（配件乘算算在内，每局显示略有不同） */
  const NUM_KEYS = [
    ['伤害', 'dmg', 0], ['冷却', 'cd', 2], ['范围', 'reach', 0], ['半径', 'r', 0],
    ['爆炸', 'boom', 0], ['火海', 'zdps', 0], ['数量', 'n', 0], ['持续', 'dur', 1],
    ['弹速', 'speed', 0], ['转速', 'spin', 2],
  ];
  function weaponNumChips(wid) {
    const W = (B.weaponDefs || {})[wid] || {};
    const max = W.max || 5;
    const a = B.weaponStatsAt(wid, 1), b = B.weaponStatsAt(wid, max);
    if (!a || !b) return [];
    const out = [];
    for (const [label, k, dec] of NUM_KEYS) {
      if (a[k] == null || b[k] == null) continue;
      if (Math.abs(b[k] - a[k]) < (dec ? 0.02 : 0.5)) continue;
      out.push(label + ' ' + nf(a[k], dec) + '→' + nf(b[k], dec)
        + (k === 'cd' || k === 'dur' ? 's' : ''));
      if (out.length >= 4) break;
    }
    return out;
  }
  /* 只列有实际变化的等级（Lv2~Lv5 里写了文案的那些） */
  function weaponStepChips(wid) {
    const notes = (B.weaponNotes || {})[wid] || [];
    const W = (B.weaponDefs || {})[wid] || {};
    const max = W.max || 5;
    const out = [];
    for (let lv = 1; lv < max; lv++) {
      const t = notes[lv];
      if (t) out.push('Lv' + (lv + 1) + ' ' + t);
    }
    return out;
  }

  /* 横排小标签：图鉴里的数值与成长都走这个，别再把字竖着堆成一条 */
  function chipRow(items, cls) {
    if (!items || !items.length) return '';
    return '<div class="cdx-chips">'
      + items.map(t => '<span class="cdx-chip' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>').join('')
      + '</div>';
  }

  /* 敌人立绘：兵种自己的那张（k.art）盖在共用立绘上。
     八张表情包一人一张脸，没有 art 的兵种才落回 vamp_ready。 */
  function mobArt(k, id) {
    const base = k.sprite || 'assets/vamp_ready.webp';
    const art = k.art || '';
    /* 底色跟着兵种色走，和图鉴里那一列的文字色对得上 */
    const tint = (k.color || '#5a7ba6') + '55';
    const under = art ? '' : ('<b style="background-image:url(\'' + base + '\')"></b>');
    return '<div class="cdx-art" style="background:radial-gradient(circle at 50% 70%,'
      + tint + ',rgba(6,12,22,.94) 74%)">'
      + under
      + (art ? '<i style="background-image:url(\'' + art + '\')"></i>' : '')
      + '</div>';
  }

  function table(head, rows, cls, widths) {
    return '<table class="cdx-tb ' + (cls || '') + '"><thead><tr>'
      + head.map((x, i) => '<th' + (widths && widths[i] ? ' style="width:' + widths[i] + '"' : '') + '>'
        + x + '</th>').join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderCodex() {
    const box = $('evoList');
    if (!box) return;
    const WD = B.weaponDefs || {}, PD = B.passiveDefs || {}, EI = B.evoInfo || {};
    const pv = B.pve;
    let html = '';

    /* ---------------- 进化 ---------------- */
    if (codexTab === 'evo') {
      const doneN = pv ? Object.keys(pv.evolved || {}).length : 0;
      const totalN = Object.keys(EI).length;
      html += '<p class="cdx-lead">角色练到 <b>5 级</b>，手里又有它那件星导核心（<b>1 级就够</b>），就会自己进化，'
        + '不用点按钮。这局已经进化 <b>' + doneN + '/' + totalN + '</b>。</p>';
      let rows = '';
      for (const wid in EI) {
        const info = EI[wid];
        const W = WD[wid] || {}, P = PD[info.need] || {};
        const lv = pv && pv.weapons[wid] ? pv.weapons[wid].lvl : 0;
        const pl = pv && pv.passives ? (pv.passives[info.need] || 0) : 0;
        const done = !!(pv && pv.evolved && pv.evolved[wid]);
        rows += '<tr class="' + (done ? 'done' : '') + '">'
          + '<td>' + shot('e_' + wid) + '</td>'
          + '<td class="cdx-name">'
          + '<span class="cdx-h">' + esc(W.name || wid)
          + '<i class="cdx-tag">' + esc(info.name || '进化') + '</i>'
          + (done ? '<i class="cdx-tag done">已进化</i>' : '') + '</span>'
          + '<span class="cdx-need' + (lv >= (W.max || 5) ? ' ok' : '') + '">'
          + esc(W.name || wid) + ' Lv' + (lv >= (W.max || 5) ? '满' : lv + '/' + (W.max || 5))
          + '</span>'
          + '<span class="cdx-need' + (pl > 0 ? ' ok' : '') + '">'
          + esc(P.name || info.need) + (pl > 0 ? ' Lv' + pl : ' 未持有') + '</span>'
          + '</td>'
          + '<td class="cdx-fx">' + esc(info.short || '') + '</td>'
          + '</tr>';
      }
      html += table(['实机画面', '进化 · 需求', '效果'], rows, 'cdx-evo', ['104px', '116px', '']);
    }

    /* ---------------- 角色技能 ---------------- */
    if (codexTab === 'weapon') {
      html += '<p class="cdx-lead">开局自带你选的那台，其余在升级卡里抽，最多同时带 6 把。'
        + '左边是<b>实机画面</b>，下面写的是机制，以及满级比 1 级多出多少。</p>';
      let rows = '';
      for (const wid in WD) {
        const W = WD[wid];
        const st = pv && pv.weapons[wid];
        const lv = st ? st.lvl : 0;
        const cp = (B.charPassives || {})[wid];
        rows += '<tr>'
          + '<td>' + shot('w_' + wid) + '</td>'
          + '<td class="cdx-main">'
          + '<div class="cdx-head"><b class="cdx-ttl">' + esc(W.name) + '</b>'
          + '<i class="cdx-lv">Lv' + lv + '/' + (W.max || 5) + '</i>'
          + (cp ? '<i class="cdx-tag soft">被动 · ' + esc(cp.name) + '</i>' : '')
          + '</div>'
          + '<div class="cdx-desc">' + esc(W.desc) + '</div>'
          + chipRow(weaponNumChips(wid))
          + chipRow(weaponStepChips(wid), 'lv')
          + '</td>'
          + '</tr>';
      }
      html += table(['实机画面', '角色 · 技能 · 成长'], rows, 'cdx-weapon', ['96px', '']);
    }

    /* ---------------- 星导核心 ---------------- */
    if (codexTab === 'passive') {
      html += '<p class="cdx-lead"><b>星导核心</b>是升级卡里抽到的配件，跟「觉醒」那个状态不是一回事。'
        + '加成算全队，同时也是进化的钥匙：每个角色只认自己那一件。</p>';
      let rows = '';
      for (const pid in PD) {
        const P = PD[pid];
        const owner = P.owner;
        const lv = pv && pv.passives ? (pv.passives[pid] || 0) : 0;
        const W = WD[owner] || {};
        const wl = pv && pv.weapons[owner] ? pv.weapons[owner].lvl : 0;
        rows += '<tr>'
          + '<td><i class="cdx-core">' + esc(P.ico || '核') + '</i></td>'
          + '<td class="cdx-main">'
          + '<div class="cdx-head"><b class="cdx-ttl">' + esc(P.name) + '</b>'
          + '<i class="cdx-lv">Lv' + lv + '/' + (P.max || 5) + '</i>'
          + '<i class="cdx-tag soft">' + esc(W.name || owner) + ' ' + wl + '/' + (W.max || 5) + '</i>'
          + '</div>'
          + '<div class="cdx-desc">' + esc(P.desc) + '</div>'
          + chipRow(['每级 ' + passiveNum(pid, 1), '满级 ' + passiveNum(pid, (P.max || 5))])
          + chipRow(['解锁 ' + (P.evo || '进化')], 'unlock')
          + '</td>'
          + '</tr>';
      }
      html += table(['核心', '名称 · 效果 · 成长'], rows, 'cdx-passive', ['44px', '']);
    }

    /* ---------------- 敌人 ---------------- */
    if (codexTab === 'mob') {
      html += '<p class="cdx-lead">数值是 1 倍血量时的底子，之后每 30 秒再涨 4.5%。'
        + '打之前先记住：<b>谁跑得快、谁在远处放东西、谁必须先拆</b>。</p>';
      const MK = B.mobKinds || {}, TIP = B.mobTips || {};
      let rows = '';
      for (const id in MK) {
        const k = MK[id];
        rows += '<tr>'
          + '<td>' + mobArt(k, id) + '</td>'
          + '<td class="cdx-main">'
          + '<div class="cdx-head"><b class="cdx-ttl" style="color:' + (k.color || '#eaf4ff') + '">'
          + esc(k.name) + '</b>'
          + (k.elite ? '<i class="cdx-tag boss">BOSS</i>' : '')
          + (k.maxAlive ? '<i class="cdx-tag soft">同屏 ' + k.maxAlive + ' 只</i>' : '')
          + '</div>'
          + chipRow(['血 ' + k.hp, '速 ' + k.speed, '伤 ' + k.dmg], 'stat')
          + '<div class="cdx-desc">' + esc(TIP[id] || '') + '</div>'
          + '</td>'
          + '</tr>';
      }
      html += table(['立绘', '敌人 · 数值 · 打法'], rows, 'cdx-mob', ['96px', '']);
    }

    box.innerHTML = html;
    evoBookBuilt = true;
    const tabs = $('codexTabs');
    if (tabs) {
      tabs.querySelectorAll('.codex-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === codexTab);
      });
    }
  }
  const renderEvoBook = renderCodex;

  function toggleEvoBook(force) {
    const box = $('evoBook');
    if (!box) return;
    const open = force != null ? force : box.classList.contains('hidden');
    const pv = B.pve;
    if (open) {
      renderEvoBook();
      box.classList.remove('hidden');
      /* 看图鉴时把战斗按住，别让玩家一边读一边被咬死 */
      if (pv && !pv.paused) { pv.paused = true; pv.bookPaused = true; }
    } else {
      box.classList.add('hidden');
      if (pv && pv.bookPaused) {
        pv.bookPaused = false;
        if (pv.pendingUp <= 0) pv.paused = false;
      }
    }
  }
  P.evoBook = toggleEvoBook;

  /* ============================ HUD ============================ */
  function fmtTime(v) {
    const t = Math.max(0, Math.ceil(v));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function updateHud() {
    const pv = B.pve;
    if (!pv) return;
    const p = pv.player;
    const tEl = $('pveTime'), kEl = $('pveKills');
    if (tEl) tEl.textContent = fmtTime(pv.left);
    if (kEl) kEl.textContent = pv.kills;
    const bar = $('pveHpBar'), txt = $('pveHpTxt');
    const k = Math.max(0, Math.min(1, p.hp / p.maxHp));
    if (bar) {
      bar.style.width = (k * 100).toFixed(1) + '%';
      bar.classList.toggle('low', k <= 0.3);
    }
    if (txt) txt.textContent = Math.max(0, Math.ceil(p.hp));
    const dash = $('pveDash');
    if (dash) dash.classList.toggle('cd', pv.dashCd > 0);
    /* 闪避键外圈：冷却走完一圈才回满，别让玩家猜还能不能按 */
    const dbtn = $('pveDashBtn');
    if (dbtn) {
      const pct = pv.dashCdMax > 0
        ? Math.max(0, Math.min(1, 1 - pv.dashCd / pv.dashCdMax)) : 1;
      if (Math.abs(pct - dashPct) > 0.02 || (pct === 1 && dashPct !== 1)) {
        dashPct = pct;
        dbtn.style.setProperty('--cd', pct.toFixed(3));
      }
      dbtn.classList.toggle('cd', pv.dashCd > 0);
    }
    const lvEl = $('pveLvl'), xpEl = $('pveXpBar');
    if (lvEl) lvEl.textContent = 'Lv.' + pv.lvl;
    if (xpEl) xpEl.style.width = Math.min(100, pv.xp / pv.xpNeed * 100).toFixed(1) + '%';
    /* 三段觉醒条：1/3、2/3 各是一个升级点，第三格填满才开觉醒 */
    const segEl = $('pveSegTxt');
    if (segEl) {
      const ready = (pv.awkN || 0) > 0;
      segEl.textContent = ready ? '觉醒!' : (Math.min(3, (pv.seg || 0) + 1)) + '/3';
      segEl.classList.toggle('ready', ready || pv.seg === 2);
    }

    /* 觉醒条：三段攒满一条才进觉醒，这里显示剩余时间 */
    const awEl = $('pveAwBar'), awRow = $('pveAwRow'), awTxt = $('pveAwTxt');
    const onAw = (pv.awakenT || 0) > 0;
    if (awEl) {
      const k = onAw ? Math.max(0, pv.awakenT / (pv.awakenDur || 2.2)) : 0;
      awEl.style.width = (k * 100).toFixed(1) + '%';
    }
    if (awRow) awRow.classList.toggle('on', onAw);
    if (awTxt) awTxt.textContent = onAw ? pv.awakenT.toFixed(1) + 's'
      : ((pv.awkN || 0) > 0 ? '待放' : '待命');

    /* 莱茵：进化条 */
    const evRow = $('pveEvoRow');
    if (evRow) {
      const ev = pv.evo;
      evRow.classList.toggle('hidden', !ev);
      if (ev) {
        const evBar = $('pveEvoBar'), evTxt = $('pveEvoTxt');
        if (evBar) evBar.style.width = Math.min(100, ev.p / ev.need * 100).toFixed(1) + '%';
        if (evTxt) evTxt.textContent = ev.lv + '/' + (B.rhineEvo ? B.rhineEvo.length : 7);
      }
    }

    renderBuild();

    /* 进化按钮：有「满级 + 已持有对应觉醒」时点亮，提醒可以进化了 */
    const evoBtn = $('pveEvoBtn');
    if (evoBtn) {
      const EI = B.evoInfo || {}, WD = B.weaponDefs || {};
      let can = false;
      for (const wid in EI) {
        if ((pv.evolved || {})[wid]) { can = true; break; }
        const W = WD[wid], st = pv.weapons[wid];
        if (W && st && st.lvl >= (W.max || 5) && (pv.passives[EI[wid].need] || 0) > 0) {
          can = true; break;
        }
      }
      evoBtn.classList.toggle('has', can);
    }

    if (B.state === 'over' && !P.resultShown) {
      P.resultShown = true;
      showResult();
    }
  }

  const LEN_NAME = { 180: '3 分钟试玩', 600: '10 分钟标准', 1800: '30 分钟完整' };
  let lastRun = null;

  function showResult() {
    const pv = B.pve;
    if (!pv) return;
    hideTip();
    const p = pv.player;
    const win = B.winner === 0;
    const sec = Math.max(0, Math.round(win ? pv.total : pv.total - pv.left));
    const lenTag = LEN_NAME[Math.round(pv.total)] || (Math.round(pv.total / 60) + ' 分钟');

    /* 结算积分：按存活时间给钱，撑得越久越多。死了也有，不然没人愿意重开。 */
    const min = Math.floor(sec / 60);
    const timePt = min * 45;
    const killPt = Math.floor(pv.kills * 0.4);
    const clearPt = win ? 300 : 0;
    const gain = timePt + killPt + clearPt;
    D.wallet += gain;
    D.save();
    try { SW.UI.syncWallet(); } catch (_) {}

    const tEl = $('pveResultTitle'), bEl = $('pveResultBody');
    if (tEl) tEl.textContent = win ? '撑住了' : '被吞没';
    if (bEl) {
      bEl.innerHTML = '<span class="pve-lentag">' + lenTag + '局</span>'
        + '<span class="pve-line">击杀 <b>' + pv.kills + '</b>　存活 <b>' + mmss(sec) + '</b></span>'
        + '<span class="pve-line">剩余血量 <b>' + Math.max(0, Math.ceil(p.hp)) + '</b></span>'
        + '<span class="pve-money">+<b>' + gain + '</b> 积分</span>'
        + '<span class="pve-break">存活 ' + min + ' 分钟 ×45 = ' + timePt
        + '　击杀 ' + pv.kills + ' ×0.4 = ' + killPt
        + (clearPt ? '　通关 +' + clearPt : '')
        + '<br>当前积分 ' + D.wallet + '</span>';
    }

    /* 记下这一局，晒战绩和复制文案都从这里取 */
    lastRun = {
      name: (p.char && (p.char.short || p.char.name)) || '机体',
      charId: p.char && p.char.id,
      sec: sec, kills: pv.kills, gain: gain,
      hp: Math.max(0, Math.ceil(p.hp)),
      total: Math.round(pv.total), win: win, lenTag: lenTag,
    };

    const box = $('pveResult');
    if (box) box.classList.remove('hidden');
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const sw = $('pveSwitch');
    if (sw) {
      sw.textContent = P.active ? '1v1' : '幸存者';
      sw.classList.toggle('on', !!P.active);
    }
    if (!P.active) return;
    if (B.pveOn && B.pve) {
      B.pve.input = readInput();
      updateHud();
      checkUp();
    }
  }

  /* ============================ 晒战绩 ============================ */
  const GAME_TITLE = '星之翼 · 小修女幸存者';

  function playUrl() {
    /* 分享出去的链接固定带标准时长，别人点进来是同一套规则 */
    const base = location.origin + location.pathname;
    return base + '?t=600';
  }
  function mmss(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* 1080×1440，竖屏，发群和发评论都清楚 */
  function buildShareCanvas(run) {
    const W = 1080, H = 1440;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const F = '"PingFang SC","Microsoft YaHei",sans-serif';

    /* 底：中间偏上打一圈冷光，别做成纯黑海报 */
    const rg = g.createRadialGradient(W * 0.5, H * 0.34, 40, W * 0.5, H * 0.46, W * 0.92);
    rg.addColorStop(0, '#1d3a63');
    rg.addColorStop(0.55, '#0b1526');
    rg.addColorStop(1, '#04060d');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);

    /* 顶部标题 */
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#5ac8ff';
    g.font = '700 34px ' + F;
    g.fillText('STARWARD · 同人游戏', W / 2, 108);
    g.fillStyle = '#eaf6ff';
    g.font = '900 62px ' + F;
    g.fillText(GAME_TITLE, W / 2, 186);

    /* 角色图：有些角色只有 .jpg 头像（不透明，白底），直接贴上去会是一块白方块。
       所以统一做成圆角卡片：底、图、描边三层，透明立绘也照样好看。 */
    const CARD = 430, CARD_X = (W - CARD) / 2, CARD_Y = 236;
    let heroDrawn = false;
    const ch = run.charId ? D.get(run.charId) : null;
    let img = null;
    if (ch && SW.Assets) {
      /* 有战斗中表情就优先用那张，通常带透明底 */
      const face = ch.faces && (ch.faces.ready || ch.faces.idle);
      img = SW.Assets.get(face || ch.avatar);
    }
    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    if (img) {
      g.save();
      roundRect(CARD_X, CARD_Y, CARD, CARD, 44);
      g.clip();
      const bg = g.createLinearGradient(CARD_X, CARD_Y, CARD_X, CARD_Y + CARD);
      bg.addColorStop(0, 'rgba(38,74,124,.85)');
      bg.addColorStop(1, 'rgba(12,22,40,.9)');
      g.fillStyle = bg;
      g.fillRect(CARD_X, CARD_Y, CARD, CARD);
      /* cover 填充，别把角色拉变形 */
      const k = Math.max(CARD / img.naturalWidth, CARD / img.naturalHeight);
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      g.drawImage(img, CARD_X + (CARD - dw) / 2, CARD_Y + (CARD - dh) / 2, dw, dh);
      g.restore();

      roundRect(CARD_X, CARD_Y, CARD, CARD, 44);
      g.strokeStyle = 'rgba(120,200,255,.55)';
      g.lineWidth = 4;
      g.stroke();
      heroDrawn = true;
    }
    /* 角色名压在卡片下沿，省得读者认不出来 */
    if (heroDrawn && run.name) {
      g.fillStyle = '#cfe6ff';
      g.font = '800 40px ' + F;
      g.fillText(run.name, W / 2, CARD_Y + CARD + 62);
    }
    const heroBottom = heroDrawn
      ? (run.name ? CARD_Y + CARD + 62 : CARD_Y + CARD)
      : 420;

    /* 主数字：存活时间 */
    g.fillStyle = '#ffffff';
    g.font = '900 158px ' + F;
    g.fillText(mmss(run.sec), W / 2, heroBottom + 148);
    g.fillStyle = '#7fb6dd';
    g.font = '600 32px ' + F;
    g.fillText('存 活 时 间', W / 2, heroBottom + 202);

    /* 三格数据 */
    const rowY = heroBottom + 292;
    const cells = [
      ['击杀', String(run.kills)],
      ['得分', '+' + run.gain],
      ['剩余', String(run.hp)],
    ];
    cells.forEach((it, i) => {
      const cx = W * (0.22 + i * 0.28);
      g.fillStyle = '#9fe8ff';
      g.font = '900 62px ' + F;
      g.fillText(it[1], cx, rowY);
      g.fillStyle = '#5f7d9b';
      g.font = '600 28px ' + F;
      g.fillText(it[0], cx, rowY + 42);
    });

    /* 分隔线 + 局时长 + 结果 */
    g.strokeStyle = 'rgba(90,170,255,.28)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W * 0.16, rowY + 96);
    g.lineTo(W * 0.84, rowY + 96);
    g.stroke();

    g.fillStyle = run.win ? '#7fe6a8' : '#c8d8e8';
    g.font = '800 36px ' + F;
    g.fillText((run.win ? '撑住了' : '被吞没') + '　·　' + run.lenTag + '局', W / 2, rowY + 158);

    /* 底部：项目名、同人声明、AI 声明、B站号、署名 */
    g.fillStyle = '#8fc6f0';
    g.font = '800 30px ' + F;
    g.fillText('星之翼小修女单排幸存者', W / 2, H - 210);
    g.fillStyle = '#8fa8c4';
    g.font = '600 24px ' + F;
    g.fillText('本游戏为同人制作，免费游玩', W / 2, H - 172);
    g.fillStyle = '#6f88a6';
    g.fillText('全程 DeepSeek 驱动，有任何问题欢迎提出', W / 2, H - 134);
    g.fillStyle = '#6fa9d8';
    g.fillText('B站 @电子小修女', W / 2, H - 96);
    g.fillStyle = '#4f6a86';
    g.font = '600 22px ' + F;
    g.fillText('神秘团长制作 · 小修女代发', W / 2, H - 58);

    return c;
  }

  function canvasBlob(c) {
    return new Promise(res => {
      if (c.toBlob) c.toBlob(b => res(b), 'image/png');
      else res(null);
    });
  }

  async function shareRun() {
    if (!lastRun) return;
    const blob = await canvasBlob(buildShareCanvas(lastRun));
    if (!blob) { copyRun(); return; }

    const file = new File([blob], 'starward-' + lastRun.kills + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: GAME_TITLE,
          text: copyText(),
        });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;  /* 用户自己取消，别硬塞下载 */
      }
    }
    /* 不支持系统分享就存图 */
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'starward-' + lastRun.kills + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showTip('图已存下，发到群里就行');
  }

  function copyText() {
    const r = lastRun;
    if (!r) return '';
    return '我在《' + GAME_TITLE + '》' + r.lenTag + '局撑了 ' + mmss(r.sec)
      + '，击杀 ' + r.kills + '，得分 +' + r.gain + '。来试试：' + playUrl()
      + '\n星之翼小修女单排幸存者 · 同人制作，免费游玩'
      + '\n全程 DeepSeek 驱动，有任何问题欢迎提出'
      + '\nB站 @电子小修女 · 神秘团长制作 · 小修女代发';
  }

  function copyRun() {
    const txt = copyText();
    if (!txt) return;
    const done = () => showTip('文案已复制，贴到评论区就行');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
    } else fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;top:-999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { showTip('复制失败，长按选一下'); }
    ta.remove();
  }

  /* 自查用：分享图的绘制函数挂出来，脚本能单独生成一张看效果 */
  P._shareCanvas = buildShareCanvas;

  /* ============================ 启停 ============================ */
  P.start = function (charId, sec) {
    if (sec) pickSec = sec;
    if (charId) lastChar = charId;
    if (!lastChar || !D.get(lastChar)) {
      lastChar = (D.selA && D.get(D.selA)) ? D.selA : D.firstUnlocked();
    }

    const home = $('home');
    if (home) home.classList.add('hidden');
    ['launch', 'roster', 'charPick'].forEach(id => {
      const el = $(id);
      if (el) el.classList.add('hidden');
    });
    const pop = $('pickPop');
    if (pop) pop.classList.add('hidden');
    document.body.classList.add('pve-mode');
    document.body.classList.remove('fight-mode');

    P.resultShown = false;
    upOpen = false;
    buildSig = '';
    const bb = $('pveBuild');
    if (bb) bb.innerHTML = '';
    const hud = $('pveHud'), res = $('pveResult'), up = $('pveUp');
    if (hud) hud.classList.remove('hidden');
    if (res) res.classList.add('hidden');
    if (up) up.classList.add('hidden');
    const ex = $('pveExit');
    if (ex) ex.classList.remove('hidden');
    const pzb = $('pvePause');
    if (pzb) { pzb.classList.remove('hidden'); pzb.textContent = '暂停'; pzb.classList.remove('on'); }
    const evb = $('pveEvoBtn');
    if (evb) evb.classList.remove('hidden');
    const db = $('pveDashBtn');
    if (db) db.classList.remove('hidden');
    showTip('角色满级 ＋ 对应星导核心 ＝ 进化　·　点左下「图鉴」查看全部说明');

    /* 布局先切到全屏，再按新尺寸重排，最后开局 */
    requestAnimationFrame(() => {
      try { SW.Render.resize(); } catch (_) {}
      B.pveOn = false;
      const opt = { sec: pickSec || CFG.sec };
      if (CFG.limit) opt.limit = CFG.limit;
      const ok = B.startPvE(lastChar, opt);
      if (!ok) { P.stop(); return; }
      B.pve.manual = true;
      B.pve.input = { x: 0, y: 0 };
      P.active = true;
      try { SW.Render.resize(); } catch (_) {}

      /* 首次进 PvE：先停住，把三句话讲完再放开；看过的直接上箭头 */
      const intro = $('pveIntro');
      if (intro && !introSeen()) {
        intro.classList.remove('hidden');
        B.pve.paused = true;
      } else {
        /* 等一帧让闪避键落位，不然气泡会指到旧坐标 */
        setTimeout(coachStart, 80);
      }
    });
  };

  /* 从 1v1 中途切过来：沿用在场的 A 方角色 */
  P.fromVersus = function () {
    const a = B.fighters[0];
    const id = a && a.char && D.get(a.char.id) ? a.char.id : null;
    B.pveOn = false;
    B.state = 'idle';
    P.start(id);
  };

  P.stop = function () {
    P.active = false;
    stick = null;
    const dot = $('pveStick');
    if (dot) dot.classList.add('hidden');
    B.pveOn = false;
    B.pve = null;
    B.state = 'idle';
    B.fighters = [];
    document.body.classList.remove('pve-mode');
    upOpen = false;
    buildSig = '';
    const bb2 = $('pveBuild');
    if (bb2) bb2.innerHTML = '';
    const hud = $('pveHud'), res = $('pveResult'), up = $('pveUp');
    if (hud) hud.classList.add('hidden');
    if (res) res.classList.add('hidden');
    if (up) up.classList.add('hidden');
    const ex2 = $('pveExit');
    if (ex2) ex2.classList.add('hidden');
    setPause(false);
    const pzb2 = $('pvePause');
    if (pzb2) pzb2.classList.add('hidden');
    const evb2 = $('pveEvoBtn');
    if (evb2) evb2.classList.add('hidden');
    const db2 = $('pveDashBtn');
    if (db2) db2.classList.add('hidden');
    const cc = $('pveCoach');
    if (cc) cc.classList.add('hidden');
    coachClear();
    coachAt = -1;
    const intro2 = $('pveIntro');
    if (intro2) intro2.classList.add('hidden');
    const tip2 = $('pveTip');
    if (tip2) tip2.classList.add('hidden');
    toggleEvoBook(false);
    try { SW.UI.prepareIdle(); } catch (_) {}
    if (SW.Menu) SW.Menu.show();
    setTimeout(() => { try { SW.Render.resize(); } catch (_) {} }, 0);
  };

  /* 选人入口：走大厅的通用选人面板（不再用底部下注条的弹层） */
  P.choose = function () {
    if (SW.Menu && SW.Menu.pickChar) SW.Menu.pickChar('小修女幸存者', id => P.start(id), '单排幸存者 · 只能选已解锁机体');
    else P.start();
  };

  /* 暂停：pv.userPause 和「升级选卡」的 paused 分开，别互相踩 */
  function setPause(on) {
    const btn = $('pvePause'), mask = $('pvePauseMask');
    const pv = B.pve;
    if (pv) {
      if (on && pv.pendingUp > 0) return;   /* 正在选卡，暂停没意义 */
      pv.userPause = !!on;
      /* 按下暂停那一刻手里的方向要松掉，不然恢复时会顺着旧摇杆飘出去 */
      if (on) pv.input = { x: 0, y: 0 };
    }
    if (btn) {
      btn.textContent = on ? '继续' : '暂停';
      btn.classList.toggle('on', !!on);
    }
    if (mask) mask.classList.toggle('hidden', !on);
    /* 暂停时别让教程提示压在脸上 */
    const tip = $('pveTip');
    if (tip) tip.classList.toggle('paused-hide', !!on);
  }

  P.init = function () {
    bindInput();

    /* 大厅局时长三档：记住上次选的，下次进来还是它 */
    const LEN_KEY = 'sw_pve_sec_v1';
    const lens = $('homeLens');
    function markLens(sec) {
      if (!lens) return;
      lens.querySelectorAll('.hl-chip').forEach(b => {
        b.classList.toggle('on', +b.dataset.sec === sec);
      });
    }
    if (lens) {
      /* 优先级：链接里的 ?t= > 上次手动选的 > 默认。
         分享出去的 ?t=180 不能被对方本地的记忆盖掉，否则发出去的三分钟链接
         到了老玩家手里还是三十分钟。 */
      const hasUrlSec = /[?&]t=/.test(location.search);
      try {
        const saved = +localStorage.getItem(LEN_KEY);
        if (hasUrlSec) pickSec = CFG.sec;
        else if (SEC_PRESETS.indexOf(saved) >= 0) pickSec = saved;
        else if (SEC_PRESETS.indexOf(CFG.sec) >= 0) pickSec = CFG.sec;
        else pickSec = 600;
      } catch (_) { pickSec = hasUrlSec ? CFG.sec : (pickSec || 600); }
      markLens(pickSec);
      lens.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.hl-chip');
        if (!b) return;
        pickSec = +b.dataset.sec || 600;
        markLens(pickSec);
        try { localStorage.setItem(LEN_KEY, String(pickSec)); } catch (_) {}
        if (SW.Audio) SW.Audio.ui();
      });
    }

    const pauseBtn = $('pvePause');
    if (pauseBtn) pauseBtn.addEventListener('click', () => {
      const pv = B.pve;
      setPause(!(pv && pv.userPause));
    });
    /* 切到后台（来电、切 App）自动按下暂停：回来时人还在原地，
       不会睁眼就看到自己被围死 */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && P.active && B.pve && B.state === 'fight') setPause(true);
    });

    /* 首次进 PvE 的四句话说明：只弹一次，看完记在本地 */
    const goBtn = $('pviGo');
    if (goBtn) goBtn.addEventListener('click', () => {
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (_) {}
      const box = $('pveIntro');
      if (box) box.classList.add('hidden');
      if (B.pve) B.pve.paused = false;
      coachStart();
    });
    const pcNext = $('pcNext');
    if (pcNext) pcNext.addEventListener('click', () => coachStep());

    const again = $('pveAgain');
    if (again) again.addEventListener('click', () => P.start(lastChar));
    const sh = $('pveShare');
    if (sh) sh.addEventListener('click', () => { shareRun(); });
    const cp = $('pveCopy');
    if (cp) cp.addEventListener('click', () => copyRun());
    const quit = $('pveQuit');
    if (quit) quit.addEventListener('click', () => P.stop());
    const exit = $('pveExit');
    if (exit) exit.addEventListener('click', () => P.stop());
    const evoBtn = $('pveEvoBtn');
    if (evoBtn) evoBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleEvoBook();
    });
    const evoClose = $('evoBookClose');
    if (evoClose) evoClose.addEventListener('click', () => toggleEvoBook(false));
    const tabs = $('codexTabs');
    if (tabs) tabs.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.codex-tab');
      if (!b) return;
      codexTab = b.dataset.tab || 'evo';
      renderCodex();
      if (SW.Audio) SW.Audio.ui();
    });
    const sw = $('pveSwitch');
    if (sw) sw.addEventListener('click', e => {
      e.stopPropagation();
      if (P.active) { P.stop(); if (SW.Menu) SW.Menu.openLaunch(); return; }
      if (!B.pveOn && (B.state === 'fight' || B.state === 'over')
        && B.fighters.length === 2) { P.fromVersus(); return; }
      P.choose();
    });

    /* ?pve=charId 直接进 */
    const m = location.search.match(/[?&]pve(?:=([\w-]+))?/);
    if (m) {
      const home = $('home');
      if (home) home.classList.add('hidden');
      P.start(m[1] && D.get(m[1]) ? m[1] : null);
    }

    loop();
  };
})();
