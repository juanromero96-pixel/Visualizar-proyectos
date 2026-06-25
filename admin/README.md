# Panel administrativo — instalación y uso

Uso interno exclusivo del personal de la Secretaría de Extensión. No es parte
del sitio público y no debe exponerse a internet sin autenticación.

## Instalación (una sola vez)

Requiere Python 3.9+ y, para la extracción, Tesseract OCR + Poppler instalados
a nivel de sistema (una sola vez por máquina).

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-spa poppler-utils
```

**En Windows**, Tesseract y Poppler no son paquetes de Python — son programas
aparte que hay que descargar e instalar:
- Tesseract: https://github.com/UB-Mannheim/tesseract-ocr/wiki (instalador, marcar el idioma español durante la instalación)
- Poppler: https://github.com/oschwartz10612/poppler-windows/releases

Si después de instalar Poppler sigue apareciendo `Unable to get page count.
Is poppler installed and in PATH?`, lo más probable es que el PATH de
Windows no se haya propagado a la terminal (pasa seguido, incluso en una
terminal nueva — a veces hace falta reiniciar la máquina). En vez de seguir
peleando con el PATH, se le puede indicar la ruta directamente, en la misma
terminal donde se va a correr el servidor:

```cmd
set RUTA_POPPLER=C:\poppler-26.02.0\Library\bin
python3 admin\server.py
```

(usar `set`, no `setx`: así toma efecto inmediato en esa terminal, sin
depender de que Windows guarde la variable correctamente). Hay que volver a
escribir ese `set` cada vez que se abre una terminal nueva — si se quiere
que sea permanente, se puede agregar esa misma línea a un script `.bat` que
arranque el servidor.

**Entorno virtual (recomendado).** Desde la raíz del proyecto (la carpeta que
contiene `admin/`, `data/`, `index.html`):

```bash
python3 -m venv venv
source venv/bin/activate          # en Windows: venv\Scripts\activate
pip install -r admin/requirements.txt
```

A partir de acá, cada vez que se vaya a usar el panel hay que activar el
entorno (`source venv/bin/activate`) antes de correr `python3 admin/server.py`.

**Alternativa sin entorno virtual** (Python del sistema en Debian/Ubuntu, que
bloquea `pip install` directo por estar "externally managed"):

```bash
cd admin
pip install -r requirements.txt --break-system-packages
```

Si después de instalar igual aparece `ModuleNotFoundError: No module named
'flask'`, casi siempre es porque `python3 admin/server.py` se está corriendo
con un Python distinto al que tiene el entorno activado (por ejemplo, dos
instalaciones de Python en la misma máquina). Verificar con:

```bash
which python3 && python3 -m pip show flask
```

## Uso

```bash
cd admin
python3 server.py
```

Abrir `http://127.0.0.1:5050/` en el navegador (en la misma máquina; si se
corre en un servidor interno, reemplazar por la IP/host correspondiente).

## Qué hace esta primera entrega (Módulos 1 y 2 — modo rápido)

- **Carga**: individual, múltiple o por lotes, arrastrando archivos o
  eligiéndolos desde la carpeta. Detecta PDFs duplicados por contenido
  (no por nombre) y no los reprocesa.
- **Cola**: cada documento cargado queda visible con nombre, tamaño, fecha y
  estado (Pendiente, Procesando, Extraído, Error).
- **Extracción (modo rápido)**: botón "Procesar pendientes" corre el mismo
  pipeline de `herramientas-internas/extraccion/extraer_poster.py` sobre
  todos los documentos pendientes, uno por uno. Si uno falla (PDF dañado,
  no es un PDF real, etc.), se marca "Error" con un mensaje legible y el
  resto del lote sigue procesándose.
- **Errores**: todo error de carga o extracción queda en un registro visible
  en el panel, sin detener el resto del lote.

El resultado de la extracción es siempre un borrador en
`herramientas-internas/_borradores/{id}.json`, en estado `"pendiente"`.
**Todavía no hay manera de revisarlo, corregirlo ni publicarlo desde el
panel** — eso es exactamente el próximo bloque (Módulo 3: revisión y
corrección con comparación contra el PDF, editor de bloques; Módulo 4:
vista previa con los estilos reales del sitio público y publicación).
Mientras tanto, un borrador generado por el panel se puede revisar y
promover a mano con `promover_borrador.py`, igual que los generados por la
línea de comandos.

## Carpetas que usa (todas fuera del sitio público)

- `admin/_entrantes/` — PDFs recién subidos, antes de revisión.
- `admin/estado/cola.json` — estado de cada documento cargado.
- `admin/estado/historial-errores.json` — registro de errores, no se borra.
- `herramientas-internas/_borradores/` — salida de la extracción (compartida
  con el flujo de línea de comandos).
