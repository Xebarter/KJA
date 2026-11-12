/** Developmental profile for nursery class-teacher comments from progress codes. */

export type NurserySkillLineInput = {
  skill_id: string;
  domain_id: string | null;
  domain_name: string;
  skill_description: string;
  progress_code: string | null;
  progress_label: string | null;
  domain_sort?: number;
  skill_sort?: number;
};

export type NurseryTier = "mastery" | "solid" | "growing" | "developing" | "support" | "skip";

export type NurseryTone = "mastery" | "solid" | "mixed" | "growing" | "support" | "incomplete";

export type NurseryNamedSkill = {
  skillId: string;
  label: string;
  description: string;
  domainName: string;
  code: string;
  tier: Exclude<NurseryTier, "skip">;
};

export type NurseryDomainSummary = {
  domainId: string;
  domainName: string;
  rated: number;
  mastery: number;
  solid: number;
  growing: number;
  developing: number;
  support: number;
  strengthScore: number;
  supportScore: number;
};

export type NurseryTraits = {
  socialWarmth: boolean;
  likesTeachers: boolean;
  enjoysRhymes: boolean;
  talksEasily: boolean;
  likesBooks: boolean;
  /** Functional/living: names mother/father. */
  namesParents: boolean;
  /** Functional/living: can give a parent/family phone contact. */
  knowsPhone: boolean;
};

export type NurseryDevProfile = {
  totalSkills: number;
  ratedSkills: number;
  skippedSkills: number;
  gapSkills: number;
  complete: boolean;
  tone: NurseryTone;
  counts: Record<Exclude<NurseryTier, "skip">, number>;
  outstandingSkills: NurseryNamedSkill[];
  focusSkills: NurseryNamedSkill[];
  growingSkills: NurseryNamedSkill[];
  strongDomains: NurseryDomainSummary[];
  focusDomains: NurseryDomainSummary[];
  domains: NurseryDomainSummary[];
  traits: NurseryTraits;
  highlightPhrases: string[];
  focusPhrases: string[];
};

const SKIP = new Set(["NA", "NT"]);

/** Catalogue description (normalised) → short parent-facing phrase. */
const PARENT_PHRASE_BY_KEY: Record<string, string> = {
  "gets along with other children": "playing with classmates",
  "plays with other children": "playing with friends",
  "likes teachers": "getting on with teachers",
  "enters into conversation with other children": "chatting with classmates",
  "enters into conversation with adults": "talking with teachers",
  "shares with others": "sharing with others",
  "talks easily": "talking freely",
  "meets visitors without shyness": "greeting visitors confidently",
  "likes singing": "singing",
  "recalls songs, chants and rhymes with ease": "Nursery rhymes and songs",
  "follows action songs": "action songs",
  "enjoys listening to music": "listening to music",
  "gets involved in dancing": "dancing",
  "can perform in front of an audience": "performing for others",
  "claps hands in a set rhythm": "keeping a rhythm",
  "likes to look at picture books": "picture books",
  "likes to pretend to read books": "pretend reading",
  "likes to pretend to write": "pretend writing",
  "listens to short stories and answers questions": "story time",
  "can tell a simple story from interpreting the pictures": "telling stories from pictures",
  "follows simple instructions": "following instructions",
  "counts by rote to 10": "counting to ten",
  "recognizes numbers up to 5": "recognising numbers",
  "counts objects up to 5 and writes/traces the number": "counting objects",
  "holds writing implements like crayons, painting brushes": "holding crayons and brushes",
  "colours within a shape": "colouring carefully",
  "paints and colours within a given picture": "painting and colouring",
  "balances on one foot for 5 seconds": "balancing",
  "hops on spot": "hopping",
  "feels good about self": "feeling confident",
  "listens attentively": "listening carefully",
  "is helpful in class i.e. puts away toys": "helping tidy up",
  "is able to stay on a task": "staying on a task",
  "is able to work independently": "working independently",
  // Functional / living skills — keep as gerunds so stems read naturally
  "recites full name": "saying a full name",
  "tells his/her gender": "saying boy or girl",
  "tells his/her likes & dislikes": "talking about likes and dislikes",
  "tells his/her likes and dislikes": "talking about likes and dislikes",
  "knows area of residence": "talking about home",
  "asks and answers questions": "asking and answering questions",
  "names parents": "naming parents",
  "gives parents phone contact": "sharing the family phone number",
  "gives parents' phone contact": "sharing the family phone number",
  "knows parents phone contact": "sharing the family phone number",
  "knows parents' phone contact": "sharing the family phone number",
  "gives parents phone number": "sharing the family phone number",
};

