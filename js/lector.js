/**
 * lector.js
 * -----------------------------------------------------------------------
 * El "hover" (o el foco de teclado) ya trae una tarjeta al frente y la
 * agranda apenas — eso es una vista previa, vive en styles.css
 * (.elemento--enfocado) y no cambió. Esto es la interacción nueva: click,
 * tap o Enter abren el contenido completo en un lector ampliado, sobre
 * todo lo demás, pensado solo para leer.
 *
 * Es un único modal reutilizado (no uno por tarjeta), con dos formas de
 * llenarse según el tipo de elemento:
 *
 *   - Testimonio: Lector.abrir(el) — sin segundo argumento. Lee el DOM de
 *     la tarjeta tal como está en ese momento (foto, nombre, cargo, cita),
 *     porque la cita pudo haber sido sorteada al azar entre varias
 *     disponibles y tiene que coincidir exactamente con lo que la persona
 *     ya estaba viendo, no con un dato "genérico" de esa persona.
 *   - Registro de unidad académica o conceptual: Lector.abrir(el, registro)
 *     — con el registro completo de datos. A diferencia del testimonio,
 *     estos no rotan contenido: el mural solo muestra título + resumen
 *     recortado, y el cuerpo completo (texto, proyectos, cita de respaldo)
 *     vive únicamente en los datos, nunca en el DOM del mural — por eso
 *     hace falta pasarlo explícitamente en vez de leerlo de la tarjeta.
 */
