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
│   ├── app.js               Renderiza elementos libres + dispara el secuenciador
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
