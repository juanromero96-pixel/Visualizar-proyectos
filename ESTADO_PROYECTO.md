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

---

## 13. Lector editorial mobile — Fases F2–F4 (build v4.9)

> Continúa el roadmap del **Manual del Sistema Editorial Mobile v1.0** (§5 portadas/heroes · §6 invitaciones · §7 anatomía del Lector · §8 tokens · §11 implementación por componente · §12 roadmap F0–F5). F0 y F1 estaban confirmadas al inicio; esta iteración implementa F2, F3 y F4 completas, más la batería automatizable de F5. **Desktop permanece intocable.**

### 13.1 Qué se implementó

| Fase | Alcance | Manual |
|---|---|---|
| **F2** | Hero por tipo (portada UA 16:9 · foto de persona · miniatura de video · variante conceptual corta), velo inferior 40 %, fallback con monograma al 12 %, cabecera sticky que aparece al scrollear (badge + título 1 línea + ✕ 44 px siempre visible), grabber 36×4, drag-down de cierre (solo con scroll en tope y dirección vertical dominante), tipografía de lectura 1.02rem/1.6 máx 34em | §5, §7, §8 |
| **F3** | Índice de proyectos plegado (4 visibles + «Ver N restantes» que se retira al desplegar), galería con scroll-snap + puntos (componente listo; el corpus no trae galerías todavía), reproductor 16:9 `youtube-nocookie` **sin autoplay** con título y crédito debajo | §7, §11 |
| **F4** | Franja **«En esta constelación»**: chips 44 px con icono por tipo + etiqueta, deriva entre registros con cross-fade 180 ms **sin cerrar el Lector**, origen inmutable (P6). Incluye el audiovisual aunque esté en espera de rotación (P3); excluye autoridades UNaM descartadas por el sorteo | §7 |
| **F5** | Batería de consola `tools/validacion-lector.js` para dispositivo real (lo automatizable; la sesión con 5–8 lectores reales es dependencia humana externa) | §12 |

### 13.2 Arquitectura

- **Un solo motor, no dos.** El Lector editorial vive dentro de `js/lector.js`, en la rama que ya existía tras `esMobile()`. Reemplazó al canal provisional que reutilizaba el bottom sheet genérico con flechas ←/→. El modal desktop (`.lector-superposicion`, `abrirEnDesktop`, `construirContenido*`) queda **100 % intacto**.
- **Namespace `.lem-*`.** Todos los nodos del Lector se crean solo en la rama mobile de `lector.js`. Su CSS (bloque F2–F4 al final de `mobile.css`) **no lleva media query**: el guard es la creación en JS, exactamente el mismo criterio que `.bottom-sheet`. Esto lo hace inmune a cualquier anomalía de layout-viewport.
- **`el.__item` (app.js).** Al crear cada tarjeta, `app.js` guarda el item de datos completo como propiedad JS pura (`el.__item = item`). El Lector lee de ahí la portada, el cuerpo, los proyectos, la foto en resolución real y el `youtubeId`, sin depender del DOM recortado del mural. No es atributo, no lo consume ningún selector ni código desktop.

### 13.3 Verificación

| Prueba | Resultado |
|---|---|
| `node --check` en `lector.js`, `app.js`, `validacion-lector.js` | OK |
| Paridad clases JS↔CSS (40 clases `.lem-*` + estados) | Completa, sin faltantes |
| Smoke test jsdom (código real contra mural mínimo) | **33/33 PASS** — apertura, hero, topbar espejo, cuerpo, cita, índice plegado 4/2, constelación (incluye video en espera), deriva sin cerrar, nocookie sin autoplay, cierre con destello, scroll restaurado, aria, reanudar rotación, ciclo testimonio |
| No-regresión desktop (diff vs build anterior) | Solo 4 archivos tocados + 1 nuevo. `styles.css`, `layout.js`, `mobile.js`, los 3 JSON: **idénticos byte a byte**. Diff de `app.js` = build + `__item` + microcopy §6 (nada más) |
| Contraste sobre fondo `rgba(8,12,16,.98)` | Cuerpo papel 17.69:1, meta 9.69:1 (AA texto normal). Badges UA: idéntica situación institucional que el mural v4.4–v4.7 (paleta ratificada; el hero lleva `text-shadow`) |
| Render de evidencia | `tools/evidencia-lector-v4.9.png` — tres tipos de documento a 393 px con tokens §8 literales |

