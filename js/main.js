/**
 * main.js
 * Punto de entrada de la aplicación. Inicializa el layout persistente,
 * registra las rutas hash y define qué se renderiza en cada una, usando
 * data.js para los datos, render-catalogo.js / render-ficha.js para el
 * contenido, carrusel.js (Swiper) para los destacados de portada y
 * animaciones.js (GSAP) para las transiciones discretas entre vistas.
 * El refinamiento de filtros y buscador combinado (filtros.js) llega en
 * el próximo bloque; la ruta #/buscar ya funciona con texto libre.
 */

import { initLayout } from './layout.js';
import { registrarRuta, registrarNoEncontrado, alFinalizarRenderizado, iniciarRouter } from './router.js';
import { obtenerCatalogo, obtenerCategorias, obtenerProyecto } from './data.js';
import { renderizarGrillaProyectos } from './render-catalogo.js';
import { renderizarFicha } from './render-ficha.js';
import { renderizarCarruselDestacados } from './carrusel.js';
import { animarTransicionVista } from './animaciones.js';
import { debounce } from './utils.js';

async function manejarInicio(contenedor) {
  contenedor.innerHTML = '<p class="estado-carga">Cargando…</p>';
  const [catalogo, categorias] = await Promise.all([obtenerCatalogo(), obtenerCategorias()]);
  const destacados = catalogo.filter((proyecto) => proyecto.destacado);

  contenedor.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'portada-hero';
  const h1 = document.createElement('h1');
  h1.textContent = 'Proyectos de Extensión Universitaria';
  const intro = document.createElement('p');
  intro.textContent = 'Catálogo institucional de los proyectos de extensión de la Universidad Nacional de Misiones, organizados por unidad académica, programa y temática.';
  const enlaceCatalogo = document.createElement('a');
  enlaceCatalogo.className = 'boton boton--primario';
  enlaceCatalogo.href = '#/catalogo';
  enlaceCatalogo.textContent = 'Ver el catálogo completo';
  hero.append(h1, intro, enlaceCatalogo);

  const seccionDestacados = document.createElement('section');
  seccionDestacados.className = 'portada-destacados';
  const h2 = document.createElement('h2');
  h2.textContent = 'Proyectos destacados';
  const contenedorGrilla = document.createElement('div');
  seccionDestacados.append(h2, contenedorGrilla);

  contenedor.append(hero, seccionDestacados);

  await renderizarCarruselDestacados(contenedorGrilla, destacados, categorias, {
    mensajeVacio: 'Todavía no hay proyectos destacados configurados.',
  });
}

async function manejarCatalogo(contenedor) {
  contenedor.innerHTML = '<p class="estado-carga">Cargando catálogo…</p>';
  const [catalogo, categorias] = await Promise.all([obtenerCatalogo(), obtenerCategorias()]);

  const catalogoOrdenado = [...catalogo].sort(
    (a, b) => b.anio - a.anio || a.titulo.localeCompare(b.titulo)
  );

  contenedor.innerHTML = '';

  const encabezado = document.createElement('div');
  encabezado.className = 'catalogo-encabezado';
  const h1 = document.createElement('h1');
  h1.textContent = 'Catálogo de proyectos de extensión';
  const contador = document.createElement('p');
  contador.className = 'catalogo-encabezado__contador';
  contador.textContent = `${catalogoOrdenado.length} proyecto${catalogoOrdenado.length === 1 ? '' : 's'} publicados. Orden actual: año más reciente primero.`;
  encabezado.append(h1, contador);

  const contenedorGrilla = document.createElement('div');
  contenedor.append(encabezado, contenedorGrilla);

  await renderizarGrillaProyectos(contenedorGrilla, catalogoOrdenado, categorias);
}

async function manejarFicha(contenedor, { params }) {
  contenedor.innerHTML = '<p class="estado-carga">Cargando proyecto…</p>';
  const categorias = await obtenerCategorias();

  try {
    const proyecto = await obtenerProyecto(params.id);
    renderizarFicha(contenedor, proyecto, categorias);
  } catch (error) {
    contenedor.innerHTML = '';
    const aviso = document.createElement('div');
    aviso.className = 'estado-vacio';
    const h1 = document.createElement('h1');
    h1.textContent = 'Proyecto no encontrado';
    const p = document.createElement('p');
    p.textContent = 'El proyecto solicitado no existe o todavía no fue publicado.';
    const enlace = document.createElement('a');
    enlace.href = '#/catalogo';
    enlace.textContent = 'Volver al catálogo';
    aviso.append(h1, p, enlace);
    contenedor.append(aviso);
  }
}

