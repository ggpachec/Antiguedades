/**
 * Cuentas de clientes (compradores): registro, ingreso, recuperación de contraseña
 * y «Mi cuenta» (favoritos, solicitudes, vistos, perfil y preferencias).
 * No hay compras ni pagos: las solicitudes las atiende el encargado por fuera.
 */
import * as api from '../servicios/api.js';
import * as R from '../dominio/reglas.js';
import { PREFERENCIAS } from '../config/catalogos.js';
import { esc, $, $$, toast, dialogo, tarjetaPieza, fecha, imagenPrincipal } from '../ui/componentes.js';

const TIPOS_SOLICITUD = {
  INFORMACION: 'Solicitud de información', AVISAR_DISPONIBLE: 'Aviso de disponibilidad',
  BUSCO_PIEZA: 'Busco una pieza', VENDER_COLECCION: 'Evaluación de colección',
};
const ESTADOS = { PENDIENTE: 'Pendiente', ATENDIDA: 'Atendida', CERRADA: 'Cerrada' };

function mostrarErrores(form, err) {
  $$('.campo', form).forEach(c => { c.classList.remove('con-error'); c.querySelector('.error')?.remove(); });
  for (const [k, msg] of Object.entries(err?.detalle ?? {})) {
    const input = form.querySelector(`[name="${k}"]`); const campo = input?.closest('.campo') ?? input?.closest('label');
    if (campo) { campo.classList.add('con-error'); campo.insertAdjacentHTML('beforeend', `<span class="error">${esc(msg)}</span>`); }
  }
  const primero = form.querySelector('.con-error input, .con-error select, .con-error textarea'); primero?.focus();
}

export function formIngreso(volver = '#cuenta') {
  return `<form id="f-ingreso" class="lista" novalidate>
    <label class="campo">Correo<input name="email" type="email" autocomplete="email" required></label>
    <label class="campo">Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
    <p class="error" id="err-ingreso" role="alert" style="color:var(--rojo);font-weight:600;margin:0" hidden></p>
    <button class="btn btn-pri">Ingresar</button>
    <p class="tenue" style="font-size:13.5px;margin:0"><a href="#recuperar">¿Olvidaste tu contraseña?</a> · <a href="#registro">Crear cuenta</a></p>
    <p class="nota nota-info" style="margin:0">Demo: cliente@ejemplo.com · encargado@decoleccion.ec — clave <strong>demo1234</strong></p>
    <input type="hidden" name="volver" value="${esc(volver)}"></form>`;
}
export function enlazarIngreso(raiz, ctx, alTerminar) {
  const f = $('#f-ingreso', raiz);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    try {
      const u = await api.iniciarSesion(d.email, d.clave);
      await ctx.refrescarUsuario();
      toast(`Hola, ${u.nombre.split(' ')[0]}`);
      alTerminar ? alTerminar(u) : (location.hash = u.rol === 'ENCARGADO' ? 'admin' : (d.volver || '#cuenta').slice(1));
    } catch (err) { const p = $('#err-ingreso', f); p.hidden = false; p.textContent = err.message; }
  };
}

export async function vistaIngresar(c, ctx) {
  c.innerHTML = `<div class="envoltura"><div class="auth panel"><p class="eyebrow">Mi cuenta</p><h1>Ingresar</h1>${formIngreso()}</div></div>`;
  enlazarIngreso(c, ctx);
}

