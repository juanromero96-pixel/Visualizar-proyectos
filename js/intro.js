/**
 * intro.js — Introducción institucional y cajero del Compendio Digital
 * -----------------------------------------------------------------------
 * Dos módulos expuestos en window (para acceso desde la consola en
 * desarrollo) y un inicializador que los conecta al DOM.
 *
 * Intro   — gestiona la pantalla introductoria de primera visita:
 *             - detecta si ya se visitó el sitio (localStorage)
 *             - muestra / oculta el overlay
 *             - ejecuta la transición de salida (la tarjeta viaja hacia el
 *               icono hamburguesa, la pantalla se desvanece)
 *             - puede reabrirse desde el cajero
 *
 * Cajero  — gestiona el panel lateral institucional:
 *             - apertura/cierre con transición
 *             - cambio de pestaña/panel
 *             - trampa de foco (accesibilidad)
 *             - cierre con Escape o clic en el telón
 */

'use strict';

// ─── Clave de persistencia ───────────────────────────────────────────────────

const INTRO_KEY = 'unam_semana_regional_intro_vista';

// ─── Módulo Intro ────────────────────────────────────────────────────────────

const Intro = (() => {
  // ── Referencias ──────────────────────────────────────────────────────────
  function refs() {
    return {
      overlay:     document.getElementById('intro-overlay'),
      tarjeta:     document.getElementById('intro-tarjeta'),
      btnIngresar: document.getElementById('intro-btn-ingresar'),
      btnConocer:  document.getElementById('intro-btn-conocer'),
      guia:        document.getElementById('intro-guia'),
      menuBtn:     document.getElementById('menu-inst-btn'),
    };
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  let guiaVisible = false;

  // ── Persistencia ─────────────────────────────────────────────────────────
  function yaVista()   { return !!localStorage.getItem(INTRO_KEY); }
  function marcarVista()  { localStorage.setItem(INTRO_KEY, '1'); }

  // ── Guía expandible ───────────────────────────────────────────────────────
  function toggleGuia() {
    const { btnConocer, guia } = refs();
    guiaVisible = !guiaVisible;
    guia.classList.toggle('intro-guia--visible', guiaVisible);
    btnConocer.setAttribute('aria-expanded', String(guiaVisible));
    btnConocer.textContent = guiaVisible
      ? 'Ocultar guía ↑'
      : 'Conocer la experiencia ↓';
  }

  // ── Transición de salida ──────────────────────────────────────────────────
  //
  // La tarjeta calcula en tiempo real el desplazamiento necesario para
  // "viajar" desde su posición central actual hasta el icono hamburguesa.
  // Esto funciona incluso si el viewport cambió desde que se cargó la página.
  //
  function ejecutarTransicion() {
    const { overlay, tarjeta, menuBtn } = refs();

    // 1. Hacer visible el botón hamburguesa primero (necesitamos su posición)
    menuBtn.classList.add('menu-inst-btn--visible');
    menuBtn.setAttribute('aria-hidden', 'false');

    // 2. Calcular el desplazamiento entre el centro de la tarjeta y el del icono
    const mRect = menuBtn.getBoundingClientRect();
    const tRect = tarjeta.getBoundingClientRect();

    const targetX = mRect.left + mRect.width / 2;
    const targetY = mRect.top  + mRect.height / 2;
    const cardX   = tRect.left + tRect.width  / 2;
    const cardY   = tRect.top  + tRect.height / 2;

    const dx = targetX - cardX;
    const dy = targetY - cardY;

    // 3. Bloquear interacción durante la animación
    overlay.classList.add('intro--saliendo');

    // 4. Animar la tarjeta: reducir a casi nada y desplazarla al destino
    tarjeta.style.transition = [
      'transform 520ms cubic-bezier(0.4, 0, 0.2, 1)',
      'opacity   260ms ease 180ms',
    ].join(', ');
    // La tarjeta usa translate(-50%,-50%) para centrarse; la compensamos
    // aquí sumando el desplazamiento real calculado arriba.
    tarjeta.style.transform = [
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
      'scale(0.04)',
    ].join(' ');
    tarjeta.style.opacity = '0';

    // 5. Desvanecer el fondo del overlay
    const fondo = overlay.querySelector('.intro-fondo');
    const velo  = overlay.querySelector('.intro-velo');
    if (fondo) { fondo.style.transition = 'opacity 480ms ease 80ms'; fondo.style.opacity = '0'; }
    if (velo)  { velo.style.transition  = 'opacity 480ms ease 80ms'; velo.style.opacity  = '0'; }

    // 6. Ocultar completamente tras la animación
    window.setTimeout(() => {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.removeAttribute('role');
    }, 720);
  }

  // ── API pública ───────────────────────────────────────────────────────────

  /** Ingresa al compendio (guarda en localStorage + ejecuta la transición) */
  function ingresar() {
    marcarVista();
    ejecutarTransicion();
  }

  /**
   * Muestra el overlay de nuevo (desde el cajero).
   * Restaura el estado visual inicial del overlay para que la experiencia
   * sea igual a la primera vez.
   */
  function mostrar() {
    const { overlay, tarjeta, menuBtn } = refs();
    const fondo = overlay.querySelector('.intro-fondo');
    const velo  = overlay.querySelector('.intro-velo');

    // Restaurar estilos de los subcomponentes
    [tarjeta, fondo, velo].forEach(el => {
      if (!el) return;
      el.style.transition = '';
      el.style.transform  = '';
      el.style.opacity    = '';
    });

    // Mostrar el overlay
    overlay.classList.remove('intro--saliendo');
    overlay.style.display = '';
    overlay.style.opacity = '';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('role', 'dialog');

    // El botón hamburguesa ya está visible (quedó visible después de la
    // primera transición), así que solo nos aseguramos de que esté ahí.
    menuBtn.classList.add('menu-inst-btn--visible');

    // Focus al botón principal
    window.setTimeout(() => {
      document.getElementById('intro-btn-ingresar')?.focus();
    }, 50);
  }

  /** Inicializa los eventos del overlay */
  function iniciar() {
    const { overlay, btnIngresar, btnConocer, menuBtn } = refs();

    btnIngresar.addEventListener('click', ingresar);
    btnConocer.addEventListener('click',  toggleGuia);

    // Escape cierra la intro como atajo (accesibilidad)
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') ingresar();
    });

    // ¿Primera visita?
    if (!yaVista()) {
      // Mostrar el overlay — ya está en el HTML con display:flex
      overlay.setAttribute('aria-hidden', 'false');
      overlay.setAttribute('role', 'dialog');
      // Focus al botón principal tras la animación de entrada del CSS
      window.setTimeout(() => btnIngresar?.focus(), 900);
    } else {
      // No es la primera visita: ocultar directamente
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      menuBtn.classList.add('menu-inst-btn--visible');
      menuBtn.setAttribute('aria-hidden', 'false');
    }
  }

  return { iniciar, ingresar, mostrar };
})();

