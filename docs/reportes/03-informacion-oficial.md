# Reporte 03: Panel "Información" y modo precaución

**Fecha:** 1 de octubre de 2026 · **Spec:** §5.2 y §5.4 · **Estado:** hecho (falta la revisión del equipo)

## Qué se hizo

- **Panel "Información"** en el modo informativo, con tres pestañas: **Antes / Durante / Después**, para la amenaza elegida. Cada recomendación cita su fuente oficial con un enlace.
- **"Durante" es mínimo a propósito:** tres frases cortas. Durante una alerta, la pantalla muestra solo el mapa con la ruta; el panel no aparece.
- **Modo precaución:** si hay una alerta y no existe una ruta válida (por ejemplo, el Campus mientras el operador no haya dibujado zonas), se muestra la tarjeta **"Qué hacer ahora"** con esas tres frases "durante", en letra grande.
- **Contenido por amenaza, compartido por todas las zonas** (`app/data/contenido/<amenaza>.json`), más agregados propios de cada zona (por ejemplo, el anexo de emergencia del Campus).

## Fuentes consultadas

| Amenaza | Fuente principal | Complementos |
| --- | --- | --- |
| Tsunami | [SENAPRED, Tsunami](https://senapred.cl/tsunami/) | [MINSAL, recomendaciones en la costa](https://degreyd.minsal.cl/recomendaciones-generales-2/) |
| Incendio forestal | [SENAPRED, Incendios forestales](https://senapred.cl/incendios-forestales/) | [MINSAL, incendios forestales](https://degreyd.minsal.cl/que-hacer-en-caso-de-incendios-forestales/) · [CONAF, 4 señales para evacuar (vía CNN Chile)](https://www.cnnchile.com/pais/cuatro-senales-evacuar-inmediato-incendio-forestal-conaf/) |
| Incendio estructural | [SENAPRED, Incendios estructurales](https://senapred.cl/incendios-estructurales/) | [MINSAL, incendios estructurales](https://degreyd.minsal.cl/que-hacer-en-caso-de-incendios-estructurales/) · [Tríptico plan de emergencia, Ingeniería UC](https://deg.ing.uc.cl/wp-content/uploads/2023/11/triptico-plan-de-emergencia.pdf) |

Criterios: solo organismos oficiales chilenos (y el plan de emergencia de la propia universidad para el Campus). Las frases se acortaron para lectura rápida en celular, **sin cambiar su sentido**.

## Contenido publicado

### Tsunami

**Antes**
1. Revisa si vives, trabajas o estudias en un área de evacuación: en la costa, todo lo que está bajo la línea de seguridad (unos 30 m sobre el nivel del mar). *(MINSAL, SENAPRED)*
2. Identifica las vías de evacuación, los puntos de encuentro y las zonas de seguridad de tu sector. Este mapa los muestra. *(SENAPRED)*
3. Prepara un plan para llegar a pie a una zona segura en unos 15 minutos. Ten más de una vía: las calles pueden quedar bloqueadas. *(MINSAL)*
4. Evacúa sin esperar la alarma si sientes un sismo que te dificulta mantenerte en pie, o si el mar se retira de forma inusual. *(SENAPRED, MINSAL)*
5. La evacuación es a pie. Si vas en vehículo, déjalo sin bloquear las vías de evacuación. *(SENAPRED, MINSAL)*

**Durante:** Evacúa a pie, de inmediato, hacia zona alta · Aléjate de ríos y esteros; no los cruces · Si no alcanzas zona alta, sube a un edificio de al menos 8 pisos. *(SENAPRED)*

**Después:** Regresa solo cuando las autoridades lo indiquen · Infórmate por canales oficiales. *(SENAPRED)*

### Incendio forestal

**Antes**
1. Mantén los alrededores de tu vivienda despejados de vegetación y desechos. *(SENAPRED)*
2. No hagas fogatas, asados ni quemas, ni uses herramientas que generen chispas cerca de vegetación. *(SENAPRED)*
3. Evacúa de inmediato si el humo o el fuego avanzan hacia ti, si caen cenizas o pavesas, o si una autoridad lo indica. *(CONAF)*
4. Si ves humo o fuego en vegetación, avisa: CONAF 130, Bomberos 132, Carabineros 133. *(MINSAL)*

**Durante:** Aléjate a pie del fuego y del humo · Cubre nariz y boca con un paño húmedo · Sigue las instrucciones de los equipos de emergencia. *(SENAPRED, MINSAL)*

**Después:** No vuelvas al área quemada hasta que se autorice: el fuego puede reactivarse · Mantente informado (DMC, SENAPRED). *(SENAPRED, MINSAL)*

### Incendio estructural

**Antes**
1. Revisa las instalaciones eléctricas y no sobrecargues los enchufes. *(SENAPRED)*
2. No acumules basura ni desechos, y no descuides la cocina ni la plancha encendidas. *(SENAPRED)*
3. Si sientes olor a gas: cierra la llave de paso, no enciendas fósforos ni aparatos eléctricos y ventila. *(SENAPRED)*
4. Conoce las salidas y el punto de encuentro de tu edificio. *(Ingeniería UC)*
5. *Solo Campus San Joaquín:* anexo de emergencia 5000 (desde celular 22 354 5000); sigue al jefe de emergencia y a los monitores de piso. *(Ingeniería UC)*

**Durante:** Sal de inmediato; con humo, agáchate y avanza cerca del piso; no uses ascensores · Antes de abrir una puerta, tócala con el dorso de la mano: si está caliente, no la abras · Ve al punto de encuentro y no lo dejes sin avisar. *(SENAPRED, Ingeniería UC)*

**Después:** Ya afuera, llama a Bomberos (132) · No vuelvas a entrar hasta que se indique que es seguro · *Campus:* avisa al anexo 5000. *(SENAPRED, MINSAL, Ingeniería UC)*

## Decisiones y hallazgos

- **Contradicción entre fuentes:** el tríptico de Ingeniería UC dice "abra ventanas y puertas completamente para aumentar la ventilación" (pensado para quien intenta extinguir un amago), mientras SENAPRED indica "al salir de una pieza… cierra bien las puertas". **Se dejó fuera** la instrucción de abrir: se prioriza a SENAPRED, la autoridad nacional, y la app está pensada para evacuar, no para combatir el fuego.
- **Dato útil para el punto 3 (Campus):** el tríptico UC nombra **puntos de encuentro reales del Campus San Joaquín**: **Patio Norte** (esculturas "Grupo Humano") y **Patio Sur** (sector central del patio de Ingeniería). Son buenos candidatos para que el operador los dibuje.
- La recomendación "edificio de al menos 8 pisos" (evacuación vertical) es de SENAPRED y solo aplica si no se alcanza zona alta.

## Para las preguntas de O3

Las preguntas pueden salir directo de las pestañas. Por ejemplo: *¿Cuándo debes evacuar sin esperar la alarma de tsunami?* · *¿Qué haces antes de abrir una puerta en un incendio?* · *¿Cuáles son las señales para evacuar en un incendio forestal?* · *¿Cuándo puedes volver a tu casa?*

## Pendiente

- **Revisión de un integrante del equipo** de las frases (sentido y claridad).
- Si alguien encuentra la versión oficial del plan de emergencia del Campus completo (no solo de Ingeniería), reemplazar la fuente UC.
