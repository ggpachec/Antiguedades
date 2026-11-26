/**
 * Lector de .xlsx sin dependencias (navegador moderno).
 *  - Descomprime el ZIP con DecompressionStream('deflate-raw').
 *  - Lee hojas, cadenas compartidas, fechas y valores numéricos.
 *  - Extrae las imágenes «colocadas en la celda» (Excel 365: FOTO 1..3),
 *    que el Excel muestra como #VALUE! en otros programas.
 *
 * En el producto final este módulo puede ejecutarse en el servidor
 * (p. ej. con la librería ExcelJS o openpyxl) con la misma salida:
 *   { hojas: [{ nombre, encabezados, filas: [{ fila, valores: {COL: valor}, imagenes: {COL: Blob} }] }] }
 */

async function leerZip(buffer) {
  const dv = new DataView(buffer);
  // Fin del directorio central: firma 0x06054b50 cerca del final
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (ZIP no reconocido).');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entradas = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio ZIP dañado.');
    const metodo = dv.getUint16(p + 10, true);
    const tamComp = dv.getUint32(p + 20, true);
    const lenNombre = dv.getUint16(p + 28, true), lenExtra = dv.getUint16(p + 30, true), lenCom = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    const nombre = dec.decode(new Uint8Array(buffer, p + 46, lenNombre));
    entradas.set(nombre, { metodo, tamComp, offLocal });
    p += 46 + lenNombre + lenExtra + lenCom;
  }
  async function bytes(nombre) {
    const e = entradas.get(nombre);
    if (!e) return null;
    const inicio = e.offLocal + 30 + dv.getUint16(e.offLocal + 26, true) + dv.getUint16(e.offLocal + 28, true);
    const datos = new Uint8Array(buffer, inicio, e.tamComp);
    if (e.metodo === 0) return datos.slice();
    if (e.metodo !== 8) throw new Error(`Compresión ZIP no soportada (${e.metodo}).`);
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  return { nombres: [...entradas.keys()], bytes, texto: async n => { const b = await bytes(n); return b ? dec.decode(b) : null; } };
}

const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
const hijos = (nodo, local) => [...nodo.getElementsByTagNameNS('*', local)];
const resolver = (base, destino) => {
  if (destino.startsWith('/')) return destino.slice(1);
  const partes = base.split('/').slice(0, -1);
  for (const s of destino.split('/')) { if (s === '..') partes.pop(); else if (s !== '.') partes.push(s); }
  return partes.join('/');
};
async function relaciones(zip, ruta) {
  const dir = ruta.split('/').slice(0, -1).join('/'), arch = ruta.split('/').pop();
  const t = await zip.texto(`${dir}/_rels/${arch}.rels`);
  const m = new Map();
  if (t) for (const r of hijos(xml(t), 'Relationship')) m.set(r.getAttribute('Id'), resolver(ruta, r.getAttribute('Target')));
  return m;
}

const colLetras = (ref) => ref.replace(/\d+/g, '');
const filaNum = (ref) => parseInt(ref.replace(/[A-Z]+/gi, ''), 10);
/** Serial de fecha Excel (sistema 1900) → Date ISO yyyy-mm-dd */
const fechaExcel = (serial) => new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10);

/**
 * Lee un File/Blob .xlsx.
 * @returns {Promise<{hojas: Array<{nombre:string, encabezados:Object, filas:Array}>}>}
 */
