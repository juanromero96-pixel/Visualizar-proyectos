/**
 * lector.js
 * -----------------------------------------------------------------------
 * El "hover" (o el foco de teclado) ya trae una tarjeta al frente y la
 * agranda apenas — eso es una vista previa, vive en styles.css
 * (.elemento--enfocado) y no cambió. Esto es la interacción nueva: click,
 * tap o Enter abren el contenido completo en un lector ampliado, sobre
 * todo lo demás, pensado solo para leer.
 *
 * Es un único modal reutilizado (no uno por tarjeta), con dos formas de
 * llenarse según el tipo de elemento:
 *
 *   - Testimonio: Lector.abrir(el) — sin segundo argumento. Lee el DOM de
 *     la tarjeta tal como está en ese momento (foto, nombre, cargo, cita),
 *     porque la cita pudo haber sido sorteada al azar entre varias
 *     disponibles y tiene que coincidir exactamente con lo que la persona
 *     ya estaba viendo, no con un dato "genérico" de esa persona.
 *   - Registro de unidad académica o conceptual: Lector.abrir(el, registro)
 *     — con el registro completo de datos. A diferencia del testimonio,
 *     estos no rotan contenido: el mural solo muestra título + resumen
 *     recortado, y el cuerpo completo (texto, proyectos, cita de respaldo)
 *     vive únicamente en los datos, nunca en el DOM del mural — por eso
 *     hace falta pasarlo explícitamente en vez de leerlo de la tarjeta.
 */
