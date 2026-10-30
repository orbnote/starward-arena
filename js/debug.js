/* 星之翼 · 球体竞技场 —— 调试面板 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const D = {
    on: false,
    errors: [],
    logs: [],
    el: null,
    stateEl: null,
    errEl: null,
    fps: 0,
    frames: 0,
    acc: 0,
    lastUpdate: 0,
    frozen: false,
  };

  D.init = function () {
    window.addEventListener('error', (e) => {
      D.err(e.error || (e.message + ' @' + (e.filename || '') + ':' + (e.lineno || 0)));
      D.flash();
    });
    window.addEventListener('unhandledrejection', (e) => {
      D.err(e.reason);
      D.flash();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || (e.key === '`' && e.ctrlKey)) {
        e.preventDefault();
        D.toggle();
      }
    });

    const brand = document.querySelector('.brand-text');
    if (brand) {
      brand.addEventListener('dblclick', () => D.toggle());
    }

    if (/[?&]debug/.test(location.search)) {
      setTimeout(() => D.toggle(), 300);
    }
  };

  D.err = function (e) {
    let msg = '';
    let stack = '';
    if (e && e.stack) {
      stack = String(e.stack);
      msg = String(e.message || e.name || e);
    } else if (e && e.message) {
      msg = String(e.message);
      stack = String(e.stack || '');
    } else {
      msg = String(e);
    }
    const rec = {
      t: new Date().toLocaleTimeString(),
      msg,
      stack: stack.split('\n').slice(0, 8).join('\n'),
    };
    D.errors.unshift(rec);
    if (D.errors.length > 8) D.errors.pop();
    try { console.error('[SW]', e); } catch (_) {}
    D.render();
  };

  D.log = function (m) {
    D.logs.unshift(new Date().toLocaleTimeString() + '  ' + m);
    if (D.logs.length > 30) D.logs.pop();
  };

  D.flash = function () {
    if (!D.on) D.build();
    const p = D.el;
    if (!p) return;
    p.classList.add('dbg-alert');
    setTimeout(() => p.classList.remove('dbg-alert'), 900);
  };

  D.toggle = function () {
    D.on = !D.on;
    if (D.on) D.build();
    else if (D.el) { D.el.remove(); D.el = null; }
  };

  D.build = function () {
    if (D.el) return;
    const p = document.createElement('div');
    p.id = 'dbgPanel';
    p.innerHTML = `
      <div class="dbg-head">
        <span>DEBUG</span>
        <div class="dbg-hbtns">
          <button data-a="copy">复制</button>
          <button data-a="clear">清空</button>
          <button data-a="close">×</button>
        </div>
      </div>
      <div class="dbg-body">
        <pre class="dbg-state"></pre>
        <pre class="dbg-err"></pre>
      </div>`;
    document.body.appendChild(p);
    D.el = p;
    D.stateEl = p.querySelector('.dbg-state');
    D.errEl = p.querySelector('.dbg-err');

    p.querySelector('[data-a="close"]').addEventListener('click', () => D.toggle());
    p.querySelector('[data-a="clear"]').addEventListener('click', () => {
      D.errors.length = 0; D.logs.length = 0; D.render();
    });
    p.querySelector('[data-a="copy"]').addEventListener('click', () => {
      const txt = D.diag();
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
      D.log('诊断信息已复制');
      D.render();
    });
    D.render();
  };

  D.diag = function () {
    const B = SW.Battle || {};
    const lines = [];
    lines.push('== 星之翼 球体竞技场 诊断 ==');
    lines.push('time: ' + new Date().toISOString());
    lines.push('ua: ' + navigator.userAgent);
    lines.push('viewport: ' + innerWidth + 'x' + innerHeight + ' dpr=' + (window.devicePixelRatio || 1));
    lines.push('state: ' + B.state + '  t=' + (B.time || 0).toFixed(1) + '  speed=' + B.speed);
    if (B.fighters) {
      for (const f of B.fighters) {
        if (!f) continue;
        lines.push(`  ${f.char.name}: hp=${Math.round(f.hp)}/${f.maxHp} cost=${f.costPool} pos=${Math.round(f.x)},${Math.round(f.y)} v=${Math.round(f.vx)},${Math.round(f.vy)} cast=${f.cast ? f.cast.type : '-'} inv=${(f.invuln || 0).toFixed(2)} noCollide=${!!f.noCollide}`);
      }
    }
    lines.push('projectiles: ' + (B.projectiles ? B.projectiles.length : 0));
    lines.push('fx: ' + ((SW.Fx && SW.Fx.parts.length) || 0) + ' parts, ' + ((SW.Fx && SW.Fx.texts.length) || 0) + ' texts');
    lines.push('fps: ' + D.fps.toFixed(0));
    if (D.errors.length) {
      lines.push('== 最近错误 ==');
      for (const e of D.errors) lines.push('[' + e.t + '] ' + e.msg + (e.stack ? '\n' + e.stack : ''));
    }
    if (D.logs.length) {
      lines.push('== 日志 ==');
      lines.push(...D.logs.slice(0, 12));
    }
    return lines.join('\n');
  };

  D.frame = function (dt) {
    D.frames++;
    D.acc += dt;
    if (D.acc >= 0.5) {
      D.fps = D.frames / D.acc;
      D.frames = 0;
      D.acc = 0;
    }
    if (D.on) {
      const now = performance.now();
      if (now - D.lastUpdate > 400) {
        D.lastUpdate = now;
        D.render();
      }
    }
  };

  D.render = function () {
    if (!D.on || !D.stateEl) return;
    const B = SW.Battle || {};
    let s = '';
    s += 'FPS ' + D.fps.toFixed(0) + '   ' + B.state + '   t=' + (B.time || 0).toFixed(1) + 's   x' + (B.speed || 1) + '\n';
    s += 'proj ' + ((B.projectiles && B.projectiles.length) || 0) +
         '   fx ' + ((SW.Fx && SW.Fx.parts.length) || 0) +
         '   shake ' + ((B.shake || 0).toFixed(1)) + '\n';
    s += '--------------------------------\n';
    if (B.fighters) {
      for (const f of B.fighters) {
        if (!f) continue;
        s += f.char.name + (f.dead ? ' [DEAD]' : '') + '\n';
        s += ' hp ' + Math.round(f.hp) + '/' + f.maxHp + '   cost ' + f.costPool + '\n';
        s += ' pos ' + Math.round(f.x) + ',' + Math.round(f.y) +
             '   v ' + Math.round(f.vx) + ',' + Math.round(f.vy) + '\n';
        s += ' cast ' + (f.cast ? f.cast.type : '-') +
             '  iaido ' + (f.iaidoCast ? (f.iaidoCast.t / f.iaidoCast.total).toFixed(2) : '-') + '\n';
        s += ' stun ' + (f.stun || 0).toFixed(1) +
             '  inv ' + (f.invuln || 0).toFixed(1) +
             '  noCol ' + (f.noCollide ? 'Y' : 'N') + '\n';
        s += '--------------------------------\n';
      }
    }

    if (D.stateEl.textContent !== s) D.stateEl.textContent = s;

    let e = '';
    if (!D.errors.length) e = '无错误';
    else {
      for (const it of D.errors) {
        e += '[' + it.t + '] ' + it.msg + '\n';
        if (it.stack) e += it.stack + '\n';
        e += '\n';
      }
    }
    if (D.errEl.textContent !== e) D.errEl.textContent = e;
  };

  SW.Debug = D;
})(window.SW);
