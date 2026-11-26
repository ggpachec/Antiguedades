/**
 * Punto de entrada: armazón de la página, enrutador por hash y contexto compartido.
 * Rutas: #inicio #catalogo #monedas #billetes #medallas #pieza-<id> #sala #sala-<zona>
 *        #ingresar #registro #recuperar #cuenta
 *        #admin #admin-nueva #admin-editar-<id> #admin-importar #admin-publicaciones
 *        #admin-etiquetas[-<id>] #admin-solicitudes
 * En una migración a React/Vue, cada ruta = una página y `ctx` = un store/contexto.
 */
import * as api from './servicios/api.js';
import { esc, $, toast, dialogo } from './ui/componentes.js';
import { vistaInicio, vistaCatalogo, vistaFicha, vistaSala } from './vistas/publico.js';
import { vistaIngresar, vistaRegistro, vistaRecuperar, vistaCuenta, dialogoSolicitud, formIngreso, enlazarIngreso } from './vistas/cuenta.js';
import { vistaInventario, vistaFormulario, vistaImportar, vistaPublicaciones, vistaEtiquetas, vistaSolicitudes, MENU_ADMIN } from './vistas/admin.js';

const raiz = $('#app');
let limpiar = null;

const ctx = {
  usuario: null,
  async refrescarUsuario() { ctx.usuario = await api.usuarioActual(); pintarCabecera(); },
  esFavorito: (id) => !!ctx.usuario?.favoritos?.includes(id),
  opTarjeta: (p) => ({ favorito: ctx.esFavorito(p.id), conSesion: !!ctx.usuario }),
  /** Devuelve true/false (nuevo estado) o null si el usuario no inició sesión. */
  async alternarFavorito(id) {
    if (!ctx.usuario) { pedirSesion('Inicia sesión para guardar tus piezas favoritas.', () => ctx.alternarFavorito(id)); return null; }
    if (ctx.usuario.rol !== 'CLIENTE') { toast('Los favoritos son para cuentas de clientes', 'error'); return null; }
    const ahora = await api.alternarFavorito(id);
    await ctx.refrescarUsuario();
    toast(ahora ? 'Guardada en tus favoritos' : 'Quitada de favoritos');
    return ahora;
  },
  enlazarFavoritos(contenedor, alCambiar) {
    contenedor.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fav]'); if (!b) return;
      e.preventDefault();
      const r = await ctx.alternarFavorito(b.dataset.fav);
      if (r === null) return;
      if (alCambiar) return alCambiar();
      b.classList.toggle('activo', r); b.setAttribute('aria-pressed', String(r));
      b.setAttribute('aria-label', r ? 'Quitar de favoritos' : 'Guardar en favoritos');
    });
  },
  abrirSolicitud(op) {
    if (!ctx.usuario) return pedirSesion('Inicia sesión o crea tu cuenta para enviar solicitudes.', () => ctx.abrirSolicitud(op));
    if (ctx.usuario.rol !== 'CLIENTE') return toast('Las solicitudes se envían desde una cuenta de cliente', 'error');
    dialogoSolicitud(ctx, op);
  },
  recargar: () => enrutar(),
};

function pedirSesion(motivo, continuar) {
  const d = dialogo('Ingresa para continuar', `<p class="tenue">${esc(motivo)}</p>${formIngreso(location.hash)}`, { ancho: 460 });
  enlazarIngreso(d, ctx, () => { d.close(); continuar?.(); });
  d.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => d.close()));
}

/* ------------------------- Armazón ------------------------- */
const NAV = [['inicio', 'Inicio'], ['catalogo', 'Catálogo'], ['monedas', 'Monedas'], ['billetes', 'Billetes'], ['medallas', 'Medallas'], ['sala', 'Sala virtual']];
let modo = null;

