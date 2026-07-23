/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 5: Analyzer
 * DTI §5 — Diagnóstico y clasificación
 *
 * Transforma señales del Monitor en anomalías clasificadas.
 * Produce un diagnóstico técnico completo (nunca solo un booleano).
 * Publica al Planner. No ejecuta correcciones.
 */
window.AC_Analyzer = (() => {
  'use strict';

  const K = window.AC_K;
  const Bus = window.AC_Bus;
  const CAT = K.CATEGORIA;
  const SEV = K.SEVERIDAD;

  // ── Historial para diagnóstico de indeterminación (§5.3) ──────────────────

  const _indeterminados = new Map(); // hash → { conteo, ts }
  const _colaActiva = new Set();    // hashes actualmente en proceso

  // ── Construcción del objeto de diagnóstico (DTI §5, §2) ──────────────────

  function _diagnostico({
    categoria, severidad, causa, impacto,
    componenteAfectado, contexto, evidencia, posibleOrigen,
    correcciones, hash, señal,
  }) {
    return Object.freeze({
      // Identidad
      hash,
      categoria,
      severidad,

      // Diagnóstico técnico (DTI: "nunca únicamente un booleano")
      causa,
      impacto,
      componenteAfectado,
      contexto,
      evidencia,
      posibleOrigen,

      // Correcciones sugeridas (una o varias, en orden de prioridad)
      correcciones: correcciones || [],

      // Metadatos
      ts: Date.now(),
      señalOriginal: señal,
    });
  }

  // ── Reglas de clasificación por tipo de señal ─────────────────────────────
  // DTI §5.2: cuatro atributos (categoría, severidad, contexto, hash)
  // Devuelve un objeto diagnóstico o null si la señal cae bajo umbral.

  const _reglas = {

    // — Editoriales (§2.1) —

    'editorial.narrador.ausente': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.EDITORIAL,
      severidad: SEV.P0,
      causa: `Narrador UA (${s.ua}) marcado como no-visible — viola invariante I1 del DTI Modelo Temporal`,
      impacto: 'El mural pierde su ancla narrativa permanente; el visitante no puede acceder al expediente de esa Unidad Académica',
      componenteAfectado: 'Rotacion.configurar / poolActivo',
      contexto: { id: s.id, ua: s.ua, sede: s.sede },
      evidencia: `Elemento ${s.id} presenta clase --rotacion-espera o --visible ausente siendo permanente=true`,
      posibleOrigen: 'Race condition entre Rotacion.iniciar y una rotación anterior; rollback incompleto; M-30 interactuando con la composición',
      correcciones: ['C-01'],
      señal: s,
    }),

    'editorial.autoridades.exceso': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.EDITORIAL,
      severidad: SEV.P0,
      causa: `${s.conteo} autoridades simultáneas visibles — viola K=2 del DTI §5.4`,
      impacto: 'El mural exhibe más autoridades institucionales de las previstas editorialmente, rompiendo el balance narrativo',
      componenteAfectado: 'Rotacion.rotarUno / elegirEntranteYSalientePorCiclo',
      contexto: { conteo: s.conteo, maximo: s.maximo },
      evidencia: `${s.conteo} elementos con .elemento--testimonio-institucional visibles; máximo declarado: ${s.maximo}`,
      posibleOrigen: 'La 5ª regla de selección de saliente (DTI E3) cedió una autoridad para dejar entrar a una facultad, y el K=2 no se reevaluó',
      correcciones: ['C-03'],
      señal: s,
    }),

    'editorial.ciclo.corrupto': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.EDITORIAL,
      severidad: SEV.P1,
      causa: `cicloExhibidos (${s.exhibidos}) > cicloOrden (${s.total}) — estado del ciclo incoherente`,
      impacto: 'El ciclo editorial no puede determinar cuáles elementos faltan por exhibir, comprometiendo la cobertura garantizada (I4)',
      componenteAfectado: 'elegirEntranteYSalientePorCiclo / persistirCiclo',
      contexto: { exhibidos: s.exhibidos, total: s.total, vuelta: s.vuelta },
      evidencia: `dataset.cicloExhibidos.length=${s.exhibidos} supera dataset.cicloOrden.length=${s.total}`,
      posibleOrigen: 'Corrupción de sessionStorage; firma de corpus alterada sin invalidación; cambio del corpus entre recargas',
      correcciones: ['C-04'],
      señal: s,
    }),

    // — Geométricas (§2.7/layout) —

    'geometria.solape.tarjetas': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: s.area > 5000 ? SEV.P0 : SEV.P1,
      causa: `Solape de ${s.area}px² entre ${s.idA} y ${s.idB} — supera umbral de ${K.UMBRAL.SOLAPE_TARJETAS_PX2}px²`,
      impacto: s.area > 5000
        ? 'Contenido textual probablemente ilegible; rompe la composición editorial del mural'
        : 'Solape menor que puede deteriorar la legibilidad de los márgenes de las tarjetas',
      componenteAfectado: 'Distribuidor.distribuir / empujarFueraDeZonas',
      contexto: { area: s.area, elementos: [s.idA, s.idB] },
      evidencia: `getBoundingClientRect() muestra intersección de ${s.area}px² entre ambas tarjetas`,
      posibleOrigen: 'separarPar no convergió en las 50 iteraciones; M-30 reordenó el DOM después del layout; entrada por rotación en desktop sin reposicionarEntranteDesktop (D-01)',
      correcciones: ['C-31', 'C-30'],
      señal: s,
    }),

    'geometria.solape.zona': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P0,
      causa: `Invasión de zona protegida "${s.zona}" por elemento "${s.elemento}" (${s.area}px²)`,
      impacto: 'Una tarjeta superpone el chip institucional o el kicker — el mural oculta identidad y texto narrativo institucional',
      componenteAfectado: 'Distribuidor / empujarFueraDeZonas / reposicionarEntranteDesktop',
      contexto: { zona: s.zona, elemento: s.elemento, area: s.area },
      evidencia: `getBoundingClientRect() de "${s.elemento}" intersecta la zona protegida "${s.zona}" en ${s.area}px²`,
      posibleOrigen: 'D-01 (entrante desktop sin posición previa entra en ancla cruda %); loop de 50 iteraciones no convergió; oscilación entre empujarFueraDeZonas y separarPar',
      correcciones: ['C-31'],
      señal: s,
    }),

    'geometria.fuera.viewport': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P1,
      causa: `Elemento "${s.id}" ubicado fuera del área visible del escenario`,
      impacto: 'El visitante no puede ver ni acceder a esa anotación; el territorio representado queda incompleto',
      componenteAfectado: 'limitarAlEscenario / Distribuidor',
      contexto: { id: s.id },
      evidencia: `getBoundingClientRect() del elemento excede los límites del escenario activo`,
      posibleOrigen: 'Ancla en % fuera del rango visual para la resolución del dispositivo; MARGEN_ESCENARIO insuficiente para este viewport',
      correcciones: ['C-32'],
      señal: s,
    }),

    // — Accesibilidad (§2.3) —

    'accesibilidad.tabindex.ausente': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.ACCESIBILIDAD,
      severidad: SEV.P1,
      causa: `Elemento "${s.id}" no alcanzable por teclado (tabIndex < 0 o ausente)`,
      impacto: 'Usuario con navegación por teclado no puede acceder a esta anotación — viola WCAG 2.1.1 (Teclado)',
      componenteAfectado: 'crearElemento / reposicionarEntranteDesktop',
      contexto: { id: s.id },
      evidencia: `tabIndex=${s.tabIndex || 'no declarado'} en elemento visible activo`,
      posibleOrigen: 'Entrada por rotación sin herencia de tabIndex; M-30 reordenó el DOM y el tabIndex no se preservó',
      correcciones: ['C-21'],
      señal: s,
    }),

    'accesibilidad.aria.ausente': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.ACCESIBILIDAD,
      severidad: SEV.P1,
      causa: `Elemento interactivo "${s.clase}" sin aria-label ni aria-labelledby`,
      impacto: 'Usuarios con lector de pantalla no recibirán descripción del propósito del control',
      componenteAfectado: 'index.html / crearElemento',
      contexto: { tag: s.tag, clase: s.clase },
      evidencia: 'getAttribute("aria-label") = null en elemento interactivo',
      posibleOrigen: 'Actualización de markup sin agregar atributo ARIA; rotación que no preserva el aria-label',
      correcciones: ['C-22'],
      señal: s,
    }),

    // — Recursos (§2.5) —

    'recursos.fondo.faltante': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.RECURSOS,
      severidad: SEV.P0,
      causa: 'La imagen de fondo de la sede activa no está disponible (background-image: none o carga fallida)',
      impacto: 'La escena muestra fondo vacío o negro en vez de la fotografía del territorio — ruptura total de la identidad editorial',
      componenteAfectado: '.sede-bg / imagenFondo del corpus',
      contexto: {},
      evidencia: 'getComputedStyle(.sede-bg).backgroundImage = "none"',
      posibleOrigen: 'Asset no disponible en el CDN/Vercel; error de caché; ruta relativa incorrecta en el corpus',
      correcciones: ['C-12'],
      señal: s,
    }),

    'recursos.sessionstorage.inaccesible': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.RECURSOS,
      severidad: SEV.P2,
      causa: `sessionStorage no disponible: ${s.error}`,
      impacto: 'El ciclo editorial no puede persistir su estado entre recargas; cada recarga reinicia el recorrido desde el inicio',
      componenteAfectado: 'persistirCiclo',
      contexto: { error: s.error },
      evidencia: 'sessionStorage.setItem() arroja excepción',
      posibleOrigen: 'Modo de navegación privada estricto; storage quota superado; políticas de seguridad del navegador',
      correcciones: ['C-50'],
      señal: s,
    }),

    // — Consistencia (§2.7) —

    'consistencia.firma.divergente': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P1,
      causa: `Firma dataset.rotConfig (cap=${s.capDeclarada}) diverge del DOM real (cap=${s.capActual})`,
      impacto: 'La idempotencia de Rotacion.configurar está rota — el próximo configurar puede rehidratar un estado incorrecto',
      componenteAfectado: 'Rotacion.configurar / firma de idempotencia',
      contexto: { capActual: s.capActual, capDeclarada: s.capDeclarada },
      evidencia: `DOM tiene ${s.capActual} elementos activos; firma declara ${s.capDeclarada}`,
      posibleOrigen: 'Cambio del conjunto de elementos en escena sin actualizar la firma; corrupción de dataset.rotConfig',
      correcciones: ['C-70'],
      señal: s,
    }),

    'consistencia.ciclo.orden.corrupto': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P1,
      causa: 'dataset.cicloOrden no es JSON válido — el orden congelado del ciclo editorial está corrupto',
      impacto: 'elegirEntranteYSalientePorCiclo() fallará silenciosamente; el ciclo quedará atascado',
      componenteAfectado: 'dataset.cicloOrden / configurar',
      contexto: {},
      evidencia: 'JSON.parse(sede.dataset.cicloOrden) arroja SyntaxError',
      posibleOrigen: 'Escritura parcial en sessionStorage; race condition entre configurar y rotarUno',
      correcciones: ['C-72'],
      señal: s,
    }),

    'layout.overflow.horizontal': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P1,
      causa: `Overflow horizontal detectado: scrollWidth=${s.sw} > clientWidth=${s.cw}`,
      impacto: 'El carrusel de sedes puede romperse; los gestos de swipe pueden no registrarse; scroll-snap puede quedar en estado inestable',
      componenteAfectado: 'Carrusel / CSS overflow',
      contexto: { scrollWidth: s.sw, clientWidth: s.cw },
      evidencia: 'document.body.scrollWidth > document.body.clientWidth + 5',
      posibleOrigen: 'Elemento fuera del viewport; tarjeta con --x calculada fuera del ancho disponible; CSS overflow inadvertido',
      correcciones: ['C-33'],
      señal: s,
    }),

    // — Rendimiento (§2.4) —

    'rendimiento.recalcular.frecuente': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.RENDIMIENTO,
      severidad: SEV.P2,
      causa: `${s.conteo} llamadas a recalcular() en ${s.ventanaS}s — frecuencia anormal`,
      impacto: 'CPU elevada; posible layout thrashing; la escena puede parpadear entre distribuciones',
      componenteAfectado: 'recalcular / ResizeObserver',
      contexto: { conteo: s.conteo, ventanaS: s.ventanaS },
      evidencia: `Historial DIAG contiene ${s.conteo} eventos de composición en la ventana de ${s.ventanaS}s`,
      posibleOrigen: 'Resize en loop; CSS con cambios de layout que disparan resize; bug en el carrusel',
      correcciones: ['C-41'],
      señal: s,
    }),

    // — Derivados (§4.3) —

    'derivado.oscilacion': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.CONSISTENCIA,
      severidad: SEV.P0,
      causa: `Oscilación detectada: señal "${s.señalHash}" se repitió ${s.conteo} veces en ${K.UMBRAL.OSCILACION_VENTANA_MS / 1000}s`,
      impacto: 'Una corrección es revertida repetidamente — los mecanismos de autocorrección están en conflicto; el estado oscila sin converger',
      componenteAfectado: 'Subsistema de autocorrección / motor de layout',
      contexto: { señalHash: s.señalHash, conteo: s.conteo },
      evidencia: `${s.conteo} emisiones del mismo hash en la ventana de detección de oscilación`,
      posibleOrigen: 'Dos correcciones que se contradicen; el motor revierte la corrección del subsistema en cada tick',
      correcciones: [], // Las oscilaciones siempre escalan
      señal: s,
    }),

    'monitor.sonda.lenta': (s) => _diagnostico({
      hash: s.hash,
      categoria: CAT.RENDIMIENTO,
      severidad: SEV.P2,
      causa: `Sonda "${s.nombre}" tardó ${s.duracionMs}ms — supera el límite de 5ms por tick`,
      impacto: 'El subsistema de autocorrección degrada la performance del hilo de renderizado que debería proteger',
      componenteAfectado: `AC_Monitor / sonda ${s.nombre}`,
      contexto: { nombre: s.nombre, duracion: s.duracionMs },
      evidencia: `performance.now() registra ${s.duracionMs}ms para la sonda`,
      posibleOrigen: 'DOM demasiado grande; operaciones de layout forzadas dentro de la sonda; dispositivo con recursos limitados',
      correcciones: [],
      señal: s,
    }),
  };

  // ── Clasificación principal (DTI §5.2) ────────────────────────────────────

  function _clasificar(señal) {
    const regla = _reglas[señal.señalTipo];
    if (!regla) {
      // Señal sin regla → indeterminada (§5.3)
      return _manejarIndeterminada(señal);
    }
    const diag = regla(señal);
    if (!diag) return; // cae bajo umbral
    _publicarAnomalia(diag);
  }

  // ── Manejo de indeterminación (DTI §5.3) ──────────────────────────────────

  function _manejarIndeterminada(señal) {
    const hash = 'indet_' + señal.señalTipo;
    const registro = _indeterminados.get(hash) || { conteo: 0, ts: Date.now() };
    registro.conteo++;
    registro.ts = Date.now();
    _indeterminados.set(hash, registro);

    if (registro.conteo >= 3) {
      // Escala como anomalía diagnóstica del propio subsistema
      Bus.publicar('escalacion.emitida', {
        categoria: CAT.CONSISTENCIA,
        severidad: SEV.P2,
        diagnosticHash: hash,
        motivo: `Señal "${señal.señalTipo}" indeterminada en ${registro.conteo} ticks consecutivos — regla de clasificación ausente`,
        contexto: señal,
      });
      _indeterminados.delete(hash);
    }
  }

  // ── Publicación al Planner ────────────────────────────────────────────────

  function _publicarAnomalia(diag) {
    if (_colaActiva.has(diag.hash)) return; // ya en proceso
    _colaActiva.add(diag.hash);

    Bus.publicar('anomalia.clasificada', {
      ...diag,
      diagnosticHash: diag.hash,
    });

    // El hash sale de la cola cuando el ciclo se cierra (ciclo.cerrado) o
    // se escala (escalacion.emitida)
    const _limpiar = Bus.suscribir('ciclo.cerrado', (ev) => {
      if (ev.diagnosticHash === diag.hash) { _colaActiva.delete(diag.hash); _limpiar(); }
    });
    const _limpiarEsc = Bus.suscribir('escalacion.emitida', (ev) => {
      if (ev.diagnosticHash === diag.hash) { _colaActiva.delete(diag.hash); _limpiarEsc(); }
    });
  }

  // ── Suscripción al bus ────────────────────────────────────────────────────

  Bus.suscribir('senal.observada', _clasificar);

  // Validación posterior (§9): reanaliza la señal original tras una corrección
  Bus.suscribir('intervencion.ejecutada', (ev) => {
    if (!ev.señalOriginal) return;
    // Re-emitir la señal para re-clasificar y verificar que la anomalía desapareció
    queueMicrotask(() => {
      const recheck = _reglas[ev.señalOriginal?.señalTipo]?.(ev.señalOriginal);
      if (!recheck) {
        // La anomalía ya no se detecta → ciclo cerrado con éxito
        Bus.publicar('ciclo.cerrado', {
          diagnosticHash: ev.diagnosticHash,
          exito: true,
          duracion: Date.now() - ev.tsInicio,
        });
      } else {
        // Persiste → rollback o escalación
        Bus.publicar('anomalia.clasificada', {
          ...recheck,
          diagnosticHash: recheck.hash,
          esRevalidacion: true,
          correoOriginal: ev.queCorrigio,
        });
      }
    });
  });

  return {};
})();
