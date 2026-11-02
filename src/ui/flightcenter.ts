// Flight Center: one hub for every flight, classified by type, with search, filters and a detail pane.
import { h, clear, store } from './dom';
import { Modal, WX_PRESETS, type WxPreset } from './modals';
import { CATEGORIES, catalog, type CatId, type Item } from './catalog';
import { PATHS, type Path } from '../train/curriculum';
import { progress } from './learn';
import { approachPlate } from '../plates/plates';
import { approach } from '../nav/data';
import type { AssessSettings, Scenario } from '../sim/sim';
import type { Exercise } from '../train/engine';

export type CockpitType = 'g1000' | 'steam' | 'airliner';

export interface FcHooks {
  flyScenario: (sc: Scenario, wx: WxPreset, a: AssessSettings) => void;
  briefExercise: (ex: Exercise, path: Path | null) => void;
  openPaths: () => void;
  openDrill: () => void;
  openRecords: () => void;
  openChart: (id: string) => void;
  setCockpit: (t: CockpitType) => void;
  getCockpit: () => CockpitType;
}

type View = { type: 'home' } | { type: 'cat'; cat: CatId; sub: string | null } | { type: 'path'; path: Path } | { type: 'search' };

const DIFF = ['', 'Easy', 'Medium', 'Hard'];
const COCKPITS: { id: CockpitType; title: string; desc: string }[] = [
  { id: 'g1000', title: 'G1000 glass', desc: 'PFD + MFD, GFC 700 autopilot' },
  { id: 'steam', title: 'Steam gauges', desc: 'Six-pack, CDI/RMI, KAP 140, radio stack' },
  { id: 'airliner', title: 'Airliner', desc: 'Boeing-style PFD/ND with MCP' },
];

export class FlightCenter extends Modal {
  private view: View = { type: 'home' };
  private q = '';
  private fDiff = 0;
  private fApt = '';
  private fAp: '' | 'ap' | 'hand' = '';
  private sel: Item | null = null;
  private items = catalog();
  private wx: WxPreset = WX_PRESETS[0];
  private assess: AssessSettings = store.get<AssessSettings>('ifr.assess', { mode: 'training', student: '', handFlown: false, randomFailure: false });
  private side!: HTMLElement;
  private main!: HTMLElement;
  private detail!: HTMLElement;

  constructor(private hooks: FcHooks) {
    super('Flight Center');
    this.box.classList.add('fc');
    clear(this.body);
    this.side = h('nav', { class: 'fc-side' });
    this.main = h('section', { class: 'fc-main' });
    this.detail = h('aside', { class: 'fc-detail' });
    this.body.append(h('div', { class: 'fc-grid' }, this.side, this.main, this.detail));
    this.foot.remove();
  }

  open() {
    this.items = catalog();
    this.render();
    super.open();
  }

  private go(v: View) {
    this.view = v;
    this.sel = null;
    this.render();
  }

  render() {
    this.renderSide();
    this.renderMain();
    this.renderDetail();
  }

