/**
 * Convierte las hojas leídas del Excel del cliente en fichas del inventario.
 * Detecta el tipo de cada hoja por su nombre o por sus encabezados y
 * empareja columnas por nombre (sin importar tildes, mayúsculas ni orden).
 * Cada fila produce: { ficha, fotos: Blob[], errores, avisos, origen }.
 */
import { normalizar, periodoDesdeAnio, periodoDesdeTexto, onzasTroy, validarFicha, capitalizar } from '../dominio/reglas.js';
import { ES_LOTE } from '../config/catalogos.js';

/** Encabezado del Excel (normalizado) → campo de la ficha. */
const COLUMNAS = {
  'PERIODO': 'periodoTexto', 'PAIS': 'pais', 'PAIS O PAISES': 'pais', 'DENOMINACION': 'denominacion',
  'ANO': 'anio', 'ANIO': 'anio', 'CODIGO CATALOGO': 'codigoCatalogo', 'CODIGO DE CATALOGO': 'codigoCatalogo', 'KM': 'codigoCatalogo', 'PICK': 'codigoCatalogo',
  'TIPO DE EMISION': 'tipoEmision', 'DESCRIPCION': 'descripcion', 'MATERIAL': 'material',
  'PESO EN GRAMOS': 'peso', 'PESO': 'peso', 'FINEZA': 'fineza', 'CONTENIDO DE ONZA TROY': 'onzaTroy', 'CONTENIDO ONZA TROY': 'onzaTroy',
  'CALIDAD': 'calidad', 'GRADUADOR': 'graduador', 'PRECIO': 'precio', 'UBICACION': 'ubicacion', 'CANTIDAD': 'cantidad',
  'FECHA INGRESO': 'fechaIngreso', 'FECHA DE INGRESO': 'fechaIngreso', 'NOMBRE': 'nombre',
  'ESTADO': 'estadoLote', 'ESTADO DEL SET/LOTE': 'estadoLote', 'AUTOMATICO': 'automatico', 'FACTOR INCREMENTO': 'factorIncremento',
  'FOTO 1': 'foto1', 'FOTO 2': 'foto2', 'FOTO 3': 'foto3',
};

/** Tipo de ítem a partir del nombre de la hoja y sus columnas. */
export function detectarTipoHoja(nombre, campos) {
  const n = normalizar(nombre);
  const lote = /LOTE|SET/.test(n);
  if (/BILLETE/.test(n)) return lote ? 'loteBillete' : 'billete';
  if (/MEDALLA/.test(n)) return 'medalla';
  if (/MONEDA/.test(n)) return lote ? 'loteMoneda' : 'moneda';
  if (campos.includes('denominacion')) return 'moneda';
  if (campos.includes('nombre')) return 'loteMoneda';
  return null;
}

const vacio = (v) => v === undefined || v === null || v === '' || v === '-';
const num = (v) => vacio(v) ? '' : (typeof v === 'number' ? v : (Number(String(v).replace(',', '.')) || ''));

export function mapearHojas(libro) {
  const resultado = [];
  for (const hoja of libro.hojas) {
    const colACampo = {};
    for (const [col, enc] of Object.entries(hoja.encabezados)) {
      const campo = COLUMNAS[normalizar(enc)];
      if (campo) colACampo[col] = campo;
    }
    const campos = Object.values(colACampo);
    const tipo = detectarTipoHoja(hoja.nombre, campos);
    const sinMapear = Object.entries(hoja.encabezados).filter(([c]) => !colACampo[c]).map(([, e]) => e);
    const filas = [];
    for (const f of hoja.filas) {
      const crudo = {};
      for (const [col, val] of Object.entries(f.valores)) if (colACampo[col]) crudo[colACampo[col]] = val;
      const fotos = Object.entries(f.imagenes).filter(([c]) => /^foto/.test(colACampo[c] || '')).sort().map(([, b]) => b);
      if (!Object.keys(crudo).length && !fotos.length) continue;
      filas.push(convertirFila(tipo, crudo, fotos, `${hoja.nombre} · fila ${f.fila}`));
    }
    resultado.push({ hoja: hoja.nombre, tipo, columnasSinMapear: sinMapear, filas });
  }
  return resultado;
}

function convertirFila(tipo, c, fotos, origen) {
  const avisosImportacion = {};
  const ficha = {
    tipo,
    pais: c.pais ? String(c.pais).trim().toUpperCase() : '',
    denominacion: c.denominacion ?? '',
    nombre: c.nombre ?? '',
    anio: vacio(c.anio) ? '' : c.anio,
    codigoCatalogo: vacio(c.codigoCatalogo) ? '' : String(c.codigoCatalogo).replace(/\s+/g, ' ').trim(),
    tipoEmision: vacio(c.tipoEmision) ? '' : capitalizar(c.tipoEmision),
    descripcion: c.descripcion ?? '',
    material: vacio(c.material) ? '' : capitalizar(c.material),
    peso: num(c.peso), fineza: num(c.fineza), onzaTroy: num(c.onzaTroy),
    calidad: c.calidad ?? '',
    graduador: vacio(c.graduador) ? (ES_LOTE(tipo) || tipo === 'billete' && !c.graduador ? '' : 'Sin graduar') : capitalizarGraduador(c.graduador),
    precio: num(c.precio), cantidad: vacio(c.cantidad) ? 1 : c.cantidad,
    ubicacion: vacio(c.ubicacion) ? '' : String(c.ubicacion).toUpperCase(),
    fechaIngreso: c.fechaIngreso || new Date().toISOString().slice(0, 10),
    estadoLote: ES_LOTE(tipo) ? (c.estadoLote ? capitalizar(c.estadoLote) : 'Nuevo') : '',
    automatico: c.automatico ? normalizar(c.automatico).startsWith('S') : false,
    factorIncremento: vacio(c.factorIncremento) ? '' : c.factorIncremento,
  };
  if (vacio(c.cantidad)) avisosImportacion.cantidad = 'Sin cantidad en el Excel: se asumió 1';

  // Periodo: el declarado manda, pero se compara con el calculado por el año
  const declarado = periodoDesdeTexto(c.periodoTexto);
  const calculado = periodoDesdeAnio(ficha.anio);
  ficha.periodo = declarado ?? calculado ?? '';
  if (c.periodoTexto && !declarado) avisosImportacion.periodo = `Periodo «${c.periodoTexto}» no reconocido`;

  // Onza troy: se recalcula si hay peso y fineza
  const oz = onzasTroy(ficha.peso, ficha.fineza);
  if (oz !== null && ficha.onzaTroy === '') ficha.onzaTroy = oz;

  const { errores, avisos } = validarFicha(ficha);
  return { ficha, fotos, errores, avisos: { ...avisosImportacion, ...avisos }, origen };
}

function capitalizarGraduador(g) {
  const k = normalizar(g);
  if (k.startsWith('SIN')) return 'Sin graduar';
  return k;
}
