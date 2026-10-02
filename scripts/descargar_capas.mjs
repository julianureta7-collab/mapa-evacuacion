// Descarga capas oficiales (servicios ArcGIS de SENAPRED u otro organismo) para un escenario
// <zona>/<amenaza> y las guarda como GeoJSON estático en app/data/<zona>/<amenaza>/.
// Cada escenario declara su servicio, sus capas y su fuente (nada fijo por amenaza).
// Después hay que declarar las capas en app/data/catalogo.json (rol, nombre, fuente).
// Uso:  node scripts/descargar_capas.mjs                          (todos los escenarios)
//       node scripts/descargar_capas.mjs vina/incendio_forestal
// Requiere Node 18+ (usa fetch nativo). No tiene dependencias.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SENAPRED = 'https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services';

// bbox = [oeste, sur, este, norte] en grados (EPSG:4326)
const BBOX_VINA = [-71.60, -33.06, -71.48, -32.93];

// Clave = "<zona>/<amenaza>", igual que la carpeta de destino y los ids del catálogo.
// Por capa (opcionales):
//   campos      lista de campos a guardar (por defecto, todos)
//   where       filtro ArcGIS (por defecto '1=1'), p. ej. "volcan='Villarrica'"
//   recortar    true = recortar los polígonos al bbox (para capas nacionales con polígonos enormes)
//   generalizar tolerancia en grados para simplificar la geometría en el servidor (0.00005 ≈ 5 m)
const ESCENARIOS = {
  'vina/tsunami': {
    nombre: 'Viña del Mar',
    bbox: BBOX_VINA,
    servicio: `${SENAPRED}/Amenaza_por_Tsunami_2024/FeatureServer`,
    fuente: 'SENAPRED — Amenaza por Tsunami 2024 (IDE Chile / Geoportal)',
    ficha: 'https://geoportal.cl/geoportal/catalog/download/1dbd467c-ebaf-3c0d-b92e-1a2eb3286f55',
    publicacion: '2024-05-01',
    capas: [
      { id: 0, archivo: 'puntos_encuentro', nombre: 'Punto de Encuentro' },
      { id: 1, archivo: 'vias_evacuacion', nombre: 'Vía de Evacuación' },
      { id: 2, archivo: 'linea_segura', nombre: 'Línea Segura' },
      { id: 3, archivo: 'area_evacuar', nombre: 'Área a Evacuar' },
      { id: 4, archivo: 'cota_30', nombre: 'Cota 30 mts.' },
    ],
  },
  'vina/incendio_forestal': {
    nombre: 'Viña del Mar',
    bbox: BBOX_VINA,
    servicio: `${SENAPRED}/Amenaza_por_Incendio_Forestal_2024/FeatureServer`,
    fuente: 'SENAPRED — Amenaza por Incendio Forestal 2024 (densidad de incendios forestales 2020–2024)',
    ficha: 'https://www.arcgis.com/home/item.html?id=19268f2baaaf4cfdb8ad93f083c2c437',
    // Fecha de última modificación del servicio en ArcGIS Online (creado el 2024-04-10).
    publicacion: '2025-10-27',
    capas: [
      // Polígonos de densidad (incendios/km²) con clase "recurrencia" (Muy baja … Muy alta).
      // Mide incendios pasados: en el catálogo va con rol "referencia", nunca como área de peligro.
      { id: 0, archivo: 'recurrencia_2020_2024', nombre: 'Densidad de Incendios Forestales 2020-2024',
        campos: ['gridcode', 'recurrencia'], recortar: true, generalizar: 0.00005 },
    ],
  },
};

const DECIMALES = 6; // ~10 cm, suficiente y reduce el tamaño del archivo

function redondear(coords) {
  if (typeof coords[0] === 'number') return coords.map(c => +c.toFixed(DECIMALES));
  return coords.map(redondear);
}

