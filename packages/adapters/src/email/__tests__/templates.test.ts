import { describe, expect, it } from 'vitest';
import { renderInvitationEmail, renderWelcomeEmail } from '../templates';

const invite = {
  organizationName: 'Northwind Bank',
  role: 'ANALYST',
  acceptUrl: 'https://console.test/invite?token=abc123',
  inviterName: 'Esayas',
  expiresInDays: 7,
};

describe('email templates', () => {
  it('renders an invitation with the accept link in both parts', () => {
    const mail = renderInvitationEmail(invite);
    expect(mail.subject).toContain('Northwind Bank');
    // The link must survive in the text part too, for clients that strip HTML.
    expect(mail.html).toContain(invite.acceptUrl);
    expect(mail.text).toContain(invite.acceptUrl);
    expect(mail.html).toContain('Accept invitation');
    expect(mail.text.length).toBeGreaterThan(100);
  });

  it('falls back to a neutral sender when the inviter is unknown', () => {
    const { inviterName: _omitted, ...withoutInviter } = invite;
    const mail = renderInvitationEmail(withoutInviter);
    expect(mail.subject).not.toContain('undefined');
    expect(mail.html).toContain('Your team');
  });

  // Organization names are user-supplied and must never be able to inject markup.
  it('escapes user-supplied values', () => {
    const mail = renderInvitationEmail({
      ...invite,
      organizationName: '<script>alert(1)</script>',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('renders the welcome email with console and docs links', () => {
    const mail = renderWelcomeEmail({
      organizationName: 'Northwind Bank',
      consoleUrl: 'https://console.test',
      docsUrl: 'https://console.test/docs',
    });
    expect(mail.subject).toContain('Northwind Bank');
    expect(mail.html).toContain('https://console.test/docs');
    expect(mail.text).toContain('https://console.test');
    // Sandbox-first is the promise the product makes; keep it in the copy.
    expect(mail.html.toLowerCase()).toContain('sandbox');
  });

  it('includes a hidden preheader so the inbox preview is not the raw body', () => {
    const mail = renderInvitationEmail(invite);
    expect(mail.html).toContain('display:none');
  });
});
