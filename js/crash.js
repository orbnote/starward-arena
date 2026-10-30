/* 星之翼 · 报错收集
   手机上没有控制台，报错只会安静地烂在肚子里。这里把 window.onerror、
   未捕获的 Promise、console.error 三类都收下来，角落挂一个小红点；
   点开就是一份可以直接长按复制发人的纯文本。 */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const MAX = 6;
  const LOG = [];
  let dot = null;
  let panel = null;
  let open = false;
  let hooked = false;

  function pad(n) { return String(n).padStart(2, '0'); }

  function stamp(d) {
    d = d || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function dayStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function where() {
    try {
      return (location.origin === 'null' ? 'file://' : location.origin) + location.pathname;
    } catch (e) { return '(unknown)'; }
  }

  function envLine() {
    const ua = navigator.userAgent || '';
    /* 只留机型那一段，整条 UA 有一百多字，粘出去太吵 */
    const m = ua.match(/\(([^)]+)\)/);
    const dev = m ? m[1] : ua.slice(0, 80);
    return dev + ' · ' + window.innerWidth + '×' + window.innerHeight
      + ' @' + (window.devicePixelRatio || 1) + 'x';
  }

  function push(title, detail, stack) {
    const item = {
      t: stamp(),
      ms: Date.now(),
      title: String(title || '').slice(0, 300),
      detail: String(detail || '').slice(0, 300),
      stack: String(stack || '').slice(0, 1800),
    };
    /* 同一个错常常同时走 onerror 和 console.error，一秒内同样的就不重复记 */
    const last = LOG[LOG.length - 1];
    if (last && last.title === item.title && item.ms - last.ms < 1200) return;
    LOG.push(item);
    if (LOG.length > MAX) LOG.shift();
    showDot();
  }

  /* ---------- 角落里那个点 ---------- */
  let dotPending = false;
  function showDot() {
    if (!dot) {
      /* 这个脚本是最先加载的，报错可能比 <body> 还早，等到有地方挂了再建 */
      if (!document.body) {
        if (!dotPending) {
          dotPending = true;
          document.addEventListener('DOMContentLoaded', showDot, { once: true });
        }
        return;
      }
      dot = document.createElement('button');
      dot.id = 'crashDot';
      dot.type = 'button';
      dot.title = '出错了，点这里看详情';
      dot.addEventListener('click', e => {
        e.stopPropagation();
        openPanel();
      });
      document.body.appendChild(dot);
    }
    dot.classList.add('on');
    dot.textContent = LOG.length;
  }

  function hideDot() {
    if (dot) dot.classList.remove('on');
  }

  /* ---------- 面板 ---------- */
  function buildText() {
    const lines = [];
    lines.push('【星之翼】报错 ' + LOG.length + ' 条 · ' + dayStamp());
    lines.push('设备：' + envLine());
    lines.push('页面：' + where());
    lines.push('');
    LOG.forEach((it, i) => {
      lines.push('#' + (i + 1) + ' ' + it.t + '  ' + it.title);
      if (it.detail && it.detail !== it.title) lines.push('  ' + it.detail);
      if (it.stack) {
        it.stack.split('\n').slice(0, 8).forEach(s => lines.push('  ' + s.trim()));
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  function openPanel() {
    if (open) return;
    open = true;
    panel = document.createElement('div');
    panel.id = 'crashPanel';
    panel.innerHTML = ''
      + '<div class="cp-card">'
      + '<div class="cp-head"><b>出错了</b>'
      + '<span>把下面这段复制发我，我照着修</span></div>'
      + '<pre class="cp-body"></pre>'
      + '<div class="cp-acts">'
      + '<button class="cp-btn cp-copy" type="button">复制全部</button>'
      + '<button class="cp-btn cp-cls" type="button">关闭</button>'
      + '</div>'
      + '<div class="cp-foot">复制不了就长按上面的文字自己选</div>'
      + '</div>';
    document.body.appendChild(panel);

    const pre = panel.querySelector('.cp-body');
    pre.textContent = buildText();

    panel.querySelector('.cp-cls').addEventListener('click', closePanel);
    panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });
    panel.querySelector('.cp-copy').addEventListener('click', function () {
      copyText(buildText(), this);
    });
  }

  function closePanel() {
    open = false;
    if (panel) { panel.remove(); panel = null; }
  }

  function copyText(text, btn) {
    const done = () => {
      if (!btn) return;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制全部'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  /* 老 Safari 和 file:// 下 clipboard 会被拒，退回选中 + execCommand */
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) {
      if (panel) {
        const ft = panel.querySelector('.cp-foot');
        if (ft) ft.textContent = '这台机器不让自动复制，长按上面的文字手动选中吧';
      }
    }
  }

  /* ---------- 抓 ---------- */
  function hook() {
    if (hooked) return;
    hooked = true;

    window.addEventListener('error', e => {
      /* 图片/脚本加载失败也会走这里，没有 error 对象，单独标一下 */
      if (e && e.target && e.target !== window && e.target.tagName) {
        const t = e.target;
        const src = t.src || t.href || '';
        if (src) push('资源没加载出来', t.tagName.toLowerCase() + ' ' + src, '');
        return;
      }
      const err = e && e.error;
      const msg = String((e && e.message) || '');
      /* Chrome 的 message 已经带上 "Uncaught TypeError: ..."，别再加一遍名字 */
      push(msg || (err && err.name) || '未知错误',
        (e && e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : ''),
        err && err.stack);
    }, true);

    window.addEventListener('unhandledrejection', e => {
      const r = e && e.reason;
      push('Promise 没接住: ' + (r && r.message || r),
        '', r && r.stack);
    });

    const ce = console.error;
    console.error = function () {
      try {
        /* debug.js 会把同一个错再 console.error('[SW]', e) 一次，
           那是回声，再记一遍就成双份了 */
        if (arguments.length && arguments[0] === '[SW]') {
          return ce.apply(console, arguments);
        }
        const args = Array.prototype.slice.call(arguments).map(a => {
          if (a instanceof Error) return a.message;
          if (typeof a === 'object') {
            try { return JSON.stringify(a).slice(0, 200); } catch (_) { return String(a); }
          }
          return String(a);
        });
        push('console.error', args.join(' ').slice(0, 300), '');
      } catch (_) {}
      return ce.apply(console, arguments);
    };
  }

  SW.Crash = {
    hook: hook,
    push: push,
    list: () => LOG.slice(),
    text: buildText,
    open: openPanel,
    clear() { LOG.length = 0; hideDot(); closePanel(); },
  };

  /* 立刻挂上，别等 DOM —— 前面几个脚本解析失败也要能记下来 */
  hook();
})(window.SW);
