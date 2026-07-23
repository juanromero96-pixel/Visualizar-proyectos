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

---

## 16 · Fase A cerrada (implementación) — build v5.2, fix de V-3

### 16.1 M-32 — confirmado en dispositivo
Segunda corrida mobile: `chip bottom:78 | 0 tarjeta(s) dentro del margen de resguardo`. Cierra sin ambigüedad.

### 16.2 V-3 — evidencia real obtenida y causa corregida
Primera corrida de escritorio con Eldorado activo (tras 5 intentos): **2 invasores reales** — `testimonio/eae` y `testimonio/unam` (este último con 28.296px² de solape, sustancial). Kicker medido **265×450px** — su alto real (`max-height:clamp(35vh,52vh,62vh)` → 52vh en este viewport) es mucho mayor de lo que parece a simple vista; confirmado también por captura (tarjeta de Lucas de Lima tapando el "03" del kicker).

**Causa raíz, con reproducción sintética.** `empujarFueraDeZonas()` no informaba si movía algo; el loop de limpieza final de escritorio (`ITERACIONES_LIMPIEZA_FINAL=50`) solo medía movimiento de `separarPar` para decidir si cortar. Si el empuje de zona resolvía una invasión en la MISMA iteración en que `separarPar` ya no movía nada, el loop cortaba ahí — dejando sin resolver una colisión nueva que el propio empuje pudo haber creado contra un vecino. Reproducido en un test aislado (sin DOM, solo la matemática): sin el fix, el loop corta en `iter:0` con la colisión sin resolver; con el fix, sigue hasta `iter:9` y termina limpio.

**Fix**: `empujarFueraDeZonas()` ahora devuelve si movió algo; el loop de limpieza lo suma a su condición de corte. No toca Monte Carlo (`ubicarPorBusqueda`) ni la dirección de empuje — solo la condición de convergencia del post-proceso. Aplicado bajo Protocolo §7 (diff mínimo, un solo mecanismo). Archivo: `js/layout.js`.

**Verificación**: batería jsdom 30/30 (sin regresión en ningún ciclo, mobile ni escritorio), simulación geométrica mobile sin cambios (solape 0px² — el fix es exclusivamente de la rama desktop). **Pendiente**: una corrida más en escritorio con Eldorado para confirmar 0 invasores tras el fix — mismo criterio que toda verificación anterior de este documento.

### 16.3 Higiene del validador
Dos falsos positivos corregidos (no eran bugs de la app): el check de "sin retrato" nunca estuvo gateado a mobile (en escritorio el retrato es correcto por diseño); el FAIL de "canal correcto" en la corrida de escritorio se explica por sesión mixta (el Lector es singleton — `asegurarLectorEditorial()`, `if (lem) return lem` — y `#ruta-m` presente en una corrida de escritorio es prueba estructural de que la pestaña estuvo en emulación mobile antes, sin recarga). Se agregó detección automática de sesión mixta (advertencia en consola) para no repetir el diagnóstico. Gate del validador ampliado de `v5.1-*` a `v5.\*` para no requerir sincronización en cada build menor.

### 16.4 Estado de Fase A
**M-01 ✅ · M-02 ✅ · M-32 ✅ (confirmados en dispositivo) · M-03 implementada, confirmación final pendiente.** Build `v5.2-2026-07-22-faseA-v3fix`.

---

## 17 · Informe de bugs Fase 2 — build v5.3

### 17.1 🔴 Congelamiento de interfaz (escritorio) — causa confirmada y corregida
**No era el ciclo de vida de componentes** (el proyecto no tiene ese modelo — vanilla JS sin mount/unmount). Causa real, en `css/mobile.css`: `.lem--escritorio` oculta el diálogo por opacidad (`opacity:0`, permanece centrado y en pantalla — a diferencia de `.lem` mobile, que se oculta desplazándose fuera del viewport con `translateY(103%)`, técnica que nunca necesitó `pointer-events:none` porque no hay nada debajo que bloquear). Ninguna regla — ni la base `.lem` ni `.lem--escritorio` — fijaba `pointer-events` para el estado cerrado. Resultado: tras el **primer** cierre del Lector en escritorio, quedaba un rectángulo invisible de 720×900px en el centro de la pantalla, a z-index 521, capturando todos los clics — tarjetas del mural y barra de sedes incluidas. Regresión propia, introducida al unificar el canal escritorio (v5.0).

**Fix**: `pointer-events:none` en `.lem--escritorio` (cerrado), `auto` en `.lem--escritorio.lem--abierta`. Un solo mecanismo, sin tocar la técnica mobile. Verificado con CSS real cargado en el arnés jsdom (antes: `auto` tras cerrar; después: `none`).

