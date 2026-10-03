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

import { ORS_API_KEY, SUPABASE_URL, SUPABASE_KEY } from './claves.js?v=19';

// HeiGIT apagó api.openrouteservice.org el 28-sep-2026 (desde el 27-ago solo daba 10 % de cuota y luego 403).
// Dirección vigente: api.heigit.org/<servicio>/<versión>/… con la MISMA clave, enviada en el encabezado Authorization.
// https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson';
const RADIO_CANDIDATOS_M = 3000;
const MAX_CANDIDATOS = 3;
const TOLERANCIA_VIA_M = 20;     // un tramo "sigue la vía oficial" si está a menos de esto
const VELOCIDAD_PIE = 1.2;       // m/s, para estimar tiempo en línea recta

const RADIO_VIA_M = 500;         // máximo acercamiento a pie hasta una vía oficial
const ACERCAMIENTO_RECTO_M = 60; // bajo esto, el acercamiento se dibuja recto sin pedir ruta
const FINAL_A_PUNTO_M = 150;     // si la vía termina así de cerca de un punto de encuentro, se une

let areas = [];                  // Features de polígono (propias + de otras alertas)
let areasExtra = [];             // solo las de otras alertas activas de la zona (spec §5.3)
let puntos = [];                 // Features de punto de encuentro
let vias = [];                   // Features de línea (vías de evacuación oficiales)
let viasOperador = [];           // rutas dibujadas por operadores (prioridad 1, spec §6)
let bloqueos = [];               // tramos bloqueados por operadores: ninguna ruta los puede cruzar
const cache = new Map();         // origen redondeado → resultado

