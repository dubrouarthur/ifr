// A tiny SVG DOM for tests that build the diagram widgets outside a browser (the same fake as
// tests/slide-readability.test.ts): enough for createElementNS, attributes, children and text.
class FakeNode {
  parentNode: FakeEl | null = null;
  constructor(public nodeType: number) {}
  remove() {
    if (!this.parentNode) return;
    const k = this.parentNode.childNodes.indexOf(this as never);
    if (k >= 0) this.parentNode.childNodes.splice(k, 1);
    this.parentNode = null;
  }
  get nextSibling(): FakeNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this as never) + 1] ?? null;
  }
}
class FakeText extends FakeNode {
  constructor(public data: string) {
    super(3);
  }
  get textContent() {
    return this.data;
  }
}
class FakeEl extends FakeNode {
  childNodes: FakeNode[] = [];
  attrs = new Map<string, string>();
  style = { setProperty() {} } as unknown as CSSStyleDeclaration;
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  constructor(public tagName: string) {
    super(1);
  }
  get children(): FakeEl[] {
    return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(...ns: (FakeNode | string)[]) {
    for (const n of ns)
      this.appendChild(typeof n === "string" ? new FakeText(n) : n);
  }
  appendChild(n: FakeNode) {
    n.remove();
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  insertBefore(n: FakeNode, ref: FakeNode | null) {
    n.remove();
    n.parentNode = this;
    const k = ref ? this.childNodes.indexOf(ref) : -1;
    if (k < 0) this.childNodes.push(n);
    else this.childNodes.splice(k, 0, n);
    return n;
  }
  replaceChildren(...ns: (FakeNode | string)[]) {
    for (const c of [...this.childNodes]) c.remove();
    this.append(...ns);
  }
  addEventListener() {}
  get textContent(): string {
    return this.childNodes
      .map((c) => (c as FakeEl | FakeText).textContent)
      .join("");
  }
  set textContent(v: string) {
    this.replaceChildren(new FakeText(v));
  }
}
export function installFakeSvgDom(): void {
  (globalThis as { document?: unknown }).document = {
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => new FakeText(t),
  };
}
