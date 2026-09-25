// Punto de entrada: selector de escenario, carga de datos, ficha, leyenda y diagnóstico.
import { ESCENARIOS, ESCENARIO_INICIAL, ESTILOS } from './config.js?v=5';
import { cargarEscenario } from './datos.js?v=5';
import { crearMapa, mostrarEscenario, mostrarVacio, dibujarRuta, limpiarRuta } from './mapa.js?v=5';
import { prepararRutas, calcularRuta, nombreDestino, rumboATexto } from './ruta.js?v=5';
import { prepararAreas, diagnosticar, TEXTOS } from './diagnostico.js?v=5';
import { iniciarPosicion, modoSimulacion, modoGPS, quitarPin, setLinterna, posicionActual } from './posicion.js?v=5';
import { crearControlBrujula, activarNorte } from './brujula.js?v=5';

const $ = (id) => document.getElementById(id);
let escenarioActual = null;
let mapa = null;
let pendienteRAF = null;

function error(msg) {
  const el = $('mensaje-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function dibujarLeyenda(escenario) {
  $('leyenda').innerHTML = escenario.capas.map(c => {
    const e = ESTILOS[c.estilo || c.archivo] || {};
    let muestra;
    if (c.tipo === 'poligono') muestra = `<span class="muestra" style="background:${e.fillColor};opacity:.6;border:1px solid ${e.color}"></span>`;
    else if (c.tipo === 'punto') muestra = `<span class="muestra punto" style="background:${e.fillColor}"></span>`;
    else muestra = `<span class="muestra linea" style="border-top-color:${e.color};border-top-style:${e.dashArray ? 'dashed' : 'solid'}"></span>`;
    return `<li>${muestra}${c.nombre}</li>`;
  }).join('');
}

function dibujarFuente(escenario, metadata) {
  if (escenario.origenDatos === 'propio') {
    $('fuente').textContent = 'Zonas de seguridad: levantamiento propio del equipo, no validado por la universidad.';
    return;
  }
  if (!metadata) { $('fuente').textContent = 'Fuente: SENAPRED.'; return; }
  const fecha = new Date(metadata.fecha_descarga).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  $('fuente').textContent = `Fuente: ${metadata.fuente}. Publicación ${metadata.fecha_publicacion_fuente}; datos descargados el ${fecha}. Pueden no reflejar cambios posteriores.`;
}

// ---- Diagnóstico ----
const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;

function mostrarDiagnostico(latlng, precision) {
  const r = diagnosticar(latlng ? [latlng.lng, latlng.lat] : null, precision);
  const t = TEXTOS[r.estado];
  const caja = $('estado');
  caja.className = `estado ${t.clase}`;
  $('estado-titulo').textContent = t.titulo;
  $('estado-texto').textContent = t.texto;
  const detalle = [...r.advertencias];
  if (r.estado !== 'sin_ubicacion' && Number.isFinite(r.distanciaBorde)) {
    detalle.push(r.dentro
      ? `Distancia al borde del área: ${fmtDist(r.distanciaBorde)}.`
      : `A ${fmtDist(r.distanciaBorde)} del área a evacuar${r.comuna ? ` (${r.comuna})` : ''}.`);
  }
  if (precision != null) detalle.push(`Precisión GPS: ±${Math.round(precision)} m.`);
  $('estado-detalle').innerHTML = detalle.map(d => `<div>${d}</div>`).join('');
  return r;
}

// ---- Ruta (etapa 3) ----
let ultimoOrigenRuta = null;
let rutaYaMostrada = false;   // encuadrar solo la primera ruta; luego no mover el mapa sin necesidad
let rutaAbort = null;
const DISTANCIA_RECALCULO_M = 25;   // con GPS, recalcular solo si te moviste esto
const fmtMin = (s) => `${Math.max(1, Math.round(s / 60))} min`;

function ocultarRuta() {
  rutaAbort?.abort(); rutaAbort = null;
  ultimoOrigenRuta = null;
  limpiarRuta();
  $('ruta-info').hidden = true;
}

function mostrarInfoRuta(r) {
  const el = $('ruta-info');
  el.hidden = false;
  if (r.tipo === 'sin_candidatos') {
    el.innerHTML = `<div class="ruta-titulo">Sin punto de encuentro cercano</div><div class="ruta-aviso">${r.aviso}</div>`;
    return;
  }
  const destino = nombreDestino(r.destino);
  if (r.tipo === 'ruta') {
    const detalle = [];
    if (r.metrosDentro > 0) detalle.push(`Sales de la zona de inundación en ~${fmtDist(r.metrosDentro)}.`);
    if (r.fraccionVias > 0) detalle.push(`${Math.round(r.fraccionVias * 100)}% del trayecto va por vías de evacuación oficiales.`);
    const paso = r.pasos.find(p => p.instruction)?.instruction;
    if (paso) detalle.push(`Primer paso: ${paso}.`);
    if (r.descartadas) detalle.push(`Se descartaron ${r.descartadas} ruta(s) que volvían a entrar a la zona.`);
    el.innerHTML = `
      <div class="ruta-titulo">Ruta a ${destino}</div>
      <div class="ruta-cifras">
        <div><strong>${fmtDist(r.distancia)}</strong><span>a pie</span></div>
        <div><strong>${fmtMin(r.duracion)}</strong><span>caminando</span></div>
      </div>
      <div class="ruta-detalle">${detalle.map(d => `<div>${d}</div>`).join('')}</div>`;
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

async function actualizarRuta(latlng, estado, forzar) {
  if (estado !== 'evacuar' && estado !== 'limite') { ocultarRuta(); return; }
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

function alCambiarPosicion(latlng, precision, arrastrando) {
  // Mientras se arrastra: solo diagnóstico (a lo más una vez por cuadro) y sin ruta.
  if (arrastrando) {
    if (ultimoOrigenRuta) ocultarRuta();
    if (pendienteRAF) return;
    pendienteRAF = requestAnimationFrame(() => { pendienteRAF = null; mostrarDiagnostico(latlng, precision); });
    return;
  }
  const r = mostrarDiagnostico(latlng, precision);
  if (latlng) actualizarRuta(latlng, r.estado, precision == null);  // pin: siempre; GPS: si te moviste
  else ocultarRuta();
}

function seleccionarModo(m) {
  $('btn-simulacion').classList.toggle('activo', m === 'simulacion');
  $('btn-gps').classList.toggle('activo', m === 'gps');
  if (m === 'simulacion') modoSimulacion(escenarioActual.centro);
  else modoGPS((msg) => { error(msg); mostrarDiagnostico(null, null); seleccionarModo('simulacion'); });
}

// ---- Escenarios ----
async function activarEscenario(clave) {
  const esc = ESCENARIOS[clave];
  escenarioActual = esc;
  activarNorte();
  ocultarRuta();
  rutaYaMostrada = false;
  quitarPin();
  $('diagnostico').hidden = true;
  $('ficha-titulo').textContent = 'Qué hacer si suena la alarma';
  $('ficha-texto').textContent = esc.ficha;
  dibujarLeyenda(esc);
  error('');
  if (esc.pendiente) {
    mostrarVacio(esc);
    $('fuente').textContent = '';
    error('Este escenario todavía no tiene datos: faltan las zonas de seguridad del campus.');
    return;
  }
  try {
    const datos = await cargarEscenario(esc);
    mostrarEscenario(esc, datos);
    dibujarFuente(esc, datos.metadata);
    prepararRutas(datos.capas);
    if (prepararAreas(datos.capas.area_evacuar) > 0) {
      $('diagnostico').hidden = false;
      mapa.invalidateSize(false);            // el panel achica el mapa en el celular
      mapa.setView(esc.centro, esc.zoom);
      seleccionarModo('simulacion');
    }
  } catch (e) {
    mostrarVacio(esc);
    error(`${e.message}. ¿Ejecutaste "node scripts/descargar_capas.mjs"?`);
  }
}

function iniciar() {
  mapa = crearMapa('mapa');
  iniciarPosicion(mapa, alCambiarPosicion);
  crearControlBrujula(mapa, {
    onRumbo: (rumbo, bearing) => setLinterna(rumbo, bearing),
    onError: (msg) => error(msg),
    onActivar: () => { const p = posicionActual(); if (p) mapa.setView(p, Math.max(mapa.getZoom(), 16)); },
  });
  $('btn-simulacion').addEventListener('click', () => seleccionarModo('simulacion'));
  $('btn-gps').addEventListener('click', () => seleccionarModo('gps'));
  const sel = $('selector-escenario');
  sel.innerHTML = Object.entries(ESCENARIOS)
    .map(([k, e]) => `<option value="${k}">${e.nombre}${e.pendiente ? ' (pendiente)' : ''}</option>`).join('');
  sel.value = ESCENARIO_INICIAL;
  sel.addEventListener('change', () => activarEscenario(sel.value));
  activarEscenario(ESCENARIO_INICIAL);
}

iniciar();
