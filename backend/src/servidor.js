/**
 * servidor.js — Punto de entrada. Inyección de dependencias manual (sin
 * framework de DI): el grafo es pequeño y explícito, y mantenerlo visible en
 * un solo archivo facilita entender qué depende de qué — relevante para el
 * riesgo de continuidad declarado en DTC §18.2 (una sola persona mantiene
 * el sistema hoy; que el ensamblado sea legible ayuda a quien lo herede).
 */
'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config');

const UsuariosRepositorio = require('./repositorios/usuarios.repositorio');
const { EdicionesRepositorio } = require('./repositorios/ediciones.repositorio');
const AuditoriaRepositorio = require('./repositorios/auditoria.repositorio');

const ProveedorLocal = require('./proveedoresAuth/ProveedorLocal');
const AuthServicio = require('./servicios/auth.servicio');
const FlujoEditorialServicio = require('./servicios/flujoEditorial.servicio');
const ValidacionServicio = require('./servicios/validacion.servicio');
const BackupsServicio = require('./servicios/backups.servicio');
const CalibracionServicio = require('./servicios/calibracion.servicio');
const { MultimediaServicio } = require('./servicios/multimedia.servicio');

const crearAuthControlador = require('./controladores/auth.controlador');
const crearCorpusControlador = require('./controladores/corpus.controlador');
const crearEdicionesControlador = require('./controladores/ediciones.controlador');
const crearMultimediaControlador = require('./controladores/multimedia.controlador');
const {
  crearBackupsControlador, crearAuditoriaControlador, crearCalibracionControlador,
  crearUsuariosControlador, crearEstadoControlador,
} = require('./controladores/sistema.controlador');

const { cabecerasSeguridad, cors, limiteDeTasa, limiteDeTasaLogin } = require('./middleware/seguridad');
const { manejadorDeErrores } = require('./middleware/errores');
const construirRouter = require('./rutas');

function crearAplicacion() {
  // ── Repositorios (única capa que toca disco) ────────────────────────────
  const usuariosRepo = new UsuariosRepositorio(config.rutaAlmacen);
  const edicionesRepo = new EdicionesRepositorio(config.rutaAlmacen);
  const auditoriaRepo = new AuditoriaRepositorio(config.rutaAlmacen);

  // ── Autenticación (DTI §7.5: proveedor intercambiable) ──────────────────
  const proveedor = new ProveedorLocal(usuariosRepo);
  const authServicio = new AuthServicio(proveedor, usuariosRepo);

  // ── Servicios ────────────────────────────────────────────────────────────
  const backupsServicio = new BackupsServicio(edicionesRepo, config.rutaAlmacen);
  const validacionServicio = new ValidacionServicio(edicionesRepo, config.rutaAlmacen);
  const flujoServicio = new FlujoEditorialServicio(edicionesRepo, validacionServicio, backupsServicio, auditoriaRepo);
  const calibracionServicio = new CalibracionServicio(config.rutaAlmacen);
  const multimediaServicio = new MultimediaServicio(config.rutaAlmacen);

  // ── Controladores ────────────────────────────────────────────────────────
  const authControlador = crearAuthControlador({ authServicio, auditoriaRepo, config });
  const corpusControlador = crearCorpusControlador({ edicionesRepo, backupsServicio, flujoServicio });
  const edicionesControlador = crearEdicionesControlador({ edicionesRepo, flujoServicio });
  const multimediaControlador = crearMultimediaControlador({ multimediaServicio, edicionesRepo });
  const backupsControlador = crearBackupsControlador({ backupsServicio });
  const auditoriaControlador = crearAuditoriaControlador({ auditoriaRepo });
  const calibracionControlador = crearCalibracionControlador({ calibracionServicio });
  const usuariosControlador = crearUsuariosControlador({ usuariosRepo, authServicio, auditoriaRepo });
  const estadoControlador = crearEstadoControlador({
    edicionesRepo, backupsServicio, auditoriaRepo, calibracionServicio, flujoServicio,
    rutaAlmacen: config.rutaAlmacen,
  });

  // ── Aplicación Express ────────────────────────────────────────────────────
  const app = express();
  app.set('trust proxy', 1); // detrás de Nginx (DTI §15): confía en X-Forwarded-For para req.ip

  app.use(cabecerasSeguridad);
  app.use(cors(config.origenPermitido));
  app.use(express.json({ limit: '2mb' })); // el corpus completo pesa 69,8 KB medidos; 2MB es holgado
  app.use(cookieParser(config.sesionSecreto));
  app.use(limiteDeTasa()); // límite general; Nginx aplica uno equivalente por delante en producción (DTI §15)
  app.use('/api/v1/auth/login', limiteDeTasaLogin());

  const router = construirRouter({
    authServicio, authControlador, corpusControlador, edicionesControlador,
    multimediaControlador, backupsControlador, auditoriaControlador,
    calibracionControlador, usuariosControlador, estadoControlador, auditoriaRepo,
  });
  app.use('/api/v1', router);

  app.use((req, res) => res.status(404).json({ error: 'RUTA_NO_ENCONTRADA' }));
  app.use(manejadorDeErrores);

  return { app, dependencias: {
    usuariosRepo, edicionesRepo, auditoriaRepo, authServicio, backupsServicio,
    validacionServicio, flujoServicio, calibracionServicio, multimediaServicio,
  } };
}

function iniciar() {
  const { app } = crearAplicacion();
  app.listen(config.puerto, () => {
    console.log(`[servidor] Compendio UNaM backend escuchando en :${config.puerto} (${config.entorno})`);
    console.log(`[servidor] Almacén de datos: ${config.rutaAlmacen}`);
  });
  return app;
}

module.exports = { crearAplicacion, iniciar };

if (require.main === module) iniciar();
