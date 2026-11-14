import { expect, test } from 'vitest';
import { providerFromEnvironment } from '../src/config.js';
test('live calls require explicit selection, key and account model; mock is the default', () => {
  expect(providerFromEnvironment({ CEREBRAS_API_KEY: 'key', CEREBRAS_MODEL: 'model' }).source).toBe('mock');
  expect(() => providerFromEnvironment({ RISK_PROVIDER: 'cerebras' })).toThrow('CEREBRAS_API_KEY and CEREBRAS_MODEL');
  expect(providerFromEnvironment({ RISK_PROVIDER: 'cerebras', CEREBRAS_API_KEY: 'key', CEREBRAS_MODEL: 'model' }).source).toBe('cerebras');
  expect(() => providerFromEnvironment({ RISK_PROVIDER: 'typo' })).toThrow('RISK_PROVIDER');
});
