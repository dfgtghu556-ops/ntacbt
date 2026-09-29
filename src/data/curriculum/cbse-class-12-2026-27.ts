/**
 * CBSE Class XII 2026–27 curriculum map — Board → Class → Subject → Unit → Chapter → Topic.
 *
 * **Why this is a separate, versioned dataset.** Before this, "CBSE" existed
 * only as a flat chapter list in `src/data/sot/legacy-inline.json`
 * (`cbse27Topics`: `[name, ?, ?, classLevel]`) with no units, no topics and no
 * source. A planner could not reason about a board student's remaining work
 * because it could not see the unit structure or how much was left.
 *
 * **The honesty rule.** Unit marks are recorded ONLY where every source agrees:
 *
 *   - Chemistry — all sources agree (7+9+7+7+7+6+6+8+6+7 = 70). Recorded.
 *   - Mathematics — all sources agree (8+10+35+14+5+8 = 80). Recorded.
 *   - Physics — sources disagree sharply; several publish per-unit marks that
 *     sum to 133 for a 70-mark theory paper. **Recorded as `null`**, and the
 *     planner shows "not published here" rather than a wrong weight.
 *
 * CBSE publishes unit-wise marks, and for Mathematics explicitly states "no
 * chapter-wise weightage" — so marks live on the unit, never the chapter.
 *
 * **Cross-scope safety.** One map per (board, classLevel, academicYear). A
 * Class XII read can only ever resolve a Class XII map, so Class XI chapters
 * cannot leak into a Class XII plan. `assertClassLevelIsolation` enforces it.
 */

import type { Source } from "@/features/academics/source";
import type { Subject } from "@/features/academics/types";

export type BoardId = "CBSE";
export type ClassLevel = 11 | 12;

/** One topic inside a chapter. */
export interface CurriculumTopic {
  id: string;
  name: string;
}

/** One chapter inside a unit. */
export interface CurriculumChapter {
  id: string;
  /** The NCERT chapter number, for cross-referencing a textbook. */
  number: number;
  name: string;
  topics: CurriculumTopic[];
}

/**
 * One unit. `marks` is `null` when the board's published per-unit marks could
 * not be corroborated — never a guessed number.
 */
export interface CurriculumUnit {
  id: string;
  /** Roman numeral as the board prints it, e.g. "III". */
  numeral: string;
  name: string;
  /** Theory marks for this unit, or null when not corroborated. */
  marks: number | null;
  chapters: CurriculumChapter[];
}

export interface CurriculumSubject {
  subject: Subject;
  units: CurriculumUnit[];
}

/** A complete, versioned curriculum map for one class and academic year. */
export interface CurriculumMap {
  board: BoardId;
  classLevel: ClassLevel;
  academicYear: string;
  /** Dataset version, so a future syllabus refresh is diffable. */
  version: string;
  source: Source;
  /** Total theory marks across the subject, or null when units are unmarked. */
  subjects: CurriculumSubject[];
  note?: string | undefined;
}

/* ------------------------------------------------------------------ *
 * Helpers for building the map without repeating ids by hand
 * ------------------------------------------------------------------ */

