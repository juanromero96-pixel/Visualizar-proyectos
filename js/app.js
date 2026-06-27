/**
 * app.js
 * -----------------------------------------------------------------------
 * Arma la escena pública a partir de los datos en /data. La posición de
 * cada elemento ya no se fija acá: se deja como "ancla" en data-* y la
 * resuelve js/layout.js una vez que el elemento está en el DOM y se puede
 * medir su tamaño real.
 */
(async function iniciarSitio() {
  let sedes, testimonios, multimedia, config;
  try {
    [sedes, testimonios, multimedia, config] = await Promise.all([
      Almacen.cargar('sedes'),
      Almacen.cargar('testimonios'),
      Almacen.cargar('multimedia'),
      Almacen.cargar('config'),
    ]);
  } catch (error) {
    mostrarErrorCarga(error);
    return;
  }

  const sedesVisibles = sedes.filter((s) => s.visible).sort((a, b) => a.orden - b.orden);

  pintarEncabezado(config);
  pintarSedes(sedesVisibles, testimonios, multimedia);
  pintarRuta(sedesVisibles);

  const contenedor = document.getElementById('carrusel');
  const secciones = Array.from(contenedor.querySelectorAll('.sede'));

  // Distribución inicial: ya con todo en el DOM y medible (las tres
  // sedes están montadas aunque solo una esté a la vista, así que se
  // resuelven las tres de una vez).
  secciones.forEach((s) => Distribuidor.distribuir(s));

  let pendienteResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(pendienteResize);
    pendienteResize = setTimeout(() => secciones.forEach((s) => Distribuidor.distribuir(s)), 180);
  });

  iniciarInteraccionDeEnfoque(secciones);

  Secuenciador.iniciar();

  const carrusel = new Carrusel({
    contenedor,
    secciones,
    onCambio: (indice, seccionNueva) => {
      actualizarRuta(indice);
      Secuenciador.entrar(seccionNueva); // si ya se reveló antes, esto no hace nada
    },
  });

  document.querySelectorAll('.ruta-nodo').forEach((boton) => {
    boton.addEventListener('click', () => carrusel.ir(Number(boton.dataset.indice)));
  });
  document.querySelector('.ruta-flecha--anterior')?.addEventListener('click', () => carrusel.anterior());
  document.querySelector('.ruta-flecha--siguiente')?.addEventListener('click', () => carrusel.siguiente());

  actualizarRuta(0);
  if (secciones[0]) Secuenciador.entrar(secciones[0]);
})();

function mostrarErrorCarga(error) {
  console.error(error);
  const main = document.getElementById('carrusel');
  if (!main) return;
  main.innerHTML = `
    <div class="estado-error">
      <h1>No se pudo cargar el contenido</h1>
      <p>Revisá que el sitio se esté sirviendo con un servidor local (no abriendo el archivo directamente desde el disco). Ver README.md.</p>
    </div>`;
}

function pintarEncabezado(config) {
  document.title = config.evento.nombre;
  const chip = document.querySelector('.marca-chip');
  if (chip) {
    chip.querySelector('.marca-chip-texto').textContent = config.marca.badge;
    const logo = chip.querySelector('.marca-chip-logo');
    if (logo) logo.src = config.marca.logoPath;
  }
  const tituloEvento = document.querySelector('.encabezado-evento-titulo');
  if (tituloEvento) tituloEvento.textContent = config.evento.nombre;
  const bajadaEvento = document.querySelector('.encabezado-evento-bajada');
  if (bajadaEvento) bajadaEvento.textContent = config.evento.bajada;
  const fechasEvento = document.querySelector('.encabezado-evento-fechas');
  if (fechasEvento) fechasEvento.textContent = config.evento.fechas;
}

