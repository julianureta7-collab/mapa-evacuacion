// Etapa 3: elegir el punto de encuentro y trazar la ruta a pie.
//
// Reglas (ver especificación):
//  1. Candidatos: puntos de encuentro a menos de 3 km en línea recta, fuera del área a evacuar.
//  2. Se piden rutas a pie (OpenRouteService, foot-walking) a los 3 más cercanos.
//  3. Validación "sale y no vuelve a entrar": una vez que la ruta cruza el borde del área,
//     no puede volver a entrar. NO se usa avoid_polygons con el área: el usuario está adentro
//     y ORS no encontraría ruta.
//  4. Entre las válidas, gana la que te saca antes de la zona de inundación (menos metros
//     dentro del área); a igualdad, la más corta en tiempo.
//  5. Si ORS falla (sin clave, sin red, límite 429): dirección en línea recta al más cercano.

import { ORS_API_KEY } from './claves.js?v=5';

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
const RADIO_CANDIDATOS_M = 3000;
const MAX_CANDIDATOS = 3;
const TOLERANCIA_VIA_M = 20;     // un tramo "sigue la vía oficial" si está a menos de esto
const VELOCIDAD_PIE = 1.2;       // m/s, para estimar tiempo en línea recta

let areas = [];                  // Features de polígono
let puntos = [];                 // Features de punto de encuentro
let vias = [];                   // Features de línea (vías de evacuación oficiales)
const cache = new Map();         // origen redondeado → resultado

export const hayClaveORS = () => !!ORS_API_KEY && ORS_API_KEY !== 'PEGAR_AQUI_LA_CLAVE';

export function prepararRutas({ area_evacuar, puntos_encuentro, vias_evacuacion }) {
  areas = (area_evacuar?.features || []).filter(f => f.geometry);
  puntos = (puntos_encuentro?.features || []).filter(f => f.geometry);
  vias = (vias_evacuacion?.features || []).filter(f => f.geometry);
  cache.clear();
}

const dentroDeArea = (lngLat) => areas.some(a => turf.booleanPointInPolygon(lngLat, a));

function candidatos(origen) {
  return puntos
    .filter(p => !dentroDeArea(p.geometry.coordinates))
    .map(p => ({ punto: p, lineal: turf.distance(origen, p.geometry.coordinates, { units: 'meters' }) }))
    .filter(c => c.lineal <= RADIO_CANDIDATOS_M)
    .sort((a, b) => a.lineal - b.lineal)
    .slice(0, MAX_CANDIDATOS);
}

async function pedirRutaORS(origen, destino, signal) {
  const resp = await fetch(ORS_URL, {
    method: 'POST',
    signal,
    headers: { 'Authorization': ORS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify({ coordinates: [origen, destino], instructions: true, language: 'es', units: 'm' }),
  });
  if (resp.status === 429) throw Object.assign(new Error('Límite de consultas de ruteo alcanzado'), { codigo: 429 });
  if (!resp.ok) throw Object.assign(new Error(`Ruteo no disponible (HTTP ${resp.status})`), { codigo: resp.status });
  const json = await resp.json();
  const f = json.features?.[0];
  if (!f) throw new Error('El servicio no devolvió ruta');
  return f;
}

// Recorre la ruta y mide: metros dentro del área, cuántas veces vuelve a entrar,
// y qué fracción de la ruta va sobre vías de evacuación oficiales.
export function analizarRuta(coords) {
  let metrosDentro = 0, metrosTotales = 0, reentradas = 0, metrosEnVia = 0;
  let prevDentro = dentroDeArea(coords[0]);
  let yaSalio = !prevDentro;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const d = turf.distance(a, b, { units: 'meters' });
    const medio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dentro = dentroDeArea(b);
    if (prevDentro || dentro) metrosDentro += d;
    if (!prevDentro && dentro && yaSalio) reentradas++;
    if (!dentro) yaSalio = true;
    if (vias.length && cercaDeVia(medio)) metrosEnVia += d;
    metrosTotales += d;
    prevDentro = dentro;
  }
  return { metrosDentro, metrosTotales, reentradas, fraccionVias: metrosTotales ? metrosEnVia / metrosTotales : 0 };
}

