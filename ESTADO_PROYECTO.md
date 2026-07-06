# Compendio Digital UNaM — Estado del Proyecto
## Resumen para migración de conversación

**URL de producción:** `visualizar-proyectos.vercel.app`  
**Stack:** Vanilla HTML/CSS/JS, sin frameworks, sin backend. Servidor Python para desarrollo local.  
**Fecha de este resumen:** Julio 2026

---

## 1. Contexto del proyecto

El Compendio Digital documenta la **Semana Regional de la Extensión Universitaria** de la Universidad Nacional de Misiones (UNaM). Es un **mural documental interactivo** organizado alrededor de tres sedes regionales: Posadas, Oberá y Eldorado.

**Concepto museográfico:** Las anotaciones (tarjetas documentales) flotan sobre fotografías aéreas de cada ciudad. No es una lista ni un feed: es un mural espacial donde los documentos orbitan alrededor de sus Unidades Académicas como constelaciones narrativas. En mobile, el mismo concepto se preserva con una composición editorial diferente.

---

## 2. Estructura del directorio

```
SemanaRegionalUNaM/
├── index.html                    # punto de entrada (404 líneas)
├── css/
│   ├── styles.css                # estilos base desktop (1427 líneas)
│   ├── animations.css            # sistema de reveal (33 líneas)
│   ├── intro.css                 # pantalla de bienvenida + cajero (783 líneas)
│   ├── mobile.css                # experiencia mobile (870 líneas)
│   └── admin.css                 # admin panel BDE-UNaM (566 líneas)
├── js/
│   ├── app.js                    # motor principal: render, rotación, datos (1166 líneas)
│   ├── layout.js                 # algoritmo Monte Carlo de posicionamiento (476 líneas)
│   ├── mobile.js                 # experiencia táctil: bottom sheets, nav, toast (414 líneas)
│   ├── lector.js                 # modal de lectura expandida (421 líneas)
│   ├── intro.js                  # pantalla de bienvenida + cajero institucional (319 líneas)
│   ├── carousel.js               # navegación entre sedes (68 líneas)
│   ├── animations.js             # Secuenciador de reveal (76 líneas)
│   └── storage.js                # preferencias locales (81 líneas)
├── data/
│   ├── sedes.json                # 3 sedes con metadata editorial
│   ├── testimonios.json          # 24 testimonios (personas con cargo, cita, foto, ancla x/y)
│   ├── registros.json            # 9 registros (5 UA + 4 conceptuales) con imagenPortada
│   ├── multimedia.json           # 8 videos YouTube
│   └── config.json               # configuración institucional
└── assets/
    ├── backgrounds/              # posadas.jpg, obera.jpg, eldorado.jpg
    ├── personas/                 # fotos de autoridades (circular en desktop, monograma en mobile)
    ├── logos/                    # unam-logo-oficial.png, unam-badge.svg
    └── ua/                       # fhycs.jpg, fceqyn.jpg, fi.jpg, fcf.jpg (portadas de UA)
```

---

## 3. Arquitectura de los datos

### Schema de `testimonios.json`
```json
{
  "id": "t-franco-posadas",
  "sede": "posadas",
  "nombreCompleto": "Mauricio Franco",
  "cargo": "Secretario General de Extensión",
  "institucion": "UNaM",        // "UNaM" | "Facultad de Arte y Diseño (FAyD)" | etc.
  "unidadAcademica": null,       // para UA testimonios: "FAyD", "FHyCS", etc.
  "foto": "assets/personas/mauricio-franco.webp",
  "citas": ["La extensión no es solamente...", "Para nosotros, la extensión..."],
  "x": 50, "y": 9,              // ancla porcentual en el mural (0-100)
  "rotacion": -2,                // grados de rotación de la tarjeta
  "escala": 0.96,                // factor de escala visual
  "permanente": false,           // true = nunca oculto por rotación
  "visible": true
}
```

### Schema de `registros.json`
```json
{
  "id": "r-fhycs-ua",
  "tipo": "experiencia_ua",      // "experiencia_ua" | "conceptual"
  "sede": "posadas",
  "unidadAcademica": "FHyCS",
  "titulo": "Una jornada en día de paro: cuatro mesas, casi 25 proyectos",
  "resumen": "La facultad anfitriona de la apertura general...",
  "descripcion": "...",          // texto completo para el lector
  "imagenPortada": "assets/ua/fhycs.jpg",  // foto del edificio UA
  "x": 22, "y": 44,
  "rotacion": 1, "escala": 1.06,
  "permanente": true,            // UA narrators son siempre permanentes
  "visible": true
}
```

