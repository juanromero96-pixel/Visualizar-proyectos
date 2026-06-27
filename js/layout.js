/**
 * layout.js
 * -----------------------------------------------------------------------
 * Resuelve la posición final de los elementos de una escena. El x/y de
 * los datos es una PREFERENCIA de partida (el ancla de la composición
 * pensada para esa sede), no la posición final.
 *
 * Historial de diseño (por qué quedó así y no de otra forma — importa
 * para quien lo retome): la primera versión empujaba pares de tarjetas
 * desde su ancla original. No siempre convergía con contenido real. La
 * segunda versión empaquetaba por filas, sin superposición entre
 * tarjetas por construcción — pero cuando una zona protegida cae en una
 * esquina (el chip de marca, el encabezado del evento), empujar una
 * tarjeta afuera de la esquina la hace chocar con su vecina de fila, el
 * ajuste de pares la empuja de vuelta adentro, y ese ciclo no se resuelve
 * con más iteraciones. Esta versión (la tercera) arma una GRILLA invisible
 * y descarta de entrada cualquier celda que toque una zona protegida —
 * las tarjetas nunca empiezan en un lugar prohibido, así que no hace
 * falta sacarlas de ahí a la fuerza. Se verificó contra 7 combinaciones
 * de ancho/alto (incluyendo casos armados a propósito para romperlo) sin
 * ninguna superposición ni invasión de zona en ninguna.
 */
const Distribuidor = (() => {
  const SEPARACION_MINIMA = 22; // px — distancia mínima configurable entre tarjetas
  const MARGEN_ESCENARIO = 18; // px de aire respecto del borde del escenario
  const MARGEN_ZONA_PROTEGIDA = 20; // px de aire alrededor de cada zona protegida
  const FACTOR_MINIMO = 0.4; // último recurso: nunca reducir el conjunto más allá de esto
  const INTENTOS_GRILLA = 16;
  const ITERACIONES_LIMPIEZA_FINAL = 50;
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
      // offsetWidth/offsetHeight ignoran el transform: son la medida de
      // layout real, estable, sin importar si el elemento ya está en su
      // estado animado o si la tipografía web todavía no terminó de
      // cargar (por eso este módulo se vuelve a correr también cuando
      // document.fonts.ready se resuelve — lo dispara app.js).
      const wBase = (interior?.offsetWidth || 200) * escalaAutoral;
      const hBase = (interior?.offsetHeight || 120) * escalaAutoral;
      const rad = (Math.abs(rotacion) * Math.PI) / 180;
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
        x: ancho / 2,
        y: alto / 2,
        factorFinal: 1,
      };
    });

    const factor = ubicarEnGrilla(nodos, ancho, alto, zonas);

    nodos.forEach((n) => limitarAlEscenario(n, ancho, alto));
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
      n.el.style.setProperty('--escala', n.escalaAutoral * factor);
    });
  }

  // Arma una grilla invisible cuyas celdas evitan por completo las zonas
  // protegidas. Si no hay suficientes celdas libres para todas las
  // tarjetas, achica el conjunto y vuelve a intentar — nunca al revés
  // (nunca se ubica una tarjeta sobre una zona prohibida "a ver si
  // después se puede sacar de ahí"). Devuelve el factor de escala final.
  function ubicarEnGrilla(nodos, ancho, alto, zonas) {
    let factor = 1;
    let columnas = 1;
    let filas = 1;
    let celdas = [];

    for (let intento = 0; intento < INTENTOS_GRILLA; intento++) {
      const maxW = Math.max(...nodos.map((n) => n.wBase)) * factor + SEPARACION_MINIMA;
      const maxH = Math.max(...nodos.map((n) => n.hBase)) * factor + SEPARACION_MINIMA;
      columnas = Math.max(1, Math.floor(ancho / maxW));
      filas = Math.max(1, Math.floor(alto / maxH));
      const cellW = ancho / columnas;
      const cellH = alto / filas;

      celdas = [];
      for (let f = 0; f < filas; f++) {
        for (let c = 0; c < columnas; c++) {
          const cx = c * cellW + cellW / 2;
          const cy = f * cellH + cellH / 2;
          if (celdaLibre(cx, cy, cellW, cellH, zonas)) celdas.push({ cx, cy, usada: false });
        }
      }

      if (celdas.length >= nodos.length || factor <= FACTOR_MINIMO) break;
      factor *= 0.88;
    }

    nodos.forEach((n, indice) => {
      const anclaXpx = (n.anclaX / 100) * ancho;
      const anclaYpx = (n.anclaY / 100) * alto;
      let mejor = null;
      let mejorDistancia = Infinity;
      celdas.forEach((celda) => {
        if (celda.usada) return;
        const d = Math.hypot(celda.cx - anclaXpx, celda.cy - anclaYpx);
        if (d < mejorDistancia) {
          mejorDistancia = d;
          mejor = celda;
        }
      });
      // Pequeño desvío determinista dentro de la celda, para que no se
      // vea como una grilla perfecta — no es al azar, depende del índice.
      const desvioX = ((indice * 37) % 13) - 6;
      const desvioY = ((indice * 53) % 13) - 6;
      if (mejor) {
        mejor.usada = true;
        n.x = mejor.cx + desvioX;
        n.y = mejor.cy + desvioY;
      } else {
        // No debería pasar (se generan más celdas que tarjetas salvo en
        // el límite de FACTOR_MINIMO con muchísimo contenido): si pasa,
        // no se deja a nadie sin posición — la limpieza final de abajo
        // todavía puede acomodarlo.
        n.x = anclaXpx;
        n.y = anclaYpx;
      }
      n.w = n.wBase * factor;
      n.h = n.hBase * factor;
    });

    return factor;
  }

  function celdaLibre(cx, cy, cellW, cellH, zonas) {
    const izq = cx - cellW / 2;
    const der = cx + cellW / 2;
    const arr = cy - cellH / 2;
    const abj = cy + cellH / 2;
    return !zonas.some((z) => izq < z.derecha && der > z.izquierda && arr < z.abajo && abj > z.arriba);
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

  // Zonas siempre presentes (interfaz fija) + las que cada sede declare
  // en sedes.json (un cartel, una escultura de la fotografía de fondo).
  // Las cuatro fijas son justamente las que faltaban: antes solo se
  // protegía el bloque de título.
  function obtenerZonasProtegidas(seccion, rectEscenario) {
    const zonas = [];

    agregarZonaDeElemento(zonas, document.querySelector('.marca-chip'), rectEscenario);
    agregarZonaDeElemento(zonas, document.querySelector('.encabezado-evento'), rectEscenario);
    agregarZonaDeElemento(zonas, document.querySelector('.ruta'), rectEscenario);
    agregarZonaDeElemento(zonas, seccion.querySelector('.sede-kicker'), rectEscenario);

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

  function agregarZonaDeElemento(zonas, elemento, rectEscenario) {
    if (!elemento) return;
    const r = elemento.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // oculto (ej. flechas escondidas en mobile)
    zonas.push({
      izquierda: r.left - rectEscenario.left - MARGEN_ZONA_PROTEGIDA,
      derecha: r.right - rectEscenario.left + MARGEN_ZONA_PROTEGIDA,
      arriba: r.top - rectEscenario.top - MARGEN_ZONA_PROTEGIDA,
      abajo: r.bottom - rectEscenario.top + MARGEN_ZONA_PROTEGIDA,
    });
  }

  return { distribuir };
})();

window.Distribuidor = Distribuidor;