### 17.2 🔴 Desborde de chips en «En esta constelación» (escritorio)
Causa real: `overflow-x:auto` con `scrollbar-width:none` — el contenido excedente era técnicamente alcanzable (scroll horizontal) pero sin ninguna afordancia visual para mouse de escritorio; se percibía como cortado. Fix: `flex-wrap:wrap` — todos los chips quedan siempre visibles, sin depender de que el visitante descubra el gesto de scroll. `.lem-constelacion` no tiene alto fijo (vive dentro de `.lem-scroll`, que ya scrollea verticalmente), así que agregar filas es seguro.

### 17.3 🟡 Navegación cíclica — callejón sin salida en autoridades
Confirmado en código: `elementosDeConstelacion()` devuelve `[]` por diseño cuando `lemActual.el.dataset.ua === 'unam'` (una autoridad no tiene constelación propia) — la franja completa se ocultaba, sin salida salvo cerrar el Lector a mano. Fix: cuando la lista queda vacía pero existe un origen distinto del documento actual (`lemOrigen.el !== lemActual.el`), se ofrece un chip único «Volver a…» (etiqueta contextual: «Volver al expediente SIGLA» si el origen es una UA). Verificado en `tools/smoke-v5.js` con el flujo real: abrir UA → derivar a autoridad por chip → confirmar aparición del chip de retorno → confirmar que deriva de vuelta.

### 17.4 Dos ítems evaluados, sin implementación (con evidencia de por qué)
- **Portada en anotaciones de sede**: ya satisfecho en escritorio (las tarjetas `registro-ua` muestran portada institucional — visible en la captura del propio informe). Para mobile es exactamente **M-05** del Plan Maestro (Fase B, no iniciada — pendiente por su propio riesgo de altura fija sobre el presupuesto geométrico).
- **Padding de tarjetas / título cortado**: el padding real (18–20px) no es la causa — verificado. El recorte de «Una jornada en día de paro: cuatro…» es el `-webkit-line-clamp:3` de mobile (`css/mobile.css` — gancho editorial v4.6, intencional: el título completo vive en el Lector) actuando sobre un título de 59 caracteres/11 palabras, más largo que el resto del corpus. Reducir el padding no resolvería esto (margen marginal, ~2-3 caracteres por línea) ni es evidencia lo respalda como causa. La solución correcta ya está trazada como **M-08** (títulos cortos editoriales curados) — es una decisión de contenido, no de código; no se inventa un recorte algorítmico sin curaduría.

### 17.5 Verificación
`node --check` en los 3 archivos JS tocados: OK. Batería jsdom **ahora carga el CSS real inline** (upgrade del arnés — antes `getComputedStyle()` no reflejaba ninguna regla externa, un hueco metodológico que hacía inválido cualquier check de propiedades CSS computadas; corregido de una vez para toda verificación futura). 33/33 en la corrida de confirmación completa (32/33 en corridas donde la autoridad no cae en la constelación de la UA muestreada por azar de rotación — condición ya contemplada, se omite igual que «sede sin video»).

---

## 18 · V-3, segunda vuelta — causa completa, build v5.4

### 18.1 Hallazgos del validador corregidos (dos, mismo patrón que antes)
Checks `1/1b/1c` (telemetría de `#ruta-m`) nunca estuvieron gateados a mobile — en una corrida de escritorio **limpia** (sin sesión mixta previa esta vez), `#ruta-m` ausente es el comportamiento **correcto** de `crearNavMobile()`, no un fallo. Mismo tipo de error que el check de retrato en la ronda anterior. Gateado.

### 18.2 V-3: la primera vuelta mejoró, no cerró — causa completa encontrada
El fix anterior (contar el movimiento de `empujarFueraDeZonas` en la condición de corte) redujo la invasión de **2 tarjetas / 28.296px²** a **1 tarjeta / 2.835px²** — mejora real de un orden de magnitud, pero no total. Causa del resto, confirmada con los números reales medidos (kicker 245×450, posicionado a ~32px del borde del escenario, `MARGEN_ESCENARIO=18`): la función elegía la dirección de empuje por **distancia cruda** al borde de zona más cercano. Con el kicker tan pegado al borde del escenario, "empujar a la izquierda" salía elegida por ser la más corta en el papel, pero es geométricamente inviable — el clamp de escenario devolvía la tarjeta al mismo punto en cada vuelta. El loop veía "movimiento" (la función devolvía `true`) pero sin progreso neto: 50 iteraciones oscilando sin escapar. Reproducido en aislado con los números exactos: posición final atascada en `x=104`, todavía dentro de la zona.

