/**
 * Galería virtual interactiva con simulación tridimensional básica.
 * Una sala renderizada en tiempo real con transformaciones CSS 3D:
 *   - Recorrido por PUNTOS PREDEFINIDOS (entrada y una posición por pared),
 *     con transición animada entre puntos (estilo «recorrido virtual»).
 *   - Desde cada punto se puede mirar alrededor arrastrando (giro limitado).
 *   - Las vitrinas se llenan con las piezas PUBLICADAS de cada zona (API /galeria),
 *     paginadas de 4 en 4. Si una pieza se retira, desaparece de su vitrina.
 *
 * Sistema de coordenadas (px): X izquierda→derecha, Y hacia abajo, Z hacia el fondo es negativo.
 * La sala, los puntos y las vitrinas se definen como DATOS (SALA, PUNTOS, PAREDES),
 * de modo que el producto final puede cambiar medidas o portar la escena a Three.js
 * sin tocar la lógica de navegación ni la API.
 */
import { esc, imagenPrincipal, precio } from '../ui/componentes.js';
import { tituloPieza } from '../dominio/reglas.js';

export const SALA = { ancho: 1600, fondo: 2000, piso: 260, techo: -400, perspectiva: 720 };
const ALTO = SALA.piso - SALA.techo;

/** Puntos de vista predefinidos: posición de cámara (x, y, z) y orientación (yaw, en grados). */
export const PUNTOS = {
  entrada:  { nombre: 'Sala principal', x: 0,    y: -40, z: -120,  yaw: 0 },
  monedas:  { nombre: 'Monedas',        x: 230,  y: -40, z: -960, yaw: -90 },
  billetes: { nombre: 'Billetes',       x: 0,    y: -40, z: -1000, yaw: 0 },
  medallas: { nombre: 'Medallas',       x: -230, y: -40, z: -960, yaw: 90 },
};

/** Paredes con vitrinas: dónde se colocan y hacia dónde miran. */
export const PAREDES = {
  monedas:  { titulo: 'Monedas',  vitrinas: [-420, -780, -1140, -1500].map(z => ({ x: -660, z, rot: 90 })) },
  billetes: { titulo: 'Billetes', vitrinas: [-450, -150, 150, 450].map(x => ({ x, z: -1860, rot: 0 })) },
  medallas: { titulo: 'Medallas', vitrinas: [-1500, -1140, -780, -420].map(z => ({ x: 660, z, rot: -90 })) },
};
export const POR_PAGINA = 4;

const V = { ancho: 230, base: 250, vidrio: 210, fondo: 120 };

function plano(w, h, transform, clase = '', contenido = '', attrs = '') {
  return `<div class="plano ${clase}" style="width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;transform:${transform}" ${attrs}>${contenido}</div>`;
}
function caja(w, h, d, clase, caras = {}) {
  return `<div class="caja ${clase}">
    ${plano(w, h, `translateZ(${d / 2}px)`, 'c-frente', caras.frente ?? '')}
    ${plano(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, 'c-atras')}
    ${plano(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, 'c-lado')}
    ${plano(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, 'c-lado')}
    ${plano(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, 'c-tapa')}
  </div>`;
}

/**
 * Superficie grande dividida en mosaicos de `t` px. Chrome dibuja mal los planos CSS 3D
 * que cruzan el plano de la cámara; con mosaicos, los que quedan detrás simplemente se descartan.
 * El fondo se ajusta con --bp/--bs para que el patrón continúe sin cortes entre mosaicos.
 */
/** Esquinas en coordenadas de mundo de cada elemento recortable (índice = data-c). */
let RECORTE = [];
const registrar = (esquinas) => RECORTE.push(esquinas) - 1;

function superficie(w, h, transform, clase, t = 400, mapa, tAlto = t) {
  let html = '';
  const nx = Math.ceil(w / t), ny = Math.ceil(h / tAlto);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const tw = Math.min(t, w - i * t), th = Math.min(tAlto, h - j * tAlto);
    const x0 = i * t, y0 = j * tAlto;                      // esquina del mosaico dentro de la superficie
    const cx = x0 + tw / 2 - w / 2, cy = y0 + th / 2 - h / 2;
    const c = registrar([[cx - tw / 2, cy - th / 2], [cx + tw / 2, cy - th / 2], [cx - tw / 2, cy + th / 2], [cx + tw / 2, cy + th / 2]].map(([u, v]) => mapa(u, v)));
    html += `<div class="plano ${clase}" data-c="${c}" style="width:${tw + 1}px;height:${th + 1}px;margin:${-th / 2}px 0 0 ${-tw / 2}px;transform:translate3d(${cx}px,${cy}px,0);--bp:${-x0}px ${-y0}px;--bs:${w}px ${h}px" data-i="${i}"></div>`;
  }
  return `<div class="nodo" style="transform:${transform}">${html}</div>`;
}

