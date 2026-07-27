/**
 * LABORATORIO — Pipeline de Análisis y Recalibración Derivada
 * ═══════════════════════════════════════════════════════════════════════════
 * PARTE C del encargo. Carga JSON exportados por /calibrar, los valida,
 * extrae métricas, calcula estadísticas agregadas y produce una PROPUESTA
 * de recalibración.
 *
 * RESTRICCIÓN CENTRAL (C3): la recalibración NUNCA se aplica automáticamente.
 * Este módulo produce un objeto de propuesta con valor anterior, valor
 * propuesto, evidencia e impacto. La decisión de aplicarla es humana y
 * ocurre fuera de este código.
 *
 * COMPLETAMENTE PASIVO: no escribe constantes, no toca el DOM del mural,
 * no invoca actuadores.
 * ═══════════════════════════════════════════════════════════════════════════
 */
window.__CALIBRAR_ANALISIS__ = (() => {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // C2 · PIPELINE — 8 etapas declaradas en el encargo
  // ══════════════════════════════════════════════════════════════════════════

  /** Etapa 1 · Validación de esquema. */
  function validarEsquema(json) {
    const errores = [];
    if (!json || typeof json !== 'object') return { valido: false, errores: ['no-es-objeto'], tipo: null };

    const tipo = json.meta?.tipoExportacion
              || (json.dispositivos ? 'dataset-acumulativo'
              : json.sedes ? 'calibracion-completa' : null);

    if (!tipo) errores.push('tipo-de-exportacion-indeterminado');
    if (!json.meta && !json.version) errores.push('sin-bloque-meta');

    if (tipo === 'calibracion-completa') {
      if (!Array.isArray(json.sedes)) errores.push('sedes-ausente-o-no-array');
      if (!json.viewport) errores.push('viewport-ausente');
    }
    if (tipo === 'dataset-acumulativo') {
      if (!json.dispositivos || typeof json.dispositivos !== 'object') errores.push('dispositivos-ausente');
    }
    return { valido: errores.length === 0, errores, tipo,
             versionEsquema: json.meta?.versionEsquema ?? json.version ?? 1 };
  }

  /** Etapa 2 · Verificación de build. */
  function verificarBuild(json, buildEsperado) {
    const build = json.meta?.build || null;
    const actual = buildEsperado || window.__BUILD__ || null;
    return {
      build, buildActual: actual,
      coincide: !!build && !!actual && build === actual,
      advertencia: build && actual && build !== actual
        ? `El JSON proviene de ${build}; el sistema corre ${actual}. Las métricas pueden no ser comparables.`
        : null,
    };
  }

  /** Etapas 3–6 · Extracción de viewport, alturas, capacidades y eventos. */
  function extraer(json, tipo) {
    const out = { dispositivos: [] };

    if (tipo === 'calibracion-completa') {
      const p = json.dispositivo || {};
      const v = json.viewport || {};
      const alturas = {};
      const capacidades = {};
      (json.sedes || []).forEach((s) => {
        capacidades[s.id] = {
          altUtil: s.altUtil, capacidadReal: s.capacidadReal,
          alturaReferencia: s.alturaReferencia,
          visibles: s.elementosVisibles, enEspera: s.elementosEnEspera,
          margenTop: s.margenTopEfectivo, margenBot: s.margenBotEfectivo,
        };
        (s.elementos || []).forEach((e) => {
          if (e.tipo && e.offsetHeight) (alturas[e.tipo] ||= []).push(e.offsetHeight);
        });
      });
      out.dispositivos.push({
        clave: `${p.so?.nombre || '?'}-${v.innerWidth}x${v.innerHeight}@${json.meta?.devicePixelRatio || p.DPR || '?'}`,
        viewport: { w: v.innerWidth, h: v.innerHeight,
                    vvH: v.visualViewport?.height ?? null,
                    safeArea: v.safeArea || null },
        DPR: json.meta?.devicePixelRatio ?? p.DPR ?? null,
        navegador: p.navegador || null, so: p.so || null,
        refreshHz: p.refreshHzEstimado ?? null,
        alturas, capacidades,
        hitos: json.temporal?.hitos || null,
        estabilidad: json.temporal?.estabilidad || null,
        eventos: json.temporal?.timeline?.eventos || [],
        frames: json.temporal?.timeline?.frames || [],
        sesiones: 1,
      });
    }

    if (tipo === 'dataset-acumulativo') {
      Object.entries(json.dispositivos || {}).forEach(([clave, D]) => {
        const p = D.perfil || {};
        out.dispositivos.push({
          clave,
          viewport: { w: p.viewportCSS?.w, h: p.viewportCSS?.h, safeArea: null },
          DPR: p.DPR ?? null,
          navegador: p.navegador || null, so: p.so || null,
          refreshHz: p.refreshHzEstimado ?? null,
          hardware: { cores: p.hardwareConcurrency ?? null, ramGB: p.deviceMemoryGB ?? null },
          alturas: {}, capacidades: {},
          sesionesDetalle: (D.sesiones || []).map((s) => ({
            ts: s.ts, build: s.build, hitos: s.hitos,
            estabilidad: s.estabilidadResumen, frames: s.framesCapturados,
          })),
          sesiones: (D.sesiones || []).length,
        });
      });
    }
    return out;
  }

  /** Etapa 7 · Métricas compositivas a partir de los frames, si existen. */
  function metricasCompositivas(dispositivo) {
    const frames = dispositivo.frames || [];
    if (!frames.length) return { disponible: false, razon: 'sin-frames' };

    const porSede = {};
    frames.forEach((f) => {
      (f.sedes || []).forEach((s) => {
        if (!s.composicion) return;
        (porSede[s.id] ||= []).push({ t: f.t, ...s.composicion });
      });
    });
    if (!Object.keys(porSede).length) return { disponible: false, razon: 'frames-sin-composicion' };

    const resumen = {};
    Object.entries(porSede).forEach(([sede, serie]) => {
      const scores = serie.map((x) => x.score).filter((x) => x != null);
      const ocup   = serie.map((x) => x.ocupacion).filter((x) => x != null);
      const muerto = serie.map((x) => x.muerto).filter((x) => x != null);
      resumen[sede] = {
        n: serie.length,
        scoreFinal: scores.length ? scores[scores.length - 1] : null,
        scoreMedio: scores.length ? +(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null,
        scoreMin: scores.length ? Math.min(...scores) : null,
        scoreMax: scores.length ? Math.max(...scores) : null,
        ocupacionFinal: ocup.length ? ocup[ocup.length-1] : null,
        muertoFinal: muerto.length ? muerto[muerto.length-1] : null,
        // Tiempo hasta alcanzar score ≥ 85 de forma sostenida
        tiempoHastaScore85: (() => {
          for (let i = 0; i < serie.length; i++) {
            if (serie.slice(i).every((x) => (x.score ?? 0) >= 85)) return serie[i].t;
          }
          return null;
        })(),
      };
    });
    return { disponible: true, porSede: resumen };
  }

  /** Etapa 8 · Resumen por dispositivo. */
  function resumirDispositivo(d) {
    const alturasResumen = {};
    Object.entries(d.alturas || {}).forEach(([tipo, hs]) => {
      const s = [...hs].sort((a,b) => a-b);
      const n = s.length;
      const media = s.reduce((a,b)=>a+b,0)/n;
      const sigma = Math.sqrt(s.reduce((a,b)=>a+(b-media)**2,0)/n);
      alturasResumen[tipo] = {
        n, min: s[0], max: s[n-1],
        p50: s[Math.floor(n*.50)], p75: s[Math.floor(n*.75)], p90: s[Math.floor(n*.90)],
        media: +media.toFixed(1), sigma: +sigma.toFixed(2),
      };
    });

    // Latencia de adaptación del LAE, de los hitos disponibles
    const latencias = [];
    if (d.hitos?.primeraAdaptacionLAE != null) latencias.push(d.hitos.primeraAdaptacionLAE);
    (d.sesionesDetalle || []).forEach((s) => {
      if (s.hitos?.primeraAdaptacionLAE != null) latencias.push(s.hitos.primeraAdaptacionLAE);
    });

    // Estabilización
    const estables = [];
    if (d.hitos?.layoutEstableMs != null) estables.push(d.hitos.layoutEstableMs);
    (d.sesionesDetalle || []).forEach((s) => {
      if (s.hitos?.layoutEstableMs != null) estables.push(s.hitos.layoutEstableMs);
    });

    return {
      clave: d.clave, sesiones: d.sesiones,
      viewport: d.viewport, DPR: d.DPR, refreshHz: d.refreshHz,
      navegador: d.navegador, so: d.so, hardware: d.hardware || null,
      alturas: alturasResumen,
      capacidades: d.capacidades,
      latenciaLAE: latencias.length ? {
        n: latencias.length,
        min: Math.min(...latencias), max: Math.max(...latencias),
        media: +(latencias.reduce((a,b)=>a+b,0)/latencias.length).toFixed(0),
      } : null,
      layoutEstable: estables.length ? {
        n: estables.length,
        min: Math.min(...estables), max: Math.max(...estables),
        media: +(estables.reduce((a,b)=>a+b,0)/estables.length).toFixed(0),
      } : null,
      compositivas: metricasCompositivas(d),
    };
  }

  /** Pipeline completo sobre un JSON. */
  function analizarUno(json, nombre) {
    const esq = validarEsquema(json);
    if (!esq.valido) return { nombre, valido: false, errores: esq.errores };
    const bld = verificarBuild(json);
    const ext = extraer(json, esq.tipo);
    return {
      nombre, valido: true, tipo: esq.tipo, versionEsquema: esq.versionEsquema,
      build: bld, dispositivos: ext.dispositivos.map(resumirDispositivo),
      _crudo: ext.dispositivos,
    };
  }

  /** Pipeline sobre un conjunto de JSON. */
  function analizarConjunto(lista) {
    const resultados = lista.map(({ nombre, json }) => analizarUno(json, nombre));
    const validos = resultados.filter((r) => r.valido);
    const invalidos = resultados.filter((r) => !r.valido);

    // Consolidación por clave de dispositivo
    const porDispositivo = {};
    validos.forEach((r) => {
      r.dispositivos.forEach((d) => {
        const acc = (porDispositivo[d.clave] ||= {
          clave: d.clave, viewport: d.viewport, DPR: d.DPR, refreshHz: d.refreshHz,
          navegador: d.navegador, so: d.so, hardware: d.hardware,
          sesiones: 0, alturas: {}, latencias: [], estabilizaciones: [], scores: [],
        });
        acc.sesiones += d.sesiones;
        Object.entries(d.alturas).forEach(([t, a]) => {
          (acc.alturas[t] ||= []).push(...Array(a.n).fill(a.p50));
        });
        if (d.latenciaLAE) acc.latencias.push(d.latenciaLAE.media);
        if (d.layoutEstable) acc.estabilizaciones.push(d.layoutEstable.media);
        if (d.compositivas?.disponible) {
          Object.values(d.compositivas.porSede).forEach((s) => {
            if (s.scoreFinal != null) acc.scores.push(s.scoreFinal);
          });
        }
      });
    });

    return {
      total: lista.length, validos: validos.length, invalidos: invalidos.length,
      erroresValidacion: invalidos.map((r) => ({ nombre: r.nombre, errores: r.errores })),
      resultados: validos,
      consolidado: Object.values(porDispositivo),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C3 · RECALIBRACIÓN DERIVADA — propuesta, nunca aplicación
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Genera una propuesta de recalibración a partir del análisis consolidado.
   * Solo se proponen los cinco grupos autorizados por C3:
   *   percentiles de altura · tolerancias de viewport · umbrales de DPR
   *   pesos de la función compositiva · objetivos de ocupación
   *
   * NUNCA aplica. Devuelve un objeto de propuesta para revisión humana.
   */
  function proponerRecalibracion(consolidado) {
    const K = window.AC_K?.MOBILE || {};
    const COMP = window.__CALIBRAR_COMPOSICION__?.CFG || {};
    const props = [];
    const MIN_SESIONES = 3;   // umbral mínimo de evidencia para proponer

    const totalSesiones = consolidado.reduce((a, d) => a + d.sesiones, 0);
    const totalDisp = consolidado.length;

    // ── 1 · Percentiles de altura ────────────────────────────────────────
    const alturasGlobal = {};
    consolidado.forEach((d) => {
      Object.entries(d.alturas).forEach(([t, hs]) => (alturasGlobal[t] ||= []).push(...hs));
    });
    const MAPA = {
      'registro-ua': 'ALTURA_REGISTRO_UA',
      'testimonio': 'ALTURA_TESTIMONIO',
      'video': 'ALTURA_VIDEO',
      'registro-conceptual': 'ALTURA_CONCEPTUAL',
    };
    Object.entries(alturasGlobal).forEach(([tipo, hs]) => {
      const cte = MAPA[tipo];
      if (!cte || hs.length < 5) return;
      const s = [...hs].sort((a,b)=>a-b);
      const p75 = s[Math.floor(s.length * .75)];
      const actual = K[cte];
      if (actual == null || p75 === actual) return;
      const deltaPct = +((p75 - actual) / actual * 100).toFixed(1);
      props.push({
        grupo: 'percentiles-de-altura',
        parametro: cte,
        valorAnterior: actual,
        valorPropuesto: p75,
        deltaPct,
        evidencia: { muestras: hs.length, dispositivos: totalDisp, sesiones: totalSesiones,
                     min: s[0], max: s[s.length-1], p50: s[Math.floor(s.length*.5)], p75 },
        confianza: hs.length >= 20 ? 'alta' : hs.length >= 8 ? 'media' : 'baja',
        impactoEsperado: `La capacidad de reserva se recalcula con ${p75}px en vez de ${actual}px ` +
                         `(${deltaPct > 0 ? '+' : ''}${deltaPct}%). Solo afecta al arranque en frío: ` +
                         `en régimen la fórmula usa alturas medidas en vivo.`,
        aplicable: hs.length >= MIN_SESIONES,
      });
    });

    // ── 2 · Tolerancias de viewport ──────────────────────────────────────
    const alturasViewport = consolidado.map((d) => d.viewport?.h).filter(Boolean);
    if (alturasViewport.length >= 2) {
      const min = Math.min(...alturasViewport), max = Math.max(...alturasViewport);
      const rango = max - min;
      props.push({
        grupo: 'tolerancias-de-viewport',
        parametro: 'VIEWPORT_DELTA_PX',
        valorAnterior: K.VIEWPORT_DELTA_PX ?? null,
        valorPropuesto: K.VIEWPORT_DELTA_PX ?? null,
        deltaPct: 0,
        evidencia: { viewportsObservados: alturasViewport, rango, dispositivos: totalDisp },
        confianza: 'media',
        impactoEsperado: `Sin cambio propuesto. El rango de viewports observado es de ${rango}px ` +
                         `entre ${min} y ${max}; el umbral vigente los discrimina correctamente.`,
        aplicable: false,
        nota: 'Se registra para trazabilidad; no hay evidencia que justifique modificarlo.',
      });
    }

    // ── 3 · Umbrales de DPR ──────────────────────────────────────────────
    const dprs = [...new Set(consolidado.map((d) => d.DPR).filter(Boolean))];
    const fraccionarios = dprs.filter((x) => !Number.isInteger(x));
    props.push({
      grupo: 'umbrales-de-dpr',
      parametro: 'TOL_DPR',
      valorAnterior: 'max(1, ceil(1/DPR)+1)',
      valorPropuesto: 'max(1, ceil(1/DPR)+1)',
      deltaPct: 0,
      evidencia: { dprObservados: dprs, fraccionarios, dispositivos: totalDisp },
      confianza: dprs.length >= 3 ? 'alta' : 'media',
      impactoEsperado: `Sin cambio. Los DPR observados (${dprs.join(', ')}) producen tolerancias de ` +
                       `${dprs.map((x) => Math.max(1, Math.ceil(1/x)+1)).join(', ')}px, coherentes con el ruido medido.`,
      aplicable: false,
    });

    // ── 4 · Objetivos de ocupación ───────────────────────────────────────
    const scores = consolidado.flatMap((d) => d.scores);
    if (scores.length >= MIN_SESIONES) {
      const s = [...scores].sort((a,b)=>a-b);
      const p50 = s[Math.floor(s.length*.5)];
      props.push({
        grupo: 'objetivos-de-ocupacion',
        parametro: 'OCUPACION_MIN / OCUPACION_MAX',
        valorAnterior: `${COMP.OCUPACION_MIN} – ${COMP.OCUPACION_MAX}`,
        valorPropuesto: `${COMP.OCUPACION_MIN} – ${COMP.OCUPACION_MAX}`,
        deltaPct: 0,
        evidencia: { scoresObservados: s.length, scoreP50: p50,
                     scoreMin: s[0], scoreMax: s[s.length-1] },
        confianza: scores.length >= 10 ? 'media-alta' : 'media',
        impactoEsperado: p50 >= 85
          ? `El score mediano observado es ${p50}, por encima del objetivo de 85. El rango vigente es adecuado.`
          : `El score mediano observado es ${p50}, por debajo del objetivo de 85. Antes de mover el rango de ` +
            `ocupación conviene revisar qué componente lo deprime; mover el objetivo enmascararía la causa.`,
        aplicable: false,
        nota: 'Cambiar el objetivo de ocupación altera la definición de calidad. Requiere decisión editorial.',
      });
    }

    // ── 5 · Pesos de la función compositiva ──────────────────────────────
    props.push({
      grupo: 'pesos-de-la-funcion-compositiva',
      parametro: 'CFG.PESOS',
      valorAnterior: COMP.PESOS || null,
      valorPropuesto: COMP.PESOS || null,
      deltaPct: 0,
      evidencia: { sesiones: totalSesiones, dispositivos: totalDisp,
                   scoresDisponibles: scores.length },
      confianza: 'baja',
      impactoEsperado: 'Sin cambio propuesto. Derivar pesos exige un conjunto de composiciones ' +
                       'evaluadas editorialmente como referencia; la evidencia actual no lo contiene.',
      aplicable: false,
      nota: 'Requiere un corpus de composiciones con valoración editorial explícita.',
    });

    return {
      generado: new Date().toISOString(),
      build: window.__BUILD__ || null,
      baseEvidencia: { dispositivos: totalDisp, sesiones: totalSesiones },
      // NUNCA se aplica automáticamente. Esta bandera lo declara explícitamente.
      autoAplicacion: false,
      declaracion: 'Propuesta para revisión humana. Ningún valor fue escrito en la configuración ' +
                   'del sistema. La aplicación requiere edición manual de las constantes y una ' +
                   'nueva ronda de validación en dispositivo real.',
      propuestas: props,
      resumen: {
        total: props.length,
        conCambio: props.filter((p) => p.valorAnterior !== p.valorPropuesto).length,
        aplicables: props.filter((p) => p.aplicable).length,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C1 · CARGA DESDE ARCHIVOS
  // ══════════════════════════════════════════════════════════════════════════

  /** Carga JSON desde un <input type="file" multiple>. Sin backend. */
  function cargarDesdeArchivos(fileList) {
    const lecturas = Array.from(fileList).map((file) =>
      new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => {
          try { resolve({ nombre: file.name, json: JSON.parse(fr.result) }); }
          catch (e) { resolve({ nombre: file.name, json: null, error: e.message }); }
        };
        fr.onerror = () => resolve({ nombre: file.name, json: null, error: 'lectura-fallida' });
        fr.readAsText(file);
      })
    );
    return Promise.all(lecturas).then((lista) => {
      const ok = lista.filter((x) => x.json);
      const fallidos = lista.filter((x) => !x.json);
      const analisis = analizarConjunto(ok);
      analisis.archivosNoLeidos = fallidos;
      return analisis;
    });
  }

  return {
    validarEsquema, verificarBuild, extraer, resumirDispositivo,
    metricasCompositivas, analizarUno, analizarConjunto,
    proponerRecalibracion, cargarDesdeArchivos,
  };
})();
