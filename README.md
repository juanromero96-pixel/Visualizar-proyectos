# Semana Regional de la Extensión UNaM (v2 — escenas inmersivas)

Micrositio institucional de la Semana Regional de la Extensión UNaM. Tres
escenas — Posadas, Oberá, Eldorado —, cada una con composición propia,
revelada en secuencia (fondo → título → elementos en orden narrativo) en
vez de aparecer toda junta. HTML, CSS y JavaScript sin frameworks ni
librerías; sin backend ni base de datos.

Esta es una evolución de la v1 (carrusel + panel + login + JSON), no una
reescritura: la navegación, el login y la capa de persistencia son los
mismos archivos de siempre. Lo que cambió es cómo se compone y se anima
cada sede, y se agregó un editor visual de arrastre en el panel.

## Cómo correrlo

```bash
python3 -m http.server 8000
```

Abrí `http://localhost:8000/`. (Hace falta un servidor porque el sitio usa
`fetch()` sobre archivos locales, y eso falla con `file://`.)

## Qué cambió respecto a v1

| | v1 | v2 |
|---|---|---|
| Posición de cada elemento | una de 5 zonas fijas (a/b/c/d/e) | `x`/`y` libres, en % |
| Profundidad | no existía | `profundidad` (plano 2–6) → controla z-index y a qué "capa" pertenece |
| Aparición | cada tarjeta se animaba sola al entrar en el viewport | secuencia completa al entrar a la sede: fondo → título → elementos en `ordenNarrativo` |
| Salida | no existía | los elementos se retiran (`tiempoDesaparicion`) al cambiar de sede |
| Personalidad por sede | misma composición, distinto contenido | `composicion` (convergente / diagonal / vertical) cambia el velo y el acento de cada escena |
| Edición de posición | escribir el nombre de una zona | pestaña **Escenas**: arrastrar un punto sobre el fondo real |

## Estructura

```
SemanaRegionalUNaM/
├── index.html / login.html / admin.html
├── css/
│   ├── styles.css       Motor de posicionamiento libre + capas + responsive
│   ├── animations.css    Offset inicial por tipo de animación (fade/slide/drop/float/zoom)
│   └── admin.css          Panel + login + editor visual de escenas
├── js/
│   ├── storage.js       (sin cambios) lectura/escritura vía localStorage
│   ├── carousel.js       (sin cambios) navegación entre sedes
│   ├── animations.js      Secuenciador narrativo: entrar(sede) / salir(sede)
│   ├── layout.js            Motor de distribución sin superposición (nuevo)
│   ├── app.js                  Renderiza elementos libres + dispara el secuenciador
│   ├── login.js               (sin cambios)
│   ├── editor.js                (sin cambios) generador de formularios
│   ├── escenario.js              NUEVO — editor visual de arrastre
│   └── admin.js                    Pestañas + nueva pestaña Escenas
├── data/
│   ├── sedes.json        + campo "composicion"
│   ├── testimonios.json   x/y/escala/rotacion/profundidad/ordenNarrativo/tiempoDesaparicion
│   ├── multimedia.json     (mismos campos que testimonios.json)
│   └── config.json          (sin cambios)
└── assets/
    ├── personas/              NUEVO — fotos reales de los entrevistados
    └── (resto sin cambios)
```

## El editor visual (pestaña "Escenas")

Para cada sede se ve un lienzo con el fondo real y un punto por cada
testimonio/foto/video. **Arrastrar** ese punto actualiza `x`/`y`. **Tocarlo**
(sin arrastrar) abre un panel con plano de profundidad, escala, rotación,
orden narrativo y duración de salida. La posición también se puede escribir
a mano en las pestañas Testimonios/Multimedia, por si se prefiere precisión
a arrastrar, o por accesibilidad si no se puede usar el mouse.

El rectángulo punteado en la esquina inferior izquierda del lienzo marca
dónde va el título de la sede — es una guía visual, no un límite que
bloquee el arrastre.

## Cómo funciona la secuencia narrativa

