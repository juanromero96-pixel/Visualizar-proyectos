/**
 * mobile.js — Experiencia móvil del Compendio Digital UNaM
 * ─────────────────────────────────────────────────────────────────────────────
 * Este módulo implementa la reinterpretación de la experiencia de escritorio
 * para dispositivos móviles (≤820px) sin afectar nada del desktop.
 *
 * Decisiones de arquitectura clave:
 *  · Reutiliza los mismos elementos `.elemento` creados por app.js —
 *    no los recrea, solo los reorganiza en una estructura semántica UA-chapters.
 *  · El motor de layout.js (Distribuidor) NUNCA corre en móvil.
 *  · El sistema de rotación se deshabilita durante el scroll activo.
 *  · Toda la lógica está aislada aquí: eliminar este archivo restaura el desktop.
 */

'use strict';

// ─── Detección de móvil (reactiva) ───────────────────────────────────────────
const mqMobile = window.matchMedia('(max-width: 820px)');
const esMobile = () => mqMobile.matches;

// Expuesto para que app.js lo consulte
window.esMobile = esMobile;

// ─── Orden editorial de tipos dentro de un capítulo UA ───────────────────────
const PRIORIDAD_TIPO_MOBILE = {
  'registro-ua':        0,   // narrador del capítulo — siempre primero
  'video':              1,   // registro audiovisual
  'testimonio':         2,   // voces de la facultad
  'registro-conceptual':3,   // reflexión editorial
};

// ─── Orden de UAs por sede ───────────────────────────────────────────────────
const ORDEN_UA_MOBILE = [
  'fhycs', 'fceqyn', 'fce',
  'fayd', 'fi',
  'fcf', 'escuelaagrotecnicaeldorado',
  'general',
  'unam',  // autoridades UNaM al final de cada sede
];

// ─── Nombres display de cada UA ──────────────────────────────────────────────
const NOMBRES_UA = {
  'fhycs':  'Humanidades y Ciencias Sociales',
  'fceqyn': 'Ciencias Exactas, Químicas y Naturales',
  'fce':    'Ciencias Económicas',
  'fayd':   'Arte y Diseño',
  'fi':     'Ingeniería',
  'fcf':    'Ciencias Forestales',
  'escuelaagrotecnicaeldorado': 'Escuela Agrotécnica Eldorado',
  'unam':   'Voces institucionales UNaM',
  'general':'Registros documentales',
};

// ─── 1. REORGANIZACIÓN UA-CHAPTERS ───────────────────────────────────────────

/**
 * Toma los elementos `.elemento` del escenario (ya creados por app.js) y
 * los reagrupa dentro de `.ua-capitulo` wrappers ordenados por UA y tipo.
 * Agrega headers de capítulo, separadores y etiquetas de tipo.
 *
 * @param {HTMLElement} seccion — la sección <section class="sede">
 */
