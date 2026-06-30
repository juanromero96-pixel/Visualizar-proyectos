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
│   ├── layout.js            Motor de distribución sin superposición
│   ├── lector.js              Lector ampliado: click/tap abre la cita completa en un modal
│   ├── app.js                  Renderiza elementos libres + dispara el secuenciador
│   ├── login.js               (sin cambios)
│   ├── editor.js                (sin cambios) generador de formularios
│   ├── escenario.js              NUEVO — editor visual de arrastre
│   └── admin.js                    Pestañas + nueva pestaña Escenas
├── data/
│   ├── sedes.json        + campo "composicion"
│   ├── testimonios.json   x/y/escala/rotacion/profundidad/ordenNarrativo/tiempoDesaparicion
│   ├── multimedia.json     (mismos campos que testimonios.json)
│   ├── registros.json        NUEVO — Registros de Unidad Académica y Conceptuales
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

## Novena vuelta: lector ampliado (click/tap) + tipografía responsiva con clamp()

Hasta ahora el hover/foco solo traía la tarjeta al frente y la agrandaba
apenas — una vista previa, no una lectura cómoda. Esto agrega la
interacción que faltaba.

**`js/lector.js` (nuevo).** Click, tap o Enter sobre una tarjeta de
testimonio abre un modal único y reutilizable (no uno por tarjeta) con la
foto, el nombre, el cargo, la institución y la cita completa, en
tipografía más grande y fondo sólido — ahí el objetivo es solo legibilidad,
no que se vea el paisaje detrás como en las tarjetas de la escena. Lee el
contenido directamente del DOM de la tarjeta que se activó (no de los
datos originales), así siempre coincide con la cita que esa persona tenía
en pantalla en ese momento, incluida la que haya tocado en el sorteo.

Se cierra con el botón, con clic afuera, o con Escape. Mientras está
abierto, Tab no se escapa al fondo (el único elemento interactivo del
modal es el botón de cerrar, así que atraparlo ahí fue simple) y el foco
vuelve a la tarjeta que lo abrió al cerrarlo. El scroll de fondo se
bloquea mientras está abierto.

**Por qué no toqué el hover existente:** seguía siendo necesario como
vista previa antes de decidir si abrir el lector — separar "destacarse un
poco" (hover/foco) de "leer entero" (click/tap/Enter) es más claro que
hacer que el hover ya abra todo.

**Equivalente táctil:** en touch no existe el hover, pero tampoco hace
mucha falta — tocar ya abre directamente el lector completo, que es el
equivalente táctil natural a "acercar el cursor y después hacer clic".

**Tipografía con `clamp()`:** dentro del lector, donde no hay presión de
espacio (no compite con otras tarjetas), el tamaño de fuente crece con el
viewport usando `clamp()` en vez de un valor fijo. En las tarjetas de la
escena no toqué esto — ahí el tamaño ya lo resuelve el factor de escala de
`layout.js`, agregar `clamp()` encima pelearía contra ese cálculo en vez
de complementarlo. Sí reemplacé un salto duro de breakpoint (el ancho de
las fotos/video pasaba de golpe a 220px a los 1024px) por
`clamp(170px, 18vw, 240px)`, que se achica en proporción al viewport en
vez de saltar.

## Octava vuelta: tamaño general y la zona del cartel de Oberá

Liberé la zona del cartel "OBERA" — mismo criterio que la escultura de
Eldorado la vez pasada: marcaste explícitamente que está bien tapar ese
cartel, así que sacué esa zona protegida por completo.

**Sobre el tamaño:** medí antes de tocar nada. Con 8-9 tarjetas de texto
real compitiendo por el mismo escenario, hay un límite físico real — no
es un parámetro mal puesto, es que ese contenido (fotos, nombre, cargo,
institución y una cita de hasta 300+ caracteres, multiplicado por 8 o 9
personas) ocupa lo que ocupa. Dicho esto, encontré margen real para
agrandar sin volver a superponer:

