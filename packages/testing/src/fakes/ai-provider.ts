import { createHash } from 'node:crypto';
import {
  AI_RESULT_STATUSES,
  type AIProvider,
  type AiRequest,
  type AiResult,
} from '@sentra/ports';

export interface FakeAIProviderOptions {
  readonly providerName?: string;
  readonly modelId?: string;
  readonly latencyMs?: number;
}

/**
 * Minimal AI fake for contract tests. Not wired into Version 1a runtime paths.
 */
export class FakeAIProvider implements AIProvider {
  public readonly name: string;

  private readonly modelId: string;
  private readonly latencyMs: number;
  private unavailable = false;
  private blocked = false;
  private invalidOutput = false;
  private readonly responses = new Map<string, unknown>();

  public constructor(options: FakeAIProviderOptions = {}) {
    this.name = options.providerName ?? 'fake-ai';
    this.modelId = options.modelId ?? 'fake-model-v1';
    this.latencyMs = options.latencyMs ?? 3;
  }

  public setUnavailable(unavailable: boolean): void {
    this.unavailable = unavailable;
  }

  public setBlocked(blocked: boolean): void {
    this.blocked = blocked;
  }

  public setInvalidOutput(invalid: boolean): void {
    this.invalidOutput = invalid;
  }

  public setResponse(task: string, value: unknown): void {
    this.responses.set(task, value);
  }

  public async execute<TOutput>(request: AiRequest<TOutput>): Promise<AiResult<TOutput>> {
    const metadata = {
      providerName: this.name,
      modelId: this.modelId,
      promptVersion: request.promptVersion,
      responseSchemaVersion: request.responseSchemaVersion,
      inputHash: createHash('sha256').update(JSON.stringify(request.input)).digest('hex').slice(0, 32),
      latencyMs: this.latencyMs,
    };

    if (request.timeoutMs <= 0) {
      return { status: AI_RESULT_STATUSES.TIMEOUT, problems: ['deadline exceeded'], metadata };
    }

    if (this.blocked) {
      return { status: AI_RESULT_STATUSES.BLOCKED, problems: ['input blocked'], metadata };
    }

    if (this.unavailable) {
      return { status: AI_RESULT_STATUSES.ERROR, problems: ['provider unavailable'], metadata };
    }

    const candidate = this.responses.get(request.task) ?? { indicators: [] };
    const validation = request.validate(this.invalidOutput ? { bad: true } : candidate);

    if (!validation.ok) {
      return {
        status: AI_RESULT_STATUSES.INVALID_OUTPUT,
        problems: validation.problems,
        metadata,
      };
    }

    return {
      status: AI_RESULT_STATUSES.OK,
      value: validation.value,
      metadata,
    };
  }
}

export const createFakeAIProvider = (options?: FakeAIProviderOptions): FakeAIProvider =>
  new FakeAIProvider(options);
