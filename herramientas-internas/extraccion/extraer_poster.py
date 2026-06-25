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
from glob import glob
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
#
# Si ninguna de las dos variables está seteada (por ejemplo, se abrió
# una terminal nueva y no se escribió el "set" de nuevo), se prueban
# algunas ubicaciones típicas de instalación en Windows antes de
# rendirse y depender del PATH. Esto es solo una red de salvataje —
# no reemplaza poner la variable, pero evita que el mismo error vuelva
# a aparecer solo por haber abierto otra terminal.


def _detectar_automaticamente(patrones):
    for patron in patrones:
        coincidencias = sorted(glob(patron))
        if coincidencias:
            return coincidencias[-1]  # la versión más alta, si hay varias
    return None


RUTA_POPPLER = (
    os.environ.get('RUTA_POPPLER')
    or _detectar_automaticamente([
        r'C:\poppler-*\Library\bin',
        r'C:\poppler\Library\bin',
        r'C:\Program Files\poppler-*\Library\bin',
    ])
    or None
)
RUTA_TESSERACT = (
    os.environ.get('RUTA_TESSERACT')
    or _detectar_automaticamente([
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
    ])
    or None
)

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

# Dominios de correo institucional de las unidades académicas conocidas
# (ver categorias.json: FAyD, FCE, FCEQyN, FCF, FHyCS, FI, EAE). Se usa
# SOLO como ancla para reubicar dónde termina la parte local y empieza
# el dominio cuando el "@" se perdió en el OCR (ver
# _reconstruir_email_baja_confianza) — no para inventar ni validar
# nada que no esté ya en el texto. Listado de más a menos específico:
# "fceqyn" debe probarse antes que "fce" para no cortar el dominio a
# mitad de palabra. Incluye "fce[qg]yn" porque el corpus real de
# calibración confirmó que Tesseract confunde la "q" con "g" en ese
# dominio exacto (FCEQyN → "fcegyn" en el texto OCR).
DOMINIOS_UNIDADES_CONOCIDOS = [
    (r'fceqyn', 'fceqyn'),
    (r'fce[qg]yn', 'fceqyn'),
    (r'fhycs', 'fhycs'),
    (r'fayd', 'fayd'),
    (r'fcf', 'fcf'),
    (r'fio', 'fio'),
    (r'eae', 'eae'),
    (r'fce', 'fce'),
]

# Encabezados de sección tal como aparecen en la plantilla real de los
# pósters (ver Documento Técnico, sección 13.1). Cada uno admite algunas
# variantes de escritura observadas o esperables.
#
# Los \b son deliberados y NO cosméticos: calibrando contra el póster real
# de FHyCS se confirmó que, sin límite de palabra, el patrón de 'problema'
# matchea contra la palabra "problemas" dentro de la prosa del RESUMEN
# ("...para resolver problemas de automatización" / "...reduce los
# problemas de salud..."), mucho antes del encabezado real, y corre todos
# los límites de sección posteriores. Ver auditoría de calibración.
PATRONES_SECCION = [
    ('resumen', r'\bRESUMEN\b'),
    ('problema', r'\bPROBLEMA\b'),
    ('objetivo_general', r'\bOBJETIVO(?:S)?\b'),
    ('acciones', r'\bACCIONES\b'),
    ('resultados_aportes', r'\bRESULTADOS\s*[/\|]?\s*Y?\s*APORTES\b'),
    ('contacto_bloque', r'\bDATOS\s*[\|/]?\s*CONTACTO\b'),
]

# Patrón de "placeholder" de plantilla sin completar (texto literal tipo
# "[Insertar foto aquí y adapte]" que algunos pósters reales dejan sin
# reemplazar). Se confirmó en el corpus real: FI deja "[Insertar imagen
# de QR aquí]" pegado a la línea de Director/a por estar a la misma
# altura visual, y FAyD deja la cita destacada completa sin completar.
# Si esto se filtra a un campo, NUNCA debe publicarse como dato real.
PATRON_PLACEHOLDER_PLANTILLA = re.compile(
    r'\[\s*Insertar[^\]]*\]|\[\s*Foto\s*\d*[^\]]*\]', re.IGNORECASE
)


