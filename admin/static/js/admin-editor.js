/**
 * admin-editor.js
 * Editor completo de un proyecto: formulario con autosave por campo,
 * validación visual, editor de bloques (orden/visibilidad/destacado/
 * imágenes) con drag&drop nativo, botones de transición de estado y
 * enlace a la vista previa real.
 */

import { obtenerNombreUsuario } from './admin-usuario.js';

const ETIQUETA_ESTADO = {
  pendiente: 'Borrador', en_revision: 'En revisión', validado: 'Aprobado',
  publicado: 'Publicado', archivado: 'Archivado',
};
const CLASE_ESTADO = {
  pendiente: 'pendiente', en_revision: 'en-revision', validado: 'aprobado',
  publicado: 'publicado', archivado: 'archivado',
};

// Mismo mapa que almacen.TRANSICIONES_VALIDAS, con la etiqueta de botón
// que corresponde a cada transición. Si el backend cambiara las reglas,
// igual rechazaría una transición no permitida: esto solo decide qué
// botones mostrar, no es la autoridad final.
const TRANSICIONES = {
  pendiente: [['en_revision', 'Pasar a revisión']],
  en_revision: [['validado', 'Aprobar'], ['pendiente', 'Devolver a borrador']],
  validado: [['publicado', 'Publicar'], ['en_revision', 'Devolver a revisión']],
  publicado: [['archivado', 'Archivar']],
  archivado: [['publicado', 'Reactivar y publicar']],
};

const NOMBRE_BLOQUE = {
  resumen: 'Resumen', problema: 'Problema', objetivo_general: 'Objetivo general',
  objetivos_especificos: 'Objetivos específicos', acciones: 'Acciones',
  resultados_aportes: 'Resultados y aportes', imagenes: 'Imágenes',
  videos: 'Video', contacto: 'Datos y contacto',
};
const BLOQUES_PRINCIPAL = ['resumen', 'problema', 'objetivo_general', 'objetivos_especificos', 'acciones', 'resultados_aportes'];
const BLOQUES_SECUNDARIA = ['imagenes', 'videos', 'contacto'];

const idProyecto = new URLSearchParams(window.location.search).get('id');

const elementos = {
  titulo: document.getElementById('tituloProyecto'),
  insignia: document.getElementById('insigniaEstado'),
  botonesTransicion: document.getElementById('botonesTransicion'),
  bannerValidacion: document.getElementById('bannerValidacion'),
  visorPdf: document.getElementById('visorPdf'),
  form: document.getElementById('formEditor'),
  indicadorGuardado: document.getElementById('indicadorGuardado'),
  campoUnidad: document.getElementById('campoUnidad'),
  campoInstituciones: document.getElementById('campoInstituciones'),
  listaPrincipal: document.getElementById('listaBloquesPrincipal'),
  listaSecundaria: document.getElementById('listaBloquesSecundaria'),
  selectDestacado: document.getElementById('selectBloqueDestacado'),
  checkMostrarCita: document.getElementById('checkMostrarCita'),
  selectImagenPrincipal: document.getElementById('selectImagenPrincipal'),
  selectImagenPortada: document.getElementById('selectImagenPortada'),
  botonGuardarBloques: document.getElementById('botonGuardarBloques'),
  indicadorGuardadoBloques: document.getElementById('indicadorGuardadoBloques'),
  enlaceVistaPrevia: document.getElementById('enlaceVistaPrevia'),
  listaAuditoria: document.getElementById('listaAuditoria'),
};

let proyectoActual = null;

async function obtenerJSON(url, opciones) {
  const respuesta = await fetch(url, opciones);
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || `Error HTTP ${respuesta.status}`);
  }
  return respuesta.json();
}

function debounce(fn, espera = 500) {
  let temporizador = null;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), espera);
  };
}

