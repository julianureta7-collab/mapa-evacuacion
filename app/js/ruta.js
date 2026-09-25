// Etapa 3: elegir el punto de encuentro y trazar la ruta a pie.
//
// MÉTODO PRINCIPAL — vía oficial SENAPRED:
//  Las vías de evacuación publicadas están digitalizadas en el sentido de la evacuación
//  (las 74 de Viña empiezan dentro del área y 59 terminan fuera). Son corredores sueltos,
//  no una red. Entonces: se busca la vía que conviene tomar, se traza el acercamiento
//  hasta ella y desde ahí se sigue la vía oficial tal cual, hasta su final.
//
// MÉTODO DE RESPALDO — ruta por calles (ORS), si no hay una vía oficial cerca:
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

const RADIO_VIA_M = 500;         // máximo acercamiento a pie hasta una vía oficial
const ACERCAMIENTO_RECTO_M = 60; // bajo esto, el acercamiento se dibuja recto sin pedir ruta
const FINAL_A_PUNTO_M = 150;     // si la vía termina así de cerca de un punto de encuentro, se une

let areas = [];                  // Features de polígono
let puntos = [];                 // Features de punto de encuentro
let vias = [];                   // Features de línea (vías de evacuación oficiales)
const cache = new Map();         // origen redondeado → resultado

export const hayClaveORS = () => !!ORS_API_KEY && ORS_API_KEY !== 'PEGAR_AQUI_LA_CLAVE';

export function prepararRutas({ area_evacuar, puntos_encuentro, vias_evacuacion }) {
  areas = (area_evacuar?.features || []).filter(f => f.geometry);
  puntos = (puntos_encuentro?.features || []).filter(f => f.geometry);
  vias = (vias_evacuacion?.features || []).filter(f => f.geometry && f.geometry.type === 'LineString');
  cache.clear();
}

// ---- Geometría plana local (rápida, precisa a escala de ciudad) ----
const R_T = 6371008.8;
function proyector(lat0) {
  const kx = (Math.PI / 180) * R_T * Math.cos(lat0 * Math.PI / 180), ky = (Math.PI / 180) * R_T;
  return ([lng, lat]) => [lng * kx, lat * ky];
}
const distM = (a, b) => turf.distance(a, b, { units: 'meters' });
function largo(coords) { let L = 0; for (let i = 1; i < coords.length; i++) L += distM(coords[i - 1], coords[i]); return L; }

// Punto más cercano de una polilínea: índice del segmento, fracción t y distancia.
function proyectarEnLinea(origen, coords) {
  const P = proyector(origen[1]);
  const [px, py] = P(origen);
  let mejor = { d2: Infinity, i: 0, t: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = P(coords[i]), [x2, y2] = P(coords[i + 1]);
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = x1 + t * dx - px, ey = y1 + t * dy - py, d2 = ex * ex + ey * ey;
    if (d2 < mejor.d2) mejor = { d2, i, t };
  }
  const a = coords[mejor.i], b = coords[mejor.i + 1];
  const punto = [a[0] + (b[0] - a[0]) * mejor.t, a[1] + (b[1] - a[1]) * mejor.t];
  return { punto, i: mejor.i, distancia: Math.sqrt(mejor.d2) };
}

function puntoMasCercanoFuera(lngLat, maxM) {
  let mejor = null;
  for (const p of puntos) {
    const d = distM(lngLat, p.geometry.coordinates);
    if (d <= maxM && (!mejor || d < mejor.d) && !dentroDeArea(p.geometry.coordinates)) mejor = { p, d };
  }
  return mejor;
}