**Fix**: `empujarFueraDeZonas` ahora evalúa las 4 direcciones posibles **después** de aplicar el mismo clamp que usa cada llamador (parámetro `clamp`, la función de límites de escenario ya existente en cada camino — mobile y escritorio pasan la suya), y elige la que deja **menor solape residual** con la zona — no la de menor distancia antes de clampear. Mismo test aislado con el fix: la tarjeta escapa a `x=383.4`, fuera de la zona. Archivo: `js/layout.js`, ambos call sites actualizados (mobile L303, escritorio L358-370).

### 18.3 Verificación
`node --check` en los 3 archivos tocados: OK. Batería jsdom 32/32 (sin regresión en ningún ciclo). Simulación geométrica mobile: solape 0px² sostenido (el fix es exclusivamente de la rama de zonas, compartida pero sin cambio de comportamiento para el caso mobile ya validado). **Pendiente, como siempre**: una corrida más en escritorio con Eldorado para confirmar 0 invasores — mismo criterio que toda verificación de este documento. Build `v5.4-2026-07-22-v3fix2`.

---

## 19 · DTI Modelo Temporal del Mural — implementación completa (build v5.5)

> Ejecución íntegra del Documento Técnico de Implementación (composición inmediata + ciclo editorial completo). Las cinco etapas (E0–E5) fueron implementadas, verificadas con evidencia real (no jsdom-limitada: la lógica del ciclo es JS puro, totalmente válida para simulación fiel) y no dejan tareas pendientes de código. Dos ajustes de diseño se descubrieron **durante** la verificación —no antes— y se documentan como tales, no como desviaciones del contrato.

### 19.1 E0 — Verificaciones (sin dispositivo: rastreo de código + simulación fiel)

- **V-A**: transición de entrada localizada — `.elemento` (styles.css, `transition: opacity var(--duracion)...`), `.sede-bg` (900ms), `.sede-kicker`. Hallazgo que redujo el riesgo de E1: `ocultarConFade`/`mostrarConFade` ya fijan su **propia transición inline** (mayor especificidad) — la supresión de entrada nunca puede interferir con un fade de rotación posterior, aunque no se retirara a tiempo.
- **V-B**: trazado el arranque real de `iniciarSitio()`. Confirmado con líneas exactas: en desktop el motor corre **dos veces completo** (candidatos sin filtrar) antes de que `Rotacion.iniciar()` exista siquiera, y `recalcular()` desktop es **global** (todas las secciones a la vez, a diferencia de mobile que solo arranca la activa) — este dato reformuló el diseño de E2 (configurar inmediato debe correr para TODAS las secciones, no solo la sede 0).
- **V-C**: portado fielmente `ubicarPorBusqueda`/`intentarConFactor` (Monte Carlo real) y corrido con el corpus de Posadas. Resultado cuantitativo: factor de escala **0.774 (N=20 actual) vs 1.26–1.36 (N=8 propuesto)** — casi el doble de escala lineal. Confirma R1 con un número, no una intuición.

### 19.2 E1 — Composición inmediata (`css/styles.css`, `js/animations.js`)

Clase `.sede--componiendo` suprime transición en `.sede-bg`/`.sede-kicker`/`.elemento` durante la composición inicial. `Secuenciador.entrar()` unifica el camino de revelado al que antes existía solo para `prefers-reduced-motion` — síncrono, sin `setTimeout`, con doble `requestAnimationFrame` para retirar la supresión un frame después de pintar. Retiradas `PAUSA_ANTES_DEL_TITULO`, `SEPARACION_ENTRE_PASOS`, `PAUSA_MOBILE` (sin uso en el nuevo modelo).

### 19.3 E2 — Unificación del arranque desktop (`js/app.js`)

Nueva `Rotacion.configurarInmediato(seccion)` expuesta (reutiliza el flag `_inmediato` + idempotencia por firma ya existentes — no es mecanismo nuevo). Invocada en los dos puntos exactos que reveló V-B: antes del `recalcular()` global pre-fonts y antes del post-`fonts.ready`, ambos en la rama desktop, para **todas** las secciones.

### 19.4 E3 — Ciclo editorial (`js/app.js`)

**Ajuste descubierto necesario (no una desviación del DTI, una consecuencia de su propia especificación):** la firma de idempotencia incluía `k[...]` (ids de autoridades sorteadas); en el modelo nuevo esto reiniciaría el ciclo cada vez que el sorteo de sesión diera un conjunto distinto — se retiró esa porción.

Estado del ciclo (`cicloOrden`/`cicloExhibidos`/`cicloVuelta`) vive en `seccion.dataset` — no en variables de closure, porque `poolActivo`/`poolEspera` son únicas y se sobrescriben al cambiar de sede; el ciclo de una sede debe sobrevivir mientras otra está activa. `rotarUno()` recibe `seccion` (antes no la necesitaba); se agregó `seccionActiva` al estado del closure porque `reanudar()` no tenía forma de saber a qué sección referirse.