### 13.4 El gate de build (verificación en dispositivo)

Antes de auditar cualquier cosa en el teléfono:

1. Abrir la consola y confirmar el banner cian **`v4.9-2026-07-19-f2f4`**. **Sin banner = el navegador sirve caché**: detener toda auditoría y forzar recarga (los assets llevan `?v=4.9`; si persiste, redesplegar).
2. Con el banner correcto, pegar `tools/validacion-lector.js` → imprime la tabla PASS/FAIL del ciclo completo.
3. El snippet `tools/diagnostico-pipeline.js` sigue aplicando al mural (posición calculada vs renderizada, |Δ|≤1px).

### 13.5 Qué queda (fuera de código)

- **Sesión F5 con 5–8 lectores reales** (§12): dependencia humana externa. El script de verificación está listo; la observación de personas usando el Lector no.
- **Galerías**: el componente está implementado y probado, pero **ningún registro del corpus tiene el campo `galeria`**. Cuando se agregue a `registros.json`, el Lector las renderiza sin cambios de código (dato manda).

### 13.6 Principios que gobiernan esta capa

- **P2 — pleca, no relleno.** La identidad de la UA se marca con una pleca (4 px en badges/hero, 3 px en citas y chips) del color institucional, nunca tiñendo el fondo. Preserva legibilidad AA del texto sobre `#080c10`.
- **P3 — el audiovisual entra por rotación y por Lector.** Los satélites en espera de rotación integran la constelación del Lector aunque no estén visibles en el mural en ese instante.
- **P6 — el origen es inmutable.** Derivar entre registros nunca reescribe el punto de retorno: al cerrar, el foco y el destello vuelven a la tarjeta desde la que se abrió el Lector, y el scroll del mural se restaura al píxel.

---

## 14. Informe QA #1 → build v5.0 (bugs de dispositivo + unificación del hilo)

> Primera auditoría con evidencia de dispositivo real sobre v4.9 (gate en verde). Los cuatro bugs rojos y las cuatro mejoras del informe se resolvieron con causa raíz demostrada. **Un solo motor de Lector para ambos canales desde este build.**

### 14.1 Bugs → causa demostrada → intervención

| Bug (informe) | Causa raíz (evidencia) | Intervención |
|---|---|---|
| Solape de tarjetas en Oberá/Eldorado (6.853/9.648 px² medidos) | Tarjetas de `offH` 225–257 px contra zonas de ~100 px: el retrato (y su margen) aportaba 44–70 px y **cargaba después de `calcularCapacidad()`**, inflando la altura real sobre la medida. Simulación fiel del pipeline: reproduce el orden de magnitud del device con las alturas medidas (Eldorado 8.646 px² sim vs 9.648 real) | Tarjeta compacta (informe §4): retrato fuera del mural mobile (`.testimonio-foto` display:none — vive en el hero del Lector §5), cargo a 2 líneas máx. **Con alturas compactas la misma simulación da 0 px² / 0 pares en ambas sedes** |
| «Al visualizar un elemento el layout colapsa, tarjetas atascadas» | `iniciarInteraccionDeEnfoque` engancha `focusin/focusout`: en touch, el tap dispara `activar()`; al cerrar el Lector, el retorno de foco lo re-dispara sin `mouseleave` que limpie → escenario permanente en `--ua-alejado` (`opacity:.18 + pointer-events:none`, styles.css L923) | Early-return del sistema de enfoque en mobile (app.js) — es lenguaje hover de desktop. Además el Lector sanea clases residuales al abrir (lector.js) |
| Registros fotográficos faltantes (Eldorado) | Cero rutas rotas (audit completo). Causa real: **4 fotografías institucionales huérfanas** en `assets/photos/` sin referencia en el corpus (`eae-equipo`, `eae-estudiantes-presentacion`, `eae-semana-extension`, `fcf-aula-magna`) — la galería F3 existía, el campo `galeria` nunca se cargó | Campo `galeria` agregado a `r-eae-ua` (3 fotos) y `r-fcf-ua` (1), con alt neutrales derivados del archivo (fidelidad: nada inventado). El Lector las renderiza sin cambio de código |
| Pérdida del navegador de sedes | Boot jsdom de la cadena real: **el nav SÍ se crea** (estructura sana). La causa en device no está demostrada; hipótesis principal: `position:fixed; bottom:0` anclado al layout viewport bajo la barra del navegador | Blindaje doble en mobile.js: reintentos acotados + **fallback de creación** desde `.sede` (delega en `window.__carrusel`), y **corrección por VisualViewport** (no-op si no hay divergencia). El validador v5.0 imprime telemetría (`rect.bottom` vs `innerHeight` vs `vv.height`) para confirmar el mecanismo en el device |
| Repetición en la vista de video | v4.9 renderizaba miniatura en hero + player + título en cuerpo (dos marcos 16:9, título 2×) | **Fachada**: el hero ES el reproductor — miniatura + ▶ + chip de identidad UA (edificio 28 px); el tap reemplaza la miniatura por el iframe EN el mismo marco. Cuerpo: crédito + UA completa + resumen, sin marco ni título repetidos |