export async function leerXlsx(archivo) {
  const zip = await leerZip(await archivo.arrayBuffer());
  const wbRuta = 'xl/workbook.xml';
  const wb = xml(await zip.texto(wbRuta));
  const relWb = await relaciones(zip, wbRuta);

  const compartidas = [];
  const ss = await zip.texto('xl/sharedStrings.xml');
  if (ss) for (const si of hijos(xml(ss), 'si')) compartidas.push(hijos(si, 't').map(t => t.textContent).join(''));

  // Estilos: qué formatos numéricos son fechas
  const estilosFecha = new Set();
  const st = await zip.texto('xl/styles.xml');
  if (st) {
    const d = xml(st);
    const fmtsFecha = new Set([14, 15, 16, 17, 22]);
    for (const nf of hijos(d, 'numFmt')) if (/[dmy]/i.test(nf.getAttribute('formatCode')) && !/\[h/i.test(nf.getAttribute('formatCode'))) fmtsFecha.add(+nf.getAttribute('numFmtId'));
    const xfs = hijos(d, 'cellXfs')[0];
    if (xfs) hijos(xfs, 'xf').forEach((xf, i) => { if (fmtsFecha.has(+xf.getAttribute('numFmtId'))) estilosFecha.add(i); });
  }

  // Imágenes en celda: c@vm → metadata (valueMetadata→futureMetadata rvb) → rdrichvalue → richValueRel → media
  const imagenPorVm = await mapaImagenesEnCelda(zip);

  const hojas = [];
  for (const s of hijos(wb, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    const ruta = relWb.get(rid);
    const t = ruta && await zip.texto(ruta);
    if (!t) continue;
    const filas = new Map();
    for (const c of hijos(xml(t), 'c')) {
      const ref = c.getAttribute('r'), tipo = c.getAttribute('t'), est = +c.getAttribute('s');
      const v = hijos(c, 'v')[0]?.textContent;
      const f = filaNum(ref), col = colLetras(ref);
      if (!filas.has(f)) filas.set(f, { fila: f, valores: {}, imagenes: {} });
      const fila = filas.get(f);
      const vm = c.getAttribute('vm');
      if (vm && imagenPorVm.has(+vm)) { fila.imagenes[col] = imagenPorVm.get(+vm); continue; }
      let valor = null;
      if (tipo === 's') valor = compartidas[+v] ?? '';
      else if (tipo === 'inlineStr') valor = hijos(c, 't').map(x => x.textContent).join('');
      else if (tipo === 'b') valor = v === '1';
      else if (tipo === 'e') valor = null; // #VALUE!, #N/A...
      else if (tipo === 'str') valor = v ?? '';
      else if (v !== undefined) valor = estilosFecha.has(est) ? fechaExcel(+v) : +v;
      if (valor !== null && valor !== '') fila.valores[col] = typeof valor === 'string' ? valor.trim() : valor;
    }
    const ordenadas = [...filas.values()].sort((a, b) => a.fila - b.fila)
      .filter(r => Object.keys(r.valores).length || Object.keys(r.imagenes).length);
    const [cab, ...datos] = ordenadas;
    hojas.push({ nombre: s.getAttribute('name'), encabezados: cab ? cab.valores : {}, filas: datos });
  }
  return { hojas };
}

async function mapaImagenesEnCelda(zip) {
  const res = new Map();
  const meta = await zip.texto('xl/metadata.xml');
  const rv = await zip.texto('xl/richData/rdrichvalue.xml');
  const rel = await zip.texto('xl/richData/richValueRel.xml');
  if (!meta || !rv || !rel) return res;
  const relMap = await relaciones(zip, 'xl/richData/richValueRel.xml');
  const rIds = hijos(xml(rel), 'rel').map(r => r.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || r.getAttribute('r:id'));
  const valores = hijos(xml(rv), 'rv').map(r => +hijos(r, 'v')[0]?.textContent);
  const m = xml(meta);
  const rvb = hijos(m, 'rvb').map(x => +x.getAttribute('i'));
  const vmBloques = hijos(hijos(m, 'valueMetadata')[0] ?? m, 'bk');
  for (let i = 0; i < vmBloques.length; i++) {
    const rc = hijos(vmBloques[i], 'rc')[0];
    const indiceFuturo = rc ? +rc.getAttribute('v') : i;
    const indiceRv = rvb[indiceFuturo];
    const indiceRel = valores[indiceRv];
    const ruta = relMap.get(rIds[indiceRel]);
    if (!ruta) continue;
    const b = await zip.bytes(ruta);
    if (b) res.set(i + 1, new Blob([b], { type: ruta.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
  }
  return res;
}
