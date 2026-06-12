import { describe, expect, it } from "vitest";
import { audInputToCents, formatAud } from "./money";

describe("formatAud", () => {
  it("formats whole dollars", () => {
    expect(formatAud(1500)).toBe("$15.00");
  });

  it("formats cents", () => {
    expect(formatAud(1357)).toBe("$13.57");
  });

  it("formats zero", () => {
    expect(formatAud(0)).toBe("$0.00");
  });
});

describe("audInputToCents", () => {
  it("parses plain dollars", () => {
    expect(audInputToCents("15")).toBe(1500);
  });

  it("parses dollars and cents", () => {
    expect(audInputToCents("15.50")).toBe(1550);
  });

  it("strips a leading dollar sign", () => {
    expect(audInputToCents("$15.50")).toBe(1550);
  });

  it("parses sub-dollar amounts", () => {
    expect(audInputToCents("0.1")).toBe(10);
  });

  it("rejects empty input", () => {
    expect(audInputToCents("")).toBeNull();
    expect(audInputToCents("   ")).toBeNull();
  });

  it("rejects negative amounts", () => {
    expect(audInputToCents("-3")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(audInputToCents("abc")).toBeNull();
  });
});
