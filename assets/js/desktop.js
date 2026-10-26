// Escritorio interactivo: ventanas, barra de tareas, menú inicio y terminal.
// No depende de Three.js: si la escena 3D no carga, el escritorio sigue funcionando solo.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const body = document.body;
const desk = $('#desktop');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => innerWidth <= 760;

let zTop = 10;
let shown = false;
let greeted = false;
let pendingWin = null;

// ---------- fondo de pantalla (lo usa también el monitor 3D) ----------
export function drawWallpaper(g, W, H) {
  const bg = g.createRadialGradient(W * .56, H * .46, H * .05, W * .5, H * .5, W * .75);
  bg.addColorStop(0, '#123a9c');
  bg.addColorStop(.42, '#071a52');
  bg.addColorStop(1, '#020713');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const cx = W * .56, cy = H * .47, S = H / 900;
  g.save();
  g.translate(cx, cy);
  g.globalCompositeOperation = 'lighter';
  const N = 34;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const a = -2.5 + t * 4.6;
    const len = (250 + 150 * Math.sin(i * 1.9) + 90 * Math.cos(i * .7)) * S;
    const bend = (70 + 50 * Math.sin(i * 2.3)) * S;
    g.save();
    g.rotate(a);
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, 'rgba(20,50,220,0)');
    grd.addColorStop(.45, 'rgba(36,86,255,.20)');
    grd.addColorStop(1, 'rgba(130,180,255,.34)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * .25, -bend * 1.4, len * .85, -bend * 1.2, len, -bend * .1);
    g.bezierCurveTo(len * .8, bend * .5, len * .3, bend * .55, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(170,205,255,.22)';
    g.lineWidth = 1.4 * S;
    g.stroke();
    g.restore();
  }
  g.restore();
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, H * .45);
  glow.addColorStop(0, 'rgba(120,170,255,.22)');
  glow.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

function paintWall() {
  const c = document.createElement('canvas');
  const W = 1920, H = 1080;
  c.width = W; c.height = H;
  drawWallpaper(c.getContext('2d'), W, H);
  c.toBlob(b => { if (b) $('#wall').style.backgroundImage = `url(${URL.createObjectURL(b)})`; }, 'image/jpeg', .9);
}

// ---------- ventanas ----------
const wins = Object.fromEntries($$('.win').map(w => [w.dataset.win, w]));

function syncTaskbar() {
  const front = $$('.win.open:not(.min)').sort((a, b) => b.style.zIndex - a.style.zIndex)[0];
  $$('.tb-btn[data-open]').forEach(b => {
    const w = wins[b.dataset.open];
    b.classList.toggle('on', !!w && w.classList.contains('open'));
    b.classList.toggle('front', w === front);
  });
}

function focusWin(w) {
  w.style.zIndex = ++zTop;
  $$('.win').forEach(x => x.classList.toggle('focused', x === w));
  syncTaskbar();
}

function placeWin(w) {
  if (small()) return;
  const n = $$('.win.open').length - 1;
  const ww = w.offsetWidth, wh = w.offsetHeight;
  const x = clamp((innerWidth - ww) / 2 + 40 + n * 30, 110, Math.max(110, innerWidth - ww - 10));
  const y = clamp((innerHeight - 54 - wh) / 2 + n * 26 - 20, 10, Math.max(10, innerHeight - 54 - wh - 10));
  w.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
}

export function openWin(id) {
  const w = wins[id];
  if (!w) return;
  closeStart();
  if (!w.classList.contains('open')) {
    w.classList.add('open');
    placeWin(w);
  }
  w.classList.remove('min', 'closing');
  focusWin(w);
  if (id === 'terminal') {
    termBoot();
    if (!small()) setTimeout(() => $('#termIn').focus({ preventScroll: true }), 60);
  }
}

function closeWin(w) {
  w.classList.add('closing');
  setTimeout(() => { w.classList.remove('open', 'closing', 'max', 'min'); syncTaskbar(); }, reduce ? 0 : 160);
}

function toggleFromTaskbar(id) {
  const w = wins[id];
  if (!w) return;
  const front = w.classList.contains('open') && !w.classList.contains('min') && +w.style.zIndex === zTop;
  if (front) { w.classList.add('min'); syncTaskbar(); }
  else openWin(id);
}

