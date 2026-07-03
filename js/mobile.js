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
 *   · NO tiene condiciones de carrera con layout.js
 *   → El posicionamiento mobile lo resuelve CSS en mobile.css
 *   → El motor de escritorio (layout.js) ya tiene su propio guard en L60
 */

'use strict';

// ─── Detección de viewport — dual check ──────────────────────────────────────
const mqMobile = window.matchMedia('(max-width: 820px)');

const esMobile = () => {
  const mq = mqMobile.matches;
  const iw = window.innerWidth > 0 ? window.innerWidth <= 820 : mq;
  return mq || iw;
};

window.esMobile = esMobile;

const _diag = (msg) => console.log('[Mobile]', msg);
_diag(`Cargado. matchMedia=${mqMobile.matches} innerWidth=${window.innerWidth}`);

// Clase es-mobile en el <html> — ANTES de cualquier render
if (esMobile()) {
  document.documentElement.classList.add('es-mobile');
  _diag('es-mobile añadido (carga inicial)');
}

document.addEventListener('DOMContentLoaded', () => {
  _diag(`DOMContentLoaded. esMobile=${esMobile()} innerWidth=${window.innerWidth}`);
  if (esMobile()) {
    document.documentElement.classList.add('es-mobile');
  } else {
    document.documentElement.classList.remove('es-mobile');
  }
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

// ─── Swipe entre sedes ────────────────────────────────────────────────────────

function inicializarSwipeSedes(carruselEl, carruselInstance) {
  if (!esMobile()) return;
  let x0 = 0, y0 = 0;

  carruselEl.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  carruselEl.addEventListener('touchend', e => {
    if (!esMobile()) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (dx < 0) carruselInstance.siguiente();
    else carruselInstance.anterior();
  }, { passive: true });
}

// ─── Resize reactivo ─────────────────────────────────────────────────────────

mqMobile.addEventListener('change', (e) => {
  if (e.matches) {
    document.documentElement.classList.add('es-mobile');
    _diag('resize → es-mobile activado');
  } else {
    document.documentElement.classList.remove('es-mobile');
    _diag('resize → es-mobile desactivado');
  }
});

// ─── Inicialización principal ─────────────────────────────────────────────────

function inicializarMobile() {
  if (!esMobile()) {
    _diag('inicializarMobile: SKIP (no es mobile)');
    return;
  }
  _diag(`inicializarMobile: EJECUTADO (innerWidth=${window.innerWidth})`);
  inicializarLectorMobile();
  inicializarCajeroMobile();
}

// ─── API pública ──────────────────────────────────────────────────────────────

window.Mobile = {
  inicializar:      inicializarMobile,
  inicializarSwipe: inicializarSwipeSedes,
  abrirCajero:      abrirCajeroMobile,
  getLectorSheet:   () => lectorSheet,
};