function manejarExtension(contenedor) {
  contenedor.innerHTML = '';
  const articulo = document.createElement('article');
  articulo.className = 'pagina-institucional';
  articulo.innerHTML = `
    <h1>¿Qué es la extensión universitaria?</h1>
    <p>La extensión universitaria es la función que vincula a la universidad con la comunidad,
    a través de proyectos que articulan docencia e investigación con necesidades sociales,
    productivas y culturales del territorio.</p>
    <h2>Sobre este catálogo</h2>
    <p>Esta biblioteca digital reúne los proyectos de extensión de las unidades académicas de la
    UNaM relevados a partir de pósters institucionales, para facilitar su consulta pública de
    forma ordenada y navegable.</p>
    <h2>Secretaría de Extensión Universitaria</h2>
    <p>Contacto institucional: <a href="mailto:extension@unam.edu.ar">extension@unam.edu.ar</a></p>
  `;
  contenedor.append(articulo);
}

async function manejarBuscar(contenedor, { query }) {
  contenedor.innerHTML = '';

  const encabezado = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = 'Buscar proyectos';

  const formulario = document.createElement('form');
  formulario.className = 'buscador__formulario';
  formulario.setAttribute('role', 'search');

  const etiqueta = document.createElement('label');
  etiqueta.className = 'sr-only';
  etiqueta.setAttribute('for', 'buscadorInput');
  etiqueta.textContent = 'Texto a buscar';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'buscadorInput';
  input.placeholder = 'Buscar por título, resumen o etiqueta…';
  input.value = query.get('q') || '';

  const boton = document.createElement('button');
  boton.type = 'submit';
  boton.textContent = 'Buscar';

  formulario.append(etiqueta, input, boton);
  encabezado.append(h1, formulario);

  const contenedorResultados = document.createElement('div');
  contenedor.append(encabezado, contenedorResultados);

  const [catalogo, categorias] = await Promise.all([obtenerCatalogo(), obtenerCategorias()]);

  function ejecutarBusqueda(texto) {
    const termino = texto.trim().toLowerCase();

    if (!termino) {
      contenedorResultados.innerHTML = '';
      const aviso = document.createElement('p');
      aviso.className = 'estado-vacio';
      aviso.textContent = 'Escribí un término para buscar entre los proyectos.';
      contenedorResultados.append(aviso);
      return;
    }

    const coincidencias = catalogo.filter((proyecto) => {
      const corpus = [proyecto.titulo, proyecto.resumen, ...(proyecto.etiquetas || [])]
        .join(' ')
        .toLowerCase();
      return corpus.includes(termino);
    });

    renderizarGrillaProyectos(contenedorResultados, coincidencias, categorias, {
      mensajeVacio: `No se encontraron proyectos para "${texto}".`,
    });
  }

  const ejecutarBusquedaConDemora = debounce(ejecutarBusqueda, 200);
  input.addEventListener('input', () => ejecutarBusquedaConDemora(input.value));

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    window.location.hash = `#/buscar?q=${encodeURIComponent(input.value.trim())}`;
  });

  ejecutarBusqueda(input.value);
}

function manejarNoEncontrado(contenedor) {
  contenedor.innerHTML = '';
  const aviso = document.createElement('div');
  aviso.className = 'estado-vacio';
  const h1 = document.createElement('h1');
  h1.textContent = 'Página no encontrada';
  const p = document.createElement('p');
  p.textContent = 'La sección que buscás no existe o cambió de dirección.';
  const enlace = document.createElement('a');
  enlace.href = '#/';
  enlace.textContent = 'Volver al inicio';
  aviso.append(h1, p, enlace);
  contenedor.append(aviso);
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout();

  registrarRuta('/', manejarInicio);
  registrarRuta('/catalogo', manejarCatalogo);
  registrarRuta('/proyecto/:id', manejarFicha);
  registrarRuta('/extension', manejarExtension);
  registrarRuta('/buscar', manejarBuscar);
  registrarNoEncontrado(manejarNoEncontrado);
  alFinalizarRenderizado(animarTransicionVista);

  iniciarRouter('app');
});