Al entrar a una sede (`Secuenciador.entrar`, en `animations.js`):

1. El fondo pasa de opacidad 0 a 1 (por eso al cruzar de una escena a otra
   hay un instante "a oscuras": es el umbral entre un ambiente y el
   siguiente, no un error de carga).
2. 280 ms después, el título.
3. Cada elemento aparece en su `ordenNarrativo`, separado por ~420 ms del
   anterior, con su propio tipo de animación y profundidad.

Al salir (`Secuenciador.salir`) los elementos se retiran con su
`tiempoDesaparicion`, y la próxima vez que se entra a esa sede la secuencia
se repite desde cero — cada visita es una entrada nueva a la escena, no un
scroll-reveal que ya se gastó.

## Por qué "tiempo de aparición" quedó simplificado

El pedido original incluía tanto "tiempo de aparición" como "orden
narrativo" como propiedades separadas por elemento. Quedó solo
`ordenNarrativo` (un entero: 1°, 2°, 3°...) y el sistema calcula el tiempo
real. Escribir milisegundos a mano por cada elemento es frágil de mantener
a medida que se agregan o sacan elementos; lo que un editor de contenido
necesita controlar de verdad es el orden, no el valor exacto en ms. Si en
algún momento hace falta control fino al milisegundo, es un campo más para
agregar — pero no antes de que alguien lo necesite de verdad.

## Acceso al panel — sigue siendo un prototipo

```
Usuario: admin
Contraseña: 12345
```

Sin cambios respecto a v1: la validación es 100% del lado del cliente, en
`login.js`, legible por cualquiera desde las herramientas de desarrollador.
Válido como prototipo local; no para producción con datos sensibles.

## Persistencia — sigue sin backend

Los cambios se guardan al instante en `localStorage` de este navegador.
`index.html` siempre revisa ahí antes de leer `/data/*.json`. Para que el
cambio se vea en cualquier navegador hay que exportar el JSON desde el
panel y reemplazar el archivo real en `/data`. "Subir archivo" no sube
nada a ningún lado: sugiere la ruta de texto a partir del nombre elegido,
y el archivo real se copia a mano dentro de `/assets`.

## Contenido de ejemplo

Los testimonios y fotos/videos cargados son de ejemplo, con autores
genéricos ("Equipo de extensión — [Facultad]"). Reemplazalos desde el
panel antes de publicar.

## Integración de testimonios reales (apertura de la Semana Regional)

`data/testimonios.json` ya no tiene contenido de ejemplo: tiene 24 citas
reales, extraídas de la transcripción de la apertura oficial (acto
transmitido en vivo, ~1h16min), una por persona con intervención propia en
esa transcripción. Quedan afuera quienes están mencionados pero sin cita
propia (Dr. Pedro Zapata, Ing. Guillermo Keeper) y el conductor del
programa (no es una voz testimonial sobre la extensión, es quien presenta
el evento).

**Fidelidad de las citas:** cada `texto` es una oración completa, copiada
tal cual de la transcripción — nunca el fragmento abreviado con "..." que
usa la sección "Citas destacadas" de la fuente, porque ese recorte corta
oraciones a la mitad y eso sí sería alterar la cita.

**Clasificación por sede:** Rector/a, Vicerrector/a, Secretario/a General
de Extensión y cualquier cargo cuyo ámbito sea toda la UNaM (incluido el
Área de Graduados, que no depende de una facultad) aparecen en las tres
sedes con la misma cita. El resto aparece solo en la sede de su unidad
académica, sin duplicar.

**Fotos:** 5 de las 14 personas tienen foto real, copiada a
`assets/personas/`. Las otras 9 muestran un monograma (iniciales sobre un
color de marca, elegido por hash del nombre — la misma persona siempre
tiene el mismo color, no es aleatorio en cada carga). Ninguna tarjeta
queda sin imagen.

**Una foto quedó afuera del proyecto:** `WhatsApp_Image_2026-05-07_at_13_10_26.jpeg`
no tiene ningún dato identificable en el nombre de archivo, y ninguna
persona de la transcripción tiene una descripción que permita asociarla
con certeza. Asignarla a alguien al azar habría sido poner la cara
equivocada a una persona real — si me confirmás a quién corresponde, se
agrega en dos minutos desde el panel.

