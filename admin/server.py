#!/usr/bin/env python3
"""
admin/server.py
Servidor interno del panel administrativo de la Biblioteca Digital de
Extensión UNaM. NO es parte del sitio público (que sigue siendo 100%
estático): esto lo corre el personal de la Secretaría de Extensión en
su propia máquina o en un servidor interno, nunca expuesto a internet
sin autenticación adicional.

Responsabilidad de este servidor: lo mínimo que un panel de carga,
extracción, revisión y publicación no puede hacer sin backend —
guardar archivos, correr el pipeline de extracción (OCR incluido) y
escribir data/catalog.json y data/proyectos/{id}.json. Todo lo demás
(la interfaz) es HTML/CSS/JS servido como estático desde admin/static/.

Instalación:
  Ver admin/README.md (entorno virtual recomendado) o ../README.md
  (resumen rápido de todo el proyecto).

Uso:
  cd admin
  python3 server.py
  abrir http://127.0.0.1:5050/
"""

import hashlib
import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

try:
    from flask import Flask, jsonify, request, send_from_directory
except ImportError:
    sys.exit(
        'Falta instalar Flask (y el resto de las dependencias del panel).\n\n'
        'Desde la raíz del proyecto:\n'
        '  python3 -m venv venv\n'
        '  source venv/bin/activate        (en Windows: venv\\Scripts\\activate)\n'
        '  pip install -r admin/requirements.txt\n\n'
        'Después volvé a correr: python3 admin/server.py\n'
        'Detalle completo en admin/README.md.'
    )

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ_PROYECTO / 'herramientas-internas' / 'extraccion'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import extraer_poster  # noqa: E402
import promover_borrador  # noqa: E402
import almacen  # noqa: E402

DIR_ADMIN = Path(__file__).resolve().parent
DIR_ESTADO = DIR_ADMIN / 'estado'
DIR_ENTRANTES = DIR_ADMIN / '_entrantes'
DIR_BORRADORES = RAIZ_PROYECTO / 'herramientas-internas' / '_borradores'
DIR_PDF_FUENTE = RAIZ_PROYECTO / 'pdf-fuente'
RUTA_CATEGORIAS = RAIZ_PROYECTO / 'data' / 'categorias.json'

RUTA_COLA = DIR_ESTADO / 'cola.json'
RUTA_ERRORES = DIR_ESTADO / 'historial-errores.json'
RUTA_CORRECCIONES = DIR_ESTADO / 'historial-correcciones.json'

ESTADOS = ['Pendiente', 'Procesando', 'Extraído', 'En revisión', 'Aprobado', 'Publicado', 'Archivado', 'Error']

# Mapa entre los estados visibles del panel y estado_revision (el campo
# que ya usan los JSON públicos y validar-datos.js). "Pendiente",
# "Procesando", "Extraído" y "Error" son momentos previos a que exista
# siquiera un borrador con estado_revision, por eso no tienen mapa.
ESTADO_PANEL_A_ESTADO_REVISION = {
    'En revisión': 'en_revision',
    'Aprobado': 'validado',
    'Publicado': 'publicado',
    'Archivado': 'archivado',
}

DIR_ESTADO.mkdir(parents=True, exist_ok=True)
DIR_ENTRANTES.mkdir(parents=True, exist_ok=True)
DIR_BORRADORES.mkdir(parents=True, exist_ok=True)
DIR_PDF_FUENTE.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(DIR_ADMIN / 'static'), static_url_path='/static')


# --------------------------------------------------------------------
# Persistencia simple en JSON (sin base de datos: a esta escala, un
# archivo es suficiente y consistente con el resto del proyecto).
# --------------------------------------------------------------------

def _leer_json(ruta, valor_por_defecto):
    if not ruta.exists():
        return valor_por_defecto
    try:
        return json.loads(ruta.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return valor_por_defecto


def _escribir_json(ruta, datos):
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding='utf-8')


def cargar_cola():
    return _leer_json(RUTA_COLA, [])


def guardar_cola(cola):
    _escribir_json(RUTA_COLA, cola)


def cargar_errores():
    return _leer_json(RUTA_ERRORES, [])


