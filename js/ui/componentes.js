/**
 * Utilidades de interfaz compartidas: escape, formato, avisos, diálogos,
 * imágenes de piezas e ilustraciones para piezas sin fotografía.
 * En una migración a React/Vue cada función se convierte en un componente.
 */
import * as R from '../dominio/reglas.js';
import { TIPOS, ES_LOTE } from '../config/catalogos.js';

/** Todo dato que viene de la API se escapa antes de entrar en HTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const fmtUSD = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export const precio = (n) => fmtUSD.format(Number(n) || 0);
export const fecha = (iso) => iso ? new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function toast(mensaje, tipo = 'ok') {
  let zona = $('#avisos');
  const t = document.createElement('div');
  t.className = `aviso aviso-${tipo}`; t.setAttribute('role', 'status'); t.textContent = mensaje;
  zona.append(t);
  setTimeout(() => t.classList.add('sale'), 3200); setTimeout(() => t.remove(), 3600);
}

/** Diálogo modal accesible. `contenido` es HTML ya escapado. Devuelve el <dialog>. */
export function dialogo(titulo, contenido, { ancho = 560, clase = '' } = {}) {
  const d = document.createElement('dialog');
  d.className = 'dialogo ' + clase; d.style.maxWidth = ancho + 'px';
  d.innerHTML = `<div class="dialogo-cab"><h2>${esc(titulo)}</h2><button class="btn-icono" data-cerrar aria-label="Cerrar">✕</button></div><div class="dialogo-cuerpo">${contenido}</div>`;
  document.body.append(d);
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-cerrar]')) d.close(); });
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  d.showModal();
  return d;
}

