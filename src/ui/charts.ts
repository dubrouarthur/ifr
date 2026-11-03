// Charts drawer: approach plates & airport diagrams with zoom/pan, night mode and geo-referenced own-ship.
import { h, clear, store } from './dom';
import { chartIndex, planProjection, type ChartEntry } from '../plates/plates';
import { approach } from '../nav/data';
import type { Sim } from '../sim/sim';
import { DEG } from '../nav/geo';

export class ChartsDrawer {
  el: HTMLElement;
  private tabs: HTMLElement;
  private view: HTMLElement;
  private sheet: HTMLElement;
  private ship: SVGGElement | null = null;
  private entries = chartIndex();
  current: ChartEntry | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private night = store.get('ifr.charts.night', false);
  private airportSel: string;
  private aptSel = h('select', { class: 'chart-apt', 'aria-label': 'Airport' }) as HTMLSelectElement;
  /** airports offered: those with procedures first, then the rest of the loaded region */
  private fillAirports() {
    const withIap = new Set(this.entries.filter((e) => e.kind === 'IAP').map((e) => e.airport));
    const list = [...new Set(this.entries.map((e) => e.airport))].sort((a, b) => Number(withIap.has(b)) - Number(withIap.has(a)) || a.localeCompare(b));
    clear(this.aptSel);
    for (const icao of list) this.aptSel.append(h('option', { value: icao, selected: icao === this.airportSel }, `${icao}${withIap.has(icao) ? '' : ' (diagram)'}`));
  }
  /** rebuild after the nav database changed (real-world region loaded / left) */
  refresh() {
    this.entries = chartIndex();
    if (!this.entries.some((e) => e.airport === this.airportSel)) this.airportSel = this.entries[0]?.airport ?? '';
    this.fillAirports();
    this.renderTabs();
    const first = this.entries.find((x) => x.airport === this.airportSel && x.kind === 'IAP') ?? this.entries[0];
    if (first) this.show(first.id);
  }

  constructor(private sim: Sim) {
    this.airportSel = 'PARD';
    this.tabs = h('div', { class: 'chart-tabs' });
    this.sheet = h('div', { class: 'sheet' });
    this.view = h('div', { class: `chart-view${this.night ? ' night' : ''}` }, this.sheet,
      h('div', { class: 'chart-tools' },
        h('button', { class: 'btn', onclick: () => this.setZoom(this.zoom * 1.25), title: 'Zoom in' }, '+'),
        h('button', { class: 'btn', onclick: () => this.setZoom(this.zoom / 1.25), title: 'Zoom out' }, '−'),
        h('button', { class: 'btn', onclick: () => this.fit(), title: 'Fit' }, 'Fit'),
        h('button', { class: 'btn', onclick: () => this.toggleNight(), title: 'Night mode' }, '☾'),
      ),
    );
    const airportSeg = this.aptSel;
    this.aptSel.addEventListener('change', () => {
      this.airportSel = this.aptSel.value;
      this.renderTabs();
      const first = this.entries.find((x) => x.airport === this.airportSel && x.kind === 'IAP') ?? this.entries.find((x) => x.airport === this.airportSel);
      if (first) this.show(first.id);
    });
    this.fillAirports();
    this.el = h('aside', { class: 'drawer', 'aria-label': 'Charts' },
      h('header', {}, h('h3', {}, 'Charts'), airportSeg, h('button', { class: 'x', onclick: () => this.toggle(false), title: 'Close (K)' }, '×')),
      this.tabs,
      this.view,
    );
    this.renderTabs();
    this.bindPanZoom();
  }

  private renderTabs() {
    clear(this.tabs);
    for (const e of this.entries.filter((x) => x.airport === this.airportSel)) {
      this.tabs.append(h('button', { class: this.current?.id === e.id ? 'on' : '', onclick: () => this.show(e.id) }, e.kind === 'APD' ? 'Airport diagram' : e.title));
    }
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  toggle(open?: boolean) {
    const o = open ?? !this.isOpen;
    this.el.classList.toggle('open', o);
    if (o) {
      if (!this.current) {
        const id = this.sim.fp.approachId;
        this.show(id ?? 'PARD-I27');
      } else requestAnimationFrame(() => this.fit());
    }
  }

  show(id: string) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    this.current = e;
    this.airportSel = e.airport;
    this.aptSel.value = e.airport;
    this.el.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.textContent === e.airport));
    this.sheet.innerHTML = e.render();
    this.ship = null;
    if (e.kind === 'IAP') {
      const svg = this.sheet.querySelector('svg')!;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<circle r="11" fill="rgba(255,64,255,0.18)"/><path d="M0,-9 L2,-3 L8,1 L8,3 L2,1 L1,6 L4,8 L4,9 L0,8 L-4,9 L-4,8 L-1,6 L-2,1 L-8,3 L-8,1 L-2,-3 Z" fill="#d000d0" stroke="#fff" stroke-width="0.8"/>';
      svg.append(g);
      this.ship = g;
    }
    this.renderTabs();
    requestAnimationFrame(() => this.fit());
  }

  /** Update own-ship position on the plate. */
  update() {
    if (!this.isOpen || !this.ship || !this.current?.approachId) return;
    const ap = approach(this.current.approachId);
    const { proj, box } = planProjection(ap);
    const p = proj(this.sim.ac.s);
    const inside = p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
    this.ship.style.display = inside ? '' : 'none';
    this.ship.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(this.sim.ac.s.psi / DEG).toFixed(0)})`);
  }

  private toggleNight() {
    this.night = !this.night;
    this.view.classList.toggle('night', this.night);
    store.set('ifr.charts.night', this.night);
  }

  private apply() {
    this.sheet.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  private setZoom(z: number, cx?: number, cy?: number) {
    const r = this.view.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    const nz = Math.max(0.3, Math.min(5, z));
    this.panX = px - ((px - this.panX) * nz) / this.zoom;
    this.panY = py - ((py - this.panY) * nz) / this.zoom;
    this.zoom = nz;
    this.apply();
  }

  fit() {
    const r = this.view.getBoundingClientRect();
    if (!r.width) return;
    this.zoom = Math.min(r.width / 620, r.height / 920);
    this.panX = (r.width - 600 * this.zoom) / 2;
    this.panY = 10;
    this.apply();
  }

  private bindPanZoom() {
    let drag: { x: number; y: number } | null = null;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;
    this.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.view.getBoundingClientRect();
      this.setZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    this.view.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.chart-tools')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag = { x: e.clientX, y: e.clientY };
      this.view.setPointerCapture(e.pointerId);
    });
    this.view.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.setZoom(this.zoom * (d / pinch));
        pinch = d;
        return;
      }
      if (drag) {
        this.panX += e.clientX - drag.x;
        this.panY += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        this.apply();
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = null;
      if (!pts.size) drag = null;
    };
    this.view.addEventListener('pointerup', up);
    this.view.addEventListener('pointercancel', up);
  }
}
