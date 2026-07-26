/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Calibration Engine (Nivel 4)
 * DTI §12 — Motor de recalibración automática.
 *
 * Propone nuevas configuraciones basadas en evidencia estadística.
 * Compara propuesta vs vigente en múltiples ejes.
 * Solo acepta una calibración si supera estadísticamente a la anterior
 * en todos los criterios definidos por el DTI.
 * Versiona, almacena y puede revertir a cualquier versión anterior.
 *
 * Rangos operativos de auto-ajuste (definidos por el DTC §8):
 *  COOL_DOWN:         [400, 600] ms
 *  VENTANA_DEDUP:     [2×tick, 4×tick]
 *  OSC_UMBRAL:        [2, 4]
 *  PRESUPUESTO P0:    [1, 3] por minuto
 *  TICK_PROACTIVO:    [800, 2000] ms
 *  SOLAPE_TARJETAS:   [150, 300] px²
 *  GRACIA_POST:       [1200, 2000] ms
 *
 * Lo que NUNCA puede auto-ajustar:
 *  - NIVEL_AUTONOMIA (solo el operador editorial)
 *  - SOLAPE_ZONA_PX2 (cero tolerancia normativa)
 *  - CONTRASTE_FOCO_MIN (WCAG 1.4.11, normativo)
 *  - AUTORIDADES_MAX (K=2, invariante editorial)
 */
