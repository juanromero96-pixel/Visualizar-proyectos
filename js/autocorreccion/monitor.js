/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 4: Monitor
 * DTI §4 — Detectores reactivos (§4.1), proactivos (§4.2), derivados (§4.3)
 * DTI §4.4 — Restricciones de operación
 *
 * Publica señales al bus. No decide. No modifica. Solo observa.
 */
window.AC_Monitor = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const U = K.UMBRAL;

  // ── Estado interno del Monitor ─────────────────────────────────────────────

  let _activo = false;
  let _timers = [];

  // Historial de señales para detectores derivados
  const _historial = {
    señales: [],           // {tipo, hash, ts}
    VENTANA: 60000,
  };

  // Emisiones deduplicadas: misma señal, mismo tick → una sola emisión con contador
  const _ultimasEmisiones = new Map(); // hash → {ts, count}

  // ── Helpers de observabilidad ──────────────────────────────────────────────

  function _escenarioActivo() {
    return document.querySelector('.sede .escenario');
  }
  function _sedeActiva() {
    return document.querySelector('.sede');
  }
  function _elementosActivos() {
    const esc = _escenarioActivo();
    if (!esc) return [];
    return Array.from(esc.querySelectorAll('.elemento:not(.elemento--rotacion-espera)'));
  }

  /**
   * Emite una señal al bus con deduplicación por hash (DTI §4.4 restricción 4).
   * Si la misma señal ya se emitió hace < TICK_PROACTIVO_MS, solo incrementa contador.
   */
  function _emitir(tipo, payload) {
    const hash = tipo + ':' + (payload.hash || JSON.stringify(payload).slice(0, 60));
    const ahora = Date.now();
    const ultima = _ultimasEmisiones.get(hash);
    if (ultima && (ahora - ultima.ts) < U.TICK_PROACTIVO_MS) {
      ultima.count++;
      return; // deduplicado
    }
    _ultimasEmisiones.set(hash, { ts: ahora, count: 1 });
    Bus.publicar('senal.observada', { señalTipo: tipo, ts: ahora, ...payload });
    _historial.señales.push({ tipo, hash, ts: ahora });
    // Limpiar historial > ventana
    const corte = ahora - _historial.VENTANA;
    while (_historial.señales.length && _historial.señales[0].ts < corte) {
      _historial.señales.shift();
    }
  }

  // ── Sonda de tick segura: abort si tarda > 5ms (DTI §4.4 restricción 2) ──

  function _sondaSegura(fn, nombre) {
    const t0 = performance.now();
    try { fn(); }
    catch (e) { console.warn('[AC_Monitor] Sonda "' + nombre + '" falló:', e); }
    const dt = performance.now() - t0;
    if (dt > 5) {
      _emitir('monitor.sonda.lenta', { nombre, duracionMs: Math.round(dt), hash: 'sonda_lenta_' + nombre });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §4.1 — DETECTORES REACTIVOS (se enganchan a DIAG.subscribe)
  // ════════════════════════════════════════════════════════════════════════════

  function _iniciarDetectoresReactivos() {
    window.__DIAG__.subscribe((ev) => {
      if (!_activo) return;

      // Detector de composición (DTI §4.1)
      if (ev.tipo === 'configurar') {
        _emitir('composicion', {
          sede: ev.sede, modo: ev.modo, activo: ev.activo, espera: ev.espera,
          cap: ev.cap, hash: 'composicion_' + ev.sede,
        });
      }

      // Detector de intercambio
      if (ev.tipo === 'ciclo-vuelta-completa') {
        _emitir('ciclo.vuelta.completa', { sede: ev.sede, vuelta: ev.vuelta, hash: 'vuelta_' + ev.sede });
      }

      // Detector de cambio de sede
      if (ev.tipo === 'onCambio') {
        _emitir('cambio.sede', { indice: ev.indice, sede: ev.sede, hash: 'onCambio' });
      }

      // Detector de resize
      if (ev.tipo === 'resize') {
        _emitir('viewport.resize', { dw: ev.dw, dh: ev.dh, hash: 'resize' });
      }

      // Detector de arranque
      if (ev.tipo === 'iniciar') {
        _emitir('arranque', { sede: ev.sede, mobile: ev.mobile, hash: 'iniciar' });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §4.2 — DETECTORES PROACTIVOS (polling con requestIdleCallback / setTimeout)
  // ════════════════════════════════════════════════════════════════════════════

  // ── Sonda de invariantes editoriales (cada TICK_PROACTIVO_MS) ─────────────

  function _sondaEditorial() {
    _sondaSegura(() => {
      const esc = _escenarioActivo();
      const sede = _sedeActiva();
      if (!esc || !sede) return;

      // I1: narradores permanentes siempre visibles
      const permanentes = Array.from(esc.querySelectorAll('.elemento[data-permanente="true"]'));
      permanentes.forEach((el) => {
        const visible = el.classList.contains('elemento--visible')
          && !el.classList.contains('elemento--rotacion-espera');
        if (!visible) {
          _emitir('editorial.narrador.ausente', {
            id: el.dataset.testimonioId || el.dataset.tipo,
            ua: el.dataset.ua,
            hash: 'narrador_ausente_' + (el.dataset.ua || 'uk'),
          });
        }
      });

      // I5: máximo K=2 autoridades simultáneas
      const autoridades = Array.from(esc.querySelectorAll('.elemento--testimonio-institucional'))
        .filter((el) => !el.classList.contains('elemento--rotacion-espera')
          && !el.classList.contains('elemento--oculto-autoridad'));
      if (autoridades.length > K.UMBRAL.AUTORIDADES_MAX) {
        _emitir('editorial.autoridades.exceso', {
          conteo: autoridades.length, maximo: K.UMBRAL.AUTORIDADES_MAX,
          hash: 'autoridades_exceso',
        });
      }

      // I6: ciclo que no reinicia (exhibidos > orden)
      const estadoCiclo = window.Rotacion?.estadoCiclo?.(sede);
      if (estadoCiclo && estadoCiclo.total > 0 && estadoCiclo.exhibidos > estadoCiclo.total) {
        _emitir('editorial.ciclo.corrupto', {
          exhibidos: estadoCiclo.exhibidos, total: estadoCiclo.total,
          vuelta: estadoCiclo.vuelta, hash: 'ciclo_corrupto',
        });
      }
    }, 'editorial');
  }

  // ── Sonda geométrica (cada TICK_PROACTIVO_MS) ──────────────────────────────

  function _sondaGeometrica() {
    _sondaSegura(() => {
      const esc = _escenarioActivo();
      const sede = _sedeActiva();
      if (!esc || !sede) return;

      const rectEsc = esc.getBoundingClientRect();
      if (!rectEsc.width) return;

      const elementos = _elementosActivos();
      const cajas = elementos.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      });

      // Solape entre tarjetas
      for (let i = 0; i < cajas.length; i++) {
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i], b = cajas[j];
          const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const area = ox * oy;
          if (area > K.UMBRAL.SOLAPE_TARJETAS_PX2) {
            const idA = a.el.dataset.testimonioId || a.el.dataset.tipo || 'el';
            const idB = b.el.dataset.testimonioId || b.el.dataset.tipo || 'el';
            _emitir('geometria.solape.tarjetas', {
              area: Math.round(area), idA, idB,
              hash: 'solape_' + [idA, idB].sort().join('_'),
            });
          }
        }
      }

      // Solape con zonas protegidas (chip, kicker)
      const zonasProtegidas = [
        { nombre: 'chip', el: sede.querySelector('.marca-chip') },
        { nombre: 'kicker', el: esc.closest('.sede')?.querySelector('.sede-kicker') },
      ].filter((z) => z.el);

      zonasProtegidas.forEach(({ nombre, el: zonaEl }) => {
        const rZona = zonaEl.getBoundingClientRect();
        cajas.forEach(({ el, left, top, right, bottom }) => {
          const ox = Math.max(0, Math.min(right, rZona.right) - Math.max(left, rZona.left));
          const oy = Math.max(0, Math.min(bottom, rZona.bottom) - Math.max(top, rZona.top));
          const area = ox * oy;
          if (area > K.UMBRAL.SOLAPE_ZONA_PX2) {
            const id = el.dataset.testimonioId || el.dataset.tipo || 'el';
            _emitir('geometria.solape.zona', {
              area: Math.round(area), zona: nombre, elemento: id,
              hash: 'zona_' + nombre + '_' + id,
            });
          }
        });
      });

      // Elementos fuera del viewport del escenario
      cajas.forEach(({ el, left, top, right, bottom }) => {
        if (left < rectEsc.left - 5 || right > rectEsc.right + 5
          || top < rectEsc.top - 5 || bottom > rectEsc.bottom + 5) {
          const id = el.dataset.testimonioId || el.dataset.tipo || 'el';
          _emitir('geometria.fuera.viewport', { id, hash: 'fuera_viewport_' + id });
        }
      });
    }, 'geometrica');
  }

  // ── Sonda de accesibilidad (cada 2 ticks) ─────────────────────────────────

  let _tickAccesibilidad = 0;
  function _sondaAccesibilidad() {
    _tickAccesibilidad++;
    if (_tickAccesibilidad % 2 !== 0) return;
    _sondaSegura(() => {
      // tabindex en elementos activos
      _elementosActivos().forEach((el) => {
        if (!el.tabIndex || el.tabIndex < 0) {
          _emitir('accesibilidad.tabindex.ausente', {
            id: el.dataset.testimonioId || el.dataset.tipo || 'el',
            hash: 'tabindex_' + (el.dataset.testimonioId || 'uk'),
          });
        }
      });

      // aria-label ausente en elementos interactivos
      document.querySelectorAll('.ruta-flecha, .ruta-nodo, .menu-inst-btn').forEach((el) => {
        if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          _emitir('accesibilidad.aria.ausente', {
            tag: el.tagName, clase: el.className.slice(0, 40),
            hash: 'aria_' + el.className.slice(0, 20),
          });
        }
      });
    }, 'accesibilidad');
  }

  // ── Sonda de recursos (cada 5 ticks) ──────────────────────────────────────

  let _tickRecursos = 0;
  function _sondaRecursos() {
    _tickRecursos++;
    if (_tickRecursos % 5 !== 0) return;
    _sondaSegura(() => {
      // sessionStorage
      try { sessionStorage.setItem('_ac_probe', '1'); sessionStorage.removeItem('_ac_probe'); }
      catch (e) { _emitir('recursos.sessionstorage.inaccesible', { hash: 'ss_inaccesible', error: e.message }); }

      // localStorage / Almacen
      try { localStorage.setItem('_ac_probe', '1'); localStorage.removeItem('_ac_probe'); }
      catch (e) { _emitir('recursos.localstorage.inaccesible', { hash: 'ls_inaccesible', error: e.message }); }

      // Fondos de sede: verificar que background-image no sea 'none' en sede activa
      const bg = _sedeActiva()?.querySelector('.sede-bg');
      if (bg) {
        const bgImg = window.getComputedStyle(bg).backgroundImage;
        if (!bgImg || bgImg === 'none') {
          _emitir('recursos.fondo.faltante', { hash: 'fondo_faltante' });
        }
      }
    }, 'recursos');
  }

  // ── Sonda de consistencia (cada TICK_CONSISTENCIA_MS = 5s) ────────────────

  function _sondaConsistencia() {
    _sondaSegura(() => {
      const sede = _sedeActiva();
      if (!sede) return;

      // Firma de idempotencia vs DOM
      const escenario = sede.querySelector('.escenario');
      if (escenario && sede.dataset.rotConfig) {
        const candidatos = Array.from(escenario.querySelectorAll('.elemento:not(.elemento--rotacion-espera)'));
        const capActual = candidatos.length;
        const firmaDeclarada = sede.dataset.rotConfig;
        const capDeclarada = parseInt((firmaDeclarada.match(/\|c(\d+)\|/) || [])[1] || '0');
        if (capActual !== capDeclarada) {
          _emitir('consistencia.firma.divergente', {
            capActual, capDeclarada, firmaDeclarada,
            hash: 'firma_divergente_' + sede.dataset.sede,
          });
        }
      }

      // cicloOrden parseable
      if (sede.dataset.cicloOrden) {
        try { JSON.parse(sede.dataset.cicloOrden); }
        catch (e) {
          _emitir('consistencia.ciclo.orden.corrupto', {
            hash: 'ciclo_orden_corrupto_' + sede.dataset.sede,
          });
        }
      }

      // Hash de URL vs Lector
      const hash = location.hash;
      if (hash && hash.includes('/')) {
        const lemAbierta = document.querySelector('.lem--abierta');
        if (!lemAbierta) {
          _emitir('consistencia.hash.sin.lector', { hash: 'hash_sin_lector', urlHash: hash });
        }
      }

      // Overflow horizontal
      if (document.body.scrollWidth > document.body.clientWidth + 5) {
        _emitir('layout.overflow.horizontal', { hash: 'overflow_horizontal',
          sw: document.body.scrollWidth, cw: document.body.clientWidth });
      }
    }, 'consistencia');
  }

  // ── Sonda de rendimiento (observa DIAG para tiempos de distribuir) ─────────

  // Se hace reactiva — DIAG ya emite 'recalcular'; no podemos medir el tiempo
  // interno de distribuir() sin modificar el motor. Registramos el evento y
  // lo marcamos para análisis diferido.
  function _sondaRendimiento() {
    _sondaSegura(() => {
      // Frecuencia de recalcular: si en los últimos 60s hay > 10 entradas 'recalcular', alertar.
      const ahora = Date.now();
      const recientes = _historial.señales.filter(
        (s) => s.tipo === 'composicion' && ahora - s.ts < 60000
      );
      if (recientes.length > 10) {
        _emitir('rendimiento.recalcular.frecuente', {
          conteo: recientes.length, ventanaS: 60, hash: 'recalcular_frecuente',
        });
      }
    }, 'rendimiento');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §4.3 — DETECTORES DERIVADOS
  // ════════════════════════════════════════════════════════════════════════════

  function _evaluarDerivados() {
    const ahora = Date.now();
    const ventana = U.OSCILACION_VENTANA_MS;

    // Detector de oscilación: mismo hash, ≥3 veces en ventana
    const conteosPorHash = {};
    _historial.señales.forEach(({ hash, ts }) => {
      if (ahora - ts > ventana) return;
      conteosPorHash[hash] = (conteosPorHash[hash] || 0) + 1;
    });
    Object.entries(conteosPorHash).forEach(([hash, count]) => {
      if (count >= U.OSCILACION_UMBRAL) {
        _emitir('derivado.oscilacion', { hash: 'osc_' + hash, señalHash: hash, conteo: count });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CICLO DE POLLING CON PROTECCIÓN (DTI §4.4)
  // ════════════════════════════════════════════════════════════════════════════

  function _tick() {
    // Restricción 3: pausar si la pestaña está oculta
    if (document.hidden) return;
    // Restricción 3: pausar si el Lector está abierto (ciclo pausado)
    // Solo omitir sondas que dependen del ciclo activo
    const lectorAbierto = !!document.querySelector('.lem--abierta');

    _sondaEditorial();
    _sondaGeometrica();
    _sondaAccesibilidad();
    _sondaRecursos();
    if (!lectorAbierto) _sondaRendimiento();
    _evaluarDerivados();
  }

  function _tickConsistencia() {
    if (document.hidden) return;
    _sondaConsistencia();
  }

  // ── API pública ──────────────────────────────────────────────────────────

  function iniciar() {
    if (_activo) return;
    _activo = true;

    _iniciarDetectoresReactivos();

    // Polling con requestIdleCallback cuando está disponible
    const programarTick = () => {
      if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(() => { _tick(); programarTick(); },
          { timeout: U.TICK_PROACTIVO_MS });
        _timers.push({ tipo: 'idleCallback', id });
      } else {
        const id = setInterval(_tick, U.TICK_PROACTIVO_MS);
        _timers.push({ tipo: 'interval', id });
      }
    };
    programarTick();

    const idConsistencia = setInterval(_tickConsistencia, U.TICK_CONSISTENCIA_MS);
    _timers.push({ tipo: 'interval', id: idConsistencia });

    Bus.publicar('monitor.iniciado', { ts: Date.now() });
  }

  function detener() {
    _activo = false;
    _timers.forEach(({ tipo, id }) => {
      if (tipo === 'interval') clearInterval(id);
      else if (tipo === 'idleCallback' && typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
    });
    _timers = [];
  }

  function estaActivo() { return _activo; }

  return { iniciar, detener, estaActivo };
})();
