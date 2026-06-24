/**
 * utils.js
 * Helpers genéricos y pequeños, sin conocimiento del dominio. Se crea
 * recién ahora porque recién ahora hace falta (debounce para la
 * búsqueda en vivo); no se agregan helpers especulativos sin uso.
 */

/**
 * Devuelve una versión de `fn` que solo se ejecuta una vez que pasaron
 * `espera` ms desde la última vez que se la llamó. Se usa en la
 * búsqueda en vivo para no re-renderizar (y re-animar con GSAP) en
 * cada tecla mientras la persona todavía está escribiendo.
 */
export function debounce(fn, espera = 200) {
  let temporizador = null;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), espera);
  };
}
