/**
 * animaciones.js
 * Microinteracciones discretas con GSAP (cargado como script global en
 * index.html, ver assets/vendor/). Cada función verifica que `window.gsap`
 * exista antes de animar: si el script vendor no llegó a cargar, el
 * contenido queda igual de visible y usable, solo sin la animación.
 * GSAP nunca es una dependencia para que el sitio funcione.
 */

/** Entrada escalonada de un conjunto de tarjetas (catálogo, destacados, búsqueda). */
export function animarEntradaTarjetas(contenedor) {
  if (typeof window.gsap === 'undefined' || !contenedor) return;
  const tarjetas = contenedor.querySelectorAll('.tarjeta-proyecto');
  if (!tarjetas.length) return;

  window.gsap.fromTo(
    tarjetas,
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06 }
  );
}

/** Entrada escalonada de los bloques editoriales de una ficha individual. */
export function animarEntradaFicha(contenedor) {
  if (typeof window.gsap === 'undefined' || !contenedor) return;
  const bloques = contenedor.querySelectorAll('.ficha-proyecto__cabecera, .ficha-proyecto__cita, .ficha-bloque');
  if (!bloques.length) return;

  window.gsap.fromTo(
    bloques,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.045 }
  );
}

/**
 * Transición discreta entre rutas: un fundido corto del contenedor
 * principal. Se registra una sola vez en el router (ver main.js) y se
 * aplica por igual a las cinco rutas y al 404, sin que cada handler
 * tenga que invocarla.
 */
export function animarTransicionVista(contenedor) {
  if (typeof window.gsap === 'undefined' || !contenedor) return;
  window.gsap.fromTo(contenedor, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
}
