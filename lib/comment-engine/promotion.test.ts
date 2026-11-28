import { describe, expect, it } from "vitest";
import { promotionForLearner, type ClassSequenceRow } from "./promotion";

const CLASSES: ClassSequenceRow[] = [
  { code: "RC", name: "Reception Class", sort_order: 1 },
  { code: "C2", name: "Baby Class", sort_order: 2 },
  { code: "C3", name: "Middle Class", sort_order: 3 },
  { code: "C4", name: "Top Class", sort_order: 4 },
  { code: "P1", name: "Primary One", sort_order: 5 },
  { code: "P2", name: "Primary Two", sort_order: 6 },
  { code: "P3", name: "Primary Three", sort_order: 7 },
  { code: "P4", name: "Primary Four", sort_order: 8 },
  { code: "P5", name: "Primary Five", sort_order: 9 },
  { code: "P6", name: "Primary Six", sort_order: 10 },
  { code: "P7", name: "Primary Seven", sort_order: 11 },
];

describe("promotionForLearner", () => {
  it("returns null on Term 1 and Term 2", () => {
    expect(promotionForLearner(1, "P4", CLASSES)).toBeNull();
    expect(promotionForLearner(2, "P4", CLASSES)).toBeNull();
  });

  it("returns null when the term is unknown", () => {
    expect(promotionForLearner(null, "P4", CLASSES)).toBeNull();
    expect(promotionForLearner(undefined, "P4", CLASSES)).toBeNull();
  });

  it("promotes a Primary learner to the next class on Term 3", () => {
    expect(promotionForLearner(3, "P4", CLASSES)).toEqual({
      fromClass: "P4",
      fromClassName: "Primary Four",
      toClass: "P5",
      toClassName: "Primary Five",
      graduating: false,
    });
  });

  it("moves a Top Class (C4) learner up to P1", () => {
    expect(promotionForLearner(3, "C4", CLASSES)).toMatchObject({
      fromClass: "C4",
      toClass: "P1",
      toClassName: "Primary One",
      graduating: false,
    });
  });

  it("marks Primary Seven as graduating with no next class", () => {
    expect(promotionForLearner(3, "P7", CLASSES)).toEqual({
      fromClass: "P7",
      fromClassName: "Primary Seven",
      toClass: null,
      toClassName: null,
      graduating: true,
    });
  });

  it("returns null when the class is not in the sequence", () => {
    expect(promotionForLearner(3, "P9", CLASSES)).toBeNull();
  });

  it("uses sort_order, not the order rows arrive in", () => {
    const shuffled = [...CLASSES].reverse();
    expect(promotionForLearner(3, "P2", shuffled)).toMatchObject({ toClass: "P3" });
  });
});
