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
const VOLCANICA = `${SENAPRED}/AMENAZA_VOLC%C3%81NICA_2024/FeatureServer`;
const AREA_EVAC_VOLCANES = `${SENAPRED}/%C3%81rea_de_Evacuaci%C3%B3n_Volcanes/FeatureServer`;
const BBOX_PUCON = [-72.02, -39.46, -71.54, -39.05];   // comuna de Pucón con un pequeño margen
// Comuna de Tiltil con margen: incluye el tranque Las Tórtolas (comuna de Colina, en el límite con Tiltil)
const BBOX_TILTIL = [-71.04, -33.22, -70.70, -32.91];
// Catastro de depósitos de relaves de SERNAGEOMIN, actualizado a octubre de 2025 (polígonos)
const RELAVES_SNGM = 'https://services1.arcgis.com/OyjvVdFTl5hfSdX3/arcgis/rest/services/CDR_CHILE_AREAL_2025/FeatureServer';
const PUNTOS_CRITICOS_2022 = `${SENAPRED}/Puntos_Cr%C3%ADticos_Programa_Invierno_2022/FeatureServer`;
// División Político Administrativa (SUBDERE, IGM e INE, 2018), publicada por el MOP. Solo responde en JSON de Esri.
const DPA_MOP = 'https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer';

// bbox = [oeste, sur, este, norte] en grados (EPSG:4326)
const BBOX_VINA = [-71.60, -33.06, -71.48, -32.93];

