/**
 * editor.js
 * -----------------------------------------------------------------------
 * Construye formularios editables a partir de un objeto + un esquema de
 * campos. Lo usa admin.js para no repetir el mismo código de formulario
 * para sedes, testimonios y multimedia.
 */
const Editor = (() => {
  function crearFormulario(item, esquema, alCambiar) {
    const formulario = document.createElement('form');
    formulario.className = 'formulario-item';
    formulario.addEventListener('submit', (e) => e.preventDefault());

    esquema.forEach((campo) => {
      formulario.appendChild(crearCampo(item, campo, alCambiar));
    });

    return formulario;
  }

  function crearCampo(item, campo, alCambiar) {
    const grupo = document.createElement('div');
    grupo.className = `campo campo--${campo.tipo}`;

    const id = `campo-${item.id}-${campo.clave}`;
    const etiqueta = document.createElement('label');
    etiqueta.setAttribute('for', id);
    etiqueta.textContent = campo.etiqueta;
    grupo.appendChild(etiqueta);

    const control = crearControl(item, campo, id, alCambiar);
    grupo.appendChild(control);

    if (campo.ayuda) {
      const ayuda = document.createElement('small');
      ayuda.className = 'campo-ayuda';
      ayuda.textContent = campo.ayuda;
      grupo.appendChild(ayuda);
    }

    return grupo;
  }

  function crearControl(item, campo, id, alCambiar) {
    let control;

    switch (campo.tipo) {
      case 'textarea':
        control = document.createElement('textarea');
        control.rows = campo.filas || 3;
        control.value = item[campo.clave] ?? '';
        control.addEventListener('input', () => {
          item[campo.clave] = control.value;
          alCambiar(item);
        });
        break;

      case 'select':
        control = document.createElement('select');
        campo.opciones.forEach((opcion) => {
          const elOpcion = document.createElement('option');
          elOpcion.value = opcion.valor;
          elOpcion.textContent = opcion.etiqueta;
          // Comparación tolerante: el dato puede venir como número (3) y la
          // opción como string ('3') — con === estricto nunca matchearían.
          if (String(item[campo.clave]) === String(opcion.valor)) elOpcion.selected = true;
          control.appendChild(elOpcion);
        });
        control.addEventListener('change', () => {
          item[campo.clave] = control.value;
          alCambiar(item);
        });
        break;

      case 'checkbox':
        control = document.createElement('input');
        control.type = 'checkbox';
        control.checked = !!item[campo.clave];
        control.addEventListener('change', () => {
          item[campo.clave] = control.checked;
          alCambiar(item);
        });
        break;

      case 'number':
        control = document.createElement('input');
        control.type = 'number';
        control.value = item[campo.clave] ?? 0;
        if (campo.min !== undefined) control.min = campo.min;
        if (campo.max !== undefined) control.max = campo.max;
        if (campo.paso !== undefined) control.step = campo.paso;
        control.addEventListener('input', () => {
          item[campo.clave] = Number(control.value);
          alCambiar(item);
        });
        break;

      case 'archivo':
        control = document.createElement('input');
        control.type = 'file';
        control.accept = campo.aceptar || 'image/*';
        control.addEventListener('change', () => {
          const archivo = control.files[0];
          if (!archivo) return;
          // No hay backend: no se puede guardar el archivo en ningún lado
          // persistente desde el navegador. Lo único honesto que se puede
          // hacer es sugerir, en el campo de texto real (campo.objetivo),
          // la ruta donde debería quedar el archivo una vez copiado a mano
          // dentro de /assets. No se guarda ningún blob: URL en el JSON
          // porque deja de ser válido apenas se cierra la pestaña.
          const claveDestino = campo.objetivo || campo.clave;
          item[claveDestino] = `${campo.rutaSugerida || 'assets/'}${archivo.name}`;
          alCambiar(item, { regenerar: true });
        });
        break;

      default:
        control = document.createElement('input');
        control.type = 'text';
        control.value = item[campo.clave] ?? '';
        control.addEventListener('input', () => {
          item[campo.clave] = control.value;
          alCambiar(item);
        });
    }

    control.id = id;
    control.name = campo.clave;
    return control;
  }

  return { crearFormulario };
})();

window.Editor = Editor;
