import { describe, it, expect } from "vitest";
import {
  detectEncoding,
  decodeBytes,
  encodeText,
  detectLineEnding,
  normalizeToLf,
  applyLineEnding,
} from "./encoding";

describe("detectEncoding", () => {
  it("detects a UTF-8 BOM", () => {
    expect(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe("utf-8-bom");
  });

  it("detects a UTF-16 LE BOM", () => {
    expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe("utf-16le");
  });

  it("detects a UTF-16 BE BOM", () => {
    expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x61]))).toBe("utf-16be");
  });

  it("defaults to UTF-8 when there is no BOM", () => {
    expect(detectEncoding(new TextEncoder().encode("ciao"))).toBe("utf-8");
  });
});

describe("encode/decode round-trip", () => {
  const sample = "Ciao à è ☺ 日本語";

  it("round-trips through UTF-8", () => {
    const bytes = encodeText(sample, "utf-8");
    expect(decodeBytes(bytes, "utf-8")).toBe(sample);
  });

  it("round-trips through UTF-8 with BOM", () => {
    const bytes = encodeText(sample, "utf-8-bom");
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    expect(decodeBytes(bytes, "utf-8-bom")).toBe(sample);
  });

  it("round-trips through UTF-16 LE", () => {
    const bytes = encodeText(sample, "utf-16le");
    expect(decodeBytes(bytes, "utf-16le")).toBe(sample);
  });

  it("round-trips through UTF-16 BE", () => {
    const bytes = encodeText(sample, "utf-16be");
    expect(decodeBytes(bytes, "utf-16be")).toBe(sample);
  });

  it("produces different byte order for LE vs BE", () => {
    const le = encodeText("A", "utf-16le");
    const be = encodeText("A", "utf-16be");
    // 'A' = 0x0041
    expect([le[2], le[3]]).toEqual([0x41, 0x00]);
    expect([be[2], be[3]]).toEqual([0x00, 0x41]);
  });
});

describe("line endings", () => {
  it("detects LF-only text", () => {
    expect(detectLineEnding("a\nb\nc")).toBe("LF");
  });

  it("detects CRLF-only text", () => {
    expect(detectLineEnding("a\r\nb\r\nc")).toBe("CRLF");
  });

  it("defaults to LF for text with no newlines", () => {
    expect(detectLineEnding("just one line")).toBe("LF");
  });

  it("picks the majority style for mixed line endings", () => {
    expect(detectLineEnding("a\r\nb\r\nc\nd")).toBe("CRLF");
    expect(detectLineEnding("a\nb\nc\r\nd")).toBe("LF");
  });

  it("normalizeToLf strips carriage returns", () => {
    expect(normalizeToLf("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("applyLineEnding converts LF text to CRLF", () => {
    expect(applyLineEnding("a\nb\nc", "CRLF")).toBe("a\r\nb\r\nc");
  });

  it("applyLineEnding is idempotent on already-CRLF text", () => {
    expect(applyLineEnding("a\r\nb", "CRLF")).toBe("a\r\nb");
  });

  it("applyLineEnding converts CRLF text down to LF", () => {
    expect(applyLineEnding("a\r\nb\r\nc", "LF")).toBe("a\nb\nc");
  });
});