interface RawChapter {
  n: number;
  name: string;
  topics: string[];
}
interface RawUnit {
  numeral: string;
  name: string;
  marks: number | null;
  chapters: RawChapter[];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSubject(subject: Subject, rawUnits: RawUnit[]): CurriculumSubject {
  return {
    subject,
    units: rawUnits.map((u, ui) => ({
      id: `${slug(subject)}-u${ui + 1}-${slug(u.name)}`,
      numeral: u.numeral,
      name: u.name,
      marks: u.marks,
      chapters: u.chapters.map((c) => ({
        id: `${slug(subject)}-ch${c.n}-${slug(c.name)}`,
        number: c.n,
        name: c.name,
        topics: c.topics.map((t) => ({ id: `${slug(subject)}-ch${c.n}-${slug(t)}`, name: t })),
      })),
    })),
  };
}

/** Sum of unit marks, or null when any unit is unmarked. */
export function theoryMarks(map: CurriculumMap, subject: Subject): number | null {
  const s = map.subjects.find((x) => x.subject === subject);
  if (!s) return null;
  const units = s.units;
  if (units.length === 0) return null;
  if (units.some((u) => u.marks === null)) return null;
  return units.reduce((sum, u) => sum + (u.marks ?? 0), 0);
}

/** Every chapter in a subject, in board order. */
export function chaptersOf(map: CurriculumMap, subject: Subject): CurriculumChapter[] {
  const s = map.subjects.find((x) => x.subject === subject);
  if (!s) return [];
  return s.units.flatMap((u) => u.chapters);
}

/** Look up the unit a chapter belongs to. */
export function unitOfChapter(
  map: CurriculumMap,
  subject: Subject,
  chapterName: string,
): CurriculumUnit | null {
  const s = map.subjects.find((x) => x.subject === subject);
  if (!s) return null;
  const wanted = chapterName.trim().toLowerCase();
  for (const u of s.units) {
    if (u.chapters.some((c) => c.name.trim().toLowerCase() === wanted)) return u;
  }
  return null;
}

/**
 * True only when every chapter in the map belongs to exactly one unit and the
 * map's classLevel matches. A Class XI chapter can therefore never appear in a
 * Class XII map.
 *
 * Two kinds of duplication are rejected, because both produce a plan the student
 * cannot trust:
 *
 *  - the same chapter NAME in two units, which would create two mastery rows for
 *    one chapter and split its evidence between them;
 *  - the same chapter NUMBER twice in one subject, which would break every
 *    `chaptersOf` ordering and any "chapter 7" reference.
 *
 * The check is scoped per subject, so Chemistry ch. 1 and Physics ch. 1 are not
 * a collision — they are genuinely different chapters.
 */
export function assertClassLevelIsolation(map: CurriculumMap, expected: ClassLevel): boolean {
  if (map.classLevel !== expected) return false;
  for (const s of map.subjects) {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const seenNumbers = new Set<number>();
    for (const u of s.units) {
      for (const c of u.chapters) {
        if (seenIds.has(c.id)) return false; // identical chapter in two units
        if (seenNames.has(c.name.toLowerCase())) return false; // one chapter, two units
        if (seenNumbers.has(c.number)) return false; // numbering collision
        seenIds.add(c.id);
        seenNames.add(c.name.toLowerCase());
        seenNumbers.add(c.number);
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * The CBSE Class XII 2026–27 map
 * ------------------------------------------------------------------ */

const CBSE_12_2026_27_SOURCE: Source = {
  source: "CBSE Senior School Curriculum 2026-27 (Class XII), cbseacademic.nic.in",
  sourceType: "cbse_curriculum",
  sourceUrl: "https://cbseacademic.nic.in/",
  fetchedAt: "2026-09-29T00:00:00Z",
  version: "2026-27",
  verificationStatus: "verified",
  note:
    "Unit and chapter structure transcribed from the CBSE Class XII curriculum. " +
    "Unit marks recorded only where secondary sources agree; Physics per-unit " +
    "marks are left null because published figures conflict.",
};

const PHYSICS_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Electrostatics",
    // Physics unit marks are deliberately null — see the note above.
    marks: null,
    chapters: [
      {
        n: 1,
        name: "Electric Charges and Fields",
        topics: [
          "Electric charges and conservation of charge",
          "Coulomb's law — force between two point charges",
          "Superposition principle and continuous charge distribution",
          "Electric field and electric field lines",
          "Electric dipole and torque on a dipole",
          "Electric flux",
          "Gauss's theorem and its applications",
        ],
      },
      {
        n: 2,
        name: "Electrostatic Potential and Capacitance",
        topics: [
          "Electric potential and potential difference",
          "Potential due to a point charge, dipole and system of charges",
          "Equipotential surfaces",
          "Electrical potential energy",
          "Conductors, insulators and dielectrics",
          "Capacitors and capacitance",
          "Combination of capacitors",
          "Parallel plate capacitor",
          "Energy stored in a capacitor",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Current Electricity",
    marks: null,
    chapters: [
      {
        n: 3,
        name: "Current Electricity",
        topics: [
          "Electric current, drift velocity and mobility",
          "Ohm's law and V-I characteristics",
          "Electrical energy and power",
          "Resistivity and conductivity",
          "Temperature dependence of resistance",
          "Internal resistance and EMF of a cell",
          "Combination of cells",
          "Kirchhoff's rules",
          "Wheatstone bridge",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Magnetic Effects of Current and Magnetism",
    marks: null,
    chapters: [
      {
        n: 4,
        name: "Moving Charges and Magnetism",
        topics: [
          "Concept of magnetic field and Oersted's experiment",
          "Biot-Savart law",
          "Ampere's law",
          "Force on a moving charge and on a current-carrying conductor",
          "Force between parallel conductors",
          "Torque on a current loop and magnetic dipole moment",
          "Moving coil galvanometer",
        ],
      },
      {
        n: 5,
        name: "Magnetism and Matter",
        topics: [
          "Bar magnet and magnetic field lines",
          "Magnetic dipole (qualitative)",
          "Magnetic properties of materials — dia, para and ferromagnetic",
          "Magnetisation",
          "Effect of temperature on magnetic properties",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "Electromagnetic Induction and Alternating Currents",
    marks: null,
    chapters: [
      {
        n: 6,
        name: "Electromagnetic Induction",
        topics: [
          "Electromagnetic induction and Faraday's laws",
          "Induced EMF and current",
          "Lenz's law",
          "Self and mutual induction",
          "AC generator",
          "Transformer",
        ],
      },
      {
        n: 7,
        name: "Alternating Current",
        topics: [
          "Peak and RMS values",
          "Reactance and impedance",
          "LCR series circuit and phasors",
          "Resonance",
          "Power in AC circuits and power factor",
          "Wattless current",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Electromagnetic Waves",
    marks: null,
    chapters: [
      {
        n: 8,
        name: "Electromagnetic Waves",
        topics: [
          "Displacement current (basic idea)",
          "Electromagnetic waves and their characteristics",
          "Transverse nature of electromagnetic waves",
          "Electromagnetic spectrum and its uses",
        ],
      },
    ],
  },
  {
    numeral: "VI",
    name: "Optics",
    marks: null,
    chapters: [
      {
        n: 9,
        name: "Ray Optics and Optical Instruments",
        topics: [
          "Reflection and refraction of light",
          "Spherical mirrors",
          "Lenses and lens maker's formula",
          "Total internal reflection",
          "Optical fibres",
          "Refraction through a prism",
          "Magnification and power of a lens",
          "Microscopes and telescopes",
        ],
      },
      {
        n: 10,
        name: "Wave Optics",
        topics: [
          "Wavefront and Huygens' principle",
          "Reflection and refraction using wave theory",
          "Interference and coherent sources",
          "Young's double-slit experiment",
          "Diffraction (single slit, qualitative)",
          "Polarisation",
        ],
      },
    ],
  },
  {
    numeral: "VII",
    name: "Dual Nature of Radiation and Matter",
    marks: null,
    chapters: [
      {
        n: 11,
        name: "Dual Nature of Radiation and Matter",
        topics: [
          "Dual nature of radiation",
          "Photoelectric effect — Hertz and Lenard's observations",
          "Einstein's photoelectric equation",
          "Particle nature of light",
          "Matter waves and de Broglie relation",
        ],
      },
    ],
  },
  {
    numeral: "VIII",
    name: "Atoms and Nuclei",
    marks: null,
    chapters: [
      {
        n: 12,
        name: "Atoms",
        topics: [
          "Alpha-particle scattering experiment",
          "Rutherford's model of the atom",
          "Bohr model of the hydrogen atom",
          "Radius, velocity and energy of the electron in the nth orbit",
          "Hydrogen line spectra (qualitative)",
        ],
      },
      {
        n: 13,
        name: "Nuclei",
        topics: [
          "Composition and size of the nucleus",
          "Nuclear force",
          "Mass-energy relation and mass defect",
          "Binding energy per nucleon",
          "Nuclear fission and fusion",
        ],
      },
    ],
  },
  {
    numeral: "IX",
    name: "Electronic Devices",
    marks: null,
    chapters: [
      {
        n: 14,
        name: "Semiconductor Electronics: Materials, Devices and Simple Circuits",
        topics: [
          "Energy bands in conductors, semiconductors and insulators",
          "Intrinsic and extrinsic semiconductors",
          "p-type and n-type semiconductors",
          "p-n junction",
          "Semiconductor diode I-V characteristics",
          "Junction diode as a rectifier",
        ],
      },
    ],
  },
];

const CHEMISTRY_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Solutions",
    marks: 7,
    chapters: [
      {
        n: 1,
        name: "Solutions",
        topics: [
          "Types of solutions",
          "Expression of concentration of solutions",
          "Solubility of gases in liquids",
          "Vapour pressure of liquid solutions",
          "Ideal and non-ideal solutions",
          "Raoult's law",
          "Colligative properties and determination of molar mass",
          "Abnormal molar masses and Van't Hoff factor",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Electrochemistry",
    marks: 9,
    chapters: [
      {
        n: 2,
        name: "Electrochemistry",
        topics: [
          "Redox reactions",
          "Electrochemical cells and galvanic cells",
          "Conductance of electrolytic solutions",
          "Kohlrausch's law",
          "Electrolytic cells and electrolysis",
          "Faraday's laws of electrolysis",
          "EMF of a cell and standard electrode potential",
          "Nernst equation",
          "Batteries and fuel cells",
          "Corrosion",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Chemical Kinetics",
    marks: 7,
    chapters: [
      {
        n: 3,
        name: "Chemical Kinetics",
        topics: [
          "Rate of a chemical reaction",
          "Factors influencing the rate of reaction",
          "Order and molecularity",
          "Rate law and integrated rate equations",
          "Half-life of a reaction",
          "Pseudo first-order reactions",
          "Temperature dependence of the rate of reaction",
          "Activation energy and Arrhenius equation",
          "Collision theory of chemical reactions",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "d- and f-Block Elements",
    marks: 7,
    chapters: [
      {
        n: 4,
        name: "d- and f-Block Elements",
        topics: [
          "Transition elements — general properties and trends",
          "Magnetic properties and formation of coloured ions",
          "Interstitial compounds and alloy formation",
          "Preparation and properties of K2Cr2O7 and KMnO4",
          "Lanthanoids — electronic configuration and oxidation states",
          "Lanthanoid contraction",
          "Actinoids",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Coordination Compounds",
    marks: 7,
    chapters: [
      {
        n: 5,
        name: "Coordination Compounds",
        topics: [
          "Werner's theory of coordination compounds",
          "Ligands and coordination number",
          "IUPAC nomenclature of coordination compounds",
          "Structural and stereoisomerism",
          "Valence bond theory (VBT)",
          "Crystal field theory (CFT)",
          "Colour, magnetic properties and stability of complexes",
          "Organometallic compounds",
        ],
      },
    ],
  },
  {
    numeral: "VI",
    name: "Haloalkanes and Haloarenes",
    marks: 6,
    chapters: [
      {
        n: 6,
        name: "Haloalkanes and Haloarenes",
        topics: [
          "Nomenclature of haloalkanes and haloarenes",
          "Nature of the C–X bond",
          "Physical properties",
          "Chemical reactions of haloalkanes",
          "SN1 and SN2 mechanisms",
          "Optical rotation",
          "Haloarenes — electrophilic substitution",
          "Uses and environmental effects of polyhalogen compounds",
        ],
      },
    ],
  },
  {
    numeral: "VII",
    name: "Alcohols, Phenols and Ethers",
    marks: 6,
    chapters: [
      {
        n: 7,
        name: "Alcohols, Phenols and Ethers",
        topics: [
          "Classification and IUPAC nomenclature",
          "Preparation of alcohols",
          "Physical and chemical properties of alcohols",
          "Mechanism of dehydration",
          "Phenols — acidic nature",
          "Electrophilic substitution in phenols",
          "Preparation and reactions of ethers",
        ],
      },
    ],
  },
  {
    numeral: "VIII",
    name: "Aldehydes, Ketones and Carboxylic Acids",
    marks: 8,
    chapters: [
      {
        n: 8,
        name: "Aldehydes, Ketones and Carboxylic Acids",
        topics: [
          "Nomenclature and nature of the carbonyl group",
          "Nucleophilic addition reactions",
          "Oxidation and reduction of carbonyl compounds",
          "Cannizzaro reaction",
          "Aldol condensation",
          "Carboxylic acids — nomenclature and acidity",
          "Reactions of carboxylic acids",
          "Uses of carboxylic acids",
        ],
      },
    ],
  },
  {
    numeral: "IX",
    name: "Amines",
    marks: 6,
    chapters: [
      {
        n: 9,
        name: "Amines",
        topics: [
          "Structure and classification of amines",
          "Nomenclature of amines",
          "Preparation of amines",
          "Physical properties and chemical reactions",
          "Basicity comparison of amines",
          "Diazonium salts — preparation and reactions",
          "Importance of diazonium salts in synthesis",
        ],
      },
    ],
  },
  {
    numeral: "X",
    name: "Biomolecules",
    marks: 7,
    chapters: [
      {
        n: 10,
        name: "Biomolecules",
        topics: [
          "Carbohydrates — classification",
          "Proteins and amino acids",
          "Peptide bond and structure of proteins",
          "Enzymes",
          "Vitamins — classification and functions",
          "Nucleic acids — DNA and RNA",
          "Hormones",
        ],
      },
    ],
  },
];

const MATHEMATICS_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Relations and Functions",
    marks: 8,
    chapters: [
      {
        n: 1,
        name: "Relations and Functions",
        topics: [
          "Types of relations — reflexive, symmetric, transitive, equivalence",
          "One-to-one and onto functions",
          "Composition of functions",
          "Inverse of a function",
          "Binary operations and their properties",
        ],
      },
      {
        n: 2,
        name: "Inverse Trigonometric Functions",
        topics: [
          "Definition, range and domain",
          "Principal value branch",
          "Graphs of inverse trigonometric functions",
          "Properties of inverse trigonometric functions",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Algebra",
    marks: 10,
    chapters: [
      {
        n: 3,
        name: "Matrices",
        topics: [
          "Types of matrices",
          "Operations on matrices",
          "Transpose of a matrix",
          "Symmetric and skew-symmetric matrices",
          "Elementary row operations",
          "Invertible matrices and uniqueness of inverse",
        ],
      },
      {
        n: 4,
        name: "Determinants",
        topics: [
          "Determinant of a matrix up to order 3",
          "Minors and cofactors",
          "Adjoint and inverse of a matrix",
          "Area of a triangle using determinants",
          "Solving a system of linear equations using the inverse",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Calculus",
    marks: 35,
    chapters: [
      {
        n: 5,
        name: "Continuity and Differentiability",
        topics: [
          "Continuity and differentiability",
          "Chain rule and derivatives of composite functions",
          "Derivatives of implicit functions",
          "Derivatives of inverse trigonometric functions",
          "Exponential and logarithmic functions",
          "Logarithmic differentiation",
          "Second-order derivatives",
          "Rolle's and Lagrange's Mean Value Theorems",
        ],
      },
      {
        n: 6,
        name: "Applications of Derivatives",
        topics: [
          "Rate of change of quantities",
          "Increasing and decreasing functions",
          "Tangents and normals",
          "Approximations",
          "Maxima and minima",
        ],
      },
      {
        n: 7,
        name: "Integrals",
        topics: [
          "Integration as the inverse of differentiation",
          "Integration by substitution",
          "Integration by partial fractions",
          "Integration by parts",
          "Definite integrals and their properties",
          "Fundamental theorem of calculus",
        ],
      },
      {
        n: 8,
        name: "Applications of Integrals",
        topics: [
          "Area under curves — lines",
          "Area under curves — circles and parabolas",
          "Area under curves — ellipses (standard forms)",
        ],
      },
      {
        n: 9,
        name: "Differential Equations",
        topics: [
          "Order and degree of a differential equation",
          "General and particular solutions",
          "Formation of a differential equation",
          "Solution by separation of variables",
          "Homogeneous differential equations",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "Vectors and Three-Dimensional Geometry",
    marks: 14,
    chapters: [
      {
        n: 10,
        name: "Vectors",
        topics: [
          "Vectors and scalars",
          "Magnitude and direction of a vector",
          "Direction cosines and direction ratios",
          "Scalar (dot) product of vectors",
          "Vector (cross) product of vectors",
          "Projection of a vector",
        ],
      },
      {
        n: 11,
        name: "Three-Dimensional Geometry",
        topics: [
          "Direction cosines and ratios of a line",
          "Cartesian and vector equations of a line",
          "Skew lines",
          "Shortest distance between two lines",
          "Angle between two lines",
          "Equation of a plane",
          "Angle between two planes, a line and a plane",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Linear Programming",
    marks: 5,
    chapters: [
      {
        n: 12,
        name: "Linear Programming",
        topics: [
          "Introduction and related terminology",
          "Constraints and objective function",
          "Graphical method of solution",
          "Feasible and infeasible regions",
          "Optimal feasible solutions",
        ],
      },
    ],
  },
  {
    numeral: "VI",
    name: "Probability",
    marks: 8,
    chapters: [
      {
        n: 13,
        name: "Probability",
        topics: [
          "Conditional probability",
          "Multiplication theorem on probability",
          "Independent events",
          "Total probability",
          "Bayes' theorem",
          "Random variable and its probability distribution",
          "Mean and variance of a random variable",
          "Binomial distribution",
        ],
      },
    ],
  },
];

export const CBSE_CLASS_12_2026_27: CurriculumMap = {
  board: "CBSE",
  classLevel: 12,
  academicYear: "2026-27",
  version: "2026-27.1",
  source: CBSE_12_2026_27_SOURCE,
  subjects: [
    buildSubject("Physics", PHYSICS_UNITS),
    buildSubject("Chemistry", CHEMISTRY_UNITS),
    buildSubject("Mathematics", MATHEMATICS_UNITS),
  ],
  note:
    "Physics unit marks are null: published per-unit figures conflict and several " +
    "sum above the 70-mark theory paper. Chemistry and Mathematics marks are " +
    "recorded because every source agrees. CBSE publishes unit-wise marks only — " +
    "for Mathematics it states explicitly that there is no chapter-wise weightage.",
};
