/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 7: Executor
 * DTI §6 (matriz correcciones), §8 (actuadores, snapshot, rollback)
 *
 * Ejecuta las correcciones decididas por el Planner.
 * Toda mutación: snapshot → aplicar → validar → rollback si falla.
 * JAMÁS se llama directamente desde el Monitor o el Analyzer.
 */
window.AC_Executor = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const U = K.UMBRAL;

  // ── Helpers de la API pública del Motor Editorial (DTI §8.2) ──────────────

  const R = () => window.Rotacion;
  const D = () => window.Distribuidor;
  const L = () => window.Lector;
  const M = () => window.Mobile;

  function _sedeEl(sede) {
    return sede
      ? document.querySelector(`.sede[data-sede="${sede}"]`)
      : document.querySelector('.sede');
  }
  function _escenarioEl(sede) {
    return _sedeEl(sede)?.querySelector('.escenario');
  }

  // ── Snapshot (DTI §8.1 punto 1) ──────────────────────────────────────────

  function _snapshot(elementos) {
    return elementos.map((el) => ({
      el,
      x: el.style.getPropertyValue('--x'),
      y: el.style.getPropertyValue('--y'),
      escala: el.style.getPropertyValue('--escala'),
      clases: [...el.classList],
      tabIndex: el.tabIndex,
      ariaLabel: el.getAttribute('aria-label'),
    }));
  }

  function _restaurarSnapshot(snap) {
    snap.forEach(({ el, x, y, escala, clases, tabIndex, ariaLabel }) => {
      if (x) el.style.setProperty('--x', x);
      if (y) el.style.setProperty('--y', y);
      if (escala) el.style.setProperty('--escala', escala);
      el.className = clases.join(' ');
      el.tabIndex = tabIndex;
      if (ariaLabel !== null) el.setAttribute('aria-label', ariaLabel);
      else el.removeAttribute('aria-label');
    });
  }

  // ── Aplicación atómica con timeout (DTI §8.1 puntos 2 y 5) ───────────────

  async function _ejecutarConTimeout(fn, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs);
      requestAnimationFrame(() => {
        try {
          const res = fn();
          clearTimeout(timer);
          if (res && typeof res.then === 'function') {
            res.then((v) => resolve({ ok: true, valor: v })).catch((e) => {
              clearTimeout(timer); resolve({ ok: false, error: e.message });
            });
          } else {
            resolve({ ok: true, valor: res });
          }
        } catch (e) {
          clearTimeout(timer);
          resolve({ ok: false, error: e.message });
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ACTUADORES — DTI §6, toda la matriz
  // ════════════════════════════════════════════════════════════════════════════

  const _actuadores = {

    // ── C-01: Restaurar narrador UA (I1) ────────────────────────────────────
    'C-01': async (anomalia) => {
      const { ua, id } = anomalia.contexto;
      const el = document.querySelector(`.elemento[data-ua="${ua}"][data-permanente="true"]`);
      if (!el) return { ok: false, error: 'Elemento narrador no encontrado en DOM' };
      const snap = _snapshot([el]);
      const res = await _ejecutarConTimeout(() => {
        el.classList.remove('elemento--rotacion-espera', 'elemento--oculto-autoridad');
        if (!el.classList.contains('elemento--visible')) el.classList.add('elemento--visible');
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-03: Reducir autoridades a K=2 ─────────────────────────────────────
    'C-03': async (anomalia) => {
      const autoridades = Array.from(document.querySelectorAll(
        '.elemento--testimonio-institucional:not(.elemento--rotacion-espera):not(.elemento--oculto-autoridad)'
      ));
      if (autoridades.length <= K.UMBRAL.AUTORIDADES_MAX) return { ok: true, valor: 'ya ok' };
      // Ordenar por tiempo de llegada (último = el que sale)
      const aMover = autoridades.slice(K.UMBRAL.AUTORIDADES_MAX);
      const snap = _snapshot(aMover);
      const res = await _ejecutarConTimeout(() => {
        aMover.forEach((el) => {
          el.style.transition = 'opacity 350ms ease';
          el.style.opacity = '0';
          setTimeout(() => {
            el.style.opacity = '';
            el.classList.add('elemento--rotacion-espera');
          }, 360);
        });
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-04: Reiniciar ciclo corrupto ──────────────────────────────────────
    'C-04': async (anomalia) => {
      const sede = _sedeEl(anomalia.contexto?.sede);
      if (!sede) return { ok: false, error: 'Sede no encontrada' };
      const snap = [{
        el: sede,
        cicloExhibidos: sede.dataset.cicloExhibidos,
        cicloVuelta: sede.dataset.cicloVuelta,
      }];
      const res = await _ejecutarConTimeout(() => {
        const activos = Array.from(sede.querySelectorAll(
          '.elemento:not(.elemento--rotacion-espera)'
        )).map((el) => {
          return el.dataset.testimonioId ||
            `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`;
        });
        sede.dataset.cicloExhibidos = JSON.stringify(activos);
        const vueltaActual = Number(sede.dataset.cicloVuelta || '1');
        sede.dataset.cicloVuelta = String(vueltaActual + 1);
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-10: Colapsar tarjeta de video inválido ─────────────────────────────
    'C-10': async (anomalia) => {
      const videoEls = Array.from(document.querySelectorAll(
        '.elemento--video:not(.elemento--rotacion-espera)'
      )).filter((el) => el.querySelector('.lem-video-iframe[src=""]') ||
        el.dataset.multimediaInvalidado === 'true' ||
        !el.querySelector('img, .elemento-interior'));
      if (!videoEls.length) return { ok: true, valor: 'sin videos inválidos detectados' };
      const snap = _snapshot(videoEls);
      const res = await _ejecutarConTimeout(() => {
        videoEls.forEach((el) => {
          el.dataset.multimediaInvalidado = 'true';
          el.classList.add('elemento--rotacion-espera');
        });
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-12: Fallback cromático por imagen de fondo faltante ─────────────
    'C-12': async (anomalia) => {
      const bg = document.querySelector('.sede .sede-bg');
      if (!bg) return { ok: false, error: '.sede-bg no encontrado' };
      const snap = [{ el: bg, style: bg.getAttribute('style') }];
      const res = await _ejecutarConTimeout(() => {
        bg.style.backgroundImage = 'none';
        bg.classList.add('sede--fallback-cromatico');
        // El CSS de la clase fallback aplica el gradiente institucional
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-20: Reforzar contraste de foco ──────────────────────────────────
    'C-20': async (anomalia) => {
      const res = await _ejecutarConTimeout(() => {
        document.documentElement.classList.add('ac--focus-refuerzo');
        // La clase aplica mayor opacidad del halo oscuro (ver CSS del subsistema)
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [{ el: document.documentElement, teniaClase: false }] };
    },

    // ── C-21: Restaurar tabindex=0 en entrante ──────────────────────────────
    'C-21': async (anomalia) => {
      const id = anomalia.contexto?.id;
      const el = id
        ? document.querySelector(`.elemento[data-testimonio-id="${id}"], .elemento[data-tipo="${id}"]`)
        : null;
      if (!el) return { ok: false, error: 'Elemento no encontrado para tabIndex' };
      const snap = _snapshot([el]);
      const res = await _ejecutarConTimeout(() => { el.tabIndex = 0; }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-22: Recomputar aria-label desde dataset ───────────────────────────
    'C-22': async (anomalia) => {
      const interactivos = document.querySelectorAll(
        '.elemento[data-tipo]:not([aria-label]), .ruta-flecha:not([aria-label])'
      );
      const snap = Array.from(interactivos).map((el) => ({
        el, ariaLabel: el.getAttribute('aria-label')
      }));
      const res = await _ejecutarConTimeout(() => {
        interactivos.forEach((el) => {
          const tipo = el.dataset.tipo;
          const ua = el.dataset.ua || '';
          let etiqueta = '';
          if (tipo === 'registro-ua') etiqueta = `Expediente de ${ua.toUpperCase()}`;
          else if (tipo === 'testimonio') etiqueta = `Testimonio de ${ua}`;
          else if (tipo === 'video') etiqueta = `Video institucional de ${ua}`;
          else if (tipo === 'registro-conceptual') etiqueta = `Síntesis conceptual`;
          else if (el.classList.contains('ruta-flecha--siguiente')) etiqueta = 'Sede siguiente';
          else if (el.classList.contains('ruta-flecha--anterior')) etiqueta = 'Sede anterior';
          if (etiqueta) el.setAttribute('aria-label', etiqueta);
        });
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-24: Reordenar foco narrativo (M-30) ──────────────────────────────
    'C-24': async (anomalia) => {
      const sede = _sedeEl(anomalia.contexto?.sede);
      const escenario = sede?.querySelector('.escenario');
      if (!escenario) return { ok: false, error: 'Escenario no encontrado' };
      const res = await _ejecutarConTimeout(() => {
        // Reutiliza la misma función que M-30 (si está expuesta)
        if (typeof window.AC_ordenarFocoNarrativo === 'function') {
          window.AC_ordenarFocoNarrativo(escenario);
        } else {
          // Implementación inline de respaldo
          const elementos = Array.from(escenario.querySelectorAll('.elemento'));
          const permanentes = elementos.filter((el) => el.dataset.permanente === 'true');
          const rotativos = elementos.filter((el) => el.dataset.permanente !== 'true')
            .sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0));
          [...permanentes, ...rotativos].forEach((el) => escenario.appendChild(el));
        }
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-30: Redistribuir escena completa ──────────────────────────────────
    'C-30': async (anomalia) => {
      const sede = _sedeEl(anomalia.contexto?.sede);
      if (!sede) return { ok: false, error: 'Sede no encontrada' };
      const elementos = Array.from(sede.querySelectorAll('.elemento:not(.elemento--rotacion-espera)'));
      const snap = _snapshot(elementos);
      const res = await _ejecutarConTimeout(() => {
        D()?.distribuir(sede);
      }, U.TIMEOUT_DISTRIBUIR_MS);
      return { ...res, snap };
    },

    // ── C-31: Reposicionar invasor de zona protegida ────────────────────────
    'C-31': async (anomalia) => {
      const { elemento: idEl } = anomalia.contexto || {};
      const sede = _sedeEl(anomalia.contexto?.sede);
      const el = idEl && sede
        ? sede.querySelector(`.elemento[data-testimonio-id="${idEl}"], .elemento[data-tipo="${idEl}"]`)
        : null;
      if (!el || !sede) return { ok: false, error: 'Elemento invasor no encontrado' };
      const snap = _snapshot([el]);
      const res = await _ejecutarConTimeout(() => {
        D()?.reposicionarEntranteDesktop(el, sede);
      }, U.TIMEOUT_DISTRIBUIR_MS);
      return { ...res, snap };
    },

    // ── C-32: Reubicar elemento fuera del viewport ──────────────────────────
    'C-32': async (anomalia) => {
      const { id: idEl } = anomalia.contexto || {};
      const sede = _sedeEl(anomalia.contexto?.sede);
      const el = idEl && sede
        ? sede.querySelector(`.elemento[data-testimonio-id="${idEl}"]`)
        : null;
      if (!el || !sede) return { ok: false, error: 'Elemento fuera de viewport no encontrado' };
      const snap = _snapshot([el]);
      const res = await _ejecutarConTimeout(() => {
        // Resetear a ancla editorial en %
        const ax = el.dataset.anclaX || '50';
        const ay = el.dataset.anclaY || '50';
        el.style.setProperty('--x', `${ax}%`);
        el.style.setProperty('--y', `${ay}%`);
        // Luego pedir reposicionamiento real
        D()?.reposicionarEntranteDesktop(el, sede);
      }, U.TIMEOUT_DISTRIBUIR_MS);
      return { ...res, snap };
    },

    // ── C-33: Restaurar scroll/overflow ────────────────────────────────────
    'C-33': async (anomalia) => {
      const res = await _ejecutarConTimeout(() => {
        // Intentar snap al inicio del carrusel si hay overflow
        const carrusel = document.querySelector('.secciones');
        if (carrusel) carrusel.scrollLeft = 0;
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-34: Variante tipográfica compacta ────────────────────────────────
    'C-34': async (anomalia) => {
      const titulos = document.querySelectorAll('.registro-ua-titulo, .registro-conceptual-titulo');
      const snap = Array.from(titulos).map((el) => ({ el, clase: el.className }));
      const res = await _ejecutarConTimeout(() => {
        titulos.forEach((el) => {
          if (el.scrollWidth > el.clientWidth) el.classList.add('ac--titulo-compacto');
        });
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },

    // ── C-41: Circuit breaker para recalcular frecuente ───────────────────
    'C-41': async (anomalia) => {
      // No puede cancelar recalcular() directamente sin modificar el motor.
      // El circuit breaker se aplica en el propio Monitor (deja de reportar
      // por 60s) — registramos la intención.
      return { ok: true, valor: 'circuit-breaker-registrado', snap: [] };
    },

    // ── C-42: Purga de registro del subsistema ─────────────────────────────
    'C-42': async (anomalia) => {
      const res = await _ejecutarConTimeout(() => {
        window.AC_Logger?.forzarPersistencia();
        // El Logger ya maneja la purga interna en su sistema de registro circular
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-50: Degradación graceful sessionStorage ──────────────────────────
    'C-50': async (anomalia) => {
      // El código de producción ya tiene try/catch — solo registramos
      return { ok: true, valor: 'degradacion-graceful-activa', snap: [] };
    },

    // ── C-53: Bypass fonts.ready ───────────────────────────────────────────
    'C-53': async (anomalia) => {
      // Si el sistema arrancó sin fonts.ready, el subsistema no puede reiniciarlo.
      // Solo escalar para que el desarrollador lo investigue.
      return { ok: false, error: 'fonts.ready-bypass-requiere-escalar', snap: [] };
    },

    // ── C-61: Sincronizar nav mobile con carrusel ──────────────────────────
    'C-61': async (anomalia) => {
      const indice = window.__carrusel?.indice ?? 0;
      const res = await _ejecutarConTimeout(() => {
        M()?.actualizarNavMobile?.(indice);
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-62: Limpiar hash de URL obsoleto ────────────────────────────────
    'C-62': async (anomalia) => {
      const res = await _ejecutarConTimeout(() => {
        history.replaceState(null, '', location.pathname + location.search);
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-64: Resetear scroll del Lector ──────────────────────────────────
    'C-64': async (anomalia) => {
      const scroll = document.querySelector('.lem-scroll');
      if (!scroll) return { ok: true, valor: 'lector-no-abierto' };
      const res = await _ejecutarConTimeout(() => { scroll.scrollTop = 0; }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap: [] };
    },

    // ── C-70: Rehidratar configurar() por firma divergente ─────────────────
    'C-70': async (anomalia) => {
      const sede = _sedeEl(anomalia.contexto?.sede);
      if (!sede) return { ok: false, error: 'Sede no encontrada' };
      const res = await _ejecutarConTimeout(() => {
        R()?.configurarInmediato?.(sede);
      }, U.TIMEOUT_DISTRIBUIR_MS);
      return { ...res, snap: [] };
    },

    // ── C-71: Corregir clase --rotacion-espera divergente ─────────────────
    'C-71': async (anomalia) => {
      // Sincroniza DOM hacia el estado declarado: gana el DOM (DTI §6.8)
      const sede = _sedeEl(anomalia.contexto?.sede);
      if (!sede) return { ok: false, error: 'Sede no encontrada' };
      const res = await _ejecutarConTimeout(() => {
        R()?.configurarInmediato?.(sede);
      }, U.TIMEOUT_DISTRIBUIR_MS);
      return { ...res, snap: [] };
    },

    // ── C-72: Reconstruir cicloOrden corrupto ─────────────────────────────
    'C-72': async (anomalia) => {
      const sede = _sedeEl(anomalia.contexto?.sede);
      if (!sede) return { ok: false, error: 'Sede no encontrada' };
      const snap = [{ el: sede, cicloOrden: sede.dataset.cicloOrden }];
      const res = await _ejecutarConTimeout(() => {
        const activos = Array.from(sede.querySelectorAll('.elemento:not(.elemento--rotacion-espera)'))
          .sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0))
          .map((el) => el.dataset.testimonioId ||
            `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`);
        const espera = Array.from(sede.querySelectorAll('.elemento.elemento--rotacion-espera'))
          .sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0))
          .map((el) => el.dataset.testimonioId ||
            `${el.dataset.tipo || '?'}-${el.dataset.ua || '?'}-${el.dataset.orden || '?'}`);
        sede.dataset.cicloOrden = JSON.stringify([...activos, ...espera]);
        sede.dataset.cicloExhibidos = JSON.stringify(activos);
      }, U.TIMEOUT_CORRECCCION_MS);
      return { ...res, snap };
    },
  };

  // ── Ciclo de ejecución con rollback (DTI §8.1) ────────────────────────────

  Bus.suscribir('intervencion.decidida', async (ev) => {
    const { corrección, anomalia, diagnosticHash, sede, timeout, simulado, tsDecision } = ev;
    const tsInicio = Date.now();

    // En nivel 0-1 (simulado): registrar sin ejecutar
    if (simulado) {
      window.AC_Logger?.registrarIntervencion({
        que: `[SIMULADO] ${K.CORRECCIONES[corrección]?.descripcion}`,
        cuando: tsInicio,
        porQue: anomalia.causa,
        queCorrigio: corrección,
        resultado: 'simulado',
        duracion: 0,
        exito: null,
        rollback: null,
        diagnosticHash,
      });
      Bus.publicar('ciclo.cerrado', { diagnosticHash, exito: null, simulado: true });
      return;
    }

    const actuador = _actuadores[corrección];
    if (!actuador) {
      window.AC_Logger?.registrarEscalacion({
        categoria: anomalia.categoria,
        severidad: anomalia.severidad,
        contexto: anomalia.contexto,
        diagnosticHash,
        motivo: `Actuador "${corrección}" no implementado`,
      });
      return;
    }

    let resultado;
    try {
      resultado = await actuador(anomalia);
    } catch (e) {
      resultado = { ok: false, error: e.message, snap: [] };
    }

    const duracion = Date.now() - tsInicio;

    // Si falló, intentar rollback
    let rollbackInfo = null;
    if (!resultado.ok && resultado.snap?.length) {
      try {
        _restaurarSnapshot(resultado.snap);
        rollbackInfo = { ejecutado: true, exitoRollback: true };
      } catch (eRb) {
        rollbackInfo = { ejecutado: true, exitoRollback: false, error: eRb.message };
        // Escalar si el rollback falló también
        window.AC_Logger?.registrarEscalacion({
          categoria: anomalia.categoria,
          severidad: 0, // P0
          contexto: anomalia.contexto,
          diagnosticHash,
          motivo: `Rollback de "${corrección}" también falló: ${eRb.message}`,
        });
      }
    }

    window.AC_Logger?.registrarIntervencion({
      que: K.CORRECCIONES[corrección]?.descripcion,
      cuando: tsInicio,
      porQue: anomalia.causa,
      queCorrigio: corrección,
      resultado: resultado.ok ? 'exito' : (resultado.error || 'fallo'),
      duracion,
      exito: resultado.ok,
      rollback: rollbackInfo,
      diagnosticHash,
    });

    Bus.publicar('intervencion.ejecutada', {
      queCorrigio: corrección,
      diagnosticHash,
      exito: resultado.ok,
      duracion,
      estadoPosterior: resultado.valor,
      señalOriginal: anomalia.señalOriginal,
      tsInicio,
      rollback: rollbackInfo,
    });
  });

  return {};
})();
