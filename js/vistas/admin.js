/**
 * Panel privado del encargado: inventario, ficha por tipo (con IA simulada y fotos),
 * carga desde Excel, publicaciones, etiquetas y solicitudes de clientes.
 */
import * as api from '../servicios/api.js';
import * as R from '../dominio/reglas.js';
import { TIPOS, ES_LOTE, LIMITES, UBICACIONES } from '../config/catalogos.js';
import { CAMPOS_POR_TIPO } from '../config/campos.js';
import { esc, $, $$, precio, fecha, toast, dialogo, imagenPrincipal, estadoChip, comprimirImagen } from '../ui/componentes.js';
import { leerXlsx } from '../importacion/lector-xlsx.js';
import { mapearHojas } from '../importacion/mapeo-inventario.js';

export const MENU_ADMIN = [['admin', 'Inventario'], ['admin-nueva', 'Nueva ficha'], ['admin-importar', 'Cargar desde Excel'], ['admin-publicaciones', 'Publicaciones'], ['admin-etiquetas', 'Etiquetas'], ['admin-solicitudes', 'Solicitudes']];
let prellenado = null; // ficha que viene de la importación para completarla en el formulario

const opcionesTipo = (sel) => Object.values(TIPOS).map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('');
const titulo = (p) => R.tituloPieza(p) || '(sin nombre)';