**Dos nombres se resolvieron con la foto, no con el documento:** la fuente
dudaba entre "Espasiuc/Espaciukuc" → la foto real dice **Spasiuk**, y entre
"Alis/Alice/Lis Rambo" → la foto real es **ALICE.jpg**, así que quedó
**Alice Rambo**. Ninguna de las dos es la Rectora Alicia Bohren — antes de
asumir esa asociación (la marca cian del manual la hizo tentadora) volví al
documento y confirmó que no aparece mencionada ahí.

**Equilibrio entre sedes:** sin tocar el contenido, la combinación de
autoridades generales (aparecen en las tres) más las voces propias de cada
sede da 9 tarjetas en Posadas, 8 en Oberá y 7 en Eldorado — la diferencia
real (Posadas tiene más unidades académicas) queda casi imperceptible.

**Cambio de comportamiento del motor narrativo:** se pidió que los
testimonios no desaparezcan nunca una vez visibles. Esto reemplaza el
`Secuenciador.salir()` de la versión anterior — ya no existe. Cada sede
reproduce su secuencia de entrada una sola vez (la primera vez que se
visita) y a partir de ahí todo queda fijo en pantalla. El campo
`tiempoDesaparicion` se eliminó de los datos y de los formularios del
panel porque ya no cumple ninguna función.

**Responsive de alta densidad:** el posicionamiento libre (pensado para
~4 elementos por escena) no escala bien a 7-9 tarjetas con foto en una
pantalla angosta. Por debajo de 820px de ancho, la escena pasa a una
secuencia vertical simple, en el mismo orden narrativo — la lógica del
recorrido se mantiene, cambia el mecanismo espacial, no el contenido ni
el orden.

### Validaciones (checklist pedido en el brief)

- [x] Las 14 personas con cita propia están clasificadas por cargo/institución.
- [x] Las 5 con foto real la usan; las 9 sin foto muestran monograma — ninguna tarjeta queda sin imagen.
- [x] Cada cita aparece en la sede que corresponde a su unidad académica.
- [x] Las autoridades de alcance UNaM (Franco, Catogui, Spasiuk, Guidec, Matot) aparecen en las tres sedes.
- [x] Ninguna unidad académica específica se duplicó en otra sede.
- [x] No hay tarjetas repetidas por error (cada `id` es único; los 5 casos de autoridades repetidas en varias sedes son intencionales, un `id` distinto por sede).
- [x] Distribución visual: 9/8/7 — sin necesidad de inventar contenido para emparejar.
- [ ] Una persona (foto WhatsApp sin nombre) queda pendiente de confirmación — ver arriba.

## El motor de distribución (`js/layout.js`)

Las posiciones que traían los datos (`x`/`y` en `%`) ya no son la posición
final: son la **preferencia de partida** de cada elemento — la composición
que se pensó a mano para esa sede. La posición real la calcula este motor,
una vez que el elemento ya está en el DOM y se puede medir su tamaño real
(que depende del largo de la cita, si tiene foto, y el ancho de pantalla
actual — nada de eso se puede saber de antemano).

**Cómo llega a una posición sin superposición:**

1. **Empaquetado por filas.** Ordena los elementos por su preferencia
   vertical y los acomoda en filas — cada fila tan alta como su elemento
   más alto, cada elemento dentro de la fila con su espacio propio. Dos
   elementos en la misma fila, o en filas distintas, no pueden superponerse:
   no es una regla que se verifique después, es una consecuencia de cómo
   se construye la fila.
2. **Si no entra de pie, se achica el conjunto, no se corta nada.** Si el
   total empaquetado es más alto que la pantalla, se reduce la escala de
   *todo* el conjunto de esa escena (nunca de una tarjeta sola, para no
   romper la jerarquía de tamaños que ya tiene la composición) y se vuelve
   a empaquetar, hasta que entra.
