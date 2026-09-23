// Descarga las capas de Amenaza por Tsunami 2024 (SENAPRED) para un escenario
// y las guarda como GeoJSON estático en app/data/<escenario>/.
// Uso:  node scripts/descargar_capas.mjs            (todos los escenarios)
//       node scripts/descargar_capas.mjs tsunami_vina
// Requiere Node 18+ (usa fetch nativo). No tiene dependencias.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICIO = 'https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services/Amenaza_por_Tsunami_2024/FeatureServer';

const CAPAS = [
  { id: 0, archivo: 'puntos_encuentro', nombre: 'Punto de Encuentro' },
  { id: 1, archivo: 'vias_evacuacion', nombre: 'Vía de Evacuación' },
  { id: 2, archivo: 'linea_segura', nombre: 'Línea Segura' },
  { id: 3, archivo: 'area_evacuar', nombre: 'Área a Evacuar' },
  { id: 4, archivo: 'cota_30', nombre: 'Cota 30 mts.' },
];

// bbox = [oeste, sur, este, norte] en grados (EPSG:4326)
const ESCENARIOS = {
  tsunami_vina: { nombre: 'Viña del Mar', bbox: [-71.60, -33.06, -71.48, -32.93] },
};

const DECIMALES = 6; // ~10 cm, suficiente y reduce el tamaño del archivo

function redondear(coords) {
  if (typeof coords[0] === 'number') return coords.map(c => +c.toFixed(DECIMALES));
  return coords.map(redondear);
}

async function consultarCapa(capa, bbox) {
  const features = [];
  let offset = 0;
  const tam = 1000;
  while (true) {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: bbox.join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(tam),
      f: 'geojson',
    });
    const url = `${SERVICIO}/${capa.id}/query?${params}`;
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
  for (const f of features) {
    if (f.geometry) f.geometry.coordinates = redondear(f.geometry.coordinates);
  }
  return { type: 'FeatureCollection', features };
}

async function descargarEscenario(clave) {
  const esc = ESCENARIOS[clave];
  const carpeta = join(RAIZ, 'app', 'data', clave);
  await mkdir(carpeta, { recursive: true });
  const resumen = [];
  for (const capa of CAPAS) {
    process.stdout.write(`  ${capa.nombre}... `);
    const fc = await consultarCapa(capa, esc.bbox);
    const texto = JSON.stringify(fc);
    await writeFile(join(carpeta, `${capa.archivo}.geojson`), texto);
    const kb = (Buffer.byteLength(texto) / 1024).toFixed(0);
    console.log(`${fc.features.length} elementos, ${kb} KB`);
    resumen.push({ capa: capa.nombre, indice: capa.id, archivo: `${capa.archivo}.geojson`, elementos: fc.features.length, kb: +kb });
  }
  const metadata = {
    escenario: clave,
    nombre: esc.nombre,
    fuente: 'SENAPRED — Amenaza por Tsunami 2024 (IDE Chile / Geoportal)',
    url_servicio: SERVICIO,
    ficha_catalogo: 'https://geoportal.cl/geoportal/catalog/download/1dbd467c-ebaf-3c0d-b92e-1a2eb3286f55',
    fecha_publicacion_fuente: '2024-05-01',
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
  if (!ESCENARIOS[clave]) { console.error(`Escenario desconocido: ${clave}`); process.exit(1); }
  console.log(`Descargando ${clave} (${ESCENARIOS[clave].nombre})`);
  try {
    await descargarEscenario(clave);
  } catch (e) {
    console.error(`\nError: ${e.message}`);
    process.exit(1);
  }
}
console.log('Listo. Revisa app/data/<escenario>/metadata.json');
