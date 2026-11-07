// Calc engine — generators that exist in both categories (the IFR file owns the maths; here the VFR-flavoured twin).
import type { GeneratorDef } from "../../types";
import { densityAltitudeGenerator } from "../ifr/altimetry";
import { windComponentsGenerator } from "../ifr/perf";

export const pressureDensityAltitudeVfr: GeneratorDef = densityAltitudeGenerator("vfr.pressureDensityAltitude");
export const crosswindVfr: GeneratorDef = windComponentsGenerator("vfr.crosswind");

export const SHARED_VFR_GENERATORS = [pressureDensityAltitudeVfr, crosswindVfr];
