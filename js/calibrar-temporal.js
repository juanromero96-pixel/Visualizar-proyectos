/**
 * LABORATORIO DE ADQUISICIÓN DE EVIDENCIA — Módulo Temporal
 * ═══════════════════════════════════════════════════════════════════════════
 * BLOQUE 1 del encargo: evolución de /calibrar desde captura instantánea
 * hacia observación temporal continua.
 *
 * PARADIGMA: la unidad básica deja de ser una captura y pasa a ser una
 * LÍNEA TEMPORAL. No interesa solo el estado final, sino cómo el layout
 * llegó a ese estado.
 *
 * Este módulo es COMPLETAMENTE PASIVO. No modifica layout, posiciones,
 * clases editoriales, corpus ni Motor Editorial. Únicamente observa.
 *
 * Depende de window.__CALIBRAR__ (calibrar.js) para la medición puntual;
 * agrega la dimensión temporal, la estabilidad, el performance y el dataset.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // Solo se monta si calibrar.js está activo
  if (!window.__CALIBRAR__) return;

  const CAL = window.__CALIBRAR__;

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE LA OBSERVACIÓN TEMPORAL
  // ══════════════════════════════════════════════════════════════════════════
  const CFG = Object.freeze({
    INTERVALO_MS:        50,     // resolución temporal de la línea
    DURACION_DEFECTO_MS: 5000,   // ventana de observación por defecto
    DURACION_MAX_MS:     30000,  // techo de seguridad
    // Estabilidad: N muestras consecutivas dentro de TOLERANCIA para declarar estable
    ESTABILIDAD_MUESTRAS: 5,
    ESTABILIDAD_TOL_PX:   2,     // ±2px se considera el mismo valor (ruido de subpíxel)
    MAX_EVENTOS:          2000,  // techo del buffer de eventos
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ① CAPTADOR DE PERFORMANCE — hitos del navegador
  // ══════════════════════════════════════════════════════════════════════════
  const Performance = {
    /** Recolecta los hitos temporales que el navegador expone. */
    hitos() {
      const h = {};
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
          h.domContentLoaded = +nav.domContentLoadedEventEnd.toFixed(1);
          h.load             = +nav.loadEventEnd.toFixed(1);
          h.domInteractive   = +nav.domInteractive.toFixed(1);
          h.responseEnd      = +nav.responseEnd.toFixed(1);
          h.transferSize     = nav.transferSize || null;
        }
      } catch (e) {}
      try {
        performance.getEntriesByType('paint').forEach((p) => {
          if (p.name === 'first-paint')            h.firstPaint = +p.startTime.toFixed(1);
          if (p.name === 'first-contentful-paint') h.firstContentfulPaint = +p.startTime.toFixed(1);
        });
      } catch (e) {}
      // Largest Contentful Paint (si el observer lo capturó)
      if (_lcp !== null) h.largestContentfulPaint = +_lcp.toFixed(1);
      if (_fontsReadyAt !== null) h.fontsReady = +_fontsReadyAt.toFixed(1);
      return h;
    },

    /** Recursos cargados: imágenes y fuentes con sus tiempos. */
    recursos() {
      const out = { imagenes: [], fuentes: [], totalImagenes: 0, totalFuentes: 0 };
      try {
        performance.getEntriesByType('resource').forEach((r) => {
          const item = { nombre: r.name.split('/').pop().slice(0, 48),
                         inicio: +r.startTime.toFixed(1),
                         fin: +r.responseEnd.toFixed(1),
                         duracion: +r.duration.toFixed(1) };
          if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(r.name)) {
            out.imagenes.push(item); out.totalImagenes++;
          } else if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(r.name) || r.initiatorType === 'css') {
            if (/\.(woff2?|ttf|otf)/i.test(r.name)) { out.fuentes.push(item); out.totalFuentes++; }
          }
        });
      } catch (e) {}
      // Limitar el volumen exportado
      out.imagenes = out.imagenes.sort((a,b) => b.fin - a.fin).slice(0, 40);
      out.ultimaImagenMs = out.imagenes.length ? Math.max(...out.imagenes.map(i => i.fin)) : null;
      out.ultimaFuenteMs = out.fuentes.length ? Math.max(...out.fuentes.map(f => f.fin)) : null;
      return out;
    },
  };

  // Observadores de hitos que deben engancharse temprano
  let _lcp = null, _fontsReadyAt = null;
  try {
    new PerformanceObserver((lista) => {
      const e = lista.getEntries();
      if (e.length) _lcp = e[e.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => { _fontsReadyAt = performance.now(); }).catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ② PERFIL DEL DISPOSITIVO — capacidades del hardware y del navegador
  // ══════════════════════════════════════════════════════════════════════════
  const Dispositivo = {
    perfil() {
      const ua = navigator.userAgent;
      return {
        // Resolución
        resolucionFisica: { w: screen.width * (window.devicePixelRatio||1),
                            h: screen.height * (window.devicePixelRatio||1) },
        resolucionCSS:    { w: screen.width, h: screen.height },
        viewportCSS:      { w: window.innerWidth, h: window.innerHeight },
        DPR: window.devicePixelRatio || 1,
        colorDepth: screen.colorDepth || null,
        // Hardware (APIs disponibles según navegador)
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemoryGB:      navigator.deviceMemory || null,
        maxTouchPoints:      navigator.maxTouchPoints || 0,
        // Interacción
        puntero:  window.matchMedia?.('(pointer: coarse)').matches ? 'coarse' : 'fine',
        hover:    window.matchMedia?.('(hover: hover)').matches ? 'hover' : 'none',
        // Preferencias
        prefiereReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
        prefiereColorScheme:   window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        prefiereContraste:     window.matchMedia?.('(prefers-contrast: more)').matches || false,
        // Orientación
        orientacion: screen.orientation?.type || (innerWidth > innerHeight ? 'landscape' : 'portrait'),
        orientacionAngulo: screen.orientation?.angle ?? null,
        // Navegador y SO (derivados del UA, declarados como inferencia)
        navegador: this._navegador(ua),
        so:        this._so(ua),
        userAgent: ua,
        // Frecuencia de refresco (inferida por muestreo de rAF)
        refreshHzEstimado: _refreshHz,
        // Red (cuando la API existe)
        conexion: navigator.connection ? {
          tipoEfectivo: navigator.connection.effectiveType || null,
          downlinkMbps: navigator.connection.downlink || null,
          rttMs:        navigator.connection.rtt || null,
          ahorroDatos:  navigator.connection.saveData || false,
        } : null,
        idioma: navigator.language,
      };
    },
    _navegador(ua) {
      if (/SamsungBrowser\/([\d.]+)/.test(ua)) return { nombre: 'Samsung Internet', version: RegExp.$1 };
      if (/EdgA?\/([\d.]+)/.test(ua))          return { nombre: 'Edge', version: RegExp.$1 };
      if (/OPR\/([\d.]+)/.test(ua))            return { nombre: 'Opera', version: RegExp.$1 };
      if (/Firefox\/([\d.]+)/.test(ua))        return { nombre: 'Firefox', version: RegExp.$1 };
      if (/CriOS\/([\d.]+)/.test(ua))          return { nombre: 'Chrome iOS', version: RegExp.$1 };
      if (/Chrome\/([\d.]+)/.test(ua))         return { nombre: 'Chrome', version: RegExp.$1 };
      if (/Version\/([\d.]+).*Safari/.test(ua))return { nombre: 'Safari', version: RegExp.$1 };
      return { nombre: 'desconocido', version: null };
    },
    _so(ua) {
      if (/iPhone OS ([\d_]+)/.test(ua))  return { nombre: 'iOS', version: RegExp.$1.replace(/_/g,'.') };
      if (/iPad.*OS ([\d_]+)/.test(ua))   return { nombre: 'iPadOS', version: RegExp.$1.replace(/_/g,'.') };
      if (/Android ([\d.]+)/.test(ua))    return { nombre: 'Android', version: RegExp.$1 };
      if (/Windows NT ([\d.]+)/.test(ua))return { nombre: 'Windows', version: RegExp.$1 };
      if (/Mac OS X ([\d_]+)/.test(ua))   return { nombre: 'macOS', version: RegExp.$1.replace(/_/g,'.') };
      if (/Linux/.test(ua))               return { nombre: 'Linux', version: null };
      return { nombre: 'desconocido', version: null };
    },
  };

  // Estimación de frecuencia de refresco por muestreo de rAF
  let _refreshHz = null;
  (function medirRefresh() {
    const marcas = [];
    let n = 0;
    function paso(t) {
      marcas.push(t);
      if (++n < 20) requestAnimationFrame(paso);
      else {
        const deltas = [];
        for (let i = 1; i < marcas.length; i++) deltas.push(marcas[i] - marcas[i-1]);
        deltas.sort((a,b) => a-b);
        const mediana = deltas[Math.floor(deltas.length/2)];
        _refreshHz = mediana > 0 ? Math.round(1000 / mediana) : null;
      }
    }
    requestAnimationFrame(paso);
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // ③ ANÁLISIS DE ESTABILIDAD — sobre series temporales
  // ══════════════════════════════════════════════════════════════════════════
  const Estabilidad = {
    /**
     * Analiza una serie de valores numéricos y determina cuándo se estabilizó.
     * Ejemplo del encargo: [181,182,182,181,182] → estable con variación 1px.
     */
    analizar(serie, tolerancia) {
      const tol = tolerancia ?? CFG.ESTABILIDAD_TOL_PX;
      const vals = serie.filter((v) => typeof v === 'number' && isFinite(v));
      if (vals.length < 2) {
        return { n: vals.length, estable: null, valorFinal: vals[0] ?? null };
      }
      const media = vals.reduce((a,b) => a+b, 0) / vals.length;
      const varianza = vals.reduce((a,b) => a + (b-media)**2, 0) / vals.length;
      const desvio = Math.sqrt(varianza);
      const min = Math.min(...vals), max = Math.max(...vals);

      // Índice de la primera muestra a partir de la cual TODAS las siguientes
      // están dentro de ±tol del valor final
      const valorFinal = vals[vals.length - 1];
      let idxEstable = -1;
      for (let i = 0; i < vals.length; i++) {
        let todasDentro = true;
        for (let j = i; j < vals.length; j++) {
          if (Math.abs(vals[j] - valorFinal) > tol) { todasDentro = false; break; }
        }
        if (todasDentro && (vals.length - i) >= Math.min(CFG.ESTABILIDAD_MUESTRAS, vals.length)) {
          idxEstable = i; break;
        }
      }
      // Cantidad de cambios significativos (> tol)
      let cambios = 0;
      for (let i = 1; i < vals.length; i++) {
        if (Math.abs(vals[i] - vals[i-1]) > tol) cambios++;
      }
      return {
        n: vals.length,
        media: +media.toFixed(2),
        desvio: +desvio.toFixed(3),
        min, max,
        variacionMax: +(max - min).toFixed(2),
        valorFinal,
        cambiosSignificativos: cambios,
        indiceEstable: idxEstable,
        framesHastaEstable: idxEstable >= 0 ? idxEstable : null,
        estable: idxEstable >= 0,
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ④ GRABADOR DE LÍNEA TEMPORAL
  // ══════════════════════════════════════════════════════════════════════════
  const Grabador = {
    activo: false,
    t0: 0,
    frames: [],      // muestras a intervalo regular
    eventos: [],     // eventos discretos con timestamp
    _timer: null,
    _mo: null,       // MutationObserver
    _ro: null,       // ResizeObserver
    _handlers: [],

    /** Registra un evento discreto en la línea temporal. */
    evento(tipo, datos) {
      if (!this.activo || this.eventos.length >= CFG.MAX_EVENTOS) return;
      this.eventos.push({ t: +(performance.now() - this.t0).toFixed(1), tipo, ...datos });
    },

    /** Captura un frame: estado geométrico completo en este instante. */
    _capturarFrame() {
      if (!this.activo) return;
      const t = +(performance.now() - this.t0).toFixed(1);
      const sedes = Array.from(document.querySelectorAll('.sede'));
      const vv = window.visualViewport;

      const frame = {
        t,
        viewport: {
          iw: window.innerWidth, ih: window.innerHeight,
          vvw: vv ? +vv.width.toFixed(1) : null,
          vvh: vv ? +vv.height.toFixed(1) : null,
          vvTop: vv ? +vv.offsetTop.toFixed(1) : null,
          scale: vv ? +vv.scale.toFixed(3) : null,
        },
        orientacion: screen.orientation?.type || null,
        DPR: window.devicePixelRatio,
        sedes: sedes.map((s) => {
          const esc = s.querySelector('.escenario');
          const r = esc ? esc.getBoundingClientRect() : null;
          const activos = Array.from(
            s.querySelectorAll('.elemento:not(.elemento--rotacion-espera)')
          );
          // Solapes AABB en este frame
          let paresSolape = 0, areaSolape = 0;
          const rects = activos.map((e) => e.getBoundingClientRect());
          for (let i = 0; i < rects.length; i++) {
            for (let j = i+1; j < rects.length; j++) {
              const a = rects[i], b = rects[j];
              const ox = Math.max(0, Math.min(a.right,b.right) - Math.max(a.left,b.left));
              const oy = Math.max(0, Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top));
              if (ox*oy > 0) { paresSolape++; areaSolape += ox*oy; }
            }
          }
          // Oclusión real por elementFromPoint (muestreo: solo si hay pocos elementos)
          let oclusiones = 0;
          if (activos.length <= 12) {
            activos.forEach((e, i) => {
              const rr = rects[i];
              if (rr.width < 2) return;
              try {
                const en = document.elementFromPoint(rr.left + rr.width/2, rr.top + rr.height/2);
                if (en && !e.contains(en) && en.closest?.('.elemento') && en.closest('.elemento') !== e) oclusiones++;
              } catch (err) {}
            });
          }
          return {
            id: s.dataset.sede,
            escH: r ? +r.height.toFixed(1) : null,
            escW: r ? +r.width.toFixed(1) : null,
            visibles: activos.length,
            enEspera: s.querySelectorAll('.elemento--rotacion-espera').length,
            permanentes: s.querySelectorAll('.elemento[data-permanente="true"]').length,
            paresSolape, areaSolape: Math.round(areaSolape),
            oclusiones,
            // Alturas de los elementos activos (para el análisis de estabilidad)
            alturas: activos.map((e) => {
              const int = e.querySelector('.elemento-interior');
              return int ? int.offsetHeight : e.offsetHeight;
            }),
          };
        }),
      };
      this.frames.push(frame);
    },

    /** Arranca la observación temporal. */
    iniciar(duracionMs) {
      if (this.activo) return false;
      const dur = Math.min(duracionMs || CFG.DURACION_DEFECTO_MS, CFG.DURACION_MAX_MS);
      this.activo = true;
      this.t0 = performance.now();
      this.frames = [];
      this.eventos = [];

      this.evento('grabacion.inicio', { duracionProgramadaMs: dur });

      // Muestreo regular
      this._timer = setInterval(() => this._capturarFrame(), CFG.INTERVALO_MS);
      this._capturarFrame(); // frame t=0

      // ── Observadores de eventos discretos ──────────────────────────────
      // Mutaciones del DOM en los escenarios (cambios de layout)
      try {
        this._mo = new MutationObserver((muts) => {
          const resumen = { attrs: 0, hijos: 0, estilos: 0, clases: 0 };
          muts.forEach((m) => {
            if (m.type === 'childList') resumen.hijos += m.addedNodes.length + m.removedNodes.length;
            else if (m.type === 'attributes') {
              resumen.attrs++;
              if (m.attributeName === 'style') resumen.estilos++;
              if (m.attributeName === 'class') resumen.clases++;
            }
          });
          this.evento('dom.mutacion', resumen);
        });
        document.querySelectorAll('.escenario').forEach((esc) => {
          this._mo.observe(esc, { attributes: true, childList: true, subtree: true,
                                  attributeFilter: ['style','class'] });
        });
      } catch (e) {}

      // Cambios de tamaño del escenario
      try {
        this._ro = new ResizeObserver((entradas) => {
          entradas.forEach((en) => {
            this.evento('escenario.resize', {
              sede: en.target.closest('.sede')?.dataset.sede,
              w: +en.contentRect.width.toFixed(1), h: +en.contentRect.height.toFixed(1),
            });
          });
        });
        document.querySelectorAll('.escenario').forEach((esc) => this._ro.observe(esc));
      } catch (e) {}

      // Eventos del navegador
      const reg = (target, tipo, fn) => {
        target.addEventListener(tipo, fn);
        this._handlers.push([target, tipo, fn]);
      };
      reg(window, 'resize', () => this.evento('window.resize',
        { iw: innerWidth, ih: innerHeight }));
      reg(window, 'orientationchange', () => this.evento('orientationchange',
        { tipo: screen.orientation?.type }));
      reg(window, 'scroll', () => this.evento('scroll', { y: Math.round(scrollY) }));
      if (window.visualViewport) {
        reg(window.visualViewport, 'resize', () => this.evento('visualViewport.resize',
          { h: +visualViewport.height.toFixed(1) }));
        reg(window.visualViewport, 'scroll', () => this.evento('visualViewport.scroll',
          { top: +visualViewport.offsetTop.toFixed(1) }));
      }

      // Eventos del propio sistema (bus de autocorrección, si está)
      if (window.AC_Bus?.suscribir) {
        try {
          window.AC_Bus.suscribir('senal.observada', (ev) =>
            this.evento('sistema.senal', { señalTipo: ev.señalTipo }));
          window.AC_Bus.suscribir('anomalia.clasificada', (ev) =>
            this.evento('sistema.anomalia', { categoria: ev.categoria, severidad: ev.severidad }));
          window.AC_Bus.suscribir('intervencion.ejecutada', (ev) =>
            this.evento('sistema.intervencion', { correccion: ev.queCorrigio, exito: ev.exito }));
          window.AC_Bus.suscribir('lae.adaptacion.completada', (ev) =>
            this.evento('lae.adaptacion', { causa: ev.diagnostico, escalon: ev.escalon,
                                            desenlace: ev.desenlace }));
        } catch (e) {}
      }

      // Fuentes
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => this.evento('fonts.ready', {})).catch(() => {});
      }

      // Parada automática: guarda el análisis para que quede accesible
      // aunque el consumidor llame a detener() después del vencimiento.
      this._ultimoAnalisis = null;
      setTimeout(() => {
        if (this.activo) this._ultimoAnalisis = this.detener();
      }, dur);
      return true;
    },

    /** Detiene la observación y devuelve la línea temporal completa. */
    detener() {
      // Si ya se detuvo por vencimiento, devolver el análisis guardado
      if (!this.activo) return this._ultimoAnalisis || null;
      this.evento('grabacion.fin', { frames: this.frames.length });
      this.activo = false;
      clearInterval(this._timer); this._timer = null;
      try { this._mo?.disconnect(); } catch (e) {}
      try { this._ro?.disconnect(); } catch (e) {}
      this._handlers.forEach(([t, tipo, fn]) => { try { t.removeEventListener(tipo, fn); } catch(e){} });
      this._handlers = [];
      this._ultimoAnalisis = this.analizar();
      return this._ultimoAnalisis;
    },

    /** Reconstruye la historia: hitos, estabilidad y evolución. */
    analizar() {
      const F = this.frames;
      if (!F.length) return null;

      // ── Hitos derivados de la línea temporal ────────────────────────────
      const hitos = {};
      hitos.primerFrame = F[0].t;
      // Primer layout: primer frame con escenario de altura > 0
      const primerLayout = F.find((f) => f.sedes.some((s) => s.escH > 0));
      hitos.primerLayout = primerLayout ? primerLayout.t : null;
      // Primer frame con elementos visibles
      const primerElemento = F.find((f) => f.sedes.some((s) => s.visibles > 0));
      hitos.primerElementoVisible = primerElemento ? primerElemento.t : null;
      // Último frame con solapes (a partir de ahí desaparecen)
      let ultimoConSolape = null, ultimoConOclusion = null;
      F.forEach((f) => {
        if (f.sedes.some((s) => s.paresSolape > 0)) ultimoConSolape = f.t;
        if (f.sedes.some((s) => s.oclusiones > 0))  ultimoConOclusion = f.t;
      });
      hitos.ultimoSolapeMs    = ultimoConSolape;
      hitos.ultimaOclusionMs  = ultimoConOclusion;
      // Eventos clave
      const ev = (tipo) => this.eventos.find((e) => e.tipo === tipo)?.t ?? null;
      hitos.fontsReadyMs = ev('fonts.ready');
      hitos.primeraAdaptacionLAE = ev('lae.adaptacion');

      // ── Estabilidad por sede ────────────────────────────────────────────
      const porSede = {};
      const idsSedes = [...new Set(F.flatMap((f) => f.sedes.map((s) => s.id)))];
      idsSedes.forEach((id) => {
        const serieH   = F.map((f) => f.sedes.find((s) => s.id===id)?.escH).filter((x) => x != null);
        const serieVis = F.map((f) => f.sedes.find((s) => s.id===id)?.visibles).filter((x) => x != null);
        const serieSol = F.map((f) => f.sedes.find((s) => s.id===id)?.paresSolape ?? 0);
        const serieArea= F.map((f) => f.sedes.find((s) => s.id===id)?.areaSolape ?? 0);
        // Alturas de elementos: tomar la serie de la mediana de alturas por frame
        const serieAltMediana = F.map((f) => {
          const a = f.sedes.find((s) => s.id===id)?.alturas || [];
          if (!a.length) return null;
          const s2 = [...a].sort((x,y)=>x-y);
          return s2[Math.floor(s2.length/2)];
        }).filter((x) => x != null);

        // Índice del primer frame sin solape sostenido hasta el final
        let idxSinSolape = -1;
        for (let i = 0; i < serieSol.length; i++) {
          if (serieSol.slice(i).every((v) => v === 0)) { idxSinSolape = i; break; }
        }

        porSede[id] = {
          alturaEscenario: Estabilidad.analizar(serieH),
          elementosVisibles: Estabilidad.analizar(serieVis, 0),
          alturaElementoMediana: Estabilidad.analizar(serieAltMediana),
          solape: {
            framesConSolape: serieSol.filter((v) => v > 0).length,
            paresMax: Math.max(0, ...serieSol),
            areaMax: Math.max(0, ...serieArea),
            areaFinal: serieArea[serieArea.length-1] ?? 0,
            tiempoHastaSinSolapeMs: idxSinSolape >= 0 ? F[idxSinSolape]?.t ?? null : null,
            resueltoAlFinal: (serieSol[serieSol.length-1] ?? 0) === 0,
          },
        };
      });

      // ── Estabilidad global del layout ───────────────────────────────────
      const serieSolapeTotal = F.map((f) => f.sedes.reduce((a,s) => a + s.paresSolape, 0));
      let idxLayoutEstable = -1;
      for (let i = 0; i < F.length; i++) {
        const restantes = F.slice(i);
        const sinCambio = restantes.every((f, k) => {
          if (k === 0) return true;
          const prev = restantes[k-1];
          return f.sedes.every((s, si) => {
            const p = prev.sedes[si];
            return p && s.visibles === p.visibles &&
                   Math.abs((s.escH||0) - (p.escH||0)) <= CFG.ESTABILIDAD_TOL_PX;
          });
        });
        if (sinCambio && restantes.length >= CFG.ESTABILIDAD_MUESTRAS) { idxLayoutEstable = i; break; }
      }
      hitos.layoutEstableMs = idxLayoutEstable >= 0 ? F[idxLayoutEstable].t : null;

      return {
        config: { intervaloMs: CFG.INTERVALO_MS, duracionRealMs: F[F.length-1].t,
                  framesCapturados: F.length, eventosRegistrados: this.eventos.length },
        hitos,
        performance: Performance.hitos(),
        recursos: Performance.recursos(),
        estabilidad: { porSede, layoutEstableMs: hitos.layoutEstableMs },
        // Línea temporal completa (frames + eventos ordenados)
        timeline: {
          frames: F,
          eventos: this.eventos,
        },
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ⑤ DATASET ACUMULATIVO
  // Estructura por dispositivo → sesiones → recorridos → muestras.
  // Persiste en localStorage (namespace propio, separado del Nivel 4).
  // ══════════════════════════════════════════════════════════════════════════
  const CLAVE_DATASET = 'unam_calibrar_dataset_v2';

  const Dataset = {
    /** Clave estable del dispositivo, para agrupar sesiones. */
    claveDispositivo() {
      const p = Dispositivo.perfil();
      const marca = p.navegador.nombre.toLowerCase().replace(/\s+/g,'-');
      const so    = p.so.nombre.toLowerCase();
      return `${so}-${p.resolucionCSS.w}x${p.resolucionCSS.h}@${p.DPR}-${marca}`;
    },

    _leer() {
      try {
        const raw = localStorage.getItem(CLAVE_DATASET);
        return raw ? JSON.parse(raw) : { version: 2, creado: new Date().toISOString(), dispositivos: {} };
      } catch (e) {
        return { version: 2, creado: new Date().toISOString(), dispositivos: {} };
      }
    },

    _escribir(d) {
      try { localStorage.setItem(CLAVE_DATASET, JSON.stringify(d)); return true; }
      catch (e) { return false; }  // cuota excedida: el dataset en memoria sigue válido
    },

    /** Agrega una sesión al dataset acumulativo. */
    agregarSesion(sesion) {
      const ds = this._leer();
      const clave = this.claveDispositivo();
      if (!ds.dispositivos[clave]) {
        ds.dispositivos[clave] = {
          perfil: Dispositivo.perfil(),
          primeraSesion: new Date().toISOString(),
          sesiones: [],
        };
      }
      // Guardar una versión reducida para no agotar la cuota
      ds.dispositivos[clave].sesiones.push({
        ts: new Date().toISOString(),
        build: window.__BUILD__,
        hitos: sesion.hitos || null,
        estabilidadResumen: sesion.estabilidad ? Object.fromEntries(
          Object.entries(sesion.estabilidad.porSede || {}).map(([k,v]) => [k, {
            alturaEscenarioFinal: v.alturaEscenario?.valorFinal,
            visiblesFinal: v.elementosVisibles?.valorFinal,
            solapeAreaFinal: v.solape?.areaFinal,
            solapeResuelto: v.solape?.resueltoAlFinal,
            tiempoSinSolapeMs: v.solape?.tiempoHastaSinSolapeMs,
          }])
        ) : null,
        capacidades: sesion.capacidades || null,
        framesCapturados: sesion.config?.framesCapturados,
      });
      // Techo por dispositivo: 50 sesiones (FIFO)
      const s = ds.dispositivos[clave].sesiones;
      if (s.length > 50) s.splice(0, s.length - 50);
      ds.ultimaActualizacion = new Date().toISOString();
      const ok = this._escribir(ds);
      return { ok, clave, totalSesiones: s.length };
    },

    exportar() { return this._leer(); },

    estadisticas() {
      const ds = this._leer();
      const devs = Object.keys(ds.dispositivos || {});
      return {
        version: ds.version,
        dispositivos: devs.length,
        sesionesTotales: devs.reduce((a,k) => a + (ds.dispositivos[k].sesiones?.length||0), 0),
        claves: devs,
      };
    },

    limpiar() {
      try { localStorage.removeItem(CLAVE_DATASET); return true; } catch (e) { return false; }
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ⑥ EXPORTACIONES — tres salidas independientes
  // ══════════════════════════════════════════════════════════════════════════
  const Exportar = {
    /** 1 · Calibración completa: toda la evidencia, sin resumir. */
    completa(analisisTemporal) {
      const base = CAL.ensamblarJSON();
      return {
        ...base,
        meta: { ...base.meta, tipoExportacion: 'calibracion-completa', versionEsquema: 2 },
        dispositivo: Dispositivo.perfil(),
        temporal: analisisTemporal || null,
      };
    },

    /** 2 · Resumen ejecutivo: parámetros listos para el LAE. */
    resumen(analisisTemporal) {
      const base = CAL.ensamblarJSON();
      const p = Dispositivo.perfil();
      // Alturas medidas por tipo, consolidadas
      const alturasPorTipo = {};
      (base.sedes || []).forEach((s) => {
        (s.elementos || []).forEach((e) => {
          if (!e.tipo || !e.offsetHeight) return;
          (alturasPorTipo[e.tipo] ||= []).push(e.offsetHeight);
        });
      });
      const consolidado = {};
      Object.entries(alturasPorTipo).forEach(([t, hs]) => {
        const s = [...hs].sort((a,b)=>a-b);
        consolidado[t] = {
          n: s.length, min: s[0], max: s[s.length-1],
          p50: s[Math.floor(s.length*.5)],
          p75: s[Math.floor(s.length*.75)],
        };
      });
      return {
        meta: { ...base.meta, tipoExportacion: 'resumen-ejecutivo', versionEsquema: 2 },
        dispositivo: {
          clave: Dataset.claveDispositivo(),
          viewportCSS: p.viewportCSS, DPR: p.DPR,
          navegador: p.navegador, so: p.so,
          puntero: p.puntero, refreshHz: p.refreshHzEstimado,
        },
        // Parámetros consumibles directamente por el LAE
        parametrosLAE: {
          alturasMedidas: consolidado,
          capacidadPorSede: Object.fromEntries((base.sedes||[]).map((s) => [s.id, {
            altUtil: s.altUtil, capacidadReal: s.capacidadReal,
            alturaReferencia: s.alturaReferencia,
            visibles: s.elementosVisibles,
            excede: s.capacidadReal != null && s.elementosVisibles > s.capacidadReal,
          }])),
          safeArea: base.viewport?.safeArea,
          margenTopEfectivo: (base.sedes||[])[0]?.margenTopEfectivo,
          margenBotEfectivo: (base.sedes||[])[0]?.margenBotEfectivo,
        },
        estabilidad: analisisTemporal?.estabilidad || null,
        hitos: analisisTemporal?.hitos || null,
        performance: analisisTemporal?.performance || null,
        diagnostico: base.diagnostico,
      };
    },

    /** 3 · Dataset acumulativo. */
    dataset() {
      return {
        meta: { tipoExportacion: 'dataset-acumulativo', versionEsquema: 2,
                exportado: new Date().toISOString(), build: window.__BUILD__ },
        ...Dataset.exportar(),
      };
    },

    /** Descarga cualquiera de las tres. */
    descargar(obj, sufijo) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      a.href = url;
      a.download = `${sufijo}_${window.__BUILD__ || 'build'}_${ts}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA — se acopla al panel de calibrar.js
  // ══════════════════════════════════════════════════════════════════════════
  window.__CALIBRAR_TEMPORAL__ = {
    CFG, Grabador, Estabilidad, Dispositivo, Performance, Dataset, Exportar,
    iniciarGrabacion: (ms) => Grabador.iniciar(ms),
    detenerGrabacion: () => {
      const analisis = Grabador.detener();
      // Registrar en el dataset una sola vez por grabación
      if (analisis && !analisis._registradoEnDataset) {
        Dataset.agregarSesion(analisis);
        Object.defineProperty(analisis, '_registradoEnDataset',
          { value: true, enumerable: false });
      }
      return analisis;
    },
    estaGrabando: () => Grabador.activo,
  };
})();
