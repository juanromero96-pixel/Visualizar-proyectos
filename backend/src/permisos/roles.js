/**
 * permisos/roles.js — Modelo de permisos (DTI §8, DTC cap.1)
 * ═══════════════════════════════════════════════════════════════════════════
 * RESOLUCIÓN DE INCONSISTENCIA ENTRE DOCUMENTOS — documentada explícitamente
 * porque el encargo de implementación exige justificar cada resolución:
 *
 *   DTI  §8.2  → Administrador General, Editor, Editor Multimedia, Revisor,
 *                Solo Lectura, Auditor                          (6 roles)
 *   DTC  cap.1 → Superadministrador, Administrador, Editor, Revisor,
 *                Solo lectura                                   (5 roles)
 *   Este encargo → Administrador, Editor, Operador, Auditor,
 *                Solo Lectura                                   (5 roles)
 *
 * Los tres difieren. Se resuelve así:
 *
 *   1. DTC es la especificación MÁS DETALLADA (tablas completas de qué puede
 *      y no puede cada rol) y la MÁS RECIENTE (documento complementario que
 *      refina al DTI). Se toma como base.
 *   2. DTC introdujo "Superadministrador" separando la custodia técnica
 *      (gestión de usuarios, parámetros del motor, restauración) de la
 *      gestión editorial (Administrador). Es una elaboración de DTI, no una
 *      contradicción: DTC cap.1.2 dice explícitamente que Administrador
 *      "no puede" hacer esas tres cosas — reservándolas para Superadmin.
 *   3. "Auditor" aparece en DTI y en este encargo, con función propia y sin
 *      solapar a ningún otro rol (lectura + acceso al registro de auditoría,
 *      que "Solo Lectura" no tiene por DTC cap.1.2). Se conserva.
 *   4. "Operador" (este encargo) y "Editor Multimedia" (DTI) NO tienen tabla
 *      de responsabilidades en ningún documento — son nombres sin contenido
 *      definido. Implementar uno de los dos exigiría INVENTAR permisos que
 *      ningún documento estableció, lo que el encargo prohíbe explícitamente
 *      ("no simplifiques... o reemplaces decisiones definidas"). Su función
 *      previsible (multimedia) ya la cubre "Editor" en DTC cap.1.2 ("Subir y
 *      organizar activos"). No se crea ninguno de los dos.
 *
 * RESULTADO: 6 roles, superconjunto de las dos especificaciones completas.
 *   superadministrador · administrador · editor · revisor · auditor · solo_lectura
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

// Permisos con forma recurso:accion:alcance (DTI §8.1).
const PERMISOS = Object.freeze({
  // Contenido
  CORPUS_LEER: 'corpus:leer',
  CORPUS_ESCRIBIR: 'corpus:escribir',
  MULTIMEDIA_LEER: 'multimedia:leer',
  MULTIMEDIA_ESCRIBIR: 'multimedia:escribir',
  IDENTIDAD_LEER: 'identidad:leer',
  IDENTIDAD_ESCRIBIR: 'identidad:escribir',

  // Flujo editorial (DTC cap.3)
  FLUJO_ENVIAR_EDICION: 'flujo:enviar_edicion',       // borrador → en_edicion
  FLUJO_ENVIAR_REVISION: 'flujo:enviar_revision',      // en_edicion → en_revision
  FLUJO_APROBAR: 'flujo:aprobar',                      // en_revision → aprobado (Revisor)
  FLUJO_DEVOLVER: 'flujo:devolver',                    // en_revision → en_edicion (Revisor)
  FLUJO_PUBLICAR: 'flujo:publicar',                    // aprobado → publicado
  FLUJO_DESPUBLICAR: 'flujo:despublicar',
  FLUJO_ARCHIVAR: 'flujo:archivar',
  FLUJO_CORRECCION_URGENCIA: 'flujo:correccion_urgencia', // DTC §3.4

  // Ediciones (DTC cap.10)
  EDICIONES_LEER: 'ediciones:leer',
  EDICIONES_CREAR: 'ediciones:crear',

  // Motor Editorial (DTC cap.9, nivel rojo)
  MOTOR_PARAMS_LEER: 'motor:parametros:leer',
  MOTOR_PARAMS_ESCRIBIR: 'motor:parametros:escribir',

  // Sistema
  USUARIOS_GESTIONAR: 'usuarios:gestionar',
  BACKUPS_LEER: 'backups:leer',
  BACKUPS_RESTAURAR: 'backups:restaurar',
  AUDITORIA_LEER: 'auditoria:leer',
  CALIBRACION_LEER: 'calibracion:leer',
  CALIBRACION_ESCRIBIR: 'calibracion:escribir', // recibir exportaciones de /calibrar
});

const ROLES = Object.freeze({
  // ── Superadministrador (DTC cap.1.2) ─────────────────────────────────────
  superadministrador: {
    etiqueta: 'Superadministrador',
    descripcion: 'Custodia técnica del sistema. El más restringido en asignación, el más amplio en permisos.',
    permisos: Object.values(PERMISOS), // todos, sin excepción funcional
  },

  // ── Administrador (DTC cap.1.2) ──────────────────────────────────────────
  administrador: {
    etiqueta: 'Administrador',
    descripcion: 'Gestión editorial completa de una o varias ediciones.',
    permisos: [
      PERMISOS.CORPUS_LEER, PERMISOS.CORPUS_ESCRIBIR,
      PERMISOS.MULTIMEDIA_LEER, PERMISOS.MULTIMEDIA_ESCRIBIR,
      PERMISOS.IDENTIDAD_LEER, PERMISOS.IDENTIDAD_ESCRIBIR,
      PERMISOS.FLUJO_ENVIAR_EDICION, PERMISOS.FLUJO_ENVIAR_REVISION,
      PERMISOS.FLUJO_PUBLICAR, PERMISOS.FLUJO_DESPUBLICAR, PERMISOS.FLUJO_ARCHIVAR,
      PERMISOS.FLUJO_CORRECCION_URGENCIA,
      PERMISOS.EDICIONES_LEER, PERMISOS.EDICIONES_CREAR,
      PERMISOS.MOTOR_PARAMS_LEER,           // lee, no escribe (nivel rojo → Superadmin)
      PERMISOS.CALIBRACION_LEER,
      // explícitamente AUSENTES (DTC cap.1.2, "no puede"):
      //   MOTOR_PARAMS_ESCRIBIR · USUARIOS_GESTIONAR · BACKUPS_RESTAURAR
    ],
  },

  // ── Editor (DTC cap.1.2) ──────────────────────────────────────────────────
  editor: {
    etiqueta: 'Editor',
    descripcion: 'Producción de contenido editorial. No puede publicar.',
    permisos: [
      PERMISOS.CORPUS_LEER, PERMISOS.CORPUS_ESCRIBIR,
      PERMISOS.MULTIMEDIA_LEER, PERMISOS.MULTIMEDIA_ESCRIBIR,
      PERMISOS.IDENTIDAD_LEER,
      PERMISOS.FLUJO_ENVIAR_EDICION, PERMISOS.FLUJO_ENVIAR_REVISION,
      PERMISOS.EDICIONES_LEER,
      // explícitamente AUSENTE: FLUJO_PUBLICAR (DTC cap.1.2, "No puede: Publicar")
    ],
  },

  // ── Revisor (DTC cap.1.2) ─────────────────────────────────────────────────
  revisor: {
    etiqueta: 'Revisor',
    descripcion: 'Control de calidad editorial antes de publicación. No modifica contenido directamente.',
    permisos: [
      PERMISOS.CORPUS_LEER, PERMISOS.MULTIMEDIA_LEER, PERMISOS.IDENTIDAD_LEER,
      PERMISOS.FLUJO_APROBAR, PERMISOS.FLUJO_DEVOLVER,
      PERMISOS.EDICIONES_LEER,
      // explícitamente AUSENTE: CORPUS_ESCRIBIR (DTC cap.1.2, "No puede: Modificar
      // contenido directamente" — debe devolver a Editor con comentario)
    ],
  },

  // ── Auditor (DTI §8.2, conservado) ───────────────────────────────────────
  auditor: {
    etiqueta: 'Auditor',
    descripcion: 'Lectura completa más acceso al registro de auditoría. No modifica nada.',
    permisos: [
      PERMISOS.CORPUS_LEER, PERMISOS.MULTIMEDIA_LEER, PERMISOS.IDENTIDAD_LEER,
      PERMISOS.EDICIONES_LEER, PERMISOS.MOTOR_PARAMS_LEER,
      PERMISOS.AUDITORIA_LEER, PERMISOS.BACKUPS_LEER, PERMISOS.CALIBRACION_LEER,
      // Es lo que lo distingue de Solo Lectura: acceso a AUDITORIA_LEER.
    ],
  },

  // ── Solo lectura (DTC cap.1.2) ────────────────────────────────────────────
  solo_lectura: {
    etiqueta: 'Solo lectura',
    descripcion: 'Consulta. Autoridades, revisores externos, áreas sin necesidad de intervenir.',
    permisos: [
      PERMISOS.CORPUS_LEER, PERMISOS.MULTIMEDIA_LEER, PERMISOS.IDENTIDAD_LEER,
      PERMISOS.EDICIONES_LEER,
      // explícitamente AUSENTE: AUDITORIA_LEER (lo que lo distingue de Auditor)
    ],
  },
});

function tienePermiso(rol, permiso) {
  const def = ROLES[rol];
  if (!def) return false;
  return def.permisos.includes(permiso);
}

function listaDeRoles() {
  return Object.entries(ROLES).map(([id, r]) => ({ id, etiqueta: r.etiqueta, descripcion: r.descripcion }));
}

module.exports = { PERMISOS, ROLES, tienePermiso, listaDeRoles };