/* ============================== INVENTARIO ============================== */
let filtroInv = { q: '', tipo: '', estado: '' };
export async function vistaInventario(c) {
  const todas = await api.listarInventario();
  const sol = (await api.listarSolicitudes()).filter(s => s.estado === 'PENDIENTE').length;
  const n = (e) => todas.filter(p => p.estado === e).length;
  c.innerHTML = `<p class="eyebrow">Gestión de la colección</p><h1>Tu inventario, en orden.</h1>
    <p class="tenue">Controla qué se conserva en privado y qué se comparte. Las fichas nuevas nacen como borrador privado.</p>
    <div class="fila-botones"><a class="btn btn-pri" href="#admin-nueva">Nueva ficha</a><a class="btn btn-sec" href="#admin-importar">Cargar desde Excel</a></div>
    <div class="indicadores">
      <div class="indicador"><strong>${todas.length}</strong><span>Fichas registradas</span></div>
      <div class="indicador"><strong>${n('PUBLICADA')}</strong><span>Publicadas</span></div>
      <div class="indicador"><strong>${n('APROBADA_PRIVADA')}</strong><span>Aprobadas sin publicar</span></div>
      <div class="indicador"><strong>${n('BORRADOR')}</strong><span>Borradores por revisar</span></div>
      <div class="indicador"><strong>${sol}</strong><span>Solicitudes pendientes</span></div>
    </div>
    <div class="barra-herr"><input id="inv-q" type="search" placeholder="Buscar por código, país, denominación, KM o ubicación" value="${esc(filtroInv.q)}">
      <select id="inv-tipo"><option value="">Todos los tipos</option>${opcionesTipo(filtroInv.tipo)}</select>
      <select id="inv-estado"><option value="">Todos los estados</option>${[['BORRADOR', 'Borrador'], ['APROBADA_PRIVADA', 'Aprobada · privada'], ['PUBLICADA', 'Publicada']].map(([v, t]) => `<option value="${v}" ${filtroInv.estado === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="tabla-env"><table><thead><tr><th>Pieza / código</th><th>Tipo</th><th>Ubic.</th><th class="num">Cant.</th><th class="num">Precio</th><th>Estado</th><th>Actualización</th><th>Acciones</th></tr></thead><tbody id="inv-filas"></tbody></table></div>`;
  async function pintar() {
    const l = await api.listarInventario(filtroInv);
    $('#inv-filas', c).innerHTML = l.length ? l.map(p => `<tr>
      <td><div class="celda-pieza"><img class="mini" src="${esc(imagenPrincipal(p))}" alt=""><div><strong>${esc(titulo(p))}</strong><small>${esc(p.codigo)}${p.anio ? ' · ' + esc(p.anio) : ''}</small></div></div></td>
      <td>${esc(TIPOS[p.tipo]?.nombre)}</td><td>${esc(p.ubicacion || '—')}</td><td class="num">${esc(p.cantidad)}</td><td class="num">${precio(p.precio)}</td>
      <td>${estadoChip(p.estado)}</td><td>${fecha(p.actualizadaEn)}</td>
      <td><div class="fila-botones"><a class="btn btn-sec btn-sm" href="#admin-editar-${esc(p.id)}">Editar</a>
        ${p.estado === 'BORRADOR' ? `<button class="btn btn-sec btn-sm" data-aprobar="${esc(p.id)}">Aprobar</button>` : ''}
        ${p.estado === 'APROBADA_PRIVADA' ? `<button class="btn btn-pri btn-sm" data-publicar="${esc(p.id)}">Publicar</button>` : ''}
        ${p.estado === 'PUBLICADA' ? `<button class="btn btn-sec btn-sm" data-pausar="${esc(p.id)}">Retirar</button>` : ''}</div></td></tr>`).join('')
      : `<tr><td colspan="8" class="tenue" style="text-align:center;padding:30px">No hay fichas con estos criterios.</td></tr>`;
  }
  $('#inv-q', c).oninput = (e) => { filtroInv.q = e.target.value; pintar(); };
  $('#inv-tipo', c).onchange = (e) => { filtroInv.tipo = e.target.value; pintar(); };
  $('#inv-estado', c).onchange = (e) => { filtroInv.estado = e.target.value; pintar(); };
  c.onclick = (e) => accionesEstado(e, () => vistaInventario(c));
  await pintar();
}

async function accionesEstado(e, recargar) {
  const b = e.target.closest('[data-aprobar],[data-publicar],[data-pausar]'); if (!b) return;
  try {
    if (b.dataset.aprobar) { await api.aprobarPieza(b.dataset.aprobar); toast('Ficha aprobada (sigue privada)'); }
    if (b.dataset.pausar) { await api.pausarPublicacion(b.dataset.pausar); toast('Publicación retirada: ya no aparece en catálogo ni sala'); }
    if (b.dataset.publicar) return dialogoPublicar(b.dataset.publicar, recargar);
    recargar();
  } catch (err) { toast(err.message + (err.detalle ? ' ' + Object.values(err.detalle).join(' · ') : ''), 'error'); }
}
async function dialogoPublicar(id, recargar) {
  const p = await api.obtenerPieza(id);
  const d = dialogo('Publicar pieza', `<form class="lista" id="f-pub"><p><strong>${esc(titulo(p))}</strong> · ${esc(p.codigo)} · ${precio(p.precio)}</p>
    <div class="form-rejilla" style="grid-template-columns:1fr 2fr"><label class="campo">Descuento %<input name="descuento" type="number" min="0" max="90" value="${esc(p.publicacion?.descuento ?? 0)}"></label>
    <label class="campo">Nombre de la promoción<input name="promocion" value="${esc(p.publicacion?.promocion ?? '')}" placeholder="Opcional"></label></div>
    <p class="tenue" style="font-size:13px;margin:0">Al publicar, la pieza aparece en el catálogo y en su pared de la sala virtual. Se registra la fecha y se empieza a contar visitas.</p>
    <div class="fila-botones"><button class="btn btn-pri">Publicar</button><button type="button" class="btn btn-sec" data-cerrar>Cancelar</button></div></form>`);
  $('#f-pub', d).onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    try { await api.publicar(id, { descuento: +fd.get('descuento') || 0, promocion: fd.get('promocion') }); d.close(); toast('Pieza publicada'); recargar(); }
    catch (err) { toast(err.message, 'error'); }
  };
}

/* ============================== FORMULARIO ============================== */
function campoHTML(def, valor, errores, avisos) {
  const id = 'c-' + def.k, v = valor ?? '';
  const err = errores[def.k], av = avisos[def.k];
  let control;
  if (def.t === 'select') control = `<select id="${id}" name="${def.k}">${def.opciones.map(([o, t]) => `<option value="${esc(o)}" ${String(v) === String(o) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  else if (def.t === 'textarea') control = `<textarea id="${id}" name="${def.k}" ${def.max ? `maxlength="${def.max}"` : ''}>${esc(v)}</textarea>`;
  else if (def.t === 'checkbox') control = `<span style="display:flex;gap:10px;align-items:center;font-weight:500"><input type="checkbox" id="${id}" name="${def.k}" ${v ? 'checked' : ''} style="width:18px;height:18px;min-height:0">Sí</span>`;
  else {
    const tipo = def.t === 'number' ? 'number' : def.t === 'date' ? 'date' : 'text';
    const lista = def.t === 'lista' ? `list="dl-${def.k}"` : def.lista ? `list="${def.lista}"` : '';
    control = `<input id="${id}" name="${def.k}" type="${tipo}" ${def.paso ? `step="${def.paso}"` : ''} ${def.max ? `maxlength="${def.max}"` : ''} ${lista} value="${esc(v)}">`
      + (def.t === 'lista' ? `<datalist id="dl-${def.k}">${def.opciones.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<label class="campo ${def.ancho ?? ''} ${err ? 'con-error' : ''}" for="${id}" data-campo="${def.k}">${esc(def.etq)}${def.req ? ' *' : ''}${control}
    <span class="slot-ia"></span>
    ${err ? `<span class="error">${esc(err)}</span>` : av ? `<span class="advertencia">${esc(av)}</span>` : def.ayuda ? `<span class="ayuda">${esc(def.ayuda)}</span>` : ''}
    ${def.reservado ? '<span class="ayuda">Campo guardado. El cálculo por precio internacional del metal queda fuera del alcance acordado: pendiente de confirmar con el cliente.</span>' : ''}</label>`;
}

export async function vistaFormulario(c, ctx, id) {
  const existentes = (await api.listarInventario()).map(p => p.codigo);
  let p, nueva = !id;
  if (id) p = await api.obtenerPieza(id);
  else if (prellenado) { p = { ...prellenado.ficha, fotos: prellenado.fotos }; prellenado = null; }
  else p = { tipo: 'moneda', graduador: 'Sin graduar', cantidad: 1, fechaIngreso: new Date().toISOString().slice(0, 10), fotos: [], estadoLote: 'Nuevo' };
  let fotos = [...(p.fotos ?? [])];
  let periodoManual = !!p.periodo && p.periodo !== R.periodoDesdeAnio(p.anio);
  let sugerencias = p.sugerenciasIA ?? [];
  let errores = {}, avisos = R.validarFicha(p).avisos;

  const leer = () => {
    const fd = new FormData($('#f-ficha', c));
    const d = { ...p, tipo: fd.get('tipo') ?? p.tipo };
    for (const def of CAMPOS_POR_TIPO[d.tipo]) d[def.k] = def.t === 'checkbox' ? fd.has(def.k) : (fd.get(def.k) ?? '');
    if (d.pais) d.pais = d.pais.toUpperCase();
    if (d.ubicacion) d.ubicacion = d.ubicacion.toUpperCase();
    return { ...d, fotos, sugerenciasIA: sugerencias };
  };

  function pintar() {
    const tipo = p.tipo;
    const codigo = nueva ? R.generarCodigo(tipo, p, existentes) : p.codigo;
    c.innerHTML = `<p class="eyebrow">${nueva ? 'Nueva ficha' : 'Editar ficha'}</p>
    <div class="seccion-cab" style="margin-bottom:12px"><h1 style="margin:0">${nueva ? 'Registrar pieza' : esc(titulo(p))}</h1>${nueva ? '' : estadoChip(p.estado)}</div>
    ${p.origenImportacion ? `<p class="nota nota-info">Prellenado desde Excel (${esc(p.origenImportacion)}). Revisa y completa antes de guardar.</p>` : ''}
    <form id="f-ficha" novalidate><div class="ficha-form-layout">
      <div class="panel">
        <div class="form-rejilla" style="margin-bottom:16px">
          <label class="campo">Tipo de pieza<select name="tipo" id="c-tipo" ${nueva ? '' : 'disabled'}>${opcionesTipo(tipo)}</select></label>
          <label class="campo doble">Código de inventario<input value="${esc(codigo)}" disabled><span class="ayuda">${nueva ? 'Previsto · lo asigna el sistema al guardar (' + (ES_LOTE(tipo) ? 'L + MO/BI + secuencia' : TIPOS[tipo].prefijo + ' + país + año + secuencia') + ')' : 'Generado por el sistema'}</span></label>
        </div>
        <datalist id="lista-paises">${['ECUADOR', 'USA', 'MÉXICO', 'COLOMBIA', 'PERÚ', 'CHILE', 'ESPAÑA', 'ALEMANIA', 'FRANCIA', 'VARIOS'].map(x => `<option value="${x}">`).join('')}</datalist>
        <div class="form-rejilla">${CAMPOS_POR_TIPO[tipo].map(def => campoHTML(def, p[def.k], errores, avisos)).join('')}</div>
      </div>
      <div class="lista">
        <div class="panel"><h3>Fotografías</h3><p class="tenue" style="font-size:13px">Hasta 3 (JPG o PNG, máx. 8 MB). La primera es la de presentación.</p>
          <div class="fotos-ficha">${['anverso', 'reverso', 'detalle'].map((cara, i) => { const f = fotos.find(x => x.cara === cara); return `<div class="foto-slot" data-cara="${cara}" tabindex="0" role="button" aria-label="Foto ${cara}">${f ? `<img src="${esc(f.src)}" alt=""><button type="button" class="btn-icono quitar" data-quitar="${cara}" aria-label="Quitar foto">✕</button>` : `Foto ${i + 1}<br>${cara}`}</div>`; }).join('')}</div>
          <input type="file" id="archivo-foto" accept="image/jpeg,image/png,image/webp" hidden></div>
        <div class="panel" style="background:var(--oro-claro)"><h3>La IA te ayuda a catalogar</h3><p style="font-size:13.5px">Propone país, denominación, año, código y material a partir de las fotos. Tú aceptas, corriges o descartas cada valor. Calidad y precio siempre los defines tú.</p>
          <button type="button" class="btn btn-pri" id="ia" ${fotos.length ? '' : 'disabled'}>${fotos.length ? 'Analizar fotos con IA' : 'Sube una foto para analizar'}</button><p class="tenue" style="font-size:12.5px;margin:8px 0 0">Análisis simulado en este prototipo.</p></div>
        ${nueva ? '' : `<div class="panel"><h3>Estado y publicación</h3>
          <p>${estadoChip(p.estado)} ${p.publicacion?.activo ? `· publicada el ${fecha(p.publicacion.fechaPublicacion)} · ${p.publicacion.visitas} visitas` : ''}</p>
          ${p.publicacion?.fechaPausa ? `<p class="tenue" style="font-size:13px">Pausada el ${fecha(p.publicacion.fechaPausa)} por ${esc(p.publicacion.usuarioPausa)}</p>` : ''}
          <div class="fila-botones">${p.estado === 'BORRADOR' ? `<button type="button" class="btn btn-sec btn-sm" data-aprobar="${esc(p.id)}">Aprobar</button>` : ''}
          ${p.estado === 'APROBADA_PRIVADA' ? `<button type="button" class="btn btn-pri btn-sm" data-publicar="${esc(p.id)}">Publicar</button>` : ''}
          ${p.estado === 'PUBLICADA' ? `<button type="button" class="btn btn-sec btn-sm" data-pausar="${esc(p.id)}">Retirar publicación</button><button type="button" class="btn btn-sec btn-sm" data-publicar="${esc(p.id)}">Editar promoción</button>` : ''}
          <a class="btn btn-sec btn-sm" href="#admin-etiquetas-${esc(p.id)}">Etiqueta</a></div></div>
        <div class="panel historial"><h3>Historial de precios</h3>${(p.historialPrecios ?? []).length ? `<table><thead><tr><th>Fecha</th><th>Usuario</th><th class="num">Antes</th><th class="num">Nuevo</th></tr></thead><tbody>${p.historialPrecios.slice().reverse().map(h => `<tr><td>${fecha(h.fecha)}</td><td>${esc(h.usuario)}</td><td class="num">${h.anterior == null ? '—' : precio(h.anterior)}</td><td class="num">${precio(h.nuevo)}</td></tr>`).join('')}</tbody></table>` : '<p class="tenue">Sin cambios registrados.</p>'}</div>`}
      </div></div>
      <div class="fila-botones" style="margin-top:18px"><a class="btn btn-sec" href="#admin">Volver al inventario</a><button class="btn btn-pri" name="accion" value="guardar">${nueva ? 'Guardar como borrador' : 'Guardar cambios'}</button>
        ${nueva ? '<button class="btn btn-oro" name="accion" value="aprobar">Guardar y aprobar</button>' : ''}
        ${nueva ? '' : '<button type="button" class="btn btn-peligro" id="eliminar" style="margin-left:auto">Eliminar ficha</button>'}</div>
    </form>`;
    pintarSugerencias();
  }

  function pintarSugerencias() {
    for (const s of sugerencias.filter(s => s.decision === 'PENDIENTE')) {
      const slot = c.querySelector(`[data-campo="${s.atributo}"] .slot-ia`); if (!slot) continue;
      slot.innerHTML = `<span class="sugerencia">IA sugiere: «${esc(s.valor)}» <button type="button" data-ia-aceptar="${s.atributo}">Aceptar</button><button type="button" data-ia-descartar="${s.atributo}">Descartar</button></span>`;
    }
  }

  pintar();
  const archivo = () => $('#archivo-foto', c);
  let caraDestino = 'anverso';

  c.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'c-tipo') { p = { ...leer(), tipo: t.value }; errores = {}; pintar(); return; }
    if (t.id === 'archivo-foto') {
      const f = t.files[0]; if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Formato no permitido: usa JPG, PNG o WebP', 'error');
      if (f.size > LIMITES.bytesFoto) return toast('La foto supera 8 MB', 'error');
      const src = await comprimirImagen(f);
      fotos = [...fotos.filter(x => x.cara !== caraDestino), { cara: caraDestino, src }];
      p = leer(); pintar(); return;
    }
    if (t.name === 'anio' && !periodoManual) { const per = R.periodoDesdeAnio(t.value); if (per) $('#c-periodo', c).value = per; }
    if (t.name === 'periodo') periodoManual = true;
    if ((t.name === 'peso' || t.name === 'fineza') && $('#c-onzaTroy', c)) { const oz = R.onzasTroy($('#c-peso', c).value, $('#c-fineza', c).value); if (oz !== null) $('#c-onzaTroy', c).value = oz.toFixed(4); }
    if (['pais', 'anio'].includes(t.name) && nueva) { p = leer(); const inp = c.querySelector('.form-rejilla input[disabled]'); if (inp) inp.value = R.generarCodigo(p.tipo, p, existentes); }
  });
  c.addEventListener('click', async (e) => {
    const slot = e.target.closest('.foto-slot');
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) { e.stopPropagation(); fotos = fotos.filter(x => x.cara !== quitar.dataset.quitar); p = leer(); pintar(); return; }
    if (slot) { caraDestino = slot.dataset.cara; archivo().value = ''; archivo().click(); return; }
    if (e.target.id === 'ia') {
      e.target.disabled = true; e.target.textContent = 'Analizando…';
      const r = await api.sugerirAtributos(p.tipo, fotos);
      const campos = CAMPOS_POR_TIPO[$('#c-tipo', c).value].map(d => d.k);
      sugerencias = Object.entries(r.atributos).filter(([k]) => campos.includes(k)).map(([atributo, valor]) => ({ atributo, valor: String(valor), decision: 'PENDIENTE' }))
        .concat(r.noDisponibles.filter(k => campos.includes(k)).map(atributo => ({ atributo, valor: null, decision: 'SIN_SUGERENCIA' })));
      p = leer(); pintar(); toast('Sugerencias listas: revisa cada valor');
    }
    const ac = e.target.closest('[data-ia-aceptar]'), de = e.target.closest('[data-ia-descartar]');
    if (ac || de) {
      const k = (ac ?? de).dataset[ac ? 'iaAceptar' : 'iaDescartar'];
      const s = sugerencias.find(x => x.atributo === k);
      if (ac) { const inp = c.querySelector(`[name="${k}"]`); inp.value = s.valor; inp.dispatchEvent(new Event('change', { bubbles: true })); s.decision = 'ACEPTADA'; }
      else s.decision = 'DESCARTADA';
      s.valorFinal = ac ? s.valor : null;
      (ac ?? de).closest('.slot-ia').innerHTML = '';
    }
    if (e.target.id === 'eliminar') {
      const d = dialogo('Eliminar ficha', `<p>¿Eliminar <strong>${esc(p.codigo)}</strong>? Esta acción no se puede deshacer en el prototipo (en producción será un borrado lógico).</p><div class="fila-botones"><button class="btn btn-peligro" id="si">Eliminar</button><button class="btn btn-sec" data-cerrar>Cancelar</button></div>`);
      $('#si', d).onclick = async () => { await api.eliminarPieza(p.id); d.close(); toast('Ficha eliminada'); location.hash = 'admin'; };
    }
    if (e.target.closest('[data-aprobar],[data-publicar],[data-pausar]')) accionesEstado(e, () => ctx.recargar());
  });
  c.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Si quedó un valor editado a mano sobre una sugerencia aceptada, se registra como CORREGIDA
    const datos = leer();
    for (const s of sugerencias) if (s.decision === 'ACEPTADA' && String(datos[s.atributo]) !== s.valor) { s.decision = 'CORREGIDA'; s.valorFinal = String(datos[s.atributo]); }
    const v = R.validarFicha(datos);
    errores = v.errores; avisos = v.avisos;
    if (!v.valido) { p = datos; pintar(); toast('Revisa los campos marcados', 'error'); c.querySelector('.con-error input, .con-error select, .con-error textarea')?.focus(); return; }
    try {
      const guardada = nueva ? await api.crearPieza(datos) : await api.actualizarPieza(p.id, { ...datos, version: p.version });
      if (e.submitter?.value === 'aprobar') await api.aprobarPieza(guardada.id);
      toast(nueva ? `Ficha ${guardada.codigo} guardada` : 'Cambios guardados');
      if (nueva) location.hash = 'admin-editar-' + guardada.id; else ctx.recargar();
    } catch (err) { errores = err.detalle ?? {}; p = datos; pintar(); toast(err.message, 'error'); }
  });
}

/* ============================== IMPORTAR EXCEL ============================== */
let importacion = null;
export async function vistaImportar(c) {
  c.innerHTML = `<p class="eyebrow">Carga masiva</p><h1>Cargar desde Excel</h1>
    <p class="tenue">Sube el inventario en el formato del negocio. Cada fila se convierte en una ficha <strong>borrador</strong> con sus datos y fotos; luego la revisas, apruebas y publicas.</p>
    <div class="zona-archivo" id="zona" tabindex="0" role="button"><h3 style="margin-bottom:6px">Arrastra aquí el archivo .xlsx o haz clic para elegirlo</h3>
      <p class="tenue" style="margin:0">Hojas reconocidas: MONEDAS INDIVIDUALES, MONEDAS POR LOTES, BILLETES, BILLETES POR LOTES. Se leen las fotos pegadas dentro de las celdas FOTO 1–3.</p></div>
    <input type="file" id="xlsx" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    <div class="fila-botones" style="margin:14px 0 24px"><button class="btn btn-sec" id="ejemplo">Probar con el Excel de ejemplo del cliente</button><button class="btn btn-txt" id="ver-columnas">Ver columnas esperadas</button></div>
    <div id="vista-previa"></div>`;
  const zona = $('#zona', c), input = $('#xlsx', c);
  zona.onclick = () => input.click();
  zona.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('encima'); };
  zona.ondragleave = () => zona.classList.remove('encima');
  zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('encima'); procesar(e.dataTransfer.files[0]); };
  input.onchange = () => procesar(input.files[0]);
  // El Excel de ejemplo viaja como base64 (.txt) porque el visor de artefactos no sirve .xlsx
  $('#ejemplo', c).onclick = async () => {
    const b64 = (await (await fetch('data/ejemplo-inventario-monedas.xlsx.b64.txt')).text()).trim();
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    procesar(new File([bytes], 'excel_de_inventarios_monedas.xlsx'));
  };
  $('#ver-columnas', c).onclick = () => dialogo('Columnas esperadas', `<p><strong>Monedas individuales:</strong> PERIODO, PAÍS, DENOMINACIÓN, AÑO, CODIGO CATÁLOGO, TIPO DE EMISIÓN, DESCRIPCIÓN, MATERIAL, PESO EN GRAMOS, FINEZA, CONTENIDO DE ONZA TROY, CALIDAD, GRADUADOR, PRECIO, UBICACIÓN, CANTIDAD, FECHA INGRESO, FOTO 1–3.</p><p><strong>Monedas por lotes:</strong> PERIODO, PAÍS O PAÍSES, NOMBRE, DESCRIPCIÓN, CALIDAD, PRECIO, UBICACIÓN, CANTIDAD, FECHA INGRESO, FOTO 1–3.</p><p><strong>Billetes:</strong> NOMBRE, PAÍS, DENOMINACIÓN, AÑO, PICK, DESCRIPCIÓN, CALIDAD, GRADUADOR, PRECIO, CANTIDAD, UBICACIÓN, FECHA INGRESO, FOTO 1–3.</p><p class="tenue">El orden de las columnas no importa; se reconocen sin tildes ni mayúsculas.</p>`, { ancho: 640 });
  if (importacion) pintarVistaPrevia();

  async function procesar(f) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return toast('Sube un archivo .xlsx', 'error');
    $('#vista-previa', c).innerHTML = '<p class="tenue">Leyendo el archivo…</p>';
    try {
      const libro = await leerXlsx(f);
      const hojas = mapearHojas(libro);
      const inventario = await api.listarInventario();
      const codigos = inventario.map(p => p.codigo);
      for (const h of hojas) for (const fila of h.filas) {
        fila.fotosSrc = await Promise.all(fila.fotos.slice(0, 3).map(b => comprimirImagen(b)));
        fila.codigo = h.tipo ? R.generarCodigo(h.tipo, fila.ficha, codigos) : '—';
        codigos.push(fila.codigo);
        const dup = inventario.find(p => p.tipo === h.tipo && R.normalizar(p.pais) === R.normalizar(fila.ficha.pais) && R.normalizar(p.denominacion || p.nombre) === R.normalizar(fila.ficha.denominacion || fila.ficha.nombre) && String(p.anio) === String(fila.ficha.anio));
        if (dup) fila.avisos.duplicado = `Posible duplicado de ${dup.codigo}`;
        fila.marcada = !Object.keys(fila.errores).length && !!h.tipo;
      }
      importacion = { archivo: f.name, hojas };
      pintarVistaPrevia();
    } catch (err) { $('#vista-previa', c).innerHTML = `<p class="nota">No se pudo leer el archivo: ${esc(err.message)}</p>`; }
  }

  function pintarVistaPrevia() {
    const { hojas, archivo } = importacion;
    const total = hojas.reduce((n, h) => n + h.filas.length, 0), marcadas = hojas.reduce((n, h) => n + h.filas.filter(f => f.marcada).length, 0);
    const conError = hojas.reduce((n, h) => n + h.filas.filter(f => Object.keys(f.errores).length).length, 0);
    const conAviso = hojas.reduce((n, h) => n + h.filas.filter(f => Object.keys(f.avisos).length).length, 0);
    $('#vista-previa', c).innerHTML = `<div class="panel" style="margin-bottom:16px"><div class="seccion-cab" style="margin:0"><div><h3 style="margin:0">${esc(archivo)}</h3><p class="tenue" style="margin:0">${total} filas · ${conError} con errores · ${conAviso} con observaciones · ${marcadas} seleccionadas</p></div>
      <div class="fila-botones"><button class="btn btn-pri" id="importar" ${marcadas ? '' : 'disabled'}>Importar ${marcadas} como borradores</button><button class="btn btn-sec" id="descartar">Descartar</button></div></div></div>
      ${hojas.map((h, hi) => `<h3>${esc(h.hoja)} <span class="chip">${h.tipo ? esc(TIPOS[h.tipo].nombre) : 'Tipo no reconocido'}</span></h3>
        ${h.columnasSinMapear.length ? `<p class="nota" style="margin-bottom:10px">Columnas ignoradas: ${h.columnasSinMapear.map(esc).join(', ')}</p>` : ''}
        <div class="tabla-env" style="margin-bottom:24px"><table><thead><tr><th></th><th>Fotos</th><th>Código previsto</th><th>Pieza</th><th>Periodo</th><th>Calidad</th><th class="num">Precio</th><th class="num">Cant.</th><th>Ubic.</th><th>Revisión</th><th></th></tr></thead><tbody>
        ${h.filas.map((f, fi) => { const e = Object.values(f.errores), a = Object.values(f.avisos); return `<tr class="${e.length ? 'fila-error' : a.length ? 'fila-aviso' : ''}">
          <td><input type="checkbox" data-marca="${hi}-${fi}" ${f.marcada ? 'checked' : ''} ${e.length || !h.tipo ? 'disabled' : ''} aria-label="Seleccionar fila" style="width:18px;height:18px;min-height:0"></td>
          <td><div style="display:flex;gap:4px">${f.fotosSrc.length ? f.fotosSrc.map(s => `<img class="mini" src="${esc(s)}" alt="">`).join('') : '<span class="tenue" style="font-size:12px">Sin fotos</span>'}</div></td>
          <td><strong>${esc(f.codigo)}</strong><br><small class="tenue">${esc(f.origen)}</small></td>
          <td>${esc(R.tituloPieza({ ...f.ficha, tipo: h.tipo }))}<br><small class="tenue">${esc(f.ficha.anio)} ${esc(f.ficha.material)}</small></td>
          <td>${esc(R.nombrePeriodo(f.ficha.periodo))}</td><td>${esc(f.ficha.calidad)}</td><td class="num">${f.ficha.precio === '' ? '—' : precio(f.ficha.precio)}</td><td class="num">${esc(f.ficha.cantidad)}</td><td>${esc(f.ficha.ubicacion || '—')}</td>
          <td>${e.length || a.length ? `<ul class="lista-msg">${e.map(m => `<li class="e">${esc(m)}</li>`).join('')}${a.map(m => `<li class="a">${esc(m)}</li>`).join('')}</ul>` : '<span class="chip chip-publicada">Lista</span>'}</td>
          <td><button class="btn btn-sec btn-sm" data-completar="${hi}-${fi}">Completar</button></td></tr>`; }).join('')}
        </tbody></table></div>`).join('')}`;
  }

  c.onclick = async (e) => {
    const m = e.target.closest('[data-marca]');
    if (m) { const [hi, fi] = m.dataset.marca.split('-').map(Number); importacion.hojas[hi].filas[fi].marcada = m.checked; pintarVistaPrevia(); return; }
    const comp = e.target.closest('[data-completar]');
    if (comp) {
      const [hi, fi] = comp.dataset.completar.split('-').map(Number); const h = importacion.hojas[hi], f = h.filas[fi];
      prellenado = { ficha: { ...f.ficha, tipo: h.tipo, origenImportacion: f.origen }, fotos: f.fotosSrc.map((src, i) => ({ cara: ['anverso', 'reverso', 'detalle'][i], src })) };
      location.hash = 'admin-nueva'; return;
    }
    if (e.target.id === 'descartar') { importacion = null; $('#vista-previa', c).innerHTML = ''; }
    if (e.target.id === 'importar') {
      const fichas = importacion.hojas.flatMap(h => h.filas.filter(f => f.marcada).map(f => ({ ...f.ficha, tipo: h.tipo, fotos: f.fotosSrc.map((src, i) => ({ cara: ['anverso', 'reverso', 'detalle'][i], src })) })));
      e.target.disabled = true; e.target.textContent = 'Importando…';
      const r = await api.importarFichas(fichas);
      importacion = null;
      toast(`${r.creadas.length} fichas creadas como borrador${r.fallidas.length ? ` · ${r.fallidas.length} con error` : ''}`);
      filtroInv = { q: '', tipo: '', estado: 'BORRADOR' };
      location.hash = 'admin';
    }
  };
}

/* ============================== PUBLICACIONES ============================== */
let filtroPub = 'todas';
export async function vistaPublicaciones(c) {
  const FILTROS = [['todas', 'Todas'], ['noPublicados', 'No publicados'], ['recientes', 'Publicaciones recientes'], ['mas3meses', 'Más de 3 meses'], ['inactivas', 'Inactivas'], ['precio', 'Por precio'], ['lotes', 'Sets / lotes'], ['visitadas', 'Más visitadas']];
  const l = await api.listarPublicaciones(filtroPub);
  c.innerHTML = `<p class="eyebrow">Publicación</p><h1>Qué se muestra al público</h1>
    <p class="tenue">Selecciona piezas o sets para publicar, aplica descuentos o promociones y pausa lo que no quieras mostrar. Cada publicación cuenta sus visitas.</p>
    <div class="tabs-cat" role="group">${FILTROS.map(([k, t]) => `<button data-fpub="${k}" aria-pressed="${filtroPub === k}">${t}</button>`).join('')}</div>
    <div class="tabla-env"><table><thead><tr><th>Pieza</th><th class="num">Precio</th><th class="num">Desc.</th><th>Promoción</th><th>Activa</th><th>Publicada</th><th>Pausada</th><th class="num">Visitas</th><th></th></tr></thead><tbody>
    ${l.length ? l.map(p => { const pub = p.publicacion ?? {}; return `<tr><td><div class="celda-pieza"><img class="mini" src="${esc(imagenPrincipal(p))}" alt=""><div><strong>${esc(titulo(p))}</strong><small>${esc(p.codigo)}</small></div></div></td>
      <td class="num">${precio(p.precio)}</td><td class="num">${pub.descuento ? pub.descuento + ' %' : '—'}</td><td>${esc(pub.promocion || '—')}</td>
      <td>${pub.activo ? '<span class="chip chip-publicada">Sí</span>' : '<span class="chip chip-borrador">No</span>'}</td><td>${fecha(pub.fechaPublicacion)}</td>
      <td>${pub.fechaPausa ? `${fecha(pub.fechaPausa)}<br><small class="tenue">${esc(pub.usuarioPausa)}</small>` : '—'}</td><td class="num">${pub.visitas ?? 0}</td>
      <td><div class="fila-botones">${pub.activo ? `<button class="btn btn-sec btn-sm" data-publicar="${esc(p.id)}">Promoción</button><button class="btn btn-sec btn-sm" data-pausar="${esc(p.id)}">Pausar</button>` : p.estado === 'BORRADOR' ? `<a class="btn btn-sec btn-sm" href="#admin-editar-${esc(p.id)}">Revisar</a>` : `<button class="btn btn-pri btn-sm" data-publicar="${esc(p.id)}">Publicar</button>`}</div></td></tr>`; }).join('')
    : '<tr><td colspan="9" class="tenue" style="text-align:center;padding:30px">Nada en este filtro.</td></tr>'}</tbody></table></div>`;
  c.onclick = (e) => {
    const f = e.target.closest('[data-fpub]'); if (f) { filtroPub = f.dataset.fpub; vistaPublicaciones(c); return; }
    accionesEstado(e, () => vistaPublicaciones(c));
  };
}

/* ============================== ETIQUETAS ============================== */
let seleccionEtq = new Set();
export async function vistaEtiquetas(c, ctx, idInicial) {
  const l = (await api.listarInventario()).filter(p => p.estado !== 'BORRADOR');
  if (idInicial) seleccionEtq = new Set([idInicial]);
  const sel = l.filter(p => seleccionEtq.has(p.id));
  const hojas = Math.ceil(sel.length / 30);
  c.innerHTML = `<p class="eyebrow">Etiquetas</p><h1>Etiquetas desde fichas aprobadas</h1>
    <p class="tenue">Componentes del cliente: país, denominación, año, Pick/KM, calidad, descripción superior e inferior, año de etiqueta y precio (más material en monedas). Se imprimen en hojas de 30.</p>
    <div class="ficha-form-layout" style="grid-template-columns:340px minmax(0,1fr)">
      <div class="panel"><div class="seccion-cab" style="margin-bottom:8px"><h3 style="margin:0">Fichas (${l.length})</h3><button class="btn-txt" id="todas" style="border:0;cursor:pointer;font:600 13px var(--sans)">${sel.length === l.length ? 'Ninguna' : 'Todas'}</button></div>
        <div class="lista" style="max-height:560px;overflow:auto">${l.map(p => `<label class="opcion"><input type="checkbox" data-etq="${esc(p.id)}" ${seleccionEtq.has(p.id) ? 'checked' : ''}>${esc(titulo(p))}<span class="n">${esc(p.codigo)}</span></label>`).join('')}</div></div>
      <div><div class="seccion-cab" style="margin-bottom:12px"><p style="margin:0"><strong>${sel.length}</strong> etiquetas · ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'} de 30</p><button class="btn btn-pri" id="imprimir" ${sel.length ? '' : 'disabled'}>Imprimir</button></div>
        ${sel.length ? `<div class="hoja-etiquetas">${sel.map(etiquetaHTML).join('')}</div>` : '<div class="vacio"><p class="tenue">Selecciona fichas a la izquierda.</p></div>'}</div></div>`;
  c.onchange = (e) => { const id = e.target.dataset.etq; if (id) { e.target.checked ? seleccionEtq.add(id) : seleccionEtq.delete(id); vistaEtiquetas(c, ctx); } };
  c.onclick = (e) => {
    if (e.target.id === 'todas') { seleccionEtq = sel.length === l.length ? new Set() : new Set(l.map(p => p.id)); vistaEtiquetas(c, ctx); }
    if (e.target.id === 'imprimir') { try { window.print(); } catch { toast('La impresión no está disponible en esta vista previa; funciona al abrir el prototipo fuera del visor.', 'error'); } }
  };
}
function etiquetaHTML(p) {
  const moneda = p.tipo === 'moneda' || p.tipo === 'medalla';
  const sup = [p.tipoEmision && p.tipoEmision !== 'Circulante' ? p.tipoEmision : '', p.graduador && p.graduador !== 'Sin graduar' ? p.graduador : ''].filter(Boolean).join(' · ');
  const inf = (p.descripcion || '').slice(0, 60) + ((p.descripcion || '').length > 60 ? '…' : '');
  return `<div class="etiqueta"><span class="e-pais">${esc(R.capitalizar(p.pais) || '—')}</span>
    <span class="e-den">${esc(p.denominacion || p.nombre)}</span>
    <span class="e-fila"><span>${esc(p.anio || '')}</span><span>${esc(p.codigoCatalogo || '')}</span></span>
    ${sup ? `<span class="e-desc">${esc(sup)}</span>` : ''}
    <span class="e-fila"><span>${esc(p.calidad || '')}</span>${moneda && p.material ? `<span>${esc(p.material)}</span>` : ''}</span>
    ${inf ? `<span class="e-desc">${esc(inf)}</span>` : ''}
    <span class="e-fila"><span class="e-precio">${precio(p.precio)}</span><span class="e-cod">${esc(p.codigo)} · ${R.anioEtiqueta()}</span></span></div>`;
}

/* ============================== SOLICITUDES ============================== */
export async function vistaSolicitudes(c) {
  const l = await api.listarSolicitudes();
  const T = { INFORMACION: 'Información', AVISAR_DISPONIBLE: 'Avisar disponibilidad', BUSCO_PIEZA: 'Busca una pieza', VENDER_COLECCION: 'Vender colección' };
  c.innerHTML = `<p class="eyebrow">Clientes</p><h1>Solicitudes</h1><p class="tenue">Consultas de los clientes registrados. Respóndelas por correo o WhatsApp y márcalas como atendidas.</p>
    <div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Pieza</th><th>Mensaje</th><th>Estado</th></tr></thead><tbody>
    ${l.length ? l.map(s => `<tr><td>${fecha(s.creadaEn)}</td><td><strong>${esc(s.cliente?.nombre)}</strong><br><small class="tenue">${esc(s.cliente?.email)}${s.cliente?.celular ? ' · ' + esc(s.cliente.celular) : ''}</small></td>
      <td>${esc(T[s.tipo])}</td><td>${s.pieza ? `<a href="#admin-editar-${esc(s.pieza.id)}">${esc(s.pieza.titulo)}</a>` : '—'}</td><td style="max-width:280px">${esc(s.mensaje || '—')}</td>
      <td><select data-sol="${esc(s.id)}" style="min-height:36px;padding:4px 8px">${['PENDIENTE', 'ATENDIDA', 'CERRADA'].map(x => `<option ${s.estado === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`).join('')
    : '<tr><td colspan="6" class="tenue" style="text-align:center;padding:30px">Sin solicitudes.</td></tr>'}</tbody></table></div>`;
  c.onchange = async (e) => { const id = e.target.dataset.sol; if (id) { await api.cambiarEstadoSolicitud(id, e.target.value); toast('Estado actualizado'); } };
}
