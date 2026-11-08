// The start page (« Page de démarrage », UX logic §1), shown on the first visit of a browser session. One scrolling
// product page on light chart-room paper that presents the whole platform in the order a newcomer needs it:
//   1. hero: what it is (the tagline), who it is for, Commencer / Explorer la bibliothèque, the five-waypoint route
//      (Créer, Enseigner, Apprendre, Voler, Débriefer) and three real screens (le vol, le cours, le résultat);
//   2. Comment ça marche: the route with the role under each verb, then one row per verb (a real capture, a second
//      one over it, three ticks, a role pill);
//   3. Pour qui: élèves, instructeurs, aéroclubs et écoles;
//   4. La bibliothèque: the four formations with their counts, the Club and Instructeurs rows, a formation page;
//   5. Le simulateur: G1000 and classic panel, the emergency checklist, what it does, « fonctionne aussi seul »;
//   6. the sources, the two languages and the honest note (procedure training, not a certified FSTD);
//   7. « Commencez par l'Accueil »: the three tabs of the app, Commencer / Explorer, « Ne plus afficher… ».
// A slim sticky bar holds the brand, the section anchors, FR | EN and a Commencer that shows only while neither
// in-page Commencer is on screen (one filled button per screen). Every picture is a real capture
// (public/img/landing, WebP, lazy below the fold); no claim, number or logo the product does not back.
// Commencer (Enter, Esc or F2) opens Accueil; Explorer opens the Bibliothèque. While the page is open everything
// behind it is inert and the 3D world is held back (main.ts). Styles: src/styles/ui-landing.css.
import { BRAND, brandLead, brandMarkSvg, brandTagline } from "../brand";
import { programArt } from "../library/programArt";
import { h, store } from "./dom";
import { lang as uiLang, setLang, onLangChange } from "./i18n";

export interface IntroHooks {
  /** Commencer: Accueil (it focuses its own h1) */
  enter: () => void;
  /** Explorer la bibliothèque: the Bibliothèque; the button is hidden when not wired */
  courses?: () => void;
  /** after the page has closed, whichever way (the app boots what it held back while the page was up) */
  closed?: () => void;
}

export const INTRO_SKIP_KEY = "ifr.intro.skip";

type Lang2 = "fr" | "en";
type Copy = Record<Lang2, string>;
/** a line with a bold lead-in: [bold, rest] */
type Lead = readonly [string, string];

/** The deep links the page opens (the app's own routes, UX logic §1). */
export const INTRO_LINKS = {
  ppl: "academy.html#library&p=ppl",
  night: "academy.html#library&p=night",
  ir: "academy.html#library&p=ir",
  atpl: "academy.html#library&p=atpl",
  club: "academy.html#library&p=club",
  instructors: "academy.html#library&p=instructors",
  newCourse: "academy.html#new",
} as const;

/** What the library holds, as its landing shows it (src/library/model shelves(); tests/intro.test.ts keeps these in
 *  step with the live model): items per formation and its number of subjects, and the whole library. */
export const INTRO_COUNTS = {
  total: 129,
  ppl: { n: 60, s: 15 },
  night: { n: 22, s: 4 },
  ir: { n: 92, s: 7 },
  atpl: { n: 6, s: 13 },
  club: { n: 4 },
} as const;

/** The real captures the page shows (public/img/landing/<key>-<lang>.webp: every one exists in French and in English,
 *  so the English page shows English screens), their intrinsic size and their alt text. They are re-made with
 *  scratchpad/landing2/build/export3.py from the raw captures. Two of them show the app's own words and go stale when
 *  those change: `studio` (the course editor's top bar and rail) and `templates` (the « Nouveau cours » page);
 *  re-capture both whenever the editor labels move. */
export const INTRO_SHOTS = {
  "cockpit-g1000": {
    size: { fr: [1280, 668], en: [1280, 668] },
    alt: {
      fr: "Le simulateur intégré en vol : Cessna 172 G1000, PFD et MFD, la consigne de l’exercice et le message du contrôle.",
      en: "The built-in simulator in flight: Cessna 172 G1000, PFD and MFD, the exercise instruction and the ATC call.",
    },
  },
  "course-slide": {
    size: { fr: [1280, 800], en: [1280, 800] },
    alt: {
      fr: "Une diapositive de cours : un HSI en direct annoté en trois points, aiguille de route, barre de déviation et indicateur TO/FROM.",
      en: "A course slide: a live HSI annotated in three callouts, course pointer, deviation bar and TO/FROM flag.",
    },
  },
  "result-hero": {
    size: { fr: [900, 278], en: [900, 278] },
    alt: {
      fr: "Le résultat d’un exercice : entrée directe, 3 000 ft tenus à 6 ft près, 4 standards atteints sur 4.",
      en: "An exercise result: direct entry, 3,000 ft held within 6 ft, 4 of 4 standards met.",
    },
  },
  studio: {
    size: { fr: [1280, 800], en: [1280, 800] },
    alt: {
      fr: "L’éditeur de cours : la galerie de modèles à gauche, une diapositive en cours d’édition au centre, ses réglages à droite.",
      en: "The course editor: the template gallery on the left, a slide being edited in the centre, its settings on the right.",
    },
  },
  templates: {
    size: { fr: [1280, 800], en: [1280, 800] },
    alt: {
      fr: "Nouveau cours : cinq modèles déjà mis en page, de l’attente à la règle du 1 sur 60, et une page vierge.",
      en: "New course: five templates already laid out, from holding to the 1-in-60 rule, and a blank page.",
    },
  },
  presenter: {
    size: { fr: [1280, 800], en: [1280, 800] },
    alt: {
      fr: "Le mode présentation : l’étape en cours, l’étape suivante et la place des notes, avec l’écran noir et l’ouverture de l’écran de projection.",
      en: "Presenter mode: the current step, the next step and the notes panel, with the black screen and the projector screen buttons.",
    },
  },
  "course-quiz": {
    size: { fr: [1280, 800], en: [1280, 800] },
    alt: {
      fr: "Une question du cours « Suivi VOR » : un HSI en direct, la clairance à suivre et trois réponses au choix.",
      en: "A question in the “VOR tracking” course: a live HSI, the clearance to follow and three answers to choose from.",
    },
  },
  "try-card": {
    size: { fr: [640, 554], en: [640, 554] },
    alt: {
      fr: "Un exercice : suivre le radial 270 par vent de travers ; la liste « À faire » est vérifiée par le simulateur, deux objectifs déjà atteints.",
      en: "An exercise: tracking radial 270 in a crosswind; its “Do this” list is checked by the simulator, two goals already met.",
    },
  },
  "calc-card": {
    size: { fr: [640, 405], en: [640, 405] },
    alt: {
      fr: "Un calcul de la règle du 1 sur 60 : réponse juste, 3,0°, la solution détaillée en deux étapes et la réponse acceptée à ±0,5°.",
      en: "A 1-in-60 calculation: correct, 2.0°, the worked solution in two steps and the answer accepted within ±0.5°.",
    },
  },
  briefing: {
    size: { fr: [1280, 840], en: [1280, 840] },
    alt: {
      fr: "Le briefing avant le vol, en diapositives : l’entrée directe dans l’attente d’ARD, simulateur en pause.",
      en: "The pre-flight briefing as slides: the direct entry into the ARD hold, simulator paused.",
    },
  },
  "cockpit-hold": {
    size: { fr: [1280, 668], en: [1280, 668] },
    alt: {
      fr: "La leçon d’attente au simulateur : le Cessna 172 G1000 en IMC sur pilote automatique, à 0,6 NM d’ARD, la consigne de la leçon, la clairance d’attente du contrôle et la carte du MFD.",
      en: "The holding lesson in the simulator: the Cessna 172 G1000 in IMC on the autopilot, 0.6 NM from ARD, with the lesson’s instruction, the ATC holding clearance and the MFD map.",
    },
  },
  result: {
    size: { fr: [1280, 840], en: [1280, 840] },
    alt: {
      fr: "Le résultat de l’exercice : entrée directe, 3 000 ft tenus à 6 ft près, quatre standards atteints, le profil du vol et l’aide utilisée.",
      en: "The exercise result: direct entry, 3,000 ft held within 6 ft, four standards met, the flight profile and the help used.",
    },
  },
  debrief: {
    size: { fr: [1280, 792], en: [1280, 792] },
    alt: {
      fr: "Le débriefing : la trajectoire de l’attente rejouée, le PFD au même instant et le profil d’altitude.",
      en: "The debrief: the hold track replayed, the PFD at the same moment and the altitude profile.",
    },
  },
  programme: {
    size: { fr: [1280, 647], en: [1280, 647] },
    alt: {
      fr: "La formation IR : les sept matières dans l’ordre du programme, et les cours de la première matière, Pilotage aux instruments.",
      en: "The IR programme: seven subjects in syllabus order, and the courses of the first one, Attitude instrument flying.",
    },
  },
  "cockpit-panel": {
    size: { fr: [1280, 455], en: [1280, 455] },
    alt: {
      fr: "Le tableau G1000 du Cessna 172 : la barre du pilote automatique, le PFD et le MFD avec la carte et le plan de vol de l’approche ILS de PARD.",
      en: "The Cessna 172’s G1000 panel: the autopilot bar, the PFD and the MFD with the map and the flight plan of the PARD ILS approach.",
    },
  },
  "cockpit-classic": {
    size: { fr: [1280, 656], en: [1280, 656] },
    alt: {
      fr: "Le même avion en tableau classique : les six instruments de base, les CDI et la radio.",
      en: "The same aircraft on the classic panel: the six basic instruments, the CDIs and the radios.",
    },
  },
  checklist: {
    size: { fr: [892, 474], en: [892, 436] },
    alt: {
      fr: "La check-list d’urgence en vol : panne moteur, piloter à 63–73 kt, et la première action réflexe chronométrée, la vitesse de finesse max, 68 kt.",
      en: "The in-flight emergency checklist: engine failure, fly 63–73 KIAS, and the first timed memory item, best glide speed, 68 KIAS.",
    },
  },
} satisfies Record<
  string,
  {
    size: { fr: readonly [number, number]; en: readonly [number, number] };
    alt: Copy;
  }