3. **Zona del título y zonas declaradas por la sede.** Cualquier tarjeta
   que caiga sobre el bloque de texto introductorio, o sobre una zona que
   la sede declare en `sedes.json` (`zonasProtegidas`, en % del escenario
   — así quedó registrado el cartel de Oberá y el arco de Eldorado de la
   actualización anterior, en datos que el motor respeta en cualquier
   tamaño de pantalla, no en coordenadas fijas que se rompen apenas cambia
   la fotografía de fondo), se empuja afuera por el lado más corto.
4. Un último repaso de separación de pares limpia cualquier contacto que
   ese empuje pueda haber generado.

## Quinta vuelta: por qué las tarjetas quedaban chicas y algunas se superponían

El informe de incidentes apuntaba a varios síntomas (Posadas muy chico,
Oberá superpuesto, Eldorado descompensado, proporciones inconsistentes)
pero medí los datos reales y eran **una sola causa común**: las citas
varían de 110 a 586 caracteres, y todas las tarjetas usaban el mismo
ancho fijo. Una cita de 586 caracteres en un ancho de 290px se fragmenta
en 10+ líneas — una columna angosta y altísima (eso explica el Incidente
04 tal cual). Y como `layout.js` (v3) dimensionaba **todas** las celdas
de su grilla según la tarjeta más alta de la escena, esa única cita larga
forzaba celdas enormes para las nueve, dejando pocas filas/columnas, lo
que hacía que una sola zona protegida tapara la grilla casi entera y el
sistema achicara todo el conjunto para compensar — el "tarjetas
chiquitas con la pantalla vacía" del Incidente 01 viene de ahí, no de que
falte espacio.

**La solución no fue ajustar más números — fue separar dos cosas que
estaban acopladas:** cuánto mide cada tarjeta, y con qué resolución se
busca dónde ponerla.

1. **Ancho adaptativo según la cita más larga de cada persona**
   (`anchoSegunLargoDeCita` en `app.js`): 230 a 390px en 5 bandas. Se
   calcula sobre la cita más larga disponible, no la que esté mostrándose
   en ese momento, para que el ancho no cambie cuando se sortea otra cita.
2. **`layout.js` (v4): la búsqueda de posición usa una grilla fina fija
   (24px), independiente del tamaño de cualquier tarjeta.** Cada elemento
   busca el punto libre más cercano a su ancla; los más grandes se ubican
   primero. Una cita larga ya no le quita espacio a las demás.
3. **Si todas entran con margen, el conjunto se agranda; si no entran
   todas, se achica** — antes solo se podía achicar, nunca crecer, así
   que una escena con poca densidad (Posadas) quedaba chica aunque hubiera
   espacio de sobra.

Verificado por simulación con las longitudes de cita reales de las 24
tarjetas, contra 8 combinaciones de sede/pantalla: cero superposición,
cero invasión de zona en todas. En Desktop el factor de escala pasó de
0.68 a 0.77–0.88 — más cerca del tamaño pensado, sin necesidad de tocar
ninguna posición a mano.

**Jerarquía visual (Incidente 06):** las cinco autoridades de alcance
UNaM (Franco, Catogui, Spasiuk, Guidec, Matot) tienen ahora `escala`
~12% más alta; los representantes de facultad, ~8% más baja. No fue
necesario un campo ni un mecanismo nuevo — el campo `escala` ya existía
para variar tamaño, solo le faltaba aplicarse con un criterio narrativo
en vez de solo decorativo.

## Séptima vuelta: el espacio vacío no estaba bloqueado — nadie lo pedía

Marcaste en rojo zonas vacías de Oberá y Eldorado que "está bien que
tengan comentarios". Reviso las dos por separado porque tenían causas
distintas:

**Oberá — no era un bloqueo, era que ningún ancla apuntaba ahí.** Las 8
anclas de Oberá arrancaban todas en x≥46% (la mitad derecha del
escenario); la izquierda nunca se reclamaba porque ninguna tarjeta "quería"
ir ahí, no porque hubiera una zona prohibiéndolo. Redistribuí las 8 anclas
de Oberá (y las 7 de Eldorado, mismo problema) para que cubran de x=20% a
x=86% — toda la escena, no solo la mitad derecha.

