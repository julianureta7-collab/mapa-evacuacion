// Punto de entrada: selector de escenario, carga de datos, ficha y leyenda.
import { ESCENARIOS, ESCENARIO_INICIAL, ESTILOS } from './config.js';
import { cargarEscenario } from './datos.js';
import { crearMapa, mostrarEscenario, mostrarVacio } from './mapa.js';

const $ = (id) => document.getElementById(id);

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

async function activarEscenario(clave) {
  const esc = ESCENARIOS[clave];
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
  } catch (e) {
    mostrarVacio(esc);
    error(`${e.message}. ¿Ejecutaste "node scripts/descargar_capas.mjs"?`);
  }
}

function iniciar() {
  crearMapa('mapa');
  const sel = $('selector-escenario');
  sel.innerHTML = Object.entries(ESCENARIOS)
    .map(([k, e]) => `<option value="${k}">${e.nombre}${e.pendiente ? ' (pendiente)' : ''}</option>`).join('');
  sel.value = ESCENARIO_INICIAL;
  sel.addEventListener('change', () => activarEscenario(sel.value));
  activarEscenario(ESCENARIO_INICIAL);
}

iniciar();
