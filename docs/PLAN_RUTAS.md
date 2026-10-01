# Plan del motor de rutas de evacuación (v3)

> Estado: **propuesta para después del MVP** (1-oct-2026): el equipo decidió mantener el motor actual para el viernes.
> Hallazgo relevante: 15 vías oficiales terminan dentro del área (p. ej. 4 Norte, a 332 m de la línea segura) y hoy se descartan; el punto 4 del plan ("cola hasta la línea segura") las aprovecharía.
> Al aprobarse, se implementa en `app/js/ruta.js` y se resume en `docs/ESPECIFICACION.md` §6.

## 1. Qué se ve en las capturas y por qué pasa

| Captura | Síntoma | Causa |
| --- | --- | --- |
| Pin en la Base Naval Las Salinas → ruta de 1,9 km | La ruta empieza lejos del pin y da un rodeo enorme por la costanera | Los caminos internos de la Base están marcados como **privados** en OpenStreetMap. OpenRouteService (ORS) no los usa y **ajusta el inicio a la calle pública más cercana** (hasta 350 m). El código dibujaba la ruta desde ese punto ajustado, **no desde el pin**, y la optimizaba por distancia total, no por tiempo para salir de la zona |
| iPhone: "Sigue la vía 94 m", sin tramo desde el pin | El tramo inicial desaparece | El punto ajustado por ORS quedó junto a la vía; la unión con la vía se hizo en el primer punto de ORS, **que no era el pin** |
| Pin en calle Capilla → tramo suelto en la quebrada | La ruta empieza a ~150 m del pin | Igual: ajuste de ORS a la red pública, sin conector desde el pin |

**Problemas de fondo:** (1) no hay garantía de continuidad entre tramos; (2) el criterio "más corto hasta el final de la vía" no es el correcto para un tsunami, donde lo urgente es **salir de la zona de inundación**; (3) no se detecta cuándo el camino por calles es poco confiable (ajuste lejano o rodeo absurdo).

## 2. Recursos y sus límites

| Recurso | Fortaleza | Límite |
| --- | --- | --- |
| **Vías oficiales** (SENAPRED) | Oficiales, en sentido de evacuación, funcionan sin internet | Corredores sueltos; no cubren todo (≈77 % del área tiene una a ≤500 m); pueden estar dibujadas un poco fuera de la calle |
| **Rutas a pie** (ORS sobre OpenStreetMap) | Siguen calles reales | Excluyen zonas privadas (bases, condominios), pueden faltar escaleras o senderos; ajustan inicio/fin hasta 350 m; requieren internet; límite 40 consultas/min |
| **Línea recta** | Siempre disponible, instantánea, sin internet | Puede cruzar obstáculos (quebradas, edificios, rejas) |
| **Línea segura** (SENAPRED) | Marca dónde termina la evacuación en tierra | Hoy se usa solo como dibujo (rol `referencia`) |

**Hallazgo clave:** el borde del área de inundación incluye la **costa**. No sirve como "salida" (salir por ahí es entrar al mar). La salida correcta es la **línea segura**, que es el borde terrestre.

## 3. Objetivo de la ruta (qué es "óptima")

Para tsunami lo urgente es **cruzar la línea segura lo antes posible**; llegar al punto de encuentro es secundario.

```
puntaje = tiempo_hasta_salir_de_la_zona
        + 0,25 × tiempo_restante_hasta_el_destino
        + penalizaciones de confianza
```

- **Penalizaciones de confianza:** cada metro de tramo recto (no por calles) cuenta ×1,5. Un ajuste de ORS de más de 100 m suma +60 s. Un rodeo sospechoso (ORS más de 2,5 veces la línea recta) suma +60 s.
- **Preferencia oficial (spec §6):** se elige la ruta por vía oficial **salvo** que una alternativa por calles saque de la zona **al menos 40 % más rápido**. En ese caso se muestra la alternativa y se explica: "La vía oficial más cercana tomaría 22 min; esta ruta te saca de la zona en 6 min".
- Para amenazas sin línea segura (incendio, operador): el destino son los puntos de encuentro y el objetivo es el tiempo hasta salir del área de peligro.

## 4. Algoritmo

**Paso 0 — Diagnóstico.** Si el punto está fuera del área y a más de 100 m: zona segura, sin ruta. Si está fuera pero a menos de 100 m: "aléjate de la costa" hacia el punto más cercano de la línea segura.