- Las bandas de ancho subieron 20px en cada nivel (250 a 410, antes 230 a 390).
- La separación mínima entre tarjetas bajó de 22 a 16px — seguía siendo
  más espacio del que hace falta para que no se toquen.
- Sumado a liberar la zona del cartel en Oberá, el ancho promedio final en
  escritorio (1920×956) pasó de 257–300px a 273–324px según la sede.

Verificado de nuevo por simulación con los textos reales: sin
superposición ni invasión de zona, en escritorio y en notebook
(1280×800, donde el límite físico es más evidente — ahí las tarjetas
sí quedan más chicas, 163-194px, porque genuinamente no entra más en
ese espacio sin tapar algo).

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

## Décima vuelta: menos autoridades a la vez, más voz para las Unidades Académicas

Este pedido reorganiza el equilibrio del mural (menos protagonismo de
autoridades, más de las experiencias de Unidad Académica) y pide volver a
revisar toda la documentación en busca de más citas sobre territorio y
territorialidad. Antes de tocar código, releí los 5 documentos fuente
completos buscando específicamente menciones de las 5 autoridades de
alcance UNaM que pudieran no estar ya usadas — y encontré una sección
entera ("Concepción de la extensión" + un banco de citas con etiqueta
`Tema:`) dentro del documento de FHyCS que no había explotado del todo en
rondas anteriores.

### Autoridades visibles: de 5 fijas a 2 al azar (punto 2)

**El problema real, medido:** las 5 autoridades de alcance UNaM (Franco,
Catogui, Spasiuk, Guidec, Matot) aparecían siempre las cinco, en las tres
sedes — 15 instancias fijas en total, sin variar nunca entre visitas.

**La solución:** `aplicarSubconjuntoDeAutoridades()`, en `js/app.js`,
sortea 2 de las 5 cada vez que se entra a una sede — al cargar el sitio,
al cambiar de sede, y en cada reingreso —, evitando repetir exactamente
el mismo par que la vez anterior en esa sede (mismo patrón de
"no-repetir-lo-último" que ya usan las citas individuales). Las 3
autoridades no elegidas no solo bajan su opacidad: se excluyen por
completo del cálculo de `layout.js` (un ajuste mínimo y quirúrgico en ese
archivo, `:not(.elemento--oculto-autoridad)` en la selección de
elementos), así que el resto de la escena reclama ese espacio de verdad,
no lo deja reservado e invisible.

**Hallazgo no buscado:** al simular esta vuelta con los datos reales,
encontré que el límite que había quedado documentado en la vuelta
anterior (821×600, una superposición de 2px) **desapareció por completo**
— con menos elementos compitiendo por el mismo espacio, el motor de
distribución ya no se acerca al límite en ningún tamaño de pantalla
probado. La reducción de autoridades no fue solo una decisión narrativa:
terminó siendo, de paso, la solución al único caso límite que quedaba
pendiente.

### Más citas reales, releyendo la documentación completa (punto 3)

Encontré una sección de "Concepción de la extensión" dentro del documento
de FHyCS con citas explícitamente etiquetadas por tema, varias sobre
territorio/territorialidad, que no había usado:

- **Mauricio Franco** — 2 citas nuevas (5 en total): "La extensión nace
  con ese objetivo: mostrar la capilaridad y la territorialidad..." y una
  versión más completa de "no es llevar la universidad al medio, sino
  traer al medio, a la comunidad, a la universidad."
- **Néida González** — 2 citas nuevas (4 en total), ambas sobre
  desarrollo territorial y transformación social.
- **Eva Muguersa** — 1 cita nueva (3 en total), sobre el observatorio
  como dispositivo "anclado en demandas concretas del territorio".

Antes de incorporarlas, verifiqué programáticamente que ninguna
duplicara una cita ya usada en su propio registro de Unidad Académica
(la cita de Muguersa en el registro UA de FHyCS es una frase distinta a
estas tres) — evitar que la misma frase aparezca dos veces en la misma
escena, en dos tarjetas distintas.