function reorganizarMobile(seccion) {
  if (!esMobile()) return;

  const escenario = seccion.querySelector('.escenario');
  if (!escenario || escenario.classList.contains('escenario--mobile')) return;

  // Recoger TODOS los elementos (incluyendo ocultos por K=2)
  // Los ocultos por K=2 (.elemento--oculto-autoridad) no se muestran
  const todos = Array.from(escenario.querySelectorAll('.elemento'));
  if (!todos.length) return;

  // Agrupar por data-ua
  const grupos = new Map();
  todos.forEach(el => {
    if (el.classList.contains('elemento--oculto-autoridad')) return; // excluir K=2 hidden
    const ua = el.dataset.ua || 'general';
    if (!grupos.has(ua)) grupos.set(ua, []);
    grupos.get(ua).push(el);
  });

  // Ordenar grupos según ORDEN_UA_MOBILE
  const gruposOrdenados = [...grupos.entries()].sort(([a], [b]) => {
    const ia = ORDEN_UA_MOBILE.indexOf(a) < 0 ? 99 : ORDEN_UA_MOBILE.indexOf(a);
    const ib = ORDEN_UA_MOBILE.indexOf(b) < 0 ? 99 : ORDEN_UA_MOBILE.indexOf(b);
    return ia - ib;
  });

  // Construir la nueva estructura en un fragment
  const frag = document.createDocumentFragment();

  gruposOrdenados.forEach(([ua, elementos], grupoIdx) => {
    // Ordenar elementos dentro del grupo según prioridad narrativa
    elementos.sort((a, b) => {
      const pa = PRIORIDAD_TIPO_MOBILE[a.dataset.tipo] ?? 9;
      const pb = PRIORIDAD_TIPO_MOBILE[b.dataset.tipo] ?? 9;
      return pa - pb;
    });

    const esUnam = ua === 'unam';

    // ── Crear el capítulo UA ──────────────────────────────────────────────
    const capitulo = document.createElement('section');
    capitulo.className = `ua-capitulo ua-capitulo--${ua}`;
    capitulo.dataset.ua = ua;
    capitulo.style.setProperty('--color-ua-cap', getComputedStyle(document.documentElement)
      .getPropertyValue('--unam-cian') || '#00a3e0');

    // Recuperar el color real de la UA del primer elemento que lo tenga
    const colorUA = elementos[0]?.style.getPropertyValue('--color-ua') ||
                    (window.colorDeUnidadAcademica ? colorDeUnidadAcademica(ua) : '#00a3e0');
    capitulo.style.setProperty('--color-ua-cap', colorUA);

    // ── Header del capítulo ───────────────────────────────────────────────
    const header = document.createElement('header');
    header.className = `ua-capitulo-header${esUnam ? ' ua-capitulo-header--unam' : ''}`;
    header.setAttribute('aria-label', `Capítulo: ${NOMBRES_UA[ua] || ua}`);

    const sigla = ua.toUpperCase().replace('ESCUELAAGROTECNICAELDORADO', 'EAE');
    header.innerHTML = `
      <span class="ua-capitulo-sigla" aria-hidden="true">${sigla}</span>
      <span class="ua-capitulo-nombre">${NOMBRES_UA[ua] || ua}</span>
      <span class="ua-capitulo-cantidad">${elementos.length} ${elementos.length === 1 ? 'documento' : 'documentos'}</span>
    `;
    capitulo.appendChild(header);

    // ── Agregar elementos al capítulo ─────────────────────────────────────
    const contenedor = document.createElement('div');
    contenedor.className = 'ua-capitulo-contenido';

    elementos.forEach((el, i) => {
      // El primer elemento de tipo registro-ua es el NARRADOR: recibe clase especial
      if (el.dataset.tipo === 'registro-ua') {
        el.classList.add('elemento--narrador-capitulo');
      }
      // Agregar clase mobile para que CSS lo trate correctamente
      el.classList.add('elemento--mobile');
      contenedor.appendChild(el);
    });

    capitulo.appendChild(contenedor);

    // ── Separador entre capítulos (no después del último) ─────────────────
    if (grupoIdx < gruposOrdenados.length - 1) {
      const sep = document.createElement('div');
      sep.className = 'ua-capitulo-separador';
      sep.setAttribute('aria-hidden', 'true');
      sep.style.setProperty('--color-ua-sep', colorUA);
      sep.innerHTML = `<span class="ua-capitulo-separador-linea"></span>`;
      frag.appendChild(capitulo);
      frag.appendChild(sep);
    } else {
      frag.appendChild(capitulo);
    }
  });

  // Reconstruir el escenario
  escenario.innerHTML = '';
  escenario.appendChild(frag);
  escenario.classList.add('escenario--mobile');
}

// ─── 2. HEADER CONTEXTUAL DE SEDE (reemplaza el kicker lateral) ──────────────

/**
 * Crea o actualiza el header contextual de la sede en modo móvil.
 * Sustituye al panel kicker lateral del desktop.
 *
 * @param {HTMLElement} seccion
 */
