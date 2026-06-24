/**
 * render-catalogo.js
 * Construye la grilla de tarjetas resumidas a partir de una lista de
 * proyectos (entradas de catalog.json). La usan la vista de catálogo
 * completo, los destacados de portada y los resultados de búsqueda,
 * para no duplicar el armado de la tarjeta en cada lugar.
 *
 * Esta versión ya funciona con listas de cualquier tamaño, solo sin
 * paginar: la paginación o scroll controlado para el volumen completo
 * (~130 fichas) y los filtros combinables se agregan en el bloque
 * siguiente, sin necesidad de tocar este archivo.
 */

import { mapaUnidadesAcademicas } from './data.js';
import { animarEntradaTarjetas } from './animaciones.js';

export function crearTarjeta(proyecto, unidades) {
  const unidad = unidades.get(proyecto.unidad_academica);

  const articulo = document.createElement('article');
  articulo.className = 'tarjeta-proyecto';

  const enlace = document.createElement('a');
  enlace.className = 'tarjeta-proyecto__enlace';
  enlace.href = `#/proyecto/${proyecto.id}`;

  const imagen = document.createElement('div');
  imagen.className = 'tarjeta-proyecto__imagen';
  if (proyecto.imagen_portada) {
    const img = document.createElement('img');
    img.src = proyecto.imagen_portada;
    img.alt = '';
    img.loading = 'lazy';
    imagen.append(img);
  } else {
    imagen.classList.add('tarjeta-proyecto__imagen--vacia');
    imagen.textContent = unidad ? unidad.sigla : 'UNaM';
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'tarjeta-proyecto__cuerpo';

  const meta = document.createElement('p');
  meta.className = 'tarjeta-proyecto__meta';
  meta.textContent = [unidad ? unidad.sigla : proyecto.unidad_academica, proyecto.anio]
    .filter(Boolean)
    .join(' · ');

  const titulo = document.createElement('h3');
  titulo.className = 'tarjeta-proyecto__titulo';
  titulo.textContent = proyecto.titulo;

  const resumen = document.createElement('p');
  resumen.className = 'tarjeta-proyecto__resumen';
  resumen.textContent = proyecto.resumen;

  const etiquetas = document.createElement('ul');
  etiquetas.className = 'tarjeta-proyecto__etiquetas';
  (proyecto.etiquetas || []).slice(0, 3).forEach((etiqueta) => {
    const item = document.createElement('li');
    item.textContent = etiqueta;
    etiquetas.append(item);
  });

  cuerpo.append(meta, titulo, resumen, etiquetas);
  enlace.setAttribute('aria-label', `Ver ficha completa: ${proyecto.titulo}`);
  enlace.append(imagen, cuerpo);
  articulo.append(enlace);
  return articulo;
}

/**
 * Renderiza `proyectos` (entradas de catalog.json) dentro de
 * `contenedor`. `opciones.mensajeVacio` permite personalizar el texto
 * cuando la lista está vacía (distinto en catálogo que en búsqueda).
 */
export async function renderizarGrillaProyectos(contenedor, proyectos, categorias, opciones = {}) {
  contenedor.innerHTML = '';

  if (!proyectos.length) {
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = opciones.mensajeVacio || 'No se encontraron proyectos.';
    contenedor.append(vacio);
    return;
  }

  const unidades = mapaUnidadesAcademicas(categorias);
  const grilla = document.createElement('div');
  grilla.className = 'grilla-proyectos';
  proyectos.forEach((proyecto) => {
    grilla.append(crearTarjeta(proyecto, unidades));
  });
  contenedor.append(grilla);
  animarEntradaTarjetas(grilla);
}
