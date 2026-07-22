/**
 * lector.js — Lector editorial del Compendio · CANAL UNIFICADO (v5.0)
 * ────────────────────────────────────────────────────────────────────
 * Un solo motor de lectura para mobile y escritorio (informe QA #1,
 * «unificación del hilo conductor»): la anatomía del Manual §5/§7/§8
 * — hero, cabecera sticky, cuerpo de lectura, franja «En esta
 * constelación» con deriva por cross-fade — se presenta como bottom
 * sheet en mobile y como diálogo centrado (.lem--escritorio) en
 * escritorio. El canal modal anterior (lector-superposicion + flechas
 * ←/→ por grupo UA) fue retirado en v5.0: la deriva es por chips en
 * ambos canales; en escritorio las flechas del teclado derivan por la
 * misma constelación. Los selectores .lector-* de styles.css quedan
 * sin consumidor (archivo congelado: se documenta, no se toca).
 * El mural (layout.js — Monte Carlo desktop / zonas mobile) NO se toca.
 */

const Lector = (() => {
  let elementoActivador = null;

  function obtenerColorUADe(elementoOrigen) {
    const valor = getComputedStyle(elementoOrigen).getPropertyValue('--color-ua').trim();
    return valor || '#00a3e0';
  }

  function escaparHTMLLector(texto = '') {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LECTOR EDITORIAL — Manual §5 · §7 · §8 · CANAL UNIFICADO (v5.0)
     F2 (hero, cabecera sticky, tipografía, grabber, drag-down),
     F3 (índice plegado, galería, reproductor-fachada en el hero),
     F4 (franja «En esta constelación» con cross-fade, sin cerrar).
     ─────────────────────────────────────────────────────────────────────
     Informe QA #1 · «unificación del hilo conductor»: el mismo motor
     renderiza bottom sheet en mobile y diálogo centrado en escritorio
     (.lem--escritorio). El modal desktop anterior (superposición +
     flechas ←/→ por grupo UA) fue retirado: la deriva es por chips en
     ambos canales; en escritorio, las flechas del teclado derivan por
     la misma constelación. Los nodos .lem-* se crean solo acá — su CSS
     no necesita media query (el guard es la creación en JS). El mural
     (layout.js) no se toca.
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
    // Canal (v5.0): mismo DOM, composición distinta. En escritorio el
    // sheet se presenta como diálogo centrado; el resto de la anatomía
    // (hero, cabecera, cuerpo, constelación) es idéntica.
    if (!window.esMobile?.()) sheet.classList.add('lem--escritorio');

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
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Unificación (v5.0): en escritorio las flechas derivan por la
        // constelación, pivoteando sobre el documento actual en el orden
        // editorial. Mismo destino que los chips — un solo hilo conductor.
        const lista = elementosDeConstelacion(true);
        if (lista.length > 1) {
          const i = lista.indexOf(lemActual.el);
          const paso = e.key === 'ArrowRight' ? 1 : -1;
          const destino = lista[((i < 0 ? 0 : i) + paso + lista.length) % lista.length];
          if (destino && destino !== lemActual.el) derivarA(destino);
        }
        e.preventDefault();
        return;
      }
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
      // Identidad de la UA integrada al hero (informe QA #1 · mejora §1):
      // el edificio institucional en un chip de 28 px junto a la pleca.
      const ua = el.dataset.ua || '';
      if (ua && ua !== 'unam') {
        const chipUA = document.createElement('span');
        chipUA.className = 'lem-hero-ua-chip';
        chipUA.setAttribute('aria-hidden', 'true');
        chipUA.innerHTML = `<img src="assets/ua/${ua}.jpg" alt="" loading="lazy" decoding="async">`;
        chipUA.querySelector('img').addEventListener('error', () => chipUA.remove());
        lem.hero.appendChild(chipUA);
      }
      // Fachada de reproducción (informe QA #1 · bug «repetición»): el hero
      // ES el reproductor. Miniatura + ■ ocupan el 16:9; al tocar, el
      // iframe reemplaza la miniatura EN EL MISMO marco — un solo
      // rectángulo de video en toda la vista. El Manual prohíbe el
      // autoplay AL ABRIR el Lector: acá nada se reproduce sin gesto.
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'lem-hero-play';
      play.setAttribute('aria-label', 'Reproducir video');
      play.textContent = '▶';
      play.addEventListener('click', () => activarPlayerEnHero(item));
      lem.hero.appendChild(play);
    }

    // Espejo en la cabecera sticky (badge + título en 1 línea + ✕).
    lem.topBadge.textContent = badgeTop;
    lem.topTitulo.textContent = tituloTop;
    lem.sheet.setAttribute('aria-label', tituloTop ? `Lector — ${tituloTop}` : 'Lector del compendio');
  }

  // Fachada del reproductor: el iframe SOLO existe tras el gesto del
  // visitante — antes del tap no sale ni una petición a YouTube. Los
  // parámetros rel/modestbranding son los de v4.9; autoplay=1 es legítimo
  // aquí porque la reproducción la inicia el propio tap (no la apertura).
  function activarPlayerEnHero(item) {
    if (!item || !item.youtubeId) return;
    if (lem.hero.querySelector('.lem-video-iframe')) return;   // ya activo
    lem.hero.classList.add('lem-hero--reproduciendo');
    lem.hero.innerHTML = `
      <iframe class="lem-video-iframe"
        src="https://www.youtube-nocookie.com/embed/${escaparHTMLLector(item.youtubeId)}?rel=0&modestbranding=1&playsinline=1&autoplay=1"
        title="${escaparHTMLLector(item.titulo || '')}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>`;
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
      // Informe QA #1 · bug «repetición de contenido»: el reproductor vive
      // en el hero (fachada). El cuerpo queda para lo que el marco no
      // dice: crédito, unidad académica completa y resumen — sin segundo
      // marco 16:9 y sin repetir el título (ya está en el hero y en la
      // cabecera fija al scrollear).
      const esTesti = item.subtipo === 'testimonio_audiovisual';
      const tipoLabel = esTesti ? 'Testimonio audiovisual' : 'Video institucional';
      const credito = [tipoLabel, item.fecha || 'Mayo 2026', item.autor || '']
        .filter(Boolean).join(' · ');
      lem.cuerpo.insertAdjacentHTML('beforeend', `
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
  function elementosDeConstelacion(incluirActual = false) {
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

    return [...propios, ...autoridades].filter((el) => incluirActual || el !== actual);
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
    // Informe de bugs Fase 2 · «Navegación Cíclica»: al derivar hasta una
    // autoridad (ua:'unam'), elementosDeConstelacion() da [] por diseño
    // (una autoridad no tiene constelación propia) y la franja entera se
    // ocultaba — punto muerto real: sin cerrar el Lector a mano no había
    // forma de seguir explorando. Si hay adónde volver (el origen del
    // recorrido, distinto del documento actual), se ofrece un único chip
    // de retorno en vez de dejar la franja vacía.
    if (!lista.length) {
      const origen = lemOrigen && lemOrigen.el;
      if (origen && origen !== lemActual.el && origen.isConnected) {
        lem.constelacion.hidden = false;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lem-chip';
        chip.setAttribute('role', 'listitem');
        chip.style.setProperty('--color-ua', obtenerColorUADe(origen));
        const icono = ICONO_TIPO[origen.dataset.tipo] || '·';
        const etiqueta = origen.dataset.tipo === 'registro-ua'
          ? `Volver al expediente ${siglaDe(origen, origen.__item)}`
          : `Volver a ${etiquetaChip(origen)}`;
        chip.innerHTML = `<span class="lem-chip-icono" aria-hidden="true">${icono}</span>
                          <span class="lem-chip-texto">${escaparHTMLLector(etiqueta)}</span>`;
        chip.addEventListener('click', () => derivarA(origen));
        lem.chips.appendChild(chip);
        return;
      }
      lem.constelacion.hidden = true;
      return;
    }

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
    const iframe = lem.sheet.querySelector('.lem-video-iframe');
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

  function abrirEditorial(elementoOrigen, registro) {
    asegurarLectorEditorial();

    // Saneamiento del modo enfoque (informe QA #1 · «tarjetas atascadas»):
    // si el escenario llegó con clases residuales de un enfoque previo
    // (focusin disparado por un tap anterior), se limpian ANTES de abrir.
    // Solo mobile: en escritorio el hover gobierna y se restablece solo.
    if (window.esMobile?.()) {
      const esc = elementoOrigen.closest('.escenario');
      if (esc) {
        esc.classList.remove('escenario--enfocando');
        delete esc.dataset.uaActiva;
        esc.querySelectorAll('.elemento--enfocado, .elemento--ua-alejado, .elemento--ua-relacionado')
          .forEach((e) => {
            e.classList.remove('elemento--enfocado', 'elemento--ua-alejado', 'elemento--ua-relacionado');
            e.style.zIndex = '';
          });
      }
    }

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

    const iframe = lem.sheet.querySelector('.lem-video-iframe');
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

  // ── API pública ─────────────────────────────────────────────────────────
  function iniciar() {
    // v5.0: el Lector se construye de forma perezosa en el primer abrir()
    // (asegurarLectorEditorial). iniciar() se conserva por compatibilidad
    // con app.js; ya no crea superposición alguna por adelantado.
  }

  /**
   * Abre el Lector. Sin segundo argumento: testimonio (lee el DOM de la
   * tarjeta + el.__item). Con segundo argumento: registro UA, conceptual
   * o video — construido desde sus datos completos.
   */
  function abrir(elementoOrigen, registro = null) {
    elementoActivador = elementoOrigen;
    // H-08: congelar el mural mientras el visitante lee un documento.
    window.Rotacion?.pausar();
    abrirEditorial(elementoOrigen, registro);
  }

  return { iniciar, abrir, cerrar: cerrarLectorEditorial };
})();

window.Lector = Lector;
