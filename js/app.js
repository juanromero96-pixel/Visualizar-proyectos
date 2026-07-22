// ── E0 (DTI §10): instrumentación de bajo costo, gated por flag ──────────────
// SCOPE: nivel de archivo — accesible desde iniciarSitio Y desde el módulo
// Rotacion (v4.4 lo definía dentro del IIFE async → ReferenceError en iniciar).
// Activación: URL con ?diag=1 o localStorage.setItem('diag','1').
// Registra en memoria las llamadas del ciclo de vida; __DIAG__.volcar() imprime.
const DIAG = (() => {
  let activo = false;
  try { activo = /[?&]diag=1/.test(location.search) || localStorage.getItem('diag') === '1'; } catch (e) {}
  const t0 = performance.now();
  const eventos = [];
  return {
    activo,
    log(tipo, detalle) { if (activo) eventos.push({ t: Math.round(performance.now() - t0), tipo, ...detalle }); },
    volcar() { console.table(eventos); return eventos; }
  };
})();
window.__DIAG__ = DIAG;

/**
 * app.js
 * -----------------------------------------------------------------------
 * Arma la escena pública a partir de los datos en /data. La posición de
 * cada elemento se resuelve en js/layout.js; la cita que muestra cada
 * tarjeta de testimonio se resuelve acá mismo, al entrar a la sede.
 */
(async function iniciarSitio() {
  // ── SELLO DE BUILD (FASE 1 de la auditoría de despliegue) ────────────────
  // Permite demostrar en cualquier dispositivo qué versión está corriendo:
  // abrir la consola y leer esta línea (o window.__BUILD__).
  // Si la consola NO muestra este sello, el navegador está sirviendo un
  // build anterior: la auditoría debe DETENERSE hasta redesplegar.
  window.__BUILD__ = 'v5.5-2026-07-22-modelotemporal';

  console.log('%cSemanaRegionalUNaM · build ' + window.__BUILD__,
    'background:#00a3e0;color:#0a0e10;padding:2px 8px;border-radius:3px;font-weight:bold');

  let sedes, testimonios, registros, multimedia, config;
  try {
    [sedes, testimonios, registros, multimedia, config] = await Promise.all([
      Almacen.cargar('sedes'),
      Almacen.cargar('testimonios'),
      Almacen.cargar('registros'),
      Almacen.cargar('multimedia'),
      Almacen.cargar('config'),
    ]);
  } catch (error) {
    mostrarErrorCarga(error);
    return;
  }

  const sedesVisibles = sedes.filter((s) => s.visible).sort((a, b) => a.orden - b.orden);

  pintarEncabezado(config);
  pintarSedes(sedesVisibles, testimonios, registros, multimedia);
  pintarRuta(sedesVisibles);

  const contenedor = document.getElementById('carrusel');
  const secciones = Array.from(contenedor.querySelectorAll('.sede'));

  // Motor único adaptativo (Arquitectura B):
  // Distribuidor.distribuir(s) atiende AMBAS plataformas dentro de layout.js:
  //   · mobile  → sistema de zonas editoriales (bloque con return temprano)
  //   · desktop → Monte Carlo (ubicarPorBusqueda)
  // La bifurcación vive DENTRO de distribuir(); desde aquí se llama igual
  // para las dos. No hay fork JS externo ni segundo motor.
  // E2 (DTI §6.2, defecto D2): recálculo SELECTIVO por sede.
  // Sin argumento (global): reservado a cambios reales de viewport y al
  // arranque desktop. Con sección: redistribuye únicamente esa sede — las
  // demás conservan composición y estado de espera intactos.
  const recalcular = (seccionObjetivo) => {
    DIAG.log('recalcular', { alcance: seccionObjetivo ? (seccionObjetivo.dataset.sede || 'sede') : 'global' });
    if (seccionObjetivo) { Distribuidor.distribuir(seccionObjetivo); return; }
    secciones.forEach((s) => Distribuidor.distribuir(s));
  };
  const sedeActivaActual = () =>
    secciones.find((s) => { const r = s.getBoundingClientRect(); return r.left >= -50 && r.left < 50; }) || secciones[0];

  // Antes de la primera distribución: se decide qué autoridades de alcance
  // UNaM se muestran en cada sede (nunca las cinco a la vez — ver
  // aplicarSubconjuntoDeAutoridades). Esto tiene que pasar ANTES de
  // recalcular() para que el motor de distribución ya calcule las
  // posiciones sabiendo cuáles van a estar realmente visibles, en vez de
  // reservarles a las autoridades descartadas un lugar que después queda
  // invisible.
  secciones.forEach((s) => aplicarSubconjuntoDeAutoridades(s, testimonios));
  // DTI Modelo Temporal §5.1 (E2): en desktop, recalcular() sin argumento
  // distribuye TODAS las secciones de una — para que Monte Carlo reciba
  // únicamente el conjunto final (I3: el motor calcula solo sobre lo que
  // se muestra) hay que configurar TODAS las sedes inmediato antes de esta
  // primera llamada global. Idempotente por firma: no hay doble trabajo
  // cuando Rotacion.iniciar() vuelva a tocar la sede 0 más abajo.
  if (!window.esMobile?.()) secciones.forEach((s) => Rotacion.configurarInmediato(s));
  // E2: en mobile el layout inicial correcto ocurre en fonts.ready
  // (iniciar → marcas → recalcular(sede0)); un global previo con el corpus
  // completo sería triple trabajo invisible. Desktop conserva el global.
  if (!window.esMobile?.()) recalcular();

  // Recién ahora se sortea la cita real de cada tarjeta — la medición de
  // arriba ya midió la más larga posible, así que esta nunca puede
  // necesitar más espacio del que se le asignó. Nada es visible todavía
  // (la secuencia de entrada no arrancó), así que el cambio de texto no
  // se ve: no hace falta la transición suave que sí usa refrescarCitas()
  // en los reingresos.
  secciones.forEach((s) => refrescarCitas(s, testimonios));

  // Si la tipografía web todavía no había cargado en el momento de medir
  // las tarjetas, las medidas usadas para distribuir no coinciden con el
  // tamaño real una vez que Roboto termina de cargar — se recalcula una
  // vez más cuando eso pasa, además de en cada cambio de tamaño de ventana.
  if (document.fonts?.ready) document.fonts.ready.then(() => {
    if (window.esMobile?.()) {
      // ── MOBILE — Rotacion ANTES de recalcular ANTES de Secuenciador ────────
      // 1. Rotacion.iniciar → configurar inmediato → poolEspera con --rotacion-espera
      // 2. recalcular → layout.js ve solo los 6 finales (filter :not(.rotacion-espera))
      // 3. (después, en el flujo síncrono) Secuenciador.entrar → revela 6 posicionados
      if (secciones[0]) { Rotacion.iniciar(secciones[0]); recalcular(secciones[0]); }
    } else {
      // ── DESKTOP — configuración inmediata también aquí (DTI §5.1/E2):
      // fonts.ready puede cambiar las medidas reales; se re-configura (la
      // firma cambia solo si cambió algo real — cap por medidas nuevas —
      // y de lo contrario rehidrata sin tocar clases) antes de este
      // segundo recalcular global, por la misma razón que el primero.
      secciones.forEach((s) => Rotacion.configurarInmediato(s));
      recalcular();
      if (secciones[0]) Rotacion.iniciar(secciones[0]);
    }
  });

  // H-05: en mobile, el browser dispara resize al mostrar/ocultar la barra de URL
  // al hacer scroll o tocar la pantalla (solo cambia la altura, ~50-80px).
  // Ese mini-resize re-barajaba el mural mientras el usuario lo leía, destruyendo
  // la memoria espacial. La guardia ignora cambios de altura < 120px en mobile
  // cuando el ancho no cambió — cubre la barra de URL y el teclado en pantalla
  // (Δh grande, >120px) sí dispara recalcular (es un cambio real de viewport).
  let pendienteResize = null;
  let _lastW = window.innerWidth, _lastH = window.innerHeight;
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    if (window.esMobile?.() && w === _lastW && Math.abs(h - _lastH) < 120) return;
    _lastW = w; _lastH = h;
    DIAG.log('resize', { dw: w - _lastW, dh: h - _lastH });
    clearTimeout(pendienteResize);
    pendienteResize = setTimeout(() => {
      if (window.esMobile?.()) {
        // E2: cambio REAL de viewport — la capacidad medida puede variar.
        // Reconfiguración ordenada: se invalidan las firmas, se reconfigura
        // la sede activa (marcas nuevas ANTES del layout) y luego el global
        // redistribuye; las sedes no visitadas se configuran en su visita.
        secciones.forEach((s) => { delete s.dataset.rotConfig; });
        const activa = sedeActivaActual();
        if (activa) Rotacion.iniciar(activa);
        recalcular();
      } else {
        recalcular();
      }
    }, 180);
  });

  // E4 (DTI §8): variante CHIP para videos cuando la sede tiene ≥3.
  // La clase es inerte en desktop (solo la estiliza mobile.css); la miniatura
  // completa permanece en el Lector.
  secciones.forEach((sec) => {
    const vids = sec.querySelectorAll('.elemento--video');
    if (vids.length >= 3) vids.forEach((v) => v.classList.add('elemento--video-chip'));
  });

  iniciarInteraccionDeEnfoque(secciones);
  Lector.iniciar();
  window.Mobile?.inicializar(); // solo configura bottom sheets, no toca el DOM del mural
  Secuenciador.iniciar();

  // v5.0: referencia global para el fallback de #ruta-m en mobile.js
  // (creación del nav aun si .ruta-nodo no llegara a poblarse). Inerte fuera de eso.
  const carrusel = window.__carrusel = new Carrusel({
    contenedor,
    secciones,
    onCambio: (indice, seccionNueva) => {
      actualizarRuta(indice);
      aplicarSubconjuntoDeAutoridades(seccionNueva, testimonios);
      // CRÍTICO: Rotacion ANTES de recalcular ANTES de Secuenciador.
      // En mobile, Rotacion.iniciar() ahora configura INMEDIATAMENTE:
      //   1. configura → marca 11 con --rotacion-espera (opacity:0 !important)
      //   2. recalcular → layout ve solo los 6, P1 optimiza para ellos
      //   3. Secuenciador.entrar → revela 6 en posiciones finales (11 invisibles)
      // El mural de la nueva sede aparece ya compuesto.
      DIAG.log('onCambio', { indice, sede: seccionNueva?.dataset?.sede });
      Rotacion.iniciar(seccionNueva);
      if (window.esMobile?.()) recalcular(seccionNueva);
      Secuenciador.entrar(seccionNueva);
      refrescarCitas(seccionNueva, testimonios);
    },
  });

  // Swipe horizontal entre sedes — solo en mobile.
  // Se inicializa DESPUÉS de crear el Carrusel porque necesita la instancia
  // para llamar a carrusel.siguiente() y carrusel.anterior().
  window.Mobile?.inicializarSwipe(contenedor, carrusel);

  document.querySelectorAll('.ruta-nodo').forEach((boton) => {
    boton.addEventListener('click', () => carrusel.ir(Number(boton.dataset.indice)));
  });
  document.querySelector('.ruta-flecha--anterior')?.addEventListener('click', () => carrusel.anterior());
  document.querySelector('.ruta-flecha--siguiente')?.addEventListener('click', () => carrusel.siguiente());

  actualizarRuta(0);
  if (secciones[0]) Secuenciador.entrar(secciones[0]);
})();