### 14.2 Unificación del hilo conductor (mejora §2 del informe)

`lector.js` reescrito como **canal único** (897→616 líneas): la anatomía editorial (hero → cuerpo → constelación con cross-fade) se presenta como bottom sheet en mobile y como diálogo centrado en escritorio (`.lem--escritorio`, sin media query — el guard es la clase que asigna JS). El modal desktop anterior (`.lector-superposicion` + flechas ←/→ por grupo UA) fue retirado; en escritorio las **flechas del teclado derivan por la misma constelación** que los chips. Los selectores `.lector-*` de `styles.css` quedan sin consumidor: **styles.css está congelado, se documenta y no se toca**. Los spans de invitación («Abrir expediente», «Leer fragmento»…) se retiraron de ambos canales — la tarjeta completa ya registraba click + Enter/Espacio; se añadió `aria-label` descriptivo por tipo.

### 14.3 Nota sobre autoplay

El principio del Manual prohíbe la reproducción **al abrir** el Lector. La fachada lo cumple estrictamente: antes del tap no existe iframe (ni sale una petición a YouTube). `autoplay=1` en el src post-tap es reproducción **iniciada por gesto** — el patrón estándar de fachada — y el validador lo verifica en ese orden (sin iframe al derivar → tap → iframe con nocookie+autoplay).

### 14.4 Verificación

Batería jsdom sobre el arranque completo real (index + 8 scripts + corpus): **28/28 PASS** en ambos canales — incluye fachada de punta a punta, galería EAE (3 fotos), saneamiento de enfoque, deriva por flechas en escritorio con datos reales y retorno al píxel. No-regresión: `styles.css`, `layout.js`, `carousel/animations/storage/intro.js`, `testimonios/multimedia.json` **idénticos byte a byte**. Evidencia visual: `tools/evidencia-informe1-v5.0.png` (mural compacto con las posiciones del pipeline simulado + fachada + escritorio). Gate en device: banner `v5.0-2026-07-21-informe1` + `tools/validacion-lector.js`.

### 14.5 Fuera de alcance de este build

Eldorado sigue **sin videos en el corpus** (0 en multimedia.json — faltante documental, no bug). La sesión F5 con lectores reales continúa pendiente (dependencia humana).

---

## 15 · Plan Maestro — Fase 0 (cerrada parcialmente) + Fase A en curso (build v5.1)

> Ejecución del Documento Técnico de Implementación (Plan Maestro). Metodología: evidencia antes de código en cada verificación; ninguna mejora se implementó sin localizar archivo/función/línea y analizar regresión.

### 15.1 Fase 0 — Verificaciones bloqueantes

| # | Resultado | Evidencia |
|---|---|---|
| **V-1** (color del cargo) | ✅ Resuelta — sin bug | Telemetría en dispositivo: `rgba(245,243,238,0.85)`, exactamente el papel esperado. El hallazgo de auditoría (cargo en color de UA) queda revertido — la cascada v5.0 ya aplicaba correctamente |
| **V-2** (nav de sedes) | ✅ Resuelta — mecanismo funciona | Tres ejes verificados en dispositivo: existencia (`display:flex`), geometría (`rect.bottom = innerH`, sin divergencia de viewport) y **pintado real** (`elementFromPoint` devuelve el propio botón del nav — nada lo cubre) |
| **V-3** (invasión del kicker en Eldorado desktop) | ⚪ **Sin evidencia de dispositivo** | Descartada la hipótesis de orden de pasadas (código verificado: `empujarFueraDeZonas` sí corre en escritorio, L349/L355). Instrumentado el check exacto (paso 1d del validador); **falta la corrida en escritorio con Eldorado activo** |

