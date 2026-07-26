/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Drift Detector (Nivel 4)
 * DTI §12 — Detector de desviaciones en la calibración aceptada.
 *
 * Cuantifica la deriva en todas las métricas operativas.
 * NUNCA clasifica deriva como verdadero/falso — produce un escalar firmado
 * que expresa magnitud y dirección.
 *
 * Métricas vigiladas (DTI: "La deriva deberá cuantificarse"):
 *   - tasa de falsos positivos (anomalías detectadas sin corrección exitosa)
 *   - tasa de rollbacks
 *   - latencia de correcciones
 *   - tiempos de ejecución algorítmica
 *   - geometría (solape post-corrección)
 *   - rendimiento (frecuencia de detección)
 *   - perfil de dispositivo activo (cambio en viewport/DPR observado)
 *   - densidad editorial (cambios en N de elementos activos)
 */
window.AC_DriftDetector = (() => {
  'use strict';

  const K = window.AC_K;
  const EE = () => window.AC_EvidenceEngine;
  const Bus = window.AC_Bus;
  const PREFIJO = K.PREFIJO_STORAGE + 'drift_';

  // Calibración de referencia (la activa — puede actualizarse por el CalibrationEngine)
  let _calibracionReferencia = null;

  // ── Umbrales de alerta por métrica (en % de desviación sobre la referencia) ──
  const UMBRAL_DERIVA_PCT = {
    fp_rate: 25,           // falsos positivos: alerta si +25% sobre línea base
    rollback_rate: 30,     // rollbacks: alerta si +30%
    latencia: 40,          // latencia de corrección: alerta si +40%
    solape_post: 20,       // solape post-corrección: alerta si +20%
    detecciones_por_tick: 50, // frecuencia de anomalías: alerta si +50%
  };

  // ── Historial de evaluaciones ─────────────────────────────────────────
  const _historial = [];
  const MAX_HIST = 100;

  function _pushHistorial(eval_) {
    _historial.push({ ts: Date.now(), ...eval_ });
    if (_historial.length > MAX_HIST) _historial.shift();
  }

  // ── Evaluación de deriva por métrica ──────────────────────────────────

  function _desvPct(observado, referencia) {
    if (referencia == null || Math.abs(referencia) < 0.001) return 0;
    return +((observado - referencia) / Math.abs(referencia) * 100).toFixed(2);
  }

  /**
   * Evalúa la deriva en un conjunto de métricas y retorna un objeto con:
   *  - desvPct por métrica (firmado: + = aumentó, - = disminuyó)
   *  - derivaGlobal: escalar 0-1 (promedio ponderado de derivaciones sobre umbral)
   *  - enAlerta: array de métricas sobre su umbral individual
   *  - necesitaRecalibracion: bool (derivaGlobal > 0.3 = tres métricas sobre umbral)
   */
  function evaluar(claseDispositivo) {
    const ee = EE();
    if (!ee) return null;

    const ref = _calibracionReferencia || {};

    const evalMetrica = (nombre, valorRef) => {
      const est = ee.estadistica(nombre, claseDispositivo);
      if (!est) return { nombre, N: 0, deriva: 0, enUmbral: false };
      const desv = _desvPct(est.mediana, valorRef);
      const umbral = UMBRAL_DERIVA_PCT[nombre] || 30;
      return {
        nombre, N: est.N, mediana: est.mediana, referencia: valorRef,
        deriva: desv, tendencia: ee.tendencia(nombre, claseDispositivo),
        estabilidad: ee.estabilidad(nombre, claseDispositivo),
        enUmbral: Math.abs(desv) > umbral,
        CV: est.CV,
      };
    };

    const metricas = [
      evalMetrica('fp_rate', ref.fp_rate || 0.05),
      evalMetrica('rollback_rate', ref.rollback_rate || 0.1),
      evalMetrica('latencia', ref.latencia || K.UMBRAL.COOL_DOWN_ENTRE_INTERV_MS),
      evalMetrica('solape_post', ref.solape_post || 0),
      evalMetrica('detecciones_por_tick', ref.detecciones_por_tick || 1),
    ].filter((m) => m.N > 0);

    const enAlerta = metricas.filter((m) => m.enUmbral);
    const derivaGlobal = metricas.length
      ? +(metricas.reduce((sum, m) => sum + Math.min(1, Math.abs(m.deriva) / 100), 0) / metricas.length).toFixed(4)
      : 0;

    const resultado = {
      ts: Date.now(),
      claseDispositivo,
      metricas,
      enAlerta: enAlerta.map((m) => m.nombre),
      derivaGlobal,
      necesitaRecalibracion: enAlerta.length >= 2 || derivaGlobal > 0.3,
      descripcion: enAlerta.length === 0
        ? 'Calibración estable'
        : `Deriva detectada en: ${enAlerta.map((m) => m.nombre).join(', ')}`,
    };

    _pushHistorial(resultado);
    return resultado;
  }

  /**
   * Evalúa la deriva en todas las clases de dispositivo conocidas.
   */
  function evaluarTodos() {
    const ee = EE();
    if (!ee) return [];
    const clases = [...new Set(ee.listarMetricas().map((k) => k.split('::')[1] || 'global'))];
    return clases.map((c) => evaluar(c)).filter(Boolean);
  }

  /**
   * Actualiza la calibración de referencia (llamado por CalibrationEngine
   * cuando una nueva calibración es aceptada).
   */
  function actualizarReferencia(calibracion) {
    _calibracionReferencia = calibracion;
    try {
      localStorage.setItem(PREFIJO + 'referencia', JSON.stringify({ ts: Date.now(), calibracion }));
    } catch (e) {}
  }

  /**
   * Carga la referencia persistida (llamado al arranque).
   */
  function cargarReferencia() {
    try {
      const raw = localStorage.getItem(PREFIJO + 'referencia');
      if (raw) _calibracionReferencia = JSON.parse(raw).calibracion;
    } catch (e) {}
  }

  function obtenerHistorial() { return [..._historial]; }

  // Suscripción al Logger: acumula métricas de cada intervención ejecutada
  Bus.suscribir('intervencion.ejecutada', (ev) => {
    const ee = EE();
    if (!ee) return;
    const clase = window.AC_ProfileLearner?.claseActual() || 'global';
    ee.registrarIntervencion({
      corrección: ev.queCorrigio,
      duracion: ev.duracion || 0,
      exito: ev.exito === true,
      rollback: ev.rollback,
      clase,
    });
    // FP rate: una corrección con rollback = posible falso positivo
    if (ev.rollback?.ejecutado) {
      ee.observar('rollback_rate', 1, clase);
    } else {
      ee.observar('rollback_rate', 0, clase);
    }
    ee.observar('latencia', ev.duracion || 0, clase);
  });

  Bus.suscribir('anomalia.clasificada', () => {
    const clase = window.AC_ProfileLearner?.claseActual() || 'global';
    EE()?.observar('detecciones_por_tick', 1, clase);
  });

  cargarReferencia();

  return { evaluar, evaluarTodos, actualizarReferencia, obtenerHistorial };
})();