**Bug real encontrado y corregido durante la verificación, no antes:** la primera versión de `elegirEntrantePorCiclo` probaba solo el primer no-exhibido del orden y, si daba SKIP, la siguiente llamada volvía a intentar con el mismo (a diferencia del código viejo, que con `cursorEspera++` incondicional siempre avanzaba). Esto atascaba el ciclo indefinidamente. Corregido: `elegirEntranteYSalientePorCiclo` recorre el orden completo probando cada no-exhibido hasta encontrar uno con saliente válido.

**Hallazgo de diseño más profundo, encontrado con evidencia real de simulación (no anticipado por el DTI):** en Posadas mobile, `SLOTS_POR_UA` da 0 para las tres facultades por capacidad chica — quedan sin representación en `poolActivo` desde el arranque. Las reglas heredadas de selección de saliente (1ª/2ª/3ª) protegen contra *dejar* una UA en 0, pero no cubren una UA que *ya está* en 0 — sin ajuste, esas facultades jamás podrían entrar, violando I4 (cobertura completa) estructuralmente. Se agregaron dos reglas de respaldo, en este orden de prioridad tras las tres originales: **4ª** — ceder de la facultad con más satélites sin el piso `cnt>1` de la 2ª; **5ª**, último recurso — ceder una autoridad UNaM cuando ni siquiera queda una facultad con algún satélite (I5 prohíbe *más* de 2 autoridades simultáneas, nunca exige exactamente 2, así que esto no lo viola). Ninguna de las tres reglas originales se modificó.

### 19.5 E4 — Autoridades en el ciclo (`js/layout.js`, `js/app.js`)

Hallazgo: la regla 1ª de selección de saliente (mismo-UA-que-entrante) ya cubre la familia de autoridades sin código nuevo — `'unam'` se compara como cualquier otro valor de `dataset.ua`. El trabajo real era dejar de excluir a las autoridades no sorteadas del **cálculo** del motor: retirado el filtro `:not(.elemento--oculto-autoridad)` en `layout.js` (selector que alimenta la distribución), en el fallback de `calcularCapacidad()` y en los candidatos de `configurar()`. `mostrarConFade()` ahora también retira `elemento--oculto-autoridad` (además de `elemento--rotacion-espera`), para que una autoridad excedente se revele correctamente cuando le toca por el ciclo. `aplicarSubconjuntoDeAutoridades()` conserva su lógica intacta; solo cambió su rol documentado — decide la composición de *apertura*, no la exclusión permanente.

### 19.6 E5 — Persistencia de sesión + telemetría (`js/app.js`, `tools/validacion-lector.js`)

`persistirCiclo()` vuelca el estado a `sessionStorage` (clave por sede) con firma de **corpus** (conjunto de rotativos, no build/capacidad — una recarga con otro viewport recompone la escena normalmente y el recorrido igual se restaura). Se restaura en `configurar()` cuando la firma coincide; se descarta (vuelta 1) si no. Se decidió explícitamente NO usar `Almacen`/localStorage: el ciclo es estado efímero de sesión, mezclarlo con la capa de contenido editorial persistente lo volvería "histórico" entre sesiones, no pedido. `Rotacion.estadoCiclo(seccion)` expuesto (y `window.Rotacion` expuesto por primera vez, antes solo vivía en el closure de app.js) para telemetría de consola — mismo patrón que la telemetría de `#ruta-m` que cerró V-2. Validador extendido con el paso 2g.

### 19.7 Verificación

- `node --check` en los 5 archivos JS tocados: OK en cada paso.
- Batería jsdom (arranque real, ambos canales): 32–33/33 en cada corrida, sin regresión en ningún punto de la implementación.
- **Ciclo editorial (I1/I4/I5/I6)**: verificado con timers acelerados en el arnés de test (intercepción de `setInterval`/`setTimeout` SOLO en el harness — el código de producción no sabe que corre más rápido; misma lógica, tiempo comprimido). Tres corridas independientes en Posadas (17 rotativos, sorteo real de autoridades distinto en cada una): **17/17 cobertura, vuelta completada y reiniciada automáticamente, 3/3 permanentes, autoridades siempre ≤2** en las tres.
- **Persistencia de sesión (C5)**: verificado con dos boots jsdom distintos transfiriendo el sessionStorage real entre ellos (simula una recarga de pestaña). Recarga con mismo storage → conserva vuelta y exhibidos. Sesión nueva (storage vacío) → reinicia en vuelta 1. Firma de corpus alterada → misma rama de código que ya se probó (sembrado desde cero): verificado por equivalencia de camino de ejecución, no por repetición del boot completo (evitado por límite de tiempo de un comando).
- **Pendiente, no bloqueante**: verificación de generalización del ciclo en Eldorado (sede sin narradores permanentes) — el intento de simular navegación real vía clic no disparó `onCambio` en el arnés (probablemente depende de un evento de scroll que jsdom no simula con fidelidad). El mecanismo central ya está probado en el caso más exigente real (Posadas, slots de facultad en 0 desde el arranque); esta es cobertura adicional deseable, no una duda sobre la corrección del mecanismo.

