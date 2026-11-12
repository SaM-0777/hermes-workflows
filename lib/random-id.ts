/**
 * Request/node ids that work inside the Studio frame.
 *
 * The Studio runs in a sandboxed, opaque-origin frame, which is NOT a secure
 * context: `crypto.randomUUID` is undefined there (it only exists in secure
 * contexts), while `crypto.getRandomValues` is available everywhere. Calling
 * `randomUUID` directly therefore threw on every request once the studio moved
 * off http://localhost — so everything goes through this helper instead.
 */
export function randomId(): string {
  const source = globalThis.crypto;

  if (source && typeof source.randomUUID === "function") {
    try {
      return source.randomUUID();
    } catch {
      // fall through to the manual construction below
    }
  }

  const bytes = new Uint8Array(16);

  if (source && typeof source.getRandomValues === "function") {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4 layout.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
