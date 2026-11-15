// The French words of the simulator exercises (train/curriculum.ts): summary, objectives, standards and briefing,
// written by hand, one entry per exercise id. curriculum.ts attaches them as `ex.fr` when the exercise does not
// author its own (the holding exercises do). ATC phraseology inside quotes stays in English, as on the radio.
import type { Exercise } from "./engine";

export type ExerciseFr = NonNullable<Exercise["fr"]>;

const INTERCEPT = (
  maxOvershoot: number,
): Pick<ExerciseFr, "objectives" | "standards" | "briefing"> => ({
  objectives: [
    "Anticiper l’interception avec le mouvement de l’aiguille",
    "Sortir du virage sur l’axe, sans le dépasser",
    "Trouver l’angle de correction de dérive",
  ],
  standards: [
    `Dépassement ≤ ${String(maxOvershoot).replace(".", ",")} point une fois établi`,
    "Altitude ±100 ft",
  ],
  briefing: [
    "Pleine échelle du localizer = 2,5° : à 10 NM, un point ≈ 0,2 NM. Près de la piste, l’aiguille bouge vite.",
    "Commencez le virage vers 1 point pour une interception à 30°, plus tôt à 45° et plus, ou avec du vent arrière.",
  ],
});

const APPROACH = (
  goAround: boolean,
): Pick<ExerciseFr, "objectives" | "standards"> => ({
  objectives: [
    "Briefer la carte d’approche (fréquences, routes, altitudes, minima, procédure interrompue)",
    "Voler la procédure dans les tolérances",
    goAround
      ? "Remettre les gaz à la DA/au MAP et voler la procédure interrompue"
      : "Atterrir, ou remettre les gaz sans références visuelles aux minima",
  ],
  standards: [
    "CDI / glide à moins de ¾ d’échelle en finale",
    "Vitesse ±10 KIAS en finale",
    "Jamais sous les altitudes de segment ni sous la DA/MDA sans références visuelles",
    "Stabilisé sous 500 ft sol",
  ],
});

const IFR_FLIGHT: Pick<ExerciseFr, "objectives" | "standards"> = {
  objectives: [
    "Copier et collationner la clairance IFR (CRAFT)",
    "Décoller, monter et se mettre en palier aux altitudes données",
    "Suivre la route, briefer et voler l’approche, atterrir",
  ],
  standards: [
    "Altitude ±100 ft en palier",
    "Approche dans les tolérances",
    "Atterrir ou exécuter la procédure interrompue",
  ],
};

