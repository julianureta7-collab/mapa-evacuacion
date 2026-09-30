# Mapa de Evacuación — Especificación (v2.1)

> **Fuente única de verdad del proyecto.** Si algo en otro archivo contradice esto, manda este documento.
> Ubicación: `docs/ESPECIFICACION.md` del repo `julianureta7-collab/mapa-evacuacion`.
> Versión 2.1 · acordada el 30 de septiembre de 2026 · reemplaza a la especificación v1 (archivo en OneDrive, ya retirado).

## 1. Qué es y para cuándo

Aplicación web (PWA) que, frente a una amenaza, muestra a cada persona **qué hacer y por dónde evacuar según dónde está**, usando la mejor información disponible y diciendo siempre de dónde viene. La componen dos apps:

- **App usuario** (pública, celular): modo informativo y modo emergencia.
- **App operador** (privada, con login, notebook): envía alertas y actualiza en tiempo real la información del mapa (rutas, áreas de peligro, puntos de encuentro, tramos bloqueados).

Proyecto del curso Investigación, Innovación y Emprendimiento (UC), 5 integrantes.

**Hito: viernes 2 de octubre de 2026 — versión lista para testear con entrevistados externos.** La app usuario tiene que estar pulida, porque es lo que se evalúa. La app operador puede ser básica, pero tiene que poder mandar alertas durante las entrevistas.

## 2. Principios (no negociables)

1. **Mostrar siempre la mejor información disponible, en orden de prioridad** (ver §6), con su procedencia visible en pantalla.
2. **Solo información oficial en contenidos y capas.** No necesariamente de SENAPRED: sirve cualquier organismo oficial (SENAPRED, SHOA, CONAF, SERNAGEOMIN, DGA, plan de emergencia de la universidad, etc.), siempre citado.
3. **No inventar rutas.** Una ruta es oficial, la dibujó un operador o fue calculada por la app contra un área de peligro conocida y con su justificación a la vista. Sin área de peligro no hay ruta sugerida: se pasa a **modo precaución**.
4. **Escalable por datos, no por código.** Agregar una zona o una amenaza = agregar datos (catálogo + capas) o que un operador dibuje. El código no conoce "Viña" ni "Campus".
5. **Simulacro siempre visible** mientras la alerta sea de simulacro. Aviso permanente: "No reemplaza las instrucciones de la autoridad".
6. **Privacidad:** la ubicación se procesa en el teléfono. **Solo se envía al operador cuando la persona presiona "Necesito ayuda"** (§8).
7. Sin frameworks ni build: HTML + JS (ES modules) + librerías copiadas en `app/vendor/`. Código y textos en español.

## 3. Conceptos del modelo

| Concepto | Qué es | Ejemplo |
| --- | --- | --- |
| **Zona** | Territorio cubierto, con un polígono de cobertura. *No confundir con **área de peligro**, que es el polígono de la amenaza dentro de una zona* | Viña del Mar, Campus San Joaquín |
| **Amenaza** | Tipo de desastre disponible en una zona | tsunami, incendio forestal, incendio estructural |
| **Capa** | Conjunto geográfico de una zona × amenaza | área de peligro, vías, puntos de encuentro |
| **Procedencia** | De dónde viene cada elemento | `oficial` (con organismo y fecha), `operador` (autor, hora, motivo, vigencia), `sugerida` (app) |
| **Alerta** | Emergencia activa en una zona × amenaza | "Incendio en Campus, simulacro, hasta 16:00" |
| **Ubicación real** | GPS del teléfono, si hay permiso. Se sigue siempre, aunque la persona esté mirando otra zona | Estoy en el Campus |
| **Pin de referencia** | Lo que la persona está mirando: pin arrastrable o elegido con el desplegable de zona | Estoy mirando Viña |

**Catálogo** (`app/data/catalogo.json`, por crear): lista de zonas con su polígono de cobertura, sus amenazas disponibles y, por amenaza, las capas oficiales (archivos) y el contenido informativo. Las capas del operador viven en la base de datos (§9) y se superponen a las oficiales.

**Roles genéricos de capa:** el motor no conoce los nombres de cada organismo. Solo conoce estos **roles**, y el catálogo traduce cada capa oficial a uno de ellos:

| Rol | Uso | Ejemplo tsunami SENAPRED |
| --- | --- | --- |
| `area_peligro` | Diagnóstico y validación de rutas | Área a Evacuar |
| `ruta` | Rutas a seguir (en el sentido de evacuación) | Vía de Evacuación |
| `punto_encuentro` | Destinos | Punto de Encuentro |
| `referencia` | Solo dibujo, sin lógica | Línea Segura, Cota 30 |
| `bloqueo` | Tramos que ninguna ruta puede cruzar | (solo del operador) |

Los elementos del operador usan los mismos roles. Así, una zona o amenaza nueva se incorpora sin tocar el código.

**Contenido informativo:** un texto por **amenaza** (qué hacer antes, durante y después, y en modo precaución), compartido por todas las zonas, con agregados opcionales por zona. Siempre con su fuente oficial.

## 4. Zonas y amenazas para el viernes

| Zona | Amenazas | Fuente | Estado |
| --- | --- | --- | --- |
| Viña del Mar | Tsunami | SENAPRED, *Amenaza por Tsunami 2024* (vías, puntos, área, línea segura) | ✅ datos cargados |
| Viña del Mar | Incendio forestal | Capa oficial de amenaza por incendio forestal (SENAPRED/CONAF en Geoportal, publicación 2020) + lo que dibuje el operador | ⏳ verificar cobertura en Viña y descargar |
| Campus San Joaquín | Incendio estructural | No hay datos digitales ni respuesta de prevención de riesgos. **Las zonas de seguridad (puntos de encuentro, vigencia permanente, amenaza "todas") y las rutas las dibuja un operador** con la app operador. Durante una alerta, el operador marca el edificio afectado como área de peligro. Mientras no haya nada dibujado, el Campus muestra modo precaución | ⏳ falta ubicar las zonas en terreno |
| Zona 3 | Por decidir | Criterio: **más de un tipo de amenaza, distintas a tsunami e incendio, con bastante información oficial**, para lucir la función multiamenaza | ⏳ decisión del equipo |

- **Sismo no se incluye** en esta versión.
- Candidatas para la zona 3, por verificar: una comuna con peligro **volcánico** + lahares (p. ej. Pucón/Villarrica, mapas de SERNAGEOMIN) o una con **inundación** + **remoción en masa**. Se decide según qué datos descargables existan.
- El desplegable de amenaza **solo muestra las amenazas disponibles en la zona actual** (en Viña no aparece sismo).

## 5. App usuario

### 5.1 Ubicación real y pin de referencia (regla central)

La app maneja **dos puntos**:

- **Ubicación real (GPS):** si la persona dio permiso de ubicación, se sigue **todo el tiempo**, aunque esté mirando otra parte. Se procesa solo en el teléfono.
- **Pin de referencia:** decide **qué zona y qué mapa se muestran** en modo informativo. Se mueve arrastrándolo, tocando el mapa o con el **desplegable de zona**, que lo lleva al centro de esa zona. Sin permiso de GPS, el pin es el único punto. El botón "Ir a mi ubicación" pone el pin sobre la ubicación real.

**Quién recibe una alerta:** la alerta llega si **la ubicación real o el pin** están dentro de la zona alertada.

- Ejemplo: estoy físicamente en el Campus con GPS activo y tengo el pin en Viña. Me salta la alerta tanto si hay alarma en Viña como si la hay en el Campus.
- **Una alerta nunca afecta a quien no tiene ninguno de sus dos puntos dentro de la zona alertada.** Una alerta en el Campus no cambia nada para quien está mirando Viña desde Santiago con el GPS apagado.
- Si el pin cae fuera de todas las zonas cubiertas, se muestra el selector de zona con el mensaje "Aún no cubrimos esta ubicación".
- **La decisión se toma en el teléfono:** la app recibe todas las alertas activas y compara localmente sus dos puntos con cada zona. El servidor nunca sabe dónde está nadie.

### 5.2 Modo informativo