Re-revisé también FAyD, FI, FCEQyN y FCE buscando más apariciones de las
5 autoridades: no hay ninguna otra — esas cuatro facultades no las citan,
solo FHyCS lo hace (además de la transcripción de apertura ya usada en
rondas anteriores).

### Dos registros conceptuales nuevos, con material que ya estaba documentado pero no usado (punto 8)

Cada uno de los 5 documentos fuente tiene su propia sección analítica
"Cómo aparece el territorio" — conclusiones ya extraídas en sesiones
anteriores, pero que hasta ahora solo había usado parcialmente (en el
registro conceptual de Oberá). Esta vuelta sumé dos más:

- **Posadas — "El territorio no tiene una sola escala"**: la síntesis de
  FHyCS describe el territorio apareciendo como barrio, como frontera,
  como provincia entera, como región rural, y como territorio digital,
  según el proyecto que lo nombre. Es una idea genuinamente distinta de
  la que ya existía para Posadas ("la extensión como coproducción"), así
  que no es redundante.
- **Oberá — "Quienes sostienen la extensión"**: la síntesis de FAyD
  señala explícitamente el protagonismo del personal no docente como uno
  de los tres elementos únicos de esa facultad en todo el corpus — un
  bloque entero del conversatorio se dedicó a esa voz, algo que no
  aparece en ninguna otra jornada documentada. Se diferencia con
  claridad del registro conceptual de Oberá ya existente (que habla de
  fronteras internacionales, no de quién sostiene el trabajo en el
  tiempo).

Con esto, Posadas y Oberá pasan de 1 a 2 registros conceptuales cada uno
(4 en total, antes 2) — verificado que la capacidad del motor de layout
lo sostiene sin problema, justamente porque la reducción de autoridades
visibles liberó el espacio que esto necesitaba.

### Realce visual leve para los registros de Unidad Académica (punto 11)

Los 5 registros de experiencia institucional subieron su `escala` en
+0.08 (quedando entre 1.0 y 1.08, antes 0.92–1.0) — una variación sutil,
no un cambio de diseño, para que se lean como las piezas más centrales
del mural sin desentonar con el resto.

### Multimedia: se vació el contenido de demostración (punto 9 y 17)

`data/multimedia.json` tenía 6 entradas de muy al principio del
proyecto, antes del giro hacia el modelo de registros documentales,
apuntando a archivos (`assets/photos/posadas-1.jpg`, etc.) que nunca
existieron en el repositorio — solo quedan los `LEEME.txt` de
placeholder en esas carpetas. El brief es explícito y repetido sobre
este punto ("no crear registros sin respaldo documental"), así que vacié
el archivo a `[]` en vez de dejarlo con datos de muestra que contradicen
esa instrucción. Esto de paso resuelve, de raíz, el bug del video vacío
("Recorrido por proyectos — Posadas") que en una vuelta anterior solo se
había tapado con manejo de errores — ahora directamente no hay datos
falsos que generen el problema.

### Descripción lateral, más fluida (punto 12)

El título de la sede ya usaba `clamp()`; el resto del bloque
(subtítulo, descripción, lista de unidades académicas) usaba tamaños
fijos en `rem`. Ahora los cinco usan `clamp()`, y el ancho del bloque
pasó de `min(34vw, 460px)` a `clamp(260px, 30vw, 460px)` — con un piso
explícito de 260px para que no se angoste de más en ventanas de
escritorio chicas, antes de llegar al punto de quiebre de 820px que ya
pasa a flujo vertical.

### Lo que no cambié

