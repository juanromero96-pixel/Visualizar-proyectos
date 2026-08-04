/**
 * controladores/sistema.controlador.js
 * Agrupa backups, auditoría, calibración, usuarios y estado del sistema
 * (DTC cap.4, 5, 8, 12) en un único archivo: son controladores pequeños,
 * cada uno de una sola responsabilidad, y agruparlos evita 5 archivos de
 * 15 líneas — la separación real de responsabilidades vive en los servicios
 * y repositorios, no en cuántos archivos de rutas HTTP existan.
 */
'use strict';

const { asyncManejado } = require('../middleware/errores');
const { listaDeRoles } = require('../permisos/roles');

function crearBackupsControlador({ backupsServicio }) {
  const listar = asyncManejado(async (req, res) => res.json(await backupsServicio.listarRespaldos(req.params.anio)));
  const crear = asyncManejado(async (req, res) => {
    const r = await backupsServicio.crearRespaldo(req.params.anio, 'manual', req.sesion.usuarioId);
    res.status(201).json(r);
  });
  const restaurar = asyncManejado(async (req, res) => {
    const r = await backupsServicio.restaurar(req.params.anio, req.params.id, req.sesion.usuarioId);
    res.json(r);
  });
  const comparar = asyncManejado(async (req, res) => {
    const { idA, idB, tipo } = req.query;
    if (!idA || !idB || !tipo) return res.status(400).json({ error: 'PARAMETROS_REQUERIDOS', mensaje: 'idA, idB y tipo son obligatorios' });
    res.json(await backupsServicio.comparar(req.params.anio, idA, idB, tipo));
  });
  return { listar, crear, restaurar, comparar };
}

function crearAuditoriaControlador({ auditoriaRepo }) {
  const consultar = asyncManejado(async (req, res) => {
    const { desde, hasta, usuarioId, recurso, operacion } = req.query;
    res.json(await auditoriaRepo.consultar({ desde, hasta, usuarioId, recurso, operacion }));
  });
  const verificarIntegridad = asyncManejado(async (req, res) => {
    res.json(await auditoriaRepo.verificarIntegridad(req.params.archivo));
  });
  return { consultar, verificarIntegridad };
}

function crearCalibracionControlador({ calibracionServicio }) {
  const subir = asyncManejado(async (req, res) => {
    const { tipo, nombreArchivo, contenido, dispositivo, build } = req.body || {};
    if (!tipo || !nombreArchivo || !contenido) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' });
    const meta = await calibracionServicio.almacenar({ tipo, nombreArchivo, contenido, dispositivo, build });
    res.status(201).json(meta);
  });
  const listar = asyncManejado(async (req, res) => res.json(await calibracionServicio.listar(req.params.tipo)));
  const huecos = asyncManejado(async (req, res) => res.json(await calibracionServicio.huecosDeCobertura()));
  const marcarReferencia = asyncManejado(async (req, res) => {
    const { tipo, nombreArchivo } = req.body || {};
    res.json(await calibracionServicio.marcarComoReferencia(tipo, nombreArchivo, true));
  });
  return { subir, listar, huecos, marcarReferencia };
}

function crearUsuariosControlador({ usuariosRepo, authServicio, auditoriaRepo }) {
  const ProveedorLocal = require('../proveedoresAuth/ProveedorLocal');

  const listar = asyncManejado(async (req, res) => res.json(await usuariosRepo.listar()));

  const crear = asyncManejado(async (req, res) => {
    const { correo, clave, nombre, rol } = req.body || {};
    if (!correo || !clave || !rol) return res.status(400).json({ error: 'DATOS_INCOMPLETOS' });
    if (clave.length < 12) return res.status(400).json({ error: 'CLAVE_DEBIL', mensaje: 'Mínimo 12 caracteres' });
    const { ROLES } = require('../permisos/roles');
    if (!ROLES[rol]) return res.status(400).json({ error: 'ROL_INVALIDO', roles: Object.keys(ROLES) });

    const hash = await ProveedorLocal.hashear(clave);
    const usuario = {
      id: 'usr_' + Date.now().toString(36), correo, nombre: nombre || correo,
      hash, rol, activo: true, debeCambiarContrasena: true, creado: new Date().toISOString(),
    };
    await usuariosRepo.crear(usuario);
    await auditoriaRepo.registrar({
      usuarioId: req.sesion.usuarioId, correo: req.sesion.correo, rol: req.sesion.rol, ip: req.ip,
      operacion: 'usuarios:crear', recurso: `usuario:${usuario.id}`, valorNuevo: { correo, rol }, resultado: 'exito',
    });
    const { hash: _omitido, ...sinHash } = usuario;
    res.status(201).json(sinHash);
  });

  const desactivar = asyncManejado(async (req, res) => {
    await usuariosRepo.actualizar(req.params.id, { activo: false });
    authServicio.cerrarTodasLasSesionesDe(req.params.id);
    await auditoriaRepo.registrar({
      usuarioId: req.sesion.usuarioId, correo: req.sesion.correo, rol: req.sesion.rol, ip: req.ip,
      operacion: 'usuarios:desactivar', recurso: `usuario:${req.params.id}`, resultado: 'exito',
    });
    res.json({ ok: true });
  });

  const roles = (req, res) => res.json(listaDeRoles());

  return { listar, crear, desactivar, roles };
}

function crearEstadoControlador({ edicionesRepo, backupsServicio, auditoriaRepo, calibracionServicio, flujoServicio, rutaAlmacen }) {
  const fsp = require('fs').promises;
  const path = require('path');

  const estado = asyncManejado(async (req, res) => {
    const ediciones = await edicionesRepo.listarEdiciones();
    const activa = ediciones.find((e) => e.estado === 'publicada') || null;

    let espacioAlmacen = null;
    try {
      const du = require('child_process').execSync(`du -sk "${rutaAlmacen}"`).toString().split('\t')[0];
      espacioAlmacen = Number(du) * 1024;
    } catch { /* du puede no estar disponible; no es crítico */ }

    const respaldosRecientes = activa ? await backupsServicio.listarRespaldos(activa.anio) : [];
    const ultimoRespaldo = respaldosRecientes[0] || null;

    res.json({
      generado: new Date().toISOString(),
      ediciones: { total: ediciones.length, porEstado: ediciones.reduce((acc, e) => {
        acc[e.estado] = (acc[e.estado] || 0) + 1; return acc;
      }, {}) },
      edicionActiva: activa ? { anio: activa.anio, publicada: activa.publicada } : null,
      ultimoRespaldo: ultimoRespaldo ? { id: ultimoRespaldo.id, ts: ultimoRespaldo.ts, motivo: ultimoRespaldo.motivo } : null,
      espacioAlmacenBytes: espacioAlmacen,
      huecosDeCalibracion: await calibracionServicio.huecosDeCobertura(),
      correccionesUrgenciaTrimestre: activa ? await flujoServicio.correccionesUrgenciaTrimestre() : 0,
    });
  });

  return { estado };
}

module.exports = {
  crearBackupsControlador, crearAuditoriaControlador, crearCalibracionControlador,
  crearUsuariosControlador, crearEstadoControlador,
};