### Schema de `multimedia.json`
```json
{
  "id": "v-fhycs-institucional",
  "sede": "posadas",
  "unidadAcademica": "FHyCS",
  "youtubeId": "abc123",
  "titulo": "FHyCS en la Semana Regional de la Extensión",
  "descripcion": "...",
  "x": 30, "y": 58,
  "rotacion": 3, "escala": 0.92,
  "permanente": false, "visible": true
}
```

---

## 4. Arquitectura JavaScript

### Motor principal (`app.js`)

**Flujo de inicialización:**
1. `pintarEncabezado()` — renderiza el chip de logo + hamburguesa
2. `pintarSedes()` — crea `.escenario` para cada sede y llama `crearElemento()` por cada item
3. `aplicarSubconjuntoDeAutoridades()` — sistema K=2: muestra 2 de 5 autoridades UNaM
4. `recalcular()` → `Distribuidor.distribuir()` (layout.js)
5. `Mobile.inicializar()` — bottom sheets, nav #ruta-m, toast
6. `Secuenciador.iniciar()` → `Secuenciador.entrar()` — reveal con fade escalonado
7. `Rotacion.iniciar()` — ANTES de Secuenciador, con delay=0 en mobile

**`crearElemento(item)`:**
```javascript
// UA del testimonio se resuelve con resolverUA() que extrae la sigla parentética:
// "Facultad de Arte y Diseño (FAyD)" → "fayd"
const uaKey = resolverUA(item.unidadAcademica || item.institucion || '');
el.dataset.ua = uaKey;
el.dataset.tipo = item._tipo; // 'testimonio' | 'registro-ua' | 'registro-conceptual' | 'video'
el.style.setProperty('--color-ua', colorDeUnidadAcademica(uaKey));
el.style.setProperty('--ua-order', uaBase * 2 + tipoOffset);
// UA_ORDER: {fhycs:0, fceqyn:1, fce:2, fayd:3, fi:4, fcf:5, eae:6, general:7, unam:9}
```

**Sistema de foto/monograma (bug C-01 resuelto):**
```javascript
// En crearTarjetaTestimonio():
const esMobileNow = window.esMobile?.();
if (item.foto && !esMobileNow) {
  // Desktop: SOLO <img> — monograma NUNCA se construye
  const img = document.createElement('img');
  img.addEventListener('error', () => {
    figura.innerHTML = `<div class="testimonio-monograma">...</div>`;
  });
} else {
  // Mobile siempre: SOLO monograma. Color del monograma = color de la UA.
  const colorMonograma = colorDeUnidadAcademica(resolverUA(institucion));
}
```

**Sistema de Rotación editorial:**
- `calcularCapacidad()`: mobile = max(8, min(11, round(area/28000))), desktop = max(8, min(22, ...))
- Los `registro-ua` con `data-permanente="true"` nunca se ocultan
- K=2: máximo 2 autoridades UNaM visibles simultáneamente
- **ORDEN CRÍTICO en onCambio**: `Rotacion.iniciar()` ANTES de `Secuenciador.entrar()`
  - delay=0 en mobile: `configurar()` corre antes de que el stagger del Secuenciador revele
  - Ocultamiento INSTANTÁNEO en mobile (sin fade) para evitar flash de todos los elementos
  - En desktop: delay=2500ms, fade escalonado de 80ms por elemento

### Motor de layout (`layout.js`)

**Dos paths completamente separados:**

**Desktop (Monte Carlo):**
- `ubicarPorBusqueda()`: itera sobre posiciones candidatas, minimiza colisiones con zonas protegidas
- `separarPar()`: empuje iterativo para separar elementos superpuestos (ITERACIONES_LIMPIEZA_FINAL)
- `empujarFueraDeZonas()`: respeta header chip, hamburguesa, nav bar
- `SEPARACION_MINIMA = 16px`

