/** Gender / pronoun slots for nursery class-teacher comments. */

export type NurseryGenderSlots = {
  known: boolean;
  girl_boy: string;
  she_he: string;
  her_his: string;
  She_He: string;
  Her_His: string;
};

/** Map students.sex (`M`/`F`) to comment placeholders. Unknown → neutral "child", empty pronouns. */
export function nurseryGenderSlots(sex: string | null | undefined): NurseryGenderSlots {
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
  return {
    known: false,
    girl_boy: "child",
    she_he: "",
    her_his: "",
    She_He: "",
    Her_His: "",
  };
}
