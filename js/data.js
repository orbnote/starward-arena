/* 星之翼 · 球体竞技场 —— 角色数据 / 存储 / 模板定义 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  /* =========================================================
     技能 / 觉醒 模板定义（供角色工坊动态生成表单）
     field.type: number / text / select / bool
     ========================================================= */
  const SKILL_DEFS = {
    skysaber_combo: {
      name: '腕部光束枪·连射',
      desc: '三连腕部光束枪 → 特殊格斗程序Ⅰ → 再三连，全程可移动',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 10, min: 1, max: 60, step: .5 },
        { key: 'shotDamage', label: '光枪伤害', type: 'number', def: 100, min: 1, max: 3000, step: 10 },
        { key: 'shotCount', label: '光枪发数', type: 'number', def: 6, min: 1, max: 12, step: 1 },
        { key: 'bladeDamage', label: '飞刀伤害', type: 'number', def: 50, min: 1, max: 3000, step: 10 },
        { key: 'bladeSpeed', label: '飞刀弹速', type: 'number', def: 760, min: 100, max: 2000, step: 20 },
        { key: 'bladeWidth', label: '飞刀判宽', type: 'number', def: 11, min: 2, max: 30, step: 1 },
        { key: 'bladeSpread', label: '飞刀散布(度)', type: 'number', def: 0, min: 0, max: 20, step: .5 },
        { key: 'bladeRecoil', label: '飞刀后坐力', type: 'number', def: 320, min: 0, max: 900, step: 10 },
        { key: 'paralyze', label: '麻痹时长(秒)', type: 'number', def: 1.6, min: 0, max: 5, step: .1 },
      ],
    },
    akigumo_iaido: {
      name: '格斗拔刀斩',
      desc: '每次接触触发：瞬移至身后蓄刀，受击打断，成功则重斩并叠残心',
      fields: [
        { key: 'behindUnits', label: '身后身位', type: 'number', def: 2, min: 1, max: 5, step: .5 },
        { key: 'chargeTime', label: '纳刀读条(秒)', type: 'number', def: 1, min: .3, max: 3, step: .1 },
        { key: 'damage', label: '斩击伤害', type: 'number', def: 400, min: 1, max: 4000, step: 20 },
        { key: 'knockback', label: '击退力度', type: 'number', def: 300, min: 0, max: 900, step: 10 },
        { key: 'reshinMax', label: '残心上限', type: 'number', def: 3, min: 1, max: 5, step: 1 },
        { key: 'reshinBonus', label: '每层增伤(%)', type: 'number', def: 12, min: 0, max: 50, step: 1 },
        { key: 'chargeDamage', label: '阴阳流・星落伤害', type: 'number', def: 1000, min: 50, max: 4000, step: 50 },
        { key: 'chargeRange', label: '星落发动距离', type: 'number', def: 240, min: 40, max: 900, step: 10 },
        { key: 'chargeAim', label: '星落瞄准延迟(秒)', type: 'number', def: 0.1, min: 0, max: 2, step: .05 },
        { key: 'chargeDash', label: '星落冲刺时长(秒)', type: 'number', def: 1, min: .1, max: 3, step: .02 },
        { key: 'chargeSpeed', label: '星落冲刺速度', type: 'number', def: 580, min: 80, max: 1500, step: 10 },
      ],
    },
    akigumo_broken: {
      name: '纳刀斩・修罗',
      desc: '保留纳刀斩（瞬移身后蓄刀、受击打断、叠残心）；被动「阴阳流・止水」每 8 秒召唤修罗丸现身 2 秒，挡下一切来袭弹幕；三层残心改为「阴阳流・引狱」，脱手在场地中心展开黑洞，一直持续到自己这条命结束；不定身，只把敌人和自己一起拖向中心，灼烧敌人并强迫近身角斗。常态没有 5 秒一次的靠近动量',
      fields: [
        { key: 'behindUnits', label: '身后身位', type: 'number', def: 2, min: 1, max: 5, step: .5 },
        { key: 'chargeTime', label: '纳刀读条(秒)', type: 'number', def: 1, min: .3, max: 3, step: .1 },
        { key: 'damage', label: '斩击伤害', type: 'number', def: 620, min: 1, max: 4000, step: 20 },
        { key: 'knockback', label: '击退力度', type: 'number', def: 200, min: 0, max: 900, step: 10 },
        { key: 'reshinBonus', label: '每层增伤(%)', type: 'number', def: 12, min: 0, max: 50, step: 1 },
        { key: 'holeCast', label: '黑洞起手(秒)', type: 'number', def: .4, min: .1, max: 2, step: .05 },
        { key: 'holeRadius', label: '黑洞半径(占场比例)', type: 'number', def: 2.6, min: .6, max: 5, step: .1 },
        { key: 'holePull', label: '吸引强度(像素/秒)', type: 'number', def: 220, min: 40, max: 2500, step: 10 },
        { key: 'holeDps', label: '黑洞每秒伤害', type: 'number', def: 70, min: 0, max: 600, step: 10 },
        { key: 'holeApproach', label: '引力靠近速度', type: 'number', def: 300, min: 0, max: 900, step: 10 },
        { key: 'holeTugEvery', label: '牵引间隔(秒)', type: 'number', def: 1.25, min: .3, max: 5, step: .05 },
        { key: 'holeTugTime', label: '牵引时长(秒)', type: 'number', def: .34, min: .1, max: 2, step: .02 },
        { key: 'guardEvery', label: '修罗丸间隔(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'guardTime', label: '修罗丸持续(秒)', type: 'number', def: 2, min: .5, max: 10, step: .1 },
        { key: 'guardRadius', label: '格挡半径(像素)', type: 'number', def: 34, min: 10, max: 90, step: 2 },
        { key: 'guardOffset', label: '身前距离(像素)', type: 'number', def: 52, min: 0, max: 140, step: 4 },
      ],
    },
    rhine_evo: {
      name: '魔龙的咆哮',
      desc: '周期性光束，命中产生爆风；累积进化点解锁前奏曲照射',
      fields: [
        { key: 'interval', label: '射击间隔(秒)', type: 'number', def: 4.5, min: .5, max: 12, step: .1 },
        { key: 'intervalEvo', label: '进化后间隔(秒)', type: 'number', def: 3, min: .3, max: 12, step: .1 },
        { key: 'shotDamage', label: '光枪伤害', type: 'number', def: 300, min: 1, max: 4000, step: 20 },
        { key: 'shotSpeed', label: '光枪弹速', type: 'number', def: 430, min: 100, max: 1500, step: 10 },
        { key: 'evoPerShot', label: '发射得点', type: 'number', def: 10, min: 0, max: 50, step: 1 },
        { key: 'evoPerHit', label: '命中得点', type: 'number', def: 10, min: 0, max: 50, step: 1 },
        { key: 'evoPerLevel', label: '每级所需', type: 'number', def: 100, min: 20, max: 400, step: 10 },
        { key: 'boomDamage', label: '一阶爆伤', type: 'number', def: 100, min: 1, max: 2000, step: 10 },
        { key: 'boomRadius', label: '爆炸半径(身位)', type: 'number', def: .5, min: .2, max: 3, step: .1 },
        { key: 'laserCd', label: '激光冷却(秒)', type: 'number', def: 10, min: 2, max: 40, step: .5 },
        { key: 'laserDps', label: '激光每秒伤害', type: 'number', def: 300, min: 20, max: 2000, step: 20 },
        { key: 'laserCast', label: '激光站桩(秒)', type: 'number', def: 2, min: .5, max: 6, step: .1 },
        { key: 'laserBudget', label: '激光总伤上限', type: 'number', def: 600, min: 100, max: 3000, step: 50 },
        { key: 'missileCd', label: '魔龙的爪牙冷却', type: 'number', def: 10, min: 2, max: 40, step: .5 },
        { key: 'missileDuration', label: '爪牙持续(秒)', type: 'number', def: 5, min: 1, max: 20, step: .5 },
        { key: 'missileRate', label: '爪牙每秒发射', type: 'number', def: 20, min: 1, max: 60, step: 1 },
        { key: 'missileDamage', label: '爪牙单发伤害', type: 'number', def: 1, min: 0, max: 2000, step: 1 },
        { key: 'missileEvo', label: '爪牙命中进化值', type: 'number', def: 1, min: 0, max: 100, step: 1 },
      ],
    },
    krista_shot: {
      name: '公文包·射击',
      desc: '展开公文包射出单发光束，无诱导；被动「圣光之刃」环绕自身旋转',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 5, min: .5, max: 30, step: .5 },
        { key: 'damage', label: '单发伤害', type: 'number', def: 120, min: 1, max: 2000, step: 10 },
        { key: 'count', label: '发数', type: 'number', def: 1, min: 1, max: 10, step: 1 },
        { key: 'gap', label: '间隔(秒)', type: 'number', def: .13, min: .05, max: 1, step: .02 },
      ],
    },
    vamp_bite: {
      name: '吸血',
      desc: '接触敌人且冷却就绪时直接咬住（不飞扑），固定相对角度附着 5 秒：每秒吸血并回复自身，目标移动速度大幅下降；期间受伤不脱离。双方互相咬住时都吸不到血（只掉血不回血）。冷却从发动时开始计算',
      fields: [
        { key: 'cd', label: '冷却(秒·含咬合)', type: 'number', def: 12, min: 3, max: 40, step: .5 },
        { key: 'duration', label: '咬合时长(秒)', type: 'number', def: 5, min: 1, max: 12, step: .5 },
        { key: 'dps', label: '每秒吸血', type: 'number', def: 120, min: 10, max: 600, step: 5 },
        { key: 'heal', label: '每秒回复', type: 'number', def: 120, min: 0, max: 600, step: 5 },
        { key: 'slow', label: '目标减速(0~0.9)', type: 'number', def: .5, min: 0, max: .9, step: .05 },
      ],
    },
    mimi_pack: {
      name: 'G·诺伦',
      desc: '出场携带背包【G·诺伦】，冷却就绪即刻丢出，投掷后坐力把自己向后弹开，背包飞行并追踪敌人：命中后固定在该目标身上 0.45 秒后引爆，生成半径半张地图的巨大爆炸。爆炸在 1 秒内扩张到最大，随后持续 4 秒（合计 5 秒）；每 0.5 秒结算 200 伤害，2 秒即可打满 800 上限，之后每 0.5 秒只跳 1 点维持定身。圈内敌人持续被定身，被定身期间无法使用任何技能。施法者自己站在圈里也会每秒掉 1 血并被定身。丢出后进入轻装状态（体型变小、速度变快），并解锁【背包充能】：下次接触敌人时以吸血动作束缚 5 秒、每秒 80 伤害（不回血，蓝色特效），结束后重新获得背包，但需要再等 5 秒才能丢出',
      fields: [
        { key: 'cd', label: '冷却(投掷·秒)', type: 'number', def: 8, min: 3, max: 30, step: .5 },
        { key: 'speed', label: '背包弹速', type: 'number', def: 580, min: 300, max: 2000, step: 20 },
        { key: 'homing', label: '背包诱导', type: 'number', def: 1.4, min: 0, max: 8, step: .2 },
        { key: 'fuse', label: '吸附到引爆(秒)', type: 'number', def: .45, min: .1, max: 3, step: .05 },
        { key: 'radiusPct', label: '爆炸半径(占地图)', type: 'number', def: .5, min: .1, max: 1, step: .05 },
        { key: 'grow', label: '扩张时长(秒)', type: 'number', def: 1, min: .2, max: 8, step: .1 },
        { key: 'hold', label: '最大后持续(秒)', type: 'number', def: 4, min: 0, max: 12, step: .5 },
        { key: 'maxDamage', label: '单次爆炸上限伤害', type: 'number', def: 800, min: 50, max: 3000, step: 50 },
        { key: 'dps', label: '爆炸每秒伤害', type: 'number', def: 400, min: 10, max: 1200, step: 10 },
        { key: 'chargeDuration', label: '充能束缚(秒)', type: 'number', def: 5, min: 1, max: 12, step: .5 },
        { key: 'chargeDps', label: '充能每秒伤害', type: 'number', def: 80, min: 10, max: 600, step: 5 },
        { key: 'armTime', label: '充能后投掷延迟(秒)', type: 'number', def: 5, min: 0, max: 20, step: .5 },
        { key: 'chargeSlow', label: '目标减速(0~0.9)', type: 'number', def: .5, min: 0, max: .9, step: .05 },
        { key: 'lightRadius', label: '轻装体型倍率', type: 'number', def: .72, min: .4, max: 1.2, step: .02 },
        { key: 'lightSpeed', label: '轻装速度倍率', type: 'number', def: 1.32, min: 1, max: 2.5, step: .02 },
        { key: 'rootTime', label: '爆炸定身(秒·0关闭)', type: 'number', def: 4, min: 0, max: 15, step: .5 },
        { key: 'selfDps', label: '自己每秒伤害', type: 'number', def: 1, min: 0, max: 200, step: 1 },
        { key: 'chip', label: '上限后每跳伤害', type: 'number', def: 1, min: 0, max: 200, step: 1 },
        { key: 'recoil', label: '投掷后坐力(倍速)', type: 'number', def: 1.2, min: 0, max: 4, step: .1 },
        { key: 'zoneColor', label: '爆炸配色', type: 'color', def: '#ffc24a' },
        { key: 'zoneAlpha', label: '爆炸不透明度(倍)', type: 'number', def: 1.9, min: .3, max: 3, step: .1 },
        { key: 'zoneFill', label: '爆炸内部填充(倍)', type: 'number', def: .24, min: 0, max: 1.5, step: .02 },
      ],
    },
    snowowl_snipe: {
      name: '狙击',
      desc: '站桩蓄力 1 秒后连开三枪，枪间隔 1 秒；后两枪的瞄准滞后与散布逐枪放大，越往后越难命中。蓄力期间不动，被硬控则中断（连发中被打断则剩余子弹作废）。近身存在盲区，贴脸时无法开火，只能靠弹球脱离。觉醒期间无需蓄力，每 2 秒打出一组四连发；被动「猎兵的陷阱」：被格斗命中时抵消该次伤害，麻痹对手并在脚边留下手雷，引爆后炸飞双方',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 8, min: .5, max: 30, step: .5 },
        { key: 'chargeTime', label: '蓄力(秒)', type: 'number', def: 1, min: 0, max: 4, step: .05 },
        { key: 'shots', label: '每次技能发数', type: 'number', def: 3, min: 1, max: 6, step: 1 },
        { key: 'shotGap', label: '发间隔(秒)', type: 'number', def: 1, min: .2, max: 3, step: .1 },
        { key: 'followLagMul', label: '后续枪瞄准滞后(倍/枪)', type: 'number', def: .6, min: 0, max: 4, step: .1 },
        { key: 'followSpread', label: '后续枪额外散布(度)', type: 'number', def: 10, min: 0, max: 30, step: .5 },
        { key: 'damage', label: '狙击伤害', type: 'number', def: 400, min: 1, max: 4000, step: 20 },
        { key: 'bulletSpeed', label: '弹速', type: 'number', def: 1500, min: 300, max: 4000, step: 50 },
        { key: 'bulletWidth', label: '子弹判宽', type: 'number', def: 3.2, min: 1, max: 20, step: .2 },
        { key: 'range', label: '射程(像素)', type: 'number', def: 900, min: 200, max: 2400, step: 20 },
        { key: 'minRange', label: '最小射程(像素)', type: 'number', def: 200, min: 0, max: 800, step: 10 },
        { key: 'spread', label: '常态散布(度)', type: 'number', def: 7, min: 0, max: 40, step: .5 },
        { key: 'awakenSpread', label: '觉醒散布(度)', type: 'number', def: 7, min: 0, max: 40, step: .5 },
        { key: 'aimLag', label: '蓄力瞄准滞后(秒)', type: 'number', def: .38, min: 0, max: 1.5, step: .05 },
        { key: 'recoil', label: '后坐力', type: 'number', def: 220, min: 0, max: 900, step: 10 },
        { key: 'counterDamage', label: '陷阱·手雷伤害', type: 'number', def: 500, min: 0, max: 3000, step: 20 },
        { key: 'counterCd', label: '陷阱冷却(秒)', type: 'number', def: 10, min: 1, max: 40, step: .5 },
        { key: 'counterStun', label: '陷阱麻痹(秒)', type: 'number', def: 1.2, min: 0, max: 4, step: .1 },
        { key: 'counterDelay', label: '手雷引爆(秒)', type: 'number', def: .45, min: .1, max: 3, step: .05 },
        { key: 'counterRadius', label: '手雷半径(像素)', type: 'number', def: 130, min: 30, max: 400, step: 10 },
        { key: 'counterKnock', label: '炸飞力度', type: 'number', def: 380, min: 0, max: 1200, step: 20 },
      ],
    },
    shadow_dash: {
      name: '影袭·疾走',
      desc: '朝当前移动方向疾速突进，落点留下一个影分身（场上最多 3 个，持续 14 秒）。分身满 3 个时发动【乱刃】：本体朝目标投出三枚扇形手里剑，同时全部分身脱离原位高速直冲目标自爆斩击（不再追踪拐弯，会打直线），攻击结束后重新开始积累',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 4, min: 2, max: 5, step: .5 },
        { key: 'dashTime', label: '突进时长(秒)', type: 'number', def: .1, min: .04, max: .6, step: .01 },
        { key: 'dashSpeed', label: '突进速度', type: 'number', def: 870, min: 300, max: 3000, step: 10 },
        { key: 'cloneLife', label: '分身持续(秒)', type: 'number', def: 14, min: 2, max: 30, step: .5 },
        { key: 'cloneMax', label: '分身上限', type: 'number', def: 3, min: 1, max: 5, step: 1 },
        { key: 'shurikenCount', label: '手里剑数量', type: 'number', def: 3, min: 1, max: 7, step: 1 },
        { key: 'shurikenDamage', label: '手里剑伤害', type: 'number', def: 190, min: 20, max: 1200, step: 10 },
        { key: 'shurikenSpread', label: '扇形角度(度)', type: 'number', def: 18, min: 0, max: 60, step: 1 },
        { key: 'shurikenSpeed', label: '手里剑速度', type: 'number', def: 950, min: 300, max: 2500, step: 50 },
        { key: 'cloneDamage', label: '分身伤害', type: 'number', def: 300, min: 10, max: 800, step: 10 },
        { key: 'cloneSpeed', label: '分身扑击速度', type: 'number', def: 1100, min: 200, max: 3000, step: 50 },
        { key: 'cloneRange', label: '分身攻击距离', type: 'number', def: 760, min: 100, max: 1600, step: 20 },
      ],
    },
    generic_burst: {
      name: '通用连射',
      desc: '向目标连续发射光束弹',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 4, min: .5, max: 30, step: .5 },
        { key: 'damage', label: '单发伤害', type: 'number', def: 180, min: 1, max: 2000, step: 10 },
        { key: 'count', label: '发数', type: 'number', def: 3, min: 1, max: 10, step: 1 },
        { key: 'gap', label: '间隔(秒)', type: 'number', def: .16, min: .05, max: 1, step: .02 },
      ],
    },
    generic_dash: {
      name: '通用突进',
      desc: '向目标高速突进并造成格斗伤害',
      fields: [
        { key: 'cd', label: '冷却(秒)', type: 'number', def: 6, min: 1, max: 30, step: .5 },
        { key: 'damage', label: '伤害', type: 'number', def: 380, min: 1, max: 3000, step: 20 },
        { key: 'range', label: '触发距离', type: 'number', def: 320, min: 80, max: 900, step: 10 },
      ],
    },
  };

  const AWAKEN_DEFS = {
    skysaber_awaken: {
      name: '格斗程序·最终X', banner: '格斗程序·最终X',
      desc: '红残影；接触触发六连过人斩共 800；特殊格斗程序Ⅰ切诱导。觉醒优先留到 600 血以下',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'contactDamage', label: '穿梭总伤害', type: 'number', def: 800, min: 100, max: 4000, step: 50 },
        { key: 'hits', label: '穿梭段数', type: 'number', def: 3, min: 1, max: 8, step: 1 },
        { key: 'pushEvery', label: '冲量间隔(秒)', type: 'number', def: 5, min: 2, max: 12, step: .5 },
        { key: 'pushMul', label: '冲量倍率', type: 'number', def: 1.75, min: 1, max: 4, step: .05 },
      ],
    },
    akigumo_awaken: {
      name: '次元斩击', banner: '次元斩击',
      desc: '觉醒立即+1残心；残血时预判接触前架起「阴阳流・刹那」，固定 3 秒不可打断，只应对格斗伤害（射击/爆风/爆炸照常受伤），格斗命中触发时停一闪',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'reshinGrant', label: '立即获得残心', type: 'number', def: 1, min: 0, max: 3, step: 1 },
        { key: 'guardHp', label: '刹那血量阈值', type: 'number', def: 500, min: 100, max: 3000, step: 50 },
        { key: 'guardDuration', label: '刹那持续(秒)', type: 'number', def: 3, min: 1, max: 6, step: .25 },
        { key: 'guardDamage', label: '一闪伤害', type: 'number', def: 1400, min: 100, max: 5000, step: 50 },
        { key: 'timeStop', label: '时停时长(秒)', type: 'number', def: 1.2, min: .4, max: 3, step: .1 },
        { key: 'pushEvery', label: '冲量间隔(秒)', type: 'number', def: 5, min: 2, max: 12, step: .5 },
        { key: 'pushMul', label: '冲量倍率', type: 'number', def: 1.75, min: 1, max: 4, step: .05 },
      ],
    },
    akigumo_broken_awaken: {
      name: '御灵・断罪', banner: '御灵・断罪',
      desc: '召唤修罗丸自敌人上方落下，深红一刀斩开大范围。若场地中正展开黑洞、且这一刀足以斩杀，刀锋落下瞬间进入慢动作（红黑残光、上下黑边）',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'damage', label: '一刀伤害', type: 'number', def: 700, min: 100, max: 5000, step: 50 },
        { key: 'range', label: '斩击半径(像素)', type: 'number', def: 300, min: 80, max: 700, step: 10 },
        { key: 'windup', label: '落刀前摇(秒)', type: 'number', def: .55, min: .2, max: 2, step: .05 },
        { key: 'slowMo', label: '黑洞联动慢放(秒)', type: 'number', def: 1.15, min: 0, max: 3, step: .05 },
      ],
    },
    rhine_awaken: {
      name: '终焉龙诗', banner: '终焉龙诗',
      desc: '觉醒时视为极限进化，光晕转为蓝色；前奏曲命中点产生巨大爆风',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'boomDamage', label: '照射爆炸伤害', type: 'number', def: 200, min: 20, max: 2000, step: 10 },
        { key: 'boomRadius', label: '爆炸半径(身位)', type: 'number', def: 1, min: .3, max: 3, step: .1 },
      ],
    },
    krista_awaken: {
      name: '光之祝福', banner: '圣光之刃',
      desc: '站桩 1 秒架起圣光十字盾，期间免疫伤害并阻挡敌人与弹幕，结束时恢复 500 生命',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'cast', label: '站桩(秒)', type: 'number', def: 1, min: .2, max: 4, step: .1 },
        { key: 'heal', label: '恢复生命', type: 'number', def: 500, min: 0, max: 3000, step: 50 },
        { key: 'pushEvery', label: '冲量间隔(秒)', type: 'number', def: 5, min: 2, max: 12, step: .5 },
        { key: 'pushMul', label: '冲量倍率', type: 'number', def: 1.75, min: 1, max: 4, step: .05 },
      ],
    },
    none: {
      name: '无觉醒技',
      desc: '仅获得通用觉醒强化',
      fields: [],
    },
    vamp_awaken: {
      name: '血月圣域', banner: '血月圣域',
      desc: '觉醒展开红黑血色圣域（无碰撞体积）：范围内敌人每秒被吸取 120 血并治疗自身，判定为射击属性；血流自敌人涌向自身',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'radius', label: '圣域半径(身位)', type: 'number', def: 3.2, min: .8, max: 8, step: .1 },
        { key: 'dps', label: '每秒吸取', type: 'number', def: 120, min: 10, max: 600, step: 5 },
        { key: 'heal', label: '每秒回复', type: 'number', def: 120, min: 0, max: 600, step: 5 },
        { key: 'pushEvery', label: '冲量间隔(秒)', type: 'number', def: 5, min: 2, max: 12, step: .5 },
        { key: 'pushMul', label: '冲量倍率', type: 'number', def: 1.75, min: 1, max: 4, step: .05 },
      ],
    },
    snowowl_awaken: {
      name: '雪鸮之眼', banner: '雪鸮之眼',
      desc: '金属化觉醒：狙击枪解除蓄力限制，每 2 秒打出一组四连发（组内 0.3 秒一发）',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'burstEvery', label: '连发轮间隔(秒)', type: 'number', def: 2, min: .6, max: 10, step: .1 },
        { key: 'burstCount', label: '每轮发数', type: 'number', def: 4, min: 1, max: 10, step: 1 },
        { key: 'burstGap', label: '组内间隔(秒)', type: 'number', def: .3, min: .05, max: 1, step: .05 },
        { key: 'gainMul', label: '觉醒槽获取倍率', type: 'number', def: .57, min: .1, max: 2, step: .05 },
      ],
    },
    shadow_awaken: {
      name: '无间影狱', banner: '无间影狱',
      desc: '红色觉醒：移速提升并周期性朝目标突进，接触敌人立即发动爆发技（每次觉醒只发动一次）——时停后连续穿梭，每次留下影分身并刻下「瞬」「暗」「影」「刃」「狱」「杀」，穿梭频率越来越高，前段每一下只削 1 点，最后本体与全部分身齐攻打出 999（合计 1000+零头），收尾闪屏与繁体「滅」字',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'timeStop', label: '时停时长(至少, 秒)', type: 'number', def: 2.2, min: .4, max: 6, step: .1 },
        { key: 'hits', label: '穿梭次数', type: 'number', def: 8, min: 3, max: 12, step: 1 },
        { key: 'totalDamage', label: '收尾一击伤害', type: 'number', def: 1000, min: 200, max: 4000, step: 50 },
        { key: 'hitGap', label: '穿梭基础间隔(秒)', type: 'number', def: .58, min: .1, max: 1.5, step: .02 },
        { key: 'rushEvery', label: '觉醒突进间隔(秒)', type: 'number', def: 2.8, min: .8, max: 8, step: .1 },
        { key: 'rushMul', label: '突进冲量倍率', type: 'number', def: 2.6, min: 1, max: 6, step: .1 },
        { key: 'speedMul', label: '觉醒移速倍率', type: 'number', def: 1.18, min: 1, max: 2, step: .05 },
      ],
    },
    mimi_awaken: {
      name: '秘银的魔剑', banner: '秘银的魔剑',
      desc: '觉醒进入青冰状态：立即获得一个【G·诺伦】，觉醒期间每 4 秒再获得一个（轻装中则直接取回背包并解锁投掷）',
      fields: [
        { key: 'duration', label: '持续时间(秒)', type: 'number', def: 8, min: 2, max: 20, step: .5 },
        { key: 'packEvery', label: '发包间隔(秒)', type: 'number', def: 4, min: 1, max: 10, step: .5 },
      ],
    },
  };

  const AI_STYLES = [
    { v: 'rush', n: '突进型' },
    { v: 'mid', n: '中距型' },
    { v: 'kite', n: '游击型' },
  ];

  /* =========================================================
     全局视觉参数（字幕 / 伤害数字）—— 工坊里统一可调
     ========================================================= */
  const FX_FIELDS = [
    { key: 'cutinScale', label: '字幕字号(光带高度比例)', def: .62, min: .2, max: .95, step: .02 },
    { key: 'cutinBandH', label: '字幕光带高度(像素,0=自动)', def: 0, min: 0, max: 120, step: 2 },
    { key: 'cutinSmall', label: '小字幕时长(秒·残心)', def: 1.0, min: .3, max: 4, step: .1 },
    { key: 'cutinDur', label: '普通字幕时长(秒)', def: 1.5, min: .5, max: 5, step: .1 },
    { key: 'cutinBig', label: '强力字幕时长(秒)', def: 2.4, min: .6, max: 6, step: .1 },
    { key: 'cutinIn', label: '字幕滑入(秒)', def: .2, min: .05, max: 1, step: .05 },
    { key: 'cutinOut', label: '字幕退场(秒)', def: .3, min: .1, max: 1.5, step: .05 },
    { key: 'dmgSize', label: '伤害字号', def: 15, min: 8, max: 40, step: 1 },
    { key: 'dmgBig', label: '强化命中字号', def: 19, min: 8, max: 48, step: 1 },
    { key: 'dmgTh1', label: '大伤害阈值', def: 600, min: 100, max: 2000, step: 50 },
    { key: 'dmgSize1', label: '大伤害字号', def: 25, min: 8, max: 60, step: 1 },
    { key: 'dmgTh2', label: '超大伤害阈值', def: 1000, min: 200, max: 4000, step: 50 },
    { key: 'dmgSize2', label: '超大伤害字号', def: 33, min: 8, max: 72, step: 1 },
  ];
  const FX_DEFAULTS = (() => {
    const o = {};
    for (const f of FX_FIELDS) o[f.key] = f.def;
    return o;
  })();

  const SPRITES = [
    { v: 'sword', n: '剑士剪影' },
    { v: 'shrine', n: '巫女剪影' },
    { v: 'cannon', n: '炮手剪影' },
    { v: 'wing', n: '翼装剪影' },
  ];

  /* =========================================================
     默认角色（数值取自《星之翼》原作：HP / COST）
     ========================================================= */
  function defaultChars() {
    return [
      {
        id: 'skysaber', name: '苍穹之剑', short: '天剑', title: '轨道先锋',
        cost: 2.5, hp: 2664, moveSpeed: 182, radius: 36,
        contactDamage: 520, contactType: 'melee',
        color: '#4aa3ff', color2: '#e8f6ff', accent: '#7fe6ff', awakenColor: '#ff3b52',
        sprite: 'sword', style: 'mid', engageDist: 150, builtin: true,
        intro: '全程往前压的轨道剑士。三连光枪贯穿整列，站位越好一发能清一条线。',
        avatar: 'assets/skysaber.jpg',
        skill: {
          type: 'skysaber_combo',
          params: { cd: 10, shotDamage: 125, shotCount: 6, bladeDamage: 50, bladeSpeed: 600, bladeWidth: 8, bladeSpread: 3, bladeRecoil: 320, paralyze: 1.6 },
        },
        awaken: {
          type: 'skysaber_awaken',
          params: { duration: 8, contactDamage: 800, hits: 3, pushEvery: 5, pushMul: 1.75 },
        },
      },
      {
        id: 'akigumo', name: '秋云', short: '秋云', title: '人灵一体',
        cost: 3.0, hp: 2886, moveSpeed: 185, radius: 36,
        contactDamage: 600, contactType: 'melee',
        color: '#ff5f6d', color2: '#ffe3e8', accent: '#ffb36b', awakenColor: '#ff3b52',
        sprite: 'shrine', style: 'rush', engageDist: 55, builtin: true,
        intro: '贴脸型居合剑客。鞭弧覆盖半个场地，敌人越挤收益越高，被围住也就一瞬间。',
        avatar: 'assets/akigumo.jpg',
        skill: {
          type: 'akigumo_iaido',
          params: { cd: 5.5, behindUnits: 2, chargeTime: 1, damage: 400, knockback: 200, reshinMax: 3, reshinBonus: 12, chargeDamage: 1000, chargeRange: 240, chargeAim: 0.1, chargeDash: 1, chargeSpeed: 580 },
        },
        awaken: {
          type: 'akigumo_awaken',
          params: { duration: 8, reshinGrant: 1, guardHp: 500, guardDuration: 3, guardDamage: 1400, timeStop: 1.8, pushEvery: 5, pushMul: 3.6 },
        },
      },
      {
        id: 'akigumo_broken', name: '破破烂烂女士', short: '破烂女士', title: '修罗之道',
        cost: 3.0, hp: 2886, moveSpeed: 185, radius: 36,
        contactDamage: 520, contactType: 'melee',
        color: '#2f6bff', color2: '#d8e4ff', accent: '#5b8cff', awakenColor: '#ff3b52',
        sprite: 'shrine', style: 'rush', engageDist: 55, builtin: true,
        intro: '会走路的灾厄。把敌人吸进黑洞再贴身绞杀，场面越乱她越舒服。',
        avatar: 'assets/akigumo_broken.webp',
        skill: {
          type: 'akigumo_broken',
          params: {
            cd: 5.5, behindUnits: 2, chargeTime: 1, damage: 620, knockback: 200,
            reshinMax: 3, reshinBonus: 12,
            holeCast: .4, holeRadius: 2.6, holePull: 220,
            holeDps: 70, holeApproach: 300, holeTugEvery: 1.25, holeTugTime: .34,
            guardEvery: 8, guardTime: 2, guardRadius: 34, guardOffset: 52, guardMax: 3,
          },
        },
        awaken: {
          type: 'akigumo_broken_awaken',
          params: { duration: 8, damage: 850, range: 300, windup: .55, slowMo: 1.15 },
        },
      },
      {
        id: 'rhine', name: '莱茵', short: '莱茵', title: '哀叹之龙',
        cost: 3.0, hp: 2850, moveSpeed: 166, radius: 37,
        contactDamage: 0, contactType: 'none',
        color: '#3fa9ff', color2: '#dcefff', accent: '#39d6ff', awakenColor: '#35a8ff',
        sprite: 'cannon', style: 'kite', engageDist: 320, builtin: true,
        intro: '远程炮台。单发光枪首触爆炸，打到后期会自己长出导弹，越打越离谱。',
        avatar: 'assets/rhine.jpg',
        skill: {
          type: 'rhine_evo',
          params: {
            interval: 5.0, intervalEvo: 3.6, shotDamage: 365, shotSpeed: 430, evoPerShot: 10, evoPerHit: 10, evoPerLevel: 100,
            boomDamage: 118, boomRadius: .5, laserCd: 10, laserDps: 75, laserCast: 2, laserBudget: 600,
            missileCd: 10, missileDuration: 5, missileRate: 30, missileDamage: 1, missileEvo: 1,
          },
        },
        awaken: {
          type: 'rhine_awaken',
          params: { duration: 8, boomDamage: 200, boomRadius: 1 },
        },
      },
      {
        id: 'krista', name: '克丽丝塔', short: '克丽丝塔', title: '圣光',
        cost: 2.0, hp: 2240, moveSpeed: 166, radius: 32,
        contactDamage: 0, contactType: 'none',
        color: '#5fd6c4', color2: '#e8fff9', accent: '#ffd76a', awakenColor: '#ff3b52',
        sprite: 'wing', style: 'mid', engageDist: 140, builtin: true,
        intro: '近身护卫。圣剑绕身持续切割，转速就是输出，站进怪堆里最舒服。',
        avatar: 'assets/krista.jpg',
        sword: { damage: 690, length: 3, cd: 0.7, spin: 2.0, awakenSpin: 2 },
        skill: {
          type: 'krista_shot',
          params: { cd: 5, damage: 225, count: 1, gap: .13 },
        },
        awaken: {
          type: 'krista_awaken',
          params: { duration: 8, cast: 1, heal: 400, pushEvery: 5, pushMul: 1.75 },
        },
      },
      {
        id: 'vampkrista', name: '吸血鬼小修女', short: '吸血鬼小修女', title: '吸血鬼小修女',
        cost: 2, hp: 2240, moveSpeed: 168, radius: 32,
        contactDamage: 480, contactType: 'melee',
        color: '#e0405a', color2: '#ffd7de', accent: '#ff4d6a', awakenColor: '#ff2244',
        sprite: 'wing', style: 'rush', engageDist: 96, builtin: true,
        intro: '1v1 小球对战专用，暂时不能选进幸存者。',
        avatar: 'assets/vamp_ready.webp',
        rosterHidden: true,
        faces: {
          ready: 'assets/vamp_ready.webp',
          bite: 'assets/vamp_bite.webp',
          full: 'assets/vamp_full.webp',
        },
        skill: {
          type: 'vamp_bite',
          params: { cd: 12, duration: 5, dps: 155, heal: 120, slow: .5 },
        },
        awaken: {
          type: 'vamp_awaken',
          params: { duration: 8, radius: 3.2, dps: 120, heal: 120, pushEvery: 5, pushMul: 1.75 },
        },
      },
      {
        id: 'mimi', name: '米米姐', short: '米米姐', title: '青冰·米丝瑞尔',
        cost: 2.5, hp: 2588, moveSpeed: 172, radius: 34,
        contactDamage: 300, contactType: 'melee',
        color: '#5fd0f0', color2: '#e6faff', accent: '#7fe8ff', awakenColor: '#3fa9ff',
        sprite: 'wing', style: 'mid', engageDist: 150, builtin: true,
        intro: '慢热重炮手。核弹黏上去、烧完引爆，留下一片定身火海，专治扎堆。',
        avatar: 'assets/mimi_ready.webp',
        faces: {
          ready: 'assets/mimi_ready.webp',
          light: 'assets/mimi_light.webp',
          charge: 'assets/mimi_charge.webp',
          awaken: 'assets/mimi_awaken.webp',
        },
        skill: {
          type: 'mimi_pack',
          params: {
            cd: 8, speed: 580, homing: 1.4, fuse: .45,
            radiusPct: .5, grow: 1, hold: 4, maxDamage: 780, dps: 400,
            chargeDuration: 5, chargeDps: 80, chargeSlow: .5, armTime: 5,
            lightRadius: .72, lightSpeed: 1.32,
            rootTime: 4, zoneColor: '#ffc24a', zoneAlpha: 1.9, zoneFill: .24, recoil: 1.2,
            chip: 1, selfDps: 1,
          },
        },
        awaken: {
          type: 'mimi_awaken',
          params: { duration: 8, packEvery: 4 },
        },
      },
      {
        id: 'snowowl', name: '雪鸮', short: '雪鸮', title: '猎兵之眼',
        cost: 1.5, hp: 1800, moveSpeed: 170, radius: 33,
        contactDamage: 0, contactType: 'none',
        color: '#a3aeb9', color2: '#e9eff4', accent: '#cbd5de', awakenColor: '#2f9bff',
        sprite: 'cannon', style: 'kite', engageDist: 360, builtin: true,
        intro: '超视距猎手。一枪一个但清场慢，靠走位把敌人拉成一条线才最快。',
        avatar: 'assets/snowowl.webp',
        faces: {
          ready: 'assets/snowowl.webp',
          awaken: 'assets/snowowl_awaken.webp',
          trap: 'assets/snowowl_trap.webp',
        },
        skill: {
          type: 'snowowl_snipe',
          params: {
            cd: 8, chargeTime: 1, shots: 3, shotGap: 1, followLagMul: .6, followSpread: 10,
            damage: 400, bulletSpeed: 1500, range: 900, minRange: 190, bulletWidth: 3.2, spread: 7, awakenSpread: 7, aimLag: .38, recoil: 80,
            counterDamage: 100, counterCd: 30, counterStun: .6, counterDelay: .5, counterRadius: 90, counterKnock: 180,
          },
        },
        awaken: {
          type: 'snowowl_awaken',
          params: { duration: 8, burstEvery: 2, burstCount: 4, burstGap: .3, gainMul: .57 },
        },
      },
      {
        id: 'shadow', name: '胧雷-影', short: '影', title: '胧雷',
        cost: 3.0, hp: 2909, moveSpeed: 205, radius: 33,
        contactDamage: 600, contactType: 'melee',
        color: '#3d4b70', color2: '#dfe8ff', accent: '#4d7bff', awakenColor: '#ff2b3c',
        sprite: 'sword', style: 'rush', engageDist: 90, builtin: true,
        intro: '高机动刺客。分身连弹一次串起一串目标，跑得快、出手快、也脆。',
        avatar: 'assets/shadow_ready.webp',
        faces: {
          ready: 'assets/shadow_ready.webp',
          idle: 'assets/shadow_idle.webp',       /* 技能冷却中：抱着猫打盹 */
          flower: 'assets/shadow_flower.webp',   /* 技能就绪：簪花蓄势 */
          deny: 'assets/shadow_deny.webp',       /* 残血：举牌拒绝 */
          eye: 'assets/shadow_eye.webp',         /* 特写 */
          awaken: 'assets/shadow_awaken.webp',
          trap: 'assets/shadow_trap.webp',       /* 爆发/时停中 */
          clones: [
            'assets/shadow_idle.webp',
            'assets/shadow_deny.webp',
            'assets/shadow_flower.webp',
            'assets/shadow_trap.webp',
            'assets/shadow_eye.webp',
          ],
        },
        skill: {
          type: 'shadow_dash',
          params: {
            cd: 4, dashTime: .1, dashSpeed: 870, cloneLife: 14, cloneMax: 3,
            shurikenCount: 3, shurikenDamage: 190, shurikenSpread: 18, shurikenSpeed: 950,
            cloneDamage: 300, cloneSpeed: 1100, cloneRange: 760,
          },
        },
        awaken: {
          type: 'shadow_awaken',
          params: { duration: 8, timeStop: 2.2, hits: 8, totalDamage: 1000, hitGap: .58, rushEvery: 2.8, rushMul: 2.6, speedMul: 1.18 },
        },
      },
    ];
  }

  /* =========================================================
     存储
     ========================================================= */
  const KEY = 'sw_orb_arena_v2';
  const START_UNLOCKED = ['skysaber', 'akigumo'];

  /* =========================================================
     竞猜赔率预设表
     ---------------------------------------------------------
     由 tools/odds_sim.js 让 9 个角色两两对打（每组 60 局，正反
     站位各半）统计出来的，赔率 = 0.94 / 胜率，抽水 6%；
     胜率带 6 局 50% 先验做平滑，赔率夹在 1.06 ~ 8.00。
     改角色数值之后跑一遍 node tools/odds_sim.js 30，把新表整段换掉。
     [左家赔率, 右家赔率]，键是「左>右」，反向键值对调也查得到。
     ========================================================= */
  const ODDS_TABLE = {
    'skysaber>akigumo': [2.22, 1.63],           /* 25:35 均 43.7s */
    'skysaber>akigumo_broken': [4.43, 1.19],    /* 11:49 均 42.9s */
    'skysaber>rhine': [1.59, 2.30],             /* 36:24 均 50.4s */
    'skysaber>krista': [1.19, 4.43],            /* 49:11 均 65.6s */
    'skysaber>vampkrista': [2.95, 1.38],        /* 18:42 均 85.8s */
    'skysaber>mimi': [1.22, 4.14],              /* 48:12 均 74.8s */
    'skysaber>snowowl': [4.43, 1.19],           /* 11:49 均 73.4s */
    'skysaber>shadow': [2.30, 1.59],            /* 24:36 均 57.2s */
    'akigumo>akigumo_broken': [1.48, 2.58],     /* 39:21 均 30.6s */
    'akigumo>rhine': [2.30, 1.59],              /* 24:36 均 40.7s */
    'akigumo>krista': [1.35, 3.10],             /* 43:17 均 44.7s */
    'akigumo>vampkrista': [2.39, 1.55],         /* 23:37 均 54.4s */
    'akigumo>mimi': [2.82, 1.41],               /* 19:41 均 55.7s */
    'akigumo>snowowl': [8.00, 1.06],            /* 3:57 均 51.4s */
    'akigumo>shadow': [1.06, 8.00],             /* 56:4 均 35.2s */
    'akigumo_broken>rhine': [2.58, 1.48],       /* 21:39 均 40.4s */
    'akigumo_broken>krista': [1.63, 2.22],      /* 35:25 均 45.2s */
    'akigumo_broken>vampkrista': [1.63, 2.22],  /* 35:25 均 53.8s */
    'akigumo_broken>mimi': [1.38, 2.95],        /* 42:18 均 52s */
    'akigumo_broken>snowowl': [2.39, 1.55],     /* 23:37 均 67.7s */
    'akigumo_broken>shadow': [1.11, 6.20],      /* 53:7 均 37.5s */
    'rhine>krista': [1.55, 2.39],               /* 37:23 均 54.7s */
    'rhine>vampkrista': [1.19, 4.43],           /* 49:11 均 66.1s */
    'rhine>mimi': [5.64, 1.13],                 /* 8:52 均 69s */
    'rhine>snowowl': [2.39, 1.55],              /* 23:37 均 55.9s */
    'rhine>shadow': [2.22, 1.63],               /* 25:35 均 42.8s */
    'krista>vampkrista': [1.17, 4.77],          /* 50:10 均 68.8s */
    'krista>mimi': [1.77, 2.00],                /* 32:28 均 76.3s */
    'krista>snowowl': [6.89, 1.09],             /* 6:54 均 84.3s */
    'krista>shadow': [3.45, 1.29],              /* 15:45 均 52.3s */
    'vampkrista>mimi': [1.32, 3.27],            /* 44:16 均 114.2s */
    'vampkrista>snowowl': [1.41, 2.82],         /* 41:19 均 121.3s */
    'vampkrista>shadow': [3.45, 1.29],          /* 15:45 均 67.7s */
    'mimi>snowowl': [1.17, 4.77],               /* 50:10 均 105.4s */
    'mimi>shadow': [1.32, 3.27],                /* 44:16 均 61.4s */
    'snowowl>shadow': [2.22, 1.63],             /* 25:35 均 62.3s */
  };

  const Data = {
    chars: [],
    wallet: 1000,
    streak: 0,
    bestStreak: 0,
    history: [],
    unlocked: START_UNLOCKED.slice(),
    selA: 'skysaber',
    selB: 'akigumo',
    betAmt: 50,
    ver: 0,
    fx: Object.assign({}, FX_DEFAULTS),

    SKILL_DEFS, AWAKEN_DEFS, AI_STYLES, SPRITES, FX_FIELDS, FX_DEFAULTS,

    load() {
      const DATA_VER = 48;
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
      if (raw && Array.isArray(raw.chars) && raw.chars.length) {
        this.chars = raw.chars;
        this.wallet = Number(raw.wallet) || 1000;
        this.streak = Number(raw.streak) || 0;
        this.bestStreak = Number(raw.bestStreak) || 0;
        this.history = Array.isArray(raw.history) ? raw.history : [];
        this.unlocked = Array.isArray(raw.unlocked) && raw.unlocked.length
          ? raw.unlocked.slice() : START_UNLOCKED.slice();
        this.selA = raw.selA || this.chars[0].id;
        this.selB = raw.selB || (this.chars[1] ? this.chars[1].id : this.chars[0].id);
        this.betAmt = Number(raw.betAmt) || 50;
        this.ver = Number(raw.ver) || 0;
        this.fx = Object.assign({}, FX_DEFAULTS, raw.fx || {});
      } else {
        this.chars = defaultChars();
        this.fx = Object.assign({}, FX_DEFAULTS);
        this.save();
      }

      /* 版本升级：内置角色同步到最新平衡数值，自定义角色不受影响 */
      const defs = defaultChars();
      const needSync = !raw || raw.ver !== DATA_VER;
      for (const d of defs) {
        const c = this.chars.find(x => x.id === d.id);
        if (!c) {
          if (needSync) this.chars.push(JSON.parse(JSON.stringify(d)));
          continue;
        }
        if (!c.avatar && d.avatar) c.avatar = d.avatar;
        if (needSync && c.builtin) {
          c.name = d.name;
          c.short = d.short;
          c.title = d.title;
          c.intro = d.intro || '';
          c.rosterHidden = !!d.rosterHidden;
          c.cost = d.cost;
          c.hp = d.hp;
          c.moveSpeed = d.moveSpeed;
          c.radius = d.radius;
          c.contactDamage = d.contactDamage;
          c.color = d.color;
          c.color2 = d.color2;
          c.accent = d.accent;
          c.awakenColor = d.awakenColor;
          c.skill = JSON.parse(JSON.stringify(d.skill));
          c.awaken = JSON.parse(JSON.stringify(d.awaken));
          if (d.sword) c.sword = JSON.parse(JSON.stringify(d.sword));
          if (d.faces) c.faces = JSON.parse(JSON.stringify(d.faces));
        }
      }
      this.ver = DATA_VER;
      if (!this.get(this.selA) || !this.isUnlocked(this.selA)) this.selA = this.firstUnlocked();
      if (!this.get(this.selB) || !this.isUnlocked(this.selB)) this.selB = this.firstUnlocked(this.selA);
    },

    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          chars: this.chars, wallet: this.wallet, streak: this.streak,
          bestStreak: this.bestStreak, history: this.history.slice(-60),
          unlocked: this.unlocked,
          selA: this.selA, selB: this.selB, betAmt: this.betAmt, ver: this.ver,
          fx: this.fx,
        }));
      } catch (e) { /* 隐私模式下忽略 */ }
    },

    get(id) { return this.chars.find(c => c.id === id) || null; },

    /* ===== 解锁 ===== */
    isUnlocked(id) { return !id || this.unlocked.indexOf(id) >= 0; },

    unlockCost(c) {
      if (!c) return 0;
      if (c.unlockCost != null) return c.unlockCost;
      return Math.round(400 + (Number(c.cost) || 2) * 200);
    },

    unlock(id) {
      const c = this.get(id);
      if (!c || this.isUnlocked(id)) return false;
      const cost = this.unlockCost(c);
      if (this.wallet < cost) return false;
      this.wallet -= cost;
      this.unlocked.push(id);
      this.save();
      return true;
    },

    forceUnlock(id) {
      if (!this.get(id) || this.isUnlocked(id)) return;
      this.unlocked.push(id);
      this.save();
    },

    firstUnlocked(except) {
      const c = this.chars.find(x => this.isUnlocked(x.id) && x.id !== except);
      return c ? c.id : (this.chars[0] && this.chars[0].id);
    },

    lockedList() {
      return this.chars.filter(c => !c.rosterHidden && !this.isUnlocked(c.id));
    },

    add(char) {
      this.chars.push(char);
      if (char && char.id && !this.isUnlocked(char.id)) this.unlocked.push(char.id);
      this.save();
    },

    remove(id) {
      const i = this.chars.findIndex(c => c.id === id);
      if (i < 0 || this.chars.length <= 1) return false;
      this.chars.splice(i, 1);
      this.unlocked = this.unlocked.filter(x => x !== id);
      if (this.selA === id) this.selA = this.firstUnlocked();
      if (this.selB === id) this.selB = this.firstUnlocked(this.selA);
      this.save();
      return true;
    },

    restoreDefaults() {
      const customs = this.chars.filter(c => !c.builtin);
      this.chars = defaultChars().concat(customs);
      this.save();
    },

    newId() {
      let i = 1;
      while (this.get('custom_' + i)) i++;
      return 'custom_' + i;
    },

    /* 赔率：查预设表，两个角色谁在左谁在右各有一份。
       表是 tools/odds_sim.js 跑 AI 对打统计出来的，写死在下面，
       不跟玩家战绩走 —— 不然下注时看到的赔率和结算时用的赔率对不上。 */
    odds(idA, idB) {
      const a = idA || this.selA;
      const b = idB || this.selB;
      if (!a || !b || a === b) return { a: 1.9, b: 1.9 };
      const d = ODDS_TABLE[a + '>' + b];
      if (d) return { a: d[0], b: d[1] };
      const r = ODDS_TABLE[b + '>' + a];
      if (r) return { a: r[1], b: r[0] };
      return { a: 1.9, b: 1.9 };
    },

    record(winner) {
      this.history.push({ winner, t: Date.now() });
      if (this.history.length > 80) this.history.shift();
      this.save();
    },
  };

  SW.Data = Data;
  SW.defaultChars = defaultChars;
})(window.SW);
