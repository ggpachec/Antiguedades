/**
 * API SIMULADA del prototipo.
 * Cada función respeta el contrato del endpoint REST que tendrá el producto final
 * (anotado en el comentario de cada una). Las vistas SOLO hablan con este módulo
 * a través de js/servicios/api.js, así que para pasar al backend real basta con
 * cambiar una línea allí y usar api-http.js.
 *
 * Reglas que el backend debe conservar:
 *  - El público solo recibe piezas con estado PUBLICADA y publicación activa.
 *  - Los datos privados (ubicación, historial de precios, sugerencias de IA) nunca salen en la API pública.
 *  - Cada cambio de precio se registra con fecha, usuario, valor anterior y nuevo.
 *  - `version` implementa control optimista: si no coincide, se rechaza la edición.
 */
import { cargar, guardar, restablecer, sesion } from './almacen.js';
import * as R from '../dominio/reglas.js';
import { TIPOS, ES_LOTE, RANGOS_PRECIO, NOVEDAD } from '../config/catalogos.js';

const espera = (ms = 120) => new Promise(r => setTimeout(r, ms));
const ahora = () => new Date().toISOString().slice(0, 19);
const copia = (o) => structuredClone(o);
class ErrorApi extends Error { constructor(estado, mensaje, detalle) { super(mensaje); this.estado = estado; this.detalle = detalle; } }
export { ErrorApi };

async function hash(texto) {
  // Prototipo: SHA-256 en el navegador. Producto final: Argon2id/bcrypt en el servidor.
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dc:' + texto));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function db() {
  const d = await cargar();
  // Migración de semilla: claves en texto → hash, versiones
  let cambio = false;
  for (const u of d.usuarios) if (u.clave) { u.hashClave = await hash(u.clave); delete u.clave; cambio = true; }
  for (const p of d.piezas) if (p.version === undefined) { p.version = 1; cambio = true; }
  d.solicitudes ??= []; d.recuperaciones ??= {};
  if (cambio) guardar();
  return d;
}

function usuarioSesion(d) { const id = sesion.obtener(); return d.usuarios.find(u => u.id === id) ?? null; }
function exigirRol(d, rol) {
  const u = usuarioSesion(d);
  if (!u) throw new ErrorApi(401, 'Inicia sesión para continuar.');
  if (rol && u.rol !== rol) throw new ErrorApi(403, 'No tienes permiso para esta acción.');
  return u;
}
const esPublica = (p) => p.estado === 'PUBLICADA' && p.publicacion?.activo;

/** Vista pública de una pieza: sin datos internos. */
function vistaPublica(p) {
  const { ubicacion, historialPrecios, sugerenciasIA, automatico, factorIncremento, version, creadaEn, ...resto } = p;
  return { ...copia(resto), precioPublico: R.precioPublico(p), disponible: R.disponible(p) };
}

/* ------------------------------------------------------------------ */
/* Búsqueda pública con facetas                                        */
/* ------------------------------------------------------------------ */
const ZONA = (p) => TIPOS[p.tipo]?.zona;
const diasDesde = (f) => f ? (Date.now() - new Date(f).getTime()) / 86400000 : Infinity;

