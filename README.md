# Compendio Digital · Semana Regional de la Extensión UNaM

Mural documental interactivo de la Primera Semana Regional de la Extensión Universitaria (Universidad Nacional de Misiones), organizado en torno a sus tres sedes regionales — Posadas, Oberá y Eldorado. Cada sede presenta testimonios, registros institucionales y material audiovisual, compuestos editorialmente por un motor propio en vez de una grilla fija.

**Stack:** HTML/CSS/JavaScript sin frameworks ni dependencias de compilación en el frontend. Backend Node.js (Express) opcional, que administra el contenido como archivos JSON versionados — ver `backend/README.md` para su puesta en marcha.

---

## Puesta en marcha rápida

**Solo el mural (sin backend, sin edición):**
```bash
python3 -m http.server 8000
```
Abrir `http://localhost:8000/`. El sitio funciona igual de bien así: si no hay backend disponible, `js/storage.js` cae automáticamente a los archivos estáticos de `data/`.

**Con backend (persistencia real, panel de edición, historial):**
```bash
cd backend
npm install
cp .env.example .env        # completar SESION_SECRETO
npm run crear-usuario        # crea el primer usuario, interactivo
npm start
```
Con el backend corriendo, servir el frontend desde el mismo origen (o configurar `ORIGEN_PERMITIDO` en `.env`). El panel de edición vive en `/admin.html`.

---

## Estructura

```
index.html              mural público
admin.html · login.html  panel de edición y acceso
css/                     estilos (identidad visual, mobile, panel)
js/                      Motor Editorial, Laboratorio de calibración, panel
data/                    corpus estático de respaldo (fuente cuando no hay backend)
assets/                  fotografías, videos, logos
backend/                 servidor Node.js — ver backend/README.md
almacen/                 datos administrados por el backend (por edición/año)
```

## El corpus

Tres archivos JSON por edición (`data/` o `almacen/ediciones/<año>/data/`):

| Archivo | Contiene |
|---|---|
| `testimonios.json` | Citas de autoridades y equipos, atribuidas a una sede |
| `registros.json` | Experiencias institucionales por Unidad Académica (`experiencia_ua`) y piezas conceptuales |
| `multimedia.json` | Videos de YouTube embebidos, ligados a una sede y Unidad Académica |
| `sedes.json` | Las tres sedes: nombre, unidades académicas, fondo |

Cada elemento lleva una posición preferida (`x`/`y`, en porcentaje) que el Motor Editorial usa como **ancla de búsqueda**, no como coordenada final: la posición real la calcula el algoritmo de distribución (`js/layout.js`) según el dispositivo y el resto de elementos visibles en ese momento. `ordenNarrativo` gobierna el orden de aparición y de tabulación, no la posición.

**Contenido de alcance institucional (no ligado a una sola sede):** un elemento puede marcarse con `alcanceInstitucional: true` en vez de fijar una `sede`. El Motor Editorial lo incluye en las tres sedes a partir de ese único registro, sin triplicar el JSON — es el mecanismo que usa, por ejemplo, el testimonio del Área de Graduados.

## Cómo agregar contenido

**Con backend:** desde el panel (`/admin.html`), que valida el esquema, guarda un respaldo automático antes de cada escritura y registra el cambio en el historial de auditoría.

**Sin backend:** editar directamente el archivo JSON correspondiente en `data/`, siguiendo la forma de los elementos existentes. Los campos mínimos de cada tipo están documentados en los propios archivos por el ejemplo de sus elementos actuales.

## Seguridad

El acceso al panel de edición se verifica en el backend (hash `argon2id`, cookie de sesión firmada). Si el backend no está desplegado, existe un respaldo de acceso básico en `js/login.js`, documentado en el propio archivo como protección contra el acceso casual — no como autenticación de producción. Antes de una publicación institucional, desplegar el backend es la vía correcta.

## Laboratorio de calibración (`/calibrar`)

Herramienta de medición en tiempo real del comportamiento del Motor Editorial en el dispositivo desde el que se accede: ocupación del lienzo, balance visual, estabilidad temporal. Es puramente observacional — no modifica el layout ni el contenido. Pensada para calibrar los parámetros del motor con evidencia de dispositivos reales, no con estimaciones.

## Documentación adicional

`backend/README.md` cubre la puesta en marcha, estructura y variables de entorno del backend en detalle.
