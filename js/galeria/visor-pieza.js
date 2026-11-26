/**
 * Visor 3D de una pieza: se gira arrastrando con el mouse o el dedo,
 * con zoom (rueda / botones), teclado (flechas) y botones anverso/reverso.
 *
 * Implementado con transformaciones CSS 3D (sin dependencias) a partir de las
 * fotos de anverso y reverso. La geometría depende del tipo:
 *   disco   → moneda o medalla sin cápsula (cilindro con canto)
 *   capsula → moneda graduada (NGC, PCGS...) en su estuche plástico
 *   plano   → billete
 *   estuche → set o lote
 * Producto final: misma API (crearVisor) reimplementable con Three.js usando
 * las fotos como texturas, si se quiere iluminación real.
 */
import { TIPOS, ES_LOTE } from '../config/catalogos.js';
import { imagenCara, colorMetal, esc } from '../ui/componentes.js';

const reducirMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formaDe(p) {
  if (ES_LOTE(p.tipo)) return 'estuche';
  const f = TIPOS[p.tipo]?.forma3d ?? 'disco';
  if (f === 'disco' && p.fotos?.length && p.graduador && p.graduador !== 'Sin graduar') return 'capsula';
  return f;
}

function cargarAspecto(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => res(1); i.src = src; });
}

/**
 * @param {HTMLElement} contenedor
 * @param {object} pieza  ficha pública
 * @param {{ autoGiro?: boolean, compacto?: boolean }} op
 */