function mostrarErrorCarga(error) {
  console.error(error);
  const main = document.getElementById('carrusel');
  if (!main) return;
  main.innerHTML = `
    <div class="estado-error">
      <h1>No se pudo cargar el contenido</h1>
      <p>Revisá que el sitio se esté sirviendo con un servidor local (no abriendo el archivo directamente desde el disco). Ver README.md.</p>
    </div>`;
}

function pintarEncabezado(config) {
  // Actualiza el título de la pestaña del navegador y el texto del badge.
  //
  // NOTA CRÍTICA: NO actualizamos logo.src desde aquí.
  // El HTML ya establece src="assets/logos/unam-logo-oficial.png" y tiene
  // un onerror fallback al texto. Si sobreescribiéramos src desde JS usando
  // config.marca.logoPath, el logo se reemplazaría por el SVG badge
  // (que es lo que tenía logoPath hasta la corrección de config.json).
  // Cualquier futuro cambio de logo se hace únicamente en el HTML, no aquí.
  document.title = config.evento.nombre;
  const chip = document.querySelector('.marca-chip');
  if (chip) {
    const textoEl = chip.querySelector('.marca-chip-texto');
    if (textoEl) textoEl.textContent = config.marca.badge;
    // ← logo.src NO se toca desde JS
  }
}

