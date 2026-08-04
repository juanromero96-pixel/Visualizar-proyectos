'use strict';

const { asyncManejado } = require('../middleware/errores');
const { PERMISOS, tienePermiso } = require('../permisos/roles');

// Cada acción de la máquina de estados exige un permiso distinto (DTC cap.1:
// Editor puede enviar_revision pero no publicar; Revisor puede aprobar o
// devolver pero no publicar). Se verifica aquí, dentro del controlador, en
// vez de en el router genérico — ver la nota al final de rutas.js.
const ACCION_A_PERMISO = Object.freeze({
  enviar_edicion: PERMISOS.FLUJO_ENVIAR_EDICION,
  enviar_revision: PERMISOS.FLUJO_ENVIAR_REVISION,
  aprobar: PERMISOS.FLUJO_APROBAR,
  devolver: PERMISOS.FLUJO_DEVOLVER,
  publicar: PERMISOS.FLUJO_PUBLICAR,
  despublicar: PERMISOS.FLUJO_DESPUBLICAR,
  archivar: PERMISOS.FLUJO_ARCHIVAR,
});

module.exports = function crearEdicionesControlador({ edicionesRepo, flujoServicio }) {
  const listar = asyncManejado(async (req, res) => {
    res.json(await edicionesRepo.listarEdiciones());
  });

  const obtener = asyncManejado(async (req, res) => {
    const meta = await edicionesRepo.obtenerMeta(req.params.anio);
    if (!meta) return res.status(404).json({ error: 'EDICION_NO_ENCONTRADA' });
    res.json(meta);
  });

  const obtenerActiva = asyncManejado(async (req, res) => {
    const activa = await edicionesRepo.obtenerEdicionActiva();
    if (!activa) return res.status(404).json({ error: 'SIN_EDICION_PUBLICADA', mensaje: 'Ninguna edición está publicada' });
    res.json(activa);
  });

  /** DTC §10.2: clonar como plantilla. */
  const crear = asyncManejado(async (req, res) => {
    const { anio, anioOrigen } = req.body || {};
    if (!anio || !/^\d{4}$/.test(String(anio))) {
      return res.status(400).json({ error: 'ANIO_INVALIDO', mensaje: 'anio debe ser un año de 4 dígitos' });
    }
    const meta = await edicionesRepo.crearDesdeOrigen(anio, anioOrigen, req.sesion.correo);
    res.status(201).json(meta);
  });

  /** Transición genérica de estado (DTC cap.3). Permiso verificado por acción. */
  const transicionar = asyncManejado(async (req, res) => {
    const { accion, comentario } = req.body || {};
    if (!accion) return res.status(400).json({ error: 'ACCION_REQUERIDA' });

    const permisoNecesario = ACCION_A_PERMISO[accion];
    if (!permisoNecesario) return res.status(400).json({ error: 'ACCION_DESCONOCIDA', accionesValidas: Object.keys(ACCION_A_PERMISO) });
    if (!tienePermiso(req.sesion.rol, permisoNecesario)) {
      return res.status(403).json({ error: 'PERMISO_DENEGADO', mensaje: `El rol "${req.sesion.rol}" no puede "${accion}"` });
    }

    const meta = await flujoServicio.transicionar(req.params.anio, accion, {
      usuarioId: req.sesion.usuarioId, correo: req.sesion.correo, rol: req.sesion.rol,
      ip: req.ip, comentario,
    });
    res.json(meta);
  });

  const correccionUrgencia = asyncManejado(async (req, res) => {
    const { tipo, elementoId, campo, valorNuevo, justificacion } = req.body || {};
    if (!tipo || !elementoId || !campo || valorNuevo === undefined) {
      return res.status(400).json({ error: 'DATOS_INCOMPLETOS' });
    }
    const resultado = await flujoServicio.correccionDeUrgencia(req.params.anio, tipo, elementoId, campo, valorNuevo, {
      usuarioId: req.sesion.usuarioId, correo: req.sesion.correo, rol: req.sesion.rol,
      ip: req.ip, justificacion,
    });
    res.json(resultado);
  });

  return { listar, obtener, obtenerActiva, crear, transicionar, correccionUrgencia };
};