const DOMAIN_PHRASE: Record<string, string> = {
  "personal & social development": "getting on with others",
  "functional / living skills": "everyday living skills",
  "writing skills": "writing",
  "language skills": "language",
  "maths skills": "maths",
  "physical and motor skills": "physical play",
  "creative art": "creative art",
  music: "music",
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^can\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
}

function normalizeCode(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase();
}

export function nurseryTierForCode(raw: string | null | undefined): NurseryTier {
  const code = normalizeCode(raw);
  if (!code || SKIP.has(code)) return "skip";
  if (code === "M") return "mastery";
  if (code === "S") return "solid";
  if (code === "P" || code === "I" || code === "+/-" || code === "+/−" || code === "±") return "growing";
  if (code === "D") return "developing";
  if (code === "NP" || code === "A") return "support";
  // Numeric or unknown letters: treat as developing if present
  if (/^\d+(\.\d+)?$/.test(code)) return "developing";
  return "growing";
}

/** Turn a leading finite verb into a gerund so list phrases fit stems. */
function toGerundPhrase(raw: string): string {
  const words = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return raw;
  const verb = words[0];
  const rest = words.slice(1).join(" ");
  const irregular: Record<string, string> = {
    is: "being",
    has: "having",
    does: "doing",
    goes: "going",
    names: "naming",
    gives: "giving",
    tells: "telling",
    knows: "knowing",
    asks: "asking",
    answers: "answering",
    recites: "reciting",
    writes: "writing",
    holds: "holding",
    follows: "following",
    counts: "counting",
    hops: "hopping",
    shares: "sharing",
    plays: "playing",
    likes: "liking",
    listens: "listening",
    meets: "meeting",
    feels: "feeling",
    paints: "painting",
    colours: "colouring",
    colors: "coloring",
    balances: "balancing",
    claps: "clapping",
    enters: "entering",
  };
  let gerund = irregular[verb];
  if (!gerund && /ies$/.test(verb) && verb.length > 3) {
    gerund = `${verb.slice(0, -3)}ying`;
  } else if (!gerund && /[^aeiou][aeiou][^aeiou]$/.test(verb) && !/([aeiou])\1/.test(verb.slice(-2))) {
    // hop → hopping; skip for longer verbs like "color"
    if (verb.length <= 4) gerund = `${verb}${verb.slice(-1)}ing`;
  } else if (!gerund && /e$/.test(verb) && verb.length > 2) {
    gerund = `${verb.slice(0, -1)}ing`;
  } else if (!gerund && /s$/.test(verb) && !/ss$/.test(verb) && verb.length > 2) {
    gerund = `${verb.slice(0, -1)}ing`;
  }
  if (!gerund) return raw.trim().toLowerCase();
  return rest ? `${gerund} ${rest}` : gerund;
}

