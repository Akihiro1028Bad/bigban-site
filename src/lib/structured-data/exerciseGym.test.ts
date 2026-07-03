import { describe, it, expect } from "vitest";
import { buildExerciseGym } from "./exerciseGym";

describe("buildExerciseGym", () => {
  it("ja: url が /hyrox、@id が /#hyrox", () => {
    const schema = buildExerciseGym("ja");
    expect(schema["@type"]).toBe("ExerciseGym");
    expect(schema["@id"]).toBe("http://localhost:3000/#hyrox");
    expect(schema.url).toBe("http://localhost:3000/hyrox");
    expect(schema.sport).toContain("HYROX");
  });

  it("en: url が /en/hyrox", () => {
    const schema = buildExerciseGym("en");
    expect(schema.url).toBe("http://localhost:3000/en/hyrox");
  });
});
