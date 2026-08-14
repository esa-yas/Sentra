import type { DataClassification, Purpose } from '@sentra/contracts';

/**
 * Object storage for redacted, short-lived evidence.
 *
 * Slide 042 sets the rules: canonical IDs rather than vendor URLs, checksums, explicit
 * classification and expiry, and no raw audio by default. Slide 054 adds that migration
 * copies bytes, metadata, hashes, and retention state independently of the database, which
 * is why a domain record stores a canonical key and a checksum instead of a link.
 *
 * Supabase Storage implements this first; Cloud Storage replaces the adapter later.
 */

export interface StoredObjectMetadata {
  /** Canonical, provider-independent key. Never a URL. */
  readonly key: string;
  readonly byteSize: number;
  /** Hex-encoded SHA-256 of the stored bytes, verified on read-back and on migration. */
  readonly checksumSha256: string;
  readonly contentType: string;
  readonly classification: DataClassification;
  readonly purpose: Purpose;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly classification: DataClassification;
  readonly purpose: Purpose;
  /** Required: an object with no expiry cannot satisfy a retention policy. */
  readonly expiresAt: Date;
  readonly correlationId: string;
}

export interface SignedUrlOptions {
  readonly expiresInSeconds: number;
  /** Recorded on the audit trail: reading evidence is itself an auditable action. */
  readonly purpose: Purpose;
}

export interface DeletionReceipt {
  readonly key: string;
  readonly deletedAt: Date;
  /** Digest proving the deletion occurred, without revealing what was deleted. */
  readonly proofHash: string;
}

export interface StorageProvider {
  readonly name: string;

  put(input: PutObjectInput): Promise<StoredObjectMetadata>;

  /** Returns null when the object is absent or already expired. */
  stat(key: string): Promise<StoredObjectMetadata | null>;

  /** Verifies the checksum before returning bytes. */
  get(key: string): Promise<{ body: Uint8Array; metadata: StoredObjectMetadata } | null>;

  /** Short-lived download URL. Never stored; reissued from the adapter on each request. */
  createSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;

  delete(key: string): Promise<DeletionReceipt>;

  /** Enumerates keys under a prefix, used by the retention sweep and migration inventory. */
  list(prefix: string, limit: number): Promise<readonly StoredObjectMetadata[]>;
}
