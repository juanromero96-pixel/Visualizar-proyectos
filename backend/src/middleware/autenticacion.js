/**
 * middleware/autenticacion.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Cookie firmada, HttpOnly, Secure, SameSite=Strict (DTI §7.4, DTC §2 —
 * corrección directa del hallazgo H-01 de la auditoría de seguridad: la
 * verificación pasa a ocurrir en servidor, no en sessionStorage falsificable).
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const NOMBRE_COOKIE = 'compendio_sesion';

function opcionesCookie(config) {
  return {
    httpOnly: true,
    secure: config.entorno === 'produccion',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas, igual a DURACION_ABSOLUTA_MS de auth.servicio.js
    signed: true,
  };
}

function establecerCookie(res, token, config) {
  res.cookie(NOMBRE_COOKIE, token, opcionesCookie(config));
}

function limpiarCookie(res, config) {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
}

/** Middleware: exige sesión válida. Cuelga `req.sesion` si es correcta. */
function requiereSesion(authServicio) {
  return (req, res, next) => {
    const token = req.signedCookies?.[NOMBRE_COOKIE];
    if (!token) return res.status(401).json({ error: 'NO_AUTENTICADO', mensaje: 'Sesión requerida' });
    const sesion = authServicio.validarSesion(token);
    if (!sesion) return res.status(401).json({ error: 'SESION_EXPIRADA', mensaje: 'La sesión expiró o no es válida' });
    req.sesion = sesion;
    req.tokenSesion = token;
    next();
  };
}

/** Middleware: si hay sesión la adjunta, pero no la exige (para rutas públicas con comportamiento distinto si hay usuario). */
function sesionOpcional(authServicio) {
  return (req, res, next) => {
    const token = req.signedCookies?.[NOMBRE_COOKIE];
    if (token) req.sesion = authServicio.validarSesion(token);
    next();
  };
}

module.exports = { NOMBRE_COOKIE, establecerCookie, limpiarCookie, requiereSesion, sesionOpcional };
