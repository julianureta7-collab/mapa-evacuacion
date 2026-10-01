# Contexto para Claude (Cowork o Claude Code)

**Lee primero `docs/ESPECIFICACION.md`.** Para el motor de rutas, lee también `docs/PLAN_RUTAS.md` (plan v3, pendiente de aprobación/implementación). Es la fuente única de verdad: visión, decisiones acordadas, prioridades y pendientes. Este archivo solo explica cómo trabajar en el repo.

- Usuario: Julián (julianureta7-collab en GitHub). Equipo de 5, curso UC.
- **Hito: viernes 2-oct-2026**, versión para testear con entrevistados (spec §1 y §10).
- Sitio: https://julianureta7-collab.github.io/mapa-evacuacion/
- En el PC de Julián el repo está en `C:\Users\JulianU\Documents\Proyecto_Innova` (fuera de OneDrive a propósito).

## Reglas de trabajo

- **No inventar rutas ni contenido.** Solo información oficial, citada. Toda ruta muestra su procedencia (spec §2 y §6).
- **Nada hardcodeado por zona.** Zonas y amenazas se definen en datos (catálogo), no con `if (zona === 'vina')`.
- **Sin build:** HTML + ES modules + `app/vendor/` (Leaflet 1.9.4 = `L`, Turf 7.4 = `turf`, leaflet-rotate 0.2.8). Nada de CDNs.
- Código, comentarios y UI en **español**.
- La ubicación del usuario **solo sale del teléfono con el botón "Necesito ayuda"**.
- Usa "área de peligro" para el polígono de una amenaza y "zona" solo para el territorio cubierto (spec §3).
- El banner de SIMULACRO y el aviso "no reemplaza a la autoridad" no se quitan.
- **Caché de GitHub Pages (max-age 600):** al cambiar JS o CSS, sube el número `?v=N` en `app/index.html`, `app/operador/`, en todos los `import` de `app/js/*.js` **y** en la carga de `catalogo.json` (`js/catalogo.js`). Busca `?v=`.
- Al terminar un hito, escribe `docs/reportes/NN-tema.md` (qué se hizo, capturas, decisiones, limitaciones). El equipo lo usa para su informe.
- Si se toma una decisión nueva con Julián, **actualiza `docs/ESPECIFICACION.md`** en el mismo cambio.

## Servicios externos
- **OpenRouteService:** usar `https://api.heigit.org/openrouteservice/v2/...` con la clave en el encabezado `Authorization`. `api.openrouteservice.org` está apagado desde el 28-sep-2026 (responde 403 sin cabeceras CORS: en el navegador se ve como "error de CORS").
- **Supabase:** URL y clave publicable en `app/js/claves.js`; esquema en `supabase/esquema.sql`.

## Comandos

- `node scripts/descargar_capas.mjs`: descarga las capas SENAPRED (necesita red hacia ArcGIS).
- `node scripts/servidor.mjs`: abre http://localhost:8080 (con `PORT=xxxx` para otro puerto).
- Publicar: `git add . && git commit -m "..." && git push` (GitHub Actions publica en Pages).

## Limitaciones del entorno de Claude (Cowork)

- El sandbox **no llega a ArcGIS, OpenRouteService, Supabase ni teselas OSM**. Las descargas y las pruebas con servicios reales las hace Julián en su PC. Para probar, se simulan las respuestas (`page.route` de Playwright).
- **No ejecutes ningún comando `git` desde la VM de Cowork, ni siquiera `git status`.** Git crea `.git/index.lock` y la VM no puede borrarlo, así que el repo queda bloqueado para Julián. Si pasa, en PowerShell: `Remove-Item .git\index.lock`. Julián hace los commits y push, o Claude Code en su PC.
- Pruebas de interfaz: Playwright con el Chromium del contenedor cloud, sobre una copia de `app/`.

## Mapa del código (`app/`)

| Archivo | Rol |
| --- | --- |
| `index.html`, `css/estilos.css` | Interfaz de la app usuario |
| `data/catalogo.json` | **Zonas × amenazas**, fuentes, estilos por rol y capas oficiales (spec §3). Agregar zona o amenaza = editar esto |
| `js/informacion.js` | Panel Información (pestañas) y tarjeta de modo precaución |
| `data/contenido/` | Contenido oficial por amenaza (antes/durante/después) y `fuentes.json`. Solo fuentes oficiales, citadas |
| `js/catalogo.js` | Lee el catálogo; `zonaEn(lngLat)` decide la zona por cobertura |
| `js/datos.js` | Carga las capas de una zona × amenaza, agrupadas por rol y marcadas con procedencia (`_procedencia`, `_fuente`) |
| `js/mapa.js` | Leaflet: capas, ruta, redimensionado |
| `js/diagnostico.js` | Dentro / cerca / fuera del área (proyección local, <1 ms) |
| `js/posicion.js` | Modelo de dos puntos (spec §5.1): ubicación real (GPS, sigue activa con el pin) + pin de referencia; linterna |
| `js/brujula.js` | Brújula: norte arriba / rota el mapa |
| `js/ruta.js` | Motor de rutas por rol: ruta oficial → ORS sugerida → línea recta |
| `js/main.js` | Desplegables zona/amenaza, el pin decide la zona, diagnóstico, tarjeta de ruta |
| `js/claves.js` | Clave de ORS (pública a propósito) |
| `data/<zona>/<amenaza>/` | Capas oficiales + `metadata.json` (hoy: `data/vina/tsunami/`) |
| `operador/` | **App operador** (login, alertas). Publicada en `/operador/`. Importa `../js/catalogo.js` y `../js/nube.js` |
| `js/nube.js` | Cliente Supabase compartido (`vendor/supabase.js`, claves en `js/claves.js`) |
| `js/alertas.js` | Alertas vigentes en tiempo real + consulta cada 15 s (app usuario) |
| `supabase/esquema.sql` | Esquema de la base de datos (correr en el SQL Editor de Supabase) |

## Próximo paso

Spec §10, **punto 6**: herramienta de dibujo del operador (rutas, puntos, áreas de peligro, bloqueos) y jerarquía en la app usuario. Puntos 1 a 5 hechos (ver spec §12). Candidatos de puntos de encuentro del Campus: Patio Norte y Patio Sur (reporte 03). Revisa §13 para ver qué falta del equipo (Supabase y clave ORS bloquean los puntos 3 y 6).
