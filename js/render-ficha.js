/**
 * render-ficha.js
 * Construye la vista editorial completa de un proyecto a partir de su
 * JSON de detalle (data/proyectos/{id}.json), conservando la lógica de
 * secciones de los pósters originales (resumen, problema, objetivo,
 * acciones, resultados/aportes, datos y contacto).
 */

import { mapaUnidadesAcademicas, mapaInstitucionesCooperantes } from './data.js';
import { animarEntradaFicha } from './animaciones.js';

function bloqueTexto(titulo, texto) {
  if (!texto) return null;
  const seccion = document.createElement('section');
  seccion.className = 'ficha-bloque';
  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = texto;
  seccion.append(h2, p);
  return seccion;
}

function bloqueLista(titulo, items) {
  if (!items || !items.length) return null;
  const seccion = document.createElement('section');
  seccion.className = 'ficha-bloque';
  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  const ul = document.createElement('ul');
  ul.className = 'ficha-lista';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  });
  seccion.append(h2, ul);
  return seccion;
}

function bloqueGaleria(imagenes, tituloProyecto, indiceImagenPrincipal) {
  const seccion = document.createElement('section');
  seccion.className = 'ficha-bloque ficha-galeria';
  const h2 = document.createElement('h2');
  h2.textContent = 'Imágenes';
  seccion.append(h2);

  if (!imagenes || !imagenes.length) {
    const aviso = document.createElement('p');
    aviso.className = 'ficha-galeria__vacia';
    aviso.textContent = 'Sin imágenes disponibles para este proyecto.';
    seccion.append(aviso);
    return seccion;
  }

  const grilla = document.createElement('div');
  grilla.className = 'ficha-galeria__grilla';
  imagenes.forEach((imagen, indice) => {
    const img = document.createElement('img');
    img.src = imagen.archivo;
    img.alt = imagen.alt || `Imagen de ${tituloProyecto}`;
    img.loading = 'lazy';
    if (indice === indiceImagenPrincipal) {
      img.classList.add('ficha-galeria__imagen-principal');
    }
    grilla.append(img);
  });
  seccion.append(grilla);
  return seccion;
}

function bloqueVideos(videos) {
  if (!videos || !videos.length) return null;
  const seccion = document.createElement('section');
  seccion.className = 'ficha-bloque';
  const h2 = document.createElement('h2');
  h2.textContent = 'Video';
  seccion.append(h2);

  videos.forEach((url) => {
    const envoltorio = document.createElement('div');
    envoltorio.className = 'ficha-video';
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = 'Video del proyecto';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    envoltorio.append(iframe);
    seccion.append(envoltorio);
  });
  return seccion;
}

function bloqueContacto(proyecto, unidad, nombresInstituciones) {
  const seccion = document.createElement('section');
  seccion.className = 'ficha-bloque ficha-contacto';
  const h2 = document.createElement('h2');
  h2.textContent = 'Datos y contacto';
  seccion.append(h2);

  const dl = document.createElement('dl');

  function agregarFila(etiqueta, valor) {
    if (!valor) return;
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    if (typeof valor === 'string') {
      dd.textContent = valor;
    } else {
      dd.append(valor);
    }
    dl.append(dt, dd);
  }

  agregarFila('Responsables', (proyecto.responsables || []).join(', '));

  if (proyecto.contacto) {
    const enlace = document.createElement('a');
    enlace.href = `mailto:${proyecto.contacto}`;
    enlace.textContent = proyecto.contacto;
    agregarFila('Contacto', enlace);
  }

  if (unidad) {
    agregarFila('Unidad académica', unidad.nombre);
  }

  if (nombresInstituciones.length) {
    agregarFila('Instituciones cooperantes', nombresInstituciones.join(', '));
  }

  agregarFila('Resolución', proyecto.resolucion);

  seccion.append(dl);

  if (proyecto.pdf_fuente) {
    const enlacePdf = document.createElement('a');
    enlacePdf.className = 'boton boton--secundario';
    enlacePdf.href = proyecto.pdf_fuente;
    enlacePdf.target = '_blank';
    enlacePdf.rel = 'noopener';
    enlacePdf.textContent = 'Descargar póster original (PDF)';
    seccion.append(enlacePdf);
  }

  return seccion;
}

// Bloques del cuerpo editorial (columna principal) y de recursos
// (columna secundaria). La pertenencia a columna es fija: "reordenar
// bloques" reordena dentro de cada columna, no los mezcla — el editor
// de bloques del panel admin respeta esta misma división.
const BLOQUES_COLUMNA_PRINCIPAL = ['resumen', 'problema', 'objetivo_general', 'objetivos_especificos', 'acciones', 'resultados_aportes'];
const BLOQUES_COLUMNA_SECUNDARIA = ['imagenes', 'videos', 'contacto'];
const ORDEN_BLOQUES_DEFAULT = [...BLOQUES_COLUMNA_PRINCIPAL, ...BLOQUES_COLUMNA_SECUNDARIA];

