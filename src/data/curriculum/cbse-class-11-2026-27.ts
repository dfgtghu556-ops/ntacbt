/**
 * CBSE Class XI 2026–27 curriculum map — Board → Class → Subject → Unit → Chapter → Topic.
 *
 * **Why this exists.** A `board11` student previously got an honest "not
 * published here" from the syllabus map, which is better than the Class XII
 * chapters — but it meant a foundation-year student had no unit structure, no
 * chapter list and no weightage to plan against, even though CBSE publishes all
 * three for Class XI.
 *
 * **The honesty rule, applied the same way as Class XII.** Unit marks are
 * recorded ONLY where every source agrees:
 *
 *   - Chemistry — all sources agree (7+9+6+7+9+7+4+11+10 = 70). Recorded.
 *   - Mathematics — all sources agree (23+25+12+8+12 = 80). Recorded.
 *   - Physics — **`null`**, for two separate reasons that both have to be
 *     stated rather than picked between:
 *
 *     1. CBSE does not publish per-unit marks for Class XI Physics. It publishes
 *        *bands*: Units I–III together carry 23, Units IV–VI carry 17, Units
 *        VII–IX carry 20, Unit X carries 10. Splitting a band across its units
 *        would be an invention.
 *     2. Secondary sources that do print per-unit figures disagree with each
 *        other — one set reads 3/10/10/7/7/7/13/5/3/5, another 3/10/10/6/6/5/
 *        10/7/3/10 — and several others print the *band* figure repeated on
 *        every unit in it, which sums to well over the 70-mark theory paper.
 *
 *     So the map carries `null` per unit and records the band structure in the
 *     map note, where a planner can show it as published rather than as a
 *     per-unit weight.
 *
 * **Rationalisation is reflected, not ignored.** The current Class XI syllabus
 * is the rationalised one: Chemistry is 9 units (Hydrogen, States of Matter,
 * s-Block and p-Block Elements are no longer examinable units), Physics is 10
 * units over 14 chapters, and Mathematics is 5 units over 14 chapters with
 * "Principle of Mathematical Induction" and "Mathematical Reasoning" removed.
 * A map that still listed the deleted chapters would send a student to work
 * that is not examined.
 *
 * **Cross-scope safety.** One map per (board, classLevel, academicYear), and
 * `assertClassLevelIsolation` is run against class 11, so this map can never be
 * resolved by a Class XII read and Class XII chapters cannot leak in here.
 */

import type { Source } from "@/features/academics/source";
import {
  assertClassLevelIsolation,
  buildSubject,
  type BoardId,
  type ClassLevel,
  type CurriculumMap,
  type RawUnit,
} from "./build";

export type { BoardId, ClassLevel } from "./build";
export type {
  CurriculumChapter,
  CurriculumMap,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumUnit,
} from "./build";

const CBSE_11_2026_27_SOURCE: Source = {
  source: "CBSE Senior School Curriculum 2026-27 (Class XI), cbseacademic.nic.in",
  sourceType: "cbse_curriculum",
  sourceUrl: "https://cbseacademic.nic.in/",
  fetchedAt: "2026-09-29T00:00:00Z",
  version: "2026-27",
  verificationStatus: "verified",
  note:
    "Unit and chapter structure transcribed from the CBSE Class XI curriculum and " +
    "corroborated across multiple secondary sources. Chemistry and Mathematics " +
    "per-unit marks are recorded because every source agrees. Physics per-unit " +
    "marks are null: CBSE publishes band totals for Class XI Physics rather than " +
    "per-unit figures, and the secondary sources that do print per-unit marks " +
    "disagree with each other.",
};

/**
 * Physics — 10 units, 14 NCERT chapters, 70 theory + 30 practical.
 *
 * Every `marks` is null. See the file header for why, and the map `note` for the
 * published band totals, which are the only weight CBSE actually prints here.
 */
