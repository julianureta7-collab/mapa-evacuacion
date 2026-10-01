# Mapa de Evacuación Interactivo

Prototipo universitario (Investigación, Innovación y Emprendimiento — UC). Plataforma multiamenaza: una app usuario (modo informativo y modo emergencia) y una app operador que envía alertas y actualiza rutas en tiempo real. La app muestra siempre la mejor información disponible (operador → oficial → sugerida → precaución), con su procedencia a la vista.

**Especificación (fuente única de verdad): [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md)** · Contexto para Claude: [`CLAUDE.md`](CLAUDE.md) · Reportes: [`docs/reportes/`](docs/reportes/)

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
  data/catalogo.json  zonas × amenazas, fuentes y capas (agregar zonas aquí)
  js/catalogo.js      lectura del catálogo y zona según ubicación
  js/datos.js         carga de GeoJSON
  js/mapa.js          Leaflet
  js/main.js          arranque y UI
  js/diagnostico.js   ¿dentro o fuera del área a evacuar?
  js/posicion.js      pin de simulación, GPS y linterna
  js/brujula.js       brújula: rota el mapa según hacia dónde mira el teléfono
  data/<zona>/<amenaza>/  GeoJSON + metadata.json (generados por el script)
  operador/           app operador (login, alertas) → /operador/
  vendor/             Leaflet 1.9.4, Turf 7.4 y leaflet-rotate 0.2.8 (GPL-3.0) copiados localmente
scripts/
  descargar_capas.mjs descarga desde el FeatureServer de SENAPRED
  servidor.mjs        servidor estático de desarrollo
docs/reportes/        un reporte por etapa para el equipo
```

## Escenarios

| Zona | Amenaza | Datos | Estado |
| --- | --- | --- | --- |
| Viña del Mar | Tsunami | SENAPRED 2024, oficial | ✅ |
| Viña del Mar | Incendio forestal | Capa oficial + operador | ⏳ |
| Campus San Joaquín | Incendio estructural | Dibujado por operador | ⏳ |
| Zona 3 | Por decidir (multiamenaza) | Oficial | ⏳ |

## Fuente de datos

Capas de amenaza: SENAPRED, *Amenaza por Tsunami 2024*, publicadas en el Geoportal de Chile (IDE Chile). La fecha de descarga queda registrada en `app/data/<zona>/<amenaza>/metadata.json` y se muestra en la app.

