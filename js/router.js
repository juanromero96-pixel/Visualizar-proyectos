/**
 * router.js
 * Router por hash, genérico: no conoce proyectos, catálogo ni datos.
 * Resuelve la ruta activa contra una tabla registrada por quien lo
 * inicializa (main.js) y delega el renderizado al handler
 * correspondiente. Funciona en hosting estático porque no depende de
 * configuración de servidor: toda la navegación vive después del "#".
 *
 * Patrones soportados: segmentos fijos ('/catalogo') y segmentos
 * dinámicos con ':nombre' ('/proyecto/:id'). La query string
 * ('?q=texto') se entrega aparte, en `query` (instancia de
 * URLSearchParams), sin afectar el matching de la ruta.
 */

const rutas = [];
let manejadorNoEncontrado = null;
let contenedor = null;
let despuesDeRenderizar = null;

function compilarRuta(patron) {
  const nombresParametros = [];
  const regexTexto = patron
    .split('/')
    .map((segmento) => {
      if (segmento.startsWith(':')) {
        nombresParametros.push(segmento.slice(1));
        return '([^/]+)';
      }
      return segmento.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${regexTexto}$`), nombresParametros };
}

/**
 * Registra una ruta y su handler. `handler(contenedor, { params, query })`
 * puede ser async; el router espera su resolución antes de continuar.
 */
export function registrarRuta(patron, manejador) {
  const { regex, nombresParametros } = compilarRuta(patron);
  rutas.push({ patron, regex, nombresParametros, manejador });
}

/** Registra el handler que se ejecuta cuando ninguna ruta matchea. */
export function registrarNoEncontrado(manejador) {
  manejadorNoEncontrado = manejador;
}

/**
 * Registra un callback genérico que se ejecuta después de CADA ruta
 * renderizada con éxito (incluido el 404). El router no sabe ni le
 * importa qué hace ese callback: lo usamos para una transición visual
 * (ver animaciones.js + main.js), pero podría no usarse nunca y el
 * router seguiría funcionando igual.
 */
export function alFinalizarRenderizado(callback) {
  despuesDeRenderizar = callback;
}

function parsearHash() {
  // location.hash llega como "#/catalogo", "#/buscar?q=agua", "#/" o "".
  const crudo = window.location.hash.slice(1) || '/';
  const [rutaCruda, queryString = ''] = crudo.split('?');
  const ruta = rutaCruda.length > 1 && rutaCruda.endsWith('/')
    ? rutaCruda.slice(0, -1)
    : rutaCruda;
  return { ruta: ruta || '/', query: new URLSearchParams(queryString) };
}

async function ejecutarManejador(manejador, contexto) {
  if (!contenedor) return;
  try {
    await manejador(contenedor, contexto);
    window.scrollTo(0, 0);
    if (despuesDeRenderizar) despuesDeRenderizar(contenedor);
  } catch (error) {
    console.error('Error al renderizar la ruta:', error);
    contenedor.innerHTML = '';
    const mensaje = document.createElement('p');
    mensaje.className = 'estado-error';
    mensaje.textContent = 'Ocurrió un problema al cargar esta sección. Probá recargar la página.';
    contenedor.append(mensaje);
  }
}

async function resolverRutaActual() {
  const { ruta, query } = parsearHash();

  for (const entrada of rutas) {
    const coincidencia = entrada.regex.exec(ruta);
    if (coincidencia) {
      const params = {};
      entrada.nombresParametros.forEach((nombre, indice) => {
        params[nombre] = decodeURIComponent(coincidencia[indice + 1]);
      });
      await ejecutarManejador(entrada.manejador, { params, query });
      return;
    }
  }

  if (manejadorNoEncontrado) {
    await ejecutarManejador(manejadorNoEncontrado, { params: {}, query });
  }
}

/**
 * Inicializa el router: fija el contenedor donde se monta cada vista,
 * resuelve la ruta inicial y queda escuchando cambios de hash.
 */
export function iniciarRouter(idContenedor) {
  contenedor = document.getElementById(idContenedor);
  window.addEventListener('hashchange', resolverRutaActual);
  resolverRutaActual();
}
