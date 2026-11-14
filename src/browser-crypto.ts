// Build-only adapter for the detector's synchronous duplicate fingerprints.
// Keep SHA-256 identical to Node; do not replace it with a weaker hash.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
export function createHash(algorithm: string) {
  if (algorithm !== 'sha256') throw new Error('Unsupported hash algorithm');
  const hash = sha256.create();
  return {
    update(value: string) { hash.update(utf8ToBytes(value)); return this; },
    digest(encoding: string) {
      if (encoding !== 'hex') throw new Error('Unsupported digest encoding');
      return bytesToHex(hash.digest());
    }
  };
}