- Mapa de la zona con las capas de la amenaza elegida en el desplegable y la leyenda.
- **Panel "Información"** por amenaza: qué hacer antes, durante y después, con fuente oficial citada. Es lo que evalúa O3.
- Diagnóstico (dentro / cerca del límite / fuera del área de peligro) y ruta recomendada según la jerarquía de §6, **calculados desde el pin**.
- Brújula con efecto linterna (hecha).
- Si la amenaza no tiene capa geográfica en esa zona, se muestra solo la información pedagógica, con el aviso "Sin mapa de amenaza para esta zona".

### 5.3 Modo emergencia

- Se activa **solo** cuando llega una alerta que corresponde según §5.1. Al activarse, la app cambia sola a la zona y a la amenaza de la alerta.
- **Desde dónde se calcula la ruta:** si la ubicación real está dentro de la zona alertada, **la ruta sale de la ubicación real** (es donde la persona corre peligro) y el pin se mueve ahí. Si solo el pin está dentro (por ejemplo, alguien simulando Viña desde Santiago), la ruta sale del pin.
- **Si hay dos alertas que te aplican a la vez** (una por tu ubicación real y otra por tu pin), manda la de la ubicación real. La otra aparece como un aviso secundario que se puede tocar para verla.
- **Si hay dos alertas en la misma zona** (p. ej. tsunami e incendio en Viña después de un terremoto), se muestran ambas en el banner. La ruta usa la amenaza de la alerta más reciente, pero **se valida contra las áreas de peligro de todas las alertas activas de la zona**, para no llevar a nadie de un peligro a otro.
- **Si hay área de peligro y el punto de origen está fuera de ella** (a más de 100 m del borde): pantalla verde "Estás en zona segura, permanece aquí", sin ruta. **Si la amenaza no tiene área de peligro** (p. ej. el Campus antes de que el operador marque el edificio), se guía al punto de encuentro con ruta del operador si existe, y si no, se pasa a precaución.
- **Lo primario es la alerta y la ruta:** banner con el mensaje del operador (y SIMULACRO si corresponde), ruta grande y clara, distancia y tiempo. La flecha, la voz y la vibración quedan **después del viernes**.
- **Botón "Necesito ayuda"** disponible en cualquier momento de la alerta (§8). **Es la última feature.**
- Vuelve sola a modo informativo cuando el operador cancela la alerta o cuando vence (**por defecto, a las 2 horas**).
- No se pregunta nada al inicio de la alerta: no hay diálogo de consentimiento que se interponga.
- Durante la emergencia, los desplegables de zona y amenaza quedan fijos en los de la alerta, para que nadie pierda la ruta por error.

### 5.4 Modo precaución

Cuando no existe una ruta válida (no hay ruta del operador ni oficial, y no se puede justificar una sugerida), se muestran las **instrucciones oficiales de qué hacer según la amenaza**, sin ruta, con su fuente.

## 6. Jerarquía de rutas

| Prioridad | Fuente | Cuándo | Cómo se muestra |
| --- | --- | --- | --- |
| 1 | **Operador** | Hay ruta vigente dibujada por un operador para esa zona × amenaza (o para "todas") | "Ruta verificada por operador · [autor] · hace X min" + motivo |
| 2 | **Oficial** | Hay vías oficiales (p. ej. SENAPRED tsunami) y no están desactivadas por el operador | "Ruta oficial [organismo]" |
| 3 | **Sugerida por la app** | Hay un área de peligro (oficial o dibujada por el operador) para validar, pero no hay ruta 1 ni 2 | "Sugerida automáticamente, no verificada" + justificación |
| 4 | **Precaución** | No se puede justificar ninguna ruta | Instrucciones oficiales, sin ruta |

Mientras el operador todavía no dibuja nada, los niveles 2 y 3 cubren usando información oficial. Cuando el operador publica, su ruta pasa a mandar.

**Validación común a todos los niveles** (1, 2 y 3): una ruta se descarta si **cruza un tramo bloqueado** activo, o si, una vez fuera de un área de peligro vigente (oficial **o dibujada por el operador**), vuelve a entrar a ella. Así, si el operador marca un incendio que corta una vía oficial de tsunami, esa vía deja de ofrecerse sola, sin tener que desactivarla a mano. Si ninguna ruta de ningún nivel pasa la validación, se pasa a precaución (nivel 4).

