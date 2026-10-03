// Mapa Leaflet: fondo OSM y capas de la zona × amenaza actual.
import { estiloDe } from './catalogo.js?v=19';

let mapa, controlCapas, grupoCapas;
let capasDibujadas = [];        // [{ def, capa }]
let modoEmergenciaMapa = false;
let atribucionFuentes = '';

export function crearMapa(idContenedor) {
  mapa = L.map(idContenedor, {
    zoomControl: true,
    preferCanvas: true,
    // leaflet-rotate: rotación controlada solo por nuestro botón de brújula
    rotate: true,
    bearing: 0,
    rotateControl: false,
    touchRotate: false,
    shiftKeyRotate: false,
    compassBearing: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa);
  // Si el contenedor cambia de tamaño (p. ej. aparece el panel de diagnóstico en el celular),
  // Leaflet debe recalcular; si no, el "centro" del mapa queda fuera de la vista.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => mapa.invalidateSize({ animate: false })).observe(mapa.getContainer());
  }
  return mapa;
}

const escHTML = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function popupDe(def, props) {
  const nombreCapa = def.nombre;
  const titulo = (def.titulo && props[def.titulo]) || props.nombre_pe?.trim() || props.nombre_ve?.trim() || props.nombre?.trim() || props.volcan || props.name || props.sector || nombreCapa;
  const filas = [];
  if (props.sector && titulo !== props.sector) filas.push(`Sector: ${props.sector}`);
  if (props.nom_com || props.comuna) filas.push(`Comuna: ${props.nom_com || props.comuna}`);
  if (props.name && titulo !== props.name) filas.push(`Código: ${props.name}`);
  if (def.popup) { for (const c of def.popup) if (props[c.campo] != null) filas.push(`${c.etiqueta}: ${props[c.campo]}`); }
  else if (def.consulta && props[def.consulta.campo] != null) filas.push(`${def.consulta.etiqueta}: ${props[def.consulta.campo]}`);
  if (props._procedencia === 'operador') {
    const e = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cuando = props.creado ? new Date(props.creado).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="popup-titulo">${e(props.nombre || nombreCapa)}</div><div>${e(nombreCapa)}</div>`
      + `<div>Motivo: ${e(props.motivo)}</div><div>Fuente: ${e(props.fuente_texto)}</div>`
      + `<div class="popup-fuente">Marcado por ${e(props.autor)} · ${cuando}${props.vigente_hasta ? ` · vigente hasta ${new Date(props.vigente_hasta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>`;
  }
  const f = props._fuente;
  const origen = f ? `Fuente: ${f.organismo}${f.nombre ? ` — ${f.nombre}` : ''}` : '';
  return `<div class="popup-titulo">${escHTML(titulo)}</div>${titulo !== nombreCapa ? `<div>${escHTML(nombreCapa)}</div>` : ''}${filas.map(x => `<div>${escHTML(x)}</div>`).join('')}${origen ? `<div class="popup-fuente">${escHTML(origen)}</div>` : ''}`;
}

// En emergencia el mapa muestra solo lo esencial: área de peligro y puntos de encuentro
// (la ruta personal se dibuja aparte). En informativo, lo que diga el catálogo (visible).
const ROLES_EMERGENCIA = ['area_peligro', 'punto_encuentro', 'bloqueo'];
function aplicarVisibilidad() {
  for (const { def, capa } of capasDibujadas) {
    const ver = modoEmergenciaMapa ? ROLES_EMERGENCIA.includes(def.rol) : def.visible;
    if (ver) capa.addTo(grupoCapas); else grupoCapas.removeLayer(capa);
  }
}

export function setModoMapa(emergencia) {
  modoEmergenciaMapa = emergencia;
  if (grupoCapas) aplicarVisibilidad();
}

function limpiarCapas() {
  capasDibujadas = [];
  if (grupoCapas) { grupoCapas.remove(); grupoCapas = null; }
  if (controlCapas) { controlCapas.remove(); controlCapas = null; }
  if (atribucionFuentes) { mapa.attributionControl.removeAttribution(atribucionFuentes); atribucionFuentes = ''; }
}

// capas: [{ def: {nombre, rol, visible, estilo?}, geo }]
export function mostrarCapas(capas) {
  limpiarCapas();
  grupoCapas = L.featureGroup().addTo(mapa);
  if (!capas.length) return;
  controlCapas = L.control.layers(null, null, { collapsed: window.innerWidth < 760 }).addTo(mapa);
  const organismos = new Set();
  for (const { def, geo } of capas) {
    const capa = L.geoJSON(geo, {
      style: (f) => estiloDe(def, f),
      pointToLayer: (f, latlng) => L.circleMarker(latlng, estiloDe(def, f)),
      onEachFeature: (f, l) => l.bindPopup(popupDe(def, f.properties || {})),
    });
    controlCapas.addOverlay(capa, def.nombre);
    capasDibujadas.push({ def, capa });
    const org = geo.features[0]?.properties?._fuente?.organismo;
    if (org && !def.operador) organismos.add(org);   // la atribución es solo para fuentes oficiales
  }
  aplicarVisibilidad();
  if (organismos.size) {
    atribucionFuentes = `Capas de amenaza: ${[...organismos].join(', ')}`;
    mapa.attributionControl.addAttribution(atribucionFuentes);
  }
}

export function centrarEn(centro, zoom) {
  mapa.invalidateSize(false);
  mapa.setView(centro, zoom);
}

// ---- Etapa 3: dibujo de la ruta ----
let capaRuta = null;

export function dibujarRuta(r, { encuadrar = false } = {}) {
  limpiarRuta();
  if (!r || !r.geometria) return;
  const aLatLng = (cs) => cs.map(([lng, lat]) => [lat, lng]);
  // Tramos: la vía oficial va sólida y gruesa; acercamiento y unión final, punteados
  const tramos = r.tramos || [{ tipo: r.tipo === 'recta' ? 'recta' : 'calles', coords: r.geometria.coordinates }];
  const capas = [];
  for (const t of tramos) {
    const ll = aLatLng(t.coords);
    const punteado = t.tipo === 'recta' || t.tipo === 'acercamiento_recto' || t.tipo === 'final';
    const grueso = t.tipo === 'oficial' ? 8 : 6;
    capas.push(L.polyline(ll, { color: '#ffffff', weight: grueso + 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }));
    capas.push(L.polyline(ll, { color: '#6a1b9a', weight: grueso, opacity: 1, lineCap: 'round', lineJoin: 'round',
      dashArray: punteado ? '2 12' : null, interactive: false }));
  }
  const todos = aLatLng(r.geometria.coordinates);
  const fin = todos[todos.length - 1];
  const etiqueta = r.tipo === 'oficial' && !r.destino ? 'Zona segura' : 'Punto de encuentro';
  capas.push(L.marker(fin, {
    icon: L.divIcon({ className: 'destino-icono', html: `<div class="destino-punto"></div><div class="destino-etiqueta">${etiqueta}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
    interactive: false, zIndexOffset: 900,
  }));
  capaRuta = L.layerGroup(capas).addTo(mapa);
  // Encuadrar si se pide, o si la ruta no cabe en la vista actual
  const limites = L.latLngBounds(todos);
  if (encuadrar || !mapa.getBounds().contains(limites)) mapa.fitBounds(limites, { padding: [50, 50], maxZoom: 17 });
}

export function limpiarRuta() {
  if (capaRuta) { capaRuta.remove(); capaRuta = null; }
}
