import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Detector, type Snapshot } from './detector.js';
import type { Provider } from './provider.js';
import { ConfigurationError, providerFromEnvironment } from './config.js';

/** Replay a JSON array through the same public detector used by integrators. */
export async function replay(events: unknown[], options: { provider?: Provider; onUpdate?: (snapshot: Snapshot) => void } = {}): Promise<Snapshot[]> {
  const detector = new Detector(options);
  const calls = new Set<string>();
  for (const event of events) calls.add(detector.ingest(event).callId);
  return Promise.all([...calls].map(async id => {
    await detector.flush(id);
    return detector.endCall(id);
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.argv[2] ?? 'fixtures/otp-request.json';
    const events: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(events)) throw new Error('Replay must be a JSON array');
    const provider = providerFromEnvironment();
    await replay(events, { provider, onUpdate: snapshot => console.log(JSON.stringify(snapshot)) });
  } catch (error) {
    // Validation messages may contain user input; ordinary logs must not repeat it.
    console.error(error instanceof ConfigurationError ? error.message : 'Replay failed: invalid input or inaccessible file.');
    process.exitCode = 1;
  }
}