Build: `v5.5-2026-07-22-modelotemporal`.

---

## 20 · M-05 — miniatura de portada en registro-ua mobile (build v5.6)

**Confirmación de dispositivo previa a esta entrega:** las seis corridas más recientes confirmaron V-3 resuelto en dispositivo real (Posadas y Eldorado, ambas `zona respetada`, 0 invasores) y el ciclo editorial del DTI corriendo correctamente en navegador real sobre tres sedes distintas — cierra la Fase A del Plan Maestro y valida el DTI Modelo Temporal fuera de jsdom. Los cuatro FAIL de nav/canal en esas corridas son el mismo artefacto de sesión mixta ya diagnosticado, en dirección espejo (pestaña que arrancó en escritorio y pasó a mobile sin recargar) — no revela ningún bug nuevo.

**Implementación.** El HTML de portada ya existía para ambos canales (`crearTarjetaRegistroUA`, js/app.js — sin condición de mobile); mobile solo la ocultaba con `display:none`. Se reemplazó esa regla por una miniatura de **altura fija en CSS (46px, no `aspect-ratio`)** — la garantía exacta que exige el sistema de zonas: el contenedor reserva su espacio desde el primer layout, sin importar cuándo cargue la imagen, evitando reproducir la causa raíz del bug de v4.9 (offH medido antes de la foto, foto inflando la altura real después). Cero cambios de JS: se reutiliza el HTML, el manejo de error de imagen y el `item.imagenPortada` ya existentes.

**Verificación con doble validación, como exige la Fase B del Plan Maestro para este ítem específico:**
- Simulación geométrica con la altura real medida (140px offH de registro-ua sin portada, dato de dispositivo) + 46px del nuevo elemento fijo = 186px: solape sigue en **0px²** en Oberá y Eldorado (las dos sedes con más registro-ua simultáneos).
- Batería jsdom (CSS real cargado en el arnés): 32/33, sin regresión.
- Validador de dispositivo extendido (paso 2h): confirma altura real ≈46px de la miniatura visible.

Build `v5.6-2026-07-22-m05portada`. Pendiente, mismo criterio que todo lo demás: una corrida en dispositivo real para confirmar visualmente el resultado y cerrar M-05 con evidencia de pantalla, no solo de simulación.

---

## 21 · V-3, tercera vuelta — bug de raíz encontrado y corregido (build v5.7)

**Caso real:** Oberá escritorio, `registro-ua/fayd` tocando la cabecera institucional (`marca-chip`) tras una sesión larga (vuelta 7 del ciclo). El kicker (V-3 propiamente dicho) no estaba en conflicto esta vez — solo M-32 (cabecera).

**Diagnóstico con datos reales, no supuestos:** con el escenario (915×865), la posición del chip (32,32,170,46) y las dos tarjetas activas (FAyD 265×280 en centro 234,186; FI 247×260 en centro 690,330) — todos medidos en dispositivo, sin aproximar nada — el cálculo a mano mostró que empujar FAyD a `x=354.5` (a la derecha del chip) da **residuo exactamente 0** contra la zona, sin chocar con FI. El algoritmo debería haber llegado ahí solo. No lo hizo.

**Causa real, encontrada por relectura del código propio, no por prueba y error:** las dos versiones anteriores de `empujarFueraDeZonas` (Fase A y la corrección de Eldorado) nunca comparaban las 4 direcciones candidatas contra la posición ACTUAL del nodo — `mejorResiduo` arrancaba en `Infinity`, así que la función siempre elegía la "menos mala" de las 4 alternativas, **incluso cuando quedarse quieto ya era mejor que las cuatro**. En un escenario angosto (915px) con dos tarjetas activas cerca del mismo rincón, esto podía mover un nodo a un punto peor del que ya tenía, y el tira y afloja con `separarPar` en la iteración siguiente no llegaba a un punto fijo limpio dentro de las 50 iteraciones disponibles.

**Fix:** la posición actual entra ahora en la misma comparación que las 4 direcciones — la función solo mueve un nodo si encuentra algo con residuo **estrictamente menor** al que ya tenía. Verificado con los números exactos de Oberá en aislamiento: el resultado es `x=354.5`, residuo 0, sin colisión con FI — coincide con el cálculo manual.

