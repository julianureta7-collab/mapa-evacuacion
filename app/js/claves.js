// Claves de servicios externos.
// OJO: en una app web estas claves quedan visibles para cualquiera que abra el sitio.
// Usar solo claves gratuitas, sin tarjeta asociada. Si se abusa de una, se genera otra.

// OpenRouteService — https://openrouteservice.org/dev/#/api-keys
export const ORS_API_KEY = 'PEGAR_AQUI_LA_CLAVE';

// Supabase (alertas y datos del operador). Esta es la clave PUBLICABLE: va en el sitio por diseño;
// lo que protege los datos son las reglas RLS de supabase/esquema.sql.
// NUNCA poner aquí la clave "secret" ni la "service_role".
export const SUPABASE_URL = 'https://ykdjasqegyyfkjejxugb.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_8y-jkdHIsixGOCyuw7fVHw_weU2og5z';
