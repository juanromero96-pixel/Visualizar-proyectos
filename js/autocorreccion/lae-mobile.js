/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — LAE Mobile (Layout Adaptation Engine Mobile)
 * Plan Técnico de Aplicación §3, §4, §5, §6 — Fases 1-4
 *
 * Implementa la cadena completa de adaptación visual mobile:
 * Reality Probe → Causal Diagnoser → Intervention Ladder → Retry Controller
 *
 * Base arquitectónica: todo determinístico, sin IA, sin backend, sin random.
 * Motor Editorial intocado. Corpus intocado.
 * Valores calibrados por S-1/S-2/S-3 (ver constantes MOBILE).
 *
 * Publicado en window.AC_LAE_Mobile — integrado en index.js al arranque.
 */
window.AC_LAE_Mobile = (() => {
  'use strict';

  const K  = window.AC_K;
  const M  = K.MOBILE;
  const Bus = window.AC_Bus;

  // ══════════════════════════════════════════════════════════════════════════
  // ① REALITY PROBE
  // Mide el estado real del dispositivo. Todo en este bloque lee del DOM
  // y del entorno del navegador — es la única fuente de verdad.
  // ══════════════════════════════════════════════════════════════════════════
  const RealityProbe = {
    /** Lee la safe-area real del dispositivo. */
    _safeArea() {
      try {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;' +
          'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
          'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(el);
        const cs = getComputedStyle(el);
        const sa = {
          top:    parseFloat(cs.paddingTop)    || 0,
          right:  parseFloat(cs.paddingRight)  || 0,
          bottom: parseFloat(cs.paddingBottom) || 0,
          left:   parseFloat(cs.paddingLeft)   || 0,
        };
        el.remove();
        return sa;
      } catch (e) {
        return { ...M.SAFE_AREA_DEFAULT };
      }
    },

    /** Mide los offsetHeight reales de los elementos activos (métrica pre-transform). */
    _medirAlturas(elementos) {
      return elementos.map((el) => {
        const interior = el.querySelector('.elemento-interior');
        const h = interior ? interior.offsetHeight : el.offsetHeight;
        const w = interior ? interior.offsetWidth  : el.offsetWidth;
        return { id: el.dataset.testimonioId || el.dataset.tipo, h, w, tipo: el.dataset.tipo, el };
      });
    },

    /** Calcula el solape AABB de dos elementos (post-transform, lo que reporta getBoundingClientRect). */
    _solapeAABB(r1, r2) {
      const ox = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
      const oy = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
      return ox * oy;
    },

    /** Calcula el solape de layout (pre-transform, desde --x/--y). */
    _solapeLayout(el1, el2) {
      const cx1 = parseFloat(el1.style.getPropertyValue('--x')) || 0;
      const cy1 = parseFloat(el1.style.getPropertyValue('--y')) || 0;
      const cx2 = parseFloat(el2.style.getPropertyValue('--x')) || 0;
      const cy2 = parseFloat(el2.style.getPropertyValue('--y')) || 0;
      const int1 = el1.querySelector('.elemento-interior');
      const int2 = el2.querySelector('.elemento-interior');
      const w1 = (int1?.offsetWidth  || 0); const h1 = (int1?.offsetHeight || 0);
      const w2 = (int2?.offsetWidth  || 0); const h2 = (int2?.offsetHeight || 0);
      if (!w1 || !w2) return 0;
      const ox = Math.max(0, Math.min(cx1+w1/2, cx2+w2/2) - Math.max(cx1-w1/2, cx2-w2/2));
      const oy = Math.max(0, Math.min(cy1+h1/2, cy2+h2/2) - Math.max(cy1-h1/2, cy2-h2/2));
      return ox * oy;
    },

    /**
     * Medición completa del estado real del dispositivo.
     * Un solo lote de lecturas — sin escrituras intercaladas.
     */
    medir(sede) {
      const escenario = sede.querySelector('.escenario');
      if (!escenario) return null;

      const rectEsc = escenario.getBoundingClientRect();
      const ancho = rectEsc.width;
      const alto  = rectEsc.height;
      if (ancho < 10 || alto < 10) return null;

      const safeArea   = this._safeArea();
      const DPR        = window.devicePixelRatio || 1;
      const vv         = window.visualViewport;
      const innerH     = window.innerHeight;
      const innerW     = window.innerWidth;

      // Márgenes efectivos reales (con safe-area)
      const margenTopEfectivo  = 92 + safeArea.top;
      const margenBotEfectivo  = 52 + safeArea.bottom;
      const altUtil = alto - margenTopEfectivo - margenBotEfectivo;

      // Elementos activos en la sede
      const elementos = Array.from(
        escenario.querySelectorAll('.elemento:not(.elemento--rotacion-espera)')
      ).sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0));

      // Alturas reales (métrica pre-transform — Plan §4.2, §4.5)
      const alturasReales = this._medirAlturas(elementos);

      // Solapes: AABB (post-transform) y layout (pre-transform)
      const pares = [];
      const rects = elementos.map((el) => el.getBoundingClientRect());
      for (let i = 0; i < elementos.length; i++) {
        for (let j = i + 1; j < elementos.length; j++) {
          const aabb = this._solapeAABB(rects[i], rects[j]);
          const layout = this._solapeLayout(elementos[i], elementos[j]);
          if (aabb > 0 || layout > 0) {
            pares.push({
              idA: elementos[i].dataset.testimonioId || elementos[i].dataset.tipo,
              idB: elementos[j].dataset.testimonioId || elementos[j].dataset.tipo,
              elA: elementos[i], elB: elementos[j],
              aabb, layout,
              soloAABB: aabb > 0 && layout === 0,  // firma de DV-01 (rotación)
            });
          }
        }
      }

      // Elementos fuera del viewport del escenario
      const fueraViewport = elementos.filter((el, i) => {
        const r = rects[i];
        return r.left < rectEsc.left - 5 || r.right > rectEsc.right + 5
            || r.top < rectEsc.top - 5 || r.bottom > rectEsc.bottom + 5;
      });

      // Zona protegida (chip institucional)
      const chip = sede.querySelector('.marca-chip');
      const rectChip = chip ? chip.getBoundingClientRect() : null;

      // Capacidad real (fórmula §4.5 del plan)
      const { cap, altRef } = _calcularCapacidad(alturasReales, altUtil, ancho);

      return {
        sede:        sede.dataset.sede,
        ancho, alto, altUtil,
        safeArea, DPR,
        viewportInner:  { w: innerW, h: innerH },
        viewportVisual: vv ? { w: vv.width, h: vv.height, offsetTop: vv.offsetTop } : null,
        margenTopEfectivo, margenBotEfectivo,
        rectEscenario: rectEsc, rectChip,
        elementos, rects, alturasReales,
        N: elementos.length,
        capacidadReal: cap,
        alturaRef: altRef,
        solajesReales:      pares.filter(p => p.layout > M.SOLAPE_REAL_UMBRAL),
        solajesAABB:        pares.filter(p => p.aabb > 0),
        solajesSoloAABB:    pares.filter(p => p.soloAABB),
        fueraViewport,
        discrepanciaGlobal: alturasReales.reduce((s, x) => {
          const ref = M['ALTURA_' + (x.tipo || 'testimonio').toUpperCase().replace('-','_')] || M.ALTURA_TESTIMONIO;
          return s + Math.abs(x.h - ref);
        }, 0),
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS: capacidad real (§4.5 del plan)
  // ══════════════════════════════════════════════════════════════════════════
  function _calcularCapacidad(alturasReales, altUtil, anchoLienzo) {
    // [B2-3] La fórmula es EXCLUSIVA del canal mobile. En desktop el motor usa
    // Monte Carlo (ubicarPorBusqueda), no una grilla. Medición real: en desktop
    // 1366x607 la fórmula daba cap=3 mientras el motor mostraba 8 sin solape
    // en 7/9 casos. Aplicarla fuera de mobile produce reducciones injustificadas.
    if (!window.esMobile?.()) return { cap: null, altRef: null, noAplica: 'canal-desktop' };
    if (!alturasReales.length || altUtil <= 0) {
      return { cap: M.CAP_ESTANDAR, altRef: M.ALTURA_REGISTRO_UA, metodo: 'fallback' };
    }

    // Techo por perfil: límite superior duro que la fórmula nunca puede superar
    const capPerfil = altUtil < M.PERFIL_CRITICO_LIMITE ? M.CAP_CRITICO
                    : altUtil < M.PERFIL_AMPLIO_LIMITE  ? M.CAP_ESTANDAR
                    : M.CAP_AMPLIO;

    const sorted = [...alturasReales].sort((a, b) => a.h - b.h);
    const idx = Math.min(sorted.length - 1, Math.floor(0.75 * sorted.length));
    const altRef = sorted[idx].h || M.ALTURA_REGISTRO_UA;

    // ── R-01 · CAPACIDAD POR ÁREA ────────────────────────────────────────
    // El área por elemento varía en factor 2,05 entre sedes y dispositivos
    // (6,8% a 14,0% del lienzo, 12 observaciones). Un conteo fijo no puede
    // cubrir ese rango: con cap=4 la ocupación va de 27,2% a 56,0%.
    // Se acumulan áreas reales hasta alcanzar la ocupación objetivo.
    if (M.CAPACIDAD_POR_AREA && anchoLienzo > 0) {
      const areaLienzo = anchoLienzo * altUtil;
      // Orden ascendente por área: maximiza la cantidad de elementos que
      // caben dentro del presupuesto, sin sesgar hacia los grandes.
      const porArea = [...alturasReales]
        .map((x) => ({ ...x, area: (x.w || anchoLienzo * 0.44) * x.h }))
        .sort((a, b) => a.area - b.area);

      // Criterio de parada por PROXIMIDAD AL OBJETIVO, no por superarlo.
      // Cortar al cruzar OCUPACION_MAX dejaba la escena subutilizada: la
      // evidencia muestra que 384x687/posadas con 4 elementos alcanza 56,0%
      // y score 95, mientras que con 3 quedaría en 44,4%. Se incluye el
      // elemento cuando su inclusión ACERCA la ocupación al objetivo.
      let acum = 0, n = 0;
      for (const el of porArea) {
        const proyectada = (acum + el.area) / areaLienzo;
        // Techo duro: por encima de este valor aparece el solape (medido 74,4%)
        if (proyectada > M.OCUPACION_TECHO) break;
        if (n >= M.MIN_VISIBLE) {
          const actual = acum / areaLienzo;
          const distSin = Math.abs(actual - M.OCUPACION_OBJETIVO);
          const distCon = Math.abs(proyectada - M.OCUPACION_OBJETIVO);
          if (distCon >= distSin) break;   // incluirlo alejaría del objetivo
        }
        acum += el.area; n++;
      }
      const capArea = Math.max(M.MIN_VISIBLE, Math.min(n, capPerfil));
      return {
        cap: capArea, altRef, metodo: 'area',
        ocupacionProyectada: +(acum / areaLienzo).toFixed(4),
        capPerfil,
      };
    }

    // ── Fallback: capacidad por conteo (comportamiento anterior) ─────────
    const filas = Math.floor(altUtil / (altRef + 8));
    let cap = Math.min(filas * 2, capPerfil);
    cap = Math.max(cap, M.MIN_VISIBLE);
    return { cap, altRef, metodo: 'conteo', capPerfil };
  }

  function _perfil(altUtil) {
    if (altUtil < M.PERFIL_CRITICO_LIMITE) return 'mobile-critico';
    if (altUtil < M.PERFIL_AMPLIO_LIMITE)  return 'mobile-estandar';
    return 'mobile-amplio';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ② CAUSAL DIAGNOSER — 5 causas mobile (Plan §4.2)
  // Todo determinístico. Sin probabilidades. Discriminantes exactos primero.
  // ══════════════════════════════════════════════════════════════════════════
  const CausalDiagnoser = {
    diagnosticar(report, historialCiclo = []) {
      if (!report) return this._cm99('Report nulo');
      const excluidas = historialCiclo
        .filter(i => i.causaRefutada)
        .map(i => i.causa);

      // Discriminante exacto: CM-04 (medición contaminada por rotación)
      // Solape AABB > 0 Y solape layout = 0 → no hay solape real
      if (!excluidas.includes('CM-04')) {
        const soloAABB = report.solajesSoloAABB;
        if (soloAABB.length > 0) {
          // Verificar que el mayor sea <SOLAPE_ESPURIO_AABB
          const maxAABB = Math.max(...soloAABB.map(p => p.aabb));
          if (maxAABB < M.SOLAPE_ESPURIO_AABB && report.solajesReales.length === 0) {
            return {
              causa: 'CM-04', confianza: 'alta',
              escalonSugerido: 'E0',
              evidencia: { pares: soloAABB.length, maxAABB: Math.round(maxAABB), solapeLayout: 0 },
              causasDescartadas: [],
              alcance: 'ninguno',
              escalacionEditorial: false,
            };
          }
        }
      }

      // Discriminante exacto: CM-02 (entrante sin posición calculada — DV-08)
      if (!excluidas.includes('CM-02')) {
        const sinPosicion = report.elementos.filter(el => {
          const x = el.style.getPropertyValue('--x');
          return x.endsWith('%'); // ancla cruda en %, no px calculado
        });
        if (sinPosicion.length > 0) {
          return {
            causa: 'CM-02', confianza: 'alta',
            escalonSugerido: 'E1',
            evidencia: { elementosSinPos: sinPosicion.map(el => el.dataset.testimonioId || el.dataset.tipo) },
            elementosAfectados: sinPosicion,
            causasDescartadas: ['CM-04'],
            alcance: 'individual',
            escalacionEditorial: false,
          };
        }
      }

      // Discriminante exacto: CM-01 (capacidad excedida)
      if (!excluidas.includes('CM-01')) {
        // capacidadReal es null en desktop (B2-3): CM-01 no aplica fuera de mobile
        if (report.capacidadReal !== null && report.N > report.capacidadReal) {
          return {
            causa: 'CM-01', confianza: 'alta',
            escalonSugerido: 'E4',
            evidencia: { N: report.N, capacidadReal: report.capacidadReal, exceso: report.N - report.capacidadReal },
            causasDescartadas: ['CM-04', 'CM-02'],
            alcance: 'escena',
            escalacionEditorial: report.N > report.capacidadReal + 4,  // exceso estructural grave
          };
        }
      }

      // Discriminante exacto: CM-03 (viewport cambiado — DV-02, DV-04)
      if (!excluidas.includes('CM-03')) {
        const prevViewport = _estadoPrevio.altUtil;
        if (prevViewport !== null) {
          const delta = Math.abs(report.altUtil - prevViewport);
          if (delta > M.VIEWPORT_DELTA_PX) {
            const afectados = report.fueraViewport.length + report.solajesReales.length;
            const pctAfectados = afectados / Math.max(1, report.N);
            if (pctAfectados >= M.AFECTADOS_PCT_CM03 || delta > 40) {
              return {
                causa: 'CM-03', confianza: 'alta',
                escalonSugerido: 'E4',
                evidencia: { delta: Math.round(delta), prevAltUtil: prevViewport, currAltUtil: report.altUtil },
                causasDescartadas: ['CM-04', 'CM-02', 'CM-01'],
                alcance: 'escena',
                escalacionEditorial: false,
              };
            }
          }
        }
      }

      // CM-05 (drift sub-pixel DPR — DV-06) — confianza media
      if (!excluidas.includes('CM-05')) {
        const DPRentero = Number.isInteger(report.DPR);
        if (!DPRentero && report.solajesAABB.length >= M.DPR_DRIFT_PARES_MIN) {
          const maxAABB = Math.max(...report.solajesAABB.map(p => p.aabb));
          if (maxAABB < M.DPR_DRIFT_SOLAPE_MAX) {
            return {
              causa: 'CM-05', confianza: 'media',
              escalonSugerido: 'E2',
              evidencia: { DPR: report.DPR, pares: report.solajesAABB.length, maxAABB: Math.round(maxAABB) },
              causasDescartadas: ['CM-04'],
              alcance: 'par',
              escalacionEditorial: false,
            };
          }
        }
      }

      // Hay solape real pero ninguna causa discriminada
      if (report.solajesReales.length > 0 || report.fueraViewport.length > 0) {
        return this._cm99('Sin discriminante exacto; hay anomalía real — E2 conservador');
      }

      // Sistema sano
      return { causa: 'E0-SANO', confianza: 'alta', escalonSugerido: 'E0',
        evidencia: {}, causasDescartadas: [], alcance: 'ninguno', escalacionEditorial: false };
    },

    _cm99(razon) {
      return {
        causa: 'CM-99', confianza: 'baja',
        escalonSugerido: 'E2',
        evidencia: { razon },
        causasDescartadas: [],
        alcance: 'par',
        escalacionEditorial: false,
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ③ INTERVENTION LADDER — E0/E1/E2/E4-mobile (Plan §4.3, §4.4)
  // ══════════════════════════════════════════════════════════════════════════
  const InterventionLadder = {

    /** E0: Observar — no intervenir, registrar abstención. */
    async E0(report, diagnostico) {
      return { ok: true, escalon: 'E0', accion: 'abstencion',
        razon: diagnostico.causa === 'CM-04' ? 'Medición contaminada por AABB rotado — escena sana' : 'Sin mejora posible' };
    },

    /** E1: Ajustar posición de un elemento individual (CM-02 — entrante sin posición). */
    async E1(report, diagnostico) {
      const elSinPos = diagnostico.elementosAfectados?.[0];
      if (!elSinPos) return { ok: false, error: 'Sin elemento para E1', escalon: 'E1' };

      const snap = _snapshot([elSinPos]);
      const sede = report.sede ? document.querySelector(`.sede[data-sede="${report.sede}"]`) : null;

      const res = await _rAF(() => {
        // Invocar reposicionamiento real a través del Distribuidor
        if (window.Distribuidor?.reposicionarEntranteDesktop) {
          window.Distribuidor.reposicionarEntranteDesktop(elSinPos, sede);
        } else {
          // Fallback: resetear a ancla editorial en px
          const ax = elSinPos.dataset.anclaX || '50';
          const ay = elSinPos.dataset.anclaY || '50';
          const rect = report.rectEscenario;
          if (rect?.width) {
            elSinPos.style.setProperty('--x', (parseFloat(ax) / 100 * rect.width) + 'px');
            elSinPos.style.setProperty('--y', (parseFloat(ay) / 100 * rect.height) + 'px');
          }
        }
      }, K.UMBRAL.TIMEOUT_CORRECCCION_MS);

      return { ...res, escalon: 'E1', snap, elementoAfectado: elSinPos.dataset.testimonioId };
    },

    /** E2: Separar un par en conflicto (CM-05, CM-99). */
    async E2(report, diagnostico) {
      const pares = report.solajesReales.length
        ? report.solajesReales
        : report.solajesAABB.slice(0, 1); // en CM-99, tomar el par de mayor solape
      if (!pares.length) return { ok: false, error: 'Sin pares para E2', escalon: 'E2' };

      const { elA, elB } = pares[0];
      const snap = _snapshot([elA, elB]);

      const res = await _rAF(() => {
        const cxA = parseFloat(elA.style.getPropertyValue('--x')) || 0;
        const cyA = parseFloat(elA.style.getPropertyValue('--y')) || 0;
        const cxB = parseFloat(elB.style.getPropertyValue('--x')) || 0;
        const cyB = parseFloat(elB.style.getPropertyValue('--y')) || 0;

        // Vector de separación (de A hacia B, perpendicular al solapamiento)
        let dx = cxB - cxA;
        let dy = cyB - cyA;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= dist; dy /= dist;

        // Desplazamiento mínimo para salir del solape, máximo MAX_DESPL_E2
        const desplazamiento = Math.min(M.MAX_DESPL_E2 / 2, 16);
        // Prioridad: narradores permanentes se mueven menos
        const priorA = elA.dataset.permanente === 'true' ? 0.2 : 0.5;
        const priorB = elB.dataset.permanente === 'true' ? 0.2 : 0.5;

        elA.style.setProperty('--x', (cxA - dx * desplazamiento * priorA * 2) + 'px');
        elA.style.setProperty('--y', (cyA - dy * desplazamiento * priorA * 2) + 'px');
        elB.style.setProperty('--x', (cxB + dx * desplazamiento * priorB * 2) + 'px');
        elB.style.setProperty('--y', (cyB + dy * desplazamiento * priorB * 2) + 'px');
      }, K.UMBRAL.TIMEOUT_CORRECCCION_MS);

      return { ...res, escalon: 'E2', snap };
    },

    /**
     * E4-mobile: Redistribución con capacidad real.
     * La corrección central del plan (Plan §4.4).
     * Pasos: (1) medir alturas reales → (2) calcular capacidadReal →
     * (3) si N > cap: reducir conjunto visible → (4) reasignar zonas →
     * (5) relajar por pares → (6) clamp.
     */
    async E4(report, diagnostico) {
      const sede = document.querySelector(`.sede[data-sede="${report.sede}"]`);
      if (!sede) return { ok: false, error: 'Sede no encontrada', escalon: 'E4' };

      const escenario = sede.querySelector('.escenario');
      const elementos = Array.from(
        escenario.querySelectorAll('.elemento:not(.elemento--rotacion-espera)')
      ).sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0));

      const snap = _snapshot(elementos);

      // 1. Medir alturas reales en un solo lote
      const alturasReales = elementos.map((el) => {
        const interior = el.querySelector('.elemento-interior');
        return { el, h: interior ? interior.offsetHeight : el.offsetHeight };
      });

      // 2. Capacidad real con alturas medidas
      const rectEsc = escenario.getBoundingClientRect();
      const safeArea = RealityProbe._safeArea();
      const altUtil = rectEsc.height - (92 + safeArea.top) - (52 + safeArea.bottom);
      const { cap } = _calcularCapacidad(
        alturasReales.map((x, i) => ({
          h: x.h,
          w: x.el?.querySelector('.elemento-interior')?.offsetWidth || 0,
          tipo: elementos[i].dataset.tipo,
        })),
        altUtil, rectEsc.width
      );

      // 3. Reducir conjunto visible si N > cap
      let elementosRetirados = [];
      if (elementos.length > cap) {
        const res = await _rAF(() => {
          const conservar = _seleccionarConservados(elementos, cap);
          const retirar = elementos.filter((el) => !conservar.has(el));
          retirar.forEach(el => {
            el.classList.add('elemento--rotacion-espera', 'elemento--oculto-capacidad');
          });
          elementosRetirados = retirar.map(el => el.dataset.testimonioId || el.dataset.tipo);
        }, K.UMBRAL.TIMEOUT_CORRECCCION_MS);
        if (!res.ok) return { ...res, escalon: 'E4', snap };
      }

      // 4. Redistribuir la escena con el distribuidor real
      const sedeEl = sede;
      const res2 = await _rAF(() => {
        if (window.Distribuidor?.distribuir) {
          window.Distribuidor.distribuir(sedeEl);
        }
      }, K.UMBRAL.TIMEOUT_DISTRIBUIR_MS);

      return {
        ...res2, escalon: 'E4', snap,
        elementosRetirados,
        capacidadUsada: cap,
        altiturasRef: alturasReales.map(x => x.h).join(','),
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // R-02 · SELECCIÓN POR DISPERSIÓN DE ANCLAS
  //
  // EVIDENCIA (corpus data/*.json campo `y` + 12 observaciones de dispositivo):
  //   Los primeros elementos del orden narrativo tienen anclas editoriales
  //   sesgadas hacia arriba respecto de la media de su sede:
  //       Posadas   y medio 39, primeros 4: 22  →  -17 pp
  //       Oberá     y medio 45, primeros 4: 23  →  -22 pp
  //       Eldorado  y medio 51, primeros 4: 36  →  -16 pp
  //   El criterio anterior retiraba los ÚLTIMOS del orden narrativo, con lo que
  //   conservaba ese sesgo. Resultado medido: balV negativo en 11 de 12
  //   observaciones, media -14,3%, hasta -31,7%, con celdas muertas en la banda
  //   inferior del heatmap (capturas 3 y 4 del ciclo 3).
  //
  // CRITERIO NUEVO: selección voraz maximin sobre las anclas editoriales.
  // Determinista, sin aleatoriedad. Conserva siempre los permanentes.
  // NO altera el orden narrativo ni la cobertura del ciclo (invariante I4):
  // solo decide qué subconjunto es visible simultáneamente.
  // ══════════════════════════════════════════════════════════════════════════
  function _seleccionarConservados(elementos, cap) {
    const conservar = new Set();

    // 1 · Los permanentes nunca se retiran (invariante I1)
    elementos.forEach((el) => {
      if (el.dataset.permanente === 'true') conservar.add(el);
    });
    if (conservar.size >= cap) return conservar;

    // Interruptor de reversión al criterio anterior
    if (!M.SELECCION_POR_DISPERSION) {
      elementos
        .filter((el) => !conservar.has(el))
        .sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0))
        .slice(0, cap - conservar.size)
        .forEach((el) => conservar.add(el));
      return conservar;
    }

    const ancla = (el) => ({
      x: parseFloat(el.dataset.anclaX) || 50,
      y: parseFloat(el.dataset.anclaY) || 50,
    });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    const candidatos = elementos
      .filter((el) => !conservar.has(el))
      .map((el) => ({ el, a: ancla(el), orden: Number(el.dataset.orden || 0) }));

    // Orden total de desempate: garantiza determinismo
    candidatos.sort((p, q) =>
      p.orden - q.orden ||
      String(p.el.dataset.testimonioId || '').localeCompare(
        String(q.el.dataset.testimonioId || '')));

    const elegidas = [];
    conservar.forEach((el) => elegidas.push(ancla(el)));

    // 2 · Selección voraz: en cada paso, el candidato cuya ancla maximiza la
    //     distancia mínima a las anclas ya elegidas (criterio maximin), con el
    //     orden narrativo como término secundario ponderado.
    const N = candidatos.length;
    while (conservar.size < cap && candidatos.length) {
      let mejor = 0, mejorPuntaje = -Infinity;
      for (let i = 0; i < candidatos.length; i++) {
        const c = candidatos[i];
        // Distancia mínima a lo ya elegido, normalizada a la diagonal (141,4)
        let dMin = 1;
        if (elegidas.length) {
          dMin = Infinity;
          for (const e of elegidas) {
            const d = dist(c.a, e);
            if (d < dMin) dMin = d;
          }
          dMin = Math.min(1, dMin / 141.4);
        }
        // Preferencia por orden narrativo temprano
        const pOrden = N > 1 ? 1 - (i / (N - 1)) : 1;
        const puntaje = (1 - M.DISPERSION_PESO_ORDEN) * dMin
                      + M.DISPERSION_PESO_ORDEN * pOrden;
        if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = i; }
      }
      const elegido = candidatos.splice(mejor, 1)[0];
      conservar.add(elegido.el);
      elegidas.push(elegido.a);
    }
    return conservar;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ④ VERIFIER — mide el resultado real post-aplicación (Plan §8.2)
  // ══════════════════════════════════════════════════════════════════════════
  const Verifier = {
    verificar(reportPrevio, snap, escalon) {
      // Re-medir después de la corrección
      const sede = document.querySelector(`.sede[data-sede="${reportPrevio.sede}"]`);
      if (!sede) return { aceptado: false, causaRechazo: 'sede-no-encontrada' };

      const reportPost = RealityProbe.medir(sede);
      if (!reportPost) return { aceptado: false, causaRechazo: 'report-nulo' };

      // Invariantes inviolables (Plan §10.1)
      const permanentes = Array.from(sede.querySelectorAll('.elemento[data-permanente="true"]'));
      const permanentesVisibles = permanentes.filter(el =>
        !el.classList.contains('elemento--rotacion-espera') &&
        el.classList.contains('elemento--visible')
      );
      if (permanentesVisibles.length < permanentes.length) {
        return { aceptado: false, causaRechazo: 'RI-03-narrador-oculto',
          delta: reportPost };
      }

      // Solape real (pre-transform)
      if (reportPost.solajesReales.length > 0) {
        const maxLayout = Math.max(...reportPost.solajesReales.map(p => p.layout));
        if (maxLayout > K.UMBRAL.SOLAPE_TARJETAS_PX2) {
          return { aceptado: false, causaRechazo: 'RI-01-solape-persistente',
            solapeMax: Math.round(maxLayout), delta: reportPost };
        }
      }

      // Elementos fuera del viewport
      if (reportPost.fueraViewport.length > 0) {
        return { aceptado: false, causaRechazo: 'RI-02-fuera-viewport',
          N: reportPost.fueraViewport.length, delta: reportPost };
      }

      // Mínimo de elementos visibles
      if (reportPost.N < M.MIN_VISIBLE) {
        return { aceptado: false, causaRechazo: 'RI-MIN-visible',
          visible: reportPost.N, delta: reportPost };
      }

      // Aceptado
      return { aceptado: true, delta: reportPost,
        mejora: reportPost.solajesReales.length < reportPrevio.solajesReales.length
             || reportPost.fueraViewport.length < reportPrevio.fueraViewport.length };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ⑤ RETRY CONTROLLER — máx 2 reintentos (Plan §4.6, §6.4)
  // ══════════════════════════════════════════════════════════════════════════
  const RetryController = {
    gestionar(veredicto, historialCiclo, diagnosticoActual, presupuestoMs) {
      if (veredicto.aceptado) return { accion: 'confirmar' };

      if (historialCiclo.length >= M.MAX_REINTENTOS) {
        return { accion: 'escalar', razon: 'escalada-agotada' };
      }
      if (presupuestoMs < 80) {
        return { accion: 'escalar', razon: 'presupuesto-agotado' };
      }

      // Si la causa fue refutada (la corrección específica no resolvió):
      // rediagnosticar excluyendo esa causa
      const causaRefutada = historialCiclo.some(
        i => i.causa === diagnosticoActual.causa && !veredicto.aceptado
      );
      if (causaRefutada) {
        return { accion: 'rediagnosticar',
          excluir: [diagnosticoActual.causa],
          razon: `Causa ${diagnosticoActual.causa} refutada — rediagnosticar` };
      }

      // Escalar el escalón
      const escalones = ['E0', 'E1', 'E2', 'E4'];
      const iActual = escalones.indexOf(historialCiclo.at(-1)?.escalon || 'E0');
      const siguiente = escalones[Math.min(iActual + 1, escalones.length - 1)];

      if (veredicto.causaRechazo === 'RI-01-solape-persistente' && iActual <= 1) {
        // Solape persistente → saltar a E4 directamente
        return { accion: 'reintentar', escalon: 'E4' };
      }

      return { accion: 'reintentar', escalon: siguiente };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ⑥ RECONCILIATION UNIT MÍNIMA (Plan §11 — solo RAM, solo sesión)
  // ══════════════════════════════════════════════════════════════════════════
  const reconcil = {
    _muestrasViewport: [],
    _muestrasAlt: [],

    registrar(report) {
      this._muestrasViewport.push(report.altUtil);
      if (this._muestrasViewport.length > M.RECONCIL_VENTANA) this._muestrasViewport.shift();

      report.alturasReales.forEach(({ h }) => {
        this._muestrasAlt.push(h);
        if (this._muestrasAlt.length > M.RECONCIL_VENTANA * 5) this._muestrasAlt.shift();
      });
    },

    /** Mediana de las últimas mediciones de altUtil (robusta ante barras dinámicas). */
    altUtilConocido() {
      if (this._muestrasViewport.length < M.RECONCIL_MIN) return null;
      const s = [...this._muestrasViewport].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO PREVIO (para CM-03: detectar cambio de viewport)
  // ══════════════════════════════════════════════════════════════════════════
  const _estadoPrevio = { altUtil: null };

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS comunes
  // ══════════════════════════════════════════════════════════════════════════
  function _snapshot(elementos) {
    return elementos.map(el => ({
      el,
      x: el.style.getPropertyValue('--x'),
      y: el.style.getPropertyValue('--y'),
      escala: el.style.getPropertyValue('--escala'),
      clases: [...el.classList],
      tabIndex: el.tabIndex,
    }));
  }

  function _restaurarSnapshot(snap) {
    snap.forEach(({ el, x, y, escala, clases, tabIndex }) => {
      if (x) el.style.setProperty('--x', x); else el.style.removeProperty('--x');
      if (y) el.style.setProperty('--y', y); else el.style.removeProperty('--y');
      if (escala) el.style.setProperty('--escala', escala);
      el.className = clases.join(' ');
      el.tabIndex = tabIndex;
    });
  }

  function _rAF(fn, timeoutMs) {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs);
      requestAnimationFrame(() => {
        clearTimeout(t);
        try { fn(); resolve({ ok: true }); }
        catch (e) { resolve({ ok: false, error: e.message }); }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⑦ PIPELINE PRINCIPAL — Detectar→Diagnosticar→Corregir→Validar→Confirmar
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Punto de entrada principal. Llamado por el Monitor cuando detecta
   * una señal mobile. Retorna el resultado completo del ciclo.
   */
  async function adaptar(sedeSelectorOrEl) {
    const sede = typeof sedeSelectorOrEl === 'string'
      ? document.querySelector(sedeSelectorOrEl)
      : sedeSelectorOrEl;
    if (!sede || !window.esMobile?.()) return { accion: 'no-aplica' };

    const tInicio = Date.now();
    const PRESUPUESTO_MS = K.UMBRAL.TIMEOUT_DISTRIBUIR_MS; // 500ms

    // [1] Medir la realidad
    const report = RealityProbe.medir(sede);
    if (!report) return { accion: 'error', razon: 'report-nulo' };

    // Actualizar reconciliación y estado previo
    reconcil.registrar(report);
    const altUtilPrev = _estadoPrevio.altUtil;
    _estadoPrevio.altUtil = report.altUtil;

    // [2] Diagnóstico causal
    const historialCiclo = [];
    let diagnostico = CausalDiagnoser.diagnosticar(report, historialCiclo);

    // [3] Pipeline de corrección con reintento
    let resultado = null;
    let veredicto = null;

    for (let intento = 0; intento <= M.MAX_REINTENTOS; intento++) {
      const presupuestoRestante = PRESUPUESTO_MS - (Date.now() - tInicio);
      if (presupuestoRestante < 80) break;

      if (diagnostico.causa === 'E0-SANO' || diagnostico.escalonSugerido === 'E0') {
        resultado = await InterventionLadder.E0(report, diagnostico);
        break;
      }

      // [4] Intervención proporcionada
      const escalon = diagnostico.escalonSugerido;
      let r;
      if (escalon === 'E1') r = await InterventionLadder.E1(report, diagnostico);
      else if (escalon === 'E2') r = await InterventionLadder.E2(report, diagnostico);
      else r = await InterventionLadder.E4(report, diagnostico);

      historialCiclo.push({ escalon, causa: diagnostico.causa, ok: r.ok });

      if (!r.ok) {
        // Rollback y escalar
        if (r.snap) _restaurarSnapshot(r.snap);
        historialCiclo.at(-1).causaRechazo = r.error;
      } else {
        // [5] Verificar resultado real
        veredicto = Verifier.verificar(report, r.snap, escalon);
        if (!veredicto.aceptado && r.snap) _restaurarSnapshot(r.snap);
        historialCiclo.at(-1).veredicto = veredicto;
        historialCiclo.at(-1).causaRefutada = !veredicto.aceptado;

        if (veredicto.aceptado) { resultado = r; break; }
      }

      // [6] Retry Controller
      const retryDecision = RetryController.gestionar(
        veredicto || { aceptado: false, causaRechazo: r.error },
        historialCiclo, diagnostico, PRESUPUESTO_MS - (Date.now() - tInicio)
      );

      if (retryDecision.accion === 'confirmar') { resultado = r; break; }
      if (retryDecision.accion === 'escalar') break;
      if (retryDecision.accion === 'rediagnosticar') {
        diagnostico = CausalDiagnoser.diagnosticar(report,
          historialCiclo.map(h => ({ ...h, causaRefutada: true })));
      } else if (retryDecision.escalon) {
        diagnostico = { ...diagnostico, escalonSugerido: retryDecision.escalon };
      }
    }

    // [7] Registro
    const duracion = Date.now() - tInicio;
    const desenlace = veredicto?.aceptado ? 'confirmado'
      : historialCiclo.some(h => h.veredicto?.aceptado) ? 'confirmado'
      : 'escalado';

    Bus.publicar('lae.adaptacion.completada', {
      sede: report.sede,
      diagnostico: diagnostico.causa,
      escalon: historialCiclo.at(-1)?.escalon || 'E0',
      desenlace, duracion, historial: historialCiclo,
      N: report.N, capacidadReal: report.capacidadReal,
    });

    if (window.AC_Logger) {
      window.AC_Logger.registrarIntervencion({
        que: `LAE Mobile: ${diagnostico.causa} → ${historialCiclo.at(-1)?.escalon || 'E0'}`,
        cuando: tInicio,
        porQue: diagnostico.evidencia ? JSON.stringify(diagnostico.evidencia).slice(0, 100) : '',
        queCorrigio: `C-3${diagnostico.escalonSugerido === 'E4' ? '7' : diagnostico.escalonSugerido === 'E1' ? '8' : '9'}`,
        resultado: desenlace,
        duracion,
        exito: desenlace === 'confirmado',
        rollback: null,
        diagnosticHash: `lae_${report.sede}_${diagnostico.causa}`,
      });
    }

    return { diagnostico, historialCiclo, desenlace, duracion, report };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⑧ ADAPTACIÓN PROACTIVA AL CAMBIO DE SEDE  [B2-5]
  //
  // EVIDENCIA (9 sesiones de dispositivo real, 2026-07-27):
  //   El usuario recorrió solo Posadas (sedesRecorridas: ['posadas']).
  //   Posadas se adaptó correctamente: 8 visibles → 4 = capacidad → 0 solapes.
  //   Oberá y Eldorado quedaron en 7 visibles con capacidad 4 y 3 pares de
  //   solape cada una, porque el LAE solo adapta la sede ACTIVA.
  //   El visitante que navega a Oberá ve el solape hasta que el ciclo del
  //   Monitor lo detecta (hasta 2 s después).
  //
  // CORRECCIÓN: adaptar en el momento del cambio de sede, antes de que el
  // visitante llegue a ver la escena mal compuesta. Se dispara con debounce
  // para no competir con la animación de scroll del carrusel.
  // ══════════════════════════════════════════════════════════════════════════
  let _debounceSede = null;
  let _ultimaSedeAdaptada = null;

  function _engancharCambioSede() {
    if (!Bus) return;
    // El Monitor re-emite el 'onCambio' del carrusel como señal 'cambio.sede'
    Bus.suscribir('senal.observada', (ev) => {
      if (ev?.señalTipo !== 'cambio.sede') return;
      const sedeId = ev.sede;
      if (!sedeId || sedeId === _ultimaSedeAdaptada) return;
      clearTimeout(_debounceSede);
      // El carrusel usa scroll suave; esperar a que la escena esté asentada.
      _debounceSede = setTimeout(() => {
        if (!window.esMobile?.()) return;
        const sedeEl = document.querySelector(`.sede[data-sede="${sedeId}"]`);
        if (!sedeEl) return;
        _ultimaSedeAdaptada = sedeId;
        adaptar(sedeEl).catch(() => {});
      }, M.GRACIA_MEDICION_MS);
    });
  }

  // Enganchar cuando el bus esté listo
  if (Bus) {
    try { _engancharCambioSede(); } catch (e) { /* fail-open */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════
  return {
    adaptar,
    // Exponer para el Panel y la consola de debugging
    medir:     (sede) => RealityProbe.medir(sede),
    diagnosticar: (report) => CausalDiagnoser.diagnosticar(report),
    capacidad: (tipos, altUtil) => _calcularCapacidad(
      tipos.map(t => ({ h: K.MOBILE['ALTURA_' + t.toUpperCase().replace('-','_')] || 140, tipo: t })),
      altUtil
    ),
    perfil:    (altUtil) => _perfil(altUtil),
    RealityProbe, CausalDiagnoser, InterventionLadder,
  };
})();
