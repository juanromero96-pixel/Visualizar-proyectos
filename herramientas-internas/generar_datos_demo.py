#!/usr/bin/env python3
"""
generar_datos_demo.py
Herramienta interna de uso puntual — NO es parte del pipeline de
producción. Genera proyectos de DEMOSTRACIÓN, explícitamente marcados
('demo': true en el JSON, título con prefijo "[Demo]"), para poder
probar la experiencia de "varios proyectos por unidad académica" y el
swipe entre hojas sin inventar datos institucionales reales.

Pedido explícito del usuario: "no es necesario que sean reales si se
aclara que son datos de demo... dejarlo identificado como demo interno."

Uso: python3 herramientas-internas/generar_datos_demo.py
Es idempotente respecto al catálogo real: solo agrega entradas nuevas
con id 'demo-...', nunca toca ni reemplaza las 6 fichas reales.
"""
import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA_CATALOGO = RAIZ / 'data' / 'catalog.json'
DIR_PROYECTOS = RAIZ / 'data' / 'proyectos'

# (unidad, [(titulo, etiquetas, anio), ...])
TEMAS_DEMO = {
    'fhycs': [
        ('Talleres de alfabetización mediática', ['comunicacion', 'educacion'], 2025),
        ('Radio comunitaria universitaria', ['comunicacion', 'comunidad'], 2024),
        ('Archivo oral de memoria barrial', ['cultura', 'comunidad'], 2023),
        ('Producción de podcasts educativos', ['comunicacion', 'educacion'], 2022),
    ],
    'fce': [
        ('Asesoramiento a cooperativas de trabajo', ['economia-social', 'desarrollo-territorial'], 2025),
        ('Educación financiera comunitaria', ['economia-social', 'educacion'], 2024),
        ('Acompañamiento a ferias de economía popular', ['economia-social', 'comunidad'], 2023),
        ('Diagnóstico de emprendimientos familiares', ['economia-social', 'desarrollo-territorial'], 2022),
    ],
    'fceqyn': [
        ('Monitoreo de calidad del aire urbano', ['ambiente', 'salud-comunitaria'], 2025),
        ('Talleres de ciencia comunitaria', ['educacion', 'comunidad'], 2024),
        ('Análisis de suelos en huertas escolares', ['ambiente', 'educacion'], 2023),
        ('Educación en gestión de residuos', ['ambiente', 'educacion'], 2022),
    ],
    'fcf': [
        ('Restauración de bordes de cursos de agua', ['ambiente', 'agua'], 2025),
        ('Vivero comunitario, segunda etapa', ['reforestacion', 'comunidad'], 2024),
        ('Capacitación en manejo forestal sostenible', ['reforestacion', 'educacion'], 2023),
        ('Relevamiento de arbolado urbano', ['ambiente', 'reforestacion'], 2022),
    ],
    'fi': [
        ('Mantenimiento de equipamiento escolar rural', ['tecnologia', 'comunidad'], 2025),
        ('Talleres de robótica educativa', ['tecnologia', 'educacion'], 2024),
        ('Diagnóstico energético de edificios públicos', ['energia', 'desarrollo-territorial'], 2023),
        ('Acceso a internet comunitario', ['tecnologia', 'comunidad'], 2022),
    ],
    'fayd': [
        ('Diseño de señalética comunitaria', ['arte', 'comunidad'], 2025),
        ('Taller de serigrafía popular', ['arte', 'cultura'], 2024),
        ('Identidad visual para organizaciones sociales', ['arte', 'comunidad'], 2023),
        ('Itinerancia de muestra fotográfica', ['arte', 'cultura'], 2022),
    ],
    'eae': [
        ('Huerta orgánica escolar', ['ambiente', 'educacion'], 2025),
        ('Capacitación en injertos frutales', ['educacion', 'desarrollo-territorial'], 2024),
        ('Feria de productos agropecuarios estudiantiles', ['economia-social', 'comunidad'], 2023),
        ('Manejo sustentable de suelos de chacra', ['ambiente', 'educacion'], 2022),
        ('Producción de plantines forestales', ['reforestacion', 'educacion'], 2021),
    ],
}


def slug(texto):
    """
    Antes esto reemplazaba tildes a mano una por una (á,é,í,ó,ú) y se
    olvidó la ñ — terminó generando ids con "ñ" cruda, que en algunas
    terminales/Git de Windows se mostraba mal codificada. Usar
    unicodedata para sacar CUALQUIER acento de forma genérica evita que
    vuelva a pasar con cualquier otro caracter que se nos escape.
    """
    sin_acentos = unicodedata.normalize('NFKD', texto.lower())
    sin_acentos = ''.join(c for c in sin_acentos if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', sin_acentos).strip('-')


def construir_ficha(unidad_id, titulo, etiquetas, anio, indice):
    id_proyecto = f'demo-{unidad_id}-{slug(titulo)[:40]}'
    return id_proyecto, {
        'id': id_proyecto,
        'titulo': f'[Demo] {titulo}',
        'resolucion': None,
        'unidad_academica': unidad_id,
        'programa_carrera_area': 'Dato de demostración',
        'resumen': f'Proyecto de demostración para probar la visualización de varios expedientes por unidad académica. No representa un proyecto real de extensión todavía cargado.',
        'problema': 'Dato de demostración: pendiente de reemplazo por contenido real extraído de un póster.',
        'objetivo_general': 'Dato de demostración: pendiente de reemplazo por contenido real.',
        'objetivos_especificos': [],
        'acciones': ['Dato de demostración — pendiente de carga real.'],
        'resultados_aportes': ['Dato de demostración — pendiente de carga real.'],
        'responsables': ['Equipo docente (dato de demostración)'],
        'contacto': 'demo@unam.edu.ar',
        'instituciones_cooperantes': [unidad_id],
        'cita_destacada': None,
        'imagenes': [],
        'videos': [],
        'pdf_fuente': None,
        'anio': anio,
        'etiquetas': etiquetas,
        'estado_revision': 'publicado',
        'demo': True,
    }


def main():
    catalogo = json.loads(RUTA_CATALOGO.read_text(encoding='utf-8'))
    ids_existentes = {p['id'] for p in catalogo}
    agregados = 0

    for unidad_id, temas in TEMAS_DEMO.items():
        for indice, (titulo, etiquetas, anio) in enumerate(temas):
            id_proyecto, ficha = construir_ficha(unidad_id, titulo, etiquetas, anio, indice)
            if id_proyecto in ids_existentes:
                continue

            DIR_PROYECTOS.mkdir(parents=True, exist_ok=True)
            (DIR_PROYECTOS / f'{id_proyecto}.json').write_text(
                json.dumps(ficha, ensure_ascii=False, indent=2), encoding='utf-8'
            )

            catalogo.append({
                'id': id_proyecto,
                'titulo': ficha['titulo'],
                'unidad_academica': unidad_id,
                'programa_carrera_area': ficha['programa_carrera_area'],
                'resumen': ficha['resumen'],
                'anio': anio,
                'etiquetas': etiquetas,
                'destacado': False,
                'estado_revision': 'publicado',
                'imagen_portada': None,
                'demo': True,
            })
            agregados += 1

    RUTA_CATALOGO.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Proyectos demo agregados: {agregados}')
    print(f'Total de entradas en catalog.json: {len(catalogo)}')


if __name__ == '__main__':
    main()
