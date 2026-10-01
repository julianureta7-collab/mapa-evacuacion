// Catálogo de zonas × amenazas (spec §3). Toda la información de "qué zonas existen,
// qué amenazas tiene cada una y qué capas oficiales las describen" vive en data/catalogo.json.
// El resto del código trabaja con roles genéricos y nunca pregunta por una zona por su nombre.

import { cargarJSON } from './datos.js?v=8';

export const ROLES = ['area_peligro', 'ruta', 'punto_encuentro', 'referencia', 'bloqueo'];

let cat = null;

// base: ruta hasta la carpeta app/ ('' desde la app usuario, '../' desde la app operador)
export async function cargarCatalogo(base = '') {
  cat = await cargarJSON(`${base}data/catalogo.json`);
  return cat;
}

export const zonas = () => cat.zonas;
export const zona = (id) => cat.zonas.find(z => z.id === id) || null;
export const amenazaInfo = (id) => ({ id, ...(cat.amenazas[id] || { nombre: id, area: 'área de peligro', resumen: null }) });
export const fuente = (id) => cat.fuentes[id] || null;

// Amenazas disponibles en una zona (el desplegable solo muestra estas).
export const amenazasDe = (z) => (z?.amenazas || []).map(a => ({ ...amenazaInfo(a.id), def: a }));

export function estiloDe(capa) {
  return { ...(cat.estilos[capa.rol] || {}), ...(capa.estilo || {}) };
}

// ¿En qué zona cae un punto [lng, lat]? Devuelve la primera zona cuya cobertura lo contiene.
export function zonaEn(lngLat) {
  if (!lngLat) return null;
  const pt = turf.point(lngLat);
  return cat.zonas.find(z => z.cobertura && turf.booleanPointInPolygon(pt, z.cobertura)) || null;
}
