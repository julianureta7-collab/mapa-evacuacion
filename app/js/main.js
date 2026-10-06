// Punto de entrada de la app usuario.
// Zonas × amenazas desde data/catalogo.json (spec §3). El pin decide la zona (spec §5.1):
// al elegir una zona en el desplegable el pin va a su centro, y al arrastrar el pin a otra zona
// la app cambia de zona sola.
import { cargarCatalogo, zonas, zona as zonaPorId, amenazasDe, amenazaInfo, fuente, estiloDe, clasesDe, zonaEn } from './catalogo.js?v=24';
import { cargarCapas } from './datos.js?v=24';
import { crearMapa, mostrarCapas, centrarEn, dibujarRuta, limpiarRuta, setModoMapa, capaVisible, onCambioCapas } from './mapa.js?v=24';
import { prepararRutas, calcularRuta, nombreDestino, nombreVia, organismoDe, rumboATexto, hayRutasOperador } from './ruta.js?v=24';
import { escucharOperador, capasOperador, codigosDesactivados, elementosActuales, desactivacionesActuales, aFeature, ROLES_OPERADOR } from './capasOperador.js?v=24';
import { prepararAreas, diagnosticar, textosDiagnostico } from './diagnostico.js?v=24';
import { iniciarPosicion, iniciarGPSSiHayPermiso, modoSimulacion, modoGPS, ubicarPin, setLinterna, posicionActual, ubicacionReal, pinArrastrando, bloquearPin } from './posicion.js?v=24';
import { escucharAlertas } from './alertas.js?v=24';
import { cargarContenido, dibujarInformacion as pintarInformacion, htmlPrecaucion } from './informacion.js?v=24';
import { crearControlBrujula } from './brujula.js?v=24';

const $ = (id) => document.getElementById(id);
let mapa = null;
let zonaActual = null;        // objeto zona del catálogo (null = fuera de cobertura)
let amenazaActual = null;     // { id, nombre, area, resumen, def }
let hayAreaPeligro = false;
let cargaId = 0;              // descarta cargas viejas si el usuario cambia rápido
let pendienteRAF = null;

function error(msg) {
  const el = $('mensaje-error');
  el.textContent = msg;
  el.hidden = !msg;
}

const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
const fmtMin = (s) => `${Math.max(1, Math.round(s / 60))} min`;

// ---------------------------------------------------------------- Leyenda, fuente, información

function muestraDe(def, e) {
  if (e.radius && def.rol !== 'punto_encuentro') return `<span class="muestra punto" style="background:${e.fillColor};border:1px solid rgba(0,0,0,.25)"></span>`;
  if (def.rol === 'area_peligro' || e.fill) return `<span class="muestra" style="background:${e.fillColor || e.color};opacity:.75;border:1px solid ${e.weight ? e.color : 'rgba(0,0,0,.25)'}"></span>`;
  if (def.rol === 'punto_encuentro') return `<span class="muestra punto" style="background:${e.fillColor}"></span>`;
  return `<span class="muestra linea" style="border-top-color:${e.color};border-top-style:${e.dashArray ? 'dashed' : 'solid'}"></span>`;
}

// Las capas apagadas aparecen atenuadas: se activan en el control de capas del mapa.
let capasLeyenda = [];
function dibujarLeyenda(capas = capasLeyenda) {
  capasLeyenda = capas;
  const apagada = (def) => capaVisible(def) ? '' : ' apagada';
  const nota = (def) => capaVisible(def) ? '' : ' <span class="leyenda-nota">(apagada)</span>';
  $('leyenda').innerHTML = capas.map(({ def, geo }) => {
    // Solo las clases que aparecen en los datos (p. ej. sin "Muy alto" si no hay ninguno)
    const presentes = def.estilo_por ? new Set(geo.features.map(f => String(f.properties?.[def.estilo_por.campo]))) : null;
    const clases = clasesDe(def).filter(c => !presentes || presentes.has(c.valor));
    if (clases.length) {
      return `<li class="leyenda-grupo${apagada(def)}">${def.nombre}${nota(def)}</li>`
        + clases.map(c => `<li class="leyenda-clase${apagada(def)}">${muestraDe(def, c.estilo)}${c.valor}</li>`).join('');
    }
    return `<li class="${apagada(def).trim()}">${muestraDe(def, estiloDe(def))}${def.nombre}${nota(def)}</li>`;
  }).join('');
}