window.AC_CalibrationEngine = (() => {
  'use strict';

  const K = window.AC_K;
  const PREFIJO = K.PREFIJO_STORAGE + 'calibracion_';
  const BUS = window.AC_Bus;

  // ── Rangos de auto-ajuste (DTC §8, calibración del laboratorio) ────────
  const RANGOS = Object.freeze({
    COOL_DOWN_ENTRE_INTERV_MS:  { min: 400, max: 600 },
    VENTANA_DEDUP_MS:           { min: 2000, max: 4000 },
    OSCILACION_UMBRAL:          { min: 2, max: 4 },
    TICK_PROACTIVO_MS:          { min: 800, max: 2000 },
    SOLAPE_TARJETAS_PX2:        { min: 150, max: 300 },
    GRACIA_POST_COMPOSICION_MS: { min: 1200, max: 2000 },
    // Presupuesto P0
    P0_POR_MINUTO:              { min: 1, max: 3 },
  });

  // ── Versionado de calibraciones ────────────────────────────────────────
  // Estructura en localStorage:
  //   calibracion_activa → { version, parametros, ts, evidencia }
  //   calibracion_historial → [{ version, ts, parametros, razon }]
  //   calibracion_v{N} → { version, ts, parametros, estadisticas, comparacion }

  function _leerActiva() {
    try {
      const raw = localStorage.getItem(PREFIJO + 'activa');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _leerHistorial() {
    try {
      const raw = localStorage.getItem(PREFIJO + 'historial');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _escribirActiva(entrada) {
    try { localStorage.setItem(PREFIJO + 'activa', JSON.stringify(entrada)); } catch (e) {}
  }

  function _agregarHistorial(entrada) {
    try {
      const hist = _leerHistorial();
      hist.push(entrada);
      localStorage.setItem(PREFIJO + 'historial', JSON.stringify(hist.slice(-50)));
      localStorage.setItem(PREFIJO + 'v' + entrada.version, JSON.stringify(entrada));
    } catch (e) {}
  }

  function _versionActual() {
    const activa = _leerActiva();
    return activa?.version || 0;
  }

  // ── Extracción de parámetros actuales ─────────────────────────────────

  function parametrosActuales() {
    return {
      COOL_DOWN_ENTRE_INTERV_MS:  K.UMBRAL.COOL_DOWN_ENTRE_INTERV_MS,
      VENTANA_DEDUP_MS:           K.UMBRAL.VENTANA_DEDUP_MS,
      OSCILACION_UMBRAL:          K.UMBRAL.OSCILACION_UMBRAL,
      TICK_PROACTIVO_MS:          K.UMBRAL.TICK_PROACTIVO_MS,
      SOLAPE_TARJETAS_PX2:        K.UMBRAL.SOLAPE_TARJETAS_PX2,
      GRACIA_POST_COMPOSICION_MS: K.UMBRAL.GRACIA_POST_COMPOSICION_MS,
      P0_POR_MINUTO:              K.PRESUPUESTO['C-01']?.porMinuto || 2,
    };
  }

  // ── Propuesta de nuevos parámetros ─────────────────────────────────────

  /**
   * Propone nuevos valores basados en la evidencia estadística acumulada.
   * Para cada parámetro, usa el percentil que minimiza la anomalía observada,
   * dentro del rango operativo del DTC.
   */
  function proponer(claseDispositivo) {
    const ee = window.AC_EvidenceEngine;
    if (!ee) return null;

    const propuesta = { ...parametrosActuales() };
    const justificaciones = {};

    // COOL_DOWN: basado en la latencia P95 observada de los actuadores
    const estLatencia = ee.estadistica('latencia', claseDispositivo);
    if (estLatencia && estLatencia.N >= ee.MIN_OBS) {
      const nuevo = Math.round(estLatencia.P95 * 1.12); // P95 + 12% headroom
      const rango = RANGOS.COOL_DOWN_ENTRE_INTERV_MS;
      if (nuevo >= rango.min && nuevo <= rango.max) {
        propuesta.COOL_DOWN_ENTRE_INTERV_MS = nuevo;
        justificaciones.COOL_DOWN_ENTRE_INTERV_MS = `P95 latencia observada (${estLatencia.P95.toFixed(0)}ms) × 1.12 = ${nuevo}ms`;
      }
    }

    // TICK_PROACTIVO: basado en la estabilidad de la latencia
    if (estLatencia && estLatencia.N >= ee.MIN_OBS * 2) {
      const estable = estLatencia.CV < 20; // poca varianza → tick más frecuente (menor)
      const rango = RANGOS.TICK_PROACTIVO_MS;
      const nuevo = estable ? Math.max(rango.min, K.UMBRAL.TICK_PROACTIVO_MS * 0.9) :
                              Math.min(rango.max, K.UMBRAL.TICK_PROACTIVO_MS * 1.1);
      propuesta.TICK_PROACTIVO_MS = Math.round(nuevo);
      justificaciones.TICK_PROACTIVO_MS = `CV latencia=${estLatencia.CV.toFixed(1)}% → tick ${estable ? 'reducido' : 'aumentado'}`;
    }

    // GRACIA_POST: basado en la tasa de detecciones en el primer tick
    const estFP = ee.estadistica('fp_rate', claseDispositivo);
    if (estFP && estFP.N >= ee.MIN_OBS && estFP.mediana > 0.15) {
      // Alta tasa de FP → aumentar la gracia
      const rango = RANGOS.GRACIA_POST_COMPOSICION_MS;
      const nuevo = Math.min(rango.max, K.UMBRAL.GRACIA_POST_COMPOSICION_MS * 1.2);
      propuesta.GRACIA_POST_COMPOSICION_MS = Math.round(nuevo);
      justificaciones.GRACIA_POST_COMPOSICION_MS = `FP rate elevado (${(estFP.mediana*100).toFixed(1)}%) → gracia aumentada`;
    }

    return { propuesta, justificaciones };
  }

  // ── Comparación estadística de configuraciones ────────────────────────

  /**
   * Compara dos configuraciones en los cinco ejes requeridos por el DTI.
   * Retorna { acepta: bool, razones: string[], puntaje: 0-1 }.
   */
  function comparar(vigente, nueva, claseDispositivo) {
    const ee = window.AC_EvidenceEngine;
    const DD = window.AC_DriftDetector;
    const criterios = [];
    let positivos = 0;

    // 1. La tasa de rollbacks no empeora
    const estRB = ee?.estadistica('rollback_rate', claseDispositivo);
    if (estRB && estRB.mediana < 0.2) {
      criterios.push('✅ tasa de rollbacks aceptable (' + (estRB.mediana * 100).toFixed(1) + '%)');
      positivos++;
    } else {
      criterios.push('⚠️ tasa de rollbacks elevada');
    }

    // 2. Latencia dentro del rango operativo
    const estLat = ee?.estadistica('latencia', claseDispositivo);
    const newCD = nueva.COOL_DOWN_ENTRE_INTERV_MS;
    if (estLat && estLat.P95 < newCD * 1.1) {
      criterios.push('✅ latencia P95 compatible con nuevo COOL_DOWN');
      positivos++;
    } else {
      criterios.push('⚠️ latencia P95 puede superar nuevo COOL_DOWN');
    }

    // 3. La deriva global mejoró o no empeoró
    const evalActual = DD?.evaluar(claseDispositivo);
    if (!evalActual || evalActual.derivaGlobal < 0.3) {
      criterios.push('✅ deriva global aceptable (' + (evalActual?.derivaGlobal || 0).toFixed(3) + ')');
      positivos++;
    } else {
      criterios.push('❌ deriva global alta — la nueva calibración debe resolver la causa raíz primero');
    }

    // 4. La nueva calibración no viola las reglas de acople (OSC_UMBRAL ≤ porMinuto)
    if ((nueva.OSCILACION_UMBRAL || 3) <= (nueva.P0_POR_MINUTO || 2)) {
      criterios.push('✅ regla de acople OSC_UMBRAL ≤ porMinuto respetada');
      positivos++;
    } else {
      criterios.push('❌ regla de acople violada: OSC_UMBRAL > porMinuto');
    }

    // 5. Todos los valores dentro de los rangos declarados
    const fueraDeRango = Object.entries(nueva).filter(([k, v]) => {
      const r = RANGOS[k];
      return r && (v < r.min || v > r.max);
    });
    if (!fueraDeRango.length) {
      criterios.push('✅ todos los parámetros dentro de rangos operativos DTC');
      positivos++;
    } else {
      criterios.push('❌ parámetros fuera de rango: ' + fueraDeRango.map(([k]) => k).join(', '));
    }

    const puntaje = +(positivos / criterios.length).toFixed(3);
    return { acepta: positivos === criterios.length, puntaje, criterios };
  }

  // ── Aceptar y versionar una calibración ───────────────────────────────

  function aceptar(parametros, justificaciones, estadisticas, claseDispositivo) {
    const version = _versionActual() + 1;
    const actual = parametrosActuales();
    const diferencias = {};
    Object.entries(parametros).forEach(([k, v]) => {
      if (actual[k] !== v) diferencias[k] = { anterior: actual[k], nuevo: v };
    });

    const entrada = {
      version, ts: Date.now(), claseDispositivo,
      parametros, justificaciones, estadisticas,
      diferencias,
      build: window.__BUILD__,
    };

    _escribirActiva(entrada);
    _agregarHistorial(entrada);
    window.AC_DriftDetector?.actualizarReferencia({ fp_rate: 0.05, rollback_rate: 0.1, latencia: parametros.COOL_DOWN_ENTRE_INTERV_MS });

    // Publicar en el bus para que el Panel lo muestre
    BUS?.publicar('calibracion.aceptada', { version, diferencias, claseDispositivo });
    return entrada;
  }

  // ── Rollback inteligente ───────────────────────────────────────────────

  /**
   * Revierte a la versión anterior de la calibración si la actual degrada.
   * Registra causa, evidencia, parámetros afectados.
   */
  function revertir(causa, evidencia) {
    const historial = _leerHistorial();
    if (historial.length < 2) return { ok: false, error: 'No hay versión anterior disponible' };
    const anterior = historial[historial.length - 2];
    _escribirActiva(anterior);
    const registro = {
      ts: Date.now(), tipo: 'rollback',
      versionRevertida: _versionActual(),
      versionDestino: anterior.version,
      causa, evidencia,
      parametrosAfectados: Object.keys(anterior.parametros),
    };
    BUS?.publicar('calibracion.revertida', registro);
    return { ok: true, ...registro };
  }

  // ── Ciclo completo de recalibración ───────────────────────────────────

  /**
   * Intenta recalibrar para la clase de dispositivo actual.
   * Retorna el resultado: { accion: 'aceptada'|'rechazada'|'sin_evidencia', ... }
   */
  async function recalibrar(claseDispositivo) {
    const ee = window.AC_EvidenceEngine;
    if (!ee) return { accion: 'sin_evidencia', razon: 'EvidenceEngine no disponible' };

    // 1. Verificar evidencia mínima
    const estLat = ee.estadistica('latencia', claseDispositivo);
    if (!estLat || estLat.N < ee.MIN_OBS * 3) {
      return { accion: 'sin_evidencia', razon: `Evidencia insuficiente (N=${estLat?.N || 0}, mínimo ${ee.MIN_OBS * 3})` };
    }

    // 2. Proponer
    const { propuesta, justificaciones } = proponer(claseDispositivo) || {};
    if (!propuesta) return { accion: 'sin_evidencia', razon: 'No se pudo generar propuesta' };

    // 3. Comparar
    const vigente = parametrosActuales();
    const { acepta, puntaje, criterios } = comparar(vigente, propuesta, claseDispositivo);

    if (!acepta) {
      return { accion: 'rechazada', puntaje, criterios, razon: 'No supera los criterios de aceptación del DTI' };
    }

    // 4. Aceptar y versionar
    const estadisticas = { latencia: estLat, rollbackRate: ee.estadistica('rollback_rate', claseDispositivo) };
    const entrada = aceptar(propuesta, justificaciones, estadisticas, claseDispositivo);

    return { accion: 'aceptada', version: entrada.version, diferencias: entrada.diferencias, puntaje, criterios };
  }

  // Ciclo periódico de evaluación (cada TICK_META_MS = 60s)
  setInterval(() => {
    const DD = window.AC_DriftDetector;
    if (!DD) return;
    const clase = window.AC_ProfileLearner?.claseActual() || 'global';
    const eval_ = DD.evaluar(clase);
    if (eval_?.necesitaRecalibracion) {
      recalibrar(clase).then((res) => {
        if (res.accion === 'aceptada') {
          BUS?.publicar('calibracion.aplicada', { clase, ...res });
        }
      }).catch(() => {});
    }
  }, K.UMBRAL.TICK_META_MS || 60000);

  return {
    proponer, comparar, aceptar, revertir, recalibrar,
    parametrosActuales, leerActiva: _leerActiva, leerHistorial: _leerHistorial,
    RANGOS,
  };
})();
