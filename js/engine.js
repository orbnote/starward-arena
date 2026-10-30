/* 星之翼 · 球体竞技场 —— 战斗引擎 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U, Fx = SW.Fx, A = SW.Audio;

  const B = {
    W: 0, H: 0,
    field: { x: 0, y: 0, w: 0, h: 0 },
    state: 'idle',      // idle | ready | fight | over
    cd: 0,
    time: 0,
    speed: 1,
    fighters: [],
    projectiles: [],
    packs: [],          /* 米米姐的背包 G·诺伦 */
    zones: [],          /* 巨大爆炸领域 */
    mines: [],          /* 雪鸮格反留下的手雷 */
    timeStop: null,
    shake: 0,
    shakeX: 0, shakeY: 0,
    slowmo: 1,
    slowT: 0,           /* 觉醒演出慢动作（按真实时间倒数） */
    slowMul: .34,
    hole: null,         /* 破破烂烂-秋云：场地中心的黑洞 */
    winner: -1,
    overT: 0,
    hitFlash: 0,
    flashColor: '255,255,255',
    lastHit: null,
    logs: [],
    parryFlash: 0,
    parryX: 0,
    parryY: 0,
    cutinFx: null,
    cutinQ: [],
    costLeadTaunt: false,
  };

  /* 全局视觉参数（字幕 / 伤害字号），工坊可调 */
  function fxCfg() { return (SW.Data && SW.Data.fx) || {}; }

  /* 技能字幕：大招/特殊技能触发时全屏展示
     opt: { big: 强力技能（停留更久）, small: 小字幕, dur: 强制时长 } */
  B.cutin = function (text, color, sub, opt) {
    const c = fxCfg();
    const o = (typeof opt === 'number') ? { dur: opt } : (opt || {});
    let dur = o.dur;
    if (dur == null) dur = o.small ? (c.cutinSmall || 1.0) : (o.big ? (c.cutinBig || 2.4) : (c.cutinDur || 1.5));
    const item = {
      text, color: color || '#ffd166', sub: sub || '', t: 0, total: dur,
      big: !!o.big,
    };
    /* 新字幕立即顶掉旧字幕，不排队等待 */
    this.cutinFx = item;
    this.cutinQ.length = 0;
  };

  /* ============================ 诊断追踪 ============================
     记录技能结算的关键节点与「伤害被吞」的原因，便于排查。
     B.traceOn = true 时记录全部伤害拒绝，否则只记录招架/一闪相关。 */
  B.traceOn = false;
  B.trace = [];
  B.traceAdd = function (kind, extra) {
    if (this.trace.length > 500) this.trace.shift();
    const e = extra || {};
    e.kind = kind;
    e.t = Math.round(this.time * 100) / 100;
    this.trace.push(e);
  };
  /* 快照目标的「可受伤状态」，用于定位吞伤害原因 */
  function dstState(dst) {
    if (!dst) return 'no-target';
    if (dst.dead) return 'dead';
    if (dst.invuln > 0) return 'invuln(' + dst.invuln.toFixed(2) + ')';
    if (dst.noCollide) return 'noCollide';
    if (dst.bastion) return 'bastion';
    if (dst.parryCast) return 'parryCast';
    if (dst.chargeState && dst.chargeState.immuneShot) return 'immuneshot';
    return 'ok';
  }

  /* 战况日志（整局保留，新开局才清空） */
  B.log = function (text, color) {
    this.logs.unshift({ text, color: color || '#cfe4ff', life: Infinity, max: Infinity });
    if (this.logs.length > 60) this.logs.pop();
  };

  /* 命中日志：0.7 秒内同类合并伤害 */
  B.logHit = function (target, tag, dmg) {
    const key = target.char.id + ':hit:' + tag;
    const last = this.logs[0];
    if (last && last.key === key && this.time - last.t < 0.7) {
      last.dmg += dmg;
      last.text = target.char.short + ' 被' + tag + '命中 -' + Math.round(last.dmg);
      last.life = last.max;
      last.t = this.time;
      return;
    }
    this.logs.unshift({
      text: target.char.short + ' 被' + tag + '命中 -' + Math.round(dmg),
      color: '#ff9aa6', key, t: this.time, dmg: dmg,
      life: Infinity, max: Infinity,
    });
    if (this.logs.length > 60) this.logs.pop();
  };

  /* 发射日志：0.8 秒内合并次数 */
  B.logFire = function (f, name) {
    const key = f.char.id + ':fire:' + name;
    const last = this.logs[0];
    if (last && last.key === key && this.time - last.t < 0.8) {
      last.count = (last.count || 1) + 1;
      last.text = f.char.short + ' ' + name + ' ×' + last.count;
      last.life = last.max;
      last.t = this.time;
      return;
    }
    this.logs.unshift({
      text: f.char.short + ' ' + name,
      color: f.char.color, key, t: this.time, count: 1,
      life: Infinity, max: Infinity,
    });
    if (this.logs.length > 60) this.logs.pop();
  };

  /* ============================ 布局 ============================ */
  B.layout = function (w, h) {
    const first = this.W === 0;
    const oldF = this.field;
    this.W = w; this.H = h;
    if (this.pveOn) {
      /* PvE 用竖长场地：1v1 的方形场地在群怪下没有走位空间。
         手机底部那三列两行的装备面板占掉一截，场地底边要让到面板上面去，
         否则怪会藏在面板底下打你 —— 桌面端面板在左侧竖排，底部只留退出按钮。 */
      const mobile = w <= 700;
      const fw = w * 0.94;
      const padT = h * 0.135;
      const padB = mobile ? Math.min(h * 0.19, 190) : h * 0.10;
      this.field = { x: (w - fw) / 2, y: padT, w: fw, h: h - padT - padB };
    } else {
      const size = Math.min(w, h) * 0.86;
      this.field = {
        x: (w - size) / 2,
        y: (h - size) / 2,
        w: size,
        h: size,
      };
    }

    if (!first && oldF.w > 0 && this.fighters.length) {
      const f = this.field;
      for (const ft of this.fighters) {
        ft.x = f.x + (ft.x - oldF.x) / oldF.w * f.w;
        ft.y = f.y + (ft.y - oldF.y) / oldF.h * f.h;
        const formK = ft.form === 'light'
          ? ((ft.char.skill && ft.char.skill.params && ft.char.skill.params.lightRadius) || .72)
          : 1;
        ft.r = ft.char.radius * this.scale() * (1 + 0.1 * (ft.evoLevel || 0)) * formK;
      }
    }
  };

  B.scale = function () {
    return U.clamp(Math.min(this.W, this.H) / 540, 0.62, 1.5);
  };

  B.spawnPoint = function (team) {
    const f = this.field;
    return {
      x: f.x + f.w * (team === 0 ? 0.27 : 0.73),
      y: f.y + f.h * 0.52,
    };
  };

  /* ============================ 创建 ============================ */
  B.setup = function (charA, charB) {
    this.state = 'ready';
    this.cd = 2.8;
    this.time = 0;
    this.projectiles.length = 0;
    this.packs.length = 0;
    this.zones.length = 0;
    this.mines.length = 0;
    this.timeStop = null;
    this.shake = 0;
    this.slowmo = 1;
    this.slowT = 0;
    this.hole = null;
    this.winner = -1;
    this.overT = 0;
    this.hitFlash = 0;
    this.logs.length = 0;
    this.cutinFx = null;
    this.cutinQ.length = 0;
    this.costLeadTaunt = false;
    Fx.clear();

    this.fighters = [this.makeFighter(charA, 0), this.makeFighter(charB, 1)];
    this.launch(this.fighters[0], this.fighters[1]);
    this.launch(this.fighters[1], this.fighters[0]);
    this.autosave = false;
  };

  B.makeFighter = function (char, team) {
    const sp = this.spawnPoint(team);
    return {
      char, team,
      x: sp.x, y: sp.y, vx: 0, vy: 0,
      r: char.radius * this.scale(),
      speedBase: char.moveSpeed * this.scale() * 1.38,
      maxHp: char.hp, hp: char.hp,
      costPool: 6,
      awak: 0, awaken: 0, awakenArmed: false,
      invuln: 0, stun: 0, flash: 0, hitDelay: 0,
      dead: false, respawnT: 0, deathT: 0,
      skillCd: 1.2, cast: null,
      reshin: 1, chargeState: null, bite: null,
      shura: null, shuraCd: 1.2, shuraSlash: null, shuraAwakeT: 0,
      biteWait: 0, biteDone: false, snipe: null, burst: null, counterCd: 0,
      shadowClones: [], shadowDash: null, shadowBurst: null, shadowBurstUsed: false, shadowRushT: 0, shadowVolleyT: 0,
      rootT: 0, rootX: null, rootY: null,
      form: 'heavy', hasPack: true, packT: 0, packCd: 4,
      evo: 0, evoLevel: 0, fireCd: 2.4, laserCd: 6,
      parry: 0, parryCast: null,
      contactCd: 0, stagger: 0, noCollide: false, pushT: 5,
      orbitDir: Math.random() < 0.5 ? 1 : -1, orbitT: U.rand(1.5, 3), orbitPhase: U.rand(0, 6.28),
      trail: [], trailT: 0,
      stats: { dealt: 0, taken: 0, hits: 0 },
      aiT: 0,
      facing: team === 0 ? 1 : -1,
    };
  };

  /* 初始动量：朝对手方向随机偏转 */
  B.launch = function (f, e) {
    const base = Math.atan2(e.y - f.y, e.x - f.x) + U.rand(-0.55, 0.55);
    const spd = f.speedBase || f.char.moveSpeed * this.scale();
    f.vx = Math.cos(base) * spd;
    f.vy = Math.sin(base) * spd;
  };

  B.reset = function () {
    this.state = 'idle';
    this.fighters = [];
    this.projectiles.length = 0;
    Fx.clear();
  };

  /* ============================ PvE（群怪） ============================ */
  /* 与 1v1 完全隔离：只有 B.pveOn 为 true 才进入本段。
     1v1 的 contact / bounceBalls / COST / 超时判定全部原样保留。 */
  B.pveOn = false;
  B.pve = null;

  const MOB_SRC = 'vampkrista';

  /* 怪的种类表：数值走吸血鬼幸存者的量级
     近战四种（P2）+ 克丽丝塔系五种（P4，技能取自星之翼原作） */
  const MOB_KIND = {
    /* art：这个兵种专属的立绘。文件还没有时会自动回落到共用立绘，
       所以把 GPT 生成的图按名字丢进 assets/ 就生效，不用改代码。 */
    bat: { name: '蝙蝠', hp: 1, speed: 62, radius: 13, color: '#b98cff', xp: 1, dmg: 1,
      art: 'assets/mob_bat.png', artScale: 2.2 },
    zombie: { name: '僵尸', hp: 3, speed: 42, radius: 18, color: '#7adf9c', xp: 1, dmg: 2,
      art: 'assets/em_yawn.png', artScale: 2.3 },
    skeleton: { name: '骷髅', hp: 5, speed: 80, radius: 15, color: '#ffd166', xp: 2, dmg: 3,
      art: 'assets/em_dumb.png', artScale: 2.4 },
    elite: { name: '精英', hp: 46, speed: 48, radius: 30, color: '#ff6b6b', xp: 8, dmg: 8, elite: true,
      art: 'assets/em_grit.png', artScale: 1.7 },

    /* —— 猎剑修女：唯一比玩家跑得快的杂兵。
       场上一旦只剩「慢慢追」的怪，玩家就能绕着全图无限风筝，这是之前
       后期无敌的根本原因。她举着大剑直线突刺，血很薄，但必须先处理掉。
       转向被卡死（turn 1.9 rad/s）：贴身绕着她转就能甩开剑尖，这是她唯一的解。 —— */
    hound: {
      name: '猎剑修女', hp: 5, speed: 300, radius: 17, color: '#6ef0a0', xp: 3, dmg: 3,
      maxAlive: 3, sprite: 'assets/vamp_ready.webp', ai: 'lance',
      art: 'assets/em_smirk.png', artScale: 2.3,
      tint: [120, 240, 150],
      aiP: {
        turn: 0.55,           /* 转向角速度：横向一闪就甩掉，它掰不回来 */
        lungeCd: 2.6,
        lungeWind: 0.5,       /* 蓄力：出场先站住亮剑，给玩家反应 */
        lungeT: 1.6,          /* 上限，实际基本都撞墙提前结束 */
        lungeMul: 2.0,
        stunT: 1.2,           /* 撞墙僵直 */
        restart: 0.8,         /* 僵直结束后从 15% 速度慢慢推起来 */
      },
    },

    /* —— 侍从：信仰之壁（防御射击派生，十字麻痹弹） —— */
    acolyte: {
      name: '侍从', hp: 5, speed: 52, radius: 20, color: '#9fdcff', xp: 2, dmg: 3, maxAlive: 14,
      sprite: 'assets/krista_acolyte.webp', ai: 'ranged',
      aiP: { keep: 155, cd: 3.2, wind: 0.5, speed: 180, dmg: 2, r: 8, kind: 'cross', slow: 1.2 },
    },
    /* —— 唱诗：净化之光（后副射击，照射） —— */
    choir: {
      name: '唱诗', hp: 6, speed: 36, radius: 22, color: '#ff86c6', xp: 3, dmg: 4, maxAlive: 6,
      sprite: 'assets/krista_choir.webp', ai: 'beam',
      aiP: { keep: 200, cd: 4.6, wind: 1.05, beamT: 0.5, dmg: 6, len: 380, wid: 16 },
    },
    /* —— 圣刃：圣光之刃（副格斗，蓄力突刺） —— */
    blade: {
      name: '圣刃', hp: 10, speed: 58, radius: 21, color: '#ffe08a', xp: 3, dmg: 3, maxAlive: 10,
      sprite: 'assets/krista_blade.webp', ai: 'dash',
      aiP: { keep: 170, cd: 3.0, wind: 0.6, dashT: 0.38, mul: 4.4, dmg: 12 },
    },
    /* —— 炮手：公务箱·炮击（副射击，大判定慢弹） —— */
    cannon: {
      name: '炮手', hp: 14, speed: 32, radius: 23, color: '#c9a4ff', xp: 4, dmg: 4, maxAlive: 10,
      sprite: 'assets/krista_cannon.webp', ai: 'ranged',
      aiP: { keep: 205, cd: 3.8, wind: 0.75, speed: 118, dmg: 5, r: 15, kind: 'orb' },
    },
    /* —— 血月修女：血域 · 环绕红剑（贴身型 BOSS，逼你绕背）
       2 分钟先来一只只会冲撞的眷属（跟普通精英没差），4 分钟单剑、8 分钟三剑，
       之后每 5 分钟沿旧节奏加血环、加月蚀落弹。tint 决定剑与血域的颜色。 —— */
    blood0: {
      name: '血月修女·眷属', hp: 130, speed: 54, radius: 31, color: '#e0556b', xp: 90, dmg: 6, elite: true,
      sprite: 'assets/vamp_ready.webp', ai: 'blood', art: 'assets/em_sad.png', artScale: 1.9, tint: [222, 104, 124],
      aiP: {
        keep: 92, dashCd: 3.0, dashSpeed: 575,
      },
    },
    /* 单剑：一把超长血剑慢转，招牌是「血月轮」—— 蓄力半秒后整圈扫下来 */
    blood: {
      name: '血月修女·孤刃', hp: 180, speed: 56, radius: 34, color: '#e0405a', xp: 120, dmg: 10, elite: true,
      sprite: 'assets/vamp_ready.webp', ai: 'blood', art: 'assets/em_sad.png', artScale: 1.9, tint: [255, 72, 105],
      aiP: {
        keep: 96, bladeN: 1, bladeLen: 4.2, bladeW: 0.2, spin: 2.4,
        bladeDmg: 7, bladeCd: 0.8,
        fieldCd: 8.5, fieldT: 2.6, fieldR: 200, fieldDps: 3,
        dashCd: 3.6, dashSpeed: 620,
        swingCd: 6.4, swingWind: 0.55,
      },
    },
    /* 三剑：三把剑 120° 分布，招牌是「三日月」—— 三剑合拢甩出三道月牙刀光 */
    blood2: {
      name: '血月修女·三刃', hp: 250, speed: 58, radius: 35, color: '#d0206a', xp: 150, dmg: 11, elite: true,
      sprite: 'assets/vamp_ready.webp', ai: 'blood', art: 'assets/em_sad.png', artScale: 1.9, tint: [255, 44, 128],
      aiP: {
        keep: 98, bladeN: 3, bladeLen: 3.4, bladeW: 0.17, spin: 1.6,
        bladeDmg: 10, bladeCd: 0.65,
        fieldCd: 6.6, fieldT: 2.7, fieldR: 205, fieldDps: 6,
        dashCd: 3.2, dashSpeed: 650,
        swingCd: 4.8, swingWind: 0.5,
        moonCd: 3.6, moonN: 3, moonDmg: 7,
      },
    },
    blood3: {
      name: '血月修女·蔷薇', hp: 330, speed: 60, radius: 37, color: '#b02a9e', xp: 170, dmg: 11, elite: true,
      sprite: 'assets/vamp_ready.webp', ai: 'blood', art: 'assets/em_sad.png', artScale: 1.9, tint: [234, 58, 210],
      aiP: {
        keep: 100, bladeN: 4, bladeLen: 3.6, bladeW: 0.16, spin: 1.5,
        bladeDmg: 11, bladeCd: 0.6,
        fieldCd: 5.8, fieldT: 2.8, fieldR: 215, fieldDps: 7,
        dashCd: 3.0, dashSpeed: 680,
        swingCd: 4.4, swingWind: 0.48,
        moonCd: 3.2, moonN: 4, moonDmg: 8,
        ringCd: 6.0, ringN: 8, ringDmg: 5, ringSpeed: 150,
      },
    },
    blood4: {
      name: '血月修女·月蚀', hp: 440, speed: 64, radius: 39, color: '#8a2090', xp: 200, dmg: 12, elite: true,
      sprite: 'assets/vamp_ready.webp', ai: 'blood', art: 'assets/em_sad.png', artScale: 1.9, tint: [188, 76, 255],
      aiP: {
        keep: 102, bladeN: 5, bladeLen: 3.7, bladeW: 0.16, spin: 1.65,
        bladeDmg: 12, bladeCd: 0.55,
        fieldCd: 5.0, fieldT: 2.9, fieldR: 225, fieldDps: 8,
        dashCd: 2.8, dashSpeed: 720,
        swingCd: 4.0, swingWind: 0.45,
        moonCd: 2.8, moonN: 5, moonDmg: 9,
        ringCd: 4.6, ringN: 12, ringDmg: 6, ringSpeed: 165,
        fieldBurst: true,
      },
    },
  };

  /* 兵种打法说明：图鉴用。写「怎么处理」，不写「是什么」。 */
  const MOB_TIP = {
    bat: '最便宜的量产货，单只没威胁，靠数量贴脸。',
    zombie: '慢、厚、黏人，堵住走位用的，优先绕过。',
    skeleton: '中速，咬一口很疼，别让它进内圈。',
    elite: '血厚走得慢，撞开它太亏，绕开打。',
    hound: '先举剑蓄力，再一条直线冲到底，撞上墙会晕一两秒。冲出去之后拐不了弯，侧一步让开，它自己会撞墙。',
    acolyte: '远程十字弹，命中会麻痹；趁它蓄力贴上去。',
    choir: '站定蓄力后打一条直线照射，看红线横移即可。',
    blade: '蓄力后突刺，一次高伤；看到亮起就侧移。',
    cannon: '大判定慢弹，走位拉开就行，别站着不动。',
    blood0: '只会冲撞的眷属，先练手；绕背后随便打。',
    blood: '单剑慢转 + 血月轮整圈扫（留缺口），缺口里就是安全区。',
    blood2: '三剑 120° 分布，加「三日月」三道月牙，缺口更小。',
    blood3: '四剑＋血环弹幕，血域落地别站里面。',
    blood4: '五剑＋月蚀，血域落地还会内收一圈血弹，绕背是最优解。',
  };
  B.mobTips = MOB_TIP;

  /* BOSS 排期：2 分钟眷属 → 4 分钟单剑 → 8 分钟三剑，
     之后回到每 5 分钟一档的老节奏（蔷薇 → 月蚀 → 月蚀继续加血） */
  const BOSS_PLAN = [120, 240, 480];
  const BOSS_TIERS = ['blood0', 'blood', 'blood2', 'blood3', 'blood4'];

  function mobChar(kind) {
    const base = SW.Data.get(MOB_SRC) || SW.Data.chars[0];
    const c = Object.assign({}, base);
    c.id = 'mob';
    c.name = kind.name;
    c.short = kind.name;
    c.hp = kind.hp;
    c.radius = kind.radius;
    c.moveSpeed = kind.speed;
    c.contactDamage = 0;
    c.cost = 0;
    c.color = kind.color;
    c.color2 = kind.color2 || '#ffffff';
    /* 每只怪用自己的立绘：清空 faces / skill，避免继承吸血鬼小修女的换脸逻辑 */
    c.faces = null;
    /* 兵种专属立绘（kind.art）存在就用它，没有才套共用立绘；
       没有立绘的兵种画成色块，别一律套修女图 —— 追猎者要靠外形一眼分辨 */
    const own = kind.art && SW.Assets && SW.Assets.get(kind.art) ? kind.art : null;
    c.avatar = own || kind.sprite || (kind.noSprite ? null : 'assets/vamp_ready.webp');
    /* 专属立绘的视觉放大（只放大贴图，不改碰撞半径） */
    c.artScale = kind.artScale || 1;
    /* 有专属立绘的兵种，底座退成一层软阴影（颜色还在，但不再像盘子） */
    c.haveArt = !!own;
    c.skill = { type: 'none' };
    c.awaken = { type: 'none' };
    return c;
  }

  /* 30 分钟波次表：参照 Mad Forest「每分钟换一波」，场上数按竖屏压缩到 15→120
     k 数组里重复的项就是权重：远程兵始终只占 2~5 成，靠协同而不是数量堆死玩家
     1:30 起远程登场，5 分钟起成形，后期四种远程轮换 */
  const WAVES = [
    { t: 0, k: ['bat'], cap: 15, gap: 1.00, elite: 0 },
    { t: 60, k: ['bat', 'bat', 'bat', 'zombie'], cap: 24, gap: 0.95, elite: 0 },
    { t: 90, k: ['bat', 'bat', 'bat', 'acolyte'], cap: 30, gap: 0.86, elite: 0 },
    { t: 150, k: ['zombie', 'zombie', 'bat', 'bat', 'acolyte'], cap: 38, gap: 0.72, elite: 0 },
    { t: 210, k: ['skeleton', 'skeleton', 'zombie', 'hound', 'acolyte'], cap: 45, gap: 0.62, elite: 0 },
    { t: 270, k: ['acolyte', 'acolyte', 'cannon', 'zombie', 'hound', 'zombie'], cap: 50, gap: 0.60, elite: 1 },
    { t: 330, k: ['skeleton', 'skeleton', 'hound', 'choir'], cap: 55, gap: 0.56, elite: 0 },
    { t: 390, k: ['acolyte', 'acolyte', 'blade', 'hound', 'zombie'], cap: 60, gap: 0.52, elite: 0 },
    { t: 450, k: ['cannon', 'choir', 'zombie', 'zombie', 'hound', 'zombie'], cap: 64, gap: 0.50, elite: 1 },
    { t: 510, k: ['blade', 'blade', 'acolyte', 'skeleton', 'hound', 'skeleton'], cap: 68, gap: 0.48, elite: 0 },
    { t: 570, k: ['choir', 'cannon', 'acolyte', 'zombie', 'zombie', 'hound', 'zombie'], cap: 72, gap: 0.46, elite: 0 },
    { t: 630, k: ['blade', 'blade', 'choir', 'zombie', 'zombie', 'hound', 'zombie'], cap: 76, gap: 0.44, elite: 0 },
    { t: 690, k: ['acolyte', 'acolyte', 'cannon', 'skeleton', 'zombie', 'hound', 'zombie'], cap: 80, gap: 0.42, elite: 1 },
    { t: 750, k: ['choir', 'choir', 'blade', 'skeleton', 'zombie', 'hound', 'zombie'], cap: 82, gap: 0.40, elite: 0 },
    { t: 810, k: ['cannon', 'acolyte', 'choir', 'zombie', 'zombie', 'hound', 'zombie'], cap: 84, gap: 0.38, elite: 0 },
    { t: 870, k: ['blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 86, gap: 0.36, elite: 0 },
    { t: 930, k: ['choir', 'blade', 'acolyte', 'zombie', 'zombie', 'hound', 'zombie'], cap: 88, gap: 0.34, elite: 1 },
    { t: 990, k: ['cannon', 'choir', 'acolyte', 'zombie', 'zombie', 'hound', 'zombie'], cap: 90, gap: 0.33, elite: 0 },
    { t: 1050, k: ['blade', 'acolyte', 'choir', 'skeleton', 'zombie', 'hound', 'zombie'], cap: 92, gap: 0.32, elite: 0 },
    { t: 1110, k: ['cannon', 'blade', 'choir', 'zombie', 'zombie', 'hound', 'zombie'], cap: 94, gap: 0.30, elite: 0 },
    { t: 1170, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 100, gap: 0.26, elite: 1 },
    { t: 1230, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 106, gap: 0.24, elite: 0 },
    { t: 1290, k: ['acolyte', 'choir', 'blade', 'cannon', 'skeleton', 'hound', 'zombie'], cap: 110, gap: 0.23, elite: 0 },
    { t: 1350, k: ['acolyte', 'choir', 'blade', 'cannon', 'skeleton', 'hound', 'zombie'], cap: 118, gap: 0.21, elite: 0 },
    { t: 1410, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 124, gap: 0.20, elite: 1 },
    { t: 1470, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 130, gap: 0.18, elite: 0 },
    { t: 1530, k: ['acolyte', 'choir', 'blade', 'cannon', 'skeleton', 'hound', 'zombie'], cap: 138, gap: 0.17, elite: 0 },
    { t: 1590, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 144, gap: 0.15, elite: 0 },
    { t: 1650, k: ['acolyte', 'choir', 'blade', 'cannon', 'skeleton', 'hound', 'zombie'], cap: 152, gap: 0.14, elite: 1 },
    { t: 1710, k: ['acolyte', 'choir', 'blade', 'cannon', 'zombie', 'hound', 'zombie'], cap: 160, gap: 0.12, elite: 0 },
  ];

  function waveAt(elapsed) {
    let w = WAVES[0];
    for (const x of WAVES) {
      if (elapsed >= x.t) w = x;
      else break;
    }
    return w;
  }

  /* 血量曲线：每 30 秒 ×1.055，30 分钟约 25 倍（VS 千级，等武器池齐了再抬） */
  /* 血量曲线：每 30 秒 ×1.045；10 分钟后再叠一条加速，
     否则后期武器全满、怪血跟不上，就又变成「绕圈收割」。 */
  function hpMulAt(elapsed) {
    const base = Math.pow(1.045, elapsed / 30);
    const late = elapsed > 600 ? 1 + (elapsed - 600) / 600 * 0.45 : 1;
    return base * late;
  }

  /* 玩家最近的活怪 */
  function nearestMob(f) {
    let best = null, bd = Infinity;
    for (const m of B.fighters) {
      if (!m.isMob || m.dead) continue;
      const dx = m.x - f.x, dy = m.y - f.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /* 弹道候选目标：只在 PvE 用（1v1 保持原来的单目标判定，零改动） */
  function targetList(owner) {
    const out = [];
    if (!owner) return out;
    for (const f of B.fighters) {
      if (f === owner || f.dead) continue;
      if (owner.isMob ? !f.isMob : f.isMob) out.push(f);
    }
    return out;
  }

  /* ===== 鞭子：面向方向的间歇扇形挥砍（替代 1v1 的接触伤害） ===== */
  const WHIP = { interval: 1.35, reach: 132, half: 1.0, dmg: 400, knock: 170 };

  /* ===== 经验与升级：曲线照抄 VS（1→2 需 5，之后每级 +10） ===== */
  function xpNeedFor(lvl) { return 5 + (lvl - 1) * 10; }

  /* 觉醒条 = 3 段经验。每填满 1 段 = 升 1 级（三选一），填满 3 段才开一次觉醒。
     以前「每次升级都觉醒」，觉醒技放得太密，整局都在光环里打；现在觉醒是 1/3 的频率。 */
  const AWAKEN_SEGS = 3;

  /* 补给卡：不是 VS 的独立分类，只是低权重的兜底（对应原作的 Hollow Heart / 烤鸡回复）。
     早期只有一把鞭子时留下的「鞭击/疾鞭/长鞭/双鞭/轻身」已删除 ——
     现在 8 把武器各有 5 级成长，再抽这些等于抽空卡。 */
  const UPGRADES = [
    { id: 'hp', name: '强健', ico: '命', desc: '生命上限 +40 并回满', max: 5, w: 46 },
    { id: 'heal', name: '烤鸡', ico: '鸡', desc: '回复 45 生命', max: 99, w: 26 },
  ];

  function grantXp(v) {
    const pv = B.pve;
    if (!pv) return;
    pv.xp += v;
    let leveled = false;
    while (pv.xp >= pv.xpNeed) {
      pv.xp -= pv.xpNeed;
      pv.lvl++;
      pv.xpNeed = xpNeedFor(pv.lvl);
      pv.pendingUp++;
      /* 一格 = 一级；三格满了才把「觉醒」排进队列 */
      pv.seg = (pv.seg || 0) + 1;
      if (pv.seg >= AWAKEN_SEGS) {
        pv.seg = 0;
        pv.awkN = (pv.awkN || 0) + 1;
      }
      pv.halfAwk = 0;
      leveled = true;
    }
    /* 雪鸮：觉醒条最后一格过半时，额外开一次短觉醒 */
    if (pv.passiveKey === 'snowowl' && !pv.halfAwk && pv.seg === AWAKEN_SEGS - 1
      && pv.xp >= pv.xpNeed * 0.5) {
      pv.halfAwk = 1;
      if (!pv.paused) startAwaken(0.55);
    }
    if (!leveled) return;
    if (!pv.paused) pv.paused = true;
    Fx.text(pv.player.x, pv.player.y - 52, 'LEVEL ' + pv.lvl, '#ffe6a8', 20);
    /* 无 UI（Node 跑测）时自动随机选，保证模拟能继续 */
    if (pv.autoPick) {
      while (pv.pendingUp > 0) {
        const opts = B.pveRoll(1);
        if (!opts.length) { pv.pendingUp = 0; pv.paused = false; break; }
        B.pvePick(opts[0].id);
      }
    }
  }

  function spawnGem(x, y, v) {
    const pv = B.pve;
    if (!pv) return;
    /* 上限 200：满了就把最旧的一颗直接结算，防止 30 分钟局堆成几万 */
    if (pv.gems.length >= 120) grantXp(pv.gems.shift().v);
    pv.gems.push({ x, y, v: v || 1, t: 0 });
  }

  function updateGems(dt) {
    const pv = B.pve;
    if (!pv || !pv.gems.length) return;
    const p = pv.player;
    const R = (pv.pickR || 92) * B.scale();
    const R2 = R * R;
    const pk = (p.r + 9) * (p.r + 9);
    for (let i = pv.gems.length - 1; i >= 0; i--) {
      const g = pv.gems[i];
      g.t += dt;
      /* 25 秒没捡到就自动吸收，防止场上堆成一片 */
      if (g.t > 25) { pv.gems.splice(i, 1); grantXp(g.v); continue; }
      const dx = p.x - g.x, dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= pk) {
        pv.gems.splice(i, 1);
        grantXp(g.v);
        continue;
      }
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 1;
        const sp = 320 * B.scale();
        g.x += dx / d * sp * dt;
        g.y += dy / d * sp * dt;
      }
    }
  }

  /* UI 层抽 3 张牌（引擎只负责池子与去重） */
  B.pveRoll = function (n) {
    const pv = this.pve;
    if (!pv) return [];
    /* 卡池只有两类：武器 / 配件。补给只在抽不满时兜底 */
    const pool = [];

    /* 武器卡：未解锁 -> 解锁；已解锁未满 -> 强化。最多同时持有 6 把（VS 的槽位上限） */
    let owned = 0;
    for (const k in pv.weapons) if (pv.weapons[k].lvl > 0) owned++;
    for (const id in WEAPONS) {
      const W = WEAPONS[id];
      const st = pv.weapons[id];
      const lv = st ? st.lvl : 0;
      if (lv >= W.max) continue;
      if (lv === 0 && owned >= 6) continue;
      if (lv === 0) {
        pool.push({
          id: 'wnew:' + id, weapon: id, ico: W.ico,
          name: W.name, desc: '获得角色 · ' + W.desc,
          cur: 0, max: W.max, w: Math.round(W.w * (owned <= 1 ? 3.2 : 1.2)),
        });
      } else {
        pool.push({
          id: 'wup:' + id, weapon: id, ico: W.ico,
          name: W.name + ' Lv' + (lv + 1),
          desc: lv === W.max - 1 ? '满级 · 配合星导核心可进化' : '数值强化',
          cur: lv, max: W.max, w: Math.round(W.w * 1.0),
        });
      }
    }

    /* 配件卡：进化钥匙 + 全局乘算 + 觉醒技开关 */
    let powned = 0;
    for (const k in pv.passives) if (pv.passives[k] > 0) powned++;
    for (const id in PASSIVES) {
      const P = PASSIVES[id];
      const lv = pv.passives[id] || 0;
      if (lv >= P.max) continue;
      if (lv === 0 && powned >= 6) continue;
      const wid = passiveWeaponOf(id);
      const wl = wid && pv.weapons[wid] ? pv.weapons[wid].lvl : 0;
      const readyEvo = wid && WEAPONS[wid] && wl >= WEAPONS[wid].max;
      pool.push({
        id: 'p:' + id, passive: id, ico: P.ico,
        name: lv === 0 ? P.name : P.name + ' Lv' + (lv + 1),
        desc: lv === 0
          ? (readyEvo ? '可立即进化 ' + P.evo : P.desc + ' · 解锁「' + P.evo + '」')
          : P.desc,
        cur: lv, max: P.max, w: Math.round(P.w * (lv === 0 ? 1.0 : 0.9)),
      });
    }

    /* 补给卡：「强健」「烤鸡」一直参与抽卡，不再等着抽不满才补位。
       血量越低烤鸡权重越高 —— 快死的时候给一张救命的牌，是这类游戏的基本礼貌 */
    const pp = pv.player;
    const hpRate = pp && pp.maxHp > 0 ? pp.hp / pp.maxHp : 1;
    for (const u of UPGRADES) {
      if ((pv.upLvl[u.id] || 0) >= u.max) continue;
      let w = u.w;
      if (u.id === 'heal') {
        w = hpRate < 0.45 ? u.w * 7 : hpRate < 0.75 ? u.w * 3.5 : 10;
      } else if (u.id === 'hp') {
        w = hpRate < 0.6 ? u.w * 1.4 : Math.round(u.w * 0.55);
      }
      pool.push({
        id: u.id, ico: u.ico, name: u.name, desc: u.desc,
        cur: pv.upLvl[u.id] || 0, max: u.max, w: w,
      });
    }

    const out = [];
    for (let k = 0; k < n && pool.length; k++) {
      let total = 0;
      for (const u of pool) total += u.w;
      let r = U.rand(0, total);
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      if (idx >= pool.length) idx = pool.length - 1;
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }

    /* 武器与配件都接近满级时，用补给卡补满三张（已经发过的别重复） */
    for (const u of UPGRADES) {
      if (out.length >= n) break;
      if ((pv.upLvl[u.id] || 0) >= u.max) continue;
      if (out.some(c => c.id === u.id)) continue;
      out.push({
        id: u.id, ico: u.ico, name: u.name, desc: u.desc,
        cur: pv.upLvl[u.id] || 0, max: u.max, w: u.w,
      });
    }
    return out;
  };

  /* 给渲染层查当前武器数值（黑洞半径等要和判定对齐） */
  B.weaponStats = function (id) { return weaponStats(id); };

  /* 查「某个等级」的数值：升级卡要显示 Lv3 → Lv4 的真实差值，不能只写「数值强化」 */
  B.weaponStatsAt = function (id, lv) {
    const pv = this.pve;
    if (!pv || !pv.weapons || !pv.weapons[id]) return null;
    const st = pv.weapons[id];
    const old = st.lvl;
    st.lvl = lv;
    const s = weaponStats(id);
    st.lvl = old;
    return s;
  };

  /* 选完一张卡：还有排队就继续暂停；全选完才恢复，
     并且只有当「觉醒条攒满一条」（awkN）时才开觉醒 */
  function afterPick(pv) {
    pv.pendingUp--;
    if (pv.pendingUp > 0) return;
    pv.pendingUp = 0;
    pv.paused = false;
    if ((pv.awkN || 0) > 0) {
      pv.awkN--;
      startAwaken();
    }
  }

  B.pvePick = function (id) {
    const pv = this.pve;    if (!pv || !pv.paused) return false;
    const p = pv.player;

    /* 武器卡 */
    if (id.indexOf('wnew:') === 0 || id.indexOf('wup:') === 0) {
      const wid = id.slice(id.indexOf(':') + 1);
      const st = pv.weapons[wid];
      if (!st || !WEAPONS[wid] || st.lvl >= WEAPONS[wid].max) return false;
      if (st.lvl === 0) {
        st.lvl = 1;
        st.t = 0.35;
        pv.weaponOrder.push(wid);
        Fx.text(p.x, p.y - 60, '获得 ' + WEAPONS[wid].name, WEAPONS[wid].color, 18);
      } else {
        st.lvl++;
        Fx.text(p.x, p.y - 60, WEAPONS[wid].name + ' Lv' + st.lvl, '#ffe6a8', 18);
      }
      checkEvolve(pv, wid);
      afterPick(pv);
      return true;
    }

    /* 配件卡 */
    if (id.indexOf('p:') === 0) {
      const pid = id.slice(2);
      const P = PASSIVES[pid];
      if (!P) return false;
      const cur = pv.passives[pid] || 0;
      if (cur >= P.max) return false;
      pv.passives[pid] = cur + 1;
      Fx.text(p.x, p.y - 60, P.name + ' Lv' + pv.passives[pid], '#ffd9a0', 18);
      const wid = passiveWeaponOf(pid);
      if (wid) checkEvolve(pv, wid);
      afterPick(pv);
      return true;
    }

    const up = UPGRADES.find(u => u.id === id);
    if (!up) return false;
    switch (id) {
      case 'hp':
        p.maxHp += 40;
        p.hp = p.maxHp;
        break;
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + 45);
        break;
    }
    pv.upLvl[id] = (pv.upLvl[id] || 0) + 1;
    afterPick(pv);
    return true;
  };


  /* ===== 武器池（P4.3）：8 个角色，一人一把，鞭子是秋云专属 =====
     数值取自 1v1 的角色技能，曲线按 VS 的节奏（满级对齐原作量级）。
     行为一律走 PvE 自己的弹道层，不碰 1v1 的状态机。 */
  const WEAPONS = {
    akigumo: {
      name: '秋云', ico: '云', owner: 'akigumo', color: '#ff5f6d',
      desc: '鞭击横扫（椭圆弧）',
      max: 5, w: 80, whip: true,
      base: { cd: 1.35, dmg: 400, reach: 132, half: 1.0, n: 1 },
      grow: { dmg: 200, area: 0.08 },
    },
    skysaber: {
      name: '苍穹之剑', ico: '剑', owner: 'skysaber', color: '#4aa3ff',
      desc: '三连光枪，无限穿透',
      max: 5, w: 78,
      base: { cd: 1.7, dmg: 125, n: 3, speed: 560, size: 1 },
      grow: { dmg: 120, size: 0.2 },
    },
    krista: {
      name: '克丽丝塔', ico: '光', owner: 'krista', color: '#5fd6c4',
      desc: '圣剑环绕，持续切割',
      max: 5, w: 76, aura: 'orbit',
      base: { cd: 0.42, dmg: 690, r: 112, spin: 2.4, n: 1 },
      grow: { dmg: 160 },
    },
    akigumo_broken: {
      name: '破烂女士', ico: '罗', owner: 'akigumo_broken', color: '#5b8cff',
      desc: '黑洞光环，贴身高频绞杀',
      max: 5, w: 72, aura: 'hole',
      base: { cd: 1.3, dmg: 70, r: 82, cap: 10, knock: 1 },
      grow: { dmg: 96, r: 4 },
    },
    rhine: {
      name: '莱茵', ico: '龙', owner: 'rhine', color: '#3fa9ff',
      desc: '单发穿透光枪，首触爆炸',
      max: 5, w: 74,
      base: { cd: 2.6, dmg: 365, speed: 520, boom: 52, boomDmg: 0.45 },
      grow: { dmg: 220 },
    },
    mimi: {
      name: '米米姐', ico: '爆', owner: 'mimi', color: '#5fd0f0',
      desc: '核弹追踪黏附引爆；进化后爆炸留下火海',
      max: 5, w: 72,
      base: { cd: 4.2, dmg: 780, boom: 74, speed: 580, fuse: 0.45, homing: 1.4,
              zone: 3.2, zdps: 150, zoneR: 0.22, root: 0.52, grow: 0.7 },
      grow: { dmg: 260 },
    },
    snowowl: {
      name: '雪鸮', ico: '狙', owner: 'snowowl', color: '#a3aeb9',
      desc: '单发高伤狙击，不穿透',
      max: 5, w: 70,
      base: { cd: 1.6, dmg: 620, speed: 820, range: 700 },
      grow: { dmg: 520 },
    },
    shadow: {
      name: '胧雷-影', ico: '影', owner: 'shadow', color: '#4d7bff',
      desc: '分身连弹，依次命中多目标',
      max: 5, w: 74,
      base: { cd: 3.0, dmg: 300, n: 1, speed: 1100, bounce: 6, dur: 2.25 },
      grow: { dmg: 140 },
    },
  };

  /* ===== 星导核心（配件，8 个）：全局乘算 + 进化钥匙 + 觉醒技开关 =====
     名字刻意不叫「觉醒」：觉醒是攒条子进的那个状态，这里是抽卡拿的配件。 */
  const PASSIVES = {
    wings: { name: '翅膀', ico: '翼', owner: 'skysaber', evo: 'TransAM', max: 5, w: 70, desc: '移速 +10%/级' },
    armor: { name: '护甲', ico: '甲', owner: 'krista', evo: '圣光护盾', max: 5, w: 70, desc: '受伤 −1/级，觉醒时开盾' },
    spinach: { name: '菠菜', ico: '菜', owner: 'akigumo', evo: '村好刀', max: 5, w: 76, desc: '伤害 +10%/级' },
    duplicator: { name: '复制器', ico: '弹', owner: 'rhine', evo: '导弹仓', max: 5, w: 68, desc: '投射物 +1/级' },
    magnet: { name: '磁铁', ico: '磁', owner: 'akigumo_broken', evo: '磁铁', max: 5, w: 66, desc: '拾取范围 +25%/级' },
    candelabra: { name: '烛台', ico: '烛', owner: 'mimi', evo: '常春藤', max: 5, w: 68, desc: '范围 +10%/级' },
    tome: { name: '空之书', ico: '书', owner: 'snowowl', evo: '双枪', max: 5, w: 72, desc: '冷却 −8%/级' },
    binder: { name: '缚咒书', ico: '咒', owner: 'shadow', evo: '分身术', max: 5, w: 66, desc: '持续时间 +10%/级' },
  };

  const WEAPON_IDS = Object.keys(WEAPONS);

  /* 每级到底变了什么：卡面不能只写「数值强化」，玩家得知道这一张买的是什么。
     留空的那级由 UI 用真实数值差值补（伤害 400 → 600），这里只写「数值以外」的变化。 */
  const WEAPON_LV_NOTES = {
    akigumo: ['鞭击横扫，穿透全部敌人', '左右各一鞭', '', '', '鞭长与伤害拉满'],
    skysaber: ['三连光枪，无限穿透', '弹体增大', '', '弹体增大', '弹体与伤害拉满'],
    krista: ['单剑环绕切割', '', '转速 +20%，范围 +15%', '', '双剑环绕'],
    akigumo_broken: ['黑洞贴身绞杀', '半径 +15%', '半径 +8%，伤害 +2，冷却 -0.1s',
      '半径 +8%，伤害 +1', '半径 +15%，伤害 +2'],
    rhine: ['单发穿透龙枪', '直击 +20%', '爆炸半径 +30%',
      '直击 +20%，爆炸伤害 +50%', '爆炸 +20%，冷却 -25%'],
    mimi: ['核弹黏附引爆 · 进化后留火海', '', '爆炸 +20%，范围 +15%',
      '火海每秒伤害 +25%（进化后）', '爆炸 +20%，火海 +15% / 持续 +1s'],
    snowowl: ['单发高伤狙击，不穿透', '', '', '', ''],
    shadow: ['分身连弹', '', '分身持续 +0.3s', '同时甩出两枚', '分身持续 +0.5s'],
  };

  /* 配件每级成长（卡面/图鉴都要写清楚 +多少） */
  const PASSIVE_PER = {
    wings: { label: '移速', step: 10, unit: '%' },
    armor: { label: '接触减免', step: 1, unit: ' 点' },
    spinach: { label: '伤害', step: 10, unit: '%' },
    duplicator: { label: '投射物', step: 1, unit: ' 枚' },
    magnet: { label: '拾取范围', step: 25, unit: '%' },
    candelabra: { label: '范围', step: 10, unit: '%' },
    tome: { label: '冷却', step: -8, unit: '%' },
    binder: { label: '持续时间', step: 10, unit: '%' },
  };
  B.weaponNotes = WEAPON_LV_NOTES;
  B.passivePer = PASSIVE_PER;

  /* ===== 角色专属被动（每人一条，选谁出场就带谁那条）=====
     对标 VS 的「初始角色被动」：数值给得克制，但方向明确，买之前就知道玩起来不一样。 */
  const CHAR_PASSIVES = {
    skysaber: {
      name: '粒子反应炉Ⅲ型',
      desc: '觉醒期间完全无敌',
    },
    akigumo: {
      name: '剑道',
      desc: '撞开贴身的敌人 —— 但撞上去先挨它一口，伤害低，换的是距离',
      contactDmg: 240, contactCd: 0.35, contactR: 10, knock: 340, bumpLock: 2.6,
    },
    akigumo_broken: {
      name: '人灵一体',
      desc: '每 7 秒召出修罗丸，替你挡下 6 发弹幕',
      guardEvery: 7, guardTime: 3.2, guardBlocks: 6,
    },
    rhine: {
      name: '终焉龙诗',
      desc: '战斗攒进化值，依次解锁追踪导弹 → 弹体增大 → 全伤害 +20% → 爆裂导弹，后三层继续加伤害',
      evo: true,
    },
    krista: {
      name: '圣光洗礼',
      desc: '圣剑转速 +60%',
      spin: 1.6,
    },
    mimi: {
      name: '格莱普尼尔',
      desc: '冲刺冷却 −45%，逃命更勤',
      dashCd: 0.55,
    },
    snowowl: {
      name: '精准射击',
      desc: '经验条走到一半时额外触发一次觉醒',
      half: true,
    },
    shadow: {
      name: '行于影中',
      desc: '移动速度 +12%',
      speed: 1.12,
    },
  };
  B.charPassives = CHAR_PASSIVES;

  /* 莱茵进化：7 段，前 4 段解锁能力，后面堆全伤害 */
  const RHINE_EVO = [
    '解锁追踪导弹',
    '弹体增大',
    '全伤害 +20%',
    '解锁爆裂导弹',
    '全伤害 +20%',
    '全伤害 +20%',
    '全伤害 +20%',
  ];
  B.rhineEvo = RHINE_EVO;
  const EVO_NEED = 60;   /* 每段所需进化值 */

  function charPassiveOf(f) {
    if (!f || !f.char) return null;
    return CHAR_PASSIVES[f.char.id] || null;
  }

  /* 莱茵：进化值只在这一局里累积 */
  function addPveEvo(p, v) {
    const pv = B.pve;
    if (!pv || !pv.evo || pv.evo.lv >= RHINE_EVO.length) return;
    pv.evo.p += v;
    while (pv.evo.lv < RHINE_EVO.length && pv.evo.p >= pv.evo.need) {
      pv.evo.p -= pv.evo.need;
      pv.evo.lv++;
      pv.evo.need = EVO_NEED + pv.evo.lv * 18;
      Fx.text(p.x, p.y - 74, '进化 ' + pv.evo.lv + ' · ' + RHINE_EVO[pv.evo.lv - 1], '#8fe0ff', 16);
      Fx.ring(p.x, p.y, 'rgba(140,220,255,.9)', p.r, p.r * 3.4, .5);
      B.shake = Math.max(B.shake, 6);
    }
  }
  B.pveEvoStage = function () {
    const pv = B.pve;
    return pv && pv.evo ? pv.evo : null;
  };

  /* 给 UI 读定义（底部获得列表、卡面） */
  B.weaponDefs = WEAPONS;
  B.passiveDefs = PASSIVES;
  B.mobKinds = MOB_KIND;
  B.spawnMob = spawnMob;

  /* 配件乘算：所有数值对全部武器生效 */
  function passiveMul() {
    const pv = B.pve;
    const L = (pv && pv.passives) || {};
    const n = k => L[k] || 0;
    return {
      dmg: 1 + 0.10 * n('spinach'),
      cd: Math.max(0.42, 1 - 0.08 * n('tome')),
      area: 1 + 0.10 * n('candelabra'),
      speed: 1 + 0.10 * n('wings'),
      dur: 1 + 0.10 * n('binder'),
      amount: n('duplicator'),
      pickR: 1 + 0.25 * n('magnet'),
      armor: n('armor'),
    };
  }

  /* 武器当前数值：等级 1 起算，配件乘算已并入 */
  function weaponStats(id) {
    const pv = B.pve;
    const W = WEAPONS[id];
    const lv = (pv.weapons[id] && pv.weapons[id].lvl) || 0;
    const s = Object.assign({}, W.base, { lvl: lv });
    const g = W.grow || {};
    const P = passiveMul();
    /* 觉醒期增益 */
    const awk = (pv.awakenT || 0) > 0 ? 1.35 : 1;
    if (g.dmg) s.dmg += g.dmg * (lv - 1);
    if (g.area && s.reach) s.reach *= 1 + g.area * (lv - 1);
    if (g.size) s.size = (s.size || 1) + g.size * (lv - 1);
    if (g.r) s.r += g.r * (lv - 1);
    /* 秋云：Lv2 起左右各一下 */
    if (id === 'akigumo') s.n = lv >= 2 ? 2 : 1;
    /* 克丽丝塔：Lv5 双剑 */
    if (id === 'krista') {
      s.n = lv >= 5 ? 2 : 1;
      s.dmg *= (1 + 0.25 * Math.min(3, Math.max(0, lv - 1)));
      s.spin *= (lv >= 3 ? 1.2 : 1);
      s.r *= (lv >= 3 ? 1.15 : 1);
    }
    /* 影：Lv4 起加数量 */
    if (id === 'shadow') {
      s.n = lv >= 4 ? 2 : 1;
      s.dur += lv >= 3 ? 0.3 : 0;
      s.dur += lv >= 5 ? 0.5 : 0;
    }
    /* 莱茵：Lv2/4 直击，Lv3/5 爆炸 */
    if (id === 'rhine') {
      s.dmg *= 1 + (lv >= 2 ? 0.2 : 0) + (lv >= 4 ? 0.2 : 0);
      s.boom *= 1 + (lv >= 3 ? 0.3 : 0) + (lv >= 5 ? 0.2 : 0);
      s.boomDmg = (s.boomDmg || 0.45) * (1 + (lv >= 4 ? 0.5 : 0));
      s.cd *= (lv >= 5 ? 0.75 : 1);
    }
    /* 米米：Lv3 范围，Lv4 区域伤害，Lv5 持续+范围 */
    if (id === 'mimi') {
      s.boom *= 1 + (lv >= 3 ? 0.2 : 0) + (lv >= 5 ? 0.2 : 0);
      s.zdps *= 1 + (lv >= 4 ? 0.25 : 0);
      s.zone += lv >= 5 ? 1.0 : 0;
      /* 爆炸领域按场地比例：和 1v1 的 G·诺伦 一样是"整片压过来"的量级 */
      s.zoneR *= 1 + (lv >= 3 ? 0.15 : 0) + (lv >= 5 ? 0.15 : 0);
    }
    /* 破烂女士：Lv2/Lv4/Lv5 扩一点范围（原本 2.35 倍，叠上范围核心直接铺满场地） */
    if (id === 'akigumo_broken') {
      s.r *= 1 + (lv >= 2 ? 0.15 : 0) + (lv >= 4 ? 0.08 : 0) + (lv >= 5 ? 0.15 : 0);
      s.dmg += (lv >= 3 ? 2 : 0) + (lv >= 4 ? 1 : 0) + (lv >= 5 ? 2 : 0);
      s.cd -= (lv >= 3 ? 0.1 : 0);
    }
    /* 莱茵：进化到第 2 段后弹体变大 */
    if (id === 'rhine' && pv.evo && pv.evo.lv >= 2) s.size = (s.size || 1) * 1.7;
    /* 莱茵进化「全伤害 +20%」：对本局所有武器生效 */
    if (pv.evo && pv.evo.lv > 0) {
      let n = 0;
      for (let i = 0; i < pv.evo.lv; i++) if (RHINE_EVO[i].indexOf('全伤害') === 0) n++;
      if (n) s.dmg *= 1 + 0.2 * n;
    }
    /* 配件乘算 */
    s.dmg *= P.dmg * awk;
    s.cd = Math.max(0.25, s.cd * P.cd / (awk > 1 ? 1.15 : 1));
    if (s.r) s.r *= P.area;
    /* 破烂女士：等级加成 × 范围核心叠起来会到 3.3 倍底值，黑洞半径得跟着场地封顶，
       否则满配时白色环半径逼近整个场地宽度，看上去就是一道横贯全屏的白圈。 */
    if (id === 'akigumo_broken' && s.r) {
      const sc0 = B.scale() || 1;
      const capR = B.field ? (B.field.w * 0.26) / sc0 : 140;
      s.r = Math.min(s.r, capR);
    }
    if (s.reach) s.reach *= P.area;
    if (s.boom) s.boom *= P.area;
    if (s.zoneR) s.zoneR *= P.area;
    if (s.zone) s.zone *= P.dur;
    if (s.dur) s.dur *= P.dur;
    return s;
  }

  function nearestMobTo(x, y, maxD) {
    let best = null, bd = maxD ? (maxD * B.scale()) * (maxD * B.scale()) : Infinity;
    for (const m of B.fighters) {
      if (!m.isMob || m.dead || m.spawnT > 0) continue;
      const dx = m.x - x, dy = m.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = m; }
    }
    return best;
  }

  /* 玩家的输出弹道：side='p'，只打怪 */
  function pvePlayerShot(p, ang, o) {
    const pv = B.pve;
    const sc = B.scale();
    pv.shots.push({
      /* 从身体边缘出膛：否则子弹前几帧被立绘盖住，看起来像没打出去 */
      side: 'p', x: p.x + Math.cos(ang) * (p.r * 1.02), y: p.y + Math.sin(ang) * (p.r * 1.02),
      vx: Math.cos(ang) * o.speed * sc, vy: Math.sin(ang) * o.speed * sc,
      r: (o.r || 6) * sc, dmg: o.dmg,
      life: o.life || 1.6, kind: o.kind || 'shard',
      color: o.color || p.char.color, a: ang, spin: U.rand(0, 6),
      slow: 0, homing: o.homing || 0, pierce: o.pierce === true ? Infinity : (o.pierce || 0),
      boom: (o.boom || 0) * sc, boomDmg: o.boomDmg || 0, fuse: o.fuse || 0,
      para: o.para || 0, bounce: o.bounce || 0, bounceLeft: o.bounce || 0,
      tag: o.tag || '副武器', hitSet: [], zone: o.zone || 0, zdps: o.zdps || 0,
      zoneR: o.zoneR || 0, root: o.root || 0, grow: o.grow || 0,
      boomDone: false, stuck: false, stuckTo: null,
      boomer: o.boomer || null, bt: 0, turned: false,
    });
  }

  function pveExplode(p, x, y, radius, dmg, tag, color) {
    let hits = 0;
    for (const m of B.fighters) {
      if (!m.isMob || m.dead) continue;
      if (U.dist(m.x, m.y, x, y) > radius + m.r) continue;
      const loud = hits < 6;
      B.damage(p, m, dmg, 'shot', { tag: tag, big: loud, silent: !loud });
      hits++;
    }
    Fx.ring(x, y, 'rgba(255,255,255,.85)', radius * 0.15, radius, 0.34);
    Fx.burst(x, y, 14, color || '#ffd166', 320, 4, 0.45);
    if (hits) B.shake = Math.max(B.shake, 6);
    return hits;
  }

  function aimAt(f, maxD) {
    const t = nearestMobTo(f.x, f.y, maxD);
    if (t) return { a: Math.atan2(t.y - f.y, t.x - f.x), t: t };
    return { a: f.facing > 0 ? 0 : Math.PI, t: null };
  }

  /* 秋云：椭圆弧鞭击（透视投影的圆）。Lv1 单侧，Lv2 起左右各一下 */
  function whipSwing(p, s) {
    const pv = B.pve;
    const sc = B.scale();
    const reach = s.reach * sc;
    const half = s.half;
    const n = s.n || 1;
    const col = p.char.color || '#ff5f6d';
    const base = p.facing >= 0 ? 0 : Math.PI;
    /* 椭圆的纵轴压缩比：看起来像俯视透视的圆。0.62 比原来的 0.55 厚一圈，
       不然竖向覆盖太窄，明明刀光扫过去了却打不到人 */
    const squash = 0.62;

    const inArc = (m, dir) => {
      const dx = m.x - p.x, dy = m.y - p.y;
      /* 椭圆归一化坐标 */
      const nx = dx / (reach + m.r);
      const ny = dy / (reach * squash + m.r);
      if (nx * nx + ny * ny > 1) return false;
      let da = Math.atan2(dy / squash, dx) - dir;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) <= half + 0.24;
    };

    let hits = 0;
    for (let k = 0; k < n; k++) {
      const dir = k % 2 === 0 ? base : base + Math.PI;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        if (!inArc(m, dir)) continue;
        const loud = hits < 6;
        if (B.damage(p, m, s.dmg, 'melee', { big: loud, tag: '鞭', silent: !loud }) > 0) {
          hits++;
          const ang = Math.atan2(m.y - p.y, m.x - p.x);
          m.knockT = 0.18;
          m.vx = Math.cos(ang) * 170 * sc;
          m.vy = Math.sin(ang) * 170 * sc;
          if (loud) Fx.burst(m.x, m.y, 5, col, 220, 2.4, 0.3);
        }
      }
      /* 刀光：记录一次挥砍，渲染层画成整条椭圆弧带（不再是点线段） */
      const dur = 0.26;
      pv.whipFx.push({
        x: p.x, y: p.y, dir, reach, half, squash,
        color: col, t: dur, life: dur, delay: k ? 0.06 : 0,
      });
      /* 刃口火花 */
      for (let i = 0; i < 6; i++) {
        const aa = dir - half + half * 2 * (i / 6);
        Fx.burst(p.x + Math.cos(aa) * reach * 0.95, p.y + Math.sin(aa) * reach * 0.95 * squash,
          2, col, 150, 2, 0.22);
      }
    }
    if (hits > 0) B.shake = Math.max(B.shake, 5);
  }

  /* 八把武器的开火实现 */
  const WEAPON_FIRE = {
    /* 秋云：鞭子 */
    akigumo(f, s) {
      whipSwing(f, s);
    },

    /* 天剑：3 连发光枪（无限穿透），三枪瞄准角略微错开成小扇形 */
    skysaber(f, s) {
      const { a } = aimAt(f, 560);
      const n = (s.n || 3) + passiveMul().amount;
      /* 相邻两发的夹角：发数多了自动收窄，总张角不超过 0.2 弧度 */
      const fan = Math.min(0.055, 0.2 / Math.max(1, n - 1));
      /* 允许每发重新瞄准，但相对首发方向最多偏 30°，不会有甩枪的大角度转折 */
      const maxTurn = 30 * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * fan;
        setTimeoutFrame(i * 0.14, () => {
          if (!B.pve || B.pve.player !== f || f.dead) return;
          /* 每发单独取当前最近目标，夹在首发方向的 30° 锥内，再叠扇角偏移 */
          const want = aimAt(f, 560).a + off;
          let d = want - a;
          d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
          pvePlayerShot(f, a + U.clamp(d, -maxTurn, maxTurn), {
            speed: s.speed, dmg: s.dmg, kind: 'shard', color: '#8fd0ff',
            pierce: true, r: 5.5 * (s.size || 1), life: 1.5, tag: '光枪',
          });
        });
      }
      Fx.ring(f.x, f.y, 'rgba(120,200,255,.7)', f.r * 0.5, f.r * 1.5, 0.2);
      /* 进化·TransAM：一枚三倍大的双头回旋刃 —— 飞出去，再自己飞回来 */
      if (B.pve.evolved.skysaber) {
        pvePlayerShot(f, a, {
          speed: 440, dmg: s.dmg * 2.2, kind: 'disc', color: '#7fe0ff',
          pierce: true, r: 39, life: 2.4, tag: 'TransAM',
          boomer: { out: 0.42 },
        });
        Fx.ring(f.x, f.y, 'rgba(140,225,255,.85)', f.r * 0.6, f.r * 2.4, .22);
      }
    },

    /* 克丽丝塔：无开火动作，靠 tickAura */
    krista() {},

    /* 破烂女士：无开火动作，靠 tickAura */
    akigumo_broken() {},

    /* 莱茵：单发穿透光枪，首触爆炸（永不连发） */
    rhine(f, s) {
      const { a } = aimAt(f, 620);
      pvePlayerShot(f, a, {
        speed: s.speed, dmg: s.dmg, kind: 'lance', color: '#5fc0ff',
        pierce: true, boom: s.boom, boomDmg: s.boomDmg, r: 9 * (s.size || 1), life: 1.4, tag: '龙枪',
      });
      B.shake = Math.max(B.shake, 3);
      /* 出手光轨：弹体太快，靠这条线让玩家看见"打出去了" */
      {
        const sc0 = B.scale();
        const L0 = 210 * sc0;
        Fx.slash(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r,
          f.x + Math.cos(a) * (f.r + L0), f.y + Math.sin(a) * (f.r + L0),
          'rgba(150,215,255,.9)', .16, 0, 5.5);
        Fx.ring(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, 'rgba(190,235,255,.9)', 3, 15 * sc0, .18);
      }
      /* 进化·导弹仓：三叉持续照射。方向在起手瞬间锁死，人可以边跑边烧 ——
         对应竞猜模式的「前奏曲」，只是把站桩换成可移动。 */
      if (B.pve.evolved.rhine && !B.pve.lance) {
        B.pve.lance = { a, t: 2.2, dur: 2.2, tick: 0, count: 3, spread: 0.24 };
        Fx.ring(f.x, f.y, 'rgba(140,210,255,.9)', f.r * 0.6, f.r * 3.2, .3);
        Fx.text(f.x, f.y - 64, '前奏曲', '#8fd0ff', 16);
        B.shake = Math.max(B.shake, 5);
      }
    },

    /* 米米：核弹黏附 -> 引爆 -> 留伤害区；进化后双发齐射 */
    mimi(f, s) {
      const { a } = aimAt(f, 620);
      const evo = !!(B.pve.evolved && B.pve.evolved.mimi);
      /* 复制器（投射物 +1）对核弹同样生效：进化前 1 发、进化后 2 发，再叠核心等级 */
      const n = (evo ? 2 : 1) + passiveMul().amount;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * 0.34 : 0;
        pvePlayerShot(f, a + off, {
          speed: s.speed, dmg: s.dmg * (evo ? 1.3 : 1), kind: 'nuke', color: '#7fe8ff',
          boom: s.boom, fuse: s.fuse, r: 8, life: s.fuse, tag: '诺伦',
          /* 火海是进化后的专属 —— 进化前只有爆炸，不留地火 */
          zone: evo ? s.zone : 0, zdps: s.zdps, zoneR: s.zoneR, root: s.root, grow: s.grow,
          homing: s.homing,
        });
      }
    },

    /* 雪鸮：单发高伤，不穿透 */
    snowowl(f, s) {
      const { a } = aimAt(f, s.range);
      const shots = (B.pve.evolved.snowowl ? 3 : 1) + passiveMul().amount;
      for (let i = 0; i < shots; i++) {
        pvePlayerShot(f, a + (i - (shots - 1) / 2) * 0.12, {
          speed: s.speed, dmg: s.dmg, kind: 'snipe', color: '#e6eef6',
          pierce: false, r: 4, life: 0.6, tag: '狙击',
        });
      }
      Fx.slash(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r,
        f.x + Math.cos(a) * (f.r + 260), f.y + Math.sin(a) * (f.r + 260),
        'rgba(235,244,255,.92)', .16, 0, 5);
    },

    /* 影：分身弹，撞墙反弹，依次命中 */
    shadow(f, s) {
      const { a } = aimAt(f, 620);
      const n = (s.n || 1) + passiveMul().amount + (B.pve.evolved.shadow ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * 0.28 : 0;
        pvePlayerShot(f, a + off, {
          speed: s.speed, dmg: s.dmg, kind: 'clone', color: '#8fb0ff',
          pierce: true, bounce: s.bounce, r: 8, life: s.dur, tag: '分身',
        });
      }
    },
  };

  /* 光环型武器：克丽丝塔圣剑 / 破烂女士黑洞 */
  function tickAura(p, id, s, dt) {
    const pv = B.pve;
    const sc = B.scale();
    if (id === 'krista') {
      /* 完全照 1v1 的 updateSword：剑从身体伸出，每帧扫线段，命中后该目标 0.7s 免疫 */
      const n = Math.max(1, s.n);
      const len = p.r * ((SW.TUNE && SW.TUNE.kristaLen) || 3);
      for (let i = 0; i < n; i++) {
        const ang = (pv.orbitA || 0) + i / n * Math.PI * 2;
        const x1 = p.x + Math.cos(ang) * p.r * 0.9;
        const y1 = p.y + Math.sin(ang) * p.r * 0.9;
        const x2 = p.x + Math.cos(ang) * (p.r * 0.9 + len);
        const y2 = p.y + Math.sin(ang) * (p.r * 0.9 + len);
        let hits = 0;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (m.swordCd > 0) continue;
          if (!U.segCircle(x1, y1, x2, y2, m.x, m.y, m.r)) continue;
          m.swordCd = (SW.TUNE && SW.TUNE.kristaHitCd) || 0.7;
          B.damage(p, m, s.dmg, 'melee', { tag: '大剑', big: hits < 4, silent: hits >= 4 });
          Fx.slash(x1, y1, x2, y2, 'rgba(140,255,180,.95)', 0.32);
          Fx.burst(m.x, m.y, 12, '#6dff9a', 320, 3.4, 0.45);
          hits++;
        }
        if (hits) B.shake = Math.max(B.shake, 9);
      }
      return;
    }
    if (id === 'akigumo_broken') {
      const rad = s.r * sc;
      const cap = s.cap || 12;
      let hits = 0;
      for (const m of B.fighters) {
        if (hits >= cap) break;
        if (!m.isMob || m.dead) continue;
        const dx = m.x - p.x, dy = m.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > rad + m.r) continue;
        hits++;
        B.damage(p, m, s.dmg, 'shot', { tag: '黑腔', silent: true });
        /* 强击退：往圈外推 */
        m.knockT = Math.max(m.knockT || 0, 0.12);
        m.vx = dx / d * 150 * sc;
        m.vy = dy / d * 150 * sc;
      }
      return;
    }
  }

  function tickWeapons(p, dt) {
    const pv = B.pve;
    if (!pv || !pv.weapons) return;
    if (p.orbitA == null) p.orbitA = 0;
    const WA = (pv.awakenT || 0) > 0 ? 1.35 : 1;   /* 觉醒期转速提升 */

    for (const id in pv.weapons) {
      const st = pv.weapons[id];
      if (!st.lvl) continue;
      const W = WEAPONS[id];
      if (!W) continue;
      const s = weaponStats(id);
      st.t -= dt;
      if (W.aura) {
        if (id === 'krista') {
          /* 剑要一直转、一直扫，命中冷却由 mob.swordCd 控制 */
          const cp = CHAR_PASSIVES[p.char.id];
          pv.orbitA = (pv.orbitA || 0) + dt * (s.spin || 2.4) * WA * ((cp && cp.spin) || 1);
          tickAura(p, id, s, dt);
          continue;
        }
        if (st.t > 0) continue;
        st.t = s.cd;
        tickAura(p, id, s, dt);
        continue;
      }
      if (st.t > 0) continue;
      /* 场上没有目标就不空放，省得核弹飞到墙外留下无用区域 */
      if (!nearestMobTo(p.x, p.y, 9999)) { st.t = 0.2; continue; }
      st.t = s.cd;
      const fire = WEAPON_FIRE[id];
      if (fire) fire(p, s);
    }

    /* 觉醒期：无限连射类（导弹仓 / 双枪） */
    if (pv.rapid) {
      const r = pv.rapid;
      r.t -= dt;
      r.cd -= dt;
      if (r.cd <= 0) {
        r.cd = 0.3;
        const s2 = weaponStats(r.kind);
        if (r.kind === 'rhine') {
          const t2 = nearestMobTo(p.x, p.y, 700);
          const a = t2 ? Math.atan2(t2.y - p.y, t2.x - p.x) : (p.facing > 0 ? 0 : Math.PI);
          pvePlayerShot(p, a + U.rand(-0.1, 0.1), {
            speed: s2.speed, dmg: s2.dmg * 1.4, kind: 'lance', color: '#5fc0ff',
            pierce: true, boom: s2.boom * 1.5, boomDmg: s2.boomDmg * 2, r: 10, life: 1.4, tag: '导弹仓',
          });
        } else {
          const t2 = nearestMobTo(p.x, p.y, 720);
          const a = t2 ? Math.atan2(t2.y - p.y, t2.x - p.x) : 0;
          pvePlayerShot(p, a, {
            speed: s2.speed, dmg: s2.dmg * 0.8, kind: 'snipe', color: '#fff2c8',
            pierce: false, r: 4, life: 0.6, tag: '双枪',
          });
        }
        B.shake = Math.max(B.shake, 3);
      }
      if (r.t <= 0) pv.rapid = null;
    }

    /* 圣光护盾（克丽丝塔觉醒技）：挡弹 + 回血 */
    if (pv.shieldT > 0) {
      pv.shieldT -= dt;
      if (pv.shieldT <= 0) pv.shieldT = 0;
      else {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt);
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          const dx = m.x - p.x, dy = m.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > p.r * 2.6 + m.r) continue;
          m.knockT = Math.max(m.knockT || 0, 0.16);
          m.vx = dx / d * 340 * B.scale();
          m.vy = dy / d * 340 * B.scale();
        }
      }
    }

    /* 核弹残留区：冲击波从中心撑开，圈内持续伤害 + 压制 */
    for (let i = pv.zones.length - 1; i >= 0; i--) {
      const z = pv.zones[i];
      z.t -= dt;
      z.tickT -= dt;
      /* 扩张段：和 1v1 一样是 ease-out，一秒内压满整片 */
      if (z.grow > 0) {
        const age = z.dur - z.t;
        const gk = U.clamp(age / z.grow, 0, 1);
        z.r = Math.max(12, z.R * (1 - Math.pow(1 - gk, 3)));
      } else if (z.R) {
        z.r = z.R;
      }
      if (z.tickT <= 0) {
        z.tickT = z.tick || 0.4;
        let n = 0;
        const R = z.r || z.R || 0;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (n >= 24) break;
          if (U.dist(m.x, m.y, z.x, z.y) > R + m.r) continue;
          n++;
          B.damage(p, m, z.dmg, 'shot', { tag: '诺伦', silent: true });
        }
      }
      /* 火海压制：爆炸头 1.6 秒把圈里的怪钉住（1v1 的 root），之后只烧不定身，
         否则 5 秒领域 + 4.2 秒冷却会把整片怪永久锁死。
         放在伤害结算之外 —— B.damage 命中时会把目标的 stun 清掉 */
      if (z.root > 0 && (z.dur - z.t) < (z.rootDur || 1.6)) {
        const RR = (z.r || z.R || 0) + 26;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          const dx = m.x - z.x, dy = m.y - z.y;
          const lim = RR + (m.r || 0);
          if (dx * dx + dy * dy > lim * lim) continue;
          m.stun = Math.max(m.stun || 0, z.root);
        }
      }
      if (z.t <= 0) pv.zones.splice(i, 1);
    }

    /* 周期型进化效果（克丽丝塔激光 / 破烂女士次元斩） */
    tickEvolve(p, dt);

    /* 鞭影残留 */
    for (let i = pv.whipFx.length - 1; i >= 0; i--) {
      const f = pv.whipFx[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t -= dt;
      if (f.t <= 0) pv.whipFx.splice(i, 1);
    }

    /* 激光残留 */
    for (let i = pv.beams.length - 1; i >= 0; i--) {
      pv.beams[i].t -= dt;
      if (pv.beams[i].t <= 0) pv.beams.splice(i, 1);
    }
  }

  /* 周期型进化效果：克丽丝塔在地图上画十字 / 破烂女士目标区域次元斩 */
  function tickEvolve(p, dt) {
    const pv = B.pve;
    if (!pv) return;
    const sc = B.scale();

    /* 克丽丝塔 · 圣光护盾：每隔 2.2 秒在怪最密的地方「画」一座十字架。
       横竖两条矩形就是判定区，画完立刻开始烧；同时最多两座。 */
    if (pv.evolved.krista) {
      pv.kristaCrossT = (pv.kristaCrossT || 0) - dt;
      if (pv.kristaCrossT <= 0) {
        pv.kristaCrossT = 2.2;
        const t = nearestMobTo(p.x, p.y, 780);
        const cx = t ? t.x : p.x + (p.facing >= 0 ? 170 : -170);
        const cy = t ? t.y : p.y;
        /* 旧的先压成 0.45 秒淡出，别让三座叠在一起糊住整屏 */
        if (pv.crosses.length >= 2) {
          const old = pv.crosses[0];
          if (old.t > 0.45) { old.dur = (old.dur - old.t) + 0.45; old.t = 0.45; }
        }
        pv.crosses.push({
          x: cx, y: cy, len: 158 * sc, wid: 24 * sc,
          dur: 2.2, t: 2.2, drawT: 0, tickT: 0,
        });
      }
    }
    /* 十字架的持续伤害：每 0.25 秒结算一次，横竖两条各算一次 */
    for (let i = pv.crosses.length - 1; i >= 0; i--) {
      const c = pv.crosses[i];
      c.t -= dt;
      c.drawT += dt;
      if (c.t <= 0) { pv.crosses.splice(i, 1); continue; }
      if (c.drawT < 0.16) continue;
      c.tickT -= dt;
      if (c.tickT > 0) continue;
      c.tickT = 0.25;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        const dx = Math.abs(m.x - c.x) - m.r;
        const dy = Math.abs(m.y - c.y) - m.r;
        const inH = dx <= c.len && dy <= c.wid;
        const inV = dy <= c.len && dx <= c.wid;
        if (!inH && !inV) continue;
        B.damage(p, m, 150, 'shot', { tag: '圣光十字', silent: true });
      }
    }

    /* 破烂女士 · 磁铁：目标区域次元斩 */
    if (pv.evolved.akigumo_broken) {
      pv.evolveTick = (pv.evolveTick || 0) - dt;
      if (pv.evolveTick > 0) return;
      pv.evolveTick = 1.2;
      const t = nearestMobTo(p.x, p.y, 520);
      if (t) {
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (U.dist(m.x, m.y, t.x, t.y) > 74 * sc + m.r) continue;
          B.damage(p, m, 400, 'shot', { tag: '次元斩', silent: true });
        }
        /* 次元斩：三组交叉（0°/60°/120°）共 6 刀，宽紫刃 + 白芯 + 错帧。
           只有两刀时像一道「X」图标，没有"被切开"的密度感。 */
        const R = 86 * sc;
        for (let i = 0; i < 3; i++) {
          const a0 = i * Math.PI / 3 + 0.2;
          const dx = Math.cos(a0) * R, dy = Math.sin(a0) * R;
          Fx.slash(t.x - dx, t.y - dy, t.x + dx, t.y + dy,
            'rgba(132,158,255,.72)', .3, i * 0.035, 6.0);
          Fx.slash(t.x - dx * 0.96, t.y - dy * 0.96, t.x + dx * 0.96, t.y + dy * 0.96,
            'rgba(255,255,255,.92)', .3, i * 0.035 + 0.015, 2.0);
        }
        Fx.ring(t.x, t.y, 'rgba(150,170,255,.7)', 8 * sc, 62 * sc, .3);
        Fx.burst(t.x, t.y, 10, '#c8d4ff', 260, 3, .34);
      }
    }
  }

  /* 莱茵进化：三叉持续照射。光束从玩家身上射出（跟着人跑），
     但方向是起手那一刻锁死的 —— 所以走位能改变覆盖范围，不能改主意。 */
  function tickLance(p, dt) {
    const pv = B.pve;
    const L = pv && pv.lance;
    if (!L) return;
    L.t -= dt;
    if (L.t <= 0) { pv.lance = null; return; }
    const sc = B.scale();
    L.tick -= dt;
    if (L.tick > 0) return;
    L.tick = 0.16;
    const len = 1100 * sc;
    for (let i = 0; i < L.count; i++) {
      const ang = L.a + (i - (L.count - 1) / 2) * L.spread;
      const x2 = p.x + Math.cos(ang) * len, y2 = p.y + Math.sin(ang) * len;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        if (!U.segCircle(p.x, p.y, x2, y2, m.x, m.y, m.r + 15 * sc)) continue;
        B.damage(p, m, 320 * 0.16, 'shot', { tag: '前奏曲', silent: true });
      }
    }
  }

  /* 帧延迟执行（天剑三连发的节奏） */
  const frameQueue = [];
  function setTimeoutFrame(delay, fn) {
    frameQueue.push({ t: delay, fn: fn });
  }
  function tickFrameQueue(dt) {
    for (let i = frameQueue.length - 1; i >= 0; i--) {
      const q = frameQueue[i];
      q.t -= dt;
      if (q.t <= 0) {
        frameQueue.splice(i, 1);
        try { q.fn(); } catch (e) {}
      }
    }
  }

  /* ===== 觉醒系统：造成 + 受到伤害充能，满了自动开 ===== */
  const AWAKEN_SKILL = {
    /* 天剑 · TransAM：连续闪现，不碰撞，穿过多目标 */
    wings(p) {
      const pv = B.pve;
      const sc = B.scale();
      const fl = B.field;
      let cuts = 0;
      for (let i = 0; i < 6 && cuts < 6; i++) {
        const t = nearestMobTo(p.x, p.y, 900);
        if (!t) break;
        const a = U.rand(0, Math.PI * 2);
        p.x = U.clamp(t.x + Math.cos(a) * 40 * sc, fl.x + p.r, fl.x + fl.w - p.r);
        p.y = U.clamp(t.y + Math.sin(a) * 40 * sc, fl.y + p.r, fl.y + fl.h - p.r);
        p.invuln = Math.max(p.invuln, 0.3);
        /* 每一闪都是三刀交叉 + 一层外光：单刀太细，闪过去像没打 */
        const cut = 78 * sc;
        for (let k = 0; k < 3; k++) {
          const ca = U.rand(0, Math.PI);
          const dx = Math.cos(ca) * cut, dy = Math.sin(ca) * cut;
          Fx.slash(p.x - dx * 1.25, p.y - dy * 1.25, p.x + dx * 1.25, p.y + dy * 1.25,
            'rgba(120,205,255,.55)', .34, k * 0.03, 6.5);
          Fx.slash(p.x - dx, p.y - dy, p.x + dx, p.y + dy,
            'rgba(246,252,255,.96)', .34, k * 0.03 + 0.01, 2.0);
        }
        Fx.ring(p.x, p.y, 'rgba(150,220,255,.8)', 10 * sc, 64 * sc, .26);
        Fx.burst(p.x, p.y, 8, '#bfe8ff', 300, 3, .32);
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (U.dist(m.x, m.y, p.x, p.y) > 90 * sc + m.r) continue;
          B.damage(p, m, 1200, 'melee', { tag: 'TransAM', big: true });
          cuts++;
        }
      }
      Fx.burst(p.x, p.y, 20, '#8fd0ff', 380, 4, .5);
      B.shake = Math.max(B.shake, 10);
    },
    /* 克丽丝塔 · 圣光护盾 */
    armor(p) {
      B.pve.shieldT = 4.0;
      Fx.ring(p.x, p.y, 'rgba(255,235,180,.95)', p.r, p.r * 3.4, .6);
    },
    /* 秋云 · 村好刀：全屏次元斩 */
    spinach(p) {
      const sc = B.scale();
      const fl = B.field;
      let n = 0;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        B.damage(p, m, 2000, 'melee', { tag: '村好刀', silent: n >= 8, big: n < 8 });
        n++;
      }
      /* 全屏次元斩：横 5 道 + 斜 7 道织成网，每道都是「宽软光 + 细白芯」两层，
         再加错帧。只画一两道会像扫描线，交错起来才有「整屏被切碎」的感觉。 */
      const cuts = [];
      for (let i = 0; i < 5; i++) {
        const yy = fl.y + fl.h * ((i + 0.5) / 5);
        cuts.push([fl.x - 50, yy + U.rand(-14, 14), fl.x + fl.w + 50, yy + U.rand(-26, 26)]);
      }
      for (let i = 0; i < 7; i++) {
        const dir = i % 2 ? 1 : -1;
        const y0 = fl.y + fl.h * (0.06 + 0.135 * i);
        cuts.push([fl.x - 50, y0, fl.x + fl.w + 50, y0 + dir * fl.h * 0.5]);
      }
      cuts.forEach((c, i) => {
        const dl = i * 0.028;
        /* 三层：宽光晕 → 实心白芯 → 长留刀痕。只画一层细线，满屏也看不出来 */
        Fx.slash(c[0], c[1], c[2], c[3], 'rgba(255,96,128,.34)', .44, dl, 9.0);
        Fx.slash(c[0], c[1], c[2], c[3], 'rgba(255,120,148,.72)', .40, dl + 0.01, 5.2);
        Fx.slash(c[0], c[1], c[2], c[3], 'rgba(255,250,252,.96)', .36, dl + 0.02, 2.2);
        Fx.slash(c[0], c[1], c[2], c[3], 'rgba(255,150,175,.20)', .78, dl + 0.03, 3.4);
        /* 切口的火星：沿刀痕撒，不是只在端点 */
        for (let k = 1; k <= 3; k++) {
          const u = k / 4;
          Fx.burst(c[0] + (c[2] - c[0]) * u, c[1] + (c[3] - c[1]) * u,
            2, '#ffbcc8', 200, 2.4, .34);
        }
      });
      B.shake = Math.max(B.shake, 18);
    },
    /* 莱茵 · 导弹仓：3 秒无限连射 */
    duplicator(p) { B.pve.rapid = { kind: 'rhine', t: 3.0, cd: 0 }; },
    /* 破烂女士 · 磁铁：单侧一刀斩 */
    magnet(p) {
      const sc = B.scale();
      const dir = p.facing >= 0 ? 0 : Math.PI;
      let n = 0;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        const dx = m.x - p.x, dy = m.y - p.y;
        if (dx * dir < -20) continue;
        if (Math.abs(dy) > 120 * sc + m.r) continue;
        if (Math.abs(dx) > 420 * sc) continue;
        B.damage(p, m, 1800, 'melee', { tag: '磁铁', silent: n >= 8, big: n < 8 });
        n++;
      }
      Fx.slash(p.x, p.y, p.x + dir * 420 * sc, p.y, 'rgba(140,160,255,.95)', .4, 0, 6);
      B.shake = Math.max(B.shake, 14);
    },
    /* 米米 · 常春藤：一次丢多个核弹 */
    candelabra(p) {
      const s = weaponStats('mimi');
      for (let i = 0; i < 4; i++) {
        const a = U.rand(0, Math.PI * 2);
        pvePlayerShot(p, a, {
          speed: s.speed, dmg: s.dmg * 1.6, kind: 'nuke', color: '#ff9a6a',
          boom: s.boom * 1.2, fuse: 0.4 + i * 0.12, r: 8, life: 0.6 + i * 0.12, tag: '常春藤',
          zone: s.zone, zdps: s.zdps, zoneR: s.zoneR, root: s.root, grow: s.grow,
          homing: s.homing,
        });
      }
    },
    /* 雪鸮 · 双枪：3 秒无限狙击 */
    tome(p) { B.pve.rapid = { kind: 'snowowl', t: 3.0, cd: 0 }; },
    /* 影 · 分身术：数量暴增 */
    binder(p) {
      const pv = B.pve;
      const s = weaponStats('shadow');
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        pvePlayerShot(p, a, {
          speed: s.speed, dmg: s.dmg * 1.2, kind: 'clone', color: '#8fb0ff',
          pierce: true, bounce: 8, r: 9, life: s.dur * 1.4, tag: '分身术',
        });
      }
    },
  };

  /* 觉醒技的释放顺序：按武器获得顺序 */
  function awakeSkillList() {
    const pv = B.pve;
    const out = [];
    for (const id of pv.weaponOrder) {
      const W = WEAPONS[id];
      if (!W) continue;
      const st = pv.weapons[id];
      if (!st || !st.lvl) continue;
      const P = PASSIVES[weaponPassiveOf(id)];
      if (!P) continue;
      const pl = pv.passives[weaponPassiveOf(id)] || 0;
      if (pl <= 0) continue;
      if (AWAKEN_SKILL[weaponPassiveOf(id)]) out.push(weaponPassiveOf(id));
    }
    return out;
  }

  /* 武器 ↔ 配件的一一对应 */
  const WEAPON_PASSIVE = {
    akigumo: 'spinach', skysaber: 'wings', krista: 'armor', akigumo_broken: 'magnet',
    rhine: 'duplicator', mimi: 'candelabra', snowowl: 'tome', shadow: 'binder',
  };
  function weaponPassiveOf(wid) { return WEAPON_PASSIVE[wid] || null; }
  function passiveWeaponOf(pid) {
    for (const wid in WEAPON_PASSIVE) if (WEAPON_PASSIVE[wid] === pid) return wid;
    return null;
  }

  /* 进化图鉴：角色（满 Lv5）＋ 对应觉醒（Lv1 即可）→ 进化。
     「进化」面板和底部获得列表共用这一份数据，文案必须和实际效果对得上。 */
  const EVO_INFO = {
    akigumo: {
      need: 'spinach', name: '村好刀', short: '闪避全程无敌；撞到的敌人各吃 1.6 倍鞭击并被顶飞（每次闪避每个敌人只算一次）',
      look: '鞭刃转金，闪避拖金色残影',
    },
    skysaber: {
      need: 'wings', name: 'TransAM', short: '每轮多掷 1 枚双头回旋刃：3 倍大、0.4 秒后掉头，去程回程各切一次',
      look: '一把高速旋转的双头剑，会自己飞回来',
    },
    krista: {
      need: 'armor', name: '圣光护盾', short: '每 2.2 秒画一座十字架：横竖两条矩形，2.2 秒内每 0.25 秒烧 150',
      look: '圣剑由青转金，地面留下金色十字',
    },
    akigumo_broken: {
      need: 'magnet', name: '磁铁', short: '每 1.2 秒在最近敌人处落六刀交错的次元斩（半径 86 · 400 伤害）',
      look: '黑腔外圈多一层紫环',
    },
    rhine: {
      need: 'duplicator', name: '导弹仓', short: '每 2.2 秒打出一记三叉照射（320/秒），方向锁死、可边走边烧',
      look: '三道蓝色光柱从身上射出',
    },
    mimi: {
      need: 'candelabra', name: '常春藤', short: '核弹变双发，爆炸后留下火海（进化前只炸一下，不留地火）',
      look: '核弹更大、拖青色尾迹',
    },
    snowowl: {
      need: 'tome', name: '双枪', short: '每次狙击变三连发',
      look: '狙击线拆成三道',
    },
    shadow: {
      need: 'binder', name: '分身术', short: '分身弹 +2，持续时间延长',
      look: '影弹数量翻倍',
    },
  };
  B.evoInfo = EVO_INFO;

  /* 进化：武器满级 + 持有对应配件（1 级即可），自动完成，不需要宝箱 */
  function checkEvolve(pv, wid) {
    const W = WEAPONS[wid];
    const st = pv.weapons[wid];
    if (!W || !st || st.lvl < W.max) return false;
    const pid = weaponPassiveOf(wid);
    if (!pid || (pv.passives[pid] || 0) <= 0) return false;
    if (pv.evolved[wid]) return false;
    pv.evolved[wid] = true;
    const p = pv.player;
    const info = EVO_INFO[wid] || {};
    const name = (PASSIVES[pid] && PASSIVES[pid].evo) || info.name || '进化';
    /* 演出：短暂定格 + 全屏金闪 + 三重冲击环 + 粒子 + 强震屏，
       进化是有份量的节点，不能只是弹一行字 */
    pv.hitStop = Math.max(pv.hitStop || 0, 0.24);
    pv.evoFlash = 1;
    pv.evoFlashName = W.name + ' → ' + name;
    pv.evoFlashDesc = info.short || (PASSIVES[pid] && PASSIVES[pid].desc) || '';
    pv.evoFlashT = 1.6;
    const sc = B.scale();
    Fx.ring(p.x, p.y, 'rgba(255,236,190,.98)', p.r * 0.5, p.r * 6.5, .8);
    Fx.ring(p.x, p.y, 'rgba(255,205,110,.85)', p.r * 1.2, p.r * 4.2, .55);
    Fx.ring(p.x, p.y, 'rgba(255,255,255,.95)', p.r * 2.6, p.r * 0.6, .5);
    Fx.burst(p.x, p.y, 34, '#ffd166', 420, 4.2, .75);
    Fx.burst(p.x, p.y, 18, '#fff6da', 240, 3.2, .9);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      Fx.slash(p.x + Math.cos(a) * p.r * 0.8, p.y + Math.sin(a) * p.r * 0.8,
        p.x + Math.cos(a) * 190 * sc, p.y + Math.sin(a) * 190 * sc,
        'rgba(255,232,170,.9)', .34, i * .02, 3);
    }
    B.shake = Math.max(B.shake, 20);
    return true;
  }

  /* 觉醒 = 升级的即时反馈：选完卡立刻进觉醒，持续时长按要放的技数算。
     没有可放的觉醒技（配件还没拿）时也给一小段强化，保证每次升级都有回馈。 */
  function startAwaken(mul) {
    const pv = B.pve;
    if (!pv) return;
    const p = pv.player;
    const q = awakeSkillList();
    pv.awakQueue = q;
    pv.awakIdx = 0;
    pv.awakTick = 0.20;
    pv.awakenDur = Math.min(7.5, 2.8 + q.length * 0.75) * (mul || 1);
    pv.awakStep = q.length ? Math.min(0.66, (pv.awakenDur - 0.6) / q.length) : 0;
    pv.awakenT = pv.awakenDur;
    pv.awakenN = (pv.awakenN || 0) + 1;
    /* 觉醒是从怪堆里活下来的窗口：开场给 1.2 秒无敌，别让爆发变成送死 */
    p.invuln = Math.max(p.invuln || 0, 1.2);
    Fx.ring(p.x, p.y, 'rgba(255,240,190,.95)', p.r, p.r * 5, .7);
    Fx.text(p.x, p.y - 60, 'AWAKEN', '#ffe6a8', 22);
    B.shake = Math.max(B.shake, 10);
  }

  function tickAwakenPvE(p, dt) {
    const pv = B.pve;
    if (!pv) return;
    if (pv.awakenT > 0) {
      pv.awakenT -= dt;
      if (pv.awakenT <= 0) { pv.awakenT = 0; pv.awakQueue = []; }   /* rapid 自带计时，别在这里掐断 */
      /* 按武器获得顺序放觉醒技，间隔由总时长均分 */
      if (pv.awakQueue && pv.awakIdx < pv.awakQueue.length) {
        pv.awakTick -= dt;
        if (pv.awakTick <= 0) {
          const key = pv.awakQueue[pv.awakIdx++];
          pv.awakTick = pv.awakStep || 0.6;
          const fn = AWAKEN_SKILL[key];
          if (fn) {
            fn(p);
            Fx.text(p.x, p.y - 78, PASSIVES[key].evo, '#ffe6a8', 16);
          }
        }
      }
    }
    /* 移速加成在 physicsUpdate 里读 awakenT */
  }

  /* ===== 角色被动：跟随玩家的部分（秋云撞击 / 破烂修罗丸 / 莱茵导弹） ===== */
  function tickCharPassive(p, dt) {
    const pv = B.pve;
    if (!pv || p.dead) return;
    const cp = CHAR_PASSIVES[p.char.id];
    if (!cp) return;
    const sc = B.scale();

    /* 秋云：撞一下把人顶开 —— 这是防御动作，不是输出手段。
       撞上去的那一下是**先挨咬**：接触伤害照常由怪结算，然后才把它推开。
       所以「贴脸撞」不是免费解围，是拿一次受击换一段安全距离；
       挨完这一下玩家进入受击无敌（pv.iframe），所以也不会被连咬。
       同一只怪撞过就上锁（2.6s，且必须先离开撞击圈才解锁）。 */
    if (cp.contactDmg) {
      pv.contT = (pv.contT || 0) - dt;
      const pad = (cp.contactR || 10) * sc;
      for (const m of B.fighters) {
        if (!m.isMob || m.dead) continue;
        const d = U.dist(m.x, m.y, p.x, p.y);
        const reach = m.r + p.r + pad;
        if (m.bumpT > 0) m.bumpT -= dt;
        /* 离开撞击圈才解锁（加 40% 余量，免得在边界上抖来抖去） */
        if (d > reach * 1.4) m.bumped = false;
        if (m.bumped || m.bumpT > 0 || m.spawnT > 0 || pv.contT > 0 || d > reach) continue;
        m.bumped = true;
        m.bumpT = cp.bumpLock != null ? cp.bumpLock : 2.6;

        /* ① 先挨咬：贴上去的那一口躲不掉 */
        if (!p.dead && p.invuln <= 0 && m.contactCd <= 0) {
          m.contactCd = pv.touchCd;
          const el2 = pv.total - pv.left;
          const td = Math.round(((m.kind && m.kind.dmg) || pv.touchDmg)
            * (1 + el2 / 480) * (SW.TUNE.touchScale || 1) * (pv.armor != null ? pv.armor : 1));
          if (td > 0) B.damage(m, p, td, 'melee', { big: false, tag: '接触' });
          p.invuln = pv.iframe;
        }

        /* ② 再把它顶开 */
        B.damage(p, m, cp.contactDmg, 'melee', { tag: '剑道', big: false });
        const a = Math.atan2(m.y - p.y, m.x - p.x);
        m.knockT = Math.max(m.knockT || 0, 0.18);
        m.vx = Math.cos(a) * (cp.knock || 300) * sc;
        m.vy = Math.sin(a) * (cp.knock || 300) * sc;
        pv.contT = cp.contactCd;
        Fx.ring(p.x, p.y, 'rgba(255,140,150,.55)', p.r, p.r * 1.9, .18);
        B.shake = Math.max(B.shake, 2.5);
      }
    }

    /* 破烂女士：间歇召出修罗丸挡弹 */
    if (cp.guardEvery) tickShuraGuard(p, cp, dt);

    /* 莱茵：进化到第 1 / 4 段后自动打导弹 */
    if (pv.evo && pv.evo.lv > 0) tickRhineMissiles(p, dt);
  }

  function tickShuraGuard(p, cp, dt) {
    const sc = B.scale();
    const tgt = nearestMobTo(p.x, p.y, 520);
    const aim = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : (p.facing >= 0 ? 0 : Math.PI);
    if (p.shura) {
      const g = p.shura;
      g.t += dt;
      if (g.flash > 0) g.flash -= dt;
      const off = 52 * sc;
      const wx = p.x + Math.cos(aim) * off, wy = p.y + Math.sin(aim) * off;
      g.x += (wx - g.x) * Math.min(1, dt * 10);
      g.y += (wy - g.y) * Math.min(1, dt * 10);
      g.a = aim;
      if (g.t >= g.total) { p.shura = null; p.shuraCd = cp.guardEvery; }
      return;
    }
    p.shuraCd = (p.shuraCd == null ? cp.guardEvery : p.shuraCd) - dt;
    if (p.shuraCd > 0) return;
    p.shura = {
      t: 0, total: cp.guardTime, r: 34 * sc,
      x: p.x + Math.cos(aim) * 52 * sc, y: p.y + Math.sin(aim) * 52 * sc,
      a: aim, flash: 0, blocks: 0, maxBlocks: cp.guardBlocks || 6,
    };
    Fx.ring(p.x, p.y, 'rgba(90,140,255,.85)', p.r * .6, p.r * 3.4, .45);
    Fx.text(p.x, p.y + p.r + 16, '修罗丸', '#9dc0ff', 13);
  }

  function tickRhineMissiles(p, dt) {
    const pv = B.pve;
    const lv = pv.evo.lv;
    const s = weaponStats('rhine');
    if (lv >= 1) {
      pv.misT = (pv.misT == null ? 1.2 : pv.misT) - dt;
      if (pv.misT <= 0) {
        pv.misT = 3.4;
        for (let i = 0; i < 2; i++) {
          pvePlayerShot(p, aimAt(p, 640).a + (i - 0.5) * 0.42, {
            speed: 520, dmg: s.dmg * 0.4, kind: 'shard', color: '#7fd0ff',
            pierce: false, r: 8, life: 2.6, tag: '导弹', homing: 2,
            boom: 34, boomDmg: 0.7,
          });
        }
      }
    }
    if (lv >= 4) {
      pv.bigMisT = (pv.bigMisT == null ? 2.6 : pv.bigMisT) - dt;
      if (pv.bigMisT <= 0) {
        pv.bigMisT = 5.6;
        pvePlayerShot(p, aimAt(p, 640).a, {
          speed: 400, dmg: s.dmg * 0.9, kind: 'shard', color: '#ffb347',
          pierce: false, r: 13, life: 3.0, tag: '爆裂导弹', homing: 1.6,
          boom: 72, boomDmg: 1,
        });
        Fx.ring(p.x, p.y, 'rgba(255,190,110,.75)', p.r, p.r * 2.4, .2);
      }
    }
  }

  function spawnMob(kind, hp) {
    const f = B.makeFighter(mobChar(kind), 1);
    f.isMob = true;
    f.isElite = !!kind.elite;
    f.kind = kind;
    f.maxHp = f.hp = hp || kind.hp;
    f.speedBase = kind.speed * B.scale();
    f.costPool = 0;
    f.r = kind.radius * B.scale();
    f.awak = 0; f.awaken = 0;
    f.invuln = 0;
    f.contactCd = U.rand(0, 0.6);
    /* 秋云的撞击：每只怪一次贴身只吃一次，离开撞击圈后才重置 */
    f.bumped = false;
    /* 远程/特殊兵种的行为计时 */
    f.aiT = U.rand(0.8, 2.2);
    f.windT = 0;
    f.dashT = 0;
    f.beam = null;
    f.aimA = 0;
    /* 猎剑修女：锁定一个朝向，靠有限角速度慢慢拐过来，再沿朝向直冲 */
    f.headA = U.rand(0, Math.PI * 2);
    f.lungeT = 0;
    f.lungeWind = 0;
    f.lungeCd = U.rand(0.8, 1.8);
    f.sideSign = U.rand(0, 2) < 1 ? -1 : 1;
    /* 从场地外缘刷入 */
    const fl = B.field;
    const a = U.rand(0, Math.PI * 2);
    const R = Math.max(fl.w, fl.h) * 0.62;
    f.x = fl.x + fl.w / 2 + Math.cos(a) * R;
    f.y = fl.y + fl.h / 2 + Math.sin(a) * R;
    f.spawnT = 0.35;
    f.trail.length = 0;
    return f;
  }

  function killMob(f, killer) {
    if (f.dead) return;
    f.dead = true;
    f.deathT = 0;
    f.hp = 0;
    f.respawnT = -1;
    B.pve.kills++;
    spawnGem(f.x, f.y, (f.kind && f.kind.xp) || 1);
    /* 打掉修女是这一局唯一的补给点：回一小截血，不然 2 分钟起就是纯挨打 */
    if (f.kind && f.kind.ai === 'blood' && B.pve.player && !B.pve.player.dead) {
      const p = B.pve.player;
      const heal = Math.min(15, p.maxHp - p.hp);
      if (heal > 0) {
        p.hp += heal;
        Fx.text(p.x, p.y - 46, '+' + Math.round(heal), '#8ef2a8', 15);
      }
    }
    Fx.burst(f.x, f.y, 10, f.char.color, 260, 3, 0.5);
    Fx.ring(f.x, f.y, 'rgba(200,160,255,.7)', f.r, f.r * 3, 0.35);
  }

  /* 怪追玩家：直线靠近，不做弹球反弹 */
  function mobUpdate(f, dt) {
    if (f.spawnT > 0) { f.spawnT -= dt; }
    f.flash = Math.max(0, f.flash - dt * 2.6);
    f.invuln = Math.max(0, f.invuln - dt);
    f.contactCd -= dt;
    if (f.swordCd > 0) f.swordCd -= dt;
    if (f.stun > 0) f.stun -= dt;
    const p = B.pve.player;
    if (!p || p.dead) { f.vx = f.vy = 0; return; }
    /* 被鞭子抽退：这段时间不接管速度 */
    if (f.knockT > 0) {
      f.knockT -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= Math.pow(0.05, dt);
      f.vy *= Math.pow(0.05, dt);
      clampField(f);
      return;
    }
    if (f.stun > 0) { f.vx = f.vy = 0; return; }

    /* 按兵种分派：近战照旧，远程走各自的行为树 */
    const ai = f.kind && f.kind.ai;
    if (ai === 'ranged') { mobRanged(f, p, dt); return; }
    if (ai === 'beam') { mobBeam(f, p, dt); return; }
    if (ai === 'dash') { mobDashAtk(f, p, dt); return; }
    if (ai === 'blood') { mobBlood(f, p, dt); return; }
    if (ai === 'lance') { mobLance(f, p, dt); return; }

    const dx = p.x - f.x, dy = p.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = f.speedBase;
    f.vx = dx / d * sp;
    f.vy = dy / d * sp;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (Math.abs(f.vx) > 1) f.facing = f.vx > 0 ? 1 : -1;
    clampField(f);
  }

  function clampField(f) {
    const fl = B.field;
    const nx = U.clamp(f.x, fl.x + f.r, fl.x + fl.w - f.r);
    const ny = U.clamp(f.y, fl.y + f.r, fl.y + fl.h - f.r);
    const hit = (nx !== f.x) || (ny !== f.y);
    f.x = nx;
    f.y = ny;
    return hit;            /* 猎剑修女靠它判断「撞墙了没有」，其他兵不关心返回值 */
  }

  /* 远程兵走位：超过 keep 就压上，太近就后撤，距离刚好就侧向绕圈
     这样一堆远程兵不会挤在一条直线上，玩家必须绕场拆阵 */
  function mobApproach(f, p, dt, keep) {
    /* 前压节拍：每 5~8 秒缩到 55% 距离，主动送进鞭程，避免远程兵在圈外无限堆积 */
    f.pressT = (f.pressT == null ? U.rand(2.5, 5) : f.pressT) - dt;
    if (f.pressT <= 0) { f.pressT = U.rand(5, 8); f.pressTick = 1.1; }
    if (f.pressTick > 0) { f.pressTick -= dt; keep *= 0.42; }
    const dx = p.x - f.x, dy = p.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    let k = 0;
    if (d > keep + 30 * B.scale()) k = 1;
    else if (d < keep - 46 * B.scale()) k = -0.9;
    else {
      const a = Math.atan2(dy, dx) + Math.PI * 0.5 * f.sideSign;
      f.vx = Math.cos(a) * f.speedBase * 0.45;
      f.vy = Math.sin(a) * f.speedBase * 0.45;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (Math.abs(f.vx) > 1) f.facing = f.vx > 0 ? 1 : -1;
      clampField(f);
      return;
    }
    f.vx = dx / d * f.speedBase * k;
    f.vy = dy / d * f.speedBase * k;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (Math.abs(f.vx) > 1) f.facing = f.vx > 0 ? 1 : -1;
    clampField(f);
  }

  /* 敌方弹幕：PvE 独立一层，不碰 1v1 的 B.projectiles */
  function pveShoot(f, a, P, kind, r, dmg, speed, life) {
    const pv = B.pve;
    if (!pv) return;
    const sc = B.scale();
    const sp = speed * sc;
    pv.shots.push({
      x: f.x + Math.cos(a) * (f.r + 4),
      y: f.y + Math.sin(a) * (f.r + 4),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: r * sc, dmg: dmg, life: life, kind: kind,
      color: f.char.color, a: a, spin: U.rand(0, 6), slow: (P && P.slow) || 0,
    });
  }

  /* 打玩家统一走这里：吃 pv.armor（跑测用 --armor 0 验证流程不倒） */
  function hurtPlayer(src, P, tag, big) {
    const pv = B.pve;
    if (!pv || !pv.player || pv.player.dead) return 0;
    /* 天剑：觉醒期间无敌 */
    if (pv.passiveKey === 'skysaber' && (pv.awakenT || 0) > 0) return 0;
    const v = Math.round(P * (pv.armor != null ? pv.armor : 1));
    if (v <= 0) return 0;
    return B.damage(src, pv.player, v, 'shot', { tag: tag, big: !!big });
  }

  /* 远程兵：走到射程内，蓄力，开火（蓄力时锁角，玩家能靠走位躲） */
  function mobRanged(f, p, dt) {
    const P = f.kind.aiP;
    const sc = B.scale();
    if (f.windT > 0) {
      f.windT -= dt;
      if (f.windT <= 0) {
        if (P.kind === 'cross') pveShoot(f, f.aimA, P, 'cross', P.r, P.dmg, P.speed, 2.4);
        else pveShoot(f, f.aimA, P, 'orb', P.r, P.dmg, P.speed, 3.4);
        Fx.ring(f.x, f.y, P.kind === 'cross' ? 'rgba(150,215,255,.85)' : 'rgba(200,160,255,.85)',
          f.r * .6, f.r * 1.7, .24);
      }
      return;
    }
    mobApproach(f, p, dt, P.keep * sc);
    f.aiT -= dt;
    if (f.aiT > 0) return;
    if (U.dist(f.x, f.y, p.x, p.y) > 560 * sc) { f.aiT = .35; return; }
    f.aiT = P.cd * U.rand(0.85, 1.18);
    f.windT = P.wind;
    f.aimA = Math.atan2(p.y - f.y, p.x - f.x);
  }

  /* 唱诗：净化之光（照射）。站定蓄力 -> 一道长激光，命中一次 */
  function mobBeam(f, p, dt) {
    const P = f.kind.aiP;
    const sc = B.scale();
    if (f.beam) {
      const b = f.beam;
      b.t -= dt;
      if (!b.hit && !p.dead) {
        const rr = b.wid * 0.5 + p.r;
        if (U.segCircle(b.x1, b.y1, b.x2, b.y2, p.x, p.y, rr)) {
          b.hit = true;
          hurtPlayer(f, P.dmg, '净化之光', true);
          Fx.burst(p.x, p.y, 16, '#ffd0ea', 300, 3.6, .45);
        }
      }
      if (b.t <= 0) f.beam = null;
      return;
    }
    if (f.windT > 0) {
      f.windT -= dt;
      /* 蓄力 60% 之后锁角，留出躲避窗口 */
      if (f.windT > P.wind * 0.35) f.aimA = Math.atan2(p.y - f.y, p.x - f.x);
      if (f.windT <= 0) {
        const len = P.len * sc;
        f.beam = {
          t: P.beamT, hit: false, a: f.aimA, len: len, wid: P.wid * sc,
          x1: f.x, y1: f.y,
          x2: f.x + Math.cos(f.aimA) * len,
          y2: f.y + Math.sin(f.aimA) * len,
        };
        B.shake = Math.max(B.shake, 5);
      }
      return;
    }
    mobApproach(f, p, dt, P.keep * sc);
    f.aiT -= dt;
    if (f.aiT > 0) return;
    if (U.dist(f.x, f.y, p.x, p.y) > 620 * sc) { f.aiT = .4; return; }
    f.aiT = P.cd * U.rand(0.9, 1.15);
    f.windT = P.wind;
    f.aimA = Math.atan2(p.y - f.y, p.x - f.x);
  }

  /* 圣刃：蓄力 -> 直线突刺，撞到就打一次 */
  function mobDashAtk(f, p, dt) {
    const P = f.kind.aiP;
    const sc = B.scale();
    if (f.dashT > 0) {
      f.dashT -= dt;
      const sp = f.speedBase * P.mul;
      f.x += Math.cos(f.dashA) * sp * dt;
      f.y += Math.sin(f.dashA) * sp * dt;
      if (!f.dashHit && !p.dead && U.dist(f.x, f.y, p.x, p.y) <= f.r + p.r + 6 * sc) {
        f.dashHit = true;
        hurtPlayer(f, P.dmg, '圣光之刃', true);
        Fx.burst(p.x, p.y, 18, '#ffe08a', 330, 4, .5);
        B.shake = Math.max(B.shake, 11);
      }
      clampField(f);
      if (f.dashT <= 0) f.aiT = P.cd;
      return;
    }
    if (f.windT > 0) {
      f.windT -= dt;
      if (f.windT <= 0) {
        f.dashT = P.dashT;
        f.dashA = f.aimA;
        f.dashHit = false;
        Fx.slash(f.x, f.y, f.x + Math.cos(f.aimA) * f.r * 2.4,
          f.y + Math.sin(f.aimA) * f.r * 2.4, 'rgba(255,240,190,.9)', .18, 0, 3);
      }
      return;
    }
    mobApproach(f, p, dt, P.keep * sc);
    f.aiT -= dt;
    if (f.aiT > 0) return;
    if (U.dist(f.x, f.y, p.x, p.y) < 300 * sc) {
      f.windT = P.wind;
      f.aimA = Math.atan2(p.y - f.y, p.x - f.x);
    } else f.aiT = 0.3;
  }

  /* 猎剑修女：大剑突刺。
     她锁着一个朝向（headA），只按 P.turn 的角速度拐弯 —— 转不过来就是她的破绽：
     玩家绕着她跑，剑尖要画一大圈才追得上。对准之后短促一记突刺，速度快但不改向。 */
  function mobLance(f, p, dt) {
    const P = f.kind.aiP;
    const sc = B.scale();

    /* 出场第一帧：直接朝向玩家、清掉冷却、进入蓄力。
       spawnMob 里给的是随机朝向 + 0.8~1.8 秒冷却，那样它出场会先乱飘一会儿，
       玩家看不出「这家伙要冲了」—— 蓄力必须放在一开始 */
    if (!f.lanceInit) {
      f.lanceInit = true;
      f.lungeT = 0;
      f.lungeCd = 0;
      if (p && !p.dead) {
        f.headA = Math.atan2(p.y - f.y, p.x - f.x);
        f.lungeWind = P.lungeWind || 0.5;
      } else {
        f.lungeWind = 0;
      }
      return;
    }

    /* 撞墙僵直：速度归零，谁都看得出「它现在动不了」 */
    if (f.stunT > 0) {
      f.stunT -= dt;
      f.vx = 0;
      f.vy = 0;
      if (f.stunT <= 0) {
        f.restartT = P.restart || 0.8;
        f.lungeCd = (P.lungeCd || 2.6) * U.rand(0.9, 1.2);
      }
      return;
    }

    if (f.lungeT > 0) {
      /* 突刺中：方向彻底锁死。撞到边界就断开，绝不沿墙滑行或拐弯 */
      f.lungeT -= dt;
      const sp = f.speedBase * (P.lungeMul || 2);
      f.vx = Math.cos(f.headA) * sp;
      f.vy = Math.sin(f.headA) * sp;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.abs(f.vx) > 1) f.facing = f.vx > 0 ? 1 : -1;
      if (clampField(f)) {
        f.lungeT = 0;
        f.stunT = P.stunT || 1.2;
        B.shake = Math.max(B.shake, 6);
        Fx.burst(f.x, f.y, 9, '#8dffb4', 170, 3.2, .3);
        Fx.ring(f.x, f.y, 'rgba(140,255,180,.7)', 3, f.r * 2.4, .22);
        return;
      }
      if (f.lungeT <= 0) f.lungeCd = (P.lungeCd || 2.6) * U.rand(0.85, 1.15);
      return;
    }
    if (f.lungeWind > 0) {
      /* 蓄力：原地刹住，剑尖先亮一下，给玩家躲的时间 */
      f.lungeWind -= dt;
      f.vx *= Math.pow(0.02, dt);
      f.vy *= Math.pow(0.02, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.lungeWind <= 0) {
        f.lungeT = P.lungeT || 1.6;
        Fx.slash(f.x, f.y, f.x + Math.cos(f.headA) * f.r * 3.4,
          f.y + Math.sin(f.headA) * f.r * 3.4, 'rgba(130,255,175,.9)', .18, 0, 2.4);
      }
      clampField(f);
      return;
    }

    /* 撞墙之后重新起步：不是立刻满速，而是从 15% 慢慢推上来 */
    let ease = 1;
    if (f.restartT > 0) {
      f.restartT -= dt;
      const k = 1 - Math.max(0, f.restartT) / (P.restart || 0.8);
      ease = 0.15 + 0.85 * k;
    }

    /* 转向限速：这是「转弯能力下降」的本体。
       0.55 rad/s 意味着横向一闪它就再也掰不回来，只能顺着原方向走 */
    const want = Math.atan2(p.y - f.y, p.x - f.x);
    let da = want - f.headA;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const maxTurn = (P.turn || 0.55) * dt;
    const step = U.clamp(da, -maxTurn, maxTurn);
    f.headA += step;

    const sp = f.speedBase * ease;
    f.vx = Math.cos(f.headA) * sp;
    f.vy = Math.sin(f.headA) * sp;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (Math.abs(f.vx) > 1) f.facing = f.vx > 0 ? 1 : -1;

    f.lungeCd = (f.lungeCd || 0) - dt;
    const d = U.dist(f.x, f.y, p.x, p.y);
    /* 不再要求「角度对齐」才蓄力 —— 转向这么慢，等对齐等于永远不出手。
       现在是：冷却好了、距离合适就冲，瞄得准不准它自己也不管 */
    if (f.lungeCd <= 0 && d < 560 * sc && d > 40 * sc) {
      f.lungeWind = P.lungeWind || 0.5;
    }
    clampField(f);
  }

  /* 血月修女：贴脸压进 + 红剑绕身 + 周期性血域（域内掉血、她自己回血）
     单剑起加「血月轮」（蓄力整圈扫、留一个缺口），三剑起加「三日月」，
     蔷薇起加血环弹幕，月蚀的血域落地还会内收一圈血弹 */
  function mobBlood(f, p, dt) {
    const P = f.kind.aiP;
    const sc = B.scale();
    if (f.swingFlash > 0) f.swingFlash = Math.max(0, f.swingFlash - dt);
    mobApproach(f, p, dt, P.keep * sc);

    /* 环绕红剑：不做线段求交，用「到 BOSS 的极角 vs 剑角度」判定，够准且便宜 */
    /* 剑阵展开时先指向玩家：不然贴身的那一刻全靠随机角度，玩家读不到「剑冲我来了」 */
    if (f.bladeA == null) f.bladeA = Math.atan2(p.y - f.y, p.x - f.x);
    f.bladeA += dt * P.spin * (f.swingWind > 0 ? 1.9 : 1);   /* 蓄力时剑阵先转快 */
    f.bladeCd = Math.max(0, (f.bladeCd || 0) - dt);
    if (P.bladeN && !p.dead && !(f.bladeCd > 0)) {
      const len = f.r * P.bladeLen;
      const dx = p.x - f.x, dy = p.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < len + p.r) {
        const a = Math.atan2(dy, dx);
        /* 剑越近，允许的角度差越大（等价于固定剑宽） */
        const half = Math.max(0.16, (p.r + f.r * P.bladeW) / d);
        for (let i = 0; i < P.bladeN; i++) {
          let da = a - (f.bladeA + i / P.bladeN * Math.PI * 2);
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) < half) {
            hurtPlayer(f, P.bladeDmg, '血月斩', false);
            f.bladeCd = P.bladeCd;
            break;
          }
        }
      }
    }

    if (P.fieldCd) {
    /* 血域：以「锁定瞬间玩家所在位置」为中心铺开，先 0.6 秒预警再落地。
       她跑不过玩家（46 vs 170+），锁脚下才有威胁；跟随式领域只会被遛狗。 */
    if (f.fieldCdT == null) { f.fieldCdT = P.fieldCd * 0.5; f.fieldOn = 0; f.fieldWind = 0; }
    if (f.fieldWind > 0) {
      f.fieldWind -= dt;
      if (f.fieldWind <= 0) {
        f.fieldOn = P.fieldT;
        f.fieldTick = 0;
        Fx.ring(f.fieldX, f.fieldY, 'rgba(255,60,90,.92)', P.fieldR * sc * 0.2, P.fieldR * sc, .45);
        Fx.burst(f.fieldX, f.fieldY, 14, '#ff4d6a', 240, 3, .5);
        B.shake = Math.max(B.shake, 9);
        /* 月蚀：血域落地那一下，从域外缘同时向内收一圈血弹 ——
           站在域心不动就会被八发一起撞上，必须提前离开中心 */
        if (P.fieldBurst) {
          const d0 = P.fieldR * sc * 0.86;
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + U.rand(-0.08, 0.08);
            pveShoot({
              x: f.fieldX + Math.cos(a) * d0,
              y: f.fieldY + Math.sin(a) * d0,
              r: 6, char: f.char,
            }, a + Math.PI, null, 'ring', 8, Math.round(P.fieldDps * 0.7), 132, 3.4);
          }
          Fx.ring(f.fieldX, f.fieldY, 'rgba(255,120,190,.7)', P.fieldR * sc * 0.9, P.fieldR * sc * 0.5, .5);
        }
      }
    } else if (f.fieldOn > 0) {
      f.fieldOn -= dt;
      /* 每 0.5 秒结算一次：玩家踩进去立刻掉血，而不是等满 1 秒 */
      f.fieldTick = (f.fieldTick || 0) + dt;
      if (f.fieldTick >= 0.5) {
        f.fieldTick -= 0.5;
        if (!p.dead && U.dist(f.fieldX, f.fieldY, p.x, p.y) < P.fieldR * sc) {
          hurtPlayer(f, P.fieldDps * 0.5, '血域', false);
          f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.008);
        }
      }
    } else {
      f.fieldCdT -= dt;
      if (f.fieldCdT <= 0 && !p.dead) {
        f.fieldCdT = P.fieldCd;
        f.fieldWind = 0.6;
        f.fieldX = p.x;
        f.fieldY = p.y;
      }
    }
    }

    /* 血月轮：剑阵先收紧蓄力半秒，再整圈扫下来 ——
       蓄力开始时把缺口锁在「背对玩家」的一侧，所以唯一的活路是绕到她背后 */
    if (P.swingCd) {
      if (f.swingT == null) f.swingT = P.swingCd * 0.75;
      if (f.swingWind > 0) {
        f.swingWind -= dt;
        if (f.swingWind <= 0) {
          const R = f.r * P.bladeLen * 1.06;
          const T = f.kind.tint || [255, 48, 88];
          const col = 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',';
          const gapHalf = 0.42;
          /* 环：一圈实体化的血月压下来（渲染在 render.js 按 swingFlash 画），
             外面再叠一圈涟漪 + 血雨，冲击感全靠这三层 */
          Fx.ring(f.x, f.y, col + '.9)', R * 0.5, R * 1.24, .4);
          Fx.burst(f.x, f.y, 26, col + '.95)', 340, 3.6, .5);
          f.swingFlash = 0.34;
          /* 放射光刺：从剑根一路划到圈外，缺口那边不划 */
          for (let i = 0; i < 28; i++) {
            const a = i / 28 * Math.PI * 2 + f.bladeA;
            if (Math.abs(U.angDiff(a, f.swingGap)) < gapHalf * 0.8) continue;
            const r1 = f.r * 0.7, r2 = R * (1.06 + (i % 3) * 0.06);
            Fx.slash(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1,
              f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2,
              col + '.85)', .26 + (i % 4) * .05, 0, 1.5 + (i % 2));
          }
          B.shake = Math.max(B.shake, 13);
          if (!p.dead && U.dist(f.x, f.y, p.x, p.y) < R
            && Math.abs(U.angDiff(Math.atan2(p.y - f.y, p.x - f.x), f.swingGap)) > gapHalf) {
            hurtPlayer(f, Math.round(P.bladeDmg * 1.7), '血月轮', true);
          }
          f.swingT = P.swingCd;
        }
      } else {
        f.swingT -= dt;
        if (f.swingT <= 0 && !p.dead) {
          f.swingT = P.swingCd;
          f.swingWind = P.swingWind || 0.5;
          /* 缺口甩到玩家侧面 90°：贴身的侧移一步就能钻进去，站远了只能往外跑 */
          f.swingGap = Math.atan2(p.y - f.y, p.x - f.x) + (U.rand(0, 2) < 1 ? 1 : -1) * Math.PI * 0.5;
        }
      }
    }

    /* 三日月：三剑朝玩家收拢，各甩出一道月牙刀光，扇形夹击逼你侧闪 */
    if (P.moonCd) {
      if (f.moonT == null) f.moonT = P.moonCd * 0.9;
      f.moonT -= dt;
      if (f.moonT <= 0 && !p.dead) {
        f.moonT = P.moonCd;
        const a0 = Math.atan2(p.y - f.y, p.x - f.x);
        const n = P.moonN || 3;
        const T = f.kind.tint || [255, 48, 88];
        const col = 'rgba(' + T[0] + ',' + T[1] + ',' + T[2] + ',';
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 0.3;
          pveShoot(f, a, null, 'moon', 11, P.moonDmg || 6, 210, 3.4);
          Fx.slash(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r,
            f.x + Math.cos(a) * f.r * 3.2, f.y + Math.sin(a) * f.r * 3.2,
            col + '.7)', .2, 0, 2);
        }
        /* 剑阵瞬间亮一下，让"收拢"这个动作看得见 */
        Fx.ring(f.x, f.y, col + '.8)', f.r * 0.5, f.r * 2.6, .3);
        B.shake = Math.max(B.shake, 6);
      }
    }

    /* 血环：从蔷薇起会朝四周吐一圈血弹，逼玩家在剑圈外还要躲弹 */
    if (P.ringCd) {
      if (f.ringT == null) f.ringT = P.ringCd * 0.7;
      f.ringT -= dt;
      if (f.ringT <= 0 && !p.dead) {
        f.ringT = P.ringCd;
        const n = P.ringN || 8;
        const base = f.bladeA * 0.35;
        for (let i = 0; i < n; i++) {
          pveShoot(f, base + i / n * Math.PI * 2, null, 'ring',
            9, P.ringDmg || 5, P.ringSpeed || 150, 3.2);
        }
        Fx.ring(f.x, f.y, 'rgba(255,90,150,.75)', f.r * 0.8, f.r * 2.4, .28);
      }
    }

    /* 血月冲：贴不上就先扑一段，否则三把剑永远是摆设 */
    f.dashCd = Math.max(0, (f.dashCd == null ? 2.5 : f.dashCd) - dt);
    if (f.dashT > 0) {
      f.dashT -= dt;
      f.x += Math.cos(f.dashA) * P.dashSpeed * sc * dt;
      f.y += Math.sin(f.dashA) * P.dashSpeed * sc * dt;
      clampField(f);
      f.trail.push({ x: f.x, y: f.y, life: 0.26, color: f.char.color });
      if (f.trail.length > 10) f.trail.shift();
      /* 冲到贴身距离就刹住，别从玩家身上碾过去 */
      if (U.dist(f.x, f.y, p.x, p.y) < P.keep * sc * 0.85) f.dashT = 0;
    } else if (f.dashCd <= 0 && !p.dead) {
      const dd = U.dist(f.x, f.y, p.x, p.y);
      if (dd > 110 * sc) {
        f.dashCd = P.dashCd;
        f.dashT = 0.3;
        f.dashA = Math.atan2(p.y - f.y, p.x - f.x);
        Fx.ring(f.x, f.y, 'rgba(255,70,100,.85)', f.r * 0.6, f.r * 1.8, .24);
      }
    }
  }

  /* 弹幕推进 + 命中玩家 */
  function updateShots(dt) {
    const pv = B.pve;
    if (!pv || !pv.shots || !pv.shots.length) return;
    const p = pv.player;
    const fl = B.field;
    for (let i = pv.shots.length - 1; i >= 0; i--) {
      const s = pv.shots[i];

      /* 追踪（诺伦） */
      if (s.side === 'p' && s.homing) {
        const tgt = nearestMobTo(s.x, s.y, 300);
        if (tgt) {
          let da = Math.atan2(tgt.y - s.y, tgt.x - s.x) - s.a;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          s.a += U.clamp(da, -8 * dt, 8 * dt);
          const sp = Math.hypot(s.vx, s.vy) || 1;
          s.vx = Math.cos(s.a) * sp;
          s.vy = Math.sin(s.a) * sp;
        }
      }

      /* 核弹黏在目标身上：跟着走，等引信烧完（贴在怪边缘，不埋进身体里） */
      if (s.stuck && s.stuckTo) {
        if (s.stuckTo.dead) {
          s.life = 0;
        } else {
          const rr = (s.stuckTo.r || 16) + 10 * B.scale();
          s.x = s.stuckTo.x + Math.cos(s.stuckAng || 0) * rr;
          s.y = s.stuckTo.y + Math.sin(s.stuckAng || 0) * rr;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      s.spin += dt * 7;

      /* 回旋刃（天剑进化）：飞出去 → 掉头追玩家 → 接住收刀。
         去程和回程各能命中一次同一个目标（turn 时清 hitSet），这是"飞回来还有用"的关键。 */
      if (s.side === 'p' && s.boomer) {
        s.bt += dt;
        if (s.bt >= s.boomer.out) {
          if (!s.turned) { s.turned = true; s.hitSet.length = 0; }
          const sp = Math.max(660, Math.hypot(s.vx, s.vy));
          const want = Math.atan2(p.y - s.y, p.x - s.x);
          let da = want - s.a;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          s.a += U.clamp(da, -9 * dt, 9 * dt);
          s.vx = Math.cos(s.a) * sp;
          s.vy = Math.sin(s.a) * sp;
          if (U.dist(s.x, s.y, p.x, p.y) < p.r + s.r * 0.8) {
            s.life = 0;
            Fx.burst(p.x, p.y, 9, '#bfe9ff', 240, 3, .3);
            Fx.ring(p.x, p.y, 'rgba(160,230,255,.8)', s.r * 0.5, s.r * 1.6, .22);
          }
        }
      }

      /* 撞墙反弹（影的分身） */
      if (s.side === 'p' && s.bounceLeft > 0) {
        let hit = false;
        if (s.x < fl.x + s.r) { s.x = fl.x + s.r; s.vx = -s.vx; hit = true; }
        else if (s.x > fl.x + fl.w - s.r) { s.x = fl.x + fl.w - s.r; s.vx = -s.vx; hit = true; }
        if (s.y < fl.y + s.r) { s.y = fl.y + s.r; s.vy = -s.vy; hit = true; }
        else if (s.y > fl.y + fl.h - s.r) { s.y = fl.y + fl.h - s.r; s.vy = -s.vy; hit = true; }
        if (hit) {
          s.bounceLeft--;
          s.a = Math.atan2(s.vy, s.vx);
          Fx.burst(s.x, s.y, 3, s.color, 140, 2, .2);
        }
      }

      const out = s.x < fl.x - 80 || s.x > fl.x + fl.w + 80 ||
                  s.y < fl.y - 80 || s.y > fl.y + fl.h + 80;
      if (s.life <= 0 || out) {
        /* 引信烧完的核弹：原地炸开并留下伤害区 */
        if (s.side === 'p' && s.boom > 0 && s.life <= 0 && s.kind === 'nuke') {
          /* 和 1v1 的 G·诺伦 同一套节奏：命中圈先炸一次，再原地撑开一整片火海 */
          const dmg = s.dmg * (s.boomDmg || 1);
          pveExplode(p, s.x, s.y, s.boom, dmg, s.tag || '爆炸', s.color);
          const R = Math.max(s.boom, (B.field.w || 400) * (s.zoneR || 0.3));
          if (s.zone > 0) {
            /* 同屏最多 3 片火海（含 1 片正在淡出的）：再丢就把最老的一片压成 0.5 秒淡出。
               否则连炸 + 觉醒技 4 连核弹会把整屏刷成一块黄幕，而且每帧都在画大半径渐变。 */
            if (pv.zones.length >= 2) {
              const old = pv.zones[0];
              if (old.t > 0.5) {
                const age = old.dur - old.t;
                old.dur = age + 0.5;
                old.t = 0.5;
              }
            }
            pv.zones.push({
              kind: 'nuke', x: s.x, y: s.y,
              r: Math.min(18, R * 0.18), R: R,
              grow: s.grow || 0.7,
              t: s.zone, dur: s.zone,
              dmg: s.zdps, tick: 0.4, tickT: 0,
              root: s.root || 0,
              color: '#ffc24a',
            });
            /* 淡出中的那片仍在数组里，所以硬上限是 3；再多就直接丢掉最老的 */
            while (pv.zones.length > 3) pv.zones.shift();
          }
          /* 爆炸余波：进化前没有火海，余波必须自己说清「炸到哪」——
             所以火团按真实爆炸半径铺开、留 0.44 秒；进化后火海会接上，余波留 0.58 秒。 */
          const after = s.zone > 0 ? 0.62 : 0.5;
          Fx.boom(s.x, s.y, s.boom * 0.78, '#ffb648', after);
          /* 套一层更小更亮的核心：单层爆风在深色地面上偏暗，看不出「炸到了哪」 */
          Fx.boom(s.x, s.y, s.boom * 0.42, '#ffe9a8', after * 0.82);
          Fx.ring(s.x, s.y, 'rgba(255,226,150,.95)', 12, s.boom * 0.98, after);
          Fx.ring(s.x, s.y, 'rgba(255,150,60,.55)', 8, s.boom * 1.16, after + 0.14);
          Fx.burst(s.x, s.y, 20, '#ffe9b0', 380, 4.2, after + 0.08);
          B.shake = Math.max(B.shake, 14);
        }
        pv.shots.splice(i, 1);
        continue;
      }

      /* 玩家弹道：只打怪 */
      if (s.side === 'p') {
        let consumed = false;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (s.hitSet.indexOf(m) >= 0) continue;
          if (U.dist(s.x, s.y, m.x, m.y) > s.r + m.r) continue;
          s.hitSet.push(m);
          /* 核弹：黏住目标停住，引信烧完再炸（不是撞到就炸） */
          if (s.kind === 'nuke' && !s.stuck) {
            s.stuck = true;
            s.stuckTo = m;
            s.stuckAng = Math.atan2(s.y - m.y, s.x - m.x) || 0;
            s.vx = 0; s.vy = 0;
            s.life = s.fuse || 0.45;
            s.hitSet.length = 0;
            Fx.burst(s.x, s.y, 6, '#ffd9a8', 150, 2.4, .22);
            break;
          }
          B.damage(p, m, s.dmg, 'shot', { tag: s.tag || '副武器' });
          /* 雪鸮：狙击击杀即装填 —— 单发不穿透，靠连杀补足清场能力 */
          if (s.tag === '狙击' && m.dead && pv.weapons.snowowl) pv.weapons.snowowl.t = Math.min(pv.weapons.snowowl.t, 0.5);
          /* 光枪：只炸第一次，弹体继续无限穿透 */
          if (s.boom > 0 && !s.boomDone) {
            s.boomDone = true;
            pveExplode(p, s.x, s.y, s.boom, s.dmg * (s.boomDmg || 1), s.tag || '爆炸', s.color);
          }
          if (s.para > 0) {
            m.stun = Math.max(m.stun || 0, s.para);
            Fx.text(m.x, m.y - m.r - 20, '麻痹', '#c9a4ff', 13);
          }
          Fx.burst(s.x, s.y, 6, s.color, 230, 2.8, .3);
          if (!s.pierce) { consumed = true; break; }
        }
        if (consumed) { pv.shots.splice(i, 1); continue; }
        continue;
      }

      /* 敌方弹幕：只打玩家 */
      if (p.dead) continue;
      /* 修罗丸：挡在身前，替玩家吃弹幕（有耐久，挡满就碎） */
      if (p.shura) {
        const g = p.shura;
        if (U.dist(s.x, s.y, g.x, g.y) <= g.r + s.r) {
          pv.shots.splice(i, 1);
          g.flash = 0.2;
          g.blocks = (g.blocks || 0) + 1;
          Fx.burst(g.x, g.y, 6, '#9dc0ff', 220, 2.6, .25);
          if (g.blocks >= (g.maxBlocks || 6)) {
            p.shura = null;
            p.shuraCd = (CHAR_PASSIVES.akigumo_broken.guardEvery || 7) * 0.6;
          }
          continue;
        }
      }
      if (U.dist(s.x, s.y, p.x, p.y) > s.r + p.r) continue;
      pv.shots.splice(i, 1);
      /* 圣光护盾：吸收远程子弹 */
      if (pv.shieldT > 0) {
        Fx.burst(s.x, s.y, 7, '#ffe6a8', 200, 2.6, .28);
        continue;
      }
      if (pv.shotInv > 0) continue;
      hurtPlayer(null, s.dmg, s.kind === 'cross' ? '信仰之壁' : '弹幕', false);
      /* 玩家自己的受击间隔：避免同帧十几发叠在一起把人秒了 */
      pv.shotInv = 0.32;
      if (s.slow > 0) { p.slowT = Math.max(p.slowT || 0, s.slow); p.slowMul = 0.55; }
      Fx.burst(s.x, s.y, 8, s.color, 200, 3, .3);
    }
  }


  /* 怪与怪互相推开：空间哈希，避免 O(n²) */
  function separateMobs() {
    const list = [];
    for (const m of B.fighters) if (m.isMob && !m.dead) list.push(m);
    if (list.length < 2) return;
    const cell = 44 * B.scale();
    const grid = new Map();
    for (const m of list) {
      const k = ((m.x / cell) | 0) + ',' + ((m.y / cell) | 0);
      let a = grid.get(k);
      if (!a) grid.set(k, a = []);
      a.push(m);
    }
    for (const m of list) {
      const cx = (m.x / cell) | 0, cy = (m.y / cell) | 0;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          const a = grid.get((cx + ix) + ',' + (cy + iy));
          if (!a) continue;
          for (const o of a) {
            if (o === m) continue;
            const dx = o.x - m.x, dy = o.y - m.y;
            const minD = m.r + o.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD || d2 < 0.0001) continue;
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.5;
            const nx = dx / d, ny = dy / d;
            m.x -= nx * push; m.y -= ny * push;
            o.x += nx * push; o.y += ny * push;
          }
        }
      }
    }
  }

  /* 临时风筝：远离最近的怪群，保持可战斗的间距 */
  /* 自动跑测用的走位：24 方向采样，往怪最少的方向跑（真人是靠眼睛，这里只能这样） */
  function pveKite(p, dt) {
    const pv = B.pve;
    const fl = B.field;
    pv.kiteT = (pv.kiteT || 0) - dt;
    if (pv.kiteT <= 0 || pv.kiteA == null) {
      pv.kiteT = 0.12;
      let bestA = 0, best = -1e18;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        const tx = p.x + Math.cos(a) * 130;
        const ty = p.y + Math.sin(a) * 130;
        let sc = 0;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          const dx = tx - m.x, dy = ty - m.y;
          const d2 = dx * dx + dy * dy;
          /* 远程兵站在鞭程外，威胁半径按射程放大 */
          const reach = (m.kind && m.kind.ai) ? 62000 : 40000;
          if (d2 > reach) continue;
          sc -= reach - d2;
        }
        /* 弹幕：按落点预测，别直接撞上去 */
        for (const s of (pv.shots || [])) {
          const px = s.x + s.vx * 0.35, py = s.y + s.vy * 0.35;
          const dx = tx - px, dy = ty - py;
          const d2 = dx * dx + dy * dy;
          if (d2 > 14000) continue;
          sc -= (14000 - d2) * 1.8;
        }
        /* 正在蓄力的激光 / 突刺：把正前方当成禁区 */
        for (const m of B.fighters) {
          if (!m.isMob || m.dead || !(m.windT > 0)) continue;
          const ax = m.x + Math.cos(m.aimA) * 90, ay = m.y + Math.sin(m.aimA) * 90;
          const dx = tx - ax, dy = ty - ay;
          const d2 = dx * dx + dy * dy;
          if (d2 > 12000) continue;
          sc -= (12000 - d2) * 2.4;
        }
        if (tx < fl.x + 46 || tx > fl.x + fl.w - 46) sc -= 9e6;
        if (ty < fl.y + 46 || ty > fl.y + fl.h - 46) sc -= 9e6;
        /* 顺路捡经验：真人不会只绕圈不打钱，跑测也得会去吃宝石，
           否则模拟出来的等级永远偏低，难度会被高估 */
        let gem = 0;
        for (const g of (pv.gems || [])) {
          const gx = g.x - tx, gy = g.y - ty;
          const gd2 = gx * gx + gy * gy;
          if (gd2 > 26000) continue;
          gem += (26000 - gd2);
        }
        /* 危险时把宝石的吸引力压到很低：饿死也好过撞进怪堆 */
        if (gem) sc += gem * (sc > -2.5e6 ? 0.16 : 0.02);
        if (sc > best) { best = sc; bestA = a; }
      }
      pv.kiteA = bestA;
    }
    p.x += Math.cos(pv.kiteA) * p.speedBase * dt;
    p.y += Math.sin(pv.kiteA) * p.speedBase * dt;
    p.x = U.clamp(p.x, fl.x + p.r, fl.x + fl.w - p.r);
    p.y = U.clamp(p.y, fl.y + p.r, fl.y + fl.h - p.r);
  }

  /* PvE 主逻辑：刷怪节奏 / 怪接触玩家 / 倒计时 */
  function pveUpdate(dt) {
    const pv = B.pve;
    if (!pv) return;
    const p = pv.player;

    /* 进化瞬间的定格：把这一小段时间的流速压下去，让演出看得清 */
    if (pv.hitStop > 0) {
      pv.hitStop = Math.max(0, pv.hitStop - dt);
      dt *= 0.18;
    }
    if (pv.evoFlashT > 0) {
      pv.evoFlashT -= dt;
      if (pv.evoFlashT <= 0) { pv.evoFlashT = 0; pv.evoFlash = 0; }
    }

    /* 倒计时 */
    pv.left -= dt;
    if (pv.left <= 0) { pv.left = 0; endBattle(0); return; }

    /* 刷怪：波次表决定场上目标 / 间隔 / 怪种，血量走独立曲线 */
    const elapsed = pv.total - pv.left;
    /* 波次表是按 1800 秒铺的（表尾 1710s）。短局如果只看绝对秒数，
       玩家永远玩不到后半段，收尾会很平。所以最后 90 秒给一条加速：
       曲线最多跑到 ×1.35，把终局那一档提前撞上来。长局也吃这个，
       只是 30 分钟局本来就在表尾附近，加速后直接压到最后几档，正好。 */
    let curveE = elapsed;
    if (pv.left < 90) {
      curveE = elapsed * (1 + (90 - pv.left) / 90 * 0.35);
    }
    const wave = waveAt(curveE);
    pv.limit = pv.limitOverride || wave.cap;
    pv.waveIdx = WAVES.indexOf(wave);
    pv.spawnGap = wave.gap * (pv.gapMul || 0.70);

    pv.spawnT -= dt;
    const aliveN = countMobs();
    if (pv.spawnT <= 0 && aliveN < pv.limit) {
      pv.spawnT = pv.spawnGap;
      const n = Math.min(pv.batch + Math.min(2, Math.floor(elapsed / 450)), pv.limit - aliveN);
      const mul = hpMulAt(curveE);
      /* 各兵种当前数量：远程兵在鞭程外清不掉，必须单独封顶，否则会堆成弹幕墙 */
      const aliveBy = {};
      for (const f of B.fighters) {
        if (f.isMob && !f.dead && f.kindId) aliveBy[f.kindId] = (aliveBy[f.kindId] || 0) + 1;
      }
      for (let i = 0; i < n; i++) {
        let id = wave.k[Math.min(wave.k.length - 1, (U.rand(0, wave.k.length)) | 0)];
        /* 抽到已经封顶的兵种就换一个，换不到就退回蝙蝠 */
        for (let tries = 0; tries < 5; tries++) {
          const kk = MOB_KIND[id];
          if (!kk || !kk.maxAlive || (aliveBy[id] || 0) < kk.maxAlive) break;
          id = wave.k[Math.min(wave.k.length - 1, (U.rand(0, wave.k.length)) | 0)];
          if (tries === 4) id = 'bat';
        }
        const kind = MOB_KIND[id] || MOB_KIND.bat;
        const f = spawnMob(kind, Math.max(1, Math.round(kind.hp * mul)));
        f.kindId = id;
        aliveBy[id] = (aliveBy[id] || 0) + 1;
        B.fighters.push(f);
      }
    }

    /* 精英/BOSS：2 分钟先来只没花样的眷属，4 分钟单剑、8 分钟三剑，
       之后每 5 分钟一档（蔷薇 → 月蚀 → 月蚀继续加血），不占场上上限 */
    if (pv.nextElite == null) pv.nextElite = BOSS_PLAN[0];
    if (elapsed >= pv.nextElite) {
      const n = pv.bossN || 0;                                    /* 第几只，0 起 */
      const kk = BOSS_TIERS[Math.min(BOSS_TIERS.length - 1, n)];
      const ek = MOB_KIND[kk];
      const extra = n >= BOSS_TIERS.length - 1
        ? Math.pow(1.35, n - (BOSS_TIERS.length - 1)) : 1;
      pv.bossN = n + 1;
      pv.nextElite = (n + 1 < BOSS_PLAN.length) ? BOSS_PLAN[n + 1] : pv.nextElite + 300;
      const boss = spawnMob(ek, Math.max(1, Math.round(ek.hp * hpMulAt(elapsed) * extra)));
      boss.kindId = kk;
      B.fighters.push(boss);
      Fx.text(pv.player.x, pv.player.y - 70, ek.name + ' 降临', ek.color, 18);
    }

    separateMobs();
    updateGems(dt);
    updateShots(dt);
    if (pv.shotInv > 0) pv.shotInv -= dt;

    /* 临时风筝：手动操控上线后不再需要，只剩自动跑测用 */
    if (!p.dead && !pv.manual) pveKite(p, dt);

    /* 玩家无敌帧：1v1 里由 charUpdate 递减，PvE 玩家不走那套状态机，这里自己减 */
    if (p.invuln > 0) p.invuln -= dt;

    /* 冲刺：额外位移 + 短暂无敌 + 残影 */
    if (pv.dashCd > 0) pv.dashCd -= dt;
    if (pv.dashT > 0 && !p.dead) {
      pv.dashT -= dt;
      const k = Math.max(0.35, pv.dashT / pv.dashDur);
      p.x += pv.dashVX * dt * k;
      p.y += pv.dashVY * dt * k;
      const df = B.field;
      p.x = U.clamp(p.x, df.x + p.r, df.x + df.w - p.r);
      p.y = U.clamp(p.y, df.y + p.r, df.y + df.h - p.r);
      p.invuln = Math.max(p.invuln, 0.06);
      p.trail.push({
        x: p.x, y: p.y, life: 0.34,
        color: (pv.evolved && pv.evolved.akigumo) ? '#ffd166' : p.char.color,
      });
      if (p.trail.length > 26) p.trail.shift();

      /* 进化 · 村好刀：闪避全程无敌，擦到谁就切谁（每次闪避对同一目标只结算一次）。
         这是「用闪避穿过怪堆」的奖励，不是额外输出循环 —— 单次伤害高但不能反复刷。 */
      if (pv.evolved && pv.evolved.akigumo) {
        p.invuln = Math.max(p.invuln, 0.14);
        const sc2 = B.scale();
        if (!pv.dashHit) pv.dashHit = [];
        const dd = weaponStats('akigumo').dmg * 1.6;
        for (const m of B.fighters) {
          if (!m.isMob || m.dead) continue;
          if (pv.dashHit.indexOf(m) >= 0) continue;
          if (U.dist(m.x, m.y, p.x, p.y) > p.r + m.r + 16 * sc2) continue;
          pv.dashHit.push(m);
          B.damage(p, m, dd, 'melee', { tag: '村好刀', big: true });
          const ang = Math.atan2(m.y - p.y, m.x - p.x);
          m.knockT = Math.max(m.knockT || 0, 0.2);
          m.vx = Math.cos(ang) * 380 * sc2;
          m.vy = Math.sin(ang) * 380 * sc2;
          const ca = ang + Math.PI / 2;
          const L = 74 * sc2;
          Fx.slash(m.x - Math.cos(ca) * L, m.y - Math.sin(ca) * L,
            m.x + Math.cos(ca) * L, m.y + Math.sin(ca) * L,
            'rgba(255,226,150,.9)', .3, 0, 5);
          Fx.slash(m.x - Math.cos(ca) * L * 0.92, m.y - Math.sin(ca) * L * 0.92,
            m.x + Math.cos(ca) * L * 0.92, m.y + Math.sin(ca) * L * 0.92,
            'rgba(255,255,255,.96)', .3, .02, 1.8);
          Fx.burst(m.x, m.y, 8, '#ffd166', 300, 3, .35);
          B.shake = Math.max(B.shake, 7);
        }
      }
    }

    /* 基础回复：原作的 Recovery 位很弱，只给「脱战才回」的一条细线 */
    pv.regenT = (pv.regenT || 0) + dt;
    if (pv.regenT >= 6 && !p.dead) {
      pv.regenT = 0;
      if (p.violentT > 0) p.violentT -= 6;          /* 刚挨过打就不回 */
      else if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
    }

    /* 玩家的输出手段：面向方向的间歇式挥砍 */
    /* 副武器池：各自按冷却自动对最近敌人释放 */
    if (!p.dead) tickWeapons(p, dt);
    if (!p.dead) tickLance(p, dt);
    if (!p.dead) tickCharPassive(p, dt);
    tickFrameQueue(dt);
    tickAwakenPvE(p, dt);

    /* 怪接触玩家：逐怪独立冷却 + 玩家无敌帧（天剑觉醒期完全免疫） */
    const saberImmune = pv.passiveKey === 'skysaber' && (pv.awakenT || 0) > 0;
    if (!p.dead && p.invuln <= 0 && !saberImmune) {
      for (const m of B.fighters) {
        if (!m.isMob || m.dead || m.spawnT > 0 || m.contactCd > 0) continue;
        if (U.dist(m.x, m.y, p.x, p.y) > m.r + p.r) continue;
        m.contactCd = pv.touchCd;
        const touchMul = 1 + elapsed / 480;
        const td = Math.round(((m.kind && m.kind.dmg) || pv.touchDmg) * touchMul * (SW.TUNE.touchScale || 1) * (pv.armor != null ? pv.armor : 1));
        if (td > 0) B.damage(m, p, td, 'melee', { big: false, tag: '接触' });
        p.invuln = pv.iframe;
        /* 受击把近身怪一起震开，避免被围死（VS 的受击硬直同理） */
        for (const o of B.fighters) {
          if (!o.isMob || o.dead) continue;
          const ox = o.x - p.x, oy = o.y - p.y;
          const od = Math.hypot(ox, oy) || 1;
          if (od > 72 * B.scale()) continue;
          o.x += ox / od * 16 * B.scale();
          o.y += oy / od * 16 * B.scale();
        }
        break;
      }
    }

    /* 清理尸体 */
    pv.cleanT = (pv.cleanT || 0) + dt;
    if (pv.cleanT > 0.4) {
      pv.cleanT = 0;
      for (let i = B.fighters.length - 1; i >= 0; i--) {
        const m = B.fighters[i];
        if (m.isMob && m.dead && m.deathT > 0.8) B.fighters.splice(i, 1);
      }
    }

    /* 玩家阵亡 */
    if (p.dead && B.state === 'fight') endBattle(-1);
  }

  function countMobs() {
    let n = 0;
    for (const m of B.fighters) if (m.isMob && !m.dead) n++;
    return n;
  }

  /* PvE 开局：复用 setup 的清理流程，只留一个玩家 */
  B.startPvE = function (charId, opt) {
    opt = opt || {};
    const ch = SW.Data.get(charId);
    if (!ch) return false;
    this.pveOn = false;
    this.setup(ch, ch);

    this.cd = opt.cd != null ? opt.cd : 0.8;
    const p = this.fighters[0];
    const fl = this.field;
    p.x = fl.x + fl.w / 2;
    p.y = fl.y + fl.h / 2;
    p.vx = p.vy = 0;
    p.trail.length = 0;
    /* 玩家血量走 VS 的 100 点尺子，而不是 1v1 的两三千 */
    p.maxHp = p.hp = opt.hp != null ? opt.hp : 100;
    this.fighters = [p];

    const H = this.H || 932;
    const ds = opt.dmgScale != null ? opt.dmgScale : 1 / 40;
    const baseDmg = ch.contactDamage > 0 ? ch.contactDamage * ds : 10;
    const totalSec = opt.sec != null ? opt.sec : 600;
    /* 短局的容错要高一点：3/10 分钟局是给第一次点进来的人玩的，
       拿 30 分钟局的压力去压他，五分钟后就没得玩了。
       1800 秒保持原来的 0.70 不动，越短越松，最多放到 0.84。 */
    const shortAllow = Math.max(0, Math.min(1, 1 - totalSec / 1800));
    this.pve = {
      player: p,
      total: totalSec,
      left: totalSec,
      limit: opt.limit != null ? opt.limit : 55,
      limitOverride: opt.limit != null ? opt.limit : 0,
      armor: opt.armor != null ? opt.armor : 1,
      spawnGap: opt.gap != null ? opt.gap : 0.85,
      batch: opt.batch != null ? opt.batch : 2,
      gapMul: opt.gapMul != null ? opt.gapMul : (0.70 + shortAllow * 0.14),
      spawnT: 0.6,
      cleanT: 0,
      kills: 0,
      touchDmg: opt.touchDmg != null ? opt.touchDmg : 1,
      touchCd: opt.touchCd != null ? opt.touchCd : 1.15,
      iframe: opt.iframe != null ? opt.iframe : 1.35,
      /* 冲刺：0.16s 位移，期间无敌 */
      dashT: 0, dashDur: 0.16, dashCd: 0, dashCdMax: 1.3,
      dashVX: 0, dashVY: 0,
      /* 1v1 的 400~1000 伤害 ÷ 40 ≈ VS 的 10~25 */
      dmgScale: ds,
      /* ===== 成长：等级 / 经验 / 升级排队 ===== */
      lvl: 1, xp: 0, xpNeed: xpNeedFor(1),
      /* 觉醒条 = 3 格经验：seg 是当前填到第几格，awkN 是攒满待放的觉醒次数 */
      seg: 0, awkN: 0,
      pendingUp: 0, paused: false, userPause: false, upLvl: {},      gems: [], pickR: 130,
      /* 敌方弹幕（远程兵种专用，与 1v1 的 projectiles 完全隔离） */
      shots: [], shotInv: 0,
      /* 武器池：3 把副武器，lvl 0 = 未解锁 */
      /* 武器池：8 个角色各一把，lvl 0 = 未解锁 */
      weapons: (function () {
        const w = {};
        for (const id in WEAPONS) w[id] = { lvl: 0, t: 0 };
        return w;
      })(),
      weaponOrder: [],
      /* 配件（8 个）：等级 0 = 未持有 */
      passives: (function () {
        const o = {};
        for (const id in PASSIVES) o[id] = 0;
        return o;
      })(),
      /* 觉醒：每次升级选完卡立刻进入，时长按要放的觉醒技数量算 */
      awakenT: 0, awakenDur: 0, awakenN: 0,
      awakQueue: [], awakIdx: 0, awakTick: 0, awakStep: 0,
      shieldT: 0, rapid: null, evolved: {},
      /* 进化演出：定格 / 全屏闪光 / 大字 */
      hitStop: 0, evoFlash: 0, evoFlashT: 0, evoFlashName: '', evoFlashDesc: '',
      evolveTick: 0,
      beams: [], zones: [], orbitA: 0, whipFx: [],
      crosses: [], lance: null, kristaCrossT: 0,
      weapon: {
        dmg: Math.round(U.clamp(baseDmg, 9, 12)),
        cd: 1.35, reach: WHIP.reach, half: WHIP.half, amount: 1,
      },
      /* Node 跑测没有 DOM，自动选牌，否则永远卡在暂停 */
      autoPick: typeof document === 'undefined',
      /* 角色被动：莱茵的进化条 / 秋云的撞击节奏 / 破烂的修罗丸 / 雪鸮的半程觉醒 */
      passiveKey: ch.id,
      evo: null, contT: 0, halfAwk: 0,
    };
    this.pveOn = true;
    /* 角色 = 武器组：选谁出场，就自带谁那把（Lv1），并记进「获得顺序」用于觉醒技排队 */
    if (WEAPONS[ch.id]) {
      this.pve.weapons[ch.id].lvl = 1;
      /* 开局给半秒起手，避免第一帧就瞬发 */
      this.pve.weapons[ch.id].t = (WEAPONS[ch.id].base.cd || 1) * 0.5;
      this.pve.weaponOrder.push(ch.id);
    }
    /* 角色被动落到本局状态：移速 / 冲刺冷却 / 进化条 */
    const cp = CHAR_PASSIVES[ch.id];
    if (cp) {
      if (cp.speed) p.speedBase *= cp.speed;
      if (cp.dashCd) this.pve.dashCdMax = 1.3 * cp.dashCd;
      if (cp.evo) this.pve.evo = { p: 0, lv: 0, need: EVO_NEED };
      if (cp.guardEvery) p.shuraCd = cp.guardEvery * 0.5;
    }
    /* 切到 PvE 的竖长场地（layout 会按 pveOn 重新算 field），再把玩家放回中心 */
    if (this.W && this.H) this.layout(this.W, this.H);
    p.x = this.field.x + this.field.w / 2;
    p.y = this.field.y + this.field.h / 2;
    this.autosave = false;
    return true;
  };

  B.endPvE = function () {
    this.pveOn = false;
    this.pve = null;
  };

  /* ===== 控制台用的开发接口（隐藏面板专用，正常流程不会碰） ===== */
  B.dev = {
    clearMobs() {
      let n = 0;
      for (const f of B.fighters) {
        if (f.isMob && !f.dead) { f.dead = true; f.hp = 0; f.deathT = 0.2; n++; }
      }
      B.pve && (B.pve.shots.length = 0);
      return n;
    },
    /* 全武器满级 + 全配件 1 级 → 直接把进化也点掉 */
    maxAll() {
      const pv = B.pve;
      if (!pv) return 0;
      let n = 0;
      for (const id in WEAPONS) {
        const st = pv.weapons[id];
        if (!st) continue;
        if (st.lvl < WEAPONS[id].max) { st.lvl = WEAPONS[id].max; n++; }
        if (pv.weaponOrder.indexOf(id) < 0) pv.weaponOrder.push(id);
      }
      for (const id in PASSIVES) if ((pv.passives[id] || 0) < 1) pv.passives[id] = 1;
      for (const id in WEAPONS) checkEvolve(pv, id);
      return n;
    },
    /* 召唤指定档位的血月修女：血统按当前时间曲线算，和自然刷出来的一致 */
    spawnBoss(tier) {
      const pv = B.pve;
      if (!pv) return null;
      const kk = MOB_KIND[tier] ? tier : BOSS_TIERS[0];
      const ek = MOB_KIND[kk];
      const elapsed = pv.total - pv.left;
      const b = spawnMob(ek, Math.max(1, Math.round(ek.hp * hpMulAt(elapsed))));
      b.kindId = kk;
      B.fighters.push(b);
      Fx.text(pv.player.x, pv.player.y - 70, ek.name + ' 降临', ek.color, 18);
      return b;
    },
    /* 快进：真跑模拟，不解锁新逻辑，跑出来的状态和自然玩到那秒一样 */
    skip(sec) {
      const pv = B.pve;
      if (!pv) return 0;
      const wasPaused = pv.paused, wasAuto = pv.autoPick;
      pv.paused = false;
      pv.autoPick = true;
      const n = Math.min(60 * 300, Math.max(0, Math.round(sec * 60)));
      let t = 0;
      for (let i = 0; i < n; i++) {
        if (B.state !== 'fight' || !B.pve) break;
        B.update(1 / 60);
        t += 1 / 60;
      }
      pv.autoPick = wasAuto;
      if (B.pve) pv.paused = wasPaused;
      return t;
    },
    god(on) {
      const pv = B.pve;
      if (!pv) return false;
      pv.armor = on ? 0 : 1;
      return !!on;
    },
    addXp(v) {
      if (!B.pve) return 0;
      grantXp(v || 0);
      return B.pve.lvl;
    },
  };

  /* 纳刀系技能（原版秋云 / 破破烂烂-秋云）共用判定 */
  function isIaido(t) { return t === 'akigumo_iaido' || t === 'akigumo_broken'; }

  /* ============================ 状态与伤害 ============================ */
  function alive(f) { return f && !f.dead; }

  /* 1v1：对手就是另一队的那个。PvE：怪全部追玩家，玩家锁最近的怪 */
  function enemyOf(f) {
    if (B.pveOn && B.pve) {
      if (f.isMob) return B.pve.player;
      return nearestMob(f);
    }
    return B.fighters[1 - f.team];
  }

  B.addAwaken = function (f, v) {
    if (f.dead) return;
    if (f.awaken > 0) return;   /* 觉醒期间不再积攒 */
    const ap = (f.char.awaken && f.char.awaken.params) || {};
    const mul = ap.gainMul != null ? ap.gainMul : 1;   /* 角色级觉醒槽获取倍率 */
    f.awak = U.clamp(f.awak + v * mul, 0, 100);
  };

  function bigText(f, str, color, size) {
    Fx.text(f.x, f.y - f.r - 18, str, color, size || 16);
  }

  /* 切诱导：让所有锁定 target 的投射物丢失追踪 */
  B.cutHoming = function (target) {
    let n = 0;
    for (const p of B.projectiles) {
      if (p.target === target && p.homing) {
        p.homing = 0;
        p.lockX = target.x;
        p.lockY = target.y;
        const a = Math.atan2(p.vy, p.vx);
        p.angle = a;
        n++;
      }
    }
    if (n > 0) {
      Fx.text(target.x, target.y - target.r - 30, '闪避', '#9fe8ff', 15);
      Fx.ring(target.x, target.y, 'rgba(120,220,255,.8)', target.r * 0.6, target.r * 2.4, 0.4);
    }
    return n;
  };

  /* 主伤害入口 */
  B.damage = function (src, dst, amount, dtype, opt) {
    opt = opt || {};
    if (!alive(dst) || dst.invuln > 0 || dst.noCollide) {
      if (B.traceOn || opt.tag === '一闪') {
        B.traceAdd('dmg-reject', {
          tag: opt.tag || '', dtype, amount,
          src: src ? src.char.short : '?', dst: dst ? dst.char.short : '?',
          why: dstState(dst),
        });
      }
      return 0;
    }

    /* 秋云外挂级反应：未用刹那时，瞬间架起抵挡大额格斗伤害（射击/爆风不触发）
       只属于本家秋云的觉醒，破烂女士虽同为纳刀系但没有「刹那」 */
    if (dtype === 'melee' && dst.char.awaken.type === 'akigumo_awaken' &&
        dst.awaken > 0 && !dst.parryUsed && !dst.parryCast && !dst.iaidoCast && amount >= 300 &&
        dst.hp < dst.maxHp * 0.3 && alive(src)) {
      dst.parryCast = { t: 0, total: (dst.char.awaken.params && dst.char.awaken.params.guardDuration) || 3 };
      if (B.traceOn) B.traceAdd('parry-react', { dst: dst.char.short, amount });
      triggerParry(dst, src);
      return 0;
    }

    /* 秋云招架（阴阳流・刹那）：只对格斗生效；射击 / 爆风 / 爆炸一律照常吃满 */
    if (dst.parryCast && dtype === 'melee') {
      triggerParry(dst, src);
      return 0;
    }

    /* 雪鸮格反：被格斗命中时抵消这次伤害，麻痹对手并留下手雷（吸血/充能不算格斗） */
    if (dtype === 'melee' && dst.char.skill && dst.char.skill.type === 'snowowl_snipe' &&
        alive(src) && src !== dst && !opt.noCounter && (dst.counterCd || 0) <= 0 &&
        opt.tag !== '吸血' && opt.tag !== '充能') {
      triggerCounter(dst, src);
      return 0;
    }

    /* 冲锋免射击 */
    if (dtype === 'shot' && dst.chargeState && dst.chargeState.immuneShot) {
      if (B.traceOn) B.traceAdd('dmg-reject', { tag: opt.tag || '', dtype, amount, why: 'immuneshot' });
      return 0;
    }
    /* 纳刀读条：任何伤害都会打断（射击 / 格斗 / 大剑都算） */
    if (dst.iaidoCast) {
      const c = dst.iaidoCast;
      dst.iaidoCast = null;
      if (c.onInterrupt) c.onInterrupt();
    }

    /* 麻痹：受到新伤害即解除，但照射麻痹期间保持 */
    if (dst.stun > 0 && B.time > (dst.laserLockUntil || 0)) dst.stun = 0;

    let dmg = amount;

    /* PvE 数值层：角色技能按 K 缩放回吸血鬼幸存者的量级（400 → 10）。
       怪自己的伤害已经是 PvE 尺度，不再二次缩放。 */
    if (B.pveOn && src && !src.isMob && B.pve && B.pve.dmgScale) dmg *= B.pve.dmgScale;

    /* 秋云残心增伤 */
    if (src && src.reshin > 0) {
      const bonus = (isIaido(src.char.skill.type) ? (src.char.skill.params.reshinBonus || 10) : 0) / 100;
      dmg *= 1 + src.reshin * bonus;
    }
    /* 通用觉醒增伤 */
    if (src && src.awaken > 0 && !opt.noAwakenBonus) dmg *= 1.2;

    dmg = Math.max(1, Math.round(dmg));

    dst.hp -= dmg;
    dst.flash = 1;
    dst.hitDelay = 0.45;
    /* 脱战计时：PvE 玩家刚挨打就不自然回血，逼玩家靠烤鸡/走位 */
    if (B.pveOn && B.pve && dst === B.pve.player) dst.violentT = 7;
    if (dst.stun <= 0 && opt.noStun !== true) { /* 保持原有麻痹 */ }

    if (src) { src.stats.dealt += dmg; src.stats.hits++; }
    dst.stats.taken += dmg;

    /* 莱茵：本局每一次命中都攒进化值（只有带进化条的角色有这个字段） */
    if (B.pveOn && B.pve && B.pve.evo && dst.isMob && src && !src.isMob) addPveEvo(src, 0.6);


    if (!opt.silent && !opt.noLog && dmg >= 10 && !(B.pveOn && dst.isMob)) {
      B.logHit(dst, opt.tag || (dtype === 'shot' ? '射击' : '格斗'), dmg);
    }

    /* 星能：承伤是大头（约 6 倍），造成伤害只回一点 */
    if (src) B.addAwaken(src, dmg * 0.004);
    B.addAwaken(dst, dmg * 0.025);
    B.lastHit = { src, dst, t: B.time };

    const isShot = dtype === 'shot';
    /* 伤害字号按数值分档：越大越醒目（阈值与字号均可在工坊调整） */
    const fc = fxCfg();
    let fs = fc.dmgSize || 15;
    if (dmg >= (fc.dmgTh2 != null ? fc.dmgTh2 : 1000)) fs = fc.dmgSize2 || 33;
    else if (dmg >= (fc.dmgTh1 != null ? fc.dmgTh1 : 600)) fs = fc.dmgSize1 || 25;
    else if (opt.big) fs = fc.dmgBig || 19;
    if (!opt.silent) {
      Fx.text(dst.x + U.rand(-8, 8), dst.y - dst.r - 4, String(dmg),
        isShot ? '#a9e4ff' : '#ffd166', fs, { stroke: 'rgba(0,0,0,.9)' });
      Fx.burst(dst.x, dst.y, opt.big ? 14 : 8, isShot ? '#7fdcff' : '#ffb347', 240, 3.2, 0.45);
      B.shake = Math.max(B.shake, opt.big ? 9 : 4);
      if (opt.big) A.crit(); else A.hit();
    }

    if (dst.hp <= 0) { dst.hp = 0; kill(dst, src); }
    return dmg;
  };

  function kill(f, killer) {
    if (f.dead) return;
    /* PvE 的怪不参与 COST / 复活 / 觉醒落，走独立分支 */
    if (f.isMob) { killMob(f, killer); return; }
    /* PvE 的玩家没有 COST、不复活，阵亡即本局结束 */
    if (B.pveOn) {
      f.dead = true; f.deathT = 0; f.hp = 0; f.respawnT = -1;
      f.cast = null; f.iaidoCast = null; f.parryCast = null;
      f.bite = null; f.snipe = null; f.burst = null;
      f.bastion = null; f.chargeState = null; f.rootT = 0;
      f.awaken = 0; f.noCollide = false;
      Fx.burst(f.x, f.y, 34, f.char.color, 420, 5, 0.9);
      endBattle(-1);
      return;
    }
    f.dead = true;
    f.deathT = 0;
    f.hp = 0;
    f.cast = null;
    f.iaidoCast = null;
    f.parryCast = null;
    f.bite = null;
    f.biteWait = 0; f.biteDone = false;
    f.snipe = null;
    f.burst = null;
    f.shadowClones = [];
    f.shadowDash = null;
    f.shadowBurst = null;
    f.shadowVolleyT = 0;
    if (B.timeStop && B.timeStop.owner === f) B.timeStop = null;

    /* 阵亡时若一闪尚未结算：立即补结算，绝不吞伤害 */
    if (f.parryStrike) resolveParryStrike(f, 'death');
    f.laserCast = null;
    f.bastion = null;
    /* 正在释放的照射立即消失，已生成的爆风保留 */
    for (let i = B.projectiles.length - 1; i >= 0; i--) {
      const pp = B.projectiles[i];
      if (pp.owner === f && pp.laser) B.projectiles.splice(i, 1);
    }
    f.chargeState = null;
    f.rootT = 0; f.rootX = null; f.rootY = null;
    f.noCollide = false;
    f.diedAwaken = f.awaken > 0;
    f.awaken = 0;
    f.superEvo = false;
    f.phaseReady = false;

    /* 觉醒落播报 */
    if (f.diedAwaken) {
      Fx.text(f.x, f.y - f.r - 82, '觉醒落！', '#ffd166', 21);
      Fx.ring(f.x, f.y, 'rgba(255,209,102,.9)', f.r, f.r * 5, 0.6);
      B.log(f.char.short + ' 觉醒落', '#ffd166');
      B.cutin('觉醒落', '#ffd166', f.char.name + ' · 觉醒被打断', { big: true });
      /* 三分之一概率挑衅对手 */
      if (killer && alive(killer) && Math.random() < 1 / 3) {
        startTaunt(killer);
      }
    }
    f.costPool -= f.char.cost;
    f.respawnT = f.costPool > 0 ? 2.6 : -1;

    /* COST 领先嘲讽：本局首次拉开 COST 差距时，领先方 100% 抖腿 */
    if (!B.costLeadTaunt) {
      const other = enemyOf(f);
      const otherPool = other ? other.costPool : 0;
      let leader = null;
      if (otherPool > f.costPool) leader = other;
      else if (f.costPool > otherPool) leader = f;
      if (leader && alive(leader)) {
        B.costLeadTaunt = true;
        startTaunt(leader);   /* 领先方百分百抖腿，战报由 startTaunt 播报 */
      }
    }

    Fx.burst(f.x, f.y, 34, f.char.color, 420, 5, 0.9);
    Fx.ring(f.x, f.y, 'rgba(255,255,255,.9)', f.r, f.r * 5, 0.6);
    Fx.text(f.x, f.y - f.r - 26, 'BREAK', '#ff6b7a', 22, { stroke: 'rgba(0,0,0,.9)' });
    B.log(f.char.short + ' 被击坠  COST ' + Math.max(0, f.costPool), '#ff6b7a');
    B.shake = 16;
    B.hitFlash = 0.35;
    B.flashColor = '255,90,110';
    A.ko();

    if (f.costPool <= 0) {
      f.respawnT = -1;
      B.needCheck = true;   /* 帧末统一判定，支持同时归零的平局 */
    }
  }

  function endBattle(winner) {
    if (B.state === 'over') return;
    /* 收尾时补结算未炸的一闪，避免最后一击被吞 */
    for (const f of B.fighters) if (f && f.parryStrike) resolveParryStrike(f, 'battleEnd');
    B.state = 'over';
    B.winner = winner;
    B.overT = 0;
    B.slowmo = 0.28;
    B.projectiles.length = 0;
    B.packs.length = 0;
    B.zones.length = 0;
    A.win();
  }

  B.endBattle = endBattle;
  B.kill = kill;



  /* ============================ 血月（吸血鬼小修女） ============================ */
  /* 接触咬住：附着目标、固定相对角度、每秒吸血、期间受伤不脱离 */
  function startBite(f, e) {
    const p = f.char.skill.params || {};
    f.bite = {
      t: 0,
      total: p.duration != null ? p.duration : 5,
      acc: 0,
      dps: p.dps != null ? p.dps : 120,
      heal: p.heal != null && p.heal > 0 ? p.heal : (p.dps != null ? p.dps : 120),
      slow: p.slow != null ? p.slow : .5,
      ang: Math.atan2(f.y - e.y, f.x - e.x),   /* 锁定相对角度，咬合期间不再随位移改变 */
      fx: 0,
    };
    /* 冷却从发动时开始计算，咬合结束后自然剩 10 秒 */
    f.skillCd = p.cd != null ? p.cd : 15;
    f.vx = 0; f.vy = 0;
    /* 咬住的瞬间先定身 1 秒：定身期间不能位移、不能使用技能、不能制造接触伤害 */
    e.rootT = Math.max(e.rootT || 0, 1);
    e.rootX = e.x;
    e.rootY = e.y;
    f.stun = 0;
    f.cast = null;
    B.log(f.char.short + ' 吸血', '#ff2244');
    B.cutin('吸血', '#ff2244', f.char.name + ' · 咬住', { big: true });
    Fx.slash(f.x, f.y, e.x, e.y, 'rgba(255,60,90,.9)', .3);
    Fx.ring(f.x, f.y, 'rgba(255,40,70,.9)', f.r, f.r * 4.2, .5);
    A.awaken();
  }

  function updateBite(f, dt) {
    const b = f.bite;
    const e = enemyOf(f);
    if (!b) return;
    if (!alive(e) || B.state !== 'fight') { endBite(f, e); return; }

    /* 施法者被硬控（爆炸定身 / 照射麻痹）时，正在进行的吸血・充能会被强制打断 */
    if (hardLocked(f)) { endBite(f, e, true); return; }

    b.t += dt;

    /* 咬合时目标减速，并保持发动瞬间的相对角度吸附 */
    e.slowT = .15;
    e.slowMul = 1 - b.slow;
    /* 大剑朝向：始终指着被吸血的目标（渲染用，剑身不旋转） */
    if (alive(e)) b.aim = Math.atan2(e.y - f.y, e.x - f.x);

    if (e.bite) {
      /* 互相咬住：双方都被牵制，原地对峙，避免互相改写坐标导致漂移 */
      f.vx = 0; f.vy = 0;
      f.facing = e.x >= f.x ? 1 : -1;
    } else {
      const ang = b.ang;
      const dist = e.r + f.r * 0.62;
      f.x = e.x + Math.cos(ang) * dist;
      f.y = e.y + Math.sin(ang) * dist;
      const fl = B.field;
      f.x = U.clamp(f.x, fl.x + f.r, fl.x + fl.w - f.r);
      f.y = U.clamp(f.y, fl.y + f.r, fl.y + fl.h - f.r);
      f.vx = 0; f.vy = 0;
      f.facing = Math.cos(ang) >= 0 ? 1 : -1;
    }

    /* 每秒吸取（吸血鬼为格斗吸血、米米姐为蓝色充能，heal=0 即不回血）
       按咬合时间轴结算（而不是累加器），保证整段 N 秒恰好 N 跳，不会因帧对齐漏掉最后一跳 */
    const hotCol = b.blue ? 'rgba(120,220,255,.6)' : 'rgba(255,40,70,.6)';
    const span = Math.min(b.t, b.total);
    const ticks = Math.floor(span + 1e-3);
    while ((b.ticks || 0) < ticks) {
      b.ticks = (b.ticks || 0) + 1;
      const dealt = B.damage(f, e, b.dps, 'melee', { tag: b.blue ? '充能' : '吸血' });
      if (dealt > 0) {
        const heal = Math.min(b.heal, f.maxHp - f.hp);
        if (heal > 0) {
          f.hp = Math.min(f.maxHp, f.hp + heal);
          Fx.text(f.x, f.y - f.r - 16, '+' + Math.round(heal), '#7dffb0', 14);
        }
        Fx.ring(e.x, e.y, hotCol, e.r * .5, e.r * 1.8, .32);
      }
    }

    /* 血流（蓝色为能量流）：目标 → 自身 */
    b.fx += dt;
    if (b.fx > .05) {
      b.fx = 0;
      const a = Math.random() * Math.PI * 2;
      const sx = e.x + Math.cos(a) * e.r * .85;
      const sy = e.y + Math.sin(a) * e.r * .85;
      Fx.parts.push({
        x: sx, y: sy,
        vx: (f.x - sx) * 3.4, vy: (f.y - sy) * 3.4,
        life: .32, max: .32,
        color: b.blue
          ? (Math.random() < .3 ? '#bfefff' : '#2f8fd8')
          : (Math.random() < .3 ? '#ff7d95' : '#cc1e3a'),
        size: U.rand(1.8, 3.4), drag: 0,
      });
    }

    if (b.t >= b.total) endBite(f, e);
  }

  /* 硬控：被 G·诺伦 爆炸定身 或 被照射麻痹期间，无法使用任何技能 */
  function hardLocked(f) {
    return (f.rootT || 0) > 0 || (f.stun || 0) > 0;
  }

  /* 接触瞬间即可开咬：只要求冷却就绪，不做距离飞扑 */
  function canStartBite(f, e) {
    if (!alive(f) || !alive(e)) return false;
    if (f.char.skill.type !== 'vamp_bite') return false;
    if (hardLocked(f)) return false;   /* 被定身时不能发动 */
    /* 允许对咬：即使对方正在束缚自己，也可以立刻反咬回去 */
    return !f.bite && f.skillCd <= 0;
  }

  function endBite(f, e, broken) {
    if (!f.bite) return;
    const blue = !!f.bite.blue;
    f.bite = null;
    f.contactCd = Math.max(f.contactCd, .4);
    if (alive(e)) {
      const a = Math.atan2(f.y - e.y, f.x - e.x);
      f.vx = Math.cos(a) * (f.speedBase || 180) * 1.7;
      f.vy = Math.sin(a) * (f.speedBase || 180) * 1.7;
    }
    Fx.burst(f.x, f.y, 12, blue ? '#7fe8ff' : '#ff4d6a', 260, 3, .4);
    if (broken) {
      B.log(f.char.short + ' 被定身，' + (blue ? '充能' : '吸血') + '中断', '#ffd166');
    } else {
      B.log(f.char.short + (blue ? ' 充能结束' : ' 松开撕咬'), blue ? '#7fe8ff' : '#ff6b8a');
    }
    /* 米米姐：充能结束重新获得 G·诺伦，但需要等 armTime 秒才允许丢出 */
    if (blue) {
      gainPack(f);
      const p = f.char.skill.params || {};
      const arm = p.armTime != null ? p.armTime : 5;
      f.packCd = Math.max(f.packCd || 0, arm);
    }
  }

  /* 觉醒・血月圣域：范围内每秒吸取（射击判定），并持续回血 */
  function updateBloodField(f, dt) {
    const p = f.char.awaken.params || {};
    const R = f.r * (p.radius != null ? p.radius : 3.2);
    const e = enemyOf(f);
    const dps = p.dps != null ? p.dps : 120;
    const healAmt = p.heal != null ? p.heal : 120;

    f.bloodAcc = (f.bloodAcc || 0) + dt;
    if (f.bloodAcc >= 1) {
      f.bloodAcc -= 1;
      if (alive(e) && U.dist(f.x, f.y, e.x, e.y) < R + e.r) {
        const dealt = B.damage(f, e, dps, 'shot', { tag: '血域' });
        if (dealt > 0) {
          const heal = Math.min(healAmt, f.maxHp - f.hp);
          if (heal > 0) {
            f.hp = Math.min(f.maxHp, f.hp + heal);
            Fx.text(f.x, f.y - f.r - 18, '+' + Math.round(heal), '#7dffb0', 13);
          }
        }
      }
    }

    /* 圣域内血流涌向自身 */
    f.bloodFx = (f.bloodFx || 0) + dt;
    if (f.bloodFx > .045 && alive(e)) {
      f.bloodFx = 0;
      if (U.dist(f.x, f.y, e.x, e.y) < R) {
        const a = Math.random() * Math.PI * 2;
        const sx = e.x + Math.cos(a) * e.r * .9;
        const sy = e.y + Math.sin(a) * e.r * .9;
        Fx.parts.push({
          x: sx, y: sy,
          vx: (f.x - sx) * 2.8, vy: (f.y - sy) * 2.8,
          life: .44, max: .44,
          color: Math.random() < .35 ? '#ff8ba0' : '#b81230',
          size: U.rand(2, 3.8), drag: 0,
        });
      }
    }
  }

  /* ============================ 青冰（米米姐） ============================ */
  /* 形态：重装（携带 G·诺伦）/ 轻装（丢包后体型小、速度快） */
  function setForm(f, form) {
    const p = f.char.skill.params || {};
    const baseR = f.char.radius * B.scale() * (1 + 0.1 * (f.evoLevel || 0));
    const baseSpd = f.char.moveSpeed * B.scale() * 1.38;
    f.form = form;
    if (form === 'light') {
      f.r = baseR * (p.lightRadius != null ? p.lightRadius : .72);
      f.speedBase = baseSpd * (p.lightSpeed != null ? p.lightSpeed : 1.32);
    } else {
      f.r = baseR;
      f.speedBase = baseSpd;
    }
  }

  /* 获得一个 G·诺伦：轻装中直接取回背包并解锁投掷
     force=true（觉醒发放）会把投掷冷却清零，可立刻再丢 */
  function gainPack(f, force) {
    if (!f || f.dead) return false;
    if (f.form === 'heavy' && f.hasPack) {
      B.log(f.char.short + ' 已持有 G·诺伦', '#7fe8ff');
      return false;
    }
    if (force) f.packCd = 0;
    f.hasPack = true;
    setForm(f, 'heavy');
    f.skillCd = 0;
    Fx.ring(f.x, f.y, 'rgba(120,220,255,.9)', f.r * .6, f.r * 3, .45);
    Fx.text(f.x, f.y - f.r - 22, 'G·诺伦 到手', '#7fe8ff', 14);
    B.log(f.char.short + ' 取回 G·诺伦', '#7fe8ff');
    return true;
  }

  /* 丢出背包：高弹速追踪，命中敌人后固定在目标身上再引爆 */
  function throwPack(f, e) {
    const p = f.char.skill.params || {};
    f.hasPack = false;
    setForm(f, 'light');
    f.skillCd = 0;                                   /* 丢包后立刻可进入背包充能 */
    f.packCd = p.cd != null ? p.cd : 8;              /* 投掷冷却：从丢出时开始计时 */
    const a = Math.atan2(e.y - f.y, e.x - f.x);
    const spd = (p.speed != null ? p.speed : 580) * B.scale();
    B.packs.push({
      x: f.x + Math.cos(a) * (f.r + 8 * B.scale()),
      y: f.y + Math.sin(a) * (f.r + 8 * B.scale()),
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, speed: spd, owner: f, target: e,
      homing: p.homing != null ? p.homing : 1.4,
      fuse: p.fuse != null ? p.fuse : .45,
      t: 0, stuck: false, stickAng: 0, spin: 0,
    });
    B.log(f.char.short + ' 投掷 G·诺伦', '#7fe8ff');
    B.cutin('G·诺伦', '#7fe8ff', f.char.name + ' · 背包投掷', { big: true });
    Fx.burst(f.x, f.y, 12, '#bfefff', 240, 3, .4);
    /* 后坐力：向投掷反方向被顶开 */
    const kick = (p.recoil != null ? p.recoil : 1.2) * (f.speedBase || 200);
    f.vx -= Math.cos(a) * kick;
    f.vy -= Math.sin(a) * kick;
    Fx.ring(f.x, f.y, 'rgba(160,235,255,.7)', f.r * .6, f.r * 2.6, .32);
    A.shot();
  }

  /* 引爆：半径半张地图，3 秒扩张，最大后持续 5 秒 */
  function packExplode(p) {
    const f = p.owner;
    const b = (f && f.char.skill && f.char.skill.params) || {};
    const R = B.field.w * (b.radiusPct != null ? b.radiusPct : .5);
    B.zones.push({
      x: p.x, y: p.y, t: 0, rad: 10,
      grow: b.grow != null ? b.grow : 1,
      hold: b.hold != null ? b.hold : 4,
      R: R,
      max: b.maxDamage != null ? b.maxDamage : 800,
      dps: b.dps != null ? b.dps : 400,
      root: b.rootTime != null ? b.rootTime : 4,
      chip: b.chip != null ? b.chip : 1,
      selfDps: b.selfDps != null ? b.selfDps : 1,
      color: b.zoneColor || '#ffc24a',
      alpha: b.zoneAlpha != null ? b.zoneAlpha : 1.9,
      fill: b.zoneFill != null ? b.zoneFill : .24,
      dealt: 0, acc: 0, fx: 0, owner: f,
    });
    Fx.boom(p.x, p.y, R * .35, '#ffb648', 1.2);
    Fx.burst(p.x, p.y, 26, '#ffe9b0', 420, 5, .7);
    Fx.ring(p.x, p.y, 'rgba(255,196,90,.92)', 10, R * .5, .6);
    B.shake = Math.max(B.shake, 16);
    A.crit();
    B.log((f ? f.char.short : '') + ' G·诺伦 引爆', '#ffc24a');
  }

  function updatePacks(dt) {
    for (let i = B.packs.length - 1; i >= 0; i--) {
      const p = B.packs[i];
      p.t += dt;
      p.spin += dt * 9;
      const e = p.target;

      if (!p.stuck) {
        if (alive(e)) {
          const want = Math.atan2(e.y - p.y, e.x - p.x);
          let diff = want - p.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.angle += U.clamp(diff, -p.homing * dt, p.homing * dt);
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (alive(e) && U.dist(p.x, p.y, e.x, e.y) < e.r + 16 * B.scale()) {
          p.stuck = true;
          p.t = 0;
          p.stickAng = Math.atan2(p.y - e.y, p.x - e.x);
          Fx.ring(p.x, p.y, 'rgba(160,235,255,.9)', 6, 26, .3);
          B.log('G·诺伦 吸附目标', '#7fe8ff');
        } else {
          const fl = B.field;
          const m = 40 * B.scale();
          const out = p.x < fl.x - m || p.x > fl.x + fl.w + m ||
                      p.y < fl.y - m || p.y > fl.y + fl.h + m;
          if (out || p.t > 1.5) { packExplode(p); B.packs.splice(i, 1); continue; }
        }
      } else {
        if (!alive(e)) { packExplode(p); B.packs.splice(i, 1); continue; }
        /* 固定在命中的敌人身上 */
        p.x = e.x + Math.cos(p.stickAng) * (e.r + 10 * B.scale());
        p.y = e.y + Math.sin(p.stickAng) * (e.r + 10 * B.scale());
        if (p.t >= p.fuse) { packExplode(p); B.packs.splice(i, 1); continue; }
      }
    }
  }

  /* 定身续期：被爆炸持续笼罩时每帧续上，伤害不停 = 定身不停 */
  function holdRoot(tgt) {
    if (tgt.rootX == null) { tgt.rootX = tgt.x; tgt.rootY = tgt.y; }
    tgt.rootT = Math.max(tgt.rootT || 0, .3);
    tgt.vx = 0; tgt.vy = 0;
  }

  /* 爆炸领域结算：敌人吃满上限后继续每秒 1 点；施法者自己在圈内也每秒 1 点，
     两边只要还在爆炸里就持续被定住 */
  function updateZones(dt) {
    for (let i = B.zones.length - 1; i >= 0; i--) {
      const z = B.zones[i];
      z.t += dt;
      const gk = U.clamp(z.t / z.grow, 0, 1);
      z.rad = Math.max(12, z.R * (1 - Math.pow(1 - gk, 3)));
      const active = z.t <= z.grow + z.hold;

      if (active && z.owner) {
        const e = enemyOf(z.owner);

        if (z.root > 0 && e && alive(e) && e.invuln <= 0 &&
            U.dist(z.x, z.y, e.x, e.y) < z.rad + e.r) {
          if (!z.rooted) {
            z.rooted = true;
            e.rootT = Math.max(e.rootT || 0, z.root);
            e.rootX = e.x; e.rootY = e.y;
            e.vx = 0; e.vy = 0;
            Fx.ring(e.x, e.y, 'rgba(255,214,120,.95)', e.r * .8, e.r * 3.4, .55);
            Fx.text(e.x, e.y - e.r - 24, '定身', '#ffd166', 18, { stroke: 'rgba(0,0,0,.85)' });
            B.log(e.char.short + ' 被 G·诺伦 定身', '#ffd166');
          } else {
            holdRoot(e);
          }
        }

        if (alive(e) && e.invuln <= 0 && U.dist(z.x, z.y, e.x, e.y) < z.rad + e.r) {
          z.acc += dt;
          while (z.acc >= .5) {
            z.acc -= .5;
            /* 达到上限后仍以 1 点持续，维持定身与压制感 */
            const capped = z.dealt >= z.max;
            const amt = capped ? (z.chip || 0) : Math.min(z.dps * .5, z.max - z.dealt);
            if (!capped) z.dealt += amt;
            if (amt > 0) {
              B.damage(z.owner, e, Math.round(amt), 'shot',
                capped ? { tag: 'G·诺伦', silent: true } : { tag: 'G·诺伦' });
              if (capped) {
                Fx.text(e.x + U.rand(-8, 8), e.y - e.r - 4, String(Math.round(amt)), '#ffc24a', 11,
                  { stroke: 'rgba(0,0,0,.7)' });
              }
            }
          }
        } else {
          z.acc = Math.max(0, z.acc - dt);
        }

        /* 施法者自身：站在爆炸里也会被定住并每秒掉 1 血 */
        const ow = z.owner;
        if (z.root > 0 && alive(ow) && ow.invuln <= 0 &&
            U.dist(z.x, z.y, ow.x, ow.y) < z.rad + ow.r) {
          if (!z.selfRooted) {
            z.selfRooted = true;
            ow.rootT = Math.max(ow.rootT || 0, z.root);
            ow.rootX = ow.x; ow.rootY = ow.y;
            ow.vx = 0; ow.vy = 0;
            Fx.ring(ow.x, ow.y, 'rgba(255,214,120,.9)', ow.r * .8, ow.r * 3.2, .5);
            Fx.text(ow.x, ow.y - ow.r - 24, '反噬', '#ffd166', 16, { stroke: 'rgba(0,0,0,.85)' });
            B.log(ow.char.short + ' 被自己的 G·诺伦 定住', '#ffd166');
          } else {
            holdRoot(ow);
          }
          z.selfAcc = (z.selfAcc || 0) + dt;
          while (z.selfAcc >= 1) {
            z.selfAcc -= 1;
            if (z.selfDps > 0) {
              B.damage(null, ow, z.selfDps, 'shot', { tag: 'G·诺伦', silent: true, noAwakenBonus: true });
            }
          }
        } else {
          z.selfAcc = 0;
        }
      }

      /* 边缘电弧 */
      z.fx += dt;
      if (active && z.fx > .07) {
        z.fx = 0;
        const a = Math.random() * Math.PI * 2;
        const rr = z.rad * U.rand(.72, 1);
        Fx.parts.push({
          x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr,
          vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
          life: .42, max: .42,
          color: Math.random() < .35 ? '#fff2cf' : '#ffc24a',
          size: U.rand(1.6, 3.4), drag: 1.6,
        });
      }
      if (z.t > z.grow + z.hold + 1.1) B.zones.splice(i, 1);
    }
  }

  /* 背包充能：轻装状态下接触敌人 → 蓝色束缚吸血（不回血） */
  function canStartCharge(f, e) {
    if (!alive(f) || !alive(e)) return false;
    if (f.char.skill.type !== 'mimi_pack') return false;
    if (hardLocked(f)) return false;   /* 被定身时不能发动 */
    /* 允许对咬：即使正被对方束缚，也可以立刻充能反制 */
    return f.form === 'light' && !f.hasPack && !f.bite && f.skillCd <= 0;
  }

  function startChargeBind(f, e) {
    const p = f.char.skill.params || {};
    f.bite = {
      t: 0,
      total: p.chargeDuration != null ? p.chargeDuration : 5,
      acc: 0,
      dps: p.chargeDps != null ? p.chargeDps : 80,
      heal: 0,
      slow: p.chargeSlow != null ? p.chargeSlow : .5,
      ang: Math.atan2(f.y - e.y, f.x - e.x),
      blue: true,
      fx: 0,
    };
    f.vx = 0; f.vy = 0;
    f.stun = 0;
    f.cast = null;
    B.log(f.char.short + ' 背包充能', '#7fe8ff');
    B.cutin('背包充能', '#7fe8ff', f.char.name + ' · 充能', { big: true });
    Fx.ring(f.x, f.y, 'rgba(120,220,255,.9)', f.r, f.r * 4, .5);
    A.awaken();
  }

  /* 克丽丝塔：圣十字庇护 */
  function startBastion(f) {
    const p = f.char.awaken.params || {};
    const cast = p.cast || 1;
    f.bastion = { t: cast, total: cast, heal: p.heal || 500 };
    f.invuln = Math.max(f.invuln, cast + 0.15);
    f.vx = 0; f.vy = 0;
    Fx.ring(f.x, f.y, 'rgba(255,230,160,.9)', f.r, f.r * 3.4, 0.55);
    Fx.ring(f.x, f.y, 'rgba(255,255,255,.8)', f.r * 0.5, f.r * 2.2, 0.4);
    B.log(f.char.short + ' 圣十字庇护', '#ffd166');
    A.awaken();
  }

  /* 嘲讽：原地停住左右抖动 */
  function startTaunt(f) {
    f.tauntT = 1.4;
    f.tauntX = f.x;
    f.tauntY = f.y;
    f.vx = 0; f.vy = 0;
    f.tauntPhase = 0;
    Fx.text(f.x, f.y - f.r - 56, '嘲讽！', '#ffd166', 17);
    Fx.ring(f.x, f.y, 'rgba(255,209,102,.7)', f.r * 0.8, f.r * 2.6, 0.4);
    B.log(f.char.short + ' 嘲讽', '#ffd166');
    A.ui();
  }


  /* 十字盾：把对手推开 */
  function pushFromBastion(f, e) {
    if (!f.bastion || !alive(e)) return;
    const R = f.r * 2.6;
    const dx = e.x - f.x, dy = e.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const minD = R + e.r;
    if (d < minD) {
      const nx = dx / d, ny = dy / d;
      e.x = f.x + nx * minD;
      e.y = f.y + ny * minD;
      const vn = e.vx * nx + e.vy * ny;
      if (vn < 0) { e.vx -= vn * nx * 1.6; e.vy -= vn * ny * 1.6; }
      Fx.burst(e.x, e.y, 5, '#ffd166', 170, 2.2, 0.28);
    }
  }

  /* 复活 */
  function respawn(f) {
    const sp = B.spawnPoint(f.team);
    /* 非觉醒期间阵亡，复活补 12% 星能 */
    if (f.diedAwaken) f.awak = 0;
    else f.awak = U.clamp(f.awak + 12, 0, 100);
    f.diedAwaken = false;
    const ratio = Math.min(1, f.costPool / f.char.cost);
    f.maxHp = f.char.hp;
    f.hp = Math.max(1, Math.round(f.char.hp * ratio));
    f.r = f.char.radius * B.scale() * (1 + 0.1 * (f.evoLevel || 0));
    f.dead = false;
    f.x = sp.x; f.y = sp.y;
    f.vx = 0; f.vy = 0;
    f.invuln = 1.4;
    f.stun = 0;
    f.cast = null;
    f.iaidoCast = null;
    f.parryCast = null;
    f.laserCast = null;
    f.bastion = null;
    f.bite = null;
    f.snipe = null;
    f.burst = null;
    f.shadowClones = [];
    f.shadowDash = null;
    f.shadowBurst = null;
    f.shadowBurstUsed = false;
    f.shadowVolleyT = 0;
    f.shadowRushT = 0;
    f.rootT = 0; f.rootX = null; f.rootY = null;
    f.bloodAcc = 0;
    /* 正在释放的照射立即消失，已生成的爆风保留 */
    for (let i = B.projectiles.length - 1; i >= 0; i--) {
      const pp = B.projectiles[i];
      if (pp.owner === f && pp.laser) B.projectiles.splice(i, 1);
    }
    f.chargeState = null;
    f.noCollide = false;
    f.tauntT = 0;
    f.shura = null; f.shuraCd = 1.2;
    f.shuraSlash = null; f.shuraAwakeT = 0;
    if (B.hole && B.hole.owner === f) B.hole = null;
    f.skillCd = 1;
    f.spawnInvuln = true;   /* 复活无敌期间（含大剑）不造成伤害 */
    /* 米米姐：复活恢复重装形态并补回背包 */
    if (f.char.skill.type === 'mimi_pack') {
      f.hasPack = true;
      f.packT = 0;
      f.packCd = 0;
      setForm(f, 'heavy');
    }
    /* 复活不保留残心，每次出生自带一层 */
    f.reshin = 1;
    /* 莱茵：复活后进化点清零，只保留已达成的进化等级 */
    if (f.evo > 0) {
      if (f.char.skill.type === 'rhine_evo') {
        B.log(f.char.short + ' 进化点清零（保留 进化' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][f.evoLevel - 1] + '）', '#5cb8ff');
        Fx.text(sp.x, sp.y - f.r - 56, '进化点清零', '#5cb8ff', 12);
      }
      f.evo = 0;
    }
    f.respawnT = 0;
    f.trail.length = 0;
    const foe = enemyOf(f);
    if (foe) B.launch(f, foe);
    Fx.ring(sp.x, sp.y, 'rgba(120,220,255,.85)', 6, f.r * 3.2, 0.55);
    Fx.text(sp.x, sp.y - f.r - 34, ratio < 1 ? '残存 ' + Math.round(ratio * 100) + '%' : '归队', '#9fe8ff', 14);
  }

  /* ============================ 觉醒 ============================ */
  function canAwaken(f) {
    /* 本家 50% 即可开启 */
    if (!alive(f) || f.awak < 50 || f.awaken > 0) return false;
    /* 断罪只能在自己身边落刀：不在范围内就压着觉醒不放 */
    if (f.char.awaken && f.char.awaken.type === 'akigumo_broken_awaken') {
      const e = enemyOf(f);
      if (!e || !alive(e)) return false;
      const reach = ((f.char.awaken.params && f.char.awaken.params.range) || 300) * B.scale();
      if (U.dist(f.x, f.y, e.x, e.y) > reach * 1.25) return false;
    }
    return true;
  }

  function doAwaken(f) {
    const cfg = f.char.awaken || { type: 'none', params: {} };
    const p = cfg.params || {};
    f.awaken = p.duration || 8;
    f.awak = 0;
    f.awakenArmed = true;

    f.parryUsed = false;
    f.awakenPushT = 5;

    /* 通用播报：所有角色开启觉醒都在下方大字播报 */
    const awDef = (SW.Data && SW.Data.AWAKEN_DEFS && SW.Data.AWAKEN_DEFS[cfg.type]) || null;
    const awLabel = awDef ? (awDef.banner || awDef.name) : '觉醒';
    B.cutin('觉醒开启', f.char.awakenColor || f.char.accent || '#ffd166',
      f.char.name + ' · ' + awLabel, { big: true });

    if (cfg.type === 'skysaber_awaken') {
      f.phaseReady = true;
    } else if (cfg.type === 'akigumo_awaken') {
      f.reshin = Math.min(f.char.skill.params.reshinMax || 3, f.reshin + (p.reshinGrant || 1));
      Fx.text(f.x, f.y - f.r - 52, '残心 +' + (p.reshinGrant || 1), '#ffc24a', 16);
    } else if (cfg.type === 'rhine_awaken') {
      f.superEvo = true;
    } else if (cfg.type === 'krista_awaken') {
      /* 觉醒状态照常开启；十字盾只在掉血后使用，避免满血空放 */
      if (f.hp < f.maxHp * 0.9) startBastion(f);
    } else if (cfg.type === 'vamp_awaken') {
      f.bloodAcc = 0;
      f.bloodFx = 0;
      f.skillCd = 0;   /* 觉醒开启时刷新基础技能 */
      f.pushT = 0;     /* 冲量立刻触发一次，之后每 pushEvery 秒 */
      Fx.ring(f.x, f.y, 'rgba(255,30,60,.85)', f.r * 0.8, f.r * 5.2, .8);
      Fx.ring(f.x, f.y, 'rgba(20,0,8,.9)', f.r * 1.2, f.r * 4.4, .7);
    } else if (cfg.type === 'akigumo_broken_awaken') {
      /* 阴阳流·一刀：稍作延迟后落刀，避免和「觉醒开启」字幕撞在一起 */
      f.shuraAwakeT = 0.4;
    } else if (cfg.type === 'mimi_awaken') {
      f.packT = p.packEvery || 4;
      gainPack(f, true);
      Fx.ring(f.x, f.y, 'rgba(90,200,255,.85)', f.r * .8, f.r * 5, .8);
      Fx.ring(f.x, f.y, 'rgba(180,240,255,.7)', f.r * 1.2, f.r * 4, .7);
    } else if (cfg.type === 'snowowl_awaken') {
      /* 觉醒免蓄力：掐掉手上的蓄力，立刻进入第一轮四连发 */
      f.snipe = null;
      f.burst = null;
      f.skillCd = 0;
      Fx.ring(f.x, f.y, 'rgba(90,190,255,.85)', f.r * .8, f.r * 5, .8);
      Fx.ring(f.x, f.y, 'rgba(190,235,255,.75)', f.r * 1.2, f.r * 4, .7);
    } else if (cfg.type === 'shadow_awaken') {
      /* 红色觉醒：开场先突进一次，接触即引爆无间影狱 */
      f.shadowRushT = (p.rushEvery || 2.2) * .4;
      f.shadowDash = null;
      f.shadowBurst = null;
      f.shadowBurstUsed = false;
      f.shadowClones = [];
      Fx.ring(f.x, f.y, 'rgba(255,60,80,.9)', f.r * .8, f.r * 5.2, .8);
      Fx.ring(f.x, f.y, 'rgba(16,22,44,.9)', f.r * 1.2, f.r * 4.2, .7);
    }

    Fx.ring(f.x, f.y, f.char.accent, f.r, f.r * 5.5, 0.7);
    Fx.text(f.x, f.y - f.r - 34, 'AWAKEN', f.char.accent, 18);
    B.log(f.char.short + ' 觉醒', f.char.awakenColor || '#ff5c6e');
    B.shake = 8;
    A.awaken();
  }

  /* ============================ 投射物 ============================ */

  /* 射线与矩形边界交点（用于照射命中墙体） */
  function rayRect(x, y, dx, dy, rect) {
    /* 从内部出发，取最近的一条边界交点 */
    let best = Infinity;
    if (Math.abs(dx) > 1e-6) {
      const t = (dx > 0 ? rect.x + rect.w - x : rect.x - x) / dx;
      if (t > 0) best = Math.min(best, t);
    }
    if (Math.abs(dy) > 1e-6) {
      const t = (dy > 0 ? rect.y + rect.h - y : rect.y - y) / dy;
      if (t > 0) best = Math.min(best, t);
    }
    if (!isFinite(best)) return null;
    return { x: x + dx * best, y: y + dy * best };
  }

  function addProj(o) {
    o.px = o.x; o.py = o.y;
    o.life = o.life || 2.2;
    o.maxLife = o.life;
    o.dead = false;
    if (!o.hitSet) o.hitSet = new Set();
    B.projectiles.push(o);
    return o;
  }

  B.shootBeam = function (f, dmg, opt) {
    opt = opt || {};
    const e = enemyOf(f);
    if (!e) return;
    const sc = B.scale();
    const spd = opt.speed || Math.max(f.char.moveSpeed, e.char.moveSpeed || 150) * 1.7 * sc;
    const a0 = Math.atan2(e.y - f.y, e.x - f.x);
    const a = a0 + U.rand(-0.03, 0.03);
    const x = f.x + Math.cos(a) * (f.r + 6 * B.scale());
    const y = f.y + Math.sin(a) * (f.r + 6 * B.scale());

    addProj({
      kind: 'beam', x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, len: opt.len || 34 * sc, wid: opt.wid || 9 * sc,
      dmg, dtype: 'shot', owner: f,
      target: opt.homing === false ? null : e,
      homing: opt.homing === false ? 0 : 7.2,
      color: opt.color || f.char.color,
      pierce: false, life: 2.0,
      onHit: opt.onHit || null,
      speed: spd,
      tag: opt.logName || '光枪',
    });
    A.shot();
    Fx.burst(x, y, 3, opt.color || f.char.color, 70, 2, 0.2);
    if (!opt.noLog) B.logFire(f, opt.logName || '光枪发射');
  };

  B.shootBlade = function (f, dmg, opt) {
    opt = opt || {};
    const e = enemyOf(f);
    if (!e) return;
    const sc = B.scale();
    const bp = (f.char.skill && f.char.skill.params) || {};
    const spd = opt.speed || (bp.bladeSpeed != null ? bp.bladeSpeed : 760) * sc;
    let a = Math.atan2(e.y - f.y, e.x - f.x);
    /* 散布：命中率手感参数，单位度 */
    const spread = (opt.spread != null ? opt.spread : (bp.bladeSpread || 0)) * Math.PI / 180;
    if (spread > 0) a += U.rand(-spread, spread);
    addProj({
      kind: 'blade', x: f.x + Math.cos(a) * (f.r + 10 * B.scale()), y: f.y + Math.sin(a) * (f.r + 10 * B.scale()),
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, len: 40 * sc, wid: (opt.wid != null ? opt.wid : (bp.bladeWidth != null ? bp.bladeWidth : 11)) * sc,
      dmg, dtype: 'shot', owner: f, target: e, homing: opt.homing || 0,
      color: '#e8f0ff', pierce: false, life: 1.6,
      paralyze: opt.paralyze || 0,
      onHit: opt.onHit || null,
      tag: '飞刀',
      spin: 0,
    });
    A.blade();
    B.logFire(f, '特殊格斗程序Ⅰ');
  };

  /* ---------------- 雪鸮：猎兵之眼 ----------------
     常态：站桩蓄力 1 秒打一发；觉醒：每 3 秒一组四连发（组内 0.3 秒） */
  function castSnipe(f, e) {
    const p = f.char.skill.params;
    if (!alive(e)) return;
    f.vx = 0; f.vy = 0;
    f.facing = e.x >= f.x ? 1 : -1;

    if (f.awaken > 0) {
      const ap = f.char.awaken.params || {};
      const every = ap.burstEvery != null ? ap.burstEvery : 3;
      const count = Math.max(1, ap.burstCount != null ? ap.burstCount : 4);
      const gap = Math.max(.05, ap.burstGap != null ? ap.burstGap : .3);
      f.skillCd = every;
      f.burst = { left: count - 1, gap, t: 0 };
      fireSnipe(f, e, e.x, e.y, true);
      Fx.text(f.x, f.y - f.r - 30, '四连发', '#d8dfe6', 12);
      B.log(f.char.short + ' 四连发', '#cfd8e1');
      return;
    }

    const charge = Math.max(.1, p.chargeTime != null ? p.chargeTime : 1);
    const shots = Math.max(1, Math.round(p.shots != null ? p.shots : 3));
    const gap = Math.max(.2, p.shotGap != null ? p.shotGap : 1);
    f.snipe = {
      t: 0, total: charge, target: e, aimX: e.x, aimY: e.y,
      phase: 'charge', shots, shot: 0, gap, nextShot: 0,
    };
    /* 冷却从整组枪打完开始算，避免短时间反复起手 */
    f.skillCd = (p.cd != null ? p.cd : 6) + (shots - 1) * gap;
    Fx.text(f.x, f.y - f.r - 30, '蓄力', '#d8dfe6', 12);
    Fx.ring(f.x, f.y, 'rgba(196,206,216,.75)', f.r * 2.2, f.r * 1.15, charge);
    Fx.burst(f.x, f.y, 14, '#cfd8e2', 240, 2.6, .45);
    B.log(f.char.short + ' 架枪蓄力', '#d8dfe6');
    A.snipeCharge();
  }

  function tickSnipe(f, dt) {
    const s = f.snipe;
    if (!s) return;
    const p = f.char.skill.params;
    const e = enemyOf(f);
    if (!alive(e)) { f.snipe = null; return; }
    const charging = s.phase !== 'shots';
    /* 硬控打断：蓄力中连枪都开不出，连发中则剩下的子弹一并取消 */
    if (hardLocked(f)) {
      f.snipe = null;
      f.skillCd = Math.max(f.skillCd, .8);
      Fx.text(f.x, f.y - f.r - 26, charging ? '蓄力中断' : '射击中断', '#ff8b96', 12);
      return;
    }
    s.t += dt;
    f.facing = e.x >= f.x ? 1 : -1;
    if (charging) {
      /* 蓄满前的一瞬：准星收紧 + 上膛声 */
      if (!s.ready && s.t >= s.total - .12) {
        s.ready = true;
        Fx.ring(f.x, f.y, 'rgba(240,246,252,.95)', f.r * 1.15, f.r * 1.5, .16);
        A.tone(1500, .06, 'square', .05, 900);
      }
      /* 蓄力气流：碎光被吸向枪口 */
      s.fx = (s.fx || 0) + dt;
      if (s.fx > .055) {
        s.fx = 0;
        const aimA = Math.atan2(e.y - f.y, e.x - f.x);
        const mx = f.x + Math.cos(aimA) * (f.r + 14 * B.scale());
        const my = f.y + Math.sin(aimA) * (f.r + 14 * B.scale());
        const r0 = f.r * U.rand(1.2, 2.3), a0 = U.rand(0, Math.PI * 2);
        Fx.parts.push({
          x: f.x + Math.cos(a0) * r0, y: f.y + Math.sin(a0) * r0,
          vx: (mx - f.x) * 2.8, vy: (my - f.y) * 2.8,
          life: .22, max: .22, color: 'rgba(214,224,234,.9)',
          size: U.rand(1.2, 2.4), drag: 0,
        });
      }
    }
    /* 瞄准点带滞后（目标继续跑就打在身后）；连发后两枪滞后成倍放大，更难命中 */
    const lagMul = charging ? 1 : 1 + s.shot * (p.followLagMul != null ? p.followLagMul : .6);
    const lag = (p.aimLag != null ? p.aimLag : .3) * lagMul;
    const k = lag > 0 ? Math.min(1, dt / lag) : 1;
    s.aimX += (e.x - s.aimX) * k;
    s.aimY += (e.y - s.aimY) * k;

    if (charging) {
      if (s.t < s.total) return;
      /* 蓄满：第一枪，随后按间隔补完剩下的枪 */
      s.phase = 'shots';
      s.nextShot = s.t + s.gap;
      fireSnipe(f, e, s.aimX, s.aimY, false, 1, 0);
      s.shot++;
      if (s.shot >= s.shots) f.snipe = null;
      return;
    }

    if (s.t >= s.nextShot) {
      /* 后两枪：额外加一份固定散布 */
      const spreadAdd = (p.followSpread != null ? p.followSpread : 10) * Math.PI / 180;
      fireSnipe(f, e, s.aimX, s.aimY, false, 1, spreadAdd);
      s.shot++;
      s.nextShot = s.t + s.gap;
      if (s.shot >= s.shots) f.snipe = null;
    }
  }

  /* 觉醒四连发的后续子弹 */
  function tickBurst(f, dt) {
    const b = f.burst;
    if (!b) return;
    const e = enemyOf(f);
    if (f.awaken <= 0 || !alive(e) || hardLocked(f)) { f.burst = null; return; }
    if (b.left <= 0) { f.burst = null; return; }
    b.t += dt;
    while (b.left > 0 && b.t >= b.gap) {
      b.t -= b.gap;
      b.left--;
      fireSnipe(f, e, e.x, e.y, true, .45);
    }
  }

  function fireSnipe(f, e, ax, ay, aug, recMul, spreadAdd) {
    const p = f.char.skill.params;
    const sc = B.scale();
    const spd = (p.bulletSpeed != null ? p.bulletSpeed : 1500) * sc;
    /* 朝瞄准点开火（不是朝目标本身）：蓄力期间目标跑开就会打空 */
    const tx = ax != null ? ax : e.x, ty = ay != null ? ay : e.y;
    const spread = (aug ? (p.awakenSpread != null ? p.awakenSpread : 12) : (p.spread != null ? p.spread : 0)) * Math.PI / 180
      + (spreadAdd || 0);
    const a = Math.atan2(ty - f.y, tx - f.x) + (spread > 0 ? U.rand(-spread, spread) : 0);
    const x = f.x + Math.cos(a) * (f.r + 12 * sc);
    const y = f.y + Math.sin(a) * (f.r + 12 * sc);
    const range = (p.range != null ? p.range : 900) * sc;
    const col = aug ? '#e2e8ee' : '#f2f5f8';
    addProj({
      kind: 'beam', snipe: true, aug: !!aug,
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, len: 120 * sc, wid: (p.bulletWidth != null ? p.bulletWidth : 3.2) * sc,
      dmg: p.damage != null ? p.damage : 400,
      dtype: 'shot', owner: f, target: null, homing: 0,
      color: col, pierce: false, life: range / spd + .06,
      tag: '狙击',
      onHit: (pp, tgt) => {
        /* 撞墙时用上一帧位置作起点，锥形从墙内炸开 */
        const bx = tgt ? tgt.x : (pp.px != null ? pp.px : pp.x);
        const by = tgt ? tgt.y : (pp.py != null ? pp.py : pp.y);
        /* 穿甲锥：从命中点沿弹道向前炸开，打中墙壁同样生效 */
        Fx.cone(bx, by, pp.angle, 270 * B.scale(), .19, '#eef3f8', .42);
        Fx.burst(bx, by, 22, '#eef3f8', 520, 3.8, .46);
        Fx.ring(bx, by, 'rgba(230,238,246,.95)', 6, (tgt ? tgt.r : 14) * 4.2, .38);
        if (tgt) {
          /* 命中反馈：顿帧 + 轻闪 + 弹道推击 */
          B.shake = Math.max(B.shake, 13);
          B.hitFlash = Math.max(B.hitFlash, .07);
          B.flashColor = '226,236,244';
          B.slowT = Math.max(B.slowT, .05);
          B.slowMul = .42;
          const ka = pp.angle;
          const kb = (aug ? 140 : 85) * B.scale();
          tgt.vx += Math.cos(ka) * kb;
          tgt.vy += Math.sin(ka) * kb;
          A.snipeHit();
        }
      },
    });
    /* 枪口焰 + 后坐力 */
    /* 枪口：白闪 + 火星 + 双环 */
    Fx.boom(x, y, f.r * .9, '#ffffff', .16);
    Fx.burst(x, y, 22, '#ffffff', 620, 5, .36);
    Fx.burst(x, y, 14, '#f2f6fa', 460, 3.4, .4);
    Fx.ring(x, y, 'rgba(255,255,255,.98)', 4, f.r * 3.6, .28);
    Fx.ring(x, y, 'rgba(210,220,230,.85)', 3, f.r * 1.3, .22);
    Fx.slash(x - Math.cos(a) * 26 * sc, y - Math.sin(a) * 26 * sc,
      x + Math.cos(a) * 36 * sc, y + Math.sin(a) * 36 * sc,
      'rgba(255,255,255,.95)', .22, 0, 3 * sc);
    const rec = (p.recoil != null ? p.recoil : 300) * sc * (recMul != null ? recMul : 1);
    f.vx -= Math.cos(a) * rec;
    f.vy -= Math.sin(a) * rec;
    B.shake = Math.max(B.shake, 10);
    B.log(f.char.short + ' 狙击射击', '#cfd8e1');
    A.snipeShot();
  }


  /* 雪鸮格反：抵消这次格斗伤害 → 麻痹对手 → 双方中间落雷 */
  function triggerCounter(f, e) {
    const p = f.char.skill.params;
    f.counterCd = p.counterCd != null ? p.counterCd : 10;
    e.stun = Math.max(e.stun || 0, p.counterStun != null ? p.counterStun : 1.2);
    const mx = (f.x + e.x) / 2, my = (f.y + e.y) / 2;
    B.mines.push({
      owner: f, x: mx, y: my, t: 0,
      delay: p.counterDelay != null ? p.counterDelay : .45,
      dmg: p.counterDamage != null ? p.counterDamage : 500,
      radius: (p.counterRadius != null ? p.counterRadius : 130) * B.scale(),
      knock: (p.counterKnock != null ? p.counterKnock : 380) * B.scale(),
      fx: 0,
    });
    B.cutin('猎兵的陷阱', '#e9eef2', f.char.name, { small: true });
    Fx.text(f.x, f.y - f.r - 34, '格反', '#f2f6fa', 17);
    Fx.text(e.x, e.y - e.r - 26, '麻痹', '#c9a4ff', 14);
    Fx.ring(f.x, f.y, 'rgba(240,246,252,.95)', f.r * .5, f.r * 3.4, .34);
    Fx.slash(f.x - f.r, f.y - f.r, f.x + f.r, f.y + f.r, 'rgba(255,255,255,.95)', .26, 0, 4);
    Fx.burst(f.x, f.y, 22, '#e8eef4', 420, 3.4, .4);
    B.shake = Math.max(B.shake, 11);
    A.crit();
    B.log(f.char.short + ' 猎兵的陷阱', '#e9eef2');
  }

  function tickMines(dt) {
    for (let i = B.mines.length - 1; i >= 0; i--) {
      const m = B.mines[i];
      m.t += dt;
      /* 落地火花 */
      m.fx = (m.fx || 0) + dt;
      if (m.fx > .09) {
        m.fx = 0;
        Fx.parts.push({
          x: m.x + U.rand(-4, 4), y: m.y + U.rand(-4, 4),
          vx: U.rand(-45, 45), vy: U.rand(-95, -30),
          life: .22, max: .22, color: 'rgba(240,246,252,.9)',
          size: U.rand(1.2, 2.2), drag: 3,
        });
      }
      if (m.t >= m.delay) {
        B.mines.splice(i, 1);
        explodeMine(m);
      }
    }
  }

  function explodeMine(m) {
    const R = m.radius;
    const f = m.owner;
    const e = f ? B.fighters[1 - f.team] : null;
    Fx.boom(m.x, m.y, R, '#d6dee6', .5);
    Fx.ring(m.x, m.y, 'rgba(245,249,252,.95)', R * .2, R * 1.3, .46);
    Fx.burst(m.x, m.y, 34, '#eef3f8', 640, 4, .55);
    B.shake = Math.max(B.shake, 16);
    B.hitFlash = Math.max(B.hitFlash, .12);
    B.flashColor = '230,238,246';
    A.crit();
    B.log('手雷引爆', '#cfd8e1');
    /* 炸飞双方：离爆心越近推得越远 */
    for (const t of [f, e]) {
      if (!t || !alive(t)) continue;
      const dx = t.x - m.x, dy = t.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R + t.r) continue;
      const k = 1 - Math.min(1, d / (R + t.r));
      const push = m.knock * (0.5 + 0.5 * k);
      t.vx += dx / d * push;
      t.vy += dy / d * push;
    }
    /* 伤害只结算给敌人 */
    if (e && alive(e)) {
      const d = Math.hypot(e.x - m.x, e.y - m.y) || 1;
      if (d <= R + e.r) {
        B.damage(f, e, m.dmg, 'skill', { big: true, noAwakenBonus: true, tag: '手雷' });
      }
    }
  }

  /* ---------------- 胧雷-影：影袭·疾走 / 无间影狱 ----------------
     常态：朝移动方向突进 → 原地留影分身；分身满 3 个自动发动「乱刃」
     觉醒：红色，接触敌人立即时停爆发，连续穿梭留下分身与书法字 */
  function shadowClonesOf(f) {
    if (!f.shadowClones) f.shadowClones = [];
    return f.shadowClones;
  }

  function spawnShadowClone(f, x, y, force) {
    const p = f.char.skill.params;
    const list = shadowClonesOf(f);
    const max = Math.max(1, p.cloneMax || 3);
    if (!force && list.length >= max) list.shift();
    /* 每个分身换一张脸：从表情池里按顺序轮换，保证同屏三个不重样 */
    let img = null;
    const pool = f.char.faces && f.char.faces.clones;
    if (pool && pool.length) {
      if (f.cloneSeed == null) f.cloneSeed = Math.floor(Math.random() * pool.length);
      img = pool[f.cloneSeed % pool.length];
      f.cloneSeed = (f.cloneSeed + 1) % pool.length;
    }
    list.push({ x, y, t: 0, max: p.cloneLife || 8, born: 0, face: f.facing || 1, img });
    Fx.ring(x, y, 'rgba(48,72,142,.9)', 4, f.r * 2.2, .3);
    Fx.burst(x, y, 14, 'rgba(92,124,214,.85)', 220, 2.6, .36);
  }

  function tickShadowClones(f, dt) {
    const list = shadowClonesOf(f);
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt;
      c.born = Math.min(1, c.born + dt * 6);
      if (c.t >= c.max) {
        Fx.burst(c.x, c.y, 7, 'rgba(74,102,190,.7)', 150, 2.2, .26);
        list.splice(i, 1);
      }
    }
  }

  function castShadowDash(f, e) {
    const p = f.char.skill.params;
    if (!alive(e)) return;
    const sp = Math.hypot(f.vx, f.vy);
    /* 突进方向跟随当前移动方向；几乎静止时朝目标 */
    const a = sp > 40 ? Math.atan2(f.vy, f.vx) : Math.atan2(e.y - f.y, e.x - f.x);
    f.shadowDash = {
      t: 0, total: p.dashTime != null ? p.dashTime : .2, a,
      x0: f.x, y0: f.y, fx: 0,
      speed: (p.dashSpeed != null ? p.dashSpeed : 1300) * B.scale(),
    };
    f.skillCd = p.cd != null ? p.cd : 4;
    f.facing = Math.cos(a) >= 0 ? 1 : -1;
    Fx.text(f.x, f.y - f.r - 30, '影袭', '#7f9cff', 13);
    Fx.burst(f.x, f.y, 16, 'rgba(90,124,220,.9)', 260, 3, .34);
    A.tone(560, .06, 'square', .05, 240);
    B.log(f.char.short + ' 影袭·疾走', '#7f9cff');
  }

  function tickShadowDash(f, dt) {
    const d = f.shadowDash;
    if (!d) return;
    d.t += dt;
    f.x += Math.cos(d.a) * d.speed * dt;
    f.y += Math.sin(d.a) * d.speed * dt;
    d.fx += dt;
    if (d.fx > .026) {
      d.fx = 0;
      f.trail.push({ x: f.x, y: f.y, life: .32, color: '#0f1730' });
      if (f.trail.length > 28) f.trail.shift();
    }
    if (d.t >= d.total) {
      f.shadowDash = null;
      f.vx = Math.cos(d.a) * f.speedBase * .8;
      f.vy = Math.sin(d.a) * f.speedBase * .8;
      Fx.slash(d.x0, d.y0, f.x, f.y, 'rgba(120,152,240,.55)', .26, 0, 4);
      /* 原地留下影分身 */
      spawnShadowClone(f, d.x0, d.y0);
      const p = f.char.skill.params;
      const e = enemyOf(f);
      /* 满员后稍等一瞬让分身亮相，再齐射 */
      if (alive(e) && shadowClonesOf(f).length >= Math.max(1, p.cloneMax || 3)) f.shadowVolleyT = .16;
    }
  }

  /* 乱刃：本体三枚扇形手里剑 + 全分身各一枚 */
  function shadowVolley(f, e) {
    const p = f.char.skill.params;
    const list = shadowClonesOf(f);
    const n = Math.max(1, p.shurikenCount || 3);
    const spread = (p.shurikenSpread != null ? p.shurikenSpread : 18) * Math.PI / 180;
    const base = Math.atan2(e.y - f.y, e.x - f.x);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : (i / (n - 1) - .5) * 2;
      shootShuriken(f, f.x, f.y, base + k * spread, p.shurikenDamage != null ? p.shurikenDamage : 190, true, e);
    }
    const sc = B.scale();
    for (const c of list) {
      const a = Math.atan2(e.y - c.y, e.x - c.x);
      const spd = (p.cloneSpeed != null ? p.cloneSpeed : 1100) * sc;
      /* 分身脱离原位，本体扑向目标 */
      addProj({
        kind: 'cloneRush', cloneRush: true,
        x: c.x, y: c.y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        angle: a, len: 26 * sc, wid: 30 * sc,
        dmg: p.cloneDamage != null ? p.cloneDamage : 300,
        dtype: 'shot', owner: f, target: e, homing: 0, speed: spd,
        pierce: false, life: 2.2, tag: '影分身',
        face: c.face, img: c.img, sprite: f.char.sprite,
        onHit: (pp) => {
          Fx.slash(pp.x - 26 * sc, pp.y - 26 * sc, pp.x + 26 * sc, pp.y + 26 * sc, 'rgba(150,182,255,.9)', .22, 0, 3);
          Fx.burst(pp.x, pp.y, 14, 'rgba(96,140,255,.9)', 270, 3, .32);
          Fx.ring(pp.x, pp.y, 'rgba(120,160,245,.8)', 4, 30 * sc, .26);
          B.shake = Math.max(B.shake, 5);
        },
      });
      /* 起飞：原地炸开一团影气 + 高亮闪一下 */
      Fx.burst(c.x, c.y, 10, 'rgba(60,86,170,.85)', 210, 2.6, .3);
      Fx.burst(c.x, c.y, 8, 'rgba(228,240,255,.92)', 260, 2.2, .2);
      Fx.ring(c.x, c.y, 'rgba(226,238,255,.95)', 3, 52 * sc, .24);
      Fx.slash(c.x, c.y, c.x + Math.cos(a) * 40 * sc, c.y + Math.sin(a) * 40 * sc, 'rgba(140,175,255,.8)', .18, 0, 3);
    }
    /* 齐射后分身散尽 */
    for (const c of list) Fx.burst(c.x, c.y, 10, 'rgba(60,86,170,.8)', 200, 2.6, .3);
    f.shadowClones = [];
    B.cutin('乱刃', '#7f9cff', f.char.name, { small: true });
    B.shake = Math.max(B.shake, 8);
    A.crit();
    B.log(f.char.short + ' 乱刃', '#9fb6ff');
  }

  function shootShuriken(f, x, y, a, dmg, main, target) {
    const p = f.char.skill.params;
    const sc = B.scale();
    const spd = (p.shurikenSpeed != null ? p.shurikenSpeed : 950) * sc;
    addProj({
      kind: 'shuriken', shuriken: true, main: !!main,
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, len: 24 * sc, wid: 24 * sc,
      dmg, dtype: 'shot', owner: f, target: target || null, homing: target ? 1.2 : 0,
      color: main ? '#151b2a' : '#232c46',
      pierce: false, life: 1.4, tag: '手里剑',
      onHit: (pp, tgt) => {
        const bx = tgt ? tgt.x : pp.x, by = tgt ? tgt.y : pp.y;
        Fx.burst(bx, by, 12, pp.main ? '#cfe0ff' : '#7f9cff', 260, 3, .32);
        Fx.ring(bx, by, 'rgba(120,152,240,.85)', 3, 22, .24);
        if (tgt) B.shake = Math.max(B.shake, 5);
      },
    });
    A.tone(main ? 720 : 560, .05, 'square', .04, 300);
  }

  /* 觉醒：周期性突进 + 接触触发无间影狱 */
  function tickShadowAwaken(f, e, dt) {
    const ap = f.char.awaken.params || {};
    if (f.hp <= 0 || f.dead) return;
    if (!f.shadowBurst) {
      f.shadowRushT = (f.shadowRushT == null ? (ap.rushEvery || 2.2) : f.shadowRushT) - dt;
      if (f.shadowRushT <= 0 && alive(e)) {
        f.shadowRushT = ap.rushEvery || 2.2;
        const a = Math.atan2(e.y - f.y, e.x - f.x);
        const mag = Math.max(f.speedBase * (ap.rushMul != null ? ap.rushMul : 2.6), Math.hypot(f.vx, f.vy));
        f.vx = Math.cos(a) * mag;
        f.vy = Math.sin(a) * mag;
        Fx.slash(f.x, f.y, f.x + Math.cos(a) * 110 * B.scale(), f.y + Math.sin(a) * 110 * B.scale(), 'rgba(255,60,80,.75)', .3, 0, 4);
        Fx.burst(f.x, f.y, 16, '#ff3b52', 300, 3.2, .4);
        A.tone(300, .12, 'sawtooth', .05, 120);
      }
    }
    /* 无间影狱：一次觉醒只发动一次 */
    if (f.shadowBurst || f.shadowBurstUsed) return;
    if (f.shadowDash) return;
    if (!alive(e)) return;
    const d = U.dist(f.x, f.y, e.x, e.y);
    if (d < f.r + e.r + 12 * B.scale()) startShadowBurst(f, e);
  }

  function startShadowBurst(f, e) {
    const ap = f.char.awaken.params || {};
    const hits = Math.max(3, Math.round(ap.hits || 6));
    const total = ap.totalDamage != null ? ap.totalDamage : 1000;
    /* 伤害分布：前面每一次只削 1 点，收尾那一下吃掉全部（999） */
    const per = 1;
    const gap = ap.hitGap != null ? ap.hitGap : .58;
    f.shadowBurst = {
      t: 0, idx: 0, hits, per, total, gap,
      next: .3, endAt: 0, target: e, ended: false,
      last: Math.max(1, total - 1),
    };
    f.shadowDash = null;
    f.vx = 0; f.vy = 0;
    f.shadowBurstUsed = true;   /* 一次觉醒只放一次无间影狱 */
    /* 时停必须盖住整套动作：按穿梭节奏把预计时长算出来，取「参数值」与「实际时长」的较大者 */
    let est = .3 + .45;
    for (let k = 1; k < hits; k++) est += gap * Math.pow(.95, k);
    const ts = Math.max(ap.timeStop != null ? ap.timeStop : 2.2, est + .2);
    B.timeStop = { t: ts, owner: f, total: ts };
    f.invuln = Math.max(f.invuln || 0, ts + .45);
    B.cutin('无间影狱', '#ff2b3c', f.char.name, { big: true });
    B.hitFlash = .5; B.flashColor = '255,48,64';
    B.shake = 15;
    A.awaken(); A.crit();
    B.log(f.char.short + ' 无间影狱', '#ff2b3c');
  }

  function tickShadowBurst(f, dt) {
    const s = f.shadowBurst;
    if (!s) return;
    const e = s.target;
    if (!alive(e)) { f.shadowBurst = null; return; }
    s.t += dt;

    while (s.idx < s.hits && s.t >= s.next) {
      const i = s.idx++;
      const base = Math.atan2(e.y - f.y, e.x - f.x);
      const ang = base + i * 2.399;
      const R = (e.r + f.r) * (0.85 + 0.35 * (i % 2));
      /* 旧位置留分身 */
      const ox = f.x, oy = f.y;
      spawnShadowClone(f, ox, oy, true);
      /* 瞬移到目标周围 */
      const nx = e.x + Math.cos(ang) * R;
      const ny = e.y + Math.sin(ang) * R;
      const fl = B.field;
      f.x = U.clamp(nx, fl.x + f.r, fl.x + fl.w - f.r);
      f.y = U.clamp(ny, fl.y + f.r, fl.y + fl.h - f.r);
      f.facing = e.x >= f.x ? 1 : -1;
      /* 最后一段的伤害留到「滅」出现的那一刻结算 */
      if (i < s.hits - 1) {
        B.damage(f, e, s.per, 'shot', { silent: true, noAwakenBonus: true, tag: '无间影狱' });
      }
      /* 书法汉字（行楷 + 赛博故障效果）：刻在刚留下的那个分身头顶；收尾段留给「滅」 */
      if (i < s.hits - 1) {
        const kanji = ['瞬', '暗', '影', '刃', '狱', '杀'][i % 6];
        Fx.text(ox + U.rand(-8, 8), oy - f.r - 46, kanji, '#ff3b52', 34 + i * 2,
          { life: 1.1, vy: -14, stroke: 'rgba(0,0,0,.95)', brush: true, rot: U.rand(-.13, .13) });
      }
      /* 蓝色电弧：闪现瞬间的放电轨迹 */
      Fx.slash(f.x, f.y, e.x + U.rand(-30, 30), e.y + U.rand(-30, 30), 'rgba(90,200,255,.7)', .16, 0, 2);
      Fx.burst(e.x, e.y, 8, '#4fc4ff', 340, 2.4, .26);
      Fx.slash(f.x - 70, f.y - 70, e.x, e.y, 'rgba(255,255,255,.92)', .22, 0, 5);
      Fx.slash(f.x + 70, f.y - 70, e.x, e.y, 'rgba(255,60,80,.9)', .22, .03, 4);
      Fx.burst(e.x, e.y, 12, '#ff3b52', 300, 3.2, .3);
      B.shake = Math.max(B.shake, 8);
      A.crit();
      s.next += s.gap * Math.pow(.95, s.idx);
    }

    if (s.idx >= s.hits && !s.endAt) s.endAt = s.t + .45;
    if (s.idx >= s.hits && !s.ended && s.t >= s.endAt) {
      s.ended = true;
      finishShadowBurst(f, s);
    }
  }

  function finishShadowBurst(f, s) {
    const e = s.target;
    const list = shadowClonesOf(f);
    if (alive(e)) {
      for (const c of list) {
        Fx.slash(c.x, c.y, e.x, e.y, 'rgba(255,70,88,.85)', .26, 0, 3);
        Fx.burst(c.x, c.y, 10, '#ff3b52', 260, 2.8, .34);
      }
      Fx.slash(f.x, f.y, e.x, e.y, 'rgba(255,255,255,.96)', .3, 0, 7);
      /* 收尾一击：最后一笔伤害与「滅」同时落下 */
      const dealt = B.damage(f, e, s.last, 'shot', { silent: true, noAwakenBonus: true, tag: '无间影狱' });
      /* 收尾大字：繁体「滅」，行楷 + 故障效果 */
      Fx.text(e.x, e.y - e.r - 128, '滅', '#ff2b3c', 118,
        { life: 1.6, vy: -4, stroke: 'rgba(0,0,0,.96)', brush: true, rot: -.06 });
      /* 头顶大数字：跟「滅」同一瞬间弹出 */
      if (dealt > 0) {
        Fx.text(e.x, e.y - e.r - 6, String(dealt), '#ffffff', 54,
          { life: 1.6, vy: -26, stroke: 'rgba(122,0,20,.98)' });
      }
      /* 赛博收束：青色数据环 + 故障扫描 */
      for (let q = 0; q < 3; q++) {
        Fx.ring(e.x, e.y, 'rgba(80,200,255,' + (.5 - q * .12) + ')', e.r * (.6 + q * .5), e.r * (4.6 + q * 1.6), .5 + q * .1);
      }
      Fx.burst(e.x, e.y, 26, '#5cd0ff', 620, 3, .55);
      Fx.burst(e.x, e.y, 44, '#ff3b52', 720, 4.2, .62);
      Fx.ring(e.x, e.y, 'rgba(255,60,80,.92)', e.r * .4, e.r * 6.4, .62);
    }
    B.hitFlash = 1; B.flashColor = '255,36,52';
    B.shake = 28;
    B.slowT = Math.max(B.slowT, .12); B.slowMul = .3;
    B.log(f.char.short + ' 无间影狱 · 滅', '#ff2b3c');
    A.crit();
    f.shadowClones = [];
    f.shadowBurst = null;
    if (B.timeStop && B.timeStop.owner === f) B.timeStop.t = Math.min(B.timeStop.t, .05);
  }

  /* 魔龙的爪牙·浮游导弹 */
  B.shootMissile = function (f) {
    const e = enemyOf(f);
    if (!e) return;
    const sc = B.scale();
    const mp = (f.char.skill && f.char.skill.params) || {};
    const a = Math.atan2(e.y - f.y, e.x - f.x) + U.rand(-0.55, 0.55);
    const spd = 340 * sc;
    addProj({
      kind: 'missile',
      x: f.x + Math.cos(a) * (f.r + 4 * B.scale()),
      y: f.y + Math.sin(a) * (f.r + 4 * B.scale()),
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      angle: a, len: 14 * sc, wid: 6 * sc,
      dmg: mp.missileDamage != null ? mp.missileDamage : 1,
      dtype: 'shot', owner: f, target: e,
      homing: 4.4, color: '#8fd0ff', pierce: false, life: 2.8,
      tag: '魔龙的爪牙', onHit: missileOnHit, speed: spd,
    });
  };

  function missileOnHit(p, victim) {
    const f = p.owner;
    if (!f || !alive(f)) return;
    const mp = (f.char.skill && f.char.skill.params) || {};
    addEvo(f, mp.missileEvo != null ? mp.missileEvo : 1);
    /* 浮游导弹只用于积累进化值，不触发爆风 */
  }

  /* ============================ 技能：时间轴 ============================ */
  function startCast(f, type, steps, duration, data) {
    f.cast = { type, t: 0, steps: steps || [], idx: 0, duration: duration || 1, data: data || {} };
  }

  function tickCast(f, dt) {
    const c = f.cast;
    if (!c) return;
    c.t += dt;
    while (c.idx < c.steps.length && c.steps[c.idx].t <= c.t) {
      const st = c.steps[c.idx];
      c.idx++;
      st.fn(f, c);
    }
    if (c.t >= c.duration) {
      if (c.onEnd) c.onEnd(f, c);
      f.cast = null;
    }
  }

  /* ---------------- 天剑：光枪飞刀连段 ---------------- */
  function castSkysaber(f) {
    const p = f.char.skill.params;
    /* 总发数拆成两段齐射，中间插一发飞刀 */
    const perVolley = Math.max(1, Math.round((p.shotCount != null ? p.shotCount : 6) / 2));
    const gap = 0.28;
    const shots = [];
    for (let i = 0; i < perVolley; i++) { shots.push(i * gap); }
    const bladeT = perVolley * gap + 0.14;
    const shots2Start = bladeT + 0.74;
    const arr = shots.concat([bladeT], shots.map((t0, i) => shots2Start + i * gap));

    const steps = arr.map((time, i) => {
      if (i === perVolley) {
        return {
          t: time, fn: (ff) => {
            B.shootBlade(ff, p.bladeDamage, { paralyze: p.paralyze });
            /* 后坐力远离敌人；觉醒且觉醒技尚未使用时除外，方便贴身触发穿梭 */
            const holdForPhase = ff.awaken > 0 && ff.phaseReady;
            const e = enemyOf(ff);
            if (e && !holdForPhase) {
              const a = Math.atan2(e.y - ff.y, e.x - ff.x);
              ff.vx -= Math.cos(a) * p.bladeRecoil * B.scale();
              ff.vy -= Math.sin(a) * p.bladeRecoil * B.scale();
            }
            /* 切诱导：瞄准自己的弹幕丢失锁定 */
            B.cutHoming(ff);
            Fx.burst(ff.x, ff.y, 10, '#cfe6ff', 200, 3, 0.35);
          }
        };
      }
      return {
        t: time, fn: (ff) => {
          B.shootBeam(ff, p.shotDamage, { color: '#4aa3ff', len: 38 * B.scale(), wid: 8 * B.scale(), homing: false, logName: '光枪' });
        }
      };
    });

    startCast(f, 'skysaber_combo', steps, shots2Start + (perVolley - 1) * gap + 0.3);
    f.skillCd = p.cd;
    B.log(f.char.short + ' 腕部光束枪', f.char.color);
    Fx.text(f.x, f.y - f.r - 30, '光枪连段', '#7fd8ff', 13);
  }

  /* ---------------- 秋云：纳刀斩 ---------------- */
  function startIaido(f, target, opt) {
    const p = f.char.skill.params;
    const sc = B.scale();
    opt = opt || {};
    /* 破烂女士的纳刀是「闪」而不是「绕背」，落点比本家秋云远得多，好让位移看得出来 */
    const far = f.char.skill.type === 'akigumo_broken' ? 2.0 : 1;
    const behind = (p.behindUnits || 2) * (f.r + target.r) * 0.62 * far;

    /* 穿到目标身后。引狱期间例外：朝敌人的方向穿出去，落在敌人背离黑洞的一侧，
       这样纳刀斩不会把她送进自己黑洞的正中心挨烧 */
    const a = Math.atan2(target.y - f.y, target.x - f.x);
    let bx = target.x - Math.cos(a) * behind;
    let by = target.y - Math.sin(a) * behind;
    if (f.char.skill.type === 'akigumo_broken' && B.hole) {
      const hd = Math.hypot(target.x - B.hole.x, target.y - B.hole.y) || 1;
      const ux = (target.x - B.hole.x) / hd;
      const uy = (target.y - B.hole.y) / hd;
      bx = target.x + ux * behind;
      by = target.y + uy * behind;
    }
    /* 穿身轨迹：从原位穿过目标到身后 */
    const sx = f.x, sy = f.y;
    let ox = U.clamp(bx, B.field.x + f.r, B.field.x + B.field.w - f.r);
    let oy = U.clamp(by, B.field.y + f.r, B.field.y + B.field.h - f.r);
    if (B.hole && f.char.skill.type === 'akigumo_broken') {
      const hz = B.hole;
      const dOut = Math.hypot(ox - hz.x, oy - hz.y);
      const dFoe = Math.hypot(target.x - hz.x, target.y - hz.y);
      if (dOut < dFoe) {
        /* 外侧贴墙被夹回来了：退化成普通穿身，至少别把人塞进洞口 */
        ox = U.clamp(target.x - Math.cos(a) * behind, B.field.x + f.r, B.field.x + B.field.w - f.r);
        oy = U.clamp(target.y - Math.sin(a) * behind, B.field.y + f.r, B.field.y + B.field.h - f.r);
      }
    }

    /* 闪现演出：起点炸开、沿轨迹留一串渐隐残影、落点再炸一次 */
    Fx.ring(sx, sy, '#ff6b7a', f.r * 0.5, f.r * 3.0, 0.34);
    Fx.ring(sx, sy, 'rgba(160,205,255,.9)', f.r * 0.3, f.r * 2.0, 0.26);
    const nGhost = 14;
    for (let i = 1; i <= nGhost; i++) {
      const k = i / (nGhost + 1);
      const gx = U.lerp(sx, ox, k), gy = U.lerp(sy, oy, k);
      Fx.parts.push({
        x: gx, y: gy, vx: 0, vy: 0, life: 0.42 + k * 0.30, max: 0.42 + k * 0.30,
        color: 'rgba(205,230,255,' + (0.45 + k * 0.45).toFixed(3) + ')',
        size: f.r * (0.62 - k * 0.26), drag: 0,
      });
    }
    Fx.slash(sx, sy, ox, oy, 'rgba(255,255,255,.98)', 0.46, 0, f.r * 0.50);
    Fx.slash(sx, sy, ox, oy, 'rgba(255,88,110,.90)', 0.62, 0.02, f.r * 0.34);
    Fx.slash(sx, sy, ox, oy, 'rgba(130,180,255,.85)', 0.72, 0.05, f.r * 0.20);
    Fx.ring(ox, oy, '#ff6b7a', f.r * 0.5, f.r * 4.2, 0.38);
    Fx.ring(ox, oy, 'rgba(200,230,255,.95)', f.r * 0.25, f.r * 3.2, 0.32);
    Fx.ring(sx, sy, 'rgba(150,195,255,.85)', f.r * 0.4, f.r * 3.4, 0.30);
    Fx.burst(target.x, target.y, 22, '#ffb0bc', 320, 3.6, 0.45);
    Fx.burst(ox, oy, 18, '#9dc4ff', 280, 3.0, 0.45);

    f.vx = 0; f.vy = 0;
    Fx.ring(f.x, f.y, '#ffb36b', f.r * 0.6, f.r * 2.4, 0.4);
    A.blade();

    const cast = {
      t: 0, total: opt.fast ? .18 : (p.chargeTime || 1), target,
      /* 咬合收口的看破斩：不读条、不占纳刀冷却，残心照常叠 */
      mul: opt.mul || 1,
      /* 穿身动画：0.16 秒从这里滑到目标背后 */
      dashT: 0, dashDur: f.char.skill.type === 'akigumo_broken' ? 0.24 : 0.16,
      fromX: sx, fromY: sy, toX: ox, toY: oy,
      passed: false,
      onInterrupt: null, done: false,
    };
    f.iaidoCast = cast;
    /* 看破斩是咬合结束后的追击，不占纳刀自己的冷却 */
    if (!opt.fast) f.skillCd = p.cd;
    B.log(f.char.short + ' 格斗拔刀斩', '#ffd166');

    cast.onInterrupt = () => {
      Fx.text(f.x, f.y - f.r - 26, '中断', '#ff8b96', 14);
      Fx.burst(f.x, f.y, 12, '#ff6b7a', 200, 3, 0.4);
      f.iaidoCast = null;
    };
  }

  /* ---------------- 秋云：对吸血类攻击的解法 ----------------
     咬合期间按刀不动：纳刀读条只要被吸血的任何一跳碰到就会中断，
     与其白读一次，不如等这一口吸完，收口那一瞬再闪过去补刀。 */
  function tickBiteCounter(f, e, dt) {
    if (!isIaido(f.char.skill.type) || !alive(e)) { f.biteWait = 0; return; }
    const st = e.char.skill && e.char.skill.type;
    if (st !== 'vamp_bite' && st !== 'mimi_pack') { f.biteWait = 0; return; }

    if (e.bite) {
      if (f.biteWait <= 0 && !f.iaidoCast) {
        Fx.text(f.x, f.y + f.r + 22, '静待', '#9fc4ff', 12);
      }
      f.biteWait = 1.5;        /* 收口后留 1.5 秒的补刀窗口 */
      f.biteDone = false;      /* 新的一口，看破机会重置 */
      return;
    }
    if (f.biteWait <= 0) return;
    f.biteWait -= dt;
    if (f.biteDone) return;
    /* 咬合刚收口：贴得上就直接补一刀看破斩（不读条、伤害打折） */
    if (f.iaidoCast || f.parryCast || f.chargeState || hardLocked(f)) return;
    const d = U.dist(f.x, f.y, e.x, e.y);
    if (d > (f.r + e.r) * 3.4) return;
    f.biteDone = true;
    if (canInstantParry(f)) { startParry(f); return; }
    B.cutin('看破', '#9fc4ff', f.char.name, { small: true });
    Fx.text(f.x, f.y - f.r - 26, '看破', '#9fc4ff', 14);
    B.log(f.char.short + ' 看破·拔刀', '#9fc4ff');
    /* 看破也是实打实砍中一刀，照样叠残心：打吸血系时普通纳刀几乎全被咬合打断，
       全靠看破补刀，若不叠残心就会永远卡在 2 层，凑不出黑洞 */
    startIaido(f, e, { mul: 1, fast: true });
  }

  function completeIaido(f, cast) {    const p = f.char.skill.params;
    const e = cast.target;
    f.iaidoCast = null;
    if (!alive(e)) return;

    const a = Math.atan2(e.y - f.y, e.x - f.x);
    f.facing = Math.cos(a) >= 0 ? 1 : -1;

    /* 斩击特效：连续切割 */
    const cx = (f.x + e.x) / 2, cy = (f.y + e.y) / 2;
    Fx.ring(cx, cy, '#ffd0d6', 10, f.r * 5, 0.5);
    Fx.ring(e.x, e.y, 'rgba(255,240,200,.9)', e.r * 0.4, e.r * 4.2, 0.55);
    Fx.burst(e.x, e.y, 30, '#ff9aa6', 480, 5, 0.65);
    /* 目标身上依次炸开 8 道斩痕 */
    for (let i = 0; i < 12; i++) {
      const ang2 = U.rand(0, Math.PI * 2);
      const len = e.r * U.rand(2.2, 4.2);
      const ox = e.x + U.rand(-e.r * 0.5, e.r * 0.5);
      const oy = e.y + U.rand(-e.r * 0.5, e.r * 0.5);
      Fx.slash(
        ox - Math.cos(ang2) * len * 0.5, oy - Math.sin(ang2) * len * 0.5,
        ox + Math.cos(ang2) * len * 0.5, oy + Math.sin(ang2) * len * 0.5,
        i % 3 === 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,160,180,.9)',
        0.55, i * 0.035
      );
    }
    Fx.text(e.x, e.y - e.r - 34, '纳刀斩', '#ffd0d6', 17);
    B.log(f.char.short + ' 格斗拔刀斩 -' + p.damage, '#ff8b96');
    B.shake = 14;
    B.hitFlash = 0.22;
    B.flashColor = '255,120,140';

    B.damage(f, e, Math.round(p.damage * (cast.mul || 1)), 'melee', { big: true, tag: '纳刀' });
    /* 击退 */
    e.vx += Math.cos(a) * p.knockback * B.scale();
    e.vy += Math.sin(a) * p.knockback * B.scale();
    /* 自身远离 */
    f.vx -= Math.cos(a) * p.knockback * 0.85 * B.scale();
    f.vy -= Math.sin(a) * p.knockback * 0.85 * B.scale();
    /* 残心 */
    f.reshin = Math.min(p.reshinMax || 3, f.reshin + 1);
    Fx.text(f.x, f.y - f.r - 30, '残心 ' + f.reshin, '#ffc24a', 13);
    B.cutin('残心 ×' + f.reshin, '#ffc24a', f.char.name, { small: true });
    A.crit();
  }

  /* ---------------- 秋云：三层残心 → 阴阳流・星落 ---------------- */
  function startCharge(f) {
    const e = enemyOf(f);
    if (!e) return;
    f.reshin = 0;   /* 星落消耗全部残心 */
    const p = f.char.skill.params;
    const spd = (p.chargeSpeed != null ? p.chargeSpeed : 380) * B.scale();
    /* 先原地瞄准（锁定目标此刻位置），再朝该位置冲刺 */
    f.chargeState = {
      phase: 'aim', t: 0,
      aimTotal: p.chargeAim != null ? p.chargeAim : 0.2,
      dashTotal: p.chargeDash != null ? p.chargeDash : 0.68,
      tx: e.x, ty: e.y, spd, vx: 0, vy: 0,
      immuneShot: true, hit: false,
    };
    A.awaken();
    Fx.text(f.x, f.y - f.r - 30, '阴阳流・星落', '#ffc24a', 14);
    Fx.ring(f.x, f.y, 'rgba(255,59,82,.85)', f.r, f.r * 2.6, 0.5);
    B.cutin('阴阳流・星落', '#ff5f6d', f.char.name, { big: true });
    B.log(f.char.short + ' 阴阳流・星落', '#ffc24a');
  }

  /* ---------------- 破破烂烂-秋云：场地中心黑洞 ---------------- */
  function startBlackHole(f) {
    const p = f.char.skill.params;
    f.chargeState = null;
    f.cast = null;
    const cx = B.field.x + B.field.w * 0.5;
    const cy = B.field.y + B.field.h * 0.5;
    const cast = p.holeCast != null ? p.holeCast : .4;
    /* 脱手黑洞：展开后不再计时，一直存在到施法者这条命结束 */
    const total = Infinity;
    B.hole = {
      owner: f, x: cx, y: cy, t: 0, born: 0, cast, total,
      /* 覆盖全图：半径直接按场地边长算，白环直径接近一整张图 */
      r: B.field.w * 0.25 * (p.holeRadius != null ? p.holeRadius : 2.6),
      pull: (p.holePull != null ? p.holePull : 900) * B.scale(),
      spin: 0, fx: 0,
    };
    f.vx = 0; f.vy = 0;
    f.holePhase = Math.random() * (p.holeTugEvery != null ? p.holeTugEvery : 1.25);
    B.cutin('阴阳流・引狱', '#2f6bff', f.char.name, { big: true });
    B.log(f.char.short + ' 阴阳流・引狱', '#5b8cff');
    B.shake = 8;
    B.flashColor = '60,110,255';
    B.hitFlash = .18;
    Fx.ring(f.x, f.y, 'rgba(90,140,255,.9)', f.r * .6, f.r * 4.2, .55);
    Fx.text(f.x, f.y - f.r - 34, '引狱', '#9dc0ff', 15);
    A.awaken();
  }

  function updateHole(dt) {
    const h = B.hole;
    if (!h) return;
    const f = h.owner;
    if (!alive(f)) { B.hole = null; return; }
    const e = enemyOf(f);
    const p = f.char.skill.params;
    h.t += dt;
    h.spin += dt * 2.2;
    h.born = Math.min(1, h.born + dt / Math.max(.12, h.cast));
    /* 残心在黑洞真正展开的那一帧才被吞掉：留出整个起手时间让「残心 ×3」看得见 */
    if (h.born >= 1 && !h.took) {
      h.took = true;
      if (f.reshin) {
        Fx.text(f.x, f.y - f.r - 34, '残心尽入引狱', '#7fa8ff', 13);
        f.reshin = 0;
      }
    }

    if (alive(e) && h.t < h.total) {
      const d = Math.max(1, U.dist(e.x, e.y, h.x, h.y));
      const near = Math.max(0, 1 - d / Math.max(1, h.r * 2.6));
      /* 视界内不再死拽：越靠近中心引力越松，被拖进来的人还能在中心附近走动、拉开角度 */
      const inner = U.clamp(d / Math.max(1, h.r * 0.5), 0, 1);
      const spd = h.pull * (0.55 + 0.8 * near) * inner;
      const step = Math.min(Math.max(0, d - e.r * .25), spd * dt);
      if (step > 0) {
        e.x += (h.x - e.x) / d * step;
        e.y += (h.y - e.y) / d * step;
      }
      /* 只吸不定身：敌人照常行动、照常出招，靠持续牵引把人拖进中心 */
      /* 持续伤害：每 0.36 秒结算一次 */
      const dps = p.holeDps != null ? p.holeDps : 0;
      if (dps > 0) {
        h.dotT = (h.dotT || 0) + dt;
        while (h.dotT >= .36) {
          h.dotT -= .36;
          B.damage(f, e, Math.round(dps * .36), 'skill',
            { noLog: true, noAwakenBonus: true, tag: '引狱' });
        }
      }
      h.fx += dt;
      if (h.fx > .05) {
        h.fx = 0;
        const a = U.rand(0, Math.PI * 2);
        const r0 = h.r * U.rand(1.0, 1.5);
        Fx.parts.push({
          x: h.x + Math.cos(a) * r0, y: h.y + Math.sin(a) * r0,
          vx: -Math.cos(a) * r0 * 2.4, vy: -Math.sin(a) * r0 * 2.4,
          life: .42, max: .42, color: 'rgba(130,180,255,.9)', size: U.rand(1.4, 3), drag: 0,
        });
      }
    }

  }

  /* ---------------- 破破烂烂-秋云：修罗丸守护 ---------------- */
  function tickShura(f, dt) {
    const p = f.char.skill.params;
    if (p.guardEvery == null) return;
    const e = enemyOf(f);
    if (f.shura) {
      f.shura.t += dt;
      if (f.shura.flash > 0) f.shura.flash -= dt;
      const a = (e && alive(e))
        ? Math.atan2(e.y - f.y, e.x - f.x)
        : (f.facing >= 0 ? 0 : Math.PI);
      const off = (p.guardOffset != null ? p.guardOffset : 52) * B.scale();
      const wantX = f.x + Math.cos(a) * off;
      const wantY = f.y + Math.sin(a) * off;
      f.shura.x += (wantX - f.shura.x) * Math.min(1, dt * 12);
      f.shura.y += (wantY - f.shura.y) * Math.min(1, dt * 12);
      f.shura.a = a;
      if (f.shura.t >= f.shura.total) {
        f.shura = null;
        f.shuraCd = p.guardEvery != null ? p.guardEvery : 6.5;
      }
      return;
    }
    f.shuraCd = (f.shuraCd == null ? 1.2 : f.shuraCd) - dt;
    if (f.shuraCd <= 0 && !hardLocked(f)) {
      const off = (p.guardOffset != null ? p.guardOffset : 52) * B.scale();
      const a = (e && alive(e)) ? Math.atan2(e.y - f.y, e.x - f.x) : 0;
      f.shura = {
        t: 0, total: p.guardTime != null ? p.guardTime : 3.4,
        r: (p.guardRadius != null ? p.guardRadius : 34) * B.scale(),
        x: f.x + Math.cos(a) * off, y: f.y + Math.sin(a) * off,
        a, flash: 0, blocks: 0,
      };
      Fx.ring(f.x, f.y, 'rgba(90,140,255,.85)', f.r * .6, f.r * 3.6, .5);
      Fx.text(f.x, f.y + f.r + 16, '阴阳流・止水', '#9dc0ff', 13);
      B.log(f.char.short + ' 阴阳流・止水', '#5b8cff');
      A.awaken();
    }
  }

  /* ---------------- 破破烂烂-秋云：阴阳流・一刀 ---------------- */
  function startShuraAwaken(f) {
    const p = f.char.awaken.params;
    const e = enemyOf(f);
    if (!alive(e)) return;
    const dmg = p.damage || 1400;
    const lethal = e.hp <= dmg * 1.2;
    const hasHole = !!B.hole;
    let slow = 0;
    if (hasHole && lethal) slow = p.slowMo != null ? p.slowMo : 1.15;
    else if (hasHole) slow = .55;
    else if (lethal) slow = .4;
    const R = (p.range || 300) * B.scale();
    const ang0 = Math.atan2(e.y - f.y, e.x - f.x);
    const fwd = R * .42;   /* 修罗丸只在自己身前落刀，够不到远处的敌人 */
    f.shuraSlash = {
      t: 0, windup: p.windup || .55, total: (p.windup || .55) + .82,
      x: f.x + Math.cos(ang0) * fwd, y: f.y + Math.sin(ang0) * fwd,
      ang: ang0, fwd, dmg, range: R, done: false, slow, lethal, hole: hasHole,
    };
    if (slow > 0) {
      /* 起手先轻压一拍，真正的慢放在落刀瞬间 */
      B.slowT = Math.max(B.slowT, .35);
      B.slowMul = .5;
    }
    B.cutin('御灵・断罪', '#ff3b52', f.char.name, { big: true });
    B.log(f.char.short + ' 御灵・断罪', '#ff3b52');
    B.shake = 12;
    B.flashColor = '255,60,80';
    B.hitFlash = .24;
    Fx.ring(f.x, f.y, 'rgba(255,59,82,.85)', f.r, f.r * 5, .6);
    Fx.text(f.x, f.y - f.r - 40, '断罪', '#ff8b96', 18);
    A.crit();
  }

  function tickShuraSlash(f, dt) {
    const c = f.shuraSlash;
    if (!c) return;
    c.t += dt;
    /* 落刀点始终锁在自己身前（只转向，不追人），敌人跑远就砍不到 */
    if (!c.done) {
      const e0 = enemyOf(f);
      if (alive(e0)) c.ang = Math.atan2(e0.y - f.y, e0.x - f.x);
      c.x = f.x + Math.cos(c.ang) * c.fwd;
      c.y = f.y + Math.sin(c.ang) * c.fwd;
    }
    if (!c.done && c.t >= c.windup) {
      c.done = true;
      const e = enemyOf(f);
      const R = c.range;
      /* 刀锋：从上方斜落，红色刀光 + 深蓝余烬 */
      Fx.slash(c.x - R * .95, c.y - R * .8, c.x + R * .95, c.y + R * .7, 'rgba(255,70,90,.95)', .5);
      Fx.slash(c.x - R * .7, c.y - R * .95, c.x + R * .8, c.y + R * .55, 'rgba(255,235,240,.9)', .42, .05);
      Fx.ring(c.x, c.y, 'rgba(255,59,82,.9)', R * .12, R * 1.05, .55);
      Fx.ring(c.x, c.y, 'rgba(60,110,255,.55)', R * .2, R * 1.35, .7);
      Fx.burst(c.x, c.y, 46, '#ff6b7a', 620, 6.4, .85);
      Fx.burst(c.x, c.y, 24, '#6f9cff', 420, 4.2, .8);
      B.shake = 22;
      B.hitFlash = .3;
      B.flashColor = '255,70,90';
      if (c.slow > 0) {
        B.slowT = Math.max(B.slowT, c.slow + .45);
        B.slowMul = c.slow > .8 ? .3 : .55;
      }
      A.crit();
      if (alive(e) && U.dist(e.x, e.y, c.x, c.y) < R * .66 + e.r) {
        const a = Math.atan2(e.y - f.y, e.x - f.x);
        B.damage(f, e, c.dmg, 'melee', { big: true, noAwakenBonus: true, tag: '一刀' });
        e.vx += Math.cos(a) * 520 * B.scale();
        e.vy += Math.sin(a) * 520 * B.scale();
        B.log(f.char.short + ' 御灵・断罪 -' + c.dmg, '#ff3b52');
      } else {
        Fx.text(c.x, c.y - 30, '空斩', '#9dc0ff', 15);
      }
    }
    /* 斩击后的余韵：慢放期间保持低倍速，避免动画忽然恢复常速 */
    if (c.slow > 0 && c.t > c.windup && c.t < c.windup + .55) {
      B.slowT = Math.max(B.slowT, .12);
    }
    if (c.t >= c.total) f.shuraSlash = null;
  }

  /* ---------------- 莱茵：照射激光 ---------------- */
  function castLaser(f) {
    const p = f.char.skill.params;
    const e = enemyOf(f);
    if (!e) return;
    const lvl = effectiveEvo(f);
    const count = lvl >= 3 ? 5 : 3;
    const base = Math.atan2(e.y - f.y, e.x - f.x);
    const spread = 15 * Math.PI / 180;

    f.laserCd = p.laserCd;
    f.laserBudget = p.laserBudget != null ? p.laserBudget : 600;   /* 单次照射（含爆风）总伤害上限 */
    f.cast = { type: 'laser_cast', t: 0, steps: [], idx: 0, duration: p.laserCast, data: {} };
    f.laserCast = { t: 0, total: p.laserCast, count, base, spread, fired: false };

    Fx.ring(f.x, f.y, '#3fa9ff', f.r, f.r * 3, 0.5);
    B.cutin('前奏曲', '#3fa9ff', f.char.name + ' · 照射', { big: true });
    B.log(f.char.short + ' 前奏曲', '#3fa9ff');
    A.laser();
  }

  function fireLaser(f) {
    const c = f.laserCast;
    if (!c) return;
    const p = f.char.skill.params;
    const sc = B.scale();
    const len = Math.hypot(B.W, B.H) * 1.1;
    A.laserBlast();
    for (let i = 0; i < c.count; i++) {
      const off = (i - (c.count - 1) / 2) * c.spread;
      const a = c.base + off;
      addProj({
        kind: 'laser', x: f.x, y: f.y,
        vx: Math.cos(a), vy: Math.sin(a),
        angle: a, len, wid: 32 * sc,
        dmg: p.laserDps, dtype: 'shot', owner: f,
        target: null, homing: 0, color: '#3fa9ff',
        life: p.laserCast, maxLife: p.laserCast,
        laser: true, dps: true, tag: '照射',
        hitSet: new Set(),
      });

      /* 命中墙体：固定爆风，持续到照射结束 */
      const hp = rayRect(f.x, f.y, Math.cos(a), Math.sin(a), B.field);
      if (hp) {
        const wr = (p.boomRadius || 0.5) * sc * 60 * 2;
        Fx.boom(hp.x, hp.y, wr, '#3ea8ff', p.laserCast + 0.35);
        const e2 = enemyOf(f);
        if (e2 && alive(e2) && U.dist(hp.x, hp.y, e2.x, e2.y) < wr + e2.r) {
          let real = p.boomDamage;
          if (f.laserBudget !== undefined) {
            real = Math.min(real, Math.max(0, f.laserBudget));
            f.laserBudget -= real;
          }
          if (real > 0) B.damage(f, e2, real, 'shot', { tag: '爆风' });
        }
      }
    }
    c.fired = true;
    B.shake = 10;
  }

  /* 照射推进：引导一旦开始就打完整段，被定身也不打断 */
  function tickRhineLaser(f, dt) {
    const c = f.laserCast;
    if (!c) {
      if (f.cast && f.cast.type === 'laser_cast') f.cast = null;
      return;
    }
    c.t += dt;
    if (!c.fired && c.t >= 0.28) fireLaser(f);
    if (c.t >= c.total + 0.4) {
      f.laserCast = null;
      if (f.cast && f.cast.type === 'laser_cast') f.cast = null;
    }
  }

  function effectiveEvo(f) {
    return f.superEvo || (f.awaken > 0 && f.char.awaken.type === 'rhine_awaken') ? 3 : f.evoLevel;
  }

  function addEvo(f, n) {
    if (f.char.skill.type !== 'rhine_evo') return;
    if (f.awaken > 0) return;   /* 觉醒期间进化槽爆表，不再增长 */
    const p = f.char.skill.params;
    f.evo += n;
    while (f.evo >= p.evoPerLevel && f.evoLevel < 3) {
      f.evo -= p.evoPerLevel;
      f.evoLevel++;
      Fx.ring(f.x, f.y, '#3fa9ff', f.r, f.r * 3.6, 0.6);
      Fx.text(f.x, f.y - f.r - 34, '进化 ' + f.evoLevel, '#5cb8ff', 15);
      B.log(f.char.short + ' 武装进化 ' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][f.evoLevel - 1], '#5cb8ff');
      A.awaken();
      B.shake = 6;
      f.r = f.char.radius * B.scale() * (1 + 0.1 * f.evoLevel);
    }
  }

  /* ---------------- 通用技能 ---------------- */
  function castGenericBurst(f) {
    const p = f.char.skill.params;
    const steps = [];
    for (let i = 0; i < (p.count || 3); i++) {
      steps.push({ t: i * (p.gap || 0.16), fn: (ff) => B.shootBeam(ff, p.damage, { homing: false, logName: f.char.skill.type === 'krista_shot' ? '公文包·射击' : '光束' }) });
    }
    startCast(f, 'generic_burst', steps, (p.count || 3) * (p.gap || 0.16) + 0.4);
    f.skillCd = p.cd;
  }

  function castGenericDash(f) {
    const p = f.char.skill.params;
    const e = enemyOf(f);
    if (!e) return;
    const a = Math.atan2(e.y - f.y, e.x - f.x);
    f.chargeState = {
      t: 0, total: 0.32,
      vx: Math.cos(a) * 900 * B.scale(), vy: Math.sin(a) * 900 * B.scale(),
      immuneShot: false, hit: false, generic: true, damage: p.damage,
    };
    f.skillCd = p.cd;
  }

  /* ============================ 招架（秋云觉醒） ============================ */
  /* 刹那是否处于「可立即架起」状态：觉醒中、未用过、已架起或一闪演出中都不算 */
  function canInstantParry(f) {
    const p = f.char.awaken && f.char.awaken.params;
    if (!p || f.char.awaken.type !== 'akigumo_awaken') return false;
    if (f.awaken <= 0 || f.parryUsed || f.parryCast || f.parryStrike) return false;
    if (B.parryFlash > 0) return false;
    return f.hp < (p.guardHp || 500);
  }

  function startParry(f) {
    const ap = f.char.awaken.params || {};
    f.parryUsed = true;   /* 一次觉醒只能用一次 */
    f.parryCast = { t: 0, total: ap.guardDuration || 3.0 };
    f.iaidoCast = null;   /* 刹那优先：打断正在进行的纳刀读条 */
    f.vx = 0; f.vy = 0;
    Fx.ring(f.x, f.y, '#ffd166', f.r, f.r * 3, 0.5);
    Fx.text(f.x, f.y - f.r - 32, '阴阳流・刹那', '#ffd166', 16);
    B.cutin('阴阳流・刹那', '#ffd166', f.char.name, { big: true });
    const foe = enemyOf(f);
    B.traceAdd('parry-start', {
      who: f.char.short, dur: ap.guardDuration || 3,
      awaken: +f.awaken.toFixed(2),
      dist: foe ? Math.round(Math.hypot(foe.x - f.x, foe.y - f.y)) : -1,
      foeState: dstState(foe),
    });
    B.log(f.char.short + ' 架起阴阳流・刹那', '#ffd166');
    A.ui();
  }

  function breakParry(f) {
    if (!f.parryCast) return;
    f.parryCast = null;
    Fx.text(f.x, f.y - f.r - 28, '刹那失败', '#ff8b96', 14);
    Fx.burst(f.x, f.y, 10, '#ff8b96', 180, 3, 0.35);
  }

  function triggerParry(f, attacker) {
    if (!f.parryCast || !alive(attacker)) {
      B.traceAdd('parry-skip', {
        who: f.char.short, noCast: !f.parryCast,
        attacker: attacker ? attacker.char.short : '?', why: dstState(attacker),
      });
      return;
    }
    const p = f.char.awaken.params;
    f.parryCast = null;
    f.invuln = (p.timeStop || 1.2) + 0.9;

    B.timeStop = { t: p.timeStop || 1.2, owner: f, total: p.timeStop || 1.2 };
    B.hitFlash = 0.4;
    B.flashColor = '255,220,140';

    const e = attacker;
    f.parryUsed = true;
    /* 招架打断对方的穿梭，使一闪能正常结算 */
    if (e.cast && e.cast.type === 'phase') { e.cast = null; e.noCollide = false; }
    const a = Math.atan2(e.y - f.y, e.x - f.x);
    const nx = e.x + Math.cos(a) * (e.r + f.r) * 0.9;
    const ny = e.y + Math.sin(a) * (e.r + f.r) * 0.9;

    /* 穿身 */
    f.x = U.clamp(nx, B.field.x + f.r, B.field.x + B.field.w - f.r);
    f.y = U.clamp(ny, B.field.y + f.r, B.field.y + B.field.h - f.r);
    f.facing = Math.cos(a) >= 0 ? 1 : -1;

    /* ---- 次元斩击演出 ---- */
    Fx.ring(f.x, f.y, '#ffe6a0', f.r, f.r * 6, 0.8);
    Fx.ring(e.x, e.y, 'rgba(255,245,210,.95)', e.r * 0.4, e.r * 5, 0.6);
    Fx.text(e.x, e.y - e.r - 52, '次元斩击', '#ffd166', 24);
    Fx.text(f.x, f.y - f.r - 40, '一闪', '#fff0c0', 18);

    /* 12 道交错斩痕，依次炸开 */
    for (let i = 0; i < 12; i++) {
      const ang2 = U.rand(0, Math.PI * 2);
      const len = e.r * U.rand(2.4, 4.6);
      const ox = e.x + U.rand(-e.r * 0.55, e.r * 0.55);
      const oy = e.y + U.rand(-e.r * 0.55, e.r * 0.55);
      Fx.slash(
        ox - Math.cos(ang2) * len * 0.5, oy - Math.sin(ang2) * len * 0.5,
        ox + Math.cos(ang2) * len * 0.5, oy + Math.sin(ang2) * len * 0.5,
        i % 4 === 0 ? 'rgba(255,255,255,.98)' : 'rgba(255,214,120,.9)',
        0.62, i * 0.035
      );
    }
    /* 十字大斩 */
    Fx.slash(e.x - e.r * 3, e.y - e.r * 3, e.x + e.r * 3, e.y + e.r * 3, 'rgba(255,255,255,.95)', 0.5);
    Fx.slash(e.x - e.r * 3, e.y + e.r * 3, e.x + e.r * 3, e.y - e.r * 3, 'rgba(255,255,255,.95)', 0.5);

    /* 强闪光与震屏 */
    B.hitFlash = 0.55;
    B.flashColor = '255,240,200';
    B.parryFlash = 1.6;
    B.parryX = f.x;
    B.parryY = f.y;
    B.shake = 20;
    A.crit();

    B.log(f.char.short + ' 阴阳流・刹那 成功', '#ffd166');

    /* 时停结束瞬间结算 */
    f.parryStrike = { t: (p.timeStop || 1.2) * 0.82, target: e, damage: p.guardDamage || 1400, dir: a };
    B.traceAdd('parry-hit', {
      who: f.char.short, target: e.char.short, dmg: p.guardDamage || 1400,
      delay: +((p.timeStop || 1.2) * 0.82).toFixed(2),
      awakenLeft: +f.awaken.toFixed(2), targetState: dstState(e),
    });
    B.log(f.char.short + ' 阴阳流・刹那 架起（目标 ' + e.char.short + '）', '#ffd166');
  }

  /* 一闪（阴阳流・刹那反击）伤害结算 —— 抽成函数，觉醒结束/时停结束都能调用，
     避免觉醒计时结束时把待结算的一闪直接丢掉（历史上这是「刹那伤害被吞」的主要原因） */
  function resolveParryStrike(f, reason) {
    const ps = f.parryStrike;
    if (!ps) return;
    f.parryStrike = null;
    B.traceAdd('strike-fire', {
      who: f.char.short, target: ps.target ? ps.target.char.short : '?',
      dmg: ps.damage, via: reason || 'normal', targetState: dstState(ps.target),
    });
    if (!alive(ps.target)) {
      B.traceAdd('strike-result', { who: f.char.short, dealt: 0, want: ps.damage, why: 'targetDead' });
      return;
    }
    const dealt = B.damage(f, ps.target, ps.damage, 'melee', { big: true, noAwakenBonus: true, tag: '一闪' });
    B.traceAdd('strike-result', { who: f.char.short, dealt: dealt || 0, want: ps.damage, via: reason || 'normal' });
    if (dealt) B.log(f.char.short + ' 一闪 -' + dealt, '#ffd166');
    ps.target.vx += Math.cos(ps.dir) * 420 * B.scale();
    ps.target.vy += Math.sin(ps.dir) * 420 * B.scale();
    f.vx -= Math.cos(ps.dir) * 300 * B.scale();
    f.vy -= Math.sin(ps.dir) * 300 * B.scale();
    Fx.burst(ps.target.x, ps.target.y, 40, '#ffe6a0', 520, 6, 0.8);
    B.shake = 18;
  }

  /* ============================ 接触 / 格斗 ============================ */
  /* 返回 true 表示发生了特殊位移，本次不做弹球分离 */
  function contact(a, b) {
    if (!alive(a) || !alive(b)) return false;
    if (a.invuln > 0 || b.invuln > 0) return false;
    if (a.noCollide || b.noCollide) return false;
    const d = U.dist(a.x, a.y, b.x, b.y);
    if (d > a.r + b.r + 14 * (B.scale ? B.scale() : 1)) return false;

    /* 招架优先：即使接触伤害在冷却，也应触发架招 */
    if (a.parryCast) { triggerParry(a, b); return true; }
    if (b.parryCast) { triggerParry(b, a); return true; }

    /* 吸血鬼小修女：接触即开咬（冷却就绪时，无需飞扑） */
    if (canStartBite(a, b)) { startBite(a, b); return true; }
    if (canStartBite(b, a)) { startBite(b, a); return true; }
    /* 米米姐：轻装状态下接触即进入背包充能 */
    if (canStartCharge(a, b)) { startChargeBind(a, b); return true; }
    if (canStartCharge(b, a)) { startChargeBind(b, a); return true; }

    if (a.contactCd > 0 || b.contactCd > 0) return false;

    a.contactCd = 3.1;
    b.contactCd = 3.1;

    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let anyHit = false;
    const biting = !!(a.bite || b.bite);

    /* 天剑觉醒穿梭：优先接管接触 */
    if (a.char.awaken.type === 'skysaber_awaken' && a.awaken > 0 && a.phaseReady && !hardLocked(a)) {
      startPhaseDash(a, b);
      return true;
    }
    if (b.char.awaken.type === 'skysaber_awaken' && b.awaken > 0 && b.phaseReady && !hardLocked(b)) {
      startPhaseDash(b, a);
      return true;
    }

    /* 双方接触伤害：咬合方与定身方都不结算（伤害由技能每秒结算，被咬方照常反击） */
    if (a.char.contactDamage > 0 && !a.bite && !hardLocked(a)) {
      B.damage(a, b, a.char.contactDamage, 'melee', { big: true, tag: '格斗' });

      anyHit = true;
    }
    if (b.char.contactDamage > 0 && !b.bite && !hardLocked(b)) {
      B.damage(b, a, b.char.contactDamage, 'melee', { big: true, tag: '格斗' });

      anyHit = true;
    }

    if (biting) {
      if (anyHit) {
        B.shake = Math.max(B.shake, 10);
        B.hitFlash = Math.max(B.hitFlash, 0.12);
        B.flashColor = '255,255,255';
      }
      return true;   /* 咬合期间不做弹球分离 */
    }

    /* 秋云纳刀：每次触碰都尝试，双方都不被击退。
       顺序随机：同门内战（两个秋云）时不能永远是同一边先出手，
       谁先拔刀由这一次接触的掷签决定，慢的一方被对方的接触伤害打断 */
    const iaiOrder = Math.random() < .5 ? [a, b] : [b, a];
    for (const f of iaiOrder) {
      const e = f === a ? b : a;
      if (isIaido(f.char.skill.type) && !f.iaidoCast && f.parryCast == null && f.stun <= 0 && !hardLocked(f) && alive(e)) {
        /* 刹那（觉醒爆发招架）优先级高于普通纳刀斩：可用时先架招，避免被覆盖 */
        if (canInstantParry(f)) { startParry(f); return true; }
        f.vx = 0; f.vy = 0;
        startIaido(f, e);
        if (anyHit) {
          B.shake = Math.max(B.shake, 10);
          B.hitFlash = Math.max(B.hitFlash, 0.12);
          B.flashColor = '255,255,255';
        }
        return true;
      }
    }

    /* 秋云三层残心冲锋 */
    const resOrder = Math.random() < .5 ? [a, b] : [b, a];
    for (const f of resOrder) {
      const e = f === a ? b : a;
      if (isIaido(f.char.skill.type) && f.reshin >= (f.char.skill.params.reshinMax || 3) && !f.chargeState && !hardLocked(f) &&
          !(f.char.skill.type === 'akigumo_broken' && B.hole)) {
        if (f.char.skill.type === 'akigumo_broken') startBlackHole(f);
        else startCharge(f);
        if (anyHit) {
          B.shake = Math.max(B.shake, 10);
          B.hitFlash = Math.max(B.hitFlash, 0.12);
          B.flashColor = '255,255,255';
        }
        return true;
      }
    }

    if (anyHit) {
      B.shake = Math.max(B.shake, 10);
      B.hitFlash = Math.max(B.hitFlash, 0.12);
      B.flashColor = '255,255,255';
    }
    return false;
  }

  /* 天剑觉醒穿梭 */
  function startPhaseDash(f, e) {
    const p = f.char.awaken.params;
    const hits = Math.max(1, p.hits || 3);
    const total = p.contactDamage || 800;
    f.phaseReady = false;
    f.noCollide = true;
    f.vx = 0; f.vy = 0;
    f.cast = {
      type: 'phase', t: 0, steps: [], idx: 0,
      duration: 0.22 + 0.26 * hits + 0.26,
      data: {
        e, hits, total, done: 0, dealt: 0, gap: 0.26,
        stage: 'dash', dashT: 0, dashDur: 0.2,
        fromX: f.x, fromY: f.y,
      },
    };
    Fx.slash(f.x, f.y, e.x, e.y, 'rgba(255,90,110,.55)', 0.25);
    Fx.ring(f.x, f.y, 'rgba(255,60,86,.9)', f.r, f.r * 4.2, 0.5);
    Fx.text(f.x, f.y - f.r - 34, '格斗程序·最终X', '#ff5c6e', 16);
    B.cutin('格斗程序·最终X', '#ff5c6e', f.char.name + ' · 觉醒技', { big: true });
    B.log(f.char.short + ' 格斗程序·最终X', '#ff5c6e');
    A.awaken();
    B.hitFlash = 0.2;
    B.flashColor = '255,70,90';
    B.shake = 10;
  }

  function updatePhaseDash(f, dt) {
    const c = f.cast;
    if (!c || c.type !== 'phase') return;
    const d = c.data;

    /* 起步冲刺：高速贴近目标 */
    if (d.stage === 'dash') {
      d.dashT += dt;
      const k = Math.min(1, d.dashT / d.dashDur);
      const e0 = d.e;
      if (alive(e0)) {
        const a0 = Math.atan2(e0.y - d.fromY, e0.x - d.fromX);
        const tx0 = e0.x - Math.cos(a0) * (e0.r + f.r) * 1.1;
        const ty0 = e0.y - Math.sin(a0) * (e0.r + f.r) * 1.1;
        const ease = 1 - Math.pow(1 - k, 2.4);
        f.x = U.lerp(d.fromX, tx0, ease);
        f.y = U.lerp(d.fromY, ty0, ease);
      }
      f.trail.push({ x: f.x, y: f.y, life: 0.34, color: '#ff4d5e' });
      if (f.trail.length > 26) f.trail.shift();
      if (k >= 1) {
        d.stage = 'slash';
        c.t = 0;
        Fx.ring(f.x, f.y, 'rgba(255,80,100,.9)', f.r * 0.6, f.r * 2.8, 0.35);
        B.shake = 8;
      }
      return;
    }

    c.t += dt;
    const idx = Math.floor(c.t / d.gap);
    while (d.done < Math.min(idx, d.hits)) {
      d.done++;
      const e = d.e;
      if (!alive(e)) break;

      const fromX = f.x, fromY = f.y;
      const ang = Math.atan2(f.y - e.y, f.x - e.x);        /* 敌→我 */
      const bx = e.x + Math.cos(ang + Math.PI) * (e.r + f.r) * 0.85;
      const by = e.y + Math.sin(ang + Math.PI) * (e.r + f.r) * 0.85;
      f.x = U.clamp(bx, B.field.x + f.r, B.field.x + B.field.w - f.r);
      f.y = U.clamp(by, B.field.y + f.r, B.field.y + B.field.h - f.r);
      f.facing = f.x >= e.x ? 1 : -1;

      /* 刀光轨迹 */
      Fx.slash(fromX, fromY, f.x, f.y, 'rgba(255,96,116,.95)', 0.34);
      Fx.slash(fromX, fromY, f.x, f.y, 'rgba(255,255,255,.65)', 0.2);
      Fx.burst((fromX + f.x) / 2, (fromY + f.y) / 2, 10, '#ff5c6e', 320, 3.5, 0.35);

      const remain = d.total - d.dealt;
      const dmg = d.done === d.hits ? remain : Math.floor(d.total / d.hits);
      d.dealt += dmg;
      B.damage(f, e, dmg, 'melee', { big: d.done === d.hits, noAwakenBonus: true, tag: '格斗程序·最终X' });
      B.shake = 12;
      B.hitFlash = 0.14;
      B.flashColor = '255,80,90';
    }

    if (c.t >= c.duration) {
      f.cast = null;
      f.noCollide = false;
      const e = d.e;
      if (alive(e)) {
        const a = Math.atan2(e.y - f.y, e.x - f.x);
        e.vx += Math.cos(a) * 260 * B.scale();
        e.vy += Math.sin(a) * 260 * B.scale();
        const spd = f.speedBase;
        f.vx = -Math.cos(a) * spd;
        f.vy = -Math.sin(a) * spd;
      }
    }
  }


  /* 克丽丝塔：环绕激光大剑 */
  function updateSword(f, e, dt) {
    const sw = f.char.sword;
    if (!sw) return;
    f.swordAngle = (f.swordAngle || 0) + (sw.spin || 2) * (f.awaken > 0 ? (sw.awakenSpin || 2) : 1) * dt;
    f.swordCd = Math.max(0, (f.swordCd || 0) - dt);
    if (f.swordCd > 0 || !alive(e) || e.invuln > 0) return;
    /* 复活无敌期间只转不砍 */
    if (f.spawnInvuln) {
      if (f.invuln > 0) return;
      f.spawnInvuln = false;
    }

    const len = f.r * (sw.length || 2);
    const a = f.swordAngle;
    const x1 = f.x + Math.cos(a) * f.r * 0.9;
    const y1 = f.y + Math.sin(a) * f.r * 0.9;
    const x2 = f.x + Math.cos(a) * (f.r * 0.9 + len);
    const y2 = f.y + Math.sin(a) * (f.r * 0.9 + len);

    if (U.segCircle(x1, y1, x2, y2, e.x, e.y, e.r)) {
      if (B.damage(f, e, sw.damage || 600, 'melee', { big: true, tag: '大剑' }) > 0) {
        f.swordCd = sw.cd || 0.7;
        Fx.slash(x1, y1, x2, y2, 'rgba(140,255,180,.95)', 0.32);
        Fx.burst(e.x, e.y, 14, '#6dff9a', 320, 3.4, 0.45);
        B.shake = Math.max(B.shake, 10);
      }
    }
  }

  /* ============================ AI ============================ */
  /* ============================ 物理运动（弹球） ============================ */
  function physicsUpdate(f, dt) {
    /* PvE 手动操控：直接按输入方向走，不做弹球反弹与速度回归 */
    if (B.pveOn && B.pve && B.pve.manual && f === B.pve.player) {
      const inp = B.pve.input || { x: 0, y: 0 };
      const mag = Math.hypot(inp.x, inp.y);
      const slowK = f.slowT > 0 ? (f.slowMul != null ? f.slowMul : .5) : 1;
      const awkK = (B.pve.awakenT || 0) > 0 ? 1.2 : 1;
      const sp = f.speedBase * slowK * awkK;
      if (mag > 0.05) {
        const k = Math.min(1, mag);
        f.vx = inp.x / mag * sp * k;
        f.vy = inp.y / mag * sp * k;
        if (Math.abs(f.vx) > 2) f.facing = f.vx > 0 ? 1 : -1;
      } else {
        f.vx *= Math.pow(0.0005, dt);
        f.vy *= Math.pow(0.0005, dt);
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const pf = B.field;
      f.x = U.clamp(f.x, pf.x + f.r, pf.x + pf.w - f.r);
      f.y = U.clamp(f.y, pf.y + f.r, pf.y + pf.h - f.r);
      return;
    }

    /* 嘲讽：原地左右小幅抖动 */
    if (f.tauntT > 0) {
      f.tauntT -= dt;
      f.tauntPhase = (f.tauntPhase || 0) + dt;
      f.x = f.tauntX + Math.sin(f.tauntPhase * 42) * 3.6;
      f.y = f.tauntY;
      f.vx = 0; f.vy = 0;
      return;
    }

    /* G·诺伦 爆炸定身：位置完全锁死 */
    if (f.rootT > 0) {
      f.rootT -= dt;
      f.vx = 0; f.vy = 0;
      if (f.rootX != null) { f.x = f.rootX; f.y = f.rootY; }
      if (f.rootT <= 0) { f.rootT = 0; f.rootX = null; f.rootY = null; }
      return;
    }

    /* 天剑穿梭：位置由技能接管，无物理判定 */
    if (f.noCollide) {
      if (f.cast && f.cast.type === 'phase') return;
      f.noCollide = false;   /* 兜底：技能异常结束时恢复碰撞 */
    }
    /* 站桩类状态 */
    if (f.bastion) { f.vx = 0; f.vy = 0; return; }
    if (f.bite) { f.vx = 0; f.vy = 0; return; }
    /* 狙击蓄力：站桩（觉醒免蓄力时只剩一帧，几乎不影响机动） */
    if (f.snipe) { f.vx = 0; f.vy = 0; return; }
    if (f.iaidoCast || f.parryCast || (f.cast && f.cast.type === 'laser_cast')) {
      f.vx = 0; f.vy = 0;
      return;
    }
    /* 冲锋自行处理位移 */
    if (f.chargeState) return;

    /* 引狱：间歇牵引。每 holeTugEvery 秒拽一下（持续 holeTugTime），
       其余时间是「缓释」——惯性迅速衰减、人顿在原地，对手有机会借这个空档重新拉开 */
    if (B.hole && B.hole.owner === f && B.hole.t < B.hole.total && !f.iaidoCast && !f.chargeState) {
      const hh = B.hole;
      const hp = f.char.skill.params;
      const every = Math.max(.4, hp.holeTugEvery != null ? hp.holeTugEvery : 1.25);
      const tugT = Math.max(.12, hp.holeTugTime != null ? hp.holeTugTime : .34);
      const phase = (hh.t + (f.holePhase || 0)) % every;
      if (phase < tugT) {
        const dd = Math.hypot(hh.x - f.x, hh.y - f.y) || 1;
        const stop = 46 * B.scale();   /* 停在中心外一点，贴住而不重叠 */
        const spd = Math.min((hp.holeApproach != null ? hp.holeApproach : 250) * B.scale(),
          Math.max(0, dd - stop) * 2.4);
        f.vx = (hh.x - f.x) / dd * spd;
        f.vy = (hh.y - f.y) / dd * spd;
        if (dd > stop) { f.x += f.vx * dt; f.y += f.vy * dt; }
        const fl2 = B.field;
        f.x = U.clamp(f.x, fl2.x + f.r, fl2.x + fl2.w - f.r);
        f.y = U.clamp(f.y, fl2.y + f.r, fl2.y + fl2.h - f.r);
        if (Math.abs(f.vx) > 2) f.facing = f.vx > 0 ? 1 : -1;
        return;
      }
      /* 缓释：被吸住后顿住，速度几乎立刻泄掉 */
      f.vx *= Math.pow(.06, dt);
      f.vy *= Math.pow(.06, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const fl3 = B.field;
      f.x = U.clamp(f.x, fl3.x + f.r, fl3.x + fl3.w - f.r);
      f.y = U.clamp(f.y, fl3.y + f.r, fl3.y + fl3.h - f.r);
      return;
    }

    /* 麻痹：几乎停住 */
    if (f.stun > 0) {
      f.vx *= Math.pow(0.02, dt);
      f.vy *= Math.pow(0.02, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      return;
    }

    /* 速度大小回归基准，方向完全由物理决定（被咬时按减速系数下调） */
    const sp = Math.hypot(f.vx, f.vy);
    const slowK = f.slowT > 0 ? (f.slowMul != null ? f.slowMul : .5) : 1;
    /* 胧雷-影：红色觉醒额外提速（配合周期性突进贴身） */
    const shadowSpd = (f.char.awaken.type === 'shadow_awaken' && f.awaken > 0)
      ? ((f.char.awaken.params && f.char.awaken.params.speedMul) || 1) : 1;
    const target = f.speedBase * (f.awaken > 0 ? 1.15 : 1) * shadowSpd * slowK;
    if (sp > 4) {
      const k = 1 + (target - sp) / sp * Math.min(0.6, dt * 1.5);
      f.vx *= k; f.vy *= k;
    } else {
      const a = U.rand(0, Math.PI * 2);
      f.vx = Math.cos(a) * target;
      f.vy = Math.sin(a) * target;
    }

    f.x += f.vx * dt;
    f.y += f.vy * dt;

    /* 墙壁镜面反射 */
    const fl = B.field;
    let bounced = false;
    if (f.x < fl.x + f.r) { f.x = fl.x + f.r; f.vx = Math.abs(f.vx); bounced = true; }
    else if (f.x > fl.x + fl.w - f.r) { f.x = fl.x + fl.w - f.r; f.vx = -Math.abs(f.vx); bounced = true; }
    if (f.y < fl.y + f.r) { f.y = fl.y + f.r; f.vy = Math.abs(f.vy); bounced = true; }
    else if (f.y > fl.y + fl.h - f.r) { f.y = fl.y + fl.h - f.r; f.vy = -Math.abs(f.vy); bounced = true; }

    if (bounced) {
      Fx.burst(f.x, f.y, 4, f.char.color, 110, 2, 0.22);
      B.shake = Math.max(B.shake, 1.4);
    }

    if (Math.abs(f.vx) > 2) f.facing = f.vx > 0 ? 1 : -1;
  }

  /* 两球弹性碰撞 */
  function bounceBalls(a, b) {
    if (!alive(a) || !alive(b)) return;
    if (a.bite || b.bite) return;
    if (a.invuln > 0 || b.invuln > 0) return;
    if (a.noCollide || b.noCollide) return;
    if (a.stun > 0 || b.stun > 0) return;
    if (a.chargeState || b.chargeState) return;

    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const minD = a.r + b.r;
    if (d >= minD) return;

    const nx = dx / d, ny = dy / d;
    const overlap = (minD - d) * 0.5 + 0.6 * B.scale();
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;

    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn > 0) return;

    const m1 = Math.max(1, a.r * a.r);
    const m2 = Math.max(1, b.r * b.r);
    const j = -2 * vn / (1 / m1 + 1 / m2);
    a.vx -= j * nx / m1; a.vy -= j * ny / m1;
    b.vx += j * nx / m2; b.vy += j * ny / m2;

    Fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 9, '#dff0ff', 190, 2.6, 0.28);
    Fx.ring((a.x + b.x) / 2, (a.y + b.y) / 2, 'rgba(200,235,255,.7)', 4, a.r + b.r, 0.28);
    B.shake = Math.max(B.shake, 5);
  }

  /* 计时器统一推进（咬合等锁定状态下也要照常走） */
  function tickTimers(f, dt) {
    f.skillCd -= dt;
    if (f.counterCd > 0) f.counterCd = Math.max(0, f.counterCd - dt);
    if (f.packCd > 0) f.packCd = Math.max(0, f.packCd - dt);
    f.contactCd -= dt;
    f.flash = Math.max(0, f.flash - dt * 2.6);
    f.hitDelay = Math.max(0, f.hitDelay - dt);
    if (f.stun > 0) f.stun -= dt;
    if (f.invuln > 0) f.invuln -= dt;
    if (f.slowT > 0) f.slowT -= dt;
  }

  function aiUpdate(f, dt) {
    const e = enemyOf(f);
    if (!alive(f)) return;
    /* 咬合中：位移由技能接管，只推进计时 */
    if (f.bite) { tickTimers(f, dt); return; }
    if (!alive(e)) return;
    if (f.tauntT > 0) return;

    /* ---- 圣十字庇护站桩 ---- */
    if (f.bastion) {
      f.bastion.t -= dt;
      if (f.bastion.t <= 0) {
        const b = f.bastion;
        f.bastion = null;
        f.hp = Math.min(f.maxHp, f.hp + b.heal);
        Fx.text(f.x, f.y - f.r - 34, '+' + b.heal, '#7dffb0', 20);
        Fx.ring(f.x, f.y, 'rgba(140,255,190,.9)', f.r, f.r * 3.6, 0.6);
        B.log(f.char.short + ' 恢复 ' + b.heal, '#7dffb0');
        A.win();
      }
      return;
    }

    /* ---- 纳刀读条（优先处理，不受硬直影响） ---- */
    if (f.iaidoCast) {
      const c = f.iaidoCast;

      /* 穿身阶段 */
      if (c.dashT < c.dashDur) {
        c.dashT += dt;
        const k = Math.min(1, c.dashT / c.dashDur);
        const ease = 1 - Math.pow(1 - k, 3);
        f.x = U.lerp(c.fromX, c.toX, ease);
        f.y = U.lerp(c.fromY, c.toY, ease);
        f.trail.push({ x: f.x, y: f.y, life: 0.28, color: '#ff5c6e' });
        if (f.trail.length > 26) f.trail.shift();
        if (!c.passed && k > 0.5) {
          c.passed = true;
          Fx.slash(c.fromX, c.fromY, c.toX, c.toY, 'rgba(255,255,255,.95)', 0.26);
          Fx.burst(f.x, f.y, 8, '#ffd0d6', 200, 3, 0.3);
        }
        if (c.dashT >= c.dashDur) {
          f.x = c.toX; f.y = c.toY;
        }
        return;
      }

      c.t += dt;
      c.fx = (c.fx || 0) + dt;
      if (c.fx > 0.055) {
        c.fx = 0;
        const a = Math.random() * Math.PI * 2;
        const R = f.r * U.rand(2.2, 3.2);
        Fx.parts.push({
          x: f.x + Math.cos(a) * R, y: f.y + Math.sin(a) * R,
          vx: -Math.cos(a) * R * 3.2, vy: -Math.sin(a) * R * 3.2,
          life: 0.26, max: 0.26, color: Math.random() < 0.35 ? '#ffffff' : '#ffd166',
          size: U.rand(1.6, 2.8), drag: 0,
        });
      }
      if (c.t >= c.total) completeIaido(f, c);
      return;
    }

    /* ---- 招架站桩 ---- */
    if (f.parryCast) {
      f.parryCast.t += dt;
      if (f.parryCast.t >= f.parryCast.total) {
        f.parryCast = null;
        B.traceAdd('parry-expire', {
          who: f.char.short,
          dist: Math.round(Math.hypot(e.x - f.x, e.y - f.y)), foeState: dstState(e),
        });
        B.log(f.char.short + ' 阴阳流・刹那 落空', '#ff8b96');
      }
      return;
    }

    /* ---- 招架一闪结算 ---- */
    if (f.parryStrike) {
      f.parryStrike.t -= dt;
      if (f.parryStrike.t <= 0) resolveParryStrike(f, 'normal');
    }

    if (f.stun > 0 || f.invuln > 0 || hardLocked(f)) return;
    if (f.cast && (f.cast.type === 'laser_cast' || f.cast.type === 'phase')) return;

    const dx = e.x - f.x, dy = e.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;

    /* 觉醒：50% 即可开。天剑偏向残血开，其余角色够 50% 就开 */
    if (canAwaken(f)) {
      f.awakFullT = (f.awakFullT || 0) + dt;
      const isSaber = f.char.awaken.type === 'skysaber_awaken';
      const lowHp = f.hp <= 600;
      const canRespawn = f.costPool > f.char.cost;
      if (isSaber) {
        if (lowHp || f.awakFullT > 3.0) { f.awakFullT = 0; doAwaken(f); }
      } else if (f.char.awaken.type === 'vamp_awaken' && f.hp > f.maxHp * .7) {
        /* 吸血鬼小修女：血线还高时不开觉醒，等掉到 70% 以下再展开血域 */
        f.awakFullT = 0;
      } else if (lowHp && canRespawn) {
        /* 残血但还有复活：把觉醒留到复活后 */
      } else if (f.awakFullT > 0.5) {
        f.awakFullT = 0;
        doAwaken(f);
      }
    } else {
      f.awakFullT = 0;
    }

    /* 秋云刹那：预判敌人即将接触时提前架起 */
    if (canInstantParry(f) && !f.iaidoCast) {
      const dd = Math.hypot(e.x - f.x, e.y - f.y);
      const nx = (e.x - f.x) / (dd || 1), ny = (e.y - f.y) / (dd || 1);
      const closing = -((e.vx - f.vx) * nx + (e.vy - f.vy) * ny);   /* 接近速度 */

      /* 预计多久撞上：留 0.45 秒提前量才架盾 */
      const gap = dd - (f.r + e.r);
      const eta = gap / Math.max(1, closing);

      /* 面对旋转剑类武器：只要进入扫掠半径就提前架，靠反应硬挡 */
      const sw = e.char.sword;
      const swordReach = sw ? (e.r * 0.9 + e.r * (sw.length || 3) + f.r) : 0;
      if (sw && dd < swordReach + 10 * B.scale()) {
        startParry(f);
      } else if (closing > 70 * B.scale() && gap > 0 && eta < 1.05) {
        startParry(f);
      }
    }

    /* 破破烂烂-秋云：三层残心 → 场地中心黑洞（任意距离，靠黑洞把敌人拉过来） */
    if (f.char.skill.type === 'akigumo_broken' &&
        f.reshin >= (f.char.skill.params.reshinMax || 3) &&
        !B.hole && !f.chargeState && !hardLocked(f) && !f.cast) {
      startBlackHole(f);
      return;
    }

    /* 秋云三层残心 → 阴阳流・星落（近距离发动） */
    if (f.char.skill.type === 'akigumo_iaido' &&
        f.reshin >= (f.char.skill.params.reshinMax || 3) &&
        !f.chargeState && d < (f.char.skill.params.chargeRange || 240) * B.scale() && !f.cast) {
      startCharge(f);
      return;
    }

    /* 冲锋 */
    if (f.chargeState) {
      const c = f.chargeState;
      if (c.generic) {
        /* 通用突进：直接冲 */
        c.t += dt;
        f.x += c.vx * dt; f.y += c.vy * dt;
        f.trail.push({ x: f.x, y: f.y, life: 0.3, color: f.char.accent });
        if (!c.hit && d < e.r + f.r + 10 * B.scale()) {
          c.hit = true;
          B.damage(f, e, c.damage, 'melee', { big: true });
        }
        if (c.t >= c.total || c.hit) f.chargeState = null;
        return;
      }

      /* 阴阳流・星落：原地瞄准 0.5 秒 → 朝目标 0.5 秒前的位置冲刺 */
      c.t += dt;
      if (c.phase === 'aim') {
        f.vx = 0; f.vy = 0;
        c.lockFx = (c.lockFx || 0) + dt;
        if (c.lockFx > 0.09) {
          c.lockFx = 0;
          Fx.ring(c.tx, c.ty, 'rgba(255,59,82,.8)', 3, 14 + Math.random() * 10, 0.3);
        }
        if (c.t >= c.aimTotal) {
          c.phase = 'dash';
          c.t = 0;
          const a = Math.atan2(c.ty - f.y, c.tx - f.x);
          c.vx = Math.cos(a) * c.spd;
          c.vy = Math.sin(a) * c.spd;
          Fx.slash(f.x, f.y, c.tx, c.ty, 'rgba(255,59,82,.45)', 0.22);
          Fx.text(f.x, f.y - f.r - 30, '星落', '#ff5c6e', 15);
          A.crit();
        }
      } else {
        f.x += c.vx * dt; f.y += c.vy * dt;
        f.trail.push({ x: f.x, y: f.y, life: 0.3, color: f.char.accent });
        if (!c.hit && d < e.r + f.r + 10 * B.scale()) {
          c.hit = true;
          B.damage(f, e, (f.char.skill.params.chargeDamage || 1000), 'melee', { big: true, noAwakenBonus: true, tag: '冲锋' });
          const a2 = Math.atan2(e.y - f.y, e.x - f.x);
          e.vx += Math.cos(a2) * 420 * B.scale();
          e.vy += Math.sin(a2) * 420 * B.scale();
          f.vx = -Math.cos(a2) * 360 * B.scale();
          f.vy = -Math.sin(a2) * 360 * B.scale();
          Fx.ring(f.x, f.y, '#ffd166', f.r, f.r * 3, 0.4);
          B.shake = 13;
        }
        const arrived = U.dist(f.x, f.y, c.tx, c.ty) < f.r * 0.9;
        if (c.t >= c.dashTotal || c.hit || arrived) {
          if (!c.hit) { f.vx *= 0.3; f.vy *= 0.3; }   /* 星落落空，轻微减速 */
          f.chargeState = null;
        }
      }
      return;
    }

    /* 技能释放 */
    if (f.skillCd <= 0) {
      const st = f.char.skill.type;
      if (st === 'skysaber_combo') {
        if (d < 520 * B.scale() && !f.cast) castSkysaber(f);
      } else if (st === 'rhine_evo') {
        /* 莱茵射击单独处理 */
      } else if (st === 'generic_burst' || st === 'krista_shot') {
        if (d < 460 * B.scale()) castGenericBurst(f);
      } else if (st === 'vamp_bite') {
        /* 咬合只在接触判定里触发，此处不主动飞扑 */
      } else if (st === 'mimi_pack') {
        /* 携带背包且冷却就绪 → 直接丢包，撤离交给投掷后坐力 */
        if (f.form === 'heavy' && f.hasPack && (f.packCd || 0) <= 0 && alive(e)) throwPack(f, e);
      } else if (st === 'generic_dash') {
        if (d > 90 && d < (f.char.skill.params.range || 320)) castGenericDash(f);
      } else if (st === 'snowowl_snipe') {
        /* 狙击需要拉开距离：贴脸时不开枪，只能靠弹球脱离；觉醒期间没有盲区 */
        const near = f.awaken > 0 ? 0
          : (f.char.skill.params.minRange != null ? f.char.skill.params.minRange : 190) * B.scale();
        if (!f.snipe && d > near && d < (f.char.skill.params.range || 900) * B.scale()) castSnipe(f, e);
      } else if (st === 'shadow_dash') {
        /* 影袭：贴身后突进留分身，满三个自动乱刃 */
        if (!f.shadowDash && !f.shadowBurst && !f.cast && d < 480 * B.scale()) castShadowDash(f, e);
      }
    }

  }

  /* ============================ 角色专属更新 ============================ */
  /* 觉醒计时：对手等待复活期间同样照常衰减 */
  function tickAwaken(f, dt) {
    if (f.awaken <= 0) return;
    f.awaken -= dt;
    if (f.awaken <= 0) {
      f.awaken = 0;
      f.superEvo = false;
      f.phaseReady = false;
      f.burst = null;
      f.shadowBurst = null;
      f.shadowClones = [];
      f.shadowDash = null;
      f.shadowVolleyT = 0;
      /* 觉醒结束时若一闪尚未结算：立即补结算，绝不吞伤害 */
      if (f.parryStrike) resolveParryStrike(f, 'awakenEnd');
      f.parryStrike = null;
      /* 正常结束返还 25 进化（觉醒落不返还） */
      if (f.char.skill.type === 'rhine_evo' && !f.diedAwaken) addEvo(f, 25);
      Fx.text(f.x, f.y - f.r - 30, '觉醒结束', '#8fa8c8', 12);
      /* 自然结束不做大字播报：只有觉醒期间阵亡才播报「觉醒落」 */
    }
  }

  function charUpdate(f, dt) {
    const e = enemyOf(f);
    tickAwaken(f, dt);

    /* 破破烂烂-秋云：被动召唤修罗丸 / 黑洞锁身 / 一刀演出 */
    if (f.char.skill.type === 'akigumo_broken') tickShura(f, dt);
    if (f.shuraAwakeT > 0) {
      f.shuraAwakeT -= dt;
      if (f.shuraAwakeT <= 0) startShuraAwaken(f);
    }
    if (f.shuraSlash) tickShuraSlash(f, dt);

    /* 觉醒・血月圣域：范围内持续吸取（咬合期间照常生效） */
    if (f.char.awaken.type === 'vamp_awaken' && f.awaken > 0) updateBloodField(f, dt);

    /* 觉醒・青冰：每 4 秒补充一个 G·诺伦 */
    if (f.char.awaken.type === 'mimi_awaken' && f.awaken > 0) {
      f.packT = (f.packT === undefined ? (f.char.awaken.params.packEvery || 4) : f.packT) - dt;
      if (f.packT <= 0) {
        f.packT = f.char.awaken.params.packEvery || 4;
        gainPack(f, true);
      }
    }

    /* 吸血：位移与结算由技能接管 */
    if (f.bite) { updateBite(f, dt); return; }

    /* 雪鸮狙击：蓄力推进 / 硬控打断 / 觉醒四连发后续 */
    if (f.snipe) tickSnipe(f, dt);
    if (f.burst) tickBurst(f, dt);

    /* 胧雷-影：分身维持 / 突进 / 觉醒爆发 */
    if (f.char.skill.type === 'shadow_dash') {
      tickShadowClones(f, dt);
      if (f.shadowDash) tickShadowDash(f, dt);
      if (f.shadowBurst) tickShadowBurst(f, dt);
      if (f.shadowVolleyT > 0) {
        f.shadowVolleyT -= dt;
        if (f.shadowVolleyT <= 0) {
          f.shadowVolleyT = 0;
          const ee = enemyOf(f);
          if (alive(ee) && shadowClonesOf(f).length) shadowVolley(f, ee);
        }
      }
    }
    if (f.char.awaken.type === 'shadow_awaken' && f.awaken > 0 && !hardLocked(f)) {
      tickShadowAwaken(f, e, dt);
    }

    if (!alive(e)) return;

    /* 对吸血类攻击：咬合期间按住刀，收口后再补 */
    tickBiteCounter(f, e, dt);

    /* 天剑觉醒穿梭判定 */
    if (f.cast && f.cast.type === 'phase') updatePhaseDash(f, dt);

    /* 定身（G·诺伦 爆炸 / 照射麻痹）期间不能再发动任何技能；
       已经在引导中的照射不打断，让它自然打完 */
    if (hardLocked(f)) {
      if (f.char.skill && f.char.skill.type === 'rhine_evo') tickRhineLaser(f, dt);
      f.missileT = 0;
      tickTimers(f, dt);
      return;
    }

    /* 克丽丝塔大剑 */
    updateSword(f, e, dt);

    /* 莱茵自动射击 */
    if (f.char.skill.type === 'rhine_evo' && alive(f) && !f.dead) {
      const p = f.char.skill.params;
      const cdRate = f.awaken > 0 ? 3 : 1;   /* 觉醒期间其他武装冷却 1/3 */
      f.fireCd -= dt;
      /* 照射（前奏曲）站桩期间不再发射光枪，避免觉醒爆发过高 */
      const castingLaser = !!f.laserCast || (f.cast && f.cast.type === 'laser_cast');
      if (f.fireCd <= 0 && f.iaidoCast == null && !castingLaser) {
        const lvl = effectiveEvo(f);
        /* 觉醒期间魔龙的咆哮近乎无冷却 */
        f.fireCd = f.awaken > 0 ? 0.3 : (lvl >= 1 ? (p.intervalEvo || 3) : (p.interval || 4.5));
        B.shootBeam(f, p.shotDamage, {
          color: '#3fa9ff', len: 92 * B.scale(), wid: 18 * B.scale(),
          speed: (p.shotSpeed || 430) * B.scale(),
          homing: false, logName: '魔龙的咆哮', onHit: rhineOnHit,
        });
        addEvo(f, p.evoPerShot);
      } else if (f.fireCd <= 0 && castingLaser) {
        /* 站桩期间不消耗冷却，照射结束后立刻可发射 */
        f.fireCd = 0.12;
      }
      /* 激光 */
      f.laserCd -= dt * cdRate;
      if (effectiveEvo(f) >= 2 && f.laserCd <= 0 && !f.laserCast && !f.cast) {
        const d = U.dist(f.x, f.y, e.x, e.y);
        if (d < 720 * B.scale()) castLaser(f);
      }
      if (f.laserCast) tickRhineLaser(f, dt);
      else if (f.cast && f.cast.type === 'laser_cast') f.cast = null;

      /* 魔龙的爪牙·浮游导弹 */
      f.missileCd = (f.missileCd === undefined ? 5 : f.missileCd) - dt * cdRate;
      if (f.missileCd <= 0) {
        f.missileCd = p.missileCd || 5;
        f.missileT = p.missileDuration || 5;
        B.log(f.char.short + ' 魔龙的爪牙', '#3fa9ff');
      }
      if (f.missileT > 0) {
        f.missileT -= dt;
        f.missileAcc = (f.missileAcc || 0) + dt * (p.missileRate || 3);
        while (f.missileAcc >= 1) {
          f.missileAcc -= 1;
          B.shootMissile(f);
        }
      }
    }

    /* 向敌冲量：天剑仅在觉醒期，秋云常驻 */
    const atype = f.char.awaken.type;
    const ap = f.char.awaken.params || {};
    const saberPush = (atype === 'skysaber_awaken' && f.awaken > 0);
    const kristaPush = (atype === 'krista_awaken' && f.awaken > 0);
    const akigumoPush = (atype === 'akigumo_awaken');
    const vampPush = (atype === 'vamp_awaken' && f.awaken > 0);
    if ((saberPush || kristaPush || akigumoPush || vampPush) && alive(e)) {
      const every = ap.pushEvery || 5;
      f.pushT = (f.pushT === undefined ? every : f.pushT) - dt;
      if (f.pushT <= 0) {
        f.pushT = every;
        const a = Math.atan2(e.y - f.y, e.x - f.x);
        const push = (f.speedBase || 180) * (ap.pushMul != null ? ap.pushMul : 1.75);
        if (vampPush) {
          /* 红色觉醒：动量直接指向敌人，每 5 秒一次明显贴身 */
          const mag = Math.max(Math.hypot(f.vx, f.vy), push);
          f.vx = Math.cos(a) * mag;
          f.vy = Math.sin(a) * mag;
        } else {
          f.vx += Math.cos(a) * push;
          f.vy += Math.sin(a) * push;
        }
        const col = f.awaken > 0 ? (f.char.awakenColor || '#ff5c6e') : '#ffd166';
        Fx.slash(f.x, f.y, f.x + Math.cos(a) * 90, f.y + Math.sin(a) * 90, col, 0.3);
        Fx.burst(f.x, f.y, 12, col, 260, 3.2, 0.42);
        Fx.ring(f.x, f.y, col, f.r * 0.6, f.r * 2.4, 0.4);
        A.awaken();
      }
    } else {
      f.pushT = ap.pushEvery || 5;
    }

    /* 各类 CD */
    tickTimers(f, dt);
  }

  function rhineOnHit(p, victim) {
    const f = p.owner;
    if (!f || !alive(f)) return;
    const pcfg = f.char.skill.params;
    if (!victim || !alive(victim)) return;
    addEvo(f, pcfg.evoPerHit);

    const lvl = effectiveEvo(f);
    if (lvl >= 1) {
      const radius = (pcfg.boomRadius || 0.5) * (B.scale() * 60) * 2;
      explodeFor(f, victim.x, victim.y, radius, pcfg.boomDamage, p.kind === 'laser');
    }
  }

  function explodeFor(f, x, y, radius, dmg, fromLaser) {
    if (!f) return;
    const e = enemyOf(f);
    /* 视觉：残留 2 秒的爆炸云，伤害只结算一次 */
    Fx.boom(x, y, radius, '#3ea8ff', 2.0);
    Fx.burst(x, y, 14, '#b0e0ff', 300, 3.6, 0.55);
    B.shake = Math.max(B.shake, 6);
    if (alive(e) && U.dist(x, y, e.x, e.y) < radius + e.r) {
      let real = dmg;
      if (fromLaser && f.laserBudget !== undefined) {
        real = Math.min(dmg, Math.max(0, f.laserBudget));
        f.laserBudget -= real;
      }
      if (real > 0) B.damage(f, e, real, 'shot', { big: fromLaser, tag: '爆炸' });
    }
    /* 觉醒：照射命中点巨大爆炸 */
    const cfg = f.char.awaken;
    if (fromLaser && cfg.type === 'rhine_awaken' && f.awaken > 0) {
      const r2 = (cfg.params.boomRadius || 1) * B.scale() * 60 * 2;
      Fx.boom(x, y, r2, '#3ea8ff', 2.2);
      Fx.burst(x, y, 26, '#ffe6a0', 440, 5, 0.7);
      B.shake = Math.max(B.shake, 12);
      if (alive(e) && U.dist(x, y, e.x, e.y) < r2 + e.r) {
        let real = cfg.params.boomDamage || 200;
        if (f.laserBudget !== undefined) {
          real = Math.min(real, Math.max(0, f.laserBudget));
          f.laserBudget -= real;
        }
        if (real > 0) B.damage(f, e, real, 'shot', { big: true, tag: '爆炸' });
      }
    }
  }

  /* ============================ 投射物更新 ============================ */
  function updateProjectiles(dt) {
    const list = B.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (!p) continue;   /* 列表可能在本帧被清空 */

      /* 圣十字庇护：挡下敌方投射物 */
      let blocked = false;
      for (const g of B.fighters) {
        if (!g.bastion || p.owner === g) continue;
        const R = g.r * 2.6;
        if (U.dist(p.x, p.y, g.x, g.y) < R + (p.wid || 4) * 0.5) {
          Fx.burst(p.x, p.y, 7, '#ffd166', 180, 2.6, 0.3);
          Fx.ring(p.x, p.y, 'rgba(255,220,140,.8)', 2, 14, 0.25);
          blocked = true;
          break;
        }
      }
      /* 修罗丸：半透明守护灵挡下来袭弹幕（照射无法格挡） */
      if (!blocked && !p.laser) {
        for (const g of B.fighters) {
          if (!g.shura || p.owner === g || (p.kind === 'laser')) continue;
          const gr = g.shura.r + (p.wid || 4) * 0.5;
          if (U.dist(p.x, p.y, g.shura.x, g.shura.y) < gr) {
            Fx.burst(p.x, p.y, 8, '#7fb2ff', 210, 2.8, 0.3);
            Fx.ring(p.x, p.y, 'rgba(120,170,255,.85)', 2, 16, 0.26);
            g.shura.blocks = (g.shura.blocks || 0) + 1;
            g.shuraBlocks = (g.shuraBlocks || 0) + 1;
            g.shura.flash = 0.16;
            /* 修罗丸有耐久：挡满 guardMax 发就碎，连射能打穿，不是绝对免疫 */
            const gmax = g.char.skill.params && g.char.skill.params.guardMax != null
              ? g.char.skill.params.guardMax : 3;
            if (g.shura.blocks >= gmax) {
              Fx.burst(g.shura.x, g.shura.y, 22, '#8fb8ff', 340, 3.6, 0.5);
              Fx.ring(g.shura.x, g.shura.y, 'rgba(150,195,255,.9)', 6, g.shura.r * 3.2, 0.5);
              Fx.text(g.shura.x, g.shura.y - g.shura.r - 16, '止水破碎', '#9dc0ff', 13);
              const gp = g.char.skill.params || {};
              g.shura = null;
              g.shuraCd = gp.guardEvery != null ? gp.guardEvery : 8;
            }
            blocked = true;
            break;
          }
        }
      }
      if (blocked) { list.splice(i, 1); continue; }

      const e = p.owner ? enemyOf(p.owner) : null;

      if (p.laser) {
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        const ex = p.x + Math.cos(p.angle) * p.len;
        const ey = p.y + Math.sin(p.angle) * p.len;
        const inBeam = alive(e) && e.invuln <= 0 &&
          U.segCircle(p.x, p.y, ex, ey, e.x, e.y, e.r + p.wid * 0.5);

        if (inBeam) {
          /* 星落冲锋期间免疫射击（含照射麻痹） */
          const immune = e.chargeState && e.chargeState.immuneShot;
          if (!immune) {
            e.stun = Math.max(e.stun, 0.22);
            e.laserLockUntil = B.time + 0.25;
          }

          /* 累积伤害，受单次照射总预算限制 */
          p.acc = (p.acc || 0) + p.dmg * dt;
          if (p.acc >= 20) {
            let d = Math.floor(p.acc);
            p.acc -= d;
            const ow = p.owner;
            if (ow && ow.laserBudget !== undefined) {
              d = Math.min(d, Math.max(0, ow.laserBudget));
              ow.laserBudget -= d;
            }
            if (d > 0) B.damage(p.owner, e, d, 'shot', { silent: true });
          }
          p.vfx = (p.vfx || 0) + dt;
          if (p.vfx > 0.1) {
            p.vfx = 0;
            Fx.burst(e.x + U.rand(-8, 8), e.y + U.rand(-8, 8), 2, '#5cb8ff', 150, 2.2, 0.22);
            B.shake = Math.max(B.shake, 1.8);
          }
          /* 爆炸按施法者共享冷却，避免多条光柱各自引爆 */
          if (p.owner) {
            p.owner.laserBoomCd = (p.owner.laserBoomCd || 0) - dt;
            if (p.owner.laserBoomCd <= 0 && effectiveEvo(p.owner) >= 1) {
              p.owner.laserBoomCd = 0.62;
              const cfg = p.owner.char.skill.params;
              const r = (cfg.boomRadius || 0.5) * B.scale() * 60 * 2;
              explodeFor(p.owner, e.x, e.y, r, cfg.boomDamage, true);
            }
          }
        }
        continue;
      }

      p.px = p.x; p.py = p.y;

      /* 诱导转向 */
      if (p.homing && p.target && alive(p.target) && !p.lockX) {
        const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        let cur = p.angle;
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = p.homing * dt;
        cur += U.clamp(diff, -maxTurn, maxTurn);
        p.angle = cur;
        const spd = p.speed || Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(cur) * spd;
        p.vy = Math.sin(cur) * spd;
      } else if (p.lockX != null) {
        /* 切诱导：飞向锁定点 */
        const want = Math.atan2(p.lockY - p.y, p.lockX - p.x);
        p.angle = want;
        const spd = p.speed || Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(want) * spd;
        p.vy = Math.sin(want) * spd;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.age = (p.age || 0) + dt;

      /* 出界 */
      const fl = B.field, pad = 70;
      if (p.x < fl.x - pad || p.x > fl.x + fl.w + pad ||
          p.y < fl.y - pad || p.y > fl.y + fl.h + pad) {
        list.splice(i, 1); continue;
      }
      if (p.life <= 0) { list.splice(i, 1); continue; }

      /* 命中 —— PvE 走逐怪判定，1v1 保持原样的单目标判定 */
      if (B.pveOn) {
        const cands = targetList(p.owner);
        let gone = false;
        for (const t of cands) {
          if (!alive(t) || t.invuln > 0 || p.hitSet.has(t)) continue;
          const rr = t.r + (p.wid || 6) * 0.5;
          if (!U.segCircle(p.px, p.py, p.x, p.y, t.x, t.y, rr)) continue;
          p.hitSet.add(t);
          const immune = t.chargeState && t.chargeState.immuneShot;
          B.damage(p.owner, t, p.dmg, 'shot', { big: p.kind === 'blade' || p.snipe, tag: p.tag });
          if (p.paralyze && !immune) {
            t.stun = Math.max(t.stun, p.paralyze);
            Fx.text(t.x, t.y - t.r - 24, '麻痹', '#c9a4ff', 14);
            Fx.burst(t.x, t.y, 14, '#b98bff', 200, 3, 0.5);
          }
          if (p.onHit) p.onHit(p, t);
          if (!p.pierce) { gone = true; break; }
        }
        if (gone) { list.splice(i, 1); continue; }
      } else if (alive(e) && e.invuln <= 0 && !p.hitSet.has(e)) {
        const rr = e.r + (p.wid || 6) * 0.5;
        if (U.segCircle(p.px, p.py, p.x, p.y, e.x, e.y, rr)) {
          p.hitSet.add(e);
          const immune = e.chargeState && e.chargeState.immuneShot;
          B.damage(p.owner, e, p.dmg, 'shot', { big: p.kind === 'blade' || p.snipe, tag: p.tag });
          if (p.paralyze && !immune) {
            e.stun = Math.max(e.stun, p.paralyze);
            Fx.text(e.x, e.y - e.r - 24, '麻痹', '#c9a4ff', 14);
            Fx.burst(e.x, e.y, 14, '#b98bff', 200, 3, 0.5);
          }
          if (p.onHit) p.onHit(p, e);
          if (!p.pierce) { list.splice(i, 1); continue; }
        }
      }
      /* 撞墙 */
      if (p.x < fl.x || p.x > fl.x + fl.w || p.y < fl.y || p.y > fl.y + fl.h) {
        Fx.burst(p.x, p.y, 5, p.snipe ? '#e6ecf2' : '#9fd8ff', 140, 2, 0.25);
        if (p.onHit) p.onHit(p, null);
        list.splice(i, 1); continue;
      }
    }
  }

  /* ============================ 主更新 ============================ */
  B.update = function (rawDt) {
    const dt0 = Math.min(rawDt, 0.05);
    if (this.state === 'idle') { Fx.update(dt0); return; }
    /* 升级三选一：世界完全冻结（VS 同款），只留 DOM 层响应 */
    if (this.pveOn && this.pve && (this.pve.paused || this.pve.userPause)) return;

    let dt = dt0 * this.speed;

    if (this.state === 'over') {
      this.overT += dt0;
      this.slowmo = U.lerp(this.slowmo, 1, dt0 * 1.6);
      dt = dt0 * this.speed * this.slowmo;
    }

    /* 觉醒演出慢动作：只影响战斗推进，字幕与飘字照常 */
    if (this.slowT > 0) {
      this.slowT -= dt0;
      dt *= this.slowMul || .34;
    }

    this.time += dt;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt0 * 40);
      this.shakeX = U.rand(-1, 1) * this.shake;
      this.shakeY = U.rand(-1, 1) * this.shake;
    } else { this.shakeX = this.shakeY = 0; }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt0 * 2.4);
    if (this.parryFlash > 0) this.parryFlash = Math.max(0, this.parryFlash - dt0 * 0.85);

    /* 技能字幕推进（不受时停/慢动作影响） */
    if (this.cutinFx) {
      this.cutinFx.t += dt0;
      if (this.cutinFx.t >= this.cutinFx.total) this.cutinFx = null;
    }
    for (let i = this.logs.length - 1; i >= 0; i--) {
      this.logs[i].life -= dt0;
      if (this.logs[i].life <= 0) this.logs.splice(i, 1);
    }

    /* 倒计时 */
    if (this.state === 'ready') {
      this.cd -= dt;
      if (this.cd <= 0) { this.state = 'fight'; this.cd = 0; A.ui(); }
      for (const f of this.fighters) f.trail.length = 0;
      Fx.update(dt0);
      return;
    }

    /* 时停 */
    if (this.timeStop) {
      this.timeStop.t -= dt0;
      if (this.timeStop.t <= 0) {
        const owner = this.timeStop.owner;
        this.timeStop = null;
        if (owner && owner.parryStrike == null) { /* 正常结束 */ }
      }
    }
    const frozen = !!this.timeStop;

    for (const f of this.fighters) {
      if (f.dead) {
        f.deathT += dt0;
        if (f.respawnT > 0) {
          f.respawnT -= dt0;
          if (f.respawnT <= 0) respawn(f);
        }
        continue;
      }
      /* PvE 的怪只跑自己的追击逻辑，不进角色状态机 */
      if (f.isMob) {
        if (this.state === 'fight') mobUpdate(f, dt);
        continue;
      }
      if (frozen && this.timeStop && this.timeStop.owner !== f) continue;
      if (this.state !== 'fight') continue;

      /* PvE 玩家：只跑输入位移。1v1 的角色技能机（大剑 / 公文包 / 觉醒）
         交给武器池重新实现，否则会和副武器叠成两套输出，还会跟手动操作抢方向 */
      if (this.pveOn && this.pve && f === this.pve.player) {
        physicsUpdate(f, dt);
        continue;
      }

      charUpdate(f, dt);
      if (this.state !== 'fight') break;
      aiUpdate(f, dt);
      tickCast(f, dt);

      physicsUpdate(f, dt);

      /* 拖尾 */
      f.trailT += dt;
      if (f.trailT > 0.035) {
        f.trailT = 0;
        f.trail.push({ x: f.x, y: f.y, life: 0.3, color: f.awaken > 0 ? (f.char.awakenColor || '#ff5c6e') : f.char.color });
        if (f.trail.length > 20) f.trail.shift();
      }
      for (const t of f.trail) t.life -= dt;
      f.trail = f.trail.filter(t => t.life > 0);
    }

    updateHole(dt);
    tickMines(dt);

    if (!this.pveOn && this.fighters.length === 2) {
      pushFromBastion(this.fighters[0], this.fighters[1]);
      pushFromBastion(this.fighters[1], this.fighters[0]);
    }

    if (this.state === 'fight' && this.pveOn) {
      pveUpdate(dt);
    } else if (this.state === 'fight') {
      const special = contact(this.fighters[0], this.fighters[1]);
      if (!special) bounceBalls(this.fighters[0], this.fighters[1]);

      /* 同一帧内双方 COST 都归零 => 平局 */
      if (this.needCheck) {
        this.needCheck = false;
        const fa = this.fighters[0], fb = this.fighters[1];
        const aOut = fa.dead && fa.costPool <= 0;
        const bOut = fb.dead && fb.costPool <= 0;
        if (aOut && bOut) endBattle(-1);
        else if (aOut) endBattle(1);
        else if (bOut) endBattle(0);
      }

      /* 超时：比剩余 COST，再比血量（数值放大到 180 秒，避免正常对局提前收场） */
      if (this.time > 180) {
        const a = this.fighters[0], b = this.fighters[1];
        let w = -1;
        if (a.costPool !== b.costPool) w = a.costPool > b.costPool ? 0 : 1;
        else if (a.hp !== b.hp) w = a.hp > b.hp ? 0 : 1;
        else w = Math.random() < 0.5 ? 0 : 1;
        endBattle(w);
      }
    }

    if (!frozen) {
      updateProjectiles(dt);
      updatePacks(dt);
      updateZones(dt);
    }

    Fx.update(dt0);

    if (this.state === 'over' && this.overT > 3.6) {
      /* 由 UI 层接管重置 */
      this.overT = 3.6;
    }
  };

  /* 结算数据 */
  B.summary = function () {
    return this.fighters.map(f => ({
      name: f.char.name,
      dealt: Math.round(f.stats.dealt),
      taken: Math.round(f.stats.taken),
      costLeft: Math.max(0, f.costPool),
    }));
  };

  SW.Battle = B;
})(window.SW);
