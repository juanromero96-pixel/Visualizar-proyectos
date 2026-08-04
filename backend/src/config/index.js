/**
 * config/index.js — DTI §6.8: "por variables de entorno, nunca en el árbol
 * de código". Los valores por defecto son para desarrollo local; producción
 * DEBE sobrescribir SESION_SECRETO como mínimo.
 */
'use strict';

const path = require('path');

function requerido(nombre, porDefecto) {
  const valor = process.env[nombre];
  if (valor !== undefined) return valor;
  if (porDefecto !== undefined) return porDefecto;
  throw new Error(`Variable de entorno requerida sin definir: ${nombre}`);
}

const entorno = process.env.NODE_ENV === 'production' ? 'produccion' : 'desarrollo';

module.exports = {
  entorno,
  puerto: Number(process.env.PUERTO || 3000),
  rutaAlmacen: path.resolve(process.env.ALMACEN_RUTA || path.join(__dirname, '..', '..', '..', 'almacen')),
  sesionSecreto: requerido('SESION_SECRETO',
    entorno === 'desarrollo' ? 'clave-de-desarrollo-no-usar-en-produccion-cambiar-siempre' : undefined),
  origenPermitido: process.env.ORIGEN_PERMITIDO || null, // null = mismo origen, sin CORS explícito
  nivelLog: process.env.NIVEL_LOG || 'info',
};