// Las rutas por calles se piden a la Edge Function "rutas" de Supabase, que guarda la clave de ORS
// como secreto. Si en desarrollo local hay una clave en claves.js, se usa directo.
const ORS_PROXY = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/rutas` : null;
const usarDirecto = () => !!ORS_API_KEY && ORS_API_KEY !== 'PEGAR_AQUI_LA_CLAVE';
export const hayClaveORS = () => usarDirecto() || !!ORS_PROXY;

let nombreArea = 'área de peligro';

// Recibe las capas agrupadas por rol (spec §3): area_peligro, ruta, punto_encuentro.
// areasExtra: áreas de peligro de otras alertas activas en la zona (spec §5.3). Cuentan igual que las
// propias para validar: ninguna ruta puede volver a entrar a ellas ni terminar dentro.
export function prepararRutas(porRol, { area = 'área de peligro', areasExtra: extra = [] } = {}) {
  const esPoligono = f => f.geometry && /Polygon/.test(f.geometry.type);
  areasExtra = extra.filter(esPoligono);
  areas = [...(porRol.area_peligro?.features || []).filter(esPoligono), ...areasExtra];
  puntos = (porRol.punto_encuentro?.features || []).filter(f => f.geometry && f.geometry.type === 'Point');
  vias = (porRol.ruta?.features || []).filter(f => f.geometry && f.geometry.type === 'LineString');
  viasOperador = (porRol.ruta_operador?.features || []).filter(f => f.geometry && f.geometry.type === 'LineString');
  bloqueos = (porRol.bloqueo?.features || []).filter(f => f.geometry && /LineString|Polygon/.test(f.geometry.type));
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

// ¿Sirve este punto de encuentro como destino? Debe estar fuera de toda área de peligro, salvo que la
// autoridad lo designe dentro del área (catálogo: destino_aunque_dentro). Nunca dentro del área de OTRA alerta.
function destinoValido(p) {
  const c = p.geometry.coordinates;
  if (areasExtra.some(a => turf.booleanPointInPolygon(c, a))) return false;
  return p.properties?._destinoDentro || !dentroDeArea(c);
}

function puntoMasCercanoFuera(lngLat, maxM) {
  let mejor = null;
  for (const p of puntos) {
    const d = distM(lngLat, p.geometry.coordinates);
    if (d <= maxM && (!mejor || d < mejor.d) && destinoValido(p)) mejor = { p, d };
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
function opcionesViaOficial(origen, lista = vias) {
  const opciones = [];
  for (const v of lista) {
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
  if (analisis.reentradas > 0 || analisis.cruzaBloqueo) return null;
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
    terminaDentro: dentroDeArea(todo[todo.length - 1]),   // destino oficial dentro del área (p. ej. un PET)
    aviso: fallo ? `El tramo hasta la vía oficial se muestra en línea recta: ${ultimoErrorORS?.motivo || 'sin servicio de rutas'}.` : null,
  };
}

// Evalúa las mejores vías candidatas con el camino real por calles y elige la más corta a pie.
async function rutaPorViaOficial(origen, signal, lista = vias) {
  const ops = opcionesViaOficial(origen, lista);
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
    .filter(destinoValido)
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
  400: 'pedido de ruta inválido',
  404: 'falta desplegar la función "rutas" en Supabase',
  500: 'falta configurar la clave de rutas en Supabase',
  401: 'el servicio de rutas rechazó la clave (o la función "rutas" tiene activada la verificación JWT)',
  403: 'clave de rutas inválida',
  429: 'se alcanzó el límite de consultas de rutas por minuto',
};

// Polígonos que ORS debe esquivar (spec §6): tramos bloqueados (con un margen) y áreas de peligro de
// otras alertas, salvo las que contienen el origen o el destino (si no, ORS no encuentra ruta).
// NO se incluye el área de la amenaza principal: la persona suele estar dentro.
const MARGEN_BLOQUEO_M = 8;
function poligonosAEvitar(origen, destino) {
  const polis = [];
  for (const b of bloqueos) {
    const g = /Polygon/.test(b.geometry.type) ? b : turf.buffer(b, MARGEN_BLOQUEO_M, { units: 'meters', steps: 4 });
    if (g?.geometry) polis.push(g);
  }
  for (const a of areasExtra) polis.push(a);
  const coords = [];
  for (const p of polis) {
    if (turf.booleanPointInPolygon(origen, p) || turf.booleanPointInPolygon(destino, p)) continue;
    if (p.geometry.type === 'Polygon') coords.push(p.geometry.coordinates);
    else coords.push(...p.geometry.coordinates);
  }
  return coords.length ? { type: 'MultiPolygon', coordinates: coords } : null;
}

async function pedirRutaORS(origen, destino, signal, { evitar = true } = {}) {
  if (Date.now() < pausaHasta) throw Object.assign(new Error(ultimoErrorORS?.motivo || 'servicio de rutas en pausa'), { codigo: ultimoErrorORS?.codigo || 0 });
  const avoid = evitar ? poligonosAEvitar(origen, destino) : null;
  let resp;
  try {
    resp = usarDirecto()
      ? await fetch(ORS_URL, {
          method: 'POST', signal,
          headers: { 'Authorization': ORS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
          body: JSON.stringify({ coordinates: [origen, destino], instructions: true, language: 'es', units: 'm',
            ...(avoid ? { options: { avoid_polygons: avoid } } : {}) }),
        })
      : await fetch(ORS_PROXY, {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({ coordinates: [origen, destino], ...(avoid ? { evitar: avoid } : {}) }),
        });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // Cuando ORS rechaza la clave (403) o la cuota, su respuesta NO trae cabeceras CORS:
    // el navegador la bloquea y aquí solo llega un "Failed to fetch". Se trata igual que un rechazo.
    ultimoErrorORS = { codigo: 0, motivo: usarDirecto() ? 'el servicio de rutas no respondió (clave rechazada, cuota agotada o sin internet)' : "no se pudo contactar la función 'rutas' de Supabase (revisar que esté desplegada y sin verificación JWT)", cuando: new Date() };
    console.warn('[rutas] OpenRouteService no respondió o bloqueó la consulta (revisar clave y cuota):', e.message);
    pausaHasta = Date.now() + PAUSA_TRAS_RECHAZO_MS;
    throw Object.assign(new Error(ultimoErrorORS.motivo), { codigo: 0 });
  }
  if (!resp.ok) {
    let detalle = '', cuerpo = '';
    try { const j = await resp.json(); cuerpo = JSON.stringify(j); detalle = j?.error?.message || j?.error || j?.message || ''; } catch { /* sin cuerpo */ }
    // Con polígonos a esquivar, ORS puede no encontrar ruta (404/400): se reintenta sin ellos y
    // la validación común descarta la ruta si cruza un bloqueo.
    if (avoid && (resp.status === 404 || resp.status === 400)) return pedirRutaORS(origen, destino, signal, { evitar: false });
    // 404 de ORS = "no hay ruta"; 404 del gateway de Supabase = la función no está desplegada
    const sinRuta = resp.status === 404 && !/function/i.test(cuerpo);
    const motivo = sinRuta ? 'no se encontró una ruta a pie' : (MOTIVOS_ORS[resp.status] || `servicio de rutas no disponible (HTTP ${resp.status})`);
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
// La regla "sale y no vuelve a entrar" se aplica a CADA área por separado: si el área de un incendio
// está dentro del área de inundación, entrar al incendio cuenta aunque sigas dentro de la inundación.
export function analizarRuta(coords) {
  let metrosDentro = 0, metrosTotales = 0, reentradas = 0, metrosEnVia = 0;
  const est = areas.map(a => { const d = turf.booleanPointInPolygon(coords[0], a); return { a, dentro: d, yaSalio: !d }; });
  let prevDentro = est.some(e => e.dentro);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const d = turf.distance(a, b, { units: 'meters' });
    const medio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let dentro = false;
    for (const e of est) {
      const ahora = turf.booleanPointInPolygon(b, e.a);
      if (ahora && !e.dentro && e.yaSalio) reentradas++;
      if (!ahora) e.yaSalio = true;
      e.dentro = ahora;
      dentro ||= ahora;
    }
    if (prevDentro || dentro) metrosDentro += d;
    if (vias.length && cercaDeVia(medio)) metrosEnVia += d;
    metrosTotales += d;
    prevDentro = dentro;
  }
  // Áreas de OTRAS alertas donde no estás: la ruta no puede ni tocarlas (también entre vértices).
  if (areasExtra.length && coords.length > 1) {
    const linea = turf.lineString(coords);
    for (const ar of areasExtra) {
      if (!turf.booleanPointInPolygon(coords[0], ar) && turf.booleanIntersects(linea, ar)) reentradas++;
    }
  }
  const cruzaBloqueo = bloqueos.length > 0 && coords.length > 1 && bloqueos.some(b => turf.booleanIntersects(turf.lineString(coords), b));
  return { metrosDentro, metrosTotales, reentradas, cruzaBloqueo, fraccionVias: metrosTotales ? metrosEnVia / metrosTotales : 0 };
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

  // 0) Prioridad 1 (spec §6): rutas dibujadas por un operador
  if (viasOperador.length) {
    try {
      const op = await rutaPorViaOficial(origen, signal, viasOperador);
      if (op) { op.tipo = 'operador'; cache.set(k, op); return op; }
    } catch (e) { if (e.name === 'AbortError') throw e; }
  }

  // 1) Método principal: seguir una vía de evacuación oficial
  try {
    const oficial = await rutaPorViaOficial(origen, signal);
    if (oficial) { cache.set(k, oficial); return oficial; }
  } catch (e) { if (e.name === 'AbortError') throw e; }

  // 2) Respaldo: ruta por calles a un punto de encuentro
  const cands = candidatos(origen);
  if (!cands.length) {
    return { tipo: 'sin_candidatos', aviso: 'No hay vías ni puntos de encuentro cercanos.' };
  }
  let resultado = null, aviso = null;
  if (hayClaveORS()) {
    try {
      const rutas = await Promise.all(cands.map(async c => {
        try {
          const f = await pedirRutaORS(origen, c.punto.geometry.coordinates, signal);
          const analisis = analizarRuta(f.geometry.coordinates);
          return { ...c, ruta: f, analisis, resumen: f.properties.summary || {} };
        } catch (e) { if (e.name === 'AbortError' || [0, 401, 403, 429].includes(e.codigo)) throw e; return null; }
      }));
      const validas = rutas.filter(r => r && r.analisis.reentradas === 0 && !r.analisis.cruzaBloqueo);
      if (validas.length) {
        validas.sort((a, b) => (a.analisis.metrosDentro - b.analisis.metrosDentro) || (a.resumen.duration - b.resumen.duration));
        const g = validas[0];
        resultado = {
          tipo: 'ruta', destino: g.punto, geometria: g.ruta.geometry,
          distancia: g.resumen.distance, duracion: g.resumen.duration,
          metrosDentro: g.analisis.metrosDentro, fraccionVias: g.analisis.fraccionVias,
          terminaDentro: dentroDeArea(g.punto.geometry.coordinates),
          pasos: g.ruta.properties.segments?.[0]?.steps || [],
          descartadas: rutas.filter(r => r && r.analisis.reentradas > 0).length,
        };
      } else if (rutas.some(Boolean)) {
        const porBloqueo = rutas.some(r => r?.analisis.cruzaBloqueo);
        const porArea = rutas.some(r => r?.analisis.reentradas > 0);
        const motivo = [porBloqueo && 'cruzan un tramo bloqueado', porArea && `vuelven a entrar a la ${areasExtra.length ? 'zona de peligro' : nombreArea}`].filter(Boolean).join(' o ');
        aviso = `Las rutas calculadas ${motivo}. Se muestra la dirección al punto más cercano.`;
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

export const hayRutasOperador = () => viasOperador.length > 0;

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
  return pr.nombre_pe?.trim() || (pr.nombre?.trim() ? `punto de encuentro ${pr.nombre.trim()}` : '') || `Punto de encuentro ${pr.name || ''}`.trim();
}

export function rumboATexto(grados) {
  const dirs = ['norte', 'nororiente', 'oriente', 'suroriente', 'sur', 'surponiente', 'poniente', 'norponiente'];
  return dirs[Math.round(grados / 45) % 8];
}
