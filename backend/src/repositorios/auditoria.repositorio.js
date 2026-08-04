/**
 * repositorios/auditoria.repositorio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Registro append-only, un archivo JSONL por mes (DTC §5.2, §5.3):
 *   1. Append-only sin excepciones — ningún rol puede modificar ni eliminar.
 *   2. Encadenamiento por hash — cada entrada incluye el hash de la anterior.
 *   3. Fuera del alcance del panel de contenido — directorio separado.
 *   4. Retención permanente — no se depura.
 *   5. Nunca registra credenciales.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { hashContenido } = require('../util/escrituraAtomica');

class AuditoriaRepositorio {
  constructor(rutaAlmacen) {
    this.rutaBase = path.join(rutaAlmacen, '_auditoria');
  }

  _archivoDelMes(fecha = new Date()) {
    const aa = fecha.getUTCFullYear();
    const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    return path.join(this.rutaBase, `${aa}-${mm}.jsonl`);
  }

  async _ultimoHash(archivo) {
    try {
      const contenido = await fsp.readFile(archivo, 'utf8');
      const lineas = contenido.trim().split('\n').filter(Boolean);
      if (!lineas.length) return null;
      return JSON.parse(lineas[lineas.length - 1]).hash;
    } catch {
      return null; // archivo del mes aún no existe
    }
  }

  /**
   * Registra una entrada. NUNCA debe recibir credenciales en `detalle`
   * (DTC §5.3 regla 5) — responsabilidad del llamador filtrarlas antes.
   */
  async registrar({ usuarioId, correo, rol, ip, operacion, recurso, edicion,
                     valorAnterior, valorNuevo, resultado, origen }) {
    await fsp.mkdir(this.rutaBase, { recursive: true });
    const archivo = this._archivoDelMes();
    const hashAnterior = await this._ultimoHash(archivo);

    const entrada = {
      ts: new Date().toISOString(),
      usuarioId: usuarioId || null,
      correo: correo || null,
      rol: rol || null,
      ip: ip || null,
      operacion,
      recurso: recurso || null,
      edicion: edicion || null,
      valorAnterior: valorAnterior ?? null,
      valorNuevo: valorNuevo ?? null,
      resultado: resultado || 'exito',
      origen: origen || 'panel',
      hashAnterior,
    };
    entrada.hash = hashContenido(JSON.stringify({ ...entrada, hash: undefined }));

    await fsp.appendFile(archivo, JSON.stringify(entrada) + '\n', 'utf8');
    return entrada;
  }

  async consultar({ desde, hasta, usuarioId, recurso, operacion, limite = 500 } = {}) {
    await fsp.mkdir(this.rutaBase, { recursive: true });
    const archivos = (await fsp.readdir(this.rutaBase))
      .filter((f) => f.endsWith('.jsonl')).sort();
    let resultados = [];
    for (const archivo of archivos) {
      const contenido = await fsp.readFile(path.join(this.rutaBase, archivo), 'utf8');
      const lineas = contenido.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      resultados.push(...lineas);
    }
    if (desde) resultados = resultados.filter((e) => e.ts >= desde);
    if (hasta) resultados = resultados.filter((e) => e.ts <= hasta);
    if (usuarioId) resultados = resultados.filter((e) => e.usuarioId === usuarioId);
    if (recurso) resultados = resultados.filter((e) => e.recurso && e.recurso.includes(recurso));
    if (operacion) resultados = resultados.filter((e) => e.operacion === operacion);
    resultados.sort((a, b) => b.ts.localeCompare(a.ts));
    return resultados.slice(0, limite);
  }

  /** Verifica la integridad de la cadena de un mes (DTC §5.3 regla 2). */
  async verificarIntegridad(archivo) {
    const ruta = path.join(this.rutaBase, archivo);
    const contenido = await fsp.readFile(ruta, 'utf8').catch(() => '');
    const lineas = contenido.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    let hashPrevio = null;
    for (let i = 0; i < lineas.length; i++) {
      const e = lineas[i];
      if (e.hashAnterior !== hashPrevio) {
        return { integra: false, rotaEn: i, motivo: 'hashAnterior no coincide con la entrada previa' };
      }
      const hashCalculado = hashContenido(JSON.stringify({ ...e, hash: undefined }));
      if (hashCalculado !== e.hash) {
        return { integra: false, rotaEn: i, motivo: 'hash de la propia entrada no coincide con su contenido' };
      }
      hashPrevio = e.hash;
    }
    return { integra: true, entradas: lineas.length };
  }
}

module.exports = AuditoriaRepositorio;
