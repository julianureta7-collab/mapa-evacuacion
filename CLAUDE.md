# Contexto para Claude Code

Proyecto: app web de rutas de evacuación (MVP para demostración en clase, plazo < 2 semanas).
La especificación completa vive fuera del repo (OneDrive del usuario); este archivo resume lo esencial.

## Principios
- **No inventar rutas.** Las vías, puntos de encuentro y áreas vienen de SENAPRED (tsunami). En el campus, las zonas son levantamiento propio y la app debe decirlo.
- **Simulacro siempre visible.** El banner de SIMULACRO y el aviso "no reemplaza a la autoridad" no se quitan.
- **Ubicación solo en el dispositivo.** Nunca enviar coordenadas del usuario a un servidor propio.
- **Sin build.** JS plano con ES modules, sin framework ni bundler. Librerías copiadas en `app/vendor/` (Leaflet y Turf son globales `L` y `turf`). Nada de CDNs: tiene que funcionar offline.
- Código, comentarios y textos de UI en español.

## Etapas
1. Datos: GeoJSON SENAPRED visibles en Leaflet ✅
2. Diagnóstico ✅ (`js/diagnostico.js`, `js/posicion.js`; distancia al borde con proyección local, no Turf, por rendimiento)
3. ✅ Ruta (`js/ruta.js`): PRINCIPAL = seguir la vía oficial SENAPRED más conveniente (las vías están digitalizadas costa→zona segura; corredores sueltos, no red), acercamiento recto <60 m o por ORS; RESPALDO = ORS `foot-walking`; validación "sale del área y no vuelve a entrar"; NO usar `avoid_polygons` con el área donde está el usuario; fallback a ruta precalculada o flecha recta si ORS responde 429
4. ← **actual** Alarma: panel con login (Supabase Realtime) que activa modo emergencia en todos los dispositivos; polling 15 s de respaldo
5. Interfaz de emergencia: flecha con brújula, voz, vibración (Android) / pitido (iPhone); botón "Estoy listo para el simulacro" que pide permisos con un toque
6. Offline: service worker

## Demostración objetivo
Campus San Joaquín: alerta de **sismo** → ruta a zona de seguridad más cercana; alerta de **incendio en edificio X** → esa zona se descarta (buffer 50 m) y la ruta cambia. Luego Viña del Mar (tsunami) con pin de simulación arrastrable.

## Comandos
- `node scripts/descargar_capas.mjs` — descarga capas (campos: puntos/vías usan `nom_com`; el área usa `comuna`)
- `node scripts/servidor.mjs` — http://localhost:8080

## Al terminar cada etapa
Escribir `docs/reportes/NN-etapa.md`: qué se hizo, capturas, decisiones, limitaciones. Lo usa el equipo para el informe escrito.

## Caché de GitHub Pages
Pages sirve con `Cache-Control: max-age=600`. Al publicar cambios en JS/CSS, subir el número `?v=N` en `index.html` y en los `import` de `js/*.js` (buscar `?v=`), si no los navegadores pueden seguir usando la versión anterior por 10 minutos.
