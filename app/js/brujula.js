// Brújula: lee la orientación del teléfono y rota el mapa.
// Dos modos: 'norte' (norte arriba, mapa fijo) y 'brujula' (hacia donde miras queda arriba,
// con efecto de linterna en tu posición).
//
// iPhone: requiere pedir permiso con un toque (DeviceOrientationEvent.requestPermission)
//         y entrega el rumbo en e.webkitCompassHeading.
// Android/Chrome: 'deviceorientationabsolute' entrega alpha respecto al norte → rumbo = 360 - alpha.

let mapa = null;
let modo = 'norte';
let rumbo = null;          // rumbo suavizado en grados (0 = norte, 90 = este)
let evento = null;
let temporizador = null;
let cuadroPendiente = false;
let alRumbo = () => {};    // callback(rumbo | null, bearingMapa)
let alError = () => {};
let control = null;

const SUAVIZADO = 0.25;    // 0..1: más bajo = más suave, más lento

function anguloPantalla() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if (typeof window.orientation === 'number') return window.orientation;
  return 0;
}

function leerRumbo(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    h = e.webkitCompassHeading;                       // iOS: ya es rumbo respecto al norte
  } else if (e.absolute === true && typeof e.alpha === 'number') {
    h = 360 - e.alpha;                                // Android: alpha absoluto
  } else {
    return null;                                      // orientación relativa: no sirve como brújula
  }
  return (h + anguloPantalla() + 360) % 360;
}

function alOrientar(e) {
  const h = leerRumbo(e);
  if (h == null) return;
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
  if (rumbo == null) rumbo = h;
  else {
    const dif = ((h - rumbo + 540) % 360) - 180;      // diferencia circular en [-180, 180)
    rumbo = (rumbo + dif * SUAVIZADO + 360) % 360;
  }
  if (!cuadroPendiente) {
    cuadroPendiente = true;
    requestAnimationFrame(() => { cuadroPendiente = false; aplicar(); });
  }
}

function aplicar() {
  if (modo !== 'brujula' || rumbo == null) return;
  mapa.setBearing(-rumbo);                            // lo que tienes al frente queda arriba
  actualizarAguja();
  alRumbo(rumbo, mapa.getBearing());
}

function actualizarAguja() {
  const aguja = control?.querySelector('.brujula-aguja');
  if (aguja) aguja.style.transform = `rotate(${mapa.getBearing()}deg)`;
}

async function pedirPermiso() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    const r = await DOE.requestPermission();          // debe llamarse dentro de un toque
    if (r !== 'granted') throw new Error('Permiso de orientación denegado.');
  }
}

function escuchar() {
  evento = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evento, alOrientar, true);
  // Si en unos segundos no llega ningún rumbo válido, el dispositivo no tiene brújula
  temporizador = setTimeout(() => {
    if (rumbo == null) {
      alError('Este dispositivo no entrega brújula. Prueba desde un celular.');
      activarNorte();
    }
  }, 3000);
}

function dejarDeEscuchar() {
  if (evento) window.removeEventListener(evento, alOrientar, true);
  evento = null;
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
}

export async function activarBrujula() {
  try { await pedirPermiso(); }
  catch (e) { alError(e.message); return; }
  modo = 'brujula';
  rumbo = null;
  control?.classList.add('activa');
  control?.setAttribute('aria-pressed', 'true');
  control?.setAttribute('title', 'Brújula activa: toca para volver a norte arriba');
  escuchar();
}

export function activarNorte() {
  dejarDeEscuchar();
  modo = 'norte';
  rumbo = null;
  mapa.setBearing(0);
  control?.classList.remove('activa');
  control?.setAttribute('aria-pressed', 'false');
  control?.setAttribute('title', 'Norte arriba: toca para activar la brújula');
  actualizarAguja();
  alRumbo(null, 0);
}

export const modoBrujula = () => modo;

// Botón bajo el zoom. Muestra una aguja que siempre apunta al norte real.
export function crearControlBrujula(m, { onRumbo, onError, onActivar }) {
  mapa = m; alRumbo = onRumbo || alRumbo; alError = onError || alError;
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'control-brujula leaflet-bar');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Brújula');
      btn.title = 'Norte arriba: toca para activar la brújula';
      btn.innerHTML = `
        <svg class="brujula-aguja" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
          <polygon points="20,4 25,20 15,20" fill="#d32f2f"/>
          <polygon points="20,36 25,20 15,20" fill="#90a4ae"/>
          <circle cx="20" cy="20" r="2.5" fill="#fff" stroke="#37474f" stroke-width="1"/>
          <text x="20" y="3.2" text-anchor="middle" font-size="6" font-weight="700" fill="#d32f2f">N</text>
        </svg>`;
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, 'click', async () => {
        if (modo === 'norte') { await activarBrujula(); if (modo === 'brujula') onActivar?.(); }
        else activarNorte();
      });
      control = btn;
      return btn;
    },
  });
  new Control().addTo(mapa);
  mapa.on('rotate', actualizarAguja);
}
