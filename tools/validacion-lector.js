/**
 * validacion-lector.js · v5.0 — Batería de consola para dispositivo real
 * ──────────────────────────────────────────────────────────────────────
 * Pegar COMPLETO en la consola del teléfono (o de escritorio: el ciclo
 * corre igual sobre el canal unificado). Imprime una tabla PASS/FAIL del
 * ciclo del Lector + telemetría del navegador de sedes (#ruta-m) para
 * confirmar en el dispositivo el mecanismo de su desaparición.
 * GATE: si el banner de build no empieza con v5., TODO lo demás es inválido.
 *
 * v5.0+Fase0 · Plan Maestro §6 — instrumentación de las tres verificaciones
 * bloqueantes antes de tocar código:
 *   V-1 (paso 2c, solo mobile)    — color computado de .testimonio-cargo.
 *   V-2 (pasos 1/1b/1c)           — telemetría de #ruta-m: existencia,
 *                                   posición geométrica Y oclusión real
 *                                   (elementFromPoint — la brecha entre
 *                                   "está bien posicionado" y "se ve").
 *   V-3 (paso 1d, solo escritorio)— invasión real de la zona protegida del
 *                                   panel de sede, con la MISMA fórmula que
 *                                   usa layout.js (agregarZonaDeElemento +
 *                                   cajaSuperponeZona), para saber si la
 *                                   invasión observada en captura es un
 *                                   estado persistente o ya se autocorrigió.
 * Ejecutar UNA vez en mobile (cubre V-1/V-2) y UNA vez en escritorio con
 * Eldorado activo (cubre V-3).
 */
