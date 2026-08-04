/**
 * admin.js
 * -----------------------------------------------------------------------
 * Pestañas Sedes / Testimonios / Multimedia / Configuración: igual que en
 * v1, mapean 1 a 1 con los archivos de /data. La pestaña Escenas es nueva:
 * monta el editor visual de escenario.js para la sede seleccionada.
 *
 * Persistencia: localStorage al instante, igual que en v1. Ver README.
 */
const CLAVE_SESION = 'unam_semana_regional_admin_autenticado';
const VIGENCIA_SESION_MS = 30 * 60 * 1000;   // C-01: expiración por inactividad

/**
 * C-01 · Verificación de sesión con expiración.
 * ADVERTENCIA: esta comprobación es del lado del cliente y por tanto
 * falsificable desde la consola. Impide el acceso casual, no un ataque
 * dirigido. La protección real es la del servidor (Nginx auth_basic +
 * restricción por red). Ver DTA de Correcciones de Seguridad §5.1 y §7.
 */
function sesionVigente() {
  try {
    const bruto = sessionStorage.getItem(CLAVE_SESION);
    if (!bruto) return false;
    const s = JSON.parse(bruto);
    return s && s.valido === true && typeof s.ts === 'number' &&
           (Date.now() - s.ts) < VIGENCIA_SESION_MS;
  } catch (e) { return false; }
}

if (!sesionVigente()) {
  sessionStorage.removeItem(CLAVE_SESION);
  window.location.href = 'login.html';
}

// Renovar la marca de tiempo con cada interacción, para que la expiración
// mida inactividad y no tiempo total de sesión.
['click', 'keydown'].forEach((ev) => {
  document.addEventListener(ev, () => {
    if (sesionVigente()) {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ valido: true, ts: Date.now() }));
    }
  }, { passive: true });
});

const OPCIONES_ANIMACION = [
  { valor: 'fade', etiqueta: 'Aparición suave (fade)' },
  { valor: 'slide', etiqueta: 'Deslizamiento (slide)' },
  { valor: 'drop', etiqueta: 'Caída (drop)' },
  { valor: 'float', etiqueta: 'Flotación (float)' },
  { valor: 'zoom', etiqueta: 'Acercamiento suave (zoom)' },
];

const OPCIONES_PROFUNDIDAD = [
  { valor: '2', etiqueta: 'Plano 2 — fotografías' },
  { valor: '3', etiqueta: 'Plano 3 — comentarios' },
  { valor: '4', etiqueta: 'Plano 4 — videos' },
  { valor: '5', etiqueta: 'Plano 5 — elementos gráficos' },
  { valor: '6', etiqueta: 'Plano 6 — información institucional' },
];

const ESQUEMA_SEDE = [
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'text' },
  { clave: 'subtitulo', etiqueta: 'Subtítulo', tipo: 'text' },
  { clave: 'descripcion', etiqueta: 'Descripción institucional', tipo: 'textarea', filas: 8, ayuda: 'Dos párrafos separados por una línea vacía: el primero presenta la sede y sus unidades, el segundo su rol en la Semana Regional.' },
  { clave: 'imagenFondo', etiqueta: 'Ruta de la imagen de fondo', tipo: 'text', ayuda: 'Ej: assets/backgrounds/posadas.jpg' },
  { clave: 'imagenFondoArchivo', etiqueta: 'Subir imagen (sugiere la ruta)', tipo: 'archivo', aceptar: 'image/*', objetivo: 'imagenFondo', rutaSugerida: 'assets/backgrounds/' },
  { clave: 'composicion', etiqueta: 'Personalidad de la escena', tipo: 'select', opciones: [
    { valor: 'convergente', etiqueta: 'Convergente' },
    { valor: 'diagonal', etiqueta: 'Diagonal' },
    { valor: 'vertical', etiqueta: 'Vertical' },
  ] },
  { clave: 'visible', etiqueta: 'Visible en el sitio', tipo: 'checkbox' },
];

