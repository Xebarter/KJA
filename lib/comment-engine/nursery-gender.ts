/** Gender / pronoun slots for report-card comments (nursery + primary). */

export type NurseryGenderSlots = {
  known: boolean;
  girl_boy: string;
  she_he: string;
  her_his: string;
  She_He: string;
  Her_His: string;
};

export type CommentGenderOptions = {
  /** Word used when sex is unknown. Nursery: "child"; primary: "learner". */
  unknownChildWord?: string;
  /** When sex is unknown: empty pronouns (nursery) or they/their (primary). */
  unknownPronouns?: "empty" | "they";
};

/** Map students.sex (`M`/`F`) to comment placeholders. */
export function commentGenderSlots(
  sex: string | null | undefined,
  options: CommentGenderOptions = {},
): NurseryGenderSlots {
  const unknownChild = options.unknownChildWord ?? "child";
  const unknownPronouns = options.unknownPronouns ?? "empty";
  const code = (sex || "").trim().toUpperCase();
  if (code === "F" || code === "FEMALE" || code === "GIRL") {
    return {
      known: true,
      girl_boy: "girl",
      she_he: "she",
      her_his: "her",
      She_He: "She",
      Her_His: "Her",
    };
  }
  if (code === "M" || code === "MALE" || code === "BOY") {
    return {
      known: true,
      girl_boy: "boy",
      she_he: "he",
      her_his: "his",
      She_He: "He",
      Her_His: "His",
    };
  }
  if (unknownPronouns === "they") {
    return {
      known: false,
      girl_boy: unknownChild,
      she_he: "they",
      her_his: "their",
      She_He: "They",
      Her_His: "Their",
    };
  }
  return {
    known: false,
    girl_boy: unknownChild,
    she_he: "",
    her_his: "",
    She_He: "",
    Her_His: "",
  };
}

/** Nursery default: unknown → "child" and empty pronouns (name-led sentences). */
export function nurseryGenderSlots(sex: string | null | undefined): NurseryGenderSlots {
  return commentGenderSlots(sex, { unknownChildWord: "child", unknownPronouns: "empty" });
}

/** Primary default: unknown → "learner" and they/their so desk templates always render. */
export function primaryGenderSlots(sex: string | null | undefined): NurseryGenderSlots {
  return commentGenderSlots(sex, { unknownChildWord: "learner", unknownPronouns: "they" });
}
