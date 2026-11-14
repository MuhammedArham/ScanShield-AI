import { cerebrasProvider, mockProvider, type Provider } from './provider.js';
export class ConfigurationError extends Error {}

/** Explicit opt-in prevents an accidentally inherited API key making paid calls. */
export function providerFromEnvironment(env: NodeJS.ProcessEnv = process.env): Provider {
  const mode = env.RISK_PROVIDER ?? 'mock';
  if (mode === 'mock') return mockProvider;
  if (mode !== 'cerebras') throw new ConfigurationError('RISK_PROVIDER must be mock or cerebras');
  const key = env.CEREBRAS_API_KEY?.trim();
  const model = env.CEREBRAS_MODEL?.trim();
  if (!key || !model) throw new ConfigurationError('Live mode requires CEREBRAS_API_KEY and CEREBRAS_MODEL');
  return cerebrasProvider(key, model);
}
