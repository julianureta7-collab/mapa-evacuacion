// Conexión a Supabase, compartida por la app usuario y la app operador.
// Requiere vendor/supabase.js cargado antes (define el global `supabase`).
import { SUPABASE_URL, SUPABASE_KEY } from './claves.js?v=14';

export const nube = (window.supabase && SUPABASE_URL && SUPABASE_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export const ahoraISO = () => new Date().toISOString();