**Paso 1 — Candidatos (sin internet, ~2 ms):**

- **A. Vías oficiales:** hasta 3 vías a ≤500 m, cada una con su **mejor punto de entrada** (cualquier vértice o la proyección; costo = acercamiento × 1,4 + resto de vía). Si la vía termina dentro del área, se le agrega como cola el tramo más corto hasta la línea segura o a un punto de encuentro a ≤150 m.
- **B. Salidas directas:** 2 puntos de la **línea segura**: el más cercano y el mejor a ±250 m a lo largo de la línea (evita quedar pegado a una quebrada).
- **C. Puntos de encuentro:** los 2 más cercanos fuera del área (respaldo, y destino principal en amenazas sin línea segura).

**Paso 2 — Medir por calles con UNA consulta.** Matriz de ORS (`/v2/matrix/foot-walking`): pin → todos los candidatos (entradas de vía, salidas, puntos). Devuelve tiempo y distancia reales **y cuánto se ajustó cada punto a la red** (`snapped_distance`).

- Si el **pin se ajustó más de 100 m**, la persona está fuera de la red pública (base, condominio, playa). Para el tramo inicial se compara: calles vs. **línea recta a la entrada de la vía**. Si las calles dan un rodeo de más de 2,5× la recta y la recta es de ≤400 m, se usa la recta, marcada como "dirección" y con advertencia.
- Si la matriz falla (sin clave, sin red, 429): se pasa directo al paso 4 (modo sin internet).

**Paso 3 — Trazar solo la ganadora.** Una consulta `directions` al mejor candidato (más una segunda si la primera falla la validación). Se arma la ruta con la **regla de continuidad** (§5) y se valida (§6).

**Paso 4 — Modo sin internet (siempre funciona).** Mismos candidatos A y B con costos en línea recta × 1,4. Ruta = recta (punteada) hasta la entrada de la vía + vía oficial completa, o recta hasta la línea segura. Se muestra la dirección ("hacia el oriente, 300 m") y el aviso "sin servicio de rutas".

**Paso 5 — Estabilidad mientras la persona camina** (con GPS):

- No se recalcula mientras la persona esté a menos de 40 m de su ruta: va **bien encaminada**, y lo ya recorrido se recorta.
- Si se desvía más de 40 m, se recalcula.
- **Histéresis:** solo se cambia de ruta si la nueva es al menos 15 % mejor, para que no salte entre opciones.

## 5. Regla de continuidad (garantiza que nunca se corte)

Toda ruta se construye con **una sola función** a partir de tramos `[pin → … → destino]`:

1. El primer punto es **siempre el pin**.
2. Si dos tramos consecutivos no coinciden (por más de 1 m), se inserta un **conector recto punteado**: pin → inicio de ORS, fin de ORS → entrada de la vía, fin de la vía → punto de encuentro.
3. **Unión con la vía:** en cuanto el camino por calles pasa a menos de 20 m de la vía elegida, se sube a ella y la sigue (no hay retrocesos).
4. Los conectores de más de 30 m se informan en el texto ("camina 120 m hacia el noreste hasta la calle…").

Resultado: la línea dibujada **siempre parte en el pin y es continua hasta el destino**.

## 6. Validación de cada ruta

- **Sale y no vuelve a entrar** al área de peligro (ni a las áreas del operador).
- **No cruza bloqueos** del operador.
- **Termina en zona segura:** fuera del área o en un punto de encuentro fuera del área.
- **No entra al mar:** ningún tramo recto cruza la costa (se verifica que no salga del área por el lado del mar; los conectores rectos que cortan la línea de costa se descartan).
- Si nada pasa la validación: **modo precaución**. "Dirígete a zona alta, lejos de la costa", con flecha hacia el punto más cercano de la línea segura.

## 7. Situaciones revisadas (3 iteraciones)

