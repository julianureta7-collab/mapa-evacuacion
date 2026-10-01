# Reporte 04: Herramienta de dibujo del operador

**Fecha:** 1 de octubre de 2026 · **Spec:** §6 y §7 · **Estado:** hecho

## Qué se hizo

La app operador (`/operador/`) tiene una nueva sección, **"Información en el mapa"**, para que una persona capacitada actualice la información de evacuación **en tiempo real**. Es la función que permite usar la app en contextos sin mapas oficiales (incendios, inundaciones, el Campus) o cuando la realidad cambia (una vía cortada).

| Herramienta | Qué dibuja | Efecto en la app de las personas |
| --- | --- | --- |
| **Ruta** | Línea, en el sentido de la evacuación | Pasa a ser la **primera opción**: "Ruta verificada por operador" |
| **Punto de encuentro** | Punto | Nuevo destino válido para las rutas |
| **Área de peligro** | Polígono | Se suma al diagnóstico ("debes evacuar") y ninguna ruta puede volver a entrar en ella |
| **Bloqueo** | Línea que cruza una calle | Se descarta cualquier ruta que lo cruce, incluidas las oficiales |
| **Desactivar vía oficial** | Clic sobre una vía de SENAPRED | La vía deja de ofrecerse (no se borra; se puede reactivar) |

**Cada elemento lleva obligatoriamente** un motivo y una fuente; el autor y la hora se registran automáticamente. La **vigencia** puede ser permanente o de 1, 2, 4 o 24 horas. Se puede aplicar a una amenaza específica o a **todas las amenazas de la zona** (por ejemplo, los puntos de encuentro del Campus).

## Cómo lo ve la persona

- El mapa muestra lo dibujado con colores propios. Al tocar un elemento se ve el motivo, la fuente, quién lo marcó y cuándo.
- **Jerarquía de rutas (spec §6):** ruta del operador → vía oficial → ruta sugerida por calles → modo precaución.
- **Validación común:** toda ruta, también la oficial, se descarta si cruza un bloqueo o si vuelve a entrar a un área de peligro (oficial o del operador).
- Todo llega en segundos (tiempo real, con consulta cada 15 s como respaldo) y lo vencido desaparece solo.
- En una alerta, el mapa mínimo también muestra los **tramos bloqueados**.

## Pruebas realizadas (Supabase y rutas simulados)

1. El operador dibujó en el Campus una ruta ("Salida norte") y un punto de encuentro ("Patio Norte"). Ambos quedaron guardados con zona, amenaza, motivo, fuente y vigencia.
2. Con una alerta de incendio estructural en el Campus, la persona recibió **"Ruta verificada por operador · Salida norte"** con distancia, tiempo, motivo y fuente. Antes, el Campus solo mostraba el modo precaución.
3. En Viña, al **desactivar** la vía oficial que usaba la ruta (05109VE083), la app cambió sola a otra vía (05109VE077).
4. Al poner un **bloqueo** sobre la vía elegida, la ruta pasó a otra vía que no lo cruza.

## Cómo usarla (para el equipo)

1. Entrar a `/operador/` con la cuenta de operador.
2. En "Información en el mapa", elegir zona y amenaza ("Todas las amenazas de la zona" para cosas permanentes como puntos de encuentro).
3. Elegir la herramienta y dibujar:
   - **Ruta / Bloqueo:** clic para cada punto; clic en el último punto para terminar. Las rutas se dibujan **desde el peligro hacia la zona segura**.
   - **Área de peligro:** clic en cada esquina; clic en el primer punto para cerrar.
   - **Punto de encuentro:** un clic.
4. Completar motivo y fuente, elegir la vigencia y apretar **Publicar**.
5. Para quitar algo: **Retirar** en la lista de la derecha. Queda en el registro de auditoría.

## Siguiente paso sugerido

Dibujar las zonas de seguridad del Campus San Joaquín, con vigencia **permanente** y amenaza **"Todas"**. Candidatos del tríptico UC: **Patio Norte** (esculturas "Grupo Humano") y **Patio Sur** (patio central de Ingeniería). También dibujar rutas desde los edificios principales hacia esos patios.
