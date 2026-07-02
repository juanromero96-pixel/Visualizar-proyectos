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

  const recalcular = () => secciones.forEach((s) => Distribuidor.distribuir(s));

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
  if (document.fonts?.ready) document.fonts.ready.then(recalcular);

  let pendienteResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(pendienteResize);
    pendienteResize = setTimeout(recalcular, 180);
  });

  iniciarInteraccionDeEnfoque(secciones);
  Lector.iniciar();

  Secuenciador.iniciar();

  const carrusel = new Carrusel({
    contenedor,
    secciones,
    onCambio: (indice, seccionNueva) => {
      actualizarRuta(indice);
      // Se vuelve a sortear el conjunto de autoridades visibles ANTES de
      // intentar revelar — si es la primera vez que se entra a esta sede,
      // el Secuenciador necesita encontrar ya decidido quién se muestra;
      // si ya se había revelado antes, esta misma llamada se encarga de
      // mostrar/ocultar y reacomodar el resto (ver más abajo).
      aplicarSubconjuntoDeAutoridades(seccionNueva, testimonios);
      Secuenciador.entrar(seccionNueva); // si ya se reveló antes, esto no hace nada
      refrescarCitas(seccionNueva, testimonios); // esto sí corre siempre, aunque ya se haya visitado
    },
  });

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
  // Actualiza el título de la pestaña del navegador.
  // El bloque visual .encabezado-evento fue eliminado del HTML (redundante
  // con el panel del cajero institucional) — esta función ya no necesita
  // actualizar esos tres nodos DOM.
  document.title = config.evento.nombre;
  const chip = document.querySelector('.marca-chip');
  if (chip) {
    chip.querySelector('.marca-chip-texto').textContent = config.marca.badge;
    const logo = chip.querySelector('.marca-chip-logo');
    if (logo) logo.src = config.marca.logoPath;
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
  });
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
    // Tratamiento diferencial para autoridades de alcance UNaM (Documento
    // Técnico, sección 8.2): borde izquierdo más grueso y tipografía del
    // nombre levemente mayor, para que su carácter institucional no se
    // confunda con el resto de los testimonios sin romper la coherencia
    // visual general (es una variación sutil, no un rediseño).
    if (item.institucion === 'UNaM') el.classList.add('elemento--testimonio-institucional');
    el.style.setProperty('--color-ua', colorDeUnidadAcademica(item.institucion));
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
    interior.innerHTML = `
      <video poster="${item.poster || ''}" controls preload="none"><source src="${item.src}"></video>
      ${item.caption ? `<p class="elemento-caption">${escaparHTML(item.caption)}</p>` : ''}
    `;
    // <video> no falla tan prolijo como <img>: si el archivo no existe,
    // el reproductor nativo queda visible vacío en vez de desaparecer.
    // Acá se oculta toda la tarjeta apenas falla la carga, igual que con
    // las fotos — antes esto no estaba y un video sin archivo real
    // quedaba como ruido visual permanente en la escena.
    const video = interior.querySelector('video');
    video.addEventListener('error', () => el.classList.add('elemento--sin-imagen'), true);
    video.querySelector('source').addEventListener('error', () => el.classList.add('elemento--sin-imagen'));
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
  interior.style.setProperty('--ancho-registro', '270px');
  interior.innerHTML = `
    <span class="registro-ua-badge">${escaparHTML(item.unidadAcademica || '')}</span>
    <h3 class="registro-titulo">${escaparHTML(item.titulo)}</h3>
    <p class="registro-resumen">${escaparHTML(item.resumen)}</p>
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
  `;
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
 */
function iniciarInteraccionDeEnfoque(secciones) {
  secciones.forEach((seccion) => {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    escenario.querySelectorAll('.elemento').forEach((el) => {
      const activar = () => {
        escenario.classList.add('escenario--enfocando');
        el.classList.add('elemento--enfocado');
        el.style.zIndex = 999;
      };
      const desactivar = () => {
        escenario.classList.remove('escenario--enfocando');
        el.classList.remove('elemento--enfocado');
        el.style.zIndex = '';
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
