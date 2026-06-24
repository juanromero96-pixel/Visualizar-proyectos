/**
 * carrusel.js
 * Carrusel de proyectos destacados para la portada, sobre Swiper
 * (cargado como script global en index.html, ver assets/vendor/).
 * Reutiliza crearTarjeta() de render-catalogo.js para que una ficha se
 * vea exactamente igual dentro del carrusel que en el catálogo: no se
 * duplica el armado visual de la tarjeta en dos lugares.
 *
 * Si Swiper no llegó a cargar, se degrada a una grilla estática (mismas
 * tarjetas, sin desplazamiento): el sitio sigue siendo completamente
 * navegable sin la librería.
 */

import { mapaUnidadesAcademicas } from './data.js';
import { crearTarjeta } from './render-catalogo.js';

let instanciaActual = null;

export function renderizarCarruselDestacados(contenedor, proyectos, categorias, opciones = {}) {
  if (instanciaActual) {
    instanciaActual.destroy(true, true);
    instanciaActual = null;
  }

  contenedor.innerHTML = '';

  if (!proyectos.length) {
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = opciones.mensajeVacio || 'Todavía no hay proyectos destacados configurados.';
    contenedor.append(vacio);
    return;
  }

  const unidades = mapaUnidadesAcademicas(categorias);

  if (typeof window.Swiper === 'undefined') {
    contenedor.classList.add('grilla-proyectos');
    proyectos.forEach((proyecto) => contenedor.append(crearTarjeta(proyecto, unidades)));
    return;
  }

  const raiz = document.createElement('div');
  raiz.className = 'swiper carrusel-destacados';
  raiz.setAttribute('aria-roledescription', 'carrusel');
  raiz.setAttribute('aria-label', 'Proyectos destacados');

  const envoltorio = document.createElement('div');
  envoltorio.className = 'swiper-wrapper';

  proyectos.forEach((proyecto) => {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    slide.append(crearTarjeta(proyecto, unidades));
    envoltorio.append(slide);
  });

  const paginacion = document.createElement('div');
  paginacion.className = 'swiper-pagination';

  const botonPrev = document.createElement('button');
  botonPrev.type = 'button';
  botonPrev.className = 'swiper-button-prev';

  const botonNext = document.createElement('button');
  botonNext.type = 'button';
  botonNext.className = 'swiper-button-next';

  raiz.append(envoltorio, paginacion, botonPrev, botonNext);
  contenedor.append(raiz);

  instanciaActual = new window.Swiper(raiz, {
    slidesPerView: 1,
    spaceBetween: 24,
    speed: 450,
    a11y: {
      enabled: true,
      prevSlideMessage: 'Proyecto destacado anterior',
      nextSlideMessage: 'Siguiente proyecto destacado',
      firstSlideMessage: 'Este es el primer proyecto destacado',
      lastSlideMessage: 'Este es el último proyecto destacado',
      paginationBulletMessage: 'Ir al proyecto destacado {{index}}',
    },
    keyboard: { enabled: true },
    pagination: { el: paginacion, clickable: true },
    navigation: { nextEl: botonNext, prevEl: botonPrev },
    breakpoints: {
      640: { slidesPerView: 2 },
      1024: { slidesPerView: 3 },
    },
  });
}
