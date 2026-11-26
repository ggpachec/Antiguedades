/**
 * Reglas de negocio puras (sin DOM ni almacenamiento).
 * Se pueden reutilizar tal cual en el backend (Node) o portarse a otro lenguaje;
 * las pruebas están en /pruebas/reglas.test.mjs (node pruebas/reglas.test.mjs).
 */
import {
  TIPOS, ES_LOTE, PERIODOS, SINONIMOS_PERIODO, PAISES, GRAMOS_ONZA_TROY, LIMITES,
  GRUPOS_MATERIAL_METAL, GRUPOS_MATERIAL_BILLETE, UBICACIONES,
} from '../config/catalogos.js';

/** Mayúsculas sin tildes, espacios colapsados. */
export function normalizar(txt) {
  return String(txt ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Extrae el año principal de textos como «1751», «80-81», «(2000-2001)», «s/f». Devuelve número o null. */
export function anioPrincipal(anio) {
  if (anio === null || anio === undefined || anio === '') return null;
  if (typeof anio === 'number') return Math.trunc(anio);
  const m = String(anio).match(/-?\d{1,4}/);
  return m ? parseInt(m[0], 10) : null;
}

/** Periodo calculado a partir del año (el documento pide calcularlo pero permitir cambiarlo). */
export function periodoDesdeAnio(anio) {
  const n = anioPrincipal(anio);
  if (n === null) return null;
  return PERIODOS.find(p => n >= p.desde && n <= p.hasta)?.id ?? null;
}

/** Convierte el texto de periodo del Excel («SIGLO XVIII», «EDAD ANTIGUA») al id del catálogo. */
export function periodoDesdeTexto(txt) {
  const k = normalizar(txt);
  return SINONIMOS_PERIODO[k] ?? PERIODOS.find(p => normalizar(p.nombre) === k)?.id ?? null;
}

export function nombrePeriodo(id) { return PERIODOS.find(p => p.id === id)?.nombre ?? '—'; }

/** País → [ISO3, continente]. Si no está en la tabla, usa las 3 primeras letras. */
export function infoPais(pais) {
  const k = normalizar(pais);
  for (const [nombre, v] of Object.entries(PAISES)) if (normalizar(nombre) === k) return { iso3: v[0], continente: v[1] };
  if (k.includes(',') || k.includes(' Y ')) return { iso3: 'VAR', continente: null };
  return { iso3: (k.replace(/[^A-Z]/g, '') + 'XXX').slice(0, 3), continente: null };
}

/**
 * Código de inventario según el documento del cliente:
 *  Moneda  MO + País(3) + Año + Secuencia  → MO-CHL-1751-001
 *  Billete BI + País(3) + Año + Secuencia  → BI-ECU-1928-001
 *  Medalla ME + País(3) + Año + Secuencia  (por confirmar con el cliente)
 *  Lotes   L + MO|BI + Secuencia           → L-MO-001
 * `existentes` = códigos ya usados, para calcular la secuencia.
 * En producción la secuencia la asigna la BD dentro de una transacción.
 */
export function generarCodigo(tipo, { pais, anio } = {}, existentes = []) {
  const t = TIPOS[tipo];
  if (!t) throw new Error(`Tipo desconocido: ${tipo}`);
  const base = ES_LOTE(tipo)
    ? t.prefijo
    : `${t.prefijo}-${infoPais(pais).iso3}-${anioPrincipal(anio) === null ? 'SF' : String(Math.abs(anioPrincipal(anio))).padStart(4, '0')}`;
  const usados = existentes.filter(c => c.startsWith(base + '-')).map(c => parseInt(c.slice(base.length + 1), 10) || 0);
  const sec = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${base}-${String(sec).padStart(3, '0')}`;
}

export function redondear(n, dec) { const f = 10 ** dec; return Math.round(n * f) / f; }

/** Contenido en onzas troy = peso(g) × fineza / 31,1035, con 4 decimales. */
export function onzasTroy(pesoG, fineza) {
  const p = Number(pesoG), f = Number(fineza);
  if (!(p > 0) || !(f > 0) || f > 1) return null;
  return redondear(p * f / GRAMOS_ONZA_TROY, LIMITES.decimalesOnza);
}

/** Grupo de material para el filtro público. */
export function grupoMaterial(tipo, material) {
  const k = normalizar(material);
  if (!k) return null;
  const grupos = (tipo === 'billete' || tipo === 'loteBillete') ? GRUPOS_MATERIAL_BILLETE : GRUPOS_MATERIAL_METAL;
  const g = grupos.find(g => g.claves.some(c => k.startsWith(c) || k === c));
  if (g) return g.id;
  // «Bronce de aluminio», «Acero enchapado en cobre»: se toma la primera palabra reconocible
  const porPalabra = grupos.find(g => g.claves.some(c => k.split(' ').includes(c)));
  return porPalabra?.id ?? (grupos === GRUPOS_MATERIAL_METAL ? 'otros' : null);
}

/** Calidad (texto libre del Excel) → grupo del filtro: unc | xfau | vf | proof. */
export function grupoCalidad(calidad) {
  const k = normalizar(calidad);
  if (!k) return null;
  if (k.includes('PROOF') || /^PF/.test(k)) return 'proof';
  const m = k.match(/(MS|AU|XF|EF|VF|F|VG|G|P)\s*-?(\d{1,2})?/);
  if (k.startsWith('UNC') || k.startsWith('BU') || k.startsWith('MS')) return 'unc';
  if (k.startsWith('AU') || k.startsWith('XF') || k.startsWith('EF')) return 'xfau';
  if (m) return 'vf';
  return null;
}

/** ¿El ítem tiene un detalle de conservación («DET», «DETAILS», «SCRATCHED»)? */
export function calidadConDetalle(calidad) { return /\bDET|DETAILS|SCRATCH|CLEANED|LIMPIAD/.test(normalizar(calidad)); }

/** Precio público vigente aplicando el descuento de la publicación (si está activa). */
export function precioPublico(pieza) {
  const base = Number(pieza.precio) || 0;
  const pub = pieza.publicacion;
  const d = pub?.activo && pub.descuento ? Number(pub.descuento) : 0;
  return { base, final: redondear(base * (1 - d / 100), 2), descuento: d };
}

/** Disponibilidad pública (los agotados se muestran como «No disponible»). */
export function disponible(pieza) { return (Number(pieza.cantidad) || 0) > 0; }

/**
 * Valida una ficha según su tipo. Devuelve { errores: {campo: msg}, avisos: {campo: msg} }.
 * Errores bloquean el guardado; avisos se muestran pero permiten guardar como borrador.
 */
export function validarFicha(f) {
  const errores = {}, avisos = {};
  const req = (campo, msg = 'Obligatorio') => { if (f[campo] === undefined || f[campo] === null || String(f[campo]).trim() === '') errores[campo] = msg; };
  if (!TIPOS[f.tipo]) errores.tipo = 'Selecciona un tipo';
  const lote = ES_LOTE(f.tipo);

  if (f.tipo === 'moneda' || f.tipo === 'medalla') {
    req('pais'); req('denominacion');
    if (f.codigoCatalogo && !/^[A-Za-z0-9 .,\-/]{1,12}$/.test(String(f.codigoCatalogo).trim()))
      errores.codigoCatalogo = `Máximo ${LIMITES.codigoCatalogo} caracteres alfanuméricos`;
    if (f.fineza !== '' && f.fineza != null && !(Number(f.fineza) > 0 && Number(f.fineza) <= 1))
      errores.fineza = 'Entre 0,001 y 1,000';
    if (f.peso !== '' && f.peso != null && !(Number(f.peso) > 0)) errores.peso = 'Debe ser mayor que 0';
    const calc = onzasTroy(f.peso, f.fineza);
    if (calc !== null && f.onzaTroy != null && f.onzaTroy !== '' && Math.abs(calc - Number(f.onzaTroy)) > 0.0005)
      avisos.onzaTroy = `Recalculado con 31,1035 g/oz: ${calc.toFixed(4)}`;
  }
  if (f.tipo === 'billete') {
    req('nombre');
    if (f.nombre && f.nombre.length > LIMITES.nombreBillete) errores.nombre = `Máximo ${LIMITES.nombreBillete} caracteres`;
  }
  if (lote) {
    req('nombre');
    if (f.descripcion && f.descripcion.length > LIMITES.descripcionLote) errores.descripcion = `Máximo ${LIMITES.descripcionLote} caracteres`;
  }
  if (f.precio === '' || f.precio == null || !(Number(f.precio) >= 0)) errores.precio = 'Precio ≥ 0';
  if (f.cantidad === '' || f.cantidad == null || !(Number.isInteger(Number(f.cantidad)) && Number(f.cantidad) >= 0)) errores.cantidad = 'Entero ≥ 0';
  if (f.factorIncremento !== '' && f.factorIncremento != null && !/^\d{1,2}$/.test(String(f.factorIncremento)))
    errores.factorIncremento = 'Número de hasta 2 dígitos';
  if (f.ubicacion && !UBICACIONES.includes(String(f.ubicacion).toUpperCase()))
    avisos.ubicacion = `«${f.ubicacion}» no está en las ubicaciones definidas (${UBICACIONES.join(', ')})`;

  if (f.anio !== '' && f.anio != null && f.periodo) {
    const calc = periodoDesdeAnio(f.anio);
    if (calc && calc !== f.periodo) avisos.periodo = `El año ${f.anio} corresponde a ${nombrePeriodo(calc)}`;
  }
  return { errores, avisos, valido: Object.keys(errores).length === 0 };
}

/** Título visible de una pieza para tarjetas, etiquetas y la sala. */
export function tituloPieza(p) {
  if (ES_LOTE(p.tipo) || p.tipo === 'billete') return p.nombre || p.denominacion || p.codigo;
  return [p.denominacion, p.pais && capitalizar(p.pais)].filter(Boolean).join(' · ');
}
export function subtituloPieza(p) {
  const anio = p.anio ? String(p.anio) : (ES_LOTE(p.tipo) ? '' : 'Sin fecha');
  return [ES_LOTE(p.tipo) ? capitalizar(p.pais) : null, anio, p.material && capitalizar(p.material)].filter(Boolean).join(' · ');
}

export function capitalizar(t) {
  return String(t ?? '').toLowerCase().replace(/(^|[\s/(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
}

/** Año abreviado de la etiqueta según el cliente: 2026 → «26/.» */
export function anioEtiqueta(fecha = new Date()) { return String(fecha.getFullYear()).slice(-2) + '/.'; }