/** Cada criterio es una función (pieza, filtros) → boolean. La clave = grupo de faceta. */
const CRITERIOS = {
  zona:       (p, f) => !f.zona || ZONA(p) === f.zona,
  lotes:      (p, f) => !f.lotes || (f.lotes === 'solo' ? ES_LOTE(p.tipo) : !ES_LOTE(p.tipo)),
  texto:      (p, f) => !f.q || R.normalizar([p.codigo, p.pais, p.denominacion, p.nombre, p.anio, p.codigoCatalogo, p.descripcion, p.material].join(' ')).includes(R.normalizar(f.q)),
  precio:     (p, f) => !f.precio?.length || f.precio.some(id => { const r = RANGOS_PRECIO.find(x => x.id === id); const v = R.precioPublico(p).final; return r && v >= r.min && v <= r.max; }),
  periodo:    (p, f) => !f.periodo?.length || f.periodo.includes(p.periodo),
  continente: (p, f) => !f.continente?.length || f.continente.includes(R.infoPais(p.pais).continente),
  pais:       (p, f) => !f.pais?.length || f.pais.includes(R.normalizar(p.pais)),
  material:   (p, f) => !f.material?.length || f.material.includes(R.grupoMaterial(p.tipo, p.material)),
  calidad:    (p, f) => !f.calidad?.length || f.calidad.includes(R.grupoCalidad(p.calidad)),
  emision:    (p, f) => !f.emision?.length || f.emision.includes(p.tipoEmision),
  graduada:   (p, f) => !f.graduada || (p.graduador && p.graduador !== 'Sin graduar'),
  anio:       (p, f) => {
    const vacio = (v) => v === '' || v == null;
    if (vacio(f.anioDesde) && vacio(f.anioHasta)) return true;
    const a = R.anioPrincipal(p.anio); if (a === null) return false;
    return (vacio(f.anioDesde) || a >= +f.anioDesde) && (vacio(f.anioHasta) || a <= +f.anioHasta);
  },
  novedad:    (p, f) => !f.novedad || diasDesde(p.publicacion?.fechaPublicacion) <= (NOVEDAD.find(n => n.id === f.novedad)?.dias ?? Infinity),
  disponible: (p, f) => !f.soloDisponibles || R.disponible(p),
};
const ORDENES = {
  recientes:  (a, b) => (b.publicacion?.fechaPublicacion ?? '').localeCompare(a.publicacion?.fechaPublicacion ?? '') || (b.publicacion?.orden ?? 0) - (a.publicacion?.orden ?? 0),
  precioAsc:  (a, b) => R.precioPublico(a).final - R.precioPublico(b).final,
  precioDesc: (a, b) => R.precioPublico(b).final - R.precioPublico(a).final,
  anioAsc:    (a, b) => (R.anioPrincipal(a.anio) ?? 9999) - (R.anioPrincipal(b.anio) ?? 9999),
  anioDesc:   (a, b) => (R.anioPrincipal(b.anio) ?? -9999) - (R.anioPrincipal(a.anio) ?? -9999),
  visitas:    (a, b) => (b.publicacion?.visitas ?? 0) - (a.publicacion?.visitas ?? 0),
};

/** Valor(es) de faceta de una pieza por grupo, para contar opciones. */
const VALOR_FACETA = {
  precio: (p) => RANGOS_PRECIO.filter(r => { const v = R.precioPublico(p).final; return v >= r.min && v <= r.max; }).map(r => r.id),
  periodo: (p) => [p.periodo], continente: (p) => [R.infoPais(p.pais).continente], pais: (p) => [R.normalizar(p.pais)],
  material: (p) => [R.grupoMaterial(p.tipo, p.material)], calidad: (p) => [R.grupoCalidad(p.calidad)], emision: (p) => [p.tipoEmision],
  zona: (p) => [ZONA(p)],
};

/** GET /api/piezas?zona=&q=&precio=&periodo=&...&orden=&pagina= */
export async function listarPiezasPublicas(filtros = {}) {
  await espera(60);
  const d = await db();
  const publicas = d.piezas.filter(esPublica);
  const pasa = (p, excepto) => Object.entries(CRITERIOS).every(([k, fn]) => k === excepto || fn(p, filtros));
  const items = publicas.filter(p => pasa(p)).sort(ORDENES[filtros.orden] ?? ORDENES.recientes);
  const facetas = {};
  for (const [grupo, fn] of Object.entries(VALOR_FACETA)) {
    const conteo = {};
    for (const p of publicas) if (pasa(p, grupo)) for (const v of fn(p)) if (v) conteo[v] = (conteo[v] ?? 0) + 1;
    facetas[grupo] = conteo;
  }
  return { total: items.length, items: items.map(vistaPublica), facetas, totalPublicadas: publicas.length };
}

/** GET /api/piezas/:id  (suma una visita a la publicación) */
export async function obtenerPiezaPublica(id) {
  await espera(40);
  const d = await db();
  const p = d.piezas.find(x => x.id === id);
  if (!p || !esPublica(p)) return null;
  p.publicacion.visitas = (p.publicacion.visitas ?? 0) + 1; guardar();
  return vistaPublica(p);
}

/** GET /api/galeria?zona=monedas|billetes|medallas — piezas publicadas con foto o ilustración, en orden de publicación */
export async function listarGaleria(zona) {
  await espera(40);
  const d = await db();
  return d.piezas.filter(p => esPublica(p) && ZONA(p) === zona)
    .sort((a, b) => (a.publicacion.orden ?? 0) - (b.publicacion.orden ?? 0)).map(vistaPublica);
}