def registrar_error(doc_id, nombre_archivo, tipo, detalle):
    """
    Registra un error sin detener el resto del lote (sección de
    errores del enunciado: "PDF ilegible", "OCR incompleto", "campos
    vacíos", "errores de extracción", "PDF duplicado").
    """
    errores = cargar_errores()
    errores.append({
        'doc_id': doc_id,
        'archivo': nombre_archivo,
        'tipo': tipo,
        'detalle': detalle,
        'fecha': datetime.now(timezone.utc).isoformat(),
    })
    _escribir_json(RUTA_ERRORES, errores)


def registrar_correccion(doc_id, campo, valor_anterior, valor_nuevo):
    """
    Historial de correcciones humanas. No se usa para IA (no se pidió
    ninguna): es la base de datos que en el futuro permitiría detectar
    patrones de corrección recurrentes, sin implementar nada de eso
    todavía.
    """
    correcciones = _leer_json(RUTA_CORRECCIONES, [])
    correcciones.append({
        'doc_id': doc_id,
        'campo': campo,
        'valor_anterior': valor_anterior,
        'valor_nuevo': valor_nuevo,
        'fecha': datetime.now(timezone.utc).isoformat(),
    })
    _escribir_json(RUTA_CORRECCIONES, correcciones)


def buscar_doc(cola, doc_id):
    return next((d for d in cola if d['id'] == doc_id), None)


def calcular_hash(ruta_archivo):
    sha256 = hashlib.sha256()
    with open(ruta_archivo, 'rb') as f:
        for bloque in iter(lambda: f.read(65536), b''):
            sha256.update(bloque)
    return sha256.hexdigest()


def slug_desde_nombre(nombre_archivo):
    base = Path(nombre_archivo).stem
    slug = ''.join(c.lower() if c.isalnum() else '-' for c in base)
    while '--' in slug:
        slug = slug.replace('--', '-')
    return slug.strip('-') or 'documento'


def id_unico(cola, slug_base):
    """
    Un id no puede chocar con la cola actual NI con un proyecto que ya
    existe como borrador o como publicado — si dos PDFs distintos
    generan el mismo slug (nombres de archivo parecidos, o el mismo
    PDF subido en otro momento con otro propósito), el segundo tiene
    que recibir un id distinto, nunca pisar silenciosamente al primero.
    """
    candidato = slug_base
    sufijo = 2
    ids_en_cola = {d['id'] for d in cola}

    def ya_existe(id_candidato):
        if id_candidato in ids_en_cola:
            return True
        proyecto_existente, _ = almacen.obtener_proyecto(id_candidato)
        return proyecto_existente is not None

    while ya_existe(candidato):
        candidato = f'{slug_base}-{sufijo}'
        sufijo += 1
    return candidato


# --------------------------------------------------------------------
# MÓDULO 1 — Carga de documentos
# --------------------------------------------------------------------

@app.route('/admin/api/cola', methods=['GET'])
def api_obtener_cola():
    return jsonify(cargar_cola())