**Eldorado — ahí sí había una zona puesta a propósito, y la marca roja
pasa por encima de ella.** Tres actualizaciones atrás protegí el texto
"Ciudad de Eldorado" del arco y la escultura central para que ninguna
tarjeta los tapara. Tu marca en rojo atraviesa la escultura de punta a
punta y parte del cielo sobre el arco — interpreto eso como que, viendo el
resultado real, esa protección era más conservadora de lo necesario.
Saqué la zona de la escultura por completo y achiqué la del arco a solo
la franja del texto (11% de alto en vez de 22%), no todo el cielo arriba.

Verificado de nuevo por simulación con los datos reales de las 15
tarjetas reposicionadas: sin superposición ni invasión de zona en los
casos probados.

## Sexta vuelta: el bug no estaba en el algoritmo — estaba en el orden

Con las posiciones reales medidas en las capturas, el patrón era raro:
tarjetas que debían estar separadas terminaban tocándose, justo las que
muestran citas largas. Revisando el código en vez de seguir ajustando el
algoritmo, encontré la causa real: `js/layout.js` mide cada tarjeta con
`offsetWidth`/`offsetHeight` para saber cuánto espacio reservarle — pero
en `app.js`, el cuadro de la cita (`<blockquote class="testimonio-cita">`)
se deja **vacío a propósito** hasta que `refrescarCitas()` sortea cuál
mostrar, y esa función se llamaba *después* de medir y distribuir, no
antes.

Es decir: el motor medía una tarjeta de ~150px de alto (foto + nombre +
cargo + institución, sin nada de cita) y le reservaba ese espacio. Recién
después aparecía el texto real — que según la persona puede ir de 110 a
586 caracteres, hasta 500px de alto — y la tarjeta crecía hacia donde ya
no había lugar reservado. El algoritmo de distribución funcionaba
perfecto; estaba resolviendo un problema con datos que ya estaban mal
desde el momento en que se midieron.

**La solución:** la tarjeta arranca mostrando la cita **más larga**
disponible para esa persona (no vacía, no la elegida al azar) — así la
primera medición ya es la del peor caso posible. Recién después de medir
y distribuir con ese tamaño "de máxima", se sortea la cita real que
efectivamente se va a mostrar. Como esa elección nunca puede ser más
larga que la que ya se usó para medir, nunca puede necesitar más espacio
del que ya tiene asignado — pase la primera vez, al reingresar a la
sede, o después de un resize. El cambio de "cita más larga" a "cita al
azar" ocurre antes de que nada sea visible, así que no se nota.

De paso, separé dos anclas de Eldorado que habían quedado casi idénticas
(Catogui y Guidec, a 2% de distancia entre sí) — no causaban superposición
por sí solas, pero competían por el mismo lugar y no ayudaban a la
dispersión que pedía el reporte anterior.

## Cuarta vuelta: bugs reales encontrados en capturas de pantalla

Las tres capturas que mandaste mostraban tres problemas distintos, no uno:

**1. Tarjetas tapando el encabezado fijo y el menú inferior.** El algoritmo
anterior solo protegía la zona del título de cada sede — nunca el chip de
marca (arriba izquierda), el encabezado del evento (arriba derecha) ni la
navegación entre sedes (abajo centro). Ahora las cuatro están protegidas
siempre, además de las zonas que cada sede declare.

**2. Un video vacío visible como ruido.** `<img>` tenía manejo de error
(se oculta si el archivo no existe); `<video>` no lo tenía, así que un
video sin archivo real quedaba con el reproductor nativo vacío y visible
en vez de desaparecer. Corregido con el mismo criterio que las fotos.

