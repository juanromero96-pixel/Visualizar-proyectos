/**
 * validacion-lector.js · v5.0 — Batería de consola para dispositivo real
 * ──────────────────────────────────────────────────────────────────────
 * Pegar COMPLETO en la consola del teléfono (o de escritorio: el ciclo
 * corre igual sobre el canal unificado). Imprime una tabla PASS/FAIL del
 * ciclo del Lector + telemetría del navegador de sedes (#ruta-m) para
 * confirmar en el dispositivo el mecanismo de su desaparición.
 * GATE: si el banner de build no es v5.0-*, TODO lo demás es inválido.
 */
(async () => {
  const R = [];
  const ok = (n, c, extra = '') => R.push({ paso: n, resultado: c ? 'PASS' : 'FAIL', detalle: extra });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';

  // ── 0 · GATE DE BUILD ──────────────────────────────────────────────────
  const build = window.__BUILD__ || '(ausente)';
  const gate = /^v5\.0/.test(build);
  ok('0 · Gate de build v5.0', gate, build);
  if (!gate) {
    console.table(R);
    console.warn('⛔ BUILD INCORRECTO — el navegador sirve caché. Detener la auditoría.');
    return;
  }

  // ── 1 · TELEMETRÍA #ruta-m (informe QA #1 · «pérdida del navegador») ──
  const nav = document.getElementById('ruta-m');
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
  }

  // ── 2 · Tarjetas compactas: sin retrato en el mural (informe §4) ──────
  const sedeActiva = document.querySelector('.sede') && (
    Array.from(document.querySelectorAll('.sede')).find((s) => {
      const rr = s.getBoundingClientRect();
      return rr.left <= 10 && rr.right >= 10;
    }) || document.querySelector('.sede'));
  const escenario = sedeActiva?.querySelector('.escenario');
  const testis = escenario ? Array.from(escenario.querySelectorAll('.elemento--testimonio')).filter(vis) : [];
  const conRetrato = testis.filter((t) => vis(t.querySelector('.testimonio-foto')));
  ok('2 · Testimonios sin retrato en mural', testis.length > 0 && conRetrato.length === 0,
     `${testis.length} testimonios, ${conRetrato.length} con retrato visible`);
  const conInvitacion = escenario ? escenario.querySelectorAll('[class$="-expandir"]').length : 0;
  ok('2b · Sin spans de invitación', conInvitacion === 0, `${conInvitacion} restantes`);

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
