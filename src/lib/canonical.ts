/**
 * Canonical JSON, byte-for-byte identical to the SAN node's signer.
 *
 * The node signs/verifies `json.dumps(payload, sort_keys=True,
 * separators=(",", ":"))` with default `ensure_ascii=True`. `signature` and
 * `fee` are protocol metadata and never part of the signed message.
 */

const META_FIELDS = new Set(["signature", "fee"]);

/** Escape a string the way Python's json.dumps(ensure_ascii=True) does. */
function escapeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const char = value[i];
    switch (char) {
      case '"':
        out += '\\"';
        continue;
      case "\\":
        out += "\\\\";
        continue;
      case "\n":
        out += "\\n";
        continue;
      case "\r":
        out += "\\r";
        continue;
      case "\t":
        out += "\\t";
        continue;
      case "\b":
        out += "\\b";
        continue;
      case "\f":
        out += "\\f";
        continue;
      default:
        break;
    }
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else if (code < 0x7f) {
      out += char;
    } else {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    }
  }
  return `${out}"`;
}

function serialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const type = typeof value;
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    const numeric = value as number;
    if (!Number.isFinite(numeric)) throw new Error("Canonical JSON cannot encode non-finite numbers");
    if (Number.isInteger(numeric) && Object.is(numeric, -0) === false) {
      return numeric.toString();
    }
    return numeric.toString();
  }
  if (type === "bigint") return (value as bigint).toString();
  if (type === "string") return escapeString(value as string);
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (type === "object") {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort();
    const body = keys.map((key) => `${escapeString(key)}:${serialize(object[key])}`).join(",");
    return `{${body}}`;
  }
  throw new Error(`Canonical JSON cannot encode ${type}`);
}

/** Canonical serialization of any payload. */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

/** Bytes that are signed: the payload without `signature` and `fee`. */
export function signingMessage(payload: Record<string, unknown>): Uint8Array {
  const message: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (META_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    message[key] = value;
  }
  return new TextEncoder().encode(canonicalJson(message));
}

/** Protocol fee basis: everything except `fee` (the signature is included). */
export function feeBasis(payload: Record<string, unknown>): Uint8Array {
  const basis: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "fee" || value === undefined) continue;
    basis[key] = value;
  }
  return new TextEncoder().encode(canonicalJson(basis));
}
