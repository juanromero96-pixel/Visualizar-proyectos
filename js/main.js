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
import { renderizarGrillaProyectos, renderizarIndiceUnidades, crearCarpetaUnidad } from './render-catalogo.js';
import { renderizarFicha } from './render-ficha.js';
import { renderizarCarruselDestacados } from './carrusel.js';
import { animarTransicionVista } from './animaciones.js';
import { animarPasarHoja } from './transicion-hoja.js';
import { debounce } from './utils.js';

/**
 * El catálogo ES la pantalla inicial: no hay una "portada" separada.
 * Por eso esta misma función se registra para '/' y para '/catalogo'
 * (ver el final del archivo) — los destacados (Swiper, ya construidos
 * en un bloque anterior) se conservan como sección superior, no se
 * descartan, solo dejan de ser una pantalla aparte.
 */
async function manejarCatalogo(contenedor) {
  contenedor.innerHTML = '<p class="estado-carga">Cargando catálogo…</p>';
  const [catalogo, categorias] = await Promise.all([obtenerCatalogo(), obtenerCategorias()]);
  // Criterio editorial simple para los destacados (no hay datos de
  // visualizaciones/consultas todavía): año más reciente primero.
  const destacados = catalogo
    .filter((proyecto) => proyecto.destacado)
    .sort((a, b) => (b.anio || 0) - (a.anio || 0));

  contenedor.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'portada-hero';
  const h1Hero = document.createElement('h1');
  h1Hero.textContent = 'Biblioteca Digital de Proyectos de Extensión';
  const intro = document.createElement('p');
  intro.textContent = 'Catálogo institucional organizado por unidad académica. Cada unidad funciona como un expediente que contiene sus proyectos de extensión.';
  hero.append(h1Hero, intro);
  contenedor.append(hero);

  // Unidades académicas primero: son el índice principal de la
  // biblioteca, no deben competir con los destacados por protagonismo.
  const encabezado = document.createElement('div');
  encabezado.className = 'catalogo-encabezado';
  const h1 = document.createElement('h2');
  h1.textContent = 'Unidades académicas';
  const contador = document.createElement('p');
  contador.className = 'catalogo-encabezado__contador';
  contador.textContent = `${catalogo.length} proyecto${catalogo.length === 1 ? '' : 's'} publicados, en ${categorias.unidades_academicas.length} unidades académicas.`;
  encabezado.append(h1, contador);

  const contenedorIndice = document.createElement('div');
  contenedor.append(encabezado, contenedorIndice);
  renderizarIndiceUnidades(contenedorIndice, catalogo, categorias);

  // Destacados al final: lectura recomendada secundaria, no compite
  // con las carpetas por ser lo primero que se ve.
  if (destacados.length) {
    const seccionDestacados = document.createElement('section');
    seccionDestacados.className = 'portada-destacados';
    const h2 = document.createElement('h2');
    h2.textContent = 'Lectura recomendada';
    const subtitulo = document.createElement('p');
    subtitulo.className = 'catalogo-encabezado__contador';
    subtitulo.textContent = 'Una selección de proyectos de la colección, no un acceso aparte.';
    const contenedorGrilla = document.createElement('div');
    seccionDestacados.append(h2, subtitulo, contenedorGrilla);
    contenedor.append(seccionDestacados);
    await renderizarCarruselDestacados(contenedorGrilla, destacados, categorias);
  }
}

async function manejarUnidad(contenedor, { params }) {
  contenedor.innerHTML = '<p class="estado-carga">Abriendo carpeta…</p>';
  const [catalogo, categorias] = await Promise.all([obtenerCatalogo(), obtenerCategorias()]);
  const unidad = categorias.unidades_academicas.find((u) => u.id === params.id);

  contenedor.innerHTML = '';

  if (!unidad) {
    const aviso = document.createElement('div');
    aviso.className = 'estado-vacio';
    aviso.innerHTML = '<h1>Unidad académica no encontrada</h1><p><a href="#/catalogo">Volver al catálogo</a></p>';
    contenedor.append(aviso);
    return;
  }

  const enlaceVolver = document.createElement('a');
  enlaceVolver.className = 'ficha-proyecto__volver';
  enlaceVolver.href = '#/catalogo';
  enlaceVolver.textContent = '← Volver al catálogo';
  contenedor.append(enlaceVolver);

  const proyectosDeUnidad = catalogo
    .filter((p) => p.unidad_academica === unidad.id)
    .sort((a, b) => (b.anio || 0) - (a.anio || 0));
  const posicion = categorias.unidades_academicas.findIndex((u) => u.id === unidad.id) + 1;

  const contenedorCarpeta = document.createElement('div');
  contenedorCarpeta.append(crearCarpetaUnidad(unidad, proyectosDeUnidad, posicion, proyectosDeUnidad.length));
  contenedor.append(contenedorCarpeta);
}

