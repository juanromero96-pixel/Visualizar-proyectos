/**
 * validadores/esquemas.js
 * ═══════════════════════════════════════════════════════════════════════════
 * PORTADO LITERALMENTE de js/storage.js (función estructuraSegura/validarEsquema,
 * líneas 103-148 del frontend). Es intencional que sea una copia textual y no
 * una reimplementación: el DTC §7.2 (invariante C-8) exige que "ningún campo
 * contiene __proto__ ni constructor", y la única forma de garantizar que el
 * criterio del servidor y el del cliente NUNCA diverjan es que sea literalmente
 * el mismo código, no dos formulaciones que puedan derivar con el tiempo.
 *
 * Si se modifica esta función, DEBE modificarse también js/storage.js con el
 * mismo cambio, y viceversa. Es deuda técnica declarada (ver Informe de
 * Implementación §7, riesgo R-3): lo correcto a mediano plazo es extraer esto
 * a un módulo compartido que ambos (frontend y backend) importen. Node.js con
 * CommonJS y el navegador con <script> no comparten módulos de forma nativa
 * sin herramientas de build, que este proyecto deliberadamente no usa (cero
 * dependencias del lado del frontend). Se documenta como decisión consciente.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const LIMITES = Object.freeze({
  MAX_ELEMENTOS: 500,
  MAX_TEXTO: 8000,
  MAX_PROFUNDIDAD: 8,
  CLAVES_PROHIBIDAS: ['__proto__', 'constructor', 'prototype'],
});

/** Recorre la estructura verificando profundidad, tipos y claves. */
function estructuraSegura(valor, profundidad = 0) {
  if (profundidad > LIMITES.MAX_PROFUNDIDAD) return false;
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'number') return true;
  if (typeof valor === 'string') return valor.length <= LIMITES.MAX_TEXTO;
  if (Array.isArray(valor)) {
    if (valor.length > LIMITES.MAX_ELEMENTOS) return false;
    return valor.every((v) => estructuraSegura(v, profundidad + 1));
  }
  if (typeof valor === 'object') {
    const claves = Object.keys(valor);
    if (claves.length > 200) return false;
    for (const k of claves) {
      if (LIMITES.CLAVES_PROHIBIDAS.includes(k)) return false;
      if (k.length > 120) return false;
      if (!estructuraSegura(valor[k], profundidad + 1)) return false;
    }
    return true;
  }
  return false;
}

/** Forma esperada por nombre de corpus. Idéntico a FORMA de storage.js. */
const FORMA = Object.freeze({
  sedes: 'array',
  testimonios: 'array',
  registros: 'array',
  multimedia: 'array',
  escenas: 'any',
  config: 'objeto',
});

function validarEsquema(nombre, datos) {
  if (!estructuraSegura(datos)) return false;
  const forma = FORMA[nombre] || 'any';
  if (forma === 'array' && !Array.isArray(datos)) return false;
  if (forma === 'objeto' && (typeof datos !== 'object' || Array.isArray(datos) || datos === null)) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// Validaciones adicionales del lado del servidor (DTC cap.13, V-1 a V-11).
// Estas SÍ son propias del backend: el cliente nunca las necesitó porque no
// tenía la responsabilidad de aprobar contenido para publicación.
// ══════════════════════════════════════════════════════════════════════════

const CAMPOS_OBLIGATORIOS = Object.freeze({
  testimonios: ['id', 'nombreCompleto', 'sede', 'ordenNarrativo', 'x', 'y', 'escala', 'rotacion', 'profundidad', 'visible'],
  registros:   ['id', 'sede', 'ordenNarrativo', 'x', 'y', 'escala', 'rotacion', 'profundidad', 'visible', 'unidadAcademica'],
  multimedia:  ['id', 'sede', 'ordenNarrativo', 'x', 'y', 'escala', 'rotacion', 'profundidad', 'visible', 'tipo'],
  sedes:       ['id', 'nombre', 'orden', 'visible'],
});

/**
 * V-1 · Validación de esquema y campos obligatorios (DTC cap.13).
 * Verifica que cada elemento tenga los campos que el Motor Editorial
 * consume (DTC §7.2, invariante C-2), con los tipos correctos.
 */
function validarCamposObligatorios(nombre, datos) {
  const errores = [];
  const campos = CAMPOS_OBLIGATORIOS[nombre];
  if (!campos || !Array.isArray(datos)) return { valido: true, errores: [] };

  datos.forEach((el, i) => {
    campos.forEach((campo) => {
      if (el[campo] === undefined) {
        errores.push(`${nombre}[${i}] (id=${el.id || '?'}): falta el campo obligatorio "${campo}"`);
      }
    });
    if (typeof el.x === 'number' && (el.x < 0 || el.x > 100)) {
      errores.push(`${nombre}[${i}]: x=${el.x} fuera de rango [0,100]`);
    }
    if (typeof el.y === 'number' && (el.y < 0 || el.y > 100)) {
      errores.push(`${nombre}[${i}]: y=${el.y} fuera de rango [0,100]`);
    }
  });
  return { valido: errores.length === 0, errores };
}

/**
 * V-4 · Consistencia referencial (DTC cap.13).
 * ordenNarrativo único y contiguo por sede; sede/unidadAcademica existentes.
 */
function validarConsistenciaReferencial(corpus, sedesValidas) {
  const errores = [];
  const porSede = {};
  ['testimonios', 'registros', 'multimedia'].forEach((tipo) => {
    (corpus[tipo] || []).forEach((el) => {
      if (el.sede && !sedesValidas.includes(el.sede)) {
        errores.push(`${tipo} id=${el.id}: sede "${el.sede}" no existe en sedes.json`);
      }
      if (el.sede) {
        (porSede[el.sede] ||= []).push(el.ordenNarrativo);
      }
    });
  });
  Object.entries(porSede).forEach(([sede, ordenes]) => {
    const vistos = new Set();
    ordenes.forEach((o) => {
      if (vistos.has(o)) errores.push(`sede "${sede}": ordenNarrativo=${o} duplicado`);
      vistos.add(o);
    });
  });
  return { valido: errores.length === 0, errores };
}

/**
 * V-3 · Validación de rutas (DTC cap.13).
 * PORTADO de rutaSegura() en js/app.js — misma lista blanca exacta.
 */
function rutaSegura(ruta) {
  const s = String(ruta || '');
  if (!s) return false;
  if (s.includes('..')) return false;
  return /^assets\/[A-Za-z0-9._/-]+\.(jpg|jpeg|png|webp|svg|avif)$/i.test(s);
}

module.exports = {
  estructuraSegura,
  validarEsquema,
  validarCamposObligatorios,
  validarConsistenciaReferencial,
  rutaSegura,
  LIMITES,
  FORMA,
};
