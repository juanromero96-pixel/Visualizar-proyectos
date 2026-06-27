/**
 * layout.js
 * -----------------------------------------------------------------------
 * Resuelve la posición final de los elementos de una escena. El x/y de
 * los datos deja de ser "la posición": es una PREFERENCIA de partida (el
 * ancla de la composición pensada para esa sede). A partir de ahí:
 *
 *   1. Empaquetado por filas (shelf packing): ordena los elementos por su
 *      ancla vertical y los va acomodando en filas, cada una tan alta
 *      como su elemento más alto. Por construcción, dos elementos en la
 *      misma fila o en filas distintas NUNCA se superponen — no hace
 *      falta "corregir" superposiciones grandes, no existen desde el
 *      arranque. (Antes de llegar a este diseño, probé empujar los
 *      elementos desde su ancla original con un algoritmo de separación
 *      de pares solamente, y con contenido real — fotos + nombre + cargo
 *      + institución + cita larga — no siempre convergía a tiempo. Quedó
 *      documentado en el repositorio de pruebas, no en este archivo.)
 *   2. Si el conjunto no entra en el alto disponible, se reduce la
 *      escala de todo el conjunto (nunca de una tarjeta sola) hasta que
 *      entra — nunca se corta ni se oculta nada.
 *   3. Cualquier tarjeta que caiga sobre la zona del título, o sobre una
 *      zona protegida que la sede declare (un cartel, una escultura de
 *      la fotografía de fondo), se empuja afuera por el lado más corto.
 *   4. Un ajuste fino final (separación de pares) limpia cualquier
 *      contacto que ese empuje por zona haya podido generar.
 *
 * Se vuelve a correr en cada cambio de tamaño de ventana — por eso no
 * hace falta una composición distinta "a mano" por dispositivo: el mismo
 * algoritmo, con el espacio real disponible, ya da una composición propia.
 */