@app.route('/admin/api/upload', methods=['POST'])
def api_upload():
    """
    Carga individual, múltiple o por lotes: el cliente puede mandar 1
    o N archivos en el mismo request (campo 'archivos'). Cada archivo
    se procesa de forma independiente: si uno falla (no es PDF, está
    duplicado), no afecta a los demás.
    """
    archivos = request.files.getlist('archivos')
    if not archivos:
        return jsonify({'error': 'No se recibió ningún archivo.'}), 400

    cola = cargar_cola()
    hashes_existentes = {d['hash']: d['id'] for d in cola if d.get('hash')}
    agregados = []

    for archivo in archivos:
        nombre_original = archivo.filename or 'sin-nombre.pdf'

        if not nombre_original.lower().endswith('.pdf'):
            registrar_error(None, nombre_original, 'formato_invalido', 'El archivo no tiene extensión .pdf.')
            continue

        slug = slug_desde_nombre(nombre_original)
        doc_id = id_unico(cola, slug)
        ruta_destino = DIR_ENTRANTES / f'{doc_id}.pdf'
        archivo.save(ruta_destino)

        hash_archivo = calcular_hash(ruta_destino)
        tamano_bytes = ruta_destino.stat().st_size

        if hash_archivo in hashes_existentes:
            registrar_error(doc_id, nombre_original, 'pdf_duplicado',
                             f'Mismo contenido que el documento "{hashes_existentes[hash_archivo]}".')
            entrada = {
                'id': doc_id,
                'nombre_archivo': nombre_original,
                'tamano_bytes': tamano_bytes,
                'fecha_carga': datetime.now(timezone.utc).isoformat(),
                'estado': 'Error',
                'hash': hash_archivo,
                'unidad_academica': request.form.get('unidad_academica') or None,
                'anio': int(request.form['anio']) if request.form.get('anio') else None,
                'detalle_error': f'PDF duplicado (mismo contenido que "{hashes_existentes[hash_archivo]}").',
            }
        else:
            hashes_existentes[hash_archivo] = doc_id
            entrada = {
                'id': doc_id,
                'nombre_archivo': nombre_original,
                'tamano_bytes': tamano_bytes,
                'fecha_carga': datetime.now(timezone.utc).isoformat(),
                'estado': 'Pendiente',
                'hash': hash_archivo,
                'unidad_academica': request.form.get('unidad_academica') or None,
                'anio': int(request.form['anio']) if request.form.get('anio') else None,
                'detalle_error': None,
            }

        cola.append(entrada)
        agregados.append(entrada)

    guardar_cola(cola)
    return jsonify({'agregados': agregados, 'cola': cola})


# --------------------------------------------------------------------
# MÓDULO 2 — Scrapeo y extracción (modo rápido)
# --------------------------------------------------------------------

def _procesar_documento(doc_id):
    """
    Núcleo del modo rápido, sin nada de Flask: lo llaman tanto el
    endpoint de "procesar uno" como el de "procesar pendientes" (lote),
    para no duplicar la lógica entre el caso individual y el caso
    batch. Devuelve (doc actualizado, error_http) — error_http es None
    si salió bien, o (mensaje, codigo) si el documento ni existía o no
    estaba en un estado procesable.
    """
    cola = cargar_cola()
    doc = buscar_doc(cola, doc_id)
    if not doc:
        return None, (f'No existe el documento "{doc_id}" en la cola.', 404)

    if doc['estado'] not in ('Pendiente', 'Error'):
        return None, (f'El documento está en estado "{doc["estado"]}", no se reprocesa.', 400)

    doc['estado'] = 'Procesando'
    guardar_cola(cola)

    ruta_pdf = DIR_ENTRANTES / f'{doc_id}.pdf'
    try:
        borrador = extraer_poster.generar_borrador_desde_pdf(
            ruta_pdf, doc_id, unidad=doc.get('unidad_academica'), anio=doc.get('anio'),
            dir_borradores=DIR_BORRADORES,
        )
        # pdf_fuente queda apuntando a donde vivirá el archivo una vez
        # publicado (almacen.transicionar_estado copia el PDF real a esa
        # ruta en el momento de publicar). Sin esto, "PDF fuente" sería
        # un campo bloqueante imposible de completar antes de publicar.
        ruta_borrador_json = DIR_BORRADORES / f'{doc_id}.json'
        borrador['pdf_fuente'] = f'pdf-fuente/{doc_id}.pdf'
        ruta_borrador_json.write_text(json.dumps(borrador, ensure_ascii=False, indent=2), encoding='utf-8')

        doc['estado'] = 'Extraído'
        doc['detalle_error'] = None
        doc['advertencias'] = borrador.get('_advertencias', [])
        doc['fuente_extraccion'] = borrador.get('_fuente_extraccion')
        almacen.registrar_evento_historial(doc_id, 'extraccion', None, 'pendiente', doc.get('usuario'))
    except Exception as error:  # noqa: BLE001 — se registra y se sigue con el resto del lote
        doc['estado'] = 'Error'
        doc['detalle_error'] = str(error)
        print(f'[admin] Error procesando {doc_id}:\n{traceback.format_exc()}')  # detalle técnico solo en el log del servidor
        registrar_error(doc_id, doc['nombre_archivo'], 'error_extraccion',
                         f'No se pudo extraer el contenido del PDF: {error}')

    guardar_cola(cola)
    return doc, None