function actualizarHeaderMobile(seccion) {
  if (!esMobile()) return;

  // Evitar duplicados
  const existing = seccion.querySelector('.sede-header-mobile');
  if (existing) { existing.style.display = ''; return; }

  // Datos de la sede desde el kicker existente
  const kicker = seccion.querySelector('.sede-kicker');
  if (!kicker) return;

  const num     = kicker.querySelector('.sede-kicker-num')?.textContent || '';
  const titulo  = kicker.querySelector('.sede-kicker-titulo')?.textContent || '';
  const subtit  = kicker.querySelector('.sede-kicker-subtitulo')?.textContent || '';
  const orient  = seccion.querySelector('.sede-kicker-orientacion')?.textContent || '';
  const uasEls  = kicker.querySelectorAll('.sede-kicker-unidades li');
  const uas     = Array.from(uasEls).map(li => li.textContent).filter(Boolean);
  const parrafos = Array.from(kicker.querySelectorAll('.sede-kicker-descripcion'))
                        .map(p => p.textContent).join(' ');
  const docsCount = seccion.querySelectorAll('.elemento').length;

  const header = document.createElement('div');
  header.className = 'sede-header-mobile';
  header.setAttribute('role', 'banner');
  header.innerHTML = `
    <div class="sede-header-mobile-compacto">
      <span class="sede-header-mobile-num" aria-label="Sede ${num}">${num}</span>
      <h2 class="sede-header-mobile-titulo">${titulo}</h2>
      <button class="sede-header-mobile-toggle" aria-expanded="false"
              aria-label="Más información sobre ${titulo}">
        <span class="sede-header-toggle-icon" aria-hidden="true">↕</span>
      </button>
    </div>
    <div class="sede-header-mobile-expandido" hidden>
      <p class="sede-header-mobile-subtitulo">${subtit}</p>
      ${parrafos ? `<p class="sede-header-mobile-texto">${parrafos}</p>` : ''}
      ${orient  ? `<p class="sede-header-mobile-orientacion">${orient}</p>` : ''}
      ${uas.length ? `<ul class="sede-header-mobile-uas" aria-label="Unidades académicas">
        ${uas.map(u => `<li>${u}</li>`).join('')}
      </ul>` : ''}
      <p class="sede-header-mobile-contador">
        <span>${docsCount}</span> documentos disponibles en esta sede
      </p>
      <button class="sede-header-mobile-cerrar" aria-label="Contraer información">
        Comenzar el recorrido ↓
      </button>
    </div>
  `;

  // Insertar ANTES del escenario (dentro de la sede)
  const escenario = seccion.querySelector('.escenario');
  seccion.insertBefore(header, escenario);

  // Lógica de toggle
  const toggle = header.querySelector('.sede-header-mobile-toggle');
  const expandido = header.querySelector('.sede-header-mobile-expandido');
  const cerrar = header.querySelector('.sede-header-mobile-cerrar');

  function abrir() {
    expandido.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    header.classList.add('sede-header-mobile--expandido');
    // Pequeña animación de entrada
    expandido.style.opacity = '0';
    requestAnimationFrame(() => {
      expandido.style.transition = 'opacity 280ms ease';
      expandido.style.opacity = '1';
    });
  }

  function cerrarHeader() {
    expandido.style.opacity = '0';
    setTimeout(() => {
      expandido.hidden = true;
      expandido.style.opacity = '';
      expandido.style.transition = '';
      toggle.setAttribute('aria-expanded', 'false');
      header.classList.remove('sede-header-mobile--expandido');
    }, 280);
  }

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') cerrarHeader();
    else abrir();
  });
  cerrar?.addEventListener('click', cerrarHeader);
}

// ─── 3. BOTTOM SHEET GENÉRICO ─────────────────────────────────────────────────

/**
 * Crea y gestiona un bottom sheet táctil.
 * Soporta pull-to-close, animación de entrada/salida, y accesibilidad.
 *
 * @returns {{ abrir, cerrar, setContenido }} — API del bottom sheet
 */
function crearBottomSheet({ id, label, clase = '' }) {
  let sheet = document.getElementById(id);

  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = id;
    sheet.className = `bottom-sheet ${clase}`;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', label);
    sheet.setAttribute('aria-hidden', 'true');

    sheet.innerHTML = `
      <div class="bottom-sheet-track" role="presentation">
        <div class="bottom-sheet-handle" aria-hidden="true"></div>
        <button class="bottom-sheet-cerrar" aria-label="Cerrar">✕</button>
      </div>
      <div class="bottom-sheet-body"></div>
    `;
    document.body.appendChild(sheet);

    // Cerrar con botón
    sheet.querySelector('.bottom-sheet-cerrar').addEventListener('click', () => cerrar());

    // Telón
    const telon = document.createElement('div');
    telon.className = `bottom-sheet-telon`;
    telon.id = `${id}-telon`;
    telon.addEventListener('click', () => cerrar());
    document.body.appendChild(telon);

    // Pull-to-close gesture
    let startY = 0, currentY = 0, isDragging = false;

    sheet.querySelector('.bottom-sheet-track').addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      isDragging = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const delta = Math.max(0, currentY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      sheet.style.transition = '';
      const delta = currentY - startY;
      // Si arrastró más de 120px hacia abajo → cerrar
      if (delta > 120) {
        cerrar();
      } else {
        sheet.style.transform = '';
      }
    });
  }

  const telon = document.getElementById(`${id}-telon`);
  const body = sheet.querySelector('.bottom-sheet-body');

  function abrir(contenido) {
    if (contenido) {
      if (typeof contenido === 'string') {
        body.innerHTML = contenido;
      } else {
        body.innerHTML = '';
        body.appendChild(contenido);
      }
    }
    document.body.classList.add('bottom-sheet-activo');
    document.body.classList.add('lector-bloqueando-scroll');
    sheet.setAttribute('aria-hidden', 'false');
    telon.classList.add('bottom-sheet-telon--visible');
    sheet.classList.add('bottom-sheet--abierto');
    sheet.style.transform = '';
    // Focus al contenido
    window.setTimeout(() => {
      const firstFocusable = sheet.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
      firstFocusable?.focus();
    }, 400);
  }

  function cerrar() {
    sheet.classList.remove('bottom-sheet--abierto');
    sheet.setAttribute('aria-hidden', 'true');
    telon.classList.remove('bottom-sheet-telon--visible');
    document.body.classList.remove('bottom-sheet-activo');
    document.body.classList.remove('lector-bloqueando-scroll');
  }

  function setContenido(contenido) {
    if (typeof contenido === 'string') body.innerHTML = contenido;
    else { body.innerHTML = ''; body.appendChild(contenido); }
  }

  return { abrir, cerrar, setContenido, el: sheet, body };
}

