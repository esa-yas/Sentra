import type { EmailMessage, EmailSender } from '@sentra/ports';
import type { Logger } from '@sentra/observability';

export interface ResendConfig {
  readonly apiKey?: string;
  /** e.g. `Sentra <noreply@sentra.io>` — the domain must be verified in Resend. */
  readonly fromAddress?: string;
  readonly replyTo?: string;
}

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends through Resend's HTTPS API.
 *
 * When no API key or sender address is configured this reports `false` rather than throwing, so
 * a deployment without email still works — the caller surfaces the link instead. Recipient
 * addresses are never logged; only the provider's message id and status are.
 */
export class ResendEmailSender implements EmailSender {
  public constructor(
    private readonly config: ResendConfig,
    private readonly logger: Logger,
  ) {}

  public async send(message: EmailMessage): Promise<boolean> {
    const { apiKey, fromAddress, replyTo } = this.config;
    if (apiKey === undefined || apiKey === '' || fromAddress === undefined || fromAddress === '') {
      this.logger.warn('email_not_configured', { reason: 'missing_resend_api_key_or_from' });
      return false;
    }

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo === undefined ? {} : { reply_to: replyTo }),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.warn('email_send_rejected', {
          status: response.status,
          detail: detail.slice(0, 200),
        });
        return false;
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      this.logger.info('email_sent', { messageId: body.id ?? 'unknown' });
      return true;
    } catch (error) {
      this.logger.warn('email_send_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return false;
    }
  }
}

export const createResendEmailSender = (config: ResendConfig, logger: Logger): EmailSender =>
  new ResendEmailSender(config, logger);

/** Used when email is deliberately not wired; always reports "not sent". */
export const createNoopEmailSender = (): EmailSender => ({
  send: async () => false,
});