export async function vistaRegistro(c, ctx) {
  c.innerHTML = `<div class="envoltura"><div class="auth panel" style="max-width:640px"><p class="eyebrow">Cuenta de coleccionista</p><h1>Crear cuenta</h1>
    <p class="tenue">Guarda favoritos, pide información y recibe avisos de las piezas que te interesan.</p>
    <form id="f-reg" class="form-rejilla" style="grid-template-columns:1fr 1fr" novalidate>
      <label class="campo ancho">Nombre<input name="nombre" autocomplete="name" required></label>
      <label class="campo">Correo<input name="email" type="email" autocomplete="email" required></label>
      <label class="campo">Celular (opcional)<input name="celular" type="tel" autocomplete="tel" placeholder="0991234567"></label>
      <label class="campo ancho">Contraseña<input name="clave" type="password" autocomplete="new-password" minlength="8" required><span class="ayuda">Mínimo 8 caracteres.</span></label>
      <fieldset class="ancho" style="border:1px solid var(--linea);border-radius:8px;padding:12px 14px"><legend style="font-weight:700;font-size:13px;padding:0 6px">¿Qué coleccionas?</legend>
        <div class="casillas">${PREFERENCIAS.map(p => `<label><input type="checkbox" name="preferencias" value="${esc(p)}">${esc(p)}</label>`).join('')}</div></fieldset>
      <label class="ancho" style="display:flex;gap:10px;align-items:start;font-size:14px"><input type="checkbox" name="avisosNovedades" style="width:18px;height:18px;min-height:0;margin-top:2px">Quiero recibir novedades según lo que colecciono (puedes cambiarlo cuando quieras).</label>
      <label class="campo ancho" style="font-weight:500"><span style="display:flex;gap:10px;align-items:start;font-size:14px"><input type="checkbox" name="aceptaPrivacidad" style="width:18px;height:18px;min-height:0;margin-top:2px">Acepto la <a href="#privacidad" id="ver-politica">política de privacidad</a>.</span></label>
      <div class="ancho fila-botones"><button class="btn btn-pri">Crear cuenta</button><a class="btn btn-txt" href="#ingresar">Ya tengo cuenta</a></div>
    </form></div></div>`;
  const f = $('#f-reg', c);
  $('#ver-politica', c).onclick = (e) => { e.preventDefault(); dialogo('Política de privacidad', '<p>Texto pendiente de aprobación por el cliente. Debe indicar qué datos se guardan (nombre, correo, celular, preferencias), para qué se usan, cuánto tiempo se conservan y cómo pedir su eliminación, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.</p>'); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const d = { ...Object.fromEntries(fd), preferencias: fd.getAll('preferencias'), avisosNovedades: fd.has('avisosNovedades'), aceptaPrivacidad: fd.has('aceptaPrivacidad') };
    try { await api.registrarCliente(d); await ctx.refrescarUsuario(); toast('Cuenta creada. ¡Bienvenido!'); location.hash = 'cuenta'; }
    catch (err) { toast(err.message, 'error'); mostrarErrores(f, err); }
  };
}

export async function vistaRecuperar(c) {
  c.innerHTML = `<div class="envoltura"><div class="auth panel"><p class="eyebrow">Mi cuenta</p><h1>Recuperar contraseña</h1>
    <form id="f-rec1" class="lista"><p class="tenue">Te enviaremos un código a tu correo o celular registrado.</p>
      <label class="campo">Correo<input name="email" type="email" required></label><button class="btn btn-pri">Enviar código</button></form>
    <form id="f-rec2" class="lista" hidden><p class="nota nota-info" id="codigo-demo"></p>
      <label class="campo">Código de 6 dígitos<input name="codigo" inputmode="numeric" maxlength="6" required></label>
      <label class="campo">Nueva contraseña<input name="clave" type="password" minlength="8" required></label>
      <button class="btn btn-pri">Cambiar contraseña</button></form></div></div>`;
  let email = '';
  $('#f-rec1', c).onsubmit = async (e) => {
    e.preventDefault(); email = new FormData(e.target).get('email');
    const r = await api.solicitarRecuperacion(email);
    e.target.hidden = true; $('#f-rec2', c).hidden = false;
    $('#codigo-demo', c).textContent = r.codigoDemo ? `Si el correo existe, enviamos un código. (Prototipo: el código es ${r.codigoDemo})` : 'Si el correo existe, enviamos un código. Revisa tu bandeja.';
  };
  $('#f-rec2', c).onsubmit = async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { await api.restablecerClave(email, d.codigo, d.clave); toast('Contraseña actualizada. Ya puedes ingresar.'); location.hash = 'ingresar'; }
    catch (err) { toast(err.message, 'error'); }
  };
}

