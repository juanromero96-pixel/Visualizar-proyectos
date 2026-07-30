/**
 * login.js — Acceso al panel de administración
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 1 · Protección básica contra acceso casual.
 *
 * ⚠️  ALCANCE Y LÍMITE DECLARADOS
 *
 * Esto NO es autenticación. La verificación ocurre en el navegador, de modo
 * que un atacante determinado puede:
 *   · recuperar la contraseña desde el digest (es corta y sin sal);
 *   · escribir la bandera de sesión desde la consola y entrar directamente.
 *
 * Su función es impedir el acceso casual y la indexación, no proteger de un
 * ataque dirigido. La protección real corresponde a la capa del servidor:
 * ver la configuración de Nginx en el Documento Técnico de Aplicación de
 * Correcciones de Seguridad, §7 (auth_basic + restricción por red).
 *
 * La Etapa 2 reemplaza este módulo por autenticación en servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(() => {
  'use strict';

  // Digest SHA-256 de "usuario:clave". El texto plano no figura en el código.
  const DIGEST_ESPERADO =
    '708d1d8e40c867c71f15b7c9603cf06fe2b780afda6e4f25f36f85ca611b1222';

  const CLAVE_SESION = 'unam_semana_regional_admin_autenticado';
  const VIGENCIA_MS  = 30 * 60 * 1000;   // 30 minutos de inactividad

  /** Digest hexadecimal SHA-256 de una cadena. */
  async function digestHex(texto) {
    const datos = new TextEncoder().encode(texto);
    const buf = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Comparación en tiempo constante, para no filtrar información por timing. */
  function igualesConstante(a, b) {
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  function abrirSesion() {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({
      valido: true, ts: Date.now(),
    }));
  }

  /** Sesión válida si existe, es coherente y no venció. */
  function sesionVigente() {
    try {
      const bruto = sessionStorage.getItem(CLAVE_SESION);
      if (!bruto) return false;
      const s = JSON.parse(bruto);
      return s && s.valido === true &&
             typeof s.ts === 'number' &&
             (Date.now() - s.ts) < VIGENCIA_MS;
    } catch (e) { return false; }
  }

  const form = document.getElementById('formulario-login');
  if (!form) return;

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const usuario = document.getElementById('campo-usuario').value.trim();
    const clave   = document.getElementById('campo-clave').value;
    const mensaje = document.getElementById('mensaje-login');
    const boton   = form.querySelector('button[type="submit"]');

    boton.disabled = true;
    // Retardo fijo: iguala el tiempo de respuesta entre acierto y error.
    const espera = new Promise((r) => setTimeout(r, 400));

    let ok = false;
    try {
      const d = await digestHex(`${usuario}:${clave}`);
      ok = igualesConstante(d, DIGEST_ESPERADO);
    } catch (e) {
      // crypto.subtle exige contexto seguro (HTTPS o localhost).
      mensaje.textContent = 'Este navegador requiere HTTPS para el acceso.';
      mensaje.classList.add('mensaje-login--error');
      boton.disabled = false;
      return;
    }
    await espera;

    if (ok) {
      abrirSesion();
      window.location.href = 'admin.html';
    } else {
      mensaje.textContent = 'Usuario o contraseña incorrectos.';
      mensaje.classList.add('mensaje-login--error');
      document.getElementById('campo-clave').value = '';
      document.getElementById('campo-clave').focus();
      boton.disabled = false;
    }
  });

  // Sesión ya abierta y vigente: no hace falta repetir el ingreso.
  if (sesionVigente()) window.location.href = 'admin.html';
})();
