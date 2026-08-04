/**
 * middleware/auditoria.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Registra automáticamente cada operación de escritura, con los 10 campos
 * exigidos por DTC §5.2. No requiere que cada controlador recuerde llamar
 * a auditoría — se engancha en la respuesta.
 *
 * Regla crítica (DTC §5.3.5): "Nunca registra credenciales." Por eso este
 * middleware NUNCA loguea req.body completo si la ruta es de autenticación
 * (se excluye explícitamente más abajo) — solo el resultado de la operación.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const RUTAS_SIN_CUERPO_EN_AUDITORIA = ['/auth/login', '/auth/cambiar-clave'];

function auditarEscritura(auditoriaRepo, operacion, recursoFn) {
  return async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = (cuerpo) => {
      const exito = res.statusCode >= 200 && res.statusCode < 300;
      const esRutaSensible = RUTAS_SIN_CUERPO_EN_AUDITORIA.some((r) => req.path.includes(r));
      auditoriaRepo.registrar({
        usuarioId: req.sesion?.usuarioId || null,
        correo: req.sesion?.correo || null,
        rol: req.sesion?.rol || null,
        ip: req.ip,
        operacion,
        recurso: typeof recursoFn === 'function' ? recursoFn(req) : recursoFn,
        edicion: req.params?.anio || null,
        valorNuevo: esRutaSensible ? '[omitido — ruta sensible]' : undefined,
        resultado: exito ? 'exito' : `fallo:${res.statusCode}`,
        origen: 'api',
      }).catch((e) => console.error('[auditoria] error al registrar:', e.message));
      return original(cuerpo);
    };
    next();
  };
}

module.exports = { auditarEscritura };
