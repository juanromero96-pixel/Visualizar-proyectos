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

  /**
   * C-06 · ¿Corresponde priorizar localStorage sobre los archivos del repo?
   *
   * Antes se priorizaba siempre, lo que abría un vector de inyección
   * persistente (hallazgo H-02 de la auditoría): un JSON malicioso importado
   * por el panel quedaba en localStorage y el sitio PÚBLICO lo servía.
   *
   * Ahora solo se prioriza en dos contextos legítimos:
   *   · el propio panel de administración (admin.html);
   *   · una previsualización explícita con ?preview=1.
   * El sitio público lee exclusivamente de data/*.json.
   *
   * Efecto secundario deseable: resuelve el problema operativo de que un
   * administrador viera una versión distinta de la que ven los visitantes.
   */
  function debePriorizarLocal() {
    try {
      const esPanel = /\/admin(\.html)?$/.test(location.pathname);
      const esPreview = /(?:^|[?&])preview=1(?:&|$)/.test(location.search);
      return esPanel || esPreview;
    } catch (e) { return false; }
  }

  async function cargar(nombre) {
    const clave = PREFIJO + nombre;
    const guardado = debePriorizarLocal() ? localStorage.getItem(clave) : null;
    if (guardado) {
      try {
        const datos = JSON.parse(guardado);
        // C-02 · Incluso en el panel se valida el esquema: un localStorage
        // contaminado por otra vía no debe pasar sin control.
        if (!validarEsquema(nombre, datos)) {
          console.warn(`El dato local de "${nombre}" no supera la validación de esquema; se usa el archivo original.`);
        } else {
          return datos;
        }
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

  /**
   * C-02 · Validación de esquema (hallazgo H-02).
   * Antes, importar() aceptaba cualquier JSON sintácticamente válido y lo
   * escribía en localStorage sin control. Combinado con la interpolación sin
   * escapar de app.js, permitía inyección persistente.
   *
   * La validación es de lista blanca: estructura esperada, tipos, longitudes
   * máximas y rechazo de claves peligrosas. No pretende validar la semántica
   * editorial, solo impedir estructuras que el motor no espera.
   */
  const LIMITES = Object.freeze({
    MAX_ELEMENTOS: 500,       // techo generoso: el corpus real tiene 46
    MAX_TEXTO: 8000,          // ningún campo editorial legítimo lo supera
    MAX_PROFUNDIDAD: 8,
    CLAVES_PROHIBIDAS: ['__proto__', 'constructor', 'prototype'],
  });

  /** Recorre la estructura verificando profundidad, tipos y claves. */
  function estructuraSegura(valor, profundidad = 0) {
    if (profundidad > LIMITES.MAX_PROFUNDIDAD) return false;
    if (valor === null || typeof valor === 'boolean' || typeof valor === 'number') return true;
    if (typeof valor === 'string') return valor.length <= LIMITES.MAX_TEXTO;
    if (Array.isArray(valor)) {
      if (valor.length > LIMITES.MAX_ELEMENTOS) return false;
      return valor.every((v) => estructuraSegura(v, profundidad + 1));
    }
    if (typeof valor === 'object') {
      const claves = Object.keys(valor);
      if (claves.length > 200) return false;
      for (const k of claves) {
        if (LIMITES.CLAVES_PROHIBIDAS.includes(k)) return false;
        if (k.length > 120) return false;
        if (!estructuraSegura(valor[k], profundidad + 1)) return false;
      }
      return true;
    }
    return false;   // función, símbolo, undefined: no admisibles en JSON
  }

  /** Forma esperada por nombre de corpus. */
  const FORMA = Object.freeze({
    sedes:        'array',
    testimonios:  'array',
    registros:    'array',
    multimedia:   'array',
    escenas:      'any',
    config:       'objeto',
  });

  function validarEsquema(nombre, datos) {
    if (!estructuraSegura(datos)) return false;
    const forma = FORMA[nombre] || 'any';
    if (forma === 'array'  && !Array.isArray(datos)) return false;
    if (forma === 'objeto' && (typeof datos !== 'object' || Array.isArray(datos) || datos === null)) return false;
    return true;
  }

  function importar(archivo, nombre) {
    return new Promise((resolve, reject) => {
      // Techo de tamaño: un JSON editorial legítimo no supera 1 MB.
      if (archivo && archivo.size > 1024 * 1024) {
        reject(new Error('El archivo supera 1 MB; no parece un JSON editorial.'));
        return;
      }
      const lector = new FileReader();
      lector.onload = () => {
        try {
          const datos = JSON.parse(lector.result);
          if (!validarEsquema(nombre, datos)) {
            reject(new Error('El archivo no tiene la estructura esperada para "' + nombre + '".'));
            return;
          }
          resolve(datos);
        } catch (error) {
          reject(error);
        }
      };
      lector.onerror = reject;
      lector.readAsText(archivo);
    });
  }

  return { cargar, guardar, restablecer, tieneCambiosLocales, descargar, importar, validarEsquema };
})();

window.Almacen = Almacen;