| # | Situación | Qué haría el motor actual | Cómo lo cubre el plan |
| --- | --- | --- | --- |
| 1 | Pin dentro de un recinto privado (Base Naval) | Ruta cortada + rodeo de 1,8 km | Conector desde el pin; detección de ajuste >100 m; comparación con recta a la vía o a la línea segura |
| 2 | Pin en la arena de la playa | ORS ajusta a la costanera; tramo suelto | Conector pin → costanera (punteado, se informa) |
| 3 | Vía oficial dibujada sobre un sendero o escalera que no está en OSM | Fin de ORS lejos de la entrada; salto | Conector fin ORS → entrada; unión a la vía apenas el camino la toca |
| 4 | Vía "cercana" detrás de una quebrada | Rodeo largo hacia esa vía | La matriz mide el tiempo real; gana otra vía o la salida directa |
| 5 | Pin a 60 m de la línea segura pero lejos de toda vía | Lleva a una vía lejana o al punto de encuentro | Candidato B (salida directa) gana por tiempo para salir |
| 6 | Zona sin vías a ≤500 m (≈17 % del área) | Respaldo por calles a un punto de encuentro | Candidatos B y C con la misma lógica; no depende de vías |
| 7 | La vía termina dentro del área, lejos de puntos | Se descartaba la vía | Cola automática hasta la línea segura o un punto |
| 8 | La salida "más cercana" es la costa | No aplica hoy, pero sería un riesgo | Las salidas se toman de la **línea segura**, nunca del borde costero |
| 9 | ORS sin clave, sin internet o saturado | Línea recta a un punto de encuentro | Modo sin internet: recta a la vía oficial + vía completa, o recta a la línea segura |
| 10 | Persona caminando con GPS | Recalcula cada 25 m; puede saltar de ruta | Seguimiento: no recalcula si va encaminada; histéresis del 15 % |
| 11 | Muchas personas a la vez (demo/entrevistas) | 3 consultas por ruta | 1 matriz + 1 ruta por persona; caché por ~10 m; sin consultas mientras va encaminada |
| 12 | Pin fuera del área pero a <100 m del borde | Ruta a un punto de encuentro | Ruta corta hacia la línea segura ("aléjate de la costa") |
| 13 | Dos alertas en la misma zona (tsunami + incendio) | Valida solo contra una | Valida contra todas las áreas activas (spec §5.3) |
| 14 | El operador bloquea un tramo de vía | No considerado | Bloqueos en la validación; se elige otra vía o salida |
| 15 | Ruta por calles que vuelve a entrar al área | Se descartaba bien | Igual, y ahora hay más candidatos para reemplazarla |
| 16 | Pin en el mar | Diagnóstico "seguro" | Si el pin está del lado mar de la costa: "Ubica el pin en tierra" |
| 17 | Amenaza sin línea segura (incendio, operador) | — | Candidatos = puntos de encuentro + rutas del operador; mismo puntaje con "salir del área de peligro" |

## 8. Cambios de datos

- Nuevo rol de capa **`linea_segura`** en el catálogo. La "Línea segura" de SENAPRED pasa de `referencia` a `linea_segura`: se sigue dibujando igual, pero ahora el motor la usa como destino de salida.
- Sin cambios en Supabase.

## 9. Presupuesto de consultas a ORS

| Momento | Consultas |
| --- | --- |
| Primera ruta de una persona | 1 matriz + 1 directions (2 si la primera falla la validación) |
| Persona caminando bien encaminada | 0 |
| Persona que se desvía | 1 matriz + 1 directions |

Con el límite gratuito (40/min, 2.000 rutas/día y 500 matrices/día) alcanza para unas **20 personas recibiendo ruta en el mismo minuto**.

## 10. Pruebas automáticas (antes de publicar)

Grilla de puntos cada 150 m en el área de Viña, con 4 simulaciones de ORS: (a) normal; (b) ajuste de 150–300 m (recinto privado); (c) ORS caído; (d) rodeos de 3×. En **todas** las rutas se verifica:

- empieza exactamente en el pin;
- es continua (ningún salto de más de 1 m entre tramos);
- termina en zona segura;
- no vuelve a entrar al área;
- ningún conector recto cruza la costa;
- máximo 3 consultas por ruta.

Además, se reproducen los 3 casos de las capturas con sus coordenadas.

## 11. Decisiones para aprobar

1. **Objetivo de tsunami:** priorizar "salir de la zona lo antes posible" por sobre "llegar al punto de encuentro". (Recomendado.)
2. **Excepción a la jerarquía:** mostrar una ruta por calles en vez de la vía oficial solo si saca de la zona **≥40 % más rápido**, explicándolo en pantalla. (Recomendado.)
3. **Línea recta como tramo de ruta:** permitida hasta 400 m cuando las calles dan un rodeo de más de 2,5×, siempre punteada y con el aviso "dirección aproximada, verifica el camino". (Recomendado.)

**Estimación:** ~3–4 horas de implementación y pruebas.
