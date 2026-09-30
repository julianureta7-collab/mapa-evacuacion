# Contexto para Claude (Cowork o Claude Code)

**Lee primero `docs/ESPECIFICACION.md`.** Es la fuente única de verdad: visión, decisiones acordadas, prioridades y pendientes. Este archivo solo explica cómo trabajar en el repo.

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
- **Caché de GitHub Pages (max-age 600):** al cambiar JS o CSS, sube el número `?v=N` en `app/index.html` **y** en todos los `import` de `app/js/*.js` (busca `?v=`).
- Al terminar un hito, escribe `docs/reportes/NN-tema.md` (qué se hizo, capturas, decisiones, limitaciones). El equipo lo usa para su informe.
- Si se toma una decisión nueva con Julián, **actualiza `docs/ESPECIFICACION.md`** en el mismo cambio.

## Comandos

- `node scripts/descargar_capas.mjs`: descarga las capas SENAPRED (necesita red hacia ArcGIS).
- `node scripts/servidor.mjs`: abre http://localhost:8080 (con `PORT=xxxx` para otro puerto).
- Publicar: `git add . && git commit -m "..." && git push` (GitHub Actions publica en Pages).

## Limitaciones del entorno de Claude (Cowork)

- El sandbox **no llega a ArcGIS, OpenRouteService ni teselas OSM**. Las descargas y las pruebas con servicios reales las hace Julián en su PC. Para probar, se simulan las respuestas (`page.route` de Playwright).
- **No se puede hacer `git commit/push` desde la VM** (no puede borrar los archivos de bloqueo de git y no tiene credenciales). Julián hace los push, o Claude Code en su PC.
- Pruebas de interfaz: Playwright con el Chromium del contenedor cloud, sobre una copia de `app/`.

## Mapa del código (`app/`)

| Archivo | Rol |
| --- | --- |
| `index.html`, `css/estilos.css` | Interfaz de la app usuario |
| `js/config.js` | **Hoy:** escenarios hardcodeados → **migrar a `data/catalogo.json`** (spec §3) |
| `js/datos.js` | Carga de GeoJSON |
| `js/mapa.js` | Leaflet: capas, ruta, redimensionado |
| `js/diagnostico.js` | Dentro / cerca / fuera del área (proyección local, <1 ms) |
| `js/posicion.js` | Pin arrastrable, GPS, linterna. **Hoy** apaga el GPS al usar el pin → **migrar al modelo de dos puntos** (spec §5.1): ubicación real siempre activa si hay permiso + pin de referencia |
| `js/brujula.js` | Brújula: norte arriba / rota el mapa |
| `js/ruta.js` | Motor de rutas: vía oficial → ORS sugerida → línea recta |
| `js/claves.js` | Clave de ORS (pública a propósito) |
| `data/tsunami_vina/` | Capas SENAPRED + `metadata.json` |
| `panel/` | **Por crear:** app operador |

## Próximo paso

Spec §10, punto 1: reestructurar a zonas × amenazas con catálogo y procedencia. Revisa §13 para ver qué falta del equipo (Supabase y clave ORS bloquean los puntos 3 y 6).