export async function crearVisor(contenedor, pieza, op = {}) {
  const forma = formaDe(pieza);
  const frente = imagenCara(pieza, 'anverso'), dorso = imagenCara(pieza, 'reverso');
  const [c1, c2, c3] = colorMetal(pieza);

  // Dimensiones en px del objeto 3D
  let W = 260, H = 260, T = 16, radio = '50%';
  if (forma === 'capsula') { const a = await cargarAspecto(frente); W = 220; H = Math.round(220 / a); T = 18; radio = '14px'; }
  if (forma === 'plano') { const a = pieza.ilustracion ? 2 : await cargarAspecto(frente); W = 360; H = Math.round(360 / a); T = 2; radio = '4px'; }
  if (forma === 'estuche') { const a = pieza.ilustracion ? 400 / 260 : await cargarAspecto(frente); W = 340; H = Math.round(340 / a); T = 34; radio = '10px'; }
  if (op.compacto) { const k = 0.78; W *= k; H *= k; T *= k; }
  const disponible = (contenedor.clientWidth || 400) - 60;          // que quepa en pantallas angostas
  if (W > disponible) { const k = disponible / W; W *= k; H *= k; T *= k; }

  contenedor.classList.add('visor3d');
  contenedor.innerHTML = `
    <div class="visor-escena" tabindex="0" role="img" aria-label="Pieza en 3D. Arrastra o usa las flechas para girarla.">
      <div class="visor-objeto forma-${forma}" style="--w:${W}px;--h:${H}px;--t:${T}px;--r:${radio};--c1:${c1};--c2:${c2};--c3:${c3}">
        ${capasCanto(forma, T)}
        <div class="cara cara-frente"><img src="${esc(frente)}" alt="" draggable="false"><span class="brillo"></span></div>
        <div class="cara cara-dorso"><img src="${esc(dorso)}" alt="" draggable="false"><span class="brillo"></span></div>
      </div>
      <div class="visor-sombra"></div>
    </div>
    <div class="visor-controles">
      <button class="btn btn-sec btn-sm" data-cara="anverso">Anverso</button>
      <button class="btn btn-sec btn-sm" data-cara="reverso">Reverso</button>
      <button class="btn-icono" data-zoom="-1" aria-label="Alejar">−</button>
      <button class="btn-icono" data-zoom="1" aria-label="Acercar">+</button>
      <button class="btn-icono" data-reset aria-label="Restablecer vista">↺</button>
    </div>
    <p class="visor-ayuda">Arrastra para girar · rueda o +/− para acercar${pieza.ilustracion ? ' · imagen ilustrativa' : ''}</p>`;

  const escena = contenedor.querySelector('.visor-escena');
  const obj = contenedor.querySelector('.visor-objeto');
  const brillos = contenedor.querySelectorAll('.brillo');
  const estado = { rx: -12, ry: -28, z: 1, vx: 0, vy: 0, arrastrando: false, auto: op.autoGiro !== false && !reducirMovimiento(), objetivo: null };
  let ultimo = null, raf = 0, vivo = true;

  function pintar() {
    obj.style.transform = `scale(${estado.z}) rotateX(${estado.rx}deg) rotateY(${estado.ry}deg)`;
    const pos = 50 + Math.sin(estado.ry * Math.PI / 180) * 60;
    brillos.forEach(b => b.style.backgroundPosition = `${pos}% 0`);
  }
  function bucle() {
    if (!vivo) return;
    if (estado.objetivo) {
      estado.ry += (estado.objetivo.ry - estado.ry) * 0.14; estado.rx += (estado.objetivo.rx - estado.rx) * 0.14;
      if (Math.abs(estado.objetivo.ry - estado.ry) < 0.3 && Math.abs(estado.objetivo.rx - estado.rx) < 0.3) estado.objetivo = null;
    } else if (!estado.arrastrando) {
      if (Math.abs(estado.vx) > 0.02 || Math.abs(estado.vy) > 0.02) {
        estado.ry += estado.vx; estado.rx = limitar(estado.rx - estado.vy); estado.vx *= 0.94; estado.vy *= 0.94;
      } else if (estado.auto) estado.ry += 0.25;
    }
    pintar(); raf = requestAnimationFrame(bucle);
  }
  const limitar = (rx) => Math.max(-75, Math.min(75, rx));

  escena.addEventListener('pointerdown', e => {
    escena.setPointerCapture(e.pointerId); estado.arrastrando = true; estado.auto = false; estado.objetivo = null;
    ultimo = { x: e.clientX, y: e.clientY, t: performance.now() }; escena.classList.add('agarrando');
  });
  escena.addEventListener('pointermove', e => {
    if (!estado.arrastrando || !ultimo) return;
    const dx = e.clientX - ultimo.x, dy = e.clientY - ultimo.y;
    estado.ry += dx * 0.55; estado.rx = limitar(estado.rx - dy * 0.55);
    estado.vx = dx * 0.55; estado.vy = dy * 0.55;
    ultimo = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  const soltar = () => { estado.arrastrando = false; ultimo = null; escena.classList.remove('agarrando'); };
  escena.addEventListener('pointerup', soltar); escena.addEventListener('pointercancel', soltar);
  escena.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.1 : -0.1); }, { passive: false });
  escena.addEventListener('dblclick', reset);
  escena.addEventListener('keydown', e => {
    const m = { ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
    if (m) { e.preventDefault(); estado.auto = false; estado.objetivo = { rx: limitar(estado.rx + m[0]), ry: estado.ry + m[1] }; }
    if (e.key === '+' || e.key === '=') zoom(0.1); if (e.key === '-') zoom(-0.1);
  });
  function zoom(d) { estado.z = Math.max(0.6, Math.min(1.9, estado.z + d)); }
  function reset() { estado.auto = false; estado.z = 1; estado.objetivo = { rx: -12, ry: Math.round(estado.ry / 360) * 360 - 28 }; }
  function mostrarCara(cara) {
    estado.auto = false; estado.vx = estado.vy = 0;
    const base = Math.round(estado.ry / 360) * 360;
    estado.objetivo = { rx: 0, ry: cara === 'reverso' ? base + 180 : base };
  }
  contenedor.querySelector('.visor-controles').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cara) mostrarCara(b.dataset.cara);
    if (b.dataset.zoom) zoom(Number(b.dataset.zoom) * 0.15);
    if ('reset' in b.dataset) reset();
  });

  pintar(); raf = requestAnimationFrame(bucle);
  return { mostrarCara, destruir() { vivo = false; cancelAnimationFrame(raf); contenedor.innerHTML = ''; } };
}

/** Capas apiladas que forman el canto/espesor del objeto. */
function capasCanto(forma, T) {
  const n = forma === 'plano' ? 2 : Math.max(6, Math.round(T / 1.5));
  let h = '';
  for (let i = 0; i < n; i++) {
    const z = -T / 2 + (T * (i + 0.5)) / n;
    h += `<div class="capa" style="transform:translateZ(${z.toFixed(2)}px)"></div>`;
  }
  return h;
}
