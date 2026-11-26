/**
 * Catálogos y listas de valores del dominio De Colección.
 * Fuente: documento del cliente «Proyecto De Colección ESPOL» (campos por tipo)
 * y hoja de filtros del cliente (VISUALIZACION_DE_FILTROS).
 *
 * En el producto final estas listas viven en tablas de catálogo de la BD
 * (o en un endpoint GET /api/catalogos) para que el negocio pueda ampliarlas
 * sin tocar código. Aquí son constantes para el prototipo.
 */

/** Tipos de ítem del inventario. `prefijo` alimenta la generación de códigos. */
export const TIPOS = {
  moneda:      { id: 'moneda',      nombre: 'Moneda',           plural: 'Monedas',          prefijo: 'MO',   zona: 'monedas',  forma3d: 'disco' },
  loteMoneda:  { id: 'loteMoneda',  nombre: 'Set / lote de monedas', plural: 'Sets de monedas', prefijo: 'L-MO', zona: 'monedas',  forma3d: 'estuche' },
  billete:     { id: 'billete',     nombre: 'Billete',          plural: 'Billetes',         prefijo: 'BI',   zona: 'billetes', forma3d: 'plano' },
  loteBillete: { id: 'loteBillete', nombre: 'Set / lote de billetes', plural: 'Sets de billetes', prefijo: 'L-BI', zona: 'billetes', forma3d: 'estuche' },
  medalla:     { id: 'medalla',     nombre: 'Medalla',          plural: 'Medallas',         prefijo: 'ME',   zona: 'medallas', forma3d: 'disco' },
};
export const ES_LOTE = (tipo) => tipo === 'loteMoneda' || tipo === 'loteBillete';

/** Periodos según el documento del cliente. `hasta` inclusivo. */
export const PERIODOS = [
  { id: 'ANTIGUO',        nombre: 'Antiguo',        desde: -Infinity, hasta: 499 },
  { id: 'MEDIEVAL',       nombre: 'Medieval',       desde: 500,  hasta: 1450 },
  { id: 'EPOCA_MODERNA',  nombre: 'Época moderna',  desde: 1451, hasta: 1800 },
  { id: 'SIGLO_XIX',      nombre: 'Siglo XIX',      desde: 1801, hasta: 1900 },
  { id: 'SIGLO_XX',       nombre: 'Siglo XX',       desde: 1901, hasta: 2000 },
  { id: 'SIGLO_XXI',      nombre: 'Siglo XXI',      desde: 2001, hasta: Infinity },
];
/** Sinónimos encontrados en el Excel real del cliente → id de periodo. */
export const SINONIMOS_PERIODO = {
  'EDAD ANTIGUA': 'ANTIGUO', 'ANTIGUO': 'ANTIGUO', 'ERA ANTIGUA': 'ANTIGUO',
  'MEDIEVAL': 'MEDIEVAL', 'MEDIEVO': 'MEDIEVAL',
  'EPOCA MODERNA': 'EPOCA_MODERNA', 'SIGLO XVI': 'EPOCA_MODERNA', 'SIGLO XVII': 'EPOCA_MODERNA', 'SIGLO XVIII': 'EPOCA_MODERNA',
  'SIGLO XIX': 'SIGLO_XIX', 'SIGLO XX': 'SIGLO_XX', 'SIGLO XXI': 'SIGLO_XXI',
};

export const TIPOS_EMISION = ['Circulante', 'Conmemorativa', 'Proof', 'Bullion', 'De colección'];

/** Materiales que el cliente nombró, agrupados como en su hoja de filtros. */
export const MATERIALES = ['Plata', 'Oro', 'Platino', 'Níquel', 'Cuproníquel', 'Cobre', 'Bronce', 'Latón', 'Aluminio', 'Bronce de aluminio', 'Acero enchapado en cobre', 'Metal', 'Plástico', 'Porcelana', 'Madera'];
export const GRUPOS_MATERIAL_METAL = [
  { id: 'plata',  nombre: 'Plata',                          claves: ['PLATA'] },
  { id: 'oro',    nombre: 'Oro y platino',                  claves: ['ORO', 'PLATINO'] },
  { id: 'niquel', nombre: 'Níquel y cuproníquel',           claves: ['NIQUEL', 'CUPRONIQUEL', 'COBRE-NIQUEL'] },
  { id: 'cobre',  nombre: 'Cobre, bronce y latón',          claves: ['COBRE', 'BRONCE', 'LATON'] },
  { id: 'otros',  nombre: 'Aluminio, bimetálicas y otros',  claves: [] }, // por defecto
];
export const GRUPOS_MATERIAL_BILLETE = [
  { id: 'papel',    nombre: 'Papel',    claves: ['PAPEL'] },
  { id: 'polimero', nombre: 'Polímero', claves: ['POLIMERO'] },
  { id: 'hibrido',  nombre: 'Híbrido',  claves: ['HIBRIDO'] },
];