// Recordamos la última unidad/posición mostrada para poder distinguir
// "pasar a la hoja siguiente/anterior dentro de la misma carpeta" (con
// barrido) de "llegar a una ficha desde otro lado" (sin barrido: no
// tiene sentido animar una hoja como si viniera de un lugar que no
// existe en esa carpeta). navegacionHojaActual es lo que consultan el
// teclado y el gesto táctil para saber a dónde ir.
let unidadYPosicionAnterior = null;
let navegacionHojaActual = null;

async function manejarFicha(contenedor, { params }) {
  // No se borra el contenido acá todavía: si se hace, la transición de
  // folio capturaría "Cargando proyecto…" como hoja saliente en vez de
  // la ficha anterior real (ese era el fragmento de texto raro que se
  // veía a mitad de la animación). El contenido viejo se queda visible
  // hasta que los datos nuevos estén listos para reemplazarlo de una.
  const categorias = await obtenerCategorias();

  try {
    const [proyecto, catalogo] = await Promise.all([obtenerProyecto(params.id), obtenerCatalogo()]);

    const proyectosDeUnidad = catalogo
      .filter((p) => p.unidad_academica === proyecto.unidad_academica)
      .sort((a, b) => (b.anio || 0) - (a.anio || 0));
    const posicionActual = proyectosDeUnidad.findIndex((p) => p.id === proyecto.id) + 1;
    const anterior = posicionActual > 1 ? proyectosDeUnidad[posicionActual - 2] : null;
    const siguiente = posicionActual < proyectosDeUnidad.length ? proyectosDeUnidad[posicionActual] : null;
    const navegacion = { anterior, siguiente, posicion: posicionActual, total: proyectosDeUnidad.length };

    navegacionHojaActual = navegacion;

    const esNavegacionSecuencialEnLaMismaCarpeta =
      unidadYPosicionAnterior && unidadYPosicionAnterior.unidadId === proyecto.unidad_academica;
    const direccion = esNavegacionSecuencialEnLaMismaCarpeta
      ? (posicionActual > unidadYPosicionAnterior.posicion ? 'siguiente' : 'anterior')
      : null;

    unidadYPosicionAnterior = { unidadId: proyecto.unidad_academica, posicion: posicionActual };

    if (direccion) {
      await animarPasarHoja(contenedor, direccion, (destino) =>
        renderizarFicha(destino, proyecto, categorias, navegacion, { saltarAnimacionEntrada: true })
      );
    } else {
      renderizarFicha(contenedor, proyecto, categorias, navegacion);
    }
  } catch (error) {
    navegacionHojaActual = null;
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

// URL real del panel administrativo (Flask). El sitio público es
// estático (Vercel) y no puede ejecutar Flask, así que esta ruta no
// "es" el panel: es una puerta de entrada que explica dónde está y
// cómo llegar. Editar esta constante para que apunte a donde
// efectivamente corra el panel (la máquina de la Secretaría, un
// servidor interno, una VPN institucional, etc.) — es una sola línea.
const URL_PANEL_ADMIN = 'http://localhost:5050/';

// Login SUPERFICIAL, a pedido explícito: usuario/contraseña fijos,
// verificados en el navegador. Esto NO es seguridad real — cualquiera
// puede leer estas líneas desde "Ver código fuente" o las herramientas
// de desarrollador, y nada impide pegar la URL del panel directo. Sirve
// solo para que esta página no quede "abierta al primero que pasa", no
// para proteger nada sensible. Si alguna vez hace falta control de
// acceso real, tiene que resolverse en el servidor Flask (o restringir
// la red), nunca acá.
const CLAVE_SESION_ADMIN = 'bde-unam-admin-logueado';
const USUARIO_ADMIN = 'admin';
const CLAVE_ADMIN = '12345';

function manejarAdmin(contenedor) {
  contenedor.innerHTML = '';

  if (window.sessionStorage.getItem(CLAVE_SESION_ADMIN) === 'si') {
    mostrarAccesoAdmin(contenedor);
    return;
  }

  const articulo = document.createElement('article');
  articulo.className = 'pagina-institucional pagina-institucional--login';
  articulo.innerHTML = `
    <h1>Acceso administrativo</h1>
    <p>Esta sección es de uso exclusivo del personal de la Secretaría de Extensión.</p>
    <form id="formLoginAdmin" class="login-admin" autocomplete="off">
      <label for="campoUsuarioAdmin">Usuario</label>
      <input type="text" id="campoUsuarioAdmin" name="usuario" required>
      <label for="campoClaveAdmin">Contraseña</label>
      <input type="password" id="campoClaveAdmin" name="clave" required>
      <button type="submit" class="boton boton--primario">Ingresar</button>
      <p id="errorLoginAdmin" class="login-admin__error" role="alert" hidden>Usuario o contraseña incorrectos.</p>
    </form>
  `;
  contenedor.append(articulo);

  document.getElementById('formLoginAdmin').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const usuario = document.getElementById('campoUsuarioAdmin').value.trim();
    const clave = document.getElementById('campoClaveAdmin').value;
    const error = document.getElementById('errorLoginAdmin');

    if (usuario === USUARIO_ADMIN && clave === CLAVE_ADMIN) {
      window.sessionStorage.setItem(CLAVE_SESION_ADMIN, 'si');
      mostrarAccesoAdmin(contenedor);
    } else {
      error.hidden = false;
    }
  });
}

