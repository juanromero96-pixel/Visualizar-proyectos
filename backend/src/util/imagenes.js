/**
 * util/imagenes.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DTC §11.4: "Verificar el tipo real por los bytes de cabecera, no por la
 * extensión ni por el Content-Type declarado." Implementado con sharp, que
 * falla al leer los metadatos si el archivo no es una imagen real — es en
 * sí mismo el mecanismo de verificación por contenido, no una lista de
 * firmas mantenida a mano.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const sharp = require('sharp');
const crypto = require('crypto');

const FORMATOS_ACEPTADOS = new Set(['jpeg', 'png', 'webp', 'gif']);

/**
 * Verifica que el buffer sea una imagen real y devuelve sus metadatos.
 * Lanza si no lo es — es la defensa central del hallazgo H-11 (auditoría
 * de seguridad): un archivo renombrado con extensión falsa no pasa esto,
 * porque sharp lee la estructura real del archivo, no el nombre.
 */
async function verificarImagenReal(buffer) {
  const metadatos = await sharp(buffer).metadata(); // lanza si no es imagen válida
  if (!FORMATOS_ACEPTADOS.has(metadatos.format)) {
    throw new Error(`Formato "${metadatos.format}" no aceptado (solo jpeg/png/webp/gif)`);
  }
  return metadatos;
}

/**
 * Genera variantes WebP en los anchos indicados (DTC §6.3), conservando el
 * original sin modificar. Nunca sube de calidad ni recorta: solo reduce.
 */
async function generarVariantes(buffer, anchos, calidad = 82) {
  const variantes = {};
  for (const ancho of anchos) {
    const salida = await sharp(buffer)
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: calidad })
      .toBuffer();
    variantes[ancho] = salida;
  }
  return variantes;
}

async function generarMiniatura(buffer, ancho = 320, calidad = 75) {
  return sharp(buffer).resize({ width: ancho, withoutEnlargement: true }).webp({ quality: calidad }).toBuffer();
}

/**
 * Nomenclatura normalizada (DTC §11.2, corrección del hallazgo de nombres
 * sin sanitizar). Nunca conserva el nombre original del archivo del usuario.
 */
function nombreNormalizado(categoria, identificador, variante, extension) {
  const limpio = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const partes = [limpio(categoria), limpio(identificador)];
  if (variante) partes.push(limpio(String(variante)));
  return `${partes.join('-')}.${extension}`;
}

function hashArchivo(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

module.exports = { verificarImagenReal, generarVariantes, generarMiniatura, nombreNormalizado, hashArchivo, FORMATOS_ACEPTADOS };
