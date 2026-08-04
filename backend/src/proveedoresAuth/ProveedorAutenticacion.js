/**
 * proveedoresAuth/ProveedorAutenticacion.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Interfaz base (DTI §7.5). Cualquier proveedor futuro (OAuth, LDAP, SAML)
 * implementa este contrato. El resto del backend nunca llama a un proveedor
 * concreto directamente: pasa siempre por el servicio de sesión, que resuelve
 * el proveedor activo desde configuración. Cambiar de proveedor es agregar
 * una clase y cambiar una variable de entorno — nunca tocar los controladores.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

class ProveedorAutenticacion {
  /**
   * @param {object} credenciales - forma específica del proveedor
   * @returns {Promise<{usuarioId, correo, nombre}|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async autenticar(credenciales) {
    throw new Error('ProveedorAutenticacion.autenticar() debe implementarse en la subclase');
  }

  /** @returns {boolean} si este proveedor permite cambio de contraseña propio */
  soportaCambioDeContrasena() {
    return false;
  }

  /** @returns {string|null} URL de redirección para flujos OAuth/SAML, o null si no aplica */
  urlDeRedireccion() {
    return null;
  }

  /** Identificador corto usado en logs y auditoría. */
  nombre() {
    return 'desconocido';
  }
}

module.exports = ProveedorAutenticacion;
