// Carga de datos geográficos estáticos (GeoJSON precargado en el repositorio).

export async function cargarJSON(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta} (HTTP ${resp.status})`);
  return resp.json();
}

export async function cargarEscenario(escenario) {
  const capas = {};
  await Promise.all(escenario.capas.map(async (c) => {
    capas[c.archivo] = await cargarJSON(`${escenario.carpeta}/${c.archivo}.geojson`);
  }));
  let metadata = null;
  try { metadata = await cargarJSON(`${escenario.carpeta}/metadata.json`); } catch { /* opcional */ }
  return { capas, metadata };
}
