/**
 * escenario.js
 * -----------------------------------------------------------------------
 * Editor visual de composición: un lienzo con el fondo real de la sede y
 * un punto arrastrable por cada testimonio/foto/video. Arrastrar actualiza
 * x/y; el panel lateral edita profundidad, escala, rotación, orden
 * narrativo y duración de salida del elemento seleccionado.
 *
 * No reemplaza los formularios de las pestañas Testimonios/Multimedia
 * (ahí se sigue editando el contenido en sí): esto es una vista adicional
 * sobre los mismos datos, pensada para la parte espacial.
 */
const Escenario = (() => {
  const OPCIONES_PROFUNDIDAD = [
    { valor: '2', etiqueta: 'Plano 2 — más al fondo (fotografías)' },
    { valor: '3', etiqueta: 'Plano 3 (comentarios)' },
    { valor: '4', etiqueta: 'Plano 4 (videos)' },
    { valor: '5', etiqueta: 'Plano 5 (elementos gráficos)' },
    { valor: '6', etiqueta: 'Plano 6 — más cerca (información institucional)' },
  ];

  const ESQUEMA_PANEL = [
    { clave: 'profundidad', etiqueta: 'Plano de profundidad', tipo: 'select', opciones: OPCIONES_PROFUNDIDAD },
    { clave: 'escala', etiqueta: 'Escala', tipo: 'number', min: 0.5, max: 1.6, paso: 0.05 },
    { clave: 'rotacion', etiqueta: 'Rotación (grados)', tipo: 'number', min: -20, max: 20, paso: 1 },
    { clave: 'ordenNarrativo', etiqueta: 'Orden narrativo (1° aparece primero)', tipo: 'number', min: 1, max: 20, paso: 1 },
    { clave: 'visible', etiqueta: 'Visible en el sitio', tipo: 'checkbox' },
  ];

  const ICONO = { testimonio: '💬', foto: '🖼', video: '🎬' };

  function renderizar({ contenedorLienzo, contenedorPanel, sede, items, guardar }) {
    contenedorLienzo.innerHTML = '';
    contenedorPanel.innerHTML = '<p class="escenario-panel-ayuda">Tocá un elemento del escenario para editarlo.</p>';

    const lienzo = document.createElement('div');
    lienzo.className = 'escenario-lienzo';
    lienzo.style.backgroundImage = `url('${sede.imagenFondo}')`;

    const zonaGuia = document.createElement('div');
    zonaGuia.className = 'escenario-zona-guia';
    zonaGuia.textContent = 'Zona del título — evitar tapar';
    lienzo.appendChild(zonaGuia);

    items.forEach((item) => {
      lienzo.appendChild(crearToken(item, lienzo, contenedorPanel, guardar));
    });

    contenedorLienzo.appendChild(lienzo);
    contenedorLienzo.appendChild(crearLeyenda());
  }

  function crearToken(item, lienzo, contenedorPanel, guardar) {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = `escenario-token escenario-token--plano-${item.profundidad || 3}`;
    token.style.left = `${item.x}%`;
    token.style.top = `${item.y}%`;
    token.textContent = ICONO[item._tipo] || '•';
    token.title = tituloDe(item);
    token.dataset.id = item.id;

    token.addEventListener('pointerdown', (eventoInicial) => {
      eventoInicial.preventDefault();
      seleccionar(item, token, contenedorPanel, guardar);
      token.setPointerCapture(eventoInicial.pointerId);

      const mover = (eventoMover) => {
        const rect = lienzo.getBoundingClientRect();
        let x = ((eventoMover.clientX - rect.left) / rect.width) * 100;
        let y = ((eventoMover.clientY - rect.top) / rect.height) * 100;
        x = Math.min(97, Math.max(3, Math.round(x)));
        y = Math.min(97, Math.max(3, Math.round(y)));
        token.style.left = `${x}%`;
        token.style.top = `${y}%`;
        item.x = x;
        item.y = y;
      };
      const soltar = () => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        guardar(item); // recién al soltar se persiste — evita escribir en cada pixel
      };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    });

    return token;
  }

  function seleccionar(item, token, contenedorPanel, guardar) {
    token.parentElement.querySelectorAll('.escenario-token--seleccionado').forEach((t) => t.classList.remove('escenario-token--seleccionado'));
    token.classList.add('escenario-token--seleccionado');
    pintarPanel(item, contenedorPanel, guardar);
  }

  function pintarPanel(item, contenedorPanel, guardar) {
    contenedorPanel.innerHTML = '';
    const titulo = document.createElement('h4');
    titulo.className = 'escenario-panel-titulo';
    titulo.textContent = tituloDe(item);
    contenedorPanel.appendChild(titulo);

    const formulario = Editor.crearFormulario(item, ESQUEMA_PANEL, () => guardar(item));
    contenedorPanel.appendChild(formulario);
  }

  function crearLeyenda() {
    const leyenda = document.createElement('p');
    leyenda.className = 'escenario-leyenda';
    leyenda.textContent = '💬 Testimonio · 🖼 Foto · 🎬 Video — arrastrá para reposicionar, tocá para editar profundidad, escala, rotación y orden.';
    return leyenda;
  }

  function tituloDe(item) {
    if (item._tipo === 'testimonio') return `Testimonio — ${item.nombreCompleto || '(sin nombre)'}`;
    return `${item._tipo === 'video' ? 'Video' : 'Foto'} — ${item.caption || item.src || '(sin nombre)'}`;
  }

  return { renderizar };
})();

window.Escenario = Escenario;