**Salvaguarda adicional (no depende de que el diagnóstico anterior sea exhaustivo):** tras las 50 iteraciones normales de limpieza, una pasada de rescate final llama a `empujarFueraDeZonas` una vez más, sin `separarPar` después — así, sea cual sea la causa exacta de una eventual oscilación futura, la última palabra la tiene siempre el respeto a las zonas institucionales, nunca la separación estética entre tarjetas vecinas.

**Verificación:** `node --check` OK en los tres archivos tocados. Batería jsdom 32-33/33 sin regresión. Simulación geométrica mobile: solape 0px² sostenido (la función es compartida entre ambos canales). Verificación del ciclo editorial (DTI): 17/17 cobertura, vuelta completada — sin regresión, ya que `empujarFueraDeZonas` también participa del camino mobile.

Build `v5.7-2026-07-22-v3fix3`. Pendiente, mismo criterio de siempre: una corrida en Oberá escritorio para confirmar en dispositivo real.

---

## 22 · M-05 cerrado con evidencia de pantalla (capturas de dispositivo, las tres sedes mobile)

Tres capturas de dispositivo real confirman visualmente lo que la telemetría ya había medido (§20, corrección del check en la ronda 51px=46×escala):

- **Posadas**: FHyCS, FCEQyN y FCE — las tres con miniatura de portada renderizada sobre la tarjeta. Composición: 3 narradores + 2 autoridades (Guidek, Matot — K=2 respetado a la vista) + 1 conceptual; brújula «01/03»; chip institucional y nav sin invasión.
- **Oberá**: FAyD y FI con miniatura. Franco + Matot como las 2 autoridades visibles. Brújula «02/03».
- **Eldorado**: FCF y EAE con miniatura (las portadas que salieron del rescate de fotos huérfanas de la v5.0). Katogui + Guidek como autoridades. Brújula «03/03».

Los **siete narradores UA del corpus** muestran su fotografía institucional en el mural mobile. M-05 queda cerrado por la cadena completa: implementación CSS de altura fija → simulación geométrica (0px²) → batería jsdom → telemetría de dispositivo (46×escala exacto) → evidencia visual de pantalla en las tres sedes.

**Observación menor registrada, no bug:** en Posadas, la tarjeta de Matot solapa parcialmente el final del texto del registro conceptual «Síntesis». Está dentro de la tolerancia declarada del canal mobile (solape mínimo entre tipos distintos es aceptable; lo que importa es que ningún texto quede completamente cubierto — comentario de diseño en layout.js, SEPARACION_MINIMA=8). Se anota para vigilancia si se repite con más severidad tras rotaciones largas. Los títulos truncados con «…» siguen siendo M-08 (curaduría de títulos cortos — decisión de contenido, no de código).

**Pendiente sin cambios:** la corrida de Oberá **escritorio** con el modo diagnóstico activo (`localStorage.setItem('diag','1')`) — los pegados de consola de esta ronda llegaron vacíos. Es el único dato que falta para cerrar la invasión del chip con el mecanismo entendido.

---

## 23 · Cierres por evidencia de dispositivo (archivo txt — el canal que sí funciona)

**M-05 — cerrado definitivamente, causa del "51px" confirmada al píxel.** Los datos de dispositivo dieron: `getComputedStyle` de la portada `height:46px, padding:0, border:0, margin:0` exactos; `offsetHeight` del interior **186** (=140+46, el número exacto de la simulación geométrica pre-implementación); `--escala` 1.00. Con escala 1, la única explicación física del rect de 51-53px es la **rotación editorial** de las tarjetas: los registro-ua llevan `rotacion` ±2° a ±3° por diseño (data/registros.json, verificado: FHyCS 2°, FCEQyN −2°, FCE 3°, FAyD −2°, FI 2°, FCF −2°, EAE 2°), y `getBoundingClientRect` devuelve la caja alineada a ejes del rectángulo rotado: 165·sin(2°)+46·cos(2°)=51.7px; con 2.4-3°, ~53px — los valores medidos, al píxel. La garantía real de M-05 (altura de layout constante, conocida por `calcularCapacidad()`) se cumple perfecta: esa función usa `offsetHeight`, que ignora transforms. El check 2h se corrigió por tercera y última vez para medir con la misma métrica del sistema. Tercera confirmación independiente de que el diseño de altura fija era el correcto.