let pestana = 'favoritos';
export async function vistaCuenta(c, ctx) {
  const u = ctx.usuario;
  if (!u) { location.hash = 'ingresar'; return; }
  if (u.rol === 'ENCARGADO') { location.hash = 'admin'; return; }
  c.innerHTML = `<div class="envoltura seccion" style="padding-top:28px">
    <div class="seccion-cab"><div><p class="eyebrow">Mi cuenta</p><h1>Hola, ${esc(u.nombre.split(' ')[0])}</h1><p class="tenue" style="margin:0">${esc(u.email)}</p></div>
      <button class="btn btn-sec" id="salir">Cerrar sesión</button></div>
    <div class="cuenta-tabs" role="tablist">${[['favoritos', 'Favoritos'], ['solicitudes', 'Mis solicitudes'], ['vistos', 'Vistos recientemente'], ['perfil', 'Perfil y preferencias']].map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${pestana === k}">${t}</button>`).join('')}</div>
    <div id="tab"></div></div>`;
  $('#salir', c).onclick = async () => { await api.cerrarSesion(); await ctx.refrescarUsuario(); location.hash = 'inicio'; };
  c.querySelector('.cuenta-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { pestana = b.dataset.tab; vistaCuenta(c, ctx); } };
  const t = $('#tab', c);

  if (pestana === 'favoritos') {
    const favs = await api.listarFavoritos();
    t.innerHTML = favs.length ? `<div class="rejilla">${favs.map(p => p.retirada
      ? `<div class="vacio" style="padding:20px"><h3>${esc(p.titulo)}</h3><p class="tenue">Esta pieza ya no está publicada.</p><button class="btn btn-sec btn-sm" data-fav="${esc(p.id)}">Quitar</button></div>`
      : tarjetaPieza(p, ctx.opTarjeta(p))).join('')}</div>`
      : `<div class="vacio"><h3>Aún no guardas piezas</h3><p class="tenue">Toca el corazón en cualquier pieza del catálogo o de la sala.</p><a class="btn btn-pri" href="#catalogo">Ir al catálogo</a></div>`;
    ctx.enlazarFavoritos(t, () => vistaCuenta(c, ctx));
  }
  if (pestana === 'solicitudes') {
    const s = await api.misSolicitudes();
    t.innerHTML = `<div class="fila-botones" style="margin-bottom:14px"><button class="btn btn-pri btn-sm" data-nueva="BUSCO_PIEZA">Busco una pieza</button><button class="btn btn-sec btn-sm" data-nueva="VENDER_COLECCION">Quiero vender una colección</button></div>
      ${s.length ? `<div class="lista">${s.map(x => `<div class="fila-lista"><div style="flex:1"><strong>${esc(TIPOS_SOLICITUD[x.tipo])}</strong>${x.pieza ? ` · <a href="#pieza-${esc(x.pieza.id)}">${esc(x.pieza.titulo)}</a>` : ''}<br><span class="tenue" style="font-size:13px">${esc(x.mensaje || 'Sin mensaje')} · ${fecha(x.creadaEn)}</span></div><span class="chip ${x.estado === 'PENDIENTE' ? 'chip-borrador' : 'chip-publicada'}">${ESTADOS[x.estado]}</span></div>`).join('')}</div>`
      : '<div class="vacio"><p class="tenue">No tienes solicitudes todavía.</p></div>'}`;
    t.onclick = (e) => { const b = e.target.closest('[data-nueva]'); if (b) ctx.abrirSolicitud({ tipo: b.dataset.nueva, alTerminar: () => vistaCuenta(c, ctx) }); };
  }
  if (pestana === 'vistos') {
    const v = await api.listarVistos();
    t.innerHTML = v.length ? `<div class="rejilla">${v.map(p => tarjetaPieza(p, ctx.opTarjeta(p))).join('')}</div>` : '<div class="vacio"><p class="tenue">Las piezas que abras aparecerán aquí.</p></div>';
    ctx.enlazarFavoritos(t);
  }
  if (pestana === 'perfil') {
    t.innerHTML = `<form id="f-perfil" class="panel form-rejilla" style="grid-template-columns:1fr 1fr;max-width:760px">
      <label class="campo">Nombre<input name="nombre" value="${esc(u.nombre)}" required></label>
      <label class="campo">Celular<input name="celular" type="tel" value="${esc(u.celular)}"></label>
      <fieldset class="ancho" style="border:1px solid var(--linea);border-radius:8px;padding:12px 14px"><legend style="font-weight:700;font-size:13px;padding:0 6px">Preferencias de coleccionismo</legend>
      <div class="casillas">${PREFERENCIAS.map(p => `<label><input type="checkbox" name="preferencias" value="${esc(p)}" ${u.preferencias?.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div></fieldset>
      <label class="ancho" style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" name="avisosNovedades" ${u.avisosNovedades ? 'checked' : ''} style="width:18px;height:18px;min-height:0">Recibir novedades según mis preferencias</label>
      <div class="ancho fila-botones"><button class="btn btn-pri">Guardar cambios</button><a class="btn btn-txt" href="#recuperar">Cambiar contraseña</a></div></form>`;
    $('#f-perfil', c).onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      await api.actualizarPerfil({ nombre: fd.get('nombre'), celular: fd.get('celular'), preferencias: fd.getAll('preferencias'), avisosNovedades: fd.has('avisosNovedades') });
      await ctx.refrescarUsuario(); toast('Perfil actualizado');
    };
  }
}

