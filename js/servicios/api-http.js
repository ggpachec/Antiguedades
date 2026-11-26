/**
 * Adaptador HTTP para el PRODUCTO FINAL (esqueleto).
 * Misma interfaz que api-simulada.js. Se completa cuando exista el backend.
 * La sesión viaja en una cookie httpOnly emitida por el servidor (credentials: 'include').
 */
const BASE = '/api';

export class ErrorApi extends Error { constructor(estado, mensaje, detalle) { super(mensaje); this.estado = estado; this.detalle = detalle; } }

async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: metodo, credentials: 'include',
    headers: cuerpo instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : (cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo)),
  });
  if (r.status === 204) return null;
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.mensaje ?? 'Error del servidor', datos.detalle);
  return datos;
}
const qs = (o) => new URLSearchParams(Object.entries(o).flatMap(([k, v]) => Array.isArray(v) ? v.map(x => [k, x]) : (v === '' || v == null || v === false ? [] : [[k, v]]))).toString();

// Público
export const listarPiezasPublicas = (f = {}) => pedir('GET', `/piezas?${qs(f)}`);
export const obtenerPiezaPublica = (id) => pedir('GET', `/piezas/${encodeURIComponent(id)}`).catch(e => { if (e.estado === 404) return null; throw e; });
export const listarGaleria = (zona) => pedir('GET', `/galeria?zona=${zona}`);
export const paisesPublicados = () => pedir('GET', '/catalogos/paises');
// Cuentas
export const usuarioActual = () => pedir('GET', '/sesion').catch(() => null);
export const registrarCliente = (d) => pedir('POST', '/clientes', d);
export const iniciarSesion = (email, clave) => pedir('POST', '/sesion', { email, clave });
export const cerrarSesion = () => pedir('DELETE', '/sesion');
export const solicitarRecuperacion = (email) => pedir('POST', '/recuperaciones', { email });
export const restablecerClave = (email, codigo, nuevaClave) => pedir('POST', '/recuperaciones/confirmar', { email, codigo, nuevaClave });
export const actualizarPerfil = (c) => pedir('PATCH', '/clientes/yo', c);
export const alternarFavorito = (id) => pedir('POST', `/clientes/yo/favoritos/${id}/alternar`).then(r => r.favorito);
export const listarFavoritos = () => pedir('GET', '/clientes/yo/favoritos');
export const registrarVista = (id) => pedir('POST', `/clientes/yo/vistos/${id}`).catch(() => {});
export const listarVistos = () => pedir('GET', '/clientes/yo/vistos').catch(() => []);
export const crearSolicitud = (s) => pedir('POST', '/solicitudes', s);
export const misSolicitudes = () => pedir('GET', '/clientes/yo/solicitudes');
// Administración
export const listarInventario = (f = {}) => pedir('GET', `/admin/piezas?${qs(f)}`);
export const obtenerPieza = (id) => pedir('GET', `/admin/piezas/${id}`);
export const crearPieza = (f) => pedir('POST', '/admin/piezas', f);
export const actualizarPieza = (id, c) => pedir('PUT', `/admin/piezas/${id}`, c);
export const aprobarPieza = (id) => pedir('POST', `/admin/piezas/${id}/aprobar`);
export const publicar = (id, o) => pedir('POST', '/admin/publicaciones', { piezaId: id, ...o });
export const pausarPublicacion = (id) => pedir('POST', `/admin/publicaciones/${id}/pausar`);
export const eliminarPieza = (id) => pedir('DELETE', `/admin/piezas/${id}`);
export const listarPublicaciones = (filtro) => pedir('GET', `/admin/publicaciones?filtro=${filtro}`);
export const listarSolicitudes = () => pedir('GET', '/admin/solicitudes');
export const cambiarEstadoSolicitud = (id, estado) => pedir('PATCH', `/admin/solicitudes/${id}`, { estado });
export const importarFichas = (fichas) => pedir('POST', '/admin/importaciones', { fichas });
export const sugerirAtributos = (tipo, fotos = []) => { const fd = new FormData(); fd.append('tipo', tipo); fotos.forEach(f => fd.append('fotos', f)); return pedir('POST', '/admin/catalogacion-ia', fd); };
export const restablecerDatos = async () => {};