function pintarSedes(sedesVisibles, testimonios, registros, multimedia) {
  const contenedor = document.getElementById('carrusel');
  contenedor.innerHTML = '';

  sedesVisibles.forEach((sede, indice) => {
    const seccion = document.createElement('section');
    seccion.className = `sede sede--${sede.composicion || 'convergente'}`;
    seccion.dataset.sede = sede.id;
    seccion.dataset.zonasProtegidas = JSON.stringify(sede.zonasProtegidas || []);
    seccion.id = `sede-${sede.id}`;
    seccion.setAttribute('role', 'group');
    seccion.setAttribute('aria-label', `Sede ${indice + 1} de ${sedesVisibles.length}: ${sede.nombre}`);

    const parrafos = String(sede.descripcion || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p class="sede-kicker-descripcion">${escaparHTML(p)}</p>`)
      .join('');

    seccion.innerHTML = `
      <div class="sede-bg" style="background-image:url('${sede.imagenFondo}')"></div>
      <div class="sede-velo"></div>
      <div class="sede-kicker">
        <span class="sede-kicker-num">${String(indice + 1).padStart(2, '0')} / ${String(sedesVisibles.length).padStart(2, '0')}</span>
        <h2 class="sede-kicker-titulo">${escaparHTML(sede.nombre)}</h2>
        <p class="sede-kicker-subtitulo">${escaparHTML(sede.subtitulo)}</p>
        ${parrafos}
        ${sede.orientacion ? `<p class="sede-kicker-orientacion">${escaparHTML(sede.orientacion)}</p>` : ''}
        <ul class="sede-kicker-unidades">
          ${sede.unidadesAcademicas.map((u) => `<li>${escaparHTML(u)}</li>`).join('')}
        </ul>
      </div>
      <div class="escenario"></div>
    `;

    contenedor.appendChild(seccion);

    const escenario = seccion.querySelector('.escenario');
    const items = [
      ...testimonios.filter((t) => t.sede === sede.id && t.visible).map((t) => ({ ...t, _tipo: 'testimonio' })),
      ...registros
        .filter((r) => r.sede === sede.id && r.visible)
        .map((r) => ({ ...r, _tipo: r.tipo === 'conceptual' ? 'registro-conceptual' : 'registro-ua' })),
      ...multimedia.filter((m) => m.sede === sede.id && m.visible).map((m) => ({ ...m, _tipo: m.tipo })),
    ].sort((a, b) => a.ordenNarrativo - b.ordenNarrativo);

    items.forEach((item) => escenario.appendChild(crearElemento(item)));

    // Si la sede no tiene registros de UA todavía, agregar un placeholder
    // editorial elegante que comunique que el compendio sigue en construcción
    // (punto 16 de la auditoría). Solo aplica a Eldorado actualmente.
    const tieneUA = items.some((i) => i._tipo === 'registro-ua');
    if (!tieneUA) {
      escenario.appendChild(crearPlaceholderEnConstruccion(sede));
    }
  });
}

/**
 * Cuando una sede aún no tiene registros de Unidad Académica incorporados
 * (actualmente Eldorado), se muestra un placeholder editorial elegante que
 * comunica el carácter vivo del compendio sin generar sensación de vacío.
 * El placeholder NO usa el sistema de layout.js — se posiciona mediante CSS
 * centrado en el escenario, fuera del flujo del motor de distribución.
 */
function crearPlaceholderEnConstruccion(sede) {
  const wrapper = document.createElement('div');
  wrapper.className = 'escenario-en-construccion';
  wrapper.setAttribute('aria-label', 'Contenido en incorporación');
  wrapper.innerHTML = `
    <div class="construccion-tarjeta">
      <div class="construccion-acento"></div>
      <p class="construccion-overline">Compendio en construcción</p>
      <h3 class="construccion-titulo">El relato de ${escaparHTML(sede.nombre)} continúa</h3>
      <p class="construccion-texto">
        ${sede.unidadesAcademicas.map(escaparHTML).join(' y ')} están incorporando
        sus registros al compendio. Los testimonios ya disponibles y los
        documentos completos de cada unidad académica se agregarán próximamente.
      </p>
      <p class="construccion-sub">Este archivo crece con cada nueva fuente verificada.</p>
    </div>
  `;
  return wrapper;
}

function crearElemento(item) {
  const el = document.createElement('article');
  el.className = `elemento elemento--${item._tipo} elemento--anim-${item.animacion || 'fade'}`;
  el.tabIndex = 0;
  el.dataset.orden = item.ordenNarrativo || 0;
  el.dataset.anclaX = item.x;
  el.dataset.anclaY = item.y;
  el.dataset.escala = item.escala ?? 1;
  el.dataset.rotacion = item.rotacion ?? 0;
  if (item._tipo === 'testimonio') el.dataset.testimonioId = item.id;

  // UA y tipo en dataset — necesarios para el sistema de constelaciones
  // (hover highlight por UA) y para el agrupador de la rotación editorial.
  //
  // Usar resolverUA() para todos los campos: maneja tanto siglas cortas ('FAyD')
  // como nombres completos ('Facultad de Arte y Diseño (FAyD)') extrayendo
  // la sigla del paréntesis. Esto hace que data-ua sea consistente entre:
  //   UA registros:  item.unidadAcademica = 'FAyD'      → 'fayd'
  //   Testimonios:   item.institucion = 'Fac. ... (FAyD)' → 'fayd'  ← CORRECTO
  // Sin este fix, el segundo caso producía 'facultaddearteydisenofayd', rompiendo
  // el matching de las constelaciones UA y el orden CSS.
  const uaTexto = item.unidadAcademica || item.institucion || 'general';
  const ua = resolverUA(uaTexto);
  el.dataset.ua   = ua;
  el.dataset.tipo = item._tipo;

  // F2–F4 (Manual §5/§7): el Lector editorial mobile necesita los datos
  // completos del item (portada, cuerpo, proyectos, foto en resolución
  // real, youtubeId) para construir hero y deriva sin depender del DOM
  // recortado del mural. Propiedad JS pura: no toca atributos, no la
  // consume ningún selector ni código desktop.
  el.__item = item;

  // NOTA FORENSE: aquí existía el sistema --ua-order (order de flex column
  // para los "capítulos UA" de la arquitectura mobile anterior). Fue eliminado:
  // la variable se escribía en cada tarjeta pero ningún CSS la consumía
  // (verificado por grep en css/, js/ e index.html) — código muerto puro.
  // El agrupamiento por UA hoy lo resuelve el motor de zonas de layout.js
  // (narradorFilas + filas adyacentes), no el orden del DOM.

  el.style.setProperty('--escala', item.escala ?? 1);
  el.style.setProperty('--rot', `${item.rotacion ?? 0}deg`);
  el.style.setProperty('--z', String(4 + Number(item.profundidad || 3)));
  el.style.setProperty('--opacidad-final', item.opacidadFinal ?? 1);
  el.style.setProperty('--duracion', `${item.duracion || 600}ms`);
  el.style.setProperty('--x', `${item.x}%`);
  el.style.setProperty('--y', `${item.y}%`);

  const interior = document.createElement('div');
  interior.className = 'elemento-interior';

  if (item._tipo === 'testimonio') {
    crearTarjetaTestimonio(item, interior);
    if (item.institucion === 'UNaM') el.classList.add('elemento--testimonio-institucional');
    // resolverUA() extrae la sigla corta del nombre completo de la institución:
    // "Facultad de Arte y Diseño (FAyD)" → "fayd" → color correcto de la UA.
    el.style.setProperty('--color-ua', colorDeUnidadAcademica(resolverUA(item.institucion || '')));
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-label', `Abrir testimonio de ${item.nombreCompleto || 'la persona'}`);
    el.addEventListener('click', () => Lector.abrir(el));
    el.addEventListener('keydown', (evento) => {
      // Enter/Espacio abren el lector ampliado — el resto de las teclas
      // (Tab, flechas del carrusel, etc.) siguen funcionando normalmente.
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        Lector.abrir(el);
      }
    });
  } else if (item._tipo === 'registro-ua') {
    crearTarjetaRegistroUA(item, interior);
    // Los registros de Unidad Académica son el centro narrativo del mural:
    // nunca rotan, nunca desaparecen — son el nodo permanente de cada
    // constelación documental (punto 5 del brief de rotación).
    el.dataset.permanente = 'true';
    el.style.setProperty('--color-ua', colorDeUnidadAcademica(item.unidadAcademica));
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-label', `Abrir expediente ${item.unidadAcademica || ''}: ${item.titulo || ''}`);
    el.addEventListener('click', () => Lector.abrir(el, item));
    el.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        Lector.abrir(el, item);
      }
    });
  } else if (item._tipo === 'registro-conceptual') {
    crearTarjetaRegistroConceptual(item, interior);
    el.style.setProperty('--color-ua', item.unidadAcademica ? colorDeUnidadAcademica(item.unidadAcademica) : 'var(--unam-cian)');
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-label', `Abrir registro: ${item.titulo || ''}`);
    el.addEventListener('click', () => Lector.abrir(el, item));
    el.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        Lector.abrir(el, item);
      }
    });
  } else if (item._tipo === 'foto') {
    interior.innerHTML = `
      <img src="${item.src}" alt="${escaparHTML(item.alt || '')}" loading="lazy">
      ${item.caption ? `<p class="elemento-caption">${escaparHTML(item.caption)}</p>` : ''}
    `;
    interior.querySelector('img').addEventListener('error', () => el.classList.add('elemento--sin-imagen'));
  } else if (item._tipo === 'video') {
    if (item.youtubeId) {
      // Vídeo de YouTube: se integra como registro documental del mural,
      // no como enlace externo. Miniatura oficial de YouTube + metadatos
      // + indicador de reproducción. Al hacer click abre el lector con
      // iframe embed — nunca redirige a YouTube.
      crearTarjetaYoutubeVideo(item, interior);
      el.classList.add('elemento--video');
      el.style.setProperty('--color-ua', colorDeUnidadAcademica(item.unidadAcademica));
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-expanded', 'false');
      el.setAttribute('aria-label', `Ver registro audiovisual: ${item.titulo || ''}`);
      el.addEventListener('click', () => Lector.abrir(el, item));
      el.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          Lector.abrir(el, item);
        }
      });
    } else if (item.src) {
      // Vídeo local (fallback — no hay archivos reales en este proyecto)
      interior.innerHTML = `
        <video poster="${item.poster || ''}" controls preload="none"><source src="${item.src}"></video>
        ${item.caption ? `<p class="elemento-caption">${escaparHTML(item.caption)}</p>` : ''}
      `;
      const video = interior.querySelector('video');
      video.addEventListener('error', () => el.classList.add('elemento--sin-imagen'), true);
      video.querySelector('source').addEventListener('error', () => el.classList.add('elemento--sin-imagen'));
    }
  }

  el.appendChild(interior);
  return el;
}

// Paleta para el monograma cuando no hay foto — elegida por hash del
// nombre, no al azar: la misma persona siempre tiene el mismo color.
const PALETA_MONOGRAMA = ['#00a3e0', '#3aaa35', '#7d4e24', '#4a463d'];

function crearTarjetaTestimonio(item, interior) {
  // El ancho se calcula según la cita MÁS LARGA disponible para esta
  // persona (no la que esté mostrándose en este momento): así el ancho
  // de la tarjeta queda fijo aunque después se sorteen citas más cortas,
  // y el layout no tiene que recalcularse cada vez que cambia el texto.
  const citas = Array.isArray(item.citas) && item.citas.length ? item.citas : [item.texto || ''];
  const largoMaximo = Math.max(...citas.map((c) => c.length));
  interior.style.setProperty('--ancho-testimonio', `${anchoSegunLargoDeCita(largoMaximo)}px`);

  const figura = document.createElement('figure');
  figura.className = 'testimonio-foto';

  const uaKey          = resolverUA(item.unidadAcademica || item.institucion || '');
  const colorMonograma = colorDeUnidadAcademica(uaKey) || '#00a3e0';
  const iniciales      = inicialesDe(item.nombreCompleto);

  if (item.foto) {
    // CON FOTO (desktop Y mobile): solo la imagen — el monograma nunca se
    // construye junto a ella (bug C-01 histórico). El fallback se inyecta
    // dinámicamente SOLO si la imagen falla. Sin riesgo de layout-shift:
    // el avatar tiene tamaño fijo por CSS (64px desktop, 34px mobile).
    const img = document.createElement('img');
    img.className = 'testimonio-foto-img';
    img.src = item.foto;
    img.alt = item.nombreCompleto;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      // Foto rota: reemplazar con monograma (DOM swap, no display:none)
      figura.innerHTML = `<div class="testimonio-monograma" style="--color-monograma:${colorMonograma}">${iniciales}</div>`;
    });
    figura.appendChild(img);
  } else {
    // SIN foto: monograma documental.
    // Nunca se construye la img → imposible que ambos coexistan.
    const mono = document.createElement('div');
    mono.className = 'testimonio-monograma';
    mono.style.setProperty('--color-monograma', colorMonograma);
    mono.textContent = iniciales;
    figura.appendChild(mono);
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'testimonio-cuerpo';
  cuerpo.innerHTML = `
    <p class="testimonio-nombre">${escaparHTML(item.nombreCompleto)}</p>
    <p class="testimonio-cargo">${escaparHTML(item.cargo)}</p>
    <p class="testimonio-institucion">${escaparHTML(item.institucion)}</p>
    <blockquote class="testimonio-cita">${escaparHTML(citas.reduce((mas, c) => (c.length > mas.length ? c : mas), ''))}</blockquote>
  `;
  // Arranca mostrando la cita MÁS LARGA disponible — no vacía, no la que
  // termine eligiéndose al azar — para que la primera medición de alto
  // (la que usa layout.js) ya sea la del peor caso posible. Antes el
  // recuadro de la cita se dejaba vacío hasta refrescarCitas(), así que
  // el motor de distribución medía una tarjeta de ~150px y le asignaba
  // ese espacio; cuando la cita real (de 250 a 500px según la persona)
  // aparecía después, la tarjeta crecía hacia vecinos para los que ya no
  // había lugar — esa era la superposición real. refrescarCitas() ya se
  // encarga de reemplazar este texto por la elección al azar real
  // inmediatamente después de medir, así que nunca llega a verse.

  interior.appendChild(figura);
  interior.appendChild(cuerpo);
}

/**
 * El ancho de la tarjeta crece con el largo de la cita más larga que
 * esa persona puede mostrar — antes el ancho era fijo (uno solo para
 * todas) y una cita larga se fragmentaba en muchísimas líneas, volviendo
 * la tarjeta angosta y altísima en vez de legible. Las bandas son
 * deliberadamente pocas (no un cálculo continuo) para que el resultado
 * se siga viendo como un puñado de tamaños pensados, no una regla de
 * tres aplicada a cada cita.
 */
function anchoSegunLargoDeCita(longitud) {
  if (longitud < 70) return 250;
  if (longitud < 140) return 290;
  if (longitud < 220) return 330;
  if (longitud < 320) return 370;
  return 410;
}

/**
 * Paleta de identificación por Unidad Académica (Documento Técnico,
 * sección 8.4): una barra de color en el borde izquierdo, derivada de
 * los tres colores institucionales del Manual de Identidad Visual
 * (cian, verde, marrón) — nunca un color ajeno a la paleta. El cian
 * queda reservado para las autoridades de alcance UNaM; el resto de
 * las unidades académicas usa variaciones de luminosidad de verde o
 * marrón, agrupadas por afinidad disciplinar donde fue razonable
 * (ciencias exactas y forestales del lado del cian/marrón oscurecidos,
 * artes y diseño del lado del verde aclarado).
 */
const PALETA_UNIDAD_ACADEMICA = {
  unam: '#00a3e0',
  fhycs: '#3aaa35',
  fayd: '#6fd16a',
  fce: '#7d4e24',
  fi: '#c47a39',
  fcf: '#462b14',
  fceqyn: '#006084',
  escuelaagrotecnicaeldorado: '#d59f6f',
  eae: '#d59f6f',  // alias de sigla para Escuela Agrotécnica Eldorado
};

function colorDeUnidadAcademica(textoLibre = '') {
  // Las instituciones largas vienen como "Nombre completo (SIGLA)" — se usa
  // la sigla entre paréntesis cuando existe, y el texto completo cuando no
  // (los casos "UNaM" y "Escuela Agrotécnica Eldorado", que ya son cortos).
  // Coincidencia EXACTA tras normalizar, no por substring: "FCE" por
  // substring calzaría también dentro de "FCEQyN" y los confundiría.
  const conParentesis = textoLibre.match(/\(([^)]+)\)/);
  const clave = normalizarClave(conParentesis ? conParentesis[1] : textoLibre);
  return PALETA_UNIDAD_ACADEMICA[clave] || 'var(--unam-cian)';
}

/**
 * Registro Institucional de Unidad Académica (Documento Técnico, tipo B).
 * No representa una persona: representa la experiencia de una facultad,
 * escuela o dependencia. Por eso no lleva fotografía — la ausencia de
 * retrato es en sí misma la marca que distingue este tipo del testimonio
 * (sección 8.3). En el mural solo se ve título + resumen recortado; el
 * cuerpo completo, los proyectos y la cita de respaldo aparecen recién
 * al expandir en el lector (Lector.abrir, definido en lector.js).
 */
function crearTarjetaRegistroUA(item, interior) {
  interior.style.setProperty('--ancho-registro', '290px');

  const portadaHTML = item.imagenPortada ? `
    <div class="registro-ua-portada" aria-hidden="true">
      <img src="${escaparHTML(item.imagenPortada)}"
           alt="${escaparHTML(item.unidadAcademica || '')} — sede"
           loading="lazy">
    </div>` : '';

  // Agregar clase 'tiene-portada' al interior cuando hay imagen:
  // evita el uso de :has() que no tiene soporte universal en browsers mobile.
  if (item.imagenPortada) {
    interior.classList.add('tiene-portada');
  }

  interior.innerHTML = `
    ${portadaHTML}
    <div class="registro-ua-cuerpo">
      <span class="registro-ua-badge">${escaparHTML(item.unidadAcademica || '')}</span>
      <h3 class="registro-titulo">${escaparHTML(item.titulo)}</h3>
      <p class="registro-resumen">${escaparHTML(item.resumen)}</p>
    </div>
  `;

  if (item.imagenPortada) {
    interior.querySelector('.registro-ua-portada img')
            .addEventListener('error', (e) => {
              e.target.closest('.registro-ua-portada').style.display = 'none';
              interior.classList.remove('tiene-portada');
            });
  }
}

/**
 * Registro Conceptual (Documento Técnico, tipo C). No representa una
 * persona ni una institución: representa una idea derivada del análisis
 * de la documentación de la sede. Tratamiento visual más liviano que el
 * resto (Nivel 3 de prioridad narrativa, sección 9 del prompt de
 * implementación) — tarjeta más chica, sin badge de unidad académica
 * cuando el concepto es transversal a toda la sede.
 */
function crearTarjetaRegistroConceptual(item, interior) {
  interior.style.setProperty('--ancho-registro', '220px');
  const etiqueta = item.unidadAcademica
    ? escaparHTML(item.unidadAcademica)
    : `Síntesis · ${escaparHTML(item.sede.charAt(0).toUpperCase() + item.sede.slice(1))}`;
  interior.innerHTML = `
    <span class="registro-conceptual-badge">${etiqueta}</span>
    <h3 class="registro-conceptual-titulo">${escaparHTML(item.titulo)}</h3>
    <p class="registro-conceptual-resumen">${escaparHTML(item.resumen)}</p>
  `;
}

/**
 * Tarjeta de video YouTube — se integra al mural como una anotación
 * documental más, no como un elemento multimedia separado.
 *
 * Estructura: miniatura (16:9, con play overlay) + metadatos
 * (badge UA, título, descripción truncada, indicador "▶ Ver video →").
 * La miniatura se carga desde la CDN pública de YouTube (mqdefault = 320×180).
 * Al hacer click abre el lector con iframe embed, nunca redirige.
 */
function crearTarjetaYoutubeVideo(item, interior) {
  const thumbUrl = `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg`;
  const esTesti = item.subtipo === 'testimonio_audiovisual';
  const tipoLabel = esTesti ? 'Testimonio audiovisual' : 'Video institucional';
  const autorLabel = item.autor ? ` · ${escaparHTML(item.autor)}` : '';

  interior.innerHTML = `
    <div class="video-miniatura-envoltorio" aria-hidden="true">
      <img class="video-miniatura" src="${thumbUrl}" alt=""
           loading="lazy" width="320" height="180">
      <div class="video-overlay">
        <span class="video-play-btn" aria-hidden="true">▶</span>
      </div>
    </div>
    <div class="video-meta">
      <span class="video-badge">${escaparHTML(item.unidadAcademica || '')}${autorLabel}</span>
      <h3 class="video-titulo">${escaparHTML(item.titulo)}</h3>
      <p class="video-resumen">${escaparHTML(item.resumen)}</p>
    </div>
  `;

  // Ocultar la tarjeta entera si la miniatura no carga (YouTube CDN
  // podría no estar disponible, o el ID podría no existir todavía).
  interior.querySelector('.video-miniatura').addEventListener('error', () => {
    interior.closest('.elemento')?.classList.add('elemento--sin-imagen');
  });
}

/**
 * Cuántas autoridades de alcance UNaM se muestran a la vez, de las 5
 * disponibles (Franco, Catogui, Spasiuk, Guidec, Matot) — nunca todas
 * juntas, para que no dominen el mural por sobre las experiencias de
 * las Unidades Académicas, que son el eje narrativo principal.
 */
const AUTORIDADES_VISIBLES_A_LA_VEZ = 2;

/**
 * Sortea qué testimonios de alcance UNaM ("autoridades generales",
 * marcadas con `.elemento--testimonio-institucional`) se muestran en una
 * sede, y oculta al resto — nunca las cinco a la vez. Se llama al cargar
 * el sitio y en cada reingreso a una sede, así que el conjunto visible
 * cambia entre sesiones, entre cambios de sede y al actualizar la
 * página, tal como se pidió ("el mural deberá sentirse vivo, no
 * repetitivo, no predecible").
 *
 * El conjunto elegido se guarda en sessionStorage por sede, para evitar
 * repetir EXACTAMENTE la misma combinación dos veces seguidas en la
 * misma sesión — el mismo patrón que ya usa elegirCita() para las citas
 * individuales, aplicado acá a qué tarjetas aparecen, no a qué dicen.
 *
 * DTI Modelo Temporal §5.4 (E4): esta función decide ÚNICAMENTE la
 * composición de APERTURA (qué dos autoridades arrancan visibles al entrar
 * a la sede) — ya no decide exclusión permanente del universo rotativo.
 * Las no elegidas quedan marcadas `elemento--oculto-autoridad` (mismo
 * mecanismo visual de siempre, opacity:0 !important) pero SÍ participan del
 * cálculo del motor y del ciclo de rotación como cualquier testimonio en
 * espera: cuando les toca entrar por el orden congelado, mostrarConFade()
 * retira ambas clases (--rotacion-espera y --oculto-autoridad) a la vez.
 * Antes se excluían del cálculo de layout.js por completo; eso hacía
 * imposible que alguna vez aparecieran si el sorteo de sesión no las elegía.
 */
function aplicarSubconjuntoDeAutoridades(seccion, testimonios) {
  const candidatos = Array.from(seccion.querySelectorAll('.elemento--testimonio-institucional'));
  if (candidatos.length <= AUTORIDADES_VISIBLES_A_LA_VEZ) return; // nada que rotar

  const clave = `unam_semana_regional_autoridades_${seccion.dataset.sede}`;
  const ids = candidatos.map((el) => el.dataset.testimonioId);
  const ultimoConjunto = leerJSONSeguro(sessionStorage.getItem(clave)) || [];

  let elegidos;
  let intentos = 0;
  do {
    elegidos = mezclarFisherYates([...ids]).slice(0, AUTORIDADES_VISIBLES_A_LA_VEZ);
    intentos++;
  } while (mismoConjunto(elegidos, ultimoConjunto) && intentos < 8 && ids.length > AUTORIDADES_VISIBLES_A_LA_VEZ);

  sessionStorage.setItem(clave, JSON.stringify(elegidos));

  let huboCambios = false;
  candidatos.forEach((el) => {
    const debeMostrarse = elegidos.includes(el.dataset.testimonioId);
    const estabaOculto = el.classList.contains('elemento--oculto-autoridad');
    el.classList.toggle('elemento--oculto-autoridad', !debeMostrarse);
    el.setAttribute('aria-hidden', debeMostrarse ? 'false' : 'true');
    el.tabIndex = debeMostrarse ? 0 : -1;
    // Si estaba oculto y ahora se decide mostrarlo en una sede que YA se
    // había revelado antes, el Secuenciador no va a tocarlo (solo revela
    // una vez) — hay que encargarse acá mismo de que aparezca.
    if (debeMostrarse && estabaOculto) el.classList.add('elemento--visible');
    if (debeMostrarse === estabaOculto) huboCambios = true;
  });

  // Recalcular solo si el conjunto visible cambió y la sede ya fue distribuida
  // al menos una vez (la primera vez se delega al recalcular() de iniciarSitio).
  // H-03: la guardia esMobile que aquí existía fue eliminada. Era un vestigio
  // de la arquitectura anterior (capítulos CSS verticales), que ya no existe.
  // Hoy layout.js posiciona los elementos en mobile exactamente igual que en
  // desktop: con --x/--y en px. Sin la guardia, las autoridades que cambian
  // en cada visita a la sede reciben posición real y no quedan con las
  // coordenadas porcentuales del JSON (pensadas para desktop).
  if (huboCambios && seccion.dataset.yaDistribuidoUnaVez === 'true') {
    Distribuidor.distribuir(seccion);
  }
  seccion.dataset.yaDistribuidoUnaVez = 'true';
}

function mezclarFisherYates(arreglo) {
  for (let i = arreglo.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arreglo[i], arreglo[j]] = [arreglo[j], arreglo[i]];
  }
  return arreglo;
}

function mismoConjunto(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

function leerJSONSeguro(texto) {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/**
 * Elige qué cita mostrar para una persona. Si tiene una sola, siempre es
 * esa. Si tiene varias, elige al azar evitando repetir la que se mostró
 * la última vez PARA ESA PERSONA (no por tarjeta: una autoridad general
 * que aparece en las tres sedes comparte el mismo "último mostrado", así
 * que entrar a una sede distinta tiene más chances de traer una cita
 * distinta). Se guarda en sessionStorage: dura la sesión, no la cita
 * elegida en sí, sino cuál fue la última — al cerrar la pestaña se pierde
 * y la siguiente sesión vuelve a elegir libremente.
 */
function elegirCita(item) {
  const citas = Array.isArray(item.citas) && item.citas.length ? item.citas : [item.texto || ''];
  if (citas.length <= 1) return citas[0];

  const clave = `unam_semana_regional_ultima_cita_${normalizarClave(item.nombreCompleto)}`;
  const ultima = sessionStorage.getItem(clave);
  const candidatas = ultima ? citas.filter((c) => c !== ultima) : citas;
  const elegida = candidatas[Math.floor(Math.random() * candidatas.length)] || citas[0];

  sessionStorage.setItem(clave, elegida);
  return elegida;
}

function normalizarClave(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extrae la clave canónica de UA de cualquier forma de identificación:
 *
 *   "FAyD"                                  → "fayd"   (sigla directa)
 *   "Facultad de Arte y Diseño (FAyD)"      → "fayd"   (extrae el paréntesis)
 *   "Facultad de Ingeniería (FI)"           → "fi"
 *   "Escuela Agrotécnica Eldorado"          → "escuelaagrotecnicaeldorado"
 *   "UNaM"                                  → "unam"   (caso especial)
 *   null / undefined                        → "general"
 *
 * Esto resuelve el bug donde normalizarClave('Facultad de Arte y Diseño (FAyD)')
 * producía 'facultaddearteydisenofayd' en vez de 'fayd', rompiendo el matching
 * de data-ua entre UA registros (uaTexto='FAyD') y testimonios UA
 * (uaTexto='Facultad de Arte y Diseño (FAyD)').
 */
// Mapa de alias para UAs cuyos datos usan nombre largo sin sigla entre paréntesis.
// Cuando el sistema de testemionos usa "Escuela Agrotécnica Eldorado" (sin "(EAE)"),
// normalizarClave produce 'escuelaagrotecnicaeldorado' mientras el narrador r-eae-ua
// usa unidadAcademica:"EAE" → 'eae'. Los ALIAS_UA normalizan esa divergencia
// sin depender de correcciones en los datos.
const ALIAS_UA = {
  escuelaagrotecnicaeldorado: 'eae',
};

function resolverUA(texto) {
  if (!texto) return 'general';
  if (texto === 'UNaM') return 'unam';
  // Extraer sigla del paréntesis final: "... (FAyD)" → "fayd"
  const m = texto.match(/\(([A-Za-z]+(?:[A-Za-z]|\d)*)\)\s*$/);
  if (m) return normalizarClave(m[1]);
  // Si el texto ya es corto (sigla directa como "FAyD", "FI", "EAE")
  if (texto.length <= 12 && !/\s{2,}/.test(texto)) return normalizarClave(texto);
  // Nombre largo sin paréntesis: aplicar alias antes de devolver
  const clave = normalizarClave(texto);
  return ALIAS_UA[clave] || clave;
}

/**
 * Vuelve a elegir la cita de cada tarjeta de testimonio de una sede y
 * actualiza el texto en pantalla. Se llama tanto al entrar por primera
 * vez como en cada reingreso — a diferencia de la animación de entrada
 * (que solo se reproduce una vez), la cita sí puede cambiar cada vez.
 * Si la tarjeta ya está visible, el cambio de texto se hace con una
 * transición suave en vez de un salto.
 */
function refrescarCitas(seccion, testimonios) {
  seccion.querySelectorAll('.elemento--testimonio').forEach((el) => {
    const item = testimonios.find((t) => t.id === el.dataset.testimonioId);
    const nodoTexto = el.querySelector('.testimonio-cita');
    if (!item || !nodoTexto) return;

    const nuevaCita = elegirCita(item);
    if (nodoTexto.dataset.citaActual === nuevaCita) return;

    const yaVisible = el.classList.contains('elemento--visible');
    if (!yaVisible) {
      nodoTexto.textContent = nuevaCita;
      nodoTexto.dataset.citaActual = nuevaCita;
      return;
    }
    nodoTexto.style.opacity = '0';
    window.setTimeout(() => {
      nodoTexto.textContent = nuevaCita;
      nodoTexto.dataset.citaActual = nuevaCita;
      nodoTexto.style.opacity = '1';
    }, 260);
  });
}

function inicialesDe(nombreCompleto = '') {
  const palabras = nombreCompleto.replace(/^(Mg\.|Dr\.|Ing\.|Esp\.)\s*/i, '').trim().split(/\s+/);
  const primera = palabras[0]?.[0] || '';
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1][0] : '';
  return (primera + ultima).toUpperCase();
}

function hashSimple(texto = '') {
  let hash = 0;
  for (const caracter of String(texto)) hash = (hash * 31 + caracter.charCodeAt(0)) % 1000;
  return Math.abs(hash);
}

/**
 * Al pasar el mouse o el foco de teclado por una tarjeta: la trae al
 * frente, la agranda levemente y atenúa (sin ocultar) a las demás. Al
 * salir, todo vuelve solo gracias a las transiciones CSS.
 *
 * Extensión para constelaciones documentales: cuando se pasa sobre un
 * registro de Unidad Académica, TAMBIÉN se destacan todos los elementos
 * de esa misma UA y se atenúan los de las otras. Esto hace visible la
 * agrupación de la constelación sin necesidad de líneas ni gráficos.
 */
function iniciarInteraccionDeEnfoque(secciones) {
  // ── v5.0 · Informe QA #1 (bug «layout colapsa / tarjetas atascadas») ──
  // Causa raíz demostrada: este sistema engancha focusin→activar y
  // focusout→desactivar. En touch, el tap que abre el Lector dispara
  // focusin; al cerrar, el retorno de foco a la tarjeta origen dispara
  // focusin OTRA VEZ y no existe mouseleave que lo limpie → el escenario
  // queda atascado en modo enfoque: todas las tarjetas de otras UA al 18 %
  // de opacidad y con pointer-events:none (.elemento--ua-alejado,
  // styles.css L923). El enfoque es un lenguaje hover de desktop; en
  // mobile el tap tiene UNA promesa: abrir el Lector (P5).
  if (window.esMobile?.()) return;

  secciones.forEach((seccion) => {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    escenario.querySelectorAll('.elemento').forEach((el) => {
      const esNarradorUA = el.dataset.tipo === 'registro-ua';

      const activar = () => {
        escenario.classList.add('escenario--enfocando');
        el.classList.add('elemento--enfocado');
        el.style.zIndex = 999;

        // Constelación documental: solo se activa al enfocar una tarjeta
        // de Unidad Académica (el "narrador" de esa constelación).
        if (esNarradorUA && el.dataset.ua) {
          const uaActiva = el.dataset.ua;
          escenario.dataset.uaActiva = uaActiva;
          escenario.querySelectorAll('.elemento--visible').forEach((otro) => {
            if (otro.dataset.ua === uaActiva) {
              otro.classList.add('elemento--ua-relacionado');
            } else {
              otro.classList.add('elemento--ua-alejado');
            }
          });
        }
      };

      const desactivar = () => {
        escenario.classList.remove('escenario--enfocando');
        el.classList.remove('elemento--enfocado');
        el.style.zIndex = '';

        // Limpiar la constelación activa
        if (esNarradorUA) {
          delete escenario.dataset.uaActiva;
          escenario.querySelectorAll('.elemento--ua-relacionado, .elemento--ua-alejado').forEach((e) => {
            e.classList.remove('elemento--ua-relacionado', 'elemento--ua-alejado');
          });
        }
      };

      el.addEventListener('mouseenter', activar);
      el.addEventListener('mouseleave', desactivar);
      el.addEventListener('focusin', activar);
      el.addEventListener('focusout', desactivar);
    });
  });
}

function pintarRuta(sedesVisibles) {
  const lista = document.querySelector('.ruta-nodos');
  if (!lista) return;
  lista.innerHTML = sedesVisibles
    .map(
      (sede, indice) => `
      <li>
        <button class="ruta-nodo" data-indice="${indice}" aria-label="Ir a ${escaparHTML(sede.nombre)}">
          <span class="ruta-nodo-punto"></span>
          <span class="ruta-nodo-num">${String(indice + 1).padStart(2, '0')}</span>
          <span class="ruta-nodo-nombre">${escaparHTML(sede.nombre)}</span>
        </button>
      </li>`
    )
    .join('');
  document.documentElement.style.setProperty('--total-sedes', sedesVisibles.length);
}

function actualizarRuta(indiceActual) {
  document.querySelectorAll('.ruta-nodo').forEach((boton) => {
    boton.classList.toggle('ruta-nodo--activo', Number(boton.dataset.indice) === indiceActual);
  });
  const total = Number(document.documentElement.style.getPropertyValue('--total-sedes')) || 1;
  const progreso = total > 1 ? indiceActual / (total - 1) : 1;
  document.documentElement.style.setProperty('--progreso-ruta', progreso.toFixed(3));
  // Sincronizar el nav mobile independiente (#ruta-m)
  window.actualizarNavMobile?.(indiceActual);
}

function escaparHTML(texto = '') {
  return String(texto).replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[caracter]));
}

// =============================================================================
// SISTEMA DE ROTACIÓN DOCUMENTAL
// =============================================================================
//
// La rotación no es aleatoria: sigue un orden editorial que refleja la
// estructura narrativa del compendio.
//
// ESTADO INICIAL: solo se muestran los elementos permanentes (UA registros)
// más 2 satélites por UA (video > testimonio UA > conceptual > autoridad UNaM).
// Todo lo demás se oculta con fade escalonado. Esta es la primera imagen que
// ve el usuario: tres ejes narrativos claros (uno por UA), cada uno con sus
// primeros documentos asociados — NO veinte tarjetas en caos.
//
// ROTACIÓN: se lleva un cursor por UA. Cada ciclo, entra el siguiente elemento
// de la UA cuyo satélite lleva más tiempo sin mostrarse, reemplazando al
// elemento de ESA MISMA UA que lleva más tiempo visible. Esto mantiene la
// identidad de la constelación incluso mientras el contenido cambia.
//
// RENDIMIENTO: nunca se recalculan posiciones. Solo se cambia opacity vía
// clase + inline transition. Zero reflow, zero layout thrashing.

const Rotacion = (() => {
  const INTERVALO_MS    = 10000;  // tiempo entre rotaciones (10s)
  const FADE_SALIDA_MS  = 580;
  const FADE_ENTRADA_MS = 700;
  const INICIO_DELAY_MS = 2500;   // espera a que el reveal termine

  // Prioridad de tipo para el estado inicial (menor número = se muestra antes)
  const PRIORIDAD_TIPO = { 'video': 0, 'testimonio': 1, 'registro-conceptual': 2 };

  // UA en orden narrativo para la rotación round-robin
  const ORDEN_UA = ['fhycs','fceqyn','fce','fayd','fi','fcf','eae','unam','general'];

  let intervalId    = null;
  let timeoutId     = null;
  let poolActivo    = [];
  let poolEspera    = [];
  let cursorEspera  = 0;
  // Contador de generación: se incrementa cada vez que detener() es llamado.
  // rotarUno() captura el valor en el momento de la llamada y lo compara
  // dentro del setTimeout — si difiere, la sede cambió mientras el fade
  // estaba en curso y el callback debe ser ignorado completamente.
  // Esto previene que el setTimeout de una sede anterior afecte a los pools
  // de la nueva sede.
  let generacion    = 0;
  // DTI Modelo Temporal §5.3 (E3): reanudar() no recibía la sección como
  // parámetro — rotarUno() ahora la necesita (orden congelado por sede).
  // Se registra la última sección para la que corrió iniciar()/configurar.
  let seccionActiva = null;

  function calcularCapacidad(escenario, candidatos) {
    // MOBILE — auditoría museográfica (FASE 4, respiración del mural):
    // La simulación de cobertura demostró que con 11 visibles el mural cubre
    // 82-85% del lienzo (territorio reducido a 15-18%, 6-7 solapamientos
    // graves texto-sobre-texto). Con 8 visibles: 80% de cobertura, 1 solape
    // grave, y el territorio respira por los canales entre columnas.
    // Nota técnica: configurar() produce saltos discretos de visibilidad
    // (SLOTS=floor((cap-perm)/UAs)): cap=8 → 8 visibles; cap=9..11 → 11.
    // Por eso el máximo correcto es 8, no un valor intermedio.
    // Trade-off documentado: en Posadas los 2 registros conceptuales quedan
    // en poolEspera y el SKIP protector les impide entrar (todas las UA
    // tienen exactamente 1 satélite). Se exhiben solo en desktop.
    if (window.esMobile?.()) {
      // E4 (DTI §7, "Capacidad"): derivada de MEDIDAS REALES, no de constantes
      // ligadas a un corpus. altUtil = alto real del escenario − cabecera(72)
      // − nav(52). w/h medios = promedio de offsetWidth/Height del interior
      // × escala (cap 1.0, igual que layout.js). Ocupación objetivo ≤ 60 %
      // (DTI §8): factor 0.65 con clamp [4, 8]. Verificación en device de
      // referencia (393×864, corpus v4.4 con chips): cap = 8, ocupación ≈ 54 %.
      // En pantallas compactas (≈360×640) el clamp inferior garantiza 4.
      const esc = escenario || document.querySelector('.escenario');
      const rEsc = esc?.getBoundingClientRect();
      const wEsc = rEsc?.width  || window.innerWidth;
      const altUtil = Math.max(320, (rEsc?.height || window.innerHeight) - 92 - 52);   // M-32: 72→92, ver layout.js
      const lista = (candidatos && candidatos.length) ? candidatos
        : Array.from((esc || document).querySelectorAll('.elemento'));
      let sumW = 0, sumH = 0, n = 0;
      lista.forEach((el) => {
        const it = el.querySelector('.elemento-interior');
        if (!it) return;
        const e = Math.min(parseFloat(el.dataset.escala) || 1, 1);
        sumW += (it.offsetWidth  || 150) * e;
        sumH += (it.offsetHeight || 190) * e;
        n++;
      });
      const wProm = n ? sumW / n : 150;
      const hProm = n ? sumH / n : 190;
      return Math.max(4, Math.min(8, Math.floor((wEsc * altUtil * 0.65) / (wProm * hProm))));
    }
    return Math.max(8, Math.min(22, Math.round(window.innerWidth * window.innerHeight / 120000)));
  }

  function tipoPrioridad(el) {
    const t = el.dataset.tipo;
    // v4.7 (solo mobile) · Prioridad testimonial: en el primer frame, la VOZ
    // (cita con nombre propio) precede a la evidencia audiovisual como
    // satélite de cada UA. Los videos entran igualmente por rotación (10 s).
    // Desktop conserva PRIORIDAD_TIPO intacta. Reversible: quitar el guard.
    if (window.esMobile?.()) {
      if (t === 'testimonio') return 1;
      if (t === 'video')      return 2;
      return 10 + (PRIORIDAD_TIPO[t] ?? 89);
    }
    return PRIORIDAD_TIPO[t] ?? 99;
  }

  function ocultarConFade(el) {
    el.style.transition = `opacity ${FADE_SALIDA_MS}ms ease`;
    el.classList.add('elemento--rotacion-espera');
  }

  function mostrarConFade(el) {
    el.style.transition = `opacity ${FADE_ENTRADA_MS}ms ease`;
    el.classList.remove('elemento--rotacion-espera');
    // DTI Modelo Temporal §5.4 (E4): si el entrante es una autoridad que el
    // sorteo K=2 no eligió para la apertura, también trae esta clase — sin
    // esto quedaría con opacity:0 !important (la regla CSS de descarte)
    // encima del fade normal. No-op para cualquier otro tipo de elemento.
    el.classList.remove('elemento--oculto-autoridad');
  }

  /**
   * Configura el estado inicial del mural para una sede:
   *   1. Todos los permanentes (UA registros) siempre visibles.
   *   2. Para cada UA con permanente: los mejores satélites (video > testi > conceptual).
   *   3. UNaM autoridades (gestionadas por el sistema K=2): siempre en satélites.
   *   4. Relleno por capacidad: si la pantalla puede mostrar más elementos de los
   *      que cubrieron los pasos 1-3, agregarlos al conjunto visible (evita que
   *      sedes con pocos contenidos —como Eldorado— oculten elementos innecesariamente).
   *   5. Todo lo que no entró: poolEspera, oculto con fade escalonado.
   */
  /**
   * DTI Modelo Temporal §5.5 (E5): vuelca el estado del ciclo (orden,
   * exhibidos, vuelta) de `seccion.dataset` a sessionStorage, bajo la
   * firma de corpus dada. No usa Almacen (localStorage): el ciclo es
   * estado EFÍMERO de sesión por definición del pedido — Almacen tiene
   * semántica de contenido editorial persistente (borradores del panel de
   * administración), mezclarlos contaminaría esa capa y volvería el
   * recorrido "histórico" entre sesiones distintas, lo cual no se pidió.
   */
  function persistirCiclo(seccion, clave, firmaCorpus) {
    try {
      sessionStorage.setItem(clave, JSON.stringify({
        firmaCorpus,
        exhibidos: leerJSONSeguro(seccion.dataset.cicloExhibidos) || [],
        vuelta: Number(seccion.dataset.cicloVuelta || '1'),
      }));
    } catch (error) {
      // sessionStorage lleno o inaccesible (modo privado estricto): el
      // ciclo sigue funcionando en memoria (dataset), solo no sobrevive
      // una recarga. No es un fallo que deba interrumpir la rotación.
    }
  }

  function configurar(seccion) {
    if (!seccion) return;
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    // C2 — query sin requisito de --visible:
    // permite que configurar() corra ANTES de que Secuenciador.entrar() revele
    // los elementos, marcando inmediatamente el subconjunto no-seleccionado con
    // --rotacion-espera. Cuando Secuenciador agrega --visible, los marcados
    // permanecen ocultos (opacity:0 !important tiene mayor especificidad).
    const candidatos = Array.from(
      escenario.querySelectorAll('.elemento')
    );

    const permanentes  = candidatos.filter((el) => el.dataset.permanente === 'true');
    const uasConNarradores = [...new Set(permanentes.map((el) => el.dataset.ua))];
    const capacidad = calcularCapacidad(escenario, candidatos);

    // ── E1 (DTI §6.2, defecto D3): configuración idempotente por sede ─────────
    // La firma captura todo lo que determina la selección: build, corpus,
    // capacidad medida. Si coincide con la registrada en la sede, los pools
    // se REHIDRATAN desde las clases actuales (preserva el estado
    // post-rotaciones) y no se toca ninguna clase — no-op verificable.
    //
    // DTI Modelo Temporal §5.4/E4: la firma YA NO incluye k[...] (el sorteo
    // de autoridades). En el modelo anterior, cambiar el sorteo cambiaba
    // qué autoridades eran CANDIDATAS (las no elegidas quedaban excluidas
    // del cálculo por completo), así que un nuevo sorteo debía forzar
    // reconfiguración total. En el modelo nuevo todas las autoridades son
    // candidatas siempre — el sorteo solo decide cuáles DOS arrancan
    // visibles en el primer frame — así que ya no debe invalidar la
    // configuración: si lo hiciera, el ciclo (orden congelado + exhibidos)
    // se reiniciaría cada vez que el sorteo de sesión diera un conjunto
    // distinto, rompiendo la cobertura y la continuidad del recorrido.
    const idDe = (el) => el.dataset.testimonioId ||
      `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`;
    const firma = `${window.__BUILD__}|c${candidatos.length}|cap${capacidad}`;
    const ordenEditorial = (aEl, bEl) => {
      const uaA = ORDEN_UA.indexOf(aEl.dataset.ua);
      const uaB = ORDEN_UA.indexOf(bEl.dataset.ua);
      if (uaA !== uaB) return (uaA < 0 ? 99 : uaA) - (uaB < 0 ? 99 : uaB);
      return tipoPrioridad(aEl) - tipoPrioridad(bEl);
    };
    if (seccion.dataset.rotConfig === firma) {
      const rot = candidatos.filter((el) => el.dataset.permanente !== 'true');
      poolEspera = rot.filter((el) => el.classList.contains('elemento--rotacion-espera'));
      poolActivo = rot.filter((el) => !el.classList.contains('elemento--rotacion-espera'));
      poolEspera.sort(ordenEditorial);
      cursorEspera = 0;
      DIAG.log('configurar', { sede: seccion.dataset.sede, modo: 'rehidratar',
        activo: poolActivo.length, espera: poolEspera.length, cap: capacidad });
      return;
    }

    // Cuántas autoridades UNaM van a ocupar slot (el sistema K=2 ya eligió cuáles)
    const KUNaM = candidatos.filter(
      (el) => el.dataset.ua === 'unam' && el.dataset.permanente !== 'true'
    ).length;

    // SLOTS_POR_UA: cuántos satélites recibe cada UA con narrador.
    // AUDITORÍA DE CAPACIDAD REAL: la fórmula anterior era
    //   Math.max(1, floor((cap - permanentes) / uas))
    // que ignoraba las UNaM sumadas después, produciendo TOTAL > cap
    // (Posadas: 3 perm + 3 sat + 2 UNaM = 8 con cap=6).
    // Ahora se descuenta KUNaM ANTES de dividir, y el piso baja a 0 para
    // no forzar satélites cuando la capacidad ya está ocupada por
    // permanentes + UNaM. En Posadas (perm=3, uas=3, K=2, cap=6):
    //   floor((6-3-2)/3) = 0 → total = 3+0+2 = 5, respeta el cap.
    // En Oberá  (perm=2, uas=2, K=2, cap=6):
    //   floor((6-2-2)/2) = 1 → total = 2+2+2 = 6.
    // En Eldorado (perm=0, uas=0, K=2, cap=6): SLOTS irrelevante,
    //   el relleno por capacidad completa hasta 6.
    const SLOTS_POR_UA = Math.max(0, Math.min(3,
      Math.floor((capacidad - permanentes.length - KUNaM) / Math.max(1, uasConNarradores.length))
    ));
    const satelitesIniciales = new Set();

    uasConNarradores.forEach((ua) => {
      const candidatosUA = candidatos
        .filter((el) => el.dataset.ua === ua && el.dataset.permanente !== 'true')
        .sort((a, b) => tipoPrioridad(a) - tipoPrioridad(b));
      candidatosUA.slice(0, SLOTS_POR_UA).forEach((el) => satelitesIniciales.add(el));
    });

    // Autoridades UNaM visibles (el sistema K=2 ya eligió cuáles mostrar)
    const autUNaM = candidatos.filter(
      (el) => el.dataset.ua === 'unam' && el.dataset.permanente !== 'true'
    );
    autUNaM.forEach((el) => satelitesIniciales.add(el));

    // RELLENO POR CAPACIDAD: si quedan slots libres en la pantalla
    // (calculado como capacidad - permanentes - satélites ya elegidos),
    // agregar los elementos sobrantes en orden editorial hasta completar.
    // Esto es fundamental para Eldorado (sin UA narrador permanente): los
    // testimonios de Berger y de Lima son los documentos más importantes
    // de esa sede y no deben quedar ocultos cuando la pantalla los puede
    // mostrar sin saturación.
    const rotativos = candidatos.filter((el) => el.dataset.permanente !== 'true');
    const slotsLibres = Math.max(0, capacidad - permanentes.length - satelitesIniciales.size);
    if (slotsLibres > 0) {
      rotativos
        .filter((el) => !satelitesIniciales.has(el))
        .sort((a, b) => {
          const uaA = ORDEN_UA.indexOf(a.dataset.ua);
          const uaB = ORDEN_UA.indexOf(b.dataset.ua);
          if (uaA !== uaB) return (uaA < 0 ? 99 : uaA) - (uaB < 0 ? 99 : uaB);
          return tipoPrioridad(a) - tipoPrioridad(b);
        })
        .slice(0, slotsLibres)
        .forEach((el) => satelitesIniciales.add(el));
    }

    poolActivo = rotativos.filter((el) => satelitesIniciales.has(el));
    poolEspera = rotativos.filter((el) => !satelitesIniciales.has(el));

    // Ordenar poolEspera en orden editorial (por UA, luego por tipo)
    poolEspera.sort((a, b) => {
      const uaA = ORDEN_UA.indexOf(a.dataset.ua);
      const uaB = ORDEN_UA.indexOf(b.dataset.ua);
      if (uaA !== uaB) return (uaA < 0 ? 99 : uaA) - (uaB < 0 ? 99 : uaB);
      return tipoPrioridad(a) - tipoPrioridad(b);
    });
    cursorEspera = 0;

    // ── DTI Modelo Temporal §5.3 (E3): siembra del ciclo editorial ─────────
    // Orden congelado = el orden editorial recién calculado (mismo criterio
    // que el sort de arriba), fijado UNA vez por firma — rotarUno() ya NO
    // reordena poolEspera después de cada intercambio (esa recomputación
    // era la causa de que el cursor perdiera correlación con "lo aún no
    // exhibido": un elemento podía reingresar a espera por delante de otros
    // que nunca habían salido). Exhibidos arranca con lo que YA está en
    // pantalla — estar en el primer frame ES haber sido exhibido.
    //
    // §5.5 (E5): "primera carga de sesión" vs. recargas. El ciclo se
    // persiste en sessionStorage con una firma de CORPUS (el conjunto de
    // rotativos, no el build/capacidad — una recarga con otro viewport
    // recompone la escena inicial con las reglas normales igual, pero el
    // RECORRIDO del ciclo debe sobrevivir esa recarga). Si sessionStorage
    // trae un estado válido para esta firma, se restaura en vez de sembrar
    // desde cero — "la recarga no reinicia el recorrido; una sesión nueva
    // sí" (sessionStorage se vacía naturalmente al cerrar la pestaña/sesión,
    // sin código adicional).
    const ordenCongelado = rotativos.slice().sort(ordenEditorial).map(idDe);
    const claveCiclo = `unam_semana_regional_ciclo_${seccion.dataset.sede}`;
    const firmaCorpusCiclo = rotativos.map(idDe).sort().join(',');
    const cicloPersistido = leerJSONSeguro(sessionStorage.getItem(claveCiclo));

    if (cicloPersistido && cicloPersistido.firmaCorpus === firmaCorpusCiclo) {
      // Recarga dentro de la misma sesión: continuar el recorrido. Los
      // exhibidos persistidos que ya no estén en pantalla ahora (porque la
      // capacidad cambió) siguen contando como exhibidos — I4 pide que
      // cada elemento sea mostrado, no que quede visible para siempre.
      const exhibidosRestaurados = new Set(cicloPersistido.exhibidos || []);
      poolActivo.forEach((el) => exhibidosRestaurados.add(idDe(el)));
      seccion.dataset.cicloOrden = JSON.stringify(ordenCongelado);
      seccion.dataset.cicloExhibidos = JSON.stringify([...exhibidosRestaurados]);
      seccion.dataset.cicloVuelta = String(cicloPersistido.vuelta || 1);
      DIAG.log('ciclo-restaurado', { sede: seccion.dataset.sede,
        vuelta: cicloPersistido.vuelta, exhibidos: exhibidosRestaurados.size });
    } else {
      seccion.dataset.cicloOrden = JSON.stringify(ordenCongelado);
      seccion.dataset.cicloExhibidos = JSON.stringify(poolActivo.map(idDe));
      seccion.dataset.cicloVuelta = '1';
    }
    persistirCiclo(seccion, claveCiclo, firmaCorpusCiclo);

    // Mostrar los seleccionados (sin transición — ya deberían estar visibles)
    poolActivo.forEach((el) => {
      el.style.transition = '';  // quitar cualquier transition residual de ciclos anteriores
      el.classList.remove('elemento--rotacion-espera');
    });

    // C3 — ocultamiento del poolEspera.
    // Si se pasa `inmediato:true` (llamada pre-reveal desde iniciar()), los
    // elementos se marcan síncronamente — no hay nada que "desvanecer" porque
    // todavía no son visibles. Si es false (comportamiento legacy), se usa el
    // fade escalonado para no interrumpir bruscamente un mural ya visible.
    if (configurar._inmediato) {
      poolEspera.forEach((el) => el.classList.add('elemento--rotacion-espera'));
    } else {
      poolEspera.forEach((el, i) => {
        window.setTimeout(() => ocultarConFade(el), i * 80 + 300);
      });
    }
    // P3 re-layout: con el nuevo flujo (iniciar → configurar → recalcular →
    // Secuenciador), layout.js ya ve exactamente los elementos finales en el
    // momento en que el motor corre. Sin re-layout diferido.
    seccion.dataset.rotConfig = firma;
    DIAG.log('configurar', { sede: seccion.dataset.sede, modo: 'full',
      activo: poolActivo.length, espera: poolEspera.length, cap: capacidad,
      inmediato: !!configurar._inmediato });
  }

  /**
   * Rotación editorial: toma el siguiente elemento del poolEspera según el
   * cursor (que avanza en orden UA → tipo) y reemplaza el satélite más
   * antiguo de esa misma UA en poolActivo. Si no hay coincidencia de UA,
   * reemplaza cualquier elemento rotativo.
   *
   * BUG FIX CRÍTICO (Bug 03):
   * ─ Se captura el contador de generación al inicio. Si cuando el
   *   setTimeout se ejecuta la generación cambió (detener fue llamado),
   *   se ignora el callback completamente — esto evita que elementos de
   *   la sede anterior queden atrapados en el estado oculto sin recuperarse.
   * ─ Se usa indexOf() en vez de índices cacheados dentro del setTimeout:
   *   si otro ciclo modifica el array entre la llamada y el callback,
   *   los índices podrían apuntar a elementos incorrectos.
   */
  /**
   * DTI Modelo Temporal §5.3 (E3): el entrante ya NO se elige por
   * `cursorEspera % poolEspera.length` sobre un array que se reordena tras
   * cada intercambio (eso rompía la cobertura: un elemento podía reingresar
   * a espera por delante de otros que nunca habían salido). Se elige el
   * PRIMERO del orden congelado de la sede que (a) esté actualmente en
   * poolEspera y (b) no haya sido exhibido todavía en esta vuelta. Si no
   * queda ninguno así, la vuelta se completó: se reinicia el registro de
   * exhibidos con lo que YA está en pantalla y se incrementa el contador
   * de vuelta — el ciclo continúa solo, sin pausa ni gesto adicional.
   */
  /**
   * DTI Modelo Temporal §5.3 (E3): el entrante ya NO se elige por
   * `cursorEspera % poolEspera.length` sobre un array que se reordena tras
   * cada intercambio (eso rompía la cobertura: un elemento podía reingresar
   * a espera por delante de otros que nunca habían salido). Se recorre el
   * orden congelado de la sede probando, para cada no-exhibido en orden,
   * si existe un saliente válido (mismas reglas de siempre) — el primero
   * que sí tenga se usa. Si TODOS los no-exhibidos generan SKIP (ninguna
   * UA puede cederles sitio sin quedar en 0), la vuelta se da por agotada
   * en lo que se puede mostrar y se completa igual (I6): reintentar
   * indefinidamente con el mismo bloqueado dejaría el ciclo trabado para
   * siempre — el código anterior evitaba esto avanzando el cursor SIEMPRE,
   * incluso en SKIP; este reemplaza ese avance por probar el resto del
   * orden en la misma pasada.
   */
  function elegirEntranteYSalientePorCiclo(seccion) {
    const idDe = (el) => el.dataset.testimonioId ||
      `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`;
    const buscarSaliente = (uaEntrante) => {
      const satelitesPorUA = {};
      poolActivo.forEach((el) => {
        if (el.dataset.permanente === 'true' || el.dataset.ua === 'unam') return;
        satelitesPorUA[el.dataset.ua] = (satelitesPorUA[el.dataset.ua] || 0) + 1;
      });
      let i = poolActivo.findIndex((el) => el.dataset.ua === uaEntrante && el.dataset.permanente !== 'true');
      if (i < 0) {
        let maxSat = 1;
        poolActivo.forEach((el, idx) => {
          if (el.dataset.permanente === 'true' || el.dataset.ua === 'unam') return;
          const cnt = satelitesPorUA[el.dataset.ua] || 0;
          if (cnt > maxSat) { maxSat = cnt; i = idx; }
        });
      }
      if (i < 0) {
        i = poolActivo.findIndex((el) => el.dataset.ua !== 'unam' && el.dataset.permanente !== 'true'
          && (satelitesPorUA[el.dataset.ua] || 0) > 1);
      }
      // 4ª — DTI Modelo Temporal §5.3/E3, ajuste descubierto en verificación:
      // las 3 reglas anteriores protegen contra DEJAR a una UA en 0, pero
      // no cubren el caso de una UA que YA está en 0 desde la composición
      // inicial (capacidad chica → SLOTS_POR_UA=0 para facultades enteras,
      // caso real medido: Posadas mobile). Sin esta regla, esas facultades
      // nunca tienen de dónde "robarles" un slot y jamás entran — el ciclo
      // corre indefinidamente sin poder cumplir I4 para ellas. I4 (cobertura
      // completa) es un criterio de aceptación explícito del DTI; "nunca
      // bajar de 1" nunca lo fue — era un supuesto implícito que asumía
      // que todas las UA ya tenían representación al arrancar, cosa que la
      // verificación real refutó. Última prioridad: cede la UA de facultad
      // (no autoridad, no permanente) con MÁS satélites en este momento,
      // sin piso de cnt>1 — el mismo criterio "richest" de la 2ª regla,
      // sin la condición que la hacía inútil quando todas están en ≤1.
      if (i < 0) {
        let maxSat = 0;
        poolActivo.forEach((el, idx) => {
          if (el.dataset.permanente === 'true' || el.dataset.ua === 'unam') return;
          const cnt = satelitesPorUA[el.dataset.ua] || 0;
          if (cnt > maxSat) { maxSat = cnt; i = idx; }
        });
      }
      // 5ª — último recurso: ni siquiera queda una facultad con algún
      // satélite (poolActivo no-permanente son solo autoridades UNaM).
      // Caso real medido: Posadas mobile con capacidad chica deja CERO
      // satélites de facultad desde el arranque. I5 prohíbe MÁS de 2
      // autoridades simultáneas — nunca exige exactamente 2 — así que
      // ceder una para que una facultad tenga su turno no lo viola, y es
      // la única vía posible para que esas facultades cumplan I4 alguna
      // vez. Solo aplica cuando el entrante NO es autoridad (si lo fuera,
      // la 1ª regla ya la encontró).
      if (i < 0 && uaEntrante !== 'unam') {
        i = poolActivo.findIndex((el) => el.dataset.ua === 'unam' && el.dataset.permanente !== 'true');
      }
      return i;
    };

    const intentarVuelta = () => {
      const orden = leerJSONSeguro(seccion.dataset.cicloOrden) || [];
      const exhibidos = new Set(leerJSONSeguro(seccion.dataset.cicloExhibidos) || []);
      const idsEnEspera = new Map(poolEspera.map((el) => [idDe(el), el]));
      for (const id of orden) {
        if (!idsEnEspera.has(id) || exhibidos.has(id)) continue;
        const entrante = idsEnEspera.get(id);
        const iSaliente = buscarSaliente(entrante.dataset.ua);
        if (iSaliente >= 0) return { entrante, saliente: poolActivo[iSaliente] };
      }
      return null;
    };

    let resultado = intentarVuelta();
    if (!resultado) {
      // Fin de vuelta (I6) o bloqueo total transitorio: reinicia exhibidos
      // con lo que YA está en pantalla — el ciclo continúa solo, sin pausa
      // ni gesto visual adicional.
      const vueltaAnterior = Number(seccion.dataset.cicloVuelta || '1');
      seccion.dataset.cicloExhibidos = JSON.stringify(poolActivo.map(idDe));
      seccion.dataset.cicloVuelta = String(vueltaAnterior + 1);
      DIAG.log('ciclo-vuelta-completa', { sede: seccion.dataset.sede, vuelta: vueltaAnterior });
      const ordenActual = leerJSONSeguro(seccion.dataset.cicloOrden) || [];
      persistirCiclo(seccion, `unam_semana_regional_ciclo_${seccion.dataset.sede}`,
        ordenActual.slice().sort().join(','));
      resultado = intentarVuelta();
    }
    return resultado;
  }

  function rotarUno(seccion) {
    if (!poolActivo.length || !poolEspera.length) return;

    const genEsteCallback = generacion; // captura antes del setTimeout

    const par = elegirEntranteYSalientePorCiclo(seccion);
    if (!par) return; // ninguna UA puede ceder sitio en este instante — protege constelaciones
    const { entrante, saliente } = par;

    ocultarConFade(saliente);

    window.setTimeout(() => {
      // Si la generación cambió, detener() fue llamado mientras el fade
      // estaba en curso. Restaurar visibilidad del saliente que quedó oculto
      // y no hacer ningún cambio en los pools (ya fueron vaciados).
      if (generacion !== genEsteCallback) {
        mostrarConFade(saliente); // por si quedó con la clase tras el detener()
        return;
      }

      // Usar indexOf() para localizar elementos por referencia (no por índice
      // cacheado) — previene eliminar el elemento incorrecto si los arrays
      // cambiaron entre la llamada original y este callback.
      const realISaliente = poolActivo.indexOf(saliente);
      const realIEntrante = poolEspera.indexOf(entrante);

      if (realISaliente >= 0) poolActivo.splice(realISaliente, 1);
      if (realIEntrante >= 0) poolEspera.splice(realIEntrante, 1);

      poolActivo.push(entrante);
      poolEspera.push(saliente);
      // DTI §5.3 (E3): SIN re-sort. El orden de rotarUno() ya no depende del
      // orden de poolEspera — depende del orden congelado (dataset), que no
      // cambia. Re-ordenar acá era precisamente lo que rompía la cobertura.

      // ── Marca de exhibido (E3) ───────────────────────────────────────────
      const idDe = (el) => el.dataset.testimonioId ||
        `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`;
      if (seccion) {
        const exhibidos = new Set(leerJSONSeguro(seccion.dataset.cicloExhibidos) || []);
        exhibidos.add(idDe(entrante));
        seccion.dataset.cicloExhibidos = JSON.stringify([...exhibidos]);
        const ordenActual = leerJSONSeguro(seccion.dataset.cicloOrden) || [];
        persistirCiclo(seccion, `unam_semana_regional_ciclo_${seccion.dataset.sede}`,
          ordenActual.slice().sort().join(','));
      }

      // ── HERENCIA DE POSICIÓN (solo mobile) ─────────────────────────────
      // Museográficamente: se cambia el documento, no el clavo. El entrante
      // ocupa exactamente el lugar del saliente, así la composición del mural
      // permanece estable durante toda la rotación (sin huecos errantes ni
      // saltos de densidad). Sin esto, cada tarjeta entrante aparecía en SU
      // posición precalculada — que podía estar en cualquier otra zona —
      // mutando la composición cada 10s y dejando vacío el lugar del saliente.
      // Desktop conserva el comportamiento original (posiciones precalculadas):
      // su lienzo amplio absorbe la variación sin degradar la composición.
      if (window.esMobile?.()) {
        const xSal = saliente.style.getPropertyValue('--x');
        const ySal = saliente.style.getPropertyValue('--y');
        if (xSal && ySal) {
          entrante.style.setProperty('--x', xSal);
          // Clamp vertical: si el entrante es más alto que el saliente, evitar
          // que sobresalga bajo el nav (52px) o sobre el header (72px).
          const hEnt = (entrante.querySelector('.elemento-interior')?.offsetHeight || 140);
          const yNum = parseFloat(ySal);
          const yMin = 72 + hEnt / 2;
          // H2 (auditoría de coordenadas): usar la MISMA fuente vertical que
          // layout.js L33 (rectEscenario.height = 100svh, ESTÁTICO). Antes usaba
          // window.innerHeight (DINÁMICO — cambia con la barra URL), lo que
          // producía yMax distintos entre el layout inicial y cada rotación:
          // la tarjeta entrante se movía verticalmente respecto al clavo del
          // saliente cuando la barra se mostraba/ocultaba, rompiendo el
          // principio "se cambia el documento, no el clavo".
          const rectEsc = entrante.closest('.escenario')?.getBoundingClientRect();
          const altoEscenario = rectEsc?.height || window.innerHeight;
          const yMax = altoEscenario - 52 - hEnt / 2;
          const yFinal = Math.max(yMin, Math.min(yMax, yNum));
          entrante.style.setProperty('--y', `${Math.round(yFinal)}px`);
        }
      }

      mostrarConFade(entrante);
    }, FADE_SALIDA_MS + 80);
  }

  function iniciar(seccion) {
    seccionActiva = seccion;
    DIAG.log('iniciar', { sede: seccion?.dataset?.sede, mobile: !!window.esMobile?.() });
    detener(); // E1: sin argumento → solo timers/pools; jamás limpia clases de otras sedes
    if (!seccion) return;

    if (window.esMobile?.()) {
      // ── MOBILE — mural pre-armado desde el primer frame ─────────────────
      // Secuencia: iniciar() → configurar INMEDIATO → recalcular (6 elem) →
      // Secuenciador.entrar() → reveal de 6 ya posicionados.
      //
      // configurar() marca los 11 excedentes con --rotacion-espera ANTES de
      // que Secuenciador.entrar() añada --visible. Los 11 permanecen ocultos
      // (opacity:0 !important) incluso después del reveal; el usuario ve el
      // mural ya compuesto desde el primer frame, sin "construcción" visible.
      //
      // La ROTACIÓN (rotarUno) empieza recién después de INICIO_DELAY_MS,
      // para que el visitante lea el mural estable antes de que comiencen
      // los intercambios.
      configurar._inmediato = true;
      configurar(seccion);
      configurar._inmediato = false;
      timeoutId = window.setTimeout(() => {
        if (poolEspera.length > 0) {
          intervalId = window.setInterval(() => rotarUno(seccion), INTERVALO_MS);
        }
      }, INICIO_DELAY_MS);
    } else {
      // ── DESKTOP — comportamiento original sin cambios ────────────────────
      timeoutId = window.setTimeout(() => {
        configurar(seccion);
        if (poolEspera.length > 0) {
          intervalId = window.setInterval(() => rotarUno(seccion), INTERVALO_MS);
        }
      }, INICIO_DELAY_MS);
    }
  }

  function detener(seccion) {
    // E1 (DTI §6.2, defecto D1): alcance POR SEDE.
    // Sin argumento: solo timers/pools (uso normal desde iniciar()) — las
    // clases de espera de todas las sedes PERSISTEN (memoria espacial).
    // Con sección: limpia la espera únicamente dentro de esa sede y borra su
    // firma de configuración (reconfiguración forzada en la próxima visita).
    // El viejo Bug 03 (elemento atrapado a mitad de fade) queda cubierto por
    // la rehidratación de pools desde clases en configurar(): un elemento con
    // la clase aplicada entra a poolEspera y es recuperable por rotación.
    generacion++; // invalida cualquier setTimeout pendiente de rotarUno()
    if (intervalId) { window.clearInterval(intervalId); intervalId = null; }
    if (timeoutId)  { window.clearTimeout(timeoutId);   timeoutId  = null; }

    let limpiados = 0;
    if (seccion) {
      seccion.querySelectorAll('.elemento--rotacion-espera').forEach((el) => {
        limpiados++;
        el.classList.remove('elemento--rotacion-espera');
        el.style.transition = '';
      });
      delete seccion.dataset.rotConfig;
    }
    DIAG.log('detener', { alcance: seccion ? (seccion.dataset.sede || 'sede') : 'timers', limpiados });

    poolActivo   = [];
    poolEspera   = [];
    cursorEspera = 0;
  }

  // Teardown total explícito (uso excepcional; nunca implícito en iniciar()).
  function detenerTodo() {
    document.querySelectorAll('.sede').forEach((s) => detener(s));
  }

  // H-08: Pausa y reanuda la rotación sin vaciar los pools.
  // Se invoca desde el Lector al abrir/cerrar un documento:
  //   · Al abrir: el mural se congela — la tarjeta de origen permanece visible.
  //   · Al cerrar: la rotación continúa desde donde quedó.
  function pausar() {
    if (intervalId) { window.clearInterval(intervalId); intervalId = null; }
  }

  function reanudar() {
    // Solo reanuda si hay elementos que rotar y la rotación no está ya corriendo
    if (!intervalId && poolEspera.length > 0) {
      intervalId = window.setInterval(() => rotarUno(seccionActiva), INTERVALO_MS);
    }
  }

  /**
   * DTI Modelo Temporal §5.1 (E2): configura la sede INMEDIATO (pools +
   * marcado --rotacion-espera), sin arrancar el temporizador de rotación.
   * Reutiliza exactamente el flag _inmediato + la idempotencia por firma
   * que ya usa la rama mobile de iniciar() — no es mecanismo nuevo, es la
   * pieza que faltaba exponer para poder invocarla ANTES del layout en
   * desktop, donde recalcular() distribuye TODAS las secciones de una
   * (a diferencia de mobile, que solo arranca la sede activa).
   */
  function configurarInmediato(seccion) {
    configurar._inmediato = true;
    configurar(seccion);
    configurar._inmediato = false;
  }

  /**
   * DTI Modelo Temporal §10: telemetría del ciclo para el validador de
   * dispositivo — el equivalente de la telemetría de #ruta-m que cerró V-2.
   */
  function estadoCiclo(seccion) {
    if (!seccion) return null;
    const orden = leerJSONSeguro(seccion.dataset.cicloOrden) || [];
    const exhibidos = leerJSONSeguro(seccion.dataset.cicloExhibidos) || [];
    return {
      vuelta: Number(seccion.dataset.cicloVuelta || '0'),
      exhibidos: exhibidos.length,
      total: orden.length,
      faltantes: orden.filter((id) => !exhibidos.includes(id)),
    };
  }

  return { iniciar, detener, detenerTodo, pausar, reanudar, configurarInmediato, estadoCiclo };
})();
window.Rotacion = Rotacion;
