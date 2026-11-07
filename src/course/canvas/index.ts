// Ground school — designed slides (package N): the public surface of the canvas engine.
//   renderSlide / renderThumb   draw a SlideCanvas (player, projector, editor preview, step-list thumbnails)
//   CanvasEditor / EditorCore   the editing surface and its pure controller (one undo history)
//   LibraryPanel / LIBRARY_ITEMS the asset library (text styles, shapes, instruments, diagrams, icons, photos)
//   LAYOUTS / layoutCanvas       eleven layout templates;  THEMES / resolveTheme  the four themes
//   exampleSlides / exampleCourse eight composed example slides
export {
  renderSlide,
  renderThumb,
  SlideView,
  clickSteps,
  isRevealed,
  revealOf,
  type SlideRenderOptions,
} from "./render";
export {
  renderBlock,
  blockLabel,
  cropPlacement,
  leaderStart,
  type SlideMode,
  type SlideSlots,
  type SlotContext,
  type SlotHandle,
} from "./blocks";
export { CanvasEditor, type CanvasEditorOptions } from "./editor";
export {
  EditorCore,
  keyCommand,
  keepsAspect,
  type EditorCommand,
  type Mods,
} from "./editorCore";
export {
  LibraryPanel,
  type LibraryPanelOptions,
  type LibraryTarget,
} from "./libraryPanel";
export {
  LIBRARY_ITEMS,
  LIBRARY_TABS,
  libraryItem,
  searchItems,
  placeDraft,
  emptyCanvas,
  demoScene,
  DEMO_SCENE_ID,
  instrumentScreen,
  textDraft,
  instrumentDraft,
  diagramDraft,
  viewTitle,
  type BlockDraft,
  type LibraryItem,
  type LibraryTab,
} from "./factory";
export {
  LAYOUTS,
  layoutCanvas,
  type LayoutDef,
  type LayoutOptions,
} from "./layouts";
export {
  THEMES,
  THEME_IDS,
  resolveTheme,
  themeVars,
  contrastRatio,
  ensureContrast,
  color as themeColor,
} from "./themes";
export { LIBRARY, libraryAsset, libraryUrl, searchLibrary } from "./library";
export { SceneSims, SlideInstrument, readoutText } from "./instruments";
export {
  exampleSlides,
  exampleCourse,
  exampleScenes,
  SAMPLE_BRAND,
  type ExampleSlide,
} from "./examples";
export { History } from "./history";
export * as canvasOps from "./ops";
export * as canvasGeom from "./geom";
export { parseRich, plainText, richFragment } from "./text";