async function cargarTodo() {
  if (!idProyecto) {
    elementos.titulo.textContent = 'Falta el id del proyecto en la URL.';
    return;
  }

  const [proyecto, categorias] = await Promise.all([
    obtenerJSON(`/admin/api/proyecto/${idProyecto}`),
    obtenerJSON('/admin/api/categorias'),
  ]);
  proyectoActual = proyecto;

  poblarSelectUnidad(categorias.unidades_academicas);
  poblarSelectInstituciones(categorias.instituciones_cooperantes);
  poblarFormulario(proyecto);
  renderizarCabecera(proyecto);
  renderizarValidacion(proyecto._validacion);
  renderizarEditorBloques(proyecto);
  elementos.visorPdf.src = `/admin/api/proyecto/${idProyecto}/pdf`;
  elementos.enlaceVistaPrevia.href = `/admin/preview?id=${encodeURIComponent(idProyecto)}`;

  const auditoria = await obtenerJSON(`/admin/api/proyecto/${idProyecto}/auditoria`);
  renderizarAuditoria(auditoria);
}

function poblarSelectUnidad(unidades) {
  unidades.forEach((unidad) => {
    const opcion = document.createElement('option');
    opcion.value = unidad.id;
    opcion.textContent = `${unidad.sigla} — ${unidad.nombre}`;
    elementos.campoUnidad.append(opcion);
  });
}

function poblarSelectInstituciones(instituciones) {
  instituciones.forEach((institucion) => {
    const opcion = document.createElement('option');
    opcion.value = institucion.id;
    opcion.textContent = institucion.nombre;
    elementos.campoInstituciones.append(opcion);
  });
}

function poblarFormulario(proyecto) {
  elementos.form.querySelectorAll('[data-campo]').forEach((campo) => {
    const nombre = campo.dataset.campo;
    const tipo = campo.dataset.tipo;

    if (nombre.includes('.')) {
      const [padre, hijo] = nombre.split('.');
      campo.value = (proyecto[padre] && proyecto[padre][hijo]) || '';
      return;
    }

    const valor = proyecto[nombre];

    if (tipo === 'multi') {
      const seleccionados = new Set(valor || []);
      Array.from(campo.options).forEach((opcion) => { opcion.selected = seleccionados.has(opcion.value); });
    } else if (tipo === 'lista') {
      campo.value = (valor || []).join('\n');
    } else if (tipo === 'lista-coma') {
      campo.value = (valor || []).join(', ');
    } else {
      campo.value = valor ?? '';
    }
  });
}

function renderizarCabecera(proyecto) {
  elementos.titulo.textContent = proyecto.titulo || `(sin título) — ${proyecto.id}`;
  elementos.insignia.className = `insignia-estado insignia-estado--${CLASE_ESTADO[proyecto.estado_revision] || 'pendiente'}`;
  elementos.insignia.textContent = ETIQUETA_ESTADO[proyecto.estado_revision] || proyecto.estado_revision;

  elementos.botonesTransicion.innerHTML = '';
  (TRANSICIONES[proyecto.estado_revision] || []).forEach(([nuevoEstado, etiqueta]) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = nuevoEstado === 'publicado' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline-secondary';
    boton.textContent = etiqueta;
    boton.addEventListener('click', () => aplicarTransicion(nuevoEstado));
    elementos.botonesTransicion.append(boton);
  });
}

