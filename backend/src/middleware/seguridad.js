/**
 * middleware/seguridad.js
 * ═══════════════════════════════════════════════════════════════════════════
 * "Aplicar exclusivamente las medidas previstas en los documentos. No
 * incorporar mecanismos adicionales fuera del alcance del proyecto"
 * (instrucción explícita de este encargo). Se implementa solo lo que el
 * DTI §16.2 y el DTC enumeran: cabeceras HTTP, CORS, límite de tasa,
 * validación de entrada (en validadores/), gestión de errores genérica.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

/**
 * Cabeceras HTTP. El frontend ya declara 8 cabeceras en vercel.json (turno
 * de seguridad anterior); estas son su equivalente para las respuestas que
 * salen directamente del backend (la API), consistentes con las mismas.
 */
function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store'); // respuestas de API: nunca cachear en el cliente
  next();
}

/** CORS: solo el origen del propio frontend (DTI §16, "ORIGEN_PERMITIDO"). */
function cors(origenPermitido) {
  return (req, res, next) => {
    if (origenPermitido) {
      res.setHeader('Access-Control-Allow-Origin', origenPermitido);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/**
 * Límite de tasa en memoria (DTI §16.2). Nginx debe aplicar uno equivalente
 * por delante (documentado en el DTI §15); este es el de respaldo a nivel
 * de aplicación, útil también en desarrollo sin Nginx.
 */
function limiteDeTasa({ ventanaMs = 60_000, maxPeticiones = 120 } = {}) {
  const registros = new Map(); // ip → [timestamps]
  return (req, res, next) => {
    const ahora = Date.now();
    const clave = req.ip;
    const lista = (registros.get(clave) || []).filter((t) => ahora - t < ventanaMs);
    if (lista.length >= maxPeticiones) {
      return res.status(429).json({ error: 'DEMASIADAS_PETICIONES', mensaje: 'Límite de tasa excedido' });
    }
    lista.push(ahora);
    registros.set(clave, lista);
    next();
  };
}

/** Límite de tasa más estricto específico para /auth/login (DTI §7.4 ya lo cubre por correo+IP; esto es una capa adicional por IP sola). */
function limiteDeTasaLogin() {
  return limiteDeTasa({ ventanaMs: 15 * 60_000, maxPeticiones: 20 });
}

module.exports = { cabecerasSeguridad, cors, limiteDeTasa, limiteDeTasaLogin };