>;
export type IntroShot = keyof typeof INTRO_SHOTS;

/** the photo of the final card: public/img/sky.jpg with the aircraft's identity inpainted (no registration, no fin
 *  markings: the page names no real aircraft, club or maker; scratchpad/photo/make2.py) */
export const INTRO_PHOTO = {
  src: "img/landing/photo-c172.webp",
  size: [1400, 814] as const,
  alt: {
    fr: "Un Cessna 172 en vol sous un ciel nuageux.",
    en: "A Cessna 172 flying under a cloudy sky.",
  },
};

/** the URL of a capture in a language (every capture exists in both) */
export function shotSrc(k: IntroShot, l: Lang2): string {
  return `img/landing/${k}-${l}.webp`;
}
function shotSize(k: IntroShot, l: Lang2): readonly [number, number] {
  return INTRO_SHOTS[k].size[l];
}

/** the references the library's courses cite (their slide footers and quiz sources), grouped by authority */
export const INTRO_REFS: readonly { org: string; docs: string }[] = [
  { org: "FAA", docs: "PHAK, AIM, IFH, ACS" },
  { org: "EASA", docs: "Part-FCL, Part-NCO" },
];

/** The five verbs of the route, the role that does each, and the row each opens. */
export const INTRO_STEP_IDS = [
  "creer",
  "enseigner",
  "apprendre",
  "voler",
  "debriefer",
] as const;

interface StepText {
  v: string;
  role: string;
  h: string;
  p: string;
  kinds?: readonly string[];
  t: readonly string[];
  cap: string;
  /** the label of the smaller capture(s) over the main one */
  tags: readonly string[];
}
interface WhoText {
  h: string;
  p: string;
  t: readonly string[];
  a: string;
}
interface ProgText {
  code: string;
  who: string;
  name: string;
  d: string;
}
export interface IntroText {
  title: string;
  navLabel: string;
  navHow: string;
  navWho: string;
  navLib: string;
  navSim: string;
  langLabel: string;
  start: string;
  startTip: string;
  explore: string;
  eyebrow: string;
  facts: readonly string[];
  routeLbl: string;
  tSim: string;
  tSlide: string;
  tRes: string;
  howEy: string;
  howH: string;
  howP: string;
  steps: readonly StepText[];
  whoEy: string;
  whoH: string;
  whoP: string;
  who: readonly WhoText[];
  libEy: string;
  libH: string;
  libP: Lead;
  items: string;
  subjects: string;
  progs: Record<"ppl" | "night" | "ir" | "atpl", ProgText>;
  club: readonly [string, string];
  inst: readonly [string, string];
  splitH: string;
  splitP: string;
  legend: readonly Lead[];
  splitCap: string;
  simEy: string;
  simH: string;
  simP: string;
  tG: readonly [string, string];
  tC: readonly [string, string];
  tK: readonly [string, string];
  feats: readonly Lead[];
  alone: Lead;
  /** the section's visually hidden h2 (its three cards carry the visible h3s) */
  trH: string;
  trSrcH: string;
  trLangH: string;
  trLang: string;
  trNoteH: string;
  trNote: Lead;
  finH: string;
  finP: string;
  places: readonly Lead[];
  skip: string;
  photoCap: string;
  refsLead: string;
  note: string;
  noteTip: string;
}

/** French typography: a no-break space before « : ; ? ! » (a colon never starts a line). Pure; keeps the shape. */
export function frTypo<T>(o: T): T {
  if (typeof o === "string")
    return o.replace(/ ([:;?!])/g, " $1") as unknown as T;
  if (Array.isArray(o)) return o.map((x) => frTypo(x)) as unknown as T;
  if (o && typeof o === "object")
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, frTypo(v)]),
    ) as T;
  return o;
}