function renderizarValidacion(validacion) {
  if (!validacion || (!validacion.bloqueantes.length && !validacion.advertencias.length)) {
    elementos.bannerValidacion.classList.add('d-none');
    return;
  }
  elementos.bannerValidacion.classList.remove('d-none');
  elementos.bannerValidacion.classList.toggle('admin-validacion--solo-advertencias', !validacion.bloqueantes.length);

  let html = '';
  if (validacion.bloqueantes.length) {
    html += `<strong>No se puede publicar — falta:</strong><ul>${validacion.bloqueantes.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  }
  if (validacion.advertencias.length) {
    html += `<strong>Advertencia (no bloquea, pero conviene revisar):</strong><ul>${validacion.advertencias.map((c) => `<li>${c}</li>`).join('')}</ul>`;
  }
  elementos.bannerValidacion.innerHTML = html;
}

function leerValorCampo(campo) {
  const tipo = campo.dataset.tipo;
  if (tipo === 'numero') return campo.value ? Number(campo.value) : null;
  if (tipo === 'lista') return campo.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (tipo === 'lista-coma') return campo.value.split(',').map((l) => l.trim()).filter(Boolean);
  if (tipo === 'multi') return Array.from(campo.selectedOptions).map((o) => o.value);
  return campo.value.trim() || null;
}

async function guardarCampo(nombreCampo, valor) {
  elementos.indicadorGuardado.textContent = 'Guardando…';
  elementos.indicadorGuardado.classList.remove('admin-editor__guardado--ok');
  try {
    const actualizado = await obtenerJSON(`/admin/api/proyecto/${idProyecto}/campo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campo: nombreCampo, valor, usuario: obtenerNombreUsuario() }),
    });
    proyectoActual = actualizado;
    renderizarValidacion(actualizado._validacion);
    if (nombreCampo === 'titulo') {
      elementos.titulo.textContent = actualizado.titulo || `(sin título) — ${actualizado.id}`;
    }
    elementos.indicadorGuardado.textContent = 'Guardado ✓';
    elementos.indicadorGuardado.classList.add('admin-editor__guardado--ok');
  } catch (error) {
    elementos.indicadorGuardado.textContent = `Error al guardar: ${error.message}`;
  }
}

const guardarCampoConDemoraPorCampo = new Map();

function obtenerGuardadoDemoradoParaCampo(nombreCampo) {
  if (!guardarCampoConDemoraPorCampo.has(nombreCampo)) {
    guardarCampoConDemoraPorCampo.set(nombreCampo, debounce(guardarCampo, 600));
  }
  return guardarCampoConDemoraPorCampo.get(nombreCampo);
}

async function guardarCitaDestacada() {
  const texto = document.getElementById('campoCitaTexto').value.trim();
  const fuente = document.getElementById('campoCitaFuente').value.trim();
  const valor = texto ? { texto, fuente: fuente || null } : null;
  await guardarCampo('cita_destacada', valor);
}

const guardarCitaConDemora = debounce(guardarCitaDestacada, 600);

function inicializarAutosave() {
  elementos.form.querySelectorAll('[data-campo]').forEach((campo) => {
    const nombre = campo.dataset.campo;

    if (nombre.startsWith('cita_destacada.')) {
      campo.addEventListener('input', guardarCitaConDemora);
      campo.addEventListener('change', guardarCitaDestacada);
      return;
    }

    const evento = campo.tagName === 'SELECT' ? 'change' : 'input';
    campo.addEventListener(evento, () => {
      const valor = leerValorCampo(campo);
      if (evento === 'change') guardarCampo(nombre, valor);
      else obtenerGuardadoDemoradoParaCampo(nombre)(nombre, valor);
    });
  });
}

