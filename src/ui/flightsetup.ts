// "Plan a flight": the entry point of the flight builder for a new flight (Flight Center, top-bar flight menu,
// Shift+N). Planning and building are one editor — the flight builder (src/ui/circuitBuilder.ts): this class
// only opens it for a new flight of the requested kind, real world first, and gives it the shell's hooks
// (region changes, flying graded or free).
import { Modal } from "./modals";
import type { Circuit } from "../train/circuits";
import type { Scenario } from "../sim/sim";
import { defaultSetup, type FlightSetupState, type FlightType } from "../train/setup";
import { CircuitBuilder, connectPlanner, sharedBuilder, metarLine } from "./circuitBuilder";
export type { FlightSetupState, FlightType } from "../train/setup";
export { metarLine };

export interface SetupHooks {
  flyGraded: (c: Circuit, st: FlightSetupState) => void;
  flyFree: (sc: Scenario, st: FlightSetupState) => void;
  openChart: (id: string) => void;
  /** the nav database / terrain changed (real-world region loaded or left) */
  regionChanged: () => void;
}

export class FlightSetup extends Modal {
  /** kept for callers that read the last plan's preferences */
  st: FlightSetupState = defaultSetup();
  toast?: (m: string) => void;
  private own: CircuitBuilder | null = null;

  constructor(private hooks: SetupHooks) {
    super("Plan a flight");
    // this modal is never shown: the flight builder is the editor
    this.bg.remove();
    connectPlanner({
      regionChanged: () => this.hooks.regionChanged(),
      flyGraded: (c, st) => this.hooks.flyGraded(c, st),
      flyFree: (sc, st) => this.hooks.flyFree(sc, st),
      openChart: (id) => this.hooks.openChart(id),
    });
  }

  private builder(): CircuitBuilder {
    const b = sharedBuilder();
    if (b) return b;
    // no builder constructed by the shell: make one that flies through the planner hooks
    this.own ??= new CircuitBuilder(
      (c) => this.hooks.flyGraded(c, this.st),
      (m) => this.toast?.(m),
    );
    return this.own;
  }

  /** a new flight of this kind (route, approach, hold or free flight) in the real world or the training region */
  start(type?: FlightType, world?: "real" | "training") {
    this.builder().plan(type ?? "route", world ?? "real");
  }
  open() {
    this.start();
  }
  get isOpen() {
    return sharedBuilder()?.isOpen ?? false;
  }
  close() {
    sharedBuilder()?.close();
  }
}

