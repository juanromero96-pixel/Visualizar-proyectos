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
  let prefiereMovimientoReducido = false;
  const seccionesYaReveladas = new WeakSet();

  function iniciar() {
    prefiereMovimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _iniciarParalajeDeFondo();
  }

  /**
   * DTI Modelo Temporal §5.2 (E1): composición inmediata. El camino que
   * antes existía SOLO para prefers-reduced-motion (revelar todo de una,
   * sin escalonar) se vuelve el camino ÚNICO — el mural debe estar completo
   * en el primer paint en ambos canales. Se retiran PAUSA_ANTES_DEL_TITULO,
   * SEPARACION_ENTRE_PASOS y PAUSA_MOBILE (constantes de stagger, sin uso
   * en el nuevo modelo) y la bifurcación mobile/desktop de esta función:
   * ya no hace falta, ambas quedaban destino al mismo resultado (todo
   * visible), solo con distinto tiempo de llegada.
   *
   * `.sede--componiendo` suprime la transición de entrada (css/styles.css)
   * mientras se aplican las clases --visible; se retira con doble
   * requestAnimationFrame — un ciclo de pintado real ocurre con las clases
   * ya puestas y transición aún suprimida, y recién en el segundo frame se
   * reactiva, garantizando que el navegador no intente animar ese primer
   * cambio de estado (riesgo real si se retirara en el mismo task: el
   * navegador podría no haber pintado el frame sin transición todavía).
   */
  function entrar(seccion) {
    if (!seccion || seccionesYaReveladas.has(seccion)) return; // ya se reveló: no se repite
    seccionesYaReveladas.add(seccion);

    const fondo = seccion.querySelector('.sede-bg');
    const kicker = seccion.querySelector('.sede-kicker');
    const elementos = Array.from(seccion.querySelectorAll('.elemento'));

    const aplicar = () => {
      fondo?.classList.add('sede-bg--visible');
      kicker?.classList.add('sede-kicker--visible');
      elementos.forEach((el) => el.classList.add('elemento--visible'));
    };

    if (prefiereMovimientoReducido) { aplicar(); return; }

    seccion.classList.add('sede--componiendo');
    aplicar();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      seccion.classList.remove('sede--componiendo');
    }));
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
