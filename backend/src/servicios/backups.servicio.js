/**
 * servicios/backups.servicio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DTC cap.4 (versionado de contenido) + cap.14 (backups). Modelo de
 * instantáneas completas, justificado explícitamente en DTC §4.2: el
 * corpus pesa 69,8 KB medidos; 500 versiones ocuparían <35 MB. El volumen
 * no justifica la complejidad de un modelo incremental.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { escribirJSONAtomico, leerJSON, existe } = require('../util/escrituraAtomica');

class BackupsServicio {
  constructor(edicionesRepo, rutaAlmacen) {
    this.repo = edicionesRepo;
    this.rutaBackups = path.join(rutaAlmacen, '_backups');
  }

  _rutaEdicionBackups(anio) { return path.join(this.rutaBackups, String(anio)); }

  /**
   * Instantánea completa del corpus + config-motor de una edición.
   * @param {string} motivo - 'por-escritura' | 'previo-a-publicacion' | 'previo-a-restauracion' | 'previo-a-correccion-urgencia' | 'diario' | 'semanal' | 'mensual'
   */
  async crearRespaldo(anio, motivo, usuarioId) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dirRespaldo = path.join(this._rutaEdicionBackups(anio), `${ts}_${motivo}`);
    await fsp.mkdir(dirRespaldo, { recursive: true });

    const snapshot = { ts: new Date().toISOString(), motivo, usuarioId, anio, archivos: {} };
    for (const tipo of ['sedes', 'testimonios', 'registros', 'multimedia', 'config']) {
      try {
        const datos = await this.repo.leerCorpus(anio, tipo);
        await escribirJSONAtomico(path.join(dirRespaldo, `${tipo}.json`), datos);
        snapshot.archivos[tipo] = true;
      } catch { snapshot.archivos[tipo] = false; }
    }
    try {
      const motor = await this.repo.leerConfigMotor(anio);
      await escribirJSONAtomico(path.join(dirRespaldo, 'config-motor.json'), motor);
    } catch { /* opcional */ }

    await escribirJSONAtomico(path.join(dirRespaldo, '_manifiesto.json'), snapshot);
    return { id: `${ts}_${motivo}`, ruta: dirRespaldo, ...snapshot };
  }

  async listarRespaldos(anio) {
    const dir = this._rutaEdicionBackups(anio);
    if (!(await existe(dir))) return [];
    const entradas = await fsp.readdir(dir, { withFileTypes: true });
    const respaldos = [];
    for (const e of entradas.filter((x) => x.isDirectory())) {
      const manifiesto = await leerJSON(path.join(dir, e.name, '_manifiesto.json')).catch(() => null);
      if (manifiesto) respaldos.push({ id: e.name, ...manifiesto });
    }
    return respaldos.sort((a, b) => b.ts.localeCompare(a.ts));
  }

  /**
   * Restaura un respaldo. Regla obligatoria (DTC §4.4 y §14.4): se crea un
   * respaldo del estado ACTUAL antes de sobrescribir, siempre.
   */
  async restaurar(anio, idRespaldo, usuarioId) {
    const dirRespaldo = path.join(this._rutaEdicionBackups(anio), idRespaldo);
    if (!(await existe(dirRespaldo))) throw new Error(`Respaldo ${idRespaldo} no encontrado`);

    // Respaldo de contingencia del estado actual, SIEMPRE, antes de restaurar.
    await this.crearRespaldo(anio, 'previo-a-restauracion', usuarioId);

    const restaurados = [];
    for (const tipo of ['sedes', 'testimonios', 'registros', 'multimedia', 'config']) {
      const rutaArchivo = path.join(dirRespaldo, `${tipo}.json`);
      if (await existe(rutaArchivo)) {
        const datos = await leerJSON(rutaArchivo);
        await this.repo.escribirCorpus(anio, tipo, datos);
        restaurados.push(tipo);
      }
    }
    const rutaMotor = path.join(dirRespaldo, 'config-motor.json');
    if (await existe(rutaMotor)) {
      await this.repo.escribirConfigMotor(anio, await leerJSON(rutaMotor));
      restaurados.push('config-motor');
    }
    return { restaurados, desde: idRespaldo };
  }

  /**
   * Comparación entre dos versiones (DTC §4.3), a nivel de elemento: qué se
   * agregó, modificó o eliminó. La vista "por campo" y la traducción a
   * lenguaje editorial quedan para el panel (Informe de Implementación §6,
   * requisito no implementado #4 — aquí se entrega el diff estructural).
   */
  async comparar(anio, idA, idB, tipo) {
    const leerVersion = async (id) => {
      const ruta = path.join(this._rutaEdicionBackups(anio), id, `${tipo}.json`);
      return existe(ruta) ? leerJSON(ruta) : [];
    };
    const [a, b] = await Promise.all([leerVersion(idA), leerVersion(idB)]);
    const porId = (arr) => new Map(arr.map((el) => [el.id, el]));
    const mapaA = porId(a), mapaB = porId(b);

    const agregados = [...mapaB.keys()].filter((id) => !mapaA.has(id)).map((id) => mapaB.get(id));
    const eliminados = [...mapaA.keys()].filter((id) => !mapaB.has(id)).map((id) => mapaA.get(id));
    const modificados = [];
    for (const [id, elA] of mapaA) {
      const elB = mapaB.get(id);
      if (!elB) continue;
      const camposDistintos = Object.keys({ ...elA, ...elB })
        .filter((campo) => JSON.stringify(elA[campo]) !== JSON.stringify(elB[campo]))
        .map((campo) => ({ campo, anterior: elA[campo], nuevo: elB[campo] }));
      if (camposDistintos.length) modificados.push({ id, cambios: camposDistintos });
    }
    return { tipo, agregados, eliminados, modificados };
  }

  /** Retención por antigüedad (DTC §4.5 / §14.1). Ejecutar como tarea periódica. */
  async aplicarRetencion(anio) {
    const respaldos = await this.listarRespaldos(anio);
    const ahora = Date.now();
    const DIA = 24 * 60 * 60 * 1000;
    let eliminados = 0;
    for (const r of respaldos) {
      if (r.motivo === 'previo-a-publicacion') continue; // permanente, sin excepción (DTC §4.5)
      const edad = ahora - new Date(r.ts).getTime();
      const conservar =
        (edad <= 30 * DIA) ||                                  // últimos 30 días: todas
        (edad <= 365 * DIA && r.motivo === 'diario') ||         // 1-12 meses: una diaria
        (r.motivo === 'mensual');                               // >12 meses: una mensual
      if (!conservar) {
        await fsp.rm(path.join(this._rutaEdicionBackups(anio), r.id), { recursive: true, force: true });
        eliminados++;
      }
    }
    return { revisados: respaldos.length, eliminados };
  }
}

module.exports = BackupsServicio;
