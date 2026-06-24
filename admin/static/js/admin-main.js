/**
 * admin-main.js
 * Módulo 1 (carga) + Módulo 2, modo rápido (extracción automática) del
 * panel administrativo. La revisión/corrección (Módulo 3) y la
 * publicación (Módulo 4) se agregan en el próximo bloque: por ahora la
 * cola llega hasta "Extraído" o "Error", nunca más allá.
 */

const ESTADO_A_CLASE = {
  Pendiente: 'pendiente',
  Procesando: 'procesando',
  'Extraído': 'extraido',
  'En revisión': 'en-revision',
  Aprobado: 'aprobado',
  Publicado: 'publicado',
  Archivado: 'archivado',
  Error: 'error',
};

const zonaCarga = document.getElementById('zonaCarga');
const inputArchivos = document.getElementById('inputArchivos');
const selectUnidad = document.getElementById('selectUnidad');
const inputAnio = document.getElementById('inputAnio');
const cuerpoTablaCola = document.getElementById('cuerpoTablaCola');
const botonProcesarPendientes = document.getElementById('botonProcesarPendientes');
const listaErrores = document.getElementById('listaErrores');
const dashboardResumen = document.getElementById('dashboardResumen');

const ETIQUETA_ESTADO_DASHBOARD = [
  ['pendiente', 'Borradores'],
  ['en_revision', 'En revisión'],
  ['validado', 'Aprobados'],
  ['publicado', 'Publicados'],
  ['archivado', 'Archivados'],
];