@app.route('/admin/api/procesar/<doc_id>', methods=['POST'])
def api_procesar_uno(doc_id):
    """Modo rápido para UN documento: PDF -> extracción automática ->
    borrador. Nunca publica directo; el resultado siempre queda en
    "Extraído" (estado_revision "pendiente") esperando revisión."""
    doc, error = _procesar_documento(doc_id)
    if error:
        mensaje, codigo = error
        return jsonify({'error': mensaje}), codigo
    return jsonify(doc)


@app.route('/admin/api/procesar-pendientes', methods=['POST'])
def api_procesar_pendientes():
    """Botón "Procesar pendientes" del lote: corre el modo rápido sobre
    todos los documentos en estado Pendiente, uno por uno, sin que el
    error de uno frene a los siguientes."""
    cola_inicial = cargar_cola()
    pendientes = [d['id'] for d in cola_inicial if d['estado'] == 'Pendiente']
    for doc_id in pendientes:
        _procesar_documento(doc_id)
    return jsonify({'procesados': len(pendientes), 'cola': cargar_cola()})


# --------------------------------------------------------------------
# MÓDULO 3 — Revisión y corrección
# --------------------------------------------------------------------

@app.route('/admin/api/proyectos', methods=['GET'])
def api_listar_proyectos():
    """Lista unificada (borradores + publicados + archivados), con
    filtros opcionales — es la base de la "Gestión de borradores"."""
    proyectos = almacen.listar_proyectos(
        filtro_estado=request.args.get('estado') or None,
        filtro_unidad=request.args.get('unidad_academica') or None,
        filtro_anio=request.args.get('anio') or None,
    )
    return jsonify(proyectos)


@app.route('/admin/api/proyecto/<doc_id>', methods=['GET'])
def api_obtener_proyecto(doc_id):
    proyecto, _ = almacen.obtener_proyecto(doc_id)
    if not proyecto:
        return jsonify({'error': f'No existe el proyecto "{doc_id}".'}), 404
    proyecto = almacen.asegurar_configuracion_presentacion(proyecto)
    proyecto['_validacion'] = almacen.validar_para_revision(proyecto)
    return jsonify(proyecto)


@app.route('/admin/api/proyecto/<doc_id>/auditoria', methods=['GET'])
def api_obtener_auditoria(doc_id):
    return jsonify(almacen.obtener_auditoria(doc_id))


@app.route('/admin/api/proyecto/<doc_id>/campo', methods=['PATCH'])
def api_guardar_campo(doc_id):
    """Autosave de un campo del editor. El cliente llama esto en cada
    blur/cambio (con debounce), no hay botón "Guardar" separado."""
    cuerpo = request.get_json(force=True) or {}
    campo = cuerpo.get('campo')
    valor = cuerpo.get('valor')
    usuario = cuerpo.get('usuario')

    if not campo:
        return jsonify({'error': 'Falta el campo "campo" en el body.'}), 400

    proyecto, error = almacen.guardar_correccion_campo(doc_id, campo, valor, usuario)
    if error:
        return jsonify({'error': error}), 404

    proyecto['_validacion'] = almacen.validar_para_revision(proyecto)
    return jsonify(proyecto)


@app.route('/admin/api/proyecto/<doc_id>/configuracion', methods=['PUT'])
def api_guardar_configuracion(doc_id):
    """Guarda el editor visual de bloques: orden, ocultos, destacado,
    imagen principal/portada. No modifica contenido, solo presentación."""
    cuerpo = request.get_json(force=True) or {}
    configuracion = cuerpo.get('configuracion', {})
    usuario = cuerpo.get('usuario')

    proyecto, error = almacen.guardar_configuracion_presentacion(doc_id, configuracion, usuario)
    if error:
        return jsonify({'error': error}), 404
    return jsonify(proyecto)