// Clave = "<zona>/<amenaza>", igual que la carpeta de destino y los ids del catálogo
// ("<zona>/cobertura" para el límite de una zona). bbox es opcional si la capa trae "where".
// Por capa (opcionales):
//   campos      lista de campos a guardar (por defecto, todos). Úsalo también para NO guardar datos personales
//   where       filtro ArcGIS (por defecto '1=1'), p. ej. "volcan='Villarrica'" o "CUT_COM='13118'"
//   recortar    true = recortar los polígonos al bbox (para capas nacionales con polígonos enormes)
//   generalizar tolerancia en grados para simplificar la geometría en el servidor (0.00005 ≈ 5 m)
//   decodificar true = reemplazar los códigos de los dominios de ArcGIS por su nombre (p. ej. 9 → "Colapso colectores…")
//   esri        true = el servicio no entrega GeoJSON (f=json de Esri): se convierte aquí
//   servicio    otro servicio para esta capa (si el escenario combina dos servicios)
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
      // Capa 4 "Cota 30 mts." no se descarga: en Viña solo trae dos fragmentos en los bordes del recuadro.
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
  'macul/cobertura': {
    nombre: 'Macul (límite comunal)',
    servicio: DPA_MOP,
    fuente: 'SUBDERE, IGM e INE (2018) — División Político Administrativa, Comunas (servicio del MOP)',
    ficha: `${DPA_MOP}/1`,
    publicacion: '2018',
    capas: [
      { id: 1, archivo: 'limite_comunal', nombre: 'Comunas', where: "CUT_COM='13118'",
        campos: ['CUT_COM', 'COMUNA'], generalizar: 0.00005, esri: true },
    ],
  },
  'pucon/cobertura': {
    nombre: 'Pucón (límite comunal)',
    servicio: DPA_MOP,
    fuente: 'SUBDERE, IGM e INE (2018) — División Político Administrativa, Comunas (servicio del MOP)',
    ficha: `${DPA_MOP}/1`,
    publicacion: '2018',
    capas: [
      { id: 1, archivo: 'limite_comunal', nombre: 'Comunas', where: "CUT_COM='09115'",
        campos: ['CUT_COM', 'COMUNA'], generalizar: 0.0001, esri: true },
    ],
  },
  'pucon/volcanica': {
    nombre: 'Pucón (volcán Villarrica)',
    bbox: BBOX_PUCON,
    servicio: VOLCANICA,
    fuente: 'SENAPRED — Amenaza Volcánica 2024 y Área de Evacuación Volcanes',
    ficha: 'https://www.arcgis.com/home/item.html?id=cdc76e7d47a74c89b1111c3d1e25924c',
    // Amenaza Volcánica 2024: creado 2024-10-07, modificado 2026-09-21. Área de Evacuación Volcanes: 2026-09-22.
    publicacion: '2026-09-21',
    capas: [
      { servicio: AREA_EVAC_VOLCANES, id: 0, archivo: 'area_evacuacion', nombre: 'Áreas de evacuación',
        where: "nombre='Villarrica'", campos: ['nombre', 'clase'], recortar: true, generalizar: 0.00005 },
      { id: 2, archivo: 'peligro', nombre: 'Áreas de Peligro Volcánico', campos: ['peligro'], recortar: true, generalizar: 0.0001 },
      { id: 1, archivo: 'vias_evacuacion', nombre: 'Vías de Evacuación', where: "volcan='Villarrica'", campos: ['objectid', 'volcan', 'bidireccional'] },
      { id: 0, archivo: 'puntos_encuentro', nombre: 'Puntos de Encuentro', where: "volcan='Villarrica'", campos: ['nombre', 'tipo', 'volcan'] },
      { id: 3, archivo: 'volcan', nombre: 'Volcanes Geológicamente Activos: Peligrosidad', where: "volcan='Villarrica'", campos: ['volcan', 'categoria'] },
    ],
  },
  'pucon/incendio_forestal': {
    nombre: 'Pucón',
    bbox: BBOX_PUCON,
    servicio: `${SENAPRED}/Amenaza_por_Incendio_Forestal_2024/FeatureServer`,
    fuente: 'SENAPRED — Amenaza por Incendio Forestal 2024 (densidad de incendios forestales 2020–2024)',
    ficha: 'https://www.arcgis.com/home/item.html?id=19268f2baaaf4cfdb8ad93f083c2c437',
    publicacion: '2025-10-27',
    capas: [
      { id: 0, archivo: 'recurrencia_2020_2024', nombre: 'Densidad de Incendios Forestales 2020-2024',
        campos: ['gridcode', 'recurrencia'], recortar: true, generalizar: 0.00005 },
    ],
  },
  'tiltil/cobertura': {
    nombre: 'Tiltil (límite comunal)',
    servicio: DPA_MOP,
    fuente: 'SUBDERE, IGM e INE (2018) — División Político Administrativa, Comunas (servicio del MOP)',
    ficha: `${DPA_MOP}/1`,
    publicacion: '2018',
    capas: [
      { id: 1, archivo: 'limite_comunal', nombre: 'Comunas', where: "CUT_COM='13303'",
        campos: ['CUT_COM', 'COMUNA'], generalizar: 0.0001, esri: true },
    ],
  },
  'tiltil/relave': {
    nombre: 'Tiltil (depósitos de relaves)',
    bbox: BBOX_TILTIL,
    servicio: RELAVES_SNGM,
    fuente: 'SERNAGEOMIN — Catastro de depósitos de relaves de Chile, areal (actualizado a octubre de 2025)',
    ficha: 'https://www.arcgis.com/home/item.html?id=2798b3201c92431d87ff19fbafbabf16',
    publicacion: '2025-10-02',
    capas: [
      // 11 depósitos en el recuadro (consultado el 2-oct-2026): 8 en Tiltil, Las Tórtolas (Colina) y
      // Ramayana 1 y 2 (Olmué, abandonados), junto al límite poniente.
      // No se guardan el RUT ni las coordenadas UTM (redundantes).
      { id: 0, archivo: 'depositos_relaves', nombre: 'CDR_CHILE_AREAL_2025',
        campos: ['ID', 'NOMBRE_EMPRESA_O_PRODUCTOR_MINE', 'NOMBRE_FAENA', 'NOMBRE_INSTALACION', 'TIPO_DEPOSITO', 'RECURSO',
          'ESTADO_INSTALACION', 'METODO_CONSTRUCTIVO_MURO', 'VOL_AUTORIZADO', 'COMUNA'], generalizar: 0.00002 },
    ],
  },
  'tiltil/incendio_forestal': {
    nombre: 'Tiltil',
    bbox: BBOX_TILTIL,
    servicio: `${SENAPRED}/Amenaza_por_Incendio_Forestal_2024/FeatureServer`,
    fuente: 'SENAPRED — Amenaza por Incendio Forestal 2024 (densidad de incendios forestales 2020–2024)',
    ficha: 'https://www.arcgis.com/home/item.html?id=19268f2baaaf4cfdb8ad93f083c2c437',
    publicacion: '2025-10-27',
    capas: [
      { id: 0, archivo: 'recurrencia_2020_2024', nombre: 'Densidad de Incendios Forestales 2020-2024',
        campos: ['gridcode', 'recurrencia'], recortar: true, generalizar: 0.00005 },
    ],
  },
  'tiltil/inundacion': {
    nombre: 'Tiltil',
    servicio: PUNTOS_CRITICOS_2022,
    fuente: 'SENAPRED (ex ONEMI) — Puntos Críticos Programa Invierno 2022 (levantamiento comunal)',
    ficha: 'https://www.arcgis.com/home/item.html?id=09b724392dec47b2972d290e110b7dfc',
    publicacion: '2022-04-27',
    capas: [
      // 48 puntos de Tiltil (consultado el 2-oct-2026), incluidos los tranques Ovejería y Las Tórtolas (muro oeste).
      { id: 0, archivo: 'puntos_criticos_2022', nombre: 'Puntos Críticos Programa Invierno', where: "comuna='13303'",
        campos: ['sector', 'causa_punt', 'nivel_de_riesgo_2022'], decodificar: true },
    ],
  },
  'macul/inundacion': {
    nombre: 'Macul',
    servicio: PUNTOS_CRITICOS_2022,
    fuente: 'SENAPRED (ex ONEMI) — Puntos Críticos Programa Invierno 2022 (levantamiento comunal)',
    ficha: 'https://www.arcgis.com/home/item.html?id=09b724392dec47b2972d290e110b7dfc',
    publicacion: '2022-04-27',
    capas: [
      // 31 puntos de Macul (consultado el 2-oct-2026). No se guarda "responsabl" (nombre de una persona).
      { id: 0, archivo: 'puntos_criticos_2022', nombre: 'Puntos Críticos Programa Invierno', where: "comuna='13118'",
        campos: ['sector', 'causa_punt', 'nivel_de_riesgo_2022'], decodificar: true },
    ],
  },
};

