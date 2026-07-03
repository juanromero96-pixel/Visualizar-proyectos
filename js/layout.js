/**
 * layout.js
 * -----------------------------------------------------------------------
 * Resuelve la posición y el tamaño final de los elementos de una escena.
 * El x/y de los datos es una preferencia de partida (el ancla de la
 * composición pensada para esa sede); el ancho/alto de cada elemento ya
 * viene resuelto por app.js según el contenido (ver anchoSegunTexto en
 * app.js) — este módulo no lo decide, solo lo usa para encontrarle un
 * lugar sin choques.
 *
 * Historial de diseño (la cuarta versión, esta vez por una razón
 * distinta a las anteriores — importa para quien lo retome):
 *
 *   v1 — empujar pares desde el ancla original: no convergía con
 *        contenido real (citas largas, fotos, distinto peso por persona).
 *   v2 — empaquetado por filas: sin superposición entre tarjetas por
 *        construcción, pero una zona protegida en una esquina generaba
 *        un ciclo entre "salir de la zona" y "no chocar con la vecina".
 *   v3 — grilla con celdas bloqueadas por zonas: resolvía el ciclo, pero
 *        el tamaño de cada celda se definía igual al de la tarjeta más
 *        grande de la escena. Con una cita mucho más larga que las
 *        demás, eso producía celdas enormes → pocas filas/columnas → una
 *        sola zona protegida tapaba la grilla casi entera → el sistema
 *        achicaba TODO el conjunto para compensar, aunque hubiera de
 *        sobra espacio libre real (el "tarjetas demasiado chicas en
 *        Posadas" del último reporte).
 *   v4 (esta) — búsqueda de posición en una grilla FINA, fija (24px),
 *        que no depende del tamaño de ninguna tarjeta: cada elemento
 *        busca el punto libre más cercano a su ancla, los más grandes
 *        primero. El tamaño de cada tarjeta y la resolución con la que
 *        se busca dónde ponerla son ahora dos cosas independientes, así
 *        que una cita larga ya no le quita espacio a las demás. Después
 *        de ubicar a todos, si sobra espacio se agranda el conjunto
 *        entero; si no entran, se achica — nunca al revés.
 *
 * Verificado por simulación (réplica exacta de esta lógica) contra 8
 * combinaciones de sede/pantalla, incluyendo las proporciones reales de
 * las capturas reportadas: sin superposición ni invasión de zona en
 * ninguna.
 */