/** Opciones de país presentes en las piezas publicadas (para el selector del filtro). */
export async function paisesPublicados() {
  const d = await db();
  const m = new Map();
  for (const p of d.piezas.filter(esPublica)) m.set(R.normalizar(p.pais), R.capitalizar(p.pais));
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
}

/* ------------------------------------------------------------------ */
/* Cuentas de clientes                                                 */
/* ------------------------------------------------------------------ */
const vistaUsuario = (u) => { if (!u) return null; const { hashClave, ...r } = u; return copia(r); };

/** GET /api/sesion */
export async function usuarioActual() { return vistaUsuario(usuarioSesion(await db())); }

/** POST /api/clientes  { email, nombre, clave, celular, preferencias[], aceptaPrivacidad } */
export async function registrarCliente(datos) {
  await espera();
  const d = await db();
  const email = String(datos.email ?? '').trim().toLowerCase();
  const errores = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errores.email = 'Correo no válido';
  else if (d.usuarios.some(u => u.email === email)) errores.email = 'Ya existe una cuenta con este correo';
  if (!String(datos.nombre ?? '').trim()) errores.nombre = 'Escribe tu nombre';
  if (String(datos.clave ?? '').length < 8) errores.clave = 'Mínimo 8 caracteres';
  if (datos.celular && !/^\+?\d[\d\s]{6,14}$/.test(datos.celular)) errores.celular = 'Número no válido';
  if (!datos.aceptaPrivacidad) errores.aceptaPrivacidad = 'Debes aceptar la política de privacidad';
  if (Object.keys(errores).length) throw new ErrorApi(422, 'Revisa los datos del registro.', errores);
  const u = { id: 'u-' + crypto.randomUUID().slice(0, 8), rol: 'CLIENTE', email, nombre: datos.nombre.trim(), celular: datos.celular ?? '',
    preferencias: datos.preferencias ?? [], avisosNovedades: !!datos.avisosNovedades, aceptaPrivacidad: true, favoritos: [], vistos: [],
    hashClave: await hash(datos.clave), creadoEn: ahora() };
  d.usuarios.push(u); guardar(); sesion.fijar(u.id);
  return vistaUsuario(u);
}

/** POST /api/sesion { email, clave } — mismo error genérico si el correo o la clave fallan */
export async function iniciarSesion(email, clave) {
  await espera();
  const d = await db();
  const u = d.usuarios.find(x => x.email === String(email).trim().toLowerCase());
  if (!u || u.hashClave !== await hash(clave)) throw new ErrorApi(401, 'Correo o contraseña incorrectos.');
  sesion.fijar(u.id);
  return vistaUsuario(u);
}
/** DELETE /api/sesion */
export async function cerrarSesion() { sesion.fijar(null); }

/** POST /api/recuperaciones { email } — en producción envía el código por correo o SMS */
export async function solicitarRecuperacion(email) {
  await espera();
  const d = await db();
  const u = d.usuarios.find(x => x.email === String(email).trim().toLowerCase());
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  if (u) { d.recuperaciones[u.email] = { codigo, vence: Date.now() + 15 * 60000 }; guardar(); }
  // Respuesta idéntica exista o no la cuenta. El código se devuelve SOLO porque es un prototipo.
  return { enviado: true, codigoDemo: u ? codigo : null };
}
/** POST /api/recuperaciones/confirmar { email, codigo, nuevaClave } */
export async function restablecerClave(email, codigo, nuevaClave) {
  await espera();
  const d = await db();
  const r = d.recuperaciones[String(email).trim().toLowerCase()];
  if (!r || r.codigo !== String(codigo).trim() || r.vence < Date.now()) throw new ErrorApi(400, 'El código no es válido o ya venció.');
  if (String(nuevaClave).length < 8) throw new ErrorApi(422, 'La contraseña debe tener al menos 8 caracteres.');
  const u = d.usuarios.find(x => x.email === String(email).trim().toLowerCase());
  u.hashClave = await hash(nuevaClave); delete d.recuperaciones[u.email]; guardar();
  return true;
}

/** PATCH /api/clientes/yo { nombre, celular, preferencias, avisosNovedades } */
export async function actualizarPerfil(cambios) {
  const d = await db(); const u = exigirRol(d);
  for (const k of ['nombre', 'celular', 'preferencias', 'avisosNovedades']) if (k in cambios) u[k] = cambios[k];
  guardar(); return vistaUsuario(u);
}