  private renderSide() {
    clear(this.side);
    const all = progress.all();
    const navBtn = (label: string, on: boolean, fn: () => void, count?: number, icon?: string) =>
      h('button', { class: `fc-nav${on ? ' on' : ''}`, onclick: fn }, icon ? h('span', { class: 'ic' }, icon) : null, h('span', { class: 'lb' }, label), count !== undefined ? h('span', { class: 'ct' }, String(count)) : null);
    const search = h('input', { type: 'search', placeholder: 'Search flights, approaches, fixes…', value: this.q }) as HTMLInputElement;
    search.addEventListener('input', () => {
      this.q = search.value;
      this.view = this.q ? { type: 'search' } : { type: 'home' };
      this.renderMain();
    });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    this.side.append(h('div', { class: 'fc-search' }, search));
    this.side.append(navBtn('Home', this.view.type === 'home', () => this.go({ type: 'home' }), undefined, '🏠'));
    this.side.append(h('div', { class: 'fc-sec' }, 'Flight types'));
    for (const c of CATEGORIES) {
      const n = this.items.filter((i) => i.cat === c.id).length;
      const on = this.view.type === 'cat' && this.view.cat === c.id;
      this.side.append(navBtn(c.title, on && !(this.view as { sub: string | null }).sub, () => this.go({ type: 'cat', cat: c.id, sub: null }), n, c.icon));
      if (on && c.subs.length > 1) {
        for (const s of c.subs) {
          const ns = this.items.filter((i) => i.cat === c.id && i.sub === s).length;
          if (!ns) continue;
          this.side.append(h('button', { class: `fc-sub${(this.view as { sub: string | null }).sub === s ? ' on' : ''}`, onclick: () => this.go({ type: 'cat', cat: c.id, sub: s }) }, s, h('span', { class: 'ct' }, String(ns))));
        }
      }
    }
    this.side.append(h('div', { class: 'fc-sec' }, 'Learning paths'));
    for (const p of PATHS) {
      const done = p.exercises.filter((id) => all[id]?.passed).length;
      this.side.append(navBtn(p.title.replace(' — complete syllabus', ''), this.view.type === 'path' && this.view.path.id === p.id, () => this.go({ type: 'path', path: p }), undefined, done === p.exercises.length ? '✅' : `${Math.round((done / p.exercises.length) * 100)}%`));
    }
    this.side.append(h('div', { class: 'fc-sec' }, 'Tools'));
    this.side.append(navBtn('Hold-entry drill', false, () => { this.close(); this.hooks.openDrill(); }, undefined, '⚡'));
    this.side.append(navBtn('Training records', false, () => { this.close(); this.hooks.openRecords(); }, undefined, '📋'));
  }

  private filtered(list: Item[]): Item[] {
    return list.filter(
      (i) =>
        (!this.fDiff || i.difficulty === this.fDiff) &&
        (!this.fApt || i.airport === this.fApt) &&
        (!this.fAp || (this.fAp === 'ap' ? i.ap !== false : i.ap === false)),
    );
  }

  private filtersBar(): HTMLElement {
    const chip = (label: string, on: boolean, fn: () => void) => h('button', { class: on ? 'on' : '', onclick: () => { fn(); this.renderMain(); } }, label);
    return h('div', { class: 'fc-filters' },
      h('div', { class: 'filter' }, chip('Any level', !this.fDiff, () => (this.fDiff = 0)), ...[1, 2, 3].map((d) => chip(DIFF[d], this.fDiff === d, () => (this.fDiff = d)))),
      h('div', { class: 'filter' }, chip('Both airports', !this.fApt, () => (this.fApt = '')), chip('PARD', this.fApt === 'PARD', () => (this.fApt = 'PARD')), chip('MSVL', this.fApt === 'MSVL', () => (this.fApt = 'MSVL'))),
      h('div', { class: 'filter' }, chip('AP or hand', !this.fAp, () => (this.fAp = '')), chip('Autopilot OK', this.fAp === 'ap', () => (this.fAp = 'ap')), chip('Hand-flown', this.fAp === 'hand', () => (this.fAp = 'hand'))),
    );
  }

