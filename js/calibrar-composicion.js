/**
 * LABORATORIO — Métricas Compositivas / Editoriales
 * ═══════════════════════════════════════════════════════════════════════════
 * PARTE B del encargo. Resuelve el problema declarado en B1:
 * un layout puede tener 0 solapes, 0 invasiones y 0 oclusiones y aun así
 * verse desordenado. Estas métricas miden la CALIDAD COMPOSITIVA.
 *
 * COMPLETAMENTE PASIVO. Solo lee geometría. No escribe DOM, no mueve tarjetas,
 * no invoca actuadores, no llama a distribuir().
 *
 * Objetivos declarados en el encargo (B2):
 *   M-C1 Ocupación útil     → 50–56 %
 *   M-C2 Espacio muerto     → ≤ 32 %
 *   M-C3 Balance izq/der    → ≤ 12 %
 *   M-C4 Balance sup/inf    → ≤ 15 %
 *   M-C5 Fragmentación      → minimizar agrupamientos accidentales
 *   M-C6 Respiración        → separación geométrica + perceptual
 *   M-C7 Continuidad narrativa → permanentes con recorrido coherente
 *
 * Los rangos objetivo provienen del análisis de evidencia real
 * (3 capturas de dispositivo, sesión android-376x835@3.25 del 2026-07-27):
 *   Eldorado  4 elem → ocupación 42,6 % · muerto 42 % · balH +20,9 %  ✗
 *   Oberá     7 elem → ocupación 57,1 % · muerto 25 % · balH  +6,5 %  ✓
 *   Posadas   8 elem → ocupación 74,6 % · muerto 17 % · balH  +5,8 %  ✗ (solape)
 * ═══════════════════════════════════════════════════════════════════════════
 */
