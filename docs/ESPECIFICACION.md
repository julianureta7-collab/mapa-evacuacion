# Mapa de Evacuación — Especificación (v3.0)

> **Fuente única de verdad del proyecto.** Si algo en otro archivo contradice esto, manda este documento.
> Ubicación: `docs/ESPECIFICACION.md` del repo `julianureta7-collab/mapa-evacuacion`.
> Versión 3.0 · acordada el 30 de septiembre de 2026, actualizada el 2 de octubre de 2026 · reemplaza a la especificación v1 (archivo en OneDrive, ya retirado).

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

**Catálogo** (`app/data/catalogo.json`, creado): lista de zonas con su polígono de cobertura, sus amenazas disponibles y, por amenaza, las capas oficiales (archivos) y el contenido informativo. Las capas del operador viven en la base de datos (§9) y se superponen a las oficiales.

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
| Viña del Mar | Incendio forestal | SENAPRED, *Amenaza por Incendio Forestal 2024* (densidad de incendios 2020–2024, por recurrencia) como **referencia**: no es un área a evacuar. El área de peligro de una emergencia la dibuja el operador | ✅ código listo (reporte 05); falta descargar la capa con `node scripts/descargar_capas.mjs vina/incendio_forestal` |
| Campus San Joaquín | Incendio estructural | No hay datos digitales ni respuesta de prevención de riesgos. **Las zonas de seguridad (puntos de encuentro, vigencia permanente, amenaza "todas") y las rutas las dibuja un operador** con la app operador. Durante una alerta, el operador marca el edificio afectado como área de peligro. Mientras no haya nada dibujado, el Campus muestra modo precaución | ✅ dibujado por el equipo (2-oct); confirmar en terreno |
| Macul (comuna completa) | Inundación y anegamiento | SENAPRED, *Puntos Críticos Programa Invierno 2022* (31 puntos informados por la municipalidad) como **referencia**. Sin área oficial: en una emergencia el operador marca calles cortadas (bloqueo), sectores afectados (área de peligro) y albergues (punto de encuentro) | ✅ código (reporte 06); falta descargar límite y puntos |
| Macul (comuna completa) | Incendio estructural | Sin capas: lo dibuja el operador. Cobertura: límite comunal oficial (SUBDERE/IGM/INE 2018). Contiene al Campus, que va antes en el catálogo | ✅ código (reporte 06) |
| Pucón (zona 3) | Erupción volcánica (volcán Villarrica) | SENAPRED, *Amenaza Volcánica 2024* (vías, puntos de encuentro transitorios, peligro Alto/Medio/Bajo, volcán) y *Área de Evacuación Volcanes* (área de peligro). Cobertura: límite comunal oficial | ✅ código (reporte 07); falta descargar |
| Pucón (zona 3) | Incendio forestal | SENAPRED, *Amenaza por Incendio Forestal 2024* como referencia, igual que Viña | ✅ código (reporte 07); falta descargar |
| Tiltil | Falla de relaves | SERNAGEOMIN, *Catastro de depósitos de relaves* (oct-2025) como **referencia** (Ovejería de Codelco, Las Tórtolas de Anglo American en Colina y otros 9). Los mapas de inundación por falla **no son públicos**: el área de peligro, los puntos de encuentro y las rutas los publica un operador (la minera o el municipio) con su fuente | ✅ código (reporte 08); falta descargar |
| Tiltil | Incendio forestal | SENAPRED, *Amenaza por Incendio Forestal 2024* como referencia | ✅ código (reporte 08); falta descargar |
| Tiltil | Inundación y anegamiento | SENAPRED, *Puntos Críticos Programa Invierno 2022* (48 puntos de Tiltil, incluidos los tranques) como referencia | ✅ código (reporte 08); falta descargar |
| Peñalolén | Aluvión | MINVU, *PRMS*: áreas de riesgo por remoción en masa (art. 8.2.1.4) y derrumbes (art. 8.2.1.2) y quebradas, como **referencia**; SENAPRED, puntos críticos 2022 por quebradas. Sin área de evacuación oficial: el área la dibuja el operador | ✅ código (reporte 09); falta descargar |
| Peñalolén | Incendio forestal, inundación y anegamiento | Igual que Tiltil y Macul (IF 2024, puntos críticos 2022) | ✅ código (reporte 09); falta descargar |
| La Florida | Aluvión | Igual que Peñalolén (comparten la Quebrada de Macul) | ✅ código (reporte 09); falta descargar |
| La Florida | Incendio forestal, inundación y anegamiento | Igual que Peñalolén | ✅ código (reporte 09); falta descargar |

