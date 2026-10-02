// Alertas activas (app usuario). Spec §5.1 y §9.
// - Se reciben TODAS las alertas vigentes; cada teléfono decide localmente cuáles le aplican.
// - Tiempo real (Supabase Realtime) + consulta cada 15 s como respaldo.
// - Una alerta deja de contar sola cuando pasa su vigente_hasta, aunque nadie la cancele.
import { nube, ahoraISO } from './nube.js?v=17';

const POLLING_MS = 15000;
let alertas = [];
let alCambiar = () => {};
let alEstado = () => {};
let temporizador = null;

const vigentes = (lista) => lista.filter(a => a.activa && new Date(a.vigente_hasta) > new Date());

async function consultar() {
  const { data, error } = await nube
    .from('alertas')
    .select('*')
    .eq('activa', true)
    .gt('vigente_hasta', ahoraISO())
    .order('creada', { ascending: false });
  if (error) { alEstado('error'); return; }
  alEstado('ok');
  publicar(data || []);
}

function publicar(lista) {
  const nuevas = vigentes(lista);
  const firma = (l) => l.map(a => `${a.id}:${a.activa}:${a.vigente_hasta}:${a.mensaje}`).join('|');
  if (firma(nuevas) === firma(alertas)) return;
  alertas = nuevas;
  alCambiar(alertas);
}

export function escucharAlertas({ onCambio, onEstado } = {}) {
  alCambiar = onCambio || alCambiar;
  alEstado = onEstado || alEstado;
  if (!nube) { alEstado('sin_configurar'); return; }
  consultar();
  nube.channel('alertas-publicas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, () => consultar())
    .subscribe((estado) => { if (estado === 'SUBSCRIBED') alEstado('ok'); });
  clearInterval(temporizador);
  temporizador = setInterval(() => {
    consultar();
    publicar(alertas);            // también expira localmente las que vencieron
  }, POLLING_MS);
}

export const alertasVigentes = () => vigentes(alertas);