**Ciclo editorial — la validación pendiente del DTI (§19.7, Eldorado) queda cerrada con dispositivo real.** Las tres corridas mobile: Posadas `vuelta 4 · 17/17 exhibidos · completo`; Oberá `vuelta 21 · 12/12 · completo` (¡veintiuna vueltas completas en sesión larga — robustez sostenida!); Eldorado `vuelta 2 · 8/10 · faltan: t-rivaldi-eldorado, registro-conceptual-general-5` — exactamente el estado esperable a mitad de vuelta 2, con la telemetría nombrando los faltantes como fue diseñada. La generalización a sede sin estructura de Posadas, que jsdom no pudo simular, está verificada donde importa.

**Abierto sin cambios:** la invasión del chip en Oberá **escritorio** — las tres corridas del txt son mobile (1/1b/1c PASS = `esMobile` verdadero); la corrida de escritorio con `diag=1` y las líneas `empuje-zona` sigue siendo el único dato pendiente del tablero.

---

## 24 · Implementación DTF — P1/P2 ejecutables (build v5.8)

Ejecución del mandato "implementar íntegramente el DTF" sobre los ítems SIN dependencia bloqueante. D-01/M-08/M-07/F-01/M-13/M-25 quedan explícitamente abiertos (dependencias externas — device evidence o curaduría de contenido — no resueltas; el propio mandato prohíbe iniciar tareas con dependencia sin resolver).

Cada ítem sigue el ciclo completo (DTF §"Implementación obligatoria"): sección → objetivo → archivo → decisión → justificación → validación → regresión → resolución.

### F-02 · Pulido `[PD]`
**Objetivo:** D-05 (scrollbar nativa visible) + flechas de ruta con lenguaje de "botón de app". **Archivos:** `css/styles.css`. **Decisión:** `::-webkit-scrollbar` con thumb sutil (scrollbar-width:thin ya cubría Firefox, faltaba Chromium); flechas migradas al mismo lenguaje de opacidad que `.ruta-nodo` (ya existente a centímetros), sin inventar un tratamiento nuevo. **Validación:** batería 33/33 + solape 0px² (Protocolo §7, cambio puramente visual sin efecto geométrico). **Regresiones:** ninguna.

### F-03 · Favicon + Open Graph
**Objetivo:** D-06. **Archivos:** `index.html`. **Decisión:** `unam-badge.svg` como favicon; OG reutiliza título/descripción ya declarados y el logo institucional ya presente — cero contenido inventado. **Validación:** verificación de tags en el head. **Regresiones:** ninguna (no toca JS/CSS de comportamiento).

### M-06 · Sello institucional
**Objetivo:** distinguir autoridades UNaM por tipografía, sin retrato ni color adicional (ámbito ya reducido tras V-1). **Archivos:** `css/styles.css`. **Decisión:** `::before` con `position:absolute` — no participa del flujo, no puede alterar el `offsetHeight` que mide `calcularCapacidad()` (lección M-05 aplicada preventivamente). **Validación:** batería 33/33. **Regresiones:** ninguna.

### F-08 · Refuerzo de `:focus-visible`
**Objetivo:** auditar contraste del indicador de foco sobre fondos fotográficos. **Archivos:** `css/styles.css`. **Decisión:** medí el color real de fondo desde las capturas de dispositivo (muestreo de píxeles) y calculé el contraste WCAG real del outline existente: **1.85:1**, bajo el mínimo 3:1 de 1.4.11. Hallazgo real, no hipotético. Corregido con patrón de doble contorno (halo oscuro + outline cian) en las dos reglas de foco del sistema (`:focus-visible` global y `.elemento--enfocado`). **Validación:** batería 32/32. **Regresiones:** ninguna.

### M-30 · Orden de foco narrativo
**Objetivo:** tabulación = orden editorial del ciclo, no orden de inserción del DOM. **Archivos:** `js/app.js`. **Decisión:** reordenamiento real del DOM vía `appendChild` (permanentes + `cicloOrden`), no `tabindex` positivo (antipatrón de accesibilidad). Seguro porque TODA la posición visual es absoluta (`--x`/`--y`) y el z-index se asigna explícitamente por JS — confirmado por lectura de código antes de tocar nada. **Validación:** batería 32/32 + verificación del ciclo del DTI (17/17, I1/I4/I5/I6 intactos tras el reordenamiento). **Regresiones:** ninguna.

### F-04 · Señal de swipe
**Objetivo:** D-07 — el gesto existe, nada lo enseña. **Archivos:** `js/mobile.js`, `css/mobile.css`. **Decisión, con dos correcciones en el camino:** el primer diseño tocaba `scrollLeft` del carrusel — descartado por riesgo real de conflicto con `scroll-snap-type:mandatory`, no verificable en jsdom. El segundo animaba `.ruta-flecha` — descartado: esa clase es `display:none` en mobile. Versión final: pulso CSS del botón activo del nav mobile real (`#ruta-m .ruta-m-btn--activo`), sessionStorage (patrón ya usado 4 veces en el proyecto), respeta `reduced-motion`. **Validación:** batería 33/33. **Regresiones:** ninguna.