function pintarSedes(sedesVisibles, testimonios, multimedia) {
  const contenedor = document.getElementById('carrusel');
  contenedor.innerHTML = '';

  sedesVisibles.forEach((sede, indice) => {
    const seccion = document.createElement('section');
    seccion.className = `sede sede--${sede.composicion || 'convergente'}`;
    seccion.dataset.sede = sede.id;
    seccion.dataset.zonasProtegidas = JSON.stringify(sede.zonasProtegidas || []);
    seccion.id = `sede-${sede.id}`;
    seccion.setAttribute('role', 'group');
    seccion.setAttribute('aria-label', `Sede ${indice + 1} de ${sedesVisibles.length}: ${sede.nombre}`);

    const parrafos = String(sede.descripcion || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p class="sede-kicker-descripcion">${escaparHTML(p)}</p>`)
      .join('');

    seccion.innerHTML = `
      <div class="sede-bg" style="background-image:url('${sede.imagenFondo}')"></div>
      <div class="sede-velo"></div>
      <div class="sede-kicker">
        <span class="sede-kicker-num">${String(indice + 1).padStart(2, '0')} / ${String(sedesVisibles.length).padStart(2, '0')}</span>
        <h2 class="sede-kicker-titulo">${escaparHTML(sede.nombre)}</h2>
        <p class="sede-kicker-subtitulo">${escaparHTML(sede.subtitulo)}</p>
        ${parrafos}
        <ul class="sede-kicker-unidades">
          ${sede.unidadesAcademicas.map((u) => `<li>${escaparHTML(u)}</li>`).join('')}
        </ul>
      </div>
      <div class="escenario"></div>
    `;

    contenedor.appendChild(seccion);

    const escenario = seccion.querySelector('.escenario');
    const items = [
      ...testimonios.filter((t) => t.sede === sede.id && t.visible).map((t) => ({ ...t, _tipo: 'testimonio' })),
      ...multimedia.filter((m) => m.sede === sede.id && m.visible).map((m) => ({ ...m, _tipo: m.tipo })),
    ].sort((a, b) => a.ordenNarrativo - b.ordenNarrativo);

    items.forEach((item) => escenario.appendChild(crearElemento(item)));
  });
}

function crearElemento(item) {
  const el = document.createElement('article');
  el.className = `elemento elemento--${item._tipo} elemento--anim-${item.animacion || 'fade'}`;
  el.tabIndex = 0;
  el.dataset.orden = item.ordenNarrativo || 0;

  // Estos cuatro son los que lee js/layout.js para calcular la posición
  // final — el x/y del dato es la preferencia de partida, no el destino.
  el.dataset.anclaX = item.x;
  el.dataset.anclaY = item.y;
  el.dataset.escala = item.escala ?? 1;
  el.dataset.rotacion = item.rotacion ?? 0;

  el.style.setProperty('--escala', item.escala ?? 1);
  el.style.setProperty('--rot', `${item.rotacion ?? 0}deg`);
  el.style.setProperty('--z', String(4 + Number(item.profundidad || 3)));
  el.style.setProperty('--opacidad-final', item.opacidadFinal ?? 1);
  el.style.setProperty('--duracion', `${item.duracion || 600}ms`);
  // Posición de arranque (antes de que layout.js mida y reubique): el
  // mismo % del dato, así no hay un "salto" visible una vez calculado.
  el.style.setProperty('--x', `${item.x}%`);
  el.style.setProperty('--y', `${item.y}%`);

  const interior = document.createElement('div');
  interior.className = 'elemento-interior';

  if (item._tipo === 'testimonio') {
    interior.appendChild(crearTarjetaTestimonio(item));
  } else if (item._tipo === 'foto') {
    interior.innerHTML = `
      <img src="${item.src}" alt="${escaparHTML(item.alt || '')}" loading="lazy" onerror="this.closest('.elemento').classList.add('elemento--sin-imagen')">
      ${item.caption ? `<p class="elemento-caption">${escaparHTML(item.caption)}</p>` : ''}
    `;
  } else if (item._tipo === 'video') {
    interior.innerHTML = `
      <video src="${item.src}" poster="${item.poster || ''}" controls preload="none"></video>
      ${item.caption ? `<p class="elemento-caption">${escaparHTML(item.caption)}</p>` : ''}
    `;
  }

  el.appendChild(interior);
  return el;
}

// Paleta para el monograma cuando no hay foto — elegida por hash del
// nombre, no al azar: la misma persona siempre tiene el mismo color.
const PALETA_MONOGRAMA = ['#00a3e0', '#3aaa35', '#7d4e24', '#4a463d'];

function crearTarjetaTestimonio(item) {
  const figura = document.createElement('figure');
  figura.className = 'testimonio-foto';

  if (item.foto) {
    figura.innerHTML = `<img src="${item.foto}" alt="${escaparHTML(item.nombreCompleto)}" loading="lazy" onerror="this.parentElement.classList.add('testimonio-foto--rota')">`;
  } else {
    const iniciales = inicialesDe(item.nombreCompleto);
    const color = PALETA_MONOGRAMA[hashSimple(item.nombreCompleto) % PALETA_MONOGRAMA.length];
    figura.innerHTML = `<div class="testimonio-monograma" style="--color-monograma:${color}">${iniciales}</div>`;
  }

  const cuerpo = document.createElement('div');
  cuerpo.className = 'testimonio-cuerpo';
  cuerpo.innerHTML = `
    <p class="testimonio-nombre">${escaparHTML(item.nombreCompleto)}</p>
    <p class="testimonio-cargo">${escaparHTML(item.cargo)}</p>
    <p class="testimonio-institucion">${escaparHTML(item.institucion)}</p>
    <blockquote class="testimonio-cita">${escaparHTML(item.texto)}</blockquote>
  `;

  const envoltorio = document.createElement('div');
  envoltorio.appendChild(figura);
  envoltorio.appendChild(cuerpo);
  return envoltorio;
}

function inicialesDe(nombreCompleto = '') {
  const palabras = nombreCompleto.replace(/^(Mg\.|Dr\.|Ing\.|Esp\.)\s*/i, '').trim().split(/\s+/);
  const primera = palabras[0]?.[0] || '';
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1][0] : '';
  return (primera + ultima).toUpperCase();
}

function hashSimple(texto = '') {
  let hash = 0;
  for (const caracter of String(texto)) hash = (hash * 31 + caracter.charCodeAt(0)) % 1000;
  return Math.abs(hash);
}

/**
 * Al pasar el mouse o el foco de teclado por una tarjeta: la trae al
 * frente, la agranda levemente y atenúa (sin ocultar) a las demás. Al
 * salir, todo vuelve solo gracias a las transiciones CSS.
 */
function iniciarInteraccionDeEnfoque(secciones) {
  secciones.forEach((seccion) => {
    const escenario = seccion.querySelector('.escenario');
    if (!escenario) return;

    escenario.querySelectorAll('.elemento').forEach((el) => {
      const activar = () => {
        escenario.classList.add('escenario--enfocando');
        el.classList.add('elemento--enfocado');
        el.style.zIndex = 999;
      };
      const desactivar = () => {
        escenario.classList.remove('escenario--enfocando');
        el.classList.remove('elemento--enfocado');
        el.style.zIndex = '';
      };
      el.addEventListener('mouseenter', activar);
      el.addEventListener('mouseleave', desactivar);
      el.addEventListener('focusin', activar);
      el.addEventListener('focusout', desactivar);
    });
  });
}

function pintarRuta(sedesVisibles) {
  const lista = document.querySelector('.ruta-nodos');
  if (!lista) return;
  lista.innerHTML = sedesVisibles
    .map(
      (sede, indice) => `
      <li>
        <button class="ruta-nodo" data-indice="${indice}" aria-label="Ir a ${escaparHTML(sede.nombre)}">
          <span class="ruta-nodo-punto"></span>
          <span class="ruta-nodo-num">${String(indice + 1).padStart(2, '0')}</span>
          <span class="ruta-nodo-nombre">${escaparHTML(sede.nombre)}</span>
        </button>
      </li>`
    )
    .join('');
  document.documentElement.style.setProperty('--total-sedes', sedesVisibles.length);
}

function actualizarRuta(indiceActual) {
  document.querySelectorAll('.ruta-nodo').forEach((boton) => {
    boton.classList.toggle('ruta-nodo--activo', Number(boton.dataset.indice) === indiceActual);
  });
  const total = Number(document.documentElement.style.getPropertyValue('--total-sedes')) || 1;
  const progreso = total > 1 ? indiceActual / (total - 1) : 1;
  document.documentElement.style.setProperty('--progreso-ruta', progreso.toFixed(3));
}

function escaparHTML(texto = '') {
  return String(texto).replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[caracter]));
}
