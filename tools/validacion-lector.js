/**
 * validacion-lector.js — Batería F5 del Lector editorial mobile (build v4.9)
 * ──────────────────────────────────────────────────────────────────────────
 * Pegar en la consola del dispositivo real (o DevTools remoto) con el mural
 * cargado en cualquier sede. Ejecuta el ciclo completo:
 *   abrir expediente UA → hero/cabecera/tipografía → índice plegado →
 *   deriva por constelación (video si existe: sin autoplay) → cierre →
 *   retorno con destello y scroll restaurado.
 * Imprime una tabla PASS/FAIL. Criterio de corte: si el banner de build no
 * es v4.9, se DETIENE (el navegador sirve assets en caché — redesplegar).
 * No modifica datos ni estado persistente; deja el mural como estaba.
 */
(async () => {
  const R = [];
  const ok = (id, cond, det = '') => R.push({ check: id, estado: cond ? '✅ PASS' : '❌ FAIL', detalle: det });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── GATE 0: sello de build ────────────────────────────────────────────
  const build = window.__BUILD__ || '(ausente)';
  if (!/^v4\.9/.test(build)) {
    console.log('%cGATE DE BUILD FALLIDO — build activo: ' + build,
      'background:#c0392b;color:#fff;padding:2px 8px;border-radius:3px;font-weight:bold');
    console.log('El navegador sirve un build anterior. Detener la auditoría y redesplegar (?v= + sello).');
    return;
  }
  ok('G0 · build v4.9 activo', true, build);
  ok('G1 · esMobile()', !!window.esMobile?.(), 'requerido para la rama editorial');

  const carrusel = document.getElementById('carrusel');
  const scroll0 = carrusel ? carrusel.scrollLeft : 0;
  const sede = [...document.querySelectorAll('.sede')].find((s) => {
    const r = s.getBoundingClientRect();
    return r.left > -innerWidth / 2 && r.left < innerWidth / 2;
  });
  const origen = sede?.querySelector('.elemento--registro-ua:not(.elemento--rotacion-espera)')
             || sede?.querySelector('.elemento--testimonio:not(.elemento--rotacion-espera)');
  if (!origen) { console.warn('Sin tarjeta de origen visible en la sede activa.'); console.table(R); return; }

  // ── F2: apertura, anatomía, cabecera sticky ───────────────────────────
  origen.click();
  await espera(420);
  const lem = document.querySelector('.lem');
  const abierto = !!lem && lem.classList.contains('lem--abierta');
  ok('F2 · sheet abierto (280 ms)', abierto);
  if (!abierto) { console.table(R); return; }

  const hSheet = lem.getBoundingClientRect().height;
  ok('F2 · alto ≈ 92 svh', Math.abs(hSheet / innerHeight - 0.92) < 0.08,
     `${Math.round(hSheet)}px / viewport ${innerHeight}px`);
  const grab = lem.querySelector('.lem-grabber')?.getBoundingClientRect();
  ok('F2 · grabber 36×4', !!grab && Math.round(grab.width) === 36 && Math.round(grab.height) === 4,
     grab ? `${Math.round(grab.width)}×${Math.round(grab.height)}` : 'ausente');
  const cerrarBtn = lem.querySelector('.lem-cerrar');
  const rc = cerrarBtn?.getBoundingClientRect();
  ok('F2 · ✕ ≥ 44 px', !!rc && rc.width >= 44 && rc.height >= 44, rc ? `${Math.round(rc.width)}px` : '');
  const hero = lem.querySelector('.lem-hero');
  ok('F2 · hero presente (img o fallback §5)',
     !!hero && (!!hero.querySelector('.lem-hero-img') || hero.classList.contains('lem-hero--fallback')));
  ok('F2 · título superpuesto en hero',
     !!hero?.querySelector('.lem-hero-titulo, .lem-hero-nombre')?.textContent?.trim());
  const topbar = lem.querySelector('.lem-topbar');
  ok('F2 · cabecera transparente en tope', !topbar.classList.contains('lem-topbar--fija'));
  const scr = lem.querySelector('.lem-scroll');
  scr.scrollTop = scr.scrollHeight;
  await espera(180);
  ok('F2 · cabecera sticky al scrollear', topbar.classList.contains('lem-topbar--fija'));
  const cs = getComputedStyle(lem.querySelector('.lem-cuerpo p') || lem.querySelector('.lem-cuerpo'));
  ok('F2 · tipografía de lectura 1.02 rem/1.6',
     Math.abs(parseFloat(cs.fontSize) - 16.32) < 1.2, `${cs.fontSize} · lh ${cs.lineHeight}`);

  // ── F3: índice de proyectos plegado ───────────────────────────────────
  const lis = lem.querySelectorAll('.lem-proyectos-lista li');
  const ocultos = lem.querySelectorAll('.lem-proyectos-lista li[hidden]').length;
  const btnMas = lem.querySelector('.lem-proyectos-mas');
  if (lis.length > 4) {
    ok('F3 · índice plegado (>4 proyectos)', ocultos === lis.length - 4 && !!btnMas,
       `${lis.length} proyectos · ${ocultos} plegados`);
    btnMas?.click();
    ok('F3 · «Ver N restantes» despliega', lem.querySelectorAll('.lem-proyectos-lista li[hidden]').length === 0);
  } else {
    ok('F3 · índice sin pliegue (≤4)', lis.length === 0 || (!btnMas && ocultos === 0), `${lis.length} proyectos`);
  }

  // ── F4: constelación y deriva sin cerrar ──────────────────────────────
  const chips = [...lem.querySelectorAll('.lem-chip')];
  ok('F4 · franja «En esta constelación»', chips.length > 0, `${chips.length} chips`);
  ok('F4 · chips ≥ 44 px', chips.every((c) => c.getBoundingClientRect().height >= 44));
  const chipVideo = chips.find((c) => c.querySelector('.lem-chip-icono')?.textContent === '▶') || chips[0];
  const tituloAntes = lem.querySelector('.lem-topbar-titulo')?.textContent;
  chipVideo?.click();
  await espera(460);
  ok('F4 · deriva sin cerrar (cross-fade 180 ms)',
     lem.classList.contains('lem--abierta') &&
     lem.querySelector('.lem-topbar-titulo')?.textContent !== tituloAntes);
  const iframe = lem.querySelector('.lem-video-iframe');
  if (iframe) {
    ok('F3 · player youtube-nocookie', iframe.src.includes('youtube-nocookie.com'));
    ok('F3 · SIN autoplay (checklist §12)', !/autoplay/.test(iframe.src), iframe.src);
  } else {
    ok('F3 · player (sin video en esta constelación)', true, 'no aplica');
  }
  ok('F4 · origen sigue marcado (P6)', origen.classList.contains('elemento--en-lector'));

  // ── Cierre: retorno exacto + destello 600 ms ──────────────────────────
  cerrarBtn.click();
  await espera(120);
  ok('P6 · destello de retorno en origen', origen.classList.contains('elemento--origen'));
  await espera(320);
  ok('P6 · lector cerrado', !lem.classList.contains('lem--abierta'));
  ok('P6 · aria-expanded restaurado', origen.getAttribute('aria-expanded') === 'false');
  ok('P6 · marca en-lector retirada', !origen.classList.contains('elemento--en-lector'));
  ok('§12 · scroll del mural al píxel',
     !carrusel || Math.abs(carrusel.scrollLeft - scroll0) <= 1,
     carrusel ? `Δ=${Math.abs(carrusel.scrollLeft - scroll0).toFixed(1)}px` : '');
  ok('§12 · body sin bloqueo de scroll', !document.body.classList.contains('lector-bloqueando-scroll'));

  console.table(R);
  const fallas = R.filter((r) => r.estado.includes('FAIL')).length;
  console.log(fallas === 0
    ? '%cLECTOR EDITORIAL v4.9 — TODAS LAS VERIFICACIONES EN VERDE'
    : `%cLECTOR EDITORIAL v4.9 — ${fallas} verificación(es) en rojo`,
    `background:${fallas === 0 ? '#3aaa35' : '#c0392b'};color:#0a0e10;padding:2px 8px;border-radius:3px;font-weight:bold`);
})();
