/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 8: Panel de Diagnóstico
 * DTI §11 — Interfaz interna para el operador editorial
 *
 * Acceso: ?panel=1 (lectura) | ?panel=op (operador) | ?panel=dev (desarrollo)
 * No consume recursos cuando no está visible.
 * No modifica estado excepto por controles explícitos de "Modo operador".
 */
window.AC_Panel = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const SEV_LABEL = { 0: 'P0', 1: 'P1', 2: 'P2' };
  const SEV_COLOR = { 0: '#e03c3c', 1: '#e09a3c', 2: '#6b8fad' };

  // ── Detección del modo de acceso (DTI §11.3) ──────────────────────────────

  const params = new URLSearchParams(location.search);
  const modoPanel = params.get('panel'); // '1' | 'op' | 'dev' | null
  if (!modoPanel) return { iniciar() {} }; // Sin parámetro: no montar

  const MODO = modoPanel === 'dev' ? 'dev' : modoPanel === 'op' ? 'op' : 'lectura';

  // ── Montaje del panel ─────────────────────────────────────────────────────

  let _panelEl = null;
  let _rafId = null;
  let _visible = false;

  function _crear() {
    const el = document.createElement('div');
    el.id = 'ac-panel';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Panel de diagnóstico del sistema de autocorrección');
    el.innerHTML = `
      <div id="ac-panel-header">
        <span id="ac-panel-titulo">⚙️ Autocorrección v${K.VERSION} — Nivel ${K.NIVEL_AUTONOMIA}</span>
        <button id="ac-panel-cerrar" aria-label="Cerrar panel">✕</button>
      </div>
      <div id="ac-panel-cuerpo">
        <section id="ac-sec-estado"><h3>Estado general</h3><div id="ac-estado-contenido"></div></section>
        <section id="ac-sec-ultimas"><h3>Últimas intervenciones</h3><table id="ac-tabla-ultimas"><thead><tr><th>Hora</th><th>Código</th><th>Resultado</th><th>Sede</th></tr></thead><tbody></tbody></table></section>
        <section id="ac-sec-contadores"><h3>Contadores por corrección</h3><div id="ac-contadores-contenido"></div></section>
        <section id="ac-sec-escalaciones"><h3>Problemas escalados</h3><div id="ac-escalaciones-contenido"></div></section>
        ${MODO !== 'lectura' ? `
        <section id="ac-sec-controles">
          <h3>Control operativo</h3>
          <button id="ac-btn-pausar">Pausar subsistema</button>
          <button id="ac-btn-validar">Forzar validación</button>
          <button id="ac-btn-exportar">Exportar registro</button>
          <button id="ac-btn-resetcb">Resetear circuit breakers</button>
        </section>` : ''}
      </div>
    `;
    document.body.appendChild(el);

    el.querySelector('#ac-panel-cerrar').addEventListener('click', () => {
      el.style.display = 'none';
      _visible = false;
      if (_rafId) cancelAnimationFrame(_rafId);
    });

    if (MODO !== 'lectura') {
      const btnPausar = el.querySelector('#ac-btn-pausar');
      const btnValidar = el.querySelector('#ac-btn-validar');
      const btnExportar = el.querySelector('#ac-btn-exportar');
      const btnReset = el.querySelector('#ac-btn-resetcb');

      if (btnPausar) btnPausar.addEventListener('click', () => {
        const activo = window.AC_Monitor?.estaActivo?.();
        if (activo) { window.AC_Monitor.detener(); btnPausar.textContent = 'Reanudar subsistema'; }
        else { window.AC_Monitor.iniciar(); btnPausar.textContent = 'Pausar subsistema'; }
      });

      if (btnValidar) btnValidar.addEventListener('click', () => {
        // Fuerza un tick inmediato del monitor
        Bus.publicar('panel.validacion.forzada', { ts: Date.now() });
      });

      if (btnExportar) btnExportar.addEventListener('click', () => {
        const data = JSON.stringify({
          registro: window.AC_Logger?.obtenerRegistro(),
          escalaciones: window.AC_Logger?.obtenerEscalaciones(),
          contadores: window.AC_Logger?.obtenerContadores(),
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `ac-registro-${Date.now()}.json`; a.click();
      });

      if (btnReset) btnReset.addEventListener('click', () => {
        // No se resetean circuit breakers internos del Planner directamente
        // (encapsulados). Solo se registra la solicitud.
        Bus.publicar('panel.reset.circuitbreakers', { ts: Date.now() });
      });
    }

    return el;
  }

  // ── Renderizado reactivo (solo cuando el panel está visible) ──────────────

  function _renderizar() {
    if (!_visible || !_panelEl) return;

    const logger = window.AC_Logger;
    const planner = window.AC_Planner;
    if (!logger) return;

    // Estado general
    const estado = _panelEl.querySelector('#ac-estado-contenido');
    if (estado) {
      const tasa = logger.tasaExito();
      const monitorActivo = window.AC_Monitor?.estaActivo?.() ?? false;
      const cola = planner?.obtenerCola?.() || [];
      const suspendidos = planner?.obtenerSuspendidos?.() || {};
      estado.innerHTML = `
        <p>Monitor: <strong>${monitorActivo ? '🟢 activo' : '🔴 detenido'}</strong></p>
        <p>Nivel de autonomía: <strong>${K.NIVEL_AUTONOMIA}</strong>
           (${K.NIVEL_AUTONOMIA === 0 ? 'Solo detectar' : K.NIVEL_AUTONOMIA <= 1 ? 'Detectar + sugerir' : K.NIVEL_AUTONOMIA <= 2 ? 'Corregir automáticamente' : K.NIVEL_AUTONOMIA <= 3 ? 'Corregir + validar' : 'Autónomo completo'})</p>
        <p>Tasa de éxito de correcciones: <strong>${tasa}%</strong></p>
        <p>En cola: <strong>${cola.length}</strong> anomalías</p>
        <p>Correcciones suspendidas: <strong>${Object.keys(suspendidos).length}</strong></p>
        <p>Build del Motor: <strong>${window.__BUILD__ || 'desconocido'}</strong></p>
      `;
    }

    // Últimas intervenciones (tabla §11.1)
    const registro = logger.obtenerRegistro().slice(-20).reverse();
    const tbody = _panelEl.querySelector('#ac-tabla-ultimas tbody');
    if (tbody) {
      tbody.innerHTML = registro
        .filter((e) => e.tipo === 'intervencion')
        .slice(0, 20)
        .map((e) => {
          const hora = new Date(e.ts).toLocaleTimeString('es-AR');
          const color = e.exito === true ? '#4caf50' : e.exito === null ? '#888' : '#e53935';
          return `<tr>
            <td>${hora}</td>
            <td><code>${e.queCorrigio || '—'}</code></td>
            <td style="color:${color}">${e.exito === true ? '✅' : e.exito === null ? '⏸️ sim' : '❌'} ${e.resultado || ''}</td>
            <td>${e.sede || '—'}</td>
          </tr>`;
        }).join('');
    }

    // Contadores
    const contadores = logger.obtenerContadores();
    const contEl = _panelEl.querySelector('#ac-contadores-contenido');
    if (contEl) {
      const filas = Object.entries(contadores).map(([cod, { total, exitos, fallos, escalaciones }]) =>
        `<tr><td><code>${cod}</code></td><td>${total}</td><td style="color:#4caf50">${exitos}</td><td style="color:#e53935">${fallos}</td><td style="color:#e09a3c">${escalaciones}</td></tr>`
      ).join('');
      contEl.innerHTML = filas ? `<table><thead><tr><th>Código</th><th>Total</th><th>Éxitos</th><th>Fallos</th><th>Escalaciones</th></tr></thead><tbody>${filas}</tbody></table>` : '<p>Sin intervenciones aún.</p>';
    }

    // Escalaciones pendientes
    const escalaciones = logger.obtenerEscalaciones().filter((e) => !e.reconocido);
    const escEl = _panelEl.querySelector('#ac-escalaciones-contenido');
    if (escEl) {
      escalaciones.length
        ? (escEl.innerHTML = escalaciones.map((e, i) => `
          <div style="border-left:3px solid ${SEV_COLOR[e.severidad] || '#888'};padding:6px;margin:4px 0">
            <strong style="color:${SEV_COLOR[e.severidad]}">${SEV_LABEL[e.severidad] || 'P?'}</strong>
            [${new Date(e.ts).toLocaleTimeString('es-AR')}]
            ${e.motivo || e.causa || 'Sin descripción'}
            ${MODO !== 'lectura' ? `<button onclick="window.AC_Logger.reconocerEscalacion(${i})" style="margin-left:8px;font-size:10px">Reconocer</button>` : ''}
          </div>`).join(''))
        : (escEl.innerHTML = '<p>Sin escalaciones pendientes. ✅</p>');
    }

    // Reprogramar el próximo frame si el panel sigue abierto
    _rafId = requestAnimationFrame(() => setTimeout(_renderizar, 2000));
  }

  // ── API pública ──────────────────────────────────────────────────────────

  function iniciar() {
    _panelEl = _crear();
    _visible = true;
    _renderizar();
  }

  return { iniciar };
})();