function dibujarFuente(capas, metadata, nOperador = 0, nDesactivadas = 0) {
  const ids = [...new Set(capas.map(c => c.def.fuente).filter(Boolean))];
  if (!ids.length) {
    $('fuente').textContent = 'Aún no hay capas oficiales cargadas para esta amenaza en esta zona.'
      + (nOperador ? ` Se muestran ${nOperador} elemento(s) dibujado(s) por operadores.` : '');
    return;
  }
  const descarga = metadata?.fecha_descarga
    ? `; datos descargados el ${new Date(metadata.fecha_descarga).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : '';
  $('fuente').textContent = ids.map(id => {
    const f = fuente(id);
    return f ? `Fuente: ${f.organismo} — ${f.nombre}. Publicación ${f.publicacion}${descarga}.` : `Fuente: ${id}.`;
  }).join(' ') + ' Pueden no reflejar cambios posteriores.'
    + (nOperador ? ` Incluye ${nOperador} elemento(s) dibujado(s) por operadores.` : '')
    + (nDesactivadas ? ` ${nDesactivadas} vía(s) oficial(es) desactivada(s) por un operador.` : '');
}

let contenidoActual = null;      // antes / durante / después de la amenaza actual (+ agregados de la zona)

async function dibujarInformacion() {
  const am = amenazaActual;
  try { contenidoActual = await cargarContenido(am.contenido, am.def?.info_zona); }
  catch { contenidoActual = null; }
  if (amenazaActual !== am) return;     // cambió mientras cargaba
  pintarInformacion($('informacion'), am, contenidoActual);
  if ($('ruta-info').classList.contains('precaucion')) mostrarPrecaucion(null);
}

// ---------------------------------------------------------------- Selección de zona y amenaza

function llenarSelectorZonas() {
  $('selector-zona').innerHTML =
    zonas().map(z => `<option value="${z.id}">${z.nombre}</option>`).join('') +
    '<option value="" disabled hidden>Fuera de cobertura</option>';
}

function llenarSelectorAmenazas() {
  const sel = $('selector-amenaza');
  const lista = zonaActual ? amenazasDe(zonaActual) : [];
  sel.innerHTML = lista.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');
  sel.disabled = lista.length === 0 || !!emergencia;   // fijo durante una emergencia
}

// Cambia la zona activa. moverPin=true cuando viene del desplegable (el pin va al centro).
async function activarZona(id, { moverPin = false, amenazaId = null } = {}) {
  const z = zonaPorId(id);
  zonaActual = z;
  $('selector-zona').value = z ? z.id : '';
  llenarSelectorAmenazas();
  if (!z) { await activarAmenaza(null); return; }
  const lista = amenazasDe(z);
  const elegida = lista.find(a => a.id === amenazaId) || lista[0] || null;
  $('selector-amenaza').value = elegida?.id || '';
  if (moverPin) centrarEn(z.centro, z.zoom);
  // Si el pin se va a mover, el diagnóstico se recalcula cuando llegue (evita rutas desde la zona anterior)
  await activarAmenaza(elegida?.id || null, { refrescar: !moverPin });
  if (moverPin) { ubicarPin(z.centro); marcarModo('simulacion'); }
}

async function activarAmenaza(id, { refrescar = true } = {}) {
  const mio = ++cargaId;
  ocultarRuta();
  rutaYaMostrada = false;
  error('');
  if (!zonaActual || !id) {
    amenazaActual = null; hayAreaPeligro = false;
    prepararAreas(null); prepararRutas({});
    mostrarCapas([]); dibujarLeyenda([]);
    $('fuente').textContent = '';
    contenidoActual = null;
    $('informacion').innerHTML = '<h2 class="info-titulo">Aún no cubrimos esta ubicación</h2><p class="info-vacio">Elige una zona en el desplegable o mueve el pin a una zona cubierta.</p>';
    if (refrescar) refrescarDiagnostico();
    return;
  }
  amenazaActual = { ...amenazaInfo(id), def: zonaActual.amenazas.find(a => a.id === id) };
  dibujarInformacion();
  let datos;
  try {
    datos = await cargarCapas(amenazaActual.def, fuente);
  } catch (e) {
    if (mio !== cargaId) return;
    error(`${e.message}. ¿Ejecutaste "node scripts/descargar_capas.mjs"?`);
    datos = { capas: [], porRol: {}, metadata: null };
  }
  if (mio !== cargaId) return;           // el usuario ya eligió otra cosa
  datosOficiales = datos;
  aplicarCapas();
  if (refrescar) refrescarDiagnostico();
}

// Combina capas oficiales (menos las vías desactivadas por el operador) con lo que dibujó el operador
// y prepara diagnóstico y rutas. Se llama al cambiar zona/amenaza y cada vez que el operador publica algo.
let datosOficiales = { capas: [], porRol: {}, metadata: null };
function aplicarCapas() {
  if (!zonaActual || !amenazaActual) return;
  const fc = (feats) => ({ type: 'FeatureCollection', features: feats });
  const off = codigosDesactivados(desactivacionesActuales(), zonaActual.id, amenazaActual.id);
  const capasOf = datosOficiales.capas.map(({ def, geo }) => def.rol === 'ruta' && off.size
    ? { def, geo: fc(geo.features.filter(f => !off.has(f.properties?.name))) } : { def, geo });
  const capasOp = capasOperador(elementosActuales(), zonaActual.id, amenazaActual.id);
  const capas = [...capasOf, ...capasOp];
  const porRol = {};
  for (const { def, geo } of capas) {
    const rol = def.operador && def.rol === 'ruta' ? 'ruta_operador' : def.rol;
    (porRol[rol] ||= fc([])).features.push(...geo.features);
  }
  const extras = capasOtrasAlertas();
  areasOtras = extras.flatMap(c => c.geo.features.map(f => ({ f, amenaza: c.amenaza })));
  capasConsulta = capasOf.filter(c => c.def.consulta || c.def.aviso);
  mostrarCapas([...capas, ...extras]);
  dibujarLeyenda([...capas, ...extras]);
  dibujarFuente(capasOf, datosOficiales.metadata, capasOp.reduce((n, c) => n + c.geo.features.length, 0), off.size);
  hayAreaPeligro = prepararAreas(porRol.area_peligro) > 0;
  prepararRutas(porRol, { area: amenazaActual.area, areasExtra: areasOtras.map(x => x.f) });
}

// ---- Varias alertas en la misma zona (spec §5.3): la ruta usa la amenaza de la alerta principal,
// pero se valida contra las áreas de peligro (oficiales y del operador) de TODAS las alertas activas
// de la zona, para no llevar a nadie de un peligro a otro. Esas áreas también se dibujan.
let areasOtras = [];                     // [{ f: Feature, amenaza }]
let firmaOtras = '';
const oficialesOtras = new Map();        // "zona/amenaza" → [{ def, geo }] | null (cargando)

function otrasAmenazasConAlerta() {
  if (!emergencia || !zonaActual || !amenazaActual) return [];
  return [...new Set(alertasActivas
    .filter(a => a.zona === zonaActual.id && a.amenaza !== amenazaActual.id)
    .map(a => a.amenaza))].sort();
}

function capasOtrasAlertas() {
  const amenazas = otrasAmenazasConAlerta();
  firmaOtras = amenazas.join(',');
  const capas = [];
  for (const am of amenazas) {
    const info = amenazaInfo(am);
    const clave = `${zonaActual.id}/${am}`;
    if (!oficialesOtras.has(clave)) cargarAreasOficiales(clave, zonaActual.amenazas.find(a => a.id === am));
    for (const c of oficialesOtras.get(clave) || []) {
      capas.push({ amenaza: am, def: { ...c.def, nombre: `${c.def.nombre} · ${info.nombre.toLowerCase()} (otra alerta)` }, geo: c.geo });
    }
    const op = elementosActuales().filter(e => e.rol === 'area_peligro' && e.zona === zonaActual.id && e.amenaza === am).map(aFeature);
    if (op.length) capas.push({ amenaza: am, def: { nombre: `Áreas de peligro (operador) · ${info.nombre.toLowerCase()}`, rol: 'area_peligro', visible: true, estilo: ROLES_OPERADOR.area_peligro.estilo, operador: true }, geo: { type: 'FeatureCollection', features: op } });
  }
  return capas;
}

async function cargarAreasOficiales(clave, def) {
  const defsArea = (def?.capas || []).filter(c => c.rol === 'area_peligro');
  if (!defsArea.length) { oficialesOtras.set(clave, []); return; }
  oficialesOtras.set(clave, null);
  try {
    const datos = await cargarCapas({ carpeta: def.carpeta, capas: defsArea }, fuente);
    oficialesOtras.set(clave, datos.capas);
  } catch { oficialesOtras.set(clave, []); }
  if (emergencia && zonaActual && clave.startsWith(`${zonaActual.id}/`)) { aplicarCapas(); refrescarDiagnostico(); }
}

// Si la persona está dentro del área de peligro de OTRA alerta activa de la zona, debe evacuar igual.
function otraAreaQueContiene(latlng) {
  if (!latlng || !areasOtras.length) return null;
  const pt = turf.point([latlng.lng, latlng.lat]);
  return areasOtras.find(x => turf.booleanPointInPolygon(pt, x.f)) || null;
}

// Valor de las capas con "consulta" en el punto: en polígonos, el valor del que contiene el punto
// (p. ej. recurrencia de incendios 2020–2024); en puntos, el más cercano (p. ej. punto crítico de lluvias).
let capasConsulta = [];
const RADIO_CERCANO_M = 3000;
const RADIO_CERCANO_POLIGONO_M = 20000;   // depósitos de relaves: interesa saber si hay uno a pocos km
// Distancia (m) de un punto al borde de un polígono o multipolígono (todos sus anillos).
function distanciaAPoligono(pt, ft) {
  if (!ft._anillos) ft._anillos = turf.flatten(turf.polygonToLine(ft)).features;
  return Math.min(...ft._anillos.map(l => turf.pointToLineDistance(pt, l, { units: 'meters' })));
}

function filaCercano(q, p, d) {
  const det = q.detalle && p[q.detalle] ? String(p[q.detalle]) : '';
  const detalle = det ? ` (${escaparHTML(q.detalle_minusculas ? det.toLowerCase() : det)})` : '';
  return `${q.etiqueta}: <strong>${escaparHTML(String(p[q.campo] ?? 'sin nombre'))}</strong>, a ${fmtDist(d)}${detalle}.`;
}
function consultasEn(latlng) {
  if (!latlng) return [];
  const pt = turf.point([latlng.lng, latlng.lat]);
  const filas = [];
  for (const { def, geo } of capasConsulta) {
    const q = def.consulta;
    if (!q) continue;
    const puntos = geo.features.filter(ft => ft.geometry?.type === 'Point');
    if (puntos.length) {
      let mejor = null;
      for (const ft of puntos) {
        const d = turf.distance(pt, ft.geometry.coordinates, { units: 'meters' });
        if (!mejor || d < mejor.d) mejor = { ft, d };
      }
      if (!mejor || mejor.d > RADIO_CERCANO_M) { filas.push(`${q.etiqueta}: ninguno a menos de ${fmtDist(RADIO_CERCANO_M)}.`); continue; }
      filas.push(filaCercano(q, mejor.ft.properties || {}, mejor.d));
      continue;
    }
    const f = geo.features.find(ft => {
      const [o, s, e, n] = ft._bbox || (ft._bbox = turf.bbox(ft));
      return latlng.lng >= o && latlng.lng <= e && latlng.lat >= s && latlng.lat <= n && turf.booleanPointInPolygon(pt, ft);
    });
    // Polígonos con "cercano": si el punto no está dentro de ninguno, el más cercano (p. ej. un depósito de relaves)
    if (!f && q.cercano) {
      let mejor = null;
      for (const ft of geo.features) {
        if (!ft.geometry || !/Polygon/.test(ft.geometry.type)) continue;
        const d = distanciaAPoligono(pt, ft);
        if (!mejor || d < mejor.d) mejor = { ft, d };
      }
      filas.push(mejor && mejor.d <= RADIO_CERCANO_POLIGONO_M
        ? filaCercano(q, mejor.ft.properties || {}, mejor.d)
        : `${q.etiqueta}: ninguno a menos de ${fmtDist(RADIO_CERCANO_POLIGONO_M)}.`);
      continue;
    }
    const v = f?.properties?.[q.campo];
    filas.push(v != null
      ? (q.cercano ? `${q.etiqueta}: <strong>${escaparHTML(String(v))}</strong> (estás dentro).` : `${q.etiqueta} en este punto: <strong>${escaparHTML(String(v))}</strong>.`)
      : `${q.etiqueta}: sin registro en este punto.`);
  }
  return filas;
}

// ---------------------------------------------------------------- Diagnóstico

function pintarEstado(clase, titulo, texto, detalle = []) {
  $('estado').className = `estado ${clase}`;
  $('estado-titulo').textContent = titulo;
  $('estado-texto').textContent = texto;
  $('estado-detalle').innerHTML = detalle.map(d => `<div>${d}</div>`).join('');
}

function mostrarDiagnostico(latlng, precision) {
  if (!zonaActual) {
    pintarEstado('neutro', 'Fuera de cobertura', 'Aún no cubrimos esta ubicación. Elige una zona en el desplegable.');
    return { estado: 'fuera_cobertura' };
  }
  const otra = emergencia ? otraAreaQueContiene(latlng) : null;
  if (otra) {
    const am = amenazaInfo(otra.amenaza);
    pintarEstado('peligro', 'Debes evacuar', `Estás dentro de la ${am.area} (alerta de ${am.nombre.toLowerCase()}). Dirígete a pie a la zona segura.`);
    return { estado: 'evacuar' };
  }
  if (!hayAreaPeligro && emergencia && hayRutasOperador()) {
    pintarEstado('peligro', 'Evacúa por la ruta marcada', 'Un operador marcó la ruta de evacuación para esta emergencia.');
    return { estado: 'sin_mapa' };
  }
  if (!hayAreaPeligro) {
    // Puede haber capas oficiales de referencia (p. ej. recurrencia de incendios) aunque no haya área a evacuar
    const aviso = capasConsulta.find(c => c.def.aviso)?.def.aviso;
    const hayReferencia = capasConsulta.length > 0;
    pintarEstado('neutro',
      hayReferencia ? (emergencia ? 'Sin área de peligro marcada' : 'Sin área de evacuación oficial') : 'Sin mapa de amenaza para esta zona',
      emergencia
        ? 'Sigue estas indicaciones oficiales.'
        : aviso || `No hay un mapa oficial de ${amenazaActual.nombre.toLowerCase()} para ${zonaActual.nombre}. Revisa la información de abajo.`,
      emergencia ? [] : consultasEn(latlng));
    return { estado: 'sin_mapa' };
  }
  const r = diagnosticar(latlng ? [latlng.lng, latlng.lat] : null, precision);
  const t = textosDiagnostico(amenazaActual.area, !!emergencia)[r.estado];
  const detalle = [...r.advertencias];
  if (r.estado !== 'sin_ubicacion' && Number.isFinite(r.distanciaBorde)) {
    detalle.push(r.dentro
      ? `Distancia al borde del área: ${fmtDist(r.distanciaBorde)}.`
      : `A ${fmtDist(r.distanciaBorde)} de la ${amenazaActual.area}${r.comuna ? ` (${r.comuna})` : ''}.`);
  }
  if (!emergencia) detalle.push(...consultasEn(latlng));   // p. ej. "Peligro volcánico en este punto: Alto"
  if (precision != null) detalle.push(`Precisión GPS: ±${Math.round(precision)} m.`);
  pintarEstado(t.clase, t.titulo, t.texto, detalle);
  return r;
}

function refrescarDiagnostico() {
  const p = posicionActual();
  if (!p) return;
  const r = mostrarDiagnostico(p, null);
  actualizarRuta(p, r.estado, true);
}

// La ruta personal solo se muestra durante una alerta (en informativo se ven las capas oficiales).

// ---------------------------------------------------------------- Ruta

let ultimoOrigenRuta = null;
let rutaYaMostrada = false;   // encuadrar solo la primera ruta; luego no mover el mapa sin necesidad
let rutaAbort = null;
const DISTANCIA_RECALCULO_M = 25;   // con GPS, recalcular solo si te moviste esto

function ocultarRuta() {
  rutaAbort?.abort(); rutaAbort = null;
  ultimoOrigenRuta = null;
  limpiarRuta();
  $('ruta-info').hidden = true;
}

function mostrarInfoRuta(r) {
  const el = $('ruta-info');
  // Con áreas de otras alertas, "metrosDentro" cuenta todas: se nombran en genérico
  const area = areasOtras.length ? 'zona de peligro' : amenazaActual.area;
  el.hidden = false;
  el.classList.remove('precaucion');
  if (r.tipo === 'sin_candidatos') { mostrarPrecaucion(r.aviso); return; }
  if (r.tipo === 'operador') {
    const p = r.via.properties || {};
    const min = Math.max(1, Math.round((Date.now() - new Date(p.creado)) / 60000));
    const hace = min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
    const pasos = [];
    if (r.acercamientoM >= 10) pasos.push(`Camina ${fmtDist(r.acercamientoM)} hasta la ruta marcada.`);
    pasos.push(`Síguela ${fmtDist(r.oficialM)}${r.destino ? ` hasta el ${nombreDestino(r.destino)}` : ''}.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta verificada por operador${p.nombre ? ` · ${escaparHTML(p.nombre)}` : ''}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${pasos.map(d => `<div>${d}</div>`).join('')}${p.motivo && p.motivo !== 'Sin especificar' ? `<div>Motivo: ${escaparHTML(p.motivo)}</div>` : ''}</div>
      <div class="ruta-aviso">Marcada ${hace} por ${escaparHTML(p.autor || 'un operador')} ${p.fuente_texto && p.fuente_texto !== 'Sin especificar' ? ` · fuente: ${escaparHTML(p.fuente_texto)}` : ''}</div>`;
    return;
  }
  if (r.tipo === 'oficial') {
    const detalle = [];
    if (r.acercamientoM >= 10) detalle.push(`1. Camina ${fmtDist(r.acercamientoM)} hasta la vía de evacuación oficial${r.tramos[0].tipo === 'acercamiento_recto' ? ' (tramo en línea recta)' : ''}.`);
    const hasta = r.destino ? `hasta el ${nombreDestino(r.destino)}` : 'hasta cruzar a la zona segura';
    if (r.oficialM < 20) {
      // la mejor opción es llegar directo al final de la vía (ya en zona segura)
      detalle.length = 0;
      detalle.push(`Camina ${fmtDist(r.acercamientoM)} hasta el final de la vía de evacuación oficial${r.destino ? `, en el ${nombreDestino(r.destino)}` : ', en zona segura'}.`);
    } else {
      detalle.push(r.acercamientoM >= 10
        ? `2. Síguela ${fmtDist(r.oficialM)} ${hasta}.`
        : `Sigue la vía de evacuación oficial ${fmtDist(r.oficialM)} ${hasta}.`);
    }
    if (r.metrosDentro > 0 && !r.terminaDentro) detalle.push(`Sales de la ${area} en ~${fmtDist(r.metrosDentro)}.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta oficial ${organismoDe(r.via)} · vía ${nombreVia(r.via)}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${detalle.map(d => `<div>${d}</div>`).join('')}</div>
      ${notaDestinoDentro(r, area)}
      ${r.aviso ? `<div class="ruta-aviso">${r.aviso}</div>` : ''}`;
    return;
  }
  const destino = nombreDestino(r.destino);
  if (r.tipo === 'ruta') {
    const detalle = [];
    const paso = r.pasos.find(p => p.instruction)?.instruction;
    if (paso) detalle.push(`Primer paso: ${paso}.`);
    if (r.metrosDentro > 0 && !r.terminaDentro) detalle.push(`Sales de la ${area} en ~${fmtDist(r.metrosDentro)}.`);
    if (r.fraccionVias > 0) detalle.push(`${Math.round(r.fraccionVias * 100)}% del trayecto va por vías de evacuación oficiales.`);
    if (r.descartadas) detalle.push(`Se descartaron ${r.descartadas} ruta(s) que volvían a entrar a la ${area}.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta sugerida a ${destino}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${detalle.map(d => `<div>${d}</div>`).join('')}</div>
      ${notaDestinoDentro(r, area)}
      <div class="ruta-aviso">Sugerida automáticamente por calles peatonales (OpenStreetMap), no verificada por un operador.</div>`;
  } else {
    el.innerHTML = `
      <div class="ruta-titulo">Dirección a ${destino}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>en línea recta</span></div>
        <div><strong>${rumboATexto(r.rumbo)}</strong><span>dirección</span></div>
      </div>
      <div class="ruta-aviso">${r.aviso}</div>`;
  }
}

// Punto de encuentro oficial que la autoridad ubica dentro del área (p. ej. un punto de encuentro
// transitorio en Pucón): se avisa, también en la pantalla mínima de emergencia.
function notaDestinoDentro(r, area) {
  return r.terminaDentro
    ? `<div class="ruta-aviso">El punto de encuentro es oficial, pero queda dentro de la ${area}: al llegar, sigue las instrucciones de la autoridad.</div>` : '';
}

// Modo precaución (spec §5.4): sin ruta válida, solo las indicaciones "durante" oficiales.
function mostrarPrecaucion(motivo) {
  limpiarRuta();
  const el = $('ruta-info');
  el.hidden = false;
  el.classList.add('precaucion');
  el.innerHTML = htmlPrecaucion(amenazaActual, contenidoActual, motivo);
}

async function actualizarRuta(latlng, estado, forzar) {
  if (!emergencia) { ocultarRuta(); return; }
  // Sin área de peligro: si el operador dibujó rutas, se guía por ellas (spec §5.3); si no, precaución.
  if (estado === 'sin_mapa' && !hayRutasOperador()) { mostrarPrecaucion(null); return; }
  if (estado !== 'evacuar' && estado !== 'limite' && estado !== 'sin_mapa') { ocultarRuta(); return; }
  const origen = [latlng.lng, latlng.lat];
  if (!forzar && ultimoOrigenRuta && turf.distance(ultimoOrigenRuta, origen, { units: 'meters' }) < DISTANCIA_RECALCULO_M) return;
  ultimoOrigenRuta = origen;
  rutaAbort?.abort();
  const ctrl = rutaAbort = new AbortController();
  const el = $('ruta-info');
  el.hidden = false;
  el.innerHTML = '<div class="ruta-cargando">Calculando ruta al punto de encuentro…</div>';
  try {
    const r = await calcularRuta(origen, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    dibujarRuta(r, { encuadrar: forzar && !rutaYaMostrada });
    rutaYaMostrada = true;
    mostrarInfoRuta(r);
  } catch (e) {
    if (e.name === 'AbortError') return;
    el.innerHTML = `<div class="ruta-aviso">No se pudo calcular la ruta: ${e.message}</div>`;
  }
}

// ---------------------------------------------------------------- Posición (pin / GPS)

async function alCambiarPosicion(latlng, precision, arrastrando) {
  // Mientras se arrastra: solo diagnóstico (a lo más una vez por cuadro) y sin ruta.
  if (arrastrando) {
    if (ultimoOrigenRuta) ocultarRuta();
    if (pendienteRAF) return;
    pendienteRAF = requestAnimationFrame(() => { pendienteRAF = null; mostrarDiagnostico(latlng, precision); });
    return;
  }
  // El punto decide la zona: si cayó en otra zona (o fuera de cobertura), cambiarla.
  if (latlng) {
    const z = zonaEn([latlng.lng, latlng.lat], emergencia?.zona);   // durante una alerta manda su zona
    if ((z?.id || null) !== (zonaActual?.id || null)) {
      await activarZona(z?.id || null, { amenazaId: emergencia?.zona === z?.id ? emergencia.amenaza : null });
      evaluarAlertas();
      return;
    }
  }
  evaluarAlertas();
  const r = mostrarDiagnostico(latlng, precision);
  if (latlng) actualizarRuta(latlng, r.estado, precision == null);  // pin: siempre; GPS: si te moviste
  else ocultarRuta();
}

function marcarModo(m) {
  $('btn-simulacion').classList.toggle('activo', m === 'simulacion');
  $('btn-gps').classList.toggle('activo', m === 'gps');
}

function seleccionarModo(m) {
  marcarModo(m);
  if (m === 'simulacion') modoSimulacion(zonaActual?.centro || zonas()[0].centro);
  else modoGPS((msg, codigo) => { error(msg); if (codigo === 1) seleccionarModo('simulacion'); });
}

// ---------------------------------------------------------------- Alertas y modo emergencia (spec §5.1, §5.3)

let alertasActivas = [];
let emergencia = null;          // alerta principal que se está mostrando

function zonaContiene(zonaId, latlng) {
  const z = zonaPorId(zonaId);
  return !!(z?.cobertura && latlng && turf.booleanPointInPolygon([latlng.lng, latlng.lat], z.cobertura));
}

// Decide localmente qué alertas aplican: las de las zonas donde está la ubicación real O el pin.
function evaluarAlertas() {
  const pinLL = posicionActual();
  const realLL = ubicacionReal()?.latlng || null;
  const aplican = alertasActivas
    .map(a => ({ a, porReal: zonaContiene(a.zona, realLL), porPin: zonaContiene(a.zona, pinLL) }))
    .filter(x => x.porReal || x.porPin)
    // Manda la de la ubicación real (ahí corre peligro la persona); luego la más reciente
    .sort((x, y) => (y.porReal - x.porReal) || (new Date(y.a.creada) - new Date(x.a.creada)));
  const principal = aplican[0] || null;
  dibujarBanner(principal, aplican.slice(1));
  if (!principal) { if (emergencia) salirEmergencia(); return; }
  if (emergencia?.id !== principal.a.id) { entrarEmergencia(principal); return; }
  // Misma alerta principal, pero cambiaron las otras alertas de la zona: revalidar la ruta
  if (otrasAmenazasConAlerta().join(',') !== firmaOtras) { aplicarCapas(); refrescarDiagnostico(); }
}

async function entrarEmergencia({ a, porReal }) {
  emergencia = a;
  document.body.classList.add('modo-emergencia');
  setModoMapa(true);
  $('selector-zona').disabled = true;
  $('selector-amenaza').disabled = true;
  rutaYaMostrada = false;
  const z = zonaPorId(a.zona);
  await activarZona(a.zona, { amenazaId: a.amenaza, moverPin: false });
  $('selector-amenaza').disabled = true;           // activarZona lo rehabilita al llenarlo
  if (porReal) seleccionarModo('gps');              // la ruta sale de la ubicación real
  else if (z) centrarEn(posicionActual() || z.centro, Math.max(mapa.getZoom(), z.zoom));
}

function salirEmergencia() {
  emergencia = null;
  firmaOtras = '';
  document.body.classList.remove('modo-emergencia');
  setModoMapa(false);
  ocultarRuta();
  $('selector-zona').disabled = false;
  llenarSelectorAmenazas();
  if (amenazaActual) $('selector-amenaza').value = amenazaActual.id;
  refrescarDiagnostico();
}

function dibujarBanner(principal, otras) {
  const el = $('banner-alerta');
  if (!principal) { el.hidden = true; el.innerHTML = ''; return; }
  const a = principal.a;
  const am = amenazaInfo(a.amenaza);
  const z = zonaPorId(a.zona);
  const hasta = new Date(a.vigente_hasta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  el.hidden = false;
  el.innerHTML = `
    <div class="banner-fila">
      ${a.simulacro ? '<span class="etiqueta-simulacro">SIMULACRO</span>' : ''}
      <strong>Alerta de ${am.nombre.toLowerCase()} · ${z?.nombre || a.zona}</strong>
    </div>
    ${a.mensaje ? `<div class="banner-mensaje">${escaparHTML(a.mensaje)}</div>` : ''}
    <div class="banner-pie">Emitida por el operador · vigente hasta las ${hasta}${principal.porReal ? ' · aplica a tu ubicación actual' : ''}</div>
    ${otras.map(o => `<div class="banner-otra">También: alerta de ${amenazaInfo(o.a.amenaza).nombre.toLowerCase()} en ${zonaPorId(o.a.zona)?.nombre || o.a.zona}${o.porReal ? ' (tu ubicación)' : ' (zona que estás mirando)'}</div>`).join('')}`;
}

const escaparHTML = (t) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mostrarEstadoAlertas(estado) {
  const textos = { ok: 'Conectado al sistema de alertas', error: 'Sin conexión al sistema de alertas (reintentando)', sin_configurar: 'Sistema de alertas no configurado' };
  const el = $('estado-alertas');
  el.textContent = textos[estado] || '';
  el.className = `estado-alertas ${estado}`;
}

// ---------------------------------------------------------------- Inicio

async function iniciar() {
  mapa = crearMapa('mapa');
  onCambioCapas(() => dibujarLeyenda());
  try {
    await cargarCatalogo();
  } catch (e) {
    error(`No se pudo cargar el catálogo de zonas: ${e.message}`);
    return;
  }
  iniciarPosicion(mapa, {
    onPin: alCambiarPosicion,
    // "Usar mi ubicación": solo sigue al GPS dentro de una zona cubierta; fuera, se queda en el último lugar del pin
    dentroDeCobertura: (ll) => !!zonaEn([ll.lng, ll.lat]),
    onAvisoGPS: (fuera) => {
      const el = $('aviso-gps');
      el.hidden = !fuera;
      el.textContent = fuera
        ? `Tu ubicación está fuera de las zonas que cubrimos. Sigues viendo ${zonaActual?.nombre || 'el último lugar del pin'}. Cuando entres a una zona cubierta, la app te seguirá.`
        : '';
    },
    onReal: () => evaluarAlertas(),
    onErrorGPS: (msg, codigo) => { if (codigo === 1) error(msg); },
  });
  crearControlBrujula(mapa, {
    onRumbo: (rumbo, bearing) => setLinterna(rumbo, bearing),
    onError: (msg) => error(msg),
    onActivar: () => { const p = posicionActual(); if (p) mapa.setView(p, Math.max(mapa.getZoom(), 16)); },
    centro: () => posicionActual(),
    pausado: () => pinArrastrando(),
    onModo: (m) => bloquearPin(m === 'brujula'),
  });
  $('btn-simulacion').addEventListener('click', () => seleccionarModo('simulacion'));
  $('btn-gps').addEventListener('click', () => seleccionarModo('gps'));
  $('diagnostico').hidden = false;   // el panel (modos, estado, ruta) siempre visible
  llenarSelectorZonas();
  $('selector-zona').addEventListener('change', (e) => { if (!emergencia) activarZona(e.target.value, { moverPin: true }); });
  $('selector-amenaza').addEventListener('change', (e) => activarAmenaza(e.target.value));
  await activarZona(zonas()[0].id, { moverPin: true });
  iniciarGPSSiHayPermiso();          // ubicación real en segundo plano si ya había permiso
  escucharOperador(() => { aplicarCapas(); rutaYaMostrada = true; refrescarDiagnostico(); });
  escucharAlertas({
    onCambio: (lista) => { alertasActivas = lista; evaluarAlertas(); },
    onEstado: mostrarEstadoAlertas,
  });
}

iniciar();
