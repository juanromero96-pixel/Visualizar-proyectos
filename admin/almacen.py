"""
admin/almacen.py
Capa de datos unificada del panel. Antes de este archivo, "borrador"
(herramientas-internas/_borradores/) y "proyecto publicado"
(data/proyectos/) eran dos colecciones separadas que cada endpoint leía
por su cuenta. Esto centraliza esa lectura/escritura en un solo lugar,
porque el Módulo 3/4 necesita tratarlos como una sola lista filtrable
por estado, sin que cada vista reimplemente "¿de qué carpeta lo leo?".

Reglas que mantiene este módulo, no cada endpoint por separado:
- pendiente / en_revision / validado  -> viven en _borradores/
- publicado / archivado               -> viven en data/proyectos/
- catalog.json contiene SIEMPRE y SOLO entradas con estado_revision
  "publicado" (igual que ya validaba validar-datos.js).
- Guardado atómico (escribir a un archivo temporal y renombrar) para
  no dejar un JSON corrupto si el proceso se interrumpe a mitad de
  escritura.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
DIR_BORRADORES = RAIZ_PROYECTO / 'herramientas-internas' / '_borradores'
DIR_BORRADORES_PUBLICADOS = DIR_BORRADORES / '_publicados'
DIR_PROYECTOS = RAIZ_PROYECTO / 'data' / 'proyectos'
DIR_AUDITORIA = Path(__file__).resolve().parent / 'estado' / 'auditoria'
RUTA_CATALOGO = RAIZ_PROYECTO / 'data' / 'catalog.json'
RUTA_CATEGORIAS = RAIZ_PROYECTO / 'data' / 'categorias.json'

CAMPOS_CATALOGO = [
    'id', 'titulo', 'unidad_academica', 'programa_carrera_area',
    'resumen', 'anio', 'etiquetas', 'destacado', 'estado_revision', 'imagen_portada',
]

# Transiciones válidas — exactamente las del enunciado. Cualquier otra
# combinación se rechaza explícitamente, no se asume.
TRANSICIONES_VALIDAS = {
    'pendiente': {'en_revision'},
    'en_revision': {'validado', 'pendiente'},  # "pendiente" = devolver a borrador si se carga algo a corregir mal
    'validado': {'publicado', 'en_revision'},  # permite "des-aprobar" antes de publicar
    'publicado': {'archivado'},
    'archivado': {'publicado'},
}

BLOQUES_CONOCIDOS = [
    'resumen', 'problema', 'objetivo_general', 'objetivos_especificos',
    'acciones', 'resultados_aportes', 'imagenes', 'videos', 'contacto',
]

CONFIGURACION_PRESENTACION_DEFAULT = {
    'orden_bloques': list(BLOQUES_CONOCIDOS),
    'bloques_ocultos': [],
    'bloque_destacado': None,
    'imagen_principal': None,
    'imagen_portada': None,
    'mostrar_cita_destacada': True,
}

for _directorio in (DIR_BORRADORES, DIR_BORRADORES_PUBLICADOS, DIR_PROYECTOS, DIR_AUDITORIA):
    _directorio.mkdir(parents=True, exist_ok=True)


def _leer_json(ruta, valor_por_defecto=None):
    if not ruta.exists():
        return valor_por_defecto
    try:
        return json.loads(ruta.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return valor_por_defecto


def escribir_json_atomico(ruta, datos):
    """Guardado seguro: escribe a un archivo temporal en el mismo
    directorio y recién al final lo renombra sobre el destino. Un
    corte de luz o un cierre abrupto a mitad de escritura deja el
    archivo temporal huérfano, nunca el JSON real corrupto."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(ruta.suffix + '.tmp')
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporal, ruta)


def _ahora():
    return datetime.now(timezone.utc).isoformat()


def _ruta_auditoria(doc_id):
    return DIR_AUDITORIA / f'{doc_id}.json'


