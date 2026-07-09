/**
 * animations.js
 * -----------------------------------------------------------------------
 * Secuenciador narrativo. Cada sede reproduce su secuencia de entrada
 * (fondo → título → elementos en orden narrativo) UNA SOLA VEZ — la
 * primera vez que se vuelve a esa sede, ya no se repite ni se desarma.
 * No existe una versión "salir()": los elementos, una vez visibles,
 * permanecen en pantalla para siempre, tal como se pidió.
 */
const Secuenciador = (() => {
  const PAUSA_ANTES_DEL_TITULO = 280; // ms
  const SEPARACION_ENTRE_PASOS = 420; // ms

  let prefiereMovimientoReducido = false;
  const seccionesYaReveladas = new WeakSet();

  function iniciar() {
    prefiereMovimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _iniciarParalajeDeFondo();
  }

  function entrar(seccion) {
    if (!seccion || seccionesYaReveladas.has(seccion)) return; // ya se reveló: no se repite
    seccionesYaReveladas.add(seccion);

    const fondo = seccion.querySelector('.sede-bg');
    const kicker = seccion.querySelector('.sede-kicker');
    const elementos = Array.from(seccion.querySelectorAll('.elemento')).sort(
      (a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0)
    );

    if (prefiereMovimientoReducido) {
      fondo?.classList.add('sede-bg--visible');
      kicker?.classList.add('sede-kicker--visible');
      elementos.forEach((el) => el.classList.add('elemento--visible'));
      return;
    }

    fondo?.classList.add('sede-bg--visible');

    if (window.esMobile?.()) {
      // MOBILE: todas las anotaciones aparecen juntas tras la aparición del fondo.
      // El comportamiento requerido es: "visualizarse todos de una y después
      // empezar el juego de animaciones (desaparecer de a una y cambiar por otras)".
      // Rotacion.iniciar tiene delay=INICIO_DELAY_MS (2500ms) — da tiempo suficiente
      // para que el visitante vea el mural completo antes de que comience la
      // rotación de satélites.
      const PAUSA_MOBILE = 320; // ms — tiempo mínimo para que el fondo sea visible
      window.setTimeout(() => {
        kicker?.classList.add('sede-kicker--visible');
        elementos.forEach((el) => el.classList.add('elemento--visible'));
      }, PAUSA_MOBILE);
      return;
    }

    // DESKTOP: reveal escalonado por orden narrativo (sin cambios)
    window.setTimeout(() => kicker?.classList.add('sede-kicker--visible'), PAUSA_ANTES_DEL_TITULO);

    elementos.forEach((el, indice) => {
      const tiempo = PAUSA_ANTES_DEL_TITULO + SEPARACION_ENTRE_PASOS * (indice + 1);
      window.setTimeout(() => el.classList.add('elemento--visible'), tiempo);
    });
  }

  // Paralaje de fondo en scroll — sin cambios respecto a la versión anterior.
  function _iniciarParalajeDeFondo() {
    const esEscritorio = window.matchMedia('(min-width: 821px)').matches;
    if (!esEscritorio || prefiereMovimientoReducido) return;

    const fondos = document.querySelectorAll('.sede-bg');
    if (!fondos.length) return;

    let cuadroPendiente = null;
    const actualizar = () => {
      fondos.forEach((fondo) => {
        const rect = fondo.parentElement.getBoundingClientRect();
        const avance = rect.left / window.innerWidth;
        fondo.style.transform = `translate3d(${avance * -22}px, 0, 0) scale(1.06)`;
      });
      cuadroPendiente = null;
    };

    window.addEventListener('scroll', () => {
      if (cuadroPendiente) return;
      cuadroPendiente = requestAnimationFrame(actualizar);
    }, { passive: true });
    actualizar();
  }

  return { iniciar, entrar };
})();

window.Secuenciador = Secuenciador;
