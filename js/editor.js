/* 星之翼 · 球体竞技场 —— 角色工坊 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U, D = SW.Data;

  const E = {
    modal: null,
    root: null,
    curId: null,
    pvCv: null,
    pvCtx: null,
    pvT: 0,
    raf: 0,
    isOpen: false,
  };

  const clone = o => JSON.parse(JSON.stringify(o));

  /* ============================ 打开 / 关闭 ============================ */
  E.open = function () {
    if (this.isOpen) return;
    this.isOpen = true;
    const m = document.getElementById('modal');
    m.classList.remove('hidden');
    m.innerHTML = `
      <div class="forge">
        <div class="forge-head">
          <div class="forge-title">角色工坊<i>CHARACTER FORGE</i></div>
          <div class="spacer"></div>
          <button class="fbtn" data-act="close">关闭</button>
        </div>
        <div class="forge-body">
          <div class="forge-list" id="forgeList"></div>
          <div class="forge-form" id="forgeForm"></div>
          <div class="forge-preview">
            <canvas id="pvCanvas" width="200" height="200"></canvas>
            <div id="pvInfo" style="font-size:9px;color:#7d90ad;letter-spacing:.08em;text-align:center"></div>
          </div>
        </div>
        <div class="forge-actions">
          <button class="fbtn primary" data-act="save">完成</button>
          <button class="fbtn" data-act="new">新建角色</button>
          <button class="fbtn" data-act="dup">复制当前</button>
          <button class="fbtn danger" data-act="del">删除当前</button>
          <button class="fbtn" data-act="export">导出 JSON</button>
          <button class="fbtn" data-act="import">导入 JSON</button>
          <button class="fbtn" data-act="reset">恢复默认</button>
        </div>
      </div>`;
    this.modal = m;
    this.root = m.querySelector('.forge');
    this.pvCv = m.querySelector('#pvCanvas');
    this.pvCtx = this.pvCv.getContext('2d');

    m.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => this.action(btn.dataset.act));
    });

    if (!this.curId || !D.get(this.curId)) this.curId = D.chars[0].id;
    this.renderList();
    this.renderForm();
    this.loop();
  };

  E.close = function () {
    this.isOpen = false;
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('modal').innerHTML = '';
    cancelAnimationFrame(this.raf);
    if (SW.UI && SW.UI.syncPicks) SW.UI.syncPicks();
  };

  /* ============================ 列表 ============================ */
  E.renderList = function () {
    const box = this.root.querySelector('#forgeList');
    box.innerHTML = '';
    for (const c of D.chars) {
      const d = document.createElement('div');
      d.className = 'fr-item' + (c.id === this.curId ? ' sel' : '');
      const av = c.avatar ? `background-image:url('${c.avatar}');background-size:cover;background-position:center;` : '';
      d.innerHTML = `<span class="fr-dot" style="background-color:${c.color};color:${c.color};${av}"></span>
        <span class="fr-n">${escapeHtml(c.name)}</span>
        <span class="fr-c">${c.cost}</span>`;
      d.addEventListener('click', () => {
        this.curId = c.id;
        this.renderList();
        this.renderForm();
      });
      box.appendChild(d);
    }
  };

  /* ============================ 表单 ============================ */
  function fieldNum(key, label, val, step, min, max) {
    return `<div class="field"><label>${label}</label>
      <input type="number" data-k="${key}" value="${val}" step="${step || 1}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}>
    </div>`;
  }
  function fieldText(key, label, val) {
    return `<div class="field"><label>${label}</label>
      <input type="text" data-k="${key}" value="${String(val).replace(/"/g, '&quot;')}">
    </div>`;
  }
  function fieldColor(key, label, val) {
    return `<div class="field"><label>${label}</label>
      <input type="color" data-k="${key}" value="${val}">
    </div>`;
  }
  function fieldSelect(key, label, val, opts) {
    return `<div class="field"><label>${label}</label>
      <select data-k="${key}">${opts.map(o => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.n}</option>`).join('')}</select>
    </div>`;
  }

  E.renderForm = function () {
    const c = D.get(this.curId);
    if (!c) return;
    const box = this.root.querySelector('#forgeForm');
    const sk = D.SKILL_DEFS[c.skill.type] || D.SKILL_DEFS.generic_burst;
    const aw = D.AWAKEN_DEFS[c.awaken.type] || D.AWAKEN_DEFS.none;

    let html = '';
    html += `<div class="fg-title">基础信息</div><div class="fg-grid">`;
    html += fieldText('name', '显示名称', c.name);
    html += fieldText('title', '称号', c.title);
    html += fieldText('short', '简称', c.short);
    html += fieldNum('cost', 'COST', c.cost, 0.5, 0.5, 3);
    html += `</div>`;

    html += `<div class="fg-title">战斗数值</div><div class="fg-grid">`;
    html += fieldNum('hp', '生命值', c.hp, 1, 100, 20000);
    html += fieldNum('moveSpeed', '移动速度', c.moveSpeed, 5, 40, 500);
    html += fieldNum('radius', '体型半径', c.radius, 1, 10, 70);
    html += fieldNum('contactDamage', '接触伤害', c.contactDamage, 10, 0, 4000);
    html += `</div>`;

    html += `<div class="fg-title">外观与 AI</div><div class="fg-grid three">`;
    html += fieldColor('color', '主色', c.color);
    html += fieldColor('color2', '副色', c.color2);
    html += fieldColor('accent', '强调色', c.accent);
    html += `</div><div class="fg-grid">`;
    html += fieldSelect('sprite', '剪影', c.sprite, D.SPRITES);
    html += fieldSelect('style', '弹球手感', c.style, [
      { v: 'rush', n: '激进（转向快）' },
      { v: 'mid', n: '均衡' },
      { v: 'kite', n: '游走（转向慢）' },
    ]);
    html += `</div>`;

    html += `<div class="fg-title">技能</div><div class="fg-grid one">`;
    html += fieldSelect('skillType', '技能类型', c.skill.type,
      Object.keys(D.SKILL_DEFS).map(k => ({ v: k, n: D.SKILL_DEFS[k].name })));
    html += `</div><div class="hint" style="font-size:9px;color:#5a6c85;margin:-3px 0 6px">${sk.desc}</div>`;
    html += `<div class="fg-grid">`;
    for (const f of sk.fields) {
      const v = c.skill.params[f.key] !== undefined ? c.skill.params[f.key] : f.def;
      html += f.type === 'color'
        ? fieldColor('sk_' + f.key, f.label, v)
        : fieldNum('sk_' + f.key, f.label, v, f.step, f.min, f.max);
    }
    html += `</div>`;

    /* 被动大剑（克丽丝塔型角色） */
    if (c.sword) {
      const swF = [
        ['damage', '大剑伤害', c.sword.damage, 10, 1, 4000],
        ['length', '大剑长度(身位)', c.sword.length, .1, 1, 6],
        ['cd', '大剑命中冷却', c.sword.cd, .05, .1, 3],
        ['spin', '转速(圈/秒)', c.sword.spin, .1, .2, 8],
        ['awakenSpin', '觉醒转速倍率', c.sword.awakenSpin != null ? c.sword.awakenSpin : 2, .1, 1, 5],
      ];
      html += `<div class="fg-title">圣光之刃（被动大剑）</div><div class="fg-grid">`;
      for (const [k, label, v, step, min, max] of swF) {
        html += fieldNum('sw_' + k, label, v, step, min, max);
      }
      html += `</div>`;
    }

    html += `<div class="fg-title">觉醒</div><div class="fg-grid one">`;
    html += fieldSelect('awakenType', '觉醒类型', c.awaken.type,
      Object.keys(D.AWAKEN_DEFS).map(k => ({ v: k, n: D.AWAKEN_DEFS[k].name })));
    html += `</div><div class="hint" style="font-size:9px;color:#5a6c85;margin:-3px 0 6px">${aw.desc}</div>`;
    html += `<div class="fg-grid">`;
    for (const f of aw.fields) {
      const v = c.awaken.params[f.key] !== undefined ? c.awaken.params[f.key] : f.def;
      html += f.type === 'color'
        ? fieldColor('aw_' + f.key, f.label, v)
        : fieldNum('aw_' + f.key, f.label, v, f.step, f.min, f.max);
    }
    html += `</div>`;

    /* 全局视觉：技能字幕 / 伤害数字 */
    html += `<div class="fg-title">全局视觉（字幕 / 伤害数字）</div>`;
    html += `<div class="hint" style="font-size:9px;color:#5a6c85;margin:-3px 0 6px">对所有角色生效；伤害达到阈值自动放大字号</div><div class="fg-grid">`;
    for (const f of D.FX_FIELDS) {
      const v = D.fx[f.key] !== undefined ? D.fx[f.key] : f.def;
      html += fieldNum('fx_' + f.key, f.label, v, f.step, f.min, f.max);
    }
    html += `</div>`;

    box.innerHTML = html;

    /* 绑定 */
    box.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      const ev = (el.tagName === 'SELECT' || el.type === 'color') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const ch = D.get(this.curId);
        if (!ch) return;
        if (k.startsWith('sk_')) {
          const key = k.slice(3);
          const fd = sk.fields.find(x => x.key === key);
          ch.skill.params[key] = (fd && fd.type === 'color') ? el.value : (parseFloat(el.value) || 0);
        } else if (k.startsWith('aw_')) {
          const key = k.slice(3);
          const fd = aw.fields.find(x => x.key === key);
          ch.awaken.params[key] = (fd && fd.type === 'color') ? el.value : (parseFloat(el.value) || 0);
        } else if (k.startsWith('sw_')) {
          const key = k.slice(3);
          if (!ch.sword) ch.sword = {};
          ch.sword[key] = parseFloat(el.value) || 0;
        } else if (k.startsWith('fx_')) {
          /* 全局视觉参数，对所有角色生效 */
          const key = k.slice(3);
          D.fx[key] = parseFloat(el.value) || 0;
          D.save();
          return;
        } else if (k === 'skillType') {
          ch.skill.type = el.value;
          ch.skill.params = defaultParams(D.SKILL_DEFS[el.value]);
          D.save();
          this.renderForm();
          return;
        } else if (k === 'awakenType') {
          ch.awaken.type = el.value;
          ch.awaken.params = defaultParams(D.AWAKEN_DEFS[el.value]);
          D.save();
          this.renderForm();
          return;
        } else if (['cost', 'hp', 'moveSpeed', 'radius', 'contactDamage', 'engageDist'].includes(k)) {
          ch[k] = parseFloat(el.value) || 0;
        } else {
          ch[k] = el.value;
        }
        D.save();
        this.renderList();
      });
    });
  };

  function defaultParams(def) {
    const o = {};
    for (const f of (def.fields || [])) o[f.key] = f.def;
    return o;
  }

  /* 导出：优先用系统「另存为」对话框，其次 blob 下载，最后退化为剪贴板 */
  async function saveText(filename, text) {
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON 数据', accept: { 'application/json': ['.json'] } }],
        });
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        return 'picker';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancel';   /* 用户主动取消，不再退化为下载 */
      }
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return 'blob';
    } catch (e) { /* 继续退化 */ }
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch (e) { /* 放弃 */ }
    return 'fail';
  }

  /* ============================ 操作 ============================ */
  E.action = function (act) {
    const ok = (msg) => { if (SW.Audio) SW.Audio.ui(); if (msg) SW.UI && SW.UI.toast(msg); };

    if (act === 'close' || act === 'save') { this.close(); return; }

    if (act === 'new') {
      const id = D.newId();
      const base = clone(D.chars[0]);
      base.id = id;
      base.name = '新角色 ' + id.split('_')[1];
      base.title = '自定义机体';
      base.short = base.name;
      base.builtin = false;
      base.cost = 2.5;
      base.hp = 2600;
      base.color = '#8f7bff';
      base.color2 = '#e6e0ff';
      base.accent = '#b9a8ff';
      D.add(base);
      this.curId = id;
      this.renderList(); this.renderForm();
      ok('已创建');
      return;
    }

    if (act === 'dup') {
      const src = D.get(this.curId);
      if (!src) return;
      const id = D.newId();
      const copy = clone(src);
      copy.id = id;
      copy.name = src.name + ' · 改';
      copy.short = copy.name;
      copy.builtin = false;
      D.add(copy);
      this.curId = id;
      this.renderList(); this.renderForm();
      ok('已复制');
      return;
    }

    if (act === 'del') {
      const c = D.get(this.curId);
      if (!c) return;
      if (D.chars.length <= 1) { ok('至少保留一个角色'); return; }
      if (!confirm(`删除角色「${c.name}」？`)) return;
      D.remove(this.curId);
      this.curId = D.chars[0].id;
      this.renderList(); this.renderForm();
      ok('已删除');
      return;
    }

    if (act === 'reset') {
      if (!confirm('恢复三个内置角色到默认数值？自定义角色会保留。')) return;
      D.restoreDefaults();
      this.curId = D.chars[0].id;
      this.renderList(); this.renderForm();
      ok('已恢复默认');
      return;
    }

    if (act === 'export') {
      const stamp = new Date();
      const pad = n => String(n).padStart(2, '0');
      const name = 'starward-orbs-' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) +
        '-' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + '.json';
      /* 连全局视觉参数一起导出，导入后可完整还原 */
      const text = JSON.stringify({ app: 'starward-orbs', ver: D.ver, chars: D.chars, fx: D.fx }, null, 2);
      saveText(name, text).then(how => {
        if (how === 'picker') ok('已保存到指定位置');
        else if (how === 'blob') ok('已导出 ' + name + '（下载目录）');
        else if (how === 'clipboard') ok('无法下载，已复制到剪贴板');
        else if (how === 'cancel') ok('已取消');
        else ok('导出失败，请手动复制');
      });
      return;
    }

    if (act === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.addEventListener('change', () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const parsed = JSON.parse(String(fr.result));
            /* 兼容两种格式：纯角色数组 / {chars, fx} 完整存档 */
            const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.chars) ? parsed.chars : null);
            if (!arr) throw new Error('格式错误');
            if (!Array.isArray(parsed) && parsed.fx) {
              Object.assign(D.fx, parsed.fx);
              D.save();
            }
            let n = 0;
            for (const raw of arr) {
              if (!raw || !raw.name) continue;
              const id = D.get(raw.id) ? D.newId() : raw.id;
              const c = clone(raw);
              c.id = id;
              c.builtin = false;
              if (!c.skill || !c.skill.type) c.skill = { type: 'generic_burst', params: defaultParams(D.SKILL_DEFS.generic_burst) };
              if (!c.awaken || !c.awaken.type) c.awaken = { type: 'none', params: {} };
              D.add(c);
              n++;
            }
            this.renderList(); this.renderForm();
            ok('导入 ' + n + ' 个角色');
          } catch (e) {
            ok('导入失败：JSON 格式不正确');
          }
        };
        fr.readAsText(file);
      });
      inp.click();
      return;
    }
  };

  /* ============================ 预览 ============================ */
  E.loop = function () {
    if (!this.isOpen) return;
    this.pvT += 0.016;
    this.drawPreview();
    this.raf = requestAnimationFrame(() => this.loop());
  };

  E.drawPreview = function () {
    const g = this.pvCtx;
    const c = D.get(this.curId);
    if (!g || !c) return;
    const W = 200, H = 200, t = this.pvT;

    g.clearRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W * 0.7);
    bg.addColorStop(0, 'rgba(20,44,82,.9)');
    bg.addColorStop(1, 'rgba(3,7,16,1)');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    /* 网格 */
    g.strokeStyle = 'rgba(80,160,255,.09)';
    g.lineWidth = 1;
    for (let i = 0; i < W; i += 20) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke();
    }

    const cx = W / 2, cy = H / 2;
    const r = 34 + (c.radius - 20) * 0.5;

    /* 光环 */
    g.save();
    g.strokeStyle = c.color;
    g.globalAlpha = 0.35 + Math.sin(t * 2) * 0.1;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, r + 22, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.2;
    g.beginPath(); g.arc(cx, cy, r + 34, 0, Math.PI * 2); g.stroke();
    g.restore();

    /* 球体 */
    g.save();
    g.shadowColor = c.color;
    g.shadowBlur = 22;
    const rg = g.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.08, cx, cy, r);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.28, c.color2);
    rg.addColorStop(0.68, c.color);
    rg.addColorStop(1, '#081426');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();

    /* 头像优先 */
    let drew = false;
    if (SW.Render && SW.Render.drawAvatar) {
      drew = SW.Render.drawAvatar(g, c, cx, cy, r * 0.86);
    }
    if (!drew) {
      g.save();
      g.translate(cx, cy);
      g.globalAlpha = 0.9;
      if (SW.Render && SW.Render.drawSilhouette) {
        SW.Render.drawSilhouette(g, c.sprite, r * 1.02, 'rgba(10,20,40,.55)');
      }
      g.restore();
    }

    /* 信息 */
    g.save();
    g.font = '800 11px "PingFang SC",sans-serif';
    g.fillStyle = '#dceaff';
    g.textAlign = 'center';
    g.fillText(c.name, W / 2, H - 26);
    g.font = '700 9px "PingFang SC",sans-serif';
    g.fillStyle = '#7d90ad';
    g.fillText('COST ' + c.cost + '  ·  HP ' + c.hp, W / 2, H - 12);
    g.restore();

    const info = this.root && this.root.querySelector('#pvInfo');
    if (info) {
      const sk = D.SKILL_DEFS[c.skill.type];
      const aw = D.AWAKEN_DEFS[c.awaken.type];
      info.innerHTML = `${sk ? sk.name : '-'}<br>${aw ? aw.name : '-'}`;
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  SW.Editor = E;
})(window.SW);