/** Short parent-facing skill label from a catalogue description. */
export function shortNurserySkillLabel(description: string, maxWords = 6): string {
  const mapped = parentPhraseForSkill(description);
  if (mapped && mapped !== description.trim().toLowerCase()) return mapped;
  const cleaned = description
    .trim()
    .replace(/^can\s+/i, "")
    .replace(/^is\s+able\s+to\s+/i, "")
    .replace(/^shows?\s+/i, "")
    .replace(/[.!?].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "this skill";
  const gerund = toGerundPhrase(cleaned);
  const words = gerund.split(" ");
  if (words.length <= maxWords) return gerund;
  return `${words.slice(0, maxWords).join(" ")}`;
}

/** Curated parent phrase when known; otherwise null (caller may fall back). */
export function parentPhraseForSkill(description: string): string | null {
  const key = normalizeKey(description);
  if (PARENT_PHRASE_BY_KEY[key]) return PARENT_PHRASE_BY_KEY[key];
  // Loose keyword matches for rhymes / social catalogue variants
  if (/rhyme|chant/.test(key) && /song|recall|ease/.test(key)) return "Nursery rhymes and songs";
  if (/gets along/.test(key) && /children|friend|classmate/.test(key)) return "playing with classmates";
  if (/likes\s+teachers/.test(key)) return "getting on with teachers";
  if (/likes\s+singing/.test(key)) return "singing";
  if (/names?\s+parents?/.test(key)) return "naming parents";
  if (/phone/.test(key) && /parent|family|home/.test(key)) return "sharing the family phone number";
  if (/recites?\s+(full\s+)?name/.test(key)) return "saying a full name";
  if (/area of residence|where\s+.+\s+lives|home address/.test(key)) return "talking about home";
  return null;
}

export function friendlyDomainName(domainName: string): string {
  const key = domainName.trim().toLowerCase();
  return DOMAIN_PHRASE[key] || domainName.trim().toLowerCase();
}

function skillMatches(description: string, ...needles: RegExp[]): boolean {
  const key = normalizeKey(description);
  return needles.some((needle) => needle.test(key));
}

function emptyTraits(): NurseryTraits {
  return {
    socialWarmth: false,
    likesTeachers: false,
    enjoysRhymes: false,
    talksEasily: false,
    likesBooks: false,
    namesParents: false,
    knowsPhone: false,
  };
}

function traitsFromSkills(skills: NurseryNamedSkill[]): NurseryTraits {
  const traits = emptyTraits();
  for (const skill of skills) {
    const desc = skill.description;
    if (skillMatches(desc, /gets along/, /plays with other/, /shares with/, /conversation with other children/)) {
      traits.socialWarmth = true;
    }
    if (skillMatches(desc, /likes teachers/, /conversation with adults/)) {
      traits.likesTeachers = true;
    }
    if (skillMatches(desc, /rhyme|chant/, /likes singing/, /action songs/, /listening to music/)) {
      traits.enjoysRhymes = true;
    }
    if (skillMatches(desc, /talks easily/)) {
      traits.talksEasily = true;
    }
    if (skillMatches(desc, /picture books/, /pretend to read/)) {
      traits.likesBooks = true;
    }
    if (skillMatches(desc, /names?\s+parents?/)) {
      traits.namesParents = true;
    }
    if (skillMatches(desc, /phone/) && skillMatches(desc, /parent|family|home|contact|number/)) {
      traits.knowsPhone = true;
    }
  }
  return traits;
}

function domainKey(line: NurserySkillLineInput) {
  return line.domain_id || line.domain_name || "domain";
}

function namedFromLine(line: NurserySkillLineInput, tier: Exclude<NurseryTier, "skip">, code: string): NurseryNamedSkill {
  return {
    skillId: line.skill_id,
    label: shortNurserySkillLabel(line.skill_description),
    description: line.skill_description,
    domainName: line.domain_name || "Learning area",
    code,
    tier,
  };
}

export function buildNurseryDevProfile(skillLines: NurserySkillLineInput[]): NurseryDevProfile {
  const ordered = [...skillLines].sort(
    (a, b) =>
      (a.domain_sort ?? 0) - (b.domain_sort ?? 0) ||
      (a.skill_sort ?? 0) - (b.skill_sort ?? 0) ||
      a.skill_description.localeCompare(b.skill_description),
  );

  const counts: NurseryDevProfile["counts"] = {
    mastery: 0,
    solid: 0,
    growing: 0,
    developing: 0,
    support: 0,
  };
  const outstandingSkills: NurseryNamedSkill[] = [];
  const focusSkills: NurseryNamedSkill[] = [];
  const growingSkills: NurseryNamedSkill[] = [];
  const solidPool: NurseryNamedSkill[] = [];
  const domainMap = new Map<string, NurseryDomainSummary>();

  let skippedSkills = 0;
  let gapSkills = 0;
  let ratedSkills = 0;

  for (const line of ordered) {
    const code = normalizeCode(line.progress_code);
    const tier = nurseryTierForCode(code);
    const key = domainKey(line);
    let domain = domainMap.get(key);
    if (!domain) {
      domain = {
        domainId: key,
        domainName: line.domain_name || "Learning area",
        rated: 0,
        mastery: 0,
        solid: 0,
        growing: 0,
        developing: 0,
        support: 0,
        strengthScore: 0,
        supportScore: 0,
      };
      domainMap.set(key, domain);
    }

    if (tier === "skip") {
      if (!code) gapSkills += 1;
      else skippedSkills += 1;
      continue;
    }

    ratedSkills += 1;
    domain.rated += 1;
    counts[tier] += 1;
    domain[tier] += 1;

    const named = namedFromLine(line, tier, code);

    if (tier === "mastery") outstandingSkills.push(named);
    else if (tier === "solid") solidPool.push(named);
    if (tier === "support" || tier === "developing") focusSkills.push(named);
    if (tier === "growing") growingSkills.push(named);
  }

  // Prefer M for outstanding; if few, add solid S skills
  for (const skill of solidPool) {
    if (outstandingSkills.length >= 3) break;
    if (outstandingSkills.some((row) => row.skillId === skill.skillId)) continue;
    outstandingSkills.push(skill);
  }

  // Focus order: support first, then developing
  focusSkills.sort((a, b) => {
    const rank = (tier: NurseryNamedSkill["tier"]) => (tier === "support" ? 0 : 1);
    return rank(a.tier) - rank(b.tier) || a.label.localeCompare(b.label);
  });

  const domains = [...domainMap.values()].map((domain) => {
    domain.strengthScore = domain.mastery * 3 + domain.solid * 2 + domain.growing;
    domain.supportScore = domain.support * 3 + domain.developing * 2;
    return domain;
  });

  const strongDomains = [...domains]
    .filter((domain) => domain.rated > 0 && domain.strengthScore > 0)
    .sort((a, b) => b.strengthScore - a.strengthScore || a.domainName.localeCompare(b.domainName));

  const focusDomains = [...domains]
    .filter((domain) => domain.support + domain.developing > 0)
    .sort((a, b) => b.supportScore - a.supportScore || a.domainName.localeCompare(b.domainName));

  const totalSkills = ordered.length;
  const narrativePool = ratedSkills;
  const complete = totalSkills > 0 && gapSkills === 0 && ratedSkills + skippedSkills === totalSkills && ratedSkills > 0;

  let tone: NurseryTone = "incomplete";
  if (narrativePool === 0) {
    tone = "incomplete";
  } else {
    const masteryShare = counts.mastery / narrativePool;
    const solidShare = (counts.mastery + counts.solid) / narrativePool;
    const supportShare = counts.support / narrativePool;
    const growingShare = counts.growing / narrativePool;
    if (supportShare >= 0.35 || counts.support >= 3) tone = "support";
    else if (masteryShare >= 0.45 && counts.support === 0) tone = "mastery";
    else if (solidShare >= 0.55 && counts.support <= 1) tone = "solid";
    else if (growingShare >= 0.4 && supportShare < 0.25) tone = "growing";
    else if (counts.mastery > 0 && (counts.support > 0 || counts.developing > 0)) tone = "mixed";
    else if (counts.support > 0 || counts.developing > counts.solid) tone = "support";
    else tone = "mixed";
  }

  if (gapSkills > Math.max(2, Math.floor(totalSkills * 0.35))) tone = "incomplete";

  const outstandingSlice = outstandingSkills.slice(0, 5);
  const focusSlice = focusSkills.slice(0, 5);
  const traits = traitsFromSkills(outstandingSlice);

  const uniquePhrases = (skills: NurseryNamedSkill[], max: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const skill of skills) {
      const phrase = skill.label.trim();
      if (!phrase || seen.has(phrase.toLowerCase())) continue;
      seen.add(phrase.toLowerCase());
      out.push(phrase);
      if (out.length >= max) break;
    }
    return out;
  };

  return {
    totalSkills,
    ratedSkills,
    skippedSkills,
    gapSkills,
    complete: complete && tone !== "incomplete",
    tone,
    counts,
    outstandingSkills: outstandingSlice,
    focusSkills: focusSlice,
    growingSkills: growingSkills.slice(0, 5),
    strongDomains: strongDomains.slice(0, 3),
    focusDomains: focusDomains.slice(0, 3),
    domains,
    traits,
    highlightPhrases: uniquePhrases(outstandingSlice, 3),
    focusPhrases: uniquePhrases(focusSlice, 2),
  };
}