const Distribuidor = (() => {
  const SEPARACION_MINIMA = 22; // px — distancia mínima configurable entre tarjetas
  const MARGEN_ESCENARIO = 18; // px de aire respecto del borde del escenario
  const MARGEN_ZONA_PROTEGIDA = 20; // px de aire alrededor de cada zona protegida
  const ESCALA_MINIMA = 0.55; // nunca reducir el conjunto más allá de esto
  const ITERACIONES_AJUSTE_ALTURA = 8;
  const ITERACIONES_LIMPIEZA_FINAL = 40;
  const EPSILON = 0.5; // px — por debajo de esto no se considera superposición real

  function distribuir(seccion) {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    // Por debajo de 821px el CSS ya pasa a flujo vertical (left/top:auto);
    // calcular posiciones ahí no tendría efecto visible.
    if (!window.matchMedia('(min-width: 821px)').matches) return;

    const elementos = Array.from(escenario.querySelectorAll('.elemento'));
    if (!elementos.length) return;

    const rectEscenario = escenario.getBoundingClientRect();
    const ancho = rectEscenario.width;
    const alto = rectEscenario.height;
    if (ancho < 10 || alto < 10) return;

    const zonas = obtenerZonasProtegidas(seccion, rectEscenario);

    const nodos = elementos.map((el) => {
      const interior = el.querySelector('.elemento-interior');
      const escalaAutoral = Number(el.dataset.escala || 1);
      const rotacion = Number(el.dataset.rotacion || 0);
      // offsetWidth/offsetHeight ignoran el transform (no dependen de si
      // el elemento ya está en su estado animado o no): son la medida de
      // layout real, estable, a la que se le aplica la escala autoral.
      const wBase = (interior?.offsetWidth || 200) * escalaAutoral;
      const hBase = (interior?.offsetHeight || 120) * escalaAutoral;
      const rad = (Math.abs(rotacion) * Math.PI) / 180;
      // Caja envolvente del rectángulo ya rotado.
      const wBaseRot = wBase * Math.cos(rad) + hBase * Math.sin(rad);
      const hBaseRot = wBase * Math.sin(rad) + hBase * Math.cos(rad);
      return {
        el,
        escalaAutoral,
        anclaX: Number(el.dataset.anclaX) || 50,
        anclaY: Number(el.dataset.anclaY) || 50,
        wBase: wBaseRot,
        hBase: hBaseRot,
        w: wBaseRot,
        h: hBaseRot,
        x: 0,
        y: 0,
        factorAjuste: 1,
      };
    });

    let factor = 1;
    let alturaEmpacada = empacarEnFilas(nodos, ancho, alto, factor);
    for (let i = 0; i < ITERACIONES_AJUSTE_ALTURA && alturaEmpacada > alto && factor > ESCALA_MINIMA; i++) {
      factor *= Math.max(0.85, (alto / alturaEmpacada) * 0.96);
      alturaEmpacada = empacarEnFilas(nodos, ancho, alto, factor);
    }

    empujarFueraDeZonas(nodos, zonas);
    for (let iter = 0; iter < ITERACIONES_LIMPIEZA_FINAL; iter++) {
      let huboMovimiento = false;
      for (let i = 0; i < nodos.length; i++) {
        for (let j = i + 1; j < nodos.length; j++) {
          if (separarPar(nodos[i], nodos[j])) huboMovimiento = true;
        }
      }
      empujarFueraDeZonas(nodos, zonas);
      nodos.forEach((n) => limitarAlEscenario(n, ancho, alto));
      if (!huboMovimiento) break;
    }

    nodos.forEach((n) => {
      n.el.style.setProperty('--x', `${Math.round(n.x)}px`);
      n.el.style.setProperty('--y', `${Math.round(n.y)}px`);
      // La reducción por desborde se aplica acá, sobre la escala visual
      // final — nunca se toca la escala autoral original de cada dato.
      n.el.style.setProperty('--escala', n.escalaAutoral * factor);
    });
  }

  // Empaquetado por filas ("shelf packing"): ordena por ancla vertical,
  // va llenando cada fila hasta que el siguiente elemento no entra en el
  // ancho disponible, y entonces abre una fila nueva. Devuelve el alto
  // total ocupado, para saber si hace falta reducir la escala.
  function empacarEnFilas(nodos, ancho, alto, factor) {
    nodos.forEach((n) => {
      n.w = n.wBase * factor;
      n.h = n.hBase * factor;
    });

    const ordenados = [...nodos].sort((a, b) => a.anclaY - b.anclaY);
    const anchoUtil = ancho - 2 * MARGEN_ESCENARIO;
    const filas = [];
    let filaActual = [];
    let anchoFilaActual = 0;

    ordenados.forEach((n) => {
      const anchoConGap = n.w + SEPARACION_MINIMA;
      if (filaActual.length > 0 && anchoFilaActual + anchoConGap > anchoUtil) {
        filas.push(filaActual);
        filaActual = [];
        anchoFilaActual = 0;
      }
      filaActual.push(n);
      anchoFilaActual += anchoConGap;
    });
    if (filaActual.length) filas.push(filaActual);

    let yAcumulada = MARGEN_ESCENARIO;
    filas.forEach((fila) => {
      const alturaFila = Math.max(...fila.map((n) => n.h)) + SEPARACION_MINIMA;
      const anchoTotalFila = fila.reduce((acc, n) => acc + n.w, 0) + SEPARACION_MINIMA * (fila.length - 1);
      // Dentro de la fila, se ordena por la preferencia horizontal
      // original — la fila respeta quién "quería" ir más a la izquierda.
      fila.sort((a, b) => a.anclaX - b.anclaX);
      let xActual = (ancho - anchoTotalFila) / 2;
      fila.forEach((n) => {
        n.x = xActual + n.w / 2;
        n.y = yAcumulada + alturaFila / 2;
        xActual += n.w + SEPARACION_MINIMA;
      });
      yAcumulada += alturaFila;
    });

    return yAcumulada + MARGEN_ESCENARIO;
  }

  function separarPar(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const superposicionX = (a.w + b.w) / 2 + SEPARACION_MINIMA - Math.abs(dx);
    const superposicionY = (a.h + b.h) / 2 + SEPARACION_MINIMA - Math.abs(dy);
    if (superposicionX <= EPSILON || superposicionY <= EPSILON) return false;

    if (superposicionX < superposicionY) {
      const signo = Math.sign(dx) || 1;
      const empuje = (superposicionX / 2) * signo;
      a.x -= empuje;
      b.x += empuje;
    } else {
      const signo = Math.sign(dy) || 1;
      const empuje = (superposicionY / 2) * signo;
      a.y -= empuje;
      b.y += empuje;
    }
    return true;
  }

  function empujarFueraDeZonas(nodos, zonas) {
    if (!zonas.length) return;
    nodos.forEach((n) => {
      zonas.forEach((zona) => {
        const izq = n.x - n.w / 2;
        const der = n.x + n.w / 2;
        const arr = n.y - n.h / 2;
        const abj = n.y + n.h / 2;
        const seSuperpone = izq < zona.derecha && der > zona.izquierda && arr < zona.abajo && abj > zona.arriba;
        if (!seSuperpone) return;

        const distIzq = der - zona.izquierda;
        const distDer = zona.derecha - izq;
        const distArr = abj - zona.arriba;
        const distAbj = zona.abajo - arr;
        const minimo = Math.min(distIzq, distDer, distArr, distAbj);

        if (minimo === distDer) n.x = zona.derecha + n.w / 2;
        else if (minimo === distIzq) n.x = zona.izquierda - n.w / 2;
        else if (minimo === distAbj) n.y = zona.abajo + n.h / 2;
        else n.y = zona.arriba - n.h / 2;
      });
    });
  }

  function limitarAlEscenario(n, ancho, alto) {
    n.x = Math.max(n.w / 2 + MARGEN_ESCENARIO, Math.min(ancho - n.w / 2 - MARGEN_ESCENARIO, n.x));
    n.y = Math.max(n.h / 2 + MARGEN_ESCENARIO, Math.min(alto - n.h / 2 - MARGEN_ESCENARIO, n.y));
  }

  function obtenerZonasProtegidas(seccion, rectEscenario) {
    const zonas = [];

    const kicker = seccion.querySelector('.sede-kicker');
    if (kicker) {
      const r = kicker.getBoundingClientRect();
      zonas.push({
        izquierda: r.left - rectEscenario.left - MARGEN_ZONA_PROTEGIDA,
        derecha: r.right - rectEscenario.left + MARGEN_ZONA_PROTEGIDA,
        arriba: r.top - rectEscenario.top - MARGEN_ZONA_PROTEGIDA,
        abajo: r.bottom - rectEscenario.top + MARGEN_ZONA_PROTEGIDA,
      });
    }

    try {
      const declaradas = JSON.parse(seccion.dataset.zonasProtegidas || '[]');
      declaradas.forEach((z) => {
        const ancho = rectEscenario.width;
        const alto = rectEscenario.height;
        zonas.push({
          izquierda: (z.x / 100) * ancho - MARGEN_ZONA_PROTEGIDA,
          derecha: ((z.x + z.ancho) / 100) * ancho + MARGEN_ZONA_PROTEGIDA,
          arriba: (z.y / 100) * alto - MARGEN_ZONA_PROTEGIDA,
          abajo: ((z.y + z.alto) / 100) * alto + MARGEN_ZONA_PROTEGIDA,
        });
      });
    } catch (error) {
      console.warn('No se pudieron leer las zonas protegidas de la sede', error);
    }

    return zonas;
  }

  return { distribuir };
})();

window.Distribuidor = Distribuidor;
