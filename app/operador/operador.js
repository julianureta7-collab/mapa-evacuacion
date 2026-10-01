// App operador (spec §7): login, enviar y cancelar alertas por zona × amenaza.
// Las zonas y amenazas salen del mismo catálogo que la app usuario, así que solo se puede
// alertar a zonas cubiertas. Los permisos reales los ponen las reglas RLS (supabase/esquema.sql).
import { cargarCatalogo, zonas, zona as zonaPorId, amenazasDe, amenazaInfo } from '../js/catalogo.js?v=12';
import { nube, ahoraISO } from '../js/nube.js?v=12';

const $ = (id) => document.getElementById(id);
const mostrar = (id, si) => { $(id).hidden = !si; };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = (iso) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function errorEn(id, msg) { $(id).textContent = msg || ''; mostrar(id, !!msg); }

// ---------------------------------------------------------------- Sesión

async function alCambiarSesion(session) {
  const dentro = !!session;
  mostrar('vista-login', !dentro);
  mostrar('vista-panel', dentro);
  mostrar('sesion', dentro);
  if (dentro) {
    $('usuario').textContent = session.user.email;
    await refrescarAlertas();
  }
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEn('login-error', '');
  $('btn-entrar').disabled = true;
  const { error } = await nube.auth.signInWithPassword({ email: $('login-correo').value.trim(), password: $('login-clave').value });
  $('btn-entrar').disabled = false;
  if (error) errorEn('login-error', error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
});

$('btn-salir').addEventListener('click', () => nube.auth.signOut());

// ---------------------------------------------------------------- Formulario de alerta

function llenarZonas() {
  $('alerta-zona').innerHTML = zonas().map(z => `<option value="${z.id}">${esc(z.nombre)}</option>`).join('');
  llenarAmenazas();
}
function llenarAmenazas() {
  const lista = amenazasDe(zonaPorId($('alerta-zona').value));
  $('alerta-amenaza').innerHTML = lista.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
}
$('alerta-zona').addEventListener('change', llenarAmenazas);
$('alerta-simulacro').addEventListener('change', (e) => mostrar('aviso-real', !e.target.checked));

$('form-alerta').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEn('alerta-error', '');
  const zonaId = $('alerta-zona').value, amenazaId = $('alerta-amenaza').value;
  const simulacro = $('alerta-simulacro').checked;
  const z = zonaPorId(zonaId), am = amenazaInfo(amenazaId);
  if (!z || !amenazasDe(z).some(a => a.id === amenazaId)) { errorEn('alerta-error', 'Zona o amenaza no válida.'); return; }
  const confirmacion = `${simulacro ? 'SIMULACRO' : '⚠️ ALERTA REAL'} de ${am.nombre.toLowerCase()} en ${z.nombre}.\n\nLa verán todas las personas con la app en esa zona. ¿Activar?`;
  if (!confirm(confirmacion)) return;
  $('btn-enviar').disabled = true;
  const minutos = Number($('alerta-vigencia').value);
  const { error } = await nube.from('alertas').insert({
    zona: zonaId,
    amenaza: amenazaId,
    mensaje: $('alerta-mensaje').value.trim(),
    simulacro,
    vigente_hasta: new Date(Date.now() + minutos * 60000).toISOString(),
  });
  $('btn-enviar').disabled = false;
  if (error) { errorEn('alerta-error', `No se pudo activar: ${error.message}`); return; }
  $('alerta-mensaje').value = '';
  await refrescarAlertas();
});

// ---------------------------------------------------------------- Listas

function itemAlerta(a, conBoton) {
  const z = zonaPorId(a.zona), am = amenazaInfo(a.amenaza);
  return `<li>
    <div>
      <div><span class="etiqueta ${a.simulacro ? 'sim' : 'real'}">${a.simulacro ? 'SIMULACRO' : 'REAL'}</span><strong>${esc(am.nombre)} · ${esc(z?.nombre || a.zona)}</strong></div>
      ${a.mensaje ? `<div class="msg">${esc(a.mensaje)}</div>` : ''}
      <div class="meta">${esc(a.autor || '')} · ${hora(a.creada)} → ${a.cancelada ? `cancelada ${hora(a.cancelada)}` : `hasta ${hora(a.vigente_hasta)}`}</div>
    </div>
    ${conBoton ? `<button type="button" class="cancelar" data-id="${a.id}">Cancelar</button>` : ''}
  </li>`;
}

async function refrescarAlertas() {
  const { data, error } = await nube.from('alertas').select('*').order('creada', { ascending: false }).limit(30);
  if (error) { $('estado-conexion').textContent = `Sin conexión: ${error.message}`; return; }
  $('estado-conexion').textContent = `Actualizado ${new Date().toLocaleTimeString('es-CL')}`;
  const ahora = new Date();
  const activas = data.filter(a => a.activa && new Date(a.vigente_hasta) > ahora);
  const historial = data.filter(a => !activas.includes(a)).slice(0, 10);
  $('lista-activas').innerHTML = activas.map(a => itemAlerta(a, true)).join('');
  $('lista-historial').innerHTML = historial.map(a => itemAlerta(a, false)).join('');
  $('contador-activas').textContent = activas.length;
  mostrar('sin-activas', activas.length === 0);
}

$('lista-activas').addEventListener('click', async (e) => {
  const id = e.target.closest('button.cancelar')?.dataset.id;
  if (!id || !confirm('¿Cancelar esta alerta? Las personas volverán al modo informativo.')) return;
  e.target.disabled = true;
  const { error } = await nube.from('alertas').update({ activa: false, cancelada: ahoraISO() }).eq('id', id);
  if (error) alert(`No se pudo cancelar: ${error.message}`);
  await refrescarAlertas();
});

// ---------------------------------------------------------------- Inicio

async function iniciar() {
  if (!nube) { document.querySelector('main').innerHTML = '<p class="error">Falta configurar Supabase en js/claves.js.</p>'; return; }
  await cargarCatalogo('../');
  llenarZonas();
  const { data } = await nube.auth.getSession();
  await alCambiarSesion(data.session);
  nube.auth.onAuthStateChange((_evento, session) => alCambiarSesion(session));
  nube.channel('alertas-operador')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, () => refrescarAlertas())
    .subscribe();
  setInterval(() => { if (!$('vista-panel').hidden) refrescarAlertas(); }, 15000);
}

iniciar();
