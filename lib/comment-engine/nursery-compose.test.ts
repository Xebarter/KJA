import { describe, expect, it } from "vitest";
import {
  buildNurseryDevProfile,
  nurseryTierForCode,
  parentPhraseForSkill,
  shortNurserySkillLabel,
} from "./nursery-analyse";
import { composeNurseryClassTeacherComment } from "./nursery-compose";
import { nurseryClassTeacherTemplates } from "./nursery-defaults";
import { nurseryGenderSlots } from "./nursery-gender";
import { countSentences, containsFirstName } from "./validate";

function line(
  partial: Partial<{
    skill_id: string;
    domain_id: string;
    domain_name: string;
    skill_description: string;
    progress_code: string | null;
  }>,
) {
  const domainName = partial.domain_name || "Language";
  return {
    skill_id: partial.skill_id || "s1",
    domain_id: partial.domain_id || domainName,
    domain_name: domainName,
    skill_description: partial.skill_description || "Can hold a conversation",
    progress_code: partial.progress_code === undefined ? "M" : partial.progress_code,
    progress_label: null,
    domain_sort: 1,
    skill_sort: 1,
  };
}

describe("nurseryTierForCode", () => {
  it("maps progress codes into narrative tiers", () => {
    expect(nurseryTierForCode("M")).toBe("mastery");
    expect(nurseryTierForCode("S")).toBe("solid");
    expect(nurseryTierForCode("P")).toBe("growing");
    expect(nurseryTierForCode("I")).toBe("growing");
    expect(nurseryTierForCode("+/-")).toBe("growing");
    expect(nurseryTierForCode("D")).toBe("developing");
    expect(nurseryTierForCode("NP")).toBe("support");
    expect(nurseryTierForCode("A")).toBe("support");
    expect(nurseryTierForCode("NA")).toBe("skip");
    expect(nurseryTierForCode("NT")).toBe("skip");
    expect(nurseryTierForCode("")).toBe("skip");
    expect(nurseryTierForCode(null)).toBe("skip");
  });
});

describe("shortNurserySkillLabel", () => {
  it("shortens catalogue wording for parents", () => {
    expect(shortNurserySkillLabel("Can hold a pencil correctly with a tripod grip")).toContain("hold");
    expect(shortNurserySkillLabel("Can hold a pencil correctly with a tripod grip").split(" ").length).toBeLessThanOrEqual(5);
  });

  it("uses curated parent phrases for known skills", () => {
    expect(parentPhraseForSkill("Recalls songs, chants and rhymes with ease")).toBe("Nursery rhymes and songs");
    expect(shortNurserySkillLabel("Gets along with other children")).toBe("playing with classmates");
  });
});

describe("nurseryGenderSlots", () => {
  it("maps F/M and falls back to child", () => {
    expect(nurseryGenderSlots("F").girl_boy).toBe("girl");
    expect(nurseryGenderSlots("M").her_his).toBe("his");
    expect(nurseryGenderSlots(null).known).toBe(false);
    expect(nurseryGenderSlots(undefined).girl_boy).toBe("child");
  });
});