const FR: IntroText = frTypo({
  title: "Wingdeck — La plateforme de l’éducation aéronautique",
  navLabel: "Sur cette page",
  navHow: "Comment ça marche",
  navWho: "Pour qui",
  navLib: "Les formations",
  navSim: "Le simulateur intégré",
  langLabel: "Langue",
  start: "Commencer",
  startTip: "Aller à l’accueil : apprendre, enseigner ou voler (Entrée)",
  explore: "Explorer la bibliothèque",
  eyebrow: "Cours · Salle de classe · Simulateur de vol",
  facts: [
    "Élèves, instructeurs et aéroclubs",
    "Du LAPL et du PPL à l’IR et à la théorie ATPL",
    "En français et en anglais",
  ],
  routeLbl: "Comment ça marche, en cinq temps :",
  tSim: "Le vol",
  tSlide: "Le cours",
  tRes: "Le résultat",
  howEy: "Comment ça marche",
  howH: "Un même cours, de la salle de classe au cockpit",
  howP: "L’instructeur crée le cours et le présente en salle. L’élève l’apprend, le vole au simulateur, puis lit son résultat et son débriefing.",
  steps: [
    {
      v: "Créer",
      role: "Instructeur",
      h: "Créez un cours à partir d’un modèle",
      p: "L’éditeur de cours fait la mise en page pour vous : choisissez un modèle, écrivez vos mots, ajoutez un instrument qui bouge vraiment.",
      t: [
        "Des modèles prêts : couverture, schéma + 3 points, instrument + repères, comparaison…",
        "Des instruments animés en direct : HSI, horizon, anémomètre…",
        "Un même cours en français et en anglais, avec ses sources",
      ],
      cap: "L’éditeur de cours : les modèles à gauche, la diapositive au centre, ses réglages à droite.",
      tags: ["Nouveau cours"],
    },
    {
      v: "Enseigner",
      role: "Instructeur",
      h: "Présentez-le en salle, sur le projecteur",
      p: "Le mode présentation garde la suite et vos notes sur votre écran. La classe ne voit que la diapositive.",
      t: [
        "L’écran de projection s’ouvre sur le second écran",
        "Les points s’affichent un par un, à votre rythme",
        "Écran noir d’un clic pour reprendre la parole",
      ],
      cap: "Le mode présentation : l’étape en cours, la suivante et le panneau des notes.",
      tags: [],
    },
    {
      v: "Apprendre",
      role: "Élève",
      h: "L’élève l’apprend, à son rythme",
      p: "Chaque cours alterne explications, manipulations et exercices. L’instrument répond, le simulateur vérifie.",
      kinds: [
        "Manipulation",
        "Exercice",
        "Calcul",
        "Quiz",
        "Vol au simulateur",
      ],
      t: [
        "Des exercices vérifiés par le simulateur, objectif par objectif",
        "Des calculs avec leur solution détaillée et la règle pratique",
        "Un mémo à imprimer à la fin du cours",
      ],
      cap: "Une question du cours « Suivi VOR » et, devant, un exercice vérifié par le simulateur et un calcul corrigé.",
      tags: ["Exercice", "Calcul"],
    },
    {
      v: "Voler",
      role: "Élève",
      h: "Puis il le vole dans le simulateur intégré",
      p: "Le briefing s’affiche en diapositives, simulateur en pause. Puis on vole, avec les consignes de la leçon et le contrôle aérien.",
      t: [
        "Un briefing en diapositives avant chaque leçon",
        "Le Cessna 172 en G1000 ou en tableau classique",
        "Les messages du contrôle, affichés et lus à voix haute",
      ],
      cap: "Le Cessna 172 G1000 arrive sur ARD avec sa clairance d’attente et, devant, le briefing de la leçon.",
      tags: ["Briefing"],
    },
    {
      v: "Débriefer",
      role: "Élève et instructeur",
      h: "Un résultat clair, un débriefing rejoué",
      p: "Le résultat dit quels standards du test en vol sont atteints. Le débriefing rejoue le vol : trajectoire, instruments et profil, à chaque instant.",
      t: [
        "Chaque standard du test en vol, atteint ou non, avec sa mesure",
        "L’aide utilisée (pilote automatique, indices), visible par l’instructeur",
        "Revolez depuis n’importe quel instant du vol",
      ],
      cap: "Le résultat d’une entrée en attente volée jusqu’au bout et, devant, son débriefing.",
      tags: ["Débriefing"],
    },
  ],
  whoEy: "Pour qui",
  whoH: "Pour toute l’école, de l’élève à l’instructeur",
  whoP: "Chacun trouve sa porte d’entrée dès l’Accueil : apprendre, enseigner ou voler.",
  who: [
    {
      h: "Élèves",
      p: "Apprenez la théorie sur des instruments animés en direct, puis pratiquez-la au simulateur.",
      t: [
        "Votre formation, dans l’ordre du programme officiel",
        "Des leçons au simulateur notées comme au test en vol",
        "Reprenez exactement où vous en étiez",
      ],
      a: "Je débute : LAPL · PPL",
    },
    {
      h: "Instructeurs",
      p: "Préparez vos cours à partir d’un modèle et présentez-les en salle.",
      t: [
        "Des modèles et des instruments en direct à glisser",
        "Le mode présentation et l’écran de projection",
        "Le résultat et le débriefing de chaque vol",
      ],
      a: "Créer un cours",
    },
    {
      h: "Aéroclubs et écoles",
      p: "Un même outil pour vos élèves et vos instructeurs, à vos couleurs.",
      t: [
        "Les check-lists de vos avions, adaptées par le club",
        "Les cours et exercices du club, rangés à part",
        "Le logo du club sur vos diapositives",
      ],
      a: "Voir l’espace Club",
    },
  ],
  libEy: "La bibliothèque",
  libH: "Toute la formation, rangée par licence puis par matière",
  libP: [
    String(INTRO_COUNTS.total),
    "cours, leçons au simulateur et check-lists, dans l’ordre du programme officiel.",
  ],
  items: "éléments",
  subjects: "matières",
  progs: {
    ppl: {
      code: "LAPL · PPL",
      who: "Je débute le pilotage",
      name: "Licence de pilote avion",
      d: "Les 9 matières de la théorie, puis le pilotage : tour de piste, pannes, navigation.",
    },
    night: {
      code: "Vol de nuit",
      who: "J’ai mon PPL",
      name: "Qualification vol de nuit",
      d: "Règles et minima, vision de nuit, navigation et pannes de nuit.",
    },
    ir: {
      code: "IR",
      who: "Je prépare l’IR",
      name: "Vol aux instruments",
      d: "Sept matières, du pilotage aux instruments jusqu’au test pratique.",
    },
    atpl: {
      code: "ATPL",
      who: "Je prépare la théorie ATPL",
      name: "Théorie ATPL",
      d: "Les 13 matières de l’examen, de 010 à 090. Premiers cours disponibles.",
    },
  },
  club: ["Club", "Les check-lists et les exercices adaptés par votre club"],
  inst: [
    "Instructeurs",
    "Vos cours et brouillons, les modèles, l’import de diapositives",
  ],
  splitH: "Chaque formation, matière par matière",
  splitP:
    "Les matières portent leur numéro officiel. Dans chacune, les éléments sont toujours rangés dans le même ordre :",
  legend: [
    ["Cours", "des diapositives et des étapes interactives"],
    ["Leçon au simulateur", "un vol noté, avec son briefing"],
    ["Exercice de panne", "une panne à gérer en vol"],
    ["Check-list", "la procédure, étape par étape"],
  ],
  splitCap:
    "La formation IR : le sommaire des sept matières et les premiers cours.",
  simEy: "Le simulateur",
  simH: "Un simulateur de vol, intégré au cours",
  simP: "Le même Cessna 172, en G1000 ou en tableau classique. Des procédures réelles, des pannes avec leurs check-lists, le contrôle aérien et un briefing avant chaque vol.",
  tG: [
    "Cessna 172 · G1000",
    "PFD et MFD, pilote automatique, plan de vol, message du contrôle.",
  ],
  tC: [
    "Tableau classique",
    "Les six instruments de base, deux CDI, GPS et radios.",
  ],
  tK: [
    "Check-list d’urgence",
    "Panne moteur : actions réflexes chronométrées.",
  ],
  feats: [
    [
      "Procédures réelles",
      "Attentes, approches, tours de piste et navigation, avec leurs check-lists.",
    ],
    [
      "Pannes et urgences",
      "Des check-lists rédigées d’après le manuel de vol (POH) du C172.",
    ],
    [
      "Contrôle aérien",
      "Les messages du contrôle en phraséologie réelle, affichés et lus.",
    ],
    [
      "Briefing en diapositives",
      "Avant chaque leçon, simulateur en pause au point de départ.",
    ],
  ],
  alone: [
    "Le simulateur fonctionne aussi seul.",
    "Un vol rapide en un clic, ou un vol que vous préparez : aéroport, météo, pannes.",
  ],
  trH: "Sources, langues et limites",
  trSrcH: "Sources des cours",
  trLangH: "Deux langues",
  trLang:
    "Toute l’interface et les cours en français et en anglais. La phraséologie du contrôle reste en anglais, comme en vrai.",
  trNoteH: "À savoir",
  trNote: [
    "Entraînement procédural, non certifié FSTD.",
    "Wingdeck n’est pas un simulateur certifié : il prépare au vol et aux examens, et les heures qui y sont volées ne comptent pas dans le carnet de vol.",
  ],
  finH: "Commencez par l’Accueil",
  finP: "Tout Wingdeck tient dans trois onglets, toujours au même endroit :",
  places: [
    ["Accueil", "Apprendre, enseigner ou voler, ou reprendre où vous en étiez"],
    ["Bibliothèque", "Toutes les formations et tous les cours"],
    ["Simulateur", "Un vol rapide, ou un vol que vous préparez"],
  ],
  skip: "Ne plus afficher cette page au démarrage",
  photoCap: "Un Cessna 172",
  refsLead: "Sources des cours :",
  note: "Entraînement procédural, non certifié FSTD",
  noteTip:
    "Wingdeck n’est pas un FSTD (simulateur d’entraînement au vol certifié) : les heures n’y sont pas comptées.",
});