def obtener_auditoria(doc_id):
    """
    Historial de auditoría y de correcciones — SIEMPRE en
    admin/estado/auditoria/, nunca dentro del JSON del proyecto. Una
    vez publicado, data/proyectos/{id}.json queda accesible por fetch()
    desde el sitio público (lo consume data.js); guardar ahí nombres
    de personal o el texto crudo de la extracción sería exponerlo a
    cualquier visitante. Esto es exclusivamente de uso interno.
    """
    return _leer_json(_ruta_auditoria(doc_id), {'historial': [], 'historial_correcciones': []})


def _guardar_auditoria(doc_id, auditoria):
    escribir_json_atomico(_ruta_auditoria(doc_id), auditoria)


def listar_proyectos(filtro_estado=None, filtro_unidad=None, filtro_anio=None):
    """Devuelve la lista unificada (borradores activos + publicados +
    archivados), sin el contenido pesado (_texto_completo_extraido) ni
    el historial completo, para que listar 130+ proyectos sea liviano."""
    proyectos = []

    for ruta in sorted(DIR_BORRADORES.glob('*.json')):
        datos = _leer_json(ruta)
        if datos:
            proyectos.append(datos)

    for ruta in sorted(DIR_PROYECTOS.glob('*.json')):
        datos = _leer_json(ruta)
        if datos:
            proyectos.append(datos)

    if filtro_estado:
        proyectos = [p for p in proyectos if p.get('estado_revision') == filtro_estado]
    if filtro_unidad:
        proyectos = [p for p in proyectos if p.get('unidad_academica') == filtro_unidad]
    if filtro_anio:
        proyectos = [p for p in proyectos if str(p.get('anio')) == str(filtro_anio)]

    resumen = []
    for p in proyectos:
        auditoria = obtener_auditoria(p.get('id'))
        historial = auditoria.get('historial', [])
        resumen.append({
            'id': p.get('id'),
            'titulo': p.get('titulo'),
            'unidad_academica': p.get('unidad_academica'),
            'anio': p.get('anio'),
            'etiquetas': p.get('etiquetas', []),
            'estado_revision': p.get('estado_revision'),
            'advertencias': len(p.get('_advertencias', [])),
            'ultima_actualizacion': historial[-1]['fecha'] if historial else None,
        })
    resumen.sort(key=lambda r: r.get('ultima_actualizacion') or '', reverse=True)
    return resumen


def obtener_proyecto(doc_id):
    """Busca el proyecto sea cual sea su carpeta actual (no asume el
    estado de antemano: lo busca en borradores y, si no está, en
    publicados)."""
    ruta_borrador = DIR_BORRADORES / f'{doc_id}.json'
    datos = _leer_json(ruta_borrador)
    if datos:
        return datos, ruta_borrador

    ruta_publicado = DIR_PROYECTOS / f'{doc_id}.json'
    datos = _leer_json(ruta_publicado)
    if datos:
        return datos, ruta_publicado

    return None, None


def asegurar_configuracion_presentacion(proyecto):
    """Si el proyecto no tiene configuracion_presentacion (todo lo
    extraído antes de este bloque, y todo lo nuevo que no la tocó
    todavía), se le agrega la default. No pisa nada que ya exista."""
    if 'configuracion_presentacion' not in proyecto or not proyecto['configuracion_presentacion']:
        proyecto['configuracion_presentacion'] = json.loads(json.dumps(CONFIGURACION_PRESENTACION_DEFAULT))
    else:
        for clave, valor in CONFIGURACION_PRESENTACION_DEFAULT.items():
            proyecto['configuracion_presentacion'].setdefault(clave, valor)
    return proyecto


def registrar_evento_historial(doc_id, accion, estado_anterior, estado_nuevo, usuario):
    auditoria = obtener_auditoria(doc_id)
    auditoria['historial'].append({
        'accion': accion,
        'estado_anterior': estado_anterior,
        'estado_nuevo': estado_nuevo,
        'usuario': usuario or 'sin identificar',
        'fecha': _ahora(),
    })
    _guardar_auditoria(doc_id, auditoria)


