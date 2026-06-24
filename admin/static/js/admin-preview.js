/**
 * admin-preview.js
 * Importa renderizarFicha del sitio público REAL (servido de solo
 * lectura por el panel, no una copia) y lo invoca con los datos
 * actuales del proyecto. No es una simulación: es el mismo código que
 * corre en producción para cualquier visitante.
 */

import { renderizarFicha } from '/admin/publico/js/render-ficha.js';

const ETIQUETA_ESTADO = {
  pendiente: 'Borrador', en_revision: 'En revisión', validado: 'Aprobado',
  publicado: 'Publicado', archivado: 'Archivado',
};

async function iniciar() {
  const idProyecto = new URLSearchParams(window.location.search).get('id');
  const contenedor = document.getElementById('app');

  if (!idProyecto) {
    contenedor.innerHTML = '<p>Falta el id del proyecto en la URL.</p>';
    return;
  }

  try {
    const [proyecto, categorias] = await Promise.all([
      fetch(`/admin/api/proyecto/${idProyecto}`).then((r) => r.json()),
      fetch('/admin/api/categorias').then((r) => r.json()),
    ]);

    if (proyecto.error) {
      contenedor.innerHTML = `<p>${proyecto.error}</p>`;
      return;
    }

    document.getElementById('estadoActualBanner').textContent =
      `— Estado actual: ${ETIQUETA_ESTADO[proyecto.estado_revision] || proyecto.estado_revision}`;

    renderizarFicha(contenedor, proyecto, categorias);
  } catch (error) {
    contenedor.innerHTML = `<p>No se pudo generar la vista previa: ${error.message}</p>`;
  }
}

iniciar();
