// Ground school — the shipped asset library (package P, built with the canvas): aviation icons, teaching
// diagrams, sample photos and the sample logo. Icons and diagrams are drawn from code (src/course/assets) and
// recolour to the slide theme; photos are the site's own (public/img, with credits).
import type { LibraryAsset, LibraryAssetId, SlideTheme } from "../types";
import { ICONS, iconSvg } from "../assets/icons";
import {
  DIAGRAMS,
  LIGHT_PALETTE,
  type DiagramPalette,
} from "../assets/diagrams";
import { PHOTOS, sampleLogoSvg } from "../assets/photos";

const svgUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const LIBRARY: LibraryAsset[] = [
  ...ICONS.map(
    (i): LibraryAsset => ({
      id: `icon:${i.id}`,
      title: { en: i.en, fr: i.fr },
      kind: "icon",
      src: svgUrl(iconSvg(i)),
      w: 96,
      h: 96,
      tags: i.tags,
      recolor: true,
    }),
  ),
  ...DIAGRAMS.map(
    (d): LibraryAsset => ({
      id: `diagram:${d.id}`,
      title: { en: d.en, fr: d.fr },
      kind: "diagram",
      src: svgUrl(d.svg(LIGHT_PALETTE, "en")),
      w: d.w,
      h: d.h,
      tags: [...d.tags, d.ref],
      attribution: d.ref,
      recolor: true,
    }),
  ),
  ...PHOTOS.map(
    (p): LibraryAsset => ({
      id: `photo:${p.id}`,
      title: { en: p.en, fr: p.fr },
      kind: "photo",
      src: `/${p.src}`,
      w: p.w,
      h: p.h,
      tags: p.tags,
      attribution: p.attribution,
    }),
  ),
  {
    id: "logo:sample-school",
    title: { en: "Sample school logo", fr: "Logo d’école (exemple)" },
    kind: "logo",
    src: svgUrl(sampleLogoSvg("#1665d8")),
    w: 360,
    h: 64,
    tags: ["logo", "school", "brand", "école"],
    recolor: true,
  },
];
const BY_ID = new Map(LIBRARY.map((a) => [a.id, a]));

export const libraryAsset = (
  id: LibraryAssetId | string,
): LibraryAsset | undefined => BY_ID.get(id as LibraryAssetId);

/** The diagram palette of a theme. */
export function paletteOf(theme: SlideTheme): DiagramPalette {
  const c = theme.colors;
  return {
    fg: c.text,
    muted: c.muted,
    line: c.line,
    accent: c.accent,
    green: c.green,
    magenta: c.magenta,
    amber: c.amber,
    cyan: c.cyan,
    surface: c.surface,
  };
}

export interface LibraryUrlOptions {
  /** a recolourable asset in this colour (icons, logo) */
  color?: string;
  /** diagrams take the theme's palette */
  theme?: SlideTheme;
  lang?: "en" | "fr";
}
/** A URL an <img> can show for a library asset (null: unknown id). */
export function libraryUrl(
  id: LibraryAssetId | string,
  o: LibraryUrlOptions = {},
): string | null {
  const a = libraryAsset(id);
  if (!a) return null;
  const [kind, name] = [a.kind, a.id.slice(a.id.indexOf(":") + 1)];
  if (kind === "icon") {
    const def = ICONS.find((i) => i.id === name);
    return def
      ? svgUrl(iconSvg(def, o.color ?? o.theme?.colors.text ?? "#111827"))
      : a.src;
  }
  if (kind === "diagram") {
    const def = DIAGRAMS.find((d) => d.id === name);
    if (!def) return a.src;
    return svgUrl(
      def.svg(o.theme ? paletteOf(o.theme) : LIGHT_PALETTE, o.lang ?? "en"),
    );
  }
  if (kind === "logo")
    return svgUrl(sampleLogoSvg(o.color ?? o.theme?.colors.brand ?? "#1665d8"));
  return a.src;
}

/** Search the library: every word must match the title (EN or FR), a tag or the id. */
export function searchLibrary(
  q: string,
  kind?: LibraryAsset["kind"],
): LibraryAsset[] {
  const words = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return LIBRARY.filter((a) => {
    if (kind && a.kind !== kind) return false;
    if (!words.length) return true;
    const hay = norm([a.id, a.title.en, a.title.fr ?? "", ...a.tags].join(" "));
    return words.every((w) => hay.includes(w));
  });
}
