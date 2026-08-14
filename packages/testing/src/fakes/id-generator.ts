import type { IdGenerator } from '@sentra/ports';

const PREFIX = '01FAKE';
const WIDTH = 26 - PREFIX.length;

const padCounter = (value: number): string => value.toString(36).toUpperCase().padStart(WIDTH, '0');

/**
 * Deterministic identifier generator. Each call returns the next value in a fixed
 * sequence, so assertions never depend on randomness or wall time.
 */
export class FakeIdGenerator implements IdGenerator {
  private counter = 0;

  public constructor(private readonly startAt = 0) {
    this.counter = startAt;
  }

  public generate(): string {
    this.counter += 1;
    return `${PREFIX}${padCounter(this.counter)}`;
  }

  public generateAt(instant: Date): string {
    const stamp = instant.getTime().toString(36).toUpperCase().padStart(8, '0').slice(-8);
    this.counter += 1;
    return `${PREFIX}${stamp}${padCounter(this.counter).slice(-(WIDTH - 8))}`;
  }

  /** Returns the next value without consuming it. */
  public peek(): string {
    return `${PREFIX}${padCounter(this.counter + 1)}`;
  }

  public reset(next = 0): void {
    this.counter = next;
  }
}

export const createFakeIdGenerator = (startAt?: number): FakeIdGenerator => new FakeIdGenerator(startAt);
