/**
 * transicion-hoja.js
 * Transición de "pasar de hoja" entre proyectos de la misma carpeta.
 *
 * Historial de esta función (para no repetir los mismos errores):
 * 1) Velo de 3 paneles de color sólido cubriendo la pantalla — se
 *    descartó porque nunca se veía contenido real moviéndose.
 * 2) Folio superpuesto con desplazamiento ASIMÉTRICO (saliente se movía
 *    solo 10%, entrante 100%) — se descartó porque, al moverse a
 *    velocidades tan distintas, había una franja ancha donde ninguna
 *    de las dos hojas cubría del todo esa zona de la pantalla: el
 *    texto de ambas quedaba visible y se mezclaba (esto es justo lo
 *    que se veía "raro" — no era un detalle de pulido, era un defecto
 *    de movimiento).
 *
 * Esta versión — desplazamiento EN ESPEJO — mueve las dos hojas la
 * MISMA distancia (100%) y al mismo tiempo: la saliente se va del
 * cuadro exactamente al ritmo en que la entrante lo ocupa, como una
 * tira de película. Nunca hay una zona donde ninguna de las dos cubra
 * por completo, así que nunca hay texto de las dos mezclándose.
 */

let transicionEnCurso = false;

/**
 * `contenedor` es el nodo cuyo contenido se está reemplazando (#app).
 * `direccion` es 'siguiente' o 'anterior'. `renderizarEnDestino(nodo)`
 * debe renderizar la ficha nueva DENTRO del nodo que se le pasa (no en
 * `contenedor` directamente).
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

  const signo = direccion === 'siguiente' ? 1 : -1;

  window.gsap.set(capaEntrante, { xPercent: signo * 100 });

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
      // Las dos se mueven la MISMA distancia (100%), al mismo tiempo,
      // con el mismo easing: por eso quedan siempre "pegadas" sin
      // superponerse ni dejar un hueco. La opacidad y la escala de la
      // saliente son puramente cosméticas — ya no hacen falta para
      // tapar nada, porque la posición sola ya resuelve la separación.
      .to(capaSaliente, { xPercent: signo * -100, opacity: 0.6, scale: 0.97, duration: 0.45, ease: 'power3.inOut' }, 0)
      .to(capaEntrante, { xPercent: 0, duration: 0.45, ease: 'power3.inOut' }, 0);
  });
}
