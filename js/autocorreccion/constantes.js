/**
 * SUBSISTEMA DE AUTOCORRECCIÓN — Módulo 2: Constantes y Configuración
 * DTI §5.1 (umbrales), §7.2 (presupuestos), §12 (niveles de autonomía)
 *
 * Todas las constantes están en un único objeto inmutable para facilitar
 * la calibración durante la Fase 1 del roadmap (§15) sin cambiar lógica.
 */
window.AC_K = Object.freeze({
  // ── Versión del subsistema (independiente del build del Motor Editorial) ──
  VERSION: '1.0.0',

  // ── Nivel de autonomía activo (DTI §12). Valor inicial: 0 = solo detectar ─
  // Cambiar a 2 o superior activa correcciones automáticas.
  NIVEL_AUTONOMIA: 0,

  // ── Umbrales de detección (DTI §5.1) ─────────────────────────────────────
  UMBRAL: Object.freeze({
    SOLAPE_TARJETAS_PX2: 200,        // entre dos tarjetas
    SOLAPE_ZONA_PX2: 1,              // contra chip/kicker — cero tolerancia
    CONTRASTE_FOCO_MIN: 3.0,         // WCAG 1.4.11
    DISTRIBUIR_DESKTOP_MS: 300,      // tiempo máximo aceptable de distribuir()
    DISTRIBUIR_MOBILE_MS: 200,
    AUTORIDADES_MAX: 2,              // K=2
    TICK_PROACTIVO_MS: 1000,         // frecuencia de sondas proactivas
    TICK_CONSISTENCIA_MS: 5000,      // frecuencia de sonda de consistencia
    TICK_META_MS: 60000,             // meta-salud
    TIMEOUT_CORRECCCION_MS: 100,     // timeout para correcciones locales
    TIMEOUT_DISTRIBUIR_MS: 500,      // timeout para correcciones que invocan distribuir()
    COOL_DOWN_ENTRE_INTERV_MS: 300,  // mínimo entre intervenciones globales
    OSCILACION_VENTANA_MS: 15000,    // ventana para detectar oscilación
    OSCILACION_UMBRAL: 3,            // intervenciones en esa ventana = oscilación
    OSCILACION_SUSPENSION_MS: 60000, // suspensión tras detectar oscilación
    REGISTRO_MAX_ENTRADAS: 200,      // circular en memoria
  }),

  // ── Presupuestos por corrección (DTI §7.2) ────────────────────────────────
  PRESUPUESTO: Object.freeze({
    'C-01': { porSedeSesion: 3, porMinuto: 3, porSesion: 15 },
    'C-03': { porSedeSesion: 5, porMinuto: 3, porSesion: 20 },
    'C-04': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-05': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-10': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-11': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-12': { porSedeSesion: 1, porMinuto: 1, porSesion: 3 },
    'C-20': { porSedeSesion: 5, porMinuto: 3, porSesion: 15 },
    'C-21': { porSedeSesion: 5, porMinuto: 3, porSesion: 20 },
    'C-22': { porSedeSesion: 5, porMinuto: 3, porSesion: 20 },
    'C-24': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-30': { porSedeSesion: 3, porMinuto: 2, porSesion: 12 },
    'C-31': { porSedeSesion: 5, porMinuto: 3, porSesion: 20 },
    'C-32': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    'C-60': { porSedeSesion: 3, porMinuto: 2, porSesion: 6 },
    'C-70': { porSedeSesion: 2, porMinuto: 2, porSesion: 10 },
    'C-71': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
    '_default': { porSedeSesion: 3, porMinuto: 2, porSesion: 10 },
  }),

  // ── Categorías de anomalía (DTI §2) ──────────────────────────────────────
  CATEGORIA: Object.freeze({
    EDITORIAL: 'editorial',
    MULTIMEDIA: 'multimedia',
    ACCESIBILIDAD: 'accesibilidad',
    RENDIMIENTO: 'rendimiento',
    RECURSOS: 'recursos',
    NAVEGACION: 'navegacion',
    CONSISTENCIA: 'consistencia',
  }),

  // ── Severidades ───────────────────────────────────────────────────────────
  SEVERIDAD: Object.freeze({ P0: 0, P1: 1, P2: 2 }),

  // ── Códigos de corrección (DTI §6) ───────────────────────────────────────
  // Las que están en NIVEL_AUTONOMIA_MINIMO: 2 pueden ejecutarse automáticamente
  // a partir del nivel 2. Las que requieren nivel superior, o están marcadas
  // como NO_AUTOCORREGIBLE, solo se escalan.
  CORRECCIONES: Object.freeze({
    'C-01': { descripcion: 'Restaurar narrador UA', nivelMin: 2, idempotente: true, reversible: true },
    'C-02': { descripcion: 'Narrador fuera del DOM → escalar', nivelMin: 99, idempotente: false },
    'C-03': { descripcion: 'Reducir autoridades a K=2', nivelMin: 2, idempotente: true, reversible: true },
    'C-04': { descripcion: 'Reiniciar ciclo (corrupción de estado)', nivelMin: 2, idempotente: true, reversible: true },
    'C-05': { descripcion: 'Corregir familia de autoridades en intercambio', nivelMin: 2, idempotente: true, reversible: true },
    'C-10': { descripcion: 'Colapsar tarjeta de video inválido', nivelMin: 2, idempotente: true, reversible: true },
    'C-11': { descripcion: 'Recompute escala por portada con dimensión anómala', nivelMin: 2, idempotente: true, reversible: true },
    'C-12': { descripcion: 'Fallback cromático por imagen de fondo faltante', nivelMin: 2, idempotente: true, reversible: true },
    'C-13': { descripcion: 'Activar monograma por retrato faltante', nivelMin: 2, idempotente: true, reversible: true },
    'C-14': { descripcion: 'Colapsar video si no inicia', nivelMin: 2, idempotente: true, reversible: true },
    'C-20': { descripcion: 'Reforzar contraste de foco', nivelMin: 2, idempotente: true, reversible: true },
    'C-21': { descripcion: 'Restaurar tabindex=0 en entrante', nivelMin: 2, idempotente: true, reversible: true },
    'C-22': { descripcion: 'Recomputar aria-label desde dataset', nivelMin: 2, idempotente: true, reversible: true },
    'C-23': { descripcion: 'Ampliar target táctil', nivelMin: 2, idempotente: true, reversible: true },
    'C-24': { descripcion: 'Reordenar foco narrativo (M-30)', nivelMin: 2, idempotente: true, reversible: true },
    'C-30': { descripcion: 'Redistribuir escena (solape entre tarjetas)', nivelMin: 3, idempotente: true, reversible: true },
    'C-31': { descripcion: 'Reposicionar invasor de zona protegida', nivelMin: 2, idempotente: true, reversible: true },
    'C-32': { descripcion: 'Reubicar elemento fuera de viewport', nivelMin: 2, idempotente: true, reversible: true },
    'C-33': { descripcion: 'Restaurar scroll/overflow', nivelMin: 2, idempotente: true, reversible: true },
    'C-34': { descripcion: 'Variante tipográfica compacta (texto truncado)', nivelMin: 2, idempotente: true, reversible: true },
    'C-35': { descripcion: 'Espacio desaprovechado → solo registrar', nivelMin: 99, idempotente: true },
    'C-40': { descripcion: 'Rendimiento distribuir() → solo registrar', nivelMin: 99 },
    'C-41': { descripcion: 'Circuit breaker para recalcular() frecuente', nivelMin: 3, idempotente: true, reversible: true },
    'C-42': { descripcion: 'Purga de registro del subsistema', nivelMin: 2, idempotente: true, reversible: false },
    'C-50': { descripcion: 'Degradación graceful sessionStorage', nivelMin: 2, idempotente: true, reversible: false },
    'C-51': { descripcion: 'Purga de Almacen saturado', nivelMin: 2, idempotente: true, reversible: false },
    'C-52': { descripcion: 'Corpus faltante → escalar', nivelMin: 99 },
    'C-53': { descripcion: 'Bypass fonts.ready', nivelMin: 2, idempotente: true, reversible: true },
    'C-60': { descripcion: 'Remontar IntersectionObserver del carrusel', nivelMin: 3, idempotente: true, reversible: true },
    'C-61': { descripcion: 'Sincronizar nav mobile con carrusel', nivelMin: 2, idempotente: true, reversible: true },
    'C-62': { descripcion: 'Limpiar hash de URL obsoleto', nivelMin: 2, idempotente: true, reversible: true },
    'C-63': { descripcion: 'Resetear chip de retorno huérfano', nivelMin: 2, idempotente: true, reversible: true },
    'C-64': { descripcion: 'Resetear scroll del Lector', nivelMin: 2, idempotente: true, reversible: true },
    'C-70': { descripcion: 'Rehidratar configurar() por firma divergente', nivelMin: 2, idempotente: true, reversible: true },
    'C-71': { descripcion: 'Corregir clase --rotacion-espera divergente', nivelMin: 2, idempotente: true, reversible: true },
    'C-72': { descripcion: 'Reconstruir cicloOrden corrupto', nivelMin: 3, idempotente: true, reversible: true },
  }),

  // ── Prefijo de claves de persistencia ─────────────────────────────────────
  PREFIJO_STORAGE: 'unam_semana_regional_autocorreccion_',
});
