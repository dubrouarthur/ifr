// The steps of each engine (course/engines): a stroke of the cycle, a station of the gas path, a part of the
// governor, with the words the caption says. Pure data (no three.js): the inspector and the validator read it.
import type { EngineKind, L10n } from "../types";
import type { EngineStage } from "./kit";

const L = (en: string, fr: string): L10n => ({ en, fr });

export const PISTON_STAGES: EngineStage[] = [
  {
    id: "intake",
    name: L("Intake", "Admission"),
    text: L(
      "The intake valve is open and the piston goes down: it draws the fuel-air mixture into the cylinder.",
      "La soupape d’admission est ouverte, le piston descend : il aspire le mélange air-essence dans le cylindre.",
    ),
    focus: ["intakeValve", "piston", "intake"],
  },
  {
    id: "compression",
    name: L("Compression", "Compression"),
    text: L(
      "Both valves are closed and the piston comes up: it squeezes the mixture. The spark comes just before the top.",
      "Les deux soupapes sont fermées, le piston remonte : il comprime le mélange. L’étincelle jaillit juste avant le haut.",
    ),
    focus: ["piston", "plugs"],
  },
  {
    id: "power",
    name: L("Power", "Combustion-détente"),
    text: L(
      "The mixture burns and pushes the piston down: the only stroke that gives work. The rod turns the crankshaft.",
      "Le mélange brûle et repousse le piston : le seul temps moteur. La bielle fait tourner le vilebrequin.",
    ),
    focus: ["plugs", "rod", "crank"],
  },
  {
    id: "exhaust",
    name: L("Exhaust", "Échappement"),
    text: L(
      "The exhaust valve opens and the piston comes up: it pushes the burnt gases out to the exhaust.",
      "La soupape d’échappement s’ouvre, le piston remonte : il chasse les gaz brûlés vers l’échappement.",
    ),
    focus: ["exhaustValve", "exhaust"],
  },
  {
    id: "ignition",
    name: L("Dual ignition", "Double allumage"),
    text: L(
      "Two magnetos, two plugs per cylinder: each magneto makes its own spark, with no battery. At the run-up, one magneto at a time: a small rpm drop shows both work.",
      "Deux magnétos, deux bougies par cylindre : chaque magnéto produit sa propre étincelle, sans batterie. Au point fixe, une magnéto à la fois : une petite chute de régime montre que les deux fonctionnent.",
    ),
    focus: ["magL", "magR", "plugs"],
  },
  {
    id: "carb",
    name: L("Carburettor and mixture", "Carburateur et mélange"),
    text: L(
      "The air speeds up in the venturi and draws fuel through the jet. The throttle valve sets how much mixture goes in; the mixture control sets how much fuel for that air.",
      "L’air accélère dans le venturi et aspire l’essence par le gicleur. Le papillon dose la quantité de mélange ; la commande de mélange dose l’essence pour cet air.",
    ),
    focus: ["carb", "throttleValve", "mixtureNeedle"],
  },
  {
    id: "carbHeat",
    name: L("Carburettor heat", "Réchauffage carburateur"),
    text: L(
      "The venturi cools the air: ice can form, even at +20 °C in humid air. Carburettor heat takes warm air from round the exhaust: the rpm drops a little, then rises if ice melts.",
      "Le venturi refroidit l’air : du givre peut se former, même à +20 °C en air humide. Le réchauffage prend de l’air chaud autour de l’échappement : le régime baisse un peu, puis remonte si du givre fond.",
    ),
    focus: ["heatValve", "muffler", "airFilter"],
  },
];