- **Sismo no se incluye** en esta versión.
- Candidatas para la zona 3, por verificar: una comuna con peligro **volcánico** + lahares (p. ej. Pucón/Villarrica, mapas de SERNAGEOMIN) o una con **inundación** + **remoción en masa**. Se decide según qué datos descargables existan.
- El desplegable de amenaza **solo muestra las amenazas disponibles en la zona actual** (en Viña no aparece sismo).
- **Después del MVP (1-oct-2026):** el orden propuesto para nuevas zonas y amenazas está en `docs/PLAN_ZONAS.md`: Macul comuna completa (incluye el Campus) con inundación; Pucón volcánica como zona 3 (vías, puntos y área de evacuación SENAPRED 2024); Santiago; Tiltil (relaves, cliente minero). Sismo sigue excluido salvo decisión del equipo.

## 5. App usuario

### 5.1 Ubicación real y pin de referencia (regla central)

La app maneja **dos puntos**:

- **Ubicación real (GPS):** si la persona dio permiso de ubicación, se sigue **todo el tiempo**, aunque esté mirando otra parte. Se procesa solo en el teléfono.
- **Pin de referencia:** decide **qué zona y qué mapa se muestran** en modo informativo. Se mueve arrastrándolo, tocando el mapa o con el **desplegable de zona**, que lo lleva al centro de esa zona. Sin permiso de GPS, el pin es el único punto. El botón "Ir a mi ubicación" pone el pin sobre la ubicación real.

**Quién recibe una alerta:** la alerta llega si **la ubicación real o el pin** están dentro de la zona alertada.

- Ejemplo: estoy físicamente en el Campus con GPS activo y tengo el pin en Viña. Me salta la alerta tanto si hay alarma en Viña como si la hay en el Campus.
- **Una alerta nunca afecta a quien no tiene ninguno de sus dos puntos dentro de la zona alertada.** Una alerta en el Campus no cambia nada para quien está mirando Viña desde Santiago con el GPS apagado.
- Si el pin cae fuera de todas las zonas cubiertas, se muestra el selector de zona con el mensaje "Aún no cubrimos esta ubicación".
- **Zonas una dentro de otra** (el Campus está dentro de Macul): el pin muestra la zona más pequeña, que va antes en el catálogo. Una alerta de Macul llega también a quien está en el Campus (está dentro de la comuna); una alerta del Campus no llega a quien está en otra parte de Macul. **Durante una alerta manda su zona**: si la alerta es de Macul y la persona está en el Campus, la app se queda en Macul aunque el pin se mueva dentro del Campus.
- **La decisión se toma en el teléfono:** la app recibe todas las alertas activas y compara localmente sus dos puntos con cada zona. El servidor nunca sabe dónde está nadie.

### 5.2 Modo informativo

- Mapa de la zona con las capas de la amenaza elegida en el desplegable y la leyenda.
- **Panel "Información"** por amenaza: pestañas Antes / Durante / Después, cada frase con su fuente oficial enlazada (`app/data/contenido/<amenaza>.json` + `fuentes.json`; agregados por zona en `info_zona` del catálogo). Es lo que evalúa O3. **"Durante" tiene máximo 3 frases cortas**: en una alerta la pantalla es casi solo el mapa.
- Diagnóstico (dentro / cerca del límite / fuera del área de peligro), **calculado desde el pin**, con textos de preparación ("si llega una alerta…").
- **Sin ruta personal en modo informativo:** la ruta solo aparece durante una alerta. En informativo se ven las capas oficiales (vías, puntos) como preparación.
- Brújula con efecto linterna (hecha).
- Si la amenaza no tiene capa geográfica en esa zona, se muestra solo la información pedagógica, con el aviso "Sin mapa de amenaza para esta zona".
- Si solo tiene capas de **referencia** (p. ej. recurrencia de incendios forestales), el estado dice "Sin área de evacuación oficial", explica qué muestra el mapa (`aviso` en el catálogo) y, si la capa declara `consulta`, el valor en el punto del pin ("Recurrencia de incendios forestales 2020–2024 en este punto: Alta"). Las capas pueden colorearse por clase (`estilo_por`), con la leyenda por clase.

