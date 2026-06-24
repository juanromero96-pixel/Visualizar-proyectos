#!/usr/bin/env node
/**
 * validar-datos.js
 * Herramienta interna — NO se publica en el sitio (vive fuera de lo que
 * se sube al hosting estático). Valida data/catalog.json,
 * data/categorias.json y cada ficha en data/proyectos/ contra las
 * reglas mínimas del Documento Técnico (sección 23: criterios de
 * validación de datos).
 *
 * Uso:
 *   node herramientas-internas/validar-datos.js
 *
 * Código de salida: 0 si no hay errores bloqueantes, 1 si hay al menos
 * uno. Las advertencias no bloquean la publicación pero se listan
 * igual: son señales de que conviene revisar el dato a mano.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RUTA_CATALOGO = path.join(RAIZ, 'data', 'catalog.json');
const RUTA_CATEGORIAS = path.join(RAIZ, 'data', 'categorias.json');
const DIR_PROYECTOS = path.join(RAIZ, 'data', 'proyectos');

const CAMPOS_OBLIGATORIOS = [
  'id', 'titulo', 'unidad_academica', 'programa_carrera_area',
  'resumen', 'problema', 'objetivo_general', 'acciones',
  'resultados_aportes', 'responsables', 'contacto', 'anio',
  'etiquetas', 'estado_revision',
];

const ARRAYS_NO_VACIOS = ['acciones', 'resultados_aportes', 'responsables', 'etiquetas'];
const ESTADOS_VALIDOS = ['pendiente', 'en_revision', 'validado', 'publicado', 'archivado'];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errores = [];
const advertencias = [];

function leerJSON(ruta) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

function validarFichaDeDetalle(proyecto, etiquetaArchivo, unidadesValidas, institucionesValidas) {
  CAMPOS_OBLIGATORIOS.forEach((campo) => {
    const valor = proyecto[campo];
    const ausente = valor === undefined || valor === null || valor === '';
    if (ausente) {
      errores.push(`${etiquetaArchivo}: falta el campo obligatorio "${campo}".`);
    }
  });

  ARRAYS_NO_VACIOS.forEach((campo) => {
    const valor = proyecto[campo];
    if (Array.isArray(valor) && valor.length === 0) {
      errores.push(`${etiquetaArchivo}: "${campo}" está presente pero vacío.`);
    }
  });

  if (proyecto.anio !== undefined && (!Number.isInteger(proyecto.anio) || proyecto.anio < 1990 || proyecto.anio > 2100)) {
    errores.push(`${etiquetaArchivo}: "anio" (${proyecto.anio}) no parece un año válido.`);
  }

  if (proyecto.estado_revision && !ESTADOS_VALIDOS.includes(proyecto.estado_revision)) {
    errores.push(`${etiquetaArchivo}: "estado_revision" (${proyecto.estado_revision}) no es uno de: ${ESTADOS_VALIDOS.join(', ')}.`);
  }

  if (proyecto.contacto && !REGEX_EMAIL.test(proyecto.contacto)) {
    advertencias.push(`${etiquetaArchivo}: "contacto" (${proyecto.contacto}) no parece un email válido.`);
  }

  if (proyecto.unidad_academica && !unidadesValidas.has(proyecto.unidad_academica)) {
    errores.push(`${etiquetaArchivo}: unidad_academica "${proyecto.unidad_academica}" no existe en categorias.json.`);
  }

  (proyecto.instituciones_cooperantes || []).forEach((id) => {
    if (!institucionesValidas.has(id)) {
      advertencias.push(`${etiquetaArchivo}: institución cooperante "${id}" no está en el catálogo controlado de categorias.json.`);
    }
  });

  (proyecto.imagenes || []).forEach((imagen, indice) => {
    if (!imagen.alt) {
      advertencias.push(`${etiquetaArchivo}: la imagen #${indice + 1} no tiene texto alternativo (alt).`);
    }
  });

  if (proyecto.estado_revision && proyecto.estado_revision !== 'publicado') {
    advertencias.push(`${etiquetaArchivo}: estado_revision es "${proyecto.estado_revision}" — no debería tener una entrada en catalog.json hasta llegar a "publicado".`);
  }
}

function main() {
  if (!fs.existsSync(RUTA_CATALOGO) || !fs.existsSync(RUTA_CATEGORIAS)) {
    console.error('No se encontró data/catalog.json o data/categorias.json.');
    process.exit(1);
  }

  const catalogo = leerJSON(RUTA_CATALOGO);
  const categorias = leerJSON(RUTA_CATEGORIAS);
  const unidadesValidas = new Set(categorias.unidades_academicas.map((u) => u.id));
  const institucionesValidas = new Set(categorias.instituciones_cooperantes.map((i) => i.id));

  const idsCatalogo = new Set();

  catalogo.forEach((entrada, indice) => {
    const etiqueta = `catalog.json[${indice}] (${entrada.id || 'sin id'})`;

    if (!entrada.id) {
      errores.push(`${etiqueta}: falta "id".`);
      return;
    }

    if (idsCatalogo.has(entrada.id)) {
      errores.push(`${etiqueta}: id duplicado dentro de catalog.json.`);
    }
    idsCatalogo.add(entrada.id);

    if (entrada.unidad_academica && !unidadesValidas.has(entrada.unidad_academica)) {
      errores.push(`${etiqueta}: unidad_academica "${entrada.unidad_academica}" no existe en categorias.json.`);
    }

    const rutaDetalle = path.join(DIR_PROYECTOS, `${entrada.id}.json`);
    if (!fs.existsSync(rutaDetalle)) {
      errores.push(`${etiqueta}: no existe data/proyectos/${entrada.id}.json.`);
    }
  });

  const archivosProyectos = fs.existsSync(DIR_PROYECTOS)
    ? fs.readdirSync(DIR_PROYECTOS).filter((archivo) => archivo.endsWith('.json'))
    : [];

  archivosProyectos.forEach((archivo) => {
    const ruta = path.join(DIR_PROYECTOS, archivo);
    const proyecto = leerJSON(ruta);
    const idEsperado = archivo.replace(/\.json$/, '');
    const etiquetaArchivo = `data/proyectos/${archivo}`;

    if (proyecto.id !== idEsperado) {
      errores.push(`${etiquetaArchivo}: el campo "id" ("${proyecto.id}") no coincide con el nombre del archivo.`);
    }

    if (!idsCatalogo.has(idEsperado)) {
      advertencias.push(`${etiquetaArchivo}: existe la ficha de detalle pero no aparece en catalog.json (no se mostrará en el sitio).`);
    }

    validarFichaDeDetalle(proyecto, etiquetaArchivo, unidadesValidas, institucionesValidas);
  });

  console.log(`Proyectos en catalog.json: ${catalogo.length}`);
  console.log(`Fichas de detalle encontradas: ${archivosProyectos.length}`);
  console.log('');

  if (advertencias.length) {
    console.log(`Advertencias (${advertencias.length}):`);
    advertencias.forEach((a) => console.log(`  - ${a}`));
    console.log('');
  }

  if (errores.length) {
    console.log(`Errores (${errores.length}):`);
    errores.forEach((e) => console.log(`  - ${e}`));
    console.log('');
    console.log('Validación FALLIDA. Corregí los errores antes de publicar.');
    process.exit(1);
  }

  console.log('Validación OK. No se encontraron errores bloqueantes.');
  process.exit(0);
}

main();
