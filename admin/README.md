# Panel administrativo — instalación y uso

Uso interno exclusivo del personal de la Secretaría de Extensión. No es parte
del sitio público y no debe exponerse a internet sin autenticación.

## Instalación (una sola vez)

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-spa poppler-utils
cd admin
pip install -r requirements.txt --break-system-packages
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