const ESQUEMA_TESTIMONIO = [
  { clave: 'nombreCompleto', etiqueta: 'Nombre completo', tipo: 'text' },
  { clave: 'cargo', etiqueta: 'Cargo', tipo: 'text' },
  { clave: 'institucion', etiqueta: 'Institución / unidad académica', tipo: 'text' },
  { clave: 'foto', etiqueta: 'Ruta de la foto (vacío = monograma automático)', tipo: 'text', ayuda: 'Ej: assets/personas/nombre-apellido.jpg' },
  { clave: 'fotoArchivo', etiqueta: 'Subir foto (sugiere la ruta)', tipo: 'archivo', aceptar: 'image/*', objetivo: 'foto', rutaSugerida: 'assets/personas/' },
  { clave: 'citasTexto', etiqueta: 'Citas (una o varias)', tipo: 'textarea', filas: 6, ayuda: 'Si hay más de una, separarlas con una línea con solo "---". El sitio elige una al azar cada vez que se entra a la sede, sin repetir la última. Cada cita se muestra exactamente como se escriba acá.' },
  { clave: 'animacion', etiqueta: 'Animación de entrada', tipo: 'select', opciones: OPCIONES_ANIMACION },
  { clave: 'x', etiqueta: 'Posición X (%)', tipo: 'number', min: 0, max: 100, paso: 1, ayuda: 'También se puede arrastrar en la pestaña Escenas' },
  { clave: 'y', etiqueta: 'Posición Y (%)', tipo: 'number', min: 0, max: 100, paso: 1 },
  { clave: 'escala', etiqueta: 'Escala', tipo: 'number', min: 0.5, max: 1.6, paso: 0.05 },
  { clave: 'rotacion', etiqueta: 'Rotación (grados)', tipo: 'number', min: -20, max: 20, paso: 1 },
  { clave: 'profundidad', etiqueta: 'Plano de profundidad', tipo: 'select', opciones: OPCIONES_PROFUNDIDAD },
  { clave: 'ordenNarrativo', etiqueta: 'Orden narrativo (1° aparece primero)', tipo: 'number', min: 1, max: 20, paso: 1 },
  { clave: 'duracion', etiqueta: 'Duración de entrada (ms)', tipo: 'number', min: 100, max: 3000, paso: 50 },
  { clave: 'visible', etiqueta: 'Visible en el sitio', tipo: 'checkbox' },
];

const ESQUEMA_MULTIMEDIA = [
  { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ valor: 'foto', etiqueta: 'Foto' }, { valor: 'video', etiqueta: 'Video' }] },
  { clave: 'src', etiqueta: 'Ruta del archivo', tipo: 'text', ayuda: 'Ej: assets/photos/posadas-1.jpg' },
  { clave: 'archivo', etiqueta: 'Subir archivo (sugiere la ruta)', tipo: 'archivo', aceptar: 'image/*,video/*', objetivo: 'src', rutaSugerida: 'assets/photos/' },
  { clave: 'caption', etiqueta: 'Pie de foto / leyenda', tipo: 'text' },
  { clave: 'alt', etiqueta: 'Texto alternativo (accesibilidad)', tipo: 'text' },
  { clave: 'animacion', etiqueta: 'Animación de entrada', tipo: 'select', opciones: OPCIONES_ANIMACION },
  { clave: 'x', etiqueta: 'Posición X (%)', tipo: 'number', min: 0, max: 100, paso: 1, ayuda: 'También se puede arrastrar en la pestaña Escenas' },
  { clave: 'y', etiqueta: 'Posición Y (%)', tipo: 'number', min: 0, max: 100, paso: 1 },
  { clave: 'escala', etiqueta: 'Escala', tipo: 'number', min: 0.5, max: 1.6, paso: 0.05 },
  { clave: 'rotacion', etiqueta: 'Rotación (grados)', tipo: 'number', min: -20, max: 20, paso: 1 },
  { clave: 'profundidad', etiqueta: 'Plano de profundidad', tipo: 'select', opciones: OPCIONES_PROFUNDIDAD },
  { clave: 'ordenNarrativo', etiqueta: 'Orden narrativo (1° aparece primero)', tipo: 'number', min: 1, max: 20, paso: 1 },
  { clave: 'duracion', etiqueta: 'Duración de entrada (ms)', tipo: 'number', min: 100, max: 3000, paso: 50 },
  { clave: 'visible', etiqueta: 'Visible en el sitio', tipo: 'checkbox' },
];

