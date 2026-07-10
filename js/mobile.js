/**
 * mobile.js — Detección de viewport y experiencia táctil del Compendio Digital
 * ─────────────────────────────────────────────────────────────────────────────
 * Arquitectura B — Motor único adaptativo.
 *
 * RESPONSABILIDADES de este archivo:
 *   · Detectar si el dispositivo es móvil (esMobile)
 *   · Agregar la clase es-mobile al <html> para que CSS pueda reaccionar
 *   · Crear y gestionar los bottom sheets (lector, cajero)
 *   · Detectar swipe horizontal para navegar entre sedes
 *
 * LO QUE ESTE ARCHIVO NO HACE:
 *   · NO restructura el DOM (no más innerHTML="", no ua-capitulo)
 *   · NO tiene un motor de render propio
 *   · NO posiciona elementos — el posicionamiento mobile lo resuelve
 *     layout.js (bloque de zonas editoriales dentro de distribuir(),
 *     que escribe --x/--y en px). mobile.css solo dimensiona y estiliza.
 */

'use strict';

// ─── Detección de móvil — triple check ───────────────────────────────────────
//
// Por qué el triple check:
//
// 1. matchMedia('max-width: 820px') — falla si el browser reporta el layout
//    viewport como 980px (ocurre en Chromium/Brave cuando el carrusel tiene
//    3 sedes × 100vw = contenido de 300vw, inflando el "initial containing block").
//
// 2. window.innerWidth <= 820 — también puede verse afectado por el mismo
//    problema de layout viewport en algunos browsers.
//
// 3. matchMedia('pointer: coarse AND hover: none') — DETECCIÓN DEFINITIVA:
//    No depende del ancho del viewport. Identifica dispositivos con puntero
//    impreciso (dedo) sin capacidad de hover — los smartphones y tablets.
//    No puede ser engañada por overflow de contenido ni por layout viewport.
//    Bootstrap 5, Tailwind CSS y Material Design usan esta misma media feature.

const mqMobile = window.matchMedia('(max-width: 820px)');
const mqTactil = window.matchMedia('(pointer: coarse) and (hover: none)');

const esMobile = () => {
  const mq     = mqMobile.matches;
  const tactil = mqTactil.matches;   // ← TRIGGER PRIMARIO — funciona siempre
  const iw     = window.innerWidth > 0 ? window.innerWidth <= 820 : mq;
  const result = mq || tactil || iw;
  return result;
};

window.esMobile = esMobile;

// Diagnóstico desactivado en producción — cambiar a console.log('[Mobile]', msg) para depurar
const _diag = (msg) => {}; // eslint-disable-line no-unused-vars
_diag(`Cargado. matchMedia=${mqMobile.matches} innerWidth=${window.innerWidth}`);

// Clase es-mobile en el <html> — ANTES de cualquier render
if (esMobile()) {
  document.documentElement.classList.add('es-mobile');
  _diag('es-mobile añadido (carga inicial)');
}

document.addEventListener('DOMContentLoaded', () => {
  _diag(`DOMContentLoaded. mq=${mqMobile.matches} tactil=${mqTactil.matches} iw=${window.innerWidth}`);
  actualizarClaseMobile();
}, { once: true });

// ─── Bottom sheet genérico ────────────────────────────────────────────────────