$$('.win').forEach(w => {
  const bar = $('.win-bar', w);
  w.addEventListener('pointerdown', () => focusWin(w));
  bar.addEventListener('dblclick', e => { if (!e.target.closest('button') && !small()) w.classList.toggle('max'); });
  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button') || small() || w.classList.contains('max')) return;
    const [x0, y0] = (w.style.translate || '0px 0px').split(' ').map(parseFloat);
    const sx = e.clientX - x0, sy = e.clientY - (y0 || 0);
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      const x = clamp(ev.clientX - sx, 120 - w.offsetWidth, innerWidth - 120);
      const y = clamp(ev.clientY - sy, 0, innerHeight - 54 - 42);
      w.style.translate = `${x}px ${y}px`;
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
  $$('[data-w]', w).forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.w;
    if (act === 'close') closeWin(w);
    else if (act === 'min') { w.classList.add('min'); syncTaskbar(); }
    else if (act === 'max') w.classList.toggle('max');
  }));
  // la rueda dentro de una ventana nunca mueve la historia de fondo
  const scroller = $('.win-body', w);
  w.addEventListener('wheel', e => {
    const canScroll = scroller.scrollHeight > scroller.clientHeight + 1;
    const atTop = scroller.scrollTop <= 0, atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if (!canScroll || (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atEnd)) e.preventDefault();
  }, { passive: false });
  w.addEventListener('touchmove', e => {
    if (scroller.scrollHeight <= scroller.clientHeight + 1) e.preventDefault();
  }, { passive: false });
});

addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !shown) return;
  if (!$('#start').hidden) return closeStart();
  const front = $$('.win.open:not(.min)').sort((a, b) => b.style.zIndex - a.style.zIndex)[0];
  if (front) closeWin(front);
});

// ---------- menú inicio ----------
const startBtn = $('[data-action="start"]');
function closeStart() { $('#start').hidden = true; startBtn.setAttribute('aria-expanded', 'false'); }
function toggleStart() {
  const m = $('#start');
  m.hidden = !m.hidden;
  startBtn.setAttribute('aria-expanded', String(!m.hidden));
}
desk.addEventListener('pointerdown', e => {
  if (!e.target.closest('#start') && !e.target.closest('[data-action="start"]')) closeStart();
});

// ---------- clics delegados ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-open],[data-action]');
  if (!t) return;
  if (t.dataset.open) {
    if (t.closest('.taskbar')) toggleFromTaskbar(t.dataset.open);
    else openWin(t.dataset.open);
    return;
  }
  const a = t.dataset.action;
  if (a === 'start') toggleStart();
  else if (a === 'replay') { closeStart(); dispatchEvent(new CustomEvent('jpt:replay')); }
  else if (a === 'skip') dispatchEvent(new CustomEvent('jpt:skip'));
  else if (a === 'contact') {
    if (shown) openWin('contact');
    else { pendingWin = 'contact'; dispatchEvent(new CustomEvent('jpt:skip')); }
  }
  else if (a === 'next') dispatchEvent(new CustomEvent('jpt:next'));
  else if (a === 'top') { e.preventDefault(); dispatchEvent(new CustomEvent('jpt:replay')); }
});

// ---------- reloj ----------
function tick() {
  const d = new Date();
  const hm = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dm = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  $('#clock').innerHTML = `${hm}<small>${dm}</small>`;
}
tick();
setInterval(tick, 15000);

