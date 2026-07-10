/**
 * layout.js — v4 con auditoría completa de causas raíz
 */
const Distribuidor = (() => {
  let SEPARACION_MINIMA = 16;
  const MARGEN_ESCENARIO = 18;
  const MARGEN_ZONA_PROTEGIDA = 20;
  const PASO_BUSQUEDA = 24;
  const FACTOR_MINIMO = 0.4;
  const FACTOR_MAXIMO = 1.6;
  const PASO_CRECIMIENTO = 1.08;
  const INTENTOS_ESCALA = 14;
  const ITERACIONES_LIMPIEZA_FINAL = 50;
  const EPSILON = 0.5;
  const CANDIDATOS_CERCANOS = 5;

  function distribuir(seccion) {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    // SEPARACION_MINIMA: distancia mínima entre centros de tarjetas.
    // Mobile: 8px — en 375px con tarjetas de 165px, los centros de columnas
    // distanciados a 174px dejan 9px de margen. En un mural documental,
    // un solapamiento mínimo entre tarjetas DE DISTINTO tipo es aceptable
    // (igual que en un mural físico). Lo que importa es que no haya texto
    // completamente cubierto por otra tarjeta.
    // Desktop: 16px — viewport amplio, sin restricciones.
    SEPARACION_MINIMA = (window.esMobile?.() ? 8 : 16);

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

    // O-3: el guard mobile está ANTES de ubicarPorBusqueda para evitar correr
    // el algoritmo Monte Carlo (2.200 candidatos × n × escalas) innecesariamente
    // en mobile — su resultado sería descartado de todas formas por el bloque
    // mobile que sobreescribe n.x/n.y con el sistema de zonas.

    // ── MOBILE: composición editorial por zonas ─────────────────────────────
    if (window.esMobile?.()) {
      const ZONAS_COLS = 2;
      const ZONAS_ROWS = 7;
      const zW = ancho / ZONAS_COLS;
      const MARGEN_TOP = 72;   // header real ≈ 60px + 12px holgura
      const MARGEN_BOT = 52;   // altura del nav #ruta-m
      const altUtil = alto - MARGEN_TOP - MARGEN_BOT;
      const zH = altUtil / ZONAS_ROWS;
      const conteoZonas = new Map();
      // Conteo por columna para el balanceo de densidad.
      // Fórmula: ceil((n+1)/2) → para 11 elementos=6, para 6=4, para 8=5.
      // Cuando una columna supera el límite, el elemento siguiente paga
      // una penalización de 3e5 (menor que la zona ocupada 5e5 pero suficiente
      // para redirigirlo al lado con espacio libre).
      const colCounts  = [0, 0];
      const maxPerCol  = Math.ceil((nodos.length + 1) / 2);

      // ── BALANCE VERTICAL POR BANDAS (FASE 3-4 de la auditoría visual) ────
      // Gemelo del balanceo de columnas, en el eje Y. Causa raíz del
      // desequilibrio: las anclas autorales fueron pensadas para el lienzo
      // apaisado desktop — las autoridades UNaM viven en y=9-14% — y en
      // mobile eso satura la banda superior mientras la inferior queda vacía.
      // Tres bandas (filas 0-1 / 2-4 / 5-6) con cupo proporcional: cuando una
      // banda se llena, el siguiente elemento paga 2e5 (menos que columna 3e5
      // y que zona 5e5: el orden de prioridades queda zona > columna > banda
      // > ancla) y se redirige a la banda con espacio.
      const BANDAS_FILAS = [2, 3, 2];
      const bandaDe = (row) => (row < 2 ? 0 : (row < 5 ? 1 : 2));
      const bandCounts  = [0, 0, 0];
      const maxPerBanda = BANDAS_FILAS.map(f => Math.ceil(nodos.length * f / ZONAS_ROWS));

      // ── SANGRADO HORIZONTAL (auditoría visual, FASE 1-2) ─────────────────
      // Causa raíz del "efecto feed": con tarjetas de 155-165px en 375px,
      // el rango de centros permitido por el clamp [w/2+18, ancho-w/2-18]
      // ≈ [95..100, 274..280] deja FUERA a los centros de zona (93.75/281.25)
      // ± jitter (±41px) → cada tarjeta colapsaba al mismo x extremo →
      // bordes perfectamente alineados → dos columnas rígidas de feed.
      // El sangrado permite que un documento se corte levemente con el marco
      // (26px máx), exactamente como en un mural físico donde los papeles
      // continúan más allá del encuadre. Con él, el rango de centros se
      // amplía a [56..318] y el jitter se expresa por completo.
      // Solo horizontal: los límites verticales (header/nav) siguen estrictos.
      const SANGRADO_X = 26;

      const PESO_NARRATIVO = {
        'registro-ua': 0, 'registro-conceptual': 1, 'video': 2, 'testimonio': 3, 'default': 4,
      };
      const filasNarrador = new Set();
      const narradorFilas  = new Map(); // UA key → fila asignada al narrador

      // ── ESCALA CAP ──────────────────────────────────────────────────────
      // Causa raíz: en mobile escalaAutoral > 1.0 multiplica el offsetWidth
      // (ya limitado por CSS max-width) produciendo n.wBase demasiado grande.
      // Con escala cap=1.0 y CSS max-width=165px: n.wBase ≤ 165px, que es
      // el máximo que permite posicionar dos tarjetas sin solapamiento total
      // en un viewport de 375px (columnas a 187.5px, margen 18px → distancia 174px,
      // que supera por 9px el ancho de una tarjeta de 165px).
      nodos.forEach((n) => {
        if (n.escalaAutoral > 1.0) {
          const ratio = 1.0 / n.escalaAutoral;
          n.wBase = n.wBase * ratio;
          n.hBase = n.hBase * ratio;
          n.w     = n.wBase;
          n.h     = n.hBase;
        }
      });

      const ordenados = [...nodos].sort((a, b) => {
        const pa = PESO_NARRATIVO[a.el.dataset.tipo] ?? 4;
        const pb = PESO_NARRATIVO[b.el.dataset.tipo] ?? 4;
        if (pa !== pb) return pa - pb;
        return (a.el.dataset.permanente === 'true' ? 0 : 1)
             - (b.el.dataset.permanente === 'true' ? 0 : 1);
      });

      const preferenciaFilas = (tipo, esNarrador, uaKey) => {
        if (esNarrador) {
          const opts = [0, 2, 4, 6, 1, 3, 5].filter(r => r < ZONAS_ROWS && !filasNarrador.has(r));
          return opts.length ? opts : Array.from({length: ZONAS_ROWS}, (_, i) => i);
        }
        const narrRow = narradorFilas.get(uaKey);
        if (narrRow !== undefined) {
          const adyac = [narrRow, narrRow+1, narrRow-1, narrRow+2, narrRow-2]
            .filter(r => r >= 0 && r < ZONAS_ROWS);
          const resto = Array.from({length: ZONAS_ROWS}, (_, i) => i)
            .filter(r => !adyac.includes(r));
          return [...adyac, ...resto];
        }
        if (tipo === 'registro-conceptual') return [1, 3, 5, 2, 4, 0, 6].filter(r => r < ZONAS_ROWS);
        if (tipo === 'video')               return [2, 4, 3, 5, 1, 6, 0].filter(r => r < ZONAS_ROWS);
        return                                     [2, 4, 3, 5, 1, 6, 0].filter(r => r < ZONAS_ROWS);
      };

      ordenados.forEach((n) => {
        const tipo       = n.el.dataset.tipo;
        const peso       = PESO_NARRATIVO[tipo] ?? 4;
        const esNarrador = peso === 0;
        const uaKey      = n.el.dataset.ua || 'general';
        const filasPref  = preferenciaFilas(tipo, esNarrador, uaKey);

        // ── ANCLA EDITORIAL (causa raíz crítica) ────────────────────────
        // BUG original: n.x = n.y = centro del viewport → ambas columnas
        // equidistantes → el bucle siempre elige col=0 → todos los narradores
        // en la columna izquierda → solapamiento masivo.
        // FIX: usar anclaX/anclaY del JSON para el cálculo de distancia.
        // FHyCS (anclaX=20) → prefiere columna izquierda
        // FCEQyN (anclaX=76) → prefiere columna derecha
        // FCE (anclaX=62) → prefiere columna derecha
        const anclaXpx = (n.anclaX / 100) * ancho;
        const anclaYpx = (n.anclaY / 100) * alto;

        let bestKey = null, bestScore = Infinity;
        for (const row of filasPref) {
          for (let col = 0; col < ZONAS_COLS; col++) {
            const key = `${row}-${col}`;
            const ocupacion = (conteoZonas.get(key) || 0) * 5e5;
            // ── Balanceo de columnas ───────────────────────────────────────
            // Posadas tiene 7 de 11 elementos con anclaX>50% (todos quieren
            // la columna derecha). Sin el penalty, la col derecha acumula 7
            // elementos → colisiones severas. El penalty suave (3e5, menor
            // que el de zona ocupada 5e5) redirige el exceso a la col izquierda
            // preservando la preferencia editorial cuando hay espacio libre.
            const colPenalty = (colCounts[col] >= maxPerCol) ? 3e5 : 0;
            const bandPenalty = (bandCounts[bandaDe(row)] >= maxPerBanda[bandaDe(row)]) ? 2e5 : 0;
            const cx = (col + 0.5) * zW;
            // Escalonado de col 1: +0.45·zH da el efecto "naipe superpuesto".
            // H-12: en la última fila el stagger se anula (0); de lo contrario
            // cy = MARGEN_TOP + (ZONAS_ROWS-0.55)·zH + 0.45·zH excedería
            // alto−MARGEN_BOT empujando tarjetas dentro del nav de sedes.
            const yStagger = (col === 1 && row < ZONAS_ROWS - 1) ? zH * 0.45 : 0;
            const cy = MARGEN_TOP + (row + 0.5) * zH + yStagger;
            const dist = Math.hypot(cx - anclaXpx, cy - anclaYpx);
            const score = dist + ocupacion + colPenalty + bandPenalty;
            if (score < bestScore) { bestScore = score; bestKey = { key, cx, cy, row, col }; }
          }
        }
        if (!bestKey) {
          for (let row = 0; row < ZONAS_ROWS && !bestKey; row++)
            for (let col = 0; col < ZONAS_COLS && !bestKey; col++) {
              const key = `${row}-${col}`;
              if ((conteoZonas.get(key) || 0) === 0) {
                const yStagger = (col === 1 && row < ZONAS_ROWS - 1) ? zH * 0.45 : 0;
                bestKey = { key, cx:(col+0.5)*zW, cy:MARGEN_TOP+(row+0.5)*zH+yStagger, row, col };
              }
            }
        }

        if (bestKey) {
          conteoZonas.set(bestKey.key, (conteoZonas.get(bestKey.key) || 0) + 1);
          colCounts[bestKey.col]++;
          bandCounts[bandaDe(bestKey.row)]++;
          if (esNarrador) {
            filasNarrador.add(bestKey.row);
            narradorFilas.set(uaKey, bestKey.row);
          }
          // Jitter ±22%: composición orgánica sin solapamientos irrecuperables.
          // ── JITTER DETERMINISTA (auditoría forense, FASE 3) ─────────────
          // Math.random() convertía cada llamada a distribuir() en una
          // autoridad NUEVA sobre --x/--y: el recálculo de fonts.ready, el
          // resize y las revisitas con re-sorteo K re-barajaban el mural,
          // sobrescribiendo posiciones ya establecidas. Con el hash de la
          // identidad editorial (ancla + UA + tipo), distribuir() es
          // idempotente: mismo elemento → mismo jitter → misma posición,
          // en cada ejecución. Única autoridad efectiva en el tiempo.
          let hseed = 0;
          const hkey = `${n.anclaX}:${n.anclaY}:${uaKey}:${n.el.dataset.tipo}`;
          for (let hi = 0; hi < hkey.length; hi++) {
            hseed = ((hseed << 5) - hseed + hkey.charCodeAt(hi)) | 0;
          }
          // Avalancha xorshift: garantiza que claves parecidas produzcan
          // jitters lejanos (el paso lineal solo no dispersaba lo suficiente).
          let hx = hseed | 0;
          hx ^= hx << 13; hx ^= hx >>> 17; hx ^= hx << 5;
          let hy = (hseed ^ 0x9e3779b9) | 0;
          hy ^= hy << 13; hy ^= hy >>> 17; hy ^= hy << 5;
          const h1 = (hx >>> 0) / 4294967296;
          const h2 = (hy >>> 0) / 4294967296;
          const jitterX = (h1 - 0.5) * zW * 0.22;
          const jitterY = (h2 - 0.5) * zH * 0.22;
          // ── CLAMPING DE BORDE ───────────────────────────────────────────
          // Causa raíz: la versión anterior usaba SEPARACION_MINIMA (=56 o 20)
          // como margen de borde, comprimiendo todos los elementos en una
          // banda central de ≈98px. El margen de borde debe ser MARGEN_ESCENARIO
          // (18px fijo), no SEPARACION_MINIMA.
          n.x = Math.max(n.wBase/2 + MARGEN_ESCENARIO - SANGRADO_X,
                Math.min(ancho - n.wBase/2 - MARGEN_ESCENARIO + SANGRADO_X, bestKey.cx + jitterX));
          n.y = Math.max(MARGEN_TOP + n.hBase/2,
                Math.min(alto - MARGEN_BOT - n.hBase/2, bestKey.cy + jitterY));
        }
      });

      // 6 iteraciones de separación.
      // H-04: la fase de separación usaba limitarAlEscenario (MARGEN_ESCENARIO=18px
      // en los 4 bordes), permitiendo que separarPar empujara tarjetas bajo el
      // logo (y<18) o sobre el nav (y>alto-18). Ahora se usa un limitador mobile
      // que respeta MARGEN_TOP (72px) y MARGEN_BOT (52px) en los bordes verticales
      // y admite el SANGRADO_X en los horizontales (coherente con la colocación).
      for (let iter = 0; iter < 6; iter++) {
        for (let i = 0; i < nodos.length; i++)
          for (let j = i + 1; j < nodos.length; j++)
            separarPar(nodos[i], nodos[j]);
        // Limitar con márgenes correctos para mobile (header + nav)
        nodos.forEach((n) => {
          n.x = Math.max(n.w/2 + MARGEN_ESCENARIO - SANGRADO_X,
                Math.min(ancho - n.w/2 - MARGEN_ESCENARIO + SANGRADO_X, n.x));
          n.y = Math.max(MARGEN_TOP + n.h/2, Math.min(alto - MARGEN_BOT - n.h/2, n.y));
        });
        empujarFueraDeZonas(nodos, zonas);
      }

      // ── PASE DE LEGIBILIDAD (FASE 2) ────────────────────────────────────
      // Caso detectado en validación visual: narrador y su video comparten
      // columna en filas adyacentes; la separación intenta resolver en Y
      // (soY < soX) pero los clamps verticales la bloquean → solape profundo
      // que entierra el título del documento de abajo. Este pase detecta los
      // pares que quedaron con solape > 55% del ancho y > 35% del alto de la
      // tarjeta menor, y los resuelve por el eje horizontal — donde el
      // sangrado dejó holgura — dejando como máximo un naipe del 30% (los
      // títulos, alineados al borde, quedan siempre legibles).
      for (let i = 0; i < nodos.length; i++) {
        for (let j = i + 1; j < nodos.length; j++) {
          const a = nodos[i], b = nodos[j];
          const soX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
          const soY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
          const minW = Math.min(a.w, b.w), minH = Math.min(a.h, b.h);
          if (soX > minW * 0.55 && soY > minH * 0.35) {
            const empuje = (soX - minW * 0.30) / 2;
            const s = Math.sign(b.x - a.x) || 1;
            a.x -= empuje * s;
            b.x += empuje * s;
          }
        }
      }
      nodos.forEach((n) => {
        n.x = Math.max(n.w/2 + MARGEN_ESCENARIO - SANGRADO_X,
              Math.min(ancho - n.w/2 - MARGEN_ESCENARIO + SANGRADO_X, n.x));
        n.y = Math.max(MARGEN_TOP + n.h/2, Math.min(alto - MARGEN_BOT - n.h/2, n.y));
      });

      nodos.forEach((n) => {
        n.el.style.setProperty('--x',      `${Math.round(n.x)}px`);
        n.el.style.setProperty('--y',      `${Math.round(n.y)}px`);
        // cap visual en 1.0: coherente con el cap dimensional usado arriba
        n.el.style.setProperty('--escala', String(Math.min(n.escalaAutoral, 1.0)));
      });
      return;
    }

    // ── DESKTOP: algoritmo Monte Carlo completo ───────────────────────────
    // O-3: ubicarPorBusqueda solo corre para desktop (el guard mobile anterior
    // ya retornó). Evita el cálculo de ~2.200 candidatos × n en mobile.
    const factor = ubicarPorBusqueda(nodos, ancho, alto, zonas);

    nodos.forEach((n) => limitarAlEscenario(n, ancho, alto));
    empujarFueraDeZonas(nodos, zonas);
    for (let iter = 0; iter < ITERACIONES_LIMPIEZA_FINAL; iter++) {
      let huboMovimiento = false;
      for (let i = 0; i < nodos.length; i++)
        for (let j = i + 1; j < nodos.length; j++)
          if (separarPar(nodos[i], nodos[j])) huboMovimiento = true;
      empujarFueraDeZonas(nodos, zonas);
      nodos.forEach((n) => limitarAlEscenario(n, ancho, alto));
      if (!huboMovimiento) break;
    }

    nodos.forEach((n) => {
      n.el.style.setProperty('--x',      `${Math.round(n.x)}px`);
      n.el.style.setProperty('--y',      `${Math.round(n.y)}px`);
      n.el.style.setProperty('--escala', String(n.escalaAutoral * factor));
    });
  }

  function ubicarPorBusqueda(nodos, ancho, alto, zonas) {
    const candidatosBase = [];
    for (let y = MARGEN_ESCENARIO; y <= alto - MARGEN_ESCENARIO; y += PASO_BUSQUEDA)
      for (let x = MARGEN_ESCENARIO; x <= ancho - MARGEN_ESCENARIO; x += PASO_BUSQUEDA)
        candidatosBase.push({ x, y });

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

      const validos = [];
      for (const candidato of candidatosBase) {
        if (candidato.x - w/2 < 0 || candidato.x + w/2 > ancho) continue;
        if (candidato.y - h/2 < 0 || candidato.y + h/2 > alto) continue;
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
        let mejorDanio = Infinity, mejorCandidato = null;
        for (const candidato of candidatosBase) {
          if (candidato.x - w/2 < 0 || candidato.x + w/2 > ancho) continue;
          if (candidato.y - h/2 < 0 || candidato.y + h/2 > alto) continue;
          if (zonas.some((z) => cajaSuperponeZona(candidato.x, candidato.y, w, h, z))) continue;
          const danio = colocados.reduce(
            (acc, c) => acc + areaDeSuperposicion(candidato.x, candidato.y, w, h, c), 0);
          if (danio < mejorDanio) {
            mejorDanio = danio;
            mejorCandidato = candidato;
            if (danio === 0) break;
          }
        }
        const destino = mejorCandidato || { x: (nodo.anclaX/100)*ancho, y: (nodo.anclaY/100)*alto };
        todosEntraron = false;
        colocados.push({ nodo, x: destino.x, y: destino.y, w, h });
      }
    });

    return { colocados, todosEntraron };
  }

  function cajaSuperponeZona(x, y, w, h, zona) {
    return x - w/2 < zona.derecha && x + w/2 > zona.izquierda
        && y - h/2 < zona.abajo   && y + h/2 > zona.arriba;
  }

  function cajaSuperponeCaja(x, y, w, h, otra) {
    return Math.abs(x - otra.x) < (w + otra.w)/2 + SEPARACION_MINIMA
        && Math.abs(y - otra.y) < (h + otra.h)/2 + SEPARACION_MINIMA;
  }

  function areaDeSuperposicion(x, y, w, h, otra) {
    const solaX = Math.max(0, Math.min(x+w/2, otra.x+otra.w/2) - Math.max(x-w/2, otra.x-otra.w/2));
    const solaY = Math.max(0, Math.min(y+h/2, otra.y+otra.h/2) - Math.max(y-h/2, otra.y-otra.h/2));
    return solaX * solaY;
  }

  function separarPar(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const soX = (a.w+b.w)/2 + SEPARACION_MINIMA - Math.abs(dx);
    const soY = (a.h+b.h)/2 + SEPARACION_MINIMA - Math.abs(dy);
    if (soX <= EPSILON || soY <= EPSILON) return false;
    if (soX < soY) { const s = Math.sign(dx)||1; a.x -= soX/2*s; b.x += soX/2*s; }
    else           { const s = Math.sign(dy)||1; a.y -= soY/2*s; b.y += soY/2*s; }
    return true;
  }

  function empujarFueraDeZonas(nodos, zonas) {
    if (!zonas.length) return;
    nodos.forEach((n) => {
      zonas.forEach((zona) => {
        if (!cajaSuperponeZona(n.x, n.y, n.w, n.h, zona)) return;
        const izq = n.x - n.w/2, der = n.x + n.w/2;
        const arr = n.y - n.h/2, abj = n.y + n.h/2;
        const dIzq = der - zona.izquierda, dDer = zona.derecha - izq;
        const dArr = abj - zona.arriba,    dAbj = zona.abajo   - arr;
        const min = Math.min(dIzq, dDer, dArr, dAbj);
        if      (min === dDer) n.x = zona.derecha   + n.w/2;
        else if (min === dIzq) n.x = zona.izquierda - n.w/2;
        else if (min === dAbj) n.y = zona.abajo     + n.h/2;
        else                   n.y = zona.arriba    - n.h/2;
      });
    });
  }

  function limitarAlEscenario(n, ancho, alto) {
    n.x = Math.max(n.w/2 + MARGEN_ESCENARIO, Math.min(ancho - n.w/2 - MARGEN_ESCENARIO, n.x));
    n.y = Math.max(n.h/2 + MARGEN_ESCENARIO, Math.min(alto  - n.h/2 - MARGEN_ESCENARIO, n.y));
  }

  function obtenerZonasProtegidas(seccion, rectEscenario) {
    const zonas = [];
    agregarZonaDeElemento(zonas, document.querySelector('.marca-chip'),      rectEscenario);
    agregarZonaDeElemento(zonas, document.querySelector('.menu-inst-btn'),   rectEscenario);
    agregarZonaDeElemento(zonas, document.querySelector('.ruta'),            rectEscenario);
    agregarZonaDeElemento(zonas, seccion.querySelector('.sede-kicker'),      rectEscenario);
    agregarZonaDeElemento(zonas, document.getElementById('ruta-m'),         rectEscenario);

    try {
      const declaradas = JSON.parse(seccion.dataset.zonasProtegidas || '[]');
      declaradas.forEach((z) => {
        const ancho = rectEscenario.width, alto = rectEscenario.height;
        zonas.push({
          izquierda: (z.x/100)*ancho            - MARGEN_ZONA_PROTEGIDA,
          derecha:   ((z.x+z.ancho)/100)*ancho  + MARGEN_ZONA_PROTEGIDA,
          arriba:    (z.y/100)*alto              - MARGEN_ZONA_PROTEGIDA,
          abajo:     ((z.y+z.alto)/100)*alto     + MARGEN_ZONA_PROTEGIDA,
        });
      });
    } catch (error) {
      console.warn('No se pudieron leer las zonas protegidas', error);
    }
    return zonas;
  }

  function agregarZonaDeElemento(zonas, elemento, rectEscenario) {
    if (!elemento) return;
    const r = elemento.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    zonas.push({
      izquierda: r.left  - rectEscenario.left - MARGEN_ZONA_PROTEGIDA,
      derecha:   r.right - rectEscenario.left + MARGEN_ZONA_PROTEGIDA,
      arriba:    r.top   - rectEscenario.top  - MARGEN_ZONA_PROTEGIDA,
      abajo:     r.bottom- rectEscenario.top  + MARGEN_ZONA_PROTEGIDA,
    });
  }

  return { distribuir };
})();

window.Distribuidor = Distribuidor;
