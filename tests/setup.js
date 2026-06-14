import { vi } from 'vitest';

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 15)
  };
}