function htmlSala() {
  RECORTE = [];
  const { ancho: A, fondo: F, piso: P, techo: T } = SALA;
  const cy = (P + T) / 2, yRotulo = T + 90;
  const pared = (w, tr, mapa) => superficie(w, ALTO, tr, 'pared', 400, mapa, ALTO);
  // Funciones (u, v) del plano local → (x, y, z) del mundo, para el recorte por cámara
  const M = {
    piso: (u, v) => [u, P, v - F / 2], techo: (u, v) => [u, T, -v - F / 2],
    fondo: (u, v) => [u, v + cy, -F], izq: (u, v) => [-A / 2, v + cy, -u - F / 2],
    der: (u, v) => [A / 2, v + cy, u - F / 2], frente: (u, v) => [-u, v + cy, 0],
  };
  const conRecorte = (html, esquinas) => html.replace('class="plano', `data-c="${registrar(esquinas)}" class="plano`);
  // Charcos de luz sobre la pared, uno por vitrina (datos de PAREDES)
  const focos = Object.values(PAREDES).flatMap(pd => pd.vitrinas.map(v => {
    const enPared = v.rot === 0 ? `translate3d(${v.x}px,${cy}px,${-F + 3}px)` : `translate3d(${v.rot > 0 ? -A / 2 + 3 : A / 2 - 3}px,${cy}px,${v.z}px) rotateY(${v.rot}deg)`;
    const e = v.rot === 0 ? [[v.x - 240, cy, -F], [v.x + 240, cy, -F]] : [[v.rot > 0 ? -A / 2 : A / 2, cy, v.z - 240], [v.rot > 0 ? -A / 2 : A / 2, cy, v.z + 240]];
    return conRecorte(plano(480, ALTO, enPared, 'foco'), e);
  })).join('');
  const rotulo = (txt, tr, e) => conRecorte(plano(900, 90, tr, 'rotulo-plano', `<h3 class="rotulo">${txt}</h3>`), e);
  return `
    ${superficie(A, F, `translate3d(0,${P}px,${-F / 2}px) rotateX(90deg)`, 'piso', 400, M.piso)}
    ${superficie(A, F, `translate3d(0,${T}px,${-F / 2}px) rotateX(-90deg)`, 'techo', 400, M.techo)}
    ${pared(A, `translate3d(0,${cy}px,${-F}px)`, M.fondo)}
    ${pared(F, `translate3d(${-A / 2}px,${cy}px,${-F / 2}px) rotateY(90deg)`, M.izq)}
    ${pared(F, `translate3d(${A / 2}px,${cy}px,${-F / 2}px) rotateY(-90deg)`, M.der)}
    ${pared(A, `translate3d(0,${cy}px,0) rotateY(180deg)`, M.frente)}
    ${focos}
    ${rotulo('Billetes', `translate3d(0,${yRotulo}px,${-F + 4}px)`, [[-450, 0, -F], [450, 0, -F]])}
    ${rotulo('Monedas', `translate3d(${-A / 2 + 4}px,${yRotulo}px,${-F / 2}px) rotateY(90deg)`, [[-A / 2, 0, -F / 2 - 450], [-A / 2, 0, -F / 2 + 450]])}
    ${rotulo('Medallas', `translate3d(${A / 2 - 4}px,${yRotulo}px,${-F / 2}px) rotateY(-90deg)`, [[A / 2, 0, -F / 2 - 450], [A / 2, 0, -F / 2 + 450]])}
    ${rotulo('De Colección', `translate3d(0,${yRotulo}px,-4px) rotateY(180deg)`, [[-450, 0, 0], [450, 0, 0]])}
    ${conRecorte(plano(300, 470, `translate3d(0,${P - 235}px,-4px) rotateY(180deg)`, 'puerta'), [[-150, 0, 0], [150, 0, 0]])}
    ${Object.entries(PUNTOS).map(([id, p]) => `<button class="punto-piso" data-ir="${id}" aria-label="Ir a ${esc(p.nombre)}" style="transform:translate3d(${p.x}px,${P - 3}px,${p.z}px) rotateX(90deg)"><span></span></button>`).join('')}`;
}

