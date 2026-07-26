/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Evidence Engine (Nivel 4)
 * DTI §12 — Motor de aprendizaje estadístico determinista.
 *
 * Acumula observaciones por métrica × clase-de-dispositivo.
 * Nunca toma decisiones con menos de MIN_OBSERVACIONES muestras.
 * Calcula: media, mediana, P5–P99, σ, IC95%, CV, tendencia, outliers.
 *
 * Sin IA. Sin heurísticas arbitrarias. Solo evidencia medida.
 */
window.AC_EvidenceEngine = (() => {
  'use strict';

  const K = window.AC_K;
  const PREFIJO = K.PREFIJO_STORAGE + 'evidence_';
  const MIN_OBS = 10;        // mínimo de observaciones para derivar un parámetro
  const MAX_OBS = 500;       // techo de la ventana circular por métrica
  const IC95_Z = 1.96;       // z para IC 95%

  // ── Almacén en memoria (espejo del localStorage) ───────────────────────
  // estructura: { metrica_clase: [valor, valor, ...] }
  const _banco = {};

  function _clave(metrica, clase) {
    return `${metrica}::${clase || 'global'}`;
  }

  function _cargar(clave) {
    if (_banco[clave]) return _banco[clave];
    try {
      const raw = localStorage.getItem(PREFIJO + clave);
      _banco[clave] = raw ? JSON.parse(raw) : [];
    } catch (e) { _banco[clave] = []; }
    return _banco[clave];
  }

  function _guardar(clave) {
    try { localStorage.setItem(PREFIJO + clave, JSON.stringify(_banco[clave])); }
    catch (e) { /* cuota: silencioso — el banco en memoria sigue operativo */ }
  }

  // ── API de registro ────────────────────────────────────────────────────

  /**
   * Registra una observación. clase = perfil de dispositivo (global si omitido).
   * Retorna el número de observaciones acumuladas para esa métrica/clase.
   */
  function observar(metrica, valor, clase) {
    if (typeof valor !== 'number' || !isFinite(valor)) return 0;
    const k = _clave(metrica, clase);
    const arr = _cargar(k);
    arr.push(valor);
    if (arr.length > MAX_OBS) arr.splice(0, arr.length - MAX_OBS);
    _guardar(k);
    return arr.length;
  }

  /**
   * Registra el resultado de una intervención (latencia, éxito, rollback).
   * Automatiza las métricas más comunes del DTI §7.4.
   */
  function registrarIntervencion({ corrección, duracion, exito, rollback, clase }) {
    observar(`intervencion_${corrección}_duracion`, duracion, clase);
    observar(`intervencion_${corrección}_exito`, exito ? 1 : 0, clase);
    observar(`intervencion_rollback`, rollback?.ejecutado ? 1 : 0, clase);
    observar(`intervencion_latencia`, duracion, clase);
  }

  // ── Estadística completa ────────────────────────────────────────────────

  function pct(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  }

  /**
   * Calcula la batería estadística completa para una métrica/clase.
   * Retorna null si no hay datos suficientes (< MIN_OBS).
   */
  function estadistica(metrica, clase) {
    const arr = _cargar(_clave(metrica, clase));
    if (arr.length < MIN_OBS) return null;
    const s = [...arr].sort((a, b) => a - b);
    const N = s.length;
    const media = s.reduce((a, b) => a + b, 0) / N;
    const varianza = s.reduce((a, b) => a + (b - media) ** 2, 0) / N;
    const sigma = Math.sqrt(varianza);
    const error = sigma / Math.sqrt(N);
    return {
      N,
      media: +media.toFixed(4),
      mediana: +pct(s, 50).toFixed(4),
      sigma: +sigma.toFixed(4),
      CV: +(sigma / (media || 1) * 100).toFixed(2),
      P5:  +pct(s, 5).toFixed(4),  P25: +pct(s, 25).toFixed(4),
      P75: +pct(s, 75).toFixed(4), P95: +pct(s, 95).toFixed(4),
      P99: +pct(s, 99).toFixed(4),
      min: +s[0].toFixed(4), max: +s[N-1].toFixed(4),
      IC95: { inf: +(media - IC95_Z * error).toFixed(4), sup: +(media + IC95_Z * error).toFixed(4) },
      outliers: s.filter((x) => Math.abs(x - media) > 3 * sigma).length,
    };
  }

  /**
   * Tendencia: ¿los valores recientes (última mitad) son mayores o menores
   * que los antiguos (primera mitad)? Retorna un escalar firmado.
   * > 0 = tendencia ascendente, < 0 = descendente, ~0 = estable.
   */
  function tendencia(metrica, clase) {
    const arr = _cargar(_clave(metrica, clase));
    if (arr.length < MIN_OBS * 2) return 0;
    const mid = Math.floor(arr.length / 2);
    const ant = arr.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const rec = arr.slice(mid).reduce((a, b) => a + b, 0) / (arr.length - mid);
    return +((rec - ant) / (Math.abs(ant) || 1) * 100).toFixed(2); // % de cambio
  }

  /**
   * Estabilidad: inverso normalizado del CV. 100 = perfectamente estable, 0 = caótico.
   */
  function estabilidad(metrica, clase) {
    const est = estadistica(metrica, clase);
    if (!est) return null;
    return +Math.max(0, 100 - est.CV).toFixed(1);
  }

  /**
   * ¿Hay deriva significativa? Compara el IC95% reciente vs el valor de referencia.
   * Retorna { deriva: bool, magnitudPct: number }.
   */
  function detectarDeriva(metrica, clase, valorReferencia) {
    const est = estadistica(metrica, clase);
    if (!est || valorReferencia == null) return { deriva: false, magnitudPct: 0 };
    const dentro = valorReferencia >= est.IC95.inf && valorReferencia <= est.IC95.sup;
    const magnitudPct = +Math.abs((est.mediana - valorReferencia) / (Math.abs(valorReferencia) || 1) * 100).toFixed(2);
    return { deriva: !dentro, magnitudPct };
  }

  // ── Persistencia masiva y diagnóstico ─────────────────────────────────

  function vaciarMetrica(metrica, clase) {
    const k = _clave(metrica, clase);
    _banco[k] = [];
    try { localStorage.removeItem(PREFIJO + k); } catch (e) {}
  }

  function listarMetricas() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIJO)) keys.push(k.replace(PREFIJO, ''));
      }
    } catch (e) {}
    return keys;
  }

  function resumen() {
    const metricas = listarMetricas();
    return metricas.map((k) => {
      const [metrica, clase] = k.split('::');
      const est = estadistica(metrica, clase);
      return { metrica, clase: clase || 'global', N: est?.N || 0, mediana: est?.mediana, CV: est?.CV };
    });
  }

  return { observar, registrarIntervencion, estadistica, tendencia, estabilidad, detectarDeriva, vaciarMetrica, listarMetricas, resumen, MIN_OBS };
})();
