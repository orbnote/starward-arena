/* 星之翼 · 球体竞技场 —— 大厅 / 机体库 / 1v1 对战
   三个主入口：开一局 VS（吸血鬼幸存者） · 解锁新角色 · 竞猜赚积分
   1v1 小球对战降为大厅底部次入口 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const D = SW.Data, B = SW.Battle;

  const M = SW.Menu = {
    tab: 'pve',
    side: 0,          /* 1v1 面板当前在选哪一侧 */
    pickCb: null,
  };

  const $ = id => document.getElementById(id);

  function avatarStyle(c) {
    return c.avatar
      ? `background-image:url('${c.avatar}');background-size:cover;background-position:center;`
      : `background:${c.color};`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /* ============================ 刷新数字 ============================ */
  M.refreshWallet = function () {
    const hw = $('homeWallet'), rw = $('rosterWallet');
    if (hw) hw.textContent = D.wallet;
    if (rw) rw.textContent = D.wallet;
    const hl = $('homeLocked');
    if (hl) hl.textContent = D.lockedList().length;
  };

  M.refresh = function () {
    this.refreshWallet();
    if (!$('launch').classList.contains('hidden')) this.renderLaunch();
    if (!$('roster').classList.contains('hidden')) this.renderRoster();
  };

  /* ============================ 大厅 ============================ */
  M.show = function () {
    $('home').classList.remove('hidden');
    this.refresh();
  };

  M.hide = function () {
    $('home').classList.add('hidden');
  };

  /* ============================ 选人网格 ============================ */
  function charGrid(host, opts) {
    host.innerHTML = '';
    const onlyUnlocked = opts.onlyUnlocked;
    const list = (onlyUnlocked ? D.chars.filter(c => D.isUnlocked(c.id)) : D.chars)
      .filter(c => !(opts.hideRosterHidden && c.rosterHidden));
    const CP = (SW.Battle && SW.Battle.charPassives) || {};
    for (const c of list) {
      const used = !!opts.isUsed && opts.isUsed(c.id);
      const locked = !D.isUnlocked(c.id);
      const btn = document.createElement('button');
      btn.className = 'rc' + (locked ? ' locked' : '') + (used ? ' used' : '')
        + (opts.intro ? ' rc-wide' : '');
      btn.dataset.id = c.id;
      let state;
      if (locked) state = `<span class="rc-buy">解锁 ${D.unlockCost(c)}</span>`;
      else if (used) state = '<span class="rc-state">已上场</span>';
      else state = '<span class="rc-state ok">可用</span>';
      const cp = CP[c.id];
      const extra = opts.intro
        ? `<span class="rc-intro">${escapeHtml(c.intro || '')}</span>`
          + (cp ? `<span class="rc-pass">被动 · ${escapeHtml(cp.name)} —— ${escapeHtml(cp.desc)}</span>` : '')
        : '';
      btn.innerHTML = `
        <span class="rc-av" style="${avatarStyle(c)}"></span>
        <span class="rc-body">
          <span class="rc-name">${escapeHtml(c.name)}</span>
          <span class="rc-title">${escapeHtml(c.title || '')} · COST ${c.cost}</span>
          ${extra}
        </span>
        ${state}`;
      btn.addEventListener('click', () => opts.onPick(c, locked));
      host.appendChild(btn);
    }
    if (opts.extra) {
      const b = document.createElement('button');
      b.className = 'rc rc-extra';
      b.innerHTML = `<span class="rc-av">＋</span><span class="rc-body">
        <span class="rc-name">${opts.extra}</span>
        <span class="rc-title">去机体库看看</span></span>`;
      b.addEventListener('click', () => opts.onExtra());
      host.appendChild(b);
    }
  }

  /* ============================ 机体库（解锁） ============================ */
  M.openRoster = function () {
    this.renderRoster();
    $('roster').classList.remove('hidden');
  };

  M.renderRoster = function () {
    const host = $('rosterGrid');
    if (!host) return;
    charGrid(host, {
      onlyUnlocked: false,
      hideRosterHidden: true,
      intro: true,
      onPick: (c, locked) => {
        if (!locked) { SW.Audio && SW.Audio.ui(); return; }
        const cost = D.unlockCost(c);
        if (D.wallet < cost) {
          SW.UI.toast('积分不足，还差 ' + (cost - D.wallet));
          return;
        }
        if (!D.unlock(c.id)) return;
        SW.Audio && SW.Audio.win();
        SW.UI.toast('解锁成功 · ' + c.name);
        this.renderRoster();
        this.refreshWallet();
        SW.UI.syncWallet();
        /* 留一台给 B 侧，避免左右同角色 */
        if (D.selA === c.id) D.selA = D.firstUnlocked();
        D.save();
        SW.UI.syncPicks();
      },
    });
    this.refreshWallet();
  };

  /* ============================ 通用选人（VS 模式） ============================ */
  M.pickChar = function (title, cb, sub) {
    this.pickCb = cb;
    const t = $('charPickTitle');
    if (t) t.innerHTML = escapeHtml(title) + '<i>' + escapeHtml(sub || '只能选已解锁机体') + '</i>';
    const host = $('charPickGrid');
    charGrid(host, {
      onlyUnlocked: true,
      hideRosterHidden: true,
      intro: true,
      onPick: c => {
        $('charPick').classList.add('hidden');
        const fn = this.pickCb;
        this.pickCb = null;
        if (fn) fn(c.id);
      },
      extra: '解锁更多机体',
      onExtra: () => {
        $('charPick').classList.add('hidden');
        this.openRoster();
      },
    });
    $('charPick').classList.remove('hidden');
  };

  /* ============================ 1v1 对战面板 ============================ */
  M.openLaunch = function () {
    this.side = 0;
    this.renderLaunch();
    $('launch').classList.remove('hidden');
  };

  M.renderLaunch = function () {
    const a = D.get(D.selA) || D.chars[0];
    const b = D.get(D.selB) || D.chars[0];
    const setSide = (el, c, on) => {
      if (!el) return;
      el.classList.toggle('on', on);
      el.querySelector('.ls-dot').style.cssText = 'background:' +
        (c.avatar ? `url('${c.avatar}') center/cover` : c.color) +
        ';box-shadow:0 0 10px ' + c.color;
      el.querySelector('.ls-name').textContent = c.name;
    };
    setSide($('lsA'), a, this.side === 0);
    setSide($('lsB'), b, this.side === 1);

    charGrid($('launchGrid'), {
      onlyUnlocked: true,
      isUsed: id => id === D.selA || id === D.selB,
      onPick: (c, locked) => {
        if (locked) return;
        if (this.side === 0) D.selA = c.id; else D.selB = c.id;
        /* 两侧撞同一台就互换，保证能看到对打 */
        if (D.selA === D.selB) {
          const other = D.chars.find(x => D.isUnlocked(x.id) && x.id !== c.id);
          if (other) { if (this.side === 0) D.selB = other.id; else D.selA = other.id; }
        }
        D.save();
        SW.UI.syncPicks();
        SW.Audio && SW.Audio.ui();
        this.renderLaunch();
      },
      extra: '解锁更多机体',
      onExtra: () => this.openRoster(),
    });
  };

  M.startFight = function () {
    const a = D.get(D.selA), b = D.get(D.selB);
    if (!a || !b) return;
    $('launch').classList.add('hidden');
    this.hide();
    try { SW.Audio.init(); SW.Audio.resume(); } catch (e) {}
    SW.UI.beginFight('fight');
  };

  /* ============================ 初始化 ============================ */
  M.init = function () {
    const home = $('home');
    if (home) {
      home.querySelectorAll('.home-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          SW.Audio && SW.Audio.ui();
          if (tab === 'pve') { this.startVs(); return; }
          if (tab === 'unlock') { this.openRoster(); return; }
          if (tab === 'bet') { this.startBet(); return; }
        });
      });
    }

    /* 大厅底部的「清空存档」：确认两次是因为它连带解锁和自制机体一起清 */
    const wipe = $('homeWipe');
    if (wipe) {
      wipe.addEventListener('click', () => {
        if (!window.confirm('清空存档？\n积分、已解锁机体、自制机体都会没，回到刚开服的样子。')) return;
        try { localStorage.clear(); } catch (e) {}
        location.reload();
      });
    }

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.close;
        const el = $(id);
        if (el) el.classList.add('hidden');
        SW.Audio && SW.Audio.ui();
      });
    });

    const lsa = $('lsA'), lsb = $('lsB');
    if (lsa) lsa.addEventListener('click', () => { this.side = 0; this.renderLaunch(); SW.Audio && SW.Audio.ui(); });
    if (lsb) lsb.addEventListener('click', () => { this.side = 1; this.renderLaunch(); SW.Audio && SW.Audio.ui(); });

    const go = $('launchGo');
    if (go) go.addEventListener('click', () => this.startFight());

    const vs1 = $('homeVersus');
    if (vs1) vs1.addEventListener('click', () => { SW.Audio && SW.Audio.ui(); this.openLaunch(); });
    const stats = $('homeStats');
    if (stats) stats.addEventListener('click', () => { SW.Audio && SW.Audio.ui(); SW.UI.openStats(); });
    const forge = $('homeForge');
    if (forge) forge.addEventListener('click', () => { SW.Audio && SW.Audio.ui(); SW.Editor.open(); });

    const hb = $('btnHome');
    if (hb) hb.addEventListener('click', () => { SW.Audio && SW.Audio.ui(); this.toHome(); });

    this.refresh();
  };

  /* 竞猜入口：直接进对战界面，用底部下注条开打 */
  M.startBet = function () {
    this.hide();
    try { SW.Audio.init(); SW.Audio.resume(); } catch (e) {}
    SW.UI.beginFight('bet');
    SW.UI.toast('选边下注，开打');
  };

  /* VS 主入口：吸血鬼幸存者模式，选一台机体直接开 */
  M.startVs = function () {
    try { SW.Audio.init(); SW.Audio.resume(); } catch (e) {}
    SW.PvE.choose();
  };

  M.toHome = function () {
    if (SW.PvE && SW.PvE.active) SW.PvE.stop();
    try {
      B.pveOn = false;
      B.state = 'idle';
      SW.UI.prepareIdle();
      SW.Render.resize();
    } catch (e) {}
    const pop = $('pickPop');
    if (pop) pop.classList.add('hidden');
    ['launch', 'roster', 'charPick'].forEach(id => {
      const el = $(id);
      if (el) el.classList.add('hidden');
    });
    this.show();
  };
})(window.SW);