function armazonPublico() {
  modo = 'publico';
  document.body.innerHTML = `
    <div class="cinta">Prototipo interactivo · datos de ejemplo guardados solo en este navegador<button id="restablecer">Restablecer datos</button></div>
    <header class="cabecera"><div class="envoltura">
      <a class="logo" href="#inicio">De Colección</a>
      <nav class="nav" id="nav" aria-label="Principal">${NAV.map(([h, t]) => `<a href="#${h}" data-nav="${h}">${t}</a>`).join('')}</nav>
      <div class="acciones-cab" id="acciones"></div>
      <button class="btn-icono menu-movil" id="menu" aria-label="Menú" aria-expanded="false">☰</button>
    </div></header>
    <main id="app"></main>
    <footer class="pie" id="pie"><div class="envoltura"><div><span class="logo">De Colección</span><p style="margin:6px 0 0">Numismática y antigüedades · Guayaquil, Ecuador</p></div>
      <div><p style="margin:0">Contacto (ejemplo): ventas@decoleccion.ec · WhatsApp 0991 234 567</p><p style="margin:4px 0 0"><a href="#privacidad">Privacidad</a> · <a href="#admin">Acceso del encargado</a></p></div></div></footer>
    <div id="avisos" aria-live="polite"></div>`;
  $('#menu').onclick = (e) => { const n = $('#nav'); n.classList.toggle('abierta'); e.currentTarget.setAttribute('aria-expanded', n.classList.contains('abierta')); };
  $('#nav').onclick = () => $('#nav').classList.remove('abierta');
  enlazarRestablecer();
}
function armazonAdmin() {
  modo = 'admin';
  document.body.innerHTML = `
    <div class="cinta">Panel privado · prototipo con datos de ejemplo<button id="restablecer">Restablecer datos</button></div>
    <div class="admin"><aside class="admin-lateral"><a class="logo" href="#inicio" style="background:none;text-align:left;padding:0">De Colección</a><p class="eyebrow">Archivo privado</p>
      ${MENU_ADMIN.map(([h, t]) => `<a href="#${h}" data-nav="${h}">${t}</a>`).join('')}
      <a href="#catalogo" style="margin-top:14px">Ver catálogo público</a><a href="#" id="salir-admin">Cerrar sesión</a>
      <p class="pie-lateral">Autenticación simulada en el prototipo.</p></aside>
      <main class="admin-cuerpo" id="app"></main></div>
    <div id="avisos" aria-live="polite"></div>`;
  $('#salir-admin').onclick = async (e) => { e.preventDefault(); await api.cerrarSesion(); await ctx.refrescarUsuario(); location.hash = 'inicio'; };
  enlazarRestablecer();
}
function enlazarRestablecer() {
  $('#restablecer').onclick = async () => { await api.restablecerDatos(); ctx.usuario = null; toast('Datos de ejemplo restablecidos'); location.hash = 'inicio'; enrutar(); };
}
function pintarCabecera() {
  const a = $('#acciones'); if (!a) return;
  const u = ctx.usuario;
  a.innerHTML = u && u.rol === 'CLIENTE'
    ? `<a class="btn btn-sec" href="#cuenta">♥ <span>Mi cuenta · ${u.favoritos?.length ?? 0}</span></a>`
    : u ? `<a class="btn btn-pri" href="#admin">Panel del encargado</a>`
    : `<a class="btn btn-sec" href="#ingresar">Ingresar</a><a class="btn btn-pri" href="#registro">Crear cuenta</a>`;
}

/* ------------------------- Enrutador ------------------------- */
async function enrutar() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'inicio';
  const esAdmin = h.startsWith('admin');
  if (esAdmin && modo !== 'admin') armazonAdmin();
  if (!esAdmin && modo !== 'publico') armazonPublico();
  pintarCabecera();
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', false));
  const activo = document.querySelector(`[data-nav="${h.startsWith('sala') ? 'sala' : h.startsWith('admin-editar') ? 'admin' : h}"]`);
  activo?.setAttribute('aria-current', 'page');

  try { limpiar?.(); } catch {}
  limpiar = null;
  const viejo = $('#app');
  const c = document.createElement('main');        // contenedor nuevo en cada vista: sin listeners acumulados
  c.id = 'app'; c.className = viejo.className;
  viejo.replaceWith(c);
  const pie = $('#pie'); if (pie) pie.hidden = h.startsWith('sala');

  try {
    if (esAdmin && ctx.usuario?.rol !== 'ENCARGADO') {
      c.innerHTML = `<div class="auth panel"><p class="eyebrow">Archivo privado</p><h1>Acceso del encargado</h1>${formIngreso('#admin')}</div>`;
      enlazarIngreso(c, ctx, () => enrutar());
      return;
    }
    let m;
    if (h === 'inicio') limpiar = await vistaInicio(c, ctx);
    else if (h === 'catalogo') limpiar = await vistaCatalogo(c, ctx, '');
    else if (['monedas', 'billetes', 'medallas'].includes(h)) limpiar = await vistaCatalogo(c, ctx, h);
    else if ((m = h.match(/^pieza-(.+)$/))) limpiar = await vistaFicha(c, ctx, m[1]);
    else if ((m = h.match(/^sala(?:-(\w+))?$/))) limpiar = await vistaSala(c, ctx, m[1]);
    else if (h === 'ingresar') await vistaIngresar(c, ctx);
    else if (h === 'registro') await vistaRegistro(c, ctx);
    else if (h === 'recuperar') await vistaRecuperar(c, ctx);
    else if (h === 'cuenta') await vistaCuenta(c, ctx);
    else if (h === 'privacidad') c.innerHTML = `<div class="envoltura seccion"><h1>Política de privacidad</h1><p class="tenue">Texto pendiente de aprobación por el cliente (Ley Orgánica de Protección de Datos Personales del Ecuador).</p></div>`;
    else if (h === 'admin') await vistaInventario(c, ctx);
    else if (h === 'admin-nueva') await vistaFormulario(c, ctx, null);
    else if ((m = h.match(/^admin-editar-(.+)$/))) await vistaFormulario(c, ctx, m[1]);
    else if (h === 'admin-importar') await vistaImportar(c, ctx);
    else if (h === 'admin-publicaciones') await vistaPublicaciones(c, ctx);
    else if ((m = h.match(/^admin-etiquetas(?:-(.+))?$/))) await vistaEtiquetas(c, ctx, m[1]);
    else if (h === 'admin-solicitudes') await vistaSolicitudes(c, ctx);
    else c.innerHTML = `<div class="envoltura seccion"><div class="vacio"><h2>Página no encontrada</h2><a class="btn btn-pri" href="#inicio">Ir al inicio</a></div></div>`;
  } catch (err) {
    console.error(err);
    c.innerHTML = `<div class="envoltura seccion"><div class="vacio"><h2>Algo salió mal</h2><p class="tenue">${esc(err.message)}</p><a class="btn btn-pri" href="#inicio">Ir al inicio</a></div></div>`;
  }
  if (!h.startsWith('sala')) window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', enrutar);
(async () => { ctx.usuario = await api.usuarioActual(); await enrutar(); })();