const Lector = (() => {
  let superposicion, tarjeta, contenido, botonCerrar, elementoActivador = null;

  function iniciar() {
    superposicion = document.createElement('div');
    superposicion.className = 'lector-superposicion';

    superposicion.innerHTML = `
      <div class="lector-tarjeta" role="dialog" aria-modal="true" aria-label="Contenido completo">
        <button type="button" class="lector-cerrar" aria-label="Cerrar">✕</button>
        <div class="lector-nav-ua" aria-label="Documentos relacionados" hidden>
          <button type="button" class="lector-nav-ant" aria-label="Documento anterior">←</button>
          <span class="lector-nav-ua-etiqueta"></span>
          <button type="button" class="lector-nav-sig" aria-label="Documento siguiente">→</button>
        </div>
        <div class="lector-contenido"></div>
      </div>
    `;
    document.body.appendChild(superposicion);

    tarjeta = superposicion.querySelector('.lector-tarjeta');
    contenido = superposicion.querySelector('.lector-contenido');
    botonCerrar = superposicion.querySelector('.lector-cerrar');
    const navUA = superposicion.querySelector('.lector-nav-ua');
    const btnAnt = superposicion.querySelector('.lector-nav-ant');
    const btnSig = superposicion.querySelector('.lector-nav-sig');

    botonCerrar.addEventListener('click', cerrar);
    superposicion.addEventListener('click', (evento) => {
      if (evento.target === superposicion) cerrar();
    });
    document.addEventListener('keydown', (evento) => {
      if (!estaAbierto()) return;
      if (evento.key === 'Escape') {
        cerrar();
      } else if (evento.key === 'Tab') {
        evento.preventDefault();
        botonCerrar.focus();
      } else if (evento.key === 'ArrowRight') {
        navegarUA(1);
      } else if (evento.key === 'ArrowLeft') {
        navegarUA(-1);
      }
    });

    btnAnt.addEventListener('click', () => navegarUA(-1));
    btnSig.addEventListener('click', () => navegarUA(1));
  }

  // Contexto de navegación intra-UA
  let grupoUA = [];   // [{ el, registro|null }] — todos los docs del mismo UA visible
  let posUA   = 0;    // posición actual en el grupo

  /**
   * Construye el grupo de navegación (hilo conductor) a partir del elemento
   * actualmente abierto. El recorrido va de lo específico a lo general:
   *
   *   1. Todos los elementos visibles de la misma UA (registro-ua, testimonios
   *      propios, registros conceptuales vinculados), ordenados por ordenNarrativo.
   *   2. Al final del hilo: las autoridades de alcance UNaM que estén visibles
   *      en esa sede (las que no fueron descartadas por el sorteo de autoridades).
   *      Así el visitante puede, desde cualquier tarjeta de FCF o EAE, navegar
   *      naturalmente hasta la voz del Vicerrector o del Secretario General
   *      sin necesidad de cerrar el lector y buscarlos en el mural.
   *
   * Si el elemento abierto ya pertenece a UNaM, su hilo es solo él mismo
   * (las autoridades generales siguen siendo de acceso individual).
   */
  function construirGrupoUA(elementoOrigen, registroActual) {
    const ua = elementoOrigen.dataset.ua;
    const escenario = elementoOrigen.closest('.escenario');
    if (!ua || ua === 'unam' || !escenario) {
      // Las autoridades UNaM no tienen hilo UA propio — solo ellas mismas.
      grupoUA = [{ el: elementoOrigen, registro: registroActual }];
      posUA = 0;
      return;
    }

    // 1. Elementos de la UA propia (narrador + satélites), por ordenNarrativo.
    const propios = Array.from(
      escenario.querySelectorAll(`.elemento[data-ua="${ua}"]:not(.elemento--oculto-autoridad):not(.elemento--rotacion-espera)`)
    ).sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0));

    // 2. Autoridades UNaM visibles en esta sede (no descartadas por el sorteo).
    const autoridadesUnam = Array.from(
      escenario.querySelectorAll('.elemento--testimonio-institucional:not(.elemento--oculto-autoridad):not(.elemento--rotacion-espera)')
    ).sort((a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0));

    const todos = [...propios, ...autoridadesUnam];

    grupoUA = todos.map((el) => ({
      el,
      registro: el === elementoOrigen ? registroActual : null,
    }));
    posUA = grupoUA.findIndex((e) => e.el === elementoOrigen);
    if (posUA < 0) posUA = 0;
  }

  function actualizarNavUA() {
    const navUA = superposicion.querySelector('.lector-nav-ua');
    const etiqueta = superposicion.querySelector('.lector-nav-ua-etiqueta');
    if (grupoUA.length < 2) { navUA.hidden = true; return; }
    navUA.hidden = false;
    const uaActual = grupoUA[posUA]?.el?.dataset?.ua || '';
    // Si estamos en la sección de autoridades UNaM del hilo, mostrarlo
    const etiquetaUA = uaActual === 'unam'
      ? 'UNaM'
      : (uaActual.toUpperCase() || '');
    etiqueta.textContent = `${etiquetaUA}  ·  ${posUA + 1} / ${grupoUA.length}`;
  }

  function navegarUA(delta) {
    if (grupoUA.length < 2) return;
    posUA = ((posUA + delta) + grupoUA.length) % grupoUA.length;
    const { el } = grupoUA[posUA];
    // Abrir sin reconstruir el grupo
    const iframe = superposicion.querySelector('.lector-video-iframe');
    if (iframe) iframe.src = '';
    contenido.innerHTML = '';
    if (!el.dataset.tipo || el.dataset.tipo === 'testimonio') {
      contenido.appendChild(construirContenidoTestimonio(el));
    } else {
      // Para no-testimonios necesitamos los datos del item; los leemos del DOM
      // lo más que podemos (título desde el DOM si falta el registro guardado).
      const reg = grupoUA[posUA].registro;
      if (reg) {
        if (reg._tipo === 'registro-ua') contenido.appendChild(construirContenidoRegistroUA(reg, el));
        else if (reg._tipo === 'registro-conceptual') contenido.appendChild(construirContenidoRegistroConceptual(reg, el));
        else if (reg._tipo === 'video' || reg.tipo === 'video') contenido.appendChild(construirContenidoVideo(reg, el));
      } else {
        // Fallback: mostrar título e invitar a expandir desde el mural
        contenido.innerHTML = `<p style="padding:24px;opacity:0.7">Regresá al mural para expandir este documento.</p>`;
      }
    }
    actualizarNavUA();
    botonCerrar.focus();
  }

  function estaAbierto() {
    return superposicion.classList.contains('lector-superposicion--abierta');
  }

  /**
   * Abre el lector. Sin segundo argumento: comportamiento de testimonio
   * (lee el DOM). Con segundo argumento: un registro de unidad académica,
   * conceptual, o video — construido directamente desde sus datos completos.
   */
  function abrir(elementoOrigen, registro = null) {
    elementoActivador = elementoOrigen;
    // H-08: congelar el mural mientras el visitante lee un documento.
    // La tarjeta de origen permanece visible; al cerrar se reanuda.
    window.Rotacion?.pausar();

    // En mobile: usar el bottom sheet en vez del modal centrado de desktop
    if (window.esMobile && window.esMobile()) {
      abrirEnMobile(elementoOrigen, registro);
      return;
    }
    abrirEnDesktop(elementoOrigen, registro);
  }

  function abrirEnDesktop(elementoOrigen, registro) {
    contenido.innerHTML = '';
    if (!registro) {
      contenido.appendChild(construirContenidoTestimonio(elementoOrigen));
    } else if (registro._tipo === 'registro-ua') {
      contenido.appendChild(construirContenidoRegistroUA(registro, elementoOrigen));
    } else if (registro._tipo === 'registro-conceptual') {
      contenido.appendChild(construirContenidoRegistroConceptual(registro, elementoOrigen));
    } else if (registro._tipo === 'video' || registro.tipo === 'video') {
      contenido.appendChild(construirContenidoVideo(registro, elementoOrigen));
    }
    construirGrupoUA(elementoOrigen, registro);
    actualizarNavUA();
    if (registro && posUA >= 0 && posUA < grupoUA.length) {
      grupoUA[posUA].registro = registro;
    }
    elementoOrigen.setAttribute('aria-expanded', 'true');
    document.body.classList.add('lector-bloqueando-scroll');
    superposicion.classList.add('lector-superposicion--abierta');
    window.setTimeout(() => botonCerrar.focus(), 60);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LECTOR EDITORIAL MOBILE — Manual del Sistema Editorial §5 · §7 · §8
     Fases F2 (hero, cabecera sticky, tipografía, grabber, drag-down),
     F3 (índice de proyectos plegado, galería, player 16:9 sin autoplay)
     y F4 (franja «En esta constelación» con cross-fade, sin cerrar).
     ─────────────────────────────────────────────────────────────────────
     Reemplaza al canal provisional que reutilizaba el bottom sheet
     genérico con flechas ←/→: la deriva entre registros ahora ocurre por
     los chips de constelación (misma capacidad, forma del Manual §7).
     Todo vive detrás de esMobile(); Desktop conserva su modal intacto.
     Los nodos .lem-* se crean solo acá — su CSS (mobile.css) no necesita
     media query, igual que .bottom-sheet.
     ═══════════════════════════════════════════════════════════════════ */

  let lem = null;         // referencias del lector editorial (creación perezosa)
  let lemOrigen = null;   // { el, scrollLeft } — P6: retorno exacto + destello
  let lemActual = null;   // { el, registro } — documento en pantalla (deriva F4)

  const ICONO_TIPO = {
    'registro-ua': '▤', 'testimonio': '\u201C', 'video': '▶', 'registro-conceptual': '◦',
  };

  function asegurarLectorEditorial() {
    if (lem) return lem;

    const velo = document.createElement('div');
    velo.className = 'lem-velo';

    const sheet = document.createElement('section');
    sheet.className = 'lem';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Lector del compendio');
    sheet.innerHTML = `
      <div class="lem-grabber" aria-hidden="true"></div>
      <header class="lem-topbar">
        <span class="lem-topbar-badge" aria-hidden="true"></span>
        <span class="lem-topbar-titulo" aria-hidden="true"></span>
        <button type="button" class="lem-cerrar" aria-label="Cerrar lector">✕</button>
      </header>
      <div class="lem-scroll">
        <div class="lem-hero"></div>
        <div class="lem-cuerpo"></div>
        <aside class="lem-constelacion" hidden aria-label="Otros registros de esta constelación">
          <p class="lem-constelacion-rotulo">En esta constelación</p>
          <div class="lem-chips" role="list"></div>
        </aside>
      </div>
    `;
    document.body.appendChild(velo);
    document.body.appendChild(sheet);

    lem = {
      velo, sheet,
      topbar:       sheet.querySelector('.lem-topbar'),
      topBadge:     sheet.querySelector('.lem-topbar-badge'),
      topTitulo:    sheet.querySelector('.lem-topbar-titulo'),
      btnCerrar:    sheet.querySelector('.lem-cerrar'),
      scroll:       sheet.querySelector('.lem-scroll'),
      hero:         sheet.querySelector('.lem-hero'),
      cuerpo:       sheet.querySelector('.lem-cuerpo'),
      constelacion: sheet.querySelector('.lem-constelacion'),
      chips:        sheet.querySelector('.lem-chips'),
    };

    lem.btnCerrar.addEventListener('click', cerrarLectorEditorial);
    velo.addEventListener('click', cerrarLectorEditorial);

    // §7 · Cabecera sticky: aparece cuando el hero sale del área visible.
    lem.scroll.addEventListener('scroll', () => {
      const limite = Math.max(0, lem.hero.offsetHeight - lem.topbar.offsetHeight);
      lem.topbar.classList.toggle('lem-topbar--fija', lem.scroll.scrollTop > limite);
    }, { passive: true });

    // §7 · Drag-down de cierre: SOLO con el scroll interno en tope y con
    // dirección vertical dominante (los carriles horizontales — chips,
    // galería — no disparan el gesto). Umbral: 30 % de la altura del sheet.
    let dY0 = 0, dX0 = 0, arrastrando = false, delta = 0;
    sheet.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      dY0 = t.clientY; dX0 = t.clientX; delta = 0;
      arrastrando = lem.scroll.scrollTop <= 0 &&
        !e.target.closest('.lem-chips, .lem-galeria-track, .lem-video-iframe');
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (!arrastrando) return;
      if (lem.scroll.scrollTop > 0) { arrastrando = false; sheet.style.transform = ''; return; }
      const t = e.touches[0];
      const dy = t.clientY - dY0, dx = Math.abs(t.clientX - dX0);
      if (delta === 0 && (dy < 12 || dy < dx * 1.2)) return;  // aún sin dirección clara
      delta = Math.max(0, dy);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (!arrastrando) return;
      arrastrando = false;
      sheet.style.transition = '';
      if (delta > sheet.offsetHeight * 0.30) cerrarLectorEditorial();
      else sheet.style.transform = '';
    });

    // Teclado: Escape cierra; Tab queda dentro del lector.
    document.addEventListener('keydown', (e) => {
      if (!sheet.classList.contains('lem--abierta')) return;
      if (e.key === 'Escape') { cerrarLectorEditorial(); return; }
      if (e.key !== 'Tab') return;
      const focos = Array.from(sheet.querySelectorAll('button, a[href], iframe'))
        .filter((n) => n.offsetParent !== null);
      if (!focos.length) return;
      e.preventDefault();
      const i = focos.indexOf(document.activeElement);
      const sig = e.shiftKey
        ? (i <= 0 ? focos.length - 1 : i - 1)
        : (i < 0 || i === focos.length - 1 ? 0 : i + 1);
      focos[sig].focus();
    });

    return lem;
  }

  // ── Utilidades de datos ────────────────────────────────────────────────
  // el.__item lo escribe app.js al crear cada tarjeta (F2): datos íntegros
  // sin depender del DOM recortado del mural.
  function datosDe(el, registro = null) { return registro || el.__item || null; }

  function siglaDe(el, item) {
    if (item && item.unidadAcademica) return item.unidadAcademica;
    const ua = el.dataset.ua || '';
    if (ua === 'unam') return 'UNaM';
    return ua ? ua.toUpperCase() : '';
  }

  function etiquetaConceptual(item, el) {
    if (item && item.unidadAcademica) return item.unidadAcademica;
    const sede = item && item.sede ? item.sede : '';
    return sede ? `Síntesis · ${sede.charAt(0).toUpperCase()}${sede.slice(1)}` : siglaDe(el, item);
  }

  // ── Hero (§5): portada / fotografía / miniatura, velo 40 %, meta ───────
  function crearImgHero(src, alt, srcAlternativo = null) {
    const img = document.createElement('img');
    img.className = 'lem-hero-img';
    img.alt = alt || '';
    img.loading = 'lazy';        // checklist §12: lazy en hero/foto
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (srcAlternativo && img.src.indexOf(srcAlternativo) === -1) { img.src = srcAlternativo; return; }
      img.remove();
      lem.hero.classList.add('lem-hero--fallback');
    }, { once: false });
    img.src = src;               // carga diferida real: recién al abrir (§4)
    return img;
  }

  function construirHero(el, registro) {
    const tipo = el.dataset.tipo || 'testimonio';
    const item = datosDe(el, registro);
    const color = obtenerColorUADe(el);

    lem.hero.className = 'lem-hero';
    lem.hero.innerHTML = '';
    lem.sheet.style.setProperty('--color-ua', color);

    let img = null, metaHTML = '', monograma = '', tituloTop = '', badgeTop = '';

    if (tipo === 'registro-ua') {
      const sigla = siglaDe(el, item);
      badgeTop = sigla;
      tituloTop = (item && item.titulo) || '';
      metaHTML = `
        <span class="lem-hero-badge">${escaparHTMLLector(sigla)}</span>
        <h2 class="lem-hero-titulo">${escaparHTMLLector(tituloTop)}</h2>`;
      monograma = sigla;
      if (item && item.imagenPortada) img = crearImgHero(item.imagenPortada, `${sigla} — sede`);
    } else if (tipo === 'video') {
      const sigla = siglaDe(el, item);
      badgeTop = sigla;
      tituloTop = (item && item.titulo) || '';
      metaHTML = `
        <span class="lem-hero-badge">${escaparHTMLLector(sigla)}</span>
        <h2 class="lem-hero-titulo">${escaparHTMLLector(tituloTop)}</h2>`;
      monograma = sigla;
      if (item && item.youtubeId) {
        img = crearImgHero(
          `https://img.youtube.com/vi/${escaparHTMLLector(item.youtubeId)}/hqdefault.jpg`,
          '', `https://img.youtube.com/vi/${escaparHTMLLector(item.youtubeId)}/mqdefault.jpg`);
      }
    } else if (tipo === 'registro-conceptual') {
      const etiqueta = etiquetaConceptual(item, el);
      badgeTop = etiqueta;
      tituloTop = (item && item.titulo) || '';
      lem.hero.classList.add('lem-hero--conceptual');
      metaHTML = `
        <span class="lem-hero-badge">${escaparHTMLLector(etiqueta)}</span>
        <h2 class="lem-hero-titulo">${escaparHTMLLector(tituloTop)}</h2>`;
      monograma = (item && item.unidadAcademica) || '◦';
    } else {
      // Testimonio / autoridad: hero = fotografía de la persona (diferida),
      // con nombre y cargo superpuestos (§5).
      const nombre = el.querySelector('.testimonio-nombre')?.textContent?.trim() || '';
      const cargo  = el.querySelector('.testimonio-cargo')?.textContent?.trim() || '';
      badgeTop = siglaDe(el, null);
      tituloTop = nombre;
      metaHTML = `
        <span class="lem-hero-badge">${escaparHTMLLector(badgeTop)}</span>
        <span class="lem-hero-nombre">${escaparHTMLLector(nombre)}</span>
        <span class="lem-hero-cargo">${escaparHTMLLector(cargo)}</span>`;
      monograma = nombre.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || badgeTop;
      if (item && item.foto) img = crearImgHero(item.foto, nombre);
    }

    if (img) lem.hero.appendChild(img);
    else lem.hero.classList.add('lem-hero--fallback');

    // §5 · Fallback: bloque del color institucional con el monograma al 12 %.
    lem.hero.insertAdjacentHTML('beforeend',
      `<span class="lem-hero-monograma" aria-hidden="true">${escaparHTMLLector(monograma)}</span>
       <div class="lem-hero-velo" aria-hidden="true"></div>
       <div class="lem-hero-meta">${metaHTML}</div>`);

    if (tipo === 'video') {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'lem-hero-play';
      play.setAttribute('aria-label', 'Ir al reproductor');
      play.textContent = '▶';
      play.addEventListener('click', () => {
        lem.cuerpo.querySelector('.lem-video-marco')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      lem.hero.appendChild(play);
    }

    // Espejo en la cabecera sticky (badge + título en 1 línea + ✕).
    lem.topBadge.textContent = badgeTop;
    lem.topTitulo.textContent = tituloTop;
    lem.sheet.setAttribute('aria-label', tituloTop ? `Lector — ${tituloTop}` : 'Lector del compendio');
  }

  // ── Cuerpo (§7/§8): tipografía de lectura por tipo de registro ─────────
  function parrafosHTML(texto) {
    return String(texto || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escaparHTMLLector(p)}</p>`)
      .join('');
  }

  function construirIndiceProyectos(item) {
    const lista = Array.isArray(item.proyectos) ? item.proyectos : [];
    if (!lista.length) return null;
    const VISIBLES = 4;  // §11: «lista + “ver N restantes”» — pliegue tras los primeros

    const cont = document.createElement('section');
    cont.className = 'lem-proyectos';
    cont.innerHTML = `<h3 class="lem-proyectos-titulo">Índice de proyectos · ${lista.length}</h3>`;

    const ul = document.createElement('ul');
    ul.className = 'lem-proyectos-lista';
    lista.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escaparHTMLLector(p.nombre)}</strong><span>${escaparHTMLLector(p.sintesis)}</span>`;
      if (i >= VISIBLES) li.hidden = true;
      ul.appendChild(li);
    });
    cont.appendChild(ul);

    const restantes = lista.length - VISIBLES;
    if (restantes > 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lem-proyectos-mas';
      btn.textContent = `Ver ${restantes} restantes`;
      btn.addEventListener('click', () => {
        ul.querySelectorAll('li[hidden]').forEach((li) => { li.hidden = false; });
        btn.remove();
      });
      cont.appendChild(btn);
    }
    return cont;
  }

  function construirGaleria(item) {
    const imgs = (Array.isArray(item.galeria) ? item.galeria : [])
      .map((g) => (typeof g === 'string' ? { src: g, alt: '' } : g))
      .filter((g) => g && g.src);
    if (!imgs.length) return null;   // el corpus actual no trae galerías: componente listo, dato manda

    const cont = document.createElement('div');
    cont.className = 'lem-galeria';
    const track = document.createElement('div');
    track.className = 'lem-galeria-track';
    imgs.forEach((g) => {
      const fig = document.createElement('figure');
      fig.innerHTML = `<img src="${escaparHTMLLector(g.src)}" alt="${escaparHTMLLector(g.alt || '')}" loading="lazy" decoding="async">`;
      track.appendChild(fig);
    });
    const puntos = document.createElement('div');
    puntos.className = 'lem-galeria-puntos';
    puntos.setAttribute('aria-hidden', 'true');
    imgs.forEach((g, i) => {
      const punto = document.createElement('span');
      punto.className = 'lem-galeria-punto' + (i === 0 ? ' lem-galeria-punto--activo' : '');
      puntos.appendChild(punto);
    });
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      puntos.querySelectorAll('.lem-galeria-punto').forEach((p, j) =>
        p.classList.toggle('lem-galeria-punto--activo', j === i));
    }, { passive: true });
    cont.appendChild(track);
    cont.appendChild(puntos);
    return cont;
  }

  function construirCuerpo(el, registro) {
    const tipo = el.dataset.tipo || 'testimonio';
    const item = datosDe(el, registro);
    lem.cuerpo.innerHTML = '';

    if (tipo === 'registro-ua' && item) {
      lem.cuerpo.insertAdjacentHTML('beforeend',
        `<p class="lem-ua-completa">${escaparHTMLLector(item.unidadAcademicaCompleta || '')}</p>`);
      lem.cuerpo.insertAdjacentHTML('beforeend', parrafosHTML(item.cuerpo));
      if (item.cita) {
        lem.cuerpo.insertAdjacentHTML('beforeend', `
          <blockquote class="lem-cita">${escaparHTMLLector(item.cita)}
            <cite>— ${escaparHTMLLector(item.citaAutor || '')}${item.citaCargo ? `, ${escaparHTMLLector(item.citaCargo)}` : ''}</cite>
          </blockquote>`);
      }
      const galeria = construirGaleria(item);
      if (galeria) lem.cuerpo.appendChild(galeria);
      const indice = construirIndiceProyectos(item);
      if (indice) lem.cuerpo.appendChild(indice);

    } else if (tipo === 'video' && item) {
      // §7: player 16:9 embebido, NUNCA autoplay; título y crédito debajo.
      const esTesti = item.subtipo === 'testimonio_audiovisual';
      const tipoLabel = esTesti ? 'Testimonio audiovisual' : 'Video institucional';
      const credito = [tipoLabel, item.fecha || 'Mayo 2026', item.autor || '']
        .filter(Boolean).join(' · ');
      lem.cuerpo.insertAdjacentHTML('beforeend', `
        <div class="lem-video-marco">
          <div class="lem-video-ratio">
            <iframe class="lem-video-iframe"
              src="https://www.youtube-nocookie.com/embed/${escaparHTMLLector(item.youtubeId)}?rel=0&modestbranding=1"
              title="${escaparHTMLLector(item.titulo || '')}"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen loading="lazy"></iframe>
          </div>
        </div>
        <h3 class="lem-video-titulo">${escaparHTMLLector(item.titulo || '')}</h3>
        <p class="lem-video-credito">${escaparHTMLLector(credito)}</p>
        <p class="lem-ua-completa">${escaparHTMLLector(item.unidadAcademicaCompleta || '')}</p>
        ${item.resumen ? `<p>${escaparHTMLLector(item.resumen)}</p>` : ''}`);

    } else if (tipo === 'registro-conceptual' && item) {
      lem.cuerpo.insertAdjacentHTML('beforeend', parrafosHTML(item.cuerpo));

    } else {
      // Testimonio / autoridad: cita íntegra en cuerpo grande (§7, 1.15 rem)
      // — exactamente la cita que la persona estaba viendo en el mural.
      const nodoCita = el.querySelector('.testimonio-cita');
      const cita = (nodoCita?.dataset?.citaActual || nodoCita?.textContent || '').trim();
      const institucion = (item && item.institucion) || '';
      lem.cuerpo.insertAdjacentHTML('beforeend', `
        <blockquote class="lem-cita lem-cita--integra">${escaparHTMLLector(cita)}</blockquote>
        ${institucion ? `<p class="lem-institucion">${escaparHTMLLector(institucion)}</p>` : ''}`);
    }
  }

  // ── Constelación (F4): deriva editorial sin cerrar el Lector ───────────
  // P3: los satélites en espera de rotación SÍ integran la franja — «el
  // audiovisual entra por rotación y por Lector». Las autoridades UNaM
  // descartadas por el sorteo (.elemento--oculto-autoridad) quedan fuera,
  // igual que en el hilo desktop.
  function elementosDeConstelacion() {
    const actual = lemActual.el;
    const ua = actual.dataset.ua;
    const escenario = lemOrigen.el.closest('.escenario');
    if (!ua || ua === 'unam' || !escenario) return [];

    const porOrden = (a, b) => Number(a.dataset.orden || 0) - Number(b.dataset.orden || 0);
    const propios = Array.from(
      escenario.querySelectorAll(`.elemento[data-ua="${ua}"]:not(.elemento--oculto-autoridad)`)
    ).sort(porOrden);
    const autoridades = Array.from(
      escenario.querySelectorAll('.elemento--testimonio-institucional:not(.elemento--oculto-autoridad):not(.elemento--rotacion-espera)')
    ).sort(porOrden);

    return [...propios, ...autoridades].filter((el) => el !== actual);
  }

  function etiquetaChip(el) {
    const tipo = el.dataset.tipo || 'testimonio';
    if (tipo === 'testimonio') {
      return el.querySelector('.testimonio-nombre')?.textContent?.trim() || 'Testimonio';
    }
    if (tipo === 'registro-ua') return `Expediente ${siglaDe(el, el.__item)}`;
    const item = el.__item;
    return (item && item.titulo) || (tipo === 'video' ? 'Registro audiovisual' : 'Registro');
  }

  function construirConstelacion() {
    const lista = elementosDeConstelacion();
    lem.chips.innerHTML = '';
    if (!lista.length) { lem.constelacion.hidden = true; return; }

    lista.forEach((el2) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lem-chip';
      chip.setAttribute('role', 'listitem');
      chip.style.setProperty('--color-ua', obtenerColorUADe(el2));
      const icono = ICONO_TIPO[el2.dataset.tipo] || '·';
      chip.innerHTML = `<span class="lem-chip-icono" aria-hidden="true">${icono}</span>
                        <span class="lem-chip-texto">${escaparHTMLLector(etiquetaChip(el2))}</span>`;
      chip.addEventListener('click', () => derivarA(el2));
      lem.chips.appendChild(chip);
    });
    lem.constelacion.hidden = false;
  }

  // Cross-fade 180 ms (§8): el Lector no se cierra; el documento se
  // reemplaza y el retorno (P6) sigue apuntando a la tarjeta de ORIGEN.
  function derivarA(el2) {
    if (!lem || !lem.sheet.classList.contains('lem--abierta')) return;
    const iframe = lem.cuerpo.querySelector('.lem-video-iframe');
    if (iframe) iframe.src = '';
    lem.scroll.classList.add('lem-scroll--fundido');
    window.setTimeout(() => {
      if (!lem.sheet.classList.contains('lem--abierta')) return;  // cerrado durante el fundido
      const tipo2 = el2.dataset.tipo || 'testimonio';
      lemActual = { el: el2, registro: tipo2 === 'testimonio' ? null : (el2.__item || null) };
      renderizarDocumento();
      lem.scroll.scrollTop = 0;
      lem.topbar.classList.remove('lem-topbar--fija');
      requestAnimationFrame(() => lem.scroll.classList.remove('lem-scroll--fundido'));
    }, 180);
  }

  function renderizarDocumento() {
    construirHero(lemActual.el, lemActual.registro);
    construirCuerpo(lemActual.el, lemActual.registro);
    construirConstelacion();
  }

  function abrirEnMobile(elementoOrigen, registro) {
    asegurarLectorEditorial();

    const carrusel = document.getElementById('carrusel');
    lemOrigen = { el: elementoOrigen, scrollLeft: carrusel ? carrusel.scrollLeft : 0 };
    lemActual = { el: elementoOrigen, registro: registro || null };

    renderizarDocumento();

    elementoOrigen.setAttribute('aria-expanded', 'true');
    elementoOrigen.classList.add('elemento--en-lector');   // estado §8: origen marcado
    document.body.classList.add('lector-bloqueando-scroll');

    lem.scroll.scrollTop = 0;
    lem.topbar.classList.remove('lem-topbar--fija');
    lem.sheet.style.transform = '';
    lem.velo.classList.add('lem-velo--visible');
    requestAnimationFrame(() => lem.sheet.classList.add('lem--abierta'));  // §8: 280 ms ease-out
    window.setTimeout(() => lem.btnCerrar.focus(), 300);
  }

  function cerrarLectorEditorial() {
    if (!lem || !lem.sheet.classList.contains('lem--abierta')) return;

    const iframe = lem.cuerpo.querySelector('.lem-video-iframe');
    if (iframe) iframe.src = '';   // detiene la reproducción sin YT API

    lem.sheet.classList.remove('lem--abierta');
    lem.sheet.style.transform = '';
    lem.velo.classList.remove('lem-velo--visible');
    document.body.classList.remove('lector-bloqueando-scroll');

    const origen = lemOrigen && lemOrigen.el;
    if (origen) {
      // Checklist §12: scroll del mural restaurado al píxel.
      const carrusel = document.getElementById('carrusel');
      if (carrusel && Math.abs(carrusel.scrollLeft - lemOrigen.scrollLeft) > 0.5) {
        carrusel.scrollLeft = lemOrigen.scrollLeft;
      }
      origen.setAttribute('aria-expanded', 'false');
      origen.classList.remove('elemento--en-lector');
      // §7 · Destello de retorno 600 ms del color de la UA (clase de F1).
      origen.classList.remove('elemento--origen');
      void origen.offsetWidth;                    // reinicia la animación
      origen.classList.add('elemento--origen');
      window.setTimeout(() => origen.classList.remove('elemento--origen'), 700);
      origen.focus({ preventScroll: true });
    }

    lemOrigen = null;
    lemActual = null;
    elementoActivador = null;
    window.Rotacion?.reanudar();   // H-08: reanudar el mural al cerrar
  }

  function construirContenidoTestimonio(elementoOrigen) {
    const foto = elementoOrigen.querySelector('.testimonio-foto')?.cloneNode(true);
    const nombre = elementoOrigen.querySelector('.testimonio-nombre')?.textContent || '';
    const cargo = elementoOrigen.querySelector('.testimonio-cargo')?.textContent || '';
    const institucion = elementoOrigen.querySelector('.testimonio-institucion')?.textContent || '';
    const cita = elementoOrigen.querySelector('.testimonio-cita')?.textContent || '';

    const envoltorio = document.createDocumentFragment();
    if (foto) {
      foto.className = 'lector-foto';
      envoltorio.appendChild(foto);
    }
    const cuerpo = document.createElement('div');
    cuerpo.className = 'lector-cuerpo';
    cuerpo.innerHTML = `
      <p class="lector-nombre">${nombre}</p>
      <p class="lector-cargo">${cargo}</p>
      <p class="lector-institucion">${institucion}</p>
      <blockquote class="lector-cita">${cita}</blockquote>
    `;
    envoltorio.appendChild(cuerpo);
    return envoltorio;
  }

  /**
   * Registro Institucional de Unidad Académica: portada fotográfica (si existe),
   * badge de la sigla, título, el cuerpo completo en párrafos, la lista de
   * proyectos reales mencionados en la fuente, y una cita de respaldo con
   * atribución completa.
   *
   * La portada coexiste con el texto: aparece como cabecera del lector, por
   * encima del badge y el título, igual que en la tarjeta del mural.
   */
  function construirContenidoRegistroUA(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-registro';

    const portadaHTML = registro.imagenPortada
      ? `<div class="lector-registro-portada">
           <img src="${escaparHTMLLector(registro.imagenPortada)}"
                alt="${escaparHTMLLector(registro.unidadAcademica || '')} — sede"
                loading="eager">
         </div>`
      : '';

    const parrafos = String(registro.cuerpo || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${escaparHTMLLector(p.trim())}</p>`)
      .join('');

    const proyectosHTML = Array.isArray(registro.proyectos) && registro.proyectos.length
      ? `
        <div class="lector-registro-proyectos">
          <h3>Proyectos mencionados</h3>
          <ul>
            ${registro.proyectos
              .map((p) => `<li><strong>${escaparHTMLLector(p.nombre)}</strong> — ${escaparHTMLLector(p.sintesis)}</li>`)
              .join('')}
          </ul>
        </div>`
      : '';

    const citaHTML = registro.cita
      ? `<blockquote class="lector-registro-cita">${escaparHTMLLector(registro.cita)}<cite>— ${escaparHTMLLector(registro.citaAutor || '')}${registro.citaCargo ? `, ${escaparHTMLLector(registro.citaCargo)}` : ''}</cite></blockquote>`
      : '';

    envoltorio.innerHTML = `
      ${portadaHTML}
      <div class="lector-registro-meta">
        <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(registro.unidadAcademica || '')}</span>
        <p class="lector-registro-completa">${escaparHTMLLector(registro.unidadAcademicaCompleta || '')}</p>
        <h2 class="lector-registro-titulo">${escaparHTMLLector(registro.titulo)}</h2>
      </div>
      <div class="lector-registro-cuerpo">${parrafos}</div>
      ${proyectosHTML}
      ${citaHTML}
    `;
    return envoltorio;
  }

  /**
   * Registro Conceptual: más austero — badge (UA o "Síntesis · Sede"),
   * título y el desarrollo completo de la idea en párrafos. Sin lista de
   * proyectos ni cita separada: las citas que respaldan la idea ya están
   * entretejidas dentro del propio cuerpo, con su atribución.
   */
  function construirContenidoRegistroConceptual(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-registro lector-registro--conceptual';

    const parrafos = String(registro.cuerpo || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${escaparHTMLLector(p.trim())}</p>`)
      .join('');

    const etiqueta = registro.unidadAcademica
      ? registro.unidadAcademica
      : `Síntesis · ${registro.sede.charAt(0).toUpperCase()}${registro.sede.slice(1)}`;

    envoltorio.innerHTML = `
      <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(etiqueta)}</span>
      <h2 class="lector-registro-titulo lector-registro-titulo--conceptual">${escaparHTMLLector(registro.titulo)}</h2>
      <div class="lector-registro-cuerpo">${parrafos}</div>
    `;
    return envoltorio;
  }

  // El color por unidad académica se calcula una sola vez, en app.js, al
  // construir cada tarjeta (única fuente de verdad) — acá solo se lee lo
  // que ya quedó guardado como variable CSS en la tarjeta de origen, sin
  // duplicar la lógica de la paleta en este archivo.
  function obtenerColorUADe(elementoOrigen) {
    const valor = getComputedStyle(elementoOrigen).getPropertyValue('--color-ua').trim();
    return valor || '#00a3e0';
  }

  function escaparHTMLLector(texto = '') {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Documento audiovisual: reproductor YouTube embebido (sin cookies, sin
   * sugerencias de YT) en la parte superior, metadatos institucionales
   * debajo. Se integra al mismo sistema de lectura que el resto del archivo.
   *
   * Seguridad: el iframe usa youtube-nocookie.com y sandbox restrictivo.
   * Autoplay: activa sólo el autoplay, sin autoplay en YT propiamente.
   */
  function construirContenidoVideo(registro, elementoOrigen) {
    const colorUA = obtenerColorUADe(elementoOrigen);
    const envoltorio = document.createElement('div');
    envoltorio.className = 'lector-video';

    const esTesti = registro.subtipo === 'testimonio_audiovisual';
    const tipoLabel = esTesti ? 'Testimonio audiovisual' : 'Video institucional';
    const autorHTML = registro.autor
      ? `<p class="lector-video-autor"><strong>Participante:</strong> ${escaparHTMLLector(registro.autor)}</p>`
      : '';

    // El iframe se crea como elemento DOM para poder anularlo on cerrar
    // (setear src = '' detiene la reproducción sin necesidad de YT API).
    envoltorio.innerHTML = `
      <div class="lector-video-reproductor">
        <div class="lector-video-ratio">
          <iframe
            class="lector-video-iframe"
            src="https://www.youtube-nocookie.com/embed/${escaparHTMLLector(registro.youtubeId)}?rel=0&modestbranding=1&autoplay=1"
            title="${escaparHTMLLector(registro.titulo)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      </div>
      <div class="lector-video-metadatos">
        <span class="lector-registro-badge" style="--color-ua:${colorUA}">${escaparHTMLLector(registro.unidadAcademica || '')}</span>
        <p class="lector-video-tipo">${escaparHTMLLector(tipoLabel)} · ${escaparHTMLLector(registro.fecha || 'Mayo 2026')}</p>
        <h2 class="lector-registro-titulo">${escaparHTMLLector(registro.titulo)}</h2>
        ${autorHTML}
        <p class="lector-video-ua-completa">${escaparHTMLLector(registro.unidadAcademicaCompleta || '')}</p>
        <p class="lector-video-descripcion">${escaparHTMLLector(registro.resumen || '')}</p>
      </div>
    `;
    return envoltorio;
  }

  function cerrar() {
    // Detener el video antes de cerrar el lector: setear src='' en el iframe
    // es equivalente a pausar sin necesitar la YT IFrame API.
    const iframe = superposicion.querySelector('.lector-video-iframe');
    if (iframe) iframe.src = '';

    superposicion.classList.remove('lector-superposicion--abierta');
    document.body.classList.remove('lector-bloqueando-scroll');
    elementoActivador?.setAttribute('aria-expanded', 'false');
    elementoActivador?.focus();
    elementoActivador = null;
    // H-08: reanudar la rotación del mural al cerrar el documento.
    window.Rotacion?.reanudar();
  }

  return { iniciar, abrir };
})();

window.Lector = Lector;