/**
 * Renderiza la ficha completa de `proyecto` dentro de `contenedor`.
 * `categorias` es el catálogo controlado (data/categorias.json), usado
 * para traducir unidad_academica e instituciones_cooperantes a nombres
 * legibles.
 *
 * Si `proyecto.configuracion_presentacion` existe (la agrega el editor
 * visual de bloques del panel admin), se respeta para decidir qué
 * bloques mostrar, en qué orden y cuál destacar. Si no existe —caso de
 * cualquier ficha publicada antes de esta función existir—, se usa el
 * orden y la visibilidad de siempre: cero cambio de comportamiento.
 */
export function renderizarFicha(contenedor, proyecto, categorias) {
  contenedor.innerHTML = '';

  const unidades = mapaUnidadesAcademicas(categorias);
  const instituciones = mapaInstitucionesCooperantes(categorias);
  const unidad = unidades.get(proyecto.unidad_academica) || null;
  const nombresInstituciones = (proyecto.instituciones_cooperantes || [])
    .map((id) => (instituciones.get(id) ? instituciones.get(id).nombre : id));

  const config = proyecto.configuracion_presentacion || {};
  const ordenBloques = config.orden_bloques && config.orden_bloques.length ? config.orden_bloques : ORDEN_BLOQUES_DEFAULT;
  const bloquesOcultos = new Set(config.bloques_ocultos || []);
  const mostrarCita = config.mostrar_cita_destacada !== false; // default true si no está definido

  const articulo = document.createElement('article');
  articulo.className = 'ficha-proyecto';

  const enlaceVolver = document.createElement('a');
  enlaceVolver.className = 'ficha-proyecto__volver';
  enlaceVolver.href = '#/catalogo';
  enlaceVolver.textContent = '← Volver al catálogo';

  const cabecera = document.createElement('header');
  cabecera.className = 'ficha-proyecto__cabecera';

  const meta = document.createElement('p');
  meta.className = 'ficha-proyecto__meta';
  meta.textContent = [unidad ? unidad.nombre : proyecto.unidad_academica, proyecto.programa_carrera_area, proyecto.anio]
    .filter(Boolean)
    .join(' · ');

  const titulo = document.createElement('h1');
  titulo.textContent = proyecto.titulo;

  cabecera.append(meta, titulo);
  articulo.append(enlaceVolver, cabecera);

  if (mostrarCita && proyecto.cita_destacada && proyecto.cita_destacada.texto) {
    const cita = document.createElement('blockquote');
    cita.className = 'ficha-proyecto__cita';
    const p = document.createElement('p');
    p.textContent = proyecto.cita_destacada.texto;
    cita.append(p);
    if (proyecto.cita_destacada.fuente) {
      const cite = document.createElement('cite');
      cite.textContent = proyecto.cita_destacada.fuente;
      cita.append(cite);
    }
    articulo.append(cita);
  }

  // Mapa id de bloque -> elemento (o null si no hay contenido para él).
  const elementosPorBloque = {
    resumen: bloqueTexto('Resumen', proyecto.resumen),
    problema: bloqueTexto('Problema', proyecto.problema),
    objetivo_general: bloqueTexto('Objetivo general', proyecto.objetivo_general),
    objetivos_especificos: bloqueLista('Objetivos específicos', proyecto.objetivos_especificos),
    acciones: bloqueLista('Acciones', proyecto.acciones),
    resultados_aportes: bloqueLista('Resultados y aportes', proyecto.resultados_aportes),
    imagenes: bloqueGaleria(proyecto.imagenes, proyecto.titulo, config.imagen_principal),
    videos: bloqueVideos(proyecto.videos),
    contacto: bloqueContacto(proyecto, unidad, nombresInstituciones),
  };

  if (config.bloque_destacado && elementosPorBloque[config.bloque_destacado]) {
    elementosPorBloque[config.bloque_destacado].classList.add('ficha-bloque--destacado');
  }

  // Layout editorial de dos columnas (grilla de Bootstrap, solo para el
  // reparto de columnas): cuerpo del relato a la izquierda, recursos
  // (imágenes, video, datos de contacto) a la derecha en pantallas
  // medianas en adelante; en mobile, una sola columna apilada.
  const fila = document.createElement('div');
  fila.className = 'row g-4 g-lg-5 ficha-proyecto__fila';

  const columnaPrincipal = document.createElement('div');
  columnaPrincipal.className = 'col-12 col-lg-7 ficha-proyecto__principal';

  const columnaSecundaria = document.createElement('div');
  columnaSecundaria.className = 'col-12 col-lg-5 ficha-proyecto__secundaria';

  ordenBloques
    .filter((idBloque) => BLOQUES_COLUMNA_PRINCIPAL.includes(idBloque) && !bloquesOcultos.has(idBloque))
    .forEach((idBloque) => {
      const elemento = elementosPorBloque[idBloque];
      if (elemento) columnaPrincipal.append(elemento);
    });

  ordenBloques
    .filter((idBloque) => BLOQUES_COLUMNA_SECUNDARIA.includes(idBloque) && !bloquesOcultos.has(idBloque))
    .forEach((idBloque) => {
      const elemento = elementosPorBloque[idBloque];
      if (elemento) columnaSecundaria.append(elemento);
    });

  fila.append(columnaPrincipal, columnaSecundaria);
  articulo.append(fila);
  contenedor.append(articulo);

  animarEntradaFicha(contenedor);
}
