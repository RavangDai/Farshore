function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function encode(value: Uint8Array) { return btoa(Array.from(value, b => String.fromCharCode(b)).join("")); }
async function encryptionKey(value: string) {
  const raw = bytes(value);
  if (raw.byteLength !== 32) throw new Error("Encryption key must be 32 bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(secret: string, ownerId: string, masterKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(ownerId) }, await encryptionKey(masterKey), new TextEncoder().encode(secret));
  return `v1:${encode(iv)}:${encode(new Uint8Array(ciphertext))}`;
}
export async function decryptSecret(value: string, ownerId: string, masterKey: string): Promise<string> {
  const parts = value.split(":");
  if (parts.length !== 3 || parts[0] !== "v1" || parts[1].length > 32 || parts[2].length > 7000) throw new Error("Unsupported encrypted key.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(parts[1]), additionalData: new TextEncoder().encode(ownerId) }, await encryptionKey(masterKey), bytes(parts[2]));
  return new TextDecoder().decode(plaintext);
}
