/**
 * app.js
 * -----------------------------------------------------------------------
 * Arma la escena pública a partir de los datos en /data. La posición de
 * cada elemento se resuelve en js/layout.js; la cita que muestra cada
 * tarjeta de testimonio se resuelve acá mismo, al entrar a la sede.
 */
(async function iniciarSitio() {
  let sedes, testimonios, multimedia, config;
  try {
    [sedes, testimonios, multimedia, config] = await Promise.all([
      Almacen.cargar('sedes'),
      Almacen.cargar('testimonios'),
      Almacen.cargar('multimedia'),
      Almacen.cargar('config'),
    ]);
  } catch (error) {
    mostrarErrorCarga(error);
    return;
  }

  const sedesVisibles = sedes.filter((s) => s.visible).sort((a, b) => a.orden - b.orden);

  pintarEncabezado(config);
  pintarSedes(sedesVisibles, testimonios, multimedia);
  pintarRuta(sedesVisibles);

  const contenedor = document.getElementById('carrusel');
  const secciones = Array.from(contenedor.querySelectorAll('.sede'));

  const recalcular = () => secciones.forEach((s) => Distribuidor.distribuir(s));
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

  Secuenciador.iniciar();

  const carrusel = new Carrusel({
    contenedor,
    secciones,
    onCambio: (indice, seccionNueva) => {
      actualizarRuta(indice);
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
  document.title = config.evento.nombre;
  const chip = document.querySelector('.marca-chip');
  if (chip) {
    chip.querySelector('.marca-chip-texto').textContent = config.marca.badge;
    const logo = chip.querySelector('.marca-chip-logo');
    if (logo) logo.src = config.marca.logoPath;
  }
  const tituloEvento = document.querySelector('.encabezado-evento-titulo');
  if (tituloEvento) tituloEvento.textContent = config.evento.nombre;
  const bajadaEvento = document.querySelector('.encabezado-evento-bajada');
  if (bajadaEvento) bajadaEvento.textContent = config.evento.bajada;
  const fechasEvento = document.querySelector('.encabezado-evento-fechas');
  if (fechasEvento) fechasEvento.textContent = config.evento.fechas;
}

function pintarSedes(sedesVisibles, testimonios, multimedia) {
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
  if (longitud < 70) return 230;
  if (longitud < 140) return 270;
  if (longitud < 220) return 310;
  if (longitud < 320) return 350;
  return 390;
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
