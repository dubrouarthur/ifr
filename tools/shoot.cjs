// Screenshot helper for UI reviews.
// node tools/shoot.cjs <out.png> [--w 1600] [--h 1000] [--url "/?scenario=ils27-vtf"] [--js "<code run in page>"]
//                     [--wait 1200] [--clip ".selector"] [--gl] [--keep-modal] [--dpr 1]
// The page is opened with the guided tour disabled; unless --keep-modal, open modals are closed and the sim paused
// before --js runs. --gl enables software WebGL (3D outside view; slow). window.__ifr exposes { sim, outside,
// charts(id), world(), lesson(id) }. Prints page errors.
const { chromium } = require('playwright');
const a = process.argv.slice(2);
const out = a[0];
const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
const flag = (k) => a.includes(`--${k}`);
(async () => {
  const b = await chromium.launch(flag('gl') ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const p = await b.newPage({ viewport: { width: Number(opt('w', 1600)), height: Number(opt('h', 1000)) }, deviceScaleFactor: Number(opt('dpr', 1)) });
  await p.addInitScript(() => {
    localStorage.setItem('ifr.tour.v1', 'true');
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(st); });
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await p.goto(`http://localhost:4173${opt('url', '/?scenario=ils27-vtf')}`);
  await p.waitForTimeout(1500);
  if (!flag('keep-modal')) await p.evaluate(() => { document.querySelectorAll('.modal-bg.open .modal header .x').forEach((x) => x.click()); if (window.__ifr) window.__ifr.sim.paused = true; });
  const js = opt('js', '');
  if (js) await p.evaluate(js);
  await p.waitForTimeout(Number(opt('wait', 1200)));
  const clip = opt('clip', '');
  if (clip) { const el = await p.$(clip); if (el) await el.screenshot({ path: out, timeout: 120000 }); else console.log('clip selector not found:', clip); }
  else await p.screenshot({ path: out, timeout: 120000 });
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'ok');
  await b.close();
})();
