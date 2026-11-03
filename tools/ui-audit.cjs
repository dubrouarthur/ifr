// UI audit: clicks every top-bar button and every "More" menu item, opens each window, and checks:
//  - no page errors / console errors
//  - something visible opened (modal, drawer, menu, panel, toast or state change)
//  - the opened window fits in the viewport and has no horizontally clipped content
//  - the lesson / coach panel is not hidden behind other elements
// Usage: node tools/ui-audit.cjs <outDir> [baseUrl] [w] [h]
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const OUT = process.argv[2] || 'audit';
  const BASE = process.argv[3] || 'http://localhost:4173';
  const W = Number(process.argv[4] || 1600), H = Number(process.argv[5] || 1000);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.addInitScript(() => {
    localStorage.setItem('ifr.tour.v1', 'true');
    // deterministic measurements: no animations/transitions
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(st); });
  });
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource|WebGL/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  await p.goto(`${BASE}/?scenario=ils27-vtf`);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__ifr.sim.paused = true; });
  const report = [];
  const closeAll = async () => {
    await p.evaluate(() => {
      document.querySelectorAll('.modal-bg.open .modal header .x').forEach((x) => x.click());
      document.querySelectorAll('.drawer.open .x').forEach((x) => x.click());
      document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
      document.querySelectorAll('.cdu.open .cdu-close').forEach((x) => x.click());
      document.querySelectorAll('.tour, .tour-card').forEach((x) => x.remove());
    });
    await p.waitForTimeout(150);
  };
  /** what is open + geometry problems */
  const inspect = () => p.evaluate(() => {
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
    const open = [];
    document.querySelectorAll('.modal-bg.open .modal').forEach((m) => open.push({ kind: 'modal', name: m.getAttribute('aria-label') || '', el: m }));
    document.querySelectorAll('.drawer.open').forEach((m) => open.push({ kind: 'drawer', name: m.getAttribute('aria-label') || '', el: m }));
    document.querySelectorAll('.menu.open').forEach((m) => open.push({ kind: 'menu', name: 'menu', el: m }));
    document.querySelectorAll('.cdu.open').forEach((m) => open.push({ kind: 'cdu', name: 'CDU', el: m }));
    const W = innerWidth, H = innerHeight;
    return open.map((o) => {
      const r = o.el.getBoundingClientRect();
      const problems = [];
      if (!vis(o.el)) problems.push('not visible');
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) problems.push(`outside viewport [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      // occlusion: is the centre of the window actually the window?
      const top = document.elementFromPoint(Math.min(W - 2, Math.max(1, r.left + r.width / 2)), Math.min(H - 2, Math.max(1, r.top + Math.min(r.height / 2, 60))));
      if (top && !o.el.contains(top)) problems.push(`covered by ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 30)}`);
      // clipped text: elements whose text overflows horizontally (ellipsis allowed)
      let clipped = 0;
      const samples = [];
      o.el.querySelectorAll('button, b, span, label, h1, h2, h3, p, div').forEach((e) => {
        if (!e.childElementCount && e.textContent && e.textContent.trim() && e.scrollWidth > e.clientWidth + 2) {
          const cs = getComputedStyle(e);
          if (cs.textOverflow === 'ellipsis' || cs.overflow === 'visible' || cs.overflowX === 'visible') return;
          clipped++;
          if (samples.length < 3) samples.push(e.textContent.trim().slice(0, 30));
        }
      });
      if (clipped) problems.push(`${clipped} clipped text (${samples.join(' | ')})`);
      return { kind: o.kind, name: o.name, problems };
    });
  });

  // ---------------------------------------------------------------- top bar buttons
  await closeAll();
  const tb = await p.$$eval('.topbar button', (bs) => bs.map((b, i) => ({ i, t: (b.textContent || '').trim() || b.title || b.getAttribute('aria-label') || `#${i}`, title: b.title })));
  for (const btn of tb) {
    await closeAll();
    const before = await p.evaluate(() => document.body.innerText.length);
    log(`topbar ${btn.t}`);
    await p.evaluate((i) => document.querySelectorAll('.topbar button')[i].click(), btn.i);
    await p.waitForTimeout(700);
    const st = await inspect();
    const after = await p.evaluate(() => document.body.innerText.length);
    const toast = await p.evaluate(() => document.querySelectorAll('.toast').length);
    const ok = st.length > 0 || toast > 0 || after !== before;
    report.push({ where: 'topbar', label: btn.t, title: btn.title, opened: st.map((s) => `${s.kind}:${s.name}`).join(', ') || (toast ? 'toast' : after !== before ? 'state change' : 'NOTHING'), problems: st.flatMap((s) => s.problems), ok });
    if (!report[report.length - 1].ok || report[report.length - 1].problems.length) await p.screenshot({ path: `${OUT}/tb-${String(btn.i).padStart(2, '0')}.png` });
  }

  // ---------------------------------------------------------------- More menu items
  await closeAll();
  const moreIdx = tb.find((x) => /More/.test(x.t) || /More/.test(x.title))?.i;
  if (moreIdx !== undefined) {
    await p.evaluate((i) => document.querySelectorAll('.topbar button')[i].click(), moreIdx);
    await p.waitForTimeout(200);
    const items = await p.$$eval('.menu .menu-item', (bs) => bs.map((b, i) => ({ i, t: (b.textContent || '').trim() })));
    const menuState = await inspect();
    report.push({ where: 'more', label: 'More (menu)', opened: menuState.map((s) => s.kind).join(','), problems: menuState.flatMap((s) => s.problems), ok: menuState.some((s) => s.kind === 'menu') });
    for (const it of items) {
      await closeAll();
      await p.evaluate((i) => document.querySelectorAll('.topbar button')[i].click(), moreIdx);
      await p.waitForTimeout(120);
      await p.evaluate((i) => document.querySelectorAll('.menu .menu-item')[i].click(), it.i);
      await p.waitForTimeout(400);
      const st = await inspect();
      const tour = await p.evaluate(() => !!document.querySelector('.tour, .tour-card, .explain-on, body.explain'));
      report.push({ where: 'more', label: it.t, opened: st.map((s) => `${s.kind}:${s.name}`).join(', ') || (tour ? 'overlay' : 'NOTHING'), problems: st.flatMap((s) => s.problems), ok: st.length > 0 || tour });
      if (!report[report.length - 1].ok || report[report.length - 1].problems.length) await p.screenshot({ path: `${OUT}/more-${String(it.i).padStart(2, '0')}.png` });
    }
  }

  // ---------------------------------------------------------------- lesson visibility (start a real lesson)
  await closeAll();
  await p.evaluate(() => window.__ifr.lesson('hold-teardrop'));
  await p.waitForTimeout(600);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.modal-bg.open button')].find((x) => /Start/i.test(x.textContent)); b?.click(); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/lesson.png` });
  const lesson = await p.evaluate(async () => {
    const c = document.querySelector('.coach');
    if (!c) return { problems: ['no coach element'] };
    const r = c.getBoundingClientRect();
    const pts = [[r.left + 10, r.top + 10], [r.right - 10, r.top + 10], [r.left + r.width / 2, r.top + r.height / 2], [r.left + 10, r.bottom - 6]];
    const covered = pts.map(([x, y]) => document.elementFromPoint(x, y)).filter((e) => e && !c.contains(e)).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`);
    const cs = getComputedStyle(c);
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], z: cs.zIndex, covered: [...new Set(covered)] };
  });
  report.push({ where: 'lesson', label: 'coach panel', opened: JSON.stringify(lesson.rect), problems: lesson.covered?.length ? [`covered by ${lesson.covered.join(', ')}`] : lesson.problems ?? [], ok: !lesson.covered?.length });

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ errors, report }, null, 1));
  const bad = report.filter((r) => !r.ok || r.problems.length);
  console.log(`${report.length} checks · ${bad.length} with issues · ${errors.length} errors`);
  for (const r of bad) console.log(`- [${r.where}] ${r.label} → ${r.opened} ${r.problems.length ? '· ' + r.problems.join(' · ') : ''}`);
  for (const e of [...new Set(errors)].slice(0, 15)) console.log('  ERR', e);
  await b.close();
})();