function crearBottomSheet({ id, label, clase = '' }) {
  let sheet = document.getElementById(id);
  if (sheet) return hoja(sheet);

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

  const telon = document.createElement('div');
  telon.className = 'bottom-sheet-telon';
  telon.id = `${id}-telon`;
  document.body.appendChild(telon);

  sheet.querySelector('.bottom-sheet-cerrar').addEventListener('click', () => api.cerrar());
  telon.addEventListener('click', () => api.cerrar());

  // Pull-to-close
  let startY = 0, isDragging = false;
  sheet.querySelector('.bottom-sheet-track').addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const delta = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${delta}px)`;
  }, { passive: true });
  window.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    if (e.changedTouches[0].clientY - startY > 120) api.cerrar();
    else sheet.style.transform = '';
  });

  const api = hoja(sheet);
  return api;
}

function hoja(sheet) {
  const id = sheet.id;
  const telon = document.getElementById(`${id}-telon`);
  const body = sheet.querySelector('.bottom-sheet-body');

  function abrir(contenido) {
    if (contenido) {
      if (typeof contenido === 'string') body.innerHTML = contenido;
      else { body.innerHTML = ''; body.appendChild(contenido); }
    }
    document.body.classList.add('lector-bloqueando-scroll');
    sheet.setAttribute('aria-hidden', 'false');
    telon?.classList.add('bottom-sheet-telon--visible');
    sheet.classList.add('bottom-sheet--abierto');
    sheet.style.transform = '';
    window.setTimeout(() => {
      sheet.querySelector('.bottom-sheet-cerrar')?.focus();
    }, 380);
  }

  function cerrar() {
    sheet.classList.remove('bottom-sheet--abierto');
    sheet.setAttribute('aria-hidden', 'true');
    telon?.classList.remove('bottom-sheet-telon--visible');
    document.body.classList.remove('lector-bloqueando-scroll');
    // H-08: reanudar rotación al cerrar cualquier bottom sheet (lector o cajero).
    // Rotacion.reanudar() es idempotente — si el intervalo ya corría, no hace nada.
    window.Rotacion?.reanudar();
  }

  return { abrir, cerrar, el: sheet, body };
}

// ─── Lector bottom sheet ──────────────────────────────────────────────────────

let lectorSheet = null;

function inicializarLectorMobile() {
  if (!esMobile()) return;
  lectorSheet = crearBottomSheet({
    id: 'lector-bottom-sheet',
    label: 'Contenido completo del documento',
    clase: 'bottom-sheet--lector',
  });
  window.LectorSheet = lectorSheet;
  _diag('LectorSheet creado');
}

// ─── Cajero bottom sheet ──────────────────────────────────────────────────────

let cajeroSheet = null;

function inicializarCajeroMobile() {
  if (!esMobile()) return;

  cajeroSheet = crearBottomSheet({
    id: 'cajero-bottom-sheet',
    label: 'Panel institucional del Compendio Digital',
    clase: 'bottom-sheet--cajero bottom-sheet--pantalla-completa',
  });

  // Interceptar el hamburguesa en mobile
  const menuBtn = document.getElementById('menu-inst-btn');
  if (!menuBtn) return;

  menuBtn.addEventListener('click', (e) => {
    if (!esMobile()) return;
    e.stopImmediatePropagation();
    cajeroSheet.el.classList.contains('bottom-sheet--abierto')
      ? cajeroSheet.cerrar()
      : abrirCajeroMobile();
  }, { capture: true });

  _diag('CajeroSheet creado');
}

function abrirCajeroMobile() {
  if (!cajeroSheet) return;
  const cajeroDesktop = document.getElementById('cajero-institucional');
  if (!cajeroDesktop) return;

  const contenido = document.createElement('div');
  contenido.className = 'cajero-mobile-contenido';

  const logo = cajeroDesktop.querySelector('.cajero-logo');
  const titulo = cajeroDesktop.querySelector('.cajero-cabecera-titulo');
  contenido.innerHTML = `
    <div class="cajero-mobile-header">
      ${logo ? `<img src="${logo.src}" alt="${logo.alt}" class="cajero-mobile-logo" width="24" height="24">` : ''}
      <span class="cajero-mobile-titulo">${titulo?.textContent || 'Compendio Digital'}</span>
    </div>
  `;

  const nav = cajeroDesktop.querySelector('.cajero-nav');
  const cuerpo = cajeroDesktop.querySelector('.cajero-cuerpo');
  if (nav && cuerpo) {
    const navClone = nav.cloneNode(true);
    const cuerpoClone = cuerpo.cloneNode(true);
    navClone.className = 'cajero-mobile-nav';
    cuerpoClone.className = 'cajero-mobile-cuerpo';

    navClone.querySelectorAll('.cajero-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        navClone.querySelectorAll('.cajero-tab').forEach(t => {
          t.classList.remove('cajero-tab--activa');
          t.setAttribute('aria-selected', 'false');
        });
        cuerpoClone.querySelectorAll('.cajero-panel').forEach(p => {
          p.hidden = true; p.classList.remove('cajero-panel--activa');
        });
        tab.classList.add('cajero-tab--activa');
        tab.setAttribute('aria-selected', 'true');
        const panel = cuerpoClone.querySelector(`#panel-${tab.dataset.panel}`);
        if (panel) { panel.hidden = false; panel.classList.add('cajero-panel--activa'); }
      });
    });

    cuerpoClone.querySelector('#cajero-btn-recorrer')?.addEventListener('click', () => cajeroSheet.cerrar());
    cuerpoClone.querySelector('#cajero-btn-reabrir')?.addEventListener('click', () => {
      cajeroSheet.cerrar();
      window.setTimeout(() => window.Intro?.mostrar?.(), 380);
    });

    contenido.appendChild(navClone);
    contenido.appendChild(cuerpoClone);
  }

  cajeroSheet.abrir(contenido);
}