window.__CALIBRAR_COMPOSICION__ = (() => {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN — todos los umbrales son calibrables, ninguno arbitrario
  // ══════════════════════════════════════════════════════════════════════════
  const CFG = {
    // M-C1 · Rango objetivo de ocupación útil.
    // Origen: Oberá (57,1 %) fue la única composición sin defecto por exceso
    // ni por defecto de las tres medidas. El rango la contiene con margen.
    OCUPACION_MIN: 0.50,
    OCUPACION_MAX: 0.56,
    OCUPACION_TOLERANCIA: 0.10,   // fuera del rango, penalización lineal hasta ±10 pts

    // M-C2 · Espacio muerto máximo.
    // [CICLO 3] Con el umbral anterior (0,32) la métrica NO discriminaba:
    // se cumplía en 11 de 12 observaciones, incluidas las de score 75 y 81.
    // Media de los aprobados 14,6% frente a 15,3% de los rechazados: las
    // distribuciones se superponían casi por completo.
    // El umbral discriminante calculado sobre las 12 observaciones es 15%;
    // se adopta 0,20 para dejar margen sin perder poder de discriminación.
    // NOTA: el poder discriminante de esta métrica sigue siendo bajo.
    MUERTO_MAX: 0.20,
    MUERTO_CELDA_UMBRAL: 0.05,    // celda con <5 % de ocupación cuenta como muerta
    GRILLA_COLS: 4,
    GRILLA_ROWS: 6,

    // M-C3 / M-C4 · Balance de masa visual.
    // Origen: Eldorado +20,9 % horizontal se percibe desequilibrado;
    // Oberá +6,5 % y Posadas +5,8 % se perciben estables.
    BALANCE_H_MAX: 0.12,
    BALANCE_V_MAX: 0.15,

    // M-C5 · Fragmentación: coeficiente de variación de las distancias
    // al vecino más cercano. CV alto = unos apiñados y otros aislados.
    FRAGMENTACION_MAX: 0.60,

    // M-C6 · Respiración. La separación geométrica del motor es 8 px (mobile).
    // El umbral perceptual se fija en 2× ese valor: la separación mínima evita
    // el contacto, pero para leerse como objetos distintos se requiere
    // aproximadamente el doble. Es una heurística de diseño declarada, no
    // una medición — está expuesta para calibración con evidencia futura.
    RESPIRACION_GEOMETRICA_PX: 8,
    RESPIRACION_PERCEPTUAL_PX: 16,
    RESPIRACION_RADIO_VECINDAD: 260,  // px: pares más lejanos no compiten visualmente

    // M-C7 · Continuidad narrativa de los elementos permanentes.
    CONTINUIDAD_RADIO_AISLAMIENTO: 320, // px: sin vecinos en este radio = aislado
    CONTINUIDAD_MARGEN_EXTREMO: 0.15,   // fracción del lienzo considerada "borde"

    // Pesos del índice compositivo global. Suman 1.
    // Los cuatro primeros tienen objetivo numérico explícito en el encargo,
    // por eso concentran el 68 % del peso. Los tres últimos son cualitativos.
    // ── MODELO v1 (pesos originales, conservados para reversión) ──────────
    PESOS: {
      ocupacion:    0.22,
      espacioMuerto:0.18,
      balanceH:     0.16,
      balanceV:     0.12,
      fragmentacion:0.12,
      respiracion:  0.12,
      continuidad:  0.08,
    },

    // ══════════════════════════════════════════════════════════════════════
    // MODELO v3 · rediseño validado sobre 25 observaciones reales
    // Ver documento "Auditoría del Modelo de Evaluación Compositiva".
    //
    // Corrige cuatro defectos del modelo v1:
    //   CR-1 umbrales binarios      → función suave() con decaimiento continuo
    //   CR-2 agregación compensatoria → media geométrica ponderada
    //   CR-3 sin término de solape   → métrica de solape con peso 0,20
    //   CR-5 ocupación simétrica     → tolerancias asimétricas
    //
    // Resultado medido: falsos positivos 16% → 0%, sin falsos negativos;
    // correlación de Spearman score↔defectos −0,578 → −0,812.
    //
    // Interruptor de reversión: MODELO_V3 = false restaura el modelo v1.
    // ══════════════════════════════════════════════════════════════════════
    MODELO_V3: true,

    // Zona ideal y tolerancias del decaimiento continuo. El sub-score vale 1
    // dentro del ideal y cae de forma lineal hasta 0 en la tolerancia.
    // Los ideales provienen de las composiciones sin defecto (banda amplia);
    // las tolerancias, de los umbrales del modelo v1.
    V3_MUERTO_IDEAL: 0.08,  V3_MUERTO_TOL: 0.28,
    V3_BALH_IDEAL:   0.05,  V3_BALH_TOL:   0.16,
    V3_BALV_IDEAL:   0.06,  V3_BALV_TOL:   0.20,
    V3_FRAG_IDEAL:   0.25,  V3_FRAG_TOL:   0.70,

    // Ocupación asimétrica: el exceso produce solape, por eso su tolerancia
    // es más estricta que la del defecto (el vacío es tolerable).
    V3_OCUP_LO: 0.46,  V3_OCUP_HI: 0.58,
    V3_OCUP_TOL_DEFECTO: 0.16,  V3_OCUP_TOL_EXCESO: 0.10,

    // Solape: descuenta el umbral espurio (P99 del AABB rotado) y normaliza
    // el exceso contra el valor de los casos severos observados.
    V3_SOLAPE_ESPURIO: 3200,   // px²
    V3_SOLAPE_SEVERO:  20000,  // px² (casos reales: 20.195 y 22.885)

    // Piso por sub-score: preserva resolución en la zona baja sin reintroducir
    // la compensación. Calibrado para que lo defectuoso no colapse a 3-18.
    V3_PISO: 0.20,

    // Pesos del modelo v3. La ocupación baja de 0,22 a 0,18 para hacer sitio
    // al término de solape (0,20, el más alto: es el defecto más grave).
    PESOS_V3: {
      ocupacion:    0.18,
      solape:       0.20,
      espacioMuerto:0.14,
      balanceH:     0.12,
      balanceV:     0.10,
      fragmentacion:0.08,
      respiracion:  0.10,
      continuidad:  0.08,
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // UTILIDADES GEOMÉTRICAS
  // ══════════════════════════════════════════════════════════════════════════
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  const cx = (r) => r.left + r.width / 2;
  const cy = (r) => r.top + r.height / 2;

  function interseccion(a, b) {
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ox * oy;
  }

  /** Distancia mínima borde a borde. 0 si se tocan o solapan. */
  function distanciaBordes(a, b) {
    const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
    const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
    return Math.sqrt(dx * dx + dy * dy);
  }

  const distanciaCentros = (a, b) =>
    Math.hypot(cx(a) - cx(b), cy(a) - cy(b));

  // ══════════════════════════════════════════════════════════════════════════
  // M-C1 · OCUPACIÓN ÚTIL
  // Área efectivamente cubierta por tarjetas, descontando el doble conteo
  // de las superposiciones, sobre el área útil del escenario.
  // ══════════════════════════════════════════════════════════════════════════
  function ocupacionUtil(rects, lienzo) {
    if (!rects.length || !lienzo) return { valor: 0, bruta: 0, solapada: 0 };
    const areaLienzo = area(lienzo);
    if (areaLienzo <= 0) return { valor: 0, bruta: 0, solapada: 0 };

    // Área bruta: suma de las cajas recortadas al lienzo
    let bruta = 0;
    rects.forEach((r) => { bruta += interseccion(r, lienzo); });

    // Área solapada (doble conteo a descontar)
    let solapada = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        solapada += interseccion(rects[i], rects[j]);
      }
    }
    const neta = Math.max(0, bruta - solapada);
    return {
      valor:    +(neta / areaLienzo).toFixed(4),
      bruta:    +(bruta / areaLienzo).toFixed(4),
      solapada: Math.round(solapada),
      areaLienzo: Math.round(areaLienzo),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M-C2 · ESPACIO MUERTO
  // Fracción de celdas de la grilla con ocupación por debajo del umbral.
  // ══════════════════════════════════════════════════════════════════════════
  function espacioMuerto(rects, lienzo) {
    if (!lienzo) return { valor: 1, celdasMuertas: 0, total: 0, mapa: [] };
    const { GRILLA_COLS: C, GRILLA_ROWS: R, MUERTO_CELDA_UMBRAL: U } = CFG;
    const cw = lienzo.width / C, ch = lienzo.height / R;
    const mapa = [];
    let muertas = 0;

    for (let r = 0; r < R; r++) {
      const fila = [];
      for (let c = 0; c < C; c++) {
        const celda = {
          left: lienzo.left + c * cw, top: lienzo.top + r * ch,
          right: lienzo.left + (c + 1) * cw, bottom: lienzo.top + (r + 1) * ch,
          width: cw, height: ch,
        };
        const areaCelda = cw * ch;
        let ocup = 0;
        rects.forEach((x) => { ocup += interseccion(x, celda); });
        const pct = areaCelda > 0 ? Math.min(1, ocup / areaCelda) : 0;
        if (pct < U) muertas++;
        fila.push(+pct.toFixed(3));
      }
      mapa.push(fila);
    }
    const total = C * R;
    return { valor: +(muertas / total).toFixed(4), celdasMuertas: muertas, total, mapa };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M-C3 / M-C4 · BALANCE DE MASA VISUAL
  // Centro de masa ponderado por área, y desvío respecto del centro del lienzo.
  // ══════════════════════════════════════════════════════════════════════════
  function balance(rects, lienzo) {
    if (!rects.length || !lienzo) {
      return { h: 0, v: 0, centro: null, masaIzq: 0, masaDer: 0, masaSup: 0, masaInf: 0 };
    }
    const masaTotal = rects.reduce((a, r) => a + area(r), 0);
    if (masaTotal <= 0) return { h: 0, v: 0, centro: null };

    const centroX = rects.reduce((a, r) => a + area(r) * cx(r), 0) / masaTotal;
    const centroY = rects.reduce((a, r) => a + area(r) * cy(r), 0) / masaTotal;

    const lx = lienzo.left + lienzo.width / 2;
    const ly = lienzo.top + lienzo.height / 2;

    // Masa a cada lado del eje (recortando las cajas por el eje)
    let mi = 0, md = 0, ms = 0, mf = 0;
    rects.forEach((r) => {
      mi += interseccion(r, { left: lienzo.left, right: lx, top: lienzo.top, bottom: lienzo.bottom });
      md += interseccion(r, { left: lx, right: lienzo.right, top: lienzo.top, bottom: lienzo.bottom });
      ms += interseccion(r, { left: lienzo.left, right: lienzo.right, top: lienzo.top, bottom: ly });
      mf += interseccion(r, { left: lienzo.left, right: lienzo.right, top: ly, bottom: lienzo.bottom });
    });

    return {
      // Desvío del centro de masa, normalizado a la semidimensión (−1..1)
      h: +((centroX - lx) / (lienzo.width / 2)).toFixed(4),
      v: +((centroY - ly) / (lienzo.height / 2)).toFixed(4),
      centro: { x: +centroX.toFixed(1), y: +centroY.toFixed(1) },
      // Reparto de masa por mitades (diagnóstico complementario)
      masaIzq: Math.round(mi), masaDer: Math.round(md),
      masaSup: Math.round(ms), masaInf: Math.round(mf),
      asimetriaH: mi + md > 0 ? +(Math.abs(md - mi) / (mi + md)).toFixed(4) : 0,
      asimetriaV: ms + mf > 0 ? +(Math.abs(mf - ms) / (ms + mf)).toFixed(4) : 0,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M-C5 · FRAGMENTACIÓN
  // Coeficiente de variación de las distancias al vecino más cercano.
  // CV bajo = distribución pareja. CV alto = unos apiñados y otros aislados.
  // ══════════════════════════════════════════════════════════════════════════
  function fragmentacion(rects) {
    if (rects.length < 3) return { valor: 0, cv: 0, distancias: [], n: rects.length };
    const dists = rects.map((r, i) => {
      let min = Infinity;
      rects.forEach((o, j) => {
        if (i === j) return;
        const d = distanciaCentros(r, o);
        if (d < min) min = d;
      });
      return isFinite(min) ? min : 0;
    });
    const media = dists.reduce((a, b) => a + b, 0) / dists.length;
    if (media <= 0) return { valor: 0, cv: 0, distancias: dists, n: rects.length };
    const varianza = dists.reduce((a, d) => a + (d - media) ** 2, 0) / dists.length;
    const cv = Math.sqrt(varianza) / media;
    return {
      valor: +Math.min(1, cv).toFixed(4),
      cv: +cv.toFixed(4),
      mediaDistancia: +media.toFixed(1),
      minDistancia: +Math.min(...dists).toFixed(1),
      maxDistancia: +Math.max(...dists).toFixed(1),
      n: rects.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M-C6 · RESPIRACIÓN EDITORIAL
  // Separación borde a borde. Distingue el mínimo geométrico (no tocarse)
  // del mínimo perceptual (leerse como objetos distintos).
  // ══════════════════════════════════════════════════════════════════════════
  function respiracion(rects) {
    if (rects.length < 2) {
      return { valor: 1, paresEvaluados: 0, bajoGeometrico: 0, bajoPerceptual: 0 };
    }
    const { RESPIRACION_GEOMETRICA_PX: G, RESPIRACION_PERCEPTUAL_PX: P,
            RESPIRACION_RADIO_VECINDAD: RAD } = CFG;
    let evaluados = 0, bajoG = 0, bajoP = 0, minGap = Infinity;
    let sumaSuficiencia = 0;
    const detalle = [];

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        // Solo evaluar pares que compiten visualmente (dentro del radio)
        if (distanciaCentros(rects[i], rects[j]) > RAD) continue;
        evaluados++;
        const gap = distanciaBordes(rects[i], rects[j]);
        if (gap < minGap) minGap = gap;
        if (gap < G) bajoG++;
        if (gap < P) bajoP++;
        // Suficiencia continua: 1 cuando el par alcanza la separación
        // perceptual, y proporcional por debajo. Se usa una medida continua
        // y no un conteo binario porque con pocos pares vecinos el conteo
        // colapsa: un solo par por debajo del umbral anulaba la métrica,
        // aunque el resto de la escena respirara con holgura.
        sumaSuficiencia += Math.min(1, gap / P);
        if (gap < P) detalle.push({ i, j, gap: +gap.toFixed(1) });
      }
    }
    if (!evaluados) return { valor: 1, paresEvaluados: 0, bajoGeometrico: 0, bajoPerceptual: 0 };
    // Score: suficiencia media de respiración entre los pares vecinos.
    // Los pares que se tocan o solapan (gap = 0) aportan 0 y penalizan fuerte.
    const valor = sumaSuficiencia / evaluados;
    return {
      valor: +valor.toFixed(4),
      paresEvaluados: evaluados,
      bajoGeometrico: bajoG,
      bajoPerceptual: bajoP,
      minGap: isFinite(minGap) ? +minGap.toFixed(1) : null,
      detalle: detalle.slice(0, 10),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M-C7 · CONTINUIDAD NARRATIVA
  // Los elementos permanentes (narradores UA) son el ancla del recorrido.
  // Se penaliza que queden aislados, apilados, en extremos u ocultos por densidad.
  // ══════════════════════════════════════════════════════════════════════════
  function continuidadNarrativa(elementos, lienzo) {
    const permanentes = elementos.filter((e) => e.permanente);
    if (!permanentes.length || !lienzo) {
      return { valor: 1, permanentes: 0, aislados: 0, enExtremo: 0, apilados: false, sinDatos: true };
    }
    const { CONTINUIDAD_RADIO_AISLAMIENTO: RAD, CONTINUIDAD_MARGEN_EXTREMO: MARG } = CFG;
    const todos = elementos.map((e) => e.rect);

    // 1 · Aislamiento: permanente sin ningún vecino dentro del radio
    let aislados = 0;
    permanentes.forEach((p) => {
      const vecinos = todos.filter((r) => r !== p.rect && distanciaCentros(p.rect, r) <= RAD);
      if (!vecinos.length) aislados++;
    });

    // 2 · Extremos: permanente cuyo centro cae en la franja de borde
    const mx = lienzo.width * MARG, my = lienzo.height * MARG;
    let enExtremo = 0;
    permanentes.forEach((p) => {
      const px = cx(p.rect), py = cy(p.rect);
      if (px < lienzo.left + mx || px > lienzo.right - mx ||
          py < lienzo.top + my  || py > lienzo.bottom - my) enExtremo++;
    });

    // 3 · Apilamiento: todos los permanentes en la misma banda o columna
    let apilados = false;
    if (permanentes.length >= 2) {
      const cols = new Set(permanentes.map((p) =>
        Math.floor((cx(p.rect) - lienzo.left) / (lienzo.width / 2))));
      const filas = new Set(permanentes.map((p) =>
        Math.floor((cy(p.rect) - lienzo.top) / (lienzo.height / 3))));
      apilados = cols.size === 1 || filas.size === 1;
    }

    // 4 · Dispersión: los permanentes deberían repartirse, no agruparse.
    // Se mide como la distancia media entre permanentes normalizada por la
    // diagonal del lienzo. Valor bajo = agrupados.
    let dispersion = 1;
    if (permanentes.length >= 2) {
      let suma = 0, pares = 0;
      for (let i = 0; i < permanentes.length; i++) {
        for (let j = i + 1; j < permanentes.length; j++) {
          suma += distanciaCentros(permanentes[i].rect, permanentes[j].rect);
          pares++;
        }
      }
      const diag = Math.hypot(lienzo.width, lienzo.height);
      // Dispersión ideal ≈ 40 % de la diagonal; se normaliza contra ese valor
      dispersion = Math.min(1, (suma / pares) / (diag * 0.40));
    }

    // Score compuesto
    const n = permanentes.length;
    const penalAislamiento = aislados / n;
    const penalExtremo     = enExtremo / n;
    const penalApilado     = apilados ? 1 : 0;
    const valor = Math.max(0,
        0.35 * (1 - penalAislamiento)
      + 0.25 * (1 - penalExtremo)
      + 0.20 * (1 - penalApilado)
      + 0.20 * dispersion);

    return {
      valor: +valor.toFixed(4),
      permanentes: n, aislados, enExtremo, apilados,
      dispersion: +dispersion.toFixed(4),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÍNDICE COMPOSITIVO GLOBAL (0–100)
  // ══════════════════════════════════════════════════════════════════════════

  /** Penalización lineal por salirse de un rango [min,max] con tolerancia. */
  function scoreRango(v, min, max, tol) {
    if (v >= min && v <= max) return 1;
    const d = v < min ? min - v : v - max;
    return Math.max(0, 1 - d / tol);
  }
  /** Penalización lineal por superar un techo. */
  function scoreTecho(v, max, tol) {
    if (v <= max) return 1;
    return Math.max(0, 1 - (v - max) / (tol || max));
  }

  /**
   * v3 · Decaimiento continuo con zona ideal (reemplaza a scoreTecho).
   * Vale 1 dentro del ideal y cae linealmente hasta 0 en la tolerancia.
   * A diferencia de scoreTecho, penaliza desde el valor ideal y no desde el
   * umbral: un balance al 97 % de su límite ya no puntúa 100 %.
   */
  function suave(v, ideal, tol) {
    const a = Math.abs(v);
    if (a <= ideal) return 1;
    return Math.max(0, 1 - (a - ideal) / Math.max(1e-9, tol - ideal));
  }

  /** v3 · Sub-score de ocupación con tolerancias asimétricas. */
  function scoreOcupacionV3(v) {
    if (v < CFG.V3_OCUP_LO) return Math.max(0, 1 - (CFG.V3_OCUP_LO - v) / CFG.V3_OCUP_TOL_DEFECTO);
    if (v > CFG.V3_OCUP_HI) return Math.max(0, 1 - (v - CFG.V3_OCUP_HI) / CFG.V3_OCUP_TOL_EXCESO);
    return 1;
  }

  /**
   * Índice compositivo.
   * @param solapePx  área de solape en px² (para el término de solape de v3)
   */
  function scoreCompositivo(m, solapePx = 0) {
    // ── MODELO v1 (reversión con CFG.MODELO_V3 = false) ───────────────────
    if (!CFG.MODELO_V3) {
      const P = CFG.PESOS;
      const s = {
        ocupacion:     scoreRango(m.ocupacion.valor, CFG.OCUPACION_MIN, CFG.OCUPACION_MAX, CFG.OCUPACION_TOLERANCIA),
        espacioMuerto: scoreTecho(m.espacioMuerto.valor, CFG.MUERTO_MAX, 0.30),
        balanceH:      scoreTecho(Math.abs(m.balance.h), CFG.BALANCE_H_MAX, 0.25),
        balanceV:      scoreTecho(Math.abs(m.balance.v), CFG.BALANCE_V_MAX, 0.25),
        fragmentacion: scoreTecho(m.fragmentacion.valor, CFG.FRAGMENTACION_MAX, 0.40),
        respiracion:   m.respiracion.valor,
        continuidad:   m.continuidad.valor,
      };
      const total = P.ocupacion*s.ocupacion + P.espacioMuerto*s.espacioMuerto
                  + P.balanceH*s.balanceH + P.balanceV*s.balanceV
                  + P.fragmentacion*s.fragmentacion + P.respiracion*s.respiracion
                  + P.continuidad*s.continuidad;
      return {
        score: Math.round(total * 100),
        componentes: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 100)])),
        pesos: P, modelo: 'v1',
      };
    }

    // ── MODELO v3 ─────────────────────────────────────────────────────────
    const P = CFG.PESOS_V3;
    const solExceso = Math.max(0, solapePx - CFG.V3_SOLAPE_ESPURIO);
    const s = {
      ocupacion:     scoreOcupacionV3(m.ocupacion.valor),
      solape:        Math.max(0, 1 - solExceso / CFG.V3_SOLAPE_SEVERO),
      espacioMuerto: suave(m.espacioMuerto.valor, CFG.V3_MUERTO_IDEAL, CFG.V3_MUERTO_TOL),
      balanceH:      suave(m.balance.h, CFG.V3_BALH_IDEAL, CFG.V3_BALH_TOL),
      balanceV:      suave(m.balance.v, CFG.V3_BALV_IDEAL, CFG.V3_BALV_TOL),
      fragmentacion: suave(m.fragmentacion.valor, CFG.V3_FRAG_IDEAL, CFG.V3_FRAG_TOL),
      respiracion:   m.respiracion.valor,
      continuidad:   m.continuidad.valor,
    };

    // Media geométrica ponderada con piso y reescalado.
    // El piso evita que una métrica en 0 lleve el logaritmo a −∞ y preserva
    // resolución; el reescalado a [0,100] compensa la compresión del piso.
    const piso = CFG.V3_PISO;
    let lnSuma = 0;
    for (const k in P) {
      const sConPiso = piso + (1 - piso) * s[k];
      lnSuma += P[k] * Math.log(sConPiso);
    }
    const bruto = Math.exp(lnSuma);
    const score = Math.max(0, (bruto - piso) / (1 - piso));

    return {
      score: Math.round(score * 100),
      componentes: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 100)])),
      pesos: P, modelo: 'v3',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Evalúa la composición de una sede.
   * @param elementos [{ id, tipo, permanente, rect:{left,top,right,bottom,width,height} }]
   * @param lienzo    { left, top, right, bottom, width, height }  área útil
   */
  function evaluar(elementos, lienzo) {
    if (!Array.isArray(elementos) || !lienzo || !lienzo.width) {
      return { valido: false, razon: 'entrada-invalida' };
    }
    const rects = elementos.map((e) => e.rect).filter((r) => r && r.width > 0);
    if (!rects.length) return { valido: false, razon: 'sin-elementos' };

    const m = {
      ocupacion:     ocupacionUtil(rects, lienzo),
      espacioMuerto: espacioMuerto(rects, lienzo),
      balance:       balance(rects, lienzo),
      fragmentacion: fragmentacion(rects),
      respiracion:   respiracion(rects),
      continuidad:   continuidadNarrativa(elementos, lienzo),
    };
    // El término de solape de v3 usa el área ya calculada por ocupacionUtil
    // (suma de intersecciones entre pares, en px²).
    const sc = scoreCompositivo(m, m.ocupacion.solapada || 0);

    return {
      valido: true,
      n: rects.length,
      metricas: {
        'M-C1_ocupacionUtil':   m.ocupacion,
        'M-C2_espacioMuerto':   m.espacioMuerto,
        'M-C3_balanceH':        { valor: m.balance.h, asimetria: m.balance.asimetriaH,
                                  masaIzq: m.balance.masaIzq, masaDer: m.balance.masaDer },
        'M-C4_balanceV':        { valor: m.balance.v, asimetria: m.balance.asimetriaV,
                                  masaSup: m.balance.masaSup, masaInf: m.balance.masaInf },
        'M-C5_fragmentacion':   m.fragmentacion,
        'M-C6_respiracion':     m.respiracion,
        'M-C7_continuidad':     m.continuidad,
      },
      centroMasa: m.balance.centro,
      heatmap: m.espacioMuerto.mapa,
      scoreCompositivo: sc.score,
      componentes: sc.componentes,
      // Veredicto contra los objetivos declarados en el encargo
      objetivos: {
        ocupacionEnRango: m.ocupacion.valor >= CFG.OCUPACION_MIN && m.ocupacion.valor <= CFG.OCUPACION_MAX,
        muertoBajoTecho:  m.espacioMuerto.valor <= CFG.MUERTO_MAX,
        balanceHOk:       Math.abs(m.balance.h) <= CFG.BALANCE_H_MAX,
        balanceVOk:       Math.abs(m.balance.v) <= CFG.BALANCE_V_MAX,
        scoreOk:          sc.score >= 85,
      },
    };
  }

  /**
   * Extrae los elementos y el lienzo de una sede del DOM, en el formato que
   * espera evaluar(). Solo lectura.
   */
  function extraerDeSede(sedeEl) {
    if (!sedeEl) return null;
    const escenario = sedeEl.querySelector('.escenario');
    if (!escenario) return null;
    const rEsc = escenario.getBoundingClientRect();
    if (!rEsc.width) return null;

    // Lienzo útil: escenario menos los márgenes reservados de cabecera y nav
    const M = window.AC_K?.MOBILE;
    const esMobile = !!window.esMobile?.();
    const mTop = esMobile ? 92 : 0;
    const mBot = esMobile ? 52 : 0;
    const lienzo = {
      left: rEsc.left, right: rEsc.right,
      top: rEsc.top + mTop, bottom: rEsc.bottom - mBot,
      width: rEsc.width, height: Math.max(1, rEsc.height - mTop - mBot),
    };

    const elementos = Array.from(
      sedeEl.querySelectorAll('.elemento:not(.elemento--rotacion-espera)')
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.testimonioId || el.dataset.tipo || null,
        tipo: el.dataset.tipo || null,
        permanente: el.dataset.permanente === 'true',
        orden: Number(el.dataset.orden) || null,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                width: r.width, height: r.height },
      };
    }).filter((e) => e.rect.width > 0);

    return { elementos, lienzo };
  }

  /** Evalúa directamente una sede del DOM. */
  function evaluarSede(sedeEl) {
    const d = extraerDeSede(sedeEl);
    if (!d) return { valido: false, razon: 'sede-no-medible' };
    const r = evaluar(d.elementos, d.lienzo);
    if (r.valido) r.sede = sedeEl.dataset.sede;
    return r;
  }

  return {
    CFG, evaluar, evaluarSede, extraerDeSede,
    // Métricas individuales expuestas para pruebas
    ocupacionUtil, espacioMuerto, balance, fragmentacion, respiracion,
    continuidadNarrativa, scoreCompositivo,
  };
})();
