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

// ODS sugerido por unidad académica: una primera lectura derivada de
// las etiquetas reales que ya tienen sus proyectos (ver Documento
// Técnico y la conversación de diseño). Es una sugerencia editorial,
// no una clasificación institucional aprobada — por eso se muestra
// siempre como "(sugerido)", nunca como dato cerrado.
const ODS_SUGERIDO_POR_UNIDAD = {
  fhycs: 'ODS 4 · Educación',
  fce: 'ODS 8 · Trabajo decente',
  fceqyn: 'ODS 6 · Agua limpia',
  fcf: 'ODS 15 · Ecosistemas terrestres',
  fi: 'ODS 7 · Energía asequible',
  fayd: 'ODS 11 · Comunidades sostenibles',
};

function crearFichaLegajo(proyecto, unidad, codigoLegajo) {
  const enlace = document.createElement('a');
  enlace.className = 'ficha-legajo';
  enlace.href = `#/proyecto/${proyecto.id}`;
  enlace.setAttribute('aria-label', `Abrir expediente: ${proyecto.titulo}`);

  const miniatura = document.createElement('div');
  miniatura.className = 'ficha-legajo__miniatura';
  miniatura.textContent = proyecto.imagen_portada ? '' : (unidad ? unidad.sigla.slice(0, 3) : 's/d');
  if (proyecto.imagen_portada) {
    const img = document.createElement('img');
    img.src = proyecto.imagen_portada;
    img.alt = '';
    img.loading = 'lazy';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    miniatura.append(img);
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'ficha-legajo__cuerpo';

  const codigo = document.createElement('span');
  codigo.className = 'ficha-legajo__codigo';
  codigo.textContent = `Exp. interno ${codigoLegajo}`;

  const titulo = document.createElement('span');
  titulo.className = 'ficha-legajo__titulo';
  titulo.textContent = proyecto.titulo;

  const anio = document.createElement('span');
  anio.className = 'ficha-legajo__anio';
  anio.textContent = proyecto.anio || '';

  cuerpo.append(codigo, titulo, anio);

  const etiquetas = document.createElement('div');
  etiquetas.className = 'ficha-legajo__etiquetas';
  if (proyecto.etiquetas && proyecto.etiquetas.length) {
    const chip = document.createElement('span');
    chip.className = 'ficha-legajo__ods';
    chip.textContent = `· ${proyecto.etiquetas[0]}`;
    etiquetas.append(chip);
  }

  enlace.append(miniatura, cuerpo, etiquetas);
  return enlace;
}

/**
 * Construye la "carpeta" visual de una unidad académica: lomo, pestaña,
 * número de expediente, descripción institucional (borrador), hasta
 * `limiteProyectos` fichas de legajo, y un enlace "ver todos" si hay
 * más (necesario para que esto no se rompa cuando haya 130+ proyectos
 * y no solo los 6 actuales).
 */
export function crearCarpetaUnidad(unidad, proyectosDeUnidad, numeroDeOrden, limiteProyectos = 3) {
  const carpeta = document.createElement('div');
  carpeta.className = 'carpeta-unidad';

  const hojaFondo = document.createElement('div');
  hojaFondo.className = 'carpeta-unidad__hoja-fondo';
  hojaFondo.setAttribute('aria-hidden', 'true');

  const pestana = document.createElement('div');
  pestana.className = 'carpeta-unidad__pestana';
  pestana.setAttribute('aria-hidden', 'true');

  const cuerpo = document.createElement('div');
  cuerpo.className = 'carpeta-unidad__cuerpo';

  const lomo = document.createElement('div');
  lomo.className = 'carpeta-unidad__lomo';
  lomo.setAttribute('aria-hidden', 'true');
  lomo.innerHTML = `
    <div class="carpeta-unidad__lomo-linea"></div>
    <div class="carpeta-unidad__lomo-marca"></div>
    <div class="carpeta-unidad__lomo-linea"></div>
    <span class="carpeta-unidad__lomo-rotulo">EXPEDIENTE</span>
  `;

  const contenido = document.createElement('div');
  contenido.className = 'carpeta-unidad__contenido';

  const cabecera = document.createElement('div');
  cabecera.className = 'carpeta-unidad__cabecera';
  const rotuloCampo = document.createElement('span');
  rotuloCampo.className = 'carpeta-unidad__rotulo-campo';
  rotuloCampo.textContent = 'Unidad académica';
  const codigo = document.createElement('span');
  codigo.className = 'carpeta-unidad__codigo';
  codigo.innerHTML = `Expediente N.° <b>${unidad.sigla}-${String(numeroDeOrden).padStart(3, '0')}</b>`;
  cabecera.append(rotuloCampo, codigo);

  const titulo = document.createElement('h2');
  titulo.className = 'carpeta-unidad__titulo';
  titulo.textContent = unidad.nombre;

  const divisor1 = document.createElement('div');
  divisor1.className = 'carpeta-unidad__divisor';
  const divisor2 = document.createElement('div');
  divisor2.className = 'carpeta-unidad__divisor-punteado';

  contenido.append(cabecera, titulo, divisor1, divisor2);

  if (unidad.descripcion_borrador) {
    const resumenRotulo = document.createElement('div');
    resumenRotulo.className = 'carpeta-unidad__resumen-rotulo';
    resumenRotulo.textContent = 'Resumen de serie documental';
    const resumen = document.createElement('p');
    resumen.className = 'carpeta-unidad__resumen';
    resumen.textContent = unidad.descripcion_borrador;
    contenido.append(resumenRotulo, resumen);
  }

  const seccionRotulo = document.createElement('div');
  seccionRotulo.className = 'carpeta-unidad__seccion-rotulo';
  seccionRotulo.textContent = 'Proyectos contenidos';
  contenido.append(seccionRotulo);

  const listaLegajos = document.createElement('div');
  listaLegajos.className = 'carpeta-unidad__lista-legajos';

  if (!proyectosDeUnidad.length) {
    const vacio = document.createElement('p');
    vacio.style.cssText = 'padding:10px;color:var(--color-grey);font-size:0.82rem;margin:0;';
    vacio.textContent = 'Sin expedientes cargados todavía.';
    listaLegajos.append(vacio);
  } else {
    proyectosDeUnidad.slice(0, limiteProyectos).forEach((proyecto, indice) => {
      listaLegajos.append(crearFichaLegajo(proyecto, unidad, String(indice + 1).padStart(2, '0')));
    });
  }
  contenido.append(listaLegajos);

  if (proyectosDeUnidad.length > limiteProyectos) {
    const verTodos = document.createElement('a');
    verTodos.className = 'carpeta-unidad__ver-todos';
    verTodos.href = `#/unidad/${unidad.id}`;
    verTodos.textContent = `Ver expediente completo (${proyectosDeUnidad.length} proyectos) →`;
    contenido.append(verTodos);
  }

  const pie = document.createElement('div');
  pie.className = 'carpeta-unidad__pie';
  const chipEje = document.createElement('span');
  chipEje.className = 'carpeta-unidad__chip-eje';
  chipEje.textContent = ODS_SUGERIDO_POR_UNIDAD[unidad.id]
    ? `· ${ODS_SUGERIDO_POR_UNIDAD[unidad.id]} (sugerido)`
    : '· sin eje sugerido';
  const periodo = document.createElement('span');
  periodo.className = 'carpeta-unidad__periodo';
  const anios = proyectosDeUnidad.map((p) => p.anio).filter(Boolean);
  periodo.textContent = anios.length
    ? `Período ${Math.min(...anios)}–${Math.max(...anios)}`
    : 'Período —';
  pie.append(chipEje, periodo);
  contenido.append(pie);

  cuerpo.append(lomo, contenido);
  carpeta.append(hojaFondo, pestana, cuerpo);
  return carpeta;
}

/**
 * Renderiza el índice general: una carpeta por cada unidad académica
 * del catálogo controlado, cada una con sus proyectos reales (filtrados
 * de `catalogo`, nunca inventados). Unidades sin proyectos se muestran
 * igual, honestamente vacías (ver EAE).
 */
export function renderizarIndiceUnidades(contenedor, catalogo, categorias) {
  contenedor.innerHTML = '';
  const indice = document.createElement('div');
  indice.className = 'indice-unidades';

  categorias.unidades_academicas.forEach((unidad, posicion) => {
    const proyectosDeUnidad = catalogo
      .filter((p) => p.unidad_academica === unidad.id)
      .sort((a, b) => (b.anio || 0) - (a.anio || 0));
    indice.append(crearCarpetaUnidad(unidad, proyectosDeUnidad, posicion + 1));
  });

  contenedor.append(indice);
}
