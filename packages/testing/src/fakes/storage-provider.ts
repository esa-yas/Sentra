import { createHash } from 'node:crypto';
import type {
  DeletionReceipt,
  PutObjectInput,
  SignedUrlOptions,
  StorageProvider,
  StoredObjectMetadata,
} from '@sentra/ports';
import type { FakeClock } from './clock';
import { createFakeClock } from './clock';

interface StoredObject {
  readonly metadata: StoredObjectMetadata;
  readonly body: Uint8Array;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * In-memory object store with checksum verification and expiry enforced on read.
 */
export class FakeStorageProvider implements StorageProvider {
  public readonly name = 'fake-storage';

  private readonly objects = new Map<string, StoredObject>();
  private signedUrlCounter = 0;

  public constructor(private readonly clock: FakeClock = createFakeClock()) {}

  public async put(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const metadata: StoredObjectMetadata = {
      key: input.key,
      byteSize: input.body.byteLength,
      checksumSha256: sha256(input.body),
      contentType: input.contentType,
      classification: input.classification,
      purpose: input.purpose,
      createdAt: this.clock.now(),
      expiresAt: input.expiresAt,
    };

    this.objects.set(input.key, { metadata, body: input.body });
    return metadata;
  }

  public async stat(key: string): Promise<StoredObjectMetadata | null> {
    const stored = this.objects.get(key);
    if (stored === undefined || this.isExpired(stored.metadata)) {
      return null;
    }
    return stored.metadata;
  }

  public async get(key: string): Promise<{ body: Uint8Array; metadata: StoredObjectMetadata } | null> {
    const stored = this.objects.get(key);
    if (stored === undefined || this.isExpired(stored.metadata)) {
      return null;
    }
    if (sha256(stored.body) !== stored.metadata.checksumSha256) {
      throw new Error(`Checksum mismatch for object ${key}.`);
    }
    return { body: stored.body, metadata: stored.metadata };
  }

  public async createSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const metadata = await this.stat(key);
    if (metadata === null) {
      throw new Error(`Object ${key} was not found or has expired.`);
    }
    this.signedUrlCounter += 1;
    const expiresAt = this.clock.now().getTime() + options.expiresInSeconds * 1000;
    return `fake://storage/${encodeURIComponent(key)}?purpose=${options.purpose}&exp=${expiresAt}&n=${this.signedUrlCounter}`;
  }

  public async delete(key: string): Promise<DeletionReceipt> {
    const existed = this.objects.delete(key);
    const deletedAt = this.clock.now();
    const proofHash = createHash('sha256')
      .update(`${key}:${deletedAt.toISOString()}:${existed}`)
      .digest('hex');

    return { key, deletedAt, proofHash };
  }

  public async list(prefix: string, limit: number): Promise<readonly StoredObjectMetadata[]> {
    const matches: StoredObjectMetadata[] = [];
    for (const stored of this.objects.values()) {
      if (!stored.metadata.key.startsWith(prefix)) {
        continue;
      }
      if (this.isExpired(stored.metadata)) {
        continue;
      }
      matches.push(stored.metadata);
      if (matches.length >= limit) {
        break;
      }
    }
    return matches;
  }

  private isExpired(metadata: StoredObjectMetadata): boolean {
    return metadata.expiresAt !== null && metadata.expiresAt <= this.clock.now();
  }
}

export const createFakeStorageProvider = (clock?: FakeClock): FakeStorageProvider =>
  new FakeStorageProvider(clock);