// ---- Comunas de la precordillera de Santiago (aluviones): mismo conjunto de capas para cada una ----
// PRMS (MINVU, servicio PRMS_AGOL_2024): capa 10 riesgo de remoción en masa (art. 8.2.1.4), capa 9 riesgo de
// derrumbes y asentamiento del suelo (art. 8.2.1.2), capa 6 quebradas (art. 8.2.1). Puntos críticos 2022 de SENAPRED:
// para "aluvion" solo las causas 1 (flujos de barro/aluvión), 2 (deslizamiento/derrumbe) y 4 (activación de quebradas).
const PRMS_MINVU = 'https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/PRMS_AGOL_2024/FeatureServer';
const DPA = { servicio: DPA_MOP, fuente: 'SUBDERE, IGM e INE (2018) — División Político Administrativa, Comunas (servicio del MOP)', ficha: `${DPA_MOP}/1`, publicacion: '2018' };
function escenariosPrecordillera(zona, nombre, cut, bbox) {
  return {
    [`${zona}/cobertura`]: { nombre: `${nombre} (límite comunal)`, ...DPA,
      capas: [{ id: 1, archivo: 'limite_comunal', nombre: 'Comunas', where: `CUT_COM='${cut}'`, campos: ['CUT_COM', 'COMUNA'], generalizar: 0.00005, esri: true }] },
    [`${zona}/aluvion`]: { nombre, bbox, servicio: PRMS_MINVU,
      fuente: 'MINVU — Plan Regulador Metropolitano de Santiago (PRMS), áreas de riesgo y quebradas; SENAPRED — Puntos Críticos Programa Invierno 2022',
      ficha: 'https://www.arcgis.com/home/item.html?id=4ff5a467fdc247929bd4276a39cc478a', publicacion: '2024-07-09',
      capas: [
        { id: 10, archivo: 'remocion_masa_prms', nombre: 'd5_art_821_remocionmasa', campos: ['COMUNA', 'ART_III', 'SECTOR'], recortar: true, generalizar: 0.00002 },
        { id: 9, archivo: 'derrumbes_prms', nombre: '8.2.1 Riesgos de origen natural', campos: ['ORD_1', 'ORD_2'], recortar: true, generalizar: 0.00002 },
        { id: 6, archivo: 'quebradas_prms', nombre: 'd4_art_821_quebradas', campos: ['NOMBRE', 'TRAMO', 'COMUNA'], generalizar: 0.00002 },
        { servicio: PUNTOS_CRITICOS_2022, id: 0, archivo: 'puntos_quebradas_2022', nombre: 'Puntos Críticos Programa Invierno (quebradas y aluviones)',
          where: `comuna='${cut}' AND causa_punt IN ('1','2','4')`, campos: ['sector', 'causa_punt', 'nivel_de_riesgo_2022'], decodificar: true },
      ] },
    [`${zona}/incendio_forestal`]: { nombre, bbox, servicio: `${SENAPRED}/Amenaza_por_Incendio_Forestal_2024/FeatureServer`,
      fuente: 'SENAPRED — Amenaza por Incendio Forestal 2024 (densidad de incendios forestales 2020–2024)',
      ficha: 'https://www.arcgis.com/home/item.html?id=19268f2baaaf4cfdb8ad93f083c2c437', publicacion: '2025-10-27',
      capas: [{ id: 0, archivo: 'recurrencia_2020_2024', nombre: 'Densidad de Incendios Forestales 2020-2024', campos: ['gridcode', 'recurrencia'], recortar: true, generalizar: 0.00005 }] },
    [`${zona}/inundacion`]: { nombre, servicio: PUNTOS_CRITICOS_2022,
      fuente: 'SENAPRED (ex ONEMI) — Puntos Críticos Programa Invierno 2022 (levantamiento comunal)',
      ficha: 'https://www.arcgis.com/home/item.html?id=09b724392dec47b2972d290e110b7dfc', publicacion: '2022-04-27',
      capas: [{ id: 0, archivo: 'puntos_criticos_2022', nombre: 'Puntos Críticos Programa Invierno', where: `comuna='${cut}'`, campos: ['sector', 'causa_punt', 'nivel_de_riesgo_2022'], decodificar: true }] },
  };
}
Object.assign(ESCENARIOS,
  escenariosPrecordillera('penalolen', 'Peñalolén', '13122', [-70.60, -33.52, -70.44, -33.45]),
  escenariosPrecordillera('la_florida', 'La Florida', '13110', [-70.62, -33.58, -70.43, -33.485]),
);

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

