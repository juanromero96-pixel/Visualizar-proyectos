'use strict';

const { asyncManejado } = require('../middleware/errores');
const { establecerCookie, limpiarCookie } = require('../middleware/autenticacion');

module.exports = function crearAuthControlador({ authServicio, auditoriaRepo, config }) {
  const login = asyncManejado(async (req, res) => {
    const { correo, clave } = req.body || {};
    if (!correo || !clave) return res.status(400).json({ error: 'DATOS_INCOMPLETOS', mensaje: 'correo y clave son obligatorios' });

    const resultado = await authServicio.iniciarSesion({ correo, clave, ip: req.ip });
    if (!resultado) {
      await auditoriaRepo.registrar({
        correo, ip: req.ip, operacion: 'auth:login', resultado: 'fallo:credenciales_invalidas', origen: 'api',
      });
      return res.status(401).json({ error: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
    }

    establecerCookie(res, resultado.token, config);
    await auditoriaRepo.registrar({
      usuarioId: resultado.usuario.id, correo: resultado.usuario.correo, rol: resultado.usuario.rol,
      ip: req.ip, operacion: 'auth:login', resultado: 'exito', origen: 'api',
    });
    res.json({ usuario: resultado.usuario });
  });

  const logout = asyncManejado(async (req, res) => {
    if (req.tokenSesion) authServicio.cerrarSesion(req.tokenSesion);
    limpiarCookie(res, config);
    await auditoriaRepo.registrar({
      usuarioId: req.sesion?.usuarioId, correo: req.sesion?.correo, rol: req.sesion?.rol,
      ip: req.ip, operacion: 'auth:logout', resultado: 'exito', origen: 'api',
    });
    res.json({ ok: true });
  });

  const sesionActual = (req, res) => {
    res.json({
      usuarioId: req.sesion.usuarioId, correo: req.sesion.correo, rol: req.sesion.rol,
      debeCambiarContrasena: req.sesion.debeCambiarContrasena,
    });
  };

  const cambiarClave = asyncManejado(async (req, res) => {
    const { claveActual, claveNueva } = req.body || {};
    if (!claveActual || !claveNueva) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' });
    if (claveNueva.length < 12) return res.status(400).json({ error: 'CLAVE_DEBIL', mensaje: 'Mínimo 12 caracteres (DTC §2.3)' });

    // Reverificar la clave actual antes de permitir el cambio.
    const reverificacion = await authServicio.iniciarSesion({ correo: req.sesion.correo, clave: claveActual, ip: req.ip });
    if (!reverificacion) return res.status(401).json({ error: 'CLAVE_ACTUAL_INCORRECTA' });
    authServicio.cerrarSesion(reverificacion.token); // no necesitamos esa sesión extra

    await authServicio.cambiarContrasena(req.sesion.usuarioId, claveNueva);
    limpiarCookie(res, config); // todas las sesiones se invalidaron, incluida esta
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Iniciá sesión nuevamente.' });
  });

  return { login, logout, sesionActual, cambiarClave };
};
