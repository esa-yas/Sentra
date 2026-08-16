import { redact } from '@sentra/observability';
import type {
  OperationalEventWriter,
  RecordOperationalEventInput,
  TransactionScope,
} from '@sentra/ports';
import type { Prisma } from '@sentra/db';
import type { PrismaUnitOfWork } from './prisma-unit-of-work';

/**
 * Persists a durable operational event inside the caller's transaction. The payload preview
 * is redacted here as a defence in depth, so nothing sensitive can reach the live-events
 * projection even if a caller forgets.
 */
export class PrismaOperationalEventWriter implements OperationalEventWriter {
  public constructor(private readonly unitOfWork: PrismaUnitOfWork) {}

  public async record(input: RecordOperationalEventInput, scope: TransactionScope): Promise<void> {
    const tx = this.unitOfWork.executor(scope);
    // Severity/status are native PostgreSQL enums whose values mirror @sentra/contracts
    // exactly; the cast keeps the port free of Prisma's generated enum types.
    const data = {
      id: input.id,
      organizationId: input.organizationId,
      type: input.type,
      severity: input.severity,
      status: input.status,
      actor: input.actor,
      subjectRef: input.subjectRef,
      provider: input.provider,
      attempt: input.attempt,
      durationMs: input.durationMs,
      synthetic: input.synthetic,
      payloadPreview: redact(input.payloadPreview) as Prisma.InputJsonValue,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
    } as unknown as Prisma.OperationalEventUncheckedCreateInput;
    await tx.operationalEvent.create({ data });
  }
}

export const createPrismaOperationalEventWriter = (
  unitOfWork: PrismaUnitOfWork,
): PrismaOperationalEventWriter => new PrismaOperationalEventWriter(unitOfWork);
