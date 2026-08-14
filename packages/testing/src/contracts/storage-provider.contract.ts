import { DATA_CLASSIFICATIONS, PURPOSES } from '@sentra/contracts';
import { describe, expect, it } from 'vitest';
import type { StorageProvider } from '@sentra/ports';

export interface StorageProviderContractHarness {
  readonly storage: StorageProvider;
  readonly now: () => Date;
  readonly advanceTime: (seconds: number) => void;
}

export const describeStorageProviderContract = (
  name: string,
  factory: () => StorageProviderContractHarness,
): void => {
  describe(`${name} StorageProvider`, () => {
    const samplePut = (harness: StorageProviderContractHarness) => ({
      key: 'evidence/session/01SESSION',
      body: new TextEncoder().encode('redacted transcript excerpt'),
      contentType: 'text/plain',
      classification: DATA_CLASSIFICATIONS.CONFIDENTIAL,
      purpose: PURPOSES.PROTECT_PAYMENT,
      expiresAt: new Date(harness.now().getTime() + 1_000),
      correlationId: 'crl_storage_contract',
    });

    it('stores an object and returns metadata with a checksum', async () => {
      const harness = factory();
      const metadata = await harness.storage.put(samplePut(harness));

      expect(metadata.key).toBe('evidence/session/01SESSION');
      expect(metadata.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(metadata.byteSize).toBeGreaterThan(0);
    });

    it('returns null for an expired object', async () => {
      const harness = factory();
      const input = samplePut(harness);
      await harness.storage.put(input);
      harness.advanceTime(2);

      await expect(harness.storage.stat(input.key)).resolves.toBeNull();
      await expect(harness.storage.get(input.key)).resolves.toBeNull();
    });

    it('verifies the checksum when reading bytes back', async () => {
      const harness = factory();
      const input = {
        ...samplePut(harness),
        expiresAt: new Date(harness.now().getTime() + 60_000),
      };
      await harness.storage.put(input);

      const readBack = await harness.storage.get(input.key);
      expect(readBack).not.toBeNull();
      expect(new TextDecoder().decode(readBack?.body)).toBe('redacted transcript excerpt');
    });

    it('issues a signed URL without persisting it as the canonical key', async () => {
      const harness = factory();
      const input = {
        ...samplePut(harness),
        expiresAt: new Date(harness.now().getTime() + 60_000),
      };
      await harness.storage.put(input);

      const url = await harness.storage.createSignedUrl(input.key, {
        expiresInSeconds: 120,
        purpose: PURPOSES.FRAUD_INVESTIGATION,
      });

      expect(url).toContain(encodeURIComponent(input.key));
      await expect(harness.storage.stat(input.key)).resolves.not.toBeNull();
    });

    it('returns a deletion receipt with a proof hash', async () => {
      const harness = factory();
      const input = {
        ...samplePut(harness),
        expiresAt: new Date(harness.now().getTime() + 60_000),
      };
      await harness.storage.put(input);

      const receipt = await harness.storage.delete(input.key);
      expect(receipt.key).toBe(input.key);
      expect(receipt.proofHash).toMatch(/^[a-f0-9]{64}$/);
      await expect(harness.storage.stat(input.key)).resolves.toBeNull();
    });
  });
};