// ─── Toast de información de sede ─────────────────────────────────────────────
// Cuando el usuario toca un botón de sede en el nav mobile, un panel
// compacto aparece brevemente con: nombre, subtítulo, UAs participantes y
// texto orientador. Permite orientarse al ingresar a una nueva sala sin
// tener que abrir el cajero institucional completo.
// Se auto-descarta en 5 segundos o al tocar el panel.

let toastTimer = null;

function mostrarInfoSede(seccion) {
  if (!seccion) return;

  // Limpiar toast anterior
  const anterior = document.getElementById('sede-info-toast');
  if (anterior) {
    clearTimeout(toastTimer);
    anterior.remove();
  }

  // Leer datos del kicker oculto (siempre en el DOM, solo invisible en mobile)
  const nombre  = seccion.querySelector('.sede-kicker-titulo')?.textContent?.trim()    || '';
  const subtit  = seccion.querySelector('.sede-kicker-subtitulo')?.textContent?.trim() || '';
  const orient  = seccion.querySelector('.sede-kicker-orientacion')?.textContent?.trim() || '';
  const uasEls  = seccion.querySelectorAll('.sede-kicker-unidades li');
  const uas     = Array.from(uasEls).map(li => li.textContent.trim()).filter(Boolean);
  const docsN   = seccion.querySelectorAll('.elemento').length;
  const sedeNum = seccion.querySelector('.sede-kicker-num')?.textContent?.trim() || '';

  if (!nombre) return;

  const toast = document.createElement('div');
  toast.id = 'sede-info-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="sit-header">
      <span class="sit-num">${sedeNum}</span>
      <h3 class="sit-nombre">${nombre}</h3>
    </div>
    ${subtit ? `<p class="sit-subtit">${subtit}</p>` : ''}
    ${orient ? `<p class="sit-orient">${orient}</p>` : ''}
    ${uas.length ? `<ul class="sit-uas">${uas.map(u => `<li>${u}</li>`).join('')}</ul>` : ''}
    <p class="sit-count">${docsN} documentos · tocá para cerrar</p>
  `;
  document.body.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('sit--visible'));
  });

  const cerrarToast = () => {
    clearTimeout(toastTimer);
    toast.classList.remove('sit--visible');
    setTimeout(() => toast.remove(), 320);
  };

  toast.addEventListener('click', cerrarToast);
  toastTimer = setTimeout(cerrarToast, 5000);
}

// ─── Nav mobile: elemento independiente ──────────────────────────────────────
// El .ruta desktop tiene demasiada herencia CSS para sobreescribir de forma
// confiable en mobile. En su lugar se crea un elemento completamente nuevo
// (#ruta-m) que no hereda nada del sistema desktop.
// Los clicks delegan a los botones .ruta-nodo originales para conservar
// toda la lógica del Carrusel (ir(), onCambio, Rotacion.iniciar, etc.).

function crearNavMobile() {
  if (!esMobile()) return;
  if (document.getElementById('ruta-m')) return;

  const sedesNodos = Array.from(document.querySelectorAll('.ruta-nodo'));
  if (!sedesNodos.length) {
    window.setTimeout(crearNavMobile, 400);
    return;
  }

  // Obtener las secciones de sede para el toast
  const secciones = Array.from(document.querySelectorAll('.sede'));

  const nav = document.createElement('nav');
  nav.id = 'ruta-m';
  nav.setAttribute('aria-label', 'Navegación entre sedes');

  sedesNodos.forEach((nodo, i) => {
    const nombre = nodo.querySelector('.ruta-nodo-nombre')?.textContent?.trim()
                   || `Sede ${i + 1}`;
    const btn = document.createElement('button');
    btn.className = 'ruta-m-btn';
    btn.dataset.indice = String(i);
    btn.textContent = nombre;
    btn.setAttribute('aria-label', `Ir a ${nombre}`);
    if (nodo.classList.contains('ruta-nodo--activo')) {
      btn.classList.add('ruta-m-btn--activo');
    }
    btn.addEventListener('click', () => {
      nodo.click();                  // delega al botón original → carrusel.ir()
      mostrarInfoSede(secciones[i]); // muestra el resumen de la sede
    });
    nav.appendChild(btn);
  });

  document.body.appendChild(nav);

  window.actualizarNavMobile = (indice) => {
    nav.querySelectorAll('.ruta-m-btn').forEach((b, i) => {
      b.classList.toggle('ruta-m-btn--activo', i === indice);
    });
  };

  _diag(`crearNavMobile: nav creado con ${sedesNodos.length} sedes`);
}

// ─── Swipe entre sedes ────────────────────────────────────────────────────────
// El carrusel usa CSS scroll-snap-type: x mandatory + IntersectionObserver.
// El browser ya maneja el swipe horizontal nativo: al deslizar, el carrusel
// snappea a la siguiente sede y el IntersectionObserver dispara onCambio.
// Un detector de swipe JS adicional sería redundante y podría causar doble-
// scroll (CSS snap mueve al Sede B, y entonces JS también llama ir(C)).
// Por eso inicializarSwipeSedes es un no-op — se conserva por compatibilidad
// de API pero no registra ningún listener.
function inicializarSwipeSedes(carruselEl, carruselInstance) {
  // Intencionalmente vacío: CSS scroll-snap maneja el swipe nativo.
  // La navegación táctil entre sedes funciona sin código JS adicional.
}

// ─── Resize reactivo ─────────────────────────────────────────────────────────

function actualizarClaseMobile() {
  if (esMobile()) {
    document.documentElement.classList.add('es-mobile');
    _diag('es-mobile: ACTIVO — mq=' + mqMobile.matches + ' tactil=' + mqTactil.matches + ' iw=' + window.innerWidth);
  } else {
    document.documentElement.classList.remove('es-mobile');
    _diag('es-mobile: INACTIVO');
  }
}

mqMobile.addEventListener('change', actualizarClaseMobile);
mqTactil.addEventListener('change', actualizarClaseMobile);

// ─── Inicialización principal ─────────────────────────────────────────────────

function inicializarMobile() {
  if (!esMobile()) {
    _diag('inicializarMobile: SKIP (no es mobile)');
    return;
  }
  _diag(`inicializarMobile: EJECUTADO — innerWidth=${window.innerWidth} tactil=${mqTactil.matches}`);
  inicializarLectorMobile();
  inicializarCajeroMobile();
  // El nav se crea después de que pintarRuta() haya poblado los .ruta-nodo.
  // Se llama aquí porque inicializarMobile() se llama al final de iniciarSitio()
  // cuando la nav del desktop ya existe.
  crearNavMobile();
}

// ─── API pública ──────────────────────────────────────────────────────────────

window.Mobile = {
  inicializar:      inicializarMobile,
  inicializarSwipe: inicializarSwipeSedes,
  crearNav:         crearNavMobile,
  abrirCajero:      abrirCajeroMobile,
  getLectorSheet:   () => lectorSheet,
};
