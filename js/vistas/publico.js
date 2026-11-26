/**
 * Vistas públicas: inicio, catálogo con filtros, ficha de pieza y sala virtual.
 * Cada vista es una función async (contenedor, ctx, parametro) → limpieza opcional.
 */
import * as api from '../servicios/api.js';
import * as R from '../dominio/reglas.js';
import { TIPOS, ES_LOTE, PERIODOS, CONTINENTES, GRUPOS_CALIDAD, GRUPOS_MATERIAL_METAL, GRUPOS_MATERIAL_BILLETE, RANGOS_PRECIO, NOVEDAD, TIPOS_EMISION } from '../config/catalogos.js';
import { esc, $, $$, precio, fecha, toast, dialogo, tarjetaPieza, imagenCara, corazon } from '../ui/componentes.js';
import { crearVisor } from '../galeria/visor-pieza.js';
import { crearSala, PUNTOS, PAREDES } from '../galeria/sala3d.js';

const CONTACTO = 'WhatsApp 0991 234 567 · ventas@decoleccion.ec (datos de ejemplo)';

/* ============================== INICIO ============================== */
export async function vistaInicio(c, ctx) {
  const { items, totalPublicadas } = await api.listarPiezasPublicas({ orden: 'recientes' });
  const destacada = items.find(p => p.id === 'mo-chl-1751-001') ?? items[0];
  c.innerHTML = `
  <section class="hero">
    <div class="hero-texto">
      <p class="eyebrow">Patrimonio que se descubre</p>
      <h1>Cada pieza,<br>una historia.</h1>
      <p>Monedas, billetes y medallas que conectan épocas. Explora la colección, gira cada pieza y recorre nuestra sala virtual.</p>
      <div class="fila-botones" style="margin-top:22px"><a class="btn btn-oro" href="#catalogo">Explorar catálogo</a><a class="btn btn-pri" style="background:#1d4a3d" href="#sala">Entrar a la sala virtual</a></div>
    </div>
    <div class="hero-img"><div id="hero-visor"></div></div>
  </section>
  <div class="franja"><div class="envoltura"><span><strong>${totalPublicadas}</strong> piezas publicadas</span><span>Monedas · Billetes · Medallas · Sets</span><span>Guayaquil, Ecuador · desde 2001</span></div></div>
  <section class="seccion envoltura">
    <div class="seccion-cab"><div><p class="eyebrow">Nuevos ingresos</p><h2>Una colección por descubrir</h2></div><a class="btn btn-sec" href="#catalogo">Ver todas las piezas</a></div>
    <div class="rejilla" id="recientes">${items.slice(0, 3).map(p => tarjetaPieza(p, ctx.opTarjeta(p))).join('')}
      <div class="invitacion"><div><p class="eyebrow" style="color:var(--oro)">Sala virtual</p><h3>Otra forma de explorar.</h3><p>Recorre la sala por puntos, elige una vitrina y gira la pieza con el mouse.</p></div><a class="btn btn-oro" href="#sala">Entrar a la sala</a></div>
    </div>
  </section>
  <section class="seccion envoltura" style="padding-top:0">
    <div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div class="panel"><p class="eyebrow">Para coleccionistas</p><h3>Crea tu cuenta gratuita</h3><p class="tenue">Guarda favoritos, pide información de una pieza, recibe aviso cuando vuelva una agotada y cuéntanos qué buscas. Sin compras ni pagos en línea por ahora.</p><a class="btn btn-pri" href="${ctx.usuario ? '#cuenta' : '#registro'}">${ctx.usuario ? 'Ir a mi cuenta' : 'Crear cuenta'}</a></div>
      <div class="panel"><p class="eyebrow">Compra y consignación</p><h3>¿Quieres vender una colección?</h3><p class="tenue">Envíanos una descripción y te contactamos para una evaluación inicial.</p><button class="btn btn-sec" id="vender">Solicitar evaluación</button></div>
    </div>
  </section>`;
  if (destacada) crearVisor($('#hero-visor', c), destacada, { autoGiro: true });
  $('#vender', c).onclick = () => ctx.abrirSolicitud({ tipo: 'VENDER_COLECCION' });
  ctx.enlazarFavoritos(c);
}

