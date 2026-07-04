/**
 * app.js
 * -----------------------------------------------------------------------
 * Arma la escena pública a partir de los datos en /data. La posición de
 * cada elemento se resuelve en js/layout.js; la cita que muestra cada
 * tarjeta de testimonio se resuelve acá mismo, al entrar a la sede.
 */
(async function iniciarSitio() {
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
  // Distribuidor.distribuir(s) tiene su propio guard en layout.js L60:
  //   if (!window.matchMedia('(min-width: 821px)').matches) return;
  // → En mobile sale solo. El posicionamiento mobile lo resuelve mobile.css.
  // → No hay fork JS, no hay segundo motor, no hay condición de carrera.
  const recalcular = () => {
    console.log('[App.recalcular] innerWidth=' + window.innerWidth +
                ' esMobile=' + (window.esMobile?.() ?? '—') +
                ' es-mobile=' + document.documentElement.classList.contains('es-mobile'));
    secciones.forEach((s) => Distribuidor.distribuir(s));
  };

  // Antes de la primera distribución: se decide qué autoridades de alcance
  // UNaM se muestran en cada sede (nunca las cinco a la vez — ver
  // aplicarSubconjuntoDeAutoridades). Esto tiene que pasar ANTES de
  // recalcular() para que el motor de distribución ya calcule las
  // posiciones sabiendo cuáles van a estar realmente visibles, en vez de
  // reservarles a las autoridades descartadas un lugar que después queda
  // invisible.
  secciones.forEach((s) => aplicarSubconjuntoDeAutoridades(s, testimonios));
  recalcular();

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
    recalcular();
    // Rotacion arranca en desktop; en mobile Rotacion.iniciar() sale solo
    if (secciones[0]) Rotacion.iniciar(secciones[0]);
  });

  let pendienteResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(pendienteResize);
    pendienteResize = setTimeout(recalcular, 180);
  });

  iniciarInteraccionDeEnfoque(secciones);
  Lector.iniciar();
  window.Mobile?.inicializar(); // solo configura bottom sheets, no toca el DOM del mural
  Secuenciador.iniciar();

  const carrusel = new Carrusel({
    contenedor,
    secciones,
    onCambio: (indice, seccionNueva) => {
      actualizarRuta(indice);
      aplicarSubconjuntoDeAutoridades(seccionNueva, testimonios);
      Secuenciador.entrar(seccionNueva);
      refrescarCitas(seccionNueva, testimonios);
      // Rotacion.iniciar() tiene su propio guard: sale si esMobile()
      Rotacion.iniciar(seccionNueva);
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

  // --ua-order: permite que CSS (propiedad `order` en flex column) agrupe
  // los elementos por UA en mobile SIN mover ningún nodo del DOM.
  // Esquema multiplicado: uaBase*2 + tipoOffset.
  //   tipoOffset=0 → narrador UA (registro-ua) va PRIMERO dentro de su UA
  //   tipoOffset=1 → todos los satélites van después del narrador
  // Ejemplo Posadas: FHyCS-narrador→order=0, FHyCS-videos/testi→order=1,
  //                  FCEQyN-narrador→order=2, FCEQyN-sat→order=3, etc.
  const UA_ORDER = {
    fhycs:0, fceqyn:1, fce:2,           // Posadas
    fayd:3,  fi:4,                        // Oberá
    fcf:5,   escuelaagrotecnicaeldorado:6,// Eldorado
    general:7,
    unam:9,                               // Autoridades UNaM siempre al final
  };
  const uaBase      = UA_ORDER[ua] ?? 8;
  const tipoOffset  = item._tipo === 'registro-ua' ? 0 : 1;
  el.style.setProperty('--ua-order', uaBase * 2 + tipoOffset);

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

  if (item.foto) {
    figura.innerHTML = `<img src="${item.foto}" alt="${escaparHTML(item.nombreCompleto)}" loading="lazy">`;
    figura.querySelector('img').addEventListener('error', () => figura.classList.add('testimonio-foto--rota'));
  } else {
    const iniciales = inicialesDe(item.nombreCompleto);
    const color = PALETA_MONOGRAMA[hashSimple(item.nombreCompleto) % PALETA_MONOGRAMA.length];
    figura.innerHTML = `<div class="testimonio-monograma" style="--color-monograma:${color}">${iniciales}</div>`;
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'testimonio-cuerpo';
  cuerpo.innerHTML = `
    <p class="testimonio-nombre">${escaparHTML(item.nombreCompleto)}</p>
    <p class="testimonio-cargo">${escaparHTML(item.cargo)}</p>
    <p class="testimonio-institucion">${escaparHTML(item.institucion)}</p>
    <blockquote class="testimonio-cita">${escaparHTML(citas.reduce((mas, c) => (c.length > mas.length ? c : mas), ''))}</blockquote>
    <span class="testimonio-expandir" aria-hidden="true">Ver relato ↗</span>
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
  interior.style.setProperty('--ancho-registro', '290px');  // +20px vs anterior, refuerza jerarquía Nivel 1
  interior.innerHTML = `
    <span class="registro-ua-badge">${escaparHTML(item.unidadAcademica || '')}</span>
    <h3 class="registro-titulo">${escaparHTML(item.titulo)}</h3>
    <p class="registro-resumen">${escaparHTML(item.resumen)}</p>
    <span class="registro-expandir" aria-hidden="true">Ver experiencia ↗</span>
  `;
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
    <span class="registro-conceptual-expandir" aria-hidden="true">Leer registro ↗</span>
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
      <span class="video-expandir" aria-hidden="true">▶ Ver video →</span>
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
 * Los testimonios ocultados no solo bajan su opacidad: se excluyen del
 * cálculo de layout.js por completo (clase `elemento--oculto-autoridad`,
 * ver layout.js), así que el resto de la escena reclama ese espacio de
 * verdad en vez de dejarlo reservado e invisible.
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

  // Solo vale la pena recalcular el layout si el conjunto visible
  // realmente cambió (la primera vez que se llama, antes de la primera
  // distribución general, igual conviene dejar que el recalcular() de
  // iniciarSitio() se encargue una sola vez para las tres sedes juntas).
  if (huboCambios && seccion.dataset.yaDistribuidoUnaVez === 'true') {
    // En mobile el layout es CSS vertical con capítulos UA — el motor de
    // distribución espacial (Distribuidor) posicionaría absolutamente todos
    // los elementos, destruyendo la reorganización editorial ya construida.
    // La guardia esMobile() previene que aplicarSubconjuntoDeAutoridades,
    // llamada en cada cambio de sede desde el Carrusel, sobrescriba el layout.
    if (!(window.esMobile && window.esMobile())) {
      Distribuidor.distribuir(seccion);
    }
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
function resolverUA(texto) {
  if (!texto) return 'general';
  if (texto === 'UNaM') return 'unam';
  // Extraer sigla del paréntesis final: "... (FAyD)" → "fayd"
  const m = texto.match(/\(([A-Za-z]+(?:[A-Za-z]|\d)*)\)\s*$/);
  if (m) return normalizarClave(m[1]);
  // Si el texto ya es corto (sigla directa como "FAyD", "FI")
  if (texto.length <= 12 && !/\s{2,}/.test(texto)) return normalizarClave(texto);
  // Nombre largo sin paréntesis: EAE, nombres completos sin sigla
  return normalizarClave(texto);
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
  const ORDEN_UA = ['fhycs','fceqyn','fce','fayd','fi','fcf','escuelaagrotecnicaeldorado','unam','general'];

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

  function calcularCapacidad() {
    return Math.max(8, Math.min(22, Math.round(window.innerWidth * window.innerHeight / 120000)));
  }

  function tipoPrioridad(el) {
    return PRIORIDAD_TIPO[el.dataset.tipo] ?? 99;
  }

  function ocultarConFade(el) {
    el.style.transition = `opacity ${FADE_SALIDA_MS}ms ease`;
    el.classList.add('elemento--rotacion-espera');
  }

  function mostrarConFade(el) {
    el.style.transition = `opacity ${FADE_ENTRADA_MS}ms ease`;
    el.classList.remove('elemento--rotacion-espera');
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
  function configurar(seccion) {
    if (!seccion) return;
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    const candidatos = Array.from(
      escenario.querySelectorAll('.elemento--visible:not(.elemento--oculto-autoridad)')
    );

    const permanentes  = candidatos.filter((el) => el.dataset.permanente === 'true');
    const uasConNarradores = [...new Set(permanentes.map((el) => el.dataset.ua))];
    const capacidad = calcularCapacidad();

    // Para cada UA con un narrador, seleccionar sus mejores satélites
    const SLOTS_POR_UA = Math.max(1, Math.min(3,
      Math.floor((capacidad - permanentes.length) / Math.max(1, uasConNarradores.length))
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

    // Mostrar los seleccionados (sin transición — ya deberían estar visibles)
    poolActivo.forEach((el) => {
      el.style.transition = '';
      el.classList.remove('elemento--rotacion-espera');
    });

    // Ocultar los demás con fade escalonado
    poolEspera.forEach((el, i) => {
      window.setTimeout(() => ocultarConFade(el), i * 80 + 300);
    });
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
  function rotarUno() {
    if (!poolActivo.length || !poolEspera.length) return;

    const genEsteCallback = generacion; // captura antes del setTimeout

    const iEntrante = cursorEspera % poolEspera.length;
    cursorEspera++;
    const entrante = poolEspera[iEntrante];
    const uaEntrante = entrante.dataset.ua;

    let iSaliente = poolActivo.findIndex((el) => el.dataset.ua === uaEntrante && el.dataset.permanente !== 'true');
    if (iSaliente < 0) {
      iSaliente = poolActivo.findIndex((el) => el.dataset.ua !== 'unam' && el.dataset.permanente !== 'true');
    }
    if (iSaliente < 0) iSaliente = 0;

    const saliente = poolActivo[iSaliente];
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

      if (cursorEspera >= poolEspera.length) cursorEspera = 0;

      poolActivo.push(entrante);
      poolEspera.push(saliente);
      poolEspera.sort((a, b) => {
        const uaA = ORDEN_UA.indexOf(a.dataset.ua);
        const uaB = ORDEN_UA.indexOf(b.dataset.ua);
        if (uaA !== uaB) return (uaA < 0 ? 99 : uaA) - (uaB < 0 ? 99 : uaB);
        return tipoPrioridad(a) - tipoPrioridad(b);
      });
      mostrarConFade(entrante);
    }, FADE_SALIDA_MS + 80);
  }

  function iniciar(seccion) {
    // En mobile el layout es CSS flow — todos los elementos son visibles
    // simultáneamente en scroll vertical. La rotación (que oculta elementos
    // con opacity:0) no tiene sentido y además conflictuaría con el CSS
    // que muestra todos los .elemento. El guard esMobile() previene que
    // se corra cualquier lógica de ocultamiento sobre elementos en flujo.
    if (window.esMobile && window.esMobile()) return;
    detener();
    if (!seccion) return;
    timeoutId = window.setTimeout(() => {
      configurar(seccion);
      if (poolEspera.length > 0) {
        intervalId = window.setInterval(rotarUno, INTERVALO_MS);
      }
    }, INICIO_DELAY_MS);
  }

  function detener() {
    generacion++; // invalida cualquier setTimeout pendiente de rotarUno()
    if (intervalId) { window.clearInterval(intervalId); intervalId = null; }
    if (timeoutId)  { window.clearTimeout(timeoutId);   timeoutId  = null; }

    // BUG FIX CRÍTICO (Bug 03):
    // Quitar la clase de "espera" de CUALQUIER elemento que la tenga, sin
    // importar de qué sede o pool provenga. Si detener() se llama mientras
    // un elemento está a mitad de su fade-out (saliente con la clase ya
    // aplicada pero el setTimeout aún pendiente), ese elemento quedaría
    // permanentemente oculto y excluido de todos los pools sin recuperación.
    // Al restaurar aquí, ningún elemento puede quedar atrapado en ese estado.
    document.querySelectorAll('.elemento--rotacion-espera').forEach((el) => {
      el.classList.remove('elemento--rotacion-espera');
      el.style.transition = '';
    });

    poolActivo   = [];
    poolEspera   = [];
    cursorEspera = 0;
  }

  return { iniciar, detener };
})();