let estado = { sedes: [], testimonios: [], multimedia: [], config: null };
let sedeEscenaActual = null;

// [Integración backend, DTI §6.3 / DTC cap.10] Edición sobre la que el panel
// escribe. Sin selector de edición todavía en la UI (ver Informe de
// Implementación §7, requisito pendiente #3): se resuelve UNA VEZ al iniciar,
// tomando la edición publicada. Si no hay backend o no hay edición publicada,
// queda en null y guardarEnBackend() se omite — el panel sigue funcionando
// con localStorage exactamente como antes de esta integración.
let _edicionActual = null;

async function _resolverEdicionActual() {
  try {
    const resp = await fetch('/api/v1/ediciones/activa');
    if (!resp.ok) return null;
    const meta = await resp.json();
    return meta.anio;
  } catch { return null; }
}

/** Guarda en localStorage (sin cambios) y, si hay backend, también en servidor. */
async function _guardarConBackend(nombre, datos, etiqueta) {
  Almacen.guardar(nombre, datos);
  if (_edicionActual == null) {
    mostrarEstado(`${etiqueta} guardado en este navegador (sin backend conectado)`);
    return;
  }
  const resultado = await Almacen.guardarEnBackend(_edicionActual, nombre, datos);
  if (resultado.ok) {
    mostrarEstado(`${etiqueta} guardado y confirmado en el servidor`);
  } else {
    const MENSAJES = {
      SESION_EXPIRADA: 'Sesión expirada — el cambio quedó solo en este navegador. Volvé a iniciar sesión.',
      EDICION_CONGELADA: 'La edición está en revisión o publicada y no admite cambios directos.',
      BLOQUEO_ACTIVO: 'Otra persona está editando esto en este momento.',
      BACKEND_INALCANZABLE: `${etiqueta} guardado solo en este navegador (backend no disponible).`,
    };
    mostrarEstado(MENSAJES[resultado.motivo] || `${etiqueta} guardado en este navegador; el servidor rechazó el cambio.`, true);
  }
}

(async function iniciarAdmin() {
  [estado.sedes, estado.testimonios, estado.multimedia, estado.config] = await Promise.all([
    Almacen.cargar('sedes'),
    Almacen.cargar('testimonios'),
    Almacen.cargar('multimedia'),
    Almacen.cargar('config'),
  ]);
  _edicionActual = await _resolverEdicionActual();

  iniciarPestañas();
  renderizarSedes();
  renderizarTestimonios();
  renderizarMultimedia();
  renderizarConfiguracion();
  iniciarEscenas();
  iniciarBarraSuperior();
})();

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------
function iniciarPestañas() {
  document.querySelectorAll('.pestaña-boton').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.pestaña-boton').forEach((b) => b.classList.remove('pestaña-boton--activa'));
      document.querySelectorAll('.panel-tab').forEach((p) => p.classList.remove('panel-tab--activo'));
      boton.classList.add('pestaña-boton--activa');
      document.getElementById(`panel-tab-${boton.dataset.tab}`).classList.add('panel-tab--activo');
    });
  });
}

function iniciarBarraSuperior() {
  document.getElementById('boton-cerrar-sesion').addEventListener('click', () => {
    sessionStorage.removeItem(CLAVE_SESION);
    window.location.href = 'login.html';
  });
}

function mostrarEstado(texto, esError = false) {
  const indicador = document.getElementById('indicador-guardado');
  indicador.textContent = texto;
  indicador.classList.add('indicador-guardado--visible');
  indicador.classList.toggle('indicador-guardado--error', !!esError);
  clearTimeout(indicador._temporizador);
  indicador._temporizador = setTimeout(() => indicador.classList.remove('indicador-guardado--visible'), esError ? 3200 : 1800);
}

