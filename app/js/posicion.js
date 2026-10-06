// Posición del usuario: modelo de DOS PUNTOS (spec §5.1).
//  - Ubicación real (GPS): si hay permiso se sigue siempre, también mientras se usa el pin.
//    Solo se procesa en el teléfono. Se dibuja como un punto azul pequeño cuando el pin está en otra parte.
//  - Pin de referencia: lo que la persona está mirando. En modo "simulación" se arrastra libremente;
//    en modo "gps" sigue a la ubicación real, pero SOLO si está dentro de una zona cubierta: si no,
//    el pin se queda donde estaba (se sigue mostrando ese lugar) y se avisa con onAvisoGPS(true).

let mapa, pin, circulo, idWatch = null;
let alCambiarPin = () => {};      // (latlng, precision|null, arrastrando)
let alCambiarReal = () => {};     // (latlng, precision)
let alErrorGPS = () => {};
let real = null;                  // { latlng, precision }
let marcadorReal = null, circuloReal = null;
let centrarAlPrimerFix = false;
let arrastrandoPin = false;
let bloqueado = false;          // con la brújula activa el pin no se arrastra (el mapa rotado lo hace saltar)
let enCobertura = () => true;   // ¿el punto está en alguna zona cubierta? (lo define main.js)
let alAvisoGPS = () => {};      // (fuera: boolean) la ubicación real está fuera de toda zona cubierta
let gpsFuera = false;

export let modo = 'simulacion';

