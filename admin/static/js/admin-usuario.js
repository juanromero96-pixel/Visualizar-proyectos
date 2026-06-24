/**
 * admin-usuario.js
 * Identificación liviana de quién está usando el panel, para poder
 * registrar "usuario" en el historial de auditoría. IMPORTANTE: esto
 * NO es un sistema de autenticación — no hay contraseña, cualquiera
 * puede escribir cualquier nombre. Es solo atribución dentro de un
 * equipo reducido y de confianza que ya tiene acceso a esta máquina;
 * no controla acceso ni protege nada. Si en el futuro se necesita
 * control de acceso real, esto debe reemplazarse, no extenderse.
 */

const CLAVE_ALMACENAMIENTO = 'bde-unam-admin-usuario';

export function obtenerNombreUsuario() {
  let nombre = window.localStorage.getItem(CLAVE_ALMACENAMIENTO);
  if (!nombre) {
    nombre = window.prompt('¿Quién está revisando? (se guarda en este navegador para futuras acciones)', '') || 'sin identificar';
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, nombre);
  }
  return nombre;
}

export function cambiarNombreUsuario() {
  const nombre = window.prompt('Cambiar nombre de quien revisa:', obtenerNombreUsuario());
  if (nombre) {
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, nombre);
  }
  return obtenerNombreUsuario();
}
