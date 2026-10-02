// Edge Function "rutas": intermediario hacia OpenRouteService.
// La clave de ORS vive SOLO aquí, como secreto de Supabase (ORS_API_KEY). Nunca en el repo ni en el sitio.
//
// Despliegue (panel de Supabase): Edge Functions → Deploy a new function → Via Editor → nombre "rutas"
// → pegar este archivo → Deploy. Luego desactivar "Enforce JWT verification" en la función y crear el
// secreto ORS_API_KEY en Edge Functions → Secrets.

const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson';

// Solo se aceptan pedidos desde la app publicada y desde el servidor local de desarrollo.
const ORIGENES = [
  'https://julianureta7-collab.github.io',
  'http://localhost:8080',
];

const MAX_DISTANCIA_KM = 5;   // una ruta a pie de evacuación nunca debería ser más larga

function distanciaKm([lng1, lat1]: number[], [lng2, lat2]: number[]) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const MAX_VERTICES_EVITAR = 2000;
// MultiPolygon GeoJSON con todos sus vértices en Chile y un tamaño razonable.
function poligonosValidos(g: any) {
  if (!g || g.type !== 'MultiPolygon' || !Array.isArray(g.coordinates)) return false;
  let n = 0;
  for (const poli of g.coordinates) {
    if (!Array.isArray(poli)) return false;
    for (const anillo of poli) {
      if (!Array.isArray(anillo) || anillo.length < 4) return false;
      for (const p of anillo) { if (!enChile(p)) return false; n++; }
    }
  }
  return n <= MAX_VERTICES_EVITAR;
}

const enChile = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
  && p[0] > -76 && p[0] < -66 && p[1] > -56 && p[1] < -17;

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES.includes(origen);
  const cors = {
    'Access-Control-Allow-Origin': permitido ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const responder = (status: number, cuerpo: unknown) =>
    new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' });
  if (!permitido) return responder(403, { error: 'Origen no permitido' });

  const clave = Deno.env.get('ORS_API_KEY');
  if (!clave) return responder(500, { error: 'Falta el secreto ORS_API_KEY en Supabase' });

  let coords: unknown, evitar: unknown;
  try { const cuerpo = await req.json(); coords = cuerpo?.coordinates; evitar = cuerpo?.evitar; }
  catch { return responder(400, { error: 'JSON inválido' }); }
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(enChile)) {
    return responder(400, { error: 'Se esperan 2 coordenadas [lng, lat] dentro de Chile' });
  }
  if (distanciaKm(coords[0] as number[], coords[1] as number[]) > MAX_DISTANCIA_KM) {
    return responder(400, { error: `Distancia mayor a ${MAX_DISTANCIA_KM} km` });
  }

  // Opcional: polígonos a esquivar (tramos bloqueados y áreas de peligro marcadas por un operador).
  if (evitar != null && !poligonosValidos(evitar)) {
    return responder(400, { error: 'Polígonos a evitar inválidos (MultiPolygon en Chile, máx. 2000 vértices)' });
  }

  const r = await fetch(ORS_URL, {
    method: 'POST',
    headers: { 'Authorization': clave, 'Content-Type': 'application/json', 'Accept': 'application/geo+json' },
    body: JSON.stringify({ coordinates: coords, instructions: true, language: 'es', units: 'm',
      ...(evitar ? { options: { avoid_polygons: evitar } } : {}) }),
  });
  return responder(r.status, await r.text());
});
