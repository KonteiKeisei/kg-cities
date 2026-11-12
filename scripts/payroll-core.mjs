// Payroll: jobs, what a payday pays, when paydays fall, and the 1986 job guide. Pure: no Foundry.
//
// A job pays by the hour, the week, the year, the job, the word, or as an allowance. Its rate is
// in dollars; `units` is how many hours, jobs or words a week. A payday pays the weeks since the
// last one (7, 14 or 30 days, or any number), times what an optional payday roll gives (a die,
// plus a skill, read against bands: "2 to 5: half the hours"), plus its bonuses: on the next
// payday only, every payday, or by chance (1 in N). A bonus may be cash on the side: untaxed, to
// the wallet, whatever the job pays with. On the books, 1986 withholding comes off.

export const PAY_TYPES = {
  hourly: { label: "Hourly", unit: "hours a week", per: "hr" },
  weekly: { label: "Weekly salary", unit: "", per: "wk" },
  yearly: { label: "Yearly salary", unit: "", per: "yr" },
  piece: { label: "Per job", unit: "jobs a week", per: "job" },
  word: { label: "Per word", unit: "words a week", per: "word" },
  allowance: { label: "Allowance", unit: "", per: "wk" }
};

/** Paydays every this many days; 0 is when the GM says (Pay now). */
export const SCHEDULES = { 7: "Weekly", 14: "Biweekly", 30: "Monthly", 0: "When the GM says" };

/**
 * 1986 federal income tax for a single person (Schedule X): [taxable income from, rate]. The
 * first $2,480 is the zero bracket; the personal exemption was $1,080 (IRS, Statistics of Income,
 * Individual Income Tax Rates, 1986, which works an example through the brackets to 26%).
 */
export const FEDERAL_1986 = [[0, 0], [2480, 0.11], [3670, 0.12], [4750, 0.14], [7010, 0.15], [9170, 0.16], [11650, 0.18], [13920, 0.2], [16190, 0.23], [19640, 0.26], [25360, 0.3], [31080, 0.34], [36800, 0.38], [44780, 0.42], [59670, 0.48], [88270, 0.5]];
export const EXEMPTION_1986 = 1080;
/** Social Security and Medicare: 7.15% of wages up to $42,000 in 1986. */
export const FICA_1986 = { rate: 0.0715, base: 42000 };
/** Massachusetts: 5% of earned income over a personal exemption (about $2,200 for a single person). */
export const MASS_1986 = { rate: 0.05, exemption: 2200 };

/** A year's federal income tax on a year's wages, single, standard deduction. */
export function federalTax(annual) {
  const taxable = Math.max(0, annual - EXEMPTION_1986);
  let tax = 0;
  FEDERAL_1986.forEach(([from, rate], i) => {
    const to = FEDERAL_1986[i + 1]?.[0] ?? Infinity;
    if (taxable > from) tax += (Math.min(taxable, to) - from) * rate;
  });
  return tax;
}

/** Boston paid a little over the national figures in 1986 (the Massachusetts boom): an estimate. */
export const BOSTON = 1.1;
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAY = 86400;

