/**
 * admin-revision.js
 * Lista unificada de proyectos (borradores + publicados + archivados),
 * con filtros y operaciones masivas. La edición en sí vive en
 * editor.html; esta página es el punto de entrada y el lugar para
 * aprobar/publicar/archivar varios proyectos a la vez sin abrir cada
 * ficha.
 */

import { obtenerNombreUsuario } from './admin-usuario.js';

const ETIQUETA_ESTADO = {
  pendiente: 'Borrador',
  en_revision: 'En revisión',
  validado: 'Aprobado',
  publicado: 'Publicado',
  archivado: 'Archivado',
};

const CLASE_ESTADO = {
  pendiente: 'pendiente',
  en_revision: 'en-revision',
  validado: 'aprobado',
  publicado: 'publicado',
  archivado: 'archivado',
};

const formFiltros = document.getElementById('formFiltros');
const filtroEstado = document.getElementById('filtroEstado');
const filtroUnidad = document.getElementById('filtroUnidad');
const filtroAnio = document.getElementById('filtroAnio');
const cuerpoTabla = document.getElementById('cuerpoTablaProyectos');
const checkTodos = document.getElementById('checkTodos');
const barraAcciones = document.getElementById('barraAccionesLote');
const textoSeleccionados = document.getElementById('textoSeleccionados');
const resultadoLote = document.getElementById('resultadoLote');

let proyectosActuales = [];

async function obtenerJSON(url, opciones) {
  const respuesta = await fetch(url, opciones);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error HTTP ${respuesta.status}`);
  }
  return respuesta.json();
}

async function cargarUnidades() {
  const categorias = await obtenerJSON('/admin/api/categorias');
  categorias.unidades_academicas.forEach((unidad) => {
    const opcion = document.createElement('option');
    opcion.value = unidad.id;
    opcion.textContent = `${unidad.sigla} — ${unidad.nombre}`;
    filtroUnidad.append(opcion);
  });
}

function construirQuery() {
  const parametros = new URLSearchParams();
  if (filtroEstado.value) parametros.set('estado', filtroEstado.value);
  if (filtroUnidad.value) parametros.set('unidad_academica', filtroUnidad.value);
  if (filtroAnio.value) parametros.set('anio', filtroAnio.value);
  return parametros.toString();
}

function crearFila(proyecto) {
  const fila = document.createElement('tr');
  fila.dataset.id = proyecto.id;

  const celdaCheck = document.createElement('td');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'check-fila';
  check.value = proyecto.id;
  check.setAttribute('aria-label', `Seleccionar ${proyecto.titulo || proyecto.id}`);
  check.addEventListener('change', actualizarBarraAcciones);
  celdaCheck.append(check);

  const celdaTitulo = document.createElement('td');
  const enlace = document.createElement('a');
  enlace.href = `/admin/editor?id=${encodeURIComponent(proyecto.id)}`;
  enlace.textContent = proyecto.titulo || '(sin título — revisar)';
  const idVisible = document.createElement('span');
  idVisible.className = 'documento-id';
  idVisible.textContent = proyecto.id;
  celdaTitulo.append(enlace, document.createElement('br'), idVisible);
  if (proyecto.advertencias) {
    const aviso = document.createElement('span');
    aviso.className = 'advertencia-fila';
    aviso.textContent = ` · ${proyecto.advertencias} advertencia(s) de extracción`;
    celdaTitulo.append(aviso);
  }

  const celdaUnidad = document.createElement('td');
  celdaUnidad.textContent = proyecto.unidad_academica || '—';

  const celdaAnio = document.createElement('td');
  celdaAnio.textContent = proyecto.anio || '—';

  const celdaEstado = document.createElement('td');
  const insignia = document.createElement('span');
  insignia.className = `insignia-estado insignia-estado--${CLASE_ESTADO[proyecto.estado_revision] || 'pendiente'}`;
  insignia.textContent = ETIQUETA_ESTADO[proyecto.estado_revision] || proyecto.estado_revision;
  celdaEstado.append(insignia);

  const celdaFecha = document.createElement('td');
  celdaFecha.textContent = proyecto.ultima_actualizacion
    ? new Date(proyecto.ultima_actualizacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const celdaAcciones = document.createElement('td');
  const botonEditar = document.createElement('a');
  botonEditar.className = 'btn btn-sm btn-outline-secondary';
  botonEditar.href = `/admin/editor?id=${encodeURIComponent(proyecto.id)}`;
  botonEditar.textContent = 'Abrir';
  celdaAcciones.append(botonEditar);

  fila.append(celdaCheck, celdaTitulo, celdaUnidad, celdaAnio, celdaEstado, celdaFecha, celdaAcciones);
  return fila;
}

function renderizarTabla(proyectos) {
  cuerpoTabla.innerHTML = '';
  if (!proyectos.length) {
    const filaVacia = document.createElement('tr');
    filaVacia.innerHTML = '<td colspan="7" class="text-center text-muted">Ningún proyecto coincide con el filtro.</td>';
    cuerpoTabla.append(filaVacia);
    return;
  }
  proyectos.forEach((proyecto) => cuerpoTabla.append(crearFila(proyecto)));

  if (typeof window.gsap !== 'undefined') {
    window.gsap.fromTo(cuerpoTabla.querySelectorAll('tr'), { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.02 });
  }
}

async function cargarProyectos() {
  proyectosActuales = await obtenerJSON(`/admin/api/proyectos?${construirQuery()}`);
  renderizarTabla(proyectosActuales);
  checkTodos.checked = false;
  actualizarBarraAcciones();
}

function idsSeleccionados() {
  return Array.from(cuerpoTabla.querySelectorAll('.check-fila:checked')).map((c) => c.value);
}

function actualizarBarraAcciones() {
  const seleccionados = idsSeleccionados();
  if (!seleccionados.length) {
    barraAcciones.classList.add('d-none');
    return;
  }
  barraAcciones.classList.remove('d-none');
  textoSeleccionados.textContent = `${seleccionados.length} proyecto(s) seleccionado(s)`;
}

checkTodos.addEventListener('change', () => {
  cuerpoTabla.querySelectorAll('.check-fila').forEach((c) => { c.checked = checkTodos.checked; });
  actualizarBarraAcciones();
});

formFiltros.addEventListener('submit', (evento) => {
  evento.preventDefault();
  cargarProyectos();
});

barraAcciones.querySelectorAll('[data-transicion]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const nuevoEstado = boton.dataset.transicion;
    const ids = idsSeleccionados();
    if (!ids.length) return;

    const usuario = obtenerNombreUsuario();
    const respuesta = await obtenerJSON('/admin/api/proyectos/transicion-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, nuevo_estado: nuevoEstado, usuario }),
    });

    mostrarResultadoLote(respuesta.resultados);
    await cargarProyectos();
  });
});

function mostrarResultadoLote(resultados) {
  resultadoLote.classList.remove('d-none');
  resultadoLote.innerHTML = '<h2>Resultado de la operación</h2>';
  const lista = document.createElement('ul');
  resultados.forEach((resultado) => {
    const item = document.createElement('li');
    item.className = resultado.exito ? 'resultado-ok' : 'resultado-error';
    item.textContent = `${resultado.id}: ${resultado.mensaje}`;
    lista.append(item);
  });
  resultadoLote.append(lista);
}

cargarUnidades();
cargarProyectos();
