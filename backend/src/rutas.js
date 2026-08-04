/**
 * rutas.js — Ensambla la API completa (DTI §6.3) con los permisos exactos
 * de permisos/roles.js. Cada ruta declara qué capacidad requiere; el
 * middleware requierePermiso() la verifica contra el rol de la sesión.
 */
'use strict';

const express = require('express');
const { requiereSesion, sesionOpcional } = require('./middleware/autenticacion');
const { requierePermiso } = require('./middleware/permisos');
const { auditarEscritura } = require('./middleware/auditoria');
const { PERMISOS } = require('./permisos/roles');

function construirRouter(deps) {
  const router = express.Router();
  const auth = requiereSesion(deps.authServicio);

  // ── AUTENTICACIÓN (pública, con límite de tasa propio montado en servidor.js) ──
  router.post('/auth/login', deps.authControlador.login);
  router.post('/auth/logout', auth, deps.authControlador.logout);
  router.get('/auth/sesion', auth, deps.authControlador.sesionActual);
  router.post('/auth/cambiar-clave', auth, deps.authControlador.cambiarClave);
  router.get('/auth/roles', auth, (req, res) => res.json(require('./permisos/roles').listaDeRoles()));

  // ── EDICIÓN ACTIVA (pública — S-2 del DTI: el mural no requiere sesión) ──
  router.get('/ediciones/activa', deps.edicionesControlador.obtenerActiva);
  router.get('/ediciones/activa/corpus/:tipo', deps.corpusControlador.leerDeActiva);

  // ── EDICIONES (requieren sesión) ──────────────────────────────────────
  router.get('/ediciones', auth, requierePermiso(PERMISOS.EDICIONES_LEER), deps.edicionesControlador.listar);
  router.get('/ediciones/:anio', auth, requierePermiso(PERMISOS.EDICIONES_LEER), deps.edicionesControlador.obtener);
  router.post('/ediciones', auth, requierePermiso(PERMISOS.EDICIONES_CREAR),
    auditarEscritura(deps.auditoriaRepo, 'ediciones:crear', (r) => `edicion:${r.body?.anio}`),
    deps.edicionesControlador.crear);
  router.post('/ediciones/:anio/transicion', auth, deps.edicionesControlador.transicionar); // el permiso se valida DENTRO según la acción (ver nota abajo)
  router.post('/ediciones/:anio/correccion-urgencia', auth, requierePermiso(PERMISOS.FLUJO_CORRECCION_URGENCIA),
    deps.edicionesControlador.correccionUrgencia);

  // ── CORPUS de una edición concreta ──────────────────────────────────────
  router.get('/ediciones/:anio/corpus/:tipo', auth, requierePermiso(PERMISOS.CORPUS_LEER), deps.corpusControlador.leer);
  router.put('/ediciones/:anio/corpus/:tipo', auth, requierePermiso(PERMISOS.CORPUS_ESCRIBIR),
    auditarEscritura(deps.auditoriaRepo, 'corpus:escribir', (r) => `${r.params.tipo}`),
    deps.corpusControlador.escribir);
  router.post('/ediciones/:anio/corpus/:tipo', auth, requierePermiso(PERMISOS.CORPUS_ESCRIBIR),
    auditarEscritura(deps.auditoriaRepo, 'corpus:crear_elemento', (r) => `${r.params.tipo}:${r.body?.id}`),
    deps.corpusControlador.crearElemento);
  router.patch('/ediciones/:anio/corpus/:tipo/:id', auth, requierePermiso(PERMISOS.CORPUS_ESCRIBIR),
    auditarEscritura(deps.auditoriaRepo, 'corpus:modificar_elemento', (r) => `${r.params.tipo}:${r.params.id}`),
    deps.corpusControlador.escribirElemento);
  router.delete('/ediciones/:anio/corpus/:tipo/:id', auth, requierePermiso(PERMISOS.CORPUS_ESCRIBIR),
    auditarEscritura(deps.auditoriaRepo, 'corpus:eliminar_elemento', (r) => `${r.params.tipo}:${r.params.id}`),
    deps.corpusControlador.eliminarElemento);

  // ── PARÁMETROS DEL MOTOR EDITORIAL (nivel rojo, DTC §9.3) ───────────────
  router.get('/ediciones/:anio/config-motor', auth, requierePermiso(PERMISOS.MOTOR_PARAMS_LEER), deps.corpusControlador.leerConfigMotor);
  router.put('/ediciones/:anio/config-motor', auth, requierePermiso(PERMISOS.MOTOR_PARAMS_ESCRIBIR),
    auditarEscritura(deps.auditoriaRepo, 'motor:parametros:escribir', () => 'config-motor'),
    deps.corpusControlador.escribirConfigMotor);

  // ── MULTIMEDIA ────────────────────────────────────────────────────────
  router.post('/ediciones/:anio/multimedia', auth, requierePermiso(PERMISOS.MULTIMEDIA_ESCRIBIR), deps.multimediaControlador.subir);
  router.get('/ediciones/:anio/multimedia', auth, requierePermiso(PERMISOS.MULTIMEDIA_LEER), deps.multimediaControlador.inventario);
  router.get('/ediciones/:anio/multimedia/huerfanos', auth, requierePermiso(PERMISOS.MULTIMEDIA_LEER), deps.multimediaControlador.huerfanos);
  router.delete('/ediciones/:anio/multimedia/:categoria/:identificador', auth, requierePermiso(PERMISOS.MULTIMEDIA_ESCRIBIR), deps.multimediaControlador.eliminar);

  // ── BACKUPS ───────────────────────────────────────────────────────────
  router.get('/ediciones/:anio/backups', auth, requierePermiso(PERMISOS.BACKUPS_LEER), deps.backupsControlador.listar);
  router.post('/ediciones/:anio/backups', auth, requierePermiso(PERMISOS.BACKUPS_LEER), deps.backupsControlador.crear);
  router.post('/ediciones/:anio/backups/:id/restaurar', auth, requierePermiso(PERMISOS.BACKUPS_RESTAURAR), deps.backupsControlador.restaurar);
  router.get('/ediciones/:anio/backups-comparar', auth, requierePermiso(PERMISOS.BACKUPS_LEER), deps.backupsControlador.comparar);

  // ── AUDITORÍA ─────────────────────────────────────────────────────────
  router.get('/auditoria', auth, requierePermiso(PERMISOS.AUDITORIA_LEER), deps.auditoriaControlador.consultar);
  router.get('/auditoria/integridad/:archivo', auth, requierePermiso(PERMISOS.AUDITORIA_LEER), deps.auditoriaControlador.verificarIntegridad);

  // ── CALIBRACIÓN ───────────────────────────────────────────────────────
  router.post('/calibracion', auth, requierePermiso(PERMISOS.CALIBRACION_ESCRIBIR), deps.calibracionControlador.subir);
  router.get('/calibracion/:tipo', auth, requierePermiso(PERMISOS.CALIBRACION_LEER), deps.calibracionControlador.listar);
  router.get('/calibracion-huecos', auth, requierePermiso(PERMISOS.CALIBRACION_LEER), deps.calibracionControlador.huecos);
  router.post('/calibracion/referencia', auth, requierePermiso(PERMISOS.CALIBRACION_LEER), deps.calibracionControlador.marcarReferencia);

  // ── USUARIOS (solo Superadministrador vía permiso USUARIOS_GESTIONAR) ──
  router.get('/usuarios', auth, requierePermiso(PERMISOS.USUARIOS_GESTIONAR), deps.usuariosControlador.listar);
  router.post('/usuarios', auth, requierePermiso(PERMISOS.USUARIOS_GESTIONAR), deps.usuariosControlador.crear);
  router.post('/usuarios/:id/desactivar', auth, requierePermiso(PERMISOS.USUARIOS_GESTIONAR), deps.usuariosControlador.desactivar);
  router.get('/roles', auth, deps.usuariosControlador.roles); // lectura: cualquier sesión puede ver qué roles existen

  // ── ESTADO DEL SISTEMA (DTC cap.12) ──────────────────────────────────────
  router.get('/estado', auth, deps.estadoControlador.estado);

  return router;
}

module.exports = construirRouter;

/**
 * NOTA sobre /ediciones/:anio/transicion: la acción (enviar_edicion,
 * enviar_revision, aprobar, devolver, publicar, despublicar, archivar)
 * viene en el cuerpo, no en la ruta, porque son 7 acciones sobre el mismo
 * recurso y cada una requiere un permiso DISTINTO (DTC cap.1: Editor puede
 * enviar_revision pero no publicar; Revisor puede aprobar/devolver pero no
 * publicar). Verificar el permiso ANTES del router (con una tabla acción→
 * permiso) exigiría leer el cuerpo antes del middleware de permisos, lo que
 * Express no hace de forma nativa sin buffering adicional. Se optó por
 * verificar el permiso DENTRO de flujoEditorial.servicio.js — ver
 * verificarPermisoDeTransicion() invocado desde el controlador — documentado
 * como decisión de implementación en el Informe §5.4.
 */
