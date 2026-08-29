import { describe, it, expect } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("returns an empty diff for two empty inputs", () => {
    expect(diffLines([], [])).toEqual([]);
  });

  it("marks every line the same when both inputs are identical", () => {
    const lines = ["a", "b", "c"];
    expect(diffLines(lines, [...lines])).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("marks every line of a as removed when b is empty", () => {
    expect(diffLines(["a", "b"], [])).toEqual([
      { type: "remove", text: "a" },
      { type: "remove", text: "b" },
    ]);
  });

  it("marks every line of b as added when a is empty", () => {
    expect(diffLines([], ["a", "b"])).toEqual([
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("detects a single line changed in the middle", () => {
    const result = diffLines(["a", "b", "c"], ["a", "x", "c"]);
    expect(result).toEqual([
      { type: "same", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: "c" },
    ]);
  });

  it("detects an appended line", () => {
    const result = diffLines(["a", "b"], ["a", "b", "c"]);
    expect(result).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "add", text: "c" },
    ]);
  });

  it("detects a removed line", () => {
    const result = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(result).toEqual([
      { type: "same", text: "a" },
      { type: "remove", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("preserves order across multiple scattered changes", () => {
    const result = diffLines(["1", "2", "3", "4", "5"], ["1", "x", "3", "y", "5"]);
    expect(result.map((d) => d.type)).toEqual(["same", "remove", "add", "same", "remove", "add", "same"]);
    expect(result.filter((d) => d.type === "same").map((d) => d.text)).toEqual(["1", "3", "5"]);
  });
});
