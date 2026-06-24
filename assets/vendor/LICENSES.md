# Librerías de terceros (assets/vendor/)

Archivos de distribución (build de producción, minificados), sin dependencias
de Node ni paso de build para el sitio público. Se actualizan reemplazando el
archivo correspondiente por una versión más nueva del mismo build; no
requieren cambios de código salvo que la librería cambie su API pública.

| Archivo | Librería | Versión | Licencia | Uso en este proyecto |
|---|---|---|---|---|
| `swiper-bundle.min.js`, `swiper-bundle.min.css` | [Swiper](https://github.com/nolimits4web/swiper) | 12.2.0 | MIT | Carrusel de proyectos destacados en portada (`js/carrusel.js`) |
| `gsap.min.js` | [GSAP](https://github.com/greensock/GSAP) | 3.15.0 | MIT (núcleo gratuito desde la adquisición por Webflow) | Transiciones y entradas escalonadas (`js/animaciones.js`) |
| `bootstrap-grid.min.css` | [Bootstrap](https://github.com/twbs/bootstrap) — build **grid-only** | 5.3.8 | MIT | Layout de dos columnas de la ficha individual (`js/render-ficha.js`) |

## Por qué un build "grid-only" de Bootstrap y no el framework completo

Se incluye deliberadamente solo `bootstrap-grid.min.css` (≈50 KB), generado a
partir de `dist/css/bootstrap-grid.min.css` del repositorio oficial. Este
archivo contiene únicamente el sistema de grilla (`container`, `row`, `col-*`,
utilidades de gutter y de visibilidad) y **no** incluye el reset global, la
tipografía ni el theming de componentes (botones, tarjetas, navbar, etc.) del
`bootstrap.min.css` completo. Tampoco se incluye `bootstrap.bundle.min.js`:
no se usa ningún componente interactivo de Bootstrap (el menú mobile y los
demás componentes ya están resueltos con código propio en `layout.js`).

Esta elección es la que permite cumplir el requisito de usar Bootstrap "para
layout y responsive, no para convertir la web en un sitio genérico de
plantilla": no hay ningún botón, tarjeta o componente con apariencia de
Bootstrap en el sitio, porque ese CSS nunca se cargó.