const Lector = (() => {
  let superposicion, tarjeta, contenido, botonCerrar, elementoActivador = null;

  function iniciar() {
    superposicion = document.createElement('div');
    superposicion.className = 'lector-superposicion';

    superposicion.innerHTML = `
      <div class="lector-tarjeta" role="dialog" aria-modal="true" aria-label="Contenido completo">
        <button type="button" class="lector-cerrar" aria-label="Cerrar">✕</button>
        <div class="lector-contenido"></div>
      </div>
    `;
    document.body.appendChild(superposicion);

    tarjeta = superposicion.querySelector('.lector-tarjeta');
    contenido = superposicion.querySelector('.lector-contenido');
    botonCerrar = superposicion.querySelector('.lector-cerrar');

    botonCerrar.addEventListener('click', cerrar);
    superposicion.addEventListener('click', (evento) => {
      if (evento.target === superposicion) cerrar(); // clic en el fondo, no en la tarjeta
    });
    document.addEventListener('keydown', (evento) => {
      if (!estaAbierto()) return;
      if (evento.key === 'Escape') {
        cerrar();
      } else if (evento.key === 'Tab') {
        // El único elemento interactivo del modal es el botón de cerrar:
        // atraparlo ahí es simple y evita que Tab se escape al fondo
        // mientras el lector está abierto.
        evento.preventDefault();
        botonCerrar.focus();
      }
    });
  }

  function estaAbierto() {
    return superposicion.classList.contains('lector-superposicion--abierta');
  }

  /**
   * Abre el lector. Sin segundo argumento: comportamiento de testimonio
   * (lee el DOM). Con segundo argumento: un registro de unidad académica,
   * conceptual, o video — construido directamente desde sus datos completos.
   */
  function abrir(elementoOrigen, registro = null) {
    elementoActivador = elementoOrigen;
    contenido.innerHTML = '';

    if (!registro) {
      contenido.appendChild(construirContenidoTestimonio(elementoOrigen));
    } else if (registro._tipo === 'registro-ua') {
      contenido.appendChild(construirContenidoRegistroUA(registro, elementoOrigen));
    } else if (registro._tipo === 'registro-conceptual') {
      contenido.appendChild(construirContenidoRegistroConceptual(registro, elementoOrigen));
    } else if (registro._tipo === 'video' || registro.tipo === 'video') {
      // Los videos de multimedia.json llegan con _tipo derivado de tipo.
      // El lector los renderiza como un documento audiovisual: reproductor
      // embebido en la parte superior, metadatos institucionales debajo.
      contenido.appendChild(construirContenidoVideo(registro, elementoOrigen));
    }

    elementoOrigen.setAttribute('aria-expanded', 'true');
    document.body.classList.add('lector-bloqueando-scroll');
    superposicion.classList.add('lector-superposicion--abierta');
    window.setTimeout(() => botonCerrar.focus(), 60);
  }

  function construirContenidoTestimonio(elementoOrigen) {
    const foto = elementoOrigen.querySelector('.testimonio-foto')?.cloneNode(true);
    const nombre = elementoOrigen.querySelector('.testimonio-nombre')?.textContent || '';
    const cargo = elementoOrigen.querySelector('.testimonio-cargo')?.textContent || '';
    const institucion = elementoOrigen.querySelector('.testimonio-institucion')?.textContent || '';
    const cita = elementoOrigen.querySelector('.testimonio-cita')?.textContent || '';

    const envoltorio = document.createDocumentFragment();
    if (foto) {
      foto.className = 'lector-foto';
      envoltorio.appendChild(foto);
    }
    const cuerpo = document.createElement('div');
    cuerpo.className = 'lector-cuerpo';
    cuerpo.innerHTML = `
      <p class="lector-nombre">${nombre}</p>
      <p class="lector-cargo">${cargo}</p>
      <p class="lector-institucion">${institucion}</p>
      <blockquote class="lector-cita">${cita}</blockquote>
    `;
    envoltorio.appendChild(cuerpo);
    return envoltorio;
  }

  /**
   * Registro Institucional de Unidad Académica: badge de la sigla, título,
   * el cuerpo completo (no el resumen recortado del mural) en párrafos,
   * la lista de proyectos reales mencionados en la fuente, y una cita de
   * respaldo con atribución completa.
   */
  function construirContenidoRegistroUA(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-registro';

    const parrafos = String(registro.cuerpo || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${escaparHTMLLector(p.trim())}</p>`)
      .join('');

    const proyectosHTML = Array.isArray(registro.proyectos) && registro.proyectos.length
      ? `
        <div class="lector-registro-proyectos">
          <h3>Proyectos mencionados</h3>
          <ul>
            ${registro.proyectos
              .map((p) => `<li><strong>${escaparHTMLLector(p.nombre)}</strong> — ${escaparHTMLLector(p.sintesis)}</li>`)
              .join('')}
          </ul>
        </div>`
      : '';

    const citaHTML = registro.cita
      ? `<blockquote class="lector-registro-cita">${escaparHTMLLector(registro.cita)}<cite>— ${escaparHTMLLector(registro.citaAutor || '')}${registro.citaCargo ? `, ${escaparHTMLLector(registro.citaCargo)}` : ''}</cite></blockquote>`
      : '';

    envoltorio.innerHTML = `
      <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(registro.unidadAcademica || '')}</span>
      <p class="lector-registro-completa">${escaparHTMLLector(registro.unidadAcademicaCompleta || '')}</p>
      <h2 class="lector-registro-titulo">${escaparHTMLLector(registro.titulo)}</h2>
      <div class="lector-registro-cuerpo">${parrafos}</div>
      ${proyectosHTML}
      ${citaHTML}
    `;
    return envoltorio;
  }

  /**
   * Registro Conceptual: más austero — badge (UA o "Síntesis · Sede"),
   * título y el desarrollo completo de la idea en párrafos. Sin lista de
   * proyectos ni cita separada: las citas que respaldan la idea ya están
   * entretejidas dentro del propio cuerpo, con su atribución.
   */
  function construirContenidoRegistroConceptual(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-registro lector-registro--conceptual';

    const parrafos = String(registro.cuerpo || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${escaparHTMLLector(p.trim())}</p>`)
      .join('');

    const etiqueta = registro.unidadAcademica
      ? registro.unidadAcademica
      : `Síntesis · ${registro.sede.charAt(0).toUpperCase()}${registro.sede.slice(1)}`;

    envoltorio.innerHTML = `
      <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(etiqueta)}</span>
      <h2 class="lector-registro-titulo lector-registro-titulo--conceptual">${escaparHTMLLector(registro.titulo)}</h2>
      <div class="lector-registro-cuerpo">${parrafos}</div>
    `;
    return envoltorio;
  }

  // El color por unidad académica se calcula una sola vez, en app.js, al
  // construir cada tarjeta (única fuente de verdad) — acá solo se lee lo
  // que ya quedó guardado como variable CSS en la tarjeta de origen, sin
  // duplicar la lógica de la paleta en este archivo.
  function obtenerColorUADe(elementoOrigen) {
    const valor = getComputedStyle(elementoOrigen).getPropertyValue('--color-ua').trim();
    return valor || '#00a3e0';
  }

  function escaparHTMLLector(texto = '') {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Documento audiovisual: reproductor YouTube embebido (sin cookies, sin
   * sugerencias de YT) en la parte superior, metadatos institucionales
   * debajo. Se integra al mismo sistema de lectura que el resto del archivo.
   *
   * Seguridad: el iframe usa youtube-nocookie.com y sandbox restrictivo.
   * Autoplay: activa sólo el autoplay, sin autoplay en YT propiamente.
   */
  function construirContenidoVideo(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-video';

    const esTesti = registro.subtipo === 'testimonio_audiovisual';
    const tipoLabel = esTesti ? 'Testimonio audiovisual' : 'Video institucional';
    const autorHTML = registro.autor
      ? `<p class="lector-video-autor"><strong>Participante:</strong> ${escaparHTMLLector(registro.autor)}</p>`
      : '';

    // El iframe se crea como elemento DOM para poder anularlo on cerrar
    // (setear src = '' detiene la reproducción sin necesidad de YT API).
    envoltorio.innerHTML = `
      <div class="lector-video-reproductor">
        <div class="lector-video-ratio">
          <iframe
            class="lector-video-iframe"
            src="https://www.youtube-nocookie.com/embed/${escaparHTMLLector(registro.youtubeId)}?rel=0&modestbranding=1&autoplay=1"
            title="${escaparHTMLLector(registro.titulo)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      </div>
      <div class="lector-video-metadatos">
        <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(registro.unidadAcademica || '')}</span>
        <p class="lector-video-tipo">${escaparHTMLLector(tipoLabel)} · ${escaparHTMLLector(registro.fecha || 'Mayo 2026')}</p>
        <h2 class="lector-registro-titulo">${escaparHTMLLector(registro.titulo)}</h2>
        ${autorHTML}
        <p class="lector-video-ua-completa">${escaparHTMLLector(registro.unidadAcademicaCompleta || '')}</p>
        <p class="lector-video-descripcion">${escaparHTMLLector(registro.resumen || '')}</p>
      </div>
    `;
    return envoltorio;
  }

  function cerrar() {
    // Detener el video antes de cerrar el lector: setear src='' en el iframe
    // es equivalente a pausar sin necesitar la YT IFrame API.
    const iframe = superposicion.querySelector('.lector-video-iframe');
    if (iframe) iframe.src = '';

    superposicion.classList.remove('lector-superposicion--abierta');
    document.body.classList.remove('lector-bloqueando-scroll');
    elementoActivador?.setAttribute('aria-expanded', 'false');
    elementoActivador?.focus();
    elementoActivador = null;
  }

  return { iniciar, abrir };
})();

window.Lector = Lector;