const EN: IntroText = {
  title: "Wingdeck — The platform for aviation education",
  navLabel: "On this page",
  navHow: "How it works",
  navWho: "Who it’s for",
  navLib: "The training",
  navSim: "The built-in simulator",
  langLabel: "Language",
  start: "Start",
  startTip: "Go to Home: learn, teach or fly (Enter)",
  explore: "Explore the library",
  eyebrow: "Courses · Classroom · Flight simulator",
  facts: [
    "Students, instructors and aeroclubs",
    "From LAPL and PPL to the IR and ATPL theory",
    "In English and French",
  ],
  routeLbl: "How it works, in five moves:",
  tSim: "The flight",
  tSlide: "The course",
  tRes: "The result",
  howEy: "How it works",
  howH: "One course, from the classroom to the cockpit",
  howP: "The instructor builds the course and presents it in class. The student learns it, flies it in the simulator, then reads the result and the debrief.",
  steps: [
    {
      v: "Create",
      role: "Instructor",
      h: "Build a course from a template",
      p: "The course editor does the layout for you: pick a template, write your words, add an instrument that really moves.",
      t: [
        "Ready templates: cover, diagram + 3 points, instrument + callouts, comparison…",
        "Live instruments: HSI, attitude, airspeed…",
        "One course in English and French, with its sources",
      ],
      cap: "The course editor: templates on the left, the slide in the centre, its settings on the right.",
      tags: ["New course"],
    },
    {
      v: "Teach",
      role: "Instructor",
      h: "Present it in class, on the projector",
      p: "Presenter mode keeps what comes next and your notes on your screen. The class sees only the slide.",
      t: [
        "The projector screen opens on the second display",
        "Points appear one by one, at your pace",
        "Black screen in one click, to take the floor back",
      ],
      cap: "Presenter mode: the current step, the next one and the notes panel.",
      tags: [],
    },
    {
      v: "Learn",
      role: "Student",
      h: "Students learn it at their own pace",
      p: "Each course mixes explanations, hands-on steps and exercises. The instrument responds, the simulator checks.",
      kinds: ["Try it", "Exercise", "Calculation", "Quiz", "Simulator flight"],
      t: [
        "Exercises checked by the simulator, goal by goal",
        "Calculations with a worked solution and the rule of thumb",
        "A summary sheet to print at the end of the course",
      ],
      cap: "A question in the “VOR tracking” course and, in front, an exercise checked by the simulator and a marked calculation.",
      tags: ["Exercise", "Calculation"],
    },
    {
      v: "Fly",
      role: "Student",
      h: "Then they fly it in the built-in simulator",
      p: "The briefing comes as slides, with the simulator paused. Then you fly, with the lesson’s instructions and air traffic control.",
      t: [
        "A slide briefing before every lesson",
        "The Cessna 172 with a G1000 or a classic panel",
        "ATC calls, shown on screen and read aloud",
      ],
      cap: "The Cessna 172 G1000 arriving at ARD with its holding clearance and, in front, the lesson’s briefing.",
      tags: ["Briefing"],
    },
    {
      v: "Debrief",
      role: "Student and instructor",
      h: "A clear result, a replayed debrief",
      p: "The result says which checkride standards were met. The debrief replays the flight: track, instruments and profile, moment by moment.",
      t: [
        "Each checkride standard, met or not, with its measurement",
        "The help used (autopilot, hints), visible to the instructor",
        "Fly again from any moment of the flight",
      ],
      cap: "The result of a hold entry flown to the end and, in front, its debrief.",
      tags: ["Debrief"],
    },
  ],
  whoEy: "Who it’s for",
  whoH: "For the whole school, from student to instructor",
  whoP: "Everyone finds their way in from Home: learn, teach or fly.",
  who: [
    {
      h: "Students",
      p: "Learn the theory on live instruments, then practise it in the simulator.",
      t: [
        "Your programme, in the official syllabus order",
        "Simulator lessons graded like the checkride",
        "Pick up exactly where you left off",
      ],
      a: "I’m new: LAPL · PPL",
    },
    {
      h: "Instructors",
      p: "Prepare your courses from a template and present them in class.",
      t: [
        "Templates and live instruments to drop in",
        "Presenter mode and the projector screen",
        "The result and the debrief of every flight",
      ],
      a: "Create a course",
    },
    {
      h: "Aeroclubs and schools",
      p: "One tool for your students and your instructors, in your colours.",
      t: [
        "Your aircraft’s checklists, adapted by the club",
        "Your club’s own courses and drills, filed apart",
        "The club logo on your slides",
      ],
      a: "See the Club space",
    },
  ],
  libEy: "The library",
  libH: "The whole training, filed by licence, then by subject",
  libP: [
    String(INTRO_COUNTS.total),
    "courses, simulator lessons and checklists, in the official syllabus order.",
  ],
  items: "items",
  subjects: "subjects",
  progs: {
    ppl: {
      code: "LAPL · PPL",
      who: "I am learning to fly",
      name: "Pilot licence, aeroplane",
      d: "The 9 theory subjects, then flying: circuits, failures, navigation.",
    },
    night: {
      code: "Night",
      who: "I have my PPL",
      name: "Night rating",
      d: "Rules and minima, night vision, navigation and failures at night.",
    },
    ir: {
      code: "IR",
      who: "I am preparing the IR",
      name: "Instrument rating",
      d: "Seven subjects, from attitude instrument flying to the checkride.",
    },
    atpl: {
      code: "ATPL",
      who: "I am preparing ATPL theory",
      name: "ATPL theory",
      d: "The 13 exam subjects, 010 to 090. The first courses are ready.",
    },
  },
  club: ["Club", "The checklists and drills your club has adapted"],
  inst: [
    "Instructors",
    "Your courses and drafts, the templates, importing your slides",
  ],
  splitH: "Each programme, subject by subject",
  splitP:
    "Subjects carry their official number. Inside each one, items always come in the same order:",
  legend: [
    ["Course", "slides and interactive steps"],
    ["Simulator lesson", "a graded flight, with its briefing"],
    ["Failure drill", "a failure to handle in flight"],
    ["Checklist", "the procedure, step by step"],
  ],
  splitCap:
    "The IR programme: the contents of its seven subjects and the first courses.",
  simEy: "The simulator",
  simH: "A flight simulator, built into the course",
  simP: "The same Cessna 172, with a G1000 or a classic panel. Real procedures, failures with their checklists, air traffic control and a briefing before every flight.",
  tG: ["Cessna 172 · G1000", "PFD and MFD, autopilot, flight plan, ATC call."],
  tC: ["Classic panel", "The six basic instruments, two CDIs, GPS and radios."],
  tK: ["Emergency checklist", "Engine failure: timed memory items."],
  feats: [
    [
      "Real procedures",
      "Holds, approaches, circuits and navigation, with their checklists.",
    ],
    [
      "Failures and emergencies",
      "Checklists written from the C172 pilot’s operating handbook (POH).",
    ],
    [
      "Air traffic control",
      "ATC calls in real phraseology, shown and read aloud.",
    ],
    [
      "Slide briefing",
      "Before each lesson, with the simulator paused at the start point.",
    ],
  ],
  alone: [
    "The simulator also works on its own.",
    "A quick flight in one click, or a flight you plan: airport, weather, failures.",
  ],
  trH: "Sources, languages and limits",
  trSrcH: "Course sources",
  trLangH: "Two languages",
  trLang:
    "The whole interface and every course in English and French. ATC phraseology stays in English, as in real life.",
  trNoteH: "Good to know",
  trNote: [
    "Procedural training, not a certified FSTD.",
    "Wingdeck is not a certified simulator: it prepares you for flying and exams, and time flown here is not logged.",
  ],
  finH: "Start from Home",
  finP: "All of Wingdeck fits in three tabs, always in the same place:",
  places: [
    ["Home", "Learn, teach or fly, or pick up where you left off"],
    ["Library", "Every programme and every course"],
    ["Simulator", "A quick flight, or a flight you plan"],
  ],
  skip: "Don’t show this page at start-up",
  photoCap: "A Cessna 172",
  refsLead: "Sources:",
  note: "Procedural training, not a certified FSTD",
  noteTip:
    "Wingdeck is not an FSTD (a certified flight simulation training device): time flown here is not logged.",
};

