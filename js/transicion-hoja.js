/**
 * transicion-hoja.js
 * Transición de "pasar de hoja" entre proyectos de la misma carpeta.
 *
 * Historial de esta función (para no repetir los mismos errores):
 * 1) Velo de 3 paneles de color sólido cubriendo la pantalla — se
 *    descartó porque nunca se veía contenido real moviéndose.
 * 2) Folio superpuesto con desplazamiento ASIMÉTRICO (saliente se movía
 *    solo 10%, entrante 100%) — se descartó porque, a velocidades tan
 *    distintas, había una franja donde ninguna de las dos cubría del
 *    todo la pantalla y el texto de ambas se mezclaba.
 * 3) Desplazamiento en espejo (misma distancia, mismo tiempo) — esto
 *    resolvió la mezcla de texto, pero medido cuadro por cuadro con
 *    requestAnimationFrame (no con sondeos manuales, que generan su
 *    propio jank) apareció un freeze real de ~80ms justo al arrancar:
 *    construir toda la ficha nueva (20-30 elementos) bloquea el hilo
 *    principal antes de que la animación llegue a moverse un píxel.
 *    Eso es lo que se percibía como "el texto cae a su posición".
 *
 * Esta versión reordena el trabajo: primero se posiciona la hoja
 * entrante FUERA de pantalla (gsap.set, prácticamente gratis), recién
 * ahí se construye su contenido (el costo pesado pasa "escondido",
 * fuera de cuadro, en vez de a mitad de un movimiento ya visible), y el
 * timeline se arranca en el siguiente frame del navegador
 * (requestAnimationFrame) para asegurar que ese estado inicial ya se
 * pintó antes de empezar a animar.
 */

let transicionEnCurso = false;

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

  const signo = direccion === 'siguiente' ? 1 : -1;

  // 1) Posicionar fuera de pantalla PRIMERO — esto es instantáneo.
  window.gsap.set(capaEntrante, { xPercent: signo * 100 });

  // 2) Construir el contenido nuevo DENTRO de ese elemento ya off-screen:
  // el costo de armar toda la ficha pasa mientras no se ve nada raro,
  // no a mitad de un deslizamiento ya empezado.
  renderizarEnDestino(capaEntrante);

  return new Promise((resolve) => {
    // 3) Recién en el siguiente frame se arranca la animación, para
    // garantizar que el navegador ya pintó el estado "fuera de
    // pantalla" antes de que algo se mueva.
    requestAnimationFrame(() => {
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
        .to(capaSaliente, { xPercent: signo * -100, opacity: 0.6, scale: 0.97, duration: 0.45, ease: 'power3.inOut' }, 0)
        .to(capaEntrante, { xPercent: 0, duration: 0.45, ease: 'power3.inOut' }, 0);
    });
  });
}