// ---- JSON de Esri → GeoJSON (servicios que no entregan f=geojson) ----
// Esri: anillo exterior en sentido horario, agujeros antihorario.
const areaFirmada = (r) => { let a = 0; for (let i = 1; i < r.length; i++) a += (r[i][0] - r[i - 1][0]) * (r[i][1] + r[i - 1][1]); return a; };
function esriAGeoJSON(g) {
  if (!g) return null;
  if (g.x != null) return { type: 'Point', coordinates: [g.x, g.y] };
  if (g.paths) return g.paths.length === 1 ? { type: 'LineString', coordinates: g.paths[0] } : { type: 'MultiLineString', coordinates: g.paths };
  if (g.rings) {
    const poligonos = [];
    for (const r of g.rings) {
      if (areaFirmada(r) > 0 || !poligonos.length) poligonos.push([r]);   // horario = exterior
      else poligonos[poligonos.length - 1].push(r);                       // agujero del último exterior
    }
    return poligonos.length === 1 ? { type: 'Polygon', coordinates: poligonos[0] } : { type: 'MultiPolygon', coordinates: poligonos };
  }
  return null;
}

// Dominios de ArcGIS (código → nombre) de una capa, para guardar textos legibles.
async function dominios(servicio, capa) {
  const resp = await fetch(`${servicio}/${capa.id}?f=json`);
  const json = await resp.json();
  const mapas = {};
  for (const campo of json.fields || []) {
    if (campo.domain?.codedValues) mapas[campo.name] = Object.fromEntries(campo.domain.codedValues.map(v => [String(v.code), v.name]));
  }
  return mapas;
}