@app.route('/admin/api/proyecto/<doc_id>/pdf', methods=['GET'])
def api_servir_pdf(doc_id):
    """Sirve el PDF original para mostrarlo junto a los campos durante
    la revisión, esté publicado o todavía no."""
    candidato_entrante = DIR_ENTRANTES / f'{doc_id}.pdf'
    candidato_publico = RAIZ_PROYECTO / 'pdf-fuente' / f'{doc_id}.pdf'
    if candidato_entrante.exists():
        return send_from_directory(DIR_ENTRANTES, f'{doc_id}.pdf')
    if candidato_publico.exists():
        return send_from_directory(RAIZ_PROYECTO / 'pdf-fuente', f'{doc_id}.pdf')
    return jsonify({'error': 'No se encontró el PDF original de este proyecto.'}), 404


# --------------------------------------------------------------------
# MÓDULO 4 — Aprobación y publicación
# --------------------------------------------------------------------

@app.route('/admin/api/proyecto/<doc_id>/transicion', methods=['POST'])
def api_transicion(doc_id):
    cuerpo = request.get_json(force=True) or {}
    nuevo_estado = cuerpo.get('nuevo_estado')
    usuario = cuerpo.get('usuario')

    if not nuevo_estado:
        return jsonify({'error': 'Falta "nuevo_estado" en el body.'}), 400

    exito, mensaje = almacen.transicionar_estado(doc_id, nuevo_estado, usuario)
    if not exito:
        return jsonify({'error': mensaje}), 400
    return jsonify({'mensaje': mensaje})


@app.route('/admin/api/proyectos/transicion-lote', methods=['POST'])
def api_transicion_lote():
    """Operaciones masivas: aprobar varios, publicar varios, archivar
    varios. Un id que falla no frena a los demás del lote."""
    cuerpo = request.get_json(force=True) or {}
    ids = cuerpo.get('ids', [])
    nuevo_estado = cuerpo.get('nuevo_estado')
    usuario = cuerpo.get('usuario')

    if not ids or not nuevo_estado:
        return jsonify({'error': 'Faltan "ids" o "nuevo_estado" en el body.'}), 400

    resultados = almacen.transicionar_lote(ids, nuevo_estado, usuario)
    return jsonify({'resultados': resultados})


# --------------------------------------------------------------------
# Errores e historial (sección de errores del enunciado)
# --------------------------------------------------------------------

@app.route('/admin/api/errores', methods=['GET'])
def api_errores():
    return jsonify(cargar_errores())


@app.route('/admin/api/categorias', methods=['GET'])
def api_categorias():
    return jsonify(_leer_json(RUTA_CATEGORIAS, {'unidades_academicas': [], 'instituciones_cooperantes': [], 'etiquetas_sugeridas': []}))


# --------------------------------------------------------------------
# Servir el frontend estático del panel
# --------------------------------------------------------------------

@app.route('/')
@app.route('/admin/')
def index():
    return send_from_directory(DIR_ADMIN / 'static', 'admin.html')


@app.route('/admin/revision')
def pagina_revision():
    return send_from_directory(DIR_ADMIN / 'static', 'revision.html')


@app.route('/admin/editor')
def pagina_editor():
    return send_from_directory(DIR_ADMIN / 'static', 'editor.html')


@app.route('/admin/preview')
def pagina_preview():
    return send_from_directory(DIR_ADMIN / 'static', 'preview.html')


# El preview reutiliza el CSS y los módulos JS reales del sitio público
# (no una copia): se exponen de solo lectura bajo /admin/publico/, pero
# solo las carpetas que hacen falta (no todo el proyecto).
PREFIJOS_PUBLICOS_PERMITIDOS = ('css/', 'js/', 'assets/')


@app.route('/admin/publico/<path:ruta>')
def servir_publico(ruta):
    if not ruta.startswith(PREFIJOS_PUBLICOS_PERMITIDOS):
        return jsonify({'error': 'Ruta no permitida.'}), 404
    return send_from_directory(RAIZ_PROYECTO, ruta)


if __name__ == '__main__':
    print('Panel administrativo BDE-UNaM — http://127.0.0.1:5050/')
    print('Este servidor es de uso interno. No exponer a internet sin autenticación.')
    app.run(host='127.0.0.1', port=5050, debug=True)
