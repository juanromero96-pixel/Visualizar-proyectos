/**
 * servicios/multimedia.servicio.js — DTC cap.6, DTI §11.4
 * ═══════════════════════════════════════════════════════════════════════════
 * Pesos máximos por categoría, tal como DTC §6.2 los especifica:
 *   fondos 400 KB · retratos 80 KB · UA y fotos 200 KB · miniaturas 40 KB
 * Anchos de variante, también de DTC §6.2.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { escribirAtomico, escribirJSONAtomico, leerJSON, existe } = require('../util/escrituraAtomica');
const { verificarImagenReal, generarVariantes, generarMiniatura, nombreNormalizado, hashArchivo } = require('../util/imagenes');

const CATEGORIAS = Object.freeze({
  backgrounds: { anchos: [1920, 2560], pesoMaximoKB: 400 },
  personas:    { anchos: [400, 800],   pesoMaximoKB: 80 },
  ua:          { anchos: [800, 1600],  pesoMaximoKB: 200 },
  photos:      { anchos: [800, 1600],  pesoMaximoKB: 200 },
  logos:       { anchos: null,         pesoMaximoKB: 50 }, // sin variantes: se preserva tal cual (SVG preferente)
  icons:       { anchos: null,         pesoMaximoKB: 50 },
});

class MultimediaServicio {
  constructor(rutaAlmacen) {
    this.rutaAlmacen = rutaAlmacen;
  }

  _rutaAssets(anio) { return path.join(this.rutaAlmacen, 'ediciones', String(anio), 'assets'); }
  _rutaOriginales(anio) { return path.join(this.rutaAlmacen, 'ediciones', String(anio), '_originales'); }

  async subir({ anio, categoria, identificador, buffer, nombreOriginal }) {
    if (!CATEGORIAS[categoria]) throw new Error(`Categoría desconocida: ${categoria}`);
    const cfg = CATEGORIAS[categoria];

    const metadatos = await verificarImagenReal(buffer); // lanza si no es imagen real (DTC §11.4)
    const extensionOriginal = metadatos.format === 'jpeg' ? 'jpg' : metadatos.format;

    const dirCategoria = path.join(this._rutaAssets(anio), categoria);
    await fsp.mkdir(dirCategoria, { recursive: true });
    await fsp.mkdir(this._rutaOriginales(anio), { recursive: true });

    // El original se conserva SIN modificar (DTC §6.3: "el original nunca se descarta").
    const nombreOrig = nombreNormalizado(categoria, identificador, 'original', extensionOriginal);
    await escribirAtomico(path.join(this._rutaOriginales(anio), nombreOrig), buffer);

    const resultado = { categoria, identificador, original: nombreOrig, variantes: {}, pesoOriginalKB: Math.round(buffer.length / 1024) };

    if (cfg.anchos) {
      // Optimización automática a WebP en los anchos definidos (DTC §6.3).
      const variantes = await generarVariantes(buffer, cfg.anchos);
      for (const [ancho, datosVariante] of Object.entries(variantes)) {
        const nombre = nombreNormalizado(categoria, identificador, ancho, 'webp');
        await escribirAtomico(path.join(dirCategoria, nombre), datosVariante);
        resultado.variantes[ancho] = { nombre, pesoKB: Math.round(datosVariante.length / 1024) };
      }
      const miniatura = await generarMiniatura(buffer);
      const nombreMin = nombreNormalizado(categoria, identificador, 'thumb', 'webp');
      await escribirAtomico(path.join(dirCategoria, nombreMin), miniatura);
      resultado.miniatura = { nombre: nombreMin, pesoKB: Math.round(miniatura.length / 1024) };
      resultado.rutaPrincipal = `assets/${categoria}/${nombreNormalizado(categoria, identificador, cfg.anchos[cfg.anchos.length - 1], 'webp')}`;
    } else {
      // Logos/íconos: se preserva el archivo tal cual subido (sin recomprimir),
      // pero SIEMPRE renombrado (DTC §11.2, corrección del hallazgo de nombres).
      const nombre = nombreNormalizado(categoria, identificador, null, extensionOriginal);
      await escribirAtomico(path.join(dirCategoria, nombre), buffer);
      resultado.rutaPrincipal = `assets/${categoria}/${nombre}`;
      if (Math.round(buffer.length / 1024) > cfg.pesoMaximoKB) {
        resultado.advertenciaPeso = `${Math.round(buffer.length / 1024)} KB supera el máximo recomendado de ${cfg.pesoMaximoKB} KB`;
      }
    }

    await this._registrarInventario(anio, resultado);
    return resultado;
  }

  async _rutaInventario(anio) { return path.join(this._rutaAssets(anio), '_inventario.json'); }

  async _registrarInventario(anio, entrada) {
    const ruta = await this._rutaInventario(anio);
    const inventario = (await existe(ruta)) ? await leerJSON(ruta) : [];
    const idx = inventario.findIndex((e) => e.categoria === entrada.categoria && e.identificador === entrada.identificador);
    const registro = { ...entrada, actualizado: new Date().toISOString() };
    if (idx >= 0) inventario[idx] = registro; else inventario.push(registro);
    await escribirJSONAtomico(ruta, inventario);
  }

  async listarInventario(anio) {
    const ruta = await this._rutaInventario(anio);
    return (await existe(ruta)) ? leerJSON(ruta) : [];
  }

  /** Activos huérfanos: existen en el inventario pero ningún elemento del corpus los referencia (DTC §6.5). */
  async encontrarHuerfanos(anio, edicionesRepo) {
    const inventario = await this.listarInventario(anio);
    const referenciados = new Set();
    for (const tipo of ['testimonios', 'registros', 'multimedia', 'sedes']) {
      const datos = await edicionesRepo.leerCorpus(anio, tipo).catch(() => []);
      datos.forEach((el) => {
        ['foto', 'imagenPortada', 'imagenFondo'].forEach((campo) => {
          if (el[campo]) referenciados.add(el[campo]);
        });
      });
    }
    return inventario.filter((e) => !referenciados.has(e.rutaPrincipal));
  }

  async eliminar(anio, categoria, identificador) {
    const ruta = await this._rutaInventario(anio);
    const inventario = (await existe(ruta)) ? await leerJSON(ruta) : [];
    const entrada = inventario.find((e) => e.categoria === categoria && e.identificador === identificador);
    if (!entrada) throw new Error('Activo no encontrado en el inventario');

    const dirCategoria = path.join(this._rutaAssets(anio), categoria);
    const archivos = [entrada.original, entrada.miniatura?.nombre, ...Object.values(entrada.variantes || {}).map((v) => v.nombre)].filter(Boolean);
    for (const nombre of archivos) {
      await fsp.rm(path.join(dirCategoria, nombre)).catch(() => {});
      await fsp.rm(path.join(this._rutaOriginales(anio), nombre)).catch(() => {});
    }
    await escribirJSONAtomico(ruta, inventario.filter((e) => e !== entrada));
    return { eliminado: identificador };
  }
}

module.exports = { MultimediaServicio, CATEGORIAS };