def _limpiar_placeholders(texto):
    """
    Quita restos de plantilla sin completar (ver PATRON_PLACEHOLDER_PLANTILLA)
    de un valor ya extraído. Devuelve (texto_limpio, se_encontro_placeholder).
    No inventa contenido para lo que se quita: lo que queda después de
    limpiar es exactamente lo que había alrededor del placeholder.
    """
    if not texto:
        return texto, False
    limpio = PATRON_PLACEHOLDER_PLANTILLA.sub('', texto)
    limpio = re.sub(r'\s{2,}', ' ', limpio).strip(' \n,;')
    return limpio, (limpio != texto.strip())


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


def _texto_consciente_de_columnas(palabras):
    """
    Reconstruye texto a partir de una lista de palabras con bounding box
    (cada una con 'text', 'x0', 'top'), respetando los bloques de dos
    columnas conocidos de la plantilla (ver PARES_ENCABEZADO_DOS_COLUMNAS).
    Fuera de esos bloques, el texto se devuelve en orden normal de
    lectura top-to-bottom / left-to-right.

    Es agnóstica de la fuente de las palabras: tanto
    extraer_texto_nativo (pdfplumber, texto seleccionable) como
    extraer_texto_ocr (pytesseract, palabras con caja vía image_to_data)
    alimentan esta misma función, para no duplicar — ni dejar
    desincronizada — la lógica de columnas entre ambos caminos.

    Importante: esta reconstrucción reduce, pero no elimina, la mezcla
    entre columnas cuando una columna tiene líneas más largas que la
    otra. Por eso cada borrador queda marcado "pendiente" y el texto
    completo extraído se conserva en "_texto_completo_extraido": la
    persona revisora siempre puede cotejar contra el PDF original.
    """
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
            palabras = pagina.extract_words(keep_blank_chars=False)
            texto_paginas.append(_texto_consciente_de_columnas(palabras))
    return '\n'.join(texto_paginas), len(texto_paginas)


def _ocr_palabras_pagina(imagen):
    """
    Corre OCR a nivel de palabra (no de página completa) sobre una
    imagen ya rasterizada, vía pytesseract.image_to_data, y devuelve una
    lista de palabras con la misma forma que pdfplumber.extract_words()
    ({'text', 'x0', 'top'}) para poder reutilizar
    _texto_consciente_de_columnas.

    Esto importa porque, calibrando contra el corpus real, CUATRO de
    seis pósters (FAyD, FCEQyN, FCE, FI — toda la familia de plantilla
    "Semana Regional de la Extensión") no tienen NINGÚN texto nativo: la
    página entera es una sola imagen rasterizada (confirmado:
    page.images da exactamente 1 imagen cuyo bounding box es la página
    completa). Para esa familia, el camino OCR no es un respaldo
    ocasional: es el ÚNICO camino, siempre. Y son justo los pósters con
    más bloques de dos columnas. Usar pytesseract.image_to_string()
    sobre la página completa (sin caja por palabra) pierde por completo
    la posición de cada palabra y termina mezclando ambas columnas en un
    solo párrafo lineal — confirmado en el corpus real: el póster de FI
    da líneas como "...se observa un uso ineficiente de sistemas||
    Capacitar en selección, uso y mantenimiento de correas..." (columna
    PROBLEMA y columna OBJETIVO concatenadas sin separación).

    Se descartan palabras con confianza de Tesseract <= 0 (huecos,
    bordes de caja, ruido) para no ensuciar el agrupado en líneas.
    """
    import pytesseract
    from pytesseract import Output
    datos = pytesseract.image_to_data(imagen, lang='spa', output_type=Output.DICT)
    palabras = []
    for texto, x, top, alto, conf in zip(
        datos['text'], datos['left'], datos['top'], datos['height'], datos['conf']
    ):
        texto = texto.strip()
        if not texto:
            continue
        try:
            if float(conf) <= 0:
                continue
        except (TypeError, ValueError):
            pass
        # 'top' en image_to_data ya es la esquina superior de la
        # palabra: misma convención que pdfplumber.extract_words().
        palabras.append({'text': texto, 'x0': float(x), 'top': float(top)})
    return palabras


