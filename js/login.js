/**
 * login.js — Acceso al panel de administración
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 2 · Autenticación en servidor (DTI §7, DTC cap.2).
 *
 * Este módulo reemplaza la verificación en el cliente de la Etapa 1 — tal
 * como esa misma versión anterior anunciaba que ocurriría ("La Etapa 2
 * reemplaza este módulo por autenticación en servidor"). La verificación de
 * credenciales ahora ocurre en POST /api/v1/auth/login: el servidor compara
 * contra un hash argon2id con sal y devuelve una cookie HttpOnly firmada.
 * El navegador nunca ve ni puede leer el token de sesión.
 *
 * RESPALDO (degradación elegante, mismo principio que storage.js DTI §12.2):
 * si el backend no responde — por ejemplo, durante el despliegue incremental
 * donde el frontend ya se actualizó pero el backend todavía no — se cae al
 * esquema de digest local de la Etapa 1, preservando acceso al panel con la
 * advertencia de que esa vía sigue siendo la protección básica, no real,
 * documentada en su momento.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(() => {
  'use strict';

  const RUTA_LOGIN = '/api/v1/auth/login';
  const TIMEOUT_MS = 3000;

  // ── Respaldo: esquema de digest de la Etapa 1 (sin cambios) ─────────────
  const DIGEST_ESPERADO_RESPALDO =
    '708d1d8e40c867c71f15b7c9603cf06fe2b780afda6e4f25f36f85ca611b1222';
  const CLAVE_SESION_RESPALDO = 'unam_semana_regional_admin_autenticado';
  const VIGENCIA_RESPALDO_MS = 30 * 60 * 1000;

  async function digestHex(texto) {
    const datos = new TextEncoder().encode(texto);
    const buf = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function igualesConstante(a, b) {
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }
  function abrirSesionRespaldo() {
    sessionStorage.setItem(CLAVE_SESION_RESPALDO, JSON.stringify({ valido: true, ts: Date.now() }));
  }
  function sesionRespaldoVigente() {
    try {
      const bruto = sessionStorage.getItem(CLAVE_SESION_RESPALDO);
      if (!bruto) return false;
      const s = JSON.parse(bruto);
      return s?.valido === true && typeof s.ts === 'number' && (Date.now() - s.ts) < VIGENCIA_RESPALDO_MS;
    } catch { return false; }
  }

  /** Intenta autenticar contra el backend. null si no responde (no si rechaza credenciales). */
  async function intentarLoginBackend(correo, clave) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(RUTA_LOGIN, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, clave }), signal: control.signal,
      });
      if (resp.status === 401 || resp.status === 429) return { rechazado: true, cuerpo: await resp.json().catch(() => ({})) };
      if (!resp.ok) return null;
      return { rechazado: false, cuerpo: await resp.json() };
    } catch {
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }

  const form = document.getElementById('formulario-login');
  if (!form) return;

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const usuario = document.getElementById('campo-usuario').value.trim();
    const clave = document.getElementById('campo-clave').value;
    const mensaje = document.getElementById('mensaje-login');
    const boton = form.querySelector('button[type="submit"]');

    boton.disabled = true;
    mensaje.textContent = '';
    mensaje.classList.remove('mensaje-login--error');

    const resultado = await intentarLoginBackend(usuario, clave);

    if (resultado !== null) {
      if (!resultado.rechazado) {
        window.location.href = 'admin.html';
        return;
      }
      mensaje.textContent = resultado.cuerpo.mensaje || 'Usuario o contraseña incorrectos.';
      mensaje.classList.add('mensaje-login--error');
      document.getElementById('campo-clave').value = '';
      document.getElementById('campo-clave').focus();
      boton.disabled = false;
      return;
    }

    console.warn('[login] Backend no disponible; usando el esquema de acceso básico de la Etapa 1. ' +
                 'Esto NO es autenticación real — ver la advertencia original en este archivo.');
    const espera = new Promise((r) => setTimeout(r, 400));
    let ok = false;
    try {
      const d = await digestHex(`${usuario}:${clave}`);
      ok = igualesConstante(d, DIGEST_ESPERADO_RESPALDO);
    } catch {
      mensaje.textContent = 'Este navegador requiere HTTPS para el acceso.';
      mensaje.classList.add('mensaje-login--error');
      boton.disabled = false;
      return;
    }
    await espera;

    if (ok) {
      abrirSesionRespaldo();
      window.location.href = 'admin.html';
    } else {
      mensaje.textContent = 'Usuario o contraseña incorrectos.';
      mensaje.classList.add('mensaje-login--error');
      document.getElementById('campo-clave').value = '';
      document.getElementById('campo-clave').focus();
      boton.disabled = false;
    }
  });

  (async () => {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch('/api/v1/auth/sesion', { signal: control.signal });
      clearTimeout(temporizador);
      if (resp.ok) { window.location.href = 'admin.html'; return; }
    } catch { clearTimeout(temporizador); }
    if (sesionRespaldoVigente()) window.location.href = 'admin.html';
  })();
})();
