/**
 * diagnostico-pipeline.js — FASE 10 de la auditoría forense
 * ──────────────────────────────────────────────────────────
 * Pegar en la consola del navegador (dispositivo real o DevTools remoto)
 * con el mural cargado. Produce, para cada tarjeta visible de la sede
 * activa, la tabla exigida: posición calculada vs aplicada vs renderizada,
 * dimensiones reales, transform efectivo, zona estimada.
 *
 * Criterio de sincronización: |Δ| ≤ 1px entre la posición calculada
 * (variables --x/--y escritas por layout.js) y el centro real del
 * BoundingClientRect. Diferencias mayores señalan al módulo que
 * desincroniza (columna 'delta').
 */
(() => {
  const sede = [...document.querySelectorAll('.sede')].find(s => {
    const r = s.getBoundingClientRect();
    return r.left > -window.innerWidth / 2 && r.left < window.innerWidth / 2;
  });
  if (!sede) { console.warn('No se encontró la sede activa'); return; }
  const esc = sede.querySelector('.escenario');
  const escR = esc.getBoundingClientRect();
  const MTOP = 92, MBOT = 52, ROWS = 7, COLS = 2;   // M-32: MTOP 72→92, ver layout.js
  const zH = (escR.height - MTOP - MBOT) / ROWS, zW = escR.width / COLS;

  const filas = [...sede.querySelectorAll('.elemento')]
    .filter(el => !el.classList.contains('elemento--rotacion-espera')
               && !el.classList.contains('elemento--oculto-autoridad'))
    .map(el => {
      const cs = getComputedStyle(el);
      // DETECTOR DEL SECUESTRO (H-1/H-10): si computed position es 'relative'
      // o left es 'auto', el elemento fue capturado por la Arquitectura A
      // legacy de styles.css @media(max-width:820px) L1146 — que descarta
      // con !important todo lo que layout.js calculó.
      const capturado = cs.position !== 'absolute' || cs.left === 'auto';
      const xCalc = parseFloat(el.style.getPropertyValue('--x'));
      const yCalc = parseFloat(el.style.getPropertyValue('--y'));
      const r = el.getBoundingClientRect();
      const cx = r.left - escR.left + r.width / 2;
      const cy = r.top - escR.top + r.height / 2;
      const interior = el.querySelector('.elemento-interior');
      const col = cx < escR.width / 2 ? 0 : 1;
      const row = Math.max(0, Math.min(ROWS - 1, Math.floor((cy - MTOP) / zH)));
      const dx = Math.abs(cx - xCalc), dy = Math.abs(cy - yCalc);
      return {
        id: (el.dataset.ua || '?') + '/' + (interior?.querySelector('.registro-titulo, .testimonio-nombre, .video-titulo')?.textContent.trim().slice(0, 18) || el.dataset.tipo),
        tipo: el.dataset.tipo,
        ua: el.dataset.ua,
        ancla: `${el.dataset.anclaX}%, ${el.dataset.anclaY}%`,
        motor: capturado ? '❌ CAPTURADO (styles L1146)' : '✓ layout.js',
        posicion_css: `${cs.position} / left:${cs.left}`,
        calc: `${xCalc}, ${yCalc}`,
        renderizada: `${cx.toFixed(1)}, ${cy.toFixed(1)}`,
        delta: `${dx.toFixed(1)}, ${dy.toFixed(1)} ${!capturado && dx <= 1 && dy <= 1 ? '✓' : '❌'}`,
        offsetWH: `${interior?.offsetWidth}×${interior?.offsetHeight}`,
        rectWH: `${r.width.toFixed(0)}×${r.height.toFixed(0)}`,
        escala: el.style.getPropertyValue('--escala'),
        rot: el.style.getPropertyValue('--rot'),
        zona: `${row}-${col}`,
      };
    });
  console.table(filas);
  const capturados = filas.filter(f => f.motor.includes('❌'));
  const desync = filas.filter(f => f.delta.includes('❌'));
  if (capturados.length) {
    console.log(`❌ HIPÓTESIS CONFIRMADA EN ESTE DISPOSITIVO: ${capturados.length}/${filas.length} tarjetas capturadas por la Arquitectura A legacy (styles.css @media≤820px L1146: left/top:auto !important). El motor de layout calcula; el CSS descarta.`);
  } else {
    console.log(desync.length === 0
      ? '✓ SINCRONIZADO: este dispositivo renderiza exactamente las posiciones de layout.js (la media query legacy no matchea aquí — bug del layout-viewport 980px)'
      : `⚠ ${desync.length} tarjeta(s) con delta — revisar columna delta`);
  }
  console.log(`Media (max-width:820px) matchea: ${matchMedia('(max-width: 820px)').matches} | es-mobile: ${document.documentElement.classList.contains('es-mobile')} | innerWidth: ${window.innerWidth}`);
  console.log(`Lienzo: ${escR.width.toFixed(0)}×${escR.height.toFixed(0)} | innerHeight: ${window.innerHeight} | dif (barra URL): ${(window.innerHeight - escR.height).toFixed(0)}px`);
})();