const ICONO = L.divIcon({
  className: 'pin-usuario',
  html: `<svg class="pin-linterna" viewBox="-100 -100 200 200" width="200" height="200" aria-hidden="true">
           <defs><radialGradient id="grad-linterna" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
             <stop offset="0" stop-color="#1e88e5" stop-opacity=".75"/>
             <stop offset=".65" stop-color="#1e88e5" stop-opacity=".35"/>
             <stop offset="1" stop-color="#1e88e5" stop-opacity="0"/>
           </radialGradient></defs>
           <path d="M0,0 L-42,-90.6 A100,100 0 0 1 42,-90.6 Z" fill="url(#grad-linterna)"/>
         </svg>
         <div class="pin-punto"></div><div class="pin-etiqueta">Tú</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const ICONO_REAL = L.divIcon({
  className: 'ubicacion-real',
  html: '<div class="ubicacion-real-punto" title="Tu ubicación real (GPS)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export function iniciarPosicion(m, { onPin, onReal, onErrorGPS, dentroDeCobertura, onAvisoGPS } = {}) {
  mapa = m;
  alCambiarPin = onPin || alCambiarPin;
  alCambiarReal = onReal || alCambiarReal;
  alErrorGPS = onErrorGPS || alErrorGPS;
  enCobertura = dentroDeCobertura || enCobertura;
  alAvisoGPS = onAvisoGPS || alAvisoGPS;
  mapa.on('click', (e) => { if (modo === 'simulacion' && !bloqueado) moverPin(e.latlng, null); });
}

function moverPin(latlng, precision) {
  if (!pin) {
    pin = L.marker(latlng, {
      icon: ICONO, draggable: modo === 'simulacion' && !bloqueado, title: 'Tu posición', zIndexOffset: 1000,
      // SIN desplazamiento automático en los bordes: con leaflet-rotate calcula mal la posición y el
      // pin "se teletransporta" o el mapa se dispara. Para ir más lejos: soltar, mover el mapa, volver a arrastrar
      // (o tocar el mapa donde se quiere el pin).
      autoPan: false,
    }).addTo(mapa);
    pin.on('dragstart', () => { arrastrandoPin = true; });
    pin.on('drag', () => alCambiarPin(pin.getLatLng(), null, true));
    pin.on('dragend', () => { arrastrandoPin = false; alCambiarPin(pin.getLatLng(), null, false); });
  } else pin.setLatLng(latlng);
  if (circulo) { circulo.remove(); circulo = null; }
  if (precision != null) circulo = L.circle(latlng, { radius: precision, color: '#1565c0', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(mapa);
  alCambiarPin(latlng, precision, false);
}

function marcarFuera(fuera) {
  if (fuera === gpsFuera) return;
  gpsFuera = fuera;
  alAvisoGPS(fuera);
}

// En modo GPS: el pin sigue a la ubicación real solo dentro de las zonas cubiertas.
function seguirGPS() {
  const dentro = enCobertura(real.latlng);
  const veniaDeFuera = gpsFuera;
  marcarFuera(!dentro);
  if (!dentro) { centrarAlPrimerFix = false; return; }   // se sigue mostrando el último lugar del pin
  const primera = centrarAlPrimerFix || veniaDeFuera || !pin;   // centrar al empezar o al entrar a una zona
  moverPin(real.latlng, real.precision);
  pin.dragging.disable();
  if (primera) { mapa.setView(real.latlng, Math.max(mapa.getZoom(), 16)); centrarAlPrimerFix = false; }
}

// Punto azul de la ubicación real, visible cuando el pin NO la está siguiendo.
function dibujarReal() {
  const mostrar = real && (modo !== 'gps' || gpsFuera);
  if (!mostrar) {
    marcadorReal?.remove(); circuloReal?.remove(); marcadorReal = circuloReal = null;
    return;
  }
  if (!marcadorReal) {
    marcadorReal = L.marker(real.latlng, { icon: ICONO_REAL, interactive: false, zIndexOffset: 800 }).addTo(mapa);
    circuloReal = L.circle(real.latlng, { radius: real.precision || 0, color: '#1565c0', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(mapa);
  } else {
    marcadorReal.setLatLng(real.latlng);
    circuloReal.setLatLng(real.latlng).setRadius(real.precision || 0);
  }
}

function alPosicionGPS(p) {
  real = { latlng: L.latLng(p.coords.latitude, p.coords.longitude), precision: p.coords.accuracy };
  if (modo === 'gps') seguirGPS();
  dibujarReal();
  alCambiarReal(real.latlng, real.precision);
}

function iniciarWatch() {
  if (idWatch != null || !('geolocation' in navigator)) return;
  idWatch = navigator.geolocation.watchPosition(
    alPosicionGPS,
    (err) => {
      if (err.code === 1) { detenerGPS(); real = null; dibujarReal(); }
      alErrorGPS(err.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.', err.code);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

// Si la persona ya había dado permiso antes, seguir la ubicación real sin preguntar nada.
export async function iniciarGPSSiHayPermiso() {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' });
    if (st?.state === 'granted') iniciarWatch();
  } catch { /* navegadores sin Permissions API: se activa al tocar "Usar mi ubicación" */ }
}

export function modoSimulacion(latlngInicial) {
  modo = 'simulacion';                     // el GPS sigue corriendo (dos puntos)
  marcarFuera(false);
  moverPin(pin ? pin.getLatLng() : L.latLng(latlngInicial), null);
  if (!bloqueado) pin.dragging.enable();
  dibujarReal();
}

// Pone el pin en un punto (p. ej. al elegir una zona en el desplegable) y vuelve a modo simulación.
export function ubicarPin(latlng) {
  modo = 'simulacion';
  marcarFuera(false);
  moverPin(L.latLng(latlng), null);
  if (!bloqueado) pin.dragging.enable();
  dibujarReal();
}

// La brújula bloquea el arrastre del pin mientras está activa.
export function bloquearPin(si) {
  bloqueado = si;
  if (!pin) return;
  if (si || modo === 'gps') pin.dragging.disable(); else pin.dragging.enable();
}

export function modoGPS(onError) {
  if (!('geolocation' in navigator)) { onError?.('Este navegador no permite obtener la ubicación.'); return; }
  if (onError) alErrorGPS = onError;
  modo = 'gps';
  pin?.dragging.disable();
  if (real) { centrarAlPrimerFix = true; seguirGPS(); }
  else centrarAlPrimerFix = true;
  dibujarReal();
  iniciarWatch();
}

export function detenerGPS() {
  if (idWatch != null) navigator.geolocation.clearWatch(idWatch);
  idWatch = null;
}

// Linterna: cono que apunta hacia donde mira el teléfono.
// anguloPantalla = rumbo + rotación del mapa (en modo brújula queda ~0, es decir, hacia arriba).
export function setLinterna(rumbo, bearingMapa) {
  const el = pin?.getElement()?.querySelector('.pin-linterna');
  if (!el) return;
  if (rumbo == null) { el.classList.remove('visible'); return; }
  el.classList.add('visible');
  el.style.transform = `translate(-50%, -50%) rotate(${rumbo + bearingMapa}deg)`;
}

export const posicionActual = () => pin?.getLatLng() || null;
export const ubicacionReal = () => real;
export const pinArrastrando = () => arrastrandoPin;      // { latlng, precision } | null

export function quitarPin() {
  pin?.remove(); circulo?.remove(); pin = circulo = null;
}