### 5.3 Modo emergencia

- Se activa **solo** cuando llega una alerta que corresponde según §5.1. Al activarse, la app cambia sola a la zona y a la amenaza de la alerta.
- **Desde dónde se calcula la ruta:** si la ubicación real está dentro de la zona alertada, **la ruta sale de la ubicación real** (es donde la persona corre peligro) y el pin se mueve ahí. Si solo el pin está dentro (por ejemplo, alguien simulando Viña desde Santiago), la ruta sale del pin.
- **Si hay dos alertas que te aplican a la vez** (una por tu ubicación real y otra por tu pin), manda la de la ubicación real. La otra aparece como un aviso secundario que se puede tocar para verla.
- **Si hay dos alertas en la misma zona** (p. ej. tsunami e incendio en Viña después de un terremoto), se muestran ambas en el banner. La ruta usa la amenaza de la alerta más reciente, pero **se valida contra las áreas de peligro de todas las alertas activas de la zona**, para no llevar a nadie de un peligro a otro (hecho, reporte 05):
  - Las áreas de las otras alertas (oficiales y del operador) se dibujan en el mapa de emergencia.
  - La regla "sale y no vuelve a entrar" se aplica a **cada área por separado**: entrar al área de un incendio cuenta aunque la persona siga dentro del área de inundación. Una ruta tampoco puede tocar un área de otra alerta donde la persona no está (se revisa también entre vértices).
  - Si la persona está dentro del área de otra alerta, el estado es "Debes evacuar" aunque esté fuera del área de la alerta principal.
- **Si hay área de peligro y el punto de origen está fuera de ella** (a más de 100 m del borde): pantalla verde "Estás en zona segura, permanece aquí", sin ruta. **Si la amenaza no tiene área de peligro** (p. ej. el Campus antes de que el operador marque el edificio), se guía al punto de encuentro con ruta del operador si existe, y si no, se pasa a precaución.
- **Pantalla mínima:** se ocultan la cabecera, los botones de modo, el panel de información, la leyenda, las fuentes, el control de capas y los detalles; en el mapa quedan solo el área de peligro, los puntos de encuentro y la ruta personal. Se ve: aviso de alerta, mapa, estado en una línea, distancia, tiempo y una instrucción.
- **Lo primario es la alerta y la ruta:** banner con el mensaje del operador (y SIMULACRO si corresponde), ruta grande y clara, distancia y tiempo. La flecha, la voz y la vibración quedan **después del viernes**.
- **Botón "Necesito ayuda"** disponible en cualquier momento de la alerta (§8). **Es la última feature.**
- Vuelve sola a modo informativo cuando el operador cancela la alerta o cuando vence (**por defecto, a las 2 horas**).
- No se pregunta nada al inicio de la alerta: no hay diálogo de consentimiento que se interponga.
- Durante la emergencia, los desplegables de zona y amenaza quedan fijos en los de la alerta, para que nadie pierda la ruta por error.

### 5.4 Modo precaución

Cuando no existe una ruta válida (no hay ruta del operador ni oficial, y no se puede justificar una sugerida), se muestra la tarjeta **"Qué hacer ahora"** con las frases "durante" de la amenaza (máximo 3, letra grande) y su fuente. Implementado en `js/informacion.js` (`htmlPrecaucion`).

## 6. Jerarquía de rutas

| Prioridad | Fuente | Cuándo | Cómo se muestra |
| --- | --- | --- | --- |
| 1 | **Operador** | Hay ruta vigente dibujada por un operador para esa zona × amenaza (o para "todas") | "Ruta verificada por operador · [autor] · hace X min" + motivo |
| 2 | **Oficial** | Hay vías oficiales (p. ej. SENAPRED tsunami) y no están desactivadas por el operador | "Ruta oficial [organismo]" |
| 3 | **Sugerida por la app** | Hay un área de peligro (oficial o dibujada por el operador) para validar, pero no hay ruta 1 ni 2 | "Sugerida automáticamente, no verificada" + justificación |
| 4 | **Precaución** | No se puede justificar ninguna ruta | Instrucciones oficiales, sin ruta |

