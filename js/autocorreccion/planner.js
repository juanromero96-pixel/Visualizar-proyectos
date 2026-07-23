/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 6: Planner (Motor de Decisiones)
 * DTI §7 — Algoritmo de decisión, presupuestos, circuit breakers, oscilación
 *
 * Recibe anomalías clasificadas y decide: corregir / esperar / escalar.
 * TODA acción pasa por el Planner antes del Executor — jamás directamente.
 */
window.AC_Planner = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const U = K.UMBRAL;

  // ── Estado de presupuestos (DTI §7.2) ────────────────────────────────────

  // { 'C-01': { porSedeSesion: { 'posadas': n }, porMinuto: [...timestamps], porSesion: n } }
  const _presupuestos = {};

  // Historial de intervenciones por hash (para detección de oscilación §7.3)
  const _historialPorHash = new Map(); // hash → [{ts}]

  // Suspensiones por oscilación
  const _suspendidos = new Map(); // hash → ts_hasta_cuando

  // Cool-down global (§7.1 etapa 5)
  let _ultimaIntervencion = 0;

  // Cola de anomalías pendientes (por prioridad)
  const _cola = [];

  // ── Helpers de presupuesto ────────────────────────────────────────────────

  function _inicBudget(codigo) {
    if (!_presupuestos[codigo]) {
      _presupuestos[codigo] = { porSede: {}, minuteTs: [], sesion: 0 };
    }
  }

  function _presupuestoDisponible(codigo, sede) {
    const def = K.PRESUPUESTO[codigo] || K.PRESUPUESTO['_default'];
    _inicBudget(codigo);
    const b = _presupuestos[codigo];

    // Por sede/sesión
    if ((b.porSede[sede] || 0) >= def.porSedeSesion) return false;
    // Por minuto global (ventana deslizante de 60s)
    const ahora = Date.now();
    b.minuteTs = b.minuteTs.filter((t) => ahora - t < 60000);
    if (b.minuteTs.length >= def.porMinuto) return false;
    // Por sesión total
    if (b.sesion >= def.porSesion) return false;
    return true;
  }

  function _consumirPresupuesto(codigo, sede) {
    _inicBudget(codigo);
    const b = _presupuestos[codigo];
    b.porSede[sede] = (b.porSede[sede] || 0) + 1;
    b.minuteTs.push(Date.now());
    b.sesion++;
  }

  // ── Detección de oscilación (DTI §7.3) ────────────────────────────────────

  function _estaOscilando(hash) {
    if (_suspendidos.has(hash) && Date.now() < _suspendidos.get(hash)) return true;
    const lista = _historialPorHash.get(hash) || [];
    const ahora = Date.now();
    const recientes = lista.filter((ts) => ahora - ts < U.OSCILACION_VENTANA_MS);
    return recientes.length >= U.OSCILACION_UMBRAL;
  }

  function _registrarIntento(hash) {
    const lista = _historialPorHash.get(hash) || [];
    lista.push(Date.now());
    // Mantener solo la ventana relevante
    const corte = Date.now() - U.OSCILACION_VENTANA_MS;
    _historialPorHash.set(hash, lista.filter((ts) => ts > corte));
  }

  // ── Algoritmo de decisión (DTI §7.1) ─────────────────────────────────────

  function _decidir(anomalia) {
    const { diagnosticHash: hash, severidad, correcciones, categoria, contexto, causa } = anomalia;
    const sede = contexto?.sede || document.querySelector('.sede')?.dataset?.sede || 'desconocida';
    const nivelActual = K.NIVEL_AUTONOMIA;

    // Etapa 1 — Deduplicación (la cola ya la maneja, pero doble seguro)
    if (_cola.some((a) => a.diagnosticHash === hash)) return;

    // Etapa 2 — Consulta de matriz de correcciones
    const candidatas = (correcciones || []).filter((cod) => {
      const def = K.CORRECCIONES[cod];
      return def && def.nivelMin <= nivelActual; // solo las habilitadas para el nivel actual
    });

    if (!candidatas.length) {
      // Sin corrección ejecutable en este nivel: escalar
      return _escalar(hash, anomalia, `Sin corrección disponible para nivel ${nivelActual} o no autocorregible`);
    }

    // Etapa 3 — Presupuesto
    const elegida = candidatas.find((cod) => _presupuestoDisponible(cod, sede));
    if (!elegida) {
      return _escalar(hash, anomalia, 'Presupuesto saturado para todas las correcciones candidatas');
    }

    // Etapa 4 — Oscilación
    if (_estaOscilando(hash)) {
      _suspendidos.set(hash, Date.now() + U.OSCILACION_SUSPENSION_MS);
      return _escalar(hash, anomalia, `Oscilación detectada — corrección suspendida por ${U.OSCILACION_SUSPENSION_MS / 1000}s`);
    }

    // Etapa 5 — Cool-down entre intervenciones
    const ahora = Date.now();
    if (ahora - _ultimaIntervencion < U.COOL_DOWN_ENTRE_INTERV_MS) {
      // Reprogramar en el tiempo restante
      const espera = U.COOL_DOWN_ENTRE_INTERV_MS - (ahora - _ultimaIntervencion);
      setTimeout(() => _decidir(anomalia), espera);
      return;
    }

    // Decisión: ejecutar
    _registrarIntento(hash);
    _consumirPresupuesto(elegida, sede);
    _ultimaIntervencion = Date.now();

    Bus.publicar('intervencion.decidida', {
      corrección: elegida,
      anomalia,
      diagnosticHash: hash,
      sede,
      budgetRestante: (K.PRESUPUESTO[elegida] || K.PRESUPUESTO['_default']).porSesion
        - (_presupuestos[elegida]?.sesion || 0),
      timeout: K.CORRECCIONES[elegida]?.requiereDistribuir
        ? U.TIMEOUT_DISTRIBUIR_MS : U.TIMEOUT_CORRECCCION_MS,
      tsDecision: Date.now(),
      simulado: nivelActual <= 1, // en niveles 0-1, simular sin ejecutar realmente
    });
  }

  function _escalar(hash, anomalia, motivo) {
    Bus.publicar('escalacion.emitida', {
      categoria: anomalia.categoria,
      severidad: anomalia.severidad,
      diagnosticHash: hash,
      motivo,
      contexto: anomalia.contexto,
      causa: anomalia.causa,
    });
    window.AC_Logger?.registrarEscalacion({
      categoria: anomalia.categoria,
      severidad: anomalia.severidad,
      contexto: anomalia.contexto,
      diagnosticHash: hash,
      motivo,
    });
  }

  // ── Cola de prioridad (P0 siempre antes que P1, P1 antes que P2) ───────────

  function _encolar(anomalia) {
    _cola.push(anomalia);
    _cola.sort((a, b) => (a.severidad ?? 2) - (b.severidad ?? 2));
    _procesarCola();
  }

  function _procesarCola() {
    if (!_cola.length) return;
    const anomalia = _cola.shift();
    _decidir(anomalia);
  }

  // ── Suscripción al bus ────────────────────────────────────────────────────

  Bus.suscribir('anomalia.clasificada', _encolar);

  // Cuando un ciclo cierra con éxito, no hay más que hacer para ese hash
  Bus.suscribir('ciclo.cerrado', (ev) => {
    const idx = _cola.findIndex((a) => a.diagnosticHash === ev.diagnosticHash);
    if (idx >= 0) _cola.splice(idx, 1);
  });

  // API de consulta para el Panel
  function obtenerCola() { return [..._cola]; }
  function obtenerPresupuestos() { return JSON.parse(JSON.stringify(_presupuestos)); }
  function obtenerSuspendidos() {
    const ahora = Date.now();
    return Object.fromEntries([..._suspendidos.entries()].filter(([, ts]) => ts > ahora));
  }

  return { obtenerCola, obtenerPresupuestos, obtenerSuspendidos };
})();
