/**
 * transicion-hoja.js
 * Transición de "pasar de hoja" entre proyectos de la misma carpeta.
 *
 * Versión anterior (descartada): un velo de 3 paneles de color sólido
 * cubría toda la pantalla, y el contenido cambiaba escondido detrás.
 * El problema diagnosticado: nunca se ve contenido real moviéndose, así
 * que lee como un efecto técnico abstracto, no como una hoja física.
 *
 * Esta versión — "folio superpuesto" — anima el contenido real:
 * - la hoja saliente se desplaza y pierde protagonismo (opacidad y
 *   escala bajan progresivamente, no desaparece de golpe);
 * - la hoja entrante llega desde el lado correspondiente y se
 *   superpone brevemente con la saliente (ambas visibles a la vez);
 * - un borde lateral fino + sombra suave en cada capa simula el canto
 *   de una hoja de papel, sin texturas ni 3D.
 */

let transicionEnCurso = false;

/**
 * `contenedor` es el nodo cuyo contenido se está reemplazando (#app).
 * `direccion` es 'siguiente' o 'anterior'. `renderizarEnDestino(nodo)`
 * debe renderizar la ficha nueva DENTRO del nodo que se le pasa (no en
 * `contenedor` directamente) — main.js le pasa la misma función que ya
 * usaba, adaptada para aceptar el contenedor de destino.
 */
export function animarPasarHoja(contenedor, direccion, renderizarEnDestino) {
  if (typeof window.gsap === 'undefined' || transicionEnCurso) {
    renderizarEnDestino(contenedor);
    return Promise.resolve();
  }
  transicionEnCurso = true;

  const alturaActual = contenedor.offsetHeight;
  contenedor.style.minHeight = `${alturaActual}px`;
  contenedor.classList.add('hoja-transicion__contenedor');

  const capaSaliente = document.createElement('div');
  capaSaliente.className = 'hoja-transicion__capa hoja-transicion__capa--saliente';
  while (contenedor.firstChild) capaSaliente.append(contenedor.firstChild);

  const capaEntrante = document.createElement('div');
  capaEntrante.className = 'hoja-transicion__capa hoja-transicion__capa--entrante';

  contenedor.append(capaSaliente, capaEntrante);
  renderizarEnDestino(capaEntrante);

  const entraDesde = direccion === 'siguiente' ? 100 : -100;
  const saleHacia = direccion === 'siguiente' ? -10 : 10;

  window.gsap.set(capaEntrante, { xPercent: entraDesde, opacity: 0.85 });

  return new Promise((resolve) => {
    window.gsap.timeline({
      onComplete: () => {
        while (capaEntrante.firstChild) contenedor.append(capaEntrante.firstChild);
        capaSaliente.remove();
        capaEntrante.remove();
        contenedor.classList.remove('hoja-transicion__contenedor');
        contenedor.style.minHeight = '';
        transicionEnCurso = false;
        resolve();
      },
    })
      .to(capaSaliente, { xPercent: saleHacia, opacity: 0.4, scale: 0.985, duration: 0.52, ease: 'power3.out' }, 0)
      .to(capaEntrante, { xPercent: 0, opacity: 1, duration: 0.56, ease: 'power3.out' }, 0.1);
  });
}
