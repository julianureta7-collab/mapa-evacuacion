// Posición del usuario: pin de simulación arrastrable o GPS real.
let mapa, pin, circulo, idWatch = null, alCambiar = () => {};

const ICONO = L.divIcon({
  className: 'pin-usuario',
  html: '<div class="pin-punto"></div><div class="pin-etiqueta">Tú</div>',
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

export function quitarPin() {
  detenerGPS();
  pin?.remove(); circulo?.remove(); pin = circulo = null;
}
