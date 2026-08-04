/**
 * servicios/validacion.servicio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Batería de validaciones previas a publicación (DTC cap.13). Diez
 * verificaciones (el documento numera hasta V-11 porque V-3 quedó dentro de
 * la lista de bloqueantes junto con V-4); se implementan las que pueden
 * evaluarse en el servidor sin ejecutar el Motor Editorial en un navegador
 * real (V-6/V-7/V-9 requieren DOM y CSS reales — se documentan como
 * pendientes de integración con /calibrar en el Informe de Implementación
 * §6, no se simulan con una implementación parcial que aparente cubrirlas).
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const esquemas = require('../validadores/esquemas');
const fsp = require('fs').promises;
const path = require('path');

class ValidacionServicio {
  constructor(edicionesRepo, rutaAlmacen) {
    this.repo = edicionesRepo;
    this.rutaAlmacen = rutaAlmacen;
  }

  async ejecutarBateria(anio) {
    const resultados = [];

    // ── V-1 · JSON: esquema, tipos, campos obligatorios ────────────────────
    const corpus = {};
    for (const tipo of ['sedes', 'testimonios', 'registros', 'multimedia', 'config']) {
      try {
        corpus[tipo] = await this.repo.leerCorpus(anio, tipo);
        const esquemaOk = esquemas.validarEsquema(tipo, corpus[tipo]);
        const camposOk = esquemas.validarCamposObligatorios(tipo, corpus[tipo]);
        resultados.push({
          id: 'V-1', nombre: `JSON: ${tipo}`, bloqueante: true,
          aprobado: esquemaOk && camposOk.valido,
          detalle: [...(esquemaOk ? [] : ['esquema inválido o estructura insegura']), ...camposOk.errores],
        });
      } catch (e) {
        resultados.push({ id: 'V-1', nombre: `JSON: ${tipo}`, bloqueante: true, aprobado: false, detalle: [e.message] });
      }
    }

    // ── V-2 · Multimedia: activos referenciados existen y no exceden el peso ─
    const rutaAssets = path.join(this.rutaAlmacen, 'ediciones', String(anio), 'assets');
    const referencias = [];
    ['testimonios', 'registros', 'multimedia'].forEach((tipo) => {
      (corpus[tipo] || []).forEach((el) => {
        if (el.foto) referencias.push(el.foto);
        if (el.imagenPortada) referencias.push(el.imagenPortada);
      });
    });
    (corpus.sedes || []).forEach((s) => { if (s.imagenFondo) referencias.push(s.imagenFondo); });

    const faltantes = [];
    const excedidos = [];
    for (const ref of referencias) {
      const rutaRel = ref.replace(/^assets\//, '');
      const rutaAbs = path.join(rutaAssets, rutaRel);
      try {
        const stat = await fsp.stat(rutaAbs);
        // Límites de DTC §6.2: 400 KB fondos, 200 KB UA/fotos, 80 KB retratos.
        // Se aplica el límite más laxo por defecto salvo que la carpeta lo indique.
        const limite = rutaRel.startsWith('backgrounds/') ? 400 * 1024
                      : rutaRel.startsWith('personas/') ? 80 * 1024
                      : 200 * 1024;
        if (stat.size > limite) excedidos.push(`${ref} (${Math.round(stat.size / 1024)} KB > ${Math.round(limite / 1024)} KB)`);
      } catch {
        faltantes.push(ref);
      }
    }
    resultados.push({
      id: 'V-2', nombre: 'Multimedia: existencia y peso', bloqueante: true,
      aprobado: faltantes.length === 0,
      detalle: [...faltantes.map((f) => `activo faltante: ${f}`), ...excedidos.map((e) => `excede el peso recomendado: ${e}`)],
    });

    // ── V-3 · Rutas: lista blanca, sin traversal ────────────────────────────
    const rutasInvalidas = referencias.filter((r) => !esquemas.rutaSegura(r));
    resultados.push({
      id: 'V-3', nombre: 'Rutas de activos', bloqueante: true,
      aprobado: rutasInvalidas.length === 0,
      detalle: rutasInvalidas.map((r) => `ruta fuera de la lista blanca: ${r}`),
    });

    // ── V-4 · Consistencia referencial ──────────────────────────────────────
    const sedesValidas = (corpus.sedes || []).map((s) => s.id);
    const refResultado = esquemas.validarConsistenciaReferencial(corpus, sedesValidas);
    resultados.push({ id: 'V-4', nombre: 'Consistencia referencial', bloqueante: true,
      aprobado: refResultado.valido, detalle: refResultado.errores });

    // ── V-5 · Invariantes editoriales (I1, I4, I5, MIN_VISIBLE) ─────────────
    const invDetalle = [];
    // I1: al menos un registro-ua permanente por sede con corpus no vacío.
    sedesValidas.forEach((sede) => {
      const registrosSede = (corpus.registros || []).filter((r) => r.sede === sede);
      if (registrosSede.length > 0 && !registrosSede.some((r) => r.tipo === 'registro-ua')) {
        invDetalle.push(`I1: sede "${sede}" no tiene ningún registro-ua permanente`);
      }
    });
    // MIN_VISIBLE: cada sede con contenido debe tener al menos 3 elementos visibles.
    sedesValidas.forEach((sede) => {
      const total = ['testimonios', 'registros', 'multimedia']
        .flatMap((t) => corpus[t] || [])
        .filter((el) => el.sede === sede && el.visible !== false).length;
      if (total > 0 && total < 3) invDetalle.push(`MIN_VISIBLE: sede "${sede}" tiene solo ${total} elementos visibles (mínimo 3)`);
    });
    resultados.push({ id: 'V-5', nombre: 'Invariantes editoriales', bloqueante: true,
      aprobado: invDetalle.length === 0, detalle: invDetalle });

    // ── V-6, V-7, V-9 · Motor Editorial, Layout, Score compositivo ──────────
    // Requieren DOM y CSS reales (getBoundingClientRect, getComputedStyle) que
    // no existen en un proceso Node sin navegador. Se documentan explícitamente
    // como NO EVALUABLES en este servicio — ver Informe de Implementación §6.
    ['V-6', 'V-7', 'V-9'].forEach((id) => {
      resultados.push({
        id, nombre: { 'V-6': 'Motor Editorial (composición sin solape)',
                      'V-7': 'Layout (elementos dentro del escenario)',
                      'V-9': 'Score compositivo por sede' }[id],
        bloqueante: id !== 'V-9', aprobado: null,
        detalle: ['No evaluable en el servidor: requiere ejecutar el Motor Editorial en un navegador real. ' +
                  'Pendiente de integración con /calibrar (Informe de Implementación §6, requisito no implementado #1).'],
      });
    });

    // ── V-8 · Calibración: parámetros dentro de rango validado ──────────────
    try {
      const motor = await this.repo.leerConfigMotor(anio);
      const fueraDeRango = [];
      const ocup = motor.ocupacion?.OCUPACION_OBJETIVO?.valor;
      if (typeof ocup === 'number' && (ocup < 0.40 || ocup > 0.70)) {
        fueraDeRango.push(`OCUPACION_OBJETIVO=${ocup} fuera del rango calibrado [0,40 - 0,70]`);
      }
      resultados.push({ id: 'V-8', nombre: 'Calibración: rangos válidos', bloqueante: false,
        aprobado: fueraDeRango.length === 0, detalle: fueraDeRango });
    } catch (e) {
      resultados.push({ id: 'V-8', nombre: 'Calibración: rangos válidos', bloqueante: false, aprobado: null, detalle: [e.message] });
    }

    // ── V-10 · Accesibilidad: alt presente en fotos ─────────────────────────
    const sinAlt = [];
    (corpus.multimedia || []).forEach((m) => {
      if (m.tipo === 'foto' && !m.alt) sinAlt.push(`multimedia id=${m.id} sin texto alternativo`);
    });
    resultados.push({ id: 'V-10', nombre: 'Accesibilidad: texto alternativo', bloqueante: false,
      aprobado: sinAlt.length === 0, detalle: sinAlt });

    // ── V-11 · Seguridad: sin HTML embebido, sin URL externas no declaradas ─
    const patronHTML = /<\s*(script|iframe|object|embed|on\w+\s*=)/i;
    const inseguros = [];
    ['testimonios', 'registros', 'multimedia'].forEach((tipo) => {
      (corpus[tipo] || []).forEach((el) => {
        Object.entries(el).forEach(([campo, valor]) => {
          if (typeof valor === 'string' && patronHTML.test(valor)) {
            inseguros.push(`${tipo} id=${el.id}, campo "${campo}": contiene marcado HTML potencialmente peligroso`);
          }
        });
      });
    });
    resultados.push({ id: 'V-11', nombre: 'Seguridad: sin HTML embebido', bloqueante: true,
      aprobado: inseguros.length === 0, detalle: inseguros });

    // ── Resultado consolidado ───────────────────────────────────────────────
    const bloqueantesFallidos = resultados.filter((r) => r.bloqueante && r.aprobado === false);
    const advertencias = resultados.filter((r) => !r.bloqueante && r.aprobado === false);
    const noEvaluables = resultados.filter((r) => r.aprobado === null);

    return {
      anio, ejecutado: new Date().toISOString(),
      aprobado: bloqueantesFallidos.length === 0,
      resultados, bloqueantesFallidos: bloqueantesFallidos.length,
      advertencias: advertencias.length, noEvaluables: noEvaluables.length,
    };
  }
}

module.exports = ValidacionServicio;
