(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* Cabeçalhos das janelas (decoração) */
  document.querySelectorAll('[data-head]').forEach(function (h) {
    var t = document.getElementById('tpl-head-' + h.dataset.head);
    if (!t) return;
    h.appendChild(t.content.cloneNode(true));
    h.setAttribute('aria-hidden', 'true');
    if (h.dataset.on) { var b = h.querySelector('[data-k="' + h.dataset.on + '"]'); if (b) b.classList.add('on'); }
  });

  /* Tema */
  var toggles = document.querySelectorAll('[data-theme-toggle]');
  function paintToggles() {
    var dark = root.dataset.theme === 'dark';
    toggles.forEach(function (b) { b.setAttribute('aria-checked', dark ? 'true' : 'false'); });
  }
  function setTheme(t, save) {
    if (!reduce.matches) { root.classList.add('theming'); clearTimeout(setTheme._t); setTheme._t = setTimeout(function () { root.classList.remove('theming'); }, 650); }
    root.dataset.theme = t;
    if (save) { try { localStorage.setItem('cynote-tema', t); } catch (e) {} }
    paintToggles();
  }
  toggles.forEach(function (b) { b.addEventListener('click', function () { setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true); }); });
  var mq = matchMedia('(prefers-color-scheme: dark)');
  var onSys = function (e) { var s = null; try { s = localStorage.getItem('cynote-tema'); } catch (x) {} if (!s) setTheme(e.matches ? 'dark' : 'light', false); };
  if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
  paintToggles();

  /* Escala proporcional das janelas */
  var fits = document.querySelectorAll('.fit');
  function fit(el) { var w = parseFloat(getComputedStyle(el).getPropertyValue('--w')); if (!w || !el.clientWidth) return; el.style.setProperty('--s', Math.min(1, el.clientWidth / w)); }
  if ('ResizeObserver' in window) { var ro = new ResizeObserver(function (es) { es.forEach(function (e) { fit(e.target); }); }); fits.forEach(function (f) { ro.observe(f); }); }
  else { var all = function () { fits.forEach(fit); }; addEventListener('resize', all); all(); }

  /* Revelar ao rolar */
  var rev = document.querySelectorAll('[data-reveal], .vine, .foot-vine');
  if ('IntersectionObserver' in window && !reduce.matches) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    rev.forEach(function (el) { io.observe(el); });
  } else rev.forEach(function (el) { el.classList.add('in'); });

  /* Notas de exemplo */
  var NOTES = [
    'Estufa: ideias para o fim de semana\n\nRegar as samambaias antes das 9h.\nTrocar o vaso da costela-de-adão.\nComprar sementes: manjericão, capuchinha, girassol.\n\nLeitura: "A casa de vidro", cap. 4 a 7.\nLigar para a Clara sobre a feira de mudas no sábado.\nLembrar: a luz da manhã entra pela janela leste.',
    'Pão de fermentação natural\n\n500 g de farinha\n350 ml de água morna\n100 g de levain ativo\n10 g de sal\n\nDobras a cada 30 min, por 2 h.\nDescansar 12 h na geladeira e assar a 250 °C.',
    'Leituras 2026\n\n• A casa de vidro (em andamento)\n• O jardim secreto\n• Ecotopia\n• A mão esquerda da escuridão\n\nPróxima: pedir emprestado na biblioteca do bairro.'
  ];

  /* Janela do topo: guias, posição do cursor, contador, sincronização */
  var ta = document.getElementById('hero-note');
  if (ta) {
    var texts = NOTES.slice(), cur = 0;
    var pos = document.getElementById('hero-pos'), chars = document.getElementById('hero-chars'), sync = document.getElementById('hero-sync');
    var tabs = document.querySelectorAll('.hero [data-note]');
    var updPos = function () { var p = ta.selectionStart, b = ta.value.slice(0, p); pos.textContent = 'Ln ' + b.split('\n').length + ', Col ' + (p - b.lastIndexOf('\n')); };
    var updChars = function () { chars.textContent = ta.value.length + ' caracteres'; };
    var setSync = function (busy) {
      sync.classList.remove('ok', 'busy'); void sync.offsetWidth;
      sync.classList.add(busy ? 'busy' : 'ok');
      sync.querySelector('.i').className = 'i ' + (busy ? 'i-sync-andamento' : 'i-sync-ok');
      sync.querySelector('span').textContent = busy ? 'Sincronizando…' : 'Sincronizado';
    };
    var st;
    ta.value = texts[0]; updChars();
    ta.addEventListener('input', function () {
      texts[cur] = ta.value; updChars(); updPos();
      var t = tabs[cur]; if (!t.querySelector('.dot')) { var d = document.createElement('span'); d.className = 'dot'; d.setAttribute('aria-label', 'não salvo'); t.appendChild(d); }
      if (!sync.classList.contains('busy')) setSync(true);
      clearTimeout(st); st = setTimeout(function () { setSync(false); var d = tabs[cur].querySelector('.dot'); if (d) d.remove(); }, 1300);
    });
    ['keyup', 'click', 'select', 'focus'].forEach(function (ev) { ta.addEventListener(ev, updPos); });
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        cur = i; tabs.forEach(function (x, j) { x.classList.toggle('on', j === i); x.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
        ta.value = texts[i]; ta.scrollTop = 0; updChars(); ta.setSelectionRange(0, 0); pos.textContent = 'Ln 1, Col 1';
      });
    });
  }

  /* Destaques da busca */
  document.querySelectorAll('[data-hl]').forEach(function (el) {
    var text = NOTES[0], q = el.dataset.hl, ci = +el.dataset.cur || 0, low = text.toLowerCase(), out = [], i = 0, n = 0, j;
    while ((j = low.indexOf(q, i)) !== -1) { out.push(document.createTextNode(text.slice(i, j))); var m = document.createElement('mark'); if (n === ci) m.className = 'c'; m.textContent = text.slice(j, j + q.length); out.push(m); i = j + q.length; n++; }
    out.push(document.createTextNode(text.slice(i)));
    out.forEach(function (x) { el.appendChild(x); });
    var c = el.parentNode.querySelector('[data-count]'); if (c) c.textContent = (ci + 1) + ' de ' + n;
  });

  /* Vitrine (guias acessíveis) */
  var vtabs = Array.prototype.slice.call(document.querySelectorAll('.vit-tabs [role="tab"]'));
  function select(t, focus) {
    vtabs.forEach(function (x) {
      var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1;
      var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
    });
    if (focus) t.focus();
    var bar = t.parentNode; var l = t.offsetLeft - 16, r = t.offsetLeft + t.offsetWidth + 16;
    if (l < bar.scrollLeft) bar.scrollTo({ left: l, behavior: 'smooth' }); else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: r - bar.clientWidth, behavior: 'smooth' });
    if (t.id === 't-desenho') initCanvas();
  }
  vtabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowRight') n = vtabs[(i + 1) % vtabs.length]; else if (k === 'ArrowLeft') n = vtabs[(i - 1 + vtabs.length) % vtabs.length];
      else if (k === 'Home') n = vtabs[0]; else if (k === 'End') n = vtabs[vtabs.length - 1];
      if (n) { e.preventDefault(); select(n, true); }
    });
  });

  /* Note Styling: desenho de verdade */
  var cv = document.getElementById('ns-canvas'), ctx, color = '#4E8A4A', ready = false, drawing = false, last = null;
  function seed() {
    ctx.save(); ctx.strokeStyle = '#2E6F7C'; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.6;
    ctx.translate(cv.clientWidth / 2 - 90, cv.clientHeight / 2 - 50);
    ctx.stroke(new Path2D('M22 46 C18 18 100 8 126 30 C146 46 102 70 56 66 C36 64 22 58 26 44'));
    ctx.stroke(new Path2D('M126 30 L158 14'));
    ctx.stroke(new Path2D('M147 11 L158 14 L153 24'));
    ctx.strokeStyle = '#4E8A4A';
    ctx.stroke(new Path2D('M40 104 C60 94 90 94 120 104'));
    ctx.stroke(new Path2D('M80 98 C80 84 80 76 80 68 M80 84 C72 84 66 78 66 72 C73 72 80 76 80 84 Z M80 78 C87 78 94 72 94 66 C86 66 80 71 80 78 Z'));
    ctx.restore();
  }
  function initCanvas() {
    if (!cv || ready || !cv.clientWidth) return;
    var d = Math.max(2, window.devicePixelRatio || 1);
    cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d;
    ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ready = true; seed();
  }
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.clientWidth / r.width, y: (e.clientY - r.top) * cv.clientHeight / r.height }; }
  if (cv) {
    cv.addEventListener('pointerdown', function (e) { initCanvas(); if (!ctx) return; drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return; var p = pt(e);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { cv.addEventListener(ev, function () { drawing = false; }); });
    document.querySelectorAll('.sw').forEach(function (b) {
      b.addEventListener('click', function () {
        color = b.dataset.c;
        document.querySelectorAll('.sw').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
      });
    });
    var page = cv.closest('.page');
    var toast = function (msg) { var t = page.querySelector('.toast'); if (t) t.remove(); t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; page.appendChild(t); setTimeout(function () { t.remove(); }, 2200); };
    page.querySelector('[data-ns="clear"]').addEventListener('click', function () { if (!ctx) return; ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight); });
    page.querySelector('[data-ns="insert"]').addEventListener('click', function () { toast('No Cynote, o desenho vai direto para a nota'); });
  }
})();