def guardar_correccion_campo(doc_id, campo, valor_nuevo, usuario):
    """Autosave de un campo del editor. Guardado atómico + queda
    registrada la corrección en el archivo de auditoría interno (para
    el objetivo de aprendizaje futuro mencionado en el documento
    técnico: registrar correcciones, sin implementar ningún
    aprendizaje automático todavía)."""
    proyecto, ruta = obtener_proyecto(doc_id)
    if not proyecto:
        return None, f'No existe el proyecto "{doc_id}".'

    valor_anterior = proyecto.get(campo)
    if valor_anterior == valor_nuevo:
        return proyecto, None  # nada que guardar, evita ruido en el historial

    proyecto[campo] = valor_nuevo
    escribir_json_atomico(ruta, proyecto)

    auditoria = obtener_auditoria(doc_id)
    auditoria['historial_correcciones'].append({
        'campo': campo,
        'valor_anterior': valor_anterior,
        'valor_nuevo': valor_nuevo,
        'usuario': usuario or 'sin identificar',
        'fecha': _ahora(),
    })
    _guardar_auditoria(doc_id, auditoria)

    return proyecto, None


def guardar_configuracion_presentacion(doc_id, configuracion, usuario):
    proyecto, ruta = obtener_proyecto(doc_id)
    if not proyecto:
        return None, f'No existe el proyecto "{doc_id}".'

    proyecto = asegurar_configuracion_presentacion(proyecto)
    proyecto['configuracion_presentacion'].update(configuracion)
    escribir_json_atomico(ruta, proyecto)
    registrar_evento_historial(doc_id, 'configuracion_presentacion', proyecto.get('estado_revision'), proyecto.get('estado_revision'), usuario)
    return proyecto, None


def transicionar_estado(doc_id, nuevo_estado, usuario):
    """
    Aplica UNA transición de estado, validándola contra
    TRANSICIONES_VALIDAS. "publicado" es especial: ahí es donde se
    genera la ficha definitiva y se actualiza catalog.json (lo que el
    enunciado llama "publicación automática"), reutilizando
    promover_borrador.promover().
    """
    proyecto, ruta = obtener_proyecto(doc_id)
    if not proyecto:
        return False, f'No existe el proyecto "{doc_id}".'

    estado_actual = proyecto.get('estado_revision')
    permitidas = TRANSICIONES_VALIDAS.get(estado_actual, set())
    if nuevo_estado not in permitidas:
        return False, (
            f'No se puede pasar de "{estado_actual}" a "{nuevo_estado}". '
            f'Transiciones permitidas desde "{estado_actual}": {sorted(permitidas) or "ninguna"}.'
        )

    if nuevo_estado == 'publicado' and estado_actual == 'validado':
        import promover_borrador  # import diferido: evita ciclo de imports al cargar el módulo
        exito, mensajes = promover_borrador.promover(doc_id, dir_borradores=DIR_BORRADORES)
        if not exito:
            return False, ' / '.join(mensajes)

        _copiar_pdf_a_carpeta_publica(doc_id)
        registrar_evento_historial(doc_id, 'transicion', estado_actual, nuevo_estado, usuario)

        ruta_borrador_vieja = DIR_BORRADORES / f'{doc_id}.json'
        if ruta_borrador_vieja.exists():
            DIR_BORRADORES_PUBLICADOS.mkdir(parents=True, exist_ok=True)
            os.replace(ruta_borrador_vieja, DIR_BORRADORES_PUBLICADOS / f'{doc_id}.json')

        return True, f'"{doc_id}" publicado.'

    if nuevo_estado == 'archivado' and estado_actual == 'publicado':
        proyecto['estado_revision'] = 'archivado'
        escribir_json_atomico(ruta, proyecto)
        registrar_evento_historial(doc_id, 'transicion', estado_actual, nuevo_estado, usuario)
        _quitar_de_catalogo(doc_id)
        return True, f'"{doc_id}" archivado y retirado del catálogo público.'

    if nuevo_estado == 'publicado' and estado_actual == 'archivado':
        proyecto['estado_revision'] = 'publicado'
        escribir_json_atomico(ruta, proyecto)
        registrar_evento_historial(doc_id, 'transicion', estado_actual, nuevo_estado, usuario)
        _agregar_a_catalogo(proyecto)
        return True, f'"{doc_id}" reactivado y vuelto a publicar en el catálogo.'

    # Transiciones simples sin efecto secundario sobre archivos públicos
    # (pendiente->en_revision, en_revision->validado, en_revision->pendiente, validado->en_revision)
    proyecto['estado_revision'] = nuevo_estado
    escribir_json_atomico(ruta, proyecto)
    registrar_evento_historial(doc_id, 'transicion', estado_actual, nuevo_estado, usuario)
    return True, f'"{doc_id}": "{estado_actual}" -> "{nuevo_estado}".'


