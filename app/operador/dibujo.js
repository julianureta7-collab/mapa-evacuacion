// App operador: dibujo en el mapa (spec §7).
// Rutas, puntos de encuentro, áreas de peligro y tramos bloqueados, cada uno con motivo, fuente,
// autor (automático) y vigencia. También permite desactivar (sin borrar) una vía oficial.
// Usa Leaflet-Geoman (vendor/geoman, licencia MIT) para dibujar.
import { zonas, zona as zonaPorId, amenazasDe, amenazaInfo, fuente, estiloDe } from '../js/catalogo.js?v=22';
import { cargarCapas } from '../js/datos.js?v=22';
import { nube } from '../js/nube.js?v=22';
import { ROLES_OPERADOR, escucharOperador, consultarOperador, aFeature, elementosActuales, desactivacionesActuales } from '../js/capasOperador.js?v=22';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = (iso) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const AYUDAS = {
  ruta: 'Ruta: haz clic para ir agregando puntos en el sentido de la evacuación (desde el peligro hacia la zona segura). Clic en el último punto para terminar.',
  punto_encuentro: 'Punto de encuentro: haz clic donde está.',
  area_peligro: 'Área de peligro: haz clic para marcar el contorno. Clic en el primer punto para cerrarla.',
  bloqueo: 'Bloqueo: dibuja una línea que cruce la calle o tramo cortado. Clic en el último punto para terminar.',
  desactivar: 'Haz clic sobre una vía oficial (línea verde) para desactivarla. No se borra: deja de ofrecerse a las personas.',
};
const TITULOS = { ruta: 'Nueva ruta', punto_encuentro: 'Nuevo punto de encuentro', area_peligro: 'Nueva área de peligro', bloqueo: 'Nuevo tramo bloqueado' };

let mapa = null, grupoOficial, grupoOperador;
let herramienta = null;          // rol activo o 'desactivar'
let pendiente = null;            // { tipo: 'elemento', rol, capa } | { tipo: 'desactivar', feature, capa }
let cargaId = 0;

// ---------------------------------------------------------------- Inicio