// ---------- terminal ----------
const out = $('#termOut'), inp = $('#termIn'), term = $('#term');
const hist = [];
let hIdx = 0, booted = false;
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const line = (html, cls = '') => { const d = document.createElement('div'); d.className = 'l ' + cls; d.innerHTML = html; out.appendChild(d); };
const PROJECTS = [
  ['barberia-bot', 'BarberIA — bot de WhatsApp para barberías (Python, Flask)'],
  ['inventario-ti', 'Inventario TI — equipos con actas firmadas (Flask, React)'],
  ['lentti-api-rest', 'Lentti API — pedidos y entregas (Spring Boot)'],
  ['barcode-price-manager', 'Barcode Manager — precios en Raspberry Pi (Flask, SQLite)'],
  ['spendify', 'Spendify — inventario y ventas con roles (Laravel)'],
  ['labs-summit-2026', 'Labs Summit — sitio del evento con mapa WebGL'],
];
const CMDS = {
  help: () => {
    line('<span class="em">Comandos disponibles</span>');
    [['whoami', 'quién soy'], ['proyectos', 'lista de proyectos (o: ls)'], ['abrir &lt;n&gt;', 'abre el repositorio n'], ['stack', 'tecnologías'],
      ['trayectoria', 'experiencia'], ['contacto', 'cómo escribirme'], ['cv', 'descargar mi CV'], ['historia', 'ver la historia 3D otra vez'],
      ['clear', 'limpiar la pantalla']].forEach(([c, d]) => line(`  ${c.padEnd(16, ' ')}<span class="dim">${d}</span>`));
  },
  whoami: () => { line('Juan Pablo Toro Correa'); line('<span class="dim">desarrollador full stack · infraestructura · seguridad — Medellín, CO</span>'); },
  proyectos: () => PROJECTS.forEach(([slug, d], i) => line(`  <span class="em">${i + 1}</span>  ${d}  <a href="https://github.com/SoulNome/${slug}" target="_blank" rel="noopener">repo</a>`)),
  ls: () => CMDS.proyectos(),
  abrir: (n) => {
    const p = PROJECTS[parseInt(n, 10) - 1];
    if (!p) return line('uso: abrir &lt;1-6&gt;', 'err');
    line(`abriendo ${p[0]}…`, 'dim');
    open(`https://github.com/SoulNome/${p[0]}`, '_blank', 'noopener');
  },
  stack: () => {
    line('<span class="em">lenguajes</span>  JavaScript · TypeScript · Python · Java · PHP · SQL');
    line('<span class="em">backend</span>    Node · Express · Spring Boot · Laravel · Flask');
    line('<span class="em">frontend</span>   React · Angular · Tailwind · Vite · Flutter');
    line('<span class="em">infra</span>      Linux · Docker · Cisco · VLANs · Railway');
    line('<span class="em">seguridad</span>  Hardening · Kali · Nmap · NOC');
  },
  trayectoria: () => {
    line('2026—hoy   Techno Labs · desarrollador & asesor');
    line('2023—hoy   Freelance · full stack');
    line('2025—2026  Medisfarma · analista de sistemas');
    line('2023—2025  Independiente · NOC & pentester');
    line('2021       Accedo · mi primer trabajo');
  },
  contacto: () => {
    line('correo    <a href="mailto:juan.p.toro@correounivalle.edu.co">juan.p.toro@correounivalle.edu.co</a>');
    line('whatsapp  <a href="https://wa.me/573143173801" target="_blank" rel="noopener">+57 314 317 3801</a>');
    line('github    <a href="https://github.com/SoulNome" target="_blank" rel="noopener">github.com/SoulNome</a>');
  },
  cv: () => { line('descargando MyCVDev.pdf…', 'dim'); const a = document.createElement('a'); a.href = './assets/MyCVDev.pdf'; a.download = ''; a.click(); },
  historia: () => { line('rebobinando…', 'dim'); setTimeout(() => dispatchEvent(new CustomEvent('jpt:replay')), 300); },
  clear: () => { out.innerHTML = ''; },
  cls: () => CMDS.clear(),
  date: () => line(new Date().toLocaleString('es-CO')),
  echo: (...a) => line(esc(a.join(' '))),
  sudo: () => line('jpt no está en el archivo sudoers. Este incidente será reportado. 😉', 'err'),
  nmap: () => { line('Starting Nmap… 1 host arriba: tú.'); line('PORT      STATE  SERVICE'); line('443/tcp   open   curiosidad'); line('8080/tcp  open   contratame', 'em'); },
  hola: () => line('¡Hola mundo! 👋 Así empezó todo.'),
  hello: () => CMDS.hola(),
  exit: () => closeWin(wins.terminal),
};
CMDS.ayuda = CMDS.help;

function termBoot() {
  if (booted) return;
  booted = true;
  line('JPT shell 2.6 — escribe <span class="em">help</span> para ver los comandos.', 'dim');
  line('');
}
function run(raw) {
  const cmd = raw.trim();
  line(`<span class="p">jpt@medellin<b>:~$</b></span> ${esc(cmd)}`);
  if (!cmd) return;
  hist.push(cmd); hIdx = hist.length;
  const [name, ...args] = cmd.split(/\s+/);
  const fn = CMDS[name.toLowerCase()];
  if (fn) fn(...args);
  else line(`comando no encontrado: ${esc(name)} — escribe <span class="em">help</span>`, 'err');
  term.scrollTop = term.scrollHeight;
}
inp.addEventListener('keydown', e => {
  if (e.key === 'Enter') { run(inp.value); inp.value = ''; }
  else if (e.key === 'ArrowUp' && hIdx > 0) { inp.value = hist[--hIdx]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { hIdx = Math.min(hist.length, hIdx + 1); inp.value = hist[hIdx] || ''; }
});
term.addEventListener('click', () => { if (!getSelection().toString()) inp.focus({ preventScroll: true }); });

// ---------- visibilidad (la controla la escena 3D) ----------
let lastO = -1;
function setDesktop(o) {
  if (o === lastO) return;
  lastO = o;
  desk.style.opacity = o;
  desk.style.visibility = o > .002 ? 'visible' : 'hidden';
  body.classList.toggle('at-desktop', o > .5);
  const on = o > .9;
  if (on === shown) return;
  shown = on;
  desk.classList.toggle('on', on);
  if (!on) { closeStart(); return; }
  if (pendingWin) { openWin(pendingWin); pendingWin = null; }
  else if (!greeted) {
    setTimeout(() => openWin('about'), reduce ? 0 : 250);
  }
  if (!greeted) {
    greeted = true;
    const t = $('#toast');
    setTimeout(() => { t.hidden = false; }, 1400);
    setTimeout(() => { t.hidden = true; }, 9000);
  }
}

// Modo estático: sin WebGL o con movimiento reducido.
function goStatic() {
  if (body.classList.contains('nogl')) return;
  body.classList.add('nogl');
  $('#boot').classList.add('done');
  setDesktop(1);
}

window.JPT = { openWin, setDesktop, goStatic, drawWallpaper, ready: false };

paintWall();
const noImportMap = !(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'));
if (reduce || noImportMap) goStatic();
// red lenta o algo falló al cargar la escena: el escritorio funciona igual
setTimeout(() => { if (!window.JPT.ready) goStatic(); }, 20000);
