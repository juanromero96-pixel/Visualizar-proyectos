/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 3: Logger
 * DTI §7.4 (campos requeridos por intervención), §10 (registro y telemetría)
 *
 * Registra absolutamente todo: detecciones, diagnósticos, correcciones,
 * rollbacks, escalaciones. Memoria circular (200 entradas), persistencia
 * periódica en Almacen, resumen en beforeunload.
 */
window.AC_Logger = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const PREFIJO = K.PREFIJO_STORAGE;
  const MAX = K.UMBRAL.REGISTRO_MAX_ENTRADAS;

  const _registro = [];   // circular en memoria
  const _escalaciones = []; // solo escalaciones
  let _totalPorCodigo = {}; // { 'C-01': { total, exitos, fallos, escalaciones } }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _dispositivo() {
    const ua = navigator.userAgent;
    const mobile = !!window.esMobile?.();
    const vw = window.innerWidth, vh = window.innerHeight;
    return { mobile, vw, vh, ua: ua.slice(0, 80) };
  }

  function _sedeActiva() {
    return document.querySelector('.sede.activa')?.dataset?.sede
      || document.querySelector('.sede')?.dataset?.sede
      || 'desconocida';
  }

  function _push(entrada) {
    if (_registro.length >= MAX) _registro.shift();
    _registro.push(entrada);
  }

  function _acumularCodigo(codigo, exito) {
    if (!_totalPorCodigo[codigo]) {
      _totalPorCodigo[codigo] = { total: 0, exitos: 0, fallos: 0, escalaciones: 0 };
    }
    _totalPorCodigo[codigo].total++;
    if (exito === true)  _totalPorCodigo[codigo].exitos++;
    if (exito === false) _totalPorCodigo[codigo].fallos++;
    if (exito === 'escalacion') _totalPorCodigo[codigo].escalaciones++;
  }

  // ── API de registro (DTI §7.4) ─────────────────────────────────────────────

  function registrarDeteccion(senal) {
    _push({
      tipo: 'deteccion',
      ts: Date.now(),
      sede: _sedeActiva(),
      build: window.__BUILD__,
      version: K.VERSION,
      dispositivo: _dispositivo(),
      ...senal,
    });
  }

  function registrarIntervencion({
    que,       // descripción de qué ocurrió
    cuando,    // timestamp
    porQue,    // valor que superó umbral + regla aplicada
    queCorrigio, // código C-nn + función invocada
    resultado, // éxito / fallo / timeout
    duracion,  // ms
    exito,     // boolean
    rollback,  // { ejecutado, operacion, exitoRollback } | null
    diagnosticHash,
  }) {
    const entrada = {
      tipo: 'intervencion',
      ts: Date.now(),
      que,
      cuando: cuando || Date.now(),
      porQue,
      queCorrigio,
      resultado,
      duracion,
      exito,
      rollback: rollback || null,
      version: K.VERSION,
      build: window.__BUILD__,
      dispositivo: _dispositivo(),
      sede: _sedeActiva(),
      lectorAbierto: !!document.querySelector('.lem--abierta'),
      cicloPausado: !window.Rotacion?.estadoCiclo?.(document.querySelector('.sede'))?.vuelta,
      pestañaVisible: !document.hidden,
      diagnosticHash,
    };
    _push(entrada);
    _acumularCodigo(queCorrigio, exito);
  }

  function registrarEscalacion({ categoria, severidad, contexto, diagnosticHash, motivo }) {
    const entrada = {
      tipo: 'escalacion',
      ts: Date.now(),
      categoria,
      severidad,
      contexto,
      diagnosticHash,
      motivo,
      build: window.__BUILD__,
      version: K.VERSION,
      dispositivo: _dispositivo(),
      reconocido: false,
    };
    _push(entrada);
    _escalaciones.push(entrada);
    _acumularCodigo(diagnosticHash, 'escalacion');
  }

  // ── Persistencia periódica (DTI §10.2) ─────────────────────────────────────

  function _persistir() {
    try {
      const resumen = {
        schemaVersion: 1,
        ts: Date.now(),
        build: window.__BUILD__,
        version: K.VERSION,
        contadores: _totalPorCodigo,
        ultimas50: _registro.slice(-50),
        escalacionesPendientes: _escalaciones.filter((e) => !e.reconocido),
      };
      const clave = PREFIJO + 'registro_' + new Date().toISOString().slice(0, 10);
      localStorage.setItem(clave, JSON.stringify(resumen));
    } catch (e) { /* cuota superada — C-51 lo manejará */ }
  }

  // Rotación de claves antiguas (> 30 días)
  function _rotarClaves() {
    try {
      const limite = Date.now() - 30 * 86400 * 1000;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(PREFIJO + 'registro_')) continue;
        const fecha = k.replace(PREFIJO + 'registro_', '');
        if (new Date(fecha).getTime() < limite) localStorage.removeItem(k);
      }
    } catch (e) {}
  }

  // ── API de consulta (usada por el Panel) ─────────────────────────────────

  function obtenerRegistro() { return [..._registro]; }
  function obtenerEscalaciones() { return [..._escalaciones]; }
  function obtenerContadores() { return { ..._totalPorCodigo }; }

  function reconocerEscalacion(idx) {
    if (_escalaciones[idx]) _escalaciones[idx].reconocido = true;
  }

  function tasaExito() {
    let total = 0, exitos = 0;
    Object.values(_totalPorCodigo).forEach(({ total: t, exitos: e }) => {
      total += t; exitos += e;
    });
    return total ? Math.round((exitos / total) * 100) : 100;
  }

  // ── Suscripción al bus ('*' = todos los eventos) ──────────────────────────

  Bus.suscribir('*', (evento) => {
    // El logger observa todo el bus en modo pasivo — no actúa, solo registra.
    if (['intervencion.ejecutada', 'escalacion.emitida', 'ciclo.cerrado'].includes(evento.tipo)) {
      // Ya procesados por registrarIntervencion/registrarEscalacion desde el Executor/Planner.
      return;
    }
    if (evento.tipo === 'senal.observada') {
      registrarDeteccion({ señalTipo: evento.señalTipo, valor: evento.valor, contexto: evento.contexto });
    }
  });

  // ── Ciclo de persistencia periódica ──────────────────────────────────────

  setInterval(_persistir, 60000);
  window.addEventListener('beforeunload', _persistir, { passive: true });
  _rotarClaves();

  return {
    registrarDeteccion,
    registrarIntervencion,
    registrarEscalacion,
    obtenerRegistro,
    obtenerEscalaciones,
    obtenerContadores,
    reconocerEscalacion,
    tasaExito,
    forzarPersistencia: _persistir,
  };
})();