  private card(i: Item): HTMLElement {
    const p = i.kind === 'exercise' ? progress.get(i.id) : undefined;
    const sel = this.sel?.id === i.id;
    return h('button', { class: `fc-card ${i.cat}${sel ? ' sel' : ''}`, onclick: () => { this.sel = i; this.renderDetail(); this.main.querySelectorAll('.fc-card').forEach((c) => c.classList.toggle('sel', c === this.main.querySelector(`[data-id="${i.id}"]`))); }, ondblclick: () => this.fly(i), 'data-id': i.id },
      h('div', { class: 'fc-card-top' }, h('span', { class: 'fc-type' }, i.sub), p?.passed ? h('span', { class: 'lp-badge ok' }, `✓ ${p.best}`) : p ? h('span', { class: 'lp-badge try' }, `${p.best}`) : i.graded ? h('span', { class: 'lp-badge' }, 'Graded') : h('span', { class: 'lp-badge' }, 'Free')),
      h('h3', {}, i.title),
      h('p', {}, i.summary),
      h('div', { class: 'fc-meta' },
        h('span', { class: `lvl l${i.difficulty}` }, DIFF[i.difficulty]),
        h('span', {}, i.airport),
        h('span', {}, `~${i.minutes} min`),
        i.ap === false ? h('span', {}, '✋ hand-flown') : i.ap ? h('span', {}, 'AP ok') : null,
        i.plate ? h('span', {}, '📄 plate') : null,
      ),
    );
  }

  private grid(list: Item[]): HTMLElement {
    const f = this.filtered(list);
    if (!f.length) return h('p', { class: 'muted', style: 'padding:30px;text-align:center' }, 'Nothing matches these filters.');
    return h('div', { class: 'fc-cards' }, ...f.map((i) => this.card(i)));
  }

  private renderMain() {
    clear(this.main);
    const v = this.view;
    if (v.type === 'home') {
      const all = progress.all();
      const ir = PATHS[0];
      const nextId = ir.exercises.find((id) => !all[id]?.passed) ?? ir.exercises[0];
      const next = this.items.find((i) => i.id === nextId)!;
      const passed = ir.exercises.filter((id) => all[id]?.passed).length;
      this.main.append(
        h('div', { class: 'fc-hero' },
          h('div', {},
            h('div', { class: 'fc-kicker' }, 'IFR TRAINER · ARDENT ISLANDS'),
            h('h1', {}, 'What are we flying today?'),
            h('p', { class: 'muted' }, `${this.items.length} flights: 9 approach procedures (ILS, LOC, LDA, back course, VOR/DME, NDB, RNAV LPV & LNAV/VNAV), holdings with every entry, DME arcs, procedure turns, intercepts, IFR cross-country flights, partial panel and checkride profiles — in three cockpits.`),
          ),
          h('div', { class: 'fc-next' },
            h('small', {}, 'Continue your syllabus'),
            h('b', {}, next.title),
            h('span', {}, `${passed}/${ir.exercises.length} exercises passed`),
            h('div', { class: 'lp-bar' }, h('i', { style: `width:${(passed / ir.exercises.length) * 100}%` })),
            h('button', { class: 'btn primary', onclick: () => { this.sel = next; this.renderDetail(); } }, 'Continue →'),
          ),
        ),
      );
      this.main.append(h('div', { class: 'fc-sec2' }, 'Browse by flight type'));
      this.main.append(
        h('div', { class: 'fc-cats' },
          ...CATEGORIES.map((c) =>
            h('button', { class: `fc-cat ${c.id}`, onclick: () => this.go({ type: 'cat', cat: c.id, sub: null }) },
              h('span', { class: 'ic' }, c.icon), h('b', {}, c.title), h('span', {}, c.desc), h('small', {}, ((n) => `${n} flight${n === 1 ? '' : 's'}`)(this.items.filter((i) => i.cat === c.id).length))),
          ),
        ),
      );
      this.main.append(h('div', { class: 'fc-sec2' }, 'Quick start'));
      this.main.append(this.grid(['sc-ils27-vtf', 'hold-teardrop', 'ifr-pard-msvl-rnav', 'app-vor-arc', 'int-loc30', 'sc-lda36'].map((id) => this.items.find((i) => i.id === id)!).filter(Boolean)));
      return;
    }
    if (v.type === 'search') {
      const q = this.q.toLowerCase();
      const res = this.items.filter((i) => i.tags.join(' ').toLowerCase().includes(q) || i.title.toLowerCase().includes(q));
      this.main.append(h('div', { class: 'fc-head' }, h('h2', {}, `Search: “${this.q}”`), h('span', { class: 'muted' }, `${res.length} results`)), this.filtersBar(), this.grid(res));
      return;
    }
    if (v.type === 'path') {
      const all = progress.all();
      const list = v.path.exercises.map((id) => this.items.find((i) => i.id === id)!).filter(Boolean);
      const done = list.filter((i) => all[i.id]?.passed).length;
      this.main.append(h('div', { class: 'fc-head' }, h('div', {}, h('h2', {}, v.path.title), h('p', { class: 'muted' }, v.path.desc)), h('span', { class: 'chip' }, `${done}/${list.length} passed`)));
      const next = list.find((i) => !all[i.id]?.passed);
      const ol = h('ol', { class: 'lp-list' });
      list.forEach((i, k) => {
        ol.append(
          h('li', { class: `${all[i.id]?.passed ? 'done' : ''}${i === next ? ' next' : ''}`, onclick: () => { this.sel = i; this.renderDetail(); } },
            h('span', { class: 'lp-num' }, all[i.id]?.passed ? '✓' : String(k + 1)),
            h('div', { class: 'lp-txt' }, h('b', {}, i.title), h('small', {}, `${i.sub} · ${DIFF[i.difficulty]} · ~${i.minutes} min`), h('span', {}, i.summary)),
            all[i.id] ? h('span', { class: `lp-badge ${all[i.id].passed ? 'ok' : 'try'}` }, String(all[i.id].best)) : h('span', { class: 'lp-badge' }, 'New'),
            h('button', { class: `btn${i === next ? ' primary' : ''}`, onclick: (e: Event) => { e.stopPropagation(); this.fly(i, v.path); } }, i === next ? 'Start' : 'Fly'),
          ),
        );
      });
      this.main.append(ol);
      return;
    }
    const cat = CATEGORIES.find((c) => c.id === v.cat)!;
    this.main.append(h('div', { class: 'fc-head' }, h('div', {}, h('h2', {}, `${cat.icon} ${cat.title}${v.sub ? ' · ' + v.sub : ''}`), h('p', { class: 'muted' }, cat.desc))), this.filtersBar());
    const inCat = this.items.filter((i) => i.cat === v.cat);
    const subs = v.sub ? [v.sub] : cat.subs;
    for (const s of subs) {
      const list = inCat.filter((i) => i.sub === s);
      if (!list.length) continue;
      if (!v.sub) this.main.append(h('div', { class: 'fc-sec2' }, s));
      this.main.append(this.grid(list));
    }
  }