**M-03 permanece bloqueada** hasta que V-3 tenga evidencia real. No se implementó ninguna corrección especulativa.

### 15.2 Fase A — mejoras sin dependencia de V-3 (implementadas, build `v5.1-2026-07-22-faseA`)

**M-01 · Brújula con enunciación territorial.** `#ruta-m` gana una etiqueta persistente `01/03` (mismo lenguaje que `sede-kicker-num` en escritorio), dentro de la misma franja de 52px — no crece la zona reservada. Actualizada en ambas ramas de creación (normal y fallback) y en `actualizarNavMobile()`. Archivos: `js/mobile.js`, `css/mobile.css`.

**M-32 · Zona de respeto de cabecera.** Evidencia aritmética, no estimada: el chip institucional mobile mide top `32.4px` (`--modulo·1.2`) + alto `48px` (botón 38px + padding 5+5) = borde inferior real **80.4px** — el viejo `MARGEN_TOP=72` quedaba corto incluso sin `env(safe-area-inset-top)`, que en dispositivos con notch lo empeora. Nuevo valor: **92** (80.4 + ~12px de holgura, mismo criterio que el comentario original "60+12"). Sincronizado en las **tres** copias que deben moverse juntas: `js/layout.js` (reserva de zona), `js/app.js::calcularCapacidad()` (cálculo de `altUtil`), `tools/diagnostico-pipeline.js` (diagnóstico). Verificado con la simulación geométrica: solape sigue en **0px²** con tarjetas compactas.

**M-02 · Temperamento único del vidrio.** Causa raíz confirmada (no descartada como V-1): `--niebla` es un tinte de solo 10% de opacidad — la "claridad" de la tarjeta terminaba dependiendo de lo que hay detrás, no del material. Evidencia con matemática WCAG real: el velo diagonal de Oberá cae a opacidad `.2` en su punto más transparente → contraste tarjeta/texto calculado = **2.00:1** (bajo AA). Fix: nuevo token `--niebla-piso: rgba(8,12,16,.62)`, compuesto **debajo** de `--niebla` (que se conserva intacta encima, como brillo de vidrio) vía `background: linear-gradient(var(--niebla),var(--niebla)), var(--niebla-piso)`. Mismo cálculo tras el fix: **5.27:1** (AA superado con margen). Aplicado a los tres tipos que comparten `--niebla` (testimonio, registro-ua, video); `registro-conceptual` no lo necesitaba (ya tenía fondo sólido propio). Cambio de **solo** `background` — sin tocar dimensiones de caja: cero riesgo para el motor de layout (offsetWidth/Height intactos). Archivo: `css/styles.css` (bajo Protocolo de descongelamiento §7 del Plan Maestro — diff mínimo, un solo tipo de propiedad, sin tocar Monte Carlo).

### 15.3 Verificación

- `node --check` en los 4 archivos JS tocados: OK.
- Batería jsdom (arranque completo real, ambos canales): **30/30 PASS**.
- Simulación geométrica con `MARGEN_TOP=92`: solape 0px² sostenido (Oberá y Eldorado, tarjetas compactas).
- Validador de dispositivo extendido con 4 checks nuevos (2d, 2e, 2f + el 1c/1d de V-2/V-3) para que la próxima corrida en device confirme M-01/M-32/M-02 con telemetría real, no solo con jsdom.
- Render de evidencia `tools/evidencia-faseA-v5.1.png`: contraste antes/después con muestreo de píxel (163,165,168 → 81,85,88), brújula con posición, despeje de cabecera a escala real.

### 15.4 Estado de Fase A

**No cerrada.** M-01, M-32 y M-02 implementadas y verificadas. M-03 sigue dentro de esta fase y sigue bloqueada por V-3. La fase no se declara terminada hasta que las cuatro mejoras (M-01, M-02, M-03, M-32) estén implementadas y verificadas — tal como exige el Plan Maestro.
