/* 星之翼 · 球体竞技场 —— 启动 */
(function () {
  'use strict';
  const D = SW.Data, B = SW.Battle, R = SW.Render, UI = SW.UI;

  D.load();
  try { SW.Debug.init(); } catch (e) {}
  try { SW.Console.init(); } catch (e) { SW.Debug.err(e); }

  /* PWA：加到主屏后断网也能开。file:// 打开时不能注册（浏览器直接拒绝），
     所以本地双击调试不受影响 */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  /* 首屏要等这些图。手机上几兆不可能秒开，先给条进度，
     不然就是一片纯黑，用户以为打不开。

     这里的取舍：只等「大厅停留期间一定会出现在屏幕上」的那些。
     九个角色头像（选人面板要画）+ 主玩法的兵种立绘。
     1v1 专用的吸血鬼、秋云的修罗丸形态都不在这个名单里 ——
     它们加起来两兆多，为了看一眼大厅让人等十几秒不值。 */
  const PRE = [];
  /* 首屏之后在后台补的图：进战斗之前基本都能到 */
  const LAZY = [];
  function pre(u) {
    if (!u) return;
    if (PRE.indexOf(u) >= 0) return;
    PRE.push(u);
    SW.Assets.load(u);
  }

  D.chars.forEach(c => {
    if (c.avatar) pre(c.avatar);
    /* faces 里是战斗中的表情，只有吸血鬼那套是多图，其余角色只有一张头像 */
    if (c.faces) for (const k in c.faces) {
      const v = c.faces[k];
      if (Array.isArray(v)) v.forEach(u => { if (LAZY.indexOf(u) < 0) LAZY.push(u); });
      else if (v !== c.avatar && LAZY.indexOf(v) < 0) LAZY.push(v);
    }
  });
  /* 破破烂烂-秋云：修罗丸素材，只在那个形态出场时用 */
  ['assets/shura_stand.webp', 'assets/shura_slash_1.webp', 'assets/shura_slash_2.webp',
   'assets/shura_slash_3.webp', 'assets/shura_slash_4.webp'].forEach(u => LAZY.push(u));
  /* PvE 怪物立绘（克丽丝塔系四种，一开局就要画） */
  ['assets/krista_acolyte.webp', 'assets/krista_choir.webp',
   'assets/krista_blade.webp', 'assets/krista_cannon.webp'].forEach(pre);
  /* 兵种立绘：小修女的八张表情包 + 蝙蝠自己那张（困倦蝠少女） */
  ['assets/em_pop.png', 'assets/em_yawn.png', 'assets/em_dumb.png', 'assets/em_grit.png',
   'assets/em_smirk.png', 'assets/em_sad.png', 'assets/em_hand.png', 'assets/em_work.png',
   'assets/mob_bat.png'].forEach(pre);

  /* 首屏揭幕之后，趁着人在大厅把这些慢慢拉回来。
     一次全拉会和点按钮抢带宽，所以分小批，一批两张错开 160ms。 */
  function warmLazy() {
    let i = 0;
    const step = () => {
      if (i >= LAZY.length) return;
      try { SW.Assets.load(LAZY[i++]); } catch (_) {}
      if (i < LAZY.length && SW.Assets.load(LAZY[i++])) { /* 第二张 */ }
      setTimeout(step, 160);
    };
    setTimeout(step, 400);
  }
  R.init(document.getElementById('cv'));
  UI.init();
  try { SW.Menu.init(); } catch (e) { SW.Debug.err(e); }
  try { SW.PvE.init(); } catch (e) { SW.Debug.err(e); }

  /* ---------- 首屏进度条 ---------- */
  (function boot() {
    const box = document.getElementById('boot');
    if (!box) return;
    const bar = document.getElementById('bootBar');
    const txt = document.getElementById('bootPct');
    const t0 = performance.now();
    let done = 0, closed = false;
    const total = PRE.length || 1;

    function paint() {
      const p = Math.min(100, Math.round(done / total * 100));
      if (bar) bar.style.width = p + '%';
      if (txt) txt.textContent = p < 100 ? p + '%' : '就绪';
    }
    function finish() {
      if (closed) return;
      closed = true;
      bar && (bar.style.width = '100%');
      txt && (txt.textContent = '就绪');
      /* 首屏已经揭幕了，剩下的大图这会儿才开始拉，别跟首屏抢带宽 */
      warmLazy();
      /* 缓存命中时进度会瞬间满，留 320ms 让条子走完再揭幕，别闪一下 */
      const wait = Math.max(0, 320 - (performance.now() - t0));
      setTimeout(() => {
        box.classList.add('out');
        setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 420);
      }, wait);
    }
    function step() {
      done++;
      paint();
      if (done >= total) finish();
    }

    PRE.forEach(u => {
      /* 这里必须走 Assets.load 拿缓存里的那张图，不能拿原始路径去查
         cache —— cache 的 key 是带 ?v= 的，直接查永远是 undefined，
         进度条会一路瞬间满，等于没等。 */
      const im = SW.Assets.load(u);
      if (!im) { step(); return; }
      if (im.complete) { step(); return; }
      im.addEventListener('load', step, { once: true });
      im.addEventListener('error', step, { once: true });
    });
    paint();
    /* 兜底：网很慢也最多等 9 秒，剩下的大厅里慢慢补 */
    setTimeout(finish, 9000);
  })();

  /* 调试：?demo 直接开局 */
  if (/[?&]demo/.test(location.search)) {
    const home = document.getElementById('home');
    if (home) home.classList.add('hidden');
    const pa = location.search.match(/[?&]a=([\w-]+)/);
    const pb = location.search.match(/[?&]b=([\w-]+)/);
    if (pa && D.get(pa[1])) { D.forceUnlock(pa[1]); D.selA = pa[1]; }
    if (pb && D.get(pb[1])) { D.forceUnlock(pb[1]); D.selB = pb[1]; }
    UI.syncPicks();
    UI.prepareIdle();
    UI.syncBetLabels();
    setTimeout(() => UI.placeBet(-1), 120);
    const m = location.search.match(/ff=([\d.]+)/);
    if (m) {
      const sec = Math.min(120, parseFloat(m[1]) || 0);
      setTimeout(() => { for (let i = 0; i < sec * 60; i++) { B.update(1 / 60); UI.tick(1 / 60); } }, 400);
    }
  }

  if (/[?&]forge/.test(location.search)) {
    const it = document.getElementById('home');
    if (it) it.classList.add('hidden');
    setTimeout(() => {
      try { SW.Editor.open(); document.title = 'FORGE-OK'; }
      catch (e) { document.title = 'FORGE-ERR ' + e.message; }
    }, 300);
  }

  window.addEventListener('error', (e) => {
    document.title = 'ERR ' + e.message;
    const d = document.getElementById('errbox') || (() => {
      const x = document.createElement('div');
      x.id = 'errbox';
      x.style.cssText = 'position:fixed;left:0;bottom:0;z-index:999;color:#f66;background:#000;font:11px monospace;padding:4px;max-width:100%;white-space:pre-wrap';
      document.body.appendChild(x);
      return x;
    })();
    d.textContent += e.message + '\n';
  });

  /* 尺寸变化后重排 */
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      try {
        R.resize();
        if (B.state === 'idle') UI.prepareIdle();
      } catch (e) { SW.Debug.err(e); }
    }, 120);
  });

  let last = performance.now();
  let errShown = 0;

  function loop(now) {
    /* 先排下一帧，保证任何异常都不会冻结循环 */
    requestAnimationFrame(loop);

    /* 切到后台（接电话 / 切 App）：完全不推进逻辑。
       部分浏览器后台仍以 1fps 跑 rAF，dt 被钳到 0.12 也等于慢速掉血，
       回来时角色已经残了 —— 干脆停住 */
    if (document.hidden) { last = now; return; }

    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.12) dt = 0.12;
    if (dt < 0) dt = 0;

    try {
      B.update(dt);
      R.draw(Math.min(dt, 0.05));
      UI.tick(dt);
    } catch (e) {
      try {
        SW.Debug.err(e);
        if (errShown++ < 3) SW.Debug.flash();
      } catch (_) {}
    }

    try { SW.Debug.frame(dt); } catch (_) {}
  }
  requestAnimationFrame(loop);
})();
