/**
 * @sentra/ports declares every boundary the application core depends on: persistence,
 * transport, AI, storage, notification, cache, and authentication.
 *
 * Nothing here imports an implementation. That is the whole point — the core is written
 * against these interfaces so that replacing Supabase with Cloud SQL, BullMQ with Pub/Sub,
 * or Gemini with Vertex AI is an adapter change rather than a rewrite (slides 044 to 052).
 * The `dependency-cruiser` rules fail the build if an implementation leaks in here.
 */
export type { Clock, IdGenerator, SecureRandom, PasswordHasher } from './support';
export type { TransactionScope, TransactionOptions, UnitOfWork } from './unit-of-work';

export type {
  AuditProvider,
  AuditRecordInput,
  RecordedAuditEvent,
} from './audit-provider';

export type {
  QueueProvider,
  QueueMessage,
  QueueHandler,
  QueueConsumerHandle,
  QueueConsumerOptions,
  EnqueueOptions,
} from './queue-provider';

export {
  AI_TASKS,
  AI_RESULT_STATUSES,
  type AIProvider,
  type AiTask,
  type AiRequest,
  type AiResult,
  type AiResultStatus,
  type AiCallMetadata,
  type AiValidationResult,
} from './ai-provider';

export type {
  StorageProvider,
  StoredObjectMetadata,
  PutObjectInput,
  SignedUrlOptions,
  DeletionReceipt,
} from './storage-provider';

export type { CacheProvider, CacheLease } from './cache-provider';

export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TEMPLATES,
  type NotificationProvider,
  type NotificationChannel,
  type NotificationTemplate,
  type NotificationInput,
  type NotificationReceipt,
} from './notification-provider';

export {
  RISK_INDICATOR_CODES,
  RISK_SIGNAL_STATUSES,
  type RiskSignalProvider,
  type RiskIndicator,
  type RiskIndicatorCode,
  type RiskSignalQuery,
  type RiskSignalResult,
  type RiskSignalStatus,
} from './risk-signal-provider';

export {
  SIGNATURE_FAILURE_REASONS,
  type UserTokenVerifier,
  type VerifiedUserToken,
  type PartnerAuthProvider,
  type IssuePartnerTokenInput,
  type IssuedPartnerToken,
  type SignatureVerifier,
  type SignatureVerificationInput,
  type SignatureVerificationResult,
  type SignatureFailureReason,
} from './auth-providers';

export type {
  OrganizationRecord,
  UserRecord,
  IdentityLinkRecord,
  MembershipRecord,
  MembershipWithOrganization,
  PartnerConnectionRecord,
  PartnerConnectionWithSecret,
  PartnerSigningKeyRecord,
  AuditEventRecord,
  OutboxEventRecord,
  OutboxStatus,
  InboxEventRecord,
  IdempotencyRecord,
  IdempotencyStatus,
  RetentionPolicyRecord,
  RetentionRunRecord,
} from './models';

export type {
  Pagination,
  PagedResult,
  OrganizationRepository,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  UserRepository,
  CreateUserInput,
  IdentityLinkRepository,
  CreateIdentityLinkInput,
  MembershipRepository,
  CreateMembershipInput,
  PartnerConnectionRepository,
  CreatePartnerConnectionInput,
  PartnerSigningKeyRepository,
  RegisterSigningKeyInput,
  AuditEventRepository,
  AppendAuditEventInput,
  AuditEventFilter,
  OutboxRepository,
  EnqueueOutboxEventInput,
  InboxRepository,
  IdempotencyRepository,
  IdempotencyClaim,
  RetentionRepository,
  CreateRetentionPolicyInput,
} from './repositories';