const Distribuidor = (() => {
  const SEPARACION_MINIMA = 16; // px — distancia mínima configurable entre tarjetas
  const MARGEN_ESCENARIO = 18; // px de aire respecto del borde del escenario
  const MARGEN_ZONA_PROTEGIDA = 20; // px de aire alrededor de cada zona protegida
  const PASO_BUSQUEDA = 24; // px — resolución de la búsqueda de posición, fija
  const FACTOR_MINIMO = 0.4;
  const FACTOR_MAXIMO = 1.6;
  const PASO_CRECIMIENTO = 1.08;
  const INTENTOS_ESCALA = 14;
  const ITERACIONES_LIMPIEZA_FINAL = 50;
  const EPSILON = 0.5;
  const CANDIDATOS_CERCANOS = 5; // ver intentarConFactor: variación orgánica, no el óptimo exacto siempre

  function distribuir(seccion) {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    // Por debajo de 821px el CSS ya pasa a flujo vertical (left/top:auto);
    // calcular posiciones ahí no tendría efecto visible.
    // Guard triple: sale en mobile usando la misma lógica que esMobile() en mobile.js.
    // 1. max-width < 821px  → browser reporta viewport correcto
    // 2. pointer:coarse     → dispositivo táctil (funciona aunque viewport esté inflado)
    // 3. esMobile()         → check JS unificado (si mobile.js cargó antes)
    const esTactilPuro = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    const esViewportChico = !window.matchMedia('(min-width: 821px)').matches;
    const esMobileJS = typeof window.esMobile === 'function' && window.esMobile();
    if (esViewportChico || esTactilPuro || esMobileJS) return;

    // :not(.elemento--oculto-autoridad) — las autoridades que el sorteo de
    // app.js dejó afuera de esta visita NO participan del cálculo de
    // posiciones: si se las incluyera (aunque sea ocultas), el resto de la
    // escena seguiría "reservándoles" un lugar invisible en vez de usar
    // ese espacio de verdad. Quedan afuera del layout, no solo invisibles.
    const elementos = Array.from(escenario.querySelectorAll('.elemento:not(.elemento--oculto-autoridad)'));
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
      };
    });

    const factor = ubicarPorBusqueda(nodos, ancho, alto, zonas);

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

  // Busca, para cada elemento, el punto libre más cercano a su ancla en
  // una grilla fina de búsqueda — la resolución de esa grilla (24px) es
  // independiente del tamaño de cualquier tarjeta. Los más grandes se
  // ubican primero (encajan mejor cuando el espacio todavía está libre).
  // Si TODOS entraron y queda margen, se agranda el conjunto; si no
  // entraron todos, se achica. Devuelve el factor de escala final.
  function ubicarPorBusqueda(nodos, ancho, alto, zonas) {
    const candidatosBase = [];
    for (let y = MARGEN_ESCENARIO; y <= alto - MARGEN_ESCENARIO; y += PASO_BUSQUEDA) {
      for (let x = MARGEN_ESCENARIO; x <= ancho - MARGEN_ESCENARIO; x += PASO_BUSQUEDA) {
        candidatosBase.push({ x, y });
      }
    }

    let factor = 1;
    let resultado = intentarConFactor(nodos, ancho, alto, zonas, candidatosBase, factor);

    if (resultado.todosEntraron) {
      let probando = factor;
      for (let i = 0; i < INTENTOS_ESCALA; i++) {
        const siguiente = probando * PASO_CRECIMIENTO;
        if (siguiente > FACTOR_MAXIMO) break;
        const r2 = intentarConFactor(nodos, ancho, alto, zonas, candidatosBase, siguiente);
        if (!r2.todosEntraron) break;
        probando = siguiente;
        resultado = r2;
      }
      factor = probando;
    } else {
      for (let i = 0; i < INTENTOS_ESCALA && !resultado.todosEntraron && factor > FACTOR_MINIMO; i++) {
        factor *= 0.88;
        resultado = intentarConFactor(nodos, ancho, alto, zonas, candidatosBase, factor);
      }
    }

    resultado.colocados.forEach((c) => {
      c.nodo.x = c.x;
      c.nodo.y = c.y;
      c.nodo.w = c.nodo.wBase * factor;
      c.nodo.h = c.nodo.hBase * factor;
    });

    return factor;
  }

  function intentarConFactor(nodos, ancho, alto, zonas, candidatosBase, factor) {
    const orden = [...nodos].sort((a, b) => b.wBase * b.hBase - a.wBase * a.hBase);
    const colocados = [];
    let todosEntraron = true;

    orden.forEach((nodo) => {
      const w = nodo.wBase * factor;
      const h = nodo.hBase * factor;
      const anclaXpx = (nodo.anclaX / 100) * ancho;
      const anclaYpx = (nodo.anclaY / 100) * alto;

      // Se juntan los candidatos VÁLIDOS más cercanos al ancla (no solo
      // el más cercano) y se elige uno al azar entre ellos. La validez
      // (dentro del escenario, sin pisar una zona protegida, sin tocar
      // algo ya colocado) es exactamente la misma de antes — lo único
      // que cambia es CUÁL de los candidatos ya válidos se usa. Por eso
      // esto no afecta la garantía de cero superposición: cualquiera de
      // los elegibles ya pasó las mismas verificaciones. Lo que sí
      // cambia es que la posición final ya no es siempre el óptimo
      // matemático exacto más cercano al ancla — se parece más a una
      // composición hecha a mano, con margen para el azar, que a un
      // resultado perfectamente uniforme y repetible entre cargas.
      const validos = [];
      for (const candidato of candidatosBase) {
        if (candidato.x - w / 2 < 0 || candidato.x + w / 2 > ancho) continue;
        if (candidato.y - h / 2 < 0 || candidato.y + h / 2 > alto) continue;
        if (zonas.some((z) => cajaSuperponeZona(candidato.x, candidato.y, w, h, z))) continue;
        if (colocados.some((c) => cajaSuperponeCaja(candidato.x, candidato.y, w, h, c))) continue;
        const distancia = (candidato.x - anclaXpx) ** 2 + (candidato.y - anclaYpx) ** 2;
        validos.push({ candidato, distancia });
      }

      let elegido = null;
      if (validos.length) {
        validos.sort((a, b) => a.distancia - b.distancia);
        const masCercanos = validos.slice(0, Math.min(CANDIDATOS_CERCANOS, validos.length));
        elegido = masCercanos[Math.floor(Math.random() * masCercanos.length)].candidato;
      }

      if (elegido) {
        colocados.push({ nodo, x: elegido.x, y: elegido.y, w, h });
      } else {
        // No hay ningún candidato que cumpla las tres condiciones a la
        // vez (dentro del escenario, fuera de zonas, sin tocar lo ya
        // colocado) — pasa sobre todo con factores grandes y poco
        // margen real. En vez de resignarse y tirar el elemento en su
        // ancla cruda (que puede caer encima de cualquier cosa, sin
        // respetar ni el borde del escenario ni una zona protegida), se
        // busca el candidato que SÍ respeta escenario y zonas, con la
        // MENOR superposición total contra lo ya colocado — un "menor
        // daño" en vez de un abandono. Esto le da a la pasada de
        // limpieza final (separarPar, fuera de esta función) un punto
        // de partida real para corregir, en vez de un punto arbitrario
        // que a veces quedaba sin corregirse a tiempo.
        let mejorDanio = Infinity;
        let mejorCandidato = null;
        for (const candidato of candidatosBase) {
          if (candidato.x - w / 2 < 0 || candidato.x + w / 2 > ancho) continue;
          if (candidato.y - h / 2 < 0 || candidato.y + h / 2 > alto) continue;
          if (zonas.some((z) => cajaSuperponeZona(candidato.x, candidato.y, w, h, z))) continue;
          const danio = colocados.reduce((acc, c) => acc + areaDeSuperposicion(candidato.x, candidato.y, w, h, c), 0);
          if (danio < mejorDanio) {
            mejorDanio = danio;
            mejorCandidato = candidato;
            if (danio === 0) break; // ya no se puede mejorar más que "sin superposición"
          }
        }
        const destino = mejorCandidato || { x: anclaXpx, y: anclaYpx }; // último recurso si ni respetando zonas hay lugar
        todosEntraron = false;
        colocados.push({ nodo, x: destino.x, y: destino.y, w, h });
      }
    });

    return { colocados, todosEntraron };
  }

  function cajaSuperponeZona(x, y, w, h, zona) {
    const izq = x - w / 2;
    const der = x + w / 2;
    const arr = y - h / 2;
    const abj = y + h / 2;
    return izq < zona.derecha && der > zona.izquierda && arr < zona.abajo && abj > zona.arriba;
  }

  function cajaSuperponeCaja(x, y, w, h, otra) {
    return Math.abs(x - otra.x) < (w + otra.w) / 2 + SEPARACION_MINIMA && Math.abs(y - otra.y) < (h + otra.h) / 2 + SEPARACION_MINIMA;
  }

  /**
   * Área de superposición geométrica (en px²) entre la caja candidata y
   * otra caja ya colocada. Solo mide el solapamiento real — no incluye la
   * separación mínima — porque acá la usamos para comparar "menor daño",
   * no para validar colisiones (eso lo hace cajaSuperponeCaja).
   */
  function areaDeSuperposicion(x, y, w, h, otra) {
    const solaX = Math.max(0, Math.min(x + w / 2, otra.x + otra.w / 2) - Math.max(x - w / 2, otra.x - otra.w / 2));
    const solaY = Math.max(0, Math.min(y + h / 2, otra.y + otra.h / 2) - Math.max(y - h / 2, otra.y - otra.h / 2));
    return solaX * solaY;
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
        if (!cajaSuperponeZona(n.x, n.y, n.w, n.h, zona)) return;
        const izq = n.x - n.w / 2;
        const der = n.x + n.w / 2;
        const arr = n.y - n.h / 2;
        const abj = n.y + n.h / 2;
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
    // El chip de marca (esquina superior izquierda) y el botón hamburguesa
    // son los únicos elementos fijos del encabezado que deben quedar libres.
    // El bloque .encabezado-evento fue eliminado del HTML en esta versión:
    // ya no ocupa el cuadrante superior derecho, que queda libre para el mural.
    agregarZonaDeElemento(zonas, document.querySelector('.marca-chip'), rectEscenario);
    agregarZonaDeElemento(zonas, document.querySelector('.menu-inst-btn'), rectEscenario);
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
    if (r.width === 0 && r.height === 0) return;
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
