// The 3D engines of the course: the models' numbers (model.ts), the levers and gauges (sim.ts), the view
// (view.ts: mountEngine, engineSnapshot).
export { mountEngine, engineSnapshot, buildEngineModel } from "./view";
export type { EngineHandle, EngineLiveState, EngineViewOpts, RendererLike } from "./view";
export { ENGINE_KINDS, ENGINE_NAME, ENGINE_WHAT, ENGINE_CONTROLS, ENGINE_GAUGES, EngineSim } from "./sim";