/** PUT|DELETE /api/clientes/yo/favoritos/:piezaId */
export async function alternarFavorito(piezaId) {
  const d = await db(); const u = exigirRol(d);
  u.favoritos ??= [];
  const i = u.favoritos.indexOf(piezaId);
  i >= 0 ? u.favoritos.splice(i, 1) : u.favoritos.unshift(piezaId);
  guardar(); return i < 0;
}
/** GET /api/clientes/yo/favoritos — incluye las que ya no están publicadas como «no disponible» */
export async function listarFavoritos() {
  const d = await db(); const u = exigirRol(d);
  return (u.favoritos ?? []).map(id => d.piezas.find(p => p.id === id)).filter(Boolean)
    .map(p => esPublica(p) ? vistaPublica(p) : { id: p.id, retirada: true, titulo: R.tituloPieza(p) });
}
/** Registro local de piezas vistas (en producción: tabla de historial o solo en el navegador) */
export async function registrarVista(piezaId) {
  const d = await db(); const u = usuarioSesion(d); if (!u) return;
  u.vistos = [piezaId, ...(u.vistos ?? []).filter(x => x !== piezaId)].slice(0, 12); guardar();
}
export async function listarVistos() {
  const d = await db(); const u = usuarioSesion(d); if (!u) return [];
  return (u.vistos ?? []).map(id => d.piezas.find(p => p.id === id)).filter(p => p && esPublica(p)).map(vistaPublica);
}

/**
 * POST /api/solicitudes { piezaId?, tipo, mensaje }
 * Tipos: INFORMACION (consulta sobre una pieza), AVISAR_DISPONIBLE (pieza agotada),
 *        BUSCO_PIEZA (algo que no está en el catálogo), VENDER_COLECCION (consignación, de la maqueta del cliente).
 */
export async function crearSolicitud({ piezaId = null, tipo, mensaje = '' }) {
  await espera();
  const d = await db(); const u = exigirRol(d);
  if (!['INFORMACION', 'AVISAR_DISPONIBLE', 'BUSCO_PIEZA', 'VENDER_COLECCION'].includes(tipo)) throw new ErrorApi(422, 'Tipo de solicitud no válido.');
  if (tipo !== 'AVISAR_DISPONIBLE' && String(mensaje).trim().length < 5) throw new ErrorApi(422, 'Cuéntanos un poco más en el mensaje.', { mensaje: 'Mínimo 5 caracteres' });
  if (piezaId && d.solicitudes.some(s => s.usuarioId === u.id && s.piezaId === piezaId && s.tipo === tipo && s.estado === 'PENDIENTE'))
    throw new ErrorApi(409, 'Ya tienes una solicitud pendiente para esta pieza.');
  const s = { id: 's-' + crypto.randomUUID().slice(0, 8), usuarioId: u.id, piezaId, tipo, mensaje: String(mensaje).trim().slice(0, 1000), estado: 'PENDIENTE', creadaEn: ahora() };
  d.solicitudes.unshift(s); guardar(); return copia(s);
}
/** GET /api/clientes/yo/solicitudes */
export async function misSolicitudes() {
  const d = await db(); const u = exigirRol(d);
  return d.solicitudes.filter(s => s.usuarioId === u.id).map(s => ({ ...copia(s), pieza: tituloDe(d, s.piezaId) }));
}
const tituloDe = (d, id) => { const p = id && d.piezas.find(x => x.id === id); return p ? { id: p.id, titulo: R.tituloPieza(p), codigo: p.codigo } : null; };

/* ------------------------------------------------------------------ */
/* Administración (rol ENCARGADO)                                      */
/* ------------------------------------------------------------------ */
/** GET /api/admin/piezas?q=&tipo=&estado= */
export async function listarInventario({ q = '', tipo = '', estado = '' } = {}) {
  await espera(40);
  const d = await db(); exigirRol(d, 'ENCARGADO');
  const k = R.normalizar(q);
  return d.piezas.filter(p => (!tipo || p.tipo === tipo) && (!estado || p.estado === estado) &&
    (!k || R.normalizar([p.codigo, p.pais, p.denominacion, p.nombre, p.anio, p.codigoCatalogo, p.ubicacion].join(' ')).includes(k)))
    .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn)).map(copia);
}
/** GET /api/admin/piezas/:id */
export async function obtenerPieza(id) {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  const p = d.piezas.find(x => x.id === id);
  if (!p) throw new ErrorApi(404, 'La pieza no existe.');
  return copia(p);
}

