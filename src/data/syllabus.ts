export interface SyllabusTopic {
  id: string;
  name: string;
  subtopics?: string[];
  jeeWeightage?: number; // approximate % based on historical papers (0-100)
  boardMarks?: number; // CBSE 2026-27 unit weightage
}

export interface SyllabusChapter {
  id: string;
  chapterNumber: number;
  name: string;
  subject: "Physics" | "Chemistry" | "Mathematics";
  classLevel: 11 | 12;
  topics: SyllabusTopic[];
  unitName: string;
  jeeImportant?: boolean;
}

export interface SyllabusSubject {
  name: "Physics" | "Chemistry" | "Mathematics";
  chapters: SyllabusChapter[];
  totalTopics: number;
}

export interface SyllabusDataset {
  exam: string;
  academicYear: string;
  source: string;
  sourceType: "official_pdf" | "nta_bulletin" | "cbse_curriculum";
  sourceUrl: string;
  fetchedAt: string;
  verificationStatus: "verified" | "provisional";
  subjects: SyllabusSubject[];
}

export const JEE_MAIN_2026_SYLLABUS: SyllabusDataset = {
  exam: "JEE (Main) 2026",
  academicYear: "2025-26",
  source: "National Testing Agency (NTA) Information Bulletin & Rationalized Syllabus",
  sourceType: "nta_bulletin",
  sourceUrl: "https://jeemain.nta.nic.in",
  fetchedAt: "2026-01-15T00:00:00Z",
  verificationStatus: "verified",
  subjects: [
    {
      name: "Physics",
      totalTopics: 58,
      chapters: [
        {
          id: "phy-11-units-measurements",
          chapterNumber: 1,
          name: "Units and Measurements",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit I: Physical World and Measurement",
          topics: [
            {
              id: "phy-11-units-1",
              name: "SI Units, Fundamental and Derived units",
              jeeWeightage: 3,
            },
            {
              id: "phy-11-units-2",
              name: "Dimensional Analysis and its applications",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-units-3",
              name: "Errors in measurement and Significant figures",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "phy-11-kinematics",
          chapterNumber: 2,
          name: "Kinematics (Motion in a Straight Line & Plane)",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit II: Kinematics",
          jeeImportant: true,
          topics: [
            {
              id: "phy-11-kin-1",
              name: "Frame of reference, Motion in a straight line, Position-time graphs",
              jeeWeightage: 3,
            },
            {
              id: "phy-11-kin-2",
              name: "Uniformly accelerated motion, Velocity-time relations",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-kin-3",
              name: "Vectors, Relative Velocity, Projectile Motion",
              jeeWeightage: 6,
            },
            { id: "phy-11-kin-4", name: "Uniform Circular Motion", jeeWeightage: 4 },
          ],
        },
        {
          id: "phy-11-laws-motion",
          chapterNumber: 3,
          name: "Laws of Motion",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit III: Laws of Motion",
          jeeImportant: true,
          topics: [
            {
              id: "phy-11-lom-1",
              name: "Newton's laws of motion, Inertia, Momentum, Impulse",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-lom-2",
              name: "Law of conservation of linear momentum and applications",
              jeeWeightage: 5,
            },
            {
              id: "phy-11-lom-3",
              name: "Static and Kinetic friction, Laws of friction, Rolling friction",
              jeeWeightage: 5,
            },
            {
              id: "phy-11-lom-4",
              name: "Dynamics of uniform circular motion, Centripetal force",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "phy-11-work-energy-power",
          chapterNumber: 4,
          name: "Work, Energy and Power",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit IV: Work, Energy and Power",
          jeeImportant: true,
          topics: [
            {
              id: "phy-11-wep-1",
              name: "Work done by a constant and variable force, Kinetic and Potential energy",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-wep-2",
              name: "Work-Energy Theorem, Conservative and Non-conservative forces",
              jeeWeightage: 5,
            },
            {
              id: "phy-11-wep-3",
              name: "Potential energy of a spring, Conservation of mechanical energy",
              jeeWeightage: 5,
            },
            {
              id: "phy-11-wep-4",
              name: "Collisions in 1D and 2D, Elastic and Inelastic collisions",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "phy-11-rotational-motion",
          chapterNumber: 5,
          name: "Rotational Motion",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit V: System of Particles and Rotational Motion",
          jeeImportant: true,
          topics: [
            {
              id: "phy-11-rot-1",
              name: "Centre of mass of a two-particle system, Rigid body COM",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-rot-2",
              name: "Moment of a force, Torque, Angular momentum and its conservation",
              jeeWeightage: 6,
            },
            {
              id: "phy-11-rot-3",
              name: "Moment of inertia, Radius of gyration, Parallel & Perpendicular axis theorems",
              jeeWeightage: 7,
            },
            {
              id: "phy-11-rot-4",
              name: "Rotational Kinematics and Dynamics of Rolling Motion",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "phy-11-gravitation",
          chapterNumber: 6,
          name: "Gravitation",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit VI: Gravitation",
          topics: [
            {
              id: "phy-11-grav-1",
              name: "Universal law of gravitation, Acceleration due to gravity (g)",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-grav-2",
              name: "Gravitational potential energy and gravitational potential",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-grav-3",
              name: "Escape velocity, Orbital velocity of a satellite, Kepler's laws",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "phy-11-properties-matter",
          chapterNumber: 7,
          name: "Mechanical Properties of Solids & Fluids",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit VII: Properties of Bulk Matter",
          topics: [
            {
              id: "phy-11-bulk-1",
              name: "Elastic behavior, Stress-strain relationship, Hooke's law, Moduli of elasticity",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-bulk-2",
              name: "Pressure in fluids, Pascal's law, Archimedes' principle",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-bulk-3",
              name: "Viscosity, Stokes' law, Terminal velocity, Streamline and Turbulent flow",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-bulk-4",
              name: "Bernoulli's theorem and applications, Surface tension and Capillarity",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "phy-11-thermodynamics",
          chapterNumber: 8,
          name: "Thermodynamics & Kinetic Theory",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit VIII & IX: Thermodynamics & Kinetic Theory of Gases",
          jeeImportant: true,
          topics: [
            {
              id: "phy-11-th-1",
              name: "Thermal equilibrium, Zeroth, First and Second laws of thermodynamics",
              jeeWeightage: 6,
            },
            {
              id: "phy-11-th-2",
              name: "Isothermal, Adiabatic, Isobaric and Isochoric processes",
              jeeWeightage: 6,
            },
            {
              id: "phy-11-th-3",
              name: "Equation of state of a perfect gas, Kinetic interpretation of temperature, Degrees of freedom",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "phy-11-oscillations-waves",
          chapterNumber: 9,
          name: "Oscillations and Waves",
          subject: "Physics",
          classLevel: 11,
          unitName: "Unit X: Oscillations and Waves",
          topics: [
            {
              id: "phy-11-osc-1",
              name: "Simple Harmonic Motion (SHM), Kinetic and Potential energy in SHM",
              jeeWeightage: 5,
            },
            { id: "phy-11-osc-2", name: "Simple pendulum, Spring mass systems", jeeWeightage: 4 },
            {
              id: "phy-11-osc-3",
              name: "Wave motion, Longitudinal and Transverse waves, Speed of wave motion",
              jeeWeightage: 4,
            },
            {
              id: "phy-11-osc-4",
              name: "Superposition of waves, Standing waves, Resonance, Beats",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "phy-12-electrostatics",
          chapterNumber: 10,
          name: "Electrostatics & Capacitance",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit I: Electrostatics",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-el-1",
              name: "Coulomb's law, Electric field, Electric dipole and torque",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-el-2",
              name: "Gauss's law and its applications to field calculation",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-el-3",
              name: "Electric potential and potential difference, Equipotential surfaces",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-el-4",
              name: "Capacitors and Capacitance, Combination of capacitors, Dielectrics and Energy stored",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "phy-12-current-electricity",
          chapterNumber: 11,
          name: "Current Electricity",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit II: Current Electricity",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-curr-1",
              name: "Ohm's law, Drift velocity, Resistivity and Conductivity",
              jeeWeightage: 4,
            },
            {
              id: "phy-12-curr-2",
              name: "Kirchhoff's rules, Wheatstone bridge and meter bridge",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-curr-3",
              name: "Potentiometer principle and comparisons, Electric power and heating",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "phy-12-magnetic-effects",
          chapterNumber: 12,
          name: "Magnetic Effects of Current and Magnetism",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit III: Magnetic Effects of Current and Magnetism",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-mag-1",
              name: "Biot-Savart law and Ampere's circuital law",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-mag-2",
              name: "Force on moving charge and current carrying conductor, Galvanometer",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-mag-3",
              name: "Magnetic dipole, Earth's magnetic field, Diamagnetic, Paramagnetic and Ferromagnetic materials",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "phy-12-emi-ac",
          chapterNumber: 13,
          name: "Electromagnetic Induction and Alternating Currents",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit IV: Electromagnetic Induction and Alternating Currents",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-emi-1",
              name: "Faraday's laws, Lenz's law, Motional EMF, Self and Mutual inductance",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-emi-2",
              name: "Alternating currents, Peak and RMS value, Reactance and Impedance",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-emi-3",
              name: "LCR series circuit, Resonance, Power in AC circuits, Wattless current, Transformer",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "phy-12-em-waves-optics",
          chapterNumber: 14,
          name: "Electromagnetic Waves & Ray/Wave Optics",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit V & VI: EM Waves & Optics",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-opt-1",
              name: "Electromagnetic spectrum, Displacement current",
              jeeWeightage: 3,
            },
            {
              id: "phy-12-opt-2",
              name: "Reflection, Refraction, Total internal reflection, Lenses and Prisms",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-opt-3",
              name: "Optical instruments: Microscope and Astronomical Telescope",
              jeeWeightage: 4,
            },
            {
              id: "phy-12-opt-4",
              name: "Wavefront and Huygens' principle, Interference, Young's double slit experiment",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-opt-5",
              name: "Diffraction due to single slit, Resolving power and Polarization",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "phy-12-modern-physics",
          chapterNumber: 15,
          name: "Dual Nature, Atoms, Nuclei & Semiconductor Devices",
          subject: "Physics",
          classLevel: 12,
          unitName: "Unit VII, VIII & IX: Modern Physics & Electronic Devices",
          jeeImportant: true,
          topics: [
            {
              id: "phy-12-mod-1",
              name: "Photoelectric effect, Einstein's equation, de Broglie wavelength",
              jeeWeightage: 6,
            },
            {
              id: "phy-12-mod-2",
              name: "Bohr model, Hydrogen spectrum, Energy levels",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-mod-3",
              name: "Nuclear composition, Mass defect, Binding energy, Radioactivity",
              jeeWeightage: 5,
            },
            {
              id: "phy-12-mod-4",
              name: "Semiconductors, p-n junction diode, I-V characteristics, Zener diode, Logic gates",
              jeeWeightage: 6,
            },
          ],
        },
      ],
    },
    {
      name: "Chemistry",
      totalTopics: 62,
      chapters: [
        {
          id: "chem-11-mole-concept",
          chapterNumber: 1,
          name: "Some Basic Concepts of Chemistry (Mole Concept)",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit I: Some Basic Concepts in Chemistry",
          topics: [
            {
              id: "chem-11-mole-1",
              name: "Mole concept, Molar mass, Percentage composition, Empirical formula",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-mole-2",
              name: "Stoichiometry and calculations, Limiting reagent, Concentration terms",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "chem-11-atomic-structure",
          chapterNumber: 2,
          name: "Structure of Atom",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit II: Structure of Atom",
          jeeImportant: true,
          topics: [
            {
              id: "chem-11-atom-1",
              name: "Bohr model, de Broglie relation, Heisenberg uncertainty principle",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-atom-2",
              name: "Quantum numbers, Shapes of s, p and d orbitals, Aufbau, Pauli & Hund's rule",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "chem-11-chemical-bonding",
          chapterNumber: 3,
          name: "Chemical Bonding and Molecular Structure",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit III: Chemical Bonding and Molecular Structure",
          jeeImportant: true,
          topics: [
            {
              id: "chem-11-bond-1",
              name: "Ionic and Covalent bonding, Dipole moment, VSEPR theory",
              jeeWeightage: 6,
            },
            {
              id: "chem-11-bond-2",
              name: "Valence Bond Theory, Hybridization of atomic orbitals",
              jeeWeightage: 6,
            },
            {
              id: "chem-11-bond-3",
              name: "Molecular Orbital Theory (homonuclear diatomic molecules), Hydrogen bonding",
              jeeWeightage: 7,
            },
          ],
        },
        {
          id: "chem-11-thermodynamics",
          chapterNumber: 4,
          name: "Chemical Thermodynamics",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit IV: Chemical Thermodynamics",
          jeeImportant: true,
          topics: [
            {
              id: "chem-11-th-1",
              name: "First law of thermodynamics, Internal energy, Enthalpy (H), Heat capacity",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-th-2",
              name: "Hess's law, Enthalpies of bond dissociation, combustion, formation",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-th-3",
              name: "Second law of thermodynamics, Entropy (S), Gibbs free energy (G), Spontaneity",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "chem-11-equilibrium",
          chapterNumber: 5,
          name: "Equilibrium (Chemical & Ionic)",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit V: Equilibrium",
          jeeImportant: true,
          topics: [
            {
              id: "chem-11-eq-1",
              name: "Law of chemical equilibrium, Kc, Kp, Le Chatelier's principle",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-eq-2",
              name: "Arrhenius, Bronsted-Lowry & Lewis concepts, pH scale, Buffer solutions",
              jeeWeightage: 6,
            },
            {
              id: "chem-11-eq-3",
              name: "Solubility product (Ksp), Common ion effect, Hydrolysis of salts",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "chem-11-redox",
          chapterNumber: 6,
          name: "Redox Reactions",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit VI: Redox Reactions",
          topics: [
            {
              id: "chem-11-redox-1",
              name: "Oxidation numbers, Balancing redox reactions (ion-electron and oxidation number method)",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "chem-11-periodic-table",
          chapterNumber: 7,
          name: "Classification of Elements and Periodicity in Properties",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit VII: Periodic Properties",
          topics: [
            {
              id: "chem-11-per-1",
              name: "Periodic trends in properties: Atomic radii, Ionization enthalpy, Electron gain enthalpy, Electronegativity",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "chem-11-p-block",
          chapterNumber: 8,
          name: "p-Block Elements (Group 13 to 18 basics)",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit VIII: p-Block Elements",
          topics: [
            {
              id: "chem-11-pblock-1",
              name: "Electronic configuration, General trends in physical and chemical properties of groups 13-18",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "chem-11-organic-basics",
          chapterNumber: 9,
          name: "General Organic Chemistry (GOC & Hydrocarbons)",
          subject: "Chemistry",
          classLevel: 11,
          unitName: "Unit IX: Organic Chemistry Basics & Hydrocarbons",
          jeeImportant: true,
          topics: [
            {
              id: "chem-11-goc-1",
              name: "IUPAC nomenclature of organic compounds, Isomerism (structural and stereo)",
              jeeWeightage: 5,
            },
            {
              id: "chem-11-goc-2",
              name: "Inductive effect, Electromeric effect, Resonance, Hyperconjugation",
              jeeWeightage: 6,
            },
            {
              id: "chem-11-goc-3",
              name: "Carbocations, Carbanions, Free radicals stability and reaction intermediates",
              jeeWeightage: 6,
            },
            {
              id: "chem-11-goc-4",
              name: "Alkanes, Alkenes, Alkynes and Aromatic hydrocarbons (Benzene, electrophilic substitution)",
              jeeWeightage: 7,
            },
          ],
        },
        {
          id: "chem-12-solutions",
          chapterNumber: 10,
          name: "Solutions",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit I: Solutions",
          jeeImportant: true,
          topics: [
            {
              id: "chem-12-sol-1",
              name: "Raoult's law, Ideal and Non-ideal solutions, Azeotropes",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-sol-2",
              name: "Colligative properties: Relative lowering of vapor pressure, Elevation in boiling point, Depression in freezing point, Osmotic pressure",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-sol-3",
              name: "van 't Hoff factor and abnormal molar masses",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "chem-12-electrochemistry",
          chapterNumber: 11,
          name: "Electrochemistry",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit II: Electrochemistry",
          jeeImportant: true,
          topics: [
            {
              id: "chem-12-el-1",
              name: "Electrochemical cells, Nernst equation and its applications",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-el-2",
              name: "Conductance in electrolytic solutions, Kohlrausch's law",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-el-3",
              name: "Electrolysis, Faraday's laws, Commercial batteries and Fuel cells",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "chem-12-chemical-kinetics",
          chapterNumber: 12,
          name: "Chemical Kinetics",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit III: Chemical Kinetics",
          jeeImportant: true,
          topics: [
            {
              id: "chem-12-kin-1",
              name: "Rate of reaction, Factors affecting rate, Order and Molecularity",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-kin-2",
              name: "Integrated rate equations for zero and first order reactions, Half-life",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-kin-3",
              name: "Arrhenius equation, Activation energy, Collision theory",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "chem-12-d-f-block",
          chapterNumber: 13,
          name: "d- and f-Block Elements & Coordination Compounds",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit IV & V: Transition Elements & Coordination Compounds",
          jeeImportant: true,
          topics: [
            {
              id: "chem-12-df-1",
              name: "General trends in 3d transition series, Oxidation states, Color, Catalytic properties",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-df-2",
              name: "Lanthanoids and Actinoids, Lanthanoid contraction",
              jeeWeightage: 4,
            },
            {
              id: "chem-12-df-3",
              name: "Coordination compounds: IUPAC nomenclature, Werner's theory, Isomerism",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-df-4",
              name: "Valence Bond Theory, Crystal Field Theory (CFT), Magnetic properties",
              jeeWeightage: 7,
            },
          ],
        },
        {
          id: "chem-12-organic-functional-groups",
          chapterNumber: 14,
          name: "Organic Compounds with Functional Groups",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit VI, VII, VIII: Haloalkanes, Alcohols, Aldehydes, Ketones, Amines",
          jeeImportant: true,
          topics: [
            {
              id: "chem-12-org-1",
              name: "Haloalkanes and Haloarenes: SN1 and SN2 mechanism, Optical activity",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-org-2",
              name: "Alcohols, Phenols and Ethers: Preparation, Properties, Acidity of phenols",
              jeeWeightage: 6,
            },
            {
              id: "chem-12-org-3",
              name: "Aldehydes and Ketones: Nucleophilic addition, Aldol condensation, Cannizzaro reaction",
              jeeWeightage: 7,
            },
            {
              id: "chem-12-org-4",
              name: "Carboxylic Acids and Derivatives, Acid strength",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-org-5",
              name: "Amines and Diazonium salts: Basic strength, Coupling reactions",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "chem-12-biomolecules",
          chapterNumber: 15,
          name: "Biomolecules & Principles of Practical Chemistry",
          subject: "Chemistry",
          classLevel: 12,
          unitName: "Unit IX & X: Biomolecules & Practical Chemistry",
          topics: [
            {
              id: "chem-12-bio-1",
              name: "Carbohydrates, Amino acids, Peptides, Proteins structure, Nucleic acids, Vitamins",
              jeeWeightage: 5,
            },
            {
              id: "chem-12-bio-2",
              name: "Principles related to practical chemistry: Salt analysis, Functional group tests",
              jeeWeightage: 5,
            },
          ],
        },
      ],
    },
    {
      name: "Mathematics",
      totalTopics: 60,
      chapters: [
        {
          id: "math-11-sets-relations",
          chapterNumber: 1,
          name: "Sets, Relations and Functions",
          subject: "Mathematics",
          classLevel: 11,
          unitName: "Unit I: Sets, Relations and Functions",
          topics: [
            {
              id: "math-11-set-1",
              name: "Sets and representation, Union, Intersection, Complement",
              jeeWeightage: 3,
            },
            {
              id: "math-11-set-2",
              name: "Cartesian product, Relations (reflexive, symmetric, transitive, equivalence)",
              jeeWeightage: 4,
            },
            {
              id: "math-11-set-3",
              name: "Functions (one-one, onto, composition, inverse, domain and range)",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-11-complex-quadratic",
          chapterNumber: 2,
          name: "Complex Numbers and Quadratic Equations",
          subject: "Mathematics",
          classLevel: 11,
          unitName: "Unit II: Complex Numbers and Quadratic Equations",
          jeeImportant: true,
          topics: [
            {
              id: "math-11-cx-1",
              name: "Complex numbers as ordered pairs, Modulus, Argument, Conjugate, Polar form",
              jeeWeightage: 5,
            },
            {
              id: "math-11-cx-2",
              name: "Triangle inequality, Geometry of complex numbers",
              jeeWeightage: 5,
            },
            {
              id: "math-11-cx-3",
              name: "Quadratic equations, Relation between roots and coefficients, Nature of roots, Location of roots",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "math-11-matrices-determinants",
          chapterNumber: 3,
          name: "Matrices and Determinants",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit III: Matrices and Determinants",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-mat-1",
              name: "Matrices, Types, Operations, Transpose, Symmetric & Skew symmetric matrices",
              jeeWeightage: 5,
            },
            {
              id: "math-12-mat-2",
              name: "Determinants, Properties, Adjoint and Inverse of a matrix",
              jeeWeightage: 6,
            },
            {
              id: "math-12-mat-3",
              name: "System of linear equations, Cramer's rule, Matrix inversion method, Consistency",
              jeeWeightage: 7,
            },
          ],
        },
        {
          id: "math-11-permutations-combinations",
          chapterNumber: 4,
          name: "Permutations, Combinations & Binomial Theorem",
          subject: "Mathematics",
          classLevel: 11,
          unitName: "Unit IV & V: PnC and Binomial Theorem",
          jeeImportant: true,
          topics: [
            {
              id: "math-11-pnc-1",
              name: "Fundamental principle of counting, Permutations and Combinations formulae and meaning",
              jeeWeightage: 6,
            },
            {
              id: "math-11-pnc-2",
              name: "Binomial theorem for a positive integral index, General and Middle terms",
              jeeWeightage: 5,
            },
            {
              id: "math-11-pnc-3",
              name: "Binomial coefficients and properties, Simple applications",
              jeeWeightage: 5,
            },
          ],
        },
        {
          id: "math-11-sequences-series",
          chapterNumber: 5,
          name: "Sequence and Series",
          subject: "Mathematics",
          classLevel: 11,
          unitName: "Unit VI: Sequence and Series",
          jeeImportant: true,
          topics: [
            {
              id: "math-11-seq-1",
              name: "Arithmetic Progression (AP) and Geometric Progression (GP)",
              jeeWeightage: 5,
            },
            { id: "math-11-seq-2", name: "AM, GM, Relation between AM and GM", jeeWeightage: 5 },
            {
              id: "math-11-seq-3",
              name: "Sum to n terms of special series (Arithmetico-Geometric Progression AGP, Telescoping series)",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-12-differential-calculus",
          chapterNumber: 6,
          name: "Limits, Continuity, Differentiability & Derivatives",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit VII: Limit, Continuity and Differentiability",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-lim-1",
              name: "Limits of algebraic, trigonometric, exponential and logarithmic functions, L'Hopital's rule",
              jeeWeightage: 5,
            },
            {
              id: "math-12-lim-2",
              name: "Continuity of functions, Types of discontinuity",
              jeeWeightage: 4,
            },
            {
              id: "math-12-lim-3",
              name: "Differentiability, Derivative of composite, implicit, inverse trig, parametric functions",
              jeeWeightage: 5,
            },
            {
              id: "math-12-lim-4",
              name: "Rolle's and Lagrange's Mean Value Theorems",
              jeeWeightage: 4,
            },
          ],
        },
        {
          id: "math-12-applications-derivatives",
          chapterNumber: 7,
          name: "Applications of Derivatives",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit VIII: Applications of Derivatives",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-aod-1",
              name: "Rate of change of quantities, Tangents and Normals",
              jeeWeightage: 4,
            },
            {
              id: "math-12-aod-2",
              name: "Monotonicity: Increasing and Decreasing functions",
              jeeWeightage: 5,
            },
            {
              id: "math-12-aod-3",
              name: "Maxima and Minima, First and Second derivative tests, Word problems",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-12-integral-calculus",
          chapterNumber: 8,
          name: "Integral Calculus (Indefinite & Definite Integrals)",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit IX: Integral Calculus",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-int-1",
              name: "Integration by substitution, by parts and by partial fractions",
              jeeWeightage: 5,
            },
            {
              id: "math-12-int-2",
              name: "Fundamental Theorem of Calculus, Properties of Definite Integrals",
              jeeWeightage: 7,
            },
            {
              id: "math-12-int-3",
              name: "Leibniz rule of differentiation under integral sign, Definite integral as limit of sum",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-12-differential-equations",
          chapterNumber: 9,
          name: "Differential Equations & Area under Curves",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit X: Differential Equations & Area",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-de-1",
              name: "Area bounded by simple curves (lines, circles, parabolas, ellipses)",
              jeeWeightage: 6,
            },
            {
              id: "math-12-de-2",
              name: "Order and Degree of differential equations, Variable separable method",
              jeeWeightage: 4,
            },
            {
              id: "math-12-de-3",
              name: "Homogeneous differential equations and Linear differential equations (dy/dx + Py = Q)",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-11-coordinate-geometry",
          chapterNumber: 10,
          name: "Coordinate Geometry (Straight Lines, Circles & Conic Sections)",
          subject: "Mathematics",
          classLevel: 11,
          unitName: "Unit XI: Coordinate Geometry",
          jeeImportant: true,
          topics: [
            {
              id: "math-11-cg-1",
              name: "Straight lines: Slope, Intercept, Normal form, Angle between lines, Distance from point",
              jeeWeightage: 5,
            },
            {
              id: "math-11-cg-2",
              name: "Circle: Standard and general equation, Tangent, Normal, Chord, Power of point",
              jeeWeightage: 6,
            },
            {
              id: "math-11-cg-3",
              name: "Parabola: Standard equations, Focal chord, Tangent and normal",
              jeeWeightage: 5,
            },
            {
              id: "math-11-cg-4",
              name: "Ellipse and Hyperbola: Eccentricity, Directrices, Foci, Tangents and normals, Asymptotes",
              jeeWeightage: 7,
            },
          ],
        },
        {
          id: "math-12-vector-3d",
          chapterNumber: 11,
          name: "Vector Algebra and 3D Geometry",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit XII: Vector Algebra & 3D Geometry",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-vec-1",
              name: "Vectors, Dot product, Cross product, Scalar triple product",
              jeeWeightage: 6,
            },
            {
              id: "math-12-vec-2",
              name: "Direction cosines and direction ratios of a line",
              jeeWeightage: 4,
            },
            {
              id: "math-12-vec-3",
              name: "Equation of a line in space, Shortest distance between two skew lines",
              jeeWeightage: 7,
            },
            {
              id: "math-12-vec-4",
              name: "Equation of planes, Angle between line and plane, Intersection of planes",
              jeeWeightage: 6,
            },
          ],
        },
        {
          id: "math-12-probability-statistics",
          chapterNumber: 12,
          name: "Statistics and Probability",
          subject: "Mathematics",
          classLevel: 12,
          unitName: "Unit XIII & XIV: Statistics and Probability",
          jeeImportant: true,
          topics: [
            {
              id: "math-12-prob-1",
              name: "Measures of dispersion: Mean deviation, Variance and Standard deviation of grouped/ungrouped data",
              jeeWeightage: 5,
            },
            {
              id: "math-12-prob-2",
              name: "Probability of an event, Conditional probability, Multiplication theorem",
              jeeWeightage: 5,
            },
            {
              id: "math-12-prob-3",
              name: "Bayes' theorem, Probability distribution of random variable, Bernoulli trials",
              jeeWeightage: 6,
            },
          ],
        },
      ],
    },
  ],
};
