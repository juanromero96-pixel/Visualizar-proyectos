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

  /**
   * INTEGRACIÓN CON EL BACKEND (DTI §12.2) — único punto de integración del
   * frontend con el nuevo backend. Orden de resolución:
   *   1. localStorage — solo en panel o ?preview=1 (sin cambios, C-06 arriba)
   *   2. Backend — GET /api/v1/ediciones/activa/corpus/:nombre
   *   3. data/*.json — respaldo estático si el backend no responde
   *
   * El paso 3 es deliberado: "si el backend cae, el mural sigue funcionando
   * con la última copia estática. Es una degradación elegante que conviene
   * conservar" (DTI §12.2). Por eso el timeout es corto (2s): un backend
   * caído no debe demorar perceptiblemente la carga del mural.
   */
  const RUTA_API_BASE = '/api/v1/ediciones/activa/corpus/';
  const TIMEOUT_API_MS = 2000;

  async function _intentarBackend(nombre) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIMEOUT_API_MS);
    try {
      const respuesta = await fetch(RUTA_API_BASE + nombre, { signal: control.signal });
      if (!respuesta.ok) return null; // 404 (sin edición publicada), 5xx, etc. → caer al estático
      const datos = await respuesta.json();
      // Mismo criterio de validación que el resto del módulo (C-02): un
      // backend que respondiera con una forma inesperada no debe usarse.
      if (!validarEsquema(nombre, datos)) {
        console.warn(`La respuesta del backend para "${nombre}" no superó la validación de esquema; se usa el archivo estático.`);
        return null;
      }
      return datos;
    } catch (error) {
      // Backend inalcanzable, timeout, o red caída: silencioso a propósito.
      // No es un error del sitio — es el camino esperado mientras no haya
      // backend desplegado, o durante una caída temporal.
      return null;
    } finally {
      clearTimeout(temporizador);
    }
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

    // Paso 2 (DTI §12.2): backend, si responde y valida.
    if (!debePriorizarLocal()) { // en el panel/preview, el flujo de edición no pasa por acá
      const desdeBackend = await _intentarBackend(nombre);
      if (desdeBackend !== null) return desdeBackend;
    }

    // Paso 3: respaldo estático — comportamiento previo a esta integración,
    // sin cambios, y el único camino si el backend no está desplegado todavía.
    const respuesta = await fetch(`data/${nombre}.json`);
    if (!respuesta.ok) {
      throw new Error(`No se pudo cargar data/${nombre}.json (${respuesta.status})`);
    }
    return respuesta.json();
  }

  function guardar(nombre, datos) {
    localStorage.setItem(PREFIJO + nombre, JSON.stringify(datos));
  }

  /**
   * Persiste en el BACKEND real (DTI §6.3: PUT /ediciones/:anio/corpus/:tipo).
   * Es aditiva respecto de guardar(): localStorage sigue siendo el borrador
   * instantáneo del panel (comportamiento sin cambios); esta función es el
   * "confirmar al servidor" que corresponde al flujo editorial de DTC cap.3.
   * Devuelve { ok, motivo } en vez de lanzar, porque el panel debe poder
   * mostrar el error sin romper el resto de la edición en curso.
   */
  async function guardarEnBackend(anio, nombre, datos) {
    try {
      const resp = await fetch(`/api/v1/ediciones/${anio}/corpus/${nombre}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      if (resp.status === 401) return { ok: false, motivo: 'SESION_EXPIRADA' };
      if (resp.status === 409) return { ok: false, motivo: 'BLOQUEO_ACTIVO' };
      if (resp.status === 423 || resp.status === 409) return { ok: false, motivo: 'EDICION_CONGELADA' };
      if (!resp.ok) {
        const cuerpo = await resp.json().catch(() => ({}));
        return { ok: false, motivo: cuerpo.error || 'ERROR_SERVIDOR', detalle: cuerpo.detalle };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: 'BACKEND_INALCANZABLE', error: error.message };
    }
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

  return { cargar, guardar, guardarEnBackend, restablecer, tieneCambiosLocales, descargar, importar, validarEsquema };
})();

window.Almacen = Almacen;