/** Every word of the page, in both languages (same shape; tests check both). No claim the code does not back. */
export const INTRO_COPY: Record<Lang2, IntroText> = { fr: FR, en: EN };

/** set for the browser session once the page has been shown (sessionStorage): it is a welcome, not a gate */
export const INTRO_SEEN_KEY = "ifr.intro.seen";

function sessionSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSessionSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

/** the intro is shown once per browser session, unless the user skipped it for good, a deep link asks for a flight,
 *  the user comes back from a course (the academy page), or a test browser drives the page (?intro=1 forces it) */
export function introWanted(
  loc: Pick<Location, "search" | "hash"> = location,
  nav: { webdriver?: boolean } = navigator,
  referrer: string = typeof document !== "undefined" ? document.referrer : "",
  seen: boolean = sessionSeen(),
): boolean {
  const q = new URLSearchParams(loc.search);
  if (q.get("intro") === "1") return true;
  if (
    q.get("intro") === "0" ||
    q.has("scenario") ||
    loc.hash.startsWith("#circuit=")
  )
    return false;
  if (nav.webdriver) return false;
  // a round trip from a course (academy.html) or a second visit in the same session goes straight to the app
  if (seen || /\/academy\.html(?:[?#]|$)/.test(referrer)) return false;
  return !store.get(INTRO_SKIP_KEY, false);
}

/** the part of an element inertOthers needs (an HTMLElement; a plain object in the tests) */
export interface InertTarget {
  inert: boolean;
}
/** Makes every child of `parent` but `keep` inert (no focus, no click, hidden from assistive tech: a modal page
 *  that Tab cannot leave) and returns the undo, which restores only the ones it changed. Pure over its input. */
export function inertOthers<T extends InertTarget>(
  children: Iterable<T>,
  keep: T,
): () => void {
  const changed: T[] = [];
  for (const c of children)
    if (c !== keep && !c.inert) {
      c.inert = true;
      changed.push(c);
    }
  return () => {
    for (const c of changed) c.inert = false;
  };
}

// ------------------------------------------------------------------ icons (decorative: every one sits next to a word)
const sv = (w: number, body: string, vb = 20, extra = "") =>
  `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
const IC = {
  arrow: sv(18, '<path d="M4 10h12M11 5l5 5-5 5" stroke-width="2"/>'),
  chev: sv(16, '<path d="M8 5l5 5-5 5" stroke-width="2"/>'),
  book: sv(
    18,
    '<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3.5A1.5 1.5 0 0 1 2 16z"/><path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5h6a1.5 1.5 0 0 0 1.5-1.5z"/>',
    24,
    ' stroke-width="1.9"',
  ),
  check: sv(
    20,
    '<circle cx="10" cy="10" r="8.2" stroke-width="1.6" opacity=".35"/><path d="M6.4 10.3l2.4 2.4 4.8-5" stroke-width="2.2"/>',
  ),
  student: sv(
    24,
    '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v5"/>',
    24,
    ' stroke-width="1.8"',
  ),
  teach: sv(
    24,
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/><path d="M7 12l3-3 2 2 4-4"/>',
    24,
    ' stroke-width="1.8"',
  ),
  club: sv(
    24,
    '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/><path d="M12 5V2.5l3 1.2-3 1.2"/>',
    24,
    ' stroke-width="1.8"',
  ),
  user: sv(
    14,
    '<circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/>',
    20,
    ' stroke-width="1.8"',
  ),
  home: sv(
    18,
    '<path d="M3 9l7-5.5L17 9v8H12v-5H8v5H3z"/>',
    20,
    ' stroke-width="1.7"',
  ),
  lib: sv(
    18,
    '<rect x="3" y="3.5" width="14" height="13" rx="1.5"/><path d="M10 3.5v13M6 7h1.5M6 10h1.5"/>',
    20,
    ' stroke-width="1.7"',
  ),
  plane: sv(
    18,
    '<path d="M10 2.5c.9 0 1.3 1 1.3 2.4v3l5.7 3.2v1.6l-5.7-1.7v3.3l1.9 1.4V17L10 16.2 6.8 17v-1.3l1.9-1.4V11L3 12.7v-1.6L8.7 7.9v-3c0-1.4.4-2.4 1.3-2.4z"/>',
    20,
    ' stroke-width="1.6"',
  ),
  panel: sv(
    20,
    '<rect x="2.5" y="4" width="15" height="12" rx="2"/><circle cx="7" cy="10" r="2.6"/><circle cx="13" cy="10" r="2.6"/>',
    20,
    ' stroke-width="1.7"',
  ),
  list: sv(
    20,
    '<rect x="4" y="3" width="12" height="15" rx="2"/><path d="M7.5 3V2h5v1M7.5 8.5l1.2 1.2 2.3-2.4M7.5 13.5h5"/>',
    20,
    ' stroke-width="1.7"',
  ),
  warn: sv(
    20,
    '<path d="M10 3l8 14H2z"/><path d="M10 8.5v4M10 14.8v.2"/>',
    20,
    ' stroke-width="1.7"',
  ),
  radio: sv(
    20,
    '<path d="M6.5 13.5a5 5 0 010-7M13.5 6.5a5 5 0 010 7M4 16a8.5 8.5 0 010-12M16 4a8.5 8.5 0 010 12"/><circle cx="10" cy="10" r="1.4" fill="currentColor"/>',
    20,
    ' stroke-width="1.7"',
  ),
  bolt: sv(
    22,
    '<path d="M11 2L4 11.5h5L8 18l7-9.5h-5z"/>',
    20,
    ' stroke-width="1.7"',
  ),
  clip: sv(
    22,
    '<rect x="4" y="3" width="12" height="15" rx="2"/><path d="M7.5 3V2h5v1M7.5 8h5M7.5 11h5M7.5 14h3"/>',
    20,
    ' stroke-width="1.7"',
  ),
  people: sv(
    22,
    '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16.5c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/><circle cx="14" cy="7.5" r="2.2"/><path d="M14 12.3c1.8.2 3 1.5 3.5 4.2"/>',
    20,
    ' stroke-width="1.7"',
  ),
};

/** the page's class names (every one is prefixed, so no app rule reaches into the page) */
const cx = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .map((x) => `intro-${x}`)
    .join(" ");
const ico = (svg: string, cls = "ic") =>
  h("span", { class: cx(cls), html: svg, "aria-hidden": "true" });

/** the five rows' captures: [main, ...smaller ones over it] */
const STEP_MEDIA: readonly (readonly IntroShot[])[] = [
  ["studio", "templates"],
  ["presenter"],
  ["course-quiz", "try-card", "calc-card"],
  ["cockpit-hold", "briefing"],
  ["result", "debrief"],
];
/** each inset's colour key (the app's kinds: ok = checked, sim = flight, accent = course) */
const INSET_KIND: Partial<Record<IntroShot, string>> = {
  "try-card": "k-ok",
  "calc-card": "k-ac",
  templates: "k-ac",
  briefing: "k-sim",
  debrief: "k-ok",
};
const PROG_IDS = ["ppl", "night", "ir", "atpl"] as const;

export class Intro {
  el: HTMLElement;
  isOpen = false;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private offLang: (() => void) | null = null;
  private unInert: (() => void) | null = null;
  private observers: IntersectionObserver[] = [];
  private onScroll: (() => void) | null = null;

  constructor(private hooks: IntroHooks) {
    this.el = h("div", {
      class: "intro",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "intro-title",
      tabindex: -1,
    });
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    if (!this.el.isConnected) document.body.append(this.el);
    document.body.classList.add("intro-open");
    // a real modal: everything behind the page is inert (Tab never reaches the cockpit, a click never lands there)
    this.unInert?.();
    this.unInert = inertOthers(
      Array.from(document.body.children) as HTMLElement[],
      this.el,
    );
    requestAnimationFrame(() => this.el.classList.add("open"));
    window.addEventListener("keydown", this.onKey, true);
    this.offLang = onLangChange(() => {
      if (!this.isOpen) return;
      const hadFocus = (document.activeElement as HTMLElement | null)?.dataset
        .introLang;
      // the reader stays on the same part of the page: the section or row at the top of the screen, at the same
      // offset (the other language's text is longer or shorter, so a raw scroll position would drift)
      const at = this.anchorAtTop();
      this.render();
      const back = at && this.el.querySelector<HTMLElement>(`#${at.id}`);
      this.el.scrollTo({
        top: back ? this.offsetIn(back) + at.delta : 0,
        behavior: "instant",
      });
      if (hadFocus)
        this.el
          .querySelector<HTMLElement>(`[data-intro-lang="${hadFocus}"]`)
          ?.focus({ preventScroll: true });
    });
    // focus the hero title (no ring on load): the first Tab then reaches « Commencer », Shift+Tab the bar above it,
    // and Tab follows the page's own order (the bar first, as it is drawn)
    setTimeout(() => this.focusTitle(), 60);
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    markSessionSeen();
    this.teardown();
    this.offLang?.();
    this.offLang = null;
    this.unInert?.();
    this.unInert = null;
    window.removeEventListener("keydown", this.onKey, true);
    document.body.classList.remove("intro-open");
    this.el.classList.remove("open");
    this.el.classList.add("closing");
    setTimeout(() => {
      this.el.classList.remove("closing");
      this.el.remove();
    }, 260);
    this.hooks.closed?.();
  }

  private focusTitle() {
    const t = this.el.querySelector<HTMLElement>("#intro-title");
    (t ?? this.el).focus({ preventScroll: true });
  }

  private leave(fn: () => void) {
    this.hide();
    fn();
  }

  /** the focusable controls of the page, in order (what Tab walks through) */
  private focusables(): HTMLElement[] {
    return Array.from(
      this.el.querySelectorAll<HTMLElement>("a[href], button, input"),
    ).filter((x) => !x.closest("[inert]") && x.offsetParent !== null);
  }

  /** while the page is up it owns the keyboard: nothing reaches the cockpit (Tab, Space, the arrows and Enter keep
   *  their default on the page: it scrolls, its controls work; everything behind it is inert) */
  private key(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl =
      !!t &&
      t !== document.body &&
      this.el.contains(t) &&
      (t.tagName === "BUTTON" || t.tagName === "INPUT" || t.tagName === "A");
    // Tab follows the DOM order (the bar, then the page); it only wraps at the ends, so focus never leaves the page
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const f = this.focusables();
      if (f.length) {
        const i = f.indexOf(t as HTMLElement);
        const inside = !!t && t !== this.el && this.el.contains(t);
        let to: HTMLElement | null = null;
        if (i < 0 && !inside) to = e.shiftKey ? f[f.length - 1] : f[0];
        else if (e.shiftKey && i === 0) to = f[f.length - 1];
        else if (!e.shiftKey && i === f.length - 1) to = f[0];
        if (to) {
          e.preventDefault();
          to.focus();
        }
      }
      e.stopPropagation();
      return;
    }
    if (
      (e.key === "Enter" && !onControl) ||
      e.key === "F2" ||
      e.key === "Escape"
    ) {
      e.preventDefault();
      this.leave(this.hooks.enter);
    }
    e.stopPropagation();
  }

  private teardown() {
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    if (this.onScroll) this.el.removeEventListener("scroll", this.onScroll);
    this.onScroll = null;
  }

  /** an element's distance from the top of the page's scrolled content */
  private offsetIn(x: HTMLElement): number {
    return (
      x.getBoundingClientRect().top -
      this.el.getBoundingClientRect().top +
      this.el.scrollTop
    );
  }
  /** the last section, row or sub-block (a formation grid, the programme block, the simulator's features, the
   *  sources cards…) that starts above the top of the screen, and how far the screen is into it */
  private anchorAtTop(): { id: string; delta: number } | null {
    const y = this.el.scrollTop;
    let best: { id: string; delta: number } | null = null;
    for (const x of this.el.querySelectorAll<HTMLElement>(
      "main section[id], main article[id], main [data-intro-anchor][id]",
    )) {
      const top = this.offsetIn(x);
      if (top <= y + 1) best = { id: x.id, delta: y - top };
    }
    return best;
  }

  /** scrolls the page to one of its sections and moves the focus there (an in-page link never touches the URL:
   *  the app routes on its hash) */
  private goTo(id: string) {
    const target = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    const head = target.querySelector<HTMLElement>("h2, h3") ?? target;
    head.setAttribute("tabindex", "-1");
    head.focus({ preventScroll: true });
  }

  private render() {
    this.teardown();
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    const C = INTRO_COPY[l];
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** a real capture: its size (no layout shift), its alt text, lazy unless it is in the first screen */
    const img = (k: IntroShot, eager = false) => {
      const [w, hh] = shotSize(k, l);
      return h("img", {
        src: shotSrc(k, l),
        width: w,
        height: hh,
        alt: INTRO_SHOTS[k].alt[l],
        loading: eager ? "eager" : "lazy",
        fetchpriority: eager ? "high" : undefined,
        decoding: "async",
      });
    };
    const shot = (k: IntroShot, cls: string, eager = false) =>
      h("div", { class: cx(`shot ${cls}`) }, img(k, eager));
    const tick = (t: string) =>
      h("li", {}, ico(IC.check, "tk"), h("span", {}, t));
    const ticks = (ts: readonly string[], cls = "ticks") =>
      h("ul", { class: cx(cls) }, ts.map(tick));
    const eyebrow = (t: string) =>
      h("p", { class: cx("eyebrow") }, h("span", { class: cx("tick") }), t);
    const secHead = (ey: string, id: string, h2: string, p: string | (Node | string)[]) =>
      h(
        "div",
        { class: cx("sec-head rv") },
        eyebrow(ey),
        h("h2", { id }, h2),
        h("p", {}, ...(Array.isArray(p) ? p : [p])),
      );
    /** an in-page link (scrolls, never changes the URL) */
    const anchor = (id: string, cls: string, ...kids: (Node | string)[]) =>
      h(
        "a",
        {
          href: `#${id}`,
          class: cls ? cx(cls) : undefined,
          onclick: (e: Event) => {
            e.preventDefault();
            this.goTo(id);
          },
        },
        ...kids,
      );
    /** a link that leaves the page for a place of the app */
    const out = (
      href: string,
      cls: string,
      ...kids: (Node | string | null)[]
    ) =>
      h(
        "a",
        {
          href,
          class: cx(cls),
          onclick: (e: Event) => {
            if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) return;
            e.preventDefault();
            this.leave(() => location.assign(href));
          },
        },
        ...kids,
      );
    const startBtn = (cls: string, id?: string) =>
      h(
        "button",
        {
          type: "button",
          id,
          class: cx(`btn btn-primary ${cls}`),
          title: C.startTip,
          onclick: () => this.leave(this.hooks.enter),
        },
        h("span", {}, C.start),
        ico(IC.arrow),
      );
    const exploreBtn = () =>
      this.hooks.courses
        ? h(
            "button",
            {
              type: "button",
              class: cx("btn btn-secondary"),
              onclick: () => this.leave(this.hooks.courses!),
            },
            ico(IC.book),
            h("span", {}, C.explore),
          )
        : null;
    const langBtn = (v: Lang2, label: string) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": l === v ? "true" : "false",
          lang: v,
          "data-intro-lang": v,
          onclick: () => {
            if (v !== l) setLang(v);
          },
        },
        label,
      );
    const stepId = (i: number) => `intro-s-${INTRO_STEP_IDS[i]}`;

    // ---------------------------------------------------------------- the sticky bar
    const barGo = startBtn("btn-sm top-go");
    barGo.inert = true;
    barGo.setAttribute("aria-hidden", "true");
    const bar = h(
      "header",
      { class: cx("top") },
      h(
        "div",
        { class: cx("wrap") },
        anchor(
          "intro-hero",
          "brand",
          h("span", { class: cx("mark"), html: brandMarkSvg(28) }),
          h("b", {}, BRAND.name),
        ),
        h(
          "nav",
          { class: cx("anchors"), "aria-label": C.navLabel },
          anchor("intro-how", "", C.navHow),
          anchor("intro-who", "", C.navWho),
          anchor("intro-lib", "", C.navLib),
          anchor("intro-sim", "", C.navSim),
        ),
        h("span", { class: cx("sp") }),
        h(
          "div",
          { class: cx("lang"), role: "group", "aria-label": C.langLabel },
          langBtn("fr", "FR"),
          langBtn("en", "EN"),
        ),
        barGo,
      ),
    );

    // ---------------------------------------------------------------- 1. hero
    /** one screen of the hero composite: the capture and its label (the label names it; the alt describes it) */
    const heroShot = (k: IntroShot, cls: string, dot: string, label: string) =>
      h(
        "div",
        { class: cx(`hs ${cls}`) },
        shot(k, "", true),
        h(
          "span",
          { class: cx("tag"), "aria-hidden": "true" },
          h("i", { class: cx(dot) }),
          label,
        ),
      );
    const heroGo = startBtn("", "intro-go");
    const heroActs = h("div", { class: cx("hero-acts") }, heroGo, exploreBtn());
    const hero = h(
      "section",
      { class: cx("hero"), id: "intro-hero", "aria-labelledby": "intro-title" },
      h(
        "div",
        { class: cx("wrap grid") },
        h(
          "div",
          { class: cx("hero-txt") },
          eyebrow(C.eyebrow),
          h("h1", { id: "intro-title", tabindex: -1 }, brandTagline(l)),
          h("p", { class: cx("hero-lead") }, brandLead(l)),
          heroActs,
          ticks(C.facts, "facts"),
          // a preview of the route, not a second set of links: « Comment ça marche » just under it holds the five
          // links (one Tab stop per target)
          h(
            "div",
            { class: cx("mini") },
            h("p", { class: cx("mini-l") }, C.routeLbl),
            h(
              "ol",
              {},
              C.steps.map((s, i) =>
                h(
                  "li",
                  {},
                  h("span", { class: cx("n"), "aria-hidden": "true" }, String(i + 1)),
                  h("span", {}, s.v),
                ),
              ),
            ),
          ),
        ),
        h(
          "div",
          { class: cx("hero-art") },
          heroShot("cockpit-g1000", "s-sim", "c-sim", C.tSim),
          heroShot("course-slide", "s-slide", "c-ac", C.tSlide),
          heroShot("result-hero", "s-res", "c-ok", C.tRes),
        ),
      ),
    );

    // ---------------------------------------------------------------- 2. comment ça marche
    const how = h(
      "section",
      {
        class: cx("sec sec-how"),
        id: "intro-how",
        "aria-labelledby": "intro-how-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        secHead(C.howEy, "intro-how-h", C.howH, C.howP),
        h(
          "ol",
          { class: cx("route rv") },
          C.steps.map((s, i) =>
            h(
              "li",
              {},
              anchor(
                stepId(i),
                "",
                h("span", { class: cx("wp") }, String(i + 1)),
                h("b", {}, s.v),
                h("small", {}, s.role),
              ),
            ),
          ),
        ),
        h(
          "div",
          { class: cx("steps") },
          C.steps.map((s, i) => {
            const [main, ...insets] = STEP_MEDIA[i];
            return h(
              "article",
              {
                class: cx(`step grid ${i % 2 ? "flip" : ""}`),
                id: stepId(i),
                "aria-labelledby": `${stepId(i)}-h`,
              },
              h(
                "div",
                { class: cx("step-txt rv") },
                h(
                  "p",
                  { class: cx("step-k") },
                  h(
                    "span",
                    { class: cx("wp"), "aria-hidden": "true" },
                    String(i + 1),
                  ),
                  h("span", { class: cx("verb") }, s.v),
                  h("span", { class: cx("role") }, ico(IC.user), s.role),
                ),
                h("h3", { id: `${stepId(i)}-h` }, s.h),
                h("p", {}, s.p),
                s.kinds
                  ? h(
                      "p",
                      { class: cx("kinds") },
                      s.kinds.map((k, j) =>
                        h(
                          "span",
                          {
                            class:
                              j === s.kinds!.length - 1
                                ? cx("k-sim")
                                : j === 1
                                  ? cx("k-ok")
                                  : undefined,
                          },
                          k,
                        ),
                      ),
                    )
                  : null,
                ticks(s.t),
              ),
              h(
                "figure",
                {
                  class: cx(
                    `step-media rv ${insets.length ? "has-inset" : ""} insets-${insets.length}`,
                  ),
                },
                // the main capture and the smaller ones over it share one box (the insets hang from it, not
                // from the caption under it)
                h(
                  "div",
                  { class: cx("mstage") },
                  shot(main, "main"),
                  insets.map((k, j) =>
                    h(
                      "div",
                      { class: cx(`inset inset-${j} ${INSET_KIND[k] ?? ""}`) },
                      h(
                        "span",
                        { class: cx("itag"), "aria-hidden": "true" },
                        h("i", {}),
                        s.tags[j] ?? "",
                      ),
                      shot(k, ""),
                    ),
                  ),
                ),
                h("figcaption", {}, s.cap),
              ),
            );
          }),
        ),
      ),
    );

    // ---------------------------------------------------------------- 3. pour qui
    const whoLinks = [INTRO_LINKS.ppl, INTRO_LINKS.newCourse, INTRO_LINKS.club];
    const who = h(
      "section",
      { class: cx("sec"), id: "intro-who", "aria-labelledby": "intro-who-h" },
      h(
        "div",
        { class: cx("wrap") },
        secHead(C.whoEy, "intro-who-h", C.whoH, C.whoP),
        h(
          "ul",
          { class: cx("who-grid") },
          C.who.map((w, i) =>
            h(
              "li",
              { class: cx(`who-card ${"sic"[i]} rv`) },
              ico([IC.student, IC.teach, IC.club][i], "who-ic"),
              h("h3", {}, w.h),
              h("p", {}, w.p),
              ticks(w.t),
              out(whoLinks[i], "link", h("span", {}, w.a), ico(IC.chev)),
            ),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 4. la bibliothèque
    const lib = h(
      "section",
      { class: cx("sec"), id: "intro-lib", "aria-labelledby": "intro-lib-h" },
      h(
        "div",
        { class: cx("wrap") },
        secHead(C.libEy, "intro-lib-h", C.libH, [
          h("b", { class: cx("count") }, C.libP[0]),
          ` ${C.libP[1]}`,
        ]),
        h(
          "ul",
          { class: cx("progs"), id: "intro-lib-progs", "data-intro-anchor": "" },
          PROG_IDS.map((p) => {
            const t = C.progs[p];
            const n = INTRO_COUNTS[p];
            return h(
              "li",
              { class: cx(`pc prog-${p} rv`) },
              out(
                INTRO_LINKS[p],
                "pc-a",
                h(
                  "span",
                  { class: cx("pc-top") },
                  h("span", {
                    class: cx("pc-art"),
                    html: programArt(p),
                    "aria-hidden": "true",
                  }),
                  h("b", { class: cx("pc-code") }, t.code),
                  h("span", { class: cx("pc-who") }, t.who),
                ),
                h(
                  "span",
                  { class: cx("pc-bd") },
                  h("span", { class: cx("pc-name") }, t.name),
                  h("span", { class: cx("pc-desc") }, t.d),
                  h(
                    "span",
                    { class: cx("pc-meta") },
                    h(
                      "span",
                      {},
                      h("b", { class: cx("count") }, String(n.n)),
                      ` ${C.items}`,
                    ),
                    h(
                      "span",
                      {},
                      h("span", { class: cx("count") }, String(n.s)),
                      ` ${C.subjects}`,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        h(
          "div",
          { class: cx("rows2"), id: "intro-lib-rows", "data-intro-anchor": "" },
          out(
            INTRO_LINKS.club,
            "rowc club rv",
            ico(IC.clip, "ri"),
            h(
              "span",
              { class: cx("rt") },
              h("b", {}, C.club[0]),
              h("span", {}, C.club[1]),
            ),
            h(
              "span",
              { class: cx("rc") },
              h("b", { class: cx("count") }, String(INTRO_COUNTS.club.n)),
              ` ${C.items}`,
            ),
          ),
          out(
            INTRO_LINKS.instructors,
            "rowc inst rv",
            ico(IC.people, "ri"),
            h(
              "span",
              { class: cx("rt") },
              h("b", {}, C.inst[0]),
              h("span", {}, C.inst[1]),
            ),
          ),
        ),
        h(
          "div",
          {
            class: cx("lib-split grid"),
            id: "intro-lib-split",
            "data-intro-anchor": "",
          },
          h(
            "figure",
            { class: cx("rv") },
            shot("programme", ""),
            h("figcaption", {}, C.splitCap),
          ),
          h(
            "div",
            { class: cx("txt rv") },
            h("h3", {}, C.splitH),
            h("p", {}, C.splitP),
            h(
              "ul",
              { class: cx("legend") },
              C.legend.map((x, i) =>
                h(
                  "li",
                  {},
                  h("i", {
                    class: cx(["lg-ac", "lg-sim", "lg-sim", "lg-chk"][i]),
                  }),
                  h("span", {}, h("b", {}, x[0]), ` · ${x[1]}`),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 5. le simulateur
    const tile = (k: IntroShot, cls: string, cap: readonly [string, string]) =>
      h(
        "figure",
        { class: cx(`tile ${cls} rv`) },
        h("div", { class: cx("img") }, img(k)),
        h(
          "figcaption",
          { class: cx("cap") },
          h("b", {}, cap[0]),
          h("span", {}, cap[1]),
        ),
      );
    const sim = h(
      "section",
      {
        class: cx("sim-band"),
        id: "intro-sim",
        "aria-labelledby": "intro-sim-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        secHead(C.simEy, "intro-sim-h", C.simH, C.simP),
        h(
          "div",
          { class: cx("bento"), id: "intro-sim-tiles", "data-intro-anchor": "" },
          tile("cockpit-panel", "t-g1000", C.tG),
          tile("cockpit-classic", "t-classic", C.tC),
          tile("checklist", "t-check", C.tK),
          h(
            "ul",
            { class: cx("feats"), id: "intro-sim-feats", "data-intro-anchor": "" },
            C.feats.map((f, i) =>
              h(
                "li",
                { class: cx("feat rv") },
                h(
                  "h3",
                  {},
                  ico([IC.list, IC.warn, IC.radio, IC.panel][i]),
                  f[0],
                ),
                h("p", {}, f[1]),
              ),
            ),
            h(
              "li",
              { class: cx("feat alone rv") },
              ico(IC.bolt, "ri"),
              h("p", {}, h("b", {}, C.alone[0]), ` ${C.alone[1]}`),
            ),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 6. sources, two languages, the honest note
    const trust = h(
      "section",
      {
        class: cx("sec sec-trust"),
        id: "intro-trust",
        "aria-labelledby": "intro-tr-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        h("h2", { class: cx("sr"), id: "intro-tr-h" }, C.trH),
        h(
          "div",
          { class: cx("trust rv") },
          h(
            "div",
            {},
            h("h3", {}, C.trSrcH),
            h(
              "p",
              { class: cx("src") },
              INTRO_REFS.map((r) =>
                h("span", {}, h("b", {}, r.org), ` ${r.docs}`),
              ),
            ),
          ),
          h("div", {}, h("h3", {}, C.trLangH), h("p", {}, C.trLang)),
          h(
            "div",
            {},
            h("h3", {}, C.trNoteH),
            h("p", {}, h("b", {}, C.trNote[0]), ` ${C.trNote[1]}`),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 7. « Commencez par l'Accueil »
    const skip = h("input", {
      type: "checkbox",
      checked: store.get(INTRO_SKIP_KEY, false),
      onchange: (e: Event) =>
        store.set(INTRO_SKIP_KEY, (e.target as HTMLInputElement).checked),
    });
    const finalActs = h(
      "div",
      { class: cx("final-acts") },
      startBtn("", "intro-go-2"),
      exploreBtn(),
    );
    const fin = h(
      "section",
      { class: cx("final"), id: "intro-fin", "aria-labelledby": "intro-fin-h" },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "div",
          { class: cx("final-card rv") },
          h(
            "div",
            { class: cx("final-txt") },
            h("h2", { id: "intro-fin-h" }, C.finH),
            h("p", {}, C.finP),
            h(
              "ul",
              { class: cx("places") },
              C.places.map((p, i) =>
                h(
                  "li",
                  {},
                  h("b", {}, ico([IC.home, IC.lib, IC.plane][i]), p[0]),
                  h("span", {}, p[1]),
                ),
              ),
            ),
            finalActs,
            h("label", { class: cx("skip") }, skip, h("span", {}, C.skip)),
          ),
          h(
            "figure",
            { class: cx("final-photo") },
            h("img", {
              src: INTRO_PHOTO.src,
              width: INTRO_PHOTO.size[0],
              height: INTRO_PHOTO.size[1],
              alt: INTRO_PHOTO.alt[l],
              loading: "lazy",
              decoding: "async",
            }),
            h("figcaption", {}, C.photoCap),
          ),
        ),
      ),
    );

    const foot = h(
      "footer",
      { class: cx("foot") },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "span",
          { class: cx("brand") },
          h("span", { class: cx("mark"), html: brandMarkSvg(22) }),
          h("b", {}, BRAND.name),
        ),
        h(
          "span",
          { class: cx("refs") },
          `${C.refsLead} `,
          ...INTRO_REFS.flatMap((r, i) => [
            i ? " · " : "",
            h("b", {}, `${r.org} ${r.docs}`),
          ]),
        ),
        h("span", { class: cx("sp") }),
        h("span", { class: cx("note"), title: C.noteTip }, C.note),
      ),
    );

    this.el.lang = l;
    this.el.classList.toggle("intro-motion", !reduce);
    this.el.replaceChildren(
      bar,
      h(
        "main",
        { class: cx("main-col") },
        hero,
        how,
        who,
        lib,
        sim,
        trust,
        fin,
      ),
      foot,
    );

    // the bar's own « Commencer » shows only while neither in-page one is on screen (one filled button per screen)
    if (typeof IntersectionObserver === "function") {
      const vis = new Map<Element, boolean>([
        [heroActs, true],
        [finalActs, false],
      ]);
      const io = new IntersectionObserver(
        (es) => {
          for (const e of es) vis.set(e.target, e.isIntersecting);
          const show = ![...vis.values()].some(Boolean);
          barGo.classList.toggle("intro-show", show);
          barGo.inert = !show;
          barGo.setAttribute("aria-hidden", String(!show));
        },
        { root: this.el },
      );
      io.observe(heroActs);
      io.observe(finalActs);
      this.observers.push(io);
      // gentle reveal as the page scrolls (only when motion is welcome; everything is visible without it)
      if (!reduce) {
        const rv = new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("intro-in");
                rv.unobserve(e.target);
              }
            }),
          { root: this.el, rootMargin: "0px 0px -6% 0px" },
        );
        this.el.querySelectorAll(".intro-rv").forEach((x) => rv.observe(x));
        this.observers.push(rv);
      }
    }
    this.onScroll = () =>
      bar.classList.toggle("intro-scrolled", this.el.scrollTop > 8);
    this.el.addEventListener("scroll", this.onScroll, { passive: true });
    this.onScroll();
  }
}
