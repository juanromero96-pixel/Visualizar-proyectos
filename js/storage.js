/**
 * storage.js
 * -----------------------------------------------------------------------
 * No hay backend ni base de datos: los datos "viven" en los archivos
 * /data/*.json. Un sitio estático no puede escribir en disco desde el
 * navegador, así que el panel de administración guarda los cambios en
 * localStorage (instantáneo, dentro del mismo navegador) y permite
 * exportar el JSON actualizado para reemplazar el archivo original.
 *
 * Flujo real de uso:
 *   1. El admin edita contenido -> se guarda en localStorage al instante.
 *   2. index.html siempre revisa primero localStorage; si no hay nada
 *      guardado ahí, usa el archivo /data/*.json de toda la vida.
 *   3. Cuando el contenido queda como se quiere, se exporta el JSON desde
 *      el panel y se reemplaza el archivo en /data para que el cambio
 *      sea visible para cualquier persona que abra el sitio, no solo en
 *      el navegador donde se editó.
 */
const Almacen = (() => {
  const PREFIJO = 'unam_semana_regional_';

  async function cargar(nombre) {
    const clave = PREFIJO + nombre;
    const guardado = localStorage.getItem(clave);
    if (guardado) {
      try {
        return JSON.parse(guardado);
      } catch (error) {
        console.warn(`No se pudo leer el dato local de "${nombre}", se usa el archivo original.`, error);
      }
    }
    const respuesta = await fetch(`data/${nombre}.json`);
    if (!respuesta.ok) {
      throw new Error(`No se pudo cargar data/${nombre}.json (${respuesta.status})`);
    }
    return respuesta.json();
  }

  function guardar(nombre, datos) {
    localStorage.setItem(PREFIJO + nombre, JSON.stringify(datos));
  }

  function restablecer(nombre) {
    localStorage.removeItem(PREFIJO + nombre);
  }

  function tieneCambiosLocales(nombre) {
    return localStorage.getItem(PREFIJO + nombre) !== null;
  }

  function descargar(nombre, datos) {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${nombre}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  }

  function importar(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => {
        try {
          resolve(JSON.parse(lector.result));
        } catch (error) {
          reject(error);
        }
      };
      lector.onerror = reject;
      lector.readAsText(archivo);
    });
  }

  return { cargar, guardar, restablecer, tieneCambiosLocales, descargar, importar };
})();

window.Almacen = Almacen;
