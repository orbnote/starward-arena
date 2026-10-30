/* 星之翼 · 球体竞技场 —— 界面流程 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U, D = SW.Data, B = SW.Battle, A = SW.Audio;

  const UI = {
    phase: 'bet',          // bet | running | result
    mode: 'bet',           // bet = 竞猜入口 | fight = 开一局
    betSide: -1,
    betAmt: 50,
    overClock: 0,
    resolved: false,
    resultTimer: 0,
    el: {},
    toastT: 0,
  };

  UI.init = function () {
    this.el = {
      cv: document.getElementById('cv'),
      pickA: document.getElementById('pickA'),
      pickB: document.getElementById('pickB'),
      pickPop: document.getElementById('pickPop'),
      chipGroup: document.getElementById('chipGroup'),
      wallet: document.getElementById('walletNum'),
      watch: document.getElementById('btnWatch'),
      betA: document.getElementById('btnBetA'),
      betB: document.getElementById('btnBetB'),
      oddsA: document.querySelector('#btnBetA .bb-odds'),
      oddsB: document.querySelector('#btnBetB .bb-odds'),
      labelA: document.querySelector('#btnBetA .bb-label'),
      labelB: document.querySelector('#btnBetB .bb-label'),
      banner: document.getElementById('banner'),
      result: document.getElementById('result'),
      speed: document.getElementById('btnSpeed'),
      mute: document.getElementById('btnMute'),
      editor: document.getElementById('btnEditor'),
      stats: document.getElementById('btnStats'),
      reset: document.getElementById('btnReset'),
      intro: document.getElementById('home'),
      start: document.getElementById('btnStart'),
      home: document.getElementById('btnHome'),
    };

    this.betAmt = D.betAmt || 50;

    /* 顶部按钮 */
    this.el.editor.addEventListener('click', () => { A.ui(); SW.Editor.open(); });
    this.el.stats.addEventListener('click', () => { A.ui(); this.openStats(); });
    this.el.speed.addEventListener('click', () => {
      const s = B.speed === 1 ? 2 : B.speed === 2 ? 3 : 1;
      B.speed = s;
      this.el.speed.textContent = s + '×';
      this.el.speed.classList.toggle('on', s > 1);
      A.ui();
    });
    this.el.mute.addEventListener('click', () => {
      A.muted = !A.muted;
      this.el.mute.textContent = A.muted ? '静音' : '音效';
      this.el.mute.classList.toggle('on', A.muted);
      A.ui();
    });
    if (this.el.reset) this.el.reset.addEventListener('click', () => this.resetRun());

    /* 筹码 */
    this.el.chipGroup.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.chipGroup.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const v = btn.dataset.amt;
        this.betAmt = v === 'max' ? 'max' : parseInt(v, 10);
        D.betAmt = this.betAmt === 'max' ? 500 : this.betAmt;
        D.save();
        this.syncBetLabels();
        A.ui();
      });
    });
    /* 恢复上次档位 */
    {
      const v = D.betAmt;
      let found = false;
      this.el.chipGroup.querySelectorAll('.chip').forEach(btn => {
        if (btn.dataset.amt !== 'max' && parseInt(btn.dataset.amt, 10) === v) {
          btn.classList.add('active'); found = true;
          this.betAmt = v;
        }
      });
      if (!found) {
        this.el.chipGroup.querySelector('[data-amt="50"]').classList.add('active');
        this.betAmt = 50;
      }
    }

    /* 下注 */
    this.el.betA.addEventListener('click', () => this.placeBet(0));
    this.el.betB.addEventListener('click', () => this.placeBet(1));
    this.el.watch.addEventListener('click', () => this.placeBet(-1));

    /* 选人 */
    this.el.pickA.addEventListener('click', e => { e.stopPropagation(); this.openPick(0); });
    this.el.pickB.addEventListener('click', e => { e.stopPropagation(); this.openPick(1); });
    document.addEventListener('click', e => {
      if (!this.el.pickPop.classList.contains('hidden') && !this.el.pickPop.contains(e.target)) {
        this.el.pickPop.classList.add('hidden');
      }
    });

    /* 开始（旧开场按钮，已由大厅接管，保留兼容） */
    if (this.el.start) this.el.start.addEventListener('click', () => {
      A.init(); A.resume(); A.ui();
      this.beginFight('bet');
    });

    this.syncPicks();
    this.syncWallet();
    this.syncBetLabels();
    this.syncButtons();
    this.prepareIdle();
    this.syncSide();
  };


  /* ============================ 数值总览 ============================ */
  function paramList(params, def) {
    if (!def || !def.fields || !def.fields.length) return '—';
    return def.fields.map(f => {
      const v = params[f.key] !== undefined ? params[f.key] : f.def;
      return f.label + ' ' + v;
    }).join('　·　');
  }

  UI.openStats = function () {
    const m = document.getElementById('modal');
    m.classList.remove('hidden');

    const cards = D.chars.map(c => {
      const sk = D.SKILL_DEFS[c.skill.type];
      const aw = D.AWAKEN_DEFS[c.awaken.type];
      const av = c.avatar ? `background-image:url('${c.avatar}')` : `background:${c.color}`;
      return `
        <div class="stat-card" style="border-color:${c.color}55">
          <div class="sc-head">
            <span class="sc-av" style="${av}"></span>
            <span class="sc-name" style="color:${c.color}">${escapeHtml(c.name)}</span>
            <span class="sc-title">${escapeHtml(c.title || '')}</span>
            <span class="sc-cost">COST ${c.cost}</span>
          </div>
          <div class="sc-grid">
            <div><i>生命</i><b>${c.hp}</b></div>
            <div><i>移速</i><b>${c.moveSpeed}</b></div>
            <div><i>体型</i><b>${c.radius}</b></div>
            <div><i>接触伤害</i><b>${c.contactDamage}</b></div>
          </div>
          <div class="sc-row">
            <div class="sc-row-h">技能　${sk ? escapeHtml(sk.name) : c.skill.type}</div>
            <div class="sc-row-b">${paramList(c.skill.params, sk)}</div>
          </div>
          <div class="sc-row">
            <div class="sc-row-h">觉醒　${aw ? escapeHtml(aw.name) : c.awaken.type}</div>
            <div class="sc-row-b">${paramList(c.awaken.params, aw)}</div>
          </div>
        </div>`;
    }).join('');

    m.innerHTML = `
      <div class="stats-panel">
        <div class="forge-head">
          <div class="forge-title">数值总览<i>LIVE DATA · ${D.chars.length} 机体</i></div>
          <div class="spacer"></div>
          <button class="fbtn" id="statsWipe">清空存档</button>
          <button class="fbtn" id="statsClose">关闭</button>
        </div>
        <div class="stats-body">${cards}</div>
      </div>`;

    m.querySelector('#statsClose').addEventListener('click', () => {
      m.classList.add('hidden');
      m.innerHTML = '';
    });
    /* 清空存档：开发者入口，顶栏按钮默认隐藏，普通玩家看不到 */
    m.querySelector('#statsWipe').addEventListener('click', () => {
      if (!window.confirm('清空全部存档？（积分、解锁、自定义机体都会没）')) return;
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    });
    m.addEventListener('click', (e) => {
      if (e.target === m) { m.classList.add('hidden'); m.innerHTML = ''; }
    }, { once: true });
  };


  /* ============================ 左右侧栏 ============================ */
  function keyStat(c) {
    const p = c.skill.params || {};
    const t = c.skill.type;
    if (t === 'skysaber_combo') return [
      ['光枪伤害', p.shotDamage + ' × 6 发'],
      ['飞刀', p.bladeDamage + ' · 麻痹 ' + p.paralyze + 's'],
      ['技能冷却', p.cd + 's'],
    ];
    if (t === 'akigumo_iaido') return [
      ['拔刀斩', p.damage],
      ['残心', '上限 ' + p.reshinMax + ' 层 · 每层 +' + p.reshinBonus + '%'],
      ['阴阳流・星落', p.chargeDamage],
    ];
    if (t === 'akigumo_broken') return [
      ['拔刀斩', p.damage + ' · 残心 +' + p.reshinBonus + '%/层'],
      ['阴阳流・止水', '每 ' + p.guardEvery + 's 现身 ' + p.guardTime + 's 挡弹'],
      ['阴阳流・引狱', '∞ · 拖拽 ' + p.holePull + ' · ' + p.holeDps + '/s'],
    ];
    if (t === 'rhine_evo') return [
      ['咆哮伤害', p.shotDamage + ' / ' + p.interval + 's'],
      ['前奏曲', p.laserDps + '/s · 单次上限 ' + (p.laserBudget != null ? p.laserBudget : 600)],
      ['进化点', p.evoPerLevel + ' 点 · 魔龙的爪牙 ' + p.missileRate + '/s'],
    ];
    if (t === 'krista_shot') {
      const sw = c.sword;
      return [
        ['单发伤害', p.damage],
        ['技能冷却', p.cd + 's'],
        ['圣光之刃', sw ? sw.damage + ' · 环绕 ' + sw.length + ' 身位' : '—'],
      ];
    }
    if (t === 'vamp_bite') return [
      ['咬合时长', p.duration + 's · 每秒 ' + p.dps],
      ['每秒回复', String(p.heal)],
      ['目标减速', Math.round((p.slow || 0) * 100) + '% · 冷却 ' + p.cd + 's'],
    ];
    if (t === 'mimi_pack') return [
      ['G·诺伦', '上限 ' + p.maxDamage + ' · 半径 ' + Math.round((p.radiusPct || .5) * 100) + '% 地图'],
      ['爆炸', (p.grow || 1) + 's扩张+' + (p.hold || 4) + 's持续 · 每0.5s ' + Math.round((p.dps || 400) * .5)],
      ['定身', ((p.rootTime || 0) > 0 ? p.rootTime + 's · 期间禁用技能' : '关闭')],
      ['上限后', '每跳 ' + (p.chip != null ? p.chip : 1) + ' 持续压制'],
      ['背包充能', p.chargeDuration + 's · 每秒 ' + p.chargeDps + ' · 还包 ' + (p.armTime != null ? p.armTime : 5) + 's 可丢'],
      ['轻装', '体型 ×' + p.lightRadius + ' · 速度 ×' + p.lightSpeed],
    ];
    if (t === 'snowowl_snipe') return [
      ['狙击', p.damage + ' × ' + (p.shots != null ? p.shots : 3) + ' 发 · 蓄力 ' + p.chargeTime + 's'],
      ['三连', '间隔 ' + p.shotGap + 's · 后两枪更难命中'],
      ['后续枪', '瞄准滞后 +' + Math.round((p.followLagMul != null ? p.followLagMul : .6) * 100) + '%/枪 · 额外散布 ' + (p.followSpread != null ? p.followSpread : 10) + '°'],
      ['射程', p.range + ' · 弹速 ' + p.bulletSpeed],
      ['近身盲区', (p.minRange != null ? p.minRange : 0) + ' 内无法射击'],
      ['猎兵的陷阱', (p.counterDamage != null ? p.counterDamage : 0) + ' · 麻痹 ' + p.counterStun + 's · CD ' + p.counterCd + 's'],
      ['技能冷却', p.cd + 's（整组打完起算）'],
    ];
    if (t === 'shadow_dash') return [
      ['影袭', '每 ' + p.cd + 's 突进 · 原地留分身'],
      ['影分身', '上限 ' + p.cloneMax + ' · 持续 ' + p.cloneLife + 's'],
      ['乱刃', '本体 ' + p.shurikenCount + ' 枚 × ' + p.shurikenDamage + ' · 分身扑击 ' + p.cloneDamage],
      ['突进距离', Math.round(p.dashSpeed * p.dashTime) + ' 像素'],
    ];
    if (t === 'generic_burst') return [
      ['单发伤害', p.damage],
      ['技能冷却', p.cd + 's'],
    ];
    return [];
  }

  function keyAwaken(c) {
    const p = c.awaken.params || {};
    const t = c.awaken.type;
    if (t === 'skysaber_awaken') return [['穿梭总伤', p.contactDamage + ' · ' + p.hits + ' 段'], ['持续时间', p.duration + 's']];
    if (t === 'akigumo_awaken') return [['一闪伤害', p.guardDamage], ['阴阳流・刹那', '固定 3s · 阈值 ' + p.guardHp + ' 血']];
    if (t === 'akigumo_broken_awaken') return [
      ['一刀伤害', p.damage + ' · 半径 ' + p.range],
      ['黑洞联动', '斩杀时慢放 ' + p.slowMo + 's'],
      ['持续时间', p.duration + 's'],
    ];
    if (t === 'rhine_awaken') return [['爆风伤害', p.boomDamage], ['持续时间', p.duration + 's']];
    if (t === 'krista_awaken') return [['站桩', p.cast + 's · 免疫伤害'], ['恢复生命', p.heal]];
    if (t === 'vamp_awaken') return [
      ['圣域半径', p.radius + ' 身位'],
      ['每秒吸取', p.dps + ' · 回复 ' + p.heal],
      ['持续时间', p.duration + 's'],
    ];
    if (t === 'mimi_awaken') return [
      ['开局/每 ' + p.packEvery + 's', '获得 G·诺伦'],
      ['持续时间', p.duration + 's'],
    ];
    if (t === 'shadow_awaken') return [
      ['无间影狱', '接触触发 · 时停 ≥' + p.timeStop + 's（自动覆盖整套）· 每次觉醒 1 次'],
      ['穿梭', p.hits + ' 段 · 频率递增 · 基础间隔 ' + (p.hitGap != null ? p.hitGap : .58) + 's'],
      ['伤害', '前 ' + (p.hits - 1) + ' 段各 1 点 + 收尾 ' + (p.totalDamage - 1) + '（「滅」）'],
      ['突进', '每 ' + p.rushEvery + 's'],
    ];
    if (t === 'snowowl_awaken') return [
      ['免蓄力四连发', '每 ' + p.burstEvery + 's 一轮 · 组内 ' + p.burstGap + 's'],
      ['持续时间', p.duration + 's'],
      ['觉醒槽获取', '×' + (p.gainMul != null ? p.gainMul : 1)],
    ];
    return [['效果', '无']];
  }

  UI.cardHtml = function (f) {
    if (!f) return '';
    const c = f.char;
    const hp = Math.ceil(f.hp);
    const ratio = Math.max(0, Math.min(1, f.hp / f.maxHp)) * 100;
    const sk = D.SKILL_DEFS[c.skill.type];
    const aw = D.AWAKEN_DEFS[c.awaken.type];
    const av = c.avatar ? `background-image:url('${c.avatar}')` : `background:${c.color}`;
    const kv = arr => arr.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
    const st = kv(keyStat(c));
    const awv = kv(keyAwaken(c));
    const res = c.id === 'rhine' ? `进化 ${['—','Ⅰ','Ⅱ','Ⅲ'][Math.min(3, (f.evoLevel || 0))]}` : '';
    return `
      <div class="cc-head">
        <span class="cc-av" style="${av}"></span>
        <span class="cc-name" style="color:${c.color}">${escapeHtml(c.name)}</span>
        <span class="cc-cost">${c.cost}</span>
      </div>
      <div class="cc-hpbar"><div class="fill" style="width:${ratio}%"></div></div>
      <div class="cc-stats">
        <div><i>生命</i><b>${hp} / ${f.maxHp}</b></div>
        <div><i>移速</i><b>${c.moveSpeed}</b></div>
        <div><i>接触伤害</i><b>${c.contactDamage || (c.sword ? '大剑 ' + c.sword.damage : 0)}</b></div>
        <div><i>觉醒</i><b>${Math.round(f.awak)}%</b></div>
      </div>
      <div class="cc-skill">
        <span class="n">◆ ${sk ? escapeHtml(sk.name) : c.skill.type}</span>
        <div class="v">${st}</div>
        <div class="d">${sk ? escapeHtml(sk.desc) : ''}</div>
      </div>
      <div class="cc-skill aw">
        <span class="n">◇ ${aw ? escapeHtml(aw.name) : c.awaken.type}</span>
        <div class="v">${awv}</div>
        <div class="d">${aw ? escapeHtml(aw.desc) : ''}${res ? '<br>' + res : ''}</div>
      </div>`;
  };

  UI.syncSide = function () {
    const A = document.getElementById('cardA');
    const Bc = document.getElementById('cardB');
    if (!A || !B.fighters.length) return;
    A.innerHTML = this.cardHtml(B.fighters[0]);
    Bc.innerHTML = this.cardHtml(B.fighters[1]);
    const ll = document.getElementById('logList');
    if (ll) {
      const st = ll.scrollTop;
      /* 战报整局保留（上限 60 条），滚动位置不跳动 */
      ll.innerHTML = B.logs.map(l =>
        `<div class="log-item" style="color:${l.color}">${escapeHtml(l.text)}</div>`
      ).join('');
      ll.scrollTop = st;
    }
  };

  /* ============================ 待机场景 ============================ */
  UI.prepareIdle = function () {
    const a = D.get(D.selA) || D.chars[0];
    const b = D.get(D.selB) || D.chars[1] || D.chars[0];
    B.setup(a, b);
    B.state = 'idle';
    B.cd = 0;
    this.phase = 'bet';
    this.betSide = -1;
    this.resolved = false;
    this.overClock = 0;
    this.el.result.classList.add('hidden');
    this.syncButtons();
  };

  /* ============================ 选人 ============================ */
  UI.openPick = function (side) {
    const pop = this.el.pickPop;
    if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
    const cur = side === 0 ? D.selA : D.selB;
    pop.innerHTML = '';
    for (const c of D.chars) {
      /* 竞猜是纯观战，谁上场都能看，不受解锁限制；
         未解锁的加个淡标记，让人知道回大厅还要花积分买 */
      const locked = !D.isUnlocked(c.id);
      const d = document.createElement('div');
      d.className = 'pick-item' + (c.id === cur ? ' sel' : '') + (locked ? ' locked' : '');
      const av = c.avatar ? `background-image:url('${c.avatar}');background-size:cover;background-position:center;` : '';
      d.innerHTML = `<span class="pi-dot" style="background-color:${c.color};color:${c.color};${av}"></span>
        <span class="pi-name">${escapeHtml(c.name)}</span>
        ${locked ? '<span class="pi-tag">未解锁</span>' : (c.builtin ? '' : '<span class="pi-tag">自定义</span>')}
        <span class="pi-cost">COST ${c.cost}</span>`;
      d.addEventListener('click', () => {
        if (this.phase !== 'bet') { this.toast('本局进行中，结算后可换人'); return; }
        if (side === 0) D.selA = c.id; else D.selB = c.id;
        D.save();
        pop.classList.add('hidden');
        this.syncPicks();
        this.prepareIdle();
        A.ui();
      });
      pop.appendChild(d);
    }
    pop.classList.remove('hidden');
  };

  UI.syncPicks = function () {
    const a = D.get(D.selA) || D.chars[0];
    const b = D.get(D.selB) || D.chars[0];
    const set = (el, c) => {
      el.querySelector('.cp-name').textContent = c.name;
      el.querySelector('.cp-cost').textContent = c.cost;
      const dot = el.querySelector('.cp-dot');
      dot.style.background = c.color;
      dot.style.boxShadow = '0 0 10px ' + c.color;
      dot.style.backgroundImage = c.avatar ? `url('${c.avatar}')` : 'none';
      dot.style.backgroundSize = 'cover';
      dot.style.backgroundPosition = 'center';
    };
    set(this.el.pickA, a);
    set(this.el.pickB, b);
  };

  /* ============================ 下注 ============================ */
  UI.currentBet = function () {
    if (this.betAmt === 'max') return Math.max(1, D.wallet);
    return this.betAmt;
  };

  UI.syncBetLabels = function () {
    const amt = this.currentBet();
    const odds = D.odds(D.selA, D.selB);
    this.oddsNow = odds;
    this.el.oddsA.textContent = odds.a.toFixed(2) + '×';
    this.el.oddsB.textContent = odds.b.toFixed(2) + '×';
    this.el.labelA.textContent = '竞猜左';
    this.el.labelB.textContent = '竞猜右';
  };

  UI.syncWallet = function () {
    this.el.wallet.textContent = D.wallet;
    if (SW.Menu) SW.Menu.refreshWallet();
  };

  /* 重置：积分回到初始 1000，清空连胜记录（赔率是预设的，不受影响） */
  UI.resetRun = function () {
    if (!confirm('重置积分与连胜？\n积分将回到 1000，连胜纪录清空。赔率是按角色对位预先算好的，不会变。')) return;
    D.wallet = 1000;
    D.streak = 0;
    D.bestStreak = 0;
    D.history.length = 0;
    D.betAmt = 50;
    this.betAmt = 50;
    this.el.chipGroup.querySelectorAll('.chip').forEach(b => {
      b.classList.toggle('active', b.dataset.amt === '50');
    });
    D.save();
    this.syncWallet();
    this.syncBetLabels();
    if (A) A.ui();
    this.toast('已重置：积分 1000 · 连胜归零');
  };

  UI.syncButtons = function () {
    const on = this.phase === 'bet';
    [this.el.betA, this.el.betB, this.el.watch].forEach(b => { b.disabled = !on; });
    this.el.chipGroup.querySelectorAll('.chip').forEach(b => { b.disabled = !on; b.style.opacity = on ? 1 : .35; });
    this.el.pickA.style.opacity = on ? 1 : .55;
    this.el.pickB.style.opacity = on ? 1 : .55;
    this.el.betA.classList.remove('chosen');
    this.el.betB.classList.remove('chosen');
  };

  /* ============================ 开局 ============================ */
  UI.beginFight = function (mode) {
    this.mode = mode === 'fight' ? 'fight' : 'bet';
    document.body.classList.toggle('fight-mode', this.mode === 'fight');
    this.prepareIdle();
    if (this.mode === 'fight') this.placeBet(-1);
    else this.syncButtons();
  };

  UI.placeBet = function (side) {
    if (this.phase !== 'bet') return;
    if (this.mode === 'fight') side = -1;

    if (side >= 0) {
      const amt = this.currentBet();
      if (amt > D.wallet) {
        this.toast('积分不足');
        return;
      }
      this.betSide = side;
      this.betAmount = amt;
      if (side === 0) this.el.betA.classList.add('chosen');
      else this.el.betB.classList.add('chosen');
    } else {
      this.betSide = -1;
      this.betAmount = 0;
    }

    /* 确保使用的是最新选择的角色 */
    const a = D.get(D.selA) || D.chars[0];
    const b = D.get(D.selB) || D.chars[0];
    /* 赔率在下注这一刻定死，结算不再重算 */
    this.lockedOdds = D.odds(a.id, b.id);
    B.setup(a, b);
    B.state = 'ready';
    B.cd = 2.8;
    this.phase = 'running';
    this.resolved = false;
    this.overClock = 0;
    this.syncButtons();
    A.ui();
  };

  /* ============================ 每帧 ============================ */
  UI.tick = function (dt) {
    /* PvE 有自己的一套 HUD，不跑押注/结算流程 */
    if (B.pveOn) return;
    this.sideT = (this.sideT || 0) - dt;
    if (this.sideT <= 0) {
      this.sideT = 0.15;
      try { this.syncSide(); } catch (e) {}
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.banner.classList.add('hidden');
    }

    if (this.phase === 'running') {
      if (B.state === 'over') {
        this.overClock += dt;
        if (this.overClock > 1.5 && !this.resolved) {
          this.resolved = true;
          this.settle();
        }
      }
    } else if (this.phase === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.el.result.classList.add('hidden');
        const back = this.mode === 'fight';
        this.prepareIdle();
        if (back) {
          this.mode = 'bet';
          document.body.classList.remove('fight-mode');
          if (SW.Menu) SW.Menu.show();
        }
      }
    }
  };

  /* ============================ 结算 ============================ */
  UI.settle = function () {
    const winner = B.winner;
    const winChar = B.fighters[winner] ? B.fighters[winner].char : null;
    const loseChar = B.fighters[1 - winner] ? B.fighters[1 - winner].char : null;

    let moneyLine = '';
    let moneyCls = '';
    let streakLine = '';

    if (this.mode === 'fight') {
      D.wallet += 60;
      moneyLine = '+60 积分 · 观战奖励';
      moneyCls = 'gain';
    } else if (this.betSide >= 0) {
      const odds = this.lockedOdds || D.odds(D.selA, D.selB);
      if (this.betSide === winner) {
        const odd = this.betSide === 0 ? odds.a : odds.b;
        const payout = Math.round(this.betAmount * odd);
        const gain = payout - this.betAmount;
        D.wallet += gain;
        D.streak++;
        moneyLine = '+' + gain + ' 积分';
        moneyCls = 'gain';
        A.win();
      } else {
        D.wallet -= this.betAmount;
        D.streak = 0;
        moneyLine = '-' + this.betAmount + ' 积分';
        moneyCls = 'loss';
        A.lose();
      }
      if (D.wallet < 10) {
        D.wallet += 200;
        setTimeout(() => this.toast('补给 200 积分'), 900);
      }
    } else {
      moneyLine = '旁观，未参与竞猜';
      moneyCls = '';
    }

    D.bestStreak = Math.max(D.bestStreak, D.streak);
    D.record(winner);
    D.save();
    this.syncWallet();
    this.syncBetLabels();

    if (D.streak > 1) streakLine = `连胜 ${D.streak}　最高 ${D.bestStreak}`;

    /* 战斗统计 */
    const s = B.summary();
    const stat = `${s[0].name} ${s[0].dealt} 伤害　·　${s[1].name} ${s[1].dealt} 伤害`;

    this.el.result.innerHTML = `
      <div class="r-win">${this.mode === 'fight' ? '对局结果' : '竞猜结果'}</div>
      <div class="r-name" style="color:${winChar ? winChar.color : '#fff'};text-shadow:0 0 22px ${winChar ? winChar.color : '#fff'}66">
        ${winChar ? escapeHtml(winChar.name) : '—'}
      </div>
      <div class="r-sub">${loseChar ? escapeHtml(loseChar.name) + ' COST 归零' : ''}</div>
      <div class="r-line"></div>
      <div class="r-money ${moneyCls}">${moneyLine}</div>
      ${streakLine ? `<div class="r-streak">${streakLine}</div>` : ''}
      <div class="r-sub" style="margin-top:8px;opacity:.7">${stat}</div>
      <div class="r-sub" style="margin-top:4px;opacity:.5">${(B.time).toFixed(1)} 秒　·　${nextHint(this.mode)}</div>
    `;
    this.el.result.classList.remove('hidden');
    this.phase = 'result';
    this.resultTimer = this.mode === 'fight' ? 4.6 : 4.2;
  };

  function nextHint(mode) {
    return mode === 'fight' ? '返回大厅' : '即将进入下一局';
  }

  /* ============================ 提示 ============================ */
  UI.toast = function (msg) {
    const b = this.el.banner;
    b.textContent = msg;
    b.classList.add('small');
    b.classList.remove('hidden');
    this.toastT = 1.6;
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  SW.UI = UI;
})(window.SW);