/* ---------- Imágenes de piezas ---------- */
const COLOR_METAL = { plata: ['#eef0f1', '#a9afb3', '#6f767b'], oro: ['#f6e3a3', '#cfa64a', '#8a6a22'], cobre: ['#e9b48a', '#b0703f', '#6e4021'], niquel: ['#e4e6e0', '#b3b7ae', '#777b72'], otros: ['#d9d6cc', '#a39f92', '#6c695f'] };
export function colorMetal(p) { return COLOR_METAL[R.grupoMaterial(p.tipo, p.material) ?? 'otros'] ?? COLOR_METAL.otros; }
const svgUrl = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const recortar = (t, n) => (t = String(t ?? '')).length > n ? t.slice(0, n - 1) + '…' : t;
const tono = (txt) => [...String(txt)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/** Ilustración vectorial para piezas sin foto (marcada como ilustrativa en la interfaz). */
export function ilustracion(p, cara = 'anverso') {
  const forma = ES_LOTE(p.tipo) ? 'estuche' : TIPOS[p.tipo]?.forma3d;
  if (forma === 'plano') {
    const h = tono(p.pais + p.denominacion), c1 = `hsl(${h} 35% 78%)`, c2 = `hsl(${h} 40% 38%)`;
    const texto = cara === 'anverso' ? recortar(p.denominacion || p.nombre, 20) : recortar(R.capitalizar(p.pais), 18);
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" rx="6" fill="${c1}"/><rect x="10" y="10" width="380" height="180" rx="4" fill="none" stroke="${c2}" stroke-width="3"/><g stroke="${c2}" stroke-opacity=".25">${Array.from({ length: 18 }, (_, i) => `<path d="M${-40 + i * 26} 200 Q ${i * 26} 100 ${-40 + i * 26} 0" fill="none"/>`).join('')}</g><circle cx="${cara === 'anverso' ? 300 : 100}" cy="100" r="52" fill="${c2}" fill-opacity=".18" stroke="${c2}" stroke-width="2"/><text x="${cara === 'anverso' ? 36 : 180}" y="70" font-family="Georgia,serif" font-size="18" fill="${c2}">${esc(R.capitalizar(cara === 'anverso' ? p.pais : 'Reverso'))}</text><text x="${cara === 'anverso' ? 36 : 180}" y="122" font-family="Georgia,serif" font-size="30" font-weight="700" fill="${c2}">${esc(texto)}</text><text x="${cara === 'anverso' ? 36 : 180}" y="160" font-family="Georgia,serif" font-size="16" fill="${c2}">${esc(p.anio || '')}</text></svg>`);
  }
  if (forma === 'estuche') {
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4a3c"/><stop offset="1" stop-color="#0d2620"/></linearGradient><radialGradient id="m"><stop offset="0" stop-color="#f1f1ee"/><stop offset=".7" stop-color="#b9b7ad"/><stop offset="1" stop-color="#7d7a70"/></radialGradient></defs><rect width="400" height="260" rx="14" fill="url(#t)"/><rect x="22" y="22" width="356" height="216" rx="8" fill="#123329" stroke="#c4a265" stroke-opacity=".6"/>${cara === 'anverso' ? [70, 150, 230, 310, 110, 190, 270].map((x, i) => `<circle cx="${x}" cy="${i < 4 ? 100 : 170}" r="${i % 2 ? 24 : 30}" fill="url(#m)"/>`).join('') : `<text x="200" y="128" text-anchor="middle" font-family="Georgia,serif" font-size="26" fill="#c4a265">${esc(recortar(p.nombre, 22))}</text><text x="200" y="162" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="#e9dfc6">${esc(R.capitalizar(p.pais))}</text>`}</svg>`);
  }
  const [c1, c2, c3] = colorMetal(p);
  const arriba = cara === 'anverso' ? R.capitalizar(p.pais) : (p.denominacion || '');
  const centro = cara === 'anverso' ? recortar(p.denominacion, 14) : (p.anio || 'S/F');
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><radialGradient id="g" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${c1}"/><stop offset=".6" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient><path id="arco" d="M 45 150 A 105 105 0 0 1 255 150"/></defs><circle cx="150" cy="150" r="146" fill="${c3}"/><circle cx="150" cy="150" r="138" fill="url(#g)"/><circle cx="150" cy="150" r="122" fill="none" stroke="${c3}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="2 5"/><text font-family="Georgia,serif" font-size="20" letter-spacing="2" fill="${c3}"><textPath href="#arco" startOffset="50%" text-anchor="middle">${esc(recortar(String(arriba).toUpperCase(), 22))}</textPath></text><text x="150" y="168" text-anchor="middle" font-family="Georgia,serif" font-size="${String(centro).length > 8 ? 30 : 42}" font-weight="700" fill="${c3}">${esc(centro)}</text>${cara === 'anverso' ? `<path d="M110 205 q40 22 80 0" stroke="${c3}" stroke-width="3" fill="none"/>` : `<path d="M95 210 h110" stroke="${c3}" stroke-width="2"/>`}</svg>`);
}

/** URL de la imagen de una cara: foto real si existe, si no, ilustración. */
export function imagenCara(p, cara = 'anverso') {
  const f = p.fotos?.find(x => x.cara === cara) ?? (cara === 'anverso' ? p.fotos?.[0] : p.fotos?.[1]);
  return f?.src ?? ilustracion(p, cara);
}
export const imagenPrincipal = (p) => imagenCara(p, 'anverso');

/** Reduce una imagen a máx. `lado` px (JPEG) para guardarla como data URL. */
export async function comprimirImagen(blob, lado = 900, calidad = 0.82) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', calidad);
}

/** Tarjeta de pieza para el catálogo y los favoritos. */
export function tarjetaPieza(p, { favorito = false, conSesion = false } = {}) {
  const pp = p.precioPublico ?? R.precioPublico(p);
  const agotada = p.disponible === false;
  return `<article class="tarjeta${agotada ? ' agotada' : ''}">
    <a class="tarjeta-img" href="#pieza-${esc(p.id)}" aria-label="${esc(R.tituloPieza(p))}">
      <img src="${esc(imagenPrincipal(p))}" alt="" loading="lazy">
      ${pp.descuento ? `<span class="sello sello-promo">−${pp.descuento} %</span>` : ''}
      ${agotada ? '<span class="sello sello-agotada">No disponible</span>' : ''}
    </a>
    <button class="fav${favorito ? ' activo' : ''}" data-fav="${esc(p.id)}" aria-pressed="${favorito}" aria-label="${favorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}" title="${conSesion ? '' : 'Inicia sesión para guardar'}">${corazon}</button>
    <div class="tarjeta-cuerpo">
      <p class="eyebrow">${esc(TIPOS[p.tipo]?.nombre)}${p.ilustracion ? ' · imagen ilustrativa' : ''}</p>
      <h3><a href="#pieza-${esc(p.id)}">${esc(R.tituloPieza(p))}</a></h3>
      <p class="tenue">${esc(R.subtituloPieza(p))}${p.calidad ? ' · ' + esc(p.calidad) : ''}</p>
      <p class="precio">${pp.descuento ? `<s>${precio(pp.base)}</s> ` : ''}${precio(pp.final)}</p>
    </div>
  </article>`;
}
export const corazon = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z" fill="currentColor" stroke="currentColor" stroke-width="1.6"/></svg>';

export function estadoChip(estado) {
  const m = { BORRADOR: ['Borrador', 'chip-borrador'], APROBADA_PRIVADA: ['Aprobada · privada', 'chip-privada'], PUBLICADA: ['Publicada', 'chip-publicada'] };
  const [t, c] = m[estado] ?? [estado, ''];
  return `<span class="chip ${c}">${t}</span>`;
}