export const EXERCISE_FR: Readonly<Record<string, ExerciseFr>> = {
  // ---------------------------------------------------------------- Phase 1 · pilotage de base
  "bai-sl": {
    summary:
      "Tenir l’altitude, le cap et la vitesse pendant 3 minutes en légère turbulence : la base du pilotage.",
    objectives: [
      "Regarder d’abord l’horizon artificiel, puis chaque instrument tour à tour",
      "Compenser pour voler sans effort sur le manche",
      "Corriger les écarts avant qu’ils ne grandissent",
    ],
    standards: ["Altitude ±100 ft", "Cap ±10°", "Vitesse ±10 KIAS"],
    briefing: [
      "Affichez environ 2300 tr/min et une assiette d’environ 2° à cabrer pour 100 KIAS, puis compensez (touches Début/Fin).",
      "Le circuit visuel : horizon → altimètre → horizon → cap → horizon → anémomètre.",
      "De petites corrections d’assiette : 1° d’assiette ≈ 100 ft/min.",
    ],
  },
  "bai-turns": {
    summary:
      "Des virages au taux standard (3°/s) vers des caps donnés, en tenant l’altitude.",
    objectives: [
      "Prendre l’inclinaison du taux standard (≈ 15°)",
      "Anticiper la sortie de virage",
      "Tenir l’altitude en tirant légèrement dans le virage",
    ],
    standards: [
      "Altitude ±100 ft",
      "Sortie de virage ±10°",
      "Inclinaison ≤ 30°",
    ],
    briefing: [
      "Inclinaison du taux standard ≈ vitesse propre / 10 + 7, soit environ 15° à 90 KIAS.",
      "Commencez la sortie de virage avec une avance égale à la moitié de l’inclinaison (≈ 8°).",
      "Sur le HSI, la tendance magenta montre le taux de virage : le repère blanc correspond au taux standard.",
    ],
  },
  "bai-climb": {
    summary:
      "Monter à 75 KIAS, se mettre en palier, puis descendre à 500 ft/min et 90 KIAS.",
    objectives: [
      "Puissance et assiette pour tenir la vitesse en montée",
      "Anticiper la mise en palier de 10 % de la vitesse verticale",
      "Descente à taux constant, réglée à la puissance",
    ],
    standards: ["Vitesse ±10 KIAS", "Cap ±10°", "Mise en palier ±100 ft"],
    briefing: [
      "Montée : pleine puissance, assiette d’environ 7° pour 75 KIAS.",
      "Descente : environ 1700 tr/min, assiette −2° pour 500 ft/min à 90 KIAS.",
    ],
  },
  "bai-climbturn": {
    summary:
      "Combiner un virage au taux standard et une montée à vitesse constante, puis un virage en descente.",
    objectives: [
      "Partager l’attention entre inclinaison, assiette et puissance",
      "Terminer les deux changements ensemble",
    ],
    standards: [
      "Vitesse ±10 KIAS",
      "Sortie de virage ±10°",
      "Mise en palier ±100 ft",
    ],
    briefing: [
      "Affichez d’abord la puissance et l’assiette de montée, puis inclinez.",
      "Si le cap ou l’altitude est atteint en premier, continuez à piloter l’autre.",
    ],
  },
  "bai-steep": {
    summary:
      "Un virage serré de 360° de chaque côté à 45° d’inclinaison, en tenant l’altitude.",
    objectives: [
      "Doser la traction et la puissance pendant tout le virage",
      "Sortir au cap d’entrée",
    ],
    standards: [
      "Altitude ±100 ft",
      "Inclinaison 45° ±5°",
      "Sortie de virage ±10°",
    ],
    briefing: [
      "Inclinez en douceur ; passé 30°, tirez un peu et ajoutez environ 100 tr/min.",
      "Attendez-vous à environ 1,4 g. Commencez la sortie environ 20° avant le cap.",
    ],
  },
  "bai-unusual": {
    summary:
      "Sortir d’une position à cabrer et lente, puis d’une position à piquer en spirale, en regardant les instruments.",
    objectives: [
      "Reconnaître « à cabrer » ou « à piquer » sur l’anémomètre et l’horizon",
      "Appliquer la bonne séquence de sortie",
    ],
    standards: [
      "Pas de décrochage",
      "Pas de dépassement de la VNE",
      "Sortir sans perdre plus de 500 ft environ sous l’altitude d’entrée",
    ],
    briefing: [
      "À cabrer : plein gaz, nez sur l’horizon, puis ailes à plat.",
      "À piquer : gaz réduits, ailes à plat D’ABORD, puis ramenez doucement le nez.",
    ],
  },
  "bai-slow": {
    summary:
      "Se configurer pour l’approche : volets 20, palier à 70 KIAS, puis une descente à 3° à 80 KIAS.",
    objectives: [
      "Ajuster puissance et compensateur à chaque changement de configuration",
      "Tenir 70 KIAS sans alarme de décrochage",
    ],
    standards: [
      "Vitesse ±5 KIAS",
      "Altitude ±100 ft",
      "Pas d’alarme de décrochage",
    ],
    briefing: [
      "Sous 85 KIAS (VFE) : volets 10, puis 20 (touche F).",
      "Les volets font cabrer : recompensez.",
    ],
  },
  // ---------------------------------------------------------------- Phase 2 · panne partielle
  "pp-compass": {
    summary:
      "L’AHRS est en panne. Pilotez avec l’horizon de secours et le compas ; chronométrez les virages au taux standard (3°/s).",
    objectives: [
      "Piloter avec l’horizon de secours",
      "Virages chronométrés : 30 s = 90°",
      "Comprendre le retard et l’avance du compas",
    ],
    standards: [
      "Altitude ±100 ft",
      "Sortie de virage ±15° (panne partielle)",
      "Inclinaison ≤ 30°",
    ],
    briefing: [
      "Lancez le chrono (touche T) en inclinant. 90° = 30 s au taux standard.",
      "Compas (hémisphère nord) : sortez avant le cap vers le nord, après le cap vers le sud.",
    ],
  },
  "pp-unusual": {
    summary:
      "Sortir d’une position inhabituelle avec l’AHRS en panne, sur les seuls instruments de secours.",
    objectives: [
      "Sortir avec l’horizon de secours et les tendances de l’anémomètre et de l’altimètre",
    ],
    standards: ["Pas de décrochage", "Pas de dépassement de la VNE"],
    briefing: [
      "La vitesse augmente et l’altitude baisse : nez bas. La vitesse baisse et l’altitude monte : nez haut.",
    ],
  },
  // ---------------------------------------------------------------- Phase 3 · radionavigation
  "nav-vor-out": {
    summary:
      "Trouvez votre radial depuis ARD, puis interceptez et suivez le R-090 en éloignement jusqu’à 12 DME.",
    objectives: [
      "Se situer au VOR (radial, TO/FROM)",
      "Intercepter à 45°",
      "Suivre l’axe avec une correction de dérive",
    ],
    standards: [
      "CDI à moins de ¾ d’échelle après l’interception",
      "Altitude ±100 ft",
    ],
    briefing: [
      "Affichez 114.20 et identifiez ARD. Tournez le bouton CRS jusqu’à centrer l’aiguille avec le drapeau FROM : c’est votre radial.",
      "Pour intercepter le R-090 en éloignement : CRS 090, puis prenez le cap 045 ou 135, vers l’aiguille.",
    ],
  },
  "nav-vor-in": {
    summary:
      "Suivez le R-200 en rapprochement vers ARD avec 20 kt de vent de travers ; encadrez pour trouver la correction de dérive.",
    objectives: [
      "La méthode de l’encadrement",
      "Tenir la correction de dérive",
      "Passage de la station : le drapeau passe de TO à FROM",
    ],
    standards: [
      "CDI à moins de ¾ d’échelle après l’interception",
      "Altitude ±100 ft",
    ],
    briefing: [
      "CRS 020 (TO). Commencez avec 10° de correction face au vent, divisez-la par deux à chaque recentrage.",
    ],
  },
  "nav-arc": {
    summary:
      "Volez l’arc 10 DME autour de MSV dans le sens inverse des aiguilles d’une montre, du R-100 au R-030, puis virez en rapprochement.",
    objectives: [
      "Rejoindre l’arc avec une anticipation",
      "Garder l’aiguille du relèvement sur le bout d’aile",
      "Anticiper le virage en rapprochement (radial d’anticipation)",
    ],
    standards: ["Arc ±1 NM", "Altitude ±100 ft"],
    briefing: [
      "BRG1 = NAV1 est réglé pour vous. Sur cet arc, la station est au bout de l’aile GAUCHE.",
      "Chaque fois que l’aiguille passe environ 10° derrière le bout d’aile, virez de 10° à gauche.",
    ],
  },
  "nav-ndb": {
    summary:
      "Interceptez et suivez le QDM 270 vers le NDB PA, à l’aiguille ADF, avec du vent de travers.",
    objectives: [
      "Lire l’aiguille ADF (gisement, relèvement magnétique)",
      "Intercepter un QDM",
      "Corriger la dérive",
    ],
    standards: ["Route ±5°", "Altitude ±100 ft"],
    briefing: [
      "BRG1 = ADF. Relèvement = cap + gisement. Pour intercepter le 270 en rapprochement depuis le nord, volez au 225 jusqu’à ce que l’aiguille indique 45° à droite, puis virez au 270.",
    ],
  },
  "nav-gps": {
    summary:
      "Utilisez le Direct-To, chargez une approche et suivez la ligne magenta par deux points.",
    objectives: [
      "Le Direct-To (D→)",
      "L’échelle du CDI : ENR / TERM",
      "Le séquencement des branches et l’anticipation des virages",
    ],
    standards: ["CDI à moins de ¾ d’échelle", "Altitude ±100 ft"],
    briefing: [
      "Appuyez sur D, tapez TOBEY, Entrée. Puis Procédures → ILS 27 par TOBEY → Charger et activer.",
    ],
  },
  "int-loc30": {
    summary:
      "Guidage radar : cap 240 pour intercepter le localizer I-PRD avant MARLO. Rejoignez l’axe sans le dépasser.",
    ...INTERCEPT(1),
  },
  "int-loc45-tail": {
    summary:
      "Une interception plus franche avec 25 kt de vent qui vous pousse à travers l’axe : anticipez tôt.",
    ...INTERCEPT(1),
  },
  "int-loc90": {
    summary:
      "L’ATC vous fait traverser la finale à 90° près du FAF : un piège classique de dépassement. Tolérance d’un point et demi.",
    ...INTERCEPT(1.5),
  },
  "int-lda": {
    summary:
      "Interceptez le LDA I-ADN (route 016) : l’axe n’est aligné avec aucune piste.",
    ...INTERCEPT(1),
  },
  // ---------------------------------------------------------------- Phase 4 · attentes
  "hold-random": {
    summary:
      "Une clairance d’attente tirée au hasard, jamais la même : décodez-la, choisissez l’entrée, volez deux tours. Recommencez jusqu’à l’automatisme.",
    objectives: [
      "Copier et décoder une clairance d’attente de l’ATC",
      "Se représenter l’attente et choisir l’entrée",
      "La voler dans les tolérances",
    ],
    standards: [
      "Entrée correcte",
      "Altitude ±100 ft",
      "Rapprochement 1:00 ±15 s",
    ],
    briefing: [
      "Dessinez-la : le point en haut, la route de rapprochement pointée vers lui, l’hippodrome du côté des virages.",
    ],
  },
  // ---------------------------------------------------------------- Phase 5 · approches
  "app-ils-ap": {
    summary:
      "Guidage radar vers la finale, pilote automatique couplé en mode APR. Apprenez l’ordre des modes : HDG → LOC armé → LOC → GS.",
    ...APPROACH(false),
    briefing: [
      "NAV1 est réglé sur I-PRD ; le CDI passe sur LOC1 après la bascule (touche C).",
      "APR arme LOC et GS ; ALT tient 3000 ft jusqu’à la capture du glide.",
    ],
  },
  "app-ils-hand": {
    summary:
      "Volez TOBEY–KEDDY au GPS, passez sur le LOC avant le FAF, tenez le glide à la main jusqu’à la DA 670.",
    ...APPROACH(false),
    briefing: [
      "Le G1000 bascule seul le CDI sur LOC1 une fois établi en rapprochement : vérifiez l’aiguille verte LOC1 avant KEDDY (instruments classiques : basculez vous-même, touche C).",
      "Glide : environ 450 ft/min à 85 kt de vitesse sol. L’assiette tient le plan, la puissance tient la vitesse.",
    ],
  },
  "app-loc": {
    summary:
      "Glide hors service : descendez à 2400 ft pour MARLO, puis à la MDA 900. Descente continue (CDFA) à environ 500 ft/min.",
    ...APPROACH(false),
    briefing: [
      "MDA 900. Ne descendez pas sous la MDA sans voir l’environnement de la piste.",
      "MAP au seuil 27 (6,1 NM après MARLO).",
    ],
  },
  "app-vor-arc": {
    summary:
      "IAF TOMAS, arc 10 DME jusqu’à GALEN, R-030 en rapprochement vers MSV, palier de descente à DOPPS, MDA 1640.",
    ...APPROACH(false),
    briefing: [
      "Pour l’arc, BRG1 = NAV1 ; anticipez le virage en rapprochement au R-035.",
      "Paliers : MSV 3200 · DOPPS 2100 · MDA 1640.",
    ],
  },
  "app-ndb-pt": {
    summary:
      "Survolez PA, éloignement au 090, virage conventionnel 045°/225° au nord de l’axe à moins de 10 NM, rapprochement vers PA, chrono jusqu’au MAP.",
    ...APPROACH(false),
    briefing: [
      "Éloignement 2 min après PA, virez à gauche au 045 pendant 1 min, puis à droite au 225, interceptez le 270 en rapprochement.",
      "Lancez le chrono à PA en rapprochement : 3:00 jusqu’au MAP à 90 kt.",
    ],
  },
  "app-rnav-hilpt": {
    summary:
      "Demi-tour dans l’attente de WILLO (HILPT), puis le plan LPV jusqu’à la DA 670.",
    ...APPROACH(false),
    briefing: [
      "Le GPS vole l’entrée de l’attente et en sort après un tour.",
      "APR arme le GP ; vérifiez l’annonce LPV sur le HSI.",
    ],
  },
  "app-lnav-vnav": {
    summary:
      "Tenez à la main un plan baro-VNAV en rafales. Ajoutez la moitié de l’écart de rafale à la vitesse d’approche.",
    ...APPROACH(false),
    briefing: ["Vapp 90 + ½ × 8 = 94 KIAS.", "DA 1500."],
  },
  "app-bc": {
    summary:
      "Attention à l’inversion de sens : avec CRS sur l’axe avant 270, le HSI montre quand même la bonne image.",
    ...APPROACH(false),
    briefing: ["CRS 270. Pas de glide. MDA 860."],
  },
  "app-circle": {
    summary:
      "Volez l’ILS jusqu’à la MDA de circling 1000, quittez l’axe et tournez pour atterrir en 09 (vent arrière en 27).",
    ...APPROACH(false),
    briefing: [
      "MDA de circling 1000 (cat. A) ; restez à moins de 1,3 NM de la piste.",
      "Gardez la piste en vue ; atterrissez en 09.",
    ],
  },
  // ---------------------------------------------------------------- Phase 6 · remises de gaz et pannes
  "ma-da": {
    summary:
      "Plafond sous les minima. À la DA : remettez les gaz (G), montez à 3000 ft, direct ARD et entrez dans l’attente.",
    ...APPROACH(true),
    briefing: [
      "G = TOGA : pleine puissance, assiette 7°, volets 10, procédure interrompue séquencée.",
      "Puis NAV (et le pilote automatique) pour rejoindre ARD et entrer dans l’attente.",
    ],
  },
  "ma-gsfail": {
    summary:
      "Le glide tombe en panne après le FAF. Passez aux minima LOC (MDA 900) ou remettez les gaz.",
    ...APPROACH(false),
    briefing: [
      "Reconnaissez le drapeau « GS » / NO GS, affichez MINS 900 (bouton ou touche MINS), continuez en LOC.",
    ],
  },
  "ma-pp": {
    summary:
      "AHRS en panne : volez l’ILS sur l’horizon de secours, avec le CDI et le compas.",
    ...APPROACH(false),
    briefing: [
      "Le cap ne vient que du compas : il est en retard. De petites corrections.",
    ],
  },
  // ---------------------------------------------------------------- Phase 7 · préparation au test
  "ck-profile": {
    summary:
      "Départ, direct ARD, attente publiée, ILS 27 par ARD, atterrissage. Noté comme au test en vol.",
    objectives: ["Toutes les compétences à la suite, comme au test en vol"],
    standards: [
      "Altitude ±100 ft, cap ±10°, vitesse ±10 KIAS, ¾ d’échelle en finale, discipline de la DA",
    ],
    briefing: [
      "Clairance : « Cleared to PARD, climb runway heading to 3000, then direct ARD, hold as published (inbound 270, right turns), expect ILS 27 via ARD. »",
    ],
  },
  // ---------------------------------------------------------------- Phase 8 · navigations IFR
  "ifr-pard-msvl-rnav": {
    summary:
      "Départ de Port Ardent, croisière à 5000 ft, arrivée à Mistral Valley par le RNAV (GPS) 03 LNAV/VNAV.",
    ...IFR_FLIGHT,
    briefing: [
      "CRAFT : C MSVL · R ARD SCREE · A 3000 → 5000 · F départ · T 4721.",
      "Avant le départ : la route est déjà dans le plan de vol ; briefez la carte d’arrivée, affichez les minima.",
      "Le pilote automatique est permis : l’enjeu est de gérer tout le vol.",
    ],
  },
  "ifr-msvl-pard-ils": {
    summary:
      "Départ de la vallée en piste 21, puis l’ILS 27 de Port Ardent par météo proche des minima.",
    ...IFR_FLIGHT,
    briefing: [
      "CRAFT : C PARD · R TOBEY · A 3000 → 4000 · F départ · T 4721.",
      "Avant le départ : la route est déjà dans le plan de vol ; briefez la carte d’arrivée, affichez les minima.",
      "Le pilote automatique est permis : l’enjeu est de gérer tout le vol.",
    ],
  },
  "ifr-pard-msvl-vor": {
    summary:
      "Départ vers l’est, route vers TOMAS, l’arc 10 DME et le VOR/DME 21 avec ses paliers.",
    ...IFR_FLIGHT,
    briefing: [
      "CRAFT : C MSVL · R KEDDY TOMAS · A 3000 → 5000 · F départ · T 4721.",
      "Avant le départ : la route est déjà dans le plan de vol ; briefez la carte d’arrivée, affichez les minima.",
      "Le pilote automatique est permis : l’enjeu est de gérer tout le vol.",
    ],
  },
  "ifr-msvl-pard-ndb": {
    summary:
      "L’arrivée à l’ancienne : survol du NDB, virage conventionnel et approche NDB.",
    ...IFR_FLIGHT,
    briefing: [
      "CRAFT : C PARD · R ARD PA · A 3000 → 4000 · F départ · T 4721.",
      "Avant le départ : la route est déjà dans le plan de vol ; briefez la carte d’arrivée, affichez les minima.",
      "Le pilote automatique est permis : l’enjeu est de gérer tout le vol.",
    ],
  },
  "ifr-local-lda": {
    summary:
      "Un court vol IFR local, retour à Port Ardent par le LDA décalé vers la piste 36.",
    ...IFR_FLIGHT,
    briefing: [
      "CRAFT : C PARD · R HERON GULLS · A 3000 → 3000 · F départ · T 4721.",
      "Avant le départ : la route est déjà dans le plan de vol ; briefez la carte d’arrivée, affichez les minima.",
      "Le pilote automatique est permis : l’enjeu est de gérer tout le vol.",
    ],
  },
};
