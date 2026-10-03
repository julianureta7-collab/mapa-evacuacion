# Plan de zonas y amenazas (prioridades después del MVP)

> Estado: **propuesta ordenada con Julián el 1-oct-2026**. El equipo puede reordenar. Al hacer un ítem, marca su estado aquí, actualiza `docs/ESPECIFICACION.md` (§4, §12) y escribe el reporte en `docs/reportes/`.
> Origen: revisión del repo + investigación de fuentes oficiales en un chat de Cowork (1-oct-2026). Los servicios ArcGIS citados se consultaron ese día.

## Cómo se ordenó

Criterios, en este orden (coherentes con spec §2):

1. **Datos oficiales disponibles** (no inventar rutas ni geometría; el operador puede dibujar citando una fuente).
2. **Escalable por datos**: que entre editando `catalogo.json` + capas + contenido, sin código nuevo.
3. **Aporte al testeo** (O1–O5, spec §11) y a la **entrevista con la Dirección de Gestión del Riesgo de Macul**.
4. **Valor de negocio**: municipio (B2G) y minera (B2B), donde el cliente es el **operador**.
5. **Horas** de trabajo.

## Tabla de progreso

Estados: ⏳ pendiente · 🔨 en curso · ✅ hecho · 💤 en espera (depende de otros)

| # | Comuna | Desastre | Datos oficiales | Esfuerzo | Cuándo | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Macul (Campus SJ) | Incendio estructural | Tríptico Ingeniería UC + lo que dibuje el operador | Bajo, se dibuja en la app | Testeo 2-oct | ✅ dibujado por el equipo; confirmar en terreno |
| 2 | Viña del Mar | Incendio forestal | Contenido ya hecho. Área: la dibuja el operador. Capa SENAPRED IF 2024 solo como `referencia` | Bajo | Testeo 2-oct | ✅ código (reporte 05); falta correr la descarga |
| 3 | Macul (comuna completa) | Zona nueva (reutiliza incendio estructural) | Límite comunal oficial | Muy bajo, solo catálogo | Antes de la entrevista | ✅ código (reporte 06); falta descargar el límite |
| 4 | Macul | Inundación / anegamiento | Contenido SENAPRED y MINSAL. Puntos críticos 2022 de SENAPRED (31); los actuales, la municipalidad | Medio | Entrevista | ✅ código (reporte 06); falta descargar los puntos |
| 5 | Pucón | Volcánica (V. Villarrica) + incendio forestal | Vías, puntos y área de evacuación SENAPRED 2024; IF 2024 | Medio | 2ª ronda de testeo | ✅ código (reporte 07); falta descargar |
| 6 | Santiago | Anegamiento + incendio estructural | 5 puntos críticos oficiales (Gobierno de Santiago, jul-2026) + contenido ya hecho | Bajo, después del 4 | 2ª ronda | ⏳ |
| 7 | Tiltil | Relave (cliente minero) + incendio forestal + inundación | Depósitos SERNAGEOMIN 2025; IF 2024; puntos críticos 2022. Área, rutas y zonas seguras: las entrega la minera como operador | Medio | Cuando haya contacto minero | ✅ código (reporte 08); falta descargar |
| 8 | Macul | Sismo | CSN MASCSN26 (regional) + SENAPRED | Bajo, solo contenido | **Requiere cambiar spec §4** | 💤 |
| 9 | Peñalolén | Aluvión / remoción en masa | 18 puntos críticos oficiales + alertas SENAPRED (jul-2026). Sin rutas | Medio | Si un municipio lo pide | 💤 |
| 10 | La Florida | Aluvión / inundación | 18 puntos críticos. Sin rutas | Medio | Repite el caso 9 | 💤 |
| — | Melipeuco / Ovalle | Volcánica / relave | — | — | Alternativa a Pucón y caso de referencia del pitch; **no agregar** | — |

Funciones que pesan tanto como una zona (no son filas de la tabla):

- ✅ **Validar la ruta contra todas las alertas activas de la zona** (spec §5.3, reporte 05). Hecha el 2-oct.
- **Botón "Necesito ayuda"** (spec §8). Sube de prioridad si Macul quiere conectarlo a su central 1444.