// ---------------------------------------------------------------------------
// Utilidad de arrastrar y soltar para reordenar listas (Testimonios/Multimedia)
// ---------------------------------------------------------------------------
function habilitarArrastre(contenedor, alReordenar) {
  let elementoArrastrado = null;

  contenedor.addEventListener('dragstart', (evento) => {
    const item = evento.target.closest('.tarjeta-admin');
    if (!item) return;
    elementoArrastrado = item;
    item.classList.add('tarjeta-admin--arrastrando');
    evento.dataTransfer.effectAllowed = 'move';
  });

  contenedor.addEventListener('dragend', (evento) => {
    const item = evento.target.closest('.tarjeta-admin');
    if (item) item.classList.remove('tarjeta-admin--arrastrando');
    elementoArrastrado = null;
    alReordenar(Array.from(contenedor.children).map((el) => el.dataset.id));
  });

  contenedor.addEventListener('dragover', (evento) => {
    evento.preventDefault();
    const sobre = evento.target.closest('.tarjeta-admin');
    if (!sobre || sobre === elementoArrastrado || !elementoArrastrado) return;
    const rect = sobre.getBoundingClientRect();
    const mitad = rect.top + rect.height / 2;
    if (evento.clientY < mitad) contenedor.insertBefore(elementoArrastrado, sobre);
    else contenedor.insertBefore(elementoArrastrado, sobre.nextSibling);
  });
}

// ---------------------------------------------------------------------------
// Sedes
// ---------------------------------------------------------------------------
function renderizarSedes() {
  const contenedor = document.getElementById('panel-sedes');
  contenedor.innerHTML = '';
  estado.sedes.sort((a, b) => a.orden - b.orden).forEach((sede) => {
    const detalle = document.createElement('details');
    detalle.className = 'tarjeta-admin';
    detalle.dataset.id = sede.id;
    detalle.innerHTML = `<summary><span class="tarjeta-admin-titulo">${sede.nombre} — ${sede.subtitulo}</span></summary>`;
    const formulario = Editor.crearFormulario(sede, ESQUEMA_SEDE, (_item, opciones) => {
      guardarSedes();
      if (opciones?.regenerar) renderizarSedes();
    });
    detalle.appendChild(formulario);
    contenedor.appendChild(detalle);
  });
}

async function guardarSedes() {
  await _guardarConBackend('sedes', estado.sedes, 'Sedes');
  refrescarEscenaSiCorresponde();
}

// ---------------------------------------------------------------------------
// Testimonios (agrupados por sede, con arrastre para reordenar)
// ---------------------------------------------------------------------------
function renderizarTestimonios() {
  const contenedor = document.getElementById('panel-testimonios');
  contenedor.innerHTML = '';

  estado.sedes.sort((a, b) => a.orden - b.orden).forEach((sede) => {
    const grupo = document.createElement('section');
    grupo.className = 'grupo-sede';
    grupo.innerHTML = `<h3>${sede.nombre}</h3>`;

    const lista = document.createElement('div');
    lista.className = 'lista-arrastrable';

    estado.testimonios
      .filter((t) => t.sede === sede.id)
      .sort((a, b) => a.ordenNarrativo - b.ordenNarrativo)
      .forEach((item) => {
        item.citasTexto = (Array.isArray(item.citas) ? item.citas : [item.texto || '']).join('\n\n---\n\n');
        lista.appendChild(crearTarjetaAdmin(item, ESQUEMA_TESTIMONIO, guardarTestimonios, eliminarTestimonio, (i) => `${i.nombreCompleto || '(sin nombre)'} — ${i.cargo || ''}`, renderizarTestimonios));
      });

    habilitarArrastre(lista, (idsEnOrden) => {
      idsEnOrden.forEach((id, indice) => {
        const item = estado.testimonios.find((t) => t.id === id);
        if (item) item.ordenNarrativo = indice + 1;
      });
      guardarTestimonios();
    });

    const botonAgregar = document.createElement('button');
    botonAgregar.type = 'button';
    botonAgregar.className = 'boton boton--secundario';
    botonAgregar.textContent = '+ Agregar testimonio';
    botonAgregar.addEventListener('click', () => {
      const cantidad = estado.testimonios.filter((t) => t.sede === sede.id).length;
      estado.testimonios.push({
        id: `t-${sede.id}-${Date.now()}`,
        sede: sede.id,
        nombreCompleto: '', cargo: '', institucion: '', foto: null, citas: [''],
        animacion: 'fade', x: 50, y: 50, escala: 1, rotacion: 0, profundidad: '3',
        opacidadFinal: 1, ordenNarrativo: cantidad + 1, duracion: 650,
        visible: true,
      });
      guardarTestimonios();
      renderizarTestimonios();
    });

    grupo.appendChild(lista);
    grupo.appendChild(botonAgregar);
    contenedor.appendChild(grupo);
  });
}