**Cómo se elige entre varias rutas del mismo nivel:** las rutas del operador y las oficiales se tratan igual: acercarse a la ruta más conveniente y seguirla hasta su final (ver motor, abajo). Los **destinos** válidos son los puntos de encuentro oficiales y los del operador que estén vigentes y fuera de toda área de peligro.

**Justificación obligatoria de una ruta sugerida** (texto visible): calles peatonales (OpenStreetMap vía OpenRouteService); sale del área de peligro en X m y no vuelve a entrar; evita las áreas de peligro y los tramos bloqueados por el operador; "no ha sido validada por un operador".

**Motor de rutas actual** (hecho, `app/js/ruta.js`):

- **Método oficial:** acercarse a la vía oficial más conveniente (costo = acercamiento × 1,4 + resto de la vía) y seguirla tal cual hasta su final o el punto de encuentro. Las vías SENAPRED están digitalizadas en el sentido de la evacuación (costa → zona segura).
- **Sugerida:** ORS `foot-walking` a los 3 puntos más cercanos, validación "sale y no vuelve a entrar", y gana la que menos metros recorre dentro del área. **No usar `avoid_polygons` con el área donde está el usuario**: ORS no encuentra ruta. Sí se puede usar para áreas de peligro y bloqueos del operador donde el usuario no está.
- **Respaldo sin servicio:** línea recta punteada con dirección.
- Las rutas del operador deben seguir el mismo camino que las vías oficiales: acercarse a la ruta y seguirla.

## 7. App operador

- **Login** con cuentas nominadas para los 5 integrantes. Un solo rol "operador". **Registro de auditoría**: quién hizo cada cambio y cuándo.
- Diseñada para **notebook**.
- **Alertas:** elegir zona, amenaza, mensaje, simulacro (sí por defecto) y vigencia (2 h por defecto); activar y cancelar. **Solo se pueden enviar alertas a zonas cubiertas.**
- **Dibujo en el mapa** (en tiempo real hacia los usuarios): rutas, puntos de encuentro, áreas de peligro (polígonos) y tramos bloqueados. Solo dentro de zonas cubiertas.
- **Cada elemento dibujado lleva obligatoriamente:** motivo, fuente de la información, autor, hora y vigencia.
- **Vigencia:** "permanente" (p. ej. las zonas de seguridad del Campus) o "hasta [fecha y hora]" (p. ej. un bloqueo durante una alerta).
- **Amenaza:** cada elemento se asocia a una amenaza de la zona o a **"todas"**. Por ejemplo, un punto de encuentro del Campus sirve para cualquier amenaza del Campus.
- Lo dibujado y vigente se ve **en ambos modos**: en informativo, como preparación, y en emergencia, como guía.
- **Desactivar una vía oficial** (p. ej. si está bloqueada) sin borrarla, con motivo.
- *(Última)* Aprobar con un clic una ruta sugerida para que pase a "verificada".
- *(Última)* Ver las solicitudes de ayuda: posición, hora, estado y datos de contacto si los dejaron. Copiar o exportar para derivar a quien corresponda.

## 8. Botón de ayuda y ubicación (última feature)

- Disponible en cualquier momento de una alerta activa. Envía al operador la ubicación y, opcionalmente, nombre y teléfono.
- Estados que ve el operador: necesita ayuda / evacuando / llegó a zona segura (estos dos últimos, si alcanza).
- Anónimo por defecto. Los datos se **borran 24 h después** de terminada la alerta.
- Seguimiento continuo de la ubicación de todos los usuarios: **no está en el MVP**. Se evaluará después, y requeriría consentimiento.

## 9. Arquitectura

```
App usuario (GitHub Pages) ──realtime──▶ Supabase ◀──realtime/escritura── App operador (login)
       │                                   │
       ├── capas oficiales estáticas (app/data, precargadas)
       └── ORS (rutas sugeridas y acercamientos)
```

