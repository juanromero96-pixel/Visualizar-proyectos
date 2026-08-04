/**
 * middleware/permisos.js — verificación por capacidad, no solo por rol.
 * DTI §8.3: "verificación de permiso por recurso, no solo por rol".
 */
'use strict';

const { tienePermiso } = require('../permisos/roles');

function requierePermiso(permiso) {
  return (req, res, next) => {
    if (!req.sesion) return res.status(401).json({ error: 'NO_AUTENTICADO' });
    if (!tienePermiso(req.sesion.rol, permiso)) {
      return res.status(403).json({
        error: 'PERMISO_DENEGADO',
        mensaje: `El rol "${req.sesion.rol}" no tiene el permiso "${permiso}"`,
      });
    }
    next();
  };
}

module.exports = { requierePermiso };
