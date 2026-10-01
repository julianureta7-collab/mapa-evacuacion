// Etapa 3: elegir el punto de encuentro y trazar la ruta a pie.
//
// MÉTODO PRINCIPAL — seguir una ruta oficial (rol 'ruta'; hoy, vías SENAPRED):
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
//  4. Entre las válidas, gana la que te saca antes del área de peligro (menos metros
//     dentro del área); a igualdad, la más corta en tiempo.
//  5. Si ORS falla (sin clave, sin red, límite 429): dirección en línea recta al más cercano.

import { ORS_API_KEY } from './claves.js?v=10';

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

let nombreArea = 'área de peligro';

// Recibe las capas agrupadas por rol (spec §3): area_peligro, ruta, punto_encuentro.
export function prepararRutas(porRol, { area = 'área de peligro' } = {}) {
  areas = (porRol.area_peligro?.features || []).filter(f => f.geometry && /Polygon/.test(f.geometry.type));
  puntos = (porRol.punto_encuentro?.features || []).filter(f => f.geometry && f.geometry.type === 'Point');
  vias = (porRol.ruta?.features || []).filter(f => f.geometry && f.geometry.type === 'LineString');
  nombreArea = area;
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

// Largo desde cada vértice hasta el final de la vía (para costear entradas en cualquier punto).
function largosHastaFinal(c) {
  const S = new Array(c.length).fill(0);
  for (let i = c.length - 2; i >= 0; i--) S[i] = S[i + 1] + distM(c[i], c[i + 1]);
  return S;
}

// Opciones de vía oficial, ordenadas por costo estimado. Para cada vía se elige el MEJOR punto de
// entrada (cualquier vértice o la proyección), no solo el más cercano: así la ruta no camina hacia
// el mar para luego devolverse por la vía. Costo = acercamiento × 1,4 (desvío por cuadras) + resto.
const FACTOR_DESVIO = 1.4;
const MAX_VIAS_A_EVALUAR = 3;
function opcionesViaOficial(origen) {
  const opciones = [];
  for (const v of vias) {
    const c = v.geometry.coordinates;
    const pr = proyectarEnLinea(origen, c);
    if (pr.distancia > RADIO_VIA_M) continue;
    const fin = c[c.length - 1];
    const puntoFinal = puntoMasCercanoFuera(fin, FINAL_A_PUNTO_M);
    if (dentroDeArea(fin) && !puntoFinal) continue;             // la vía no saca de la zona
    const S = v._largos || (v._largos = largosHastaFinal(c));
    // Candidata 1: la proyección; candidatas 2..n: cada vértice (salvo el final)
    let mejor = { entrada: pr.punto, i: pr.i, acercamiento: pr.distancia, resto: S[pr.i + 1] + distM(pr.punto, c[pr.i + 1]) };
    mejor.costo = mejor.acercamiento * FACTOR_DESVIO + mejor.resto;
    for (let i = 0; i < c.length - 1; i++) {
      const d = distM(origen, c[i]);
      if (d > RADIO_VIA_M) continue;
      const costo = d * FACTOR_DESVIO + S[i];
      if (costo < mejor.costo) mejor = { entrada: c[i], i: i - 1, acercamiento: d, resto: S[i], costo, vertice: true };
    }
    const resto = mejor.vertice ? c.slice(mejor.i + 1) : [mejor.entrada, ...c.slice(mejor.i + 1)];
    if (mejor.resto < 5 && dentroDeArea(origen)) continue;     // ya al final de una vía pero aún dentro
    opciones.push({ via: v, entrada: mejor.entrada, acercamiento: mejor.acercamiento, resto, largoResto: mejor.resto, puntoFinal, costo: mejor.costo });
  }
  opciones.sort((a, b) => a.costo - b.costo);
  return opciones.slice(0, MAX_VIAS_A_EVALUAR);
}

// Une el camino por calles con la vía: en cuanto el camino pasa a menos de 20 m de la vía,
// la persona se "sube" a ella y la sigue hasta el final. Evita retrocesos y saltos.
const TOLERANCIA_UNION_M = 20;
function unirConVia(camino, viaCoords) {
  for (let k = 0; k < camino.length; k++) {
    const pr = proyectarEnLinea(camino[k], viaCoords);
    if (pr.distancia <= TOLERANCIA_UNION_M) {
      return { acercamiento: [...camino.slice(0, k + 1), pr.punto], oficial: [pr.punto, ...viaCoords.slice(pr.i + 1)] };
    }
  }
  return null;
}

async function armarOpcion(origen, op, signal) {
  let camino = [origen, op.entrada], porCalles = false, fallo = false;
  if (op.acercamiento > ACERCAMIENTO_RECTO_M && hayClaveORS()) {
    try {
      camino = (await pedirRutaORS(origen, op.entrada, signal)).geometry.coordinates;
      porCalles = true;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      fallo = true;
    }
  }
  const viaCoords = op.via.geometry.coordinates;
  const unido = (porCalles && unirConVia(camino, viaCoords)) || { acercamiento: [...camino, op.entrada], oficial: op.resto };
  // quitar el punto duplicado si el camino ya terminaba en la entrada
  const ac = unido.acercamiento.filter((p, i, arr) => i === 0 || distM(p, arr[i - 1]) > 0.5);
  const oficial = unido.oficial;
  const fin = oficial[oficial.length - 1];
  const final = op.puntoFinal && distM(fin, op.puntoFinal.p.geometry.coordinates) > 5 ? [fin, op.puntoFinal.p.geometry.coordinates] : null;
  const todo = [...ac, ...oficial.slice(1), ...(final ? final.slice(1) : [])];
  const analisis = analizarRuta(todo);
  if (analisis.reentradas > 0) return null;
  const acercamientoM = largo(ac), oficialM = largo(oficial);
  const distancia = acercamientoM + oficialM + (final ? largo(final) : 0);
  return {
    tipo: 'oficial',
    via: op.via,
    destino: op.puntoFinal?.p || null,
    geometria: { type: 'LineString', coordinates: todo },
    tramos: [
      { tipo: porCalles ? 'acercamiento' : 'acercamiento_recto', coords: ac },
      { tipo: 'oficial', coords: oficial },
      ...(final ? [{ tipo: 'final', coords: final }] : []),
    ],
    distancia, duracion: distancia / VELOCIDAD_PIE,
    acercamientoM, oficialM,
    metrosDentro: analisis.metrosDentro,
    aviso: fallo ? `El tramo hasta la vía oficial se muestra en línea recta: ${ultimoErrorORS?.motivo || 'sin servicio de rutas'}.` : null,
  };
}

// Evalúa las mejores vías candidatas con el camino real por calles y elige la más corta a pie.
async function rutaPorViaOficial(origen, signal) {
  const ops = opcionesViaOficial(origen);
  if (!ops.length) return null;
  // Ramificación y poda: se consulta ORS de a una opción. Una opción solo vale la pena si su cota
  // inferior (acercamiento en línea recta + resto de vía) puede ganarle a la mejor ya calculada.
  // Resultado igual de óptimo, con 1 consulta en la mayoría de los casos (antes siempre 3).
  const cota = (op) => op.acercamiento + op.largoResto;
  ops.sort((a, b) => cota(a) - cota(b));
  let mejor = null;
  for (const op of ops) {
    if (mejor && cota(op) >= mejor.distancia) break;
    const r = await armarOpcion(origen, op, signal);
    if (r && (!mejor || r.distancia < mejor.distancia)) mejor = r;
  }
  return mejor;
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

// Si ORS rechaza la clave (401/403) o la cuota (429), no seguir consultando por un rato:
// cada consulta fallida gasta cuota y la app igual muestra el respaldo.
const PAUSA_TRAS_RECHAZO_MS = 60000;
let pausaHasta = 0;
let ultimoErrorORS = null;
export const errorORS = () => ultimoErrorORS;

const MOTIVOS_ORS = {
  401: 'el servicio de rutas rechazó la clave (cuota agotada o clave desactivada)',
  403: 'clave de rutas inválida',
  429: 'se alcanzó el límite de consultas de rutas por minuto',
};

async function pedirRutaORS(origen, destino, signal) {
  if (Date.now() < pausaHasta) throw Object.assign(new Error(ultimoErrorORS?.motivo || 'servicio de rutas en pausa'), { codigo: ultimoErrorORS?.codigo || 0 });
  const resp = await fetch(ORS_URL, {
    method: 'POST',
    signal,
    headers: { 'Authorization': ORS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify({ coordinates: [origen, destino], instructions: true, language: 'es', units: 'm' }),
  });
  if (!resp.ok) {
    let detalle = '';
    try { const j = await resp.json(); detalle = j?.error?.message || j?.error || ''; } catch { /* sin cuerpo */ }
    const motivo = MOTIVOS_ORS[resp.status] || `servicio de rutas no disponible (HTTP ${resp.status})`;
    ultimoErrorORS = { codigo: resp.status, motivo, detalle: String(detalle), cuando: new Date() };
    console.warn('[rutas] OpenRouteService respondió', resp.status, detalle);
    if ([401, 403, 429].includes(resp.status)) pausaHasta = Date.now() + PAUSA_TRAS_RECHAZO_MS;
    throw Object.assign(new Error(motivo), { codigo: resp.status });
  }
  ultimoErrorORS = null;
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
        } catch (e) { if (e.name === 'AbortError' || [401, 403, 429].includes(e.codigo)) throw e; return null; }
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
        aviso = `Todas las rutas calculadas vuelven a entrar a la ${nombreArea}. Se muestra la dirección al punto más cercano.`;
      } else {
        aviso = 'No se pudo calcular la ruta por calles.';
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      aviso = ultimoErrorORS?.motivo ? `Sin ruta por calles: ${ultimoErrorORS.motivo}.` : 'Sin conexión al servicio de rutas.';
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

// "SENAPRED", "Operador", etc. según la procedencia marcada al cargar la capa.
export function organismoDe(f) {
  const pr = f?.properties || {};
  if (pr._procedencia === 'operador') return 'operador';
  return pr._fuente?.organismo || 'oficial';
}

export function nombreDestino(p) {
  const pr = p?.properties || {};
  return pr.nombre_pe?.trim() || `Punto de encuentro ${pr.name || ''}`.trim();
}

export function rumboATexto(grados) {
  const dirs = ['norte', 'nororiente', 'oriente', 'suroriente', 'sur', 'surponiente', 'poniente', 'norponiente'];
  return dirs[Math.round(grados / 45) % 8];
}
