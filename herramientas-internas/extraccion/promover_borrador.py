#!/usr/bin/env python3
"""
promover_borrador.py
Herramienta interna — NO se publica en el sitio. Es el paso que cierra
el flujo de la sección 22 del Documento Técnico (PDF -> extracción ->
revisión humana -> validación -> publicación):

  herramientas-internas/_borradores/{id}.json   (editado a mano)
        |  (esta herramienta)
        v
  data/proyectos/{id}.json  +  entrada nueva en data/catalog.json

No promueve nada automáticamente "porque sí": exige que el borrador ya
tenga estado_revision = "validado" (lo pone la persona revisora, no el
script) y que no queden campos obligatorios vacíos. Si falta algo,
rechaza la promoción y dice exactamente qué falta.

Uso:
  python3 promover_borrador.py <id_proyecto>

Qué hace:
  1. Lee herramientas-internas/_borradores/<id>.json
  2. Verifica que esté en estado_revision = "validado"
  3. Quita los campos internos (los que empiezan con "_")
  4. Cambia estado_revision a "publicado"
  5. Corre las mismas reglas de validar-datos.js (reimplementadas aquí
     en Python para no depender de Node) sobre la ficha resultante
  6. Si todo está bien: escribe data/proyectos/<id>.json y agrega/
     actualiza la entrada correspondiente en data/catalog.json
  7. Si algo está mal: no escribe nada y lista los problemas
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DIR_BORRADORES = RAIZ / '_borradores'
DIR_PROYECTOS = RAIZ.parent / 'data' / 'proyectos'
RUTA_CATALOGO = RAIZ.parent / 'data' / 'catalog.json'
RUTA_CATEGORIAS = RAIZ.parent / 'data' / 'categorias.json'

# Campos que BLOQUEAN la publicación. Coincide a propósito con
# almacen.CAMPOS_BLOQUEANTES (admin/almacen.py): "No publicar si falta
# título, unidad académica, año, PDF fuente". El resto de los campos
# (problema, objetivo, resultados, contacto, etc.) generan advertencia
# en el editor pero NO bloquean — "permitir publicar igualmente" fue
# una regla explícita, no un descuido. Si se cambia esta lista, hay que
# cambiar la misma lista en almacen.py o el banner del editor dejará de
# predecir correctamente si la publicación va a aceptarse.
CAMPOS_OBLIGATORIOS = ['id', 'titulo', 'unidad_academica', 'anio', 'pdf_fuente', 'estado_revision']
CAMPOS_CATALOGO = [
    'id', 'titulo', 'unidad_academica', 'programa_carrera_area',
    'resumen', 'anio', 'etiquetas', 'destacado', 'estado_revision', 'imagen_portada',
]


def cargar(ruta):
    return json.loads(ruta.read_text(encoding='utf-8'))


def guardar(ruta, datos):
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def validar_para_publicar(ficha, unidades_validas):
    problemas = []
    for campo in CAMPOS_OBLIGATORIOS:
        valor = ficha.get(campo)
        if valor in (None, '', []):
            problemas.append(f'falta o está vacío el campo obligatorio "{campo}"')

    if ficha.get('unidad_academica') and ficha['unidad_academica'] not in unidades_validas:
        problemas.append(f'unidad_academica "{ficha["unidad_academica"]}" no existe en categorias.json')

    return problemas


def promover(id_proyecto, dir_borradores=None):
    """
    Versión importable de lo que hace main(): la usa tanto la CLI como
    el panel /admin. Devuelve (exito: bool, mensajes: list[str]).
    No lanza excepción en el caso esperado de "faltan campos": eso es
    un resultado normal del flujo, no un error de programa.
    """
    dir_borradores = Path(dir_borradores) if dir_borradores else DIR_BORRADORES
    ruta_borrador = dir_borradores / f'{id_proyecto}.json'
    if not ruta_borrador.exists():
        return False, [f'No existe el borrador: {ruta_borrador}']

    borrador = cargar(ruta_borrador)

    if borrador.get('estado_revision') != 'validado':
        return False, [
            f'El borrador tiene estado_revision = "{borrador.get("estado_revision")}". '
            'Solo se promueven borradores en estado "validado" (Aprobado).'
        ]

    ficha = {clave: valor for clave, valor in borrador.items() if not clave.startswith('_')}
    ficha['estado_revision'] = 'publicado'

    categorias = cargar(RUTA_CATEGORIAS)
    unidades_validas = {u['id'] for u in categorias['unidades_academicas']}

    problemas = validar_para_publicar(ficha, unidades_validas)
    if problemas:
        return False, problemas

    DIR_PROYECTOS.mkdir(parents=True, exist_ok=True)
    guardar(DIR_PROYECTOS / f'{id_proyecto}.json', ficha)

    catalogo = cargar(RUTA_CATALOGO)
    entrada_catalogo = {campo: ficha.get(campo) for campo in CAMPOS_CATALOGO}
    entrada_catalogo['destacado'] = ficha.get('destacado') or False
    entrada_catalogo['imagen_portada'] = ficha.get('imagen_portada') or None

    catalogo = [p for p in catalogo if p['id'] != id_proyecto]
    catalogo.append(entrada_catalogo)
    guardar(RUTA_CATALOGO, catalogo)

    return True, [f'"{id_proyecto}" promovido a data/proyectos/{id_proyecto}.json y agregado a catalog.json.']


def main():
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 promover_borrador.py <id_proyecto>')

    exito, mensajes = promover(sys.argv[1])
    for mensaje in mensajes:
        print(mensaje)
    if not exito:
        sys.exit(1)
    print('Recordatorio: correr herramientas-internas/validar-datos.js sobre el lote completo antes de desplegar.')


if __name__ == '__main__':
    main()
