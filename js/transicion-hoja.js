/**
 * transicion-hoja.js
 * Efecto de "pasar de hoja" entre proyectos de la misma carpeta/unidad
 * académica. Idea tomada del repo codrops/PageFlipLayout (un barrido de
 * paneles sólidos que cubre la pantalla y se retira, sin curvatura ni
 * perspectiva 3D — el rotate3d que usa ese demo es un hack de
 * renderizado de un grado, no un giro visible) pero reconstruida nativa
 * con el GSAP que ya usa el resto del sitio, no con TweenMax.
 *
 * No se usa para la navegación genérica entre rutas (esa sigue siendo
 * animarTransicionVista, sin tocar): esto es específico para "siguiente
 * hoja / hoja anterior" dentro de una ficha.
 */

let transicionEnCurso = false;

export function animarPasarHoja(direccion, ejecutarCambioDeContenido) {
  if (typeof window.gsap === 'undefined') {
    // Sin GSAP disponible: el cambio de contenido ocurre igual, solo
    // sin la animación de barrido. Nunca bloquea la navegación.
    ejecutarCambioDeContenido();
    return Promise.resolve();
  }

  if (transicionEnCurso) {
    ejecutarCambioDeContenido();
    return Promise.resolve();
  }
  transicionEnCurso = true;

  const overlay = document.createElement('div');
  overlay.className = 'transicion-hoja';
  overlay.setAttribute('aria-hidden', 'true');

  const paneles = [];
  for (let i = 0; i < 3; i += 1) {
    const panel = document.createElement('div');
    panel.className = 'transicion-hoja__panel';
    overlay.append(panel);
    paneles.push(panel);
  }
  document.body.append(overlay);

  window.gsap.set(paneles, { xPercent: direccion === 'siguiente' ? 100 : -100 });

  return new Promise((resolve) => {
    const linea = window.gsap.timeline({
      onComplete: () => {
        overlay.remove();
        transicionEnCurso = false;
        resolve();
      },
    });

    paneles.forEach((panel, indice) => {
      linea.to(panel, { xPercent: 0, duration: 0.28, ease: 'power2.inOut' }, indice * 0.05);
    });

    linea.call(ejecutarCambioDeContenido);

    paneles.forEach((panel, indice) => {
      linea.to(panel, {
        xPercent: direccion === 'siguiente' ? -100 : 100,
        duration: 0.32,
        ease: 'power2.inOut',
      }, `+=${indice === 0 ? 0.02 : 0}`);
    });
  });
}
