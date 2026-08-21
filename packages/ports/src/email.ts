/**
 * Outbound transactional email.
 *
 * `send` resolves to whether the message was actually accepted by the provider. It never throws
 * for a delivery failure: callers decide what to do when mail cannot be sent (typically showing
 * the link so a human can pass it on), and a failed email must not roll back the change that
 * triggered it.
 */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<boolean>;
}
