// Punto de entrada: selector de escenario, carga de datos, ficha, leyenda y diagnóstico.
import { ESCENARIOS, ESCENARIO_INICIAL, ESTILOS } from './config.js?v=4';
import { cargarEscenario } from './datos.js?v=4';
import { crearMapa, mostrarEscenario, mostrarVacio } from './mapa.js?v=4';
import { prepararAreas, diagnosticar, TEXTOS } from './diagnostico.js?v=4';
import { iniciarPosicion, modoSimulacion, modoGPS, quitarPin, setLinterna, posicionActual } from './posicion.js?v=4';
import { crearControlBrujula, activarNorte } from './brujula.js?v=4';

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
}

function alCambiarPosicion(latlng, precision, arrastrando) {
  // Mientras se arrastra, recalcular a lo más una vez por cuadro
  if (arrastrando) {
    if (pendienteRAF) return;
    pendienteRAF = requestAnimationFrame(() => { pendienteRAF = null; mostrarDiagnostico(latlng, precision); });
  } else mostrarDiagnostico(latlng, precision);
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
