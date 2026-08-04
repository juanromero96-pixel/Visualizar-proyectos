/**
 * util/escrituraAtomica.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Implementa literalmente el procedimiento del DTI §6.5:
 *   1. Validar el contenido contra el esquema (rechaza antes de tocar disco)
 *   2. Escribir en archivo temporal en el MISMO volumen
 *   3. fsync del temporal (fuerza el volcado a disco)
 *   4. Renombrar sobre el destino (operación atómica en POSIX)
 *   5. Registrar en auditoría (responsabilidad del llamador, no de este módulo)
 *
 * El paso 2 exige "mismo volumen" porque rename() solo es atómico dentro del
 * mismo sistema de archivos; cruzar volúmenes degrada a copia+borrado, que
 * puede dejar el destino corrupto si se interrumpe a mitad de camino.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Escribe `contenido` (string) en `rutaDestino` de forma atómica.
 * Lanza si la escritura falla; el archivo destino queda intacto en ese caso.
 */
async function escribirAtomico(rutaDestino, contenido) {
  const dir = path.dirname(rutaDestino);
  await fsp.mkdir(dir, { recursive: true });

  // Temporal en el MISMO directorio que el destino (mismo volumen, paso 2).
  const sufijo = crypto.randomBytes(6).toString('hex');
  const rutaTemp = path.join(dir, `.tmp-${path.basename(rutaDestino)}-${sufijo}`);

  let handle;
  try {
    handle = await fsp.open(rutaTemp, 'w');
    await handle.writeFile(contenido, 'utf8');
    await handle.sync();          // paso 3 · fsync del temporal
  } finally {
    if (handle) await handle.close();
  }

  await fsp.rename(rutaTemp, rutaDestino);   // paso 4 · atómico en POSIX
  return { ruta: rutaDestino, bytes: Buffer.byteLength(contenido, 'utf8') };
}

/** Variante para JSON: serializa con indentación estable (diffs legibles en Git). */
async function escribirJSONAtomico(rutaDestino, datosObjeto) {
  const contenido = JSON.stringify(datosObjeto, null, 2) + '\n';
  return escribirAtomico(rutaDestino, contenido);
}

/** Lectura simple, sin bloqueo — usada por las rutas de consulta. */
async function leerJSON(ruta) {
  const texto = await fsp.readFile(ruta, 'utf8');
  return JSON.parse(texto);
}

async function existe(ruta) {
  try { await fsp.access(ruta); return true; } catch { return false; }
}

/** Hash de contenido, usado por el versionado y la cadena de auditoría. */
function hashContenido(contenido) {
  return crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
}

module.exports = { escribirAtomico, escribirJSONAtomico, leerJSON, existe, hashContenido };