async function aplicarTransicion(nuevoEstado) {
  try {
    await obtenerJSON(`/admin/api/proyecto/${idProyecto}/transicion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuevo_estado: nuevoEstado, usuario: obtenerNombreUsuario() }),
    });
    await cargarTodo();
  } catch (error) {
    window.alert(`No se pudo aplicar la transición: ${error.message}`);
  }
}

function crearItemBloque(idBloque, tieneContenido, oculto) {
  const li = document.createElement('li');
  li.className = 'bloque-item';
  li.draggable = true;
  li.dataset.bloque = idBloque;
  if (oculto) li.classList.add('bloque-item--oculto');
  if (!tieneContenido) li.classList.add('bloque-item--vacio');

  const manija = document.createElement('span');
  manija.className = 'bloque-item__manija';
  manija.textContent = '⠿';
  manija.setAttribute('aria-hidden', 'true');

  const nombre = document.createElement('span');
  nombre.className = 'bloque-item__nombre';
  nombre.textContent = NOMBRE_BLOQUE[idBloque];

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'form-check-input';
  check.checked = !oculto;
  check.setAttribute('aria-label', `Mostrar bloque ${NOMBRE_BLOQUE[idBloque]}`);
  check.addEventListener('change', () => li.classList.toggle('bloque-item--oculto', !check.checked));

  li.append(manija, nombre, check);

  if (!tieneContenido) {
    const aviso = document.createElement('span');
    aviso.className = 'bloque-item__sin-contenido';
    aviso.textContent = '(sin contenido)';
    li.append(aviso);
  }

  li.addEventListener('dragstart', () => li.classList.add('arrastrando'));
  li.addEventListener('dragend', () => li.classList.remove('arrastrando'));

  return li;
}

function tieneContenidoBloque(proyecto, idBloque) {
  const valor = proyecto[idBloque];
  if (Array.isArray(valor)) return valor.length > 0;
  return Boolean(valor);
}

function habilitarDragAndDrop(lista) {
  lista.addEventListener('dragover', (evento) => {
    evento.preventDefault();
    const objetivo = elementoMasCercano(lista, evento.clientY);
    lista.querySelectorAll('.objetivo-drop').forEach((el) => el.classList.remove('objetivo-drop'));
    if (objetivo) objetivo.classList.add('objetivo-drop');
  });

  lista.addEventListener('drop', (evento) => {
    evento.preventDefault();
    const arrastrado = lista.querySelector('.arrastrando');
    const objetivo = elementoMasCercano(lista, evento.clientY);
    lista.querySelectorAll('.objetivo-drop').forEach((el) => el.classList.remove('objetivo-drop'));
    if (!arrastrado) return;
    if (objetivo) lista.insertBefore(arrastrado, objetivo);
    else lista.append(arrastrado);
  });
}

function elementoMasCercano(lista, y) {
  const items = Array.from(lista.querySelectorAll('.bloque-item:not(.arrastrando)'));
  return items.find((item) => {
    const caja = item.getBoundingClientRect();
    return y < caja.top + caja.height / 2;
  });
}

function renderizarEditorBloques(proyecto) {
  const config = proyecto.configuracion_presentacion || {};
  const ordenGuardado = config.orden_bloques && config.orden_bloques.length
    ? config.orden_bloques
    : [...BLOQUES_PRINCIPAL, ...BLOQUES_SECUNDARIA];
  const ocultos = new Set(config.bloques_ocultos || []);

  elementos.listaPrincipal.innerHTML = '';
  elementos.listaSecundaria.innerHTML = '';

  ordenGuardado.filter((id) => BLOQUES_PRINCIPAL.includes(id)).forEach((id) => {
    elementos.listaPrincipal.append(crearItemBloque(id, tieneContenidoBloque(proyecto, id), ocultos.has(id)));
  });
  ordenGuardado.filter((id) => BLOQUES_SECUNDARIA.includes(id)).forEach((id) => {
    elementos.listaSecundaria.append(crearItemBloque(id, tieneContenidoBloque(proyecto, id), ocultos.has(id)));
  });

  habilitarDragAndDrop(elementos.listaPrincipal);
  habilitarDragAndDrop(elementos.listaSecundaria);

  elementos.selectDestacado.innerHTML = '<option value="">— Ninguno —</option>';
  [...BLOQUES_PRINCIPAL, ...BLOQUES_SECUNDARIA].forEach((id) => {
    const opcion = document.createElement('option');
    opcion.value = id;
    opcion.textContent = NOMBRE_BLOQUE[id];
    if (config.bloque_destacado === id) opcion.selected = true;
    elementos.selectDestacado.append(opcion);
  });

  elementos.checkMostrarCita.checked = config.mostrar_cita_destacada !== false;

  [elementos.selectImagenPrincipal, elementos.selectImagenPortada].forEach((select) => {
    select.innerHTML = '<option value="">— Sin imágenes cargadas —</option>';
  });
  (proyecto.imagenes || []).forEach((imagen, indice) => {
    [elementos.selectImagenPrincipal, elementos.selectImagenPortada].forEach((select) => {
      const opcion = document.createElement('option');
      opcion.value = String(indice);
      opcion.textContent = imagen.alt || imagen.archivo || `Imagen ${indice + 1}`;
      select.append(opcion);
    });
  });
  if (Number.isInteger(config.imagen_principal)) elementos.selectImagenPrincipal.value = String(config.imagen_principal);
  if (Number.isInteger(config.imagen_portada)) elementos.selectImagenPortada.value = String(config.imagen_portada);
}

async function guardarConfiguracionBloques() {
  const ordenPrincipal = Array.from(elementos.listaPrincipal.querySelectorAll('.bloque-item')).map((li) => li.dataset.bloque);
  const ordenSecundaria = Array.from(elementos.listaSecundaria.querySelectorAll('.bloque-item')).map((li) => li.dataset.bloque);
  const ocultos = Array.from(document.querySelectorAll('.lista-bloques .bloque-item'))
    .filter((li) => !li.querySelector('input[type="checkbox"]').checked)
    .map((li) => li.dataset.bloque);

  const configuracion = {
    orden_bloques: [...ordenPrincipal, ...ordenSecundaria],
    bloques_ocultos: ocultos,
    bloque_destacado: elementos.selectDestacado.value || null,
    mostrar_cita_destacada: elementos.checkMostrarCita.checked,
    imagen_principal: elementos.selectImagenPrincipal.value ? Number(elementos.selectImagenPrincipal.value) : null,
    imagen_portada: elementos.selectImagenPortada.value ? Number(elementos.selectImagenPortada.value) : null,
  };

  elementos.indicadorGuardadoBloques.textContent = 'Guardando…';
  await obtenerJSON(`/admin/api/proyecto/${idProyecto}/configuracion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuracion, usuario: obtenerNombreUsuario() }),
  });
  elementos.indicadorGuardadoBloques.textContent = 'Guardado ✓';
  elementos.indicadorGuardadoBloques.classList.add('admin-editor__guardado--ok');
}