Mientras el operador todavía no dibuja nada, los niveles 2 y 3 cubren usando información oficial. Cuando el operador publica, su ruta pasa a mandar.

**Validación común a todos los niveles** (1, 2 y 3): una ruta se descarta si **cruza un tramo bloqueado** activo, o si, una vez fuera de un área de peligro vigente (oficial **o dibujada por el operador**), vuelve a entrar a ella. Así, si el operador marca un incendio que corta una vía oficial de tsunami, esa vía deja de ofrecerse sola, sin tener que desactivarla a mano. Si ninguna ruta de ningún nivel pasa la validación, se pasa a precaución (nivel 4).

**Cómo se elige entre varias rutas del mismo nivel:** las rutas del operador y las oficiales se tratan igual: acercarse a la ruta más conveniente y seguirla hasta su final (ver motor, abajo). Los **destinos** válidos son los puntos de encuentro oficiales y los del operador que estén vigentes y fuera de toda área de peligro. **Excepción:** si la autoridad designa puntos de encuentro dentro del área (p. ej. los puntos de encuentro transitorios de Pucón), el catálogo los marca con `destino_aunque_dentro` y siguen siendo destinos; la tarjeta de ruta avisa que el punto queda dentro del área. Nunca es destino un punto dentro del área de **otra** alerta activa.

**Justificación obligatoria de una ruta sugerida** (texto visible): calles peatonales (OpenStreetMap vía OpenRouteService); sale del área de peligro en X m y no vuelve a entrar; evita las áreas de peligro y los tramos bloqueados por el operador; "no ha sido validada por un operador".

**Motor de rutas actual** (hecho, `app/js/ruta.js`):

- **Método oficial:** las vías SENAPRED están digitalizadas en el sentido de la evacuación (costa → zona segura).
  1. Para cada vía a menos de 500 m se elige el **mejor punto de entrada a lo largo de toda la vía** (cualquier vértice o la proyección), con costo = acercamiento × 1,4 + lo que queda de vía. Así la ruta no camina hacia el mar para devolverse.
  2. Se evalúan las **3 mejores vías** con el camino real por calles (ORS) y gana la más corta a pie.
  3. **Unión:** en cuanto el camino por calles pasa a menos de 20 m de la vía, la persona se sube a ella y la sigue hasta el final. No hay saltos ni retrocesos.
  4. Si la vía termina a menos de 150 m de un punto de encuentro, se une hasta él.
  5. Costo: hasta 3 consultas a ORS por ruta (cacheadas por posición, ~10 m).
- **Sugerida:** ORS `foot-walking` a los 3 puntos más cercanos, validación "sale y no vuelve a entrar", y gana la que menos metros recorre dentro del área. **No usar `avoid_polygons` con el área donde está el usuario**: ORS no encuentra ruta. Sí se usa (hecho, reporte 06) para los **tramos bloqueados** (con un margen de 8 m) y las **áreas de otras alertas** que no contienen el origen ni el destino; la Edge Function los recibe en `evitar` y los valida (MultiPolygon en Chile, máx. 2000 vértices). Si ORS no encuentra ruta con ellos, se reintenta sin ellos y la validación común descarta la que cruce un bloqueo.
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
App usuario (app/, GitHub Pages) ──realtime──▶ Supabase ◀──realtime/escritura── App operador (app/operador/, login)
       │                                   │
       ├── capas oficiales estáticas (app/data, precargadas)
       └── ORS (rutas sugeridas y acercamientos)