// ─── 4. LECTOR BOTTOM SHEET ──────────────────────────────────────────────────

let lectorSheet = null;

/**
 * Configura el lector documental para funcionar como bottom sheet en móvil.
 * Se llama una vez cuando Lector.iniciar() termina.
 */
function inicializarLectorMobile() {
  if (!esMobile()) return;

  lectorSheet = crearBottomSheet({
    id: 'lector-bottom-sheet',
    label: 'Contenido completo del documento',
    clase: 'bottom-sheet--lector',
  });

  // Exponer para que lector.js pueda usarlo
  window.LectorSheet = lectorSheet;
}

// ─── 5. CAJERO BOTTOM SHEET ───────────────────────────────────────────────────

let cajeroSheet = null;

/**
 * Convierte el cajero institucional en un bottom sheet de pantalla completa.
 */
function inicializarCajeroMobile() {
  if (!esMobile()) return;

  cajeroSheet = crearBottomSheet({
    id: 'cajero-bottom-sheet',
    label: 'Panel institucional del Compendio Digital',
    clase: 'bottom-sheet--cajero bottom-sheet--pantalla-completa',
  });

  // Intercept del botón hamburguesa — en mobile usa el sheet en vez del modal desktop
  const menuBtn = document.getElementById('menu-inst-btn');
  if (!menuBtn) return;

  menuBtn.addEventListener('click', (e) => {
    if (!esMobile()) return; // dejar que el handler original del desktop actúe
    e.stopImmediatePropagation(); // evitar que el handler de intro.js se dispare también
    if (cajeroSheet.el.classList.contains('bottom-sheet--abierto')) {
      cajeroSheet.cerrar();
    } else {
      abrirCajeroMobile();
    }
  }, { capture: true }); // capture:true para que se ejecute primero
}

