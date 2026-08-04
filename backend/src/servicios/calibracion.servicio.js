/**
 * servicios/calibracion.servicio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DTC cap.8. Restricción arquitectónica innegociable (§8.2), citada
 * literalmente porque es la condición de la que depende toda esta pieza:
 *
 *   "El Laboratorio ENVÍA evidencia; nunca RECIBE instrucciones del backend.
 *    El backend ALMACENA y CONSULTA evidencia; nunca APLICA recalibraciones
 *    automáticamente. La recalibración sigue siendo una decisión humana
 *    revisada (autoAplicacion: false)."
 *
 * Este servicio, por lo tanto, NO tiene ningún método que module parámetros
 * del Motor Editorial. Solo guarda lo que /calibrar exporta y lo deja
 * consultable. Aplicar una recalibración sigue siendo, como hoy, editar
 * config-motor.json a mano tras revisión humana (vía el endpoint de
 * configuración, con las 4 salvaguardas de nivel rojo — DTC §9.3).
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { escribirJSONAtomico, escribirAtomico, leerJSON, existe } = require('../util/escrituraAtomica');

// Retención por tipo (DTC §8.4, medido sobre evidencia real del proyecto:
// los CSV por elemento pesaron 575-846 KB por sesión y representan el 54%
// del crecimiento proyectado a 10 años — es el único componente con
// retención acotada; todo lo demás es permanente).
const RETENCION_DIAS = Object.freeze({
  calibracionCompleta: null,  // permanente
  dataset: null,               // permanente
  frames: 730,                 // 24 meses
  elementos: 180,               // 6 meses, salvo marcado como referencia
  heatmap: null,                // permanente (peso despreciable)
});

class CalibracionServicio {
  constructor(rutaAlmacen) {
    this.rutaBase = path.join(rutaAlmacen, '_calibracion');
  }

  _rutaTipo(tipo) { return path.join(this.rutaBase, tipo); }

  /**
   * Recibe una exportación de /calibrar tal cual la produce el Laboratorio
   * (JSON o CSV/PNG como texto/base64). No transforma el contenido: lo
   * almacena con metadatos de procedencia.
   */
  async almacenar({ tipo, nombreArchivo, contenido, dispositivo, build, esReferencia = false }) {
    const TIPOS_VALIDOS = ['calibracionCompleta', 'dataset', 'frames', 'elementos', 'heatmap'];
    if (!TIPOS_VALIDOS.includes(tipo)) throw new Error(`Tipo de evidencia desconocido: ${tipo}`);

    const dir = this._rutaTipo(tipo);
    await fsp.mkdir(dir, { recursive: true });
    const rutaArchivo = path.join(dir, nombreArchivo);
    await escribirAtomico(rutaArchivo, contenido);

    const meta = {
      nombreArchivo, tipo, dispositivo: dispositivo || null, build: build || null,
      recibido: new Date().toISOString(), esReferencia,
    };
    await escribirJSONAtomico(rutaArchivo + '.meta.json', meta);
    return meta;
  }

  async listar(tipo) {
    const dir = this._rutaTipo(tipo);
    if (!(await existe(dir))) return [];
    const archivos = (await fsp.readdir(dir)).filter((f) => f.endsWith('.meta.json'));
    const metas = [];
    for (const f of archivos) metas.push(await leerJSON(path.join(dir, f)));
    return metas.sort((a, b) => b.recibido.localeCompare(a.recibido));
  }

  async marcarComoReferencia(tipo, nombreArchivo, esReferencia) {
    const rutaMeta = path.join(this._rutaTipo(tipo), nombreArchivo + '.meta.json');
    const meta = await leerJSON(rutaMeta);
    meta.esReferencia = esReferencia;
    await escribirJSONAtomico(rutaMeta, meta);
    return meta;
  }

  /** Huecos de cobertura (DTC §8.5): configuraciones sin ninguna sesión registrada. */
  async huecosDeCobertura() {
    const datasets = await this.listar('dataset');
    const dispositivosVistos = new Set(datasets.map((d) => d.dispositivo).filter(Boolean));
    const BANDAS_ESPERADAS = [
      'mobile-critico (altUtil<560)', 'mobile-estandar (560-759)',
      'mobile-amplio (>=760)', 'desktop', 'tablet', 'mobile-horizontal',
    ];
    return BANDAS_ESPERADAS.filter((banda) => {
      const clave = banda.split(' ')[0];
      return ![...dispositivosVistos].some((d) => d.toLowerCase().includes(clave.split('-')[0]));
    });
  }

  /** Aplica la política de retención de §8.4. Ejecutar como tarea periódica. */
  async aplicarRetencion() {
    const resumen = {};
    for (const [tipo, dias] of Object.entries(RETENCION_DIAS)) {
      if (dias === null) { resumen[tipo] = { eliminados: 0, motivo: 'retención permanente' }; continue; }
      const metas = await this.listar(tipo);
      const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
      let eliminados = 0;
      for (const m of metas) {
        if (m.esReferencia) continue; // exento (DTC §8.4)
        if (new Date(m.recibido).getTime() < limite) {
          await fsp.rm(path.join(this._rutaTipo(tipo), m.nombreArchivo)).catch(() => {});
          await fsp.rm(path.join(this._rutaTipo(tipo), m.nombreArchivo + '.meta.json')).catch(() => {});
          eliminados++;
        }
      }
      resumen[tipo] = { eliminados, revisados: metas.length };
    }
    return resumen;
  }

  /**
   * Prepara los insumos para una PROPUESTA de recalibración (nunca se aplica
   * sola). El cálculo estadístico real lo ejecuta lo ya implementado en el
   * frontend (js/calibrar-analisis.js, proponerRecalibracion). Este método
   * organiza qué datasets alimentan ese análisis; NO reimplementa la
   * estadística — sería duplicar lógica ya validada y con riesgo de divergir.
   */
  async prepararInsumosParaPropuesta() {
    const datasets = await this.listar('dataset');
    return {
      totalDatasets: datasets.length,
      dispositivosDistintos: new Set(datasets.map((d) => d.dispositivo)).size,
      nota: 'El cálculo de la propuesta se ejecuta con js/calibrar-analisis.js ' +
            '(proponerRecalibracion), ya validado. Este endpoint entrega los ' +
            'datasets almacenados para que ese análisis se ejecute sobre ellos, ' +
            'sin reimplementar su lógica en el backend.',
    };
  }
}

module.exports = CalibracionServicio;