```

- **Hosting:** GitHub Pages, publicación automática en cada push a `main` (`.github/workflows/pages.yml`).
- **Tiempo real y datos del operador:** Supabase (plan gratuito). **Pendiente: crear el proyecto** (URL + anon key).
- **Tablas** (script listo en `supabase/esquema.sql`: tablas, auditoría automática, reglas RLS y tiempo real):
  - `alertas` (id, zona, amenaza, mensaje, simulacro, activa, vigente_hasta, autor, creada)
  - `elementos_operador` (id, zona, amenaza o "todas", rol: ruta|punto_encuentro|area_peligro|bloqueo, geometria GeoJSON, motivo, fuente, autor, creado, vigente_hasta: fecha o null = permanente, activo)
  - `desactivaciones_oficiales` (id, zona, amenaza, id_elemento_oficial, motivo, autor, creado)
  - `solicitudes_ayuda` (id, alerta_id, lat, lng, precision, nombre?, telefono?, estado, creada): el público inserta; solo el operador lee; borrado a las 24 h
  - `auditoria` (quién, qué, cuándo)
- **Seguridad (RLS):** el público solo lee `alertas`, `elementos_operador` y `desactivaciones_oficiales`, y solo inserta en `solicitudes_ayuda`. El resto requiere un operador autenticado.
- **Respaldo:** si se cae el realtime, consulta cada 15 s.
- **Claves:** en el sitio solo está la clave **publicable** de Supabase (pública por diseño; la seguridad la dan las reglas RLS). La clave de **OpenRouteService** vive únicamente como secreto de Supabase y la usa la Edge Function `rutas` (`supabase/functions/rutas/index.ts`), que además valida el origen, que las coordenadas estén en Chile y que la distancia sea ≤5 km. La clave antigua de ORS quedó en el historial público de git y debe regenerarse.

## 10. Prioridades hasta el viernes

**Imprescindible** (en este orden):

1. ✅ Reestructurar a **zonas × amenazas** con catálogo y procedencia.
2. ✅ Dos puntos (ubicación real siempre activa si hay permiso + pin de referencia) que deciden zona y alerta (§5.1), con los desplegables de zona y amenaza.
3. ✅ Supabase + app operador básica: login, **enviar y cancelar alertas** por zona × amenaza.
4. Modo emergencia en la app usuario (banner, ruta primaria, simulacro, vencimiento).
5. ✅ Panel "Información" y modo precaución, con contenido oficial por amenaza (`app/data/contenido/`, reporte 03).
6. ✅ Operador: dibujar rutas, áreas de peligro, puntos y bloqueos, con motivo, fuente y vigencia; desactivar vías oficiales; la app usuario aplica la jerarquía y la validación común de §6 en tiempo real (reporte 04).
7. ✅ Viña incendio forestal (reporte 05; falta descargar la capa) y campus incendio estructural (dibujado por el operador).

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
- ✅ Brújula (norte arriba / brújula) con efecto linterna. Con la brújula activa el pin queda fijo en la persona (arrastrarlo en un mapa rotado lo hacía saltar). En modo brújula el mapa gira en torno a la persona (la mantiene al centro), con suavizado por tiempo y zona muerta de 0,8°.
- ✅ Motor de rutas: vía oficial → ORS sugerida → línea recta. En Viña, 77 % de los puntos del área obtienen ruta por vía oficial.
- ✅ §10 punto 1: catálogo zonas × amenazas (`app/data/catalogo.json`), capas por rol con procedencia, desplegables de zona y amenaza, el pin decide la zona (y "fuera de cobertura"). Viña (tsunami, incendio forestal sin capa aún) y Campus (incendio estructural sin capa aún).
- ✅ §10 punto 2: modelo de dos puntos (`js/posicion.js`): el GPS sigue activo si hay permiso aunque se use el pin; la ubicación real se dibuja como un punto azul.
- ✅ §10 punto 3: Supabase conectado (`js/nube.js`, `supabase/esquema.sql`) y **app operador** en `app/operador/` (login, enviar y cancelar alertas, historial). URL: `/mapa-evacuacion/operador/`.
- ✅ §10 punto 4 (base): modo emergencia en la app usuario (`js/alertas.js`): tiempo real + consulta cada 15 s, decisión local por los dos puntos, banner con SIMULACRO, desplegables bloqueados, la ruta sale de la ubicación real si está en la zona, vencimiento automático.
- ✅ Pendiente del punto 4 (2-oct): la ruta se valida contra las áreas de peligro de **todas** las alertas activas de la zona (§5.3, reporte 05).
- ✅ §10 punto 7: Viña incendio forestal con la capa SENAPRED 2024 como referencia (coloreada por recurrencia, valor en el pin) y área de peligro del operador. Campus dibujado por el equipo. `scripts/descargar_capas.mjs` ahora es genérico: cada escenario declara servicio, capas, filtro, recorte al bbox y generalización.
- ✅ Después del MVP (`PLAN_ZONAS.md` ítems 3 y 4): zona Macul con inundación y anegamiento (puntos críticos 2022 como referencia, punto crítico más cercano en el diagnóstico) e incendio estructural; rutas que esquivan bloqueos (reporte 06). Falta volver a desplegar la Edge Function `rutas`.
- ✅ Zona 3 = Pucón (`PLAN_ZONAS.md` ítem 5): erupción volcánica e incendio forestal (reporte 07). Falta descargar `pucon/cobertura`, `pucon/volcanica` y `pucon/incendio_forestal`.
- ✅ Tiltil (`PLAN_ZONAS.md` ítem 7): falla de relaves, incendio forestal e inundación y anegamiento (reporte 08). Falta descargar `tiltil/cobertura`, `tiltil/relave`, `tiltil/incendio_forestal` y `tiltil/inundacion`.
- ✅ Peñalolén y La Florida (`PLAN_ZONAS.md` ítems 9 y 10), zonas separadas: aluvión (PRMS + puntos críticos por quebradas), incendio forestal e inundación (reporte 09). Falta descargar los escenarios `penalolen/*` y `la_florida/*`.
- ✅ §10 punto 5: panel Información (antes/durante/después) y modo precaución con fuentes oficiales.
- ✅ §10 punto 6: dibujo del operador (`app/operador/dibujo.js`, Leaflet-Geoman MIT) y jerarquía operador → oficial → sugerida → precaución en la app usuario (`js/capasOperador.js`, `js/ruta.js`).
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
| Entrevista Gestión del Riesgo de Macul: pedir plan comunal, anexos, puntos críticos **actualizados** (los oficiales son de 2022), albergues (ver `docs/PLAN_ZONAS.md` ítem 4) | Equipo | Macul inundación |

## Anexo A — Fuentes de datos verificadas

- **Tsunami (SENAPRED 2024):** FeatureServer `https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services/Amenaza_por_Tsunami_2024/FeatureServer`. Capas: 0 Punto de Encuentro, 1 Vía de Evacuación, 2 Línea Segura, 3 Área a Evacuar, 4 Cota 30. Puntos y vías usan el campo `nom_com`; el área usa `comuna`. Descarga: `node scripts/descargar_capas.mjs`.
- **Viña (bbox −71.60, −33.06, −71.48, −32.93):** 34 puntos de encuentro (25 Viña, 7 Valparaíso, 2 Concón; sin nombre, solo código), 74 vías (todas empiezan dentro del área y 59 terminan fuera; solo 4 se tocan entre sí), 3 polígonos de área, ≈ 490 KB en total.
- **Incendio forestal:** `Amenaza_por_Incendio_Forestal_2024/FeatureServer/0` (mismo servidor que el tsunami; ítem ArcGIS `19268f2baaaf4cfdb8ad93f083c2c437`, creado el 2024-04-10, modificado el 2025-10-27). Polígonos "Densidad de Incendios Forestales 2020-2024 (Inc./Km2)" con campos `gridcode` (1–5) y `recurrencia` (Muy baja, Baja, Media, Alta, Muy alta). En el recuadro de Viña hay **23 polígonos** (2 Muy baja, 5 Baja, 8 Media, 6 Alta, 1 Muy alta); uno "Muy baja" es enorme (≈330 km²), por eso el script los **recorta al recuadro** y los generaliza (~5 m). Mide incendios pasados, así que se usa solo como `referencia` (verificado el 2-oct-2026). La ficha antigua del Geoportal (publicación 2020) queda reemplazada.
- **Volcánica (SENAPRED 2024):** `AMENAZA_VOLCÁNICA_2024` (ítem `cdc76e7d…`, creado 2024-10-07, modificado 2026-09-21): capa 0 puntos de encuentro (`nombre`, `tipo` PET, `volcan`; 42 del Villarrica), 1 vías (`volcan`, `bidireccional`; 8 del Villarrica, **todas "no" bidireccionales**; en Pucón VE-787 y VE-793 van hacia la Península y VE-794 hacia Los Calabozos), 2 áreas de peligro (`peligro` Alto/Medio/Bajo; **`volcan` vacío**, se filtra por recuadro: 120 polígonos en Pucón), 3 volcanes (`categoria`; Villarrica "Muy Alta"). `Área_de_Evacuación_Volcanes` (ítem `a7bdd62b…`, publicado 2026-09-22): un polígono por volcán (`nombre`, `clase` "Validado"); el del Villarrica mide ≈650 km² y contiene el centro de Pucón; la Península queda fuera. **Hallazgo:** los PET Los Calabozos y Quelhue quedan dentro del área de evacuación, pero son oficiales (el Plan Comunal de Pucón pone puestos médicos ahí): en el catálogo van con `destino_aunque_dentro` (§6). Las vías no traen `name`: el código se arma con `objectid` ("VE-787"). Descarga: `node scripts/descargar_capas.mjs pucon/volcanica`.
- **Relaves (SERNAGEOMIN):** `CDR_CHILE_AREAL_2025` y `CDR_CHILE_PUNTUAL_2025` en `services1.arcgis.com/OyjvVdFTl5hfSdX3` (cuenta de SERNAGEOMIN; "Catastro de relaves de Chile actualizado a octubre 2025"; ítem areal `2798b320…`, creado 2025-10-02, modificado 2026-09-21). Campos: empresa, faena, instalación, tipo de depósito, recurso, estado (activo, inactivo, abandonado…), método constructivo del muro, volumen y tonelaje, comuna (CUT). En el recuadro de Tiltil hay 11 depósitos: Ovejería (Codelco, tranque activo, el más grande) y Las Tórtolas (Anglo American, Colina, tranque activo), dos de Polpaico, dos de Minera San Pedro, tres abandonados y Ramayana 1 y 2 (Olmué). Es la fuente vigente de la "plataforma pública de relaves" (ene-2025); reemplaza a la capa de la SMA (`ideserver.sma.gob.cl/…/MapServer/4`, datos 2019). Descarga: `node scripts/descargar_capas.mjs tiltil/relave`.
- **Falla de relaves, información a la población:** no hay una guía oficial de recomendaciones (revisados SENAPRED, SERNAGEOMIN y MINSAL, 2-oct-2026). Las divulgaciones GISTM de Ovejería (Codelco, 2025) y Las Tórtolas (Anglo American, ago-2024) clasifican ambos depósitos como de consecuencia **"Extrema"**, pero no publican el mapa de inundación ni tiempos de llegada. El contenido usa las recomendaciones oficiales de MINSAL para aluviones (flujos de barro), con nota en `relave.json`.
- **Aluvión / remoción en masa (RM):** no hay capa vectorial oficial de peligro de aluvión: los mapas de SERNAGEOMIN (peligros geológicos de Santiago, 2016; flujos de 1993) son PDF o de pago, y su servidor `sdngsig.sernageomin.cl` no respondió (2-oct-2026). Se usa el **PRMS** publicado por el Centro de Estudios MINVU (`services3.arcgis.com/cTnMkBRk4HWkUCRo/…/PRMS_AGOL_2024/FeatureServer`): capa 10 riesgo de remoción en masa (en el oriente: Quebrada de Macul, Lo Cañas, O-16, Quebrada de Ramón), capa 9 riesgo de derrumbes (Quebrada Macul–Canal Las Perdices) y capa 6 quebradas (Macul, Lo Hermida, Las Perdices, Lo Cañas, Nido de Águila…). El PRMS regula el uso del suelo, no define áreas a evacuar: va como `referencia`. Recomendaciones: SENAPRED, *Aluviones* (señales y qué hacer), y MINSAL. Descarga: `node scripts/descargar_capas.mjs penalolen/aluvion` (y `la_florida/…`).
- **Remoción en masa / aluvión:** en el Geoportal solo hay un boletín de SERNAGEOMIN, no capa vectorial.
- **Límites comunales:** División Político Administrativa, Comunas (SUBDERE, IGM e INE, 2018), servicio `rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer/1` (solo JSON de Esri; el script lo convierte). Macul = `CUT_COM='13118'`, 12,8 km². Descarga: `node scripts/descargar_capas.mjs macul/cobertura`.
- **Puntos críticos ante lluvias:** `Puntos_Críticos_Programa_Invierno_2022/FeatureServer/0` (SENAPRED, ex ONEMI; editado el 2022-04-27). Campo `comuna` = código CUT. **Macul tiene 31 puntos** (consultado el 2-oct-2026), la mayoría "Colapso colectores de aguas lluvia/alcantarillados", con nivel 2022 Bajo o Medio; uno Alto ("Campus San Joaquín DICTUC") y uno por desborde del Zanjón de la Aguada. Los códigos de causa y nivel se traducen con los dominios del servicio. No se guarda el campo `responsabl` (nombre de una persona). Los registros 2021–2022 (`Registro_Puntos_Críticos_2021_2022`) no tienen Macul. Descarga: `node scripts/descargar_capas.mjs macul/inundacion`.
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
- **v3.0 (2-oct-2026):** zonas Peñalolén y La Florida (§4), con amenaza nueva "aluvión" (PRMS de MINVU y puntos críticos por quebradas como referencia; contenido oficial de SENAPRED). El contenido de relaves también cita la página de aluviones de SENAPRED.
- **v2.9 (2-oct-2026):** zona Tiltil (§4) con amenaza nueva "falla de relaves" (`relave`) (depósitos SERNAGEOMIN 2025 como referencia; área de peligro solo del operador), incendio forestal e inundación. Consulta del depósito más cercano (polígonos con `cercano`) y título del popup desde un campo (`titulo`).
- **v2.8 (2-oct-2026):** zona 3 = Pucón, con erupción volcánica (volcán Villarrica) e incendio forestal (§4). Puntos de encuentro oficiales dentro del área siguen siendo destinos (catálogo `destino_aunque_dentro`), con aviso en la tarjeta de ruta. Códigos de vía desde un campo (`codigo`). El dato de una capa de referencia en el pin también aparece cuando hay área de peligro (p. ej. "Peligro volcánico en este punto: Alto").
- **v2.7 (2-oct-2026):** zona Macul (comuna completa) con inundación y anegamiento e incendio estructural (§4). Cobertura desde un archivo oficial; zonas anidadas y "durante una alerta manda su zona" (§5.1). Rutas por calles que esquivan bloqueos y áreas de otras alertas (`avoid_polygons`, §6). Contenido oficial de inundación (SENAPRED, MINSAL) y central municipal 1444.
- **v2.6 (2-oct-2026):** Viña incendio forestal: capa SENAPRED 2024 como referencia, coloreada por recurrencia y con su valor en el pin (§5.2, §4). Validación de la ruta contra las áreas de todas las alertas activas de la zona, área por área (§5.3). Script de descarga genérico. El área de los incendios se llama "zona afectada por el incendio" en los textos.
- **v2.5 (1-oct-2026):** prioridades de zonas y amenazas después del MVP en `docs/PLAN_ZONAS.md` (§4, §13, Anexo A).
- **v2.4 (1-oct-2026):** el pin de Viña parte en 4 Norte con Av. Libertad; sin desplazamiento automático al arrastrar el pin a los bordes (con el mapa rotable hacía saltar el pin). Se mantiene el motor de rutas actual; `docs/PLAN_RUTAS.md` queda como propuesta futura.
- **v2.3 (30-sep-2026):** rutas oficiales con mejor punto de entrada, 3 vías evaluadas con ORS y unión sin saltos; con la brújula activa el pin queda fijo (se mueve en norte arriba).
- **v2.2 (30-sep-2026):** ruta personal solo en emergencia; pantalla de emergencia mínima; textos de diagnóstico de preparación en modo informativo; brújula centrada en la persona.
- **v2.1, revisión de coherencia:** se unificó el término "área de peligro" (distinto de "zona"); los usuarios leen las desactivaciones de vías; las rutas del operador pueden aplicar a "todas" las amenazas; la ruta informativa se calcula desde el pin; los desplegables quedan fijos durante la emergencia; "zona segura" solo aplica si existe área de peligro. Varias alertas en la misma zona: la ruta se valida contra todas. Las solicitudes de ayuda reemplazan a "ver usuarios" en las prioridades finales.
- **v2 (30-sep-2026):** plataforma multiamenaza con app operador; reemplaza a la v1.
