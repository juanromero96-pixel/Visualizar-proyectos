#!/usr/bin/env python3
"""
extraer_poster.py
Herramienta interna — NO se publica en el sitio. Implementa la
estrategia híbrida de extracción descripta en el Documento Técnico,
sección 13: texto nativo -> OCR de respaldo -> segmentación por
encabezados de sección -> SIEMPRE termina en un borrador "pendiente",
nunca en una ficha publicada directamente.

Esta herramienta NO inventa contenido. Si no puede extraer un campo con
confianza, lo deja vacío y lo anota en "_advertencias" para que la
persona revisora lo complete a mano. El resultado es siempre un
BORRADOR (carpeta herramientas-internas/_borradores/), nunca se escribe
directo en data/proyectos/.

Requisitos del sistema (instalar una sola vez en el equipo que procese
los PDFs, no en el hosting del sitio público):
  sudo apt-get install tesseract-ocr tesseract-ocr-spa poppler-utils
  pip install pdfplumber pytesseract pdf2image --break-system-packages

Uso:
  python3 extraer_poster.py <ruta_al_pdf> <id_proyecto> --unidad <id_unidad>

Ejemplo:
  python3 extraer_poster.py \\
      ../../pdf-fuente/fcf-nuevo-proyecto-2026.pdf \\
      fcf-nuevo-proyecto-2026 \\
      --unidad fcf --anio 2026

Salida:
  herramientas-internas/_borradores/<id_proyecto>.json
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# Ruta a la carpeta bin/ de Poppler, SOLO si depender del PATH del
# sistema no funciona (típicamente en Windows: el PATH de usuario no
# siempre se propaga a una terminal ya abierta, ni siquiera a una
# nueva, hasta reiniciar). Si no se define, se usa el PATH normal
# (lo que ya funciona en Mac/Linux con poppler-utils instalado por
# apt/brew) — no cambia nada para quien ya le funcionaba.
#
# Para usarla, antes de correr el servidor, en la misma terminal:
#   set RUTA_POPPLER=C:\poppler-26.02.0\Library\bin
#   python3 admin\server.py
# (con "set", no "setx": así toma efecto inmediato en esa terminal,
# sin reiniciar nada ni depender de que Windows guarde la variable.)
# Mismo mecanismo que RUTA_POPPLER, para tesseract.exe:
#   set RUTA_TESSERACT=C:\Program Files\Tesseract-OCR\tesseract.exe
RUTA_POPPLER = os.environ.get('RUTA_POPPLER') or None
RUTA_TESSERACT = os.environ.get('RUTA_TESSERACT') or None

try:
    import pdfplumber
except ImportError:
    sys.exit('Falta pdfplumber. Instalá con: pip install pdfplumber --break-system-packages')

UMBRAL_TEXTO_NATIVO = 200  # caracteres; por debajo de esto, se asume que hace falta OCR

# Pares de encabezados que, observados en la misma línea visual, indican
# el inicio de un bloque de DOS columnas en la plantilla real de los
# pósters (PROBLEMA junto a OBJETIVO, ACCIONES junto a RESULTADOS/APORTES).
# Esto es deliberadamente específico a esta plantilla institucional, no
# un detector genérico de columnas: un detector genérico es un problema
# mucho más difícil y, para una plantilla semi-fija como esta, no aporta
# más confiabilidad que aprovechar la estructura ya conocida.
PARES_ENCABEZADO_DOS_COLUMNAS = [('PROBLEMA', 'OBJETIVO'), ('ACCIONES', 'RESULTADOS')]

# Encabezados de sección tal como aparecen en la plantilla real de los
# pósters (ver Documento Técnico, sección 13.1). Cada uno admite algunas
# variantes de escritura observadas o esperables.
PATRONES_SECCION = [
    ('resumen', r'RESUMEN'),
    ('problema', r'PROBLEMA'),
    ('objetivo_general', r'OBJETIVO(?:S)?'),
    ('acciones', r'ACCIONES'),
    ('resultados_aportes', r'RESULTADOS\s*[/\|]?\s*Y?\s*APORTES'),
    ('contacto_bloque', r'DATOS\s*[\|/]?\s*CONTACTO'),
]


def _agrupar_en_lineas(palabras):
    """Agrupa palabras (con bounding box) en líneas por posición vertical."""
    palabras = sorted(palabras, key=lambda p: (round(p['top']), p['x0']))
    lineas = []
    actual = []
    top_actual = None
    for palabra in palabras:
        if top_actual is None or abs(palabra['top'] - top_actual) <= 3:
            actual.append(palabra)
            top_actual = palabra['top'] if top_actual is None else top_actual
        else:
            lineas.append(actual)
            actual = [palabra]
            top_actual = palabra['top']
    if actual:
        lineas.append(actual)
    for linea in lineas:
        linea.sort(key=lambda p: p['x0'])
    return lineas


def _texto_pagina_consciente_de_columnas(pagina):
    """
    Reconstruye el texto de una página respetando los bloques de dos
    columnas conocidos de la plantilla (ver PARES_ENCABEZADO_DOS_COLUMNAS).
    Fuera de esos bloques, el texto se devuelve en orden normal de
    lectura (como pdfplumber.extract_text()).

    Importante: esta reconstrucción reduce, pero no elimina, la mezcla
    entre columnas cuando una columna tiene líneas más largas que la
    otra. Por eso cada borrador queda marcado "pendiente" y el texto
    completo extraído se conserva en "_texto_completo_extraido": la
    persona revisora siempre puede cotejar contra el PDF original.
    """
    palabras = pagina.extract_words(keep_blank_chars=False)
    if not palabras:
        return ''
    lineas = _agrupar_en_lineas(palabras)

    bloques = []
    for indice, linea in enumerate(lineas):
        textos = [p['text'].upper().strip(':') for p in linea]
        for izquierda, derecha in PARES_ENCABEZADO_DOS_COLUMNAS:
            if izquierda in textos and derecha in textos:
                indice_derecha = textos.index(derecha)
                split_x = linea[indice_derecha]['x0'] - 5
                bloques.append([indice, split_x, None])

    for i in range(len(bloques)):
        bloques[i][2] = bloques[i + 1][0] if i + 1 < len(bloques) else len(lineas)

    salida = []
    indice_linea = 0
    while indice_linea < len(lineas):
        bloque = next((b for b in bloques if b[0] == indice_linea), None)
        if bloque:
            _, split_x, fin = bloque
            buffer_izquierdo, buffer_derecho = [], []
            for linea in lineas[indice_linea:fin]:
                izq = ' '.join(p['text'] for p in linea if p['x0'] < split_x)
                der = ' '.join(p['text'] for p in linea if p['x0'] >= split_x)
                if izq.strip():
                    buffer_izquierdo.append(izq.strip())
                if der.strip():
                    buffer_derecho.append(der.strip())
            salida.extend(buffer_izquierdo)
            salida.extend(buffer_derecho)
            indice_linea = fin
        else:
            salida.append(' '.join(p['text'] for p in lineas[indice_linea]))
            indice_linea += 1

    return '\n'.join(salida)


def extraer_texto_nativo(ruta_pdf):
    """Nivel 1: texto seleccionable, vía pdfplumber, con reconstrucción
    de columnas para los bloques de la plantilla que las usan."""
    texto_paginas = []
    with pdfplumber.open(ruta_pdf) as pdf:
        for pagina in pdf.pages:
            texto_paginas.append(_texto_pagina_consciente_de_columnas(pagina))
    return '\n'.join(texto_paginas), len(texto_paginas)


def extraer_texto_ocr(ruta_pdf, cantidad_paginas):
    """Nivel 2: OCR de respaldo, vía pdf2image + pytesseract (idioma español)."""
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError:
        sys.exit('Falta pytesseract o pdf2image. Instalá con: '
                  'pip install pytesseract pdf2image --break-system-packages')

    if RUTA_TESSERACT:
        pytesseract.pytesseract.tesseract_cmd = RUTA_TESSERACT

    imagenes = convert_from_path(ruta_pdf, dpi=300, poppler_path=RUTA_POPPLER)
    texto_paginas = [pytesseract.image_to_string(img, lang='spa') for img in imagenes]
    return '\n'.join(texto_paginas)


def segmentar_por_secciones(texto):
    """
    Nivel 3: detección de bloques por encabezado de sección, no por
    posición fija. Devuelve un dict {nombre_seccion: contenido}.
    Las secciones no encontradas simplemente no aparecen en el dict
    (no se inventa contenido para rellenarlas).
    """
    posiciones = []
    for nombre, patron in PATRONES_SECCION:
        coincidencia = re.search(patron, texto, re.IGNORECASE)
        if coincidencia:
            posiciones.append((coincidencia.start(), coincidencia.end(), nombre))

    posiciones.sort(key=lambda p: p[0])

    secciones = {}
    for indice, (inicio, fin, nombre) in enumerate(posiciones):
        fin_seccion = posiciones[indice + 1][0] if indice + 1 < len(posiciones) else len(texto)
        contenido = texto[fin:fin_seccion].strip(' \n:.-')
        secciones[nombre] = contenido

    return secciones


def extraer_lista(texto_seccion):
    """
    Convierte un bloque de texto en una lista de ítems, separando por
    guiones/viñetas de inicio de línea (formato observado en los
    pósters reales) o, si no hay viñetas, por salto de línea simple.
    """
    if not texto_seccion:
        return []

    lineas_con_vineta = re.findall(r'^[\-•▸]\s*(.+)$', texto_seccion, re.MULTILINE)
    if lineas_con_vineta:
        return [linea.strip() for linea in lineas_con_vineta if linea.strip()]

    lineas = [linea.strip() for linea in texto_seccion.split('\n') if linea.strip()]
    return lineas


def extraer_datos_contacto(texto_contacto):
    """
    Extrae director/a(s), contacto e instituciones cooperantes del
    bloque "DATOS | CONTACTO" mediante las etiquetas de campo que usa
    la plantilla real (no inventa datos si la etiqueta no aparece).
    """
    resultado = {'responsables': [], 'contacto': None, 'instituciones_cooperantes_texto': None}
    if not texto_contacto:
        return resultado

    m_director = re.search(r'Director(?:/a)?\s*:\s*(.+)', texto_contacto, re.IGNORECASE)
    if m_director:
        nombres = re.split(r'\s+y\s+|,', m_director.group(1).split('\n')[0])
        resultado['responsables'] = [n.strip() for n in nombres if n.strip()]

    m_contacto = re.search(r'Contacto\s*:\s*([^\s]+@[^\s]+)', texto_contacto, re.IGNORECASE)
    if m_contacto:
        resultado['contacto'] = m_contacto.group(1).strip(' .,;')

    m_instituciones = re.search(r'Instituciones\s+cooperantes\s*:\s*(.+)', texto_contacto, re.IGNORECASE)
    if m_instituciones:
        resultado['instituciones_cooperantes_texto'] = m_instituciones.group(1).split('\n')[0].strip(' .-')

    return resultado


def construir_borrador(id_proyecto, texto_completo, secciones, fuente, unidad, anio):
    advertencias = []
    datos_contacto = extraer_datos_contacto(secciones.get('contacto_bloque', ''))

    acciones = extraer_lista(secciones.get('acciones', ''))
    resultados_aportes = extraer_lista(secciones.get('resultados_aportes', ''))

    if not secciones.get('resumen'):
        advertencias.append('No se detectó la sección RESUMEN; revisar manualmente.')
    if not secciones.get('problema'):
        advertencias.append('No se detectó la sección PROBLEMA; revisar manualmente.')
    if not datos_contacto['contacto']:
        advertencias.append('No se detectó un email de contacto en el bloque DATOS|CONTACTO.')
    if not datos_contacto['responsables']:
        advertencias.append('No se detectaron responsables (línea "Director/a:"); completar a mano.')
    if not anio:
        advertencias.append('No se indicó año por línea de comando; el póster rara vez lo declara en texto. Completar a mano.')
    if not unidad:
        advertencias.append('No se indicó unidad académica por línea de comando; completar y normalizar contra categorias.json.')
    if datos_contacto['instituciones_cooperantes_texto']:
        advertencias.append(
            'instituciones_cooperantes se detectó como texto libre: '
            f'"{datos_contacto["instituciones_cooperantes_texto"]}". '
            'Normalizar a ids del catálogo controlado (categorias.json) a mano.'
        )

    for nombre_campo, valores in (('acciones', acciones), ('resultados_aportes', resultados_aportes)):
        if len(valores) > 7:
            advertencias.append(
                f'"{nombre_campo}" tiene {len(valores)} ítems extraídos: es más de lo habitual en un '
                'póster real y probablemente arrastró texto de la sección siguiente (cita, fotos '
                'o datos de contacto). Revisar contra el PDF y recortar a mano.'
            )

    borrador = {
        'id': id_proyecto,
        'titulo': None,
        'resolucion': None,
        'unidad_academica': unidad,
        'programa_carrera_area': None,
        'resumen': secciones.get('resumen') or None,
        'problema': secciones.get('problema') or None,
        'objetivo_general': secciones.get('objetivo_general') or None,
        'objetivos_especificos': [],
        'acciones': acciones,
        'resultados_aportes': resultados_aportes,
        'responsables': datos_contacto['responsables'],
        'contacto': datos_contacto['contacto'],
        'instituciones_cooperantes': [],
        'cita_destacada': None,
        'imagenes': [],
        'videos': [],
        'pdf_fuente': None,
        'anio': anio,
        'etiquetas': [],
        'estado_revision': 'pendiente',
        '_fuente_extraccion': fuente,
        '_advertencias': advertencias,
        '_instituciones_cooperantes_texto_sin_normalizar': datos_contacto['instituciones_cooperantes_texto'],
        '_texto_completo_extraido': texto_completo,
    }
    return borrador


def generar_borrador_desde_pdf(ruta_pdf, id_proyecto, unidad=None, anio=None, dir_borradores=None):
    """
    Versión importable de lo que hace main(): la usa tanto la CLI de
    este script como el panel /admin (server.py), para no duplicar la
    lógica de extracción en dos lugares. Devuelve el dict del borrador
    generado (el mismo que se escribe a disco).
    """
    ruta_pdf = Path(ruta_pdf)
    if not ruta_pdf.exists():
        raise FileNotFoundError(f'No existe el archivo: {ruta_pdf}')

    texto_nativo, cantidad_paginas = extraer_texto_nativo(ruta_pdf)

    if len(texto_nativo.strip()) >= UMBRAL_TEXTO_NATIVO:
        texto_completo = texto_nativo
        fuente = 'texto_nativo'
    else:
        texto_completo = extraer_texto_ocr(ruta_pdf, cantidad_paginas)
        fuente = 'ocr'

    secciones = segmentar_por_secciones(texto_completo)
    borrador = construir_borrador(id_proyecto, texto_completo, secciones, fuente, unidad, anio)

    destino = Path(dir_borradores) if dir_borradores else (Path(__file__).resolve().parent.parent / '_borradores')
    destino.mkdir(parents=True, exist_ok=True)
    ruta_salida = destino / f'{id_proyecto}.json'
    ruta_salida.write_text(json.dumps(borrador, ensure_ascii=False, indent=2), encoding='utf-8')

    return borrador


def main():
    parser = argparse.ArgumentParser(description='Extrae un borrador de ficha desde un póster PDF.')
    parser.add_argument('ruta_pdf', help='Ruta al PDF del póster')
    parser.add_argument('id_proyecto', help='Identificador del proyecto (debe coincidir con el nombre de archivo final)')
    parser.add_argument('--unidad', default=None, help='Id de unidad académica (ver data/categorias.json)')
    parser.add_argument('--anio', type=int, default=None, help='Año de la convocatoria')
    args = parser.parse_args()

    borrador = generar_borrador_desde_pdf(args.ruta_pdf, args.id_proyecto, args.unidad, args.anio)
    dir_borradores = Path(__file__).resolve().parent.parent / '_borradores'

    print(f'Borrador generado en: {dir_borradores / (args.id_proyecto + ".json")}')
    secciones_detectadas = [k for k in ('resumen', 'problema', 'objetivo_general', 'acciones', 'resultados_aportes', 'contacto_bloque') if borrador.get(k.replace('contacto_bloque', 'contacto'))]
    print(f'Fuente de extracción: {borrador["_fuente_extraccion"]}')
    if borrador['_advertencias']:
        print(f'Advertencias ({len(borrador["_advertencias"])}):')
        for advertencia in borrador['_advertencias']:
            print(f'  - {advertencia}')
    print('\nEstado: "pendiente". Requiere revisión humana antes de promover a data/proyectos/.')


if __name__ == '__main__':
    main()