async function cargarDashboard() {
  try {
    const proyectos = await obtenerJSON('/admin/api/proyectos');
    const conteos = Object.fromEntries(ETIQUETA_ESTADO_DASHBOARD.map(([estado]) => [estado, 0]));
    proyectos.forEach((p) => {
      if (p.estado_revision in conteos) conteos[p.estado_revision] += 1;
    });

    dashboardResumen.innerHTML = '';
    ETIQUETA_ESTADO_DASHBOARD.forEach(([estado, etiqueta]) => {
      const enlace = document.createElement('a');
      enlace.className = 'admin-dashboard__item';
      enlace.href = `/admin/revision?estado=${estado}`;
      enlace.innerHTML = `<strong>${conteos[estado] || 0}</strong><span>${etiqueta}</span>`;
      dashboardResumen.append(enlace);
    });
  } catch (error) {
    dashboardResumen.innerHTML = `<p class="text-muted">No se pudo cargar el resumen: ${error.message}</p>`;
  }
}

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(iso) {
  const fecha = new Date(iso);
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function crearInsigniaEstado(estado) {
  const span = document.createElement('span');
  const clase = ESTADO_A_CLASE[estado] || 'pendiente';
  span.className = `insignia-estado insignia-estado--${clase}`;
  span.textContent = estado;
  return span;
}

async function obtenerJSON(url, opciones) {
  const respuesta = await fetch(url, opciones);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error HTTP ${respuesta.status}`);
  }
  return respuesta.json();
}

async function cargarCategorias() {
  try {
    const categorias = await obtenerJSON('/admin/api/categorias');
    categorias.unidades_academicas.forEach((unidad) => {
      const opcion = document.createElement('option');
      opcion.value = unidad.id;
      opcion.textContent = `${unidad.sigla} — ${unidad.nombre}`;
      selectUnidad.append(opcion);
    });
  } catch (error) {
    console.error('No se pudieron cargar las unidades académicas:', error);
  }
}

function crearFilaDocumento(doc) {
  const fila = document.createElement('tr');
  fila.dataset.docId = doc.id;

  const celdaNombre = document.createElement('td');
  const nombre = document.createElement('span');
  nombre.className = 'documento-nombre';
  nombre.textContent = doc.nombre_archivo;
  const idVisible = document.createElement('span');
  idVisible.className = 'documento-id';
  idVisible.textContent = doc.id;
  celdaNombre.append(nombre, idVisible);

  const celdaTamano = document.createElement('td');
  celdaTamano.textContent = formatearTamano(doc.tamano_bytes);

  const celdaFecha = document.createElement('td');
  celdaFecha.textContent = formatearFecha(doc.fecha_carga);

  const celdaEstado = document.createElement('td');
  celdaEstado.className = 'celda-estado';
  celdaEstado.append(crearInsigniaEstado(doc.estado));

  const celdaNotas = document.createElement('td');
  if (doc.estado === 'Error' && doc.detalle_error) {
    const nota = document.createElement('span');
    nota.className = 'error-fila';
    nota.textContent = doc.detalle_error;
    celdaNotas.append(nota);
  } else if (doc.advertencias && doc.advertencias.length) {
    const nota = document.createElement('span');
    nota.className = 'advertencia-fila';
    nota.textContent = `${doc.advertencias.length} advertencia(s) de extracción`;
    celdaNotas.append(nota);
  }

  const celdaAcciones = document.createElement('td');
  if (doc.estado === 'Pendiente' || doc.estado === 'Error') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-sm btn-outline-secondary';
    boton.textContent = doc.estado === 'Error' ? 'Reintentar' : 'Procesar';
    boton.addEventListener('click', () => procesarDocumento(doc.id));
    celdaAcciones.append(boton);
  }

  fila.append(celdaNombre, celdaTamano, celdaFecha, celdaEstado, celdaNotas, celdaAcciones);
  return fila;
}

function renderizarCola(cola) {
  cuerpoTablaCola.innerHTML = '';

  if (!cola.length) {
    const filaVacia = document.createElement('tr');
    filaVacia.innerHTML = '<td colspan="6" class="text-center text-muted">Sin documentos cargados todavía.</td>';
    cuerpoTablaCola.append(filaVacia);
    return;
  }

  const ordenada = [...cola].sort((a, b) => new Date(b.fecha_carga) - new Date(a.fecha_carga));
  ordenada.forEach((doc) => cuerpoTablaCola.append(crearFilaDocumento(doc)));

  if (typeof window.gsap !== 'undefined') {
    window.gsap.fromTo(
      cuerpoTablaCola.querySelectorAll('tr'),
      { opacity: 0 },
      { opacity: 1, duration: 0.3, stagger: 0.03, ease: 'power1.out' }
    );
  }
}

async function actualizarCola() {
  const cola = await obtenerJSON('/admin/api/cola');
  renderizarCola(cola);
  return cola;
}

async function actualizarErrores() {
  const errores = await obtenerJSON('/admin/api/errores');
  listaErrores.innerHTML = '';
  if (!errores.length) {
    const vacio = document.createElement('p');
    vacio.className = 'text-muted';
    vacio.textContent = 'Sin errores registrados.';
    listaErrores.append(vacio);
    return;
  }
  const lista = document.createElement('ul');
  [...errores].reverse().forEach((error) => {
    const item = document.createElement('li');
    const tipo = document.createElement('span');
    tipo.className = 'error-tipo';
    tipo.textContent = error.tipo.replace(/_/g, ' ');
    item.append(tipo, document.createTextNode(`${error.archivo} — ${error.detalle}`));
    lista.append(item);
  });
  listaErrores.append(lista);
}

async function subirArchivos(listaArchivos) {
  const archivosPdf = Array.from(listaArchivos).filter((archivo) => archivo.type === 'application/pdf' || archivo.name.toLowerCase().endsWith('.pdf'));
  if (!archivosPdf.length) {
    window.alert('Ningún archivo seleccionado es un PDF.');
    return;
  }

  const formData = new FormData();
  archivosPdf.forEach((archivo) => formData.append('archivos', archivo));
  if (selectUnidad.value) formData.append('unidad_academica', selectUnidad.value);
  if (inputAnio.value) formData.append('anio', inputAnio.value);

  await obtenerJSON('/admin/api/upload', { method: 'POST', body: formData });
  await actualizarCola();
  await actualizarErrores();
}

async function procesarDocumento(docId) {
  try {
    await obtenerJSON(`/admin/api/procesar/${docId}`, { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  await actualizarCola();
  await actualizarErrores();
}

async function procesarPendientes() {
  botonProcesarPendientes.disabled = true;
  botonProcesarPendientes.textContent = 'Procesando…';
  try {
    await obtenerJSON('/admin/api/procesar-pendientes', { method: 'POST' });
  } finally {
    botonProcesarPendientes.disabled = false;
    botonProcesarPendientes.textContent = 'Procesar pendientes (modo rápido)';
  }
  await actualizarCola();
  await actualizarErrores();
}

// ---------- Eventos de carga (drag&drop + selección) ----------

zonaCarga.addEventListener('click', () => inputArchivos.click());
zonaCarga.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' || evento.key === ' ') {
    evento.preventDefault();
    inputArchivos.click();
  }
});

['dragenter', 'dragover'].forEach((tipoEvento) => {
  zonaCarga.addEventListener(tipoEvento, (evento) => {
    evento.preventDefault();
    zonaCarga.classList.add('zona-carga--activa');
  });
});

['dragleave', 'drop'].forEach((tipoEvento) => {
  zonaCarga.addEventListener(tipoEvento, (evento) => {
    evento.preventDefault();
    zonaCarga.classList.remove('zona-carga--activa');
  });
});

zonaCarga.addEventListener('drop', (evento) => {
  if (evento.dataTransfer?.files?.length) {
    subirArchivos(evento.dataTransfer.files);
  }
});

inputArchivos.addEventListener('change', () => {
  if (inputArchivos.files.length) {
    subirArchivos(inputArchivos.files);
    inputArchivos.value = '';
  }
});

botonProcesarPendientes.addEventListener('click', procesarPendientes);

// ---------- Inicialización ----------

cargarCategorias();
cargarDashboard();
actualizarCola();
actualizarErrores();
