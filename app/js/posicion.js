// Posición del usuario: pin de simulación arrastrable o GPS real.
let mapa, pin, circulo, idWatch = null, alCambiar = () => {};

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

export function iniciarPosicion(m, callback) {
  mapa = m; alCambiar = callback;
  mapa.on('click', (e) => { if (modo === 'simulacion') moverPin(e.latlng, null); });
}

export let modo = 'simulacion';

function moverPin(latlng, precision) {
  if (!pin) {
    pin = L.marker(latlng, { icon: ICONO, draggable: modo === 'simulacion', autoPan: true, title: 'Tu posición', zIndexOffset: 1000 }).addTo(mapa);
    pin.on('drag', () => alCambiar(pin.getLatLng(), null, true));
    pin.on('dragend', () => alCambiar(pin.getLatLng(), null, false));
  } else pin.setLatLng(latlng);
  if (circulo) { circulo.remove(); circulo = null; }
  if (precision != null) circulo = L.circle(latlng, { radius: precision, color: '#1565c0', weight: 1, fillOpacity: 0.1 }).addTo(mapa);
  alCambiar(latlng, precision, false);
}

export function modoSimulacion(latlngInicial) {
  detenerGPS();
  modo = 'simulacion';
  moverPin(pin ? pin.getLatLng() : L.latLng(latlngInicial), null);
  pin.dragging.enable();
}

export function modoGPS(onError) {
  if (!('geolocation' in navigator)) { onError('Este navegador no permite obtener la ubicación.'); return; }
  modo = 'gps';
  pin?.dragging.disable();
  let primera = true;
  idWatch = navigator.geolocation.watchPosition(
    (p) => {
      const ll = L.latLng(p.coords.latitude, p.coords.longitude);
      moverPin(ll, p.coords.accuracy);
      pin.dragging.disable();
      if (primera) { mapa.setView(ll, Math.max(mapa.getZoom(), 16)); primera = false; }
    },
    (err) => { onError(err.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.'); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
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

export function quitarPin() {
  detenerGPS();
  pin?.remove(); circulo?.remove(); pin = circulo = null;
}