function eliminarTestimonio(item) {
  estado.testimonios = estado.testimonios.filter((t) => t.id !== item.id);
  guardarTestimonios();
  renderizarTestimonios();
}

async function guardarTestimonios() {
  estado.testimonios.forEach((item) => {
    if (typeof item.citasTexto === 'string') {
      item.citas = item.citasTexto
        .split(/\n*-{3,}\n*/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (!item.citas.length) item.citas = [''];
    }
  });
  await _guardarConBackend('testimonios', estado.testimonios.map(({ citasTexto, ...resto }) => resto), 'Testimonios');
  refrescarEscenaSiCorresponde();
}

// ---------------------------------------------------------------------------
// Multimedia (mismo patrón que testimonios)
// ---------------------------------------------------------------------------
function renderizarMultimedia() {
  const contenedor = document.getElementById('panel-multimedia');
  contenedor.innerHTML = '';

  estado.sedes.sort((a, b) => a.orden - b.orden).forEach((sede) => {
    const grupo = document.createElement('section');
    grupo.className = 'grupo-sede';
    grupo.innerHTML = `<h3>${sede.nombre}</h3>`;

    const lista = document.createElement('div');
    lista.className = 'lista-arrastrable';

    estado.multimedia
      .filter((m) => m.sede === sede.id)
      .sort((a, b) => a.ordenNarrativo - b.ordenNarrativo)
      .forEach((item) => lista.appendChild(crearTarjetaAdmin(item, ESQUEMA_MULTIMEDIA, guardarMultimedia, eliminarMultimedia, (i) => `${i.tipo === 'video' ? '🎬' : '🖼'} ${i.caption || i.src || '(sin nombre)'}`, renderizarMultimedia)));

    habilitarArrastre(lista, (idsEnOrden) => {
      idsEnOrden.forEach((id, indice) => {
        const item = estado.multimedia.find((m) => m.id === id);
        if (item) item.ordenNarrativo = indice + 1;
      });
      guardarMultimedia();
    });

    const botonAgregar = document.createElement('button');
    botonAgregar.type = 'button';
    botonAgregar.className = 'boton boton--secundario';
    botonAgregar.textContent = '+ Agregar foto o video';
    botonAgregar.addEventListener('click', () => {
      const cantidad = estado.multimedia.filter((m) => m.sede === sede.id).length;
      estado.multimedia.push({
        id: `m-${sede.id}-${Date.now()}`,
        sede: sede.id,
        tipo: 'foto', src: '', alt: '', caption: '',
        animacion: 'float', x: 50, y: 50, escala: 1, rotacion: 0, profundidad: '2',
        opacidadFinal: 1, ordenNarrativo: cantidad + 1, duracion: 650,
        visible: true,
      });
      guardarMultimedia();
      renderizarMultimedia();
    });

    grupo.appendChild(lista);
    grupo.appendChild(botonAgregar);
    contenedor.appendChild(grupo);
  });
}

function eliminarMultimedia(item) {
  estado.multimedia = estado.multimedia.filter((m) => m.id !== item.id);
  guardarMultimedia();
  renderizarMultimedia();
}

async function guardarMultimedia() {
  await _guardarConBackend('multimedia', estado.multimedia, 'Multimedia');
  refrescarEscenaSiCorresponde();
}

// ---------------------------------------------------------------------------
// Tarjeta admin genérica (testimonios y multimedia comparten esta forma)
// ---------------------------------------------------------------------------
function crearTarjetaAdmin(item, esquema, alGuardar, alEliminar, tituloResumen, alRegenerarTodo) {
  const detalle = document.createElement('details');
  detalle.className = 'tarjeta-admin';
  detalle.draggable = true;
  detalle.dataset.id = item.id;

  const resumen = document.createElement('summary');
  resumen.innerHTML = `
    <span class="tarjeta-admin-arrastre" title="Arrastrar para reordenar">⠿</span>
    <span class="tarjeta-admin-titulo">${escaparHTMLAdmin(tituloResumen(item))}</span>
  `;
  const botonEliminar = document.createElement('button');
  botonEliminar.type = 'button';
  botonEliminar.className = 'boton boton--peligro boton--chico';
  botonEliminar.textContent = 'Eliminar';
  botonEliminar.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('¿Eliminar este elemento?')) alEliminar(item);
  });
  resumen.appendChild(botonEliminar);
  detalle.appendChild(resumen);

  const formulario = Editor.crearFormulario(item, esquema, (_item, opciones) => {
    resumen.querySelector('.tarjeta-admin-titulo').textContent = tituloResumen(item);
    alGuardar();
    if (opciones?.regenerar && alRegenerarTodo) alRegenerarTodo();
  });
  detalle.appendChild(formulario);

  return detalle;
}

