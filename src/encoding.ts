export type TextEncodingId = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
export type LineEnding = "LF" | "CRLF";

export const ENCODING_LABELS: Record<TextEncodingId, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 BOM",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
};

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

export function detectEncoding(bytes: Uint8Array): TextEncodingId {
  if (startsWith(bytes, BOM_UTF8)) return "utf-8-bom";
  if (startsWith(bytes, BOM_UTF16LE)) return "utf-16le";
  if (startsWith(bytes, BOM_UTF16BE)) return "utf-16be";
  return "utf-8";
}

// Browsers' TextDecoder does not support the "utf-16be" label (only LE), so UTF-16
// is decoded/encoded manually here in both directions for symmetry.
function decodeUtf16(bytes: Uint8Array, offset: number, littleEndian: boolean): string {
  let result = "";
  for (let i = offset; i + 1 < bytes.length; i += 2) {
    const code = littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
    result += String.fromCharCode(code);
  }
  return result;
}

export function decodeBytes(bytes: Uint8Array, encoding: TextEncodingId): string {
  switch (encoding) {
    case "utf-8-bom":
      return new TextDecoder("utf-8").decode(bytes.subarray(3));
    case "utf-16le":
      return decodeUtf16(bytes, 2, true);
    case "utf-16be":
      return decodeUtf16(bytes, 2, false);
    case "utf-8":
    default:
      return new TextDecoder("utf-8").decode(bytes);
  }
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2 + 2);
  if (littleEndian) {
    out[0] = 0xff;
    out[1] = 0xfe;
  } else {
    out[0] = 0xfe;
    out[1] = 0xff;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const hi = (code >> 8) & 0xff;
    const lo = code & 0xff;
    if (littleEndian) {
      out[2 + i * 2] = lo;
      out[2 + i * 2 + 1] = hi;
    } else {
      out[2 + i * 2] = hi;
      out[2 + i * 2 + 1] = lo;
    }
  }
  return out;
}

export function encodeText(text: string, encoding: TextEncodingId): Uint8Array {
  switch (encoding) {
    case "utf-8-bom": {
      const body = new TextEncoder().encode(text);
      const out = new Uint8Array(body.length + 3);
      out.set(BOM_UTF8, 0);
      out.set(body, 3);
      return out;
    }
    case "utf-16le":
      return encodeUtf16(text, true);
    case "utf-16be":
      return encodeUtf16(text, false);
    case "utf-8":
    default:
      return new TextEncoder().encode(text);
  }
}

export function detectLineEnding(text: string): LineEnding {
  const totalNewlines = (text.match(/\n/g) ?? []).length;
  if (totalNewlines === 0) return "LF";
  const crlfCount = (text.match(/\r\n/g) ?? []).length;
  return crlfCount / totalNewlines > 0.5 ? "CRLF" : "LF";
}

export function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function applyLineEnding(text: string, ending: LineEnding): string {
  const lf = normalizeToLf(text);
  return ending === "CRLF" ? lf.replace(/\n/g, "\r\n") : lf;
}