export const TURBOFAN_STAGES: EngineStage[] = [
  {
    id: "fan",
    name: L("Fan and by-pass", "Soufflante et flux secondaire"),
    text: L(
      "The fan moves a large mass of air. About five times more air goes round the core than through it (by-pass ratio 5.1:1): this cold stream gives most of the thrust.",
      "La soufflante met en mouvement une grande masse d’air. Environ cinq fois plus d’air contourne le cœur qu’il n’en traverse (taux de dilution 5,1:1) : ce flux froid donne l’essentiel de la poussée.",
    ),
    focus: ["fan", "bypass"],
  },
  {
    id: "compressors",
    name: L("LP and HP compressors", "Compresseurs BP et HP"),
    text: L(
      "In the core, the low-pressure compressor (on the fan's shaft, N1) then the high-pressure compressor (its own shaft, N2) raise the pressure stage after stage.",
      "Dans le cœur, le compresseur basse pression (sur l’arbre de la soufflante, N1) puis le compresseur haute pression (son propre arbre, N2) font monter la pression étage après étage.",
    ),
    focus: ["lpc", "hpc"],
  },
  {
    id: "combustor",
    name: L("Combustion chamber", "Chambre de combustion"),
    text: L(
      "Fuel is sprayed into the annular chamber and burns continuously, at constant pressure: the gas leaves much hotter and faster.",
      "Le carburant est injecté dans la chambre annulaire et brûle en continu, à pression constante : le gaz en sort beaucoup plus chaud et plus rapide.",
    ),
    focus: ["combustor"],
  },
  {
    id: "turbines",
    name: L("HP and LP turbines", "Turbines HP et BP"),
    text: L(
      "The HP turbine drives the HP compressor (N2). The LP turbine drives the fan and the LP compressor (N1) through a shaft inside the HP shaft. EGT is measured after them.",
      "La turbine HP entraîne le compresseur HP (N2). La turbine BP entraîne la soufflante et le compresseur BP (N1) par un arbre logé dans l’arbre HP. L’EGT se mesure après elles.",
    ),
    focus: ["hpt", "lpt", "shafts"],
  },
  {
    id: "nozzle",
    name: L("Nozzle and thrust", "Tuyère et poussée"),
    text: L(
      "The hot core stream and the cold by-pass stream leave through their nozzles. Thrust grows steeply with N1: the last per cent of N1 gives a lot.",
      "Le flux chaud du cœur et le flux froid secondaire sortent par leurs tuyères. La poussée croît vite avec le N1 : les derniers pour cent de N1 comptent beaucoup.",
    ),
    focus: ["nozzle", "bypass"],
  },
  {
    id: "reversers",
    name: L("Thrust reversers", "Inverseurs de poussée"),
    text: L(
      "On the ground only: the aft cowl slides back, blocker doors close the by-pass duct and the cascades send the fan's air forward. Only the cold stream is reversed.",
      "Au sol seulement : le capot arrière recule, des volets obturent le canal secondaire et les grilles renvoient l’air de la soufflante vers l’avant. Seul le flux froid est inversé.",
    ),
    focus: ["reverser", "cascades"],
  },
];

export const TURBOPROP_STAGES: EngineStage[] = [
  {
    id: "inlet",
    name: L("Air intake", "Entrée d’air"),
    text: L(
      "The air comes in through the intake and its screen, then turns into the compressor.",
      "L’air entre par l’entrée d’air et sa grille de protection, puis s’engage dans le compresseur.",
    ),
    focus: ["inlet"],
  },
  {
    id: "compressor",
    name: L("Compressor", "Compresseur"),
    text: L(
      "Axial stages then a centrifugal stage compress the air. The compressor turns with the gas generator turbine: their speed is Ng.",
      "Des étages axiaux puis un étage centrifuge compriment l’air. Le compresseur tourne avec la turbine du générateur de gaz : leur vitesse est le Ng.",
    ),
    focus: ["compressor"],
  },
  {
    id: "combustor",
    name: L("Combustion chamber", "Chambre de combustion"),
    text: L(
      "Fuel burns continuously in the annular chamber. ITT, between the two turbines, is the temperature to watch at start and at high power.",
      "Le carburant brûle en continu dans la chambre annulaire. L’ITT, entre les deux turbines, est la température à surveiller au démarrage et à forte puissance.",
    ),
    focus: ["combustor", "itt"],
  },
  {
    id: "ggTurbine",
    name: L("Gas generator turbine", "Turbine du générateur de gaz"),
    text: L(
      "This turbine takes just enough energy to drive the compressor. With the compressor and the chamber it makes the gas generator (Ng).",
      "Cette turbine prélève juste assez d’énergie pour entraîner le compresseur. Avec lui et la chambre, elle forme le générateur de gaz (Ng).",
    ),
    focus: ["ggTurbine"],
  },
  {
    id: "freeTurbine",
    name: L("Free turbine", "Turbine libre"),
    text: L(
      "The free turbine has no mechanical link with the compressor: the gas alone drives it. It turns the propeller through its own shaft (Np).",
      "La turbine libre n’a aucun lien mécanique avec le compresseur : seul le gaz l’entraîne. Elle fait tourner l’hélice par son propre arbre (Np).",
    ),
    focus: ["freeTurbine", "shaft"],
  },
  {
    id: "gearbox",
    name: L("Reduction gearbox and propeller", "Réducteur et hélice"),
    text: L(
      "The reduction gearbox brings the turbine's very high speed down to the propeller's. The governor holds Np; the torque gauge reads the power.",
      "Le réducteur ramène la très grande vitesse de la turbine à celle de l’hélice. Le régulateur tient le Np ; le couplemètre indique la puissance.",
    ),
    focus: ["gearbox", "prop"],
  },
];