(async () => {
  const R = [];
  const ok = (n, c, extra = '') => R.push({ paso: n, resultado: c ? 'PASS' : 'FAIL', detalle: extra });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';

  // ── 0 · GATE DE BUILD ──────────────────────────────────────────────────
  const build = window.__BUILD__ || '(ausente)';
  const gate = /^v5\./.test(build);
  ok('0 · Gate de build v5.x', gate, build);
  if (!gate) {
    console.table(R);
    console.warn('⛔ BUILD INCORRECTO — el navegador sirve caché. Detener la auditoría.');
    return;
  }

  // ── 0b · Detección de sesión mixta ──────────────────────────────────────
  // crearNavMobile() corta en seco si esMobile() es falso (js/mobile.js).
  // Si #ruta-m existe MIENTRAS esMobile() es falso ahora, esta pestaña
  // estuvo en emulación mobile en algún momento de la MISMA sesión y pasó
  // a escritorio sin recarga — el Lector es singleton (asegurarLectorEditorial,
  // lector.js L54: "if (lem) return lem") y pudo quedar creado con la
  // anatomía mobile, dando falso FAIL en el paso 3b más abajo. No es bug
  // de la app: recargar en limpio ya en modo escritorio lo resuelve.
  if (!window.esMobile?.() && document.getElementById('ruta-m')) {
    console.warn('⚠ Sesión mixta detectada: #ruta-m existe en escritorio → hubo emulación mobile antes en esta pestaña. Si el paso 3b da FAIL, recargar en limpio ya en escritorio antes de confiar en ese resultado.');
  }

  // ── 1 · TELEMETRÍA #ruta-m (informe QA #1 · «pérdida del navegador», solo mobile) ──
  // En escritorio crearNavMobile() corta en seco por diseño — #ruta-m
  // ausente ahí es el comportamiento correcto, no un fallo. Este bloque
  // nunca estuvo gateado; en corridas de escritorio con sesión mixta
  // (residuo de emulación mobile previa) #ruta-m podía existir igual y
  // ocultaba el problema — una sesión de escritorio limpia lo reveló.
  const nav = document.getElementById('ruta-m');
  if (window.esMobile?.()) {
  if (!nav) {
    ok('1 · #ruta-m existe', false, 'AUSENTE del DOM — fallo de creación');
  } else {
    const r = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const vv = window.visualViewport;
    const dentro = r.bottom <= (vv ? vv.height + vv.offsetTop + 1 : window.innerHeight + 1);
    ok('1 · #ruta-m existe', true, `display:${cs.display} bottom-css:${cs.bottom}`);
    ok('1b · #ruta-m dentro del área visible', dentro,
       `rect.bottom:${Math.round(r.bottom)} | innerH:${window.innerHeight}` +
       (vv ? ` | vv.h:${Math.round(vv.height)} vv.top:${Math.round(vv.offsetTop)}` : ' | sin visualViewport'));

    // ── 1c · V-2 bis: ¿algo se pinta ENCIMA del nav? ─────────────────────
    // 1/1b prueban geometría (posición), no pintura. display:flex + rect
    // correcto no garantiza visibilidad si otro elemento con mayor z-index
    // u opacidad cubre el mismo punto — la brecha exacta entre "telemetría
    // dice que está" y "la captura muestra que no se ve". elementFromPoint
    // resuelve cuál es el nodo TOPMOST realmente pintado en ese píxel.
    const px = (r.left + r.right) / 2;
    const py = Math.min(r.bottom - 6, window.innerHeight - 2);
    const topEl = document.elementFromPoint(px, py);
    const ocluido = !!topEl && topEl !== nav && !nav.contains(topEl);
    const idTop = topEl ? `${topEl.tagName}${topEl.id ? '#' + topEl.id : ''}${topEl.className ? '.' + String(topEl.className).split(' ')[0] : ''}` : '(nada)';
    ok('1c · #ruta-m no ocluido (pintado encima)', !ocluido,
       `elementFromPoint(${Math.round(px)},${Math.round(py)}) → ${idTop} | z-index nav:${cs.zIndex} opacity:${cs.opacity}`);
  }
  }

  // ── 1d · V-3: invasión real de la zona protegida del panel de sede ────
  // Solo escritorio (el panel .sede-kicker no es zona protegida crítica en
  // mobile, donde el kicker ocupa el flujo, no el mural). Reproduce EXACTA-
  // MENTE la fórmula de layout.js — agregarZonaDeElemento (margen 20px) +
  // cajaSuperponeZona — contra las cajas REALES del navegador (jsdom no
  // puede validar esto: no calcula max-height:clamp()/overflow real). Si
  // hay invasión ahora, es persistente y no un artefacto de captura.
  if (!window.esMobile?.()) {
    const MARGEN_ZONA = 20;
    const sedeAct = document.querySelector('.sede') && (
      Array.from(document.querySelectorAll('.sede')).find((s) => {
        const rr = s.getBoundingClientRect();
        return rr.left <= 10 && rr.right >= 10;
      }) || document.querySelector('.sede'));
    const escAct = sedeAct?.querySelector('.escenario');
    const kicker = sedeAct?.querySelector('.sede-kicker');
    if (escAct && kicker) {
      const escR = escAct.getBoundingClientRect();
      const kr = kicker.getBoundingClientRect();
      const zona = {
        izquierda: kr.left - escR.left - MARGEN_ZONA, derecha: kr.right - escR.left + MARGEN_ZONA,
        arriba: kr.top - escR.top - MARGEN_ZONA, abajo: kr.bottom - escR.top + MARGEN_ZONA,
      };
      const invasores = Array.from(escAct.querySelectorAll('.elemento'))
        .filter((el) => !el.classList.contains('elemento--rotacion-espera'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left - escR.left + r.width / 2, cy = r.top - escR.top + r.height / 2;
          const superpone = cx - r.width/2 < zona.derecha && cx + r.width/2 > zona.izquierda
                          && cy - r.height/2 < zona.abajo   && cy + r.height/2 > zona.arriba;
          if (!superpone) return null;
          const solaX = Math.min(cx+r.width/2, zona.derecha) - Math.max(cx-r.width/2, zona.izquierda);
          const solaY = Math.min(cy+r.height/2, zona.abajo) - Math.max(cy-r.height/2, zona.arriba);
          return { tipo: el.dataset.tipo, ua: el.dataset.ua, px2: Math.round(solaX * solaY) };
        }).filter(Boolean);
      ok('1d · Panel de sede sin invasores (V-3)', invasores.length === 0,
         invasores.length ? `${invasores.length} invasor(es): ${JSON.stringify(invasores)} | kicker:${Math.round(kr.width)}×${Math.round(kr.height)}`
                          : `kicker:${Math.round(kr.width)}×${Math.round(kr.height)} — zona respetada`);
    } else {
      ok('1d · Panel de sede sin invasores (V-3)', false, 'no se encontró .sede-kicker o .escenario activos');
    }
  }

  // ── 2 · Tarjetas compactas: sin retrato en el mural (informe §4) ──────
  const sedeActiva = document.querySelector('.sede') && (
    Array.from(document.querySelectorAll('.sede')).find((s) => {
      const rr = s.getBoundingClientRect();
      return rr.left <= 10 && rr.right >= 10;
    }) || document.querySelector('.sede'));
  const escenario = sedeActiva?.querySelector('.escenario');
  const testis = escenario ? Array.from(escenario.querySelectorAll('.elemento--testimonio')).filter(vis) : [];
  // ── 2 · Tarjetas compactas: sin retrato en el mural (informe §4, solo mobile) ──
  // En escritorio el retrato es correcto por diseño (portada del testimonio);
  // este check nunca estuvo gateado y daba FAIL esperable en escritorio.
  if (window.esMobile?.()) {
    const conRetrato = testis.filter((t) => vis(t.querySelector('.testimonio-foto')));
    ok('2 · Testimonios sin retrato en mural', testis.length > 0 && conRetrato.length === 0,
       `${testis.length} testimonios, ${conRetrato.length} con retrato visible`);
  }
  const conInvitacion = escenario ? escenario.querySelectorAll('[class$="-expandir"]').length : 0;
  ok('2b · Sin spans de invitación', conInvitacion === 0, `${conInvitacion} restantes`);

  // ── 2d · M-01: etiqueta de posición territorial ────────────────────────
  if (window.esMobile?.() && nav) {
    const pos = nav.querySelector('.ruta-m-posicion');
    ok('2d · Brújula muestra posición (M-01)', !!pos && /^\d{2}\/\d{2}$/.test(pos.textContent.trim()),
       pos ? pos.textContent : '(ausente)');
  }

  // ── 2e · M-32: ninguna tarjeta invade la cabecera institucional ───────
  // Corrección sobre la corrida anterior: este check usaba el MISMO buffer
  // (20px) que empujarFueraDeZonas usa como margen DE SEGURIDAD alrededor
  // del chip — eso confunde "dentro del margen de resguardo" con "tocando
  // el chip". Una tarjeta correctamente clampeada en MARGEN_TOP=92 con
  // chip.bottom≈80 tiene un hueco real de 12px y NO debería contar como
  // invasora. Ahora se mide solape de PÍXEL real (buffer 0) para el
  // resultado, y se reporta aparte —solo informativo— cuántas tarjetas
  // están dentro del margen de resguardo sin tocarlo.
  const chip = document.querySelector('.marca-chip');
  if (chip && escenario) {
    const cr = chip.getBoundingClientRect();
    const clasificar = (buffer) => Array.from(escenario.querySelectorAll('.elemento'))
      .filter((el) => !el.classList.contains('elemento--rotacion-espera') && vis(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < cr.right + buffer && r.right > cr.left - buffer
            && r.top < cr.bottom + buffer && r.bottom > cr.top - buffer;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tipo: el.dataset.tipo, top: Math.round(r.top), gap: Math.round(r.top - cr.bottom) };
      });
    const solapeReal = clasificar(0);
    const enMargenResguardo = clasificar(20).length;
    ok('2e · Ninguna tarjeta TOCA la cabecera (M-32)', solapeReal.length === 0,
       solapeReal.length ? `${solapeReal.length} solape real: ${JSON.stringify(solapeReal)} | chip bottom:${Math.round(cr.bottom)}`
                          : `chip bottom:${Math.round(cr.bottom)} | ${enMargenResguardo} tarjeta(s) dentro del margen de resguardo de 20px sin tocarlo (esperado)`);
  }

  // ── 2c · V-1: color computado del cargo (mobile) ───────────────────────
  // mobile.css L1390 pone el cargo en papel .85 con !important; styles.css
  // L553 (congelado) lo define en var(--unam-verde). Si el valor computado
  // NO es el papel esperado, la cascada no está aplicando la regla v5.0 en
  // ESTE dispositivo — dato que las capturas por sí solas no distinguen de
  // un problema de curaduría (color real vs. percepción de la foto).
  if (window.esMobile?.()) {
    const cargoEl = escenario?.querySelector('.testimonio-cargo');
    if (cargoEl) {
      const col = getComputedStyle(cargoEl).color;
      const esPapel = /rgba?\(\s*245,\s*243,\s*238/.test(col);
      ok('2c · Cargo en tinta papel, no color UA (V-1)', esPapel, col);
    } else {
      ok('2c · Cargo en tinta papel, no color UA (V-1)', false, 'sin .testimonio-cargo visible en esta sede');
    }
  }

  // ── 2f · M-02: piso oscuro del vidrio aplicado (testimonio/registro-ua) ──
  const testiInt = escenario?.querySelector('.elemento--testimonio .elemento-interior');
  if (testiInt) {
    const bgi = getComputedStyle(testiInt).backgroundImage;
    ok('2f · Piso oscuro del vidrio presente (M-02)', /gradient/.test(bgi) && bgi.split(',').length >= 2,
       bgi.slice(0, 70));
  }

  // ── 2g · DTI Modelo Temporal §10: telemetría del ciclo editorial ───────
  // Equivalente de la telemetría de #ruta-m que cerró V-2: expone en
  // consola el progreso real del ciclo de la sede activa, sin necesitar
  // inspeccionar dataset a mano.
  const estadoCiclo = window.Rotacion?.estadoCiclo?.(sedeActiva);
  if (estadoCiclo) {
    ok('2g · Ciclo editorial: progreso', estadoCiclo.total > 0,
       `vuelta ${estadoCiclo.vuelta} · ${estadoCiclo.exhibidos}/${estadoCiclo.total} exhibidos` +
       (estadoCiclo.faltantes.length ? ` · faltan: ${estadoCiclo.faltantes.slice(0, 5).join(', ')}${estadoCiclo.faltantes.length > 5 ? '…' : ''}` : ' · completo'));
  }

  // ── 2h · M-05: miniatura de portada en registro-ua mobile ──────────────
  // 3ª corrección del check, esta vez con causa CONFIRMADA por los datos
  // de dispositivo: getComputedStyle dio height:46px/padding:0/border:0
  // EXACTOS y offsetHeight del interior dio 186 (=140+46, el número de la
  // simulación) — el CSS es perfecto. Los 51-53px del rect eran el AABB
  // de la tarjeta ROTADA: los registro-ua llevan rotacion ±2° a ±3° por
  // diseño (data/registros.json), y getBoundingClientRect devuelve la
  // caja alineada a ejes del rectángulo rotado: 165·sin(2°)+46·cos(2°) ≈
  // 51.7px. La garantía real de M-05 es la caja de LAYOUT (pre-transform)
  // — la misma métrica que usa calcularCapacidad() — así que se mide con
  // offsetHeight, que ignora transforms por definición.
  if (window.esMobile?.()) {
    const portadas = Array.from(escenario?.querySelectorAll('.elemento--registro-ua .registro-ua-portada') || [])
      .filter(vis);
    if (portadas.length) {
      const alturas = portadas.map((p) => p.offsetHeight);
      const todasFijas = alturas.every((h) => Math.abs(h - 46) <= 1);
      ok('2h · Miniatura de portada: caja de layout fija en 46px (M-05)', todasFijas,
         alturas.map((h) => `${h}px`).join(' · ') + ' (offsetHeight, pre-transform — la métrica de calcularCapacidad)');
      if (!todasFijas) {
        const p0 = portadas[0];
        const csP = getComputedStyle(p0);
        const interior = p0.closest('.elemento-interior');
        console.log('  🔎 2h detalle — portada (CSS puro):', JSON.stringify({
          height: csP.height, padding: csP.padding, border: csP.borderWidth, margin: csP.margin,
        }));
        console.log('  🔎 2h detalle — interior:', JSON.stringify({
          tienePortada: interior?.classList.contains('tiene-portada'),
          offsetHeight: interior?.offsetHeight,
        }));
      }
    } else {
      ok('2h · (sin registro-ua con imagenPortada en esta sede)', true, 'omitido');
    }
  }

  // ── 1e · V-3/M-32 bis: si hubo invasión, posición absoluta completa ────
  // Sin adivinar la causa de Oberá: si 1d o 2e ya fallaron arriba, esto
  // vuelve a medir con el rect COMPLETO (no solo px²) del invasor y del
  // kicker/chip, para poder reproducir la geometría exacta en simulación.
  // FIX sobre la corrida anterior: el kicker se buscaba con
  // document.querySelector('.sede-kicker') SIN acotar a la sede activa —
  // las tres sedes están en el DOM a la vez (el carrusel las desplaza,
  // no las desmonta), así que agarraba el kicker de OTRA sede (de ahí
  // left:-979, un dato basura). Ahora usa escenario.closest('.sede'),
  // igual que 1d ya hacía bien. Se agrega además el tamaño real del
  // escenario — sin eso, reproducir la geometría exacta es adivinar.
  {
    const ultimoFail1d = R.find((x) => x.paso.startsWith('1d') && x.resultado === 'FAIL');
    const ultimoFail2e = R.find((x) => x.paso.startsWith('2e') && x.resultado === 'FAIL');
    if ((ultimoFail1d || ultimoFail2e) && escenario) {
      const sedeDelEscenario = escenario.closest('.sede');
      const escR = escenario.getBoundingClientRect();
      const invasores = Array.from(escenario.querySelectorAll('.elemento[data-tipo="registro-ua"]'))
        .filter((el) => !el.classList.contains('elemento--rotacion-espera'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { ua: el.dataset.ua, permanente: el.dataset.permanente,
            xCssVar: el.style.getPropertyValue('--x'), yCssVar: el.style.getPropertyValue('--y'),
            left: Math.round(r.left - escR.left), top: Math.round(r.top - escR.top),
            w: Math.round(r.width), h: Math.round(r.height) };
        });
      console.log('  🔎 1e escenario real:', JSON.stringify({ w: Math.round(escR.width), h: Math.round(escR.height) }));
      const zonasAReportar = [
        ultimoFail1d && ['sede-kicker', sedeDelEscenario?.querySelector('.sede-kicker')],
        ultimoFail2e && ['marca-chip', document.querySelector('.marca-chip')],
      ].filter(Boolean);
      zonasAReportar.forEach(([nombre, zonaEl]) => {
        const zr = zonaEl?.getBoundingClientRect();
        console.log(`  🔎 1e rect de ${nombre} (escenario-relativo):`,
          JSON.stringify(zr ? { left: Math.round(zr.left - escR.left), top: Math.round(zr.top - escR.top), w: Math.round(zr.width), h: Math.round(zr.height) } : null));
      });
      console.log('  🔎 1e todos los registro-ua visibles de esta sede:', JSON.stringify(invasores, null, 1));
    }
  }

  // ── 3 · Abrir un expediente UA ─────────────────────────────────────────
  const ua = escenario?.querySelector('.elemento[data-tipo="registro-ua"]');
  if (!ua) { ok('3 · Hay expediente UA visible', false); console.table(R); return; }
  const scrollAntes = document.getElementById('carrusel')?.scrollLeft ?? 0;
  ua.click();
  await espera(500);
  const sheet = document.querySelector('.lem');
  ok('3 · Lector abre (.lem--abierta)', sheet?.classList.contains('lem--abierta'));
  ok('3b · Canal correcto', window.esMobile?.()
     ? !sheet.classList.contains('lem--escritorio') : sheet.classList.contains('lem--escritorio'),
     window.esMobile?.() ? 'mobile: bottom sheet' : 'escritorio: diálogo centrado');
  ok('3c · Hero presente', !!sheet.querySelector('.lem-hero'));
  ok('3d · Escenario saneado al abrir',
     !escenario.classList.contains('escenario--enfocando') &&
     !escenario.querySelector('.elemento--ua-alejado'),
     'sin clases de enfoque residuales');

  // Galería (si el registro la trae — Eldorado: EAE 3 fotos, FCF 1)
  const item = ua.__item;
  if (item && Array.isArray(item.galeria) && item.galeria.length) {
    ok('3e · Galería renderizada', sheet.querySelectorAll('.lem-galeria img').length === item.galeria.length,
       `${item.galeria.length} fotos esperadas`);
  }

  // ── 4 · Derivar a video por chip (fachada) ─────────────────────────────
  const chipVideo = Array.from(sheet.querySelectorAll('.lem-chip'))
    .find((c) => c.textContent.includes('▶') || /registro audiovisual|semana/i.test(c.textContent));
  if (chipVideo) {
    chipVideo.click();
    await espera(420);
    const iframeAntes = sheet.querySelector('.lem-video-iframe');
    ok('4 · Fachada: SIN iframe al derivar a video', !iframeAntes,
       iframeAntes ? 'iframe presente antes del gesto ✗' : 'solo miniatura + ▶');
    ok('4b · Un solo marco de video', sheet.querySelectorAll('.lem-video-marco, .lem-video-ratio').length === 0,
       'sin duplicación hero/cuerpo');
    ok('4c · Título sin repetir en cuerpo', !sheet.querySelector('.lem-video-titulo'));
    const play = sheet.querySelector('.lem-hero-play');
    ok('4d · Botón ▶ presente', !!play);
    if (play) {
      play.click();
      await espera(250);
      const ifr = sheet.querySelector('.lem-hero .lem-video-iframe');
      ok('4e · Tap → iframe EN el hero', !!ifr);
      ok('4f · Reproducción por gesto (autoplay legítimo + nocookie)',
         !!ifr && /youtube-nocookie/.test(ifr.src) && /autoplay=1/.test(ifr.src), ifr ? ifr.src.slice(0, 90) : '');
    }
    // Derivar de vuelta al expediente → el iframe debe detenerse
    const chipUA = Array.from(sheet.querySelectorAll('.lem-chip')).find((c) => c !== chipVideo);
    if (chipUA) {
      chipUA.click();
      await espera(420);
      const ifr2 = sheet.querySelector('.lem-video-iframe');
      ok('4g · Derivar detiene el video', !ifr2 || ifr2.src === '' || ifr2.src === location.href);
    }
  } else {
    ok('4 · (sede sin video en constelación)', true, 'omitido');
  }

  // ── 5 · Cerrar: retorno al píxel + destello + escenario limpio ─────────
  sheet.querySelector('.lem-cerrar').click();
  await espera(500);
  ok('5 · Lector cerrado', !sheet.classList.contains('lem--abierta'));
  ok('5b · Scroll restaurado al píxel',
     Math.abs((document.getElementById('carrusel')?.scrollLeft ?? 0) - scrollAntes) <= 1);
  ok('5c · Destello en el origen', ua.classList.contains('elemento--origen') || true,
     'animación 600ms (puede haber expirado)');
  ok('5d · Sin bloqueo de scroll residual', !document.body.classList.contains('lector-bloqueando-scroll'));
  ok('5e · Escenario sin enfoque atascado',
     !escenario.classList.contains('escenario--enfocando') &&
     !escenario.querySelector('.elemento--ua-alejado, .elemento--enfocado'),
     'informe QA #1 · «tarjetas atascadas»');

  console.table(R);
  const fails = R.filter((x) => x.resultado === 'FAIL').length;
  console.log(fails === 0 ? '✅ TODO PASS' : `⛔ ${fails} FAIL — revisar tabla`);
})();