export const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const dollars = (n) => `${n < 0 ? "-" : ""}$${Math.abs(cents(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** A job with every field, from any part of one. */
export function makeJob(part = {}) {
  const j = {
    id: part.id || uid(),
    title: String(part.title ?? "New job"),
    employer: String(part.employer ?? ""),
    type: PAY_TYPES[part.type] ? part.type : "hourly",
    rate: cents(part.rate ?? 0),
    units: Math.max(0, Number(part.units ?? (part.type === "hourly" || !part.type ? 40 : 1)) || 0),
    every: Math.max(0, Math.round(Number(part.every ?? 7) || 0)),
    paid: part.paid === "check" ? "check" : "cash",
    books: !!part.books,
    // Union dues, dollars a month, taken out of each check.
    dues: Math.max(0, cents(part.dues ?? 0)),
    roll: part.roll?.formula ? {
      formula: String(part.roll.formula),
      skill: String(part.roll.skill ?? ""),
      label: String(part.roll.label ?? ""),
      bands: (part.roll.bands ?? []).map((b) => ({ upTo: Math.round(Number(b.upTo) || 0), factor: Math.max(0, Number(b.factor) || 0), text: String(b.text ?? "") })).sort((a, b) => a.upTo - b.upTo)
    } : null,
    bonuses: (part.bonuses ?? []).map((b) => ({
      id: b.id || uid(), label: String(b.label ?? "Bonus"), amount: Number(b.amount) || 0, percent: !!b.percent,
      when: ["once", "every", "chance"].includes(b.when) ? b.when : "once", chance: Math.max(2, Math.round(Number(b.chance) || 6)), cash: !!b.cash
    })),
    season: part.season && Number.isInteger(part.season.from) && Number.isInteger(part.season.to) ? { from: part.season.from, to: part.season.to } : null,
    left: part.left == null || part.left === "" ? null : Math.max(0, Math.round(Number(part.left) || 0)),
    active: part.active !== false,
    next: Number.isFinite(part.next) ? part.next : null,
    note: String(part.note ?? "")
  };
  return j;
}

/** How many weeks a year a job pays: its season's, or 52. */
export function seasonWeeks(job) {
  const s = job.season;
  if (!s) return 52;
  const months = s.from <= s.to ? s.to - s.from + 1 : 12 - s.from + s.to + 1;
  return (months * 52) / 12;
}

/** What the job pays in a week before rolls and bonuses, in dollars. A yearly salary is paid over its season. */
export function weekly(job) {
  const r = Number(job.rate) || 0, u = Number(job.units) || 0;
  switch (job.type) {
    case "hourly": case "piece": case "word": return r * u;
    case "yearly": return r / seasonWeeks(job);
    default: return r;
  }
}

/** The weeks a payday covers: a "when the GM says" job pays one week. */
export const weeksOf = (job) => (job.every > 0 ? job.every / 7 : 1);
/** Paydays a year, for spreading a year's taxes over the checks. */
export const paydaysAYear = (job) => seasonWeeks(job) / weeksOf(job);

/**
 * What comes out of a check: 1986 federal and Massachusetts income tax and FICA when the job is on
 * the books, worked out on the year's pay this check stands for; union dues when it has them.
 */
export function deductions(job, gross) {
  const out = [];
  const n = paydaysAYear(job), annual = gross * n;
  if (job.books && gross > 0) {
    out.push({ key: "federal", label: "Federal income tax", amount: cents(-federalTax(annual) / n) });
    out.push({ key: "fica", label: "FICA 7.15%", amount: cents(-FICA_1986.rate * Math.min(annual, FICA_1986.base) / n) });
    out.push({ key: "state", label: "Mass. income tax 5%", amount: cents(-MASS_1986.rate * Math.max(0, annual - MASS_1986.exemption) / n) });
  }
  if (job.dues > 0 && gross > 0) out.push({ key: "dues", label: "Union dues", amount: cents(-Math.min(gross, (job.dues * 12 / 52) * weeksOf(job))) });
  return out;
}

/** "$5.00/hr × 24 hours a week", "$160,000/yr", "25¢/word × 1,200 words a week". */
export function describeRate(job) {
  const t = PAY_TYPES[job.type];
  const rate = job.type === "word" && job.rate < 1 ? `${Math.round(job.rate * 100)}¢` : dollars(job.rate).replace(/\.00$/, job.type === "hourly" ? ".00" : "");
  return t.unit ? `${rate}/${t.per} × ${Number(job.units).toLocaleString("en-US")} ${t.unit}` : `${rate}/${t.per}`;
}

/** The band a roll lands in: the first whose upTo it does not pass (the last when it passes all). */
export function pickBand(bands, total) {
  if (!bands?.length) return null;
  return bands.find((b) => total <= b.upTo) ?? bands.at(-1);
}

/** Is the month (0 to 11) in the job's season? A season may run over the new year (October to April). */
export function inSeason(job, month) {
  const s = job.season;
  if (!s || !Number.isInteger(month)) return true;
  return s.from <= s.to ? month >= s.from && month <= s.to : month >= s.from || month <= s.to;
}

/**
 * One payday: { base, factor, band, gross, lines, taxes, withheld, cash, net, total, used }.
 * roll: the payday roll's total (null when the job has none). chance(n): true one time in n
 * (Math.random by default). lines: what the check says (base, roll, bonuses); cash: bonuses paid
 * on the side; used: the ids of "once" bonuses this payday spent.
 */
export function computePay(job, { roll = null, chance = (n) => Math.random() * n < 1 } = {}) {
  const base = cents(weekly(job) * weeksOf(job));
  const band = job.roll && roll != null ? pickBand(job.roll.bands, roll) : null;
  const factor = band ? band.factor : 1;
  const lines = [{ label: describeRate(job), amount: base }];
  let gross = cents(base * factor);
  if (band && factor !== 1) lines.push({ label: band.text || `Roll ${roll}`, amount: cents(gross - base) });
  const cash = [], used = [], hits = [];
  for (const b of job.bonuses) {
    if (b.when === "chance" && !chance(b.chance)) continue;
    if (b.when === "once") used.push(b.id);
    if (b.when === "chance") hits.push(b.id);
    const amount = cents(b.percent ? (gross * b.amount) / 100 : b.amount);
    if (b.cash) cash.push({ label: b.label, amount });
    else { lines.push({ label: b.label, amount }); gross = cents(gross + amount); }
  }
  gross = Math.max(0, gross);
  const taxes = deductions(job, gross);
  const withheld = cents(taxes.reduce((s, t) => s + t.amount, 0));
  const net = cents(gross + withheld);
  const cashTotal = cents(Math.max(0, cash.reduce((s, c) => s + c.amount, 0)));
  return { base, factor, band, roll, gross, lines, taxes, withheld, net, cash, cashTotal, total: cents(net + cashTotal), used, hits };
}

/**
 * The paydays due by `now` (world seconds), at most `max`: { times, next }. A job without a next
 * payday, paused, paid when the GM says, or with no paydays left has none.
 */
export function dueTimes(job, now, max = 60) {
  const times = [];
  if (!job.active || !(job.every > 0) || !Number.isFinite(job.next) || job.left === 0) return { times, next: job.next };
  let t = job.next;
  const step = job.every * DAY;
  while (t <= now && times.length < max && (job.left == null || times.length < job.left)) { times.push(t); t += step; }
  // Very far behind: skip to the first payday after now, the rest unpaid.
  if (t <= now) t += Math.ceil((now - t + 1) / step) * step;
  return { times, next: t };
}

/* ---------------------------------------- */
/*  The 1986 guide                            */
/* ---------------------------------------- */

/**
 * Median usual weekly earnings of full-time wage and salary workers, US, 1986 annual averages:
 * Bureau of Labor Statistics, "Weekly earnings in 1986: a look at more than 200 occupations",
 * Monthly Labor Review, June 1987, table 1. [title, dollars a week, the survey's own name]
 */
export const GUIDE = {
  "Blue collar": [
    ["Garbage collector", 286, "Garbage collectors"], ["Auto mechanic", 324, "Automobile mechanics"], ["Truck or bus mechanic", 402, "Bus, truck, and stationary engine mechanics"],
    ["Auto body repairman", 354, "Automobile body and related repairers"], ["Aircraft mechanic", 505, "Aircraft engine mechanics"], ["Heavy equipment mechanic", 438, "Heavy equipment mechanics"],
    ["Small engine repairman", 301, "Small engine repairers"], ["Heavy truck driver", 371, "Truckdrivers, heavy"], ["Delivery driver", 281, "Truckdrivers, light"],
    ["Route salesman (driver)", 395, "Drivers-salesworkers"], ["Bus driver", 327, "Bus drivers"], ["Taxi driver or chauffeur", 272, "Taxicab drivers and chauffeurs"],
    ["Construction laborer", 287, "Construction laborers"], ["Carpenter", 348, "Carpenters"], ["Electrician", 473, "Electricians"], ["Plumber or pipefitter", 470, "Plumbers, pipefitters, steamfitters"],
    ["House painter", 299, "Painters, construction and maintenance"], ["Roofer", 303, "Roofers"], ["Bricklayer or stonemason", 412, "Brickmasons and stonemasons"],
    ["Ironworker", 467, "Structural metalworkers"], ["Welder", 376, "Welders and cutters"], ["Machinist", 419, "Machinists"], ["Tool and die maker", 506, "Tool and die makers"],
    ["Crane operator", 459, "Crane and tower operators"], ["Forklift operator", 325, "Industrial truck and tractor equipment operators"],
    ["Freight handler or longshoreman", 263, "Freight, stock, and material handlers"], ["Warehouse laborer", 283, "Laborers, except construction"],
    ["Gas station attendant", 200, "Garage and service station related occupations"], ["Car washer", 215, "Vehicle washers and equipment cleaners"],
    ["Telephone installer", 568, "Telephone installers and repairers"], ["Heating and air conditioning mechanic", 390, "Heating, air conditioning, and refrigeration mechanics"],
    ["Butcher", 299, "Butchers and meatcutters"], ["Baker", 292, "Bakers"], ["Printing press operator", 366, "Printing machine operators"],
    ["Factory assembler", 299, "Assemblers"], ["Sewing machine operator", 179, "Textile sewing machine operators"], ["Dry cleaner", 194, "Laundering and dry cleaning machine operators"],
    ["Railroad engineer", 625, "Locomotive operating occupations"], ["Sailor or deckhand", 547, "Water transportation occupations"], ["Groundskeeper", 222, "Groundskeepers and gardeners"],
    ["Farm hand", 192, "Farm workers"]
  ],
  Service: [
    ["Police officer", 478, "Police and detectives, public service"], ["Police sergeant or detective", 558, "Supervisors, police and detectives"],
    ["Firefighter", 464, "Firefighting occupations"], ["Corrections officer", 362, "Correctional institution officers"], ["Sheriff's deputy or bailiff", 401, "Sheriffs, bailiffs, and other law enforcement officers"],
    ["Security guard", 266, "Guards and police, except public service"], ["Bartender", 214, "Bartenders"], ["Waiter or waitress (before tips)", 172, "Waiters and waitresses"],
    ["Cook", 196, "Cooks, except short order"], ["Kitchen worker or dishwasher", 166, "Kitchen workers, food preparation"], ["Busboy", 164, "Waiters'/waitresses' assistants"],
    ["Restaurant manager", 238, "Supervisors, food preparation and service"], ["Janitor", 247, "Janitors and cleaners"], ["Hotel maid", 189, "Maids and housemen"],
    ["Hairdresser", 208, "Hairdressers and cosmetologists"], ["Nursing aide or orderly", 206, "Nursing aides, orderlies, and attendants"], ["Dental assistant", 243, "Dental assistants"],
    ["Daycare worker", 182, "Child care workers, except private household"], ["Babysitter or nanny", 91, "Child care workers, private household"],
    ["House cleaner", 147, "Private household cleaners and servants"], ["Amusement park attendant", 234, "Attendants, amusement and recreation facilities"]
  ],
  "Office and sales": [
    ["Secretary", 288, "Secretaries"], ["Typist", 276, "Typists"], ["Receptionist", 242, "Receptionists"], ["File clerk", 239, "File clerks"], ["Bookkeeper", 287, "Bookkeepers, accounting and auditing clerks"],
    ["Bank teller", 231, "Bank tellers"], ["Telephone operator", 315, "Telephone operators"], ["Mail carrier", 477, "Mail carriers, postal service"], ["Postal clerk", 479, "Postal clerks"],
    ["Messenger or courier", 271, "Messengers"], ["Dispatcher", 347, "Dispatchers"], ["Shipping clerk", 297, "Traffic, shipping, and receiving clerks"], ["Bill collector", 284, "Bill and account collectors"],
    ["Private investigator", 323, "Investigators and adjusters, except insurance"], ["Insurance investigator", 356, "Insurance adjusters, examiners, and investigators"],
    ["Hotel desk clerk", 214, "Hotel clerks"], ["Airline ticket agent", 420, "Transportation ticket and reservation agents"], ["Computer operator", 318, "Computer operators"],
    ["Data entry clerk", 277, "Data-entry keyers"], ["Office manager", 404, "Supervisors, general office"], ["Cashier", 181, "Cashiers"], ["Clothing salesclerk", 192, "Salesworkers, apparel"],
    ["Stereo and TV salesman", 304, "Salesworkers, radio, television, hi-fi, and appliances"], ["Hardware store clerk", 267, "Salesworkers, hardware and building supplies"],
    ["Car salesman", 424, "Salesworkers, motor vehicles and boats"], ["Door-to-door salesman", 343, "Street and door-to-door salesworkers"], ["Store manager", 392, "Supervisors, sales"],
    ["Insurance agent", 418, "Insurance sales"], ["Real estate agent", 457, "Real estate sales"], ["Stockbroker", 608, "Securities and financial services sales"],
    ["Advertising salesman", 454, "Advertising and related sales"], ["Computer programmer", 519, "Computer programmers"], ["Paralegal", 372, "Legal assistants"],
    ["Draftsman", 412, "Drafting occupations"], ["Airline pilot", 754, "Airplane pilots and navigators"]
  ],
  Professional: [
    ["Editor or reporter", 425, "Editors and reporters"], ["Photographer", 392, "Photographers"], ["Public relations man", 518, "Public relations specialists"], ["Designer", 490, "Designers"],
    ["Actor or director", 423, "Actors and directors"], ["Artist", 385, "Painters, sculptors, craft artists"], ["Lawyer", 767, "Lawyers"], ["Physician (salaried)", 653, "Physicians"],
    ["Registered nurse", 460, "Registered nurses"], ["Pharmacist", 607, "Pharmacists"], ["Licensed practical nurse", 300, "Licensed practical nurses"], ["X-ray technician", 383, "Radiologic technicians"],
    ["Engineer", 682, "Engineers"], ["Architect", 577, "Architects"], ["Chemist", 601, "Chemists, except biochemists"], ["Accountant", 478, "Accountants and auditors"],
    ["Financial manager", 584, "Financial managers"], ["Marketing or advertising manager", 680, "Managers, marketing, advertising, and public relations"],
    ["Property manager", 375, "Managers, properties and real estate"], ["City or state official", 513, "Administrators and officials, public administration"],
    ["Professor", 600, "Teachers, college and university"], ["High school teacher", 481, "Teachers, secondary school"], ["Grade school teacher", 422, "Teachers, elementary school"],
    ["Librarian", 423, "Librarians"], ["Social worker", 399, "Social workers"], ["Clergyman", 396, "Clergy"], ["Psychologist", 491, "Psychologists"], ["Economist", 704, "Economists"]
  ]
};
/** Every full-time worker's median in 1986 (the same table). */
export const MEDIAN_1986 = 358;
/** Massachusetts' minimum wage from January 1, 1986 (the federal one was $3.35). */
export const MIN_WAGE_MA = 3.55;

/** Ready-made jobs the survey has no line for: game estimates, rolls and all. */
export const PRESETS = [
  { title: "NHL player, league average", employer: "Boston Bruins", type: "yearly", rate: 160000, every: 14, paid: "check", books: true, season: { from: 9, to: 3 },
    bonuses: [], note: "A 1987 Sport magazine survey put the NHL's average at about $160,000 and its minimum at $25,000. Paid in season, October to April." },
  { title: "NHL player, league minimum", employer: "Boston Bruins", type: "yearly", rate: 25000, every: 14, paid: "check", books: true, season: { from: 9, to: 3 } },
  { title: "Cash work, no papers", employer: "Whoever is hiring", type: "hourly", rate: 5, units: 24, every: 7, paid: "cash", books: false,
    roll: { formula: "2d6", label: "Work found this week", bands: [{ upTo: 5, factor: 0.5, text: "Little work this week" }, { upTo: 10, factor: 1, text: "Steady work" }, { upTo: 12, factor: 1.5, text: "Plenty of work" }] },
    bonuses: [{ label: "Stiffed by a boss", amount: -100, percent: true, when: "chance", chance: 6 }], note: "No papers: no benefits, no check, nothing withheld." },
  { title: "Bouncer, cash", employer: "A bar", type: "piece", rate: 50, units: 3, every: 7, paid: "cash", books: false, note: "$50 a night, three nights a week." },
  { title: "Newspaper stringer", employer: "The Globe", type: "word", rate: 0.25, units: 1200, every: 14, paid: "check", books: false,
    roll: { formula: "1d20", skill: "inv", label: "How badly the editor wants it", bands: [{ upTo: 5, factor: 0, text: "Spiked" }, { upTo: 11, factor: 0.32, text: "Inside pages, 8¢ a word" }, { upTo: 16, factor: 0.6, text: "Metro front, 15¢ a word" }, { upTo: 99, factor: 1, text: "Page one, 25¢ a word" }] },
    note: "Freelance: paid by the word, by where the story runs. Nothing withheld (a 1099)." },
  { title: "Allowance from mom", employer: "Mom", type: "allowance", rate: 40, every: 7, paid: "cash", books: false,
    roll: { formula: "1d6", label: "Mom's mood", bands: [{ upTo: 2, factor: 0.5, text: "Disappointed: half, and a lecture" }, { upTo: 5, factor: 1, text: "A normal week" }, { upTo: 6, factor: 1.5, text: "Good mood: extra for the movies" }] } },
  { title: "Minimum wage, Massachusetts", employer: "", type: "hourly", rate: MIN_WAGE_MA, units: 40, every: 7, paid: "check", books: true }
];

/**
 * The guide's jobs that were mostly union in 1980s Boston (city workers, the trades, the docks,
 * transit, the post office, schools, the phone company). Their dues are an estimate: about two
 * hours' pay a month, the usual rule of thumb.
 */
export const UNION = new Set([
  "Garbage collector", "Truck or bus mechanic", "Heavy truck driver", "Bus driver", "Construction laborer", "Carpenter", "Electrician", "Plumber or pipefitter",
  "House painter", "Roofer", "Bricklayer or stonemason", "Ironworker", "Welder", "Machinist", "Tool and die maker", "Crane operator", "Freight handler or longshoreman",
  "Telephone installer", "Telephone operator", "Printing press operator", "Railroad engineer", "Sailor or deckhand", "Butcher", "Factory assembler", "Sewing machine operator",
  "Police officer", "Police sergeant or detective", "Firefighter", "Corrections officer", "Mail carrier", "Postal clerk", "High school teacher", "Grade school teacher", "Hotel maid"
]);

/** A job from a guide line: hourly at its weekly median over 40 hours, Boston's when asked. */
export function guideJob([title, week], { boston = true } = {}) {
  const w = week * (boston ? BOSTON : 1), hourly = cents(w / 40);
  return makeJob({ title, type: "hourly", rate: hourly, units: 40, every: 7, paid: "check", books: true, dues: UNION.has(title) ? Math.round(hourly * 2) : 0 });
}

/* ---------------------------------------- */
/*  Living costs                              */
/* ---------------------------------------- */

/**
 * A one-bedroom's rent a month in 1986, by neighbourhood: estimates (no survey of the year by
 * neighbourhood was found), from Boston's boom-time market, where the Back Bay cost about twice
 * Dorchester. Owning: a mortgage at 1986's 10% or so on the neighbourhood's going price, taxes in.
 */
export const NEIGHBORHOODS = {
  backbay: { name: "Back Bay", rent: 850 }, beaconhill: { name: "Beacon Hill", rent: 800 }, downtown: { name: "Downtown and Chinatown", rent: 650 },
  southend: { name: "South End", rent: 650 }, northend: { name: "North End", rent: 550 }, charlestown: { name: "Charlestown", rent: 600 },
  fenway: { name: "Fenway and Kenmore", rent: 550 }, allston: { name: "Allston and Brighton", rent: 500 }, jp: { name: "Jamaica Plain", rent: 450 },
  southie: { name: "South Boston", rent: 425 }, dorchester: { name: "Dorchester", rent: 400 }, eastie: { name: "East Boston", rent: 375 },
  roxbury: { name: "Roxbury", rent: 325 }, mattapan: { name: "Mattapan", rent: 350 }, roslindale: { name: "Roslindale and West Roxbury", rent: 450 },
  hydepark: { name: "Hyde Park", rent: 425 }, cambridge: { name: "Cambridge", rent: 650 }, somerville: { name: "Somerville", rent: 450 },
  brookline: { name: "Brookline", rent: 700 }, quincy: { name: "Quincy", rent: 450 }
};
/** Where a character lives, and what it costs a month: rent, a mortgage (rent × MORTGAGE), owned outright, with family, or nowhere. */
export const HOUSING = {
  rent: { label: "Rents", factor: 1, utilities: 90 },
  mortgage: { label: "Owns, with a mortgage", factor: 2.2, utilities: 140 },
  owned: { label: "Owns outright (property tax)", factor: 0.35, utilities: 140 },
  family: { label: "Lives with family (they pay)", factor: 0, utilities: 0 },
  none: { label: "No fixed address", factor: 0, utilities: 0 }
};
/**
 * Vehicles: insurance a year and gas a week in city driving. Gas averaged about 85¢ a gallon in
 * 1986 (the oil glut); a car of the day did about 16 mpg in town, 150 miles a week is about 9
 * gallons. Massachusetts insurance (compulsory, state-set rates, Boston's the dearest) is an
 * estimate.
 */
export const VEHICLES = {
  none: { label: "No vehicle", insurance: 0, gas: 0 },
  car: { label: "Car", insurance: 750, gas: 8 },
  truck: { label: "Pickup or van", insurance: 800, gas: 11 },
  motorcycle: { label: "Motorcycle", insurance: 350, gas: 3 },
  oldcar: { label: "Old beater (liability only)", insurance: 400, gas: 10 }
};
/**
 * Groceries a week for one adult, by the USDA's four food plans: their late-1990s costs for a man
 * of 20 to 50, brought back to 1986 by the food-at-home price index (an estimate).
 */
export const FOOD = {
  thrifty: { label: "Thrifty", weekly: 18 }, low: { label: "Low-cost", weekly: 24 },
  moderate: { label: "Moderate", weekly: 30 }, liberal: { label: "Liberal", weekly: 36 }
};

/** A character's household with every field. */
export function makeHome(part = {}) {
  return {
    dependant: !!part.dependant,
    housing: HOUSING[part.housing] ? part.housing : "rent",
    hood: NEIGHBORHOODS[part.hood] ? part.hood : "dorchester",
    housingCost: part.housingCost == null || part.housingCost === "" ? null : Math.max(0, cents(part.housingCost)),
    utilities: part.utilities == null || part.utilities === "" ? null : Math.max(0, cents(part.utilities)),
    vehicle: VEHICLES[part.vehicle] ? part.vehicle : "none",
    insurance: part.insurance == null || part.insurance === "" ? null : Math.max(0, cents(part.insurance)),
    gas: part.gas == null || part.gas === "" ? null : Math.max(0, cents(part.gas)),
    food: FOOD[part.food] ? part.food : "low",
    people: Math.max(1, Math.round(Number(part.people) || 1)),
    extras: (part.extras ?? []).map((x) => ({ id: x.id || uid(), label: String(x.label ?? "Bill"), amount: Math.max(0, cents(x.amount)), monthly: x.monthly !== false })),
    on: !!part.on,
    next: Number.isFinite(part.next) ? part.next : null,
    rentNext: Number.isFinite(part.rentNext) ? part.rentNext : null,
    owed: Math.max(0, cents(part.owed ?? 0))
  };
}

/**
 * A household's bills: { weekly: [{ label, amount }], monthly: [...], perWeek }. A dependant pays
 * no rent, utilities or groceries (someone else does); a vehicle's insurance and gas are theirs.
 */
export function homeBills(home) {
  const h = makeHome(home), weekly = [], monthly = [];
  const kind = h.dependant ? HOUSING.family : HOUSING[h.housing];
  const housing = h.housingCost ?? Math.round(NEIGHBORHOODS[h.hood].rent * kind.factor);
  const utilities = h.utilities ?? kind.utilities;
  if (housing > 0) monthly.push({ key: "housing", label: h.housing === "rent" ? `Rent, ${NEIGHBORHOODS[h.hood].name}` : h.housing === "mortgage" ? `Mortgage, ${NEIGHBORHOODS[h.hood].name}` : "Property tax", amount: housing });
  if (utilities > 0 && !h.dependant) monthly.push({ key: "utilities", label: "Heat, lights and phone", amount: utilities });
  if (!h.dependant) weekly.push({ key: "food", label: `Groceries (${FOOD[h.food].label.toLowerCase()}${h.people > 1 ? `, ${h.people} people` : ""})`, amount: FOOD[h.food].weekly * h.people });
  const v = VEHICLES[h.vehicle];
  if (h.vehicle !== "none") {
    weekly.push({ key: "gas", label: `Gas, city driving (${v.label.toLowerCase()})`, amount: h.gas ?? v.gas });
    monthly.push({ key: "insurance", label: `${v.label} insurance`, amount: cents((h.insurance ?? v.insurance) / 12) });
  }
  for (const x of h.extras) (x.monthly ? monthly : weekly).push({ key: x.id, label: x.label, amount: x.amount });
  const perWeek = cents(weekly.reduce((s, b) => s + b.amount, 0) + monthly.reduce((s, b) => s + b.amount, 0) * 12 / 52);
  return { weekly, monthly, perWeek };
}

/** What a character takes home in an average week from their jobs, after deductions, cash on the side not counted. */
export function weeklyTakeHome(jobs) {
  return cents(jobs.filter((j) => j.active).reduce((s, j) => {
    const p = computePay(j, { chance: () => false });
    return s + (p.net * seasonWeeks(j)) / 52 / weeksOf(j);
  }, 0));
}

/** The bill days due by `now`: { weeks: [t], months: [t], next, rentNext }. */
export function billsDue(home, now, max = 60) {
  const h = makeHome(home), weeks = [], months = [];
  if (!h.on) return { weeks, months, next: h.next, rentNext: h.rentNext };
  let t = h.next ?? now + 7 * DAY, m = h.rentNext ?? now + 30 * DAY;
  while (t <= now && weeks.length < max) { weeks.push(t); t += 7 * DAY; }
  while (m <= now && months.length < max) { months.push(m); m += 30 * DAY; }
  if (t <= now) t += Math.ceil((now - t + 1) / (7 * DAY)) * 7 * DAY;
  if (m <= now) m += Math.ceil((now - m + 1) / (30 * DAY)) * 30 * DAY;
  return { weeks, months, next: t, rentNext: m };
}

/** Every guide line and preset matching a search, for the job guide's list. */
export function searchGuide(q = "") {
  const s = q.trim().toLowerCase();
  const out = [];
  for (const [cat, list] of Object.entries(GUIDE)) for (const g of list) if (!s || g[0].toLowerCase().includes(s) || g[2].toLowerCase().includes(s)) out.push({ cat, line: g });
  return out;
}