- **Hosting:** GitHub Pages, publicación automática en cada push a `main` (`.github/workflows/pages.yml`).
- **Tiempo real y datos del operador:** Supabase (plan gratuito). **Pendiente: crear el proyecto** (URL + anon key).
- **Tablas propuestas** (se ajustan al implementar):
  - `alertas` (id, zona, amenaza, mensaje, simulacro, activa, vigente_hasta, autor, creada)
  - `elementos_operador` (id, zona, amenaza o "todas", rol: ruta|punto_encuentro|area_peligro|bloqueo, geometria GeoJSON, motivo, fuente, autor, creado, vigente_hasta: fecha o null = permanente, activo)
  - `desactivaciones_oficiales` (id, zona, amenaza, id_elemento_oficial, motivo, autor, creado)
  - `solicitudes_ayuda` (id, alerta_id, lat, lng, precision, nombre?, telefono?, estado, creada): el público inserta; solo el operador lee; borrado a las 24 h
  - `auditoria` (quién, qué, cuándo)
- **Seguridad (RLS):** el público solo lee `alertas`, `elementos_operador` y `desactivaciones_oficiales`, y solo inserta en `solicitudes_ayuda`. El resto requiere un operador autenticado.
- **Respaldo:** si se cae el realtime, consulta cada 15 s.
- **Claves en el cliente:** la de ORS y la anon de Supabase quedan visibles en el sitio. Se usan claves gratuitas, y la seguridad real la dan las reglas RLS.

## 10. Prioridades hasta el viernes

**Imprescindible** (en este orden):

1. Reestructurar a **zonas × amenazas** con catálogo y procedencia (hoy el código usa "escenarios").
2. Dos puntos (ubicación real siempre activa si hay permiso + pin de referencia) que deciden zona y alerta (§5.1), con los desplegables de zona y amenaza.
3. Supabase + app operador básica: login, **enviar y cancelar alertas** por zona × amenaza.
4. Modo emergencia en la app usuario (banner, ruta primaria, simulacro, vencimiento).
5. Panel "Información" y modo precaución, con contenido oficial por amenaza.
6. Operador: dibujar rutas, áreas de peligro, puntos y bloqueos, con motivo, fuente y vigencia; aplicar en la app usuario la jerarquía y la validación común de §6.
7. Viña incendio forestal y campus incendio estructural (dibujado por el operador).

**Último, si alcanza** (en este orden): botón "Necesito ayuda" + ver solicitudes en el operador (§8) · aprobar rutas sugeridas · zona 3.

## 11. Testeo con entrevistados

- Acceso por **código QR** a la app usuario. Probablemente **un celular entregado por el equipo**.
- **Tiempos con cronómetro** (la app no mide).
- Los objetivos incluyen el **modo emergencia**: el operador envía alertas de simulacro durante la entrevista. Como la alerta llega también por el pin (§5.1), basta con que el entrevistado tenga el pin en la zona alertada, aunque esté físicamente en otra parte.

| Objetivo | Qué evalúa | Indicador |
| --- | --- | --- |
| O1 Usabilidad | Facilidad y accesibilidad de uso | Escala 1 (complejo, anti-intuitivo) a 5 (fácil, cómodo, agradable) |
| O2 Claridad visual | Claridad de mapas, rutas y puntos de interés | Escala 1 (denso, poco claro) a 5 (facilita comprensión y exploración) |
| O3 Potencial pedagógico | Consolidación de lo aprendido en el panel "Información" | Preguntas breves después de usarlo |
| O4 Tiempo de búsqueda | Mejora frente al **Visor Preparado de SENAPRED** | Tiempo por tarea en ambas herramientas (sugerido: agregar tasa de éxito) |
| O5 Emergencia | Comprensión de la alerta y la ruta | *Por definir por el equipo* |

- O2 (percepción) y O4 (desempeño) son complementarios: se mantienen ambos.
- **Tareas de O4 y buscador de direcciones:** los define otro integrante; Julián informa los cambios. Para O4 conviene usar Viña (tsunami), que está en ambas herramientas.

## 12. Estado actual (30-sep-2026)

Publicado en https://julianureta7-collab.github.io/mapa-evacuacion/

- ✅ Datos SENAPRED de Viña (tsunami) en el mapa con procedencia y fecha.
- ✅ Diagnóstico dentro / cerca / fuera, con pin arrastrable o GPS.
- ✅ Brújula (norte arriba / brújula) con efecto linterna.
- ✅ Motor de rutas: vía oficial → ORS sugerida → línea recta. En Viña, 77 % de los puntos del área obtienen ruta por vía oficial.
- ⏳ Todo lo demás de §10.

Reportes para el informe del equipo: `docs/reportes/` (uno por hito).