const CAMPOS_FICHA = ['tipo', 'periodo', 'pais', 'denominacion', 'nombre', 'anio', 'codigoCatalogo', 'tipoEmision', 'descripcion', 'material', 'peso', 'fineza', 'onzaTroy',
  'calidad', 'graduador', 'precio', 'ubicacion', 'cantidad', 'fechaIngreso', 'estadoLote', 'automatico', 'factorIncremento', 'notasPublicas', 'fotos', 'sugerenciasIA'];

/** POST /api/admin/piezas — siempre nace como BORRADOR (privada) */
export async function crearPieza(ficha) {
  await espera();
  const d = await db(); const u = exigirRol(d, 'ENCARGADO');
  const datos = Object.fromEntries(CAMPOS_FICHA.filter(k => k in ficha).map(k => [k, ficha[k]]));
  if (!datos.periodo) datos.periodo = R.periodoDesdeAnio(datos.anio) ?? '';
  const v = R.validarFicha(datos);
  if (!v.valido) throw new ErrorApi(422, 'Hay campos por corregir.', v.errores);
  const codigo = R.generarCodigo(datos.tipo, datos, d.piezas.map(p => p.codigo));
  const p = { ...datos, id: codigo.toLowerCase(), codigo, estado: 'BORRADOR', fotos: datos.fotos ?? [], ilustracion: !(datos.fotos?.length),
    creadaEn: ahora(), actualizadaEn: ahora(), creadaPor: u.id, version: 1,
    historialPrecios: [{ fecha: ahora(), usuario: u.nombre, anterior: null, nuevo: Number(datos.precio) }],
    publicacion: { activo: false, descuento: 0, promocion: '', fechaPublicacion: null, fechaPausa: null, usuarioPausa: null, visitas: 0 } };
  d.piezas.push(p); guardar();
  return copia(p);
}

/** PUT /api/admin/piezas/:id { ...ficha, version } — control optimista + historial de precio */
export async function actualizarPieza(id, cambios) {
  await espera();
  const d = await db(); const u = exigirRol(d, 'ENCARGADO');
  const p = d.piezas.find(x => x.id === id);
  if (!p) throw new ErrorApi(404, 'La pieza no existe.');
  if (cambios.version !== undefined && cambios.version !== p.version) throw new ErrorApi(409, 'Otra persona modificó esta ficha. Recarga para ver la versión vigente.');
  const datos = Object.fromEntries(CAMPOS_FICHA.filter(k => k in cambios).map(k => [k, cambios[k]]));
  const v = R.validarFicha({ ...p, ...datos });
  if (!v.valido) throw new ErrorApi(422, 'Hay campos por corregir.', v.errores);
  if ('precio' in datos && Number(datos.precio) !== Number(p.precio))
    p.historialPrecios.push({ fecha: ahora(), usuario: u.nombre, anterior: Number(p.precio), nuevo: Number(datos.precio) });
  Object.assign(p, datos, { actualizadaEn: ahora(), version: p.version + 1, ilustracion: !(datos.fotos ?? p.fotos)?.length });
  guardar(); return copia(p);
}

/** POST /api/admin/piezas/:id/aprobar — valida mínimos y deja APROBADA_PRIVADA (no publica) */
export async function aprobarPieza(id) {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  const p = d.piezas.find(x => x.id === id);
  const v = R.validarFicha(p);
  if (!v.valido) throw new ErrorApi(422, 'La ficha tiene errores.', v.errores);
  if (!p.calidad) throw new ErrorApi(422, 'Define la calidad antes de aprobar (la decide el encargado).');
  p.estado = p.estado === 'PUBLICADA' ? 'PUBLICADA' : 'APROBADA_PRIVADA'; p.actualizadaEn = ahora(); guardar(); return copia(p);
}