**Mobile (early-return, zonas editoriales):**
```javascript
if (window.esMobile?.()) {
  SEPARACION_MINIMA = 56;  // px
  // Asignación por zonas 2×5 con filas EXCLUSIVAS para UA narrators:
  //   Posadas: FHyCS → fila 0, FCEQyN → fila 2, FCE → fila 4
  //   Oberá: FAyD → fila 0, FI → fila 2
  // Esto evita que dos narrators de 165px estén en la misma fila de 188px
  const filasNarrador = new Set();
  // Narrators: [0,2,4,1,3].filter(r => !filasNarrador.has(r))
  // MARGEN_TOP=100px (header), MARGEN_BOT=70px (nav #ruta-m)
  // Jitter 0.28 (reducido para que los elementos permanezcan en su zona)
  return;  // ← EARLY RETURN: desktop algorithm never runs on mobile
}
```

**Zonas protegidas:** `obtenerZonasProtegidas()` lee `.marca-chip`, `.menu-inst-btn`, `.ruta`, `.sede-kicker`, y `#ruta-m` (nav mobile) del DOM y los excluye del layout.

### Módulo mobile (`mobile.js`)

**`esMobile()` — triple check:**
```javascript
const mq     = window.matchMedia('(max-width: 820px)').matches;
const tactil = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
const iw     = window.innerWidth > 0 ? window.innerWidth <= 820 : mq;
return mq || tactil || iw;  // OR: si cualquiera indica mobile → mobile
```
*`pointer: coarse` es el trigger primario: funciona aunque el carrusel infle el viewport a 980px*

**Componentes mobile:**
- `#ruta-m`: nav bar creada dinámicamente por JS (sin herencia CSS del `.ruta` desktop)
- `#sede-info-toast`: panel slide-up al tocar una sede, muestra nombre + UAs + descripción (5s auto-dismiss)
- `crearBottomSheet()`: bottom sheet genérico con pull-to-close (>120px drag)
- `window.LectorSheet`: bottom sheet para el lector documental
- `cajeroSheet`: bottom sheet de pantalla completa para el cajero institucional

---

## 5. CSS Mobile — decisiones críticas

### Qué hace `mobile.css`
El carrusel en mobile es `flex-direction: row` con `scroll-snap-type: x mandatory`. Las sedes se navegan horizontalmente. El escenario sigue siendo `position: absolute; inset: 0`. El layout.js corre (sin guard). Los elementos flotan absolutamente, pero **escalados para 375px**.

**Anchos máximos en mobile:**
- `registro-ua`: `min(165px, 44vw)` — portada foto + texto
- `registro-conceptual`: `min(155px, 41vw)`
- `testimonio`: `min(148px, 39vw)`
- `video`: `min(160px, 43vw)`

### Regla crítica anti-superposición
Con zona de 188px y elementos de 165px, el cálculo garantiza NO superposición:
- col-0 centro: 94px ± 23px jitter → ocupa 71-117px
- col-1 centro: 281px ± 23px jitter → ocupa 258-304px
- Brecha: 141px libre

### `.ruta { display: none }` DENTRO del media query (no globalmente)
En versiones anteriores esta regla estaba fuera del MQ y ocultaba la barra de sedes en desktop (regresión). Ahora está correctamente dentro de `@media (max-width: 820px), (pointer: coarse) and (hover: none)`.

### `.elemento--rotacion-espera` — triple fuerza de ocultamiento
En `styles.css` (global, siempre aplica):
```css
.elemento--rotacion-espera { opacity: 0 !important; pointer-events: none !important; }
.elemento.elemento--rotacion-espera { opacity: 0 !important; visibility: hidden !important; }
```
Esto garantiza que los elementos ocultos por rotación sean invisibles INCLUSO si `visibility: hidden` falla por alguna razón.

---

## 6. Contenido por sede

### POSADAS — Rectorado y sede central
| Tipo | Cantidad | UA | Nota |
|---|---|---|---|
| UA narrador | 3 | FHyCS, FCEQyN, FCE | FHyCS + FCEQyN tienen foto edificio |
| Testimonios UA | 4 | González/FHyCS, Muguerza/FHyCS, Rambo/FCEQyN, Rofé/FCE | |
| Autoridades UNaM | 5 | Franco, Catogui, Guidek, Matot, (Spasiuk) | K=2: max 2 visibles |
| Conceptuales | 2 | — | territorio, coproducción |
| Videos | 6 | — | Bulloni, Kostlin, Gohringer + 3 institucionales |

### OBERÁ — Regional Oberá
| Tipo | Cantidad | UA | Nota |
|---|---|---|---|
| UA narrador | 2 | FAyD, FI | FI tiene foto campus (aéreo) |
| Testimonios UA | 3 | Cazabone/FAyD, Representante FAyD, Bárbaro/FI | |
| Autoridades UNaM | 5 | (compartidas con Posadas: Franco, Catogui, Guidek, Matot, Spasiuk) | |
| Conceptuales | 2 | — | territorio, quienes sostienen |
| Videos | 2 | — | FAyD institucional, FI institucional |