/** Calidades sugeridas (el campo admite texto libre: el Excel trae «UNC DET», «AU 55», «XF+»...). */
export const CALIDADES = ['UNC', 'AU', 'XF', 'VF', 'F', 'VG', 'G', 'P', 'Proof', 'AU58', 'MS62', 'MS63', 'MS65', 'VF25'];
/** Grupos de calidad para el filtro público (hoja de filtros del cliente). */
export const GRUPOS_CALIDAD = [
  { id: 'unc',   nombre: 'UNC, BU y MS' },
  { id: 'xfau',  nombre: 'XF y AU' },
  { id: 'vf',    nombre: 'VF o menor' },
  { id: 'proof', nombre: 'Proof' },
];

export const GRADUADORES = ['Sin graduar', 'NGC', 'PCGS', 'ANACS', 'ENCS', 'SRN'];
export const UBICACIONES = ['L1', 'L2', 'L3', 'B1', 'B2', 'B3', 'B4', 'B5'];
export const ESTADOS_LOTE = ['Nuevo', 'Usado', 'Variado'];

export const LIMITES = {
  codigoCatalogo: 12,      // alfanumérico
  nombreBillete: 30,
  descripcionLote: 1800,
  decimalesFineza: 3,
  decimalesOnza: 4,
  factorIncremento: 99,    // número de 2 dígitos
  fotos: 3,
  bytesFoto: 8 * 1024 * 1024,
};

/** 1 onza troy en gramos. El Excel del cliente usa 31,1 (redondeado). */
export const GRAMOS_ONZA_TROY = 31.1035;

export const CONTINENTES = ['América', 'Europa', 'Asia', 'África', 'Oceanía y reg. polares'];

/**
 * País → código ISO-3 (para el código de inventario) y continente (para filtros).
 * Incluye entidades históricas del Excel real. En producción: tabla PAIS.
 */
export const PAISES = {
  'ECUADOR': ['ECU', 'América'], 'USA': ['USA', 'América'], 'ESTADOS UNIDOS': ['USA', 'América'],
  'MÉXICO': ['MEX', 'América'], 'MEXICO': ['MEX', 'América'], 'COLOMBIA': ['COL', 'América'],
  'PERÚ': ['PER', 'América'], 'CHILE': ['CHL', 'América'], 'ARGENTINA': ['ARG', 'América'],
  'BOLIVIA': ['BOL', 'América'], 'BRASIL': ['BRA', 'América'], 'VENEZUELA': ['VEN', 'América'],
  'ESPAÑA': ['ESP', 'Europa'], 'ALEMANIA': ['DEU', 'Europa'], 'ALEMANIA / NAZI': ['DEU', 'Europa'],
  'ALBANIA': ['ALB', 'Europa'], 'FRANCIA': ['FRA', 'Europa'], 'ITALIA': ['ITA', 'Europa'],
  'REINO UNIDO': ['GBR', 'Europa'], 'ROMA / IMPERIO': ['ROM', 'Europa'], 'ROMA': ['ROM', 'Europa'],
  'AFGANISTÁN': ['AFG', 'Asia'], 'JAPÓN': ['JPN', 'Asia'], 'CHINA': ['CHN', 'Asia'], 'INDIA': ['IND', 'Asia'],
  'ÁFRICA DEL ESTE': ['EAF', 'África'], 'EGIPTO': ['EGY', 'África'], 'SUDÁFRICA': ['ZAF', 'África'],
  'AUSTRALIA': ['AUS', 'Oceanía y reg. polares'], 'NUEVA ZELANDA': ['NZL', 'Oceanía y reg. polares'],
  'ANTÁRTIDA': ['ATA', 'Oceanía y reg. polares'], 'VARIOS': ['VAR', null],
};

/** Preferencias de coleccionismo del registro de clientes (documento del cliente). */
export const PREFERENCIAS = [
  'Monedas extranjeras', 'Monedas de Ecuador', 'Monedas USA',
  'Billetes', 'Billetes Ecuador', 'Billetes USA', 'Medallas',
];

export const RANGOS_PRECIO = [
  { id: 'p1', nombre: 'Hasta $10',       min: 0,      max: 10 },
  { id: 'p2', nombre: '$10,01 a $30',    min: 10.01,  max: 30 },
  { id: 'p3', nombre: '$30,01 a $50',    min: 30.01,  max: 50 },
  { id: 'p4', nombre: '$50,01 a $100',   min: 50.01,  max: 100 },
  { id: 'p5', nombre: 'Más de $100',     min: 100.01, max: Infinity },
];

export const NOVEDAD = [
  { id: 'hoy',    nombre: 'Hoy',            dias: 1 },
  { id: 'semana', nombre: 'Última semana',  dias: 7 },
  { id: 'mes',    nombre: 'Último mes',     dias: 31 },
];