// ─── Módulo Cajero ───────────────────────────────────────────────────────────

const Cajero = (() => {
  // ── Estado ────────────────────────────────────────────────────────────────
  let abierto       = false;
  let panelActual   = 'bienvenida';

  // ── Helpers de DOM ───────────────────────────────────────────────────────
  function cajeroEl()  { return document.getElementById('cajero-institucional'); }
  function telonEl()   { return document.getElementById('cajero-telon'); }
  function menuBtn()   { return document.getElementById('menu-inst-btn'); }

  // ── Apertura ─────────────────────────────────────────────────────────────
  function abrir(panelId) {
    const cajero = cajeroEl();
    const telon  = telonEl();
    const btn    = menuBtn();

    cajero.classList.add('cajero--abierto');
    cajero.setAttribute('aria-hidden', 'false');
    telon.classList.add('cajero-telon--visible');
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('menu-inst-btn--abierto');
    document.body.classList.add('lector-bloqueando-scroll'); // reutiliza la clase existente
    abierto = true;

    if (panelId) cambiarPanel(panelId);

    // Focus al botón de cierre tras la transición
    window.setTimeout(() => {
      cajero.querySelector('.cajero-cerrar-btn')?.focus();
    }, 380);
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  function cerrar() {
    const cajero = cajeroEl();
    const telon  = telonEl();
    const btn    = menuBtn();

    cajero.classList.remove('cajero--abierto');
    cajero.setAttribute('aria-hidden', 'true');
    telon.classList.remove('cajero-telon--visible');
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('menu-inst-btn--abierto');
    document.body.classList.remove('lector-bloqueando-scroll');
    abierto = false;

    // Devolver foco al botón que abrió el cajero
    window.setTimeout(() => btn.focus(), 50);
  }

  // ── Cambio de panel ───────────────────────────────────────────────────────
  function cambiarPanel(panelId) {
    panelActual = panelId;

    // Ocultar todos los paneles y desactivar todas las pestañas
    document.querySelectorAll('.cajero-panel').forEach(p => {
      p.hidden = true;
      p.classList.remove('cajero-panel--activa');
    });
    document.querySelectorAll('.cajero-tab').forEach(t => {
      t.classList.remove('cajero-tab--activa');
      t.setAttribute('aria-selected', 'false');
    });

    // Mostrar el panel pedido
    const panel = document.getElementById(`panel-${panelId}`);
    const tab   = document.getElementById(`tab-${panelId}`);
    if (panel) {
      panel.hidden = false;
      panel.classList.add('cajero-panel--activa');
    }
    if (tab) {
      tab.classList.add('cajero-tab--activa');
      tab.setAttribute('aria-selected', 'true');
    }
  }

  // ── Trampa de foco (accesibilidad) ────────────────────────────────────────
  function configurarTrampaDeFoco(cajero) {
    cajero.addEventListener('keydown', (e) => {
      if (!abierto || e.key !== 'Tab') return;
      const focusables = Array.from(
        cajero.querySelectorAll([
          'button:not([disabled])',
          '[href]',
          'input:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ].join(', '))
      ).filter(el => !el.closest('[hidden]'));

      if (!focusables.length) return;
      const primero = focusables[0];
      const ultimo  = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      } else {
        if (document.activeElement === ultimo)  { e.preventDefault(); primero.focus(); }
      }
    });
  }

  // ── Inicialización ────────────────────────────────────────────────────────
  function iniciar() {
    const cajero = cajeroEl();
    const telon  = telonEl();

    // Botón hamburguesa
    menuBtn().addEventListener('click', () => { abierto ? cerrar() : abrir(); });

    // Botón cerrar dentro del cajero
    document.getElementById('cajero-cerrar')?.addEventListener('click', cerrar);

    // Clic en el telón (fuera del cajero)
    telon.addEventListener('click', cerrar);

    // Escape cierra el cajero
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && abierto) cerrar();
    });

    // Pestañas del cajero
    document.querySelectorAll('.cajero-tab').forEach(tab => {
      tab.addEventListener('click', () => cambiarPanel(tab.dataset.panel));
    });

    // Botón "Comenzar el recorrido" dentro del panel Bienvenida
    document.getElementById('cajero-btn-recorrer')?.addEventListener('click', cerrar);

    // Botón "Ver introducción nuevamente" dentro del panel Bienvenida
    document.getElementById('cajero-btn-reabrir')?.addEventListener('click', () => {
      cerrar();
      window.setTimeout(() => Intro.mostrar(), 380); // esperar que el cajero cierre
    });

    // Trampa de foco
    configurarTrampaDeFoco(cajero);
  }

  return { iniciar, abrir, cerrar, cambiarPanel };
})();

// ─── Inicialización ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Intro.iniciar();
  Cajero.iniciar();
});

// Exposición global (útil en consola y para el cajero que llama Intro.mostrar())
window.Intro  = Intro;
window.Cajero = Cajero;