## 13. Pendientes que dependen del equipo

| Pendiente | Quién | Bloquea |
| --- | --- | --- |
| Crear proyecto Supabase y entregar URL + anon key | Julián | Alertas, operador |
| Clave de OpenRouteService en `app/js/claves.js` | Julián | Rutas sugeridas y acercamientos por calles |
| Decidir la zona 3 | Equipo | Zona 3 |
| Ubicar las zonas de seguridad del campus en terreno | Equipo | Campus |
| Tareas de O4, O5 y buscador de direcciones | Otro integrante | Guion de testeo |
| Revisar el contenido informativo | Equipo | O3 |

## Anexo A — Fuentes de datos verificadas

- **Tsunami (SENAPRED 2024):** FeatureServer `https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services/Amenaza_por_Tsunami_2024/FeatureServer`. Capas: 0 Punto de Encuentro, 1 Vía de Evacuación, 2 Línea Segura, 3 Área a Evacuar, 4 Cota 30. Puntos y vías usan el campo `nom_com`; el área usa `comuna`. Descarga: `node scripts/descargar_capas.mjs`.
- **Viña (bbox −71.60, −33.06, −71.48, −32.93):** 34 puntos de encuentro (25 Viña, 7 Valparaíso, 2 Concón; sin nombre, solo código), 74 vías (todas empiezan dentro del área y 59 terminan fuera; solo 4 se tocan entre sí), 3 polígonos de área, ≈ 490 KB en total.
- **Incendio forestal:** ficha "Amenaza por Incendio Forestal" en el Geoportal (SENAPRED, publicación 2020-01-02), que declara un FeatureServer. Falta verificar la cobertura en Viña.
- **Remoción en masa / aluvión:** en el Geoportal solo hay un boletín de SERNAGEOMIN, no capa vectorial.
- **Visor web vs. descarga:** apuntan al mismo recurso del catálogo; no son productos distintos.
- **Quién elabora los mapas de amenaza** (Ley 21.364): los Organismos Técnicos de Monitoreo de Amenazas (SHOA tsunami, CONAF incendio forestal, DGA inundación, CSN sísmica, SMA marejadas); SENAPRED los publica. Fuente: senapred.gov.cl/mapas-de-amenaza.
- Desde el entorno de Claude no hay acceso de red a ArcGIS ni a ORS: las descargas y las pruebas reales las corre Julián en su PC.

## Anexo B — Consideraciones legales y de seguridad

- Es software de seguridad de vida: marca de SIMULACRO, aviso de que no reemplaza a la autoridad, fecha de los datos visible y atribución de las fuentes.
- La procedencia de cada ruta siempre está a la vista (§6). Lo dibujado por el operador lleva autor, motivo y fuente.
- Solicitudes de ayuda: datos mínimos, anónimas por defecto, borrado a las 24 h. Hay que declararlo en la app.
- Cuentas de operador nominadas y auditoría de cada cambio.

## Anexo C — Registro de cambios

- **v2.1 (30-sep-2026):** modelo de dos puntos: la ubicación real se sigue siempre si hay permiso, y el pin es lo que se mira; la alerta llega si cualquiera de los dos está en la zona (§5.1). La ruta de emergencia sale de la ubicación real si está en la zona alertada; con dos alertas simultáneas manda la de la ubicación real (§5.3). Validación común de rutas contra bloqueos y áreas de peligro del operador (§6). Vigencia permanente y amenaza "todas" para elementos del operador (§7). Roles genéricos de capa y contenido por amenaza (§3). Estado "zona segura" en emergencia (§5.3). El campus usa modo precaución hasta que el operador dibuje (§4).
- **v2.1, revisión de coherencia:** se unificó el término "área de peligro" (distinto de "zona"); los usuarios leen las desactivaciones de vías; las rutas del operador pueden aplicar a "todas" las amenazas; la ruta informativa se calcula desde el pin; los desplegables quedan fijos durante la emergencia; "zona segura" solo aplica si existe área de peligro. Varias alertas en la misma zona: la ruta se valida contra todas. Las solicitudes de ayuda reemplazan a "ver usuarios" en las prioridades finales.
- **v2 (30-sep-2026):** plataforma multiamenaza con app operador; reemplaza a la v1.