function htmlVitrina(slot, pieza, i) {
  const { ancho: w, base: hb, vidrio: hv, fondo: d } = V;
  const yBase = SALA.piso - hb / 2, yVidrio = SALA.piso - hb - hv / 2;
  const contenido = pieza
    ? `<button class="pieza-vitrina" data-pieza="${esc(pieza.id)}" aria-label="Ver ${esc(tituloPieza(pieza))}"><img src="${esc(imagenPrincipal(pieza))}" alt="" draggable="false"></button>`
    : `<span class="vitrina-vacia">Vitrina disponible</span>`;
  const placa = pieza ? `<div class="placa"><strong>${esc(tituloPieza(pieza))}</strong><span>${pieza.disponible === false ? 'No disponible' : precio(pieza.precioPublico?.final)}</span></div>` : '';
  return `<div class="vitrina${pieza ? '' : ' vacia'}" data-x="${slot.x}" data-z="${slot.z}" style="transform:translate3d(${slot.x}px,0,${slot.z}px) rotateY(${slot.rot}deg);--retraso:${i * 70}ms">
    <div class="nodo" style="transform:translateY(${yBase}px)">${caja(w, hb, d, 'mueble', { frente: placa })}</div>
    <div class="nodo" style="transform:translateY(${yVidrio}px)">${caja(w, hv, d, 'vidrio')}
      <div class="nodo" style="transform:translateZ(0)">${plano(w - 40, hv - 40, 'translateZ(0)', 'exhibidor', contenido)}</div>
      <div class="luz-vitrina"></div>
    </div>
  </div>`;
}

/**
 * Monta la sala.
 * @param {HTMLElement} contenedor
 * @param {{ cargarZona:(zona)=>Promise<Array>, onSeleccionar:(pieza)=>void, onPunto?:(id)=>void, inicio?:string }} op
 */
