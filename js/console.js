/* 星之翼 · 球体竞技场 —— 隐藏控制台
 *
 * 顶栏那一排按钮（数值 / 工坊 / 倍速 / 音效 / 重置）只有调试时才用得着，
 * 平时摆在右上角像开发者后台，所以默认整排收起来。
 *
 * 开启方式（任选）：
 *   1. 任意地方连打  f  o  x   三个字母
 *   2. Ctrl + Shift + `         （打开/收起面板）
 *   3. 地址栏加 ?console
 * 开启后：右上角按钮出现 + 右下角多一个 DEV 按钮。再打一次 fox 收起来。
 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const KEY = 'sw_console_v1';
  let buf = '';

  const C = SW.Console = {
    on: false,
    open: false,
    el: null,
    statEl: null,
    timer: 0,
    bossIdx: 0,
  };

  function $(id) { return document.getElementById(id); }

  /* ============================ 开关 ============================ */
  C.enable = function (v) {
    C.on = v !== false;
    document.body.classList.toggle('console-on', C.on);
    try { localStorage.setItem(KEY, C.on ? '1' : '0'); } catch (_) {}
    if (!C.on) C.togglePanel(false);
    else toast('控制台已开启　·　Ctrl+Shift+` 开关面板');
  };

  C.togglePanel = function (force) {
    const open = force != null ? force : !C.open;
    C.open = open;
    if (open) {
      if (!C.on) C.enable(true);
      build();
      if (C.el) C.el.classList.remove('hidden');
      refresh();
    } else if (C.el) {
      C.el.classList.add('hidden');
    }
    const fab = $('devFab');
    if (fab) fab.classList.toggle('on', open);
  };

  function toast(msg) {
    const b = $('banner');
    if (!b) return;
    b.textContent = msg;
    b.classList.add('small');
    b.classList.remove('hidden');
    if (SW.UI && SW.UI.toastT != null) SW.UI.toastT = 1.6;
  }

  /* ============================ 输入 ============================ */
  function bind() {
    window.addEventListener('keydown', e => {
      const t = e.target;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (t && t.isContentEditable) return;

      if (e.ctrlKey && e.shiftKey && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        C.togglePanel();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key;
      if (!k || k.length !== 1) return;
      buf = (buf + k.toLowerCase()).slice(-6);
      if (buf.slice(-3) === 'fox') {
        buf = '';
        if (!C.on) { C.enable(true); C.togglePanel(true); }
        else C.togglePanel();
      }
    });
  }

  /* ============================ 面板 ============================ */
  function build() {
    if (C.el) return;
    const p = document.createElement('div');
    p.id = 'devPanel';
    p.className = 'hidden';
    p.innerHTML = `
      <div class="dev-head">
        <span class="dev-title">CONSOLE</span>
        <span class="dev-hint">fox / Ctrl+Shift+\`</span>
        <div class="dev-hbtns">
          <button data-cmd="copy">复制</button>
          <button data-cmd="off">关闭</button>
          <button data-cmd="close">×</button>
        </div>
      </div>
      <pre class="dev-stat" id="devStat"></pre>

      <div class="dev-sec">对局 · PvE</div>
      <div class="dev-grid">
        <button data-cmd="skip30">快进 30s</button>
        <button data-cmd="skip120">快进 2min</button>
        <button data-cmd="boss">召唤 BOSS</button>
        <button data-cmd="clear">清场</button>
        <button data-cmd="maxall">全武器满级</button>
        <button data-cmd="lvl5">升 5 级</button>
        <button data-cmd="god">无敌 开/关</button>
        <button data-cmd="heal">回满血</button>
      </div>

      <div class="dev-sec">资源</div>
      <div class="dev-grid">
        <button data-cmd="money">+1000 积分</button>
        <button data-cmd="unlock">解锁全部机体</button>
        <button data-cmd="wipe">清空存档</button>
      </div>

      <div class="dev-sec">界面</div>
      <div class="dev-grid">
        <button data-cmd="stats">数值总览</button>
        <button data-cmd="forge">工坊</button>
        <button data-cmd="codex">图鉴</button>
        <button data-cmd="speed">倍速 1/2/3</button>
        <button data-cmd="mute">静音</button>
        <button data-cmd="dbg">调试面板</button>
      </div>`;
    document.body.appendChild(p);
    C.el = p;
    C.statEl = p.querySelector('#devStat');

    p.addEventListener('click', e => {
      const b = e.target.closest('[data-cmd]');
      if (!b) return;
      try { run(b.dataset.cmd); } catch (err) {
        if (SW.Debug) SW.Debug.err(err);
        toast('控制台出错：' + (err && err.message));
      }
    });

    const fab = document.createElement('button');
    fab.id = 'devFab';
    fab.textContent = 'DEV';
    fab.addEventListener('click', () => C.togglePanel());
    document.body.appendChild(fab);
  }

  /* ============================ 指令 ============================ */
  function pvNow() {
    const B = SW.Battle;
    return B && B.pve ? B.pve : null;
  }

  function run(cmd) {
    const B = SW.Battle, D = SW.Data, UI = SW.UI;
    switch (cmd) {
      case 'close': C.togglePanel(false); break;
      case 'off': C.enable(false); break;

      case 'skip30': case 'skip120': {
        if (!B.dev || !pvNow()) { toast('先开一局 VS 模式'); break; }
        const s = B.dev.skip(cmd === 'skip30' ? 30 : 120);
        toast('快进 ' + s.toFixed(0) + ' 秒');
        break;
      }
      case 'boss': {
        const pv = pvNow();
        if (!pv) { toast('先开一局 VS 模式'); break; }
        const tiers = ['blood0', 'blood', 'blood2', 'blood3', 'blood4'];
        const t = tiers[C.bossIdx % tiers.length];
        C.bossIdx++;
        B.dev.spawnBoss(t);
        break;
      }
      case 'clear': {
        if (!pvNow()) { toast('先开一局 VS 模式'); break; }
        toast('清掉 ' + B.dev.clearMobs() + ' 只');
        break;
      }
      case 'maxall': {
        if (!pvNow()) { toast('先开一局 VS 模式'); break; }
        B.dev.maxAll();
        toast('全武器满级 · 进化已触发');
        break;
      }
      case 'lvl5': {
        if (!B.dev.addXp || !pvNow()) { toast('先开一局 VS 模式'); break; }
        const pv = pvNow();
        B.dev.addXp(pv.xpNeed * 5);
        toast('经验 +5 级');
        break;
      }
      case 'god': {
        const pv = pvNow();
        if (!pv) { toast('先开一局 VS 模式'); break; }
        const on = !(pv.armor === 0);
        B.dev.god(on);
        toast(on ? '无敌：开' : '无敌：关');
        break;
      }
      case 'heal': {
        const pv = pvNow();
        if (!pv) { toast('先开一局 VS 模式'); break; }
        pv.player.hp = pv.player.maxHp;
        toast('血量已回满');
        break;
      }

      case 'money':
        D.wallet += 1000;
        D.save();
        if (UI) UI.syncWallet();
        toast('+1000 积分　当前 ' + D.wallet);
        break;
      case 'unlock':
        for (const c of D.chars) D.forceUnlock(c.id);
        D.save();
        toast('全部机体已解锁');
        break;
      case 'wipe':
        if (!confirm('清空本地存档？积分、解锁、自定义角色全部重置。')) break;
        try { localStorage.removeItem('sw_orb_arena_v2'); } catch (_) {}
        location.reload();
        break;

      case 'stats': if (UI) UI.openStats(); break;
      case 'forge': if (SW.Editor) SW.Editor.open(); break;
      case 'codex': if (SW.PvE && SW.PvE.evoBook) SW.PvE.evoBook(true); break;
      case 'speed': {
        const s = B.speed === 1 ? 2 : B.speed === 2 ? 3 : 1;
        B.speed = s;
        const btn = $('btnSpeed');
        if (btn) { btn.textContent = s + '×'; btn.classList.toggle('on', s > 1); }
        toast('倍速 ' + s + '×');
        break;
      }
      case 'mute': {
        const A = SW.Audio;
        if (!A) break;
        A.muted = !A.muted;
        const btn = $('btnMute');
        if (btn) { btn.textContent = A.muted ? '静音' : '音效'; btn.classList.toggle('on', A.muted); }
        toast(A.muted ? '已静音' : '音效已开');
        break;
      }
      case 'dbg': if (SW.Debug) SW.Debug.toggle(); break;
      case 'copy': {
        const txt = SW.Debug ? SW.Debug.diag() : '';
        const ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
        toast('诊断信息已复制');
        break;
      }
      default: break;
    }
    refresh();
  }
  C.run = run;

  /* ============================ 状态行 ============================ */
  function refresh() {
    if (!C.open || !C.statEl) return;
    const B = SW.Battle || {}, D = SW.Data || {};
    const pv = B.pve;
    const lines = [];
    lines.push('state ' + (B.state || '-') + '　speed ×' + (B.speed || 1) + '　积分 ' + (D.wallet || 0));
    if (pv) {
      const p = pv.player;
      lines.push('存活 ' + Math.round(pv.total - pv.left) + 's / ' + pv.total
        + 's　击杀 ' + pv.kills + '　Lv' + pv.lvl);
      lines.push('hp ' + Math.ceil(p.hp) + '/' + p.maxHp
        + '　场上 ' + B.fighters.filter(f => f.isMob && !f.dead).length
        + '　弹幕 ' + (pv.shots ? pv.shots.length : 0)
        + '　觉醒 ' + (pv.awkN || 0) + ' 次待放');
      const own = [];
      for (const id in pv.weapons) if (pv.weapons[id].lvl > 0) own.push(id + ':' + pv.weapons[id].lvl);
      if (own.length) lines.push('武器 ' + own.join(' '));
      const evo = Object.keys(pv.evolved || {});
      if (evo.length) lines.push('进化 ' + evo.join(' '));
    } else {
      lines.push('未在 PvE 对局中');
    }
    C.statEl.textContent = lines.join('\n');
  }

  /* ============================ 启动 ============================ */
  C.init = function () {
    bind();
    build();
    let on = false;
    try { on = localStorage.getItem(KEY) === '1'; } catch (_) {}
    if (/[?&]console/.test(location.search)) on = true;
    C.on = on;
    document.body.classList.toggle('console-on', on);
    if (/[?&]console/.test(location.search)) setTimeout(() => C.togglePanel(true), 400);
    C.timer = setInterval(refresh, 500);
  };

  SW.Console = C;
})(window.SW);