function escaparHTMLAdmin(texto = '') {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Configuración (formulario plano, no es una lista)
// ---------------------------------------------------------------------------
function renderizarConfiguracion() {
  const contenedor = document.getElementById('panel-configuracion');
  contenedor.innerHTML = '';

  const trabajo = {
    id: 'config',
    nombre: estado.config.evento.nombre,
    edicion: estado.config.evento.edicion,
    fechas: estado.config.evento.fechas,
    resolucion: estado.config.evento.resolucion,
    leyendaSecretaria: estado.config.evento.leyendaSecretaria,
    bajada: estado.config.evento.bajada,
    badge: estado.config.marca.badge,
    logoPath: estado.config.marca.logoPath,
  };

  const esquema = [
    { clave: 'nombre', etiqueta: 'Nombre del evento', tipo: 'text' },
    { clave: 'edicion', etiqueta: 'Identificador de la edición', tipo: 'text', ayuda: 'Permite reutilizar el mismo sitio en próximas ediciones' },
    { clave: 'fechas', etiqueta: 'Fechas', tipo: 'text' },
    { clave: 'resolucion', etiqueta: 'Resolución que lo aprueba', tipo: 'text' },
    { clave: 'leyendaSecretaria', etiqueta: 'Leyenda de la secretaría', tipo: 'text' },
    { clave: 'bajada', etiqueta: 'Bajada / descripción corta', tipo: 'textarea', filas: 2 },
    { clave: 'badge', etiqueta: 'Texto del badge institucional', tipo: 'text' },
    { clave: 'logoPath', etiqueta: 'Ruta del logo (SVG)', tipo: 'text' },
  ];

  const formulario = Editor.crearFormulario(trabajo, esquema, async () => {
    estado.config.evento.nombre = trabajo.nombre;
    estado.config.evento.edicion = trabajo.edicion;
    estado.config.evento.fechas = trabajo.fechas;
    estado.config.evento.resolucion = trabajo.resolucion;
    estado.config.evento.leyendaSecretaria = trabajo.leyendaSecretaria;
    estado.config.evento.bajada = trabajo.bajada;
    estado.config.marca.badge = trabajo.badge;
    estado.config.marca.logoPath = trabajo.logoPath;
    await _guardarConBackend('config', estado.config, 'Configuración');
  });

  contenedor.appendChild(formulario);
}

// ---------------------------------------------------------------------------
// Escenas — editor visual (nuevo)
// ---------------------------------------------------------------------------
function iniciarEscenas() {
  const nav = document.getElementById('escenas-nav-sedes');
  nav.innerHTML = '';
  estado.sedes.sort((a, b) => a.orden - b.orden).forEach((sede, indice) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--secundario boton--chico escenas-boton-sede';
    boton.textContent = sede.nombre;
    boton.dataset.sede = sede.id;
    if (indice === 0) boton.classList.add('escenas-boton-sede--activo');
    boton.addEventListener('click', () => {
      document.querySelectorAll('.escenas-boton-sede').forEach((b) => b.classList.remove('escenas-boton-sede--activo'));
      boton.classList.add('escenas-boton-sede--activo');
      renderizarEscena(sede.id);
    });
    nav.appendChild(boton);
  });
  if (estado.sedes[0]) renderizarEscena(estado.sedes.sort((a, b) => a.orden - b.orden)[0].id);
}

