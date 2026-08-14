import { ulid } from 'ulid';
import type { IdGenerator } from '@sentra/ports';

/**
 * ULID identifier generation. `ulid` is a provider SDK, so it may only be imported here in
 * the adapters package (enforced by dependency-cruiser). The core depends on the
 * {@link IdGenerator} port and never sees this module.
 */
export class UlidIdGenerator implements IdGenerator {
  public generate(): string {
    return ulid();
  }

  public generateAt(instant: Date): string {
    return ulid(instant.getTime());
  }
}

export const createUlidIdGenerator = (): UlidIdGenerator => new UlidIdGenerator();