describe("buildNurseryDevProfile", () => {
  it("names outstanding M skills and skips NA/NT", () => {
    const profile = buildNurseryDevProfile([
      line({ skill_id: "1", skill_description: "Can count to ten", progress_code: "M", domain_name: "Numeracy" }),
      line({ skill_id: "2", skill_description: "Can share toys", progress_code: "M", domain_name: "Social" }),
      line({ skill_id: "3", skill_description: "Can skip with a rope", progress_code: "NA", domain_name: "Physical" }),
      line({ skill_id: "4", skill_description: "Can write own name", progress_code: "NT", domain_name: "Literacy" }),
      line({ skill_id: "5", skill_description: "Can wait for a turn", progress_code: "NP", domain_name: "Social" }),
    ]);
    expect(profile.outstandingSkills.map((row) => row.skillId)).toEqual(expect.arrayContaining(["1", "2"]));
    expect(profile.outstandingSkills.some((row) => row.skillId === "3")).toBe(false);
    expect(profile.focusSkills[0]?.skillId).toBe("5");
    expect(profile.skippedSkills).toBe(2);
  });

  it("marks incomplete when many codes are blank", () => {
    const profile = buildNurseryDevProfile([
      line({ skill_id: "1", progress_code: "M" }),
      line({ skill_id: "2", progress_code: null }),
      line({ skill_id: "3", progress_code: null }),
      line({ skill_id: "4", progress_code: null }),
    ]);
    expect(profile.tone).toBe("incomplete");
  });

  it("flags social and music traits from outstanding codes", () => {
    const profile = buildNurseryDevProfile([
      line({
        skill_id: "1",
        skill_description: "Gets along with other children",
        progress_code: "M",
        domain_name: "Personal & Social Development",
      }),
      line({
        skill_id: "2",
        skill_description: "Likes teachers",
        progress_code: "M",
        domain_name: "Personal & Social Development",
      }),
      line({
        skill_id: "3",
        skill_description: "Recalls songs, chants and rhymes with ease",
        progress_code: "M",
        domain_name: "Music",
      }),
      line({ skill_id: "4", skill_description: "Counts by rote to 10", progress_code: "S", domain_name: "Maths Skills" }),
    ]);
    expect(profile.traits.socialWarmth).toBe(true);
    expect(profile.traits.likesTeachers).toBe(true);
    expect(profile.traits.enjoysRhymes).toBe(true);
    expect(profile.highlightPhrases).toEqual(
      expect.arrayContaining(["playing with classmates", "Nursery rhymes and songs"]),
    );
  });
});

