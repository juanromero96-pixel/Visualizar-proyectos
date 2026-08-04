/**
 * servicios/flujoEditorial.servicio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Máquina de estados de DTC cap.3:
 *
 *   borrador → en_edicion → en_revision → aprobado → publicado → archivado
 *                  ▲              │
 *                  └──devolver────┘
 *              publicado ⇄ despublicar (vuelve a aprobado)
 *
 * Reglas aplicadas literalmente (DTC §3.3):
 *   1. Solo una edición publicada a la vez.
 *   2. "En revisión" congela el contenido — nadie puede modificarlo.
 *   3. "Aprobado" exige la batería de validaciones en verde.
 *   4. Publicar genera un respaldo permanente.
 *   5. Toda transición se registra en auditoría.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const TRANSICIONES = Object.freeze({
  borrador:     { enviar_edicion: 'en_edicion' },
  en_edicion:   { enviar_revision: 'en_revision' },
  en_revision:  { aprobar: 'aprobado', devolver: 'en_edicion' },
  aprobado:     { publicar: 'publicado', devolver: 'en_edicion' },
  publicado:    { despublicar: 'aprobado', archivar: 'archivado' },
  archivado:    {}, // reapertura solo por Superadministrador, fuera de la máquina normal (DTC §3.2)
});

// Estados en los que el contenido queda congelado (DTC §3.3 regla 2).
const ESTADOS_CONGELADOS = new Set(['en_revision', 'publicado', 'archivado']);

class FlujoEditorialServicio {
  constructor(edicionesRepo, validacionServicio, backupsServicio, auditoriaRepo) {
    this.repo = edicionesRepo;
    this.validacion = validacionServicio;
    this.backups = backupsServicio;
    this.auditoria = auditoriaRepo;
  }

  puedeTransicionar(estadoActual, accion) {
    return !!(TRANSICIONES[estadoActual] && TRANSICIONES[estadoActual][accion]);
  }

  estaCongelado(estado) {
    return ESTADOS_CONGELADOS.has(estado);
  }

  /**
   * Ejecuta una transición. `contexto` = { usuarioId, correo, rol, ip, comentario }.
   * `comentario` es obligatorio para `devolver` (DTC §3.3 regla 5).
   */
  async transicionar(anio, accion, contexto) {
    const meta = await this.repo.obtenerMeta(anio);
    if (!meta) throw new Error(`Edición ${anio} no encontrada`);

    if (!this.puedeTransicionar(meta.estado, accion)) {
      const err = new Error(`No se puede "${accion}" desde el estado "${meta.estado}"`);
      err.codigo = 'TRANSICION_INVALIDA';
      throw err;
    }
    if (accion === 'devolver' && !contexto.comentario) {
      const err = new Error('Devolver a edición requiere un comentario obligatorio');
      err.codigo = 'COMENTARIO_REQUERIDO';
      throw err;
    }

    const estadoAnterior = meta.estado;
    const estadoNuevo = TRANSICIONES[estadoAnterior][accion];

    // Regla 3: aprobar exige la batería en verde (sin bloqueantes).
    if (accion === 'aprobar') {
      const resultado = await this.validacion.ejecutarBateria(anio);
      if (!resultado.aprobado) {
        const err = new Error('La edición no supera la batería de validaciones obligatorias');
        err.codigo = 'VALIDACION_FALLIDA';
        err.detalle = resultado;
        throw err;
      }
    }

    // Regla 1: solo una edición publicada a la vez.
    if (accion === 'publicar') {
      const activa = await this.repo.obtenerEdicionActiva();
      if (activa && activa.anio !== meta.anio) {
        await this._transicionInterna(activa.anio, 'publicado', 'aprobado', contexto, 'despublicada automáticamente');
      }
      // Regla 4: respaldo permanente al publicar.
      await this.backups.crearRespaldo(anio, 'previo-a-publicacion', contexto.usuarioId);
    }

    meta.estado = estadoNuevo;
    if (accion === 'publicar') meta.publicada = new Date().toISOString();
    await this.repo.guardarMeta(anio, meta);

    // Regla 5: toda transición se registra.
    await this.auditoria.registrar({
      usuarioId: contexto.usuarioId, correo: contexto.correo, rol: contexto.rol, ip: contexto.ip,
      operacion: `flujo:${accion}`, recurso: `edicion:${anio}`, edicion: anio,
      valorAnterior: estadoAnterior, valorNuevo: estadoNuevo,
      resultado: 'exito', origen: contexto.origen || 'panel',
    });
    if (contexto.comentario) {
      await this.auditoria.registrar({
        usuarioId: contexto.usuarioId, correo: contexto.correo, rol: contexto.rol, ip: contexto.ip,
        operacion: 'flujo:comentario', recurso: `edicion:${anio}`, edicion: anio,
        valorNuevo: contexto.comentario, resultado: 'exito', origen: contexto.origen || 'panel',
      });
    }

    return meta;
  }

  async _transicionInterna(anio, desde, hacia, contexto, motivo) {
    const meta = await this.repo.obtenerMeta(anio);
    meta.estado = hacia;
    await this.repo.guardarMeta(anio, meta);
    await this.auditoria.registrar({
      usuarioId: contexto.usuarioId, correo: contexto.correo, rol: contexto.rol, ip: contexto.ip,
      operacion: 'flujo:despublicar', recurso: `edicion:${anio}`, edicion: anio,
      valorAnterior: desde, valorNuevo: hacia, resultado: 'exito', origen: motivo,
    });
  }

  /**
   * Corrección de urgencia (DTC §3.4): solo sobre texto, no altera geometría
   * ni orden ni visibilidad. Genera respaldo previo y auditoría marcada.
   */
  async correccionDeUrgencia(anio, tipo, elementoId, campo, valorNuevo, contexto) {
    const CAMPOS_PERMITIDOS = new Set([
      'nombreCompleto', 'cargo', 'citas', 'cita', 'citaAutor', 'citaCargo',
      'cuerpo', 'resumen', 'titulo', 'institucion', 'unidadAcademicaCompleta',
    ]);
    if (!CAMPOS_PERMITIDOS.has(campo)) {
      const err = new Error(`El campo "${campo}" no es corregible por la vía de urgencia (geometría/orden/visibilidad excluidos)`);
      err.codigo = 'CAMPO_NO_PERMITIDO';
      throw err;
    }
    if (!contexto.justificacion) {
      const err = new Error('La corrección de urgencia requiere justificación escrita obligatoria');
      err.codigo = 'JUSTIFICACION_REQUERIDA';
      throw err;
    }

    await this.backups.crearRespaldo(anio, 'previo-a-correccion-urgencia', contexto.usuarioId);

    const datos = await this.repo.leerCorpus(anio, tipo);
    const idx = datos.findIndex((el) => el.id === elementoId);
    if (idx === -1) throw new Error(`Elemento ${elementoId} no encontrado en ${tipo}`);
    const valorAnterior = datos[idx][campo];
    datos[idx][campo] = valorNuevo;
    await this.repo.escribirCorpus(anio, tipo, datos);

    await this.auditoria.registrar({
      usuarioId: contexto.usuarioId, correo: contexto.correo, rol: contexto.rol, ip: contexto.ip,
      operacion: 'CORRECCION_DE_URGENCIA', recurso: `${tipo}:${elementoId}:${campo}`, edicion: anio,
      valorAnterior, valorNuevo, resultado: 'exito', origen: 'panel',
    });
    // Registro adicional con la justificación, nunca se pierde entre los campos genéricos.
    await this.auditoria.registrar({
      usuarioId: contexto.usuarioId, correo: contexto.correo, rol: contexto.rol, ip: contexto.ip,
      operacion: 'CORRECCION_DE_URGENCIA:justificacion', recurso: `${tipo}:${elementoId}`, edicion: anio,
      valorNuevo: contexto.justificacion, resultado: 'exito', origen: 'panel',
    });

    return { valorAnterior, valorNuevo };
  }

  /** Conteo de correcciones de urgencia del trimestre, para el panel de estado (DTC §12.2). */
  async correccionesUrgenciaTrimestre() {
    const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const entradas = await this.auditoria.consultar({ desde, operacion: 'CORRECCION_DE_URGENCIA' });
    return entradas.length;
  }
}

module.exports = FlujoEditorialServicio;