### ELDORADO — Regional Eldorado
| Tipo | Cantidad | Nota |
|---|---|---|
| UA narrador | 0 | Placeholder "El relato de Eldorado continúa" |
| Testimonios UA | 2 | Lucas de Lima (EAE), Silvina Berger (FCF) |
| Autoridades UNaM | 5 | Franco, Catogui, Guidek, Matot, Spasiuk |
| Conceptuales | 0 | |
| Videos | 0 | |

---

## 7. Figuras institucionales documentadas

| Nombre | Cargo | Institución | Foto |
|---|---|---|---|
| Mauricio Franco | Secretario General de Extensión | UNaM | ✅ |
| Ing. Sergio Edgardo Catogui (Katogui) | Vicerrector | UNaM | ✅ |
| Mgter. Roberto Guidek (Guidec) | Secretario General de Posgrado | UNaM | ✅ |
| Martín Matot | Responsable del Área de Graduados | UNaM | — |
| Mg. Gisela Spasiuk | Secretaria General Académica | UNaM | ✅ |
| Nélida González | Secretaria de Extensión | FHyCS | — |
| Eva Muguerza | Secretaria de Extensión y Vinculación | FHyCS | — |
| Alice Rambo | Secretaria de Extensión | FCEQyN | ✅ |
| Mariano Rofé | Secretario de Extensión | FCE | ✅ |
| Ariana Cazabone | Decana | FAyD (Oberá) | — |
| Marco Paolo Bárbaro | — | FI (Oberá) | — |
| Lucas de Lima | Secretario de Extensión | EAE (Eldorado) | — |
| Silvina Berger | Secretaria de Vinculación Tecnológica | FCF (Eldorado) | — |
| Guillermo Küppers | — | — | ✅ |

**Incertidumbres no resueltas:**
- Apellido "Guidek" vs "Guidec" en el corpus (se usa Guidek por coherencia)
- Silvina Berger: su cargo varía entre autopresentación e información institucional

---

## 8. Imágenes de edificios UA (portadas en tarjetas narradoras)

| UA | Archivo | Estado |
|---|---|---|
| FHyCS | `assets/ua/fhycs.jpg` | ✅ Integrado en r-fhycs-ua |
| FCEQyN | `assets/ua/fceqyn.jpg` | ✅ Integrado en r-fceqyn-ua |
| FI | `assets/ua/fi.jpg` | ✅ Integrado en r-fi-ua |
| FCF | `assets/ua/fcf.jpg` | ✅ Disponible, sin registro UA aún |
| FAyD | — | ⏳ Pendiente imagen |
| FCE | — | ⏳ Pendiente imagen |
| EAE | — | ⏳ Sin registro UA |

Para agregar imagen a FAyD: copiar `fayd.jpg` a `assets/ua/`, agregar `"imagenPortada": "assets/ua/fayd.jpg"` al registro `r-fayd-ua` en `registros.json`.

---

## 9. Bugs resueltos en esta conversación

| Bug | Descripción | Solución |
|---|---|---|
| C-01 | Foto circular + monograma simultáneos en desktop | DOM exclusivo: desktop crea solo `<img>`, mobile solo monograma |
| C-02/03 | Cards en feed vertical, sin composición | Algoritmo de zonas editoriales 2×5 con peso narrativo |
| L-01 | Zonas destruidas por separarPar | early-return en mobile: zonas → 2 iters → return (nunca corre desktop algo) |
| L-02 | Narrators en misma fila se solapan (24px garantizado) | filasNarrador exclusivas: cada narrator en fila propia [0,2,4] |
| L-03 | 213px > 188px de zona → overlap matemático | Reducir max-width a 165px (44vw) para caber en columna |
| R-01 | Barra de sedes desaparece en desktop | `.ruta { display:none }` estaba fuera de MQ; movido dentro |
| R-02 | Flash de todos los elementos al cambiar sede | Rotacion.iniciar() ANTES de Secuenciador.entrar() + delay=0 mobile |
| R-03 | Monograma color aleatorio (no UA) | `colorMonograma = colorDeUnidadAcademica(resolverUA(institucion))` |
| R-04 | UA testimonios no matcheaban con UA registros | `resolverUA("Facultad de Arte y Diseño (FAyD)")` → "fayd" |
| R-05 | `.ruta-nodo-nombre` truncada/invisible | Reemplazar con `#ruta-m` generado por JS sin herencia CSS |
| R-06 | Hamburguesa invisible en chip | `.menu-inst-btn--en-chip .menu-inst-linea { background: var(--unam-negro) }` |
| R-07 | `:has()` no soportado en browsers mobile | Reemplazar con clase `.tiene-portada` vía JS |