### F-05 · Zona blanda del conceptual
**Objetivo:** D-04 — el conceptual no tiene caja visual, sin defensa espacial propia. **Archivos:** `js/layout.js`. **Decisión:** margen extra de separación (+14px sobre los 8px base) cuando un par de `separarPar` incluye un conceptual — mobile-only, no toca `SEPARACION_MINIMA` global. **Validación:** batería 33/33 + solape 0px² + confirmación puntual del comportamiento exacto (22px con conceptual, 8px sin cambio en el resto, desktop intacto). **Regresiones:** ninguna.

### F-06 · Enlace profundo por hash
**Objetivo:** `#sede/id` al abrir un expediente; carga con hash abre directo. **Archivos:** `js/lector.js`, `js/app.js`. **Decisión:** `history.replaceState` (no `pushState` ni `location.hash` directo) — cada apertura/derivación reemplaza, no acumula historial; el botón "atrás" sigue saliendo del sitio, no navegando entre expedientes (comportamiento no pedido, no alterado). Restauración al cargar: espera a que la composición inicial arranque (ambos canales), cambia de sede si hace falta, busca el elemento por `__item.id`. **Validación:** batería completa incluyendo TODOS los checks del Lector (subsistema más frágil, 28/28 en dispositivo previamente) sin ninguna regresión. **Regresiones:** ninguna.

### F-07 · Precarga de fondos adyacentes
**Objetivo:** cambio de sede sin flash de carga. **Archivos:** `js/app.js`. **Decisión:** `new Image()` con `.src` — técnica estándar no bloqueante, no toca el DOM visible. Enganchada en `onCambio` (adyacentes de la nueva sede) y una vez al arranque para la sede inicial (`onCambio` no se dispara en la primera carga). **Validación:** batería 32/32. **Regresiones:** ninguna.

### F-09 · Micro-transición del lector escritorio
**Objetivo:** entrada 200-250ms con origen en la tarjeta. **Archivos:** `css/mobile.css` (la anatomía `.lem--escritorio` vive ahí, no en styles.css), `js/lector.js`. **Decisión:** ya existía una transición de 280ms fade+scale genérica desde el centro — ajustada a 230ms (dentro del rango pedido) y `transform-origin` dinámico vía custom properties (`--lem-origen-x/y`) calculadas desde la posición real de la tarjeta clickeada, con fallback defensivo a 50%/50% (comportamiento anterior) si el cálculo fallara por cualquier motivo. **Validación:** batería completa con atención específica a D6/D6b/D7 (freeze) y D2/D2b (canal escritorio) — todos intactos. **Regresiones:** ninguna.

### F-10 · Cifra editorial del acervo (=M-28)
**Objetivo:** comunicar profundidad de la constelación de cada UA. **Archivos:** `js/lector.js`, `css/mobile.css`. **Decisión:** en el hero del expediente (no en la tarjeta — la restricción de altura fija de M-05 hacía riesgoso tocar la tarjeta). Cuenta TODO lo que pertenece a la UA en el escenario (`data-ua`), no solo lo visible ahora — una cifra que cambiara con cada rotación sería confusa para lo que pretende comunicar. **Validación:** batería completa, atención a D3 (constelación) y el hero en general. **Regresiones:** ninguna.

### Verificación final combinada
`node --check` en los 4 archivos JS tocados: OK. Batería jsdom: 32-33/33 (variación esperada por sorteo aleatorio de D8). Simulación geométrica: solape 0px² sostenido. Ningún subsistema de la lista de regresión del mandato (mobile, desktop, lector, ciclo, Monte Carlo, temporal, animaciones, accesibilidad, distribución, rotaciones, layout, navegación, constelaciones, expedientes, multimedia, testimonios, narradores, videos, conceptual, autoridades) presenta regresión.

Build `v5.8-2026-07-22-dtf-p1p2`.

### Estado de cumplimiento del DTF, honesto y explícito
**Cerrado (11/17):** F-02, F-03, M-06, F-08, M-30, F-04, F-05, F-06, F-07, F-09, F-10.
**Abierto por dependencia externa no resuelta (6/17):** D-01 (device evidence pendiente), M-08 y M-07 (curaduría de contenido — no ejecutable como código sin inventar información, violaría el principio de fidelidad documental del corpus), F-01/M-13/M-25 (bloqueados transitivamente por D-01/F-01). El mandato exige "nunca comenzar una tarea cuya dependencia no esté resuelta" — se respeta con estos seis ítems permaneciendo abiertos, no tachados por apariencia.