function cercaDeVia(lngLat) {
  const pt = turf.point(lngLat);
  for (const v of vias) {
    const [minX, minY, maxX, maxY] = v.bbox || (v.bbox = turf.bbox(v));
    const m = 0.0003; // ~30 m de margen para descartar rápido
    if (lngLat[0] < minX - m || lngLat[0] > maxX + m || lngLat[1] < minY - m || lngLat[1] > maxY + m) continue;
    if (turf.pointToLineDistance(pt, v, { units: 'meters' }) <= TOLERANCIA_VIA_M) return true;
  }
  return false;
}

function claveCache([lng, lat]) { return `${lng.toFixed(4)},${lat.toFixed(4)}`; } // ~10 m

/**
 * Calcula la ruta de evacuación desde `origen` ([lng, lat]).
 * @returns {Promise<{tipo:'ruta'|'recta'|'sin_candidatos', ...}>}
 */
export async function calcularRuta(origen, { signal } = {}) {
  const k = claveCache(origen);
  if (cache.has(k)) return cache.get(k);

  const cands = candidatos(origen);
  if (!cands.length) {
    return { tipo: 'sin_candidatos', aviso: 'No hay puntos de encuentro a menos de 3 km. Dirígete a zona alta, lejos de la costa.' };
  }

  let resultado = null, aviso = null;
  if (hayClaveORS()) {
    try {
      const rutas = await Promise.all(cands.map(async c => {
        try {
          const f = await pedirRutaORS(origen, c.punto.geometry.coordinates, signal);
          const analisis = analizarRuta(f.geometry.coordinates);
          return { ...c, ruta: f, analisis, resumen: f.properties.summary || {} };
        } catch (e) { if (e.name === 'AbortError' || e.codigo === 429) throw e; return null; }
      }));
      const validas = rutas.filter(r => r && r.analisis.reentradas === 0);
      if (validas.length) {
        validas.sort((a, b) => (a.analisis.metrosDentro - b.analisis.metrosDentro) || (a.resumen.duration - b.resumen.duration));
        const g = validas[0];
        resultado = {
          tipo: 'ruta', destino: g.punto, geometria: g.ruta.geometry,
          distancia: g.resumen.distance, duracion: g.resumen.duration,
          metrosDentro: g.analisis.metrosDentro, fraccionVias: g.analisis.fraccionVias,
          pasos: g.ruta.properties.segments?.[0]?.steps || [],
          descartadas: rutas.filter(r => r && r.analisis.reentradas > 0).length,
        };
      } else if (rutas.some(Boolean)) {
        aviso = 'Todas las rutas calculadas vuelven a entrar a la zona de inundación. Se muestra la dirección al punto más cercano.';
      } else {
        aviso = 'No se pudo calcular la ruta por calles.';
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      aviso = e.codigo === 429 ? 'Servicio de rutas saturado.' : 'Sin conexión al servicio de rutas.';
    }
  } else {
    aviso = 'Ruteo por calles no configurado (falta la clave de OpenRouteService).';
  }

  if (!resultado) {
    const c = cands[0];
    resultado = {
      tipo: 'recta', destino: c.punto,
      geometria: { type: 'LineString', coordinates: [origen, c.punto.geometry.coordinates] },
      distancia: c.lineal, duracion: c.lineal / VELOCIDAD_PIE,
      rumbo: (turf.bearing(origen, c.punto.geometry.coordinates) + 360) % 360,
      aviso: `${aviso} Sigue la dirección de la línea punteada hacia el punto de encuentro.`,
    };
  }
  cache.set(k, resultado);
  return resultado;
}

export function nombreDestino(p) {
  const pr = p?.properties || {};
  return pr.nombre_pe?.trim() || `Punto de encuentro ${pr.name || ''}`.trim();
}

export function rumboATexto(grados) {
  const dirs = ['norte', 'nororiente', 'oriente', 'suroriente', 'sur', 'surponiente', 'poniente', 'norponiente'];
  return dirs[Math.round(grados / 45) % 8];
}
