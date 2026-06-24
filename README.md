# Biblioteca Digital de Proyectos de Extensión — UNaM

Catálogo institucional de proyectos de extensión universitaria. Sitio
público estático (HTML/CSS/JS, sin build, sin backend) + panel
administrativo interno (Flask) para cargar, extraer, revisar y publicar
proyectos desde los pósters PDF originales.

```
index.html, css/, js/, data/, assets/, pdf-fuente/   → sitio público (estático)
admin/                                                → panel interno (Flask, local)
herramientas-internas/                                → pipeline de extracción + validador
```

## 1. Ver el sitio público en local

**El sitio NO funciona abierto como archivo (`file://...`).** Usa módulos
JavaScript (`import`/`export`) y `fetch()` para leer los JSON de `/data`;
ambas cosas, los navegadores las bloquean fuera de un servidor HTTP. Si lo
abrís haciendo doble clic en `index.html`, vas a ver un aviso explicándolo en
la propia página.

Elegí cualquiera de estas opciones, desde la raíz del proyecto:

```bash
# Python (ya viene instalado en Mac/Linux; en Windows, instalar Python)
python3 -m http.server 8000

# Node, sin instalar nada de forma permanente
npx serve .

# VS Code: extensión "Live Server" → clic derecho en index.html → "Open with Live Server"
```

Después abrir `http://localhost:8000/` (o el puerto que indique la
herramienta elegida) en el navegador.

## 2. Panel administrativo (local, Python + Flask)

Es una herramienta interna para la Secretaría de Extensión. No es parte del
sitio público y no se despliega en Vercel.

```bash
# una sola vez por máquina:
sudo apt-get install tesseract-ocr tesseract-ocr-spa poppler-utils
python3 -m venv venv
source venv/bin/activate          # en Windows: venv\Scripts\activate
pip install -r admin/requirements.txt

# cada vez que se use:
source venv/bin/activate
python3 admin/server.py
```

Abrir `http://127.0.0.1:5050/`. Detalle completo, incluyendo qué hacer si
aparece `ModuleNotFoundError: No module named 'flask'`, en
[`admin/README.md`](admin/README.md).

## 3. Desplegar el sitio público en Vercel

El sitio es estático y no necesita build. Dos formas equivalentes:

**Desde el dashboard de Vercel:**
1. Importar el repositorio (o arrastrar la carpeta del proyecto en
   [vercel.com/new](https://vercel.com/new)).
2. Framework Preset: **Other**.
3. Build Command: vacío. Output Directory: dejar el valor por defecto (la
   raíz del proyecto).
4. Deploy.

**Con la CLI de Vercel**, desde la raíz del proyecto:

```bash
npx vercel        # primer despliegue (preview)
npx vercel --prod # a producción
```

`vercel.json` ya incluye la única configuración necesaria: redirigir
cualquier ruta a `index.html` para que el router por hash (`#/catalogo`,
`#/proyecto/...`) lo resuelva del lado del cliente, en vez de mostrar el 404
genérico de Vercel ante una ruta directa. `.vercelignore` excluye `admin/` y
`herramientas-internas/`: ese código no debe quedar accesible desde un
hosting público (son herramientas internas, y `herramientas-internas/`
puede contener borradores sin revisar).

## 4. Verificación rápida de que todo sigue sano

```bash
node herramientas-internas/validar-datos.js
```

Valida `data/catalog.json` y cada ficha de `data/proyectos/` contra los
campos obligatorios y el catálogo controlado de `data/categorias.json`.

## Documentación por módulo

- [`admin/README.md`](admin/README.md) — panel administrativo: instalación, uso, qué hace cada módulo.
- [`herramientas-internas/extraccion/README.md`](herramientas-internas/extraccion/README.md) — pipeline de extracción PDF → borrador → publicación por línea de comandos.