def extraer_texto_ocr(ruta_pdf, cantidad_paginas):
    """
    Nivel 2: OCR de respaldo, vía pdf2image + pytesseract (idioma
    español), CON reconstrucción de columnas (ver _ocr_palabras_pagina),
    igual que el camino de texto nativo. No usa image_to_string sobre la
    página completa: ver la nota en _ocr_palabras_pagina sobre por qué
    eso mezclaba columnas en el corpus real de calibración.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError:
        sys.exit('Falta pytesseract o pdf2image. Instalá con: '
                  'pip install pytesseract pdf2image --break-system-packages')

    if RUTA_TESSERACT:
        pytesseract.pytesseract.tesseract_cmd = RUTA_TESSERACT

    imagenes = convert_from_path(ruta_pdf, dpi=300, poppler_path=RUTA_POPPLER)
    texto_paginas = []
    for imagen in imagenes:
        palabras = _ocr_palabras_pagina(imagen)
        texto_paginas.append(_texto_consciente_de_columnas(palabras))
    return '\n'.join(texto_paginas)


def segmentar_por_secciones(texto):
    """
    Nivel 3: detección de bloques por encabezado de sección, no por
    posición fija. Devuelve un dict {nombre_seccion: contenido}.
    Las secciones no encontradas simplemente no aparecen en el dict
    (no se inventa contenido para rellenarlas).

    Usa re.search (primera coincidencia) por nombre, así que un mismo
    encabezado repetido más adelante en el texto (p. ej. una foto
    incrustada cuya diapositiva dice literalmente "ACCIONES DE
    EJECUCIÓN Y CONTROL", como ocurre en la página 2 del póster real de
    FAyD) no puede pisar la sección real ya encontrada.

    OJO con un caso distinto, también confirmado en el corpus real de
    FAyD vía OCR sin reconstrucción de columnas: "ACCIONES" y
    "RESULTADOS / APORTES" son encabezados de DOS columnas que aparecen
    ADYACENTES en el mismo renglón visual ("ACCIONES RESULTADOS /
    APORTES"). Como esta función no sabe de columnas, el contenido
    entre el fin de "ACCIONES" y el inicio de "RESULTADOS" es apenas el
    espacio entre ambos títulos: la sección 'acciones' queda vacía y
    TODO el texto de ambas columnas (mezclado, si la fuente fue OCR sin
    separación por columnas) cae dentro de 'resultados_aportes'. Esto
    no se resuelve acá: se resuelve antes, logrando que
    extraer_texto_ocr entregue las dos columnas ya separadas y en
    orden (ver _ocr_palabras_pagina), igual que ya hace
    extraer_texto_nativo. Si esa separación falla por completo, el
    síntoma seguirá siendo 'acciones' vacío con 'resultados_aportes'
    inflado: tratarlo como señal para advertencia, no parchear aquí.
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
    pósters reales, incluye casilleros de check ☐/☑ como en la lista de
    "Objetivos específicos" del póster real de FCE) o, si no hay
    viñetas, por salto de línea simple.
    """
    if not texto_seccion:
        return []

    lineas_con_vineta = re.findall(r'^[\-•▸☐☑□✓✔»]\s*(.+)$', texto_seccion, re.MULTILINE)
    if lineas_con_vineta:
        return [linea.strip() for linea in lineas_con_vineta if linea.strip()]

    lineas = [linea.strip() for linea in texto_seccion.split('\n') if linea.strip()]
    return lineas


def separar_objetivos_especificos(texto_objetivo):
    """
    Dentro del bloque OBJETIVO, separa el objetivo general de la
    sub-lista "Objetivos específicos" cuando está presente (confirmado
    en el póster real de FCE, como sub-encabezado seguido de viñetas
    con casillero ☐ dentro de la MISMA caja que el objetivo general —
    no es una sección aparte de la plantilla, por eso no tiene su
    propio patrón en PATRONES_SECCION).
    Devuelve (objetivo_general, lista_objetivos_especificos).
    """
    if not texto_objetivo:
        return texto_objetivo, []
    coincidencia = re.search(r'Objetivos?\s+espec[ií]ficos?\s*:?', texto_objetivo, re.IGNORECASE)
    if not coincidencia:
        return texto_objetivo, []
    general = texto_objetivo[:coincidencia.start()].strip(' \n:.-') or None
    especificos = extraer_lista(texto_objetivo[coincidencia.end():])
    return general, especificos


# Cita destacada: en la plantilla real NO tiene un encabezado de texto
# propio (no hay una palabra literal "CITA" en ningún póster del
# corpus) — es una caja gris/clara con una frase entre comillas, así que
# se detecta por el patrón de comillas, no por encabezado. Se confirmó
# en las 6 plantillas del corpus de calibración (6/6) que aparece justo
# antes del bloque DATOS|CONTACTO, en el texto que la segmentación por
# encabezados ya le asigna a 'resultados_aportes' (porque no hay ningún
# encabezado que la separe). Por eso se extrae DESDE ahí, no desde el
# texto completo: buscar en todo el documento generaría falsos
# positivos contra títulos de proyecto entre comillas dentro del propio
# RESUMEN (confirmado en el póster real de FCF: 'El proyecto "Jóvenes
# Promotoras..."' es una cita de TÍTULO, no la cita destacada).
PATRON_CITA_DESTACADA = re.compile(r'["“«]\s*(.{8,300}?)\s*["”»]', re.DOTALL)


def extraer_cita_destacada(texto_resultados):
    """
    Busca la última frase entre comillas dentro del texto de
    'resultados_aportes' (donde cae la cita destacada real, ver nota
    arriba) y la separa del resto. Devuelve
    (texto_resultados_sin_cita, dict_cita_o_None).

    Si lo que queda entre comillas es un placeholder de plantilla sin
    completar (confirmado en el póster real de FAyD: literalmente
    "[Insertar frase o cita destacada del proyecto]"), NO se publica
    como cita real: se descarta y se deja cita_destacada en None.
    """
    if not texto_resultados:
        return texto_resultados, None

    coincidencias = list(PATRON_CITA_DESTACADA.finditer(texto_resultados))
    if not coincidencias:
        return texto_resultados, None

    ultima = coincidencias[-1]
    texto_cita = ultima.group(1).strip()
    resto_sin_cita = (texto_resultados[:ultima.start()] + texto_resultados[ultima.end():]).strip()

    if PATRON_PLACEHOLDER_PLANTILLA.search(texto_cita):
        return resto_sin_cita, None

    fuente = texto_resultados[ultima.end():].strip(' \n.-')
    fuente = fuente or None
    if fuente and len(fuente) > 25 and ' ' not in fuente:
        # Atribución sin espacios entre palabras: síntoma confirmado en
        # el póster real de FCE ("Estudianteextensionista,Investigación
        # deMercados2024"), probablemente texto en fuente muy pequeña
        # que el extractor fusionó. Se deja igual (no se inventan
        # espacios) pero se marca para que se note en advertencias.
        fuente = {'_texto': fuente, '_posible_fusion_sin_espacios': True}

    return resto_sin_cita, {'texto': texto_cita, 'fuente': fuente if isinstance(fuente, str) else (fuente['_texto'] if fuente else None),
                             '_fuente_posible_fusion_sin_espacios': isinstance(fuente, dict)}


_ETIQUETAS_ROL_SECUNDARIO = re.compile(r'^\s*Co-?[Dd]irector(?:a)?\s*:\s*|^\s*Docentes?\s*:\s*', re.IGNORECASE)


def _dividir_personas(segmento):
    """
    Separa un segmento en una o más personas. Nunca separa por coma
    sola: confirmado contra 4/6 pósters reales (FAyD, FCEQyN, FHyCS, FI)
    que el formato "Apellido, Nombre" de UNA persona es el más común en
    esta plantilla, y separar por coma lo rompía en dos "responsables"
    falsos. Cuando hay más de una persona en el mismo rol (visto en
    FCE: "Docentes: Lic. Lourdes Monzón Molinas; Dra. Camila Aquino"),
    el separador real es ";" (o, ocasionalmente, " y ").
    """
    segmento = _ETIQUETAS_ROL_SECUNDARIO.sub('', segmento)
    partes = re.split(r'\s*;\s*|\s+y\s+', segmento)
    resultado = []
    for parte in partes:
        parte = re.sub(r'\s+', ' ', parte).strip(' .')
        # Descarta símbolos decorativos sueltos pegados al final de un
        # nombre (confirmado en el póster real de FHyCS: el ícono de
        # una red social cercana se extrae como "▣" pegado al nombre).
        parte = re.sub(r'\s*[^\w\sÁÉÍÓÚÑáéíóúñ.,\-]+$', '', parte).strip(' .')
        if parte:
            resultado.append(parte)
    return resultado


def _reconstruir_email_baja_confianza(texto_contacto):
    """
    Reconstruye un email cuando el "@" no se reconoció como tal.
    Confirmado en el corpus real de calibración: el regex estricto con
    "@" literal falló en el 100% de los pósters que pasaron por OCR (los
    cuatro de la familia "Semana Regional de la Extensión"), porque
    Tesseract no lee bien ese símbolo en esta tipografía — lo leyó como
    "(O" en FAyD y lo perdió por completo (cero caracteres de reemplazo)
    en FCEQyN y en FI.

    Por eso NO se puede asumir un ancho fijo de "basura" entre la parte
    local y el dominio. En cambio, se ancla al dominio institucional
    conocido (DOMINIOS_UNIDADES_CONOCIDOS — el mismo catálogo cerrado de
    unidades académicas que ya maneja el proyecto) para encontrar dónde
    termina la parte local, y de ahí se recorta un único caracter "(O"
    u "O" sobrante si quedó pegado justo antes del dominio (el patrón de
    OCR confirmado en este corpus para "@"). Lo que sea que quede del
    otro lado NO se inventa ni se corrige más: por eso el llamador
    siempre marca esto como reconstrucción de baja confianza a confirmar
    a mano contra el PDF, nunca como un dato ya verificado.
    """
    m_crudo = re.search(r'Contacto\s*:\s*(.+?unam\.edu\.ar)', texto_contacto, re.IGNORECASE | re.DOTALL)
    if not m_crudo:
        return None
    crudo = re.sub(r'\s+', '', m_crudo.group(1))

    for alias, dominio_canonico in DOMINIOS_UNIDADES_CONOCIDOS:
        m_dominio = re.search(alias + r'\.?unam\.edu\.ar', crudo, re.IGNORECASE)
        if not m_dominio:
            continue
        local = crudo[:m_dominio.start()]
        local = re.sub(r'\(?O$', '', local)  # resto típico de "@" mal leído
        if not local:
            return None
        return f'{local}@{dominio_canonico}.unam.edu.ar'
    return None


def extraer_datos_contacto(texto_contacto):
    """
    Extrae director/a(s), contacto e instituciones cooperantes del
    bloque "DATOS | CONTACTO" mediante las etiquetas de campo que usa
    la plantilla real (no inventa datos si la etiqueta no aparece).
    """
    resultado = {
        'responsables': [],
        'contacto': None,
        'instituciones_cooperantes_texto': None,
        '_contacto_reconstruido': False,
        '_advertencias': [],
    }
    if not texto_contacto:
        return resultado

    texto_contacto, hubo_placeholder = _limpiar_placeholders(texto_contacto)
    if hubo_placeholder:
        resultado['_advertencias'].append(
            'Se descartó un placeholder de plantilla sin completar dentro del bloque DATOS|CONTACTO.'
        )

    # Responsables: todo lo que sigue a "Director/a:" hasta la próxima
    # etiqueta conocida (Contacto: / Instituciones cooperantes:) o el
    # final del bloque. Adentro, los roles van separados por "|"
    # (confirmado en el póster real de FCE: "Directora: X | Co-Directora:
    # Y | Docentes: Z; W") y cada rol puede tener más de una persona
    # (separadas por ";"). Ver _dividir_personas para el porqué de NUNCA
    # separar por coma sola.
    # "Director(?:/a)?" no alcanza: el póster real de FCE imprime
    # "Directora:" sin la barra (ya resuelto en femenino), no
    # "Director/a:". Director\s*/?\s*a?\s*: cubre "Director:",
    # "Directora:" y "Director/a:" sin asumir cuál usa cada póster.
    m_bloque = re.search(
        r'Director\s*/?\s*a?\s*:\s*(.+?)(?=\bContacto\s*:|\bInstituciones\s+cooperantes\s*:|$)',
        texto_contacto, re.IGNORECASE | re.DOTALL,
    )
    if m_bloque:
        responsables = []
        for segmento in m_bloque.group(1).split('|'):
            responsables.extend(_dividir_personas(segmento))
        resultado['responsables'] = responsables

    m_contacto = re.search(r'Contacto\s*:\s*([^\s]+@[^\s]+)', texto_contacto, re.IGNORECASE)
    if m_contacto:
        resultado['contacto'] = m_contacto.group(1).strip(' .,;')
    else:
        email_reconstruido = _reconstruir_email_baja_confianza(texto_contacto)
        if email_reconstruido:
            resultado['contacto'] = email_reconstruido
            resultado['_contacto_reconstruido'] = True

    # Instituciones cooperantes: captura TODO lo que sigue a la etiqueta,
    # no solo la primera línea (confirmado en el póster real de FCF: la
    # plantilla anterior solo conservaba la primera de seis instituciones
    # cooperantes y descartaba las otras cinco en silencio). Se corta si
    # aparece una etiqueta "Contacto:" más adelante en el mismo texto
    # (confirmado en el póster real de FCE: el email queda pegado al
    # final de esta misma línea, "...| CONTACTO: nilda.tanski@...").
    m_instituciones = re.search(
        r'Instituciones\s+cooperantes\s*:\s*(.+)', texto_contacto, re.IGNORECASE | re.DOTALL
    )
    if m_instituciones:
        bruto = m_instituciones.group(1).strip(' \n.-')
        bruto = re.split(r'\bContacto\s*:', bruto, flags=re.IGNORECASE)[0].strip(' \n.-|')
        if bruto:
            resultado['instituciones_cooperantes_texto'] = bruto
            if '\n' in bruto:
                resultado['_advertencias'].append(
                    'instituciones_cooperantes se extrajo en varias líneas (varias instituciones '
                    'cooperantes listadas). Revisar que no se haya cortado ninguna al normalizar '
                    'contra el catálogo controlado.'
                )

    return resultado


def construir_borrador(id_proyecto, texto_completo, secciones, fuente, unidad, anio):
    advertencias = []
    datos_contacto = extraer_datos_contacto(secciones.get('contacto_bloque', ''))
    advertencias.extend(datos_contacto['_advertencias'])

    resumen, _ = _limpiar_placeholders(secciones.get('resumen', ''))
    problema, _ = _limpiar_placeholders(secciones.get('problema', ''))
    texto_objetivo, hubo_placeholder_obj = _limpiar_placeholders(secciones.get('objetivo_general', ''))
    objetivo_general, objetivos_especificos = separar_objetivos_especificos(texto_objetivo)

    # La cita destacada no tiene encabezado propio: vive en el texto que
    # la segmentación ya le asignó a 'resultados_aportes' (ver nota en
    # extraer_cita_destacada). Se separa ANTES de partir esa sección en
    # lista, para que la frase entre comillas no termine como un ítem
    # más de "resultados_aportes".
    texto_resultados, hubo_placeholder_res = _limpiar_placeholders(secciones.get('resultados_aportes', ''))
    texto_resultados, cita_destacada = extraer_cita_destacada(texto_resultados)

    acciones = [_limpiar_placeholders(item)[0] for item in extraer_lista(secciones.get('acciones', ''))]
    resultados_aportes = [_limpiar_placeholders(item)[0] for item in extraer_lista(texto_resultados)]
    acciones = [a for a in acciones if a]
    resultados_aportes = [r for r in resultados_aportes if r]

    if not resumen:
        advertencias.append('No se detectó la sección RESUMEN; revisar manualmente.')
    if not problema:
        advertencias.append('No se detectó la sección PROBLEMA; revisar manualmente.')
    if not objetivo_general:
        advertencias.append('No se detectó la sección OBJETIVO; revisar manualmente.')
    advertencias.append(
        'titulo no se completa automáticamente (ningún campo del extractor lo intenta todavía; '
        'ver Documento Técnico / propuesta de calibración, sección de extracción semántica). '
        'Completar a mano contra el PDF antes de publicar: es el campo más visible de la ficha.'
    )
    if not acciones and resultados_aportes:
        advertencias.append(
            '"acciones" quedó vacío mientras "resultados_aportes" tiene contenido: en esta '
            'plantilla ambos encabezados están adyacentes en el mismo renglón ("ACCIONES '
            'RESULTADOS / APORTES"), así que es probable que el contenido de ambas columnas '
            'haya quedado mezclado dentro de "resultados_aportes". Revisar contra el PDF y '
            'redistribuir a mano.'
        )
    if hubo_placeholder_obj:
        advertencias.append('Se descartó un placeholder de plantilla sin completar dentro del bloque OBJETIVO.')
    if hubo_placeholder_res:
        advertencias.append('Se descartó un placeholder de plantilla sin completar dentro de ACCIONES/RESULTADOS.')
    if not datos_contacto['contacto']:
        advertencias.append('No se detectó un email de contacto en el bloque DATOS|CONTACTO.')
    elif datos_contacto['_contacto_reconstruido']:
        advertencias.append(
            f'El email de contacto "{datos_contacto["contacto"]}" fue reconstruido automáticamente '
            'porque no se reconoció un símbolo "@" literal (síntoma de OCR confirmado en el corpus '
            'real). Confirmar el caracter exacto contra el PDF antes de publicar.'
        )
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
    if cita_destacada and cita_destacada.get('_fuente_posible_fusion_sin_espacios'):
        advertencias.append(
            'La fuente/autor de la cita destacada parece tener espacios faltantes entre palabras '
            '(texto de atribución en letra muy chica fusionado por el extractor). Revisar y corregir '
            'manualmente, no se inventaron espacios.'
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
        'resumen': resumen or None,
        'problema': problema or None,
        'objetivo_general': objetivo_general or None,
        'objetivos_especificos': objetivos_especificos,
        'acciones': acciones,
        'resultados_aportes': resultados_aportes,
        'responsables': datos_contacto['responsables'],
        'contacto': datos_contacto['contacto'],
        'instituciones_cooperantes': [],
        'cita_destacada': (
            {'texto': cita_destacada['texto'], 'fuente': cita_destacada['fuente']}
            if cita_destacada else None
        ),
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
