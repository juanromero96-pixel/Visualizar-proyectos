/**
 * login.js
 * -----------------------------------------------------------------------
 * ATENCIÓN — ESTO NO ES SEGURIDAD REAL.
 * El usuario y la contraseña están escritos en este archivo, que cualquiera
 * puede leer abriendo las herramientas de desarrollador del navegador o el
 * código fuente. Además, nada impide que alguien abra admin.html
 * directamente sin pasar por este formulario.
 *
 * Esto es válido únicamente como prototipo local o de uso interno en una
 * red de confianza (por ejemplo, mientras se decide el contenido antes de
 * publicarlo). Para un uso institucional real, este login debería
 * resolverse en un servidor (por ejemplo, reutilizando el panel Flask de
 * BDE-UNaM, que ya tiene autenticación por variables de entorno).
 */
const CREDENCIALES_PROTOTIPO = {
  usuario: 'admin',
  clave: '12345',
};

const CLAVE_SESION = 'unam_semana_regional_admin_autenticado';

document.getElementById('formulario-login').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const usuario = document.getElementById('campo-usuario').value.trim();
  const clave = document.getElementById('campo-clave').value;
  const mensaje = document.getElementById('mensaje-login');

  if (usuario === CREDENCIALES_PROTOTIPO.usuario && clave === CREDENCIALES_PROTOTIPO.clave) {
    sessionStorage.setItem(CLAVE_SESION, 'true');
    window.location.href = 'admin.html';
  } else {
    mensaje.textContent = 'Usuario o contraseña incorrectos.';
    mensaje.classList.add('mensaje-login--error');
    document.getElementById('campo-clave').value = '';
    document.getElementById('campo-clave').focus();
  }
});

// Si ya hay una sesión abierta en este navegador, no hace falta loguearse de nuevo.
if (sessionStorage.getItem(CLAVE_SESION) === 'true') {
  window.location.href = 'admin.html';
}