export const PROP_STAGES: EngineStage[] = [
  {
    id: "overview",
    name: L("Constant-speed propeller", "Hélice à vitesse constante"),
    text: L(
      "The throttle sets the manifold pressure, the propeller lever sets the rpm. The governor changes the blade angle to hold that rpm whatever the power.",
      "La manette des gaz règle la pression d’admission, la manette d’hélice règle le régime. Le régulateur change le pas des pales pour tenir ce régime, quelle que soit la puissance.",
    ),
    focus: ["blades", "governor"],
  },
  {
    id: "flyweights",
    name: L("Flyweights", "Masselottes"),
    text: L(
      "Driven by the engine, the flyweights lean out as the rpm rises (centrifugal force) and in as it falls. The speeder spring pushes against them.",
      "Entraînées par le moteur, les masselottes s’écartent quand le régime monte (force centrifuge) et se referment quand il baisse. Le ressort de consigne s’y oppose.",
    ),
    focus: ["flyweights", "spring"],
  },
  {
    id: "spring",
    name: L("Speeder spring and lever", "Ressort de consigne et manette"),
    text: L(
      "The propeller lever squeezes the speeder spring more or less: that is the rpm asked for. More spring, more rpm before the flyweights win.",
      "La manette d’hélice comprime plus ou moins le ressort de consigne : c’est le régime demandé. Plus de ressort, plus de régime avant que les masselottes ne l’emportent.",
    ),
    focus: ["spring", "lever"],
  },
  {
    id: "pilotValve",
    name: L("Pilot valve and oil", "Distributeur et huile"),
    text: L(
      "On speed the pilot valve covers its ports. Overspeed lifts it one way, underspeed the other: oil moves the hub's piston and the blade angle changes until the rpm is back.",
      "En régime, le distributeur obture ses orifices. La survitesse le déplace dans un sens, la sous-vitesse dans l’autre : l’huile déplace le piston du moyeu et le pas change jusqu’au retour du régime.",
    ),
    focus: ["pilotValve", "oil", "hub"],
  },
  {
    id: "order",
    name: L("Lever order", "Ordre des manettes"),
    text: L(
      "To add power: rpm first (propeller), then manifold pressure (throttle). To reduce: throttle first, then propeller. Never a high manifold pressure at a low rpm.",
      "Pour augmenter la puissance : d’abord le régime (hélice), puis la pression d’admission (gaz). Pour réduire : d’abord les gaz, puis l’hélice. Jamais de forte pression d’admission à bas régime.",
    ),
    focus: ["lever", "governor"],
  },
];

/** every engine's steps */
export const ENGINE_STAGES: Record<EngineKind, EngineStage[]> = {
  piston: PISTON_STAGES,
  prop: PROP_STAGES,
  turboprop: TURBOPROP_STAGES,
  turbofan: TURBOFAN_STAGES,
};
