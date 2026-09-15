export function wav() {
  const rate = 8000;
  const samples = rate * 3;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / rate) * 1000), 44 + i * 2);
  return buffer;
}

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGPMn+3GgA0wYRUdtBIACyABYBEIOtMAAAAASUVORK5CYII=', 'base64');


import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Each regression test owns an isolated account, shared by API and browser fixtures.
export const test = base.extend<{ ownerAccount: void }>({
  ownerAccount: [async ({ request, context }, use) => {
    const response = await request.post('http://127.0.0.1:8011/api/auth/register', {
      data: { email: `regression-${randomUUID()}@example.com`, password: 'Test-only-password-42', display_name: 'Test owner' },
    });
    expect(response.status()).toBe(201);
    await context.addCookies((await request.storageState()).cookies);
    await use();
  }, { auto: true }],
});
