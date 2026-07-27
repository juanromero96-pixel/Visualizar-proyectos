/**
 * HERRAMIENTA DE CALIBRACIÓN — /calibrar
 * ═══════════════════════════════════════════════════════════════════════════
 * Instrumentación de dispositivo real. NO corrige el motor. NO aprende.
 * Mide el comportamiento real del layout en el dispositivo físico y exporta
 * un JSON estructurado como materia prima para la calibración posterior.
 *
 * Principio rector: MEDIR, NO IMAGINAR.
 *   - Toda medición proviene del DOM real del sitio en ejecución.
 *   - getBoundingClientRect se contrasta SIEMPRE con offsetHeight/offsetWidth
 *     y con oclusión real (elementFromPoint).
 *   - No modifica el Motor Editorial ni el corpus.
 *   - No depende de backend ni de APIs remotas.
 *   - No requiere consola: toda la operación es por interfaz táctil.
 *
 * Activación: se monta solo si la ruta es /calibrar, o hash #calibrar,
 * o query ?calibrar=1. En cualquier otro caso el módulo no hace nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── Detección de activación ────────────────────────────────────────────────
  function _activo() {
    const path = (location.pathname || '').replace(/\/+$/, '');
    return path.endsWith('/calibrar')
        || location.hash === '#calibrar'
        || /(?:^|[?&])calibrar=1(?:&|$)/.test(location.search);
  }
  if (!_activo()) return;

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO DE MEDICIÓN — lee el estado real del navegador y del DOM
  // ══════════════════════════════════════════════════════════════════════════
  const Medicion = {

    /** 1 · Contexto real del dispositivo y del navegador. */
    contexto() {
      const vv = window.visualViewport;
      const sedeActivaEl = _sedeVisible();
      return {
        build:            window.__BUILD__ || '(desconocido)',
        fecha:            new Date().toISOString().slice(0, 10),
        hora:             new Date().toTimeString().slice(0, 8),
        ruta:             location.pathname,
        url:              location.href,
        hash:             location.hash,
        userAgent:        navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio || 1,
        orientacion:      _orientacion(),
        sedeActiva:       sedeActivaEl?.dataset.sede || null,
        esMobile:         !!window.esMobile?.(),
        puntero:          window.matchMedia?.('(pointer: coarse)').matches ? 'coarse' : 'fine',
        hover:            window.matchMedia?.('(hover: hover)').matches ? 'hover' : 'none',
        prefiereReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
        prefiereColorScheme:   window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        lectorAbierto:    _lectorAbierto(),
      };
    },

    /** 1b · Viewport efectivo, visualViewport y safe-area reales. */
    viewport() {
      const vv = window.visualViewport;
      return {
        innerWidth:  window.innerWidth,
        innerHeight: window.innerHeight,
        documentClientWidth:  document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
        visualViewport: vv ? {
          width:     +vv.width.toFixed(1),
          height:    +vv.height.toFixed(1),
          offsetTop: +vv.offsetTop.toFixed(1),
          offsetLeft:+vv.offsetLeft.toFixed(1),
          scale:     +vv.scale.toFixed(3),
        } : null,
        safeArea: _safeArea(),
        // Estimación del estado de la barra dinámica: diferencia entre
        // innerHeight y visualViewport.height indica cuánto ocupa el chrome.
        barraDinamica: vv ? {
          diferenciaPx: Math.round(window.innerHeight - vv.height),
          estimacion: (window.innerHeight - vv.height) > 40 ? 'contraida' : 'expandida',
        } : null,
      };
    },

    /** 2 · Lectura geométrica completa de una sede. */
    sede(sedeEl) {
      if (!sedeEl) return null;
      const escenario = sedeEl.querySelector('.escenario');
      const rectEsc = escenario ? escenario.getBoundingClientRect() : null;

      // Zonas protegidas
      const chip   = sedeEl.querySelector('.marca-chip');
      const kicker = sedeEl.querySelector('.sede-kicker');
      const zonas  = [];
      if (chip)   zonas.push({ id: 'marca-chip',  rect: _rect(chip.getBoundingClientRect()) });
      if (kicker) zonas.push({ id: 'sede-kicker', rect: _rect(kicker.getBoundingClientRect()) });

      // Cabecera institucional y barra inferior (fuera de la sede, globales)
      const cabecera = document.querySelector('.cajero, header, .marca-institucional');
      const barraInf = document.querySelector('#ruta-m, .ruta-mobile, .nav-sedes');

      // Elementos de la sede
      const todosLosElementos = Array.from(sedeEl.querySelectorAll('.elemento'));
      const elementos = todosLosElementos.map((el) => this._elemento(el, sedeEl, rectEsc, zonas));

      // Capacidad esperada (del modelo LAE si está disponible) vs real
      const capEsperada = _capacidadEsperada(sedeEl);
      const capReal     = _capacidadRealMedida(todosLosElementos, rectEsc);

      return {
        id:     sedeEl.dataset.sede,
        nombre: sedeEl.querySelector('.sede-titulo, .sede-nombre, h2')?.textContent?.trim()
                || sedeEl.dataset.sede,
        rectEscenario: rectEsc ? _rect(rectEsc) : null,
        zonasProtegidas: zonas,
        cabecera: cabecera ? _rect(cabecera.getBoundingClientRect()) : null,
        barraInferior: barraInf ? _rect(barraInf.getBoundingClientRect()) : null,
        capacidadEsperada: capEsperada,
        capacidadReal: capReal.cap,
        alturaReferencia: capReal.altRef,
        margenTopEfectivo: capReal.margenTop,
        margenBotEfectivo: capReal.margenBot,
        altUtil: capReal.altUtil,
        totalElementos: todosLosElementos.length,
        elementosVisibles: elementos.filter((e) => e.visible && !e.enEspera).length,
        elementosEnEspera: elementos.filter((e) => e.enEspera).length,
        elementosPermanentes: elementos.filter((e) => e.permanente).length,
        elementos,
      };
    },

    /** 2b · Medición geométrica de un elemento con contraste de métricas. */
    _elemento(el, sedeEl, rectEsc, zonas) {
      const interior = el.querySelector('.elemento-interior');
      const rectExterior = el.getBoundingClientRect();
      const rectInterior = interior ? interior.getBoundingClientRect() : rectExterior;

      // Caja de layout (pre-transform) vs caja visual (post-transform)
      const offsetH = interior ? interior.offsetHeight : el.offsetHeight;
      const offsetW = interior ? interior.offsetWidth  : el.offsetWidth;
      const visualH = rectInterior.height;
      const visualW = rectInterior.width;
      // La diferencia entre caja de layout y caja visual = firma de la rotación (DV-01)
      const deltaMetrica = +(Math.max(visualH, visualW) - Math.max(offsetH, offsetW)).toFixed(2);

      // Oclusión real: ¿el centro del elemento está tapado por otro elemento?
      const cx = rectExterior.left + rectExterior.width / 2;
      const cy = rectExterior.top + rectExterior.height / 2;
      let oclusionReal = false;
      let ocluidoPor = null;
      try {
        const enPunto = document.elementFromPoint(cx, cy);
        if (enPunto && !el.contains(enPunto) && enPunto !== el) {
          const otroElemento = enPunto.closest('.elemento');
          if (otroElemento && otroElemento !== el) {
            oclusionReal = true;
            ocluidoPor = otroElemento.dataset.testimonioId || otroElemento.dataset.tipo || 'desconocido';
          }
        }
      } catch (e) { /* elementFromPoint puede fallar fuera de viewport */ }

      // ¿Invade una zona protegida?
      let zonaProtegida = false;
      let zonaInvadida = null;
      for (const z of zonas) {
        if (_intersecan(rectExterior, z.rect)) {
          zonaProtegida = true;
          zonaInvadida = z.id;
          break;
        }
      }

      return {
        id:   el.dataset.testimonioId || el.dataset.tipo || null,
        tipo: el.dataset.tipo || null,
        ua:   el.dataset.ua || null,
        ordenNarrativo: Number(el.dataset.orden) || null,
        permanente: el.dataset.permanente === 'true',
        visible: el.classList.contains('elemento--visible'),
        enEspera: el.classList.contains('elemento--rotacion-espera'),
        // Métricas contrastadas (REGLA: nunca solo getBoundingClientRect)
        offsetHeight: offsetH,
        offsetWidth:  offsetW,
        rect: _rect(rectExterior),
        rectInterior: _rect(rectInterior),
        cajaLayout:  { w: offsetW, h: offsetH },
        cajaVisual:  { w: +visualW.toFixed(1), h: +visualH.toFixed(1) },
        deltaMetrica,   // caja visual − caja layout: firma de rotación
        posicion: {
          x: el.style.getPropertyValue('--x') || null,
          y: el.style.getPropertyValue('--y') || null,
          escala: el.style.getPropertyValue('--escala') || null,
        },
        oclusionReal,
        ocluidoPor,
        zonaProtegida,
        zonaInvadida,
        solapeCon: [],  // se completa en el análisis de pares
      };
    },

    /** 2c · Análisis de solapes entre pares (pre-transform y AABB). */
    analizarSolapes(sede) {
      if (!sede || !sede.elementos) return sede;
      const activos = sede.elementos.filter((e) => e.visible && !e.enEspera);
      for (let i = 0; i < activos.length; i++) {
        for (let j = i + 1; j < activos.length; j++) {
          const a = activos[i], b = activos[j];
          // Solape de cajas visuales (AABB, lo que reporta getBoundingClientRect)
          const solapeAABB = _areaInterseccion(a.rect, b.rect);
          if (solapeAABB > 0) {
            a.solapeCon.push({ id: b.id, aabb: Math.round(solapeAABB) });
            b.solapeCon.push({ id: a.id, aabb: Math.round(solapeAABB) });
          }
        }
      }
      return sede;
    },

    /** 4 · Comparación con el modelo esperado. */
    diagnostico(sedes) {
      const solapes = [];
      const invasiones = [];
      const fueraDeViewport = [];
      const oclusiones = [];
      const observaciones = [];
      let capacidadExcedida = false;

      sedes.forEach((sede) => {
        if (!sede) return;
        // Capacidad excedida
        if (sede.elementosVisibles > sede.capacidadReal) {
          capacidadExcedida = true;
          observaciones.push(
            `Sede ${sede.id}: ${sede.elementosVisibles} elementos visibles > capacidad real ${sede.capacidadReal} ` +
            `(exceso: ${sede.elementosVisibles - sede.capacidadReal})`
          );
        }
        // Comparación capacidad esperada vs real
        if (sede.capacidadEsperada !== null && sede.capacidadEsperada !== sede.capacidadReal) {
          observaciones.push(
            `Sede ${sede.id}: capacidad esperada ${sede.capacidadEsperada} ≠ capacidad real medida ${sede.capacidadReal}`
          );
        }
        (sede.elementos || []).forEach((el) => {
          if (el.solapeCon && el.solapeCon.length) {
            el.solapeCon.forEach((s) => {
              if (el.id < s.id) solapes.push({ sede: sede.id, a: el.id, b: s.id, aabb: s.aabb });
            });
          }
          if (el.zonaProtegida) {
            invasiones.push({ sede: sede.id, elemento: el.id, zona: el.zonaInvadida });
          }
          if (el.oclusionReal) {
            oclusiones.push({ sede: sede.id, elemento: el.id, ocluidoPor: el.ocluidoPor });
          }
          // Fuera de viewport: el rect excede el escenario
          if (sede.rectEscenario && el.rect) {
            if (el.rect.right > sede.rectEscenario.right + 5 ||
                el.rect.left < sede.rectEscenario.left - 5 ||
                el.rect.bottom > sede.rectEscenario.bottom + 5 ||
                el.rect.top < sede.rectEscenario.top - 5) {
              fueraDeViewport.push({ sede: sede.id, elemento: el.id });
            }
          }
        });
      });

      if (!solapes.length && !invasiones.length && !oclusiones.length && !capacidadExcedida) {
        observaciones.push('Sin anomalías detectadas en las sedes muestreadas.');
      }

      return { solapes, invasiones, oclusiones, fueraDeViewport, capacidadExcedida, observaciones };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS de medición
  // ══════════════════════════════════════════════════════════════════════════
  function _rect(r) {
    return {
      left: +r.left.toFixed(1), top: +r.top.toFixed(1),
      right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1),
      width: +r.width.toFixed(1), height: +r.height.toFixed(1),
    };
  }
  function _intersecan(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }
  function _areaInterseccion(a, b) {
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ox * oy;
  }
  function _orientacion() {
    if (screen.orientation?.type) return screen.orientation.type;
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }
  function _safeArea() {
    try {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;' +
        'top:0;left:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
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
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
  }
  function _sedeVisible() {
    // La sede visible es la que intersecta el centro del viewport
    const sedes = Array.from(document.querySelectorAll('.sede'));
    const cy = window.innerHeight / 2;
    return sedes.find((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= cy && r.bottom >= cy;
    }) || sedes[0] || null;
  }
  function _lectorAbierto() {
    const lector = document.querySelector('.lector, .lector-sheet, [data-lector-abierto="true"]');
    return !!(lector && (lector.classList.contains('abierto') ||
      lector.getAttribute('aria-hidden') === 'false' ||
      getComputedStyle(lector).display !== 'none'));
  }
  function _capacidadEsperada(sedeEl) {
    // Del modelo LAE si está disponible; si no, null
    try {
      if (window.AC_LAE_Mobile) {
        const report = window.AC_LAE_Mobile.medir(sedeEl);
        return report ? report.capacidadReal : null;
      }
    } catch (e) {}
    return null;
  }
  function _capacidadRealMedida(elementos, rectEsc) {
    // [B2-3] La fórmula de 2 columnas es EXCLUSIVA del canal mobile.
    // Evidencia (9 sesiones): en desktop daba cap=3 con 8 elementos sin solape
    // en 7/9 casos. Aplicarla fuera de mobile produce un diagnóstico falso.
    if (!window.esMobile?.()) {
      return { cap: null, altRef: null, altUtil: null, margenTop: null,
               margenBot: null, noAplica: 'canal-desktop' };
    }
    // Fórmula §4.5: capacidad con alturas reales medidas
    if (!rectEsc || !elementos.length) {
      return { cap: null, altRef: null, altUtil: null, margenTop: null, margenBot: null };
    }
    const activos = elementos.filter((el) =>
      !el.classList.contains('elemento--rotacion-espera'));
    if (!activos.length) return { cap: null, altRef: null, altUtil: null, margenTop: null, margenBot: null };

    const sa = _safeArea();
    const margenTop = 92 + sa.top;
    const margenBot = 52 + sa.bottom;
    const altUtil = rectEsc.height - margenTop - margenBot;

    const alturas = activos.map((el) => {
      const interior = el.querySelector('.elemento-interior');
      return interior ? interior.offsetHeight : el.offsetHeight;
    }).sort((a, b) => a - b);

    const idx = Math.min(alturas.length - 1, Math.floor(0.75 * alturas.length));
    const altRef = alturas[idx] || 186;
    const filas = Math.floor(altUtil / (altRef + 8));
    const M = window.AC_K?.MOBILE;
    let cap = filas * 2;
    if (M) {
      const capPerf = altUtil < M.PERFIL_CRITICO_LIMITE ? M.CAP_CRITICO
                    : altUtil < M.PERFIL_AMPLIO_LIMITE  ? M.CAP_ESTANDAR
                    : M.CAP_AMPLIO;
      cap = Math.max(M.MIN_VISIBLE, Math.min(cap, capPerf));
    }
    return { cap, altRef, altUtil: Math.round(altUtil), margenTop, margenBot };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO DE LA SESIÓN DE CALIBRACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  const sesion = {
    muestras: [],   // cada muestra = { timestamp, contexto, viewport, sedes[], diagnostico }
    sedesRecorridas: new Set(),
  };

  /** Captura una muestra completa del estado actual. */
  function capturarMuestra() {
    const contexto = Medicion.contexto();
    const viewport = Medicion.viewport();

    // Medir todas las sedes presentes en el DOM (aunque solo una sea visible)
    const sedesEl = Array.from(document.querySelectorAll('.sede'));
    const sedes = sedesEl.map((sedeEl) => {
      let sede = Medicion.sede(sedeEl);
      sede = Medicion.analizarSolapes(sede);
      return sede;
    }).filter(Boolean);

    const diagnostico = Medicion.diagnostico(sedes);

    const muestra = {
      timestamp: new Date().toISOString(),
      sedeActivaEnMuestra: contexto.sedeActiva,
      contexto, viewport, sedes, diagnostico,
    };
    sesion.muestras.push(muestra);
    if (contexto.sedeActiva) sesion.sedesRecorridas.add(contexto.sedeActiva);
    return muestra;
  }

  /** Ensambla el JSON final de exportación. */
  function ensamblarJSON() {
    const ctx = Medicion.contexto();
    const vp  = Medicion.viewport();
    // Consolidar la última muestra de cada sede
    const sedesConsolidadas = {};
    sesion.muestras.forEach((m) => {
      m.sedes.forEach((s) => {
        if (s && s.id) sedesConsolidadas[s.id] = s;  // la última gana
      });
    });

    return {
      meta: {
        build: ctx.build,
        fecha: ctx.fecha,
        hora: ctx.hora,
        ruta: '/calibrar',
        userAgent: ctx.userAgent,
        devicePixelRatio: ctx.devicePixelRatio,
        orientacion: ctx.orientacion,
        sedeActiva: ctx.sedeActiva,
        esMobile: ctx.esMobile,
        puntero: ctx.puntero,
        prefiereReducedMotion: ctx.prefiereReducedMotion,
        prefiereColorScheme: ctx.prefiereColorScheme,
        lectorAbierto: ctx.lectorAbierto,
        totalMuestras: sesion.muestras.length,
        sedesRecorridas: [...sesion.sedesRecorridas],
      },
      viewport: vp,
      sedes: Object.values(sedesConsolidadas),
      diagnostico: Medicion.diagnostico(Object.values(sedesConsolidadas)),
      muestrasCrudas: sesion.muestras.map((m) => ({
        timestamp: m.timestamp,
        sedeActiva: m.sedeActivaEnMuestra,
        viewport: { innerHeight: m.viewport.innerHeight, vvHeight: m.viewport.visualViewport?.height },
        diagnostico: m.diagnostico,
      })),
    };
  }

  /** Descarga el JSON en el dispositivo. */
  function exportarJSON() {
    if (!sesion.muestras.length) {
      _toast('Capturá al menos una muestra antes de exportar', 'warn');
      return;
    }
    const data = ensamblarJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `calibracion_${data.meta.build}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    _toast(`JSON exportado (${sesion.muestras.length} muestras)`, 'ok');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERFAZ TÉCNICA (sobria, táctil, mobile-first)
  // ══════════════════════════════════════════════════════════════════════════
  let _panel, _resumen, _sedeIndex = 0;
  let _ultimoAnalisisTemporal = null;

  /** Renderiza el resumen de la última grabación temporal. */
  function renderTemporal(a) {
    const el = document.getElementById('cal-temporal');
    if (!el || !a) return;
    el.hidden = false;
    const h = a.hitos || {}, p = a.performance || {};
    const sedes = Object.entries(a.estabilidad?.porSede || {});
    el.innerHTML = `
      <div><span class="cal-mut">── LÍNEA TEMPORAL ──</span><span>${a.config.framesCapturados} frames · ${a.config.eventosRegistrados} eventos</span></div>
      <div><span class="cal-mut">Primer layout</span><span>${h.primerLayout ?? '—'} ms</span></div>
      <div><span class="cal-mut">Layout estable</span><span class="${h.layoutEstableMs!=null?'cal-ok':'cal-warn'}">${h.layoutEstableMs ?? 'no alcanzado'} ms</span></div>
      <div><span class="cal-mut">fonts.ready</span><span>${h.fontsReadyMs ?? p.fontsReady ?? '—'} ms</span></div>
      <div><span class="cal-mut">FCP / LCP</span><span>${p.firstContentfulPaint ?? '—'} / ${p.largestContentfulPaint ?? '—'} ms</span></div>
      <div><span class="cal-mut">Último solape</span><span class="${h.ultimoSolapeMs==null?'cal-ok':'cal-err'}">${h.ultimoSolapeMs ?? 'ninguno'} ${h.ultimoSolapeMs!=null?'ms':''}</span></div>
      <div><span class="cal-mut">Última oclusión</span><span class="${h.ultimaOclusionMs==null?'cal-ok':'cal-err'}">${h.ultimaOclusionMs ?? 'ninguna'} ${h.ultimaOclusionMs!=null?'ms':''}</span></div>
      ${sedes.map(([id,s]) => `
      <div><span class="cal-mut">${id}</span><span>escH σ=${s.alturaEscenario?.desvio ?? '—'} · vis=${s.elementosVisibles?.valorFinal ?? '—'} · solape ${s.solape?.resueltoAlFinal?'✓':'✗'}</span></div>`).join('')}
    `;
  }

  function montarUI() {
    const estilo = document.createElement('style');
    estilo.textContent = `
      #calibrar-panel{position:fixed;inset:auto 0 0 0;z-index:2147483647;
        background:#0d1117;color:#e6edf3;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;
        border-top:2px solid #2f81f7;max-height:62vh;overflow-y:auto;
        padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));
        box-shadow:0 -8px 24px rgba(0,0,0,.5)}
      #calibrar-panel h1{font-size:14px;margin:0 0 8px;color:#2f81f7;
        display:flex;justify-content:space-between;align-items:center}
      #calibrar-panel .cal-badge{font-size:11px;background:#1f6feb;color:#fff;
        padding:2px 8px;border-radius:10px;font-weight:600}
      #calibrar-panel .cal-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
      #calibrar-panel button{flex:1;min-width:90px;background:#21262d;color:#e6edf3;
        border:1px solid #30363d;border-radius:8px;padding:12px 8px;font:600 13px ui-monospace,monospace;
        cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
      #calibrar-panel button:active{background:#30363d;transform:scale(.97)}
      #calibrar-panel button.cal-primary{background:#238636;border-color:#2ea043}
      #calibrar-panel button.cal-export{background:#1f6feb;border-color:#2f81f7}
      #calibrar-panel button.cal-export2{background:#8957e5;border-color:#a371f7}
      #calibrar-panel button.cal-export3{background:#6e7681;border-color:#8b949e}
      #calibrar-panel button.cal-rec{background:#a40e26;border-color:#da3633}
      #calibrar-panel button:disabled{opacity:.55}
      #calibrar-panel .cal-row--export button{min-width:0;font-size:12px;padding:11px 4px}
      #calibrar-panel .cal-metricas{background:#161b22;border:1px solid #21262d;
        border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px}
      #calibrar-panel .cal-metricas div{display:flex;justify-content:space-between;
        padding:2px 0;border-bottom:1px solid #21262d}
      #calibrar-panel .cal-metricas div:last-child{border-bottom:none}
      #calibrar-panel .cal-ok{color:#3fb950}
      #calibrar-panel .cal-warn{color:#d29922}
      #calibrar-panel .cal-err{color:#f85149}
      #calibrar-panel .cal-mut{color:#8b949e}
      #calibrar-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);
        z-index:2147483647;background:#161b22;color:#e6edf3;border:1px solid #30363d;
        border-radius:8px;padding:10px 16px;font:13px ui-monospace,monospace;
        opacity:0;transition:opacity .3s;pointer-events:none;max-width:90vw}
      #calibrar-toast.show{opacity:1}
      #calibrar-toast.ok{border-color:#2ea043}
      #calibrar-toast.warn{border-color:#d29922}
    `;
    document.head.appendChild(estilo);

    _panel = document.createElement('div');
    _panel.id = 'calibrar-panel';
    _panel.innerHTML = `
      <h1>⬡ LABORATORIO <span class="cal-badge" id="cal-build"></span></h1>
      <div class="cal-row">
        <button id="cal-sede">↔ Sede: —</button>
        <button id="cal-capturar" class="cal-primary">◉ Capturar</button>
      </div>
      <div class="cal-row">
        <button id="cal-grabar" class="cal-rec">⏺ Grabar 5s</button>
        <button id="cal-grabar-largo">⏺ Grabar 15s</button>
      </div>
      <div class="cal-row cal-row--export">
        <button id="cal-exportar" class="cal-export">⭳ Completa</button>
        <button id="cal-exportar-resumen" class="cal-export2">⭳ Resumen</button>
        <button id="cal-exportar-dataset" class="cal-export3">⭳ Dataset</button>
      </div>
      <div class="cal-row">
        <button id="cal-limpiar">✕ Reiniciar sesión</button>
      </div>
      <div class="cal-metricas" id="cal-resumen"></div>
      <div class="cal-metricas" id="cal-temporal" hidden></div>
    `;
    document.body.appendChild(_panel);

    const toast = document.createElement('div');
    toast.id = 'calibrar-toast';
    document.body.appendChild(toast);

    _resumen = document.getElementById('cal-resumen');
    document.getElementById('cal-build').textContent = window.__BUILD__ || '?';

    document.getElementById('cal-sede').addEventListener('click', avanzarSede);
    document.getElementById('cal-capturar').addEventListener('click', () => {
      const m = capturarMuestra();
      _toast(`Muestra ${sesion.muestras.length} capturada — sede ${m.contexto.sedeActiva}`, 'ok');
      renderResumen();
    });
    document.getElementById('cal-exportar').addEventListener('click', exportarJSON);

    // ── Grabación temporal (BLOQUE 1) ──────────────────────────────────
    const T = () => window.__CALIBRAR_TEMPORAL__;
    function grabar(ms) {
      if (!T()) { _toast('Módulo temporal no disponible', 'warn'); return; }
      if (T().estaGrabando()) { _toast('Ya hay una grabación en curso', 'warn'); return; }
      T().iniciarGrabacion(ms);
      _toast(`Grabando ${ms/1000}s — recorré las sedes ahora`, 'ok');
      const btn1 = document.getElementById('cal-grabar');
      const btn2 = document.getElementById('cal-grabar-largo');
      [btn1,btn2].forEach(b => b && (b.disabled = true));
      const t0 = Date.now();
      const iv = setInterval(() => {
        const rest = Math.max(0, ms - (Date.now()-t0));
        if (btn1) btn1.textContent = `⏺ ${(rest/1000).toFixed(1)}s`;
        if (rest <= 0) {
          clearInterval(iv);
          const analisis = T().detenerGrabacion();
          _ultimoAnalisisTemporal = analisis;
          [btn1,btn2].forEach(b => b && (b.disabled = false));
          if (btn1) btn1.textContent = '⏺ Grabar 5s';
          _toast(`Grabación completa: ${analisis?.config?.framesCapturados||0} frames`, 'ok');
          renderTemporal(analisis);
        }
      }, 100);
    }
    document.getElementById('cal-grabar').addEventListener('click', () => grabar(5000));
    document.getElementById('cal-grabar-largo').addEventListener('click', () => grabar(15000));

    // ── Exportaciones adicionales ──────────────────────────────────────
    document.getElementById('cal-exportar-resumen').addEventListener('click', () => {
      if (!T()) { _toast('Módulo temporal no disponible', 'warn'); return; }
      T().Exportar.descargar(T().Exportar.resumen(_ultimoAnalisisTemporal), 'resumen');
      _toast('Resumen ejecutivo exportado', 'ok');
    });
    document.getElementById('cal-exportar-dataset').addEventListener('click', () => {
      if (!T()) { _toast('Módulo temporal no disponible', 'warn'); return; }
      const st = T().Dataset.estadisticas();
      if (!st.sesionesTotales) { _toast('Dataset vacío — grabá al menos una sesión', 'warn'); return; }
      T().Exportar.descargar(T().Exportar.dataset(), 'dataset');
      _toast(`Dataset exportado: ${st.sesionesTotales} sesiones, ${st.dispositivos} dispositivos`, 'ok');
    });
    document.getElementById('cal-limpiar').addEventListener('click', () => {
      sesion.muestras = [];
      sesion.sedesRecorridas.clear();
      _toast('Sesión reiniciada', 'ok');
      renderResumen();
    });

    // Actualizar la etiqueta de sede periódicamente
    setInterval(actualizarEtiquetaSede, 800);
    renderResumen();
  }

  function avanzarSede() {
    const sedes = Array.from(document.querySelectorAll('.sede'));
    if (!sedes.length) return;
    _sedeIndex = (_sedeIndex + 1) % sedes.length;
    if (window.__carrusel?.ir) {
      window.__carrusel.ir(_sedeIndex);
    } else {
      sedes[_sedeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setTimeout(actualizarEtiquetaSede, 400);
  }

  function actualizarEtiquetaSede() {
    const sedeEl = _sedeVisible();
    const btn = document.getElementById('cal-sede');
    if (btn && sedeEl) btn.textContent = `↔ Sede: ${sedeEl.dataset.sede || '—'}`;
  }

  function renderResumen() {
    if (!_resumen) return;
    const sedeEl = _sedeVisible();
    const ctx = Medicion.contexto();
    const vp = Medicion.viewport();
    let sedeActual = null;
    if (sedeEl) {
      sedeActual = Medicion.analizarSolapes(Medicion.sede(sedeEl));
    }

    const diag = sedeActual ? Medicion.diagnostico([sedeActual]) : null;
    const nSolapes = diag ? diag.solapes.length : 0;
    const nInvasiones = diag ? diag.invasiones.length : 0;
    const nOclusiones = diag ? diag.oclusiones.length : 0;
    const capExc = diag ? diag.capacidadExcedida : false;

    const estadoClase = (nSolapes || nInvasiones || nOclusiones || capExc) ? 'cal-err' : 'cal-ok';
    const estadoTexto = (nSolapes || nInvasiones || nOclusiones || capExc) ? '⚠ ANOMALÍAS' : '✓ OK';

    _resumen.innerHTML = `
      <div><span class="cal-mut">Dispositivo</span><span>${ctx.esMobile ? 'mobile' : 'desktop'} · DPR ${ctx.devicePixelRatio} · ${ctx.orientacion.split('-')[0]}</span></div>
      <div><span class="cal-mut">Viewport</span><span>${vp.innerWidth}×${vp.innerHeight}${vp.visualViewport ? ' · vv ' + Math.round(vp.visualViewport.height) : ''}</span></div>
      <div><span class="cal-mut">Safe-area ↓</span><span>${vp.safeArea.bottom}px${vp.barraDinamica ? ' · barra ' + vp.barraDinamica.estimacion : ''}</span></div>
      ${sedeActual ? `
      <div><span class="cal-mut">Sede</span><span>${sedeActual.id} · altUtil ${sedeActual.altUtil}px</span></div>
      <div><span class="cal-mut">Capacidad</span><span>real ${sedeActual.capacidadReal ?? '—'} · visibles ${sedeActual.elementosVisibles}</span></div>
      <div><span class="cal-mut">altRef (P75)</span><span>${sedeActual.alturaReferencia ?? '—'}px</span></div>
      ` : ''}
      <div><span class="cal-mut">Solapes/Invas/Oclus</span><span class="${estadoClase}">${nSolapes}/${nInvasiones}/${nOclusiones}</span></div>
      <div><span class="cal-mut">Estado</span><span class="${estadoClase}">${estadoTexto}</span></div>
      <div><span class="cal-mut">Muestras · Sedes</span><span>${sesion.muestras.length} · ${sesion.sedesRecorridas.size}/3</span></div>
    `;
  }

  function _toast(msg, tipo) {
    const t = document.getElementById('calibrar-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show ' + (tipo || '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = ''; }, 2600);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARRANQUE — esperar a que el motor haya compuesto la escena
  // ══════════════════════════════════════════════════════════════════════════
  function arrancar() {
    // Esperar a que exista al menos una sede con elementos
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      const haySedes = document.querySelector('.sede .elemento');
      if (haySedes || intentos > 40) {
        clearInterval(t);
        montarUI();
        // Auto-refresh del resumen cada 1.5s mientras el panel está abierto
        setInterval(renderResumen, 1500);
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  // Exponer API mínima para verificación (no para operación normal)
  window.__CALIBRAR__ = { capturarMuestra, ensamblarJSON, exportarJSON, sesion, Medicion };
})();
