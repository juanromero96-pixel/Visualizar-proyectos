/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 1: Bus de Eventos Interno
 * DTI §3.2 — Contratos entre componentes
 *
 * Desacopla los cinco componentes (Monitor, Analyzer, Planner, Executor, Logger)
 * con un bus asíncrono, tipado y no-bloqueante. Ningún componente referencia
 * directamente a otro: solo publica y se suscribe a tipos de evento.
 *
 * Tipos canónicos definidos en DTI §3.2:
 *   senal.observada          Monitor → Analyzer
 *   anomalia.clasificada     Analyzer → Planner
 *   intervencion.decidida    Planner → Executor
 *   intervencion.ejecutada   Executor → Analyzer, Logger
 *   ciclo.cerrado            Analyzer → Logger, Planner
 *   escalacion.emitida       Planner → Logger, canal externo
 */
window.AC_Bus = (() => {
  'use strict';

  const _suscriptores = new Map(); // tipo → [fn, ...]
  let _secuencia = 0;

  /**
   * Publica un evento en el bus. La entrega es asíncrona (queueMicrotask)
   * para que ningún publicador quede bloqueado por la lentitud de un suscriptor.
   * La copia defensiva del payload evita que un suscriptor mute el objeto
   * original y afecte a los siguientes.
   */
  function publicar(tipo, payload) {
    const evento = Object.freeze({
      id: ++_secuencia,
      tipo,
      ts: Date.now(),
      ...payload,
    });
    const fns = _suscriptores.get(tipo) || [];
    const wildFns = _suscriptores.get('*') || [];
    const todos = [...fns, ...wildFns];
    if (!todos.length) return;
    queueMicrotask(() => {
      todos.forEach((fn) => {
        try { fn(evento); }
        catch (e) { console.error('[AC_Bus] Error en suscriptor de "' + tipo + '":', e); }
      });
    });
  }

  /**
   * Suscribe una función a un tipo de evento. Devuelve una función de
   * desuscripción para facilitar la gestión del ciclo de vida.
   * Tipo '*' = recibe todos los eventos (para el Logger).
   */
  function suscribir(tipo, fn) {
    if (!_suscriptores.has(tipo)) _suscriptores.set(tipo, []);
    _suscriptores.get(tipo).push(fn);
    return () => {
      const lista = _suscriptores.get(tipo) || [];
      const idx = lista.indexOf(fn);
      if (idx >= 0) lista.splice(idx, 1);
    };
  }

  return { publicar, suscribir };
})();
