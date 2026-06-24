/**
 * layout.js
 * Comportamiento del andamiaje visual persistente (header y navegación).
 * No conoce datos de proyectos ni rutas: solo abre/cierra el menú en
 * pantallas chicas y gestiona los atributos ARIA correspondientes.
 */

export function initLayout() {
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');

  if (!toggle || !menu) return;

  function cerrarMenu() {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function alternarMenu() {
    const abierto = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(abierto));
  }

  toggle.addEventListener('click', alternarMenu);

  // Cerrar el menú al elegir un destino (relevante en mobile, donde
  // el menú se superpone al contenido).
  menu.addEventListener('click', (evento) => {
    if (evento.target.tagName === 'A') {
      cerrarMenu();
    }
  });

  // Cerrar con Escape si el foco está dentro del menú.
  menu.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      cerrarMenu();
      toggle.focus();
    }
  });
}
