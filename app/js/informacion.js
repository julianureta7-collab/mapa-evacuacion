// Panel "Información" (spec §5.2) y modo precaución (spec §5.4).
// Contenido oficial por amenaza en data/contenido/<amenaza>.json, con fuentes citadas.
// Regla de diseño: "durante" es mínimo (3 frases cortas). En una alerta la pantalla es casi solo el mapa;
// el texto "durante" aparece únicamente si no hay ruta válida (modo precaución).
import { cargarJSON } from './datos.js?v=22';

// Misma versión con que se cargó este módulo (?v=N), para no servir contenido viejo desde la caché.
const VERSION = new URL(import.meta.url).search.slice(1) || 'v=0';
let fuentes = null;
const cache = new Map();

async function cargarFuentes() {
  if (!fuentes) fuentes = await cargarJSON(`data/contenido/fuentes.json?${VERSION}`);
  return fuentes;
}

// Contenido de una amenaza + agregados de la zona (info_zona del catálogo).
export async function cargarContenido(ruta, infoZona = null) {
  if (!ruta) return null;
  await cargarFuentes();
  if (!cache.has(ruta)) cache.set(ruta, await cargarJSON(`${ruta}?${VERSION}`));
  const base = cache.get(ruta);
  const unir = (k) => [...(base[k] || []), ...((infoZona && infoZona[k]) || [])];
  return { antes: unir('antes'), durante: unir('durante'), despues: unir('despues') };
}

const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function citas(ids) {
  return (ids || []).map(id => fuentes[id]).filter(Boolean)
    .map(f => `<a href="${f.url}" target="_blank" rel="noopener">${esc(f.organismo)}</a>`).join(' · ');
}

function lista(items) {
  return `<ol class="info-lista">${items.map(it => `<li><span>${esc(it.texto)}</span><span class="info-cita">${citas(it.fuentes)}</span></li>`).join('')}</ol>`;
}

const PESTANAS = [
  { id: 'antes', nombre: 'Antes' },
  { id: 'durante', nombre: 'Durante' },
  { id: 'despues', nombre: 'Después' },
];

/**
 * Dibuja el panel con pestañas Antes / Durante / Después.
 * @param {HTMLElement} el contenedor
 * @param {{nombre:string}} amenaza
 * @param {object|null} contenido resultado de cargarContenido
 */
export function dibujarInformacion(el, amenaza, contenido, pestana = 'antes') {
  if (!contenido) {
    el.innerHTML = `<h2 class="info-titulo">${esc(amenaza?.nombre || '')}</h2><p class="info-vacio">Información oficial para esta amenaza en preparación.</p>`;
    return;
  }
  const actual = PESTANAS.some(p => p.id === pestana) ? pestana : 'antes';
  const notaDurante = actual === 'durante'
    ? '<p class="info-nota">Durante una alerta, la app te mostrará solo el mapa con tu ruta.</p>' : '';
  el.innerHTML = `
    <h2 class="info-titulo">Información · ${esc(amenaza.nombre)}</h2>
    <div class="info-pestanas" role="tablist">
      ${PESTANAS.map(p => `<button type="button" role="tab" data-pestana="${p.id}" aria-selected="${p.id === actual}" class="${p.id === actual ? 'activa' : ''}">${p.nombre}</button>`).join('')}
    </div>
    <div class="info-cuerpo" role="tabpanel">
      ${notaDurante}
      ${lista(contenido[actual] || [])}
    </div>`;
  el.querySelectorAll('[data-pestana]').forEach(b =>
    b.addEventListener('click', () => dibujarInformacion(el, amenaza, contenido, b.dataset.pestana)));
}

// Tarjeta de modo precaución: solo las frases "durante" (máximo 3) + fuente compacta.
export function htmlPrecaucion(amenaza, contenido, motivo) {
  const items = (contenido?.durante || []).slice(0, 3);
  const orgs = [...new Set(items.flatMap(i => i.fuentes || []).map(id => fuentes?.[id]?.organismo).filter(Boolean))];
  return `
    <div class="ruta-titulo">Qué hacer ahora</div>
    ${motivo ? `<div class="precaucion-motivo">${esc(motivo)}</div>` : ''}
    <ol class="precaucion-lista">${items.map(i => `<li>${esc(i.texto)}</li>`).join('')}</ol>
    ${orgs.length ? `<div class="precaucion-fuente">Fuente: ${esc(orgs.join(', '))}</div>` : ''}`;
}