// ---- Recorte de polígonos a un rectángulo (Sutherland–Hodgman, anillo por anillo) ----
// Para dibujar basta: puede dejar bordes de ancho cero sobre el borde del bbox (la capa se dibuja sin trazo).
function recortarAnillo(anillo, [o, s, e, n]) {
  const bordes = [
    [p => p[0] >= o, (a, b) => interp(a, b, 0, o)],
    [p => p[0] <= e, (a, b) => interp(a, b, 0, e)],
    [p => p[1] >= s, (a, b) => interp(a, b, 1, s)],
    [p => p[1] <= n, (a, b) => interp(a, b, 1, n)],
  ];
  let pts = anillo.slice(0, -1);       // sin el punto de cierre
  for (const [dentro, corte] of bordes) {
    if (!pts.length) break;
    const sal = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (dentro(b)) { if (!dentro(a)) sal.push(corte(a, b)); sal.push(b); }
      else if (dentro(a)) sal.push(corte(a, b));
    }
    pts = sal;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : null;
}
function interp(a, b, eje, valor) {
  const t = (valor - a[eje]) / (b[eje] - a[eje]);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
function recortarPoligono(anillos, bbox) {
  const ext = recortarAnillo(anillos[0], bbox);
  if (!ext) return null;
  return [ext, ...anillos.slice(1).map(h => recortarAnillo(h, bbox)).filter(Boolean)];
}
function recortarGeometria(g, bbox) {
  if (g.type === 'Polygon') {
    const p = recortarPoligono(g.coordinates, bbox);
    return p ? { type: 'Polygon', coordinates: p } : null;
  }
  if (g.type === 'MultiPolygon') {
    const ps = g.coordinates.map(p => recortarPoligono(p, bbox)).filter(Boolean);
    return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null;
  }
  return g;   // puntos y líneas no se recortan
}

async function consultarCapa(servicio, capa, bbox) {
  const features = [];
  let offset = 0;
  const tam = 1000;
  while (true) {
    const params = new URLSearchParams({
      where: capa.where || '1=1',
      geometry: bbox.join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: capa.campos ? capa.campos.join(',') : '*',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(tam),
      f: 'geojson',
    });
    if (capa.generalizar) params.set('maxAllowableOffset', String(capa.generalizar));
    const url = `${servicio}/${capa.id}/query?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} en capa ${capa.nombre}`);
    const json = await resp.json();
    if (json.error) throw new Error(`ArcGIS: ${JSON.stringify(json.error)}`);
    const nuevos = json.features ?? [];
    features.push(...nuevos);
    const hayMas = json.exceededTransferLimit || json.properties?.exceededTransferLimit;
    if (!hayMas || nuevos.length === 0) break;
    offset += nuevos.length;
  }
  const salida = [];
  for (const f of features) {
    if (f.geometry && capa.recortar) f.geometry = recortarGeometria(f.geometry, bbox);
    if (!f.geometry) continue;
    f.geometry.coordinates = redondear(f.geometry.coordinates);
    salida.push(f);
  }
  return { type: 'FeatureCollection', features: salida };
}

async function descargarEscenario(clave) {
  const esc = ESCENARIOS[clave];
  const carpeta = join(RAIZ, 'app', 'data', ...clave.split('/'));
  await mkdir(carpeta, { recursive: true });
  const resumen = [];
  for (const capa of esc.capas) {
    process.stdout.write(`  ${capa.nombre}... `);
    const fc = await consultarCapa(esc.servicio, capa, esc.bbox);
    const texto = JSON.stringify(fc);
    await writeFile(join(carpeta, `${capa.archivo}.geojson`), texto);
    const kb = (Buffer.byteLength(texto) / 1024).toFixed(0);
    console.log(`${fc.features.length} elementos, ${kb} KB`);
    resumen.push({ capa: capa.nombre, indice: capa.id, archivo: `${capa.archivo}.geojson`, elementos: fc.features.length, kb: +kb,
      ...(capa.recortar ? { recortada_al_bbox: true } : {}), ...(capa.generalizar ? { generalizacion_grados: capa.generalizar } : {}) });
  }
  const metadata = {
    escenario: clave,
    nombre: esc.nombre,
    fuente: esc.fuente,
    url_servicio: esc.servicio,
    ficha_catalogo: esc.ficha,
    fecha_publicacion_fuente: esc.publicacion,
    fecha_descarga: new Date().toISOString(),
    bbox: esc.bbox,
    capas: resumen,
  };
  await writeFile(join(carpeta, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return metadata;
}

const pedido = process.argv[2];
const claves = pedido ? [pedido] : Object.keys(ESCENARIOS);
for (const clave of claves) {
  if (!ESCENARIOS[clave]) { console.error(`Escenario desconocido: ${clave}. Disponibles: ${Object.keys(ESCENARIOS).join(', ')}`); process.exit(1); }
  console.log(`Descargando ${clave} (${ESCENARIOS[clave].nombre})`);
  try {
    await descargarEscenario(clave);
  } catch (e) {
    console.error(`\nError: ${e.message}`);
    process.exit(1);
  }
}
console.log('Listo. Revisa app/data/<zona>/<amenaza>/metadata.json');
