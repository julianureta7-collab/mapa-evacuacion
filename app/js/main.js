// Punto de entrada de la app usuario.
// Zonas × amenazas desde data/catalogo.json (spec §3). El pin decide la zona (spec §5.1):
// al elegir una zona en el desplegable el pin va a su centro, y al arrastrar el pin a otra zona
// la app cambia de zona sola.
import { cargarCatalogo, zonas, zona as zonaPorId, amenazasDe, amenazaInfo, fuente, estiloDe, zonaEn } from './catalogo.js?v=14';
import { cargarCapas } from './datos.js?v=14';
import { crearMapa, mostrarCapas, centrarEn, dibujarRuta, limpiarRuta, setModoMapa } from './mapa.js?v=14';
import { prepararRutas, calcularRuta, nombreDestino, nombreVia, organismoDe, rumboATexto, hayRutasOperador } from './ruta.js?v=14';
import { escucharOperador, capasOperador, codigosDesactivados, elementosActuales, desactivacionesActuales } from './capasOperador.js?v=14';
import { prepararAreas, diagnosticar, textosDiagnostico } from './diagnostico.js?v=14';
import { iniciarPosicion, iniciarGPSSiHayPermiso, modoSimulacion, modoGPS, ubicarPin, setLinterna, posicionActual, ubicacionReal, pinArrastrando, bloquearPin } from './posicion.js?v=14';
import { escucharAlertas } from './alertas.js?v=14';
import { cargarContenido, dibujarInformacion as pintarInformacion, htmlPrecaucion } from './informacion.js?v=14';
import { crearControlBrujula } from './brujula.js?v=14';

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

function dibujarLeyenda(capas) {
  $('leyenda').innerHTML = capas.map(({ def }) => {
    const e = estiloDe(def);
    let muestra;
    if (def.rol === 'area_peligro') muestra = `<span class="muestra" style="background:${e.fillColor};opacity:.6;border:1px solid ${e.color}"></span>`;
    else if (def.rol === 'punto_encuentro') muestra = `<span class="muestra punto" style="background:${e.fillColor}"></span>`;
    else muestra = `<span class="muestra linea" style="border-top-color:${e.color};border-top-style:${e.dashArray ? 'dashed' : 'solid'}"></span>`;
    return `<li>${muestra}${def.nombre}</li>`;
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
  mostrarCapas(capas);
  dibujarLeyenda(capas);
  dibujarFuente(capasOf, datosOficiales.metadata, capasOp.reduce((n, c) => n + c.geo.features.length, 0), off.size);
  hayAreaPeligro = prepararAreas(porRol.area_peligro) > 0;
  prepararRutas(porRol, { area: amenazaActual.area });
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
  if (!hayAreaPeligro && emergencia && hayRutasOperador()) {
    pintarEstado('peligro', 'Evacúa por la ruta marcada', 'Un operador marcó la ruta de evacuación para esta emergencia.');
    return { estado: 'sin_mapa' };
  }
  if (!hayAreaPeligro) {
    pintarEstado('neutro', 'Sin mapa de amenaza para esta zona', emergencia
      ? 'Sigue estas indicaciones oficiales.'
      : `No hay un mapa oficial de ${amenazaActual.nombre.toLowerCase()} para ${zonaActual.nombre}. Revisa la información de abajo.`);
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
  const area = amenazaActual.area;
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
      <div class="ruta-detalle">${pasos.map(d => `<div>${d}</div>`).join('')}<div>Motivo: ${escaparHTML(p.motivo || '')}</div></div>
      <div class="ruta-aviso">Marcada ${hace} por ${escaparHTML(p.autor || 'un operador')} · fuente: ${escaparHTML(p.fuente_texto || '')}</div>`;
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
    if (r.metrosDentro > 0) detalle.push(`Sales de la ${area} en ~${fmtDist(r.metrosDentro)}.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta oficial ${organismoDe(r.via)} · vía ${nombreVia(r.via)}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${detalle.map(d => `<div>${d}</div>`).join('')}</div>
      ${r.aviso ? `<div class="ruta-aviso">${r.aviso}</div>` : ''}`;
    return;
  }
  const destino = nombreDestino(r.destino);
  if (r.tipo === 'ruta') {
    const detalle = [];
    const paso = r.pasos.find(p => p.instruction)?.instruction;
    if (paso) detalle.push(`Primer paso: ${paso}.`);
    if (r.metrosDentro > 0) detalle.push(`Sales de la ${area} en ~${fmtDist(r.metrosDentro)}.`);
    if (r.fraccionVias > 0) detalle.push(`${Math.round(r.fraccionVias * 100)}% del trayecto va por vías de evacuación oficiales.`);
    if (r.descartadas) detalle.push(`Se descartaron ${r.descartadas} ruta(s) que volvían a entrar a la ${area}.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta sugerida a ${destino}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${detalle.map(d => `<div>${d}</div>`).join('')}</div>
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
    const z = zonaEn([latlng.lng, latlng.lat]);
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
  if (emergencia?.id !== principal.a.id) entrarEmergencia(principal);
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
  try {
    await cargarCatalogo();
  } catch (e) {
    error(`No se pudo cargar el catálogo de zonas: ${e.message}`);
    return;
  }
  iniciarPosicion(mapa, {
    onPin: alCambiarPosicion,
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
