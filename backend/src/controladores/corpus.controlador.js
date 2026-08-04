/**
 * controladores/corpus.controlador.js
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO CRÍTICO (DTI §12.1, S-1): "La respuesta de corpus devuelve el
 * array desnudo, sin envoltorio." Es la regla más importante de este
 * archivo — romperla rompe el mural en producción. Verificado en la
 * auditoría de compatibilidad (Informe de Implementación §8).
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const { asyncManejado } = require('../middleware/errores');
const { ARCHIVOS_CORPUS } = require('../repositorios/ediciones.repositorio');
const esquemas = require('../validadores/esquemas');
const bloqueo = require('../util/bloqueo');

module.exports = function crearCorpusControlador({ edicionesRepo, backupsServicio, flujoServicio }) {
  const leer = asyncManejado(async (req, res) => {
    const { anio, tipo } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo)) return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });
    // CONTRATO S-1: sin envoltorio. `res.json(array)` ya lo cumple: Express
    // serializa exactamente lo que se le pasa, sin agregar {data:...}.
    const datos = await edicionesRepo.leerCorpus(anio, tipo);
    res.json(datos);
  });

  /** Resuelve la edición ACTIVA sin que el frontend sepa de qué año se trata (DTI §10.4). */
  const leerDeActiva = asyncManejado(async (req, res) => {
    const { tipo } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo)) return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });
    const activa = await edicionesRepo.obtenerEdicionActiva();
    if (!activa) return res.status(404).json({ error: 'SIN_EDICION_PUBLICADA' });
    const datos = await edicionesRepo.leerCorpus(activa.anio, tipo);
    res.json(datos);
  });

  const escribir = asyncManejado(async (req, res) => {
    const { anio, tipo } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo)) return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });

    const meta = await edicionesRepo.obtenerMeta(anio);
    if (!meta) return res.status(404).json({ error: 'EDICION_NO_ENCONTRADA' });
    if (flujoServicio.estaCongelado(meta.estado)) {
      const err = new Error(`La edición está en estado "${meta.estado}" y el contenido está congelado (DTC §3.3)`);
      err.codigo = 'EDICION_CONGELADA';
      throw err;
    }

    const claveBloqueo = `corpus:${anio}:${tipo}`;
    if (!bloqueo.adquirir(claveBloqueo, req.sesion.usuarioId)) {
      const err = new Error(`Otro usuario está editando ${tipo} de la edición ${anio} en este momento`);
      err.codigo = 'BLOQUEO_ACTIVO';
      throw err;
    }

    try {
      const datos = req.body;
      // Paso 1 del procedimiento de escritura atómica: validar ANTES de tocar disco.
      if (!esquemas.validarEsquema(tipo, datos)) {
        return res.status(422).json({ error: 'ESQUEMA_INVALIDO', mensaje: 'La estructura no cumple el esquema esperado' });
      }
      const camposResultado = esquemas.validarCamposObligatorios(tipo, datos);
      if (!camposResultado.valido) {
        return res.status(422).json({ error: 'CAMPOS_FALTANTES', detalle: camposResultado.errores });
      }

      // Respaldo por escritura (DTC §14.1) antes de sobrescribir.
      await backupsServicio.crearRespaldo(anio, 'por-escritura', req.sesion.usuarioId);
      await edicionesRepo.escribirCorpus(anio, tipo, datos);
      res.json({ ok: true, tipo, elementos: Array.isArray(datos) ? datos.length : 1 });
    } finally {
      bloqueo.liberar(claveBloqueo, req.sesion.usuarioId);
    }
  });

  /** PATCH de un elemento individual — más seguro que reescribir el array completo desde el panel. */
  const escribirElemento = asyncManejado(async (req, res) => {
    const { anio, tipo, id } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo) || tipo === 'config') return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });

    const meta = await edicionesRepo.obtenerMeta(anio);
    if (!meta) return res.status(404).json({ error: 'EDICION_NO_ENCONTRADA' });
    if (flujoServicio.estaCongelado(meta.estado)) {
      const err = new Error(`La edición está en estado "${meta.estado}"`); err.codigo = 'EDICION_CONGELADA'; throw err;
    }

    const datos = await edicionesRepo.leerCorpus(anio, tipo);
    const idx = datos.findIndex((el) => el.id === id);
    if (idx === -1) return res.status(404).json({ error: 'ELEMENTO_NO_ENCONTRADO' });

    const actualizado = { ...datos[idx], ...req.body, id }; // el id nunca se sobrescribe desde el cuerpo
    const copia = [...datos]; copia[idx] = actualizado;
    if (!esquemas.validarEsquema(tipo, copia)) return res.status(422).json({ error: 'ESQUEMA_INVALIDO' });

    await backupsServicio.crearRespaldo(anio, 'por-escritura', req.sesion.usuarioId);
    await edicionesRepo.escribirCorpus(anio, tipo, copia);
    res.json(actualizado);
  });

  const crearElemento = asyncManejado(async (req, res) => {
    const { anio, tipo } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo) || tipo === 'config') return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });
    const datos = await edicionesRepo.leerCorpus(anio, tipo);
    if (!req.body?.id) return res.status(400).json({ error: 'ID_REQUERIDO' });
    if (datos.some((el) => el.id === req.body.id)) return res.status(409).json({ error: 'ID_DUPLICADO' });

    const copia = [...datos, req.body];
    if (!esquemas.validarEsquema(tipo, copia)) return res.status(422).json({ error: 'ESQUEMA_INVALIDO' });

    await backupsServicio.crearRespaldo(anio, 'por-escritura', req.sesion.usuarioId);
    await edicionesRepo.escribirCorpus(anio, tipo, copia);
    res.status(201).json(req.body);
  });

  const eliminarElemento = asyncManejado(async (req, res) => {
    const { anio, tipo, id } = req.params;
    if (!ARCHIVOS_CORPUS.includes(tipo) || tipo === 'config') return res.status(404).json({ error: 'TIPO_DESCONOCIDO' });
    const datos = await edicionesRepo.leerCorpus(anio, tipo);
    const existe = datos.some((el) => el.id === id);
    if (!existe) return res.status(404).json({ error: 'ELEMENTO_NO_ENCONTRADO' });

    await backupsServicio.crearRespaldo(anio, 'por-escritura', req.sesion.usuarioId);
    await edicionesRepo.escribirCorpus(anio, tipo, datos.filter((el) => el.id !== id));
    res.json({ ok: true, eliminado: id });
  });

  // ── Configuración del Motor Editorial (DTC §9.3, nivel rojo) ────────────
  const leerConfigMotor = asyncManejado(async (req, res) => {
    res.json(await edicionesRepo.leerConfigMotor(req.params.anio));
  });

  const escribirConfigMotor = asyncManejado(async (req, res) => {
    // Salvaguarda 2 (DTC §9.3): advertencia si el valor difiere del calibrado.
    // Se devuelve como parte de la respuesta para que el panel la muestre;
    // no bloquea la escritura (es Superadministrador quien decide, informado).
    const actual = await edicionesRepo.leerConfigMotor(req.params.anio);
    await backupsServicio.crearRespaldo(req.params.anio, 'por-escritura', req.sesion.usuarioId);
    await edicionesRepo.escribirConfigMotor(req.params.anio, req.body);
    res.json({ ok: true, anterior: actual, nuevo: req.body,
      advertencia: 'Cambio registrado en auditoría. Ver Informe de Implementación §5.3: ' +
                   'este valor aún no es consumido por js/autocorreccion/constantes.js.' });
  });

  return { leer, leerDeActiva, escribir, escribirElemento, crearElemento, eliminarElemento,
            leerConfigMotor, escribirConfigMotor };
};
