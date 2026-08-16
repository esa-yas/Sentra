import { randomBytes, randomUUID } from 'node:crypto';
import type { SecureRandom } from '@sentra/ports';

export class NodeSecureRandom implements SecureRandom {
  public token(byteLength: number): string {
    return randomBytes(byteLength).toString('base64url');
  }

  public uuid(): string {
    return randomUUID();
  }
}

export const createNodeSecureRandom = (): NodeSecureRandom => new NodeSecureRandom();