function abrirCajeroMobile() {
  if (!cajeroSheet) return;

  // Clonar el contenido del cajero institucional (sin el telon ni la lógica desktop)
  const cajeroDesktop = document.getElementById('cajero-institucional');
  if (!cajeroDesktop) return;

  // Crear una versión mobile del contenido del cajero
  const contenidoMobile = document.createElement('div');
  contenidoMobile.className = 'cajero-mobile-contenido';

  // Cabecera
  const logo = cajeroDesktop.querySelector('.cajero-logo');
  const titulo = cajeroDesktop.querySelector('.cajero-cabecera-titulo');
  contenidoMobile.innerHTML = `
    <div class="cajero-mobile-header">
      ${logo ? `<img src="${logo.src}" alt="${logo.alt}" class="cajero-mobile-logo" width="24" height="24">` : ''}
      <span class="cajero-mobile-titulo">${titulo?.textContent || 'Compendio Digital'}</span>
    </div>
  `;

  // Tabs y paneles
  const nav = cajeroDesktop.querySelector('.cajero-nav');
  const cuerpo = cajeroDesktop.querySelector('.cajero-cuerpo');
  if (nav && cuerpo) {
    const navClone = nav.cloneNode(true);
    const cuerpoClone = cuerpo.cloneNode(true);
    navClone.className = 'cajero-mobile-nav';
    cuerpoClone.className = 'cajero-mobile-cuerpo';

    // Activar tabs en el clone
    navClone.querySelectorAll('.cajero-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Reset todos
        navClone.querySelectorAll('.cajero-tab').forEach(t => {
          t.classList.remove('cajero-tab--activa');
          t.setAttribute('aria-selected', 'false');
        });
        cuerpoClone.querySelectorAll('.cajero-panel').forEach(p => {
          p.hidden = true;
          p.classList.remove('cajero-panel--activa');
        });
        // Activar el seleccionado
        tab.classList.add('cajero-tab--activa');
        tab.setAttribute('aria-selected', 'true');
        const panelId = `panel-${tab.dataset.panel}`;
        const panel = cuerpoClone.getElementById?.(panelId) ||
                       cuerpoClone.querySelector(`#${panelId}`);
        if (panel) { panel.hidden = false; panel.classList.add('cajero-panel--activa'); }
      });
    });

    // Botones de acción en el clone
    cuerpoClone.querySelector('#cajero-btn-recorrer')?.addEventListener('click', () => cajeroSheet.cerrar());
    cuerpoClone.querySelector('#cajero-btn-reabrir')?.addEventListener('click', () => {
      cajeroSheet.cerrar();
      window.setTimeout(() => Intro?.mostrar?.(), 380);
    });

    contenidoMobile.appendChild(navClone);
    contenidoMobile.appendChild(cuerpoClone);
  }

  cajeroSheet.abrir(contenidoMobile);
}

// ─── 6. NAVEGACIÓN TÁCTIL ENTRE SEDES ────────────────────────────────────────

/**
 * Agrega detección de swipe horizontal en el carrusel para navegar entre sedes.
 * El swipe vertical (para scrollear el mural) NO activa el cambio de sede.
 */
function inicializarSwipeSedes(carruselEl, carruselInstance) {
  if (!esMobile()) return;

  let x0 = 0, y0 = 0, swipeActivo = false;

  carruselEl.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    swipeActivo = true;
  }, { passive: true });

  carruselEl.addEventListener('touchend', e => {
    if (!swipeActivo || !esMobile()) return;
    swipeActivo = false;

    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;

    // Solo procesar si el swipe es principalmente horizontal
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    if (dx < 0) {
      carruselInstance.siguiente();
    } else {
      carruselInstance.anterior();
    }
  }, { passive: true });
}

// ─── 7. ROTACIÓN: pausa durante el scroll ────────────────────────────────────

let scrollPauseTimer = null;

function inicializarPausaRotacion() {
  if (!esMobile()) return;

  const carruselEl = document.getElementById('carrusel');
  if (!carruselEl) return;

  carruselEl.addEventListener('scroll', () => {
    // Pausar durante el scroll; reanudar 2s después de que se detenga
    clearTimeout(scrollPauseTimer);
    // La rotación en móvil está deshabilitada; esto sería para versión futura
    scrollPauseTimer = window.setTimeout(() => {
      scrollPauseTimer = null;
    }, 2000);
  }, { passive: true });
}

// ─── 8. INICIALIZACIÓN PRINCIPAL ─────────────────────────────────────────────

/**
 * Punto de entrada de la experiencia móvil.
 * Se llama desde app.js cuando el DOM está listo.
 */
function inicializarMobile() {
  if (!esMobile()) return;

  // Marcar el body con clase mobile para que CSS pueda usar selectores simples
  document.documentElement.classList.add('es-mobile');

  inicializarLectorMobile();
  inicializarCajeroMobile();
  inicializarPausaRotacion();
}

// ─── 9. RE-INICIALIZAR EN RESIZE ─────────────────────────────────────────────

mqMobile.addEventListener('change', (e) => {
  if (e.matches) {
    // Pasó a mobile — reiniciar si hay secciones ya pintadas
    document.documentElement.classList.add('es-mobile');
    inicializarMobile();
  } else {
    // Pasó a desktop — restaurar
    document.documentElement.classList.remove('es-mobile');
    // Los escenarios con clase escenario--mobile se reharán en el siguiente recalcular()
  }
});

// Exponer funciones necesarias por app.js
window.Mobile = {
  inicializar:         inicializarMobile,
  reorganizarSede:     reorganizarMobile,
  actualizarHeader:    actualizarHeaderMobile,
  inicializarSwipe:    inicializarSwipeSedes,
  abrirCajero:         abrirCajeroMobile,
  getLectorSheet:      () => lectorSheet,
};
