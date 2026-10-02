// Catálogo de zonas × amenazas (spec §3). Toda la información de "qué zonas existen,
// qué amenazas tiene cada una y qué capas oficiales las describen" vive en data/catalogo.json.
// El resto del código trabaja con roles genéricos y nunca pregunta por una zona por su nombre.

import { cargarJSON } from './datos.js?v=18';

export const ROLES = ['area_peligro', 'ruta', 'punto_encuentro', 'referencia', 'bloqueo'];

let cat = null;

// base: ruta hasta la carpeta app/ ('' desde la app usuario, '../' desde la app operador)
export async function cargarCatalogo(base = '') {
  cat = await cargarJSON(`${base}data/catalogo.json?v=18`);   // subir junto con los ?v= de los scripts
  // La cobertura puede venir en un archivo (p. ej. un límite comunal oficial descargado con el script).
  // Si el archivo aún no existe, la zona se omite (con aviso en la consola) en vez de romper la app.
  const listas = await Promise.all(cat.zonas.map(async (z) => {
    if (typeof z.cobertura === 'string') {
      try {
        const fc = await cargarJSON(`${base}${z.cobertura}?v=18`);
        const geoms = (fc.features || [fc]).map(f => f.geometry || f).filter(g => /Polygon/.test(g?.type || ''));
        if (!geoms.length) throw new Error('sin polígonos');
        z.cobertura = geoms.length === 1 ? geoms[0]
          : { type: 'MultiPolygon', coordinates: geoms.flatMap(g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates) };
      } catch (e) {
        console.warn(`[catálogo] Zona "${z.id}" omitida: no se pudo cargar su cobertura (${z.cobertura}). ¿Falta correr scripts/descargar_capas.mjs?`, e.message);
        return null;
      }
    }
    // Sin centro declarado: un punto dentro de la cobertura
    if (!z.centro && z.cobertura) { const [lng, lat] = turf.pointOnFeature(z.cobertura).geometry.coordinates; z.centro = [lat, lng]; }
    return z;
  }));
  cat.zonas = listas.filter(Boolean);
  return cat;
}

export const zonas = () => cat.zonas;
export const zona = (id) => cat.zonas.find(z => z.id === id) || null;
export const amenazaInfo = (id) => ({ id, ...(cat.amenazas[id] || { nombre: id, area: 'área de peligro', resumen: null }) });
export const fuente = (id) => cat.fuentes[id] || null;

// Amenazas disponibles en una zona (el desplegable solo muestra estas).
export const amenazasDe = (z) => (z?.amenazas || []).map(a => ({ ...amenazaInfo(a.id), def: a }));

// Estilo de una capa. Si la capa declara "estilo_por" ({campo, valores}) y se pasa un feature,
// se agrega el estilo de su clase (p. ej. recurrencia "Alta" → rojo).
export function estiloDe(capa, feature = null) {
  const base = { ...(cat.estilos[capa.rol] || {}), ...(capa.estilo || {}) };
  const por = capa.estilo_por;
  if (!por || !feature) return base;
  return { ...base, ...(por.valores?.[feature.properties?.[por.campo]] || {}) };
}

// Clases de una capa con estilo_por, para la leyenda: [{ valor, estilo }]
export function clasesDe(capa) {
  const por = capa.estilo_por;
  if (!por) return [];
  const base = estiloDe(capa);
  return Object.entries(por.valores || {}).map(([valor, e]) => ({ valor, estilo: { ...base, ...e } }));
}

// ¿En qué zona cae un punto [lng, lat]? Devuelve la primera zona cuya cobertura lo contiene
// (por eso las zonas pequeñas, como un campus, van antes que la comuna que las contiene).
// "preferida": si esa zona contiene el punto, gana (p. ej. la zona de la alerta en curso, aunque
// el punto también esté en una zona más pequeña declarada antes).
export function zonaEn(lngLat, preferida = null) {
  if (!lngLat) return null;
  const pt = turf.point(lngLat);
  const contiene = (z) => z?.cobertura && turf.booleanPointInPolygon(pt, z.cobertura);
  const pref = preferida ? zona(preferida) : null;
  if (contiene(pref)) return pref;
  return cat.zonas.find(contiene) || null;
}
