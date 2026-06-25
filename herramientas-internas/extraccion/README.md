# Pipeline de extracción — guía de uso

Flujo completo (Documento Técnico, sección 22): PDF → extracción asistida →
revisión humana obligatoria → validación → publicación. Esta carpeta resuelve
los dos primeros pasos automatizables; los pasos de revisión y validación
final siguen siendo decisiones humanas, a propósito.

## 0. Instalación (una sola vez, en el equipo que procese los PDFs)

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-spa poppler-utils
pip install pdfplumber pytesseract pdf2image --break-system-packages
```

## 1. Generar un borrador por cada PDF nuevo

```bash
cd herramientas-internas/extraccion
python3 extraer_poster.py <ruta-al-pdf> <id-del-proyecto> --unidad <id-unidad> --anio <anio>
```

Esto crea `herramientas-internas/_borradores/<id-del-proyecto>.json` con
`estado_revision: "pendiente"`. **Nunca escribe directo en `data/proyectos/`.**

El extractor reconoce el formato real de los pósters (RESUMEN, PROBLEMA /
OBJETIVO en dos columnas, ACCIONES / RESULTADOS-APORTES en dos columnas,
DATOS | CONTACTO) y aplica OCR en español automáticamente si el PDF no tiene
texto seleccionable — lo cual, calibrando contra pósters reales, resultó ser
el camino casi exclusivo para la familia de plantilla "Semana Regional de la
Extensión": ver auditoría de calibración para el detalle. El OCR también
reconstruye columnas (ya no usa `image_to_string` plano de página completa).
También extrae `cita_destacada` (texto + fuente) y, cuando el póster trae un
sub-listado de "Objetivos específicos" dentro de la caja de OBJETIVO,
`objetivos_especificos`.

Aun así, **no es perfecto**: pósters con diseño distinto al esperado,
columnas desalineadas, nombres que envuelven en varias líneas, o calidad de
OCR baja van a producir campos vacíos, mezclados o con advertencias. Eso es
esperado, no un bug a perseguir — es la razón por la que el paso 2 es
obligatorio. Dos campos que el extractor TODAVÍA no completa nunca, sin
excepción, y que por eso quedan marcados en `_advertencias` en todos los
casos: `titulo` (no hay heurística de tamaño de fuente/encabezado implementada
todavía) e `imagenes` (no se extraen fotos automáticamente: ver propuesta de
extracción de imágenes en la auditoría de calibración para el camino dual
necesario — XObjects nativos vs. recorte de región sobre página rasterizada).

## 2. Revisión humana (siempre, sin excepción)

Abrí el JSON generado junto al PDF original y:
- Corregí cualquier campo cortado, mezclado o vacío.
- Completá `titulo`, `programa_carrera_area`, `resolucion`, `anio` (si no se
  pasó por línea de comando), `etiquetas` y `objetivos_especificos` — el
  extractor casi nunca puede completar estos con confianza.
- Normalizá `unidad_academica` e `instituciones_cooperantes` contra los ids
  de `data/categorias.json` (el extractor deja el texto libre original en
  `_instituciones_cooperantes_texto_sin_normalizar` como referencia).
- Revisá especialmente cualquier campo señalado en `_advertencias`.
- Cuando el campo esté listo de verdad, borrá los campos que empiezan con
  `_` (son solo ayuda para la revisión) o dejalos: `promover_borrador.py` los
  quita automáticamente.
- Cambiá `"estado_revision": "pendiente"` a `"estado_revision": "validado"`.

## 3. Promover el borrador ya validado

```bash
python3 promover_borrador.py <id-del-proyecto>
```

Si falta algo obligatorio, o si `estado_revision` no es `"validado"`, no
promueve nada y dice exactamente qué falta. Si todo está bien, crea
`data/proyectos/<id-del-proyecto>.json` y agrega la entrada liviana
correspondiente en `data/catalog.json`.

## 4. Validar el lote completo antes de desplegar

```bash
cd ../..
node herramientas-internas/validar-datos.js
```

Repetir los pasos 1 a 3 por cada PDF. Para ~130 proyectos, conviene hacerlo
por tandas (ver Documento Técnico, sección 12) y dejar `validar-datos.js`
como el último paso antes de cada despliegue, no solo al final de todo.