- **El equilibrio 25/40/20/15% del brief no se aplicó como fórmula
  literal** — el propio brief lo autoriza explícitamente ("no utilizar
  estos porcentajes como valores rígidos"). En cambio, perseguí el
  objetivo cualitativo: que las autoridades dejen de dominar (logrado,
  verificado) y que las experiencias de Unidad Académica ganen
  protagonismo relativo (logrado, vía el realce de escala + la reducción
  de autoridades simultáneas).
- **0 registros audiovisuales** — sigue sin haber ningún archivo real de
  foto/video de proyectos en el repositorio.
- **0 registros nuevos para Eldorado** — sigue sin haber documentación
  propia de Ciencias Forestales o la Escuela Agrotécnica más allá de los
  testimonios breves que ya existen.
- **El panel de administración sigue sin conocer `registros.json`** ni
  el nuevo mecanismo de rotación de autoridades — misma limitación
  documentada en la vuelta anterior, todavía pendiente como trabajo
  aparte.

## Novena vuelta (grande): el modelo de registros documentales

Esta vuelta implementa la especificación del `DTD_Funcional_UNaM_Semana_Regional_Registros.md`: el mural deja de ser solo testimonios y empieza a convivir con registros de otro tipo. Es el cambio más grande del proyecto hasta ahora, así que el detalle de qué se hizo y qué no es más largo de lo habitual.

### Qué se implementó

**`data/registros.json` (nuevo)** — 7 registros, construidos exclusivamente a partir de los 5 documentos fuente reales (FHyCS, FCEQyN, FCE, FAyD, FI):

- **5 Registros Institucionales de Unidad Académica** (tipo B del DTD): uno por cada unidad académica con documentación real disponible. Cada uno tiene un resumen breve (lo único visible en el mural, recortado a 3 líneas) y un cuerpo completo —varios párrafos, una lista de proyectos reales mencionados en la fuente, y una cita de respaldo con atribución— que solo aparece al expandir.
- **2 Registros Conceptuales** (tipo C): uno por sede (Posadas y Oberá), no uno por unidad académica — ver más abajo por qué. Cada uno entreteje 2-3 citas reales de distintas facultades de la misma sede para mostrar una idea que las atraviesa a todas, no una sola.
- **0 Registros Audiovisuales.** No hay ningún archivo de foto o video real de proyectos en `assets/photos` o `assets/videos` (solo quedan los `.gitkeep`/`LEEME.txt` de placeholder). La instrucción es explícita: "si no existe material documental, no crear el registro." No inventé ninguno.
- **0 registros nuevos para Eldorado.** Ninguna de las dos unidades de Eldorado (Escuela Agrotécnica, FCF) tiene documentación propia más allá de las breves intervenciones que ya están como testimonios — exactamente lo que el prompt anticipaba ("Situación particular de Eldorado") y pedía no inventar.

**Por qué un registro conceptual por sede, y no uno por unidad académica.** El plan original era 6 (uno por UA). Antes de escribir contenido, simulé el algoritmo de distribución con el tamaño de tarjeta esperado y 15 elementos en la escena de Posadas, y encontré que la combinación no convergía sin superposición en una ventana angosta y baja (821×600) — el piso de escala configurado no alcanzaba para acomodar tantos elementos. En vez de bajar ese piso (lo que habría hecho ilegibles las tarjetas más chicas), reduje el alcance a un registro conceptual por sede. Esto además resultó en un contenido más fuerte: en vez de una idea por facultad, cada registro conceptual ahora cruza 2-3 facultades de la misma sede en una sola idea transversal —genuinamente más interesante que seis ideas aisladas—, así que la restricción técnica terminó mejorando la decisión editorial.

**Identificación por Unidad Académica (DTD 8.4).** Una barra de color de 3px en el borde izquierdo, aplicada ahora a TODOS los testimonios (antes no la tenían) y a los nuevos registros UA. La paleta de 8 colores —autoridades generales + 7 unidades académicas— se derivó matemáticamente de los 3 colores del Manual de Identidad Visual (cian, verde, marrón) mediante corrimientos de luminosidad, documentados en el propio código (`js/app.js`, `PALETA_UNIDAD_ACADEMICA`), no elegidos a ojo. La función que asigna el color por institución extrae la sigla entre paréntesis cuando existe ("Facultad de Ciencias Económicas (FCE)" → "FCE") y compara por igualdad exacta tras normalizar, no por substring — encontré antes de integrarlo que comparar por substring confundía "FCE" con "FCEQyN" (la cadena larga de FCEQyN contiene literalmente "fce"), y lo corregí antes de que llegara a producción.

**Tratamiento diferencial de testimonios institucionales (DTD 8.2, obligatorio).** Las cinco autoridades de alcance UNaM (Franco, Catogui, Spasiuk, Guidec, Matot) ahora tienen un borde izquierdo más grueso (5px en vez de 3px) y el nombre en tipografía levemente mayor — variación sutil sobre la misma tarjeta, no un componente nuevo, tal como pide el documento.

**El lector ampliado, generalizado.** `Lector.abrir()` ahora acepta un segundo argumento opcional con el registro completo. Sin ese argumento, se comporta exactamente igual que antes (lee la cita actual del DOM del testimonio, porque esa cita puede haber sido sorteada al azar y tiene que coincidir con lo que la persona ya estaba viendo). Con el argumento, construye el contenido completo —cuerpo en párrafos, lista de proyectos, cita de respaldo— directamente desde los datos, porque ahí no hay nada que rote: lo que cambia es que el mural solo muestra el resumen recortado y el cuerpo completo vive únicamente en el dato, nunca en el DOM de la tarjeta.

**Recorte de texto en el mural (punto 7 del prompt).** Los registros nuevos (UA y conceptual) muestran el resumen recortado a 3 líneas vía `-webkit-line-clamp` — nunca el cuerpo completo. Los testimonios, en cambio, siguen mostrando la cita completa sin recortar: esa fue una decisión deliberada de seis vueltas de trabajo anteriores, específicamente para que el ancho de la tarjeta se calculara según el largo real de cada cita y nunca hiciera falta cortarla. Interpreté el punto 7 del prompt ("las notas... el texto deberá quedar recortado") como aplicable a los tipos NUEVOS, que sí tienen cuerpos demasiado largos para cualquier tarjeta flotante (varios párrafos + lista de proyectos), no como una instrucción de deshacer el trabajo ya validado en testimonios — lo dejo explícito acá por si la lectura no es la que se esperaba.

### Verificación

Repetí el mismo proceso de simulación de todas las vueltas anteriores, esta vez con el contenido real ya escrito (no estimado): 18 combinaciones de sede × tamaño de pantalla, comparando contra los datos exactos de `testimonios.json`, `registros.json` y `sedes.json`. Resultado: limpio en las 18 salvo el mismo caso límite ya documentado en una vuelta anterior (821×600, una superposición de 2px verticales — ruido de redondeo, no algo perceptible).

### Lo que NO se tocó en esta vuelta

- **El panel de administración no sabe que `registros.json` existe.** No lo carga, no lo edita, no lo muestra en el editor visual de posiciones. Esto es una limitación real, no un descuido: extender el panel con un formulario propio para registros (cuerpo multi-párrafo, lista de proyectos editable, cita opcional) es un trabajo de un tamaño comparable al de esta misma vuelta, y prefiero entregarlo como una vuelta aparte, bien hecha, antes que apurarlo acá. Mientras tanto, los registros se editan tocando `data/registros.json` directamente.
- **El motor de distribución (`js/layout.js`) no se tocó.** No hizo falta: ya era genérico (opera sobre cualquier `.elemento` con los atributos `data-ancla*`), así que los registros nuevos se integraron sin cambiar una línea de ese archivo — la separación entre estructura narrativa y motor de layout que describe la sección 9.3 del Documento Técnico se sostuvo en la práctica, no solo en la teoría.
- **La descripción breve de cada sede no cambió**, tal como pedía explícitamente el punto 1 del prompt.

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
