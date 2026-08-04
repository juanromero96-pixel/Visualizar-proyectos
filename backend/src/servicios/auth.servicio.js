/**
 * servicios/auth.servicio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Orquesta el proveedor de autenticación ACTIVO (DTI §7.5). Los controladores
 * nunca instancian un proveedor directamente: siempre pasan por aquí. Cambiar
 * de proveedor en el futuro es una línea en config/index.js, no un cambio acá.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const crypto = require('crypto');

const DURACION_ABSOLUTA_MS = 8 * 60 * 60 * 1000;   // 8 horas (DTC §7.4)
const DURACION_INACTIVIDAD_MS = 30 * 60 * 1000;     // 30 minutos

class AuthServicio {
  /**
   * @param {ProveedorAutenticacion} proveedor
   * @param {UsuariosRepositorio} usuariosRepo
   */
  constructor(proveedor, usuariosRepo) {
    this.proveedor = proveedor;
    this.usuariosRepo = usuariosRepo;
    this.sesiones = new Map(); // token → { usuarioId, correo, rol, creada, ultimaActividad }
  }

  async iniciarSesion({ correo, clave, ip }) {
    const resultado = await this.proveedor.autenticar({ correo, clave, ip });
    if (!resultado) return null;

    const usuario = await this.usuariosRepo.buscarPorId(resultado.usuarioId);
    const token = crypto.randomBytes(32).toString('hex');
    const ahora = Date.now();
    this.sesiones.set(token, {
      usuarioId: usuario.id, correo: usuario.correo, rol: usuario.rol,
      creada: ahora, ultimaActividad: ahora,
      debeCambiarContrasena: !!usuario.debeCambiarContrasena,
    });
    return { token, usuario: { id: usuario.id, correo: usuario.correo, rol: usuario.rol,
              debeCambiarContrasena: !!usuario.debeCambiarContrasena } };
  }

  /** Valida el token y renueva la ventana de inactividad si sigue vigente (DTC §7.4: "renovación deslizante"). */
  validarSesion(token) {
    const s = this.sesiones.get(token);
    if (!s) return null;
    const ahora = Date.now();
    if (ahora - s.creada > DURACION_ABSOLUTA_MS) { this.sesiones.delete(token); return null; }
    if (ahora - s.ultimaActividad > DURACION_INACTIVIDAD_MS) { this.sesiones.delete(token); return null; }
    s.ultimaActividad = ahora;
    return s;
  }

  cerrarSesion(token) {
    this.sesiones.delete(token);
  }

  /** Invalida TODAS las sesiones de un usuario (DTC §7.4: al cambiar contraseña). */
  cerrarTodasLasSesionesDe(usuarioId) {
    for (const [token, s] of this.sesiones) {
      if (s.usuarioId === usuarioId) this.sesiones.delete(token);
    }
  }

  async cambiarContrasena(usuarioId, claveNueva) {
    if (!this.proveedor.soportaCambioDeContrasena()) {
      throw new Error(`El proveedor "${this.proveedor.nombre()}" no admite cambio de contraseña local`);
    }
    const ProveedorLocal = this.proveedor.constructor;
    const hash = await ProveedorLocal.hashear(claveNueva);
    await this.usuariosRepo.actualizar(usuarioId, { hash, debeCambiarContrasena: false });
    this.cerrarTodasLasSesionesDe(usuarioId);
  }
}

module.exports = AuthServicio;