elementos.botonGuardarBloques.addEventListener('click', guardarConfiguracionBloques);

function truncar(valor) {
  const texto = Array.isArray(valor) ? valor.join(', ') : String(valor ?? '—');
  return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto;
}

function renderizarAuditoria(auditoria) {
  const eventos = [
    ...auditoria.historial.map((e) => ({ ...e, tipo: 'Estado' })),
    ...auditoria.historial_correcciones.map((e) => ({ ...e, tipo: 'Corrección', accion: e.campo })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (!eventos.length) {
    elementos.listaAuditoria.innerHTML = '<p class="text-muted">Sin actividad registrada todavía.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.innerHTML = '<thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Usuario</th></tr></thead>';
  const tbody = document.createElement('tbody');
  eventos.forEach((evento) => {
    const fila = document.createElement('tr');
    const detalle = evento.tipo === 'Estado'
      ? `${evento.estado_anterior || '—'} → ${evento.estado_nuevo || '—'} (${evento.accion})`
      : `${evento.campo}: "${truncar(evento.valor_anterior)}" → "${truncar(evento.valor_nuevo)}"`;
    fila.innerHTML = `
      <td>${new Date(evento.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${evento.tipo}</td>
      <td>${detalle}</td>
      <td>${evento.usuario}</td>
    `;
    tbody.append(fila);
  });
  tabla.append(tbody);
  elementos.listaAuditoria.innerHTML = '';
  elementos.listaAuditoria.append(tabla);
}

inicializarAutosave();
cargarTodo();
