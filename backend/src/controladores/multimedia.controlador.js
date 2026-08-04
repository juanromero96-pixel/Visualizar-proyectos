'use strict';

const multer = require('multer');
const { asyncManejado } = require('../middleware/errores');

// En memoria, no en disco directamente: verificarImagenReal() necesita el
// buffer completo antes de decidir dónde (o si) escribirlo (DTC §11.4).
const subidaEnMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB, techo de DTC §6.2 para imágenes
}).single('archivo');

module.exports = function crearMultimediaControlador({ multimediaServicio, edicionesRepo }) {
  const subir = (req, res, next) => {
    subidaEnMemoria(req, res, async (err) => {
      if (err) return res.status(400).json({ error: 'SUBIDA_INVALIDA', mensaje: err.message });
      if (!req.file) return res.status(400).json({ error: 'ARCHIVO_REQUERIDO' });
      const { categoria, identificador } = req.body || {};
      if (!categoria || !identificador) return res.status(400).json({ error: 'DATOS_INCOMPLETOS', mensaje: 'categoria e identificador son obligatorios' });

      try {
        const resultado = await multimediaServicio.subir({
          anio: req.params.anio, categoria, identificador,
          buffer: req.file.buffer, nombreOriginal: req.file.originalname,
        });
        res.status(201).json(resultado);
      } catch (e) { next(e); }
    });
  };

  const inventario = asyncManejado(async (req, res) => {
    res.json(await multimediaServicio.listarInventario(req.params.anio));
  });

  const huerfanos = asyncManejado(async (req, res) => {
    res.json(await multimediaServicio.encontrarHuerfanos(req.params.anio, edicionesRepo));
  });

  const eliminar = asyncManejado(async (req, res) => {
    const { categoria, identificador } = req.params;
    res.json(await multimediaServicio.eliminar(req.params.anio, categoria, identificador));
  });

  return { subir, inventario, huerfanos, eliminar };
};
