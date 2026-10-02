// Carga de datos geográficos estáticos (GeoJSON precargado en el repositorio).

export async function cargarJSON(ruta) {
  const resp = await fetch(ruta);
  if (!resp.ok) throw new Error(`No se pudo cargar ${ruta} (HTTP ${resp.status})`);
  return resp.json();
}

const vacio = () => ({ type: 'FeatureCollection', features: [] });

/**
 * Carga las capas oficiales de una zona × amenaza.
 * Cada feature queda marcada con su procedencia (_procedencia, _fuente, _capa) para que
 * la interfaz pueda decir de dónde viene cada cosa.
 * @returns {{ capas: Array<{def, geo}>, porRol: Object<string, FeatureCollection>, metadata }}
 */
export async function cargarCapas(defAmenaza, fuentePorId, base = '') {
  const capas = [];
  const porRol = {};
  await Promise.all((defAmenaza.capas || []).map(async (c) => {
    const geo = await cargarJSON(`${base}${defAmenaza.carpeta}/${c.archivo}`);
    const f = fuentePorId(c.fuente);
    for (const ft of geo.features) {
      ft.properties = { ...(ft.properties || {}), _procedencia: 'oficial', _fuente: f, _capa: c.nombre };
      // Código estable para capas sin campo "name" (p. ej. vías volcánicas: objectid → "VE-787"),
      // que usan la tarjeta de ruta y la desactivación de vías por el operador.
      // (ArcGIS a veces entrega el objectid como "id" del feature y no en las propiedades)
      const cod = c.codigo ? (ft.properties[c.codigo.campo] ?? ft.id) : null;
      if (cod != null && ft.properties.name == null) ft.properties.name = `${c.codigo.prefijo || ''}${cod}`;
      // Puntos de encuentro oficiales que la autoridad ubica dentro del área (p. ej. los puntos de
      // encuentro transitorios de Pucón): siguen siendo destinos válidos.
      if (c.destino_aunque_dentro) ft.properties._destinoDentro = true;
    }
    capas.push({ def: c, geo });
  }));
  // Orden estable según el catálogo (para leyenda y dibujo)
  capas.sort((a, b) => defAmenaza.capas.indexOf(a.def) - defAmenaza.capas.indexOf(b.def));
  for (const { def, geo } of capas) {
    (porRol[def.rol] ||= vacio()).features.push(...geo.features);
  }
  let metadata = null;
  if (defAmenaza.metadata) {
    try { metadata = await cargarJSON(`${base}${defAmenaza.carpeta}/${defAmenaza.metadata}`); } catch { /* opcional */ }
  }
  return { capas, porRol, metadata };
}