// Elige la vía oficial a tomar. Costo = acercamiento (con factor de desvío por cuadras)
// + lo que queda de vía desde el punto de entrada hasta su final.
function elegirViaOficial(origen) {
  const opciones = [];
  for (const v of vias) {
    const c = v.geometry.coordinates;
    const pr = proyectarEnLinea(origen, c);
    if (pr.distancia > RADIO_VIA_M) continue;
    const resto = [pr.punto, ...c.slice(pr.i + 1)];
    const fin = resto[resto.length - 1];
    const finSeguro = !dentroDeArea(fin);
    const puntoFinal = puntoMasCercanoFuera(fin, FINAL_A_PUNTO_M);
    if (!finSeguro && !puntoFinal) continue;           // la vía no saca de la zona
    const largoResto = largo(resto);
    if (largoResto < 5 && dentroDeArea(origen)) continue;  // ya al final de una vía pero aún dentro
    opciones.push({ via: v, entrada: pr.punto, acercamiento: pr.distancia, resto, largoResto, puntoFinal,
      costo: pr.distancia * 1.4 + largoResto });
  }
  opciones.sort((a, b) => a.costo - b.costo);
  return opciones[0] || null;
}

async function rutaPorViaOficial(origen, signal) {
  const op = elegirViaOficial(origen);
  if (!op) return null;
  // 1) Acercamiento hasta la vía
  let acercamiento = [origen, op.entrada], acercamientoPorCalles = false, aviso = null;
  if (op.acercamiento > ACERCAMIENTO_RECTO_M && hayClaveORS()) {
    try {
      const f = await pedirRutaORS(origen, op.entrada, signal);
      acercamiento = f.geometry.coordinates; acercamientoPorCalles = true;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      aviso = 'El tramo hasta la vía oficial se muestra en línea recta (sin servicio de rutas).';
    }
  }
  // 2) Vía oficial desde la entrada hasta su final; 3) unión al punto de encuentro si está cerca
  const oficial = op.resto;
  const fin = oficial[oficial.length - 1];
  const final = op.puntoFinal && op.puntoFinal.d > 5 ? [fin, op.puntoFinal.p.geometry.coordinates] : null;
  const todo = [...acercamiento, ...oficial.slice(1), ...(final ? final.slice(1) : [])];
  const analisis = analizarRuta(todo);
  if (analisis.reentradas > 0) return null;           // no debería pasar, pero se valida igual
  const distancia = largo(acercamiento) + op.largoResto + (final ? largo(final) : 0);
  return {
    tipo: 'oficial',
    via: op.via,
    destino: op.puntoFinal?.p || null,
    geometria: { type: 'LineString', coordinates: todo },
    tramos: [
      { tipo: acercamientoPorCalles ? 'acercamiento' : 'acercamiento_recto', coords: acercamiento },
      { tipo: 'oficial', coords: oficial },
      ...(final ? [{ tipo: 'final', coords: final }] : []),
    ],
    distancia, duracion: distancia / VELOCIDAD_PIE,
    acercamientoM: largo(acercamiento), oficialM: op.largoResto,
    metrosDentro: analisis.metrosDentro,
    aviso,
  };
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

  // 1) Método principal: seguir una vía de evacuación oficial
  try {
    const oficial = await rutaPorViaOficial(origen, signal);
    if (oficial) { cache.set(k, oficial); return oficial; }
  } catch (e) { if (e.name === 'AbortError') throw e; }

  // 2) Respaldo: ruta por calles a un punto de encuentro
  const cands = candidatos(origen);
  if (!cands.length) {
    return { tipo: 'sin_candidatos', aviso: 'No hay vías ni puntos de encuentro cercanos. Dirígete a zona alta, lejos de la costa.' };
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

export function nombreVia(v) {
  const pr = v?.properties || {};
  return pr.nombre_ve?.trim() || pr.name || 'vía de evacuación';
}

export function nombreDestino(p) {
  const pr = p?.properties || {};
  return pr.nombre_pe?.trim() || `Punto de encuentro ${pr.name || ''}`.trim();
}

export function rumboATexto(grados) {
  const dirs = ['norte', 'nororiente', 'oriente', 'suroriente', 'sur', 'surponiente', 'poniente', 'norponiente'];
  return dirs[Math.round(grados / 45) % 8];
}
