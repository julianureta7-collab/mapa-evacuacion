// Diagnóstico de exposición: ¿esta persona tiene que moverse o no?
// Todo se calcula en el dispositivo con Turf; la ubicación nunca sale del teléfono.

export const UMBRAL_LIMITE_M = 100;   // "cerca del límite"
export const UMBRAL_PRECISION_M = 50; // sobre esto se advierte la imprecisión del GPS

let areas = [];   // [{ poligono, segmentos, comuna }]

// Proyección local equirectangular: a escala de una ciudad el error es < 0,5 %,
// y permite medir distancia a miles de segmentos en ~1 ms (Turf tardaba ~50 ms).
const R = 6371008.8;
let lat0 = 0, kx = 1;
const aXY = ([lng, lat]) => [lng * kx, lat * (Math.PI / 180) * R];

// Se llama una vez por escenario: prepara polígonos y sus bordes como segmentos.
export function prepararAreas(areaFC) {
  const feats = (areaFC?.features || []).filter(f => f.geometry && /Polygon/.test(f.geometry.type));
  if (feats.length) {
    const [, s, , n] = turf.bbox({ type: 'FeatureCollection', features: feats });
    lat0 = (s + n) / 2;
    kx = (Math.PI / 180) * R * Math.cos(lat0 * Math.PI / 180);
  }
  areas = feats.map(f => {
    const anillos = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const segs = [];
    for (const anillo of anillos) {
      for (let i = 0; i < anillo.length - 1; i++) {
        const [x1, y1] = aXY(anillo[i]), [x2, y2] = aXY(anillo[i + 1]);
        segs.push(x1, y1, x2, y2);
      }
    }
    return { poligono: f, segmentos: new Float64Array(segs), comuna: f.properties?.comuna || f.properties?.sector || '' };
  });
  return areas.length;
}

function distanciaAlBorde([px, py], seg) {
  let min2 = Infinity;
  for (let i = 0; i < seg.length; i += 4) {
    const x1 = seg[i], y1 = seg[i + 1], dx = seg[i + 2] - x1, dy = seg[i + 3] - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
    const d2 = ex * ex + ey * ey;
    if (d2 < min2) min2 = d2;
  }
  return Math.sqrt(min2);
}

/**
 * @param {[number, number]} lngLat  coordenadas [lng, lat]
 * @param {number|null} precision    margen de error del GPS en metros (null en simulación)
 * @returns {{estado, dentro, distanciaBorde, comuna, advertencias: string[]}}
 */
export function diagnosticar(lngLat, precision = null) {
  if (!lngLat) return { estado: 'sin_ubicacion', advertencias: [] };
  const pt = turf.point(lngLat);

  let dentro = false, comuna = '', distanciaBorde = Infinity;
  for (const a of areas) {
    const d = distanciaAlBorde(aXY(lngLat), a.segmentos);
    if (turf.booleanPointInPolygon(pt, a.poligono)) { dentro = true; comuna = a.comuna; distanciaBorde = d; break; }
    if (d < distanciaBorde) { distanciaBorde = d; comuna = a.comuna; }
  }

  const advertencias = [];
  if (precision != null && precision > UMBRAL_PRECISION_M)
    advertencias.push(`Tu ubicación tiene un margen de error de ±${Math.round(precision)} m.`);

  let estado;
  if (dentro) {
    estado = 'evacuar';
    if (distanciaBorde < UMBRAL_LIMITE_M) advertencias.push(`Estás a ${Math.round(distanciaBorde)} m del límite de la zona segura.`);
  } else {
    // Si el error del GPS es mayor que la distancia al borde, no sabemos de qué lado estamos
    const margen = Math.max(UMBRAL_LIMITE_M, precision ?? 0);
    estado = distanciaBorde < margen ? 'limite' : 'seguro';
  }
  return { estado, dentro, distanciaBorde, comuna, advertencias };
}

export const TEXTOS = {
  evacuar: { titulo: 'Debes evacuar', texto: 'Estás dentro del área de inundación. Dirígete a pie a la zona segura.', clase: 'peligro' },
  limite: { titulo: 'Cerca del límite', texto: 'Estás muy cerca del borde del área de inundación. Evacúa de todas formas hacia zona alta.', clase: 'alerta' },
  seguro: { titulo: 'Estás en zona segura', texto: 'Estás fuera del área de inundación. Permanece donde estás y sigue las instrucciones de la autoridad.', clase: 'seguro' },
  sin_ubicacion: { titulo: 'Sin ubicación', texto: 'No pudimos obtener tu ubicación. Mueve el pin en el mapa hasta donde estás.', clase: 'neutro' },
};
