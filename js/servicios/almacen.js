/**
 * Persistencia local del PROTOTIPO (reemplaza a la base de datos).
 * Guarda todo en localStorage del navegador de cada visitante.
 * En el producto final este archivo desaparece: los datos viven en la BD relacional
 * (ver docs/ARQUITECTURA.md, modelo ER-01/ER-02 del Canva).
 */
const CLAVE = 'decoleccion.prototipo.v1';
let memoria = null;

export async function cargar() {
  if (memoria) return memoria;
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) { memoria = JSON.parse(t); return memoria; }
  } catch { /* almacenamiento no disponible: se trabaja en memoria */ }
  const r = await fetch('data/semilla.json');
  memoria = await r.json();
  guardar();
  return memoria;
}

export function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(memoria)); return true; }
  catch { return false; } // cuota llena o bloqueado: los cambios quedan solo en memoria
}

export async function restablecer() {
  try { localStorage.removeItem(CLAVE); sessionStorage.clear(); } catch {}
  memoria = null;
  return cargar();
}

export const sesion = {
  obtener() { try { return sessionStorage.getItem('decoleccion.sesion'); } catch { return sesion._m; } },
  fijar(id) { sesion._m = id; try { id ? sessionStorage.setItem('decoleccion.sesion', id) : sessionStorage.removeItem('decoleccion.sesion'); } catch {} },
  _m: null,
};