---

## Instrucciones por ítem

Reglas comunes (ver `CLAUDE.md`): nada hardcodeado por zona; al tocar JS/CSS o `catalogo.json` sube los `?v=`; **no correr `git` desde la VM de Cowork**; contenido solo de fuentes oficiales, citadas en `app/data/contenido/fuentes.json`; "Durante" máximo 3 frases.

### 1. Macul (Campus SJ): incendio estructural

- **Qué:** que el Campus deje de mostrar solo modo precaución durante una alerta.
- **Cómo:** sin código. En `/operador/`, zona Campus, amenaza **"Todas"**, vigencia **permanente**: dibujar los puntos de encuentro **Patio Norte** (esculturas "Grupo Humano") y **Patio Sur** (patio central de Ingeniería), y rutas desde los edificios principales hacia ellos. Fuente: "Tríptico plan de emergencia, Escuela de Ingeniería UC" (`uc_ingenieria`).
- **Verificar:** alerta de simulacro de incendio estructural en el Campus → "Ruta verificada por operador", con distancia y tiempo.
- **Pendiente del equipo:** confirmar en terreno la ubicación de los patios (spec §13).

### 2. Viña del Mar: incendio forestal

- **Qué:** segunda amenaza en Viña; es el mejor demo para O5: el operador marca un incendio que corta una vía oficial de tsunami y la ruta lo esquiva sola.
- **Para el testeo, sin código:** en el operador, dibujar un `area_peligro` de incendio de simulacro con fuente "Simulacro del equipo", vigencia 2 h. El contenido `incendio_forestal.json` ya existe.
- **Capa oficial (hecho 2-oct):** `Amenaza_por_Incendio_Forestal_2024` (SENAPRED), en `https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services/Amenaza_por_Incendio_Forestal_2024/FeatureServer/0`. Polígonos con campos `gridcode` y `recurrencia` ("Muy baja"…), densidad de incendios 2020–2024. **Sí cubre Viña** (23 polígonos), pero mide incendios pasados, no un área a evacuar: va **solo con rol `referencia`**, coloreada por recurrencia, y el diagnóstico informativo dice la recurrencia en el pin. El script ya es genérico (sirve también para el ítem 5). **Falta:** `node scripts/descargar_capas.mjs vina/incendio_forestal` en el PC de Julián y revisar el tamaño (`metadata.json`).
- **Spec:** Anexo A actualizado (versión 2024).

### 3. Macul: comuna completa como zona

- **Qué:** zona `macul` en `catalogo.json`, para la entrevista con la municipalidad.
- **Hecho (2-oct):** la cobertura es el límite comunal oficial SUBDERE/IGM/INE 2018 (servicio DPA del MOP), descargado y simplificado (~5 m) con `node scripts/descargar_capas.mjs macul/cobertura` a `app/data/macul/cobertura/limite_comunal.geojson`. En el catálogo, `cobertura` puede ser la ruta a ese archivo; si falta, la zona se omite con un aviso en la consola.
- **Orden:** `zonaEn()` devuelve **la primera zona** que contiene el punto. **`campus_sj` debe ir antes que `macul`** en `zonas`, para que el pin en el Campus muestre el Campus.
- **Alertas:** alguien en el Campus recibe también las alertas de Macul (verificado con una alerta de prueba). Durante una alerta manda su zona: `zonaEn(punto, zonaDeLaAlerta)`; si no, el pin dentro del Campus devolvía la app al Campus a mitad de la alerta de Macul.
- **Amenazas iniciales:** `incendio_estructural` (sin capas, operador) e `inundacion` (ítem 4).

### 4. Macul: inundación / anegamiento

