/**
 * middleware/errores.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DTC §16.4 regla de seguridad: "los mensajes de error no revelan estructura
 * interna, rutas del sistema ni existencia de recursos a usuarios sin
 * permiso. El detalle técnico va al log, no a la respuesta."
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const CODIGOS_CONOCIDOS = Object.freeze({
  TRANSICION_INVALIDA: 409,
  COMENTARIO_REQUERIDO: 400,
  VALIDACION_FALLIDA: 422,
  CAMPO_NO_PERMITIDO: 400,
  JUSTIFICACION_REQUERIDA: 400,
  BLOQUEADO_TEMPORAL: 429,
  BLOQUEO_ACTIVO: 409,
});

function manejadorDeErrores(req, res, next) { // eslint-disable-line no-unused-vars
  return (err, req2, res2, next2) => { // patrón de 4 args, Express lo requiere
    const codigoHTTP = CODIGOS_CONOCIDOS[err.codigo] || 500;
    // El detalle completo (incluyendo pila) va al log del proceso, nunca a la respuesta.
    console.error(`[error] ${req2.method} ${req2.path} →`, err.stack || err.message);

    const cuerpo = { error: err.codigo || 'ERROR_INTERNO', mensaje: err.message || 'Error inesperado' };
    if (err.detalle) cuerpo.detalle = err.detalle; // detalle de validación, ya pensado para el cliente
    res2.status(codigoHTTP).json(cuerpo);
  };
}

/** Envuelve un controlador async para que sus rechazos lleguen al manejador de errores. */
function asyncManejado(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { manejadorDeErrores: manejadorDeErrores(), asyncManejado };
