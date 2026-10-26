// Historia en 3D: un cuarto que cambia con el scroll.
// CRT de los inicios → noche → setup moderno → la cámara entra a la pantalla (escritorio).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const JPT = window.JPT;
const body = document.body;
const $ = s => document.querySelector(s);

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const range = (p, a, b) => smooth(clamp((p - a) / (b - a), 0, 1));
const lerp = (a, b, t) => a + (b - a) * t;
function track(keys, p) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, v0] = keys[i - 1], [p1, v1] = keys[i];
      return v0 + (v1 - v0) * smooth((p - p0) / (p1 - p0));
    }
  }
  return keys[keys.length - 1][1];
}
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function fitFont(g, text, maxW, px, family) {
  g.font = `${px}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) { px = Math.floor(px * maxW / w); g.font = `${px}px ${family}`; }
  return px;
}

const bootBar = $('#bootBar'), bootPct = $('#bootPct');
function bootTo(v) { bootBar.style.transform = `scaleX(${v})`; bootPct.textContent = Math.round(v * 100) + '%'; }

if (!body.classList.contains('nogl')) {
  start().catch(err => { console.error(err); JPT.goStatic(); });
}

async function start() {
  bootTo(.2);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;

  // ---------- render ----------
  const canvas = $('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) { JPT.goStatic(); return; }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); JPT.goStatic(); return; }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const BG_DAY = new THREE.Color(0x120b08), BG_NIGHT = new THREE.Color(0x05060c);
  scene.background = BG_DAY.clone();
  scene.fog = new THREE.Fog(0x120b08, 5, 13);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 40);

  // ---------- fuentes antes de dibujar las pantallas ----------
  await Promise.race([
    Promise.all([
      document.fonts.load('170px Anton'), document.fonts.load('italic 500 50px Inter'), document.fonts.load('800 400px Inter'),
      document.fonts.load('500 30px "JetBrains Mono"'), document.fonts.load('500 40px Caveat'), document.fonts.load('500 20px Inter'),
    ]).catch(() => {}),
    new Promise(r => setTimeout(r, 3000)),
  ]);
  bootTo(.4);

  // ---------- texturas de canvas ----------
  const textures = [];
  function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    textures.push(t);
    return t;
  }

  // pared con patrón
  const wallTex = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#5a3d2e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * .07})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    const motif = (x, y) => {
      g.fillStyle = 'rgba(28,14,8,.5)';
      [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]].forEach(([a, b]) => g.fillRect(x + a * 3, y + b * 3, 3, 3));
    };
    for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) { motif(x + 14, y + 12); motif(x + 46, y + 44); }
  }, { repeat: [12, 6] });

  const woodTex = canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = '#7a4a2e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * H, a = .04 + rnd() * .08;
      g.strokeStyle = rnd() > .5 ? `rgba(40,20,10,${a})` : `rgba(255,210,170,${a * .6})`;
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * .02 + i) * 3);
      g.stroke();
    }
  }, { repeat: [3, 1] });

  const floorTex = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#2a1a12'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, W, 2); }
  }, { repeat: [10, 6] });

  const shadowTex = canvasTex(128, 128, (g, W, H) => {
    const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    r.addColorStop(0, 'rgba(0,0,0,.85)'); r.addColorStop(.55, 'rgba(0,0,0,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  });

  const dotTex = canvasTex(64, 64, (g, W, H) => {
    const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  });

  const keysTex = (base, key) => canvasTex(512, 160, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const rows = [14, 14, 13, 12];
    rows.forEach((n, r) => {
      const kw = (W - 24) / 14.6;
      for (let i = 0; i < n; i++) {
        const x = 12 + i * kw + r * kw * .3, y = 10 + r * 30;
        g.fillStyle = key; rr(g, x, y, kw - 5, 25, 4); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 1, y + 21, kw - 7, 4);
      }
    });
    g.fillStyle = key; rr(g, 12 + 3.6 * 33, 132, 33 * 6.5, 22, 4); g.fill();
  });

  // pantalla CRT ---------------------------------------------------
  function bubble(g, x, y, text, size) {
    g.font = `italic 500 ${size}px Inter`;
    const tw = g.measureText(text).width;
    const w = tw + size * 1.2, h = size * 1.75, r = h / 2;
    g.fillStyle = '#5fb0e4'; g.strokeStyle = '#25506f'; g.lineWidth = size * .16;
    rr(g, x, y, w, h, r); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x + w - r * 1.1, y + h - 2); g.lineTo(x + w + size * .3, y + h + size * .55); g.lineTo(x + w - r * .2, y + h * .55); g.closePath();
    g.fill();
    g.fillStyle = '#f3f9ff'; g.textBaseline = 'middle'; g.fillText(text, x + size * .6, y + h / 2 + 2); g.textBaseline = 'alphabetic';
  }
  const CRT_W = 1024, CRT_H = 768;
  const crtTex = [
    canvasTex(CRT_W, CRT_H, (g, W, H) => {
      g.fillStyle = '#0a2034'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#10304b'; g.font = '800 400px Inter';
      g.fillText('hola', -24, 330); g.fillText('mundo', -34, 730);
      bubble(g, 116, 170, 'Todo empezó', 50);
      g.fillStyle = '#efe8d8';
      const px = fitFont(g, 'DE APRENDER', 800, 172, 'Anton');
      g.font = `${px}px Anton`;
      g.fillText('CON HAMBRE', 110, 470); g.fillText('DE APRENDER', 110, 470 + px * 1.02);
    }),
    canvasTex(CRT_W, CRT_H, (g, W, H) => {
      g.fillStyle = '#0a2034'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#10304b'; g.font = '800 470px Inter'; g.fillText('2021', -14, 700);
      g.font = '500 30px "JetBrains Mono"'; g.fillStyle = '#7fc4ef'; g.fillText('C:\\JPT> python hola_mundo.py', 92, 112);
      g.font = '500 40px "JetBrains Mono"'; g.fillStyle = '#efe8d8'; g.fillText('print("hola mundo")', 92, 190);
      g.fillStyle = '#8ef0a7'; g.fillText('> hola mundo', 92, 246);
      g.fillStyle = '#efe8d8'; g.fillRect(92 + g.measureText('> hola mundo ').width, 214, 22, 40);
      bubble(g, 92, 318, '2021 · Accedo', 40);
      g.fillStyle = '#efe8d8'; g.font = '150px Anton';
      g.fillText('PRIMER', 92, 560); g.fillText('TRABAJO', 92, 708);
    }),
    canvasTex(CRT_W, CRT_H, (g, W, H) => {
      g.fillStyle = '#04150e'; g.fillRect(0, 0, W, H);
      g.font = '500 28px "JetBrains Mono"';
      [['jpt@noc:~$ nmap -sV 10.0.0.0/24', '#7dffa8'], ['PORT     STATE  SERVICE', '#3fbf73'], ['22/tcp   open   ssh', '#3fbf73'],
        ['80/tcp   open   http', '#3fbf73'], ['443/tcp  open   https', '#3fbf73'], ['jpt@noc:~$ sudo ./hardening.sh', '#7dffa8'],
        ['[ ok ] firewall activo', '#3fbf73'], ['[ ok ] fail2ban en guardia', '#3fbf73'], ['[ ok ] ssh solo con llaves', '#3fbf73'],
        ['jpt@noc:~$ uptime  →  99.9%', '#7dffa8']].forEach(([t, c], i) => { g.fillStyle = c; g.fillText(t, 70, 92 + i * 40); });
      g.save(); g.shadowColor = '#3dff8f'; g.shadowBlur = 26; g.fillStyle = '#dcffe9'; g.textAlign = 'right';
      fitFont(g, 'NOC & PENTEST', 880, 136, 'Anton'); g.fillText('NOC & PENTEST', W - 64, H - 58); g.restore();
    }),
  ];

  // pantalla moderna ------------------------------------------------
  const MW = 1920, MH = 1080;
  function taskbar(g, W, H) {
    const th = 64, y = H - th;
    g.fillStyle = 'rgba(14,20,38,.88)'; g.fillRect(0, y, W, th);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, y, W, 2);
    const cols = [['#63b3e6', '#3d6bff'], ['#f4f6fb', '#63b3e6'], ['#ffc94d', '#e39b2d'], ['#d18b4c', '#b8733a'], ['#5f8bff', '#a9c9ff'], ['#0d1117', '#7ee787'], ['#3d6bff', '#dbe6ff']];
    const s = 34, gap = 22, total = cols.length * s + (cols.length - 1) * gap;
    cols.forEach(([a, b], i) => {
      const x = W / 2 - total / 2 + i * (s + gap), yy = y + (th - s) / 2;
      g.fillStyle = a; rr(g, x, yy, s, s, 8); g.fill();
      g.fillStyle = b; rr(g, x + 9, yy + 12, s - 18, 6, 3); g.fill();
    });
    const d = new Date();
    g.fillStyle = '#dfe6f5'; g.textAlign = 'right';
    g.font = '500 20px Inter'; g.fillText(d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }), W - 26, y + 28);
    g.font = '400 15px Inter'; g.fillText(d.toLocaleDateString('es-CO'), W - 26, y + 50);
    g.textAlign = 'left';
  }
  function winFrame(g, x, y, w, h, title, bg = 'rgba(16,21,35,.95)') {
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
    g.fillStyle = bg; rr(g, x, y, w, h, 16); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; rr(g, x, y, w, h, 16); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 1, y + 1, w - 2, 50);
    g.fillStyle = '#cdd5e6'; g.font = '500 21px Inter'; g.fillText(title, x + 24, y + 33);
    g.strokeStyle = '#cdd5e6'; g.lineWidth = 2;
    const bx = x + w - 34;
    g.beginPath(); g.moveTo(bx - 8, y + 18); g.lineTo(bx + 8, y + 34); g.moveTo(bx + 8, y + 18); g.lineTo(bx - 8, y + 34); g.stroke();
  }
  function node(g, x, y, label, color) {
    g.fillStyle = 'rgba(255,255,255,.04)'; g.strokeStyle = color; g.lineWidth = 3;
    rr(g, x - 110, y - 34, 220, 68, 14); g.fill(); g.stroke();
    g.fillStyle = '#e9eef8'; g.font = '600 22px Inter'; g.textAlign = 'center'; g.fillText(label, x, y + 8); g.textAlign = 'left';
  }
  const modTex = [
    canvasTex(MW, MH, (g, W, H) => {
      JPT.drawWallpaper(g, W, H);
      winFrame(g, 220, 120, 980, 760, 'topologia_red.drawio');
      g.strokeStyle = 'rgba(99,179,230,.75)'; g.lineWidth = 3;
      const L = (a, b, c, d) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
      L(710, 262, 710, 338); L(710, 406, 710, 482); L(710, 550, 430, 650); L(710, 550, 710, 650); L(710, 550, 990, 650);
      node(g, 710, 228, 'Internet', '#a9c9ff'); node(g, 710, 372, 'Firewall', '#ff7b72'); node(g, 710, 516, 'Core switch · Cisco', '#63b3e6');
      node(g, 430, 684, 'VLAN 10 · Admin', '#7ee787'); node(g, 710, 684, 'VLAN 20 · Ventas', '#ffd479'); node(g, 990, 684, 'VLAN 30 · Servidores', '#c39bff');
      g.fillStyle = '#9fb0cf'; g.font = '500 20px "JetBrains Mono"'; g.fillText('port-security: ON   ·   backups: 02:00   ·   docs: al día', 270, 830);
      winFrame(g, 1260, 300, 520, 400, 'jpt@srv-01: ~', 'rgba(7,10,17,.97)');
      g.font = '500 20px "JetBrains Mono"';
      [['$ rsync -a /datos nas:/backup', '#7ee787'], ['  enviado 18.2 GB   ok', '#9fb0cf'], ['$ ping -c1 srv-02', '#7ee787'],
        ['  tiempo=0.41 ms', '#9fb0cf'], ['$ docker compose up -d', '#7ee787'], ['  ✔ api   ✔ db   ✔ web', '#cfe0ff']].forEach(([t, c], i) => {
        g.fillStyle = c; g.fillText(t, 1290, 400 + i * 44);
      });
      taskbar(g, W, H);
    }),
    canvasTex(MW, MH, (g, W, H) => {
      JPT.drawWallpaper(g, W, H);
      taskbar(g, W, H);
    }),
  ];

  // ventana: atardecer y noche en Medellín
  function mountains(g, W, H, base, amp, color, s, freq = 1) {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = base - amp * (.55 * Math.sin(x * .011 * freq + s) + .3 * Math.sin(x * .027 * freq + s * 2) + .15 * Math.sin(x * .06 * freq + s * 3));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  function cityLights(g, W, H, base, n, warm) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = base + Math.pow(rnd(), .7) * (H - base);
      const c = warm[(rnd() * warm.length) | 0];
      g.fillStyle = c; g.globalAlpha = .45 + rnd() * .55;
      g.fillRect(x, y, 2 + rnd() * 2.5, 2 + rnd() * 2);
    }
    g.globalAlpha = 1;
  }
  const winDay = canvasTex(512, 600, (g, W, H) => {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#2b1b4f'); s.addColorStop(.45, '#b44f7a'); s.addColorStop(.72, '#ff9f63'); s.addColorStop(1, '#ffd59a');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(330, 395, 10, 330, 395, 140);
    sun.addColorStop(0, 'rgba(255,240,200,1)'); sun.addColorStop(.3, 'rgba(255,200,120,.7)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    mountains(g, W, H, 400, 70, '#8a4a72', 1);
    mountains(g, W, H, 455, 70, '#5a2c55', 3, 1.3);
    mountains(g, W, H, 520, 60, '#2d1634', 5, 1.6);
    cityLights(g, W, H, 470, 90, ['#ffd27a', '#ffb05a']);
  });
  const winNight = canvasTex(512, 600, (g, W, H) => {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#03050f'); s.addColorStop(.6, '#0b1338'); s.addColorStop(1, '#1a1d4a');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${.3 + rnd() * .7})`; g.fillRect(rnd() * W, rnd() * 330, 1.5, 1.5); }
    g.fillStyle = '#f3ecd6'; g.beginPath(); g.arc(120, 110, 26, 0, 7); g.fill();
    g.fillStyle = '#03050f'; g.beginPath(); g.arc(132, 102, 24, 0, 7); g.fill();
    mountains(g, W, H, 400, 70, '#11132c', 1);
    cityLights(g, W, H, 380, 160, ['#ffcf6b', '#ffe9b0', '#ff9f5a']);
    mountains(g, W, H, 455, 70, '#0a0b1e', 3, 1.3);
    cityLights(g, W, H, 440, 420, ['#ffcf6b', '#ffe9b0', '#ff9f5a', '#ffffff']);
    mountains(g, W, H, 520, 60, '#06060f', 5, 1.6);
    cityLights(g, W, H, 510, 300, ['#ffcf6b', '#ffe9b0', '#ff9f5a']);
  });

  // pósters
  const pHola = canvasTex(550, 750, (g, W, H) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e0452b'; g.beginPath(); g.arc(W * .64, H * .33, W * .3, 0, 7); g.fill();
    g.fillStyle = '#17130f'; g.font = '500 22px "JetBrains Mono"'; g.fillText("print('hola mundo')", 34, 58);
    const px = fitFont(g, 'MUNDO', W - 64, 230, 'Anton');
    g.font = `${px}px Anton`; g.fillText('HOLA', 30, H - 40 - px * 1.0); g.fillText('MUNDO', 30, H - 40);
    g.fillStyle = '#17130f'; g.fillRect(34, H - 26, W - 68, 3);
  });
  const pSunset = canvasTex(800, 600, (g, W, H) => {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#16092c'); s.addColorStop(.55, '#6b1d5c'); s.addColorStop(1, '#ff6b3d');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    const sun = g.createLinearGradient(0, 170, 0, 470);
    sun.addColorStop(0, '#ffe066'); sun.addColorStop(1, '#ff3d77');
    g.fillStyle = sun; g.beginPath(); g.arc(W / 2, 360, 170, 0, 7); g.fill();
    g.fillStyle = '#3b1240';
    for (let i = 0; i < 7; i++) g.fillRect(0, 330 + i * 26, W, 4 + i * 2);
    g.fillStyle = '#0c0614';
    let x = 0;
    while (x < W) {
      const w = 30 + rnd() * 60, h = 70 + rnd() * 170;
      g.fillRect(x, H - h, w, h);
      g.fillStyle = '#ffcf5a';
      for (let wy = H - h + 12; wy < H - 10; wy += 18) for (let wx = x + 6; wx < x + w - 8; wx += 14) if (rnd() > .62) g.fillRect(wx, wy, 6, 8);
      g.fillStyle = '#0c0614';
      x += w + 4;
    }
    g.fillStyle = '#ffb6d0'; g.font = '500 24px "JetBrains Mono"'; g.textAlign = 'center'; g.fillText('MEDELLÍN · ETERNA PRIMAVERA', W / 2, 52);
  });
  const pBug = canvasTex(320, 440, (g, W, H) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b1b1b'; g.font = '62px Anton'; g.fillText('BUG', 24, 80); g.fillText('HUNTER', 24, 146);
    const bug = ['..X....X..', '...X..X...', '..XXXXXX..', '.XX.XX.XX.', 'XXXXXXXXXX', 'X.XXXXXX.X', 'X.X....X.X', '...XX.XX..'];
    const s = 22, ox = (W - 10 * s) / 2, oy = 185;
    bug.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') g.fillRect(ox + x * s, oy + y * s, s, s); }));
    g.fillStyle = '#e5484d'; g.fillRect(ox + 4 * s, oy + 3 * s, s, s); g.fillRect(ox + 7 * s, oy + 3 * s, s, s);
    g.fillStyle = '#1b1b1b'; g.font = '500 16px "JetBrains Mono"'; g.fillText('since 2023 · con permiso', 24, H - 26);
  });
  const pMoon = canvasTex(400, 520, (g, W, H) => {
    g.fillStyle = '#131a2c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${.3 + rnd() * .6})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    g.fillStyle = '#ebe0c4'; g.beginPath(); g.arc(200, 245, 125, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,100,70,.28)';
    [[160, 200, 22], [240, 290, 30], [150, 300, 14], [250, 190, 12]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    g.save(); g.translate(262, 210); g.rotate(-.7);
    g.fillStyle = '#e5484d'; g.beginPath(); g.moveTo(0, -48); g.lineTo(16, -18); g.lineTo(-16, -18); g.closePath(); g.fill();
    g.fillStyle = '#f4f6fb'; g.fillRect(-16, -18, 32, 50); g.restore();
    g.fillStyle = '#ebe0c4'; g.font = '50px Anton'; g.textAlign = 'center'; g.fillText('VIAJE A LA NUBE', W / 2, 440);
    g.font = '500 16px "JetBrains Mono"'; g.fillText('git push · deploy · 2026', W / 2, 480);
  });
  const pCode = canvasTex(260, 320, (g, W, H) => {
    g.fillStyle = '#1e3a2e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#efe6d2'; g.font = '120px Anton'; g.textAlign = 'center'; g.fillText('</>', W / 2, 200);
    g.font = '500 15px "JetBrains Mono"'; g.fillText('hecho a mano', W / 2, 270);
  });
  const polaroid = (c1, c2) => canvasTex(200, 240, (g, W, H) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
    const s = g.createLinearGradient(0, 14, 0, 186);
    s.addColorStop(0, c1); s.addColorStop(1, c2);
    g.fillStyle = s; g.fillRect(14, 14, W - 28, 172);
  });
  const pPol1 = polaroid('#ffb347', '#e0452b'), pPol2 = polaroid('#4facfe', '#1b2a7a');
  const note = (lines) => canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#f5d55c'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, 0, W, 30);
    g.fillStyle = '#3a2f12'; g.font = '500 46px Caveat';
    lines.forEach((l, i) => g.fillText(l, 22, 92 + i * 54));
  });
  const note1 = note(['aprende algo', 'nuevo hoy :)']), note2 = note(['backup', 'antes de', 'deploy!']);
  const neonTex = canvasTex(256, 128, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.shadowColor = '#4ff3ff'; g.shadowBlur = 18; g.fillStyle = '#dffcff'; g.font = '96px Anton'; g.textAlign = 'center'; g.fillText('</>', W / 2, 104);
  });
  const rubikTex = canvasTex(96, 96, (g) => {
    const c = ['#e5484d', '#ffd23f', '#3d6bff', '#2fbf71', '#ff8c2a', '#f4f6fb'];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { g.fillStyle = '#111'; g.fillRect(x * 32, y * 32, 32, 32); g.fillStyle = c[(x * 2 + y * 3) % 6]; rr(g, x * 32 + 3, y * 32 + 3, 26, 26, 4); g.fill(); }
  });
  bootTo(.55);

  // ---------- geometría ----------
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: 0, ...o });
  const add = (m, parent, x, y, z) => { m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), parent, x, y, z);
  const rbox = (w, h, d, mat, x, y, z, parent, r = .02) =>
    add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)), mat), parent, x, y, z);
  const cyl = (rt, rb, h, mat, x, y, z, parent, seg = 28, open = false) =>
    add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat), parent, x, y, z);
  const plane = (w, h, mat, x, y, z, parent) => add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), parent, x, y, z);
  const UP = new THREE.Vector3(0, 1, 0);
  function rod(a, b, r, mat, parent) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 12), mat);
    m.position.copy(A).add(B).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
    parent.add(m);
    return m;
  }
  function blob(x, z, sx, sz, parent, o = .55) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: o }));
    m.material.userData.base = o;
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    return add(m, parent, x, .002, z);
  }
  function framed(tex, w, h, x, y, z, parent, frame = 0x2a1d16, rot = 0) {
    const g = new THREE.Group();
    box(w + .04, h + .04, .02, std(frame, { roughness: .6 }), 0, 0, 0, g);
    plane(w, h, std(0xffffff, { map: tex, roughness: .85 }), 0, 0, .0105, g);
    g.position.set(x, y, z); g.rotation.z = rot;
    parent.add(g);
    return g;
  }

  // cuarto fijo --------------------------------------------------------
  const room = new THREE.Group(); scene.add(room);
  plane(10, 5, std(0xffffff, { map: wallTex, roughness: .95 }), 0, 1.75, -.75, room);
  const floor = plane(10, 6, std(0xffffff, { map: floorTex, roughness: .9 }), 0, -.75, 1.5, room);
  floor.rotation.x = -Math.PI / 2;
  const wood = std(0xffffff, { map: woodTex, roughness: .55 });
  box(4.1, .06, 1.42, wood, 0, -.03, -.04, room);
  box(.05, .7, 1.2, std(0x3b2418), -1.95, -.4, -.1, room);
  box(.05, .7, 1.2, std(0x3b2418), 1.95, -.4, -.1, room);

  // ventana (izquierda)
  const WX = -2.3, WY = 1.5, WZ = -.744;
  const winGlassDay = plane(.82, .96, new THREE.MeshBasicMaterial({ map: winDay }), WX, WY, WZ, room);
  const winGlassNight = plane(.82, .96, new THREE.MeshBasicMaterial({ map: winNight, transparent: true, opacity: 0 }), WX, WY, WZ + .001, room);
  const frameM = std(0xe8e1d3, { roughness: .6 });
  box(.92, .05, .06, frameM, WX, WY + .5, WZ, room); box(.92, .05, .06, frameM, WX, WY - .5, WZ, room);
  box(.05, 1.05, .06, frameM, WX - .435, WY, WZ, room); box(.05, 1.05, .06, frameM, WX + .435, WY, WZ, room);
  box(.03, .96, .04, frameM, WX, WY, WZ, room); box(.84, .03, .04, frameM, WX, WY + .12, WZ, room);
  box(1.02, .04, .14, frameM, WX, WY - .54, WZ + .05, room);

  // repisa + libros + cuadro
  box(1.05, .03, .26, std(0x4a2c1c, { roughness: .6 }), -1.3, 1.02, -.62, room);
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: .8 }), 12);
  const bookCols = ['#c8553d', '#2d6a4f', '#f2c230', '#3d5a80', '#6d597a', '#e07a5f', '#264653', '#e9c46a', '#8d5a97', '#b5838d', '#457b9d', '#d4a373'];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let bx = -1.78;
  for (let i = 0; i < 12; i++) {
    const w = .035 + rnd() * .03, h = .17 + rnd() * .09, lean = i === 11 ? -.32 : 0;
    E.set(0, 0, lean); Q.setFromEuler(E);
    M4.compose(P.set(bx + w / 2 + (lean ? .03 : 0), 1.035 + h / 2 - (lean ? .01 : 0), -.62), Q, S.set(w, h, .17));
    books.setMatrixAt(i, M4); books.setColorAt(i, new THREE.Color(bookCols[i]));
    bx += w + .004;
  }
  room.add(books);
  framed(pCode, .2, .25, -1.02, 1.17, -.68, room, 0x1a1a1a, -.06).rotation.x = -.08;
  framed(pHola, .5, .68, -1.28, 1.76, -.735, room, 0x1d1712);

  // derecha: pósters y polaroids
  framed(pSunset, .76, .57, 1.42, 1.82, -.735, room, 0x1d1712);
  framed(pBug, .3, .41, 1.08, 1.12, -.735, room, 0x111111, .03);
  framed(pMoon, .38, .5, 1.58, 1.1, -.735, room, 0x2a1d16, -.02);
  framed(pPol1, .16, .19, 2.02, 1.72, -.738, room, 0xf4f1ea, .12);
  framed(pPol2, .16, .19, 2.22, 1.46, -.738, room, 0xf4f1ea, -.1);

  // planta
  const plantG = new THREE.Group(); room.add(plantG); plantG.position.set(1.52, 0, -.3);
  cyl(.11, .085, .2, std(0xb5562f, { roughness: .8, side: THREE.DoubleSide }), 0, .1, 0, plantG, 28, true);
  cyl(.104, .104, .01, std(0x2a1a10), 0, .18, 0, plantG);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), std(0xffffff, { roughness: .6 }), 54);
  for (let i = 0; i < 54; i++) {
    const a = rnd() * Math.PI * 2, r = .03 + rnd() * .2, y = .25 + rnd() * .45;
    E.set(rnd() * 1.2 - .6, a, rnd() * 1.2 - .6); Q.setFromEuler(E);
    M4.compose(P.set(Math.cos(a) * r, y, Math.sin(a) * r), Q, S.set(.075, .012, .038));
    leaves.setMatrixAt(i, M4);
    leaves.setColorAt(i, new THREE.Color().setHSL(.3 + rnd() * .06, .45 + rnd() * .2, .2 + rnd() * .14));
  }
  plantG.add(leaves);
  blob(1.52, -.3, .45, .45, room, .5);

  // taza + cubo + lápices
  const mugM = std(0xf0ece4, { roughness: .4, side: THREE.DoubleSide });
  cyl(.045, .04, .1, mugM, .98, .05, .28, room, 28, true);
  cyl(.04, .04, .002, mugM, .98, .001, .28, room);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.027, .008, 8, 16), mugM); handle.position.set(1.03, .05, .28); room.add(handle);
  cyl(.043, .043, .002, std(0x2b1608), .98, .085, .28, room);
  const rubik = box(.06, .06, .06, std(0xffffff, { map: rubikTex, roughness: .4 }), 1.22, .03, .42, room); rubik.rotation.y = .5;
  cyl(.04, .036, .11, std(0xe9e4d8, { roughness: .5, side: THREE.DoubleSide }), -1.35, .055, .32, room, 20, true);
  ['#e5484d', '#3d6bff', '#f2c230'].forEach((c, i) => rod([-1.36 + i * .012, .05, .31 + i * .01], [-1.37 + i * .03, .2, .3 + i * .02], .005, std(c), room));
  [[.98, .28, .14], [1.22, .42, .12], [-1.35, .32, .14]].forEach(([x, z, s]) => blob(x, z, s, s, room, .45));

  // época 1: CRT --------------------------------------------------------
  const old = new THREE.Group(); scene.add(old);
  const beige = std(0xd8cdb8, { roughness: .55 }), beige2 = std(0xc3b79f, { roughness: .6 });
  const dark = std(0x1c1b1a, { roughness: .5 });
  rbox(.88, .17, .62, beige, 0, .085, .02, old, .025);
  box(.28, .02, .012, dark, -.18, .105, .336, old);
  box(.18, .012, .012, dark, .2, .065, .336, old);
  const ledOld = box(.022, .012, .012, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6dff8a).multiplyScalar(3) }), .34, .105, .336, old);
  rbox(.38, .04, .3, beige2, 0, .19, 0, old, .015);
  rbox(.78, .64, .5, beige, 0, .53, 0, old, .045);
  rbox(.58, .48, .34, beige2, 0, .53, -.36, old, .06);
  box(.68, .53, .01, std(0x2e2c29, { roughness: .35 }), 0, .55, .25, old);
  box(.07, .02, .012, beige2, .22, .255, .252, old); box(.03, .03, .012, beige2, .31, .255, .252, old);
  const crtGlowStrip = box(.012, .012, .012, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb46b).multiplyScalar(2.5) }), .31, .275, .26, old);
  const screenGeo = new THREE.PlaneGeometry(.64, .48);
  const n1 = plane(.11, .11, std(0xffffff, { map: note1, roughness: .9 }), .33, .8, .253, old); n1.rotation.z = -.14;
  const n2 = plane(.1, .1, std(0xffffff, { map: note2, roughness: .9 }), -.27, .171, .2, old); n2.rotation.set(-Math.PI / 2, 0, .3);
  rbox(.72, .034, .22, beige, 0, .017, .48, old, .01);
  plane(.68, .2, std(0xffffff, { map: keysTex('#cfc4ad', '#e6dcc8'), roughness: .7 }), 0, .0345, .48, old).rotation.x = -Math.PI / 2;
  rbox(.07, .032, .11, beige, .55, .016, .48, old, .016);
  // disquetes
  const flop = std(0x23365c, { roughness: .5 });
  box(.09, .006, .09, flop, -.62, .003, .45, old).rotation.y = .3;
  box(.09, .006, .09, std(0x111111, { roughness: .5 }), -.6, .009, .44, old).rotation.y = .1;
  // parlantes de madera
  const woodSp = std(0xffffff, { roughness: .6, map: woodTex });
  [-.64, .64].forEach(x => {
    rbox(.2, .28, .2, woodSp, x, .14, .02, old, .015);
    const c = new THREE.Mesh(new THREE.CircleGeometry(.065, 28), std(0x151515, { roughness: .9 })); c.position.set(x, .16, .1205); old.add(c);
    const c2 = new THREE.Mesh(new THREE.CircleGeometry(.025, 20), std(0x2a2a2a, { roughness: .4 })); c2.position.set(x, .16, .121); old.add(c2);
    blob(x, .02, .34, .34, old, .5);
  });
  // lámpara de brazo
  const lampM = std(0x8a8a8a, { roughness: .35, metalness: .6 });
  cyl(.09, .1, .03, lampM, -.86, .015, -.08, old);
  rod([-.86, .03, -.08], [-.92, .55, -.22], .012, lampM, old);
  rod([-.92, .55, -.22], [-.6, .74, .02], .012, lampM, old);
  const head = cyl(.03, .1, .16, std(0x6f6f6f, { roughness: .4, metalness: .5, side: THREE.DoubleSide }), -.56, .7, .05, old, 28, true);
  head.lookAt(new THREE.Vector3(-.2, .2, .5)); head.rotateX(-Math.PI / 2);
  const bulbOld = add(new THREE.Mesh(new THREE.SphereGeometry(.03, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .78, .5).multiplyScalar(4) })), old, -.535, .665, .085);
  blob(0, .02, 1.2, .9, old, .6);
  blob(-.86, -.08, .3, .3, old, .5);
  blob(0, .48, .9, .35, old, .4);

  // época 2: setup moderno --------------------------------------------
  const nu = new THREE.Group(); scene.add(nu);
  const blackM = std(0x121318, { roughness: .35, metalness: .4 });
  rbox(1.12, .66, .035, blackM, 0, .8, -.28, nu, .012);
  rbox(.5, .025, .05, blackM, 0, 1.15, -.265, nu, .01);
  const barGlow = plane(.46, .01, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(3) }), 0, 1.137, -.24, nu);
  barGlow.rotation.x = Math.PI / 2;
  cyl(.02, .02, .5, blackM, 0, .25, -.33, nu);
  rbox(.16, .02, .12, blackM, 0, .01, -.33, nu, .008);
  rbox(.82, .022, .26, std(0xd7dbe2, { roughness: .45 }), 0, .011, .36, nu, .01);
  plane(.78, .23, std(0xffffff, { map: keysTex('#cfd4dc', '#f4f6fa'), roughness: .6 }), 0, .0225, .36, nu).rotation.x = -Math.PI / 2;
  const mouseN = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), std(0xe9ecf1, { roughness: .4 }));
  mouseN.scale.set(.032, .018, .055); add(mouseN, nu, .6, .012, .38);
  rbox(.36, .003, .3, std(0x1d1f26, { roughness: .9 }), .6, .0015, .38, nu, .001);
  rbox(.075, .008, .15, std(0x0b0b0e, { roughness: .3, metalness: .5 }), -.68, .004, .34, nu, .006).rotation.y = .25;
  [-.8, .8].forEach(x => {
    rbox(.15, .32, .15, std(0x16171c, { roughness: .5 }), x, .16, -.15, nu, .02);
    const c = new THREE.Mesh(new THREE.CircleGeometry(.045, 24), std(0x08080a, { roughness: .9 })); c.position.set(x, .2, -.0745); nu.add(c);
    blob(x, -.15, .3, .3, nu, .5);
  });
  // lámpara moderna
  rbox(.12, .012, .12, blackM, -1.08, .006, -.2, nu, .005);
  rod([-1.08, .01, -.2], [-1.08, .62, -.2], .008, blackM, nu);
  rod([-1.08, .62, -.2], [-.86, .62, .02], .008, blackM, nu);
  const bulbNew = plane(.16, .016, new THREE.MeshBasicMaterial({ color: new THREE.Color(.85, .9, 1).multiplyScalar(3.5), side: THREE.DoubleSide }), -.95, .61, -.07, nu);
  bulbNew.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  // tira LED y neón
  const ledStrip = plane(1.0, .012, new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .3, 1).multiplyScalar(3) }), -1.3, 1.002, -.5, nu);
  ledStrip.rotation.x = Math.PI / 2;
  const neon = plane(.3, .15, new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) }), 2.12, 1.04, -.74, nu);
  blob(0, -.25, 1.3, .5, nu, .5);
  blob(0, .36, 1.0, .4, nu, .4);

  // pantallas (shader con curvatura CRT, scanlines y glitch) -------------
  const screenVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const screenFS = `
    uniform sampler2D map; uniform sampler2D map2; uniform float uMix;
    uniform float uTime, uGlitch, uOff, uPower, uOpacity, uCRT, uBoost;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5;
      c *= 1.0 + uCRT * .2 * dot(c, c);
      float sy = mix(1.0, .006, smoothstep(0.0, .55, uOff));
      float sx = mix(1.0, .006, smoothstep(.5, 1.0, uOff));
      vec2 uv = vec2(c.x / sx, c.y / sy) + .5;
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      float band = step(.8, rand(vec2(floor(uv.y * 26.0), floor(uTime * 20.0))));
      uv.x += uGlitch * (band * .07 + .006) * (rand(vec2(floor(uTime * 30.0), uv.y)) - .5);
      float ab = .0018 * uCRT + .014 * uGlitch;
      vec3 a = vec3(texture2D(map, uv + vec2(ab, 0.)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(ab, 0.)).b);
      vec3 b = vec3(texture2D(map2, uv + vec2(ab, 0.)).r, texture2D(map2, uv).g, texture2D(map2, uv - vec2(ab, 0.)).b);
      vec3 col = mix(a, b, uMix);
      col *= mix(1.0, .86 + .14 * sin(uv.y * 960.0), uCRT);
      float vig = smoothstep(.95, .25, length(c * vec2(1.0, 1.2)));
      col *= mix(1.0, vig, .55 * uCRT + .1);
      col *= 1.0 + uCRT * .02 * sin(uTime * 50.0);
      float flash = smoothstep(.25, .55, uOff) * (1.0 - smoothstep(.85, 1.0, uOff));
      col = mix(col, vec3(1.4), flash * .85);
      vec3 glass = vec3(.012, .016, .02);
      col = mix(glass, col * uBoost, inside * uPower);
      gl_FragColor = vec4(col, uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const mkScreen = (tex, crt) => new THREE.ShaderMaterial({
    vertexShader: screenVS, fragmentShader: screenFS, transparent: true,
    uniforms: {
      map: { value: tex }, map2: { value: tex }, uMix: { value: 0 }, uTime: { value: 0 }, uGlitch: { value: 0 },
      uOff: { value: 0 }, uPower: { value: 1 }, uOpacity: { value: 1 }, uCRT: { value: crt }, uBoost: { value: 1.04 },
    },
  });
  const crtMat = mkScreen(crtTex[0], 1);
  add(new THREE.Mesh(screenGeo, crtMat), old, 0, .55, .258);
  const modMat = mkScreen(modTex[0], 0);
  modMat.uniforms.uPower.value = 0;
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.08, .6075), modMat), nu, 0, .8, -.2605);

  // polvo / estrellas
  const N = small ? 160 : 280;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - .5) * 5.4; pos[i * 3 + 1] = rnd() * 2.6; pos[i * 3 + 2] = -.7 + rnd() * 2.2; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ map: dotTex, size: .014, color: 0xffd8a8, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  // materiales que se desvanecen por época
  function fader(group) {
    const mats = new Set();
    group.traverse(o => { if (o.material) mats.add(o.material); });
    mats.forEach(m => { m.transparent = true; if (m.userData.base === undefined) m.userData.base = m.opacity; });
    let last = -1;
    const f = (o) => {
      if (Math.abs(o - last) < .001) return;
      last = o;
      group.visible = o > .002;
      mats.forEach(m => {
        if (m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = o;
        else m.opacity = m.userData.base * o;
      });
    };
    f.reset = () => { last = -1; };
    return f;
  }
  const fadeOld = fader(old), fadeNew = fader(nu);

  // luces ----------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffd7b0, 0x2a160e, 1); scene.add(hemi);
  const roomFill = new THREE.PointLight(0xffa463, 5, 9, 2); roomFill.position.set(.4, 2.1, 1.7); scene.add(roomFill);
  const deskSpot = new THREE.SpotLight(0xffb070, 4, 5, .7, .75, 2); deskSpot.position.set(-.55, .68, .06); scene.add(deskSpot);
  deskSpot.target.position.set(-.15, 0, .4); scene.add(deskSpot.target);
  const screenGlow = new THREE.PointLight(0x5aa8ff, 1.1, 2.6, 2); screenGlow.position.set(0, .55, .6); scene.add(screenGlow);
  const barSpot = new THREE.SpotLight(0xdfe8ff, 0, 3, .75, .85, 2); barSpot.position.set(0, 1.13, -.2); scene.add(barSpot);
  barSpot.target.position.set(0, 0, .4); scene.add(barSpot.target);
  const ledLight = new THREE.PointLight(0x8a5cff, 0, 2.2, 2); ledLight.position.set(-1.3, .9, -.45); scene.add(ledLight);
  const DAY = { hemiSky: new THREE.Color(0xffd7b0), hemiGround: new THREE.Color(0x2a160e), fill: new THREE.Color(0xffa463) };
  const NIGHT = { hemiSky: new THREE.Color(0x5b6bb0), hemiGround: new THREE.Color(0x07070e), fill: new THREE.Color(0x6a7dff) };
  const OLD_SPOT = new THREE.Vector3(-.55, .68, .06), NEW_SPOT = new THREE.Vector3(-.95, .6, -.07);
  const OLD_SPOT_T = new THREE.Vector3(-.15, 0, .4), NEW_SPOT_T = new THREE.Vector3(-.55, 0, .3);
  const WARM = new THREE.Color(0xffb070), COOL = new THREE.Color(0xdfe6ff);
  const CRT_GLOW = new THREE.Color(0x5aa8ff), MON_GLOW = new THREE.Color(0x3b6cff);
  const CRT_GLOW_P = new THREE.Vector3(0, .55, .6), MON_GLOW_P = new THREE.Vector3(0, .8, .25);

  // ---------- post-proceso ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: (devicePixelRatio || 1) > 1.4 ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .45, .9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // calidad adaptable: si el equipo no da, bajamos resolución y apagamos el bloom
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const LEVELS = [
    { dpr: Math.min(DPR, 1.75), bloom: true },
    { dpr: Math.min(DPR, 1.35), bloom: true },
    { dpr: Math.min(DPR, 1.1), bloom: false },
    { dpr: Math.min(DPR, .85), bloom: false },
  ];
  let level = coarse || small ? 2 : 0;
  if (coarse && DPR < 1.5) level = 1;
  let W = 0, H = 0;
  function applySize() {
    W = innerWidth; H = innerHeight;
    const L = LEVELS[level];
    renderer.setPixelRatio(L.dpr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(L.dpr);
    composer.setSize(W, H);
    bloom.resolution.set(W * L.dpr / 2, H * L.dpr / 2);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    buildShots();
  }

  // ---------- cámara: tomas encadenadas por el scroll ----------
  const SHOTS = [
    { p: 0.000, t: [0, .55, .258], d: [0, 0, 1], w: .8, h: .6, crop: 1 },
    { p: 0.045, t: [0, .55, .258], d: [0, 0, 1], w: .82, h: .615, crop: 1 },
    { p: 0.170, t: [0, .95, 0], d: [0, .14, 1], w: 3.0, h: 2.05 },
    { p: 0.245, t: [.06, .95, 0], d: [.1, .15, 1], w: 3.05, h: 2.08 },
    { p: 0.330, t: [-1.65, 1.42, -.6], d: [.5, .04, 1], w: 2.05, h: 1.3, crop: .62 },
    { p: 0.385, t: [-1.58, 1.4, -.6], d: [.42, .02, 1], w: 1.95, h: 1.25, crop: .62 },
    { p: 0.470, t: [1.62, 1.5, -.6], d: [-.5, .04, 1], w: 2.2, h: 1.45, crop: .62 },
    { p: 0.525, t: [1.56, 1.48, -.6], d: [-.42, .02, 1], w: 2.1, h: 1.4, crop: .62 },
    { p: 0.615, t: [0, .95, 0], d: [0, .2, 1], w: 3.2, h: 2.15 },
    { p: 0.680, t: [0, .93, -.05], d: [-.06, .18, 1], w: 3.0, h: 2.0 },
    { p: 0.760, t: [0, .82, -.26], d: [0, .08, 1], w: 2.5, h: 1.45, crop: .7 },
    { p: 0.880, t: [0, 1.04, -.26], d: [0, .04, 1], w: 2.0, h: 1.3, crop: .75 },
    { p: 0.985, t: [0, .8, -.26], d: [0, 0, 1], w: 1.08, h: .6075, cover: true },
  ];
  const keys = SHOTS.map(s => ({ p: s.p, pos: new THREE.Vector3(), tgt: new THREE.Vector3(...s.t), mp: new THREE.Vector3(), mt: new THREE.Vector3() }));
  function buildShots() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), asp = camera.aspect;
    const portrait = clamp((1.15 - asp) / .65, 0, 1);
    SHOTS.forEach((s, i) => {
      const w = s.w * lerp(1, s.crop ?? .45, portrait);
      const dh = s.h / (2 * tanH), dw = w / (2 * tanH * asp);
      const dist = s.cover ? Math.min(dh, dw) : Math.max(dh, dw);
      keys[i].pos.set(...s.d).normalize().multiplyScalar(dist).add(keys[i].tgt);
    });
    // tangentes (Catmull-Rom no uniforme) para que la cámara nunca frene en seco
    keys.forEach((k, i) => {
      if (i === 0 || i === keys.length - 1) { k.mp.set(0, 0, 0); k.mt.set(0, 0, 0); return; }
      const a = keys[i - 1], b = keys[i + 1], dp = b.p - a.p;
      k.mp.copy(b.pos).sub(a.pos).divideScalar(dp).multiplyScalar(.8);
      k.mt.copy(b.tgt).sub(a.tgt).divideScalar(dp).multiplyScalar(.8);
    });
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function hermite(out, i, t, field, tan) {
    const k0 = keys[i], k1 = keys[i + 1], dt = k1.p - k0.p;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.copy(k0[field]).multiplyScalar(h00)
      .add(tmpA.copy(k0[tan]).multiplyScalar(h10 * dt))
      .add(tmpB.copy(k1[field]).multiplyScalar(h01))
      .add(tmpA.copy(k1[tan]).multiplyScalar(h11 * dt));
  }
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
  function cameraAt(p) {
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1].p) i++;
    const t = clamp((p - keys[i].p) / (keys[i + 1].p - keys[i].p), 0, 1);
    hermite(camPos, i, t, 'pos', 'mp');
    hermite(camTgt, i, t, 'tgt', 'mt');
  }

  // ---------- estado de la historia ----------
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  const story = $('#story');
  const maxScroll = () => Math.max(1, story.offsetHeight - innerHeight);
  const scrollP = () => clamp(scrollY / maxScroll(), 0, 1);
  let p = scrollP();

  const caps = [...document.querySelectorAll('.cap')].map(el => {
    const [a, b, c, d] = el.dataset.range.split(',').map(Number);
    return { el, a, b, c, d, x: el.dataset.x || '0px', y: el.dataset.y || '0px', side: el.classList.contains('cap-side'), kids: [...el.children], o: -1 };
  });
  let mobileLayout = innerWidth <= 760;
  function updateCaps(p) {
    for (const c of caps) {
      const o = p < c.b ? range(p, c.a, c.b) : 1 - range(p, c.c, c.d);
      if (Math.abs(o - c.o) < .0015) continue;
      c.o = o;
      c.el.style.visibility = o > .001 ? 'visible' : 'hidden';
      c.el.style.opacity = o.toFixed(3);
      const y = c.side && mobileLayout ? '0px' : c.y;
      c.el.style.transform = `translate(${c.x}, ${y})`;
      const dir = p < c.b ? 1 : -1;
      c.kids.forEach((k, i) => { k.style.transform = `translate3d(0, ${(dir * (1 - o) * (26 + i * 16)).toFixed(1)}px, 0)`; });
    }
  }

  const hint = $('#hint'), skip = $('#skip');
  const CHAPTERS = [[0, 'El inicio'], [.255, 'Primer trabajo'], [.415, 'Seguridad'], [.56, 'El cambio'], [.7, 'Infraestructura'], [.85, 'Hoy']];
  const chapNum = $('#chapNum'), chapName = $('#chapName'), chapBar = $('#chapBar');
  let chap = -1;

  // pantallas: transiciones entre estados
  function screenSwitcher(mat, texs) {
    let cur = 0, target = 0;
    return {
      set(i) { target = i; },
      step(dt) {
        const u = mat.uniforms;
        if (u.uMix.value === 0 && target !== cur) { u.map2.value = texs[target]; u.uMix.value = .0001; if (mat === crtMat) glitch = 1; }
        if (u.uMix.value > 0) {
          u.uMix.value = Math.min(1, u.uMix.value + dt * 4.5);
          if (u.uMix.value >= 1) { cur = texs.indexOf(u.map2.value); u.map.value = u.map2.value; u.uMix.value = 0; }
        }
      },
    };
  }
  let glitch = 0;
  const crtSw = screenSwitcher(crtMat, crtTex), modSw = screenSwitcher(modMat, modTex);

  // mouse: mirar alrededor
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!coarse) addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth * 2 - 1; mouse.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  const cFog = new THREE.Color();
  function update(p, time, dt) {
    // cámara
    cameraAt(p);
    const look = 1 - range(p, .86, .95);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    upv.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const dist = camPos.distanceTo(camTgt);
    camera.position.copy(camPos)
      .addScaledVector(right, mouse.x * .045 * dist * look)
      .addScaledVector(upv, -mouse.y * .03 * dist * look)
      .addScaledVector(upv, Math.sin(time * .6) * .004 * dist * look);
    camera.lookAt(camTgt);

    // día → noche
    const night = range(p, .555, .625);
    hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, night);
    hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, night);
    hemi.intensity = lerp(1, .34, night);
    roomFill.color.lerpColors(DAY.fill, NIGHT.fill, night);
    roomFill.intensity = lerp(5, 1.3, night);
    scene.background.lerpColors(BG_DAY, BG_NIGHT, night);
    cFog.lerpColors(BG_DAY, BG_NIGHT, night); scene.fog.color.copy(cFog);
    winGlassNight.material.opacity = range(p, .55, .62);

    // CRT: estados y apagado
    crtSw.set(p < .255 ? 0 : p < .415 ? 1 : 2);
    const off = range(p, .535, .575);
    crtMat.uniforms.uOff.value = off;
    fadeOld(1 - range(p, .56, .59));
    old.position.y = -range(p, .56, .59) * .04;

    // setup moderno
    const nuO = range(p, .58, .615);
    fadeNew(nuO);
    nu.position.y = (1 - nuO) * -.05;
    const power = range(p, .605, .64);
    modMat.uniforms.uPower.value = power * (1 + .25 * Math.sin(power * Math.PI));
    modSw.set(p < .835 ? 0 : 1);

    // luces que cambian con la época
    deskSpot.position.lerpVectors(OLD_SPOT, NEW_SPOT, night);
    deskSpot.target.position.lerpVectors(OLD_SPOT_T, NEW_SPOT_T, night);
    deskSpot.color.lerpColors(WARM, COOL, night);
    deskSpot.intensity = 4 * (1 - range(p, .555, .585)) + 2.2 * range(p, .59, .625);
    screenGlow.position.lerpVectors(CRT_GLOW_P, MON_GLOW_P, night);
    screenGlow.color.lerpColors(CRT_GLOW, MON_GLOW, night);
    screenGlow.intensity = 1.1 * (1 - off) * (1 - night) + 3.2 * power;
    barSpot.intensity = 2.2 * range(p, .59, .63);
    ledLight.intensity = 2.2 * range(p, .59, .64);

    // polvo que se vuelve "estrellas" de noche
    dustMat.color.setRGB(lerp(1, .75, night), lerp(.85, .85, night), lerp(.66, 1, night));
    dustMat.opacity = lerp(.45, .7, night);
    dust.position.y = Math.sin(time * .25) * .03;
    dust.rotation.y = Math.sin(time * .05) * .04;

    // shaders
    glitch = Math.max(0, glitch - dt * 2.6);
    crtMat.uniforms.uGlitch.value = glitch * glitch + (p < .05 ? .02 : 0);
    crtMat.uniforms.uTime.value = time;
    modMat.uniforms.uTime.value = time;
    crtSw.step(dt); modSw.step(dt);
    ledOld.material.color.setRGB(1.3, 3, 1.6).multiplyScalar(Math.sin(time * 3) > 0 ? 1 : .35);

    // interfaz
    updateCaps(p);
    hint.style.opacity = (1 - range(p, .015, .055)).toFixed(3);
    hint.style.pointerEvents = p < .04 ? 'auto' : 'none';
    const so = 1 - range(p, .9, .94);
    skip.style.opacity = so.toFixed(3);
    skip.style.pointerEvents = so > .5 ? 'auto' : 'none';
    let ci = 0;
    while (ci < CHAPTERS.length - 1 && p >= CHAPTERS[ci + 1][0]) ci++;
    if (ci !== chap) { chap = ci; chapNum.textContent = String(ci + 1).padStart(2, '0'); chapName.textContent = CHAPTERS[ci][1]; }
    const c0 = CHAPTERS[ci][0], c1 = ci < CHAPTERS.length - 1 ? CHAPTERS[ci + 1][0] : .95;
    chapBar.style.transform = `scaleX(${clamp((p - c0) / (c1 - c0), 0, 1).toFixed(3)})`;
    JPT.setDesktop(range(p, .95, .988));
  }

  function render() {
    if (LEVELS[level].bloom) composer.render();
    else renderer.render(scene, camera);
  }

  // ---------- precompilar y subir texturas (evita tirones a mitad de la historia) ----------
  applySize();
  textures.forEach(t => renderer.initTexture(t));
  update(p, 0, 0);
  old.visible = nu.visible = true;
  render(); // compila los shaders de las dos épocas de una vez
  bootTo(.85);
  await new Promise(r => requestAnimationFrame(r));
  fadeOld.reset(); fadeNew.reset();
  update(p, 0, 0);
  render();
  bootTo(1);

  if (body.classList.contains('nogl')) { renderer.dispose(); return; }
  JPT.ready = true;
  setTimeout(() => $('#boot').classList.add('done'), 350);

  let last = performance.now(), time = 0, dirty = true, avg = 16.7, frames = 0, sinceChange = 0;

  // ---------- eventos ----------
  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      // en móvil la barra de direcciones cambia el alto al hacer scroll: ignoramos esos saltos pequeños
      if (coarse && innerWidth === W && Math.abs(innerHeight - H) < 160) return;
      mobileLayout = innerWidth <= 760;
      caps.forEach(c => { c.o = -1; });
      applySize();
      dirty = true;
    }, 120);
  });
  const fade = $('#fade');
  addEventListener('jpt:skip', () => {
    if (p > .86) { scrollTo({ top: maxScroll(), behavior: 'smooth' }); return; }
    fade.classList.add('on');
    setTimeout(() => {
      scrollTo({ top: maxScroll(), behavior: 'auto' });
      p = .87;
      dirty = true;
      fade.classList.remove('on');
    }, 240);
  });
  addEventListener('jpt:next', () => scrollBy({ top: innerHeight * 1.15, behavior: 'smooth' }));
  addEventListener('jpt:replay', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // modo de prueba: ?still renderiza fotogramas sueltos (capturas automáticas)
  if (/[?&]still\b/.test(location.search)) {
    window.__still = (pp) => { p = pp; for (let i = 0; i < 4; i++) update(p, i * .3, .3); render(); };
    return;
  }

  // ---------- bucle ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    time += dt;
    const target = scrollP();
    p += (target - p) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(target - p) < 1e-5) p = target;
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 2.5));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 2.5));

    // con el escritorio encima, la escena no se ve: no gastamos GPU
    if (p >= .988 && Math.abs(target - p) < 1e-4 && !dirty) return;
    dirty = false;
    update(p, time, dt);
    render();

    // calidad adaptable
    frames++;
    avg += (dt * 1000 - avg) * .05;
    sinceChange++;
    if (frames > 90 && sinceChange > 120 && avg > 24 && level < LEVELS.length - 1) {
      level++; sinceChange = 0; applySize();
    }
  }
  requestAnimationFrame(frame);
}