/* ============================== CATÁLOGO ============================== */
const FILTROS_VACIOS = () => ({ zona: '', q: '', precio: [], periodo: [], continente: [], pais: [], material: [], calidad: [], emision: [], lotes: '', graduada: false, anioDesde: '', anioHasta: '', novedad: '', soloDisponibles: false, orden: 'recientes' });
let filtros = FILTROS_VACIOS();
try { const g = JSON.parse(sessionStorage.getItem('decoleccion.filtros')); if (g) filtros = { ...filtros, ...g }; } catch {}
const recordar = () => { try { sessionStorage.setItem('decoleccion.filtros', JSON.stringify(filtros)); } catch {} };

const ETIQUETAS = {
  precio: (id) => RANGOS_PRECIO.find(r => r.id === id)?.nombre, periodo: (id) => R.nombrePeriodo(id), continente: (x) => x,
  material: (id) => [...GRUPOS_MATERIAL_METAL, ...GRUPOS_MATERIAL_BILLETE].find(g => g.id === id)?.nombre,
  calidad: (id) => GRUPOS_CALIDAD.find(g => g.id === id)?.nombre, emision: (x) => x, pais: (x) => R.capitalizar(x),
};

export async function vistaCatalogo(c, ctx, zonaRuta) {
  if (zonaRuta !== undefined && zonaRuta !== filtros.zona) { filtros = { ...FILTROS_VACIOS(), zona: zonaRuta, orden: filtros.orden }; recordar(); }
  const paises = await api.paisesPublicados();
  c.innerHTML = `<div class="envoltura seccion" style="padding-top:22px">
    <div class="tabs-cat" role="group" aria-label="Tipo de pieza">
      ${[['', 'Todo el catálogo'], ['monedas', 'Monedas'], ['billetes', 'Billetes'], ['medallas', 'Medallas']].map(([z, t]) => `<button data-zona="${z}" aria-pressed="${filtros.zona === z}">${t}</button>`).join('')}
    </div>
    <p class="eyebrow">Colección pública</p>
    <h1 id="titulo-cat"></h1>
    <p class="tenue">Fotografías y atributos revisados. Solo se muestran piezas publicadas.</p>
    <form class="buscador" id="buscador" role="search"><input id="q" type="search" placeholder="Nombre, país, denominación, año o KM / Pick" value="${esc(filtros.q)}" aria-label="Buscar pieza"><button class="btn btn-pri">Buscar</button></form>
    <div class="catalogo">
      <aside class="filtros" id="filtros" aria-label="Filtros"></aside>
      <section>
        <div class="resultados-cab"><span id="cuenta" class="tenue" aria-live="polite"></span>
          <div class="fila-botones"><button class="btn btn-sec btn-sm btn-filtros-movil" id="abrir-filtros">Filtros</button>
          <label class="campo" style="grid-auto-flow:column;align-items:center;gap:8px">Ordenar
            <select id="orden" style="min-height:38px;padding:6px 10px">
              ${[['recientes', 'Más recientes'], ['precioAsc', 'Precio: menor a mayor'], ['precioDesc', 'Precio: mayor a menor'], ['anioAsc', 'Año: más antiguas'], ['anioDesc', 'Año: más nuevas'], ['visitas', 'Más vistas']].map(([v, t]) => `<option value="${v}" ${filtros.orden === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select></label></div></div>
        <div class="chips" id="chips"></div>
        <div class="rejilla" id="resultados"></div>
        <div class="fila-botones" style="margin-top:22px"><a class="btn btn-sec" href="#sala${filtros.zona ? '-' + filtros.zona : ''}">Explorar en la sala virtual</a></div>
      </section>
    </div></div>`;

  const titulo = () => ({ monedas: 'Monedas', billetes: 'Billetes', medallas: 'Medallas' }[filtros.zona] ?? 'Todo el catálogo');

  async function actualizar() {
    recordar();
    $('#titulo-cat', c).textContent = titulo();
    const r = await api.listarPiezasPublicas(filtros);
    $('#cuenta', c).textContent = `${r.total} ${r.total === 1 ? 'resultado' : 'resultados'}`;
    $('#resultados', c).innerHTML = r.items.length ? r.items.map(p => tarjetaPieza(p, ctx.opTarjeta(p))).join('')
      : `<div class="vacio" style="grid-column:1/-1"><h3>No hay piezas con esta combinación</h3><p class="tenue">Prueba quitando algún filtro. ¿Buscas algo en particular?</p><div class="fila-botones" style="justify-content:center"><button class="btn btn-sec" data-limpiar>Limpiar filtros</button><button class="btn btn-pri" data-busco>Cuéntanos qué buscas</button></div></div>`;
    pintarChips(); pintarFiltros(r.facetas);
    ctx.enlazarFavoritos($('#resultados', c));
  }

  function pintarChips() {
    const chips = [];
    for (const k of ['precio', 'periodo', 'continente', 'pais', 'material', 'calidad', 'emision']) for (const v of filtros[k]) chips.push([k, v, ETIQUETAS[k](v)]);
    if (filtros.q) chips.push(['q', '', `«${filtros.q}»`]);
    if (filtros.anioDesde || filtros.anioHasta) chips.push(['anio', '', `Año ${filtros.anioDesde || '…'}–${filtros.anioHasta || '…'}`]);
    if (filtros.lotes) chips.push(['lotes', '', filtros.lotes === 'solo' ? 'Solo sets y lotes' : 'Sin sets ni lotes']);
    if (filtros.graduada) chips.push(['graduada', '', 'Graduadas']);
    if (filtros.novedad) chips.push(['novedad', '', NOVEDAD.find(n => n.id === filtros.novedad).nombre]);
    if (filtros.soloDisponibles) chips.push(['soloDisponibles', '', 'Solo disponibles']);
    $('#chips', c).innerHTML = chips.map(([k, v, t]) => `<button class="chip" data-quitar="${k}" data-valor="${esc(v)}">${esc(t)}</button>`).join('')
      + (chips.length > 1 ? '<button class="btn-txt" data-limpiar style="border:0;cursor:pointer;font:600 13px var(--sans)">Limpiar todo</button>' : '');
  }

  const abiertos = new Set(['precio', 'periodo']);
  function grupo(clave, titulo, opciones, conteo, { radio = false } = {}) {
    const activos = radio ? (filtros[clave] ? 1 : 0) : filtros[clave].length;
    return `<details class="grupo" data-grupo="${clave}" ${abiertos.has(clave) || activos ? 'open' : ''}><summary>${titulo}${activos ? `<span class="cuenta-activos">${activos}</span>` : ''}</summary><div class="opciones">
      ${opciones.map(([v, t]) => {
        const marcado = radio ? filtros[clave] === v : filtros[clave].includes(v);
        const n = conteo?.[v] ?? 0;
        return `<label class="opcion${!n && !marcado && conteo ? ' cero' : ''}"><input type="${radio ? 'radio' : 'checkbox'}" name="f-${clave}" value="${esc(v)}" ${marcado ? 'checked' : ''}>${esc(t)}${conteo ? `<span class="n">${n}</span>` : ''}</label>`;
      }).join('')}</div></details>`;
  }

  function pintarFiltros(f) {
    const zona = filtros.zona;
    const grupoMat = zona === 'billetes' ? GRUPOS_MATERIAL_BILLETE : GRUPOS_MATERIAL_METAL;
    const masActivos = [filtros.anioDesde || filtros.anioHasta, filtros.pais.length, filtros.emision.length, filtros.lotes, filtros.graduada, filtros.novedad, filtros.soloDisponibles].filter(Boolean).length;
    const abiertoMas = $('#mas-filtros', c)?.open || masActivos > 0;
    $('#filtros', c).innerHTML = `
      <div class="filtros-cab"><h2>Filtrar</h2><button class="btn-txt" data-limpiar style="border:0;cursor:pointer;font:600 13px var(--sans)">Limpiar</button></div>
      ${grupo('precio', 'Rango de precio', RANGOS_PRECIO.map(r => [r.id, r.nombre]), f.precio)}
      ${grupo('periodo', 'Periodo', PERIODOS.map(p => [p.id, p.nombre]).reverse(), f.periodo)}
      ${grupo('continente', 'Continente', CONTINENTES.map(x => [x, x]), f.continente)}
      ${zona ? grupo('material', 'Material', grupoMat.map(g => [g.id, g.nombre]), f.material) : `<details class="grupo"><summary>Material</summary><p class="tenue" style="font-size:13px">Elige Monedas, Billetes o Medallas para filtrar por material: cambia según el tipo de pieza.</p></details>`}
      ${grupo('calidad', 'Calidad', GRUPOS_CALIDAD.map(g => [g.id, g.nombre]), f.calidad)}
      <details class="mas-filtros" id="mas-filtros" ${abiertoMas ? 'open' : ''}><summary>Más filtros${masActivos ? ` (${masActivos})` : ''}</summary>
        <div class="grupo" style="border:0"><p style="font-weight:700;font-size:13px;margin:6px 0">Año</p>
          <div class="rango-anio"><input type="number" id="anio-desde" placeholder="Desde" value="${esc(filtros.anioDesde)}" aria-label="Año desde"><span>–</span><input type="number" id="anio-hasta" placeholder="Hasta" value="${esc(filtros.anioHasta)}" aria-label="Año hasta"></div>
          <p class="error" id="anio-error" style="color:var(--rojo);font-size:12.5px;margin:-6px 0 8px" hidden>El año inicial debe ser menor o igual al final.</p></div>
        <div class="grupo"><p style="font-weight:700;font-size:13px;margin:12px 0 6px">País</p>
          <select id="pais" aria-label="País"><option value="">Todos los países</option>${paises.map(([k, n]) => `<option value="${esc(k)}" ${filtros.pais.includes(k) ? 'selected' : ''}>${esc(n)} (${f.pais[k] ?? 0})</option>`).join('')}</select><div style="height:12px"></div></div>
        ${zona !== 'billetes' ? grupo('emision', 'Tipo de emisión', TIPOS_EMISION.map(x => [x, x]), f.emision) : ''}
        ${grupo('lotes', 'Sets y lotes', [['', 'Todos'], ['solo', 'Solo sets y lotes'], ['sin', 'Sin sets ni lotes']], null, { radio: true })}
        ${grupo('novedad', 'Lo nuevo publicado', [['', 'Cualquier fecha'], ...NOVEDAD.map(n => [n.id, n.nombre])], null, { radio: true })}
        <div class="grupo"><label class="opcion" style="padding:12px 0 4px"><input type="checkbox" id="graduada" ${filtros.graduada ? 'checked' : ''}>Solo graduadas (NGC, PCGS…)</label>
        <label class="opcion" style="padding:4px 0 12px"><input type="checkbox" id="disponibles" ${filtros.soloDisponibles ? 'checked' : ''}>Ocultar no disponibles</label></div>
      </details>
      <button class="btn btn-pri btn-filtros-movil" style="width:100%;margin-top:12px" id="cerrar-filtros">Ver resultados</button>`;
  }

  // Eventos
  const panel = $('#filtros', c);
  panel.addEventListener('toggle', e => { const g = e.target.dataset?.grupo; if (g) e.target.open ? abiertos.add(g) : abiertos.delete(g); }, true);
  panel.addEventListener('change', e => {
    const t = e.target;
    if (t.name?.startsWith('f-')) {
      const k = t.name.slice(2);
      if (t.type === 'radio') filtros[k] = t.value;
      else filtros[k] = t.checked ? [...filtros[k], t.value] : filtros[k].filter(v => v !== t.value);
    }
    if (t.id === 'pais') filtros.pais = t.value ? [t.value] : [];
    if (t.id === 'graduada') filtros.graduada = t.checked;
    if (t.id === 'disponibles') filtros.soloDisponibles = t.checked;
    if (t.id === 'anio-desde' || t.id === 'anio-hasta') {
      const d = $('#anio-desde', c).value, h = $('#anio-hasta', c).value;
      const mal = d !== '' && h !== '' && +d > +h;
      $('#anio-error', c).hidden = !mal; if (mal) return;
      filtros.anioDesde = d; filtros.anioHasta = h;
    }
    actualizar();
  });
  c.addEventListener('click', e => {
    const z = e.target.closest('[data-zona]');
    if (z) { location.hash = z.dataset.zona || 'catalogo'; return; }
    if (e.target.closest('[data-limpiar]')) { filtros = { ...FILTROS_VACIOS(), zona: filtros.zona, orden: filtros.orden }; $('#q', c).value = ''; actualizar(); }
    if (e.target.closest('[data-busco]')) ctx.abrirSolicitud({ tipo: 'BUSCO_PIEZA' });
    const q = e.target.closest('[data-quitar]');
    if (q) {
      const k = q.dataset.quitar, v = q.dataset.valor;
      if (Array.isArray(filtros[k])) filtros[k] = filtros[k].filter(x => x !== v);
      else if (k === 'anio') { filtros.anioDesde = ''; filtros.anioHasta = ''; }
      else if (k === 'q') { filtros.q = ''; $('#q', c).value = ''; }
      else filtros[k] = typeof filtros[k] === 'boolean' ? false : '';
      actualizar();
    }
    if (e.target.id === 'abrir-filtros') panel.classList.add('abierta');
    if (e.target.id === 'cerrar-filtros') panel.classList.remove('abierta');
  });
  $('#buscador', c).onsubmit = (e) => { e.preventDefault(); filtros.q = $('#q', c).value.trim(); actualizar(); };
  $('#orden', c).onchange = (e) => { filtros.orden = e.target.value; actualizar(); };
  await actualizar();
}

/* ============================== FICHA ============================== */
const ETQ = { pais: 'País', denominacion: 'Denominación', anio: 'Año', periodo: 'Periodo', codigoCatalogo: 'Código de catálogo', tipoEmision: 'Tipo de emisión', material: 'Material', peso: 'Peso', fineza: 'Fineza', onzaTroy: 'Contenido de plata u oro', calidad: 'Calidad', graduador: 'Graduador', estadoLote: 'Estado del set', cantidad: 'Unidades disponibles' };
function atributosPublicos(p) {
  const v = { ...p, periodo: R.nombrePeriodo(p.periodo), pais: R.capitalizar(p.pais), peso: p.peso ? `${p.peso} g` : '', fineza: p.fineza ? Number(p.fineza).toFixed(3) : '', onzaTroy: p.onzaTroy ? `${Number(p.onzaTroy).toFixed(4)} oz troy` : '', anio: p.anio || (ES_LOTE(p.tipo) ? '' : 'Sin fecha visible') };
  const campos = p.tipo === 'billete' ? ['pais', 'denominacion', 'anio', 'periodo', 'codigoCatalogo', 'material', 'calidad', 'graduador']
    : ES_LOTE(p.tipo) ? ['pais', 'periodo', 'estadoLote', 'calidad', 'cantidad']
    : ['pais', 'denominacion', 'anio', 'periodo', 'codigoCatalogo', 'tipoEmision', 'material', 'peso', 'fineza', 'onzaTroy', 'calidad', 'graduador'];
  return campos.filter(k => v[k] !== '' && v[k] != null).map(k => `<div><dt>${ETQ[k]}</dt><dd>${esc(v[k])}</dd></div>`).join('');
}

export async function vistaFicha(c, ctx, id) {
  const p = await api.obtenerPiezaPublica(id);
  if (!p) { c.innerHTML = `<div class="envoltura seccion"><div class="vacio"><h2>Pieza no disponible</h2><p class="tenue">Esta pieza no existe o ya no está publicada.</p><a class="btn btn-pri" href="#catalogo">Volver al catálogo</a></div></div>`; return; }
  api.registrarVista(p.id);
  const fav = ctx.esFavorito(p.id);
  const pp = p.precioPublico;
  const detalle = p.fotos?.find(f => f.cara === 'detalle');
  c.innerHTML = `<div class="envoltura" style="padding-bottom:40px">
    <nav class="migas"><a href="#catalogo">Catálogo</a> / <a href="#${TIPOS[p.tipo].zona}">${TIPOS[p.tipo].plural}</a> / ${esc(R.tituloPieza(p))}</nav>
    <div class="ficha">
      <div><div class="ficha-visor" id="visor"></div>
        ${detalle ? `<div class="fila-botones" style="margin-top:12px"><button class="btn btn-sec btn-sm" id="ver-detalle">Ver foto de detalle</button></div>` : ''}
        ${p.ilustracion ? '<p class="tenue" style="font-size:13px;margin-top:10px">Imagen ilustrativa: la pieza aún no tiene fotografía publicada.</p>' : ''}</div>
      <div>
        <p><span class="chip">${esc(TIPOS[p.tipo].nombre)}</span> <span class="tenue" style="font-size:13px;margin-left:6px">${esc(p.codigo)}</span></p>
        <h1>${esc(R.tituloPieza(p))}</h1>
        <p class="tenue" style="font-size:17px">${esc(R.subtituloPieza(p))}</p>
        <p class="precio-grande">${pp.descuento ? `<s style="font-size:20px;color:var(--tenue)">${precio(pp.base)}</s> ` : ''}${precio(pp.final)}</p>
        ${pp.descuento ? `<p class="nota nota-ok">${esc(p.publicacion.promocion || 'Promoción')}: −${pp.descuento} %</p>` : ''}
        ${p.disponible ? '' : '<p class="nota">No disponible por el momento. Te avisamos cuando vuelva a ingresar.</p>'}
        <div class="fila-botones" style="margin:16px 0">
          ${p.disponible ? '<button class="btn btn-pri" id="info">Solicitar información</button>' : '<button class="btn btn-pri" id="avisar">Avísame cuando esté disponible</button>'}
          <button class="btn btn-sec" id="fav" aria-pressed="${fav}"><span style="color:${fav ? '#b5483a' : '#b9b2a3'};display:inline-grid">${corazon}</span>${fav ? 'Guardada' : 'Guardar'}</button>
          <a class="btn btn-sec" href="#sala-${TIPOS[p.tipo].zona}">Ver en la sala</a>
        </div>
        <p class="tenue" style="font-size:13px">Compras directas con el local: ${CONTACTO}. Sin pagos en línea en esta versión.</p>
        <dl>${atributosPublicos(p)}</dl>
        ${p.descripcion ? `<h3>Descripción</h3><p>${esc(p.descripcion)}</p>` : ''}
        ${p.notasPublicas ? `<p class="tenue">${esc(p.notasPublicas)}</p>` : ''}
        <p class="tenue" style="font-size:12.5px">Publicada el ${fecha(p.publicacion.fechaPublicacion)} · ${p.publicacion.visitas} visitas</p>
      </div>
    </div></div>`;
  const visor = await crearVisor($('#visor', c), p, { autoGiro: false });
  $('#fav', c).onclick = async () => { if ((await ctx.alternarFavorito(p.id)) !== null) ctx.recargar(); };
  $('#info', c)?.addEventListener('click', () => ctx.abrirSolicitud({ tipo: 'INFORMACION', pieza: p }));
  $('#avisar', c)?.addEventListener('click', () => ctx.abrirSolicitud({ tipo: 'AVISAR_DISPONIBLE', pieza: p }));
  $('#ver-detalle', c)?.addEventListener('click', () => dialogo(R.tituloPieza(p), `<img src="${esc(detalle.src)}" alt="Foto de detalle" style="width:100%;border-radius:8px">`, { ancho: 720 }));
  return () => visor.destruir();
}

/* ============================== SALA VIRTUAL ============================== */
export async function vistaSala(c, ctx, zonaInicial) {
  c.innerHTML = `<section class="sala" aria-label="Sala virtual">
    <div id="escena" style="position:absolute;inset:0"></div>
    <div class="sala-cab"><div><p class="eyebrow">Sala virtual · De Colección</p><h1 id="sala-titulo">Elige una pared y descubre su historia</h1><p id="sala-sub">Monedas a la izquierda · Billetes al fondo · Medallas a la derecha</p></div>
      <a class="btn btn-oro" href="#catalogo">Salir al catálogo</a></div>
    <p class="sala-ayuda">Arrastra para mirar · toca los círculos del piso para avanzar · teclas 1-3 y Esc</p>
    <div class="sala-pag" id="sala-pag" hidden><button class="btn-icono" data-pag="-1" aria-label="Vitrinas anteriores">‹</button><span id="pag-txt"></span><button class="btn-icono" data-pag="1" aria-label="Vitrinas siguientes">›</button></div>
    <nav class="sala-barra" aria-label="Puntos del recorrido">${Object.entries(PUNTOS).map(([id, p]) => `<button data-punto="${id}">${id === 'entrada' ? '← ' : ''}${esc(p.nombre)}</button>`).join('')}</nav>
    <aside class="panel-pieza" id="panel" aria-hidden="true"></aside>
  </section>`;
  let visor = null;
  const panel = $('#panel', c);
  const sala = crearSala($('#escena', c), {
    cargarZona: (z) => api.listarGaleria(z),
    inicio: zonaInicial && PUNTOS[zonaInicial] ? zonaInicial : 'entrada',
    onPunto: (id) => {
      $$('.sala-barra button', c).forEach(b => b.setAttribute('aria-current', String(b.dataset.punto === id)));
      $('#sala-titulo', c).textContent = id === 'entrada' ? 'Elige una pared y descubre su historia' : PUNTOS[id].nombre;
      $('#sala-sub', c).textContent = id === 'entrada' ? 'Monedas a la izquierda · Billetes al fondo · Medallas a la derecha' : 'Selecciona una vitrina para ver la pieza en 3D';
      pintarPaginacion(); cerrarPanel();
    },
    onSeleccionar: abrirPanel,
  });
  function pintarPaginacion() {
    const z = sala.punto, caja = $('#sala-pag', c);
    if (!PAREDES[z]) { caja.hidden = true; return; }
    const i = sala.info(z);
    caja.hidden = i.paginas <= 1;
    $('#pag-txt', c).textContent = `${i.total} piezas · ${i.pagina + 1} de ${i.paginas}`;
  }
  async function abrirPanel(p) {
    visor?.destruir();
    const pp = p.precioPublico;
    panel.innerHTML = `<button class="btn-icono cerrar" id="cerrar-panel" aria-label="Cerrar">✕</button><div id="panel-visor"></div>
      <div class="panel-pieza-info"><p class="eyebrow">${esc(TIPOS[p.tipo].nombre)} · ${esc(p.codigo)}</p><h2>${esc(R.tituloPieza(p))}</h2>
      <p class="tenue">${esc(R.subtituloPieza(p))}${p.calidad ? ' · ' + esc(p.calidad) : ''}</p>
      <p class="precio-grande">${p.disponible ? precio(pp.final) : 'No disponible'}</p>
      ${p.descripcion ? `<p class="tenue">${esc(p.descripcion)}</p>` : ''}
      <div class="fila-botones"><a class="btn btn-oro" href="#pieza-${esc(p.id)}">Abrir ficha</a><button class="btn btn-sec" id="panel-fav">${ctx.esFavorito(p.id) ? 'Guardada ♥' : 'Guardar'}</button></div></div>`;
    panel.classList.add('abierto'); panel.setAttribute('aria-hidden', 'false');
    visor = await crearVisor($('#panel-visor', c), p, { compacto: true });
    $('#cerrar-panel', c).onclick = cerrarPanel;
    $('#panel-fav', c).onclick = async (e) => { const r = await ctx.alternarFavorito(p.id); if (r !== null) e.target.textContent = ctx.esFavorito(p.id) ? 'Guardada ♥' : 'Guardar'; };
  }
  function cerrarPanel() { visor?.destruir(); visor = null; panel.classList.remove('abierto'); panel.setAttribute('aria-hidden', 'true'); }
  c.querySelector('.sala-barra').onclick = (e) => { const b = e.target.closest('[data-punto]'); if (b) sala.irA(b.dataset.punto); };
  $('#sala-pag', c).onclick = (e) => { const b = e.target.closest('[data-pag]'); if (b) { sala.paginar(sala.punto, +b.dataset.pag); pintarPaginacion(); } };
  await sala.listo;
  c.querySelector('.sala-vista').focus({ preventScroll: true });
  return () => { visor?.destruir(); sala.destruir(); };
}