DIR_PDF_ENTRANTES = Path(__file__).resolve().parent / '_entrantes'
DIR_PDF_FUENTE_PUBLICA = RAIZ_PROYECTO / 'pdf-fuente'


def _copiar_pdf_a_carpeta_publica(doc_id):
    """Al publicar: el PDF que se subió en el Módulo 1 (admin/_entrantes/)
    se copia a pdf-fuente/, que es de donde lo sirve el sitio público y
    de donde apunta el campo pdf_fuente de la ficha. Si por algún motivo
    el PDF original ya no está en _entrantes (se publicó desde un
    borrador cargado por otra vía), no rompe la publicación: solo no
    copia nada y el enlace de descarga quedará apuntando a un archivo
    que falta, detectable con validar-datos.js."""
    import shutil
    origen = DIR_PDF_ENTRANTES / f'{doc_id}.pdf'
    if origen.exists():
        DIR_PDF_FUENTE_PUBLICA.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origen, DIR_PDF_FUENTE_PUBLICA / f'{doc_id}.pdf')


def _agregar_a_catalogo(proyecto):
    catalogo = _leer_json(RUTA_CATALOGO, [])
    catalogo = [p for p in catalogo if p['id'] != proyecto['id']]
    entrada = {campo: proyecto.get(campo) for campo in CAMPOS_CATALOGO}
    entrada['destacado'] = proyecto.get('destacado') or False
    entrada['imagen_portada'] = proyecto.get('imagen_portada') or None
    catalogo.append(entrada)
    escribir_json_atomico(RUTA_CATALOGO, catalogo)


def _quitar_de_catalogo(doc_id):
    catalogo = _leer_json(RUTA_CATALOGO, [])
    catalogo = [p for p in catalogo if p['id'] != doc_id]
    escribir_json_atomico(RUTA_CATALOGO, catalogo)


def transicionar_lote(ids, nuevo_estado, usuario):
    """Operación masiva: aplica la misma transición a varios proyectos.
    Un id que no puede transicionar no frena a los demás — se reporta
    aparte, igual que los errores de extracción del Módulo 2."""
    resultados = []
    for doc_id in ids:
        exito, mensaje = transicionar_estado(doc_id, nuevo_estado, usuario)
        resultados.append({'id': doc_id, 'exito': exito, 'mensaje': mensaje})
    return resultados


CAMPOS_BLOQUEANTES = ['titulo', 'unidad_academica', 'anio', 'pdf_fuente']
CAMPOS_ADVERTENCIA = ['problema', 'objetivo_general', 'resultados_aportes', 'contacto']


def validar_para_revision(proyecto):
    """
    Validación visual del editor (distinta de validar_para_publicar de
    promover_borrador.py, que es la que de verdad bloquea la
    publicación): esta es para mostrar avisos en pantalla mientras se
    está editando, antes de intentar aprobar o publicar.
    "No publicar si falta": título, unidad académica, año, PDF fuente.
    "Advertir si falta, pero permitir": problema, objetivo, resultados,
    contacto.
    """
    bloqueantes, advertencias = [], []
    for campo in CAMPOS_BLOQUEANTES:
        if proyecto.get(campo) in (None, '', []):
            bloqueantes.append(campo)
    for campo in CAMPOS_ADVERTENCIA:
        if proyecto.get(campo) in (None, '', []):
            advertencias.append(campo)
    return {'bloqueantes': bloqueantes, 'advertencias': advertencias}


def obtener_categorias():
    return _leer_json(RUTA_CATEGORIAS, {'unidades_academicas': [], 'instituciones_cooperantes': [], 'etiquetas_sugeridas': []})
