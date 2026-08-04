/**
 * util/bloqueo.js — Bloqueo de escritura por recurso (DTI §6.6)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Un bloqueo por archivo (corpus:2026:testimonios) con expiración de 30
 * segundos, o control optimista por marca de versión en meta.json, con
 * rechazo 409 Conflict si la versión enviada no coincide."
 *
 * Se implementa el primero (bloqueo con expiración) por ser más simple de
 * operar con un solo usuario inicial, y se deja el campo de versión en
 * meta.json (servicios/ediciones.servicio.js) como base para añadir el
 * control optimista cuando haya edición concurrente real (DTC §17.2:
 * "más de 5 usuarios concurrentes" es la señal que lo justificaría).
 *
 * En memoria del proceso: con un solo proceso Node sirviendo el backend
 * (arquitectura de único servidor, DTI §15) esto es suficiente. Si en el
 * futuro se escala a varios procesos, este mapa debe migrar a un almacén
 * compartido (Redis) — declarado explícitamente como límite conocido.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const DURACION_MS = 30 * 1000;
const bloqueos = new Map(); // clave → { usuarioId, expira }

function limpiarVencidos() {
  const ahora = Date.now();
  for (const [clave, b] of bloqueos) {
    if (b.expira <= ahora) bloqueos.delete(clave);
  }
}

/** Intenta tomar el bloqueo. Devuelve true si lo obtuvo (o ya era del mismo usuario). */
function adquirir(clave, usuarioId) {
  limpiarVencidos();
  const actual = bloqueos.get(clave);
  if (actual && actual.usuarioId !== usuarioId) return false;
  bloqueos.set(clave, { usuarioId, expira: Date.now() + DURACION_MS });
  return true;
}

function liberar(clave, usuarioId) {
  const actual = bloqueos.get(clave);
  if (actual && actual.usuarioId === usuarioId) bloqueos.delete(clave);
}

function quienLoTiene(clave) {
  limpiarVencidos();
  const actual = bloqueos.get(clave);
  return actual ? actual.usuarioId : null;
}

module.exports = { adquirir, liberar, quienLoTiene, DURACION_MS };