async function consultarCapa(servicio, capa, bbox) {
  const features = [];
  let offset = 0;
  const tam = 1000;
  const paginar = !!bbox;          // con un "where" puntual (sin bbox) basta una consulta
  while (true) {
    const params = new URLSearchParams({
      where: capa.where || '1=1',
      outFields: capa.campos ? capa.campos.join(',') : '*',
      outSR: '4326',
      f: capa.esri ? 'json' : 'geojson',
    });
    if (bbox) {
      params.set('geometry', bbox.join(','));
      params.set('geometryType', 'esriGeometryEnvelope');
      params.set('inSR', '4326');
      params.set('spatialRel', 'esriSpatialRelIntersects');
    }
    if (paginar) { params.set('resultOffset', String(offset)); params.set('resultRecordCount', String(tam)); }
    if (capa.generalizar) params.set('maxAllowableOffset', String(capa.generalizar));
    const url = `${servicio}/${capa.id}/query?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} en capa ${capa.nombre}`);
    const json = await resp.json();
    if (json.error) throw new Error(`ArcGIS: ${JSON.stringify(json.error)}`);
    const nuevos = (json.features ?? []).map(f => capa.esri
      ? { type: 'Feature', properties: f.attributes || {}, geometry: esriAGeoJSON(f.geometry) } : f);
    features.push(...nuevos);
    const hayMas = json.exceededTransferLimit || json.properties?.exceededTransferLimit;
    if (!paginar || !hayMas || nuevos.length === 0) break;
    offset += nuevos.length;
  }
  if (capa.decodificar) {
    const mapas = await dominios(servicio, capa);
    for (const f of features) {
      for (const [campo, mapa] of Object.entries(mapas)) {
        const v = f.properties?.[campo];
        if (v != null && mapa[String(v)] != null) f.properties[campo] = mapa[String(v)];
      }
    }
  }
  const salida = [];
  for (const f of features) {
    if (f.geometry && capa.recortar && bbox) f.geometry = recortarGeometria(f.geometry, bbox);
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
    const fc = await consultarCapa(capa.servicio || esc.servicio, capa, esc.bbox);
    const texto = JSON.stringify(fc);
    await writeFile(join(carpeta, `${capa.archivo}.geojson`), texto);
    const kb = (Buffer.byteLength(texto) / 1024).toFixed(0);
    console.log(`${fc.features.length} elementos, ${kb} KB`);
    resumen.push({ capa: capa.nombre, indice: capa.id, archivo: `${capa.archivo}.geojson`, elementos: fc.features.length, kb: +kb, ...(capa.servicio ? { servicio: capa.servicio } : {}),
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
    bbox: esc.bbox || null,
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
