/**
 * proveedoresAuth/ProveedorLocal.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Implementación local del usuario único inicial (DTI §7.1-7.2, DTC cap.2).
 *
 * Reglas de la especificación, aplicadas literalmente:
 *   · La contraseña NUNCA se almacena en texto plano (DTC §2.2 regla 2).
 *   · Hash con argon2id (DTI §7.2, DTC §2 — especificado explícitamente en
 *     ambos documentos; se usa tal cual, ver nota de deuda técnica abajo).
 *   · Comparación en tiempo constante (la propia librería argon2.verify ya
 *     la implementa internamente).
 *   · Límite de intentos: 5 fallos → bloqueo temporal de 15 min por correo
 *     e IP (DTI §7.4).
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const argon2 = require('argon2');
const ProveedorAutenticacion = require('./ProveedorAutenticacion');

// Parámetros de argon2id. Los de la librería por defecto (m=65536 KiB,
// t=3, p=4) ya cumplen la recomendación vigente de OWASP; no se afinan
// más sin evidencia de que el hardware del servidor institucional lo
// requiera — afinar "a ojo" sería el tipo de ajuste no fundamentado que
// ambos documentos prohíben.
const OPCIONES_ARGON2 = { type: argon2.argon2id };

// Límite de intentos (DTI §7.4)
const MAX_INTENTOS = 5;
const VENTANA_BLOQUEO_MS = 15 * 60 * 1000;
const intentosFallidos = new Map(); // clave "correo|ip" → { conteo, bloqueadoHasta }

function claveIntentos(correo, ip) {
  return `${String(correo || '').toLowerCase()}|${ip || 'sin-ip'}`;
}

function estaBloqueado(correo, ip) {
  const e = intentosFallidos.get(claveIntentos(correo, ip));
  return !!(e && e.bloqueadoHasta && e.bloqueadoHasta > Date.now());
}

function registrarFallo(correo, ip) {
  const clave = claveIntentos(correo, ip);
  const actual = intentosFallidos.get(clave) || { conteo: 0, bloqueadoHasta: null };
  actual.conteo += 1;
  if (actual.conteo >= MAX_INTENTOS) {
    actual.bloqueadoHasta = Date.now() + VENTANA_BLOQUEO_MS;
    actual.conteo = 0;
  }
  intentosFallidos.set(clave, actual);
}

function limpiarIntentos(correo, ip) {
  intentosFallidos.delete(claveIntentos(correo, ip));
}

class ProveedorLocal extends ProveedorAutenticacion {
  /**
   * @param {{buscarPorCorreo: function}} repositorioUsuarios
   */
  constructor(repositorioUsuarios) {
    super();
    this.repo = repositorioUsuarios;
  }

  nombre() { return 'local'; }
  soportaCambioDeContrasena() { return true; }

  /** @param {{correo, clave, ip}} credenciales */
  async autenticar({ correo, clave, ip }) {
    if (estaBloqueado(correo, ip)) {
      const err = new Error('Demasiados intentos fallidos. Reintentar más tarde.');
      err.codigo = 'BLOQUEADO_TEMPORAL';
      throw err;
    }

    const usuario = await this.repo.buscarPorCorreo(correo);
    // Retardo fijo para que la respuesta no filtre si el correo existe,
    // igualando el tiempo de "usuario inexistente" al de "clave incorrecta".
    const RETARDO_MS = 350;
    const inicio = Date.now();

    if (!usuario || !usuario.activo) {
      await esperarResto(inicio, RETARDO_MS);
      registrarFallo(correo, ip);
      return null;
    }

    const ok = await argon2.verify(usuario.hash, clave).catch(() => false);
    await esperarResto(inicio, RETARDO_MS);

    if (!ok) {
      registrarFallo(correo, ip);
      return null;
    }

    limpiarIntentos(correo, ip);
    return { usuarioId: usuario.id, correo: usuario.correo, nombre: usuario.nombre || usuario.correo };
  }

  /** Genera el hash a partir de una contraseña en claro. Nunca se loguea el argumento. */
  static async hashear(claveEnClaro) {
    return argon2.hash(claveEnClaro, OPCIONES_ARGON2);
  }
}

function esperarResto(inicio, minimoMs) {
  const transcurrido = Date.now() - inicio;
  const faltante = Math.max(0, minimoMs - transcurrido);
  return new Promise((r) => setTimeout(r, faltante));
}

module.exports = ProveedorLocal;

/**
 * NOTA DE DEUDA TÉCNICA DECLARADA (ver Informe de Implementación §7):
 * argon2 requiere un binario nativo compilado. Se verificó que instala y
 * funciona en este entorno, y ambos documentos lo especifican explícitamente,
 * así que se implementa tal cual. Riesgo operativo real: si la arquitectura
 * o distribución del servidor institucional difiere de la de este entorno de
 * desarrollo, el binario prebuilt podría no estar disponible y requerir
 * compilación local (herramientas de build + tiempo de instalación mayor).
 * Mitigación si eso ocurriera: sustituir este módulo por uno que use
 * crypto.scrypt (nativo de Node, sin dependencia externa), manteniendo
 * exactamente la misma interfaz (autenticar/hashear) — el resto del backend
 * no se entera del cambio.
 */
