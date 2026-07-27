/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Bootstrap (index.js)
 * DTI §3.3 (no-intrusión), §14.2 (motor no depende del subsistema)
 *
 * Este archivo se carga al final del HTML, después de todos los módulos
 * del Motor Editorial. Si falla de cualquier manera, el Motor Editorial
 * sigue funcionando exactamente igual — el subsistema es aditivo, no
 * una dependencia del motor.
 */
(function iniciarSubsistema() {
  'use strict';

  // Guard: si algún módulo crítico no cargó, no arrancar (no lanzar excepción global)
  const modulos = ['AC_K', 'AC_Bus', 'AC_Logger', 'AC_Monitor', 'AC_Analyzer', 'AC_Planner', 'AC_Executor', 'AC_EvidenceEngine', 'AC_DriftDetector', 'AC_ProfileLearner', 'AC_CalibrationEngine'];
  const faltantes = modulos.filter((m) => !window[m]);
  if (faltantes.length) {
    console.warn('[Autocorrección] No se puede iniciar — módulos faltantes:', faltantes.join(', '));
    return;
  }

  // Esperar a que el Motor Editorial haya completado su propio arranque
  // (DOMContentLoaded + fonts.ready + Rotacion.iniciar) antes de montar
  // el Monitor. Usamos un polling sobre window.__BUILD__ que app.js
  // declara al inicio de iniciarSitio().
  let _intentos = 0;
  const _esperar = setInterval(() => {
    _intentos++;
    if (window.__BUILD__ || _intentos > 30) {
      clearInterval(_esperar);
      _arrancar();
    }
  }, 200);

  function _arrancar() {
    try {
      // Iniciar el Monitor (activa todos los detectores)
      window.AC_Monitor.iniciar();

      // Registrar en el Logger que el subsistema arrancó
      window.AC_Logger.registrarDeteccion({
        señalTipo: 'subsistema.arranque',
        valor: {
          nivel: window.AC_K.NIVEL_AUTONOMIA,
          build: window.__BUILD__,
          mobile: !!window.esMobile?.(),
        },
        hash: 'arranque',
      });

      // Montar el panel si corresponde
      if (new URLSearchParams(location.search).get('panel')) {
        window.AC_Panel?.iniciar();

      // Nivel 4: inicializar el stack de aprendizaje
      // ProfileLearner detecta la clase del dispositivo al arranque
      const claseDispositivo = window.AC_ProfileLearner?.claseActual() || 'global';
      // DriftDetector usa la calibración de referencia persistida
      window.AC_DriftDetector?.cargarReferencia?.();
      // Publicar el perfil actual al bus para que los módulos lo usen
      BUS?.publicar('perfil.detectado', { clase: claseDispositivo, perfil: window.AC_ProfileLearner?.perfilActual() });
      }

      // Exponer una API de control minimal para debugging en consola
      window.__AC__ = {
        nivel: () => window.AC_K.NIVEL_AUTONOMIA,
        registro: () => window.AC_Logger.obtenerRegistro(),
        escalaciones: () => window.AC_Logger.obtenerEscalaciones(),
        contadores: () => window.AC_Logger.obtenerContadores(),
        cola: () => window.AC_Planner.obtenerCola(),
        detener: () => window.AC_Monitor.detener(),
        iniciar: () => window.AC_Monitor.iniciar(),
        // Nivel 4
        perfil: () => window.AC_ProfileLearner?.perfilActual(),
        deriva: () => window.AC_DriftDetector?.evaluarTodos(),
        evidencia: () => window.AC_EvidenceEngine?.resumen(),
        recalibrar: (clase) => window.AC_CalibrationEngine?.recalibrar(clase || window.AC_ProfileLearner?.claseActual()),
        historialCalibraciones: () => window.AC_CalibrationEngine?.leerHistorial(),
        // LAE Mobile — Plan Técnico de Aplicación
        lae: {
          adaptar:     (sedeSelector) => window.AC_LAE_Mobile?.adaptar(sedeSelector || document.querySelector('.sede')),
          medir:       (sedeEl) => window.AC_LAE_Mobile?.medir(sedeEl || document.querySelector('.sede')),
          diagnosticar:(sedeEl) => {
            const r = window.AC_LAE_Mobile?.medir(sedeEl || document.querySelector('.sede'));
            return r ? window.AC_LAE_Mobile?.diagnosticar(r) : null;
          },
          capacidad:   () => {
            const sede = document.querySelector('.sede');
            return window.AC_LAE_Mobile?.medir(sede);
          },
        },
      };

      console.info(
        '%c[Autocorrección] Subsistema iniciado',
        'color:#00a3e0;font-weight:bold',
        `v${window.AC_K.VERSION} | nivel ${window.AC_K.NIVEL_AUTONOMIA} | motor ${window.__BUILD__}`
      );
    } catch (e) {
      // Si el arranque falla, el Motor Editorial no se ve afectado
      console.error('[Autocorrección] Error durante el arranque (Motor Editorial no afectado):', e);
    }
  }
})();