function renderizarEscena(sedeId) {
  sedeEscenaActual = sedeId;
  const sede = estado.sedes.find((s) => s.id === sedeId);
  if (!sede) return;

  const items = [
    ...estado.testimonios.filter((t) => t.sede === sedeId).map((t) => ({ ...t, _tipo: 'testimonio', _coleccion: 'testimonios' })),
    ...estado.multimedia.filter((m) => m.sede === sedeId).map((m) => ({ ...m, _tipo: m.tipo, _coleccion: 'multimedia' })),
  ];
  // Los objetos de "items" son copias superficiales con _tipo/_coleccion
  // agregados, pero arrastrar debe escribir sobre el original en estado.*,
  // no sobre la copia — por eso cada item conserva su id y la persistencia
  // busca el original por id antes de guardar (ver alPersistirDesdeEscena).

  Escenario.renderizar({
    contenedorLienzo: document.getElementById('escenario-lienzo-envoltorio'),
    contenedorPanel: document.getElementById('escenario-panel'),
    sede,
    items,
    guardar: alPersistirDesdeEscena,
  });
}

function alPersistirDesdeEscena(itemEditado) {
  const coleccion = itemEditado._coleccion === 'testimonios' ? estado.testimonios : estado.multimedia;
  const original = coleccion.find((i) => i.id === itemEditado.id);
  if (!original) return;
  Object.assign(original, {
    x: itemEditado.x, y: itemEditado.y, escala: Number(itemEditado.escala),
    rotacion: Number(itemEditado.rotacion), profundidad: itemEditado.profundidad,
    ordenNarrativo: Number(itemEditado.ordenNarrativo),
    visible: itemEditado.visible,
  });
  if (itemEditado._coleccion === 'testimonios') guardarTestimonios();
  else guardarMultimedia();
}

// Si se edita contenido desde Testimonios/Multimedia mientras la pestaña
// Escenas ya está montada, se refresca el lienzo para que no quede desfasado.
function refrescarEscenaSiCorresponde() {
  if (sedeEscenaActual && document.getElementById('panel-tab-escenas')?.classList.contains('panel-tab--activo')) {
    renderizarEscena(sedeEscenaActual);
  }
}

// ---------------------------------------------------------------------------
// Exportar / importar / restablecer
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-exportar]').forEach((boton) => {
  boton.addEventListener('click', () => {
    const nombre = boton.dataset.exportar;
    Almacen.descargar(nombre, estado[nombre]);
  });
});

document.querySelectorAll('[data-restablecer]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const nombre = boton.dataset.restablecer;
    if (!confirm(`Esto descarta los cambios guardados en este navegador para "${nombre}" y vuelve al archivo original. ¿Continuar?`)) return;
    Almacen.restablecer(nombre);
    estado[nombre] = await Almacen.cargar(nombre);
    renderizarTodo();
    mostrarEstado(`"${nombre}" restablecido al archivo original`);
  });
});

document.querySelectorAll('[data-importar]').forEach((input) => {
  input.addEventListener('change', async () => {
    const nombre = input.dataset.importar;
    const archivo = input.files[0];
    if (!archivo) return;
    try {
      estado[nombre] = await Almacen.importar(archivo, nombre);
      Almacen.guardar(nombre, estado[nombre]);
      renderizarTodo();
      mostrarEstado(`"${nombre}" importado correctamente`);
    } catch (error) {
      alert('El archivo no es un JSON válido.');
      console.error(error);
    }
    input.value = '';
  });
});

function renderizarTodo() {
  renderizarSedes();
  renderizarTestimonios();
  renderizarMultimedia();
  renderizarConfiguracion();
  iniciarEscenas();
}
