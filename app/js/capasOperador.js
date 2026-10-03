// Elementos dibujados por operadores (spec §7) y desactivaciones de vías oficiales.
// Compartido por la app usuario (lee) y la app operador (lee y escribe).
// Tablas: elementos_operador, desactivaciones_oficiales (supabase/esquema.sql).
import { nube } from './nube.js?v=19';

export const ROLES_OPERADOR = {
  ruta:            { nombre: 'Rutas del operador',          geometria: 'Line',         estilo: { color: '#0d47a1', weight: 6, opacity: 0.95 } },
  punto_encuentro: { nombre: 'Puntos de encuentro (operador)', geometria: 'CircleMarker', estilo: { radius: 10, color: '#ffffff', weight: 3, fillColor: '#00897b', fillOpacity: 1 } },
  area_peligro:    { nombre: 'Áreas de peligro (operador)', geometria: 'Polygon',      estilo: { color: '#c62828', weight: 2, fillColor: '#e53935', fillOpacity: 0.28, dashArray: '6 4' } },
  bloqueo:         { nombre: 'Tramos bloqueados',            geometria: 'Line',         estilo: { color: '#b00020', weight: 7, opacity: 0.95, dashArray: '2 10', lineCap: 'round' } },
};

const vigente = (e) => e.activo && (!e.vigente_hasta || new Date(e.vigente_hasta) > new Date());

let elementos = [];
let desactivaciones = [];

export async function consultarOperador() {
  if (!nube) return { elementos, desactivaciones, ok: false };
  const [a, b] = await Promise.all([
    nube.from('elementos_operador').select('*').eq('activo', true).order('creado', { ascending: false }),
    nube.from('desactivaciones_oficiales').select('*').eq('activa', true).order('creado', { ascending: false }),
  ]);
  if (a.error || b.error) return { elementos, desactivaciones, ok: false, error: a.error || b.error };
  elementos = (a.data || []).filter(vigente);
  desactivaciones = b.data || [];
  return { elementos, desactivaciones, ok: true };
}

// Tiempo real + consulta cada 15 s (y expira localmente lo que venció).
export function escucharOperador(onCambio, canal = 'operador-publico') {
  if (!nube) return;
  let firma = '';
  const refrescar = async () => {
    const r = await consultarOperador();
    if (!r.ok) return;
    const f = JSON.stringify([r.elementos.map(e => e.id + e.creado), r.desactivaciones.map(d => d.id)]);
    if (f !== firma) { firma = f; onCambio(r); }
  };
  refrescar();
  nube.channel(canal)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'elementos_operador' }, refrescar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'desactivaciones_oficiales' }, refrescar)
    .subscribe();
  setInterval(refrescar, 15000);
}

const aplica = (e, zonaId, amenazaId) => e.zona === zonaId && (e.amenaza === 'todas' || e.amenaza === amenazaId);

export function aFeature(e) {
  return {
    type: 'Feature',
    geometry: e.geometria,
    properties: {
      id: e.id, nombre: e.nombre || null, rol: e.rol,
      motivo: e.motivo, fuente_texto: e.fuente, autor: e.autor, creado: e.creado, vigente_hasta: e.vigente_hasta,
      _procedencia: 'operador',
      _fuente: { organismo: 'Operador', nombre: e.autor || '' },
    },
  };
}

// Capas del operador para una zona × amenaza, con el mismo formato que las oficiales: [{ def, geo }]
export function capasOperador(lista, zonaId, amenazaId) {
  const capas = [];
  for (const [rol, info] of Object.entries(ROLES_OPERADOR)) {
    const feats = lista.filter(e => e.rol === rol && aplica(e, zonaId, amenazaId)).map(aFeature);
    if (feats.length) capas.push({ def: { nombre: info.nombre, rol, visible: true, estilo: info.estilo, operador: true }, geo: { type: 'FeatureCollection', features: feats } });
  }
  return capas;
}

// Códigos de vías oficiales desactivadas para una zona × amenaza
export function codigosDesactivados(lista, zonaId, amenazaId) {
  return new Set(lista.filter(d => d.zona === zonaId && d.amenaza === amenazaId).map(d => d.id_elemento_oficial));
}

export const elementosActuales = () => elementos;
export const desactivacionesActuales = () => desactivaciones;