- **Contenido:** crear `app/data/contenido/inundacion.json` desde SENAPRED (https://senapred.cl/inundaciones/) y MINSAL si aplica. Agregar la amenaza `inundacion` en `amenazas` del catálogo y las fuentes en `fuentes.json`.
- **Datos oficiales:** Macul **no aparece** en el listado de 175 puntos críticos del Gobierno de Santiago (jul-2026), pero **sí en SENAPRED**: `Puntos_Críticos_Programa_Invierno_2022` tiene **31 puntos de Macul** informados por la municipalidad (spec Anexo A). Son de 2022: los actuales deben venir de la **Dirección de Gestión del Riesgo de Desastres de Macul** (central 1444).
- **Representación (hecho):** puntos críticos 2022 como `referencia`, coloreados por nivel de riesgo 2022, con causa en el popup y "punto crítico más cercano" en el diagnóstico informativo. Durante una alerta de lluvia, el operador marca `bloqueo` (calles anegadas), `area_peligro` (sector afectado) y `punto_encuentro` (albergues). Las rutas por calles esquivan los bloqueos (`avoid_polygons`). **No** inventar áreas haciendo buffers.
- **Demo para la entrevista:** alerta de simulacro "temporal" en Macul + bloqueos dibujados en vivo + ruta que los esquiva.
- **Qué pedir en la entrevista:**
  1. Plan Comunal de Emergencia y sus **anexos por amenaza** (Ley 21.364). Ejemplo de formato: el anexo de inundaciones de La Reina 2025–2027, con 28 puntos críticos.
  2. Puntos críticos de anegamiento (direcciones), albergues, puntos de encuentro y zonas de seguridad. Ideal en SHP o KMZ, **con permiso para citarlos**.
  3. Quién sería operador y cómo avisan hoy a los vecinos.
- **Qué ofrecerle:** cuentas de operador; la app como canal de difusión de su plan comunal; "Necesito ayuda" hacia su central; piloto Campus–Macul con simulacro conjunto (mencionar a CIGIDEN, el centro de riesgo de desastres que alberga la UC).

### 5. Pucón: volcánica

> **Hecho el 2-oct-2026 (reporte 07).** Diferencias con lo previsto abajo: la capa 2 (peligro) no trae `volcan`, se filtra por recuadro; las 8 vías del Villarrica son de un sentido; los PET Los Calabozos y Quelhue quedan dentro del área de evacuación y se aceptan como destinos (`destino_aunque_dentro`). Escenarios del script: `pucon/cobertura`, `pucon/volcanica`, `pucon/incendio_forestal`.

- **Datos (SENAPRED, mismo servidor ArcGIS que el tsunami):** `https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services/AMENAZA_VOLCÁNICA_2024/FeatureServer` (codificar la URL: `AMENAZA_VOLC%C3%81NICA_2024`):
  - capa 0: puntos de encuentro (`nombre`, `tipo` PE/PET, `volcan`). Villarrica: 35, p. ej. "Península Pucón", "Los Calabozos";
  - capa 1: vías de evacuación (`volcan`, `bidireccional`). Villarrica: 8, de ellas 3 en Pucón (objectid 787, 793, 794). Casi todas de un sentido, como las de tsunami;
  - capa 2: áreas de peligro (`peligro` Alto/Medio/Bajo). El centro de Pucón está en **Alto**;
  - capa 3: volcanes.
  - Además `Área_de_Evacuación_Volcanes/FeatureServer/0`: un polígono por volcán (`nombre` = "Villarrica"). El centro de Pucón está dentro.
- **Roles:** `Área_de_Evacuación_Volcanes` → `area_peligro`; Alto/Medio/Bajo → `referencia` (si los tres fueran área de peligro, el diagnóstico diría "debes evacuar" en zonas enormes); vías → `ruta`; puntos → `punto_encuentro`. **No hay campo comuna**: filtrar por bbox (el script ya lo hace).
- **Script:** `scripts/descargar_capas.mjs` ya es genérico (2-oct): cada escenario declara `servicio`, `capas` y su fuente; por capa, `where` (p. ej. `volcan='Villarrica'`), `campos`, `recortar` y `generalizar`. Para Pucón, agregar el escenario `pucon/volcanica`.
- **Contenido:** crear `volcanica.json` desde https://senapred.cl/erupciones-volcanicas/ y MINSAL (https://degreyd.minsal.cl/que-hacer-en-caso-de-erupcion-volcanica/). Complementos citables: el plano de evacuación y el mapa de peligros SERNAGEOMIN que publica la Municipalidad de Villarrica, y el Plan de Emergencia Volcánica de Pucón.
- **Rutas:** la Edge Function rechaza más de 5 km. Probar desde el centro de Pucón hacia "Península Pucón" (≈3 km). Revisar que las vías vayan **alejándose del volcán** (sentido de digitalización).
- **Operador:** pocas vías en el pueblo. Se pueden dibujar las del plano municipal citando esa fuente; además luce la herramienta.
- **O4:** el Visor Chile Preparado muestra las mismas capas volcánicas, así que la comparación de tiempos sirve igual que en Viña.
- **Multiamenaza:** Pucón también puede llevar `incendio_forestal` (contenido existente + capa IF 2024 como referencia).
- **Alternativa:** si Pucón resulta pobre, usar **Melipeuco** (V. Llaima): unas 47–51 vías concentradas en el pueblo, Cherquenco y Curacautín (el número varía según la capa), y 3 puntos de encuentro en el pueblo.

### 6. Santiago: anegamiento + incendio estructural

- **Anegamiento:** 5 puntos críticos oficiales (Gobierno de Santiago, jul-2026): Av. Matta con San Diego (colapso de colectores), Alameda con Manuel Rodríguez (anegamiento), Toesca con Club Hípico (colectores), Santa Isabel con San Francisco (anegamiento), San Pablo con Teatinos (colectores). Geocodificar las esquinas y cargarlas como `referencia`, igual que el ítem 4. Excel oficial: https://www.gobiernosantiago.cl/wp-content/uploads/2026/07/Puntos-criticos-Gran-Santiago-2.xls (bajarlo desde el PC: el sandbox no llega).
- **Incendio estructural:** reutiliza el contenido. Contexto: incendios grandes de cités en feb, abr y jun 2026.
- **Pendiente:** el Plan Comunal de Emergencia 2025–2027 (https://documentos.munistgo.cl/plan-de-comunal-de-emergencia-2025-2027/) es un PDF escaneado; revisarlo a mano por puntos de encuentro o albergues.

### 7. Tiltil: relave (cliente minero)

> **Hecho el 2-oct-2026 (reporte 08).** Correcciones a lo de abajo: la fuente vigente de depósitos es el **catastro SERNAGEOMIN de octubre de 2025** (`CDR_CHILE_AREAL_2025`), no la capa de la SMA (2019). Tiltil tiene también 48 puntos críticos 2022 (incluidos los dos tranques) y alertas SAE por incendio forestal (dic-2024, nov-2025), así que la zona lleva tres amenazas. No hay guía oficial de recomendaciones ante falla de relaves: se usan las de MINSAL para aluviones. Escenarios: `tiltil/cobertura`, `tiltil/relave`, `tiltil/incendio_forestal`, `tiltil/inundacion`.

- **Por qué Tiltil:** sin mar, a 45 km de Santiago. Tiene **Ovejería** (Codelco Andina) y **Las Tórtolas** (Anglo American, Colina/Tiltil), los dos con simulacros con la comunidad (Las Tórtolas: nov-2024 y oct-2025; 55 señaléticas, monitores comunitarios, puntos de encuentro).
- **Datos públicos oficiales:** ubicación y estado de los depósitos (plataforma pública de relaves de SERNAGEOMIN; capa `ideserver.sma.gob.cl/arcgis/rest/services/IDE/Industria_y_actividades/MapServer/4`). La divulgación GISTM de Ovejería (Codelco, 2025) nombra a Huechún, Santa Matilde y Huertos Familiares como localidades expuestas, **sin mapa de inundación**.
- **No públicos:** mapa de inundación por rotura, rutas y zonas seguras. Están en el plan de emergencia de la empresa, así que **la minera publica como operador**, con fuente. No inventar el área de inundación.
- **Contenido:** falta una fuente oficial de recomendaciones "relave" (buscar en SENAPRED y SERNAGEOMIN). Si no hay, usar modo precaución con instrucciones de la empresa citadas.
- **Caso de referencia para el pitch:** Ovalle, 24-jul-2026. SENAPRED declaró un perímetro de seguridad y evacuó por riesgo de falla del depósito de ENAMI (ex Planta Delta), tras lluvias de más de 200 mm.

### 8. Macul: sismo (requiere decisión)

- La spec §4 excluye sismo. Si el equipo cambia eso: contenido desde SENAPRED; mapa CSN MASCSN26 (https://owl.csn.uchile.cl/MapaAmenazaSismica/MASCSN26_visor.html, jul-2026), pero es regional (toda la comuna queda "dentro"), así que el diagnóstico no aporta. Solo vale la pena si el municipio entrega puntos de encuentro.

### 9–10. Peñalolén y La Florida: aluvión

- Datos: puntos críticos del Gobierno de Santiago (18 cada una; p. ej. Peñalolén "Quebrada de Lo Hermida", La Florida "Badén Las Perdices"). Alerta Temprana Preventiva de SENAPRED por aluviones (8-jul-2026). Mapas SERNAGEOMIN (2003, 1:100.000; 2016) en PDF o de pago. Zonas de restricción del PRMS en la Quebrada de Macul.
- No hay rutas ni puntos oficiales: todo dependería del operador. Hacer **una sola** (Peñalolén primero: mayor población vulnerable según el Gobierno de Santiago) y solo si un municipio lo pide.

---

## Fuentes

- SENAPRED, servicios ArcGIS: https://services5.arcgis.com/i7S5PSnIJAUcWvSE/ArcGIS/rest/services
- SENAPRED, Mapas de amenaza: https://www.senapred.gov.cl/mapas-de-amenaza/ · Visor Chile Preparado: https://senapred.cl/visor-chile-preparado/
- Municipalidad de Villarrica, erupciones: https://www.munivillarrica.cl/erupciones-volcanicas/ · Plan de Emergencia Volcánica de Pucón: https://www.municipalidadpucon.cl/wp-content/uploads/2016/01/PlanEmergenciaVolcanica.pdf
- Gobierno de Santiago, 175 puntos críticos: https://www.gobiernosantiago.cl/2026/07/14/gobierno-de-santiago-identifica-175-puntos-criticos-de-muy-alto-riesgo-frente-a-lluvias-en-la-region-metropolitana/ · listado por comuna (13.cl): https://www.13.cl/programas/noticias-13/servicios/lluvia-en-santiago-conoce-los-puntos-criticos-que-identifico-la
- Macul: PLADECO (diagnóstico) http://www.munimacul.cl/transparencia/documentos/pladeco/2020_2026/Informe_FinalPLADECOTomoDiagn%C3%B3stico.pdf · sistema frontal 2026 https://www.munimacul.cl/portalnv/index.php/2026/06/09/macul-refuerza-medidas-preventivas-ante-sistema-frontal-y-llama-a-la-comunidad-a-colaborar/
- La Reina, anexo de inundaciones: https://www.lareina.cl/wp-content/uploads/2025/09/ANEXO_PLAN_AMENAZA_INUNDACIONES_2025-2027.pdf
- Relaves: divulgación GISTM de Ovejería https://www.codelco.com/sites/site/docs/20250731/20250731155601/resumen_requisito_15_1_divulgacion_ovejeria_actualizacion_2025_rev_0_revpmf_re_gcr.pdf · simulacro Las Tórtolas 2025 https://www.portalminero.com/wp/simulacro-de-emergencia-en-tranque-de-relaves-las-tortolas-de-anglo-american-movilizo-a-cientos-de-personas-en-colina-y-tiltil/ · Ovalle https://www.reporteminero.cl/noticia/noticias/2026/07/perimetro-seguridad-ovalle-relaves-enami-planta-delta · plataforma de relaves SERNAGEOMIN https://www.portalminero.com/sernageomin-lanza-plataforma-publica-de-relaves-para-optimizar-la-gestion-de-datos-geocientificos-en-chile
- Alerta de aluviones RM (jul-2026): https://www.biobiochile.cl/noticias/nacional/region-metropolitana/2026/07/08/senapred-declara-alerta-temprana-preventiva-en-10-comunas-de-la-rm-hay-riesgo-de-aluviones-por-lluvia.shtml
- CSN, mapas de amenaza sísmica: https://www.csn.uchile.cl/csn-lanza-oficialmente-sus-mapas-de-amenaza-sismica/