function mostrarAccesoAdmin(contenedor) {
  contenedor.innerHTML = '';
  const articulo = document.createElement('article');
  articulo.className = 'pagina-institucional pagina-institucional--panel';
  articulo.innerHTML = `
    <div class="panel-admin-embebido__barra">
      <h1>Panel administrativo</h1>
      <div class="panel-admin-embebido__acciones">
        <a href="${URL_PANEL_ADMIN}" target="_blank" rel="noopener">Abrir en una pestaña aparte ↗</a>
        <button type="button" id="botonCerrarSesionAdmin" class="login-admin__cerrar">Cerrar sesión</button>
      </div>
    </div>
    <iframe id="iframeAdmin" class="panel-admin-embebido__iframe" src="${URL_PANEL_ADMIN}"
      title="Panel administrativo"></iframe>
    <p class="panel-admin-embebido__nota">¿No se ve nada arriba? El panel no está corriendo en
      <code>${URL_PANEL_ADMIN}</code> en este momento, o no tenés acceso a esa red. Iniciálo
      (<code>python3 admin/server.py</code>) o confirmá la dirección con el equipo técnico.</p>
  `;
  contenedor.append(articulo);
  document.getElementById('botonCerrarSesionAdmin').addEventListener('click', () => {
    window.sessionStorage.removeItem(CLAVE_SESION_ADMIN);
    manejarAdmin(contenedor);
  });
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

function alTerminarDeRenderizar(contenedor) {
  // Los peek de hoja (.hoja-peek) se agregan a document.body, no a
  // #app, porque son position:fixed — por eso no se borran solos al
  // reemplazar el contenido de #app en cualquier otra ruta. Si la ruta
  // recién renderizada no es una ficha, no tienen sentido ahí.
  if (!contenedor.querySelector('.ficha-proyecto')) {
    document.querySelectorAll('.hoja-peek').forEach((el) => el.remove());
    navegacionHojaActual = null;
    unidadYPosicionAnterior = null;
  }
  animarTransicionVista(contenedor);
}

function irAHojaVecina(direccion) {
  if (!navegacionHojaActual) return;
  const destino = direccion === 'siguiente' ? navegacionHojaActual.siguiente : navegacionHojaActual.anterior;
  if (destino) window.location.hash = `#/proyecto/${destino.id}`;
}

function inicializarNavegacionDeHojas() {
  document.addEventListener('keydown', (evento) => {
    const enCampoDeTexto = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (enCampoDeTexto || !navegacionHojaActual) return;
    if (evento.key === 'ArrowRight') irAHojaVecina('siguiente');
    if (evento.key === 'ArrowLeft') irAHojaVecina('anterior');
  });

  let inicioX = null;
  let inicioY = null;
  document.addEventListener('touchstart', (evento) => {
    if (!navegacionHojaActual) return;
    inicioX = evento.touches[0].clientX;
    inicioY = evento.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (evento) => {
    if (!navegacionHojaActual || inicioX === null) return;
    const deltaX = evento.changedTouches[0].clientX - inicioX;
    const deltaY = evento.changedTouches[0].clientY - inicioY;
    inicioX = null;
    // Gesto horizontal claro (no un scroll vertical) y de recorrido
    // suficiente para no confundirlo con un toque casual.
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      irAHojaVecina(deltaX < 0 ? 'siguiente' : 'anterior');
    }
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout();
  inicializarNavegacionDeHojas();

  registrarRuta('/', manejarCatalogo);
  registrarRuta('/catalogo', manejarCatalogo);
  registrarRuta('/unidad/:id', manejarUnidad);
  registrarRuta('/proyecto/:id', manejarFicha);
  registrarRuta('/extension', manejarExtension);
  registrarRuta('/buscar', manejarBuscar);
  registrarRuta('/admin', manejarAdmin);
  registrarNoEncontrado(manejarNoEncontrado);
  alFinalizarRenderizado(alTerminarDeRenderizar);

  iniciarRouter('app');
});