---

## 10. Pendientes documentados

### Contenido faltante
- **Eldorado completo:** FCF y EAE no tienen registros UA todavía. Solo el placeholder "El relato de Eldorado continúa". Cuando se incorporen: agregar registros tipo `experiencia_ua` con los proyectos de extensión.
- **Imágenes edificios:** FAyD (Oberá), FCE (Posadas) — cuando el usuario las proporcione, copiar a `assets/ua/` y agregar `imagenPortada` al registro correspondiente.
- **Cajero institucional:** Varios campos `cajero-por-completar` en `index.html` aún pendientes de completar con información oficial de UNaM.

### Mejoras técnicas pendientes
- El sistema de rotación en mobile todavía puede mostrar más de `calcularCapacidad()` elementos durante los ~200ms posteriores a un cambio de sede (ventana de detener/configurar). Es técnicamente mitigado pero no eliminado.
- Optimización de performance: `backdrop-filter: none` en mobile ya implementado. Imágenes UA podrían reducirse más o usar srcset.
- Verificar comportamiento en iOS Safari (especialmente scroll-snap y bottom sheets con `env(safe-area-inset-bottom)`).

---

## 11. Principios de arquitectura (para cualquier futura modificación)

1. **Sin frameworks.** Vanilla JS/CSS. Sin NPM. Sin build step. Todo funciona abriendo `index.html` localmente con Python server.

2. **Sin auto-publicación.** El sistema de extracción de contenido (BDE-UNaM, que es un proyecto hermano) nunca publica sin revisión humana. Toda incorporación a este compendio es curatorial.

3. **Desktop y mobile son el mismo DOM, diferente composición.** El mismo `app.js` crea los mismos elementos para ambos canales. `layout.js` tiene un early-return para mobile que usa el algoritmo de zonas. `mobile.css` adapta tamaños y oculta elementos desktop.

4. **El nombre canónico de UA se extrae, no se normaliza.** `resolverUA("Facultad de Arte y Diseño (FAyD)")` → `"fayd"`. Si la base de datos tiene nombres distintos, la función los unifica.

5. **La foto y el monograma son mutuamente excluyentes en el DOM.** Desktop con foto: solo `<img>`. Mobile o sin foto: solo `<div class="testimonio-monograma">`. El swap ocurre en `crearTarjetaTestimonio()`, no en CSS.

6. **La rotación editorial respeta la narrativa.** `data-permanente="true"` = siempre visible. K=2 = máximo 2 autoridades UNaM simultáneas. El Rotacion.iniciar() SIEMPRE corre ANTES de Secuenciador.entrar() para que los elementos excedentes sean marcados como `rotacion-espera` antes de que el stagger los revele.

---

## 12. Cómo continuar el desarrollo

### Para agregar una imagen de edificio UA
```bash
# 1. Optimizar imagen a 900px de ancho, calidad 82
# 2. Copiar a assets/ua/fayd.jpg
# 3. En registros.json, al registro r-fayd-ua agregar:
#    "imagenPortada": "assets/ua/fayd.jpg"
# 4. Deploy a Vercel
```

### Para agregar un testimonio nuevo
```javascript
// En testimonios.json agregar:
{
  "id": "t-nueva-persona-sede",
  "sede": "posadas",  // o "obera" / "eldorado"
  "nombreCompleto": "Nombre Apellido",
  "cargo": "Cargo institucional",
  "institucion": "Facultad de Arte y Diseño (FAyD)",  // con sigla en paréntesis
  "unidadAcademica": null,
  "foto": null,  // o "assets/personas/nombre.jpg"
  "citas": ["Fragmento 1...", "Fragmento 2..."],
  "x": 42, "y": 55,  // ancla en el mural (0-100)
  "rotacion": -2, "escala": 0.94,
  "permanente": false, "visible": true
}
```

### Para deployment
```bash
# Producción: push a GitHub → Vercel auto-deploy
# El ZIP en outputs/ es la versión para subir si no hay acceso a git
```