describe("composeNurseryClassTeacherComment", () => {
  it("writes three nursery sentences naming mastery skills", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Amina",
      seed: "card-1",
      skillLines: [
        line({ skill_id: "1", skill_description: "Can count objects to ten", progress_code: "M", domain_name: "Numeracy" }),
        line({ skill_id: "2", skill_description: "Can retell a simple story", progress_code: "M", domain_name: "Literacy" }),
        line({ skill_id: "3", skill_description: "Can hop on one foot", progress_code: "S", domain_name: "Physical" }),
        line({ skill_id: "4", skill_description: "Can button a shirt", progress_code: "S", domain_name: "Physical" }),
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(result.text).toBeTruthy();
    expect(countSentences(result.text || "")).toBe(3);
    expect(containsFirstName(result.text || "", "Amina")).toBe(true);
    expect(result.text?.toLowerCase()).toMatch(/count|retell|numeracy|literacy|confident|progress|highlight|proud|strength|wonderful|blossom/);
    expect(result.profile.tone).toMatch(/mastery|solid/);
  });

  it("uses gentle next-step language for support-heavy profiles", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Joel",
      sex: "M",
      seed: "card-2",
      skillLines: [
        line({ skill_id: "1", skill_description: "Can sit for story time", progress_code: "NP", domain_name: "Social" }),
        line({ skill_id: "2", skill_description: "Can share toys kindly", progress_code: "A", domain_name: "Social" }),
        line({ skill_id: "3", skill_description: "Can follow two-step instructions", progress_code: "D", domain_name: "Language" }),
        line({ skill_id: "4", skill_description: "Can greet a friend", progress_code: "S", domain_name: "Social" }),
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(result.profile.tone).toBe("support");
    expect(result.text?.toLowerCase()).toMatch(/practice|support|gentle|encourag|play/);
    expect(result.text?.toLowerCase()).toMatch(/his feet|sit|share|follow|social|language/);
  });

  it("keeps a keep-going close when almost all mastery", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Nora",
      seed: "card-3",
      skillLines: [
        line({ skill_id: "1", skill_description: "Can sing a song", progress_code: "M", domain_name: "Creative" }),
        line({ skill_id: "2", skill_description: "Can clap a rhythm", progress_code: "M", domain_name: "Creative" }),
        line({ skill_id: "3", skill_description: "Can paint freely", progress_code: "M", domain_name: "Creative" }),
        line({ skill_id: "4", skill_description: "Can dance with friends", progress_code: "M", domain_name: "Physical" }),
      ],
    });
    expect(result.profile.tone).toBe("mastery");
    expect(result.text?.toLowerCase()).toMatch(/next term|curiosity|celebrat|challenges|stories|outdoor|proud|playful/);
  });

  it("can use desk nursery templates when provided", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Sam",
      seed: "card-4",
      templates: nurseryClassTeacherTemplates("test"),
      skillLines: [
        line({ skill_id: "1", skill_description: "Can pour water carefully", progress_code: "M", domain_name: "Practical" }),
        line({ skill_id: "2", skill_description: "Can tidy toys away", progress_code: "M", domain_name: "Practical" }),
        line({ skill_id: "3", skill_description: "Can wash hands", progress_code: "S", domain_name: "Practical" }),
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(result.templateIds.length).toBeGreaterThan(0);
  });

  it("writes a natural gendered portrait from social and music mastery", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Claret",
      sex: "F",
      seed: "card-claret",
      skillLines: [
        line({
          skill_id: "1",
          skill_description: "Gets along with other children",
          progress_code: "M",
          domain_name: "Personal & Social Development",
        }),
        line({
          skill_id: "2",
          skill_description: "Likes teachers",
          progress_code: "M",
          domain_name: "Personal & Social Development",
        }),
        line({
          skill_id: "3",
          skill_description: "Recalls songs, chants and rhymes with ease",
          progress_code: "M",
          domain_name: "Music",
        }),
        line({
          skill_id: "4",
          skill_description: "Likes singing",
          progress_code: "S",
          domain_name: "Music",
        }),
        line({ skill_id: "5", skill_description: "Counts by rote to 10", progress_code: "S", domain_name: "Maths Skills" }),
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(countSentences(result.text || "")).toBe(3);
    expect(result.text).toMatch(/girl/i);
    expect(result.text).toMatch(/\bShe\b|\bher\b/);
    expect(result.text?.toLowerCase()).toMatch(/rhymes|songs|teachers|classmates|friends/);
    expect(result.text?.toLowerCase()).not.toMatch(/recalls songs, chants and/);
    expect(result.text?.toLowerCase()).not.toMatch(/stands out especially in gets along/);
  });

  it("uses his feet for a boy who needs support", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Brian",
      sex: "M",
      seed: "card-brian-support",
      skillLines: [
        line({ skill_id: "1", skill_description: "Follows simple instructions", progress_code: "NP", domain_name: "Language Skills" }),
        line({ skill_id: "2", skill_description: "Shares with others", progress_code: "NP", domain_name: "Personal & Social Development" }),
        line({ skill_id: "3", skill_description: "Hops on spot", progress_code: "A", domain_name: "Physical and Motor Skills" }),
        line({ skill_id: "4", skill_description: "Counts by rote to 10", progress_code: "D", domain_name: "Maths Skills" }),
      ],
    });
    expect(result.profile.tone).toBe("support");
    expect(result.text?.toLowerCase()).toMatch(/his feet/);
    expect(result.text?.toLowerCase()).not.toMatch(/their feet/);
  });

  it("avoids girl/boy wording when sex is unknown", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Alex",
      seed: "card-alex",
      skillLines: [
        line({
          skill_id: "1",
          skill_description: "Gets along with other children",
          progress_code: "M",
          domain_name: "Personal & Social Development",
        }),
        line({
          skill_id: "2",
          skill_description: "Likes teachers",
          progress_code: "M",
          domain_name: "Personal & Social Development",
        }),
        line({ skill_id: "3", skill_description: "Counts by rote to 10", progress_code: "M", domain_name: "Maths Skills" }),
        line({ skill_id: "4", skill_description: "Hops on spot", progress_code: "S", domain_name: "Physical and Motor Skills" }),
      ],
    });
    expect(result.validation.ok).toBe(true);
    expect(countSentences(result.text || "")).toBe(3);
    expect(result.text?.toLowerCase()).not.toMatch(/\bgirl\b|\bboy\b/);
    expect(result.text).not.toMatch(/\bShe\b|\bHe\b/);
  });

  it("keeps incomplete tone when many codes are blank", () => {
    const result = composeNurseryClassTeacherComment({
      firstName: "Sam",
      seed: "card-incomplete",
      skillLines: [
        line({ skill_id: "1", progress_code: "M" }),
        line({ skill_id: "2", progress_code: null }),
        line({ skill_id: "3", progress_code: null }),
        line({ skill_id: "4", progress_code: null }),
      ],
    });
    expect(result.profile.tone).toBe("incomplete");
    expect(result.validation.ok).toBe(true);
    expect(result.text?.toLowerCase()).toMatch(/gathering|complete|skill/);
  });
});