/** POST /api/admin/publicaciones { piezaId, descuento, promocion } */
export async function publicar(id, { descuento = 0, promocion = '' } = {}) {
  const d = await db(); const u = exigirRol(d, 'ENCARGADO');
  const p = d.piezas.find(x => x.id === id);
  if (p.estado === 'BORRADOR') throw new ErrorApi(422, 'Aprueba la ficha antes de publicarla.');
  if (!(Number(descuento) >= 0 && Number(descuento) <= 90)) throw new ErrorApi(422, 'El descuento debe estar entre 0 y 90 %.');
  const orden = Math.max(0, ...d.piezas.map(x => x.publicacion?.orden ?? 0)) + 1;
  p.estado = 'PUBLICADA';
  p.publicacion = { ...p.publicacion, activo: true, descuento: Number(descuento), promocion, fechaPublicacion: p.publicacion.fechaPublicacion ?? ahora().slice(0, 10), fechaPausa: null, usuarioPausa: null, orden: p.publicacion.orden ?? orden };
  p.actualizadaEn = ahora(); guardar(); return copia(p);
}
/** POST /api/admin/publicaciones/:id/pausar — sale del catálogo y la sala; la ficha se conserva */
export async function pausarPublicacion(id) {
  const d = await db(); const u = exigirRol(d, 'ENCARGADO');
  const p = d.piezas.find(x => x.id === id);
  p.estado = 'APROBADA_PRIVADA';
  p.publicacion = { ...p.publicacion, activo: false, fechaPausa: ahora(), usuarioPausa: u.nombre };
  p.actualizadaEn = ahora(); guardar(); return copia(p);
}
/** DELETE /api/admin/piezas/:id — en producción: borrado lógico */
export async function eliminarPieza(id) {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  d.piezas = d.piezas.filter(p => p.id !== id); guardar();
}

/**
 * GET /api/admin/publicaciones?filtro=
 * Filtros del cliente: NO PUBLICADOS, recientes, más de 3 meses, inactivas, por precio, sets/lotes, más visitadas.
 */
export async function listarPublicaciones(filtro = 'todas') {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  let l = d.piezas.slice();
  const dias = (p) => diasDesde(p.publicacion?.fechaPublicacion);
  switch (filtro) {
    case 'noPublicados': l = l.filter(p => !p.publicacion?.fechaPublicacion); break;
    case 'recientes': l = l.filter(p => p.publicacion?.activo && dias(p) <= 30).sort(ORDENES.recientes); break;
    case 'mas3meses': l = l.filter(p => p.publicacion?.activo && dias(p) > 90); break;
    case 'inactivas': l = l.filter(p => p.publicacion?.fechaPublicacion && !p.publicacion.activo); break;
    case 'precio': l = l.filter(p => p.publicacion?.activo).sort(ORDENES.precioDesc); break;
    case 'lotes': l = l.filter(p => ES_LOTE(p.tipo)); break;
    case 'visitadas': l = l.filter(p => p.publicacion?.activo).sort(ORDENES.visitas); break;
    default: l = l.filter(p => p.publicacion?.fechaPublicacion || p.estado !== 'BORRADOR');
  }
  return l.map(copia);
}

/** GET /api/admin/solicitudes · PATCH /api/admin/solicitudes/:id { estado } */
export async function listarSolicitudes() {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  return d.solicitudes.map(s => ({ ...copia(s), pieza: tituloDe(d, s.piezaId), cliente: vistaUsuario(d.usuarios.find(u => u.id === s.usuarioId)) }));
}
export async function cambiarEstadoSolicitud(id, estado) {
  const d = await db(); exigirRol(d, 'ENCARGADO');
  const s = d.solicitudes.find(x => x.id === id); s.estado = estado; s.atendidaEn = ahora(); guardar(); return copia(s);
}

/** POST /api/admin/importaciones — crea borradores a partir de filas ya validadas en el cliente */
export async function importarFichas(fichas) {
  const creadas = [], fallidas = [];
  for (const f of fichas) {
    try { creadas.push(await crearPieza(f)); }
    catch (e) { fallidas.push({ ficha: f, error: e.message, detalle: e.detalle }); }
  }
  return { creadas, fallidas };
}

/**
 * POST /api/admin/catalogacion-ia { tipo, fotos[] }
 * SIMULADO: devuelve sugerencias fijas para demostrar el flujo aceptar/corregir/descartar.
 * Producto final: el servidor llama al proveedor de IA con las fotos y registra SOLICITUD_IA/SUGERENCIA_IA.
 */
export async function sugerirAtributos(tipo) {
  await espera(900);
  const base = tipo === 'billete'
    ? { pais: 'ECUADOR', denominacion: '10 Sucres', anio: 1988, codigoCatalogo: 'P-121', material: 'Papel', descripcion: 'Sebastián de Benalcázar' }
    : { pais: 'ECUADOR', denominacion: '1 Sucre', anio: 1978, codigoCatalogo: 'KM 83', material: 'Níquel', descripcion: 'Escudo de armas de la República del Ecuador' };
  return { proveedor: 'simulado', atributos: base, noDisponibles: ['fineza', 'graduador'] };
}

export { restablecer as restablecerDatos };