export function crearSala(contenedor, op) {
  // Dos capas con la misma cámara: la sala es una caja convexa (nunca tapa a las vitrinas),
  // así se evita que el ordenamiento 3D del navegador mezcle el piso con las vitrinas.
  contenedor.innerHTML = `<div class="sala-vista" tabindex="0" aria-label="Sala virtual. Arrastra para mirar alrededor.">
    <div class="sala-mundo capa-sala">${htmlSala()}</div><div class="sala-mundo capa-objetos"><div class="vitrinas"></div></div></div>`;
  const vista = contenedor.querySelector('.sala-vista');
  const mundo = contenedor.querySelector('.capa-sala');
  const capas = contenedor.querySelectorAll('.sala-mundo');
  const capaVitrinas = contenedor.querySelector('.vitrinas');
  // Campo de visión adaptado al ancho: en móvil se abre para que entren las 4 vitrinas de una pared
  let P = SALA.perspectiva;
  const ajustarVision = () => { P = Math.max(280, Math.min(SALA.perspectiva, vista.clientWidth * 0.55)); vista.style.perspective = P + 'px'; };
  ajustarVision();
  const ro = new ResizeObserver(ajustarVision); ro.observe(vista);

  const datos = { monedas: [], billetes: [], medallas: [] };
  const pagina = { monedas: 0, billetes: 0, medallas: 0 };
  const cam = { ...PUNTOS.entrada, mirar: 0, inclinar: 0 };
  let destino = null, actual = 'entrada', raf = 0, vivo = true;

  const recortables = [...mundo.querySelectorAll('[data-c]')].map(el => ({ el, esq: RECORTE[+el.dataset.c], oculto: false }));
  /** Profundidad en espacio de cámara (negativa = delante). */
  const profundidad = (x, z, s, co) => -(x - cam.x) * s + (z - cam.z) * co;
  function aplicarCamara() {
    const yaw = cam.yaw + cam.mirar;
    const t = `translateZ(${P}px) rotateX(${cam.inclinar}deg) rotateY(${yaw}deg) translate3d(${-cam.x}px,${-cam.y}px,${-cam.z}px)`;
    capas.forEach(c => c.style.transform = t);
    // Recorte manual: se ocultan los elementos que cruzan o quedan detrás del plano de la cámara
    const r = yaw * Math.PI / 180, s = Math.sin(r), co = Math.cos(r);
    for (const it of recortables) {
      const ocultar = it.esq.some(([x, , z]) => profundidad(x, z, s, co) > -20);
      if (ocultar !== it.oculto) { it.oculto = ocultar; it.el.hidden = ocultar; }
    }
    for (const v of capaVitrinas.children) {
      const ocultar = profundidad(+v.dataset.x, +v.dataset.z, s, co) > -220;
      if (ocultar !== v.hidden) v.hidden = ocultar;
    }
  }
  const suave = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  function bucle(t) {
    if (!vivo) return;
    if (destino) {
      const k = Math.min(1, (t - destino.t0) / destino.ms), e = suave(k);
      for (const c of ['x', 'y', 'z', 'yaw']) cam[c] = destino.desde[c] + (destino.hasta[c] - destino.desde[c]) * e;
      cam.mirar *= 0.9; cam.inclinar *= 0.9;
      if (k >= 1) destino = null;
    }
    aplicarCamara(); raf = requestAnimationFrame(bucle);
  }

  function irA(id) {
    const p = PUNTOS[id]; if (!p) return;
    actual = id;
    let yawDestino = p.yaw;
    while (yawDestino - cam.yaw > 180) yawDestino -= 360;
    while (yawDestino - cam.yaw < -180) yawDestino += 360;
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1300;
    destino = { desde: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw }, hasta: { x: p.x, y: p.y, z: p.z, yaw: yawDestino }, t0: performance.now(), ms };
    contenedor.querySelectorAll('.punto-piso').forEach(b => b.classList.toggle('oculto', b.dataset.ir === id));
    op.onPunto?.(id);
  }

  function renderVitrinas() {
    let html = '', i = 0;
    for (const [zona, pared] of Object.entries(PAREDES)) {
      const piezas = datos[zona].slice(pagina[zona] * POR_PAGINA, pagina[zona] * POR_PAGINA + POR_PAGINA);
      pared.vitrinas.forEach((slot, k) => { html += htmlVitrina(slot, piezas[k], i++); });
    }
    capaVitrinas.innerHTML = html;
  }

  // Mirar alrededor arrastrando (sin moverse del punto)
  let arrastre = null, movido = false;
  vista.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY, m: cam.mirar, i: cam.inclinar }; movido = false; });
  vista.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) { movido = true; vista.classList.add('mirando'); if (!vista.hasPointerCapture(e.pointerId)) vista.setPointerCapture(e.pointerId); }
    if (movido) { cam.mirar = Math.max(-50, Math.min(50, arrastre.m - dx * 0.15)); cam.inclinar = Math.max(-14, Math.min(14, arrastre.i + dy * 0.08)); }
  });
  const fin = () => { arrastre = null; vista.classList.remove('mirando'); };
  vista.addEventListener('pointerup', fin); vista.addEventListener('pointercancel', fin);
  vista.addEventListener('click', e => {
    if (movido) { e.preventDefault(); return; }
    const ir = e.target.closest('[data-ir]'); if (ir) return irA(ir.dataset.ir);
    const pz = e.target.closest('[data-pieza]');
    if (pz) { const p = Object.values(datos).flat().find(x => x.id === pz.dataset.pieza); if (p) op.onSeleccionar(p); }
  });
  vista.addEventListener('keydown', e => {
    const orden = ['monedas', 'billetes', 'medallas'];
    if (e.key === 'ArrowLeft') cam.mirar = Math.max(-50, cam.mirar - 10);
    if (e.key === 'ArrowRight') cam.mirar = Math.min(50, cam.mirar + 10);
    if (e.key === 'Escape') irA('entrada');
    if (/^[1-3]$/.test(e.key)) irA(orden[+e.key - 1]);
  });

  async function cargar() {
    const zonas = Object.keys(PAREDES);
    const res = await Promise.all(zonas.map(z => op.cargarZona(z)));
    zonas.forEach((z, i) => { datos[z] = res[i]; pagina[z] = Math.min(pagina[z], Math.max(0, Math.ceil(datos[z].length / POR_PAGINA) - 1)); });
    renderVitrinas();
  }

  aplicarCamara(); raf = requestAnimationFrame(bucle);
  const listo = cargar().then(() => irA(op.inicio ?? 'entrada'));

  return {
    listo, irA, recargar: cargar,
    get punto() { return actual; },
    info(zona) { return { total: datos[zona]?.length ?? 0, pagina: pagina[zona] ?? 0, paginas: Math.max(1, Math.ceil((datos[zona]?.length ?? 0) / POR_PAGINA)) }; },
    paginar(zona, delta) {
      const n = Math.max(1, Math.ceil(datos[zona].length / POR_PAGINA));
      pagina[zona] = (pagina[zona] + delta + n) % n; renderVitrinas();
    },
    destruir() { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
