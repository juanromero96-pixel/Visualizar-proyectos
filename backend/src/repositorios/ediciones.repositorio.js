/**
 * repositorios/ediciones.repositorio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Única capa que toca almacen/ediciones/. Administra el corpus (los 5 JSON +
 * config-motor.json) y los metadatos de cada edición.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { leerJSON, escribirJSONAtomico, existe } = require('../util/escrituraAtomica');

const ARCHIVOS_CORPUS = ['sedes', 'testimonios', 'registros', 'multimedia', 'config'];

class EdicionesRepositorio {
  constructor(rutaAlmacen) {
    this.rutaBase = path.join(rutaAlmacen, 'ediciones');
  }

  _rutaEdicion(anio) { return path.join(this.rutaBase, String(anio)); }
  _rutaMeta(anio) { return path.join(this._rutaEdicion(anio), 'meta.json'); }
  _rutaCorpus(anio, tipo) { return path.join(this._rutaEdicion(anio), 'data', `${tipo}.json`); }
  _rutaConfigMotor(anio) { return path.join(this._rutaEdicion(anio), 'config-motor.json'); }
  _rutaAssets(anio) { return path.join(this._rutaEdicion(anio), 'assets'); }

  async listarEdiciones() {
    const entradas = await fsp.readdir(this.rutaBase, { withFileTypes: true });
    const anios = entradas
      .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a));
    const metas = [];
    for (const anio of anios) {
      if (await existe(this._rutaMeta(anio))) metas.push(await leerJSON(this._rutaMeta(anio)));
    }
    return metas;
  }

  async obtenerMeta(anio) {
    if (!(await existe(this._rutaMeta(anio)))) return null;
    return leerJSON(this._rutaMeta(anio));
  }

  async guardarMeta(anio, meta) {
    return escribirJSONAtomico(this._rutaMeta(anio), meta);
  }

  async obtenerEdicionActiva() {
    const ediciones = await this.listarEdiciones();
    return ediciones.find((e) => e.estado === 'publicada') || null;
  }

  async leerCorpus(anio, tipo) {
    if (!ARCHIVOS_CORPUS.includes(tipo)) throw new Error(`Tipo de corpus desconocido: ${tipo}`);
    return leerJSON(this._rutaCorpus(anio, tipo));
  }

  async escribirCorpus(anio, tipo, datos) {
    if (!ARCHIVOS_CORPUS.includes(tipo)) throw new Error(`Tipo de corpus desconocido: ${tipo}`);
    return escribirJSONAtomico(this._rutaCorpus(anio, tipo), datos);
  }

  async leerConfigMotor(anio) {
    return leerJSON(this._rutaConfigMotor(anio));
  }

  async escribirConfigMotor(anio, datos) {
    return escribirJSONAtomico(this._rutaConfigMotor(anio), datos);
  }

  /** Clona una edición existente como base de una nueva (DTC §10.2). */
  async crearDesdeOrigen(anioNuevo, anioOrigen, responsable) {
    if (await existe(this._rutaEdicion(anioNuevo))) {
      throw new Error(`La edición ${anioNuevo} ya existe`);
    }
    const origen = anioOrigen ? this._rutaEdicion(anioOrigen) : path.join(this.rutaBase, '_plantilla');
    await fsp.mkdir(this._rutaEdicion(anioNuevo), { recursive: true });
    await fsp.mkdir(path.join(this._rutaEdicion(anioNuevo), 'data'), { recursive: true });
    await fsp.mkdir(this._rutaAssets(anioNuevo), { recursive: true });

    // DTC §10.2: se copia lo ESTRUCTURAL (sedes, config, config-motor,
    // identidad visual en assets/logos y assets/ua), NO el contenido editorial
    // (testimonios, registros, multimedia quedan vacíos).
    const sedesOrigen = await leerJSON(path.join(origen, 'data', 'sedes.json')).catch(() => []);
    const configOrigen = await leerJSON(path.join(origen, 'data', 'config.json')).catch(() => ({}));
    const motorOrigen = await leerJSON(path.join(origen, 'config-motor.json')).catch(() => ({}));

    await escribirJSONAtomico(this._rutaCorpus(anioNuevo, 'sedes'), sedesOrigen);
    await escribirJSONAtomico(this._rutaCorpus(anioNuevo, 'config'), configOrigen);
    await escribirJSONAtomico(this._rutaCorpus(anioNuevo, 'testimonios'), []);
    await escribirJSONAtomico(this._rutaCorpus(anioNuevo, 'registros'), []);
    await escribirJSONAtomico(this._rutaCorpus(anioNuevo, 'multimedia'), []);
    await escribirJSONAtomico(this._rutaConfigMotor(anioNuevo), {
      ...motorOrigen,
      actualizado: new Date().toISOString(),
      actualizadoPor: 'clonado-desde-' + (anioOrigen || 'plantilla'),
    });

    // Copiar identidad visual (logos, ua) si el origen las tiene; no copiar
    // fotos/videos/personas específicas del año anterior.
    for (const carpeta of ['logos', 'ua', 'icons']) {
      const src = path.join(origen, 'assets', carpeta);
      const dst = path.join(this._rutaAssets(anioNuevo), carpeta);
      if (await existe(src)) await fsp.cp(src, dst, { recursive: true }).catch(() => {});
    }
    for (const carpeta of ['personas', 'backgrounds', 'photos', 'videos']) {
      await fsp.mkdir(path.join(this._rutaAssets(anioNuevo), carpeta), { recursive: true });
    }

    const meta = {
      anio: Number(anioNuevo), titulo: `Semana Regional de la Extensión ${anioNuevo}`,
      estado: 'borrador', creada: new Date().toISOString(), publicada: null,
      responsable, versionEsquema: 1, clonadaDe: anioOrigen || 'plantilla', notas: '',
    };
    await this.guardarMeta(anioNuevo, meta);
    return meta;
  }
}

module.exports = { EdicionesRepositorio, ARCHIVOS_CORPUS };