export function iniciarDibujo() {
  if (mapa) { mapa.invalidateSize(); return; }
  mapa = L.map('mapa-operador', { preferCanvas: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  grupoOficial = L.featureGroup().addTo(mapa);
  grupoOperador = L.featureGroup().addTo(mapa);
  mapa.pm.setLang('es');
  mapa.pm.setGlobalOptions({ snappable: true, snapDistance: 15, allowSelfIntersection: false });
  mapa.on('pm:create', alCrear);

  $('dib-zona').innerHTML = zonas().map(z => `<option value="${z.id}">${esc(z.nombre)}</option>`).join('');
  $('dib-zona').addEventListener('change', () => { llenarAmenazas(); cargarVista(true); });
  $('dib-amenaza').addEventListener('change', () => cargarVista(false));
  llenarAmenazas();

  document.querySelectorAll('[data-herr]').forEach(b => b.addEventListener('click', () => elegirHerramienta(b.dataset.herr)));
  $('form-elemento').addEventListener('submit', publicar);
  $('btn-cancelar-el').addEventListener('click', () => cancelar(true));
  $('lista-elementos').addEventListener('click', retirarElemento);
  $('lista-desactivadas').addEventListener('click', reactivarVia);

  escucharOperador(() => dibujarOperador(), 'operador-panel');
  cargarVista(true);
}

function llenarAmenazas() {
  const z = zonaPorId($('dib-zona').value);
  $('dib-amenaza').innerHTML = amenazasDe(z).map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')
    + '<option value="todas">Todas las amenazas de la zona</option>';
}

const zonaSel = () => zonaPorId($('dib-zona').value);
const amenazaSel = () => $('dib-amenaza').value;
// Para mostrar capas oficiales cuando se elige "todas": la primera amenaza de la zona
const amenazaParaCapas = () => amenazaSel() === 'todas' ? amenazasDe(zonaSel())[0]?.id : amenazaSel();

// ---------------------------------------------------------------- Capas

async function cargarVista(centrar) {
  const mio = ++cargaId;
  cancelar(false);
  const z = zonaSel();
  if (centrar) mapa.setView(z.centro, z.zoom);
  grupoOficial.clearLayers();
  const def = z.amenazas.find(a => a.id === amenazaParaCapas());
  if (def?.capas?.length) {
    try {
      const datos = await cargarCapas(def, fuente, '../');
      if (mio !== cargaId) return;
      const desact = codigosDesactivadosVista();
      for (const { def: c, geo } of datos.capas) {
        const estilo = estiloDe(c);
        L.geoJSON(geo, {
          style: (f) => c.rol === 'ruta' && desact.has(f.properties?.name)
            ? { ...estilo, color: '#9e9e9e', dashArray: '4 6', opacity: 0.8 } : { ...estiloDe(c, f), opacity: (estilo.opacity ?? 1) * 0.8 },
          pointToLayer: (_f, ll) => L.circleMarker(ll, estilo),
          pmIgnore: true,
          onEachFeature: (f, l) => {
            if (c.rol !== 'ruta') return;
            const cod = f.properties?.name || '';
            l.bindTooltip(`${esc(f.properties?.nombre_ve?.trim() || 'Vía oficial')} · ${esc(cod)}${desact.has(cod) ? ' (desactivada)' : ''}`);
            l.on('click', () => { if (herramienta === 'desactivar') elegirViaParaDesactivar(f, l); });
          },
        }).addTo(grupoOficial);
      }
    } catch (e) { $('ayuda-dibujo').textContent = `No se pudieron cargar las capas oficiales: ${e.message}`; }
  }
  dibujarOperador();
}

function codigosDesactivadosVista() {
  const z = zonaSel().id, a = amenazaParaCapas();
  return new Set(desactivacionesActuales().filter(d => d.zona === z && d.amenaza === a).map(d => d.id_elemento_oficial));
}

function elementosVista() {
  const z = zonaSel().id, a = amenazaSel();
  return elementosActuales().filter(e => e.zona === z && (a === 'todas' || e.amenaza === 'todas' || e.amenaza === a));
}

function dibujarOperador() {
  if (!mapa) return;
  grupoOperador.clearLayers();
  for (const e of elementosVista()) {
    const info = ROLES_OPERADOR[e.rol];
    L.geoJSON(aFeature(e), {
      style: () => info.estilo,
      pointToLayer: (_f, ll) => L.circleMarker(ll, info.estilo),
      pmIgnore: true,
    }).bindPopup(`<strong>${esc(e.nombre || info.nombre)}</strong><br>Motivo: ${esc(e.motivo)}<br>Fuente: ${esc(e.fuente)}<br><small>${esc(e.autor)} · ${hora(e.creado)}${e.vigente_hasta ? ` · hasta ${hora(e.vigente_hasta)}` : ' · permanente'}</small>`)
      .addTo(grupoOperador);
  }
  dibujarListas();
}

function dibujarListas() {
  const els = elementosVista();
  $('lista-elementos').innerHTML = els.map(e => `
    <li class="rol-${e.rol}"><div>
      <strong>${esc(e.nombre || ROLES_OPERADOR[e.rol].nombre)}</strong>
      <div class="meta">${esc(amenazaLabel(e.amenaza))} · ${e.vigente_hasta ? `hasta ${hora(e.vigente_hasta)}` : 'permanente'}</div>
      <div class="msg">${esc(e.motivo)}</div>
      <div class="meta">${esc(e.autor)} · ${hora(e.creado)}</div>
    </div><button type="button" class="cancelar" data-retirar="${e.id}">Retirar</button></li>`).join('');
  $('sin-elementos').hidden = els.length > 0;
  const z = zonaSel().id;
  const ds = desactivacionesActuales().filter(d => d.zona === z);
  $('lista-desactivadas').innerHTML = ds.map(d => `
    <li class="desact"><div>
      <strong>Vía ${esc(d.id_elemento_oficial)}</strong>
      <div class="meta">${esc(amenazaLabel(d.amenaza))}</div>
      <div class="msg">${esc(d.motivo)}</div>
      <div class="meta">${esc(d.autor)} · ${hora(d.creado)}</div>
    </div><button type="button" class="cancelar" data-reactivar="${d.id}">Reactivar</button></li>`).join('');
  $('sin-desactivadas').hidden = ds.length > 0;
}

const amenazaLabel = (id) => id === 'todas' ? 'Todas las amenazas' : amenazaInfo(id).nombre;

// ---------------------------------------------------------------- Herramientas

function elegirHerramienta(h) {
  cancelar(false);
  mapa.pm.disableDraw();
  herramienta = herramienta === h ? null : h;
  document.querySelectorAll('[data-herr]').forEach(b => b.classList.toggle('activa', b.dataset.herr === herramienta));
  $('ayuda-dibujo').textContent = herramienta ? AYUDAS[herramienta] : 'Elige una herramienta y dibuja sobre el mapa.';
  if (!herramienta || herramienta === 'desactivar') return;
  if (herramienta !== 'punto_encuentro' && amenazaSel() === 'todas' && herramienta === 'area_peligro') {
    $('ayuda-dibujo').textContent += ' (Se aplicará a todas las amenazas de la zona.)';
  }
  const info = ROLES_OPERADOR[herramienta];
  mapa.pm.enableDraw(info.geometria, {
    pathOptions: info.estilo,
    templineStyle: { color: info.estilo.color, weight: 4 },
    hintlineStyle: { color: info.estilo.color, dashArray: [5, 5] },
    ...(info.geometria === 'CircleMarker' ? { markerStyle: info.estilo } : {}),
  });
}

function alCrear(e) {
  if (!herramienta || herramienta === 'desactivar') { e.layer.remove(); return; }
  mapa.pm.disableDraw();
  pendiente = { tipo: 'elemento', rol: herramienta, capa: e.layer };
  abrirFormulario(TITULOS[herramienta], true);
}

function elegirViaParaDesactivar(f, capa) {
  if (codigosDesactivadosVista().has(f.properties?.name)) { $('ayuda-dibujo').textContent = 'Esa vía ya está desactivada. Puedes reactivarla desde la lista.'; return; }
  cancelar();
  capa.setStyle({ color: '#b00020', weight: 8 });
  pendiente = { tipo: 'desactivar', feature: f, capa };
  abrirFormulario(`Desactivar vía ${f.properties?.nombre_ve?.trim() || ''} (${f.properties?.name || ''})`, false);
}

function abrirFormulario(titulo, conVigencia) {
  $('form-titulo').textContent = titulo;
  $('campo-vigencia').hidden = !conVigencia;
  $('el-nombre').parentElement.hidden = !conVigencia;
  $('form-elemento').hidden = false;
  $('el-error').hidden = true;
  $('el-motivo').focus();
}

function cancelar(reactivar = true) {
  if (pendiente?.tipo === 'elemento') pendiente.capa.remove();
  if (pendiente?.tipo === 'desactivar') cargarVistaSoloEstilos();
  pendiente = null;
  $('form-elemento').hidden = true;
  $('form-elemento').reset();
  // si seguía una herramienta de dibujo activa, volver a habilitarla para el siguiente elemento
  if (reactivar && herramienta && herramienta !== 'desactivar' && mapa && !mapa.pm.globalDrawModeEnabled()) {
    const h = herramienta; herramienta = null; elegirHerramienta(h);
  }
}

function cargarVistaSoloEstilos() { grupoOficial.eachLayer(g => g.resetStyle?.()); }

// ---------------------------------------------------------------- Guardar

async function publicar(ev) {
  ev.preventDefault();
  if (!pendiente) return;
  const motivo = $('el-motivo').value.trim(), fuenteTxt = $('el-fuente').value.trim();
  if (!motivo || !fuenteTxt) { mostrarError('Motivo y fuente son obligatorios.'); return; }
  $('btn-guardar-el').disabled = true;
  let error;
  if (pendiente.tipo === 'elemento') {
    const min = Number($('el-vigencia').value);
    ({ error } = await nube.from('elementos_operador').insert({
      zona: zonaSel().id,
      amenaza: amenazaSel(),
      rol: pendiente.rol,
      geometria: pendiente.capa.toGeoJSON().geometry,
      nombre: $('el-nombre').value.trim() || null,
      motivo, fuente: fuenteTxt,
      vigente_hasta: min ? new Date(Date.now() + min * 60000).toISOString() : null,
    }));
  } else {
    ({ error } = await nube.from('desactivaciones_oficiales').insert({
      zona: zonaSel().id,
      amenaza: amenazaParaCapas(),
      id_elemento_oficial: pendiente.feature.properties?.name,
      motivo: `${motivo} (fuente: ${fuenteTxt})`,
    }));
  }
  $('btn-guardar-el').disabled = false;
  if (error) { mostrarError(`No se pudo publicar: ${error.message}`); return; }
  if (pendiente.tipo === 'elemento') pendiente.capa.remove();
  const eraDesactivar = pendiente.tipo === 'desactivar';
  pendiente = null;
  $('form-elemento').hidden = true;
  $('form-elemento').reset();
  await consultarOperador();
  if (eraDesactivar) cargarVista(false); else dibujarOperador();
  $('ayuda-dibujo').textContent = 'Publicado. Ya aparece en la app de las personas de esta zona.';
  if (herramienta && herramienta !== 'desactivar') { const h = herramienta; herramienta = null; elegirHerramienta(h); }
}

function mostrarError(m) { $('el-error').textContent = m; $('el-error').hidden = false; }

async function retirarElemento(e) {
  const id = e.target.closest('[data-retirar]')?.dataset.retirar;
  if (!id || !confirm('¿Retirar este elemento? Dejará de verse en la app (queda en el registro).')) return;
  const { error } = await nube.from('elementos_operador').update({ activo: false }).eq('id', id);
  if (error) { alert(`No se pudo retirar: ${error.message}`); return; }
  await consultarOperador(); dibujarOperador();
}

async function reactivarVia(e) {
  const id = e.target.closest('[data-reactivar]')?.dataset.reactivar;
  if (!id || !confirm('¿Reactivar esta vía oficial?')) return;
  const { error } = await nube.from('desactivaciones_oficiales').update({ activa: false }).eq('id', id);
  if (error) { alert(`No se pudo reactivar: ${error.message}`); return; }
  await consultarOperador(); cargarVista(false);
}