  private renderDetail() {
    clear(this.detail);
    const i = this.sel;
    if (!i) {
      this.detail.append(h('div', { class: 'fc-empty' }, h('div', { style: 'font-size:40px' }, '🛩️'), h('b', {}, 'Select a flight'), h('p', { class: 'muted' }, 'Pick any card to see its briefing, plate and options. Double-click to fly straight away.')));
      this.detail.append(this.cockpitPicker());
      return;
    }
    const cat = CATEGORIES.find((c) => c.id === i.cat)!;
    this.detail.append(
      h('div', { class: 'fc-kicker' }, `${cat.icon} ${cat.title} · ${i.sub}`),
      h('h2', {}, i.title),
      h('div', { class: 'fc-meta' }, h('span', { class: `lvl l${i.difficulty}` }, DIFF[i.difficulty]), h('span', {}, i.airport), h('span', {}, `~${i.minutes} min`), h('span', {}, i.graded ? 'Graded exercise' : 'Free scenario')),
      h('p', {}, i.summary),
    );
    if (i.ex) {
      this.detail.append(h('div', { class: 'section-t' }, 'Objectives'), h('ul', { class: 'tips' }, ...i.ex.objectives.map((o) => h('li', {}, o))));
      this.detail.append(h('div', { class: 'section-t' }, 'Standards'), h('ul', { class: 'tips' }, ...i.ex.standards.map((o) => h('li', {}, o))));
    } else if (i.sc) {
      this.detail.append(h('div', { class: 'section-t' }, 'Briefing'), h('ul', { class: 'tips' }, ...i.sc.briefing.map((o) => h('li', {}, o))));
    }
    if (i.plate) {
      const ap = approach(i.plate);
      this.detail.append(
        h('div', { class: 'section-t' }, `Plate — ${ap.airport} ${ap.name}`),
        h('button', { class: 'fc-plate', title: 'Open in the chart viewer', onclick: () => { this.close(); this.hooks.openChart(i.plate!); } }, h('div', { html: approachPlate(ap) })),
      );
    }
    this.detail.append(this.cockpitPicker());
    if (i.kind === 'scenario') {
      this.detail.append(h('div', { class: 'section-t' }, 'Weather'));
      const sel = h('select', { onchange: (e: Event) => (this.wx = WX_PRESETS[Number((e.target as HTMLSelectElement).value)]) }, ...WX_PRESETS.map((w, k) => h('option', { value: k, selected: w === this.wx }, `${w.name} — ${w.desc}`)));
      this.detail.append(sel);
      this.detail.append(h('div', { class: 'section-t' }, 'Session'));
      const name = h('input', { type: 'text', placeholder: 'Student name', value: this.assess.student, oninput: (e: Event) => { this.assess.student = (e.target as HTMLInputElement).value; store.set('ifr.assess', this.assess); } });
      name.addEventListener('keydown', (e) => e.stopPropagation());
      this.detail.append(
        name,
        h('div', { class: 'seg', style: 'margin-top:8px' },
          h('button', { class: this.assess.mode === 'training' ? 'on' : '', onclick: () => { this.assess.mode = 'training'; store.set('ifr.assess', this.assess); this.renderDetail(); } }, 'Training (coached)'),
          h('button', { class: this.assess.mode === 'checkride' ? 'on' : '', onclick: () => { this.assess.mode = 'checkride'; store.set('ifr.assess', this.assess); this.renderDetail(); } }, 'Checkride (ACS)'),
        ),
      );
      if (this.assess.mode === 'checkride')
        this.detail.append(
          h('label', { class: 'fc-check' }, h('input', { type: 'checkbox', checked: this.assess.handFlown, onchange: (e: Event) => { this.assess.handFlown = (e.target as HTMLInputElement).checked; store.set('ifr.assess', this.assess); } }), ' Hand-flown (AP inhibited)'),
          h('label', { class: 'fc-check' }, h('input', { type: 'checkbox', checked: this.assess.randomFailure, onchange: (e: Event) => { this.assess.randomFailure = (e.target as HTMLInputElement).checked; store.set('ifr.assess', this.assess); } }), ' Random failure on the approach'),
        );
    }
    this.detail.append(h('div', { class: 'fc-cta' }, h('button', { class: 'btn primary big', onclick: () => this.fly(i) }, i.kind === 'exercise' ? 'Brief & fly ✈' : this.assess.mode === 'checkride' ? 'Start checkride ✈' : 'Fly now ✈')));
  }

  private cockpitPicker(): HTMLElement {
    const cur = this.hooks.getCockpit();
    return h('div', {},
      h('div', { class: 'section-t' }, 'Cockpit'),
      h('div', { class: 'fc-cockpits' },
        ...COCKPITS.map((c) => h('button', { class: `fc-ck ${c.id}${cur === c.id ? ' on' : ''}`, onclick: () => { this.hooks.setCockpit(c.id); this.renderDetail(); } }, h('i', {}), h('b', {}, c.title), h('span', {}, c.desc))),
      ),
    );
  }

  private fly(i: Item, path: Path | null = null) {
    this.close();
    if (i.ex) this.hooks.briefExercise(i.ex, path ?? (this.view.type === 'path' ? this.view.path : null));
    else if (i.sc) this.hooks.flyScenario(i.sc, this.wx, { ...this.assess });
  }
}
