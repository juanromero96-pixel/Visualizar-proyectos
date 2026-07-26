/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Profile Learner (Nivel 4)
 * DTI §12 — Aprendizaje por perfil de dispositivo.
 *
 * Clasifica el dispositivo actual en una de 8 clases y aplica
 * configuración óptima por clase cuando hay evidencia suficiente.
 * Sin inferencia: solo evidencia acumulada por clase.
 */
window.AC_ProfileLearner = (() => {
  'use strict';

  const K = window.AC_K;
  const PREFIJO = K.PREFIJO_STORAGE + 'profile_';

  // ── Clasificación de dispositivos (8 clases, DTI §12) ─────────────────
  // Basada en los 17 perfiles del laboratorio, agrupados por comportamiento.

  const CLASES = {
    pixel:       { patron: /pixel/i,     esMobile: true, anchoMin: 380, anchoMax: 420 },
    galaxy:      { patron: /samsung/i,   esMobile: true },
    motorola:    { patron: /motorola|moto/i, esMobile: true },
    xiaomi:      { patron: /xiaomi|redmi|poco/i, esMobile: true },
    iphone:      { patron: /iphone/i,    esMobile: true, motorNavegador: 'webkit' },
    ipad:        { patron: /ipad/i,      esMobile: false, motorNavegador: 'webkit' },
    desktop:     { patron: null,         esMobile: false, anchoMin: 1200 },
    ultrawide:   { patron: null,         esMobile: false, anchoMin: 2560 },
  };

  // ── Clasificación del dispositivo actual ──────────────────────────────

  function clasificar() {
    const ua = navigator.userAgent || '';
    const ancho = window.innerWidth || 0;
    const mobile = !!window.esMobile?.();

    // Ultrawide primero (subset de desktop, debe ir antes)
    if (!mobile && ancho >= 2560) return 'ultrawide';
    // iPad: tablet WebKit con touchscreen
    if (/ipad/i.test(ua)) return 'ipad';
    // iPhone
    if (/iphone/i.test(ua)) return 'iphone';
    // Android — por fabricante
    if (/pixel/i.test(ua) && mobile) return 'pixel';
    if (/samsung/i.test(ua) && mobile) return 'galaxy';
    if (/motorola|moto/i.test(ua) && mobile) return 'motorola';
    if (/xiaomi|redmi|poco/i.test(ua) && mobile) return 'xiaomi';
    // Desktop genérico (incluyendo tablets Android tratadas como desktop)
    if (!mobile) return 'desktop';
    // Mobile no identificado → clase galaxy como fallback (la más común)
    return 'galaxy';
  }

  let _claseActual = null;

  function claseActual() {
    if (!_claseActual) _claseActual = clasificar();
    return _claseActual;
  }

  // ── Calibración por perfil ─────────────────────────────────────────────

  const PREFIJO_CAL = PREFIJO + 'calibracion_';

  /**
   * Carga la calibración específica para la clase del dispositivo actual.
   * Si no existe, retorna null (usará la global).
   */
  function cargarCalibracionClase(clase) {
    try {
      const raw = localStorage.getItem(PREFIJO_CAL + (clase || claseActual()));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /**
   * Guarda una calibración para una clase específica.
   */
  function guardarCalibracionClase(clase, calibracion) {
    try {
      localStorage.setItem(PREFIJO_CAL + clase, JSON.stringify({ ts: Date.now(), calibracion }));
    } catch (e) {}
  }

  /**
   * Retorna los overrides de configuración para el dispositivo actual.
   * Estos overrides tienen precedencia sobre la calibración global,
   * pero solo cuando hay evidencia suficiente (≥ MIN_OBS por parámetro).
   */
  function obtenerOverrides() {
    const clase = claseActual();
    const cal = cargarCalibracionClase(clase);
    if (!cal) return {};
    const ee = window.AC_EvidenceEngine;
    if (!ee) return cal.calibracion || {};
    // Solo aplicar overrides con evidencia suficiente
    const overrides = {};
    Object.entries(cal.calibracion || {}).forEach(([param, valor]) => {
      const est = ee.estadistica(`param_${param}`, clase);
      if (est && est.N >= ee.MIN_OBS) overrides[param] = valor;
    });
    return overrides;
  }

  /**
   * Retorna el perfil completo del dispositivo actual con las métricas
   * que el CalibrationEngine necesita para proponer ajustes.
   */
  function perfilActual() {
    return {
      clase: claseActual(),
      anchoCSS: window.innerWidth,
      altoCSS: window.innerHeight,
      DPR: window.devicePixelRatio || 1,
      esMobile: !!window.esMobile?.(),
      userAgent: navigator.userAgent.slice(0, 80),
      calibracionClase: cargarCalibracionClase(claseActual()),
      overrides: obtenerOverrides(),
    };
  }

  return { claseActual, clasificar, cargarCalibracionClase, guardarCalibracionClase, obtenerOverrides, perfilActual };
})();