const PHYSICS_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Physical World and Measurement",
    marks: null,
    chapters: [
      {
        n: 1,
        name: "Units and Measurements",
        topics: [
          "Need for measurement and units of measurement",
          "Systems of units and SI units",
          "Fundamental and derived units",
          "Significant figures",
          "Dimensions of physical quantities",
          "Dimensional analysis and its applications",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Kinematics",
    marks: null,
    chapters: [
      {
        n: 2,
        name: "Motion in a Straight Line",
        topics: [
          "Position, path length and displacement",
          "Average velocity and average speed",
          "Instantaneous velocity and speed",
          "Acceleration",
          "Kinematic equations for uniformly accelerated motion",
          "Relative velocity",
        ],
      },
      {
        n: 3,
        name: "Motion in a Plane",
        topics: [
          "Scalar and vector quantities",
          "Position and displacement vectors",
          "Equality of vectors",
          "Multiplication of vectors by a real number",
          "Addition and subtraction of vectors — graphical method",
          "Resolution of vectors",
          "Vector addition — analytical method",
          "Motion in a plane",
          "Projectile motion",
          "Uniform circular motion",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Laws of Motion",
    marks: null,
    chapters: [
      {
        n: 4,
        name: "Laws of Motion",
        topics: [
          "Intuitive concept of force",
          "Inertia and Newton's first law of motion",
          "Momentum and Newton's second law of motion",
          "Impulse",
          "Newton's third law of motion",
          "Law of conservation of linear momentum",
          "Equilibrium of concurrent forces",
          "Static and kinetic friction",
          "Laws of friction",
          "Rolling friction",
          "Dynamics of circular motion",
          "Centripetal force",
          "Banking of curves",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "Work, Energy and Power",
    marks: null,
    chapters: [
      {
        n: 5,
        name: "Work, Energy and Power",
        topics: [
          "Work done by a constant force and a variable force",
          "Kinetic energy",
          "Work-energy theorem",
          "Power",
          "Notion of potential energy",
          "Potential energy of a spring",
          "Conservative forces",
          "Non-conservative forces",
          "Conservation of mechanical energy",
          "Different forms of energy",
          "Elastic and inelastic collisions in one and two dimensions",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Motion of System of Particles and Rigid Body",
    marks: null,
    chapters: [
      {
        n: 6,
        name: "System of Particles and Rotational Motion",
        topics: [
          "Centre of mass of a two-particle system",
          "Momentum conservation and centre of mass motion",
          "Centre of mass of a rigid body",
          "Centre of mass of a uniform rod",
          "Moment of a force and torque",
          "Angular momentum",
          "Conservation of angular momentum",
          "Equilibrium of rigid bodies",
          "Moment of inertia",
          "Theorem of parallel and perpendicular axes",
          "Rolling motion",
        ],
      },
    ],
  },
  {
    numeral: "VI",
    name: "Gravitation",
    marks: null,
    chapters: [
      {
        n: 7,
        name: "Gravitation",
        topics: [
          "Kepler's laws",
          "Universal law of gravitation",
          "Acceleration due to gravity",
          "Gravitational potential energy",
          "Escape speed",
          "Orbital velocity",
          "Satellites — geostationary and polar",
        ],
      },
    ],
  },
  {
    numeral: "VII",
    name: "Properties of Bulk Matter",
    marks: null,
    chapters: [
      {
        n: 8,
        name: "Mechanical Properties of Solids",
        topics: [
          "Elastic behaviour of solids",
          "Hooke's law",
          "Stress and strain",
          "Young's modulus",
          "Bulk modulus",
          "Shear modulus",
        ],
      },
      {
        n: 9,
        name: "Mechanical Properties of Fluids",
        topics: [
          "Pressure",
          "Pascal's law",
          "Streamline flow",
          "Bernoulli's principle",
          "Viscosity",
          "Stokes' law",
          "Reynolds number",
          "Surface tension",
          "Capillarity",
        ],
      },
      {
        n: 10,
        name: "Thermal Properties of Matter",
        topics: [
          "Heat and temperature",
          "Thermal expansion of solids, liquids and gases",
          "Anomalous expansion of water",
          "Specific heat capacity",
          "Calorimetry",
          "Change of state",
          "Latent heat",
          "Heat transfer — conduction, convection and radiation",
        ],
      },
    ],
  },
  {
    numeral: "VIII",
    name: "Thermodynamics",
    marks: null,
    chapters: [
      {
        n: 11,
        name: "Thermodynamics",
        topics: [
          "Thermal equilibrium and zeroth law",
          "Heat, internal energy and work",
          "First law of thermodynamics",
          "Isothermal and adiabatic processes",
          "Specific heat capacity",
          "Second law of thermodynamics",
          "Reversible and irreversible processes",
          "Carnot engine",
          "Heat engines and refrigerators",
        ],
      },
    ],
  },
  {
    numeral: "IX",
    name: "Behaviour of Perfect Gases and Kinetic Theory of Gases",
    marks: null,
    chapters: [
      {
        n: 12,
        name: "Kinetic Theory",
        topics: [
          "Equation of state of a perfect gas",
          "Boyle's law and Charles' law",
          "Kinetic theory of an ideal gas",
          "Pressure of an ideal gas",
          "Kinetic interpretation of temperature",
          "Law of equipartition of energy",
          "Degrees of freedom",
          "RMS speed of gas molecules",
          "Mean free path",
        ],
      },
    ],
  },
  {
    numeral: "X",
    name: "Oscillations and Waves",
    marks: null,
    chapters: [
      {
        n: 13,
        name: "Oscillations",
        topics: [
          "Periodic motion and time period",
          "Frequency and angular frequency",
          "Displacement as a function of time",
          "Periodic functions",
          "Simple harmonic motion",
          "Uniform circular motion and SHM",
          "Phase",
          "Restoring force and spring-mass system",
          "Energy in SHM",
          "Free, forced and damped oscillations",
          "Resonance",
        ],
      },
      {
        n: 14,
        name: "Waves",
        topics: [
          "Wave motion",
          "Transverse and longitudinal waves",
          "Speed of a travelling wave",
          "Displacement relation for a progressive wave",
          "Principle of superposition of waves",
          "Reflection of waves",
          "Standing waves and normal modes",
          "Beats",
          "Doppler effect",
        ],
      },
    ],
  },
];

/**
 * Chemistry — 9 units, 9 chapters, 70 theory + 30 practical.
 *
 * One chapter per unit, and every source agrees on the marks. Hydrogen, States
 * of Matter, s-Block Elements and p-Block Elements are no longer examinable
 * units in the rationalised syllabus, so they are deliberately absent.
 */
const CHEMISTRY_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Some Basic Concepts of Chemistry",
    marks: 7,
    chapters: [
      {
        n: 1,
        name: "Some Basic Concepts of Chemistry",
        topics: [
          "Importance of chemistry",
          "Nature of matter",
          "Properties of matter and their measurement",
          "Uncertainty in measurement",
          "Laws of chemical combination",
          "Dalton's atomic theory",
          "Atomic and molecular masses",
          "Mole concept and molar masses",
          "Percentage composition",
          "Stoichiometry and stoichiometric calculations",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Structure of Atom",
    marks: 9,
    chapters: [
      {
        n: 2,
        name: "Structure of Atom",
        topics: [
          "Discovery of electron, proton and neutron",
          "Atomic number, isotopes and isobars",
          "Thomson's model and its limitations",
          "Rutherford's model and its limitations",
          "Developments leading to the Bohr model",
          "Bohr's model for the hydrogen atom",
          "Towards quantum mechanical model",
          "Quantum mechanical model of the atom",
          "Dual nature of matter and light",
          "de Broglie's relationship",
          "Heisenberg uncertainty principle",
          "Orbitals and quantum numbers",
          "Shapes of s, p and d orbitals",
          "Aufbau principle, Pauli exclusion principle and Hund's rule",
          "Electronic configuration of atoms",
          "Stability of half-filled and completely filled orbitals",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Classification of Elements and Periodicity in Properties",
    marks: 6,
    chapters: [
      {
        n: 3,
        name: "Classification of Elements and Periodicity in Properties",
        topics: [
          "Need for classification",
          "Genesis of periodic classification",
          "Modern periodic law and the present form of the periodic table",
          "Nomenclature of elements with atomic number greater than 100",
          "Periodic table and electronic configuration",
          "Electronic configurations in periods and groups",
          "Electronic configuration in the s, p, d and f blocks",
          "Periodic trends in physical properties",
          "Periodic trends in chemical properties",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "Chemical Bonding and Molecular Structure",
    marks: 7,
    chapters: [
      {
        n: 4,
        name: "Chemical Bonding and Molecular Structure",
        topics: [
          "Kossel–Lewis approach to chemical bonding",
          "Octet rule",
          "Lewis structures of simple molecules",
          "Limitations of the octet rule",
          "Ionic or electrovalent bond",
          "Bond parameters",
          "VSEPR theory and shapes of simple molecules",
          "Valence bond theory",
          "Hybridisation",
          "Molecular orbital theory",
          "Hydrogen bonding",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Chemical Thermodynamics",
    marks: 9,
    chapters: [
      {
        n: 5,
        name: "Chemical Thermodynamics",
        topics: [
          "System and surroundings",
          "Types of systems",
          "Work, heat and energy",
          "Extensive and intensive properties",
          "State functions",
          "First law of thermodynamics",
          "Internal energy and enthalpy",
          "Heat capacity and specific heat",
          "Measurement of ΔU and ΔH",
          "Hess's law of constant heat summation",
          "Enthalpies of bond dissociation, combustion, formation and atomisation",
          "Second law of thermodynamics",
          "Entropy and Gibbs energy change",
          "Spontaneous and non-spontaneous processes",
        ],
      },
    ],
  },
  {
    numeral: "VI",
    name: "Equilibrium",
    marks: 7,
    chapters: [
      {
        n: 6,
        name: "Equilibrium",
        topics: [
          "Dynamic nature of equilibrium",
          "Law of mass action",
          "Equilibrium constant",
          "Homogeneous and heterogeneous equilibria",
          "Applications of equilibrium constants",
          "Relationship between Kp and Kc",
          "Factors affecting equilibrium — Le Chatelier's principle",
          "Ionic equilibrium in solution",
          "Acids, bases and salts",
          "Arrhenius, Brønsted–Lowry and Lewis concepts",
          "Ionisation of acids and bases",
          "pH scale",
          "Buffer solutions",
          "Solubility product and common ion effect",
        ],
      },
    ],
  },
  {
    numeral: "VII",
    name: "Redox Reactions",
    marks: 4,
    chapters: [
      {
        n: 7,
        name: "Redox Reactions",
        topics: [
          "Classical idea of redox reactions",
          "Oxidation number",
          "Types of redox reactions",
          "Balancing of redox reactions",
          "Redox reactions as the basis for titrations",
          "Limitations of the concept of oxidation number",
        ],
      },
    ],
  },
  {
    numeral: "VIII",
    name: "Organic Chemistry: Some Basic Principles and Techniques",
    marks: 11,
    chapters: [
      {
        n: 8,
        name: "Organic Chemistry: Some Basic Principles and Techniques",
        topics: [
          "Tetravalence of carbon and shapes of organic compounds",
          "Structural representations of organic compounds",
          "Classification of organic compounds",
          "Nomenclature of organic compounds",
          "Isomerism",
          "Fundamental concepts in organic reaction mechanism",
          "Methods of purification of organic compounds",
          "Qualitative analysis of organic compounds",
          "Quantitative analysis of organic compounds",
        ],
      },
    ],
  },
  {
    numeral: "IX",
    name: "Hydrocarbons",
    marks: 10,
    chapters: [
      {
        n: 9,
        name: "Hydrocarbons",
        topics: [
          "Classification of hydrocarbons",
          "Alkanes — nomenclature, isomerism, conformation of ethane",
          "Alkanes — preparation and chemical properties",
          "Free radical mechanism of halogenation, combustion and pyrolysis",
          "Alkenes — structure of the double bond and geometrical isomerism",
          "Alkenes — preparation and addition reactions",
          "Markovnikov's addition and peroxide effect",
          "Ozonolysis and oxidation of alkenes",
          "Alkynes — structure of the triple bond and acidic character",
          "Alkynes — addition reactions",
          "Aromatic hydrocarbons and benzene",
          "Resonance and aromaticity",
          "Electrophilic substitution mechanism",
          "Directive influence of functional groups",
          "Carcinogenicity and toxicity",
        ],
      },
    ],
  },
];

/**
 * Mathematics — 5 units, 14 chapters, 80 theory + 20 internal assessment.
 *
 * CBSE states explicitly that there is no chapter-wise weightage, so marks live
 * on the unit and never on the chapter. "Principle of Mathematical Induction"
 * and "Mathematical Reasoning" are absent: they were removed by the
 * rationalisation and are no longer examinable.
 */
const MATHEMATICS_UNITS: RawUnit[] = [
  {
    numeral: "I",
    name: "Sets and Functions",
    marks: 23,
    chapters: [
      {
        n: 1,
        name: "Sets",
        topics: [
          "Sets and their representations",
          "Empty set, finite and infinite sets",
          "Equal sets and subsets",
          "Subsets of a set of real numbers, especially intervals",
          "Universal set",
          "Venn diagrams",
          "Union and intersection of sets",
          "Difference of sets",
          "Complement of a set and its properties",
          "Power set",
        ],
      },
      {
        n: 2,
        name: "Relations and Functions",
        topics: [
          "Ordered pairs",
          "Cartesian product of sets",
          "Domain, codomain and range of a relation",
          "Function as a special kind of relation",
          "Real valued functions and their graphs",
          "Algebra of functions",
        ],
      },
      {
        n: 3,
        name: "Trigonometric Functions",
        topics: [
          "Angles, degree and radian measure",
          "Relation between degree and radian",
          "Trigonometric functions and their signs",
          "Domain and range of trigonometric functions",
          "Trigonometric functions of sum and difference of two angles",
          "Trigonometric equations",
        ],
      },
    ],
  },
  {
    numeral: "II",
    name: "Algebra",
    marks: 25,
    chapters: [
      {
        n: 4,
        name: "Complex Numbers and Quadratic Equations",
        topics: [
          "Need for complex numbers",
          "Algebraic properties of complex numbers",
          "Argand plane and polar representation",
          "Modulus and argument",
          "Square root of a complex number",
          "Solution of a quadratic equation",
          "Nature of roots of a quadratic equation",
        ],
      },
      {
        n: 5,
        name: "Linear Inequalities",
        topics: [
          "Algebraic solutions of linear inequalities in one variable",
          "Representation on the number line",
          "Graphical solution of linear inequalities in two variables",
          "Solution of a system of linear inequalities",
        ],
      },
      {
        n: 6,
        name: "Permutations and Combinations",
        topics: [
          "Fundamental principle of counting",
          "Factorial n",
          "Permutations and combinations",
          "Derivation of formulae for nPr and nCr",
          "Simple applications",
        ],
      },
      {
        n: 7,
        name: "Binomial Theorem",
        topics: [
          "Historical perspective",
          "Statement and proof for positive integral indices",
          "Pascal's triangle",
          "General and middle terms",
          "Simple applications",
        ],
      },
      {
        n: 8,
        name: "Sequence and Series",
        topics: [
          "Sequence and series",
          "Arithmetic progression",
          "Arithmetic mean",
          "Geometric progression",
          "General term of a G.P.",
          "Sum of n terms of a G.P.",
          "Infinite G.P. and its sum",
          "Geometric mean",
          "Relation between A.M. and G.M.",
        ],
      },
    ],
  },
  {
    numeral: "III",
    name: "Coordinate Geometry",
    marks: 12,
    chapters: [
      {
        n: 9,
        name: "Straight Lines",
        topics: [
          "Brief recall of two-dimensional geometry",
          "Slope of a line and angle between two lines",
          "Various forms of the equation of a line",
          "Distance of a point from a line",
        ],
      },
      {
        n: 10,
        name: "Conic Sections",
        topics: [
          "Sections of a cone",
          "Circle, parabola, ellipse and hyperbola",
          "Standard equations and simple properties",
          "Degenerated conic sections",
        ],
      },
      {
        n: 11,
        name: "Introduction to Three-dimensional Geometry",
        topics: [
          "Coordinate axes and coordinate planes in three dimensions",
          "Coordinates of a point",
          "Distance between two points",
          "Section formula",
        ],
      },
    ],
  },
  {
    numeral: "IV",
    name: "Calculus",
    marks: 8,
    chapters: [
      {
        n: 12,
        name: "Limits and Derivatives",
        topics: [
          "Intuitive idea of limit",
          "Limits of polynomials and rational functions",
          "Limits of trigonometric, exponential and logarithmic functions",
          "Derivative as a rate of change",
          "Derivative as the slope of a tangent",
          "Derivative of sum, difference, product and quotient of functions",
        ],
      },
    ],
  },
  {
    numeral: "V",
    name: "Statistics and Probability",
    marks: 12,
    chapters: [
      {
        n: 13,
        name: "Statistics",
        topics: [
          "Measures of dispersion",
          "Range and mean deviation",
          "Variance and standard deviation",
          "Analysis of frequency distributions",
        ],
      },
      {
        n: 14,
        name: "Probability",
        topics: [
          "Random experiments and outcomes",
          "Sample space and events",
          "Occurrence of an event",
          "Probability of an event",
          "Probability of 'not' an event",
          "Probability of 'or' an event",
          "Mutually exclusive events",
          "Exhaustive events",
          "Axiomatic approach to probability",
        ],
      },
    ],
  },
];

export const CBSE_CLASS_11_2026_27: CurriculumMap = {
  board: "CBSE",
  classLevel: 11,
  academicYear: "2026-27",
  version: "2026-27.1",
  source: CBSE_11_2026_27_SOURCE,
  subjects: [
    buildSubject("Physics", PHYSICS_UNITS),
    buildSubject("Chemistry", CHEMISTRY_UNITS),
    buildSubject("Mathematics", MATHEMATICS_UNITS),
  ],
  note:
    "Physics unit marks are null: CBSE publishes band totals for Class XI Physics " +
    "(Units I-III = 23, IV-VI = 17, VII-IX = 20, X = 10) rather than per-unit " +
    "figures, and secondary sources that print per-unit marks disagree with each " +
    "other. Chemistry (70) and Mathematics (80) marks are recorded because every " +
    "source agrees. This is the rationalised syllabus: Chemistry is 9 units and " +
    "Mathematics carries no chapter-wise weightage, as CBSE states explicitly.",
};

// Fail loudly at import time rather than letting a broken map reach a student.
if (!assertClassLevelIsolation(CBSE_CLASS_11_2026_27, 11)) {
  throw new Error("CBSE Class XI 2026-27 map failed its class-level isolation check");
}
