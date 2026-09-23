// Mapa Leaflet: fondo OSM y capas del escenario.
import { ESTILOS } from './config.js';

let mapa, controlCapas, grupoEscenario;

export function crearMapa(idContenedor) {
  mapa = L.map(idContenedor, { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa);
  mapa.attributionControl.addAttribution('Capas de amenaza: SENAPRED');
  return mapa;
}

function popupDe(nombreCapa, props) {
  const titulo = props.nombre_pe?.trim() || props.name || props.sector || nombreCapa;
  const filas = [];
  if (props.sector) filas.push(`Sector: ${props.sector}`);
  if (props.nom_com || props.comuna) filas.push(`Comuna: ${props.nom_com || props.comuna}`);
  if (props.name && titulo !== props.name) filas.push(`Código: ${props.name}`);
  return `<div class="popup-titulo">${titulo}</div><div>${nombreCapa}</div>${filas.map(f => `<div>${f}</div>`).join('')}`;
}

export function mostrarEscenario(escenario, datos) {
  if (grupoEscenario) { grupoEscenario.remove(); controlCapas?.remove(); }
  grupoEscenario = L.featureGroup().addTo(mapa);
  controlCapas = L.control.layers(null, null, { collapsed: window.innerWidth < 760 }).addTo(mapa);

  for (const c of escenario.capas) {
    const geo = datos.capas[c.archivo];
    if (!geo) continue;
    const estilo = ESTILOS[c.estilo || c.archivo] || {};
    const capa = L.geoJSON(geo, {
      style: () => estilo,
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, estilo),
      onEachFeature: (f, l) => l.bindPopup(popupDe(c.nombre, f.properties || {})),
    });
    controlCapas.addOverlay(capa, c.nombre);
    if (c.visible) capa.addTo(grupoEscenario);
  }
  mapa.setView(escenario.centro, escenario.zoom);
}

export function mostrarVacio(escenario) {
  if (grupoEscenario) { grupoEscenario.remove(); controlCapas?.remove(); grupoEscenario = null; controlCapas = null; }
  mapa.setView(escenario.centro, escenario.zoom);
}
