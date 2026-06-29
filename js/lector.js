/**
 * lector.js
 * -----------------------------------------------------------------------
 * El "hover" (o el foco de teclado) ya trae una tarjeta al frente y la
 * agranda apenas — eso es una vista previa, vive en styles.css
 * (.elemento--enfocado) y no cambió. Esto es la interacción nueva: click,
 * tap o Enter abren la cita completa en un lector ampliado, sobre todo lo
 * demás, pensado solo para leer.
 *
 * Es un único modal reutilizado (no uno por tarjeta): se construye una
 * vez al arrancar y se completa con el contenido de la tarjeta que se
 * activó, leyendo el DOM tal como está en ese momento — así siempre
 * coincide con lo que la persona ya estaba viendo (incluida la cita que
 * haya tocado en el sorteo), sin depender de los datos originales.
 */
const Lector = (() => {
  let superposicion, tarjeta, contenido, botonCerrar, elementoActivador = null;

  function iniciar() {
    superposicion = document.createElement('div');
    superposicion.className = 'lector-superposicion';

    superposicion.innerHTML = `
      <div class="lector-tarjeta" role="dialog" aria-modal="true" aria-label="Testimonio completo">
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
   * Abre el lector con el contenido ACTUAL de una tarjeta de testimonio
   * (se lee del DOM, no de los datos originales, para mostrar exactamente
   * la foto/monograma y la cita que la persona ya estaba viendo).
   */
  function abrir(elementoOrigen) {
    elementoActivador = elementoOrigen;

    const foto = elementoOrigen.querySelector('.testimonio-foto')?.cloneNode(true);
    const nombre = elementoOrigen.querySelector('.testimonio-nombre')?.textContent || '';
    const cargo = elementoOrigen.querySelector('.testimonio-cargo')?.textContent || '';
    const institucion = elementoOrigen.querySelector('.testimonio-institucion')?.textContent || '';
    const cita = elementoOrigen.querySelector('.testimonio-cita')?.textContent || '';

    contenido.innerHTML = '';
    if (foto) {
      foto.className = 'lector-foto';
      contenido.appendChild(foto);
    }
    const cuerpo = document.createElement('div');
    cuerpo.className = 'lector-cuerpo';
    cuerpo.innerHTML = `
      <p class="lector-nombre">${nombre}</p>
      <p class="lector-cargo">${cargo}</p>
      <p class="lector-institucion">${institucion}</p>
      <blockquote class="lector-cita">${cita}</blockquote>
    `;
    contenido.appendChild(cuerpo);

    elementoOrigen.setAttribute('aria-expanded', 'true');
    document.body.classList.add('lector-bloqueando-scroll');
    superposicion.classList.add('lector-superposicion--abierta');
    window.setTimeout(() => botonCerrar.focus(), 60); // tras la transición de entrada
  }

  function cerrar() {
    superposicion.classList.remove('lector-superposicion--abierta');
    document.body.classList.remove('lector-bloqueando-scroll');
    elementoActivador?.setAttribute('aria-expanded', 'false');
    elementoActivador?.focus();
    elementoActivador = null;
  }

  return { iniciar, abrir };
})();

window.Lector = Lector;
