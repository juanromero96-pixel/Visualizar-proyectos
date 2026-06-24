/**
 * data.js
 * Única puerta de entrada a /data: ningún otro módulo hace fetch()
 * directo. Carga el catálogo liviano y el catálogo controlado una sola
 * vez (caché en memoria) y carga cada ficha de detalle de forma
 * diferida, solo cuando alguien la pide por primera vez.
 */

const RUTA_CATALOGO = 'data/catalog.json';
const RUTA_CATEGORIAS = 'data/categorias.json';
const RUTA_PROYECTOS = 'data/proyectos';

let catalogoCache = null;
let categoriasCache = null;
const detalleCache = new Map();

async function obtenerJSON(ruta) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${ruta} (HTTP ${respuesta.status})`);
  }
  return respuesta.json();
}

/**
 * Catálogo liviano: lista de proyectos para listado, filtros y
 * búsqueda (data/catalog.json). Se carga una sola vez.
 */
export async function obtenerCatalogo() {
  if (catalogoCache) return catalogoCache;
  catalogoCache = await obtenerJSON(RUTA_CATALOGO);
  return catalogoCache;
}

/**
 * Catálogo controlado de unidades académicas, instituciones cooperantes
 * y etiquetas sugeridas (data/categorias.json). Es la referencia de
 * normalización descripta en el Documento Técnico, sección 14.
 */
export async function obtenerCategorias() {
  if (categoriasCache) return categoriasCache;
  categoriasCache = await obtenerJSON(RUTA_CATEGORIAS);
  return categoriasCache;
}

/**
 * Ficha completa de un proyecto (data/proyectos/{id}.json). Carga
 * diferida: solo se pide al servidor la primera vez que se abre esa
 * ficha; después se reutiliza desde la caché en memoria.
 */
export async function obtenerProyecto(id) {
  if (detalleCache.has(id)) return detalleCache.get(id);
  const proyecto = await obtenerJSON(`${RUTA_PROYECTOS}/${id}.json`);
  detalleCache.set(id, proyecto);
  return proyecto;
}

/**
 * Busca la entrada resumida de un proyecto dentro de un catálogo ya
 * cargado. Útil para mostrar datos mínimos mientras se espera el
 * detalle completo, o para validar que un id existe sin pedir el
 * archivo de detalle.
 */
export function buscarEnCatalogo(catalogo, id) {
  return catalogo.find((proyecto) => proyecto.id === id) || null;
}

/**
 * Traduce el catálogo controlado de unidades académicas a un mapa
 * { id -> { id, sigla, nombre } } para no recorrer el array cada vez.
 */
export function mapaUnidadesAcademicas(categorias) {
  return new Map(categorias.unidades_academicas.map((unidad) => [unidad.id, unidad]));
}

/**
 * Traduce el catálogo controlado de instituciones cooperantes a un
 * mapa { id -> { id, nombre } }.
 */
export function mapaInstitucionesCooperantes(categorias) {
  return new Map(categorias.instituciones_cooperantes.map((institucion) => [institucion.id, institucion]));
}
