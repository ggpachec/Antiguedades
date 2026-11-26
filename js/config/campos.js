/**
 * Definición DECLARATIVA de los formularios por tipo de pieza
 * (documento del cliente: Monedas, Lotes/sets de monedas, Billetes, Lotes/sets de billetes).
 * El formulario se genera a partir de esta tabla; el backend puede exponerla como
 * GET /api/catalogos/campos para que agregar un campo no requiera tocar la interfaz.
 *
 * k: clave del campo · etq: etiqueta · t: text|number|select|textarea|checkbox|date|lista
 * req: obligatorio · max: largo máximo · paso: step de número · ancho: 'doble'|'ancho'
 */
import { PERIODOS, TIPOS_EMISION, MATERIALES, CALIDADES, GRADUADORES, UBICACIONES, ESTADOS_LOTE, LIMITES } from './catalogos.js';

const periodo = { k: 'periodo', etq: 'Periodo', t: 'select', opciones: PERIODOS.map(p => [p.id, p.nombre]), ayuda: 'Se calcula desde el año; puedes cambiarlo.' };
const comunesInventario = [
  { k: 'precio', etq: 'Precio (USD)', t: 'number', paso: '0.01', req: true },
  { k: 'cantidad', etq: 'Cantidad', t: 'number', paso: '1', req: true },
  { k: 'ubicacion', etq: 'Ubicación', t: 'lista', opciones: UBICACIONES, ayuda: UBICACIONES.join(', ') },
  { k: 'fechaIngreso', etq: 'Fecha de ingreso', t: 'date' },
];
const precioAutomatico = [
  { k: 'automatico', etq: 'Precio automático por metal (S/N)', t: 'checkbox', reservado: true },
  { k: 'factorIncremento', etq: 'Factor de incremento', t: 'number', paso: '1', ayuda: 'Número de 2 dígitos', reservado: true },
];

const moneda = [
  { k: 'pais', etq: 'País', t: 'text', req: true, lista: 'lista-paises' },
  { k: 'denominacion', etq: 'Denominación', t: 'text', req: true },
  { k: 'anio', etq: 'Año', t: 'text', ayuda: 'Puede ir vacío si la fecha está borrada. Admite «80-81».' },
  periodo,
  { k: 'codigoCatalogo', etq: 'Código de catálogo (KM, RIC…)', t: 'text', max: LIMITES.codigoCatalogo, ayuda: 'Alfanumérico, máx. 12' },
  { k: 'tipoEmision', etq: 'Tipo de emisión', t: 'select', opciones: [['', '—'], ...TIPOS_EMISION.map(x => [x, x])] },
  { k: 'descripcion', etq: 'Descripción (historia o detalle)', t: 'textarea', ancho: 'ancho', ia: true },
  { k: 'material', etq: 'Material', t: 'lista', opciones: MATERIALES },
  { k: 'peso', etq: 'Peso (g)', t: 'number', paso: '0.01' },
  { k: 'fineza', etq: 'Fineza', t: 'number', paso: '0.001', ayuda: '3 decimales, p. ej. 0,917' },
  { k: 'onzaTroy', etq: 'Contenido onza troy', t: 'number', paso: '0.0001', ayuda: 'Se calcula: peso × fineza ÷ 31,1035', auto: true },
  { k: 'calidad', etq: 'Calidad', t: 'lista', opciones: CALIDADES, ayuda: 'La define el encargado (no la IA)' },
  { k: 'graduador', etq: 'Graduador', t: 'select', opciones: GRADUADORES.map(x => [x, x]) },
  ...comunesInventario, ...precioAutomatico,
];

const loteMoneda = [
  { k: 'nombre', etq: 'Nombre del set o lote', t: 'text', req: true, ancho: 'doble' },
  periodo,
  { k: 'pais', etq: 'País (o VARIOS)', t: 'text', lista: 'lista-paises' },
  { k: 'estadoLote', etq: 'Estado del set/lote', t: 'select', opciones: ESTADOS_LOTE.map(x => [x, x]) },
  { k: 'calidad', etq: 'Calidad', t: 'lista', opciones: CALIDADES },
  { k: 'descripcion', etq: 'Descripción', t: 'textarea', ancho: 'ancho', max: LIMITES.descripcionLote },
  { k: 'onzaTroy', etq: 'Contenido onzas troy', t: 'number', paso: '0.0001', ayuda: 'Para el cálculo automático del precio del lote' },
  ...comunesInventario, ...precioAutomatico,
];

const billete = [
  { k: 'nombre', etq: 'Nombre', t: 'text', req: true, max: LIMITES.nombreBillete, ancho: 'doble', ayuda: 'Máx. 30 caracteres' },
  { k: 'pais', etq: 'País', t: 'text', lista: 'lista-paises', ayuda: 'Necesario para el código BI + país' },
  { k: 'denominacion', etq: 'Denominación', t: 'text' },
  { k: 'anio', etq: 'Año', t: 'text' },
  periodo,
  { k: 'codigoCatalogo', etq: 'Pick', t: 'text', max: LIMITES.codigoCatalogo, ayuda: 'p. ej. P-84' },
  { k: 'material', etq: 'Material', t: 'select', opciones: [['', '—'], ['Papel', 'Papel'], ['Polímero', 'Polímero'], ['Híbrido', 'Híbrido']] },
  { k: 'descripcion', etq: 'Descripción', t: 'textarea', ancho: 'ancho', ia: true },
  { k: 'calidad', etq: 'Calidad', t: 'lista', opciones: CALIDADES },
  { k: 'graduador', etq: 'Graduador', t: 'select', opciones: [['Sin graduar', 'Sin graduar'], ['NGC', 'NGC'], ['SRN', 'SRN'], ['PCGS', 'PCGS']] },
  ...comunesInventario,
];

const loteBillete = [
  { k: 'nombre', etq: 'Nombre del set o lote', t: 'text', req: true, ancho: 'doble' },
  { k: 'estadoLote', etq: 'Estado del set/lote', t: 'select', opciones: ESTADOS_LOTE.map(x => [x, x]) },
  { k: 'pais', etq: 'País (o VARIOS)', t: 'text', lista: 'lista-paises' },
  periodo,
  { k: 'calidad', etq: 'Calidad', t: 'lista', opciones: CALIDADES },
  { k: 'descripcion', etq: 'Descripción', t: 'textarea', ancho: 'ancho', max: LIMITES.descripcionLote },
  ...comunesInventario,
];

export const CAMPOS_POR_TIPO = { moneda, loteMoneda, billete, loteBillete, medalla: moneda };