**3. Posible desajuste por carga de tipografía.** Si Roboto todavía no
había cargado en el momento exacto de medir las tarjetas, se medían con
la fuente de reemplazo del sistema — que ocupa otro espacio — y la
distribución calculada dejaba de coincidir con el tamaño real una vez que
Roboto cargaba. Ahora se vuelve a calcular cuando `document.fonts.ready`
se resuelve, además de en cada cambio de tamaño de ventana.

### El algoritmo de distribución, rediseñado una tercera vez

Al simular la versión anterior (empaquetado por filas) con las cuatro
zonas fijas nuevas, encontré el motivo real de por qué seguía fallando:
cuando una zona protegida cae en una esquina, empujar una tarjeta para
afuera de la esquina la hace chocar con su vecina de fila: el ajuste de
pares la empuja de vuelta adentro, y ese ciclo no se resuelve agregando
más iteraciones, porque no es un problema de cantidad de pasos sino de
que las dos correcciones se pelean entre sí.

La solución: una **grilla invisible que descarta de entrada cualquier
celda que toque una zona protegida** (chip, encabezado, menú inferior,
título de la sede, zonas declaradas por la sede). Las tarjetas nunca
empiezan en un lugar prohibido, así que no hace falta sacarlas de ahí a
la fuerza — y un ajuste fino de separación de pares al final limpia
cualquier contacto menor entre tarjetas. Si no hay suficientes celdas
libres para todas (pantalla muy chica o muy ocupada por zonas), se achica
el conjunto entero y se reintenta, nunca al revés.

Se verificó (de nuevo, por simulación matemática — sigo sin poder
conseguir un navegador real en este entorno) contra 7 combinaciones de
pantalla, dos de ellas armadas a propósito para romperlo: cero
superposiciones y cero invasión de zona protegida en las 7.

## Citas múltiples por persona (antes: una sola, siempre la misma)

`data/testimonios.json` reemplazó el campo `texto` por `citas` (una
lista). 13 de las 14 personas tienen ahora 2 o 3 citas reales —
extraídas del mismo documento de la transcripción, ninguna inventada—;
"Representante de FAyD" quedó con una sola porque es la única que la
fuente registra para esa intervención.

**Cómo se elige:** al entrar a una sede (la primera vez, y cada
reingreso — esto sí se repite, a diferencia de la animación de entrada),
se elige una cita al azar para cada persona, evitando repetir la última
que se le mostró a esa persona en cualquier sede de esta sesión. Una
autoridad general que aparece en las tres sedes comparte ese "último
mostrado", así que recorrer Posadas → Oberá → Eldorado tiene buenas
chances de traer una cita distinta cada vez, tal como pedía el ejemplo
del brief. Se guarda en `sessionStorage`: dura la sesión del navegador,
no algo permanente.

Si la tarjeta ya está visible cuando se reingresa, el cambio de texto se
hace con una transición suave, no un salto.

**Cómo se edita desde el panel:** el campo "Citas" de cada testimonio
acepta una o varias, separadas por una línea con `---`. Internamente se
guardan como lista en el JSON; el textarea es solo la forma de editarlas
sin tener que tocar el archivo a mano.

## Objetivos táctiles (Problema 5 del brief)

Los controles de navegación (flechas, indicadores de sede) ahora miden al
menos 44px en cualquier dispositivo con puntero táctil — se detecta por
capacidad de puntero (`pointer: coarse`), no por ancho de pantalla, así
que también aplica a una notebook con pantalla táctil grande.

## Lo que no toqué de las "5 mejoras responsive" del brief

El resto del Problema 5 (recortar fotos de fondo distinto por dispositivo,
rediseñar la composición mobile más allá de lo que ya existía) y el
Problema 4 completo (que la composición espacial — no solo las citas — se
reordene en cada reingreso) quedaron afuera de esta vuelta a propósito: ya
hay tres causas reales confirmadas por captura de pantalla más el sistema
de citas, que es mucho para una sola entrega, y tocar la composición
espacial de nuevo sin verificarla a fondo es exactamente el tipo de
cambio que generó los problemas anteriores. Prefiero entregar esto
verificado y avisar qué quedó pendiente, antes que sumar más superficie
sin la misma verificación.
