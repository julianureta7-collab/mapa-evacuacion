# Mapa de Evacuación Interactivo

Prototipo universitario (Investigación, Innovación y Emprendimiento — UC). Cuando se activa una alerta, la app muestra la ruta de evacuación hacia el punto seguro correspondiente, trazada sobre las vías de evacuación oficiales de SENAPRED.

> Prototipo en modo simulacro. No reemplaza las instrucciones de la autoridad.

## Cómo correrlo

Requiere Node.js 18 o superior. No hay dependencias que instalar.

```bash
# 1. Descargar las capas oficiales (una vez, o cuando quieras actualizarlas)
node scripts/descargar_capas.mjs

# 2. Levantar el servidor local
node scripts/servidor.mjs
# → abrir http://localhost:8080
```

## Estructura

```
app/                  la app pública (se publica tal cual en GitHub Pages)
  index.html
  css/estilos.css
  js/config.js        escenarios, capas y estilos
  js/datos.js         carga de GeoJSON
  js/mapa.js          Leaflet
  js/main.js          arranque y UI
  data/<escenario>/   GeoJSON + metadata.json (generados por el script)
  vendor/             Leaflet 1.9.4 y Turf 7.4 copiados localmente (sirven sin internet)
panel/                panel de activación de alertas (etapa 4)
scripts/
  descargar_capas.mjs descarga desde el FeatureServer de SENAPRED
  servidor.mjs        servidor estático de desarrollo
docs/reportes/        un reporte por etapa para el equipo
```

## Escenarios

| Clave | Amenaza | Datos | Estado |
| --- | --- | --- | --- |
| `tsunami_vina` | Tsunami | SENAPRED 2024, oficial | Etapa 1 |
| `campus_sj` | Sismo e incendio | Levantamiento propio | Pendiente de datos |

## Fuente de datos

Capas de amenaza: SENAPRED, *Amenaza por Tsunami 2024*, publicadas en el Geoportal de Chile (IDE Chile). La fecha de descarga queda registrada en `app/data/<escenario>/metadata.json` y se muestra en la app.

La especificación completa está en la carpeta del proyecto en OneDrive.