/** Diálogo de solicitud (información, aviso, busco pieza, vender colección). */
export function dialogoSolicitud(ctx, { tipo, pieza = null, alTerminar }) {
  const titulo = TIPOS_SOLICITUD[tipo];
  const ayuda = { INFORMACION: '¿Qué te gustaría saber de esta pieza?', AVISAR_DISPONIBLE: 'Opcional: algún detalle que quieras que tengamos en cuenta.', BUSCO_PIEZA: 'Describe la pieza: país, denominación, año, calidad, presupuesto…', VENDER_COLECCION: 'Describe tu colección: tipo de piezas, cantidad aproximada, países, años. Luego te pediremos fotos.' }[tipo];
  const d = dialogo(titulo, `<form class="lista" id="f-sol">
    ${pieza ? `<div class="fila-lista"><img src="${esc(imagenPrincipal(pieza))}" alt=""><div><strong>${esc(R.tituloPieza(pieza))}</strong><br><span class="tenue" style="font-size:13px">${esc(pieza.codigo)}</span></div></div>` : ''}
    <label class="campo">Mensaje<textarea name="mensaje" maxlength="1000" placeholder="${esc(ayuda)}"></textarea></label>
    <p class="tenue" style="font-size:13px;margin:0">Te responderemos al correo ${esc(ctx.usuario.email)}${ctx.usuario.celular ? ' o al ' + esc(ctx.usuario.celular) : ''}.</p>
    <div class="fila-botones"><button class="btn btn-pri">Enviar solicitud</button><button type="button" class="btn btn-sec" data-cerrar>Cancelar</button></div></form>`);
  $('#f-sol', d).onsubmit = async (e) => {
    e.preventDefault();
    try { await api.crearSolicitud({ piezaId: pieza?.id ?? null, tipo, mensaje: new FormData(e.target).get('mensaje') }); d.close(); toast('Solicitud enviada. Te contactaremos pronto.'); alTerminar?.(); }
    catch (err) { toast(err.message, 'error'); }
  };
}
