/**
 * Branded transactional email templates.
 *
 * Email clients are not browsers: Outlook and Gmail strip `<style>` blocks, ignore flexbox and
 * grid, and drop CSS variables. Everything here is therefore table-based with inline styles and
 * web-safe fallbacks, which is why it does not share the console's Tailwind components. The
 * palette and voice do match the console: the same purple, the same "Sentra advises, the bank
 * decides" restraint, and no invented social proof.
 *
 * Every template also returns a plain-text part. Sending both is what keeps a message out of the
 * spam folder and readable in a text-only client.
 */

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const ACCENT = '#6d4ef0';
const INK = '#0f1622';
const MUTED = '#57616f';
const FAINT = '#8b94a2';
const LINE = '#e9ecf2';
const CARD = '#ffffff';
const GROUND = '#f4f6f9';

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hanken Grotesk', Roboto, Helvetica, Arial, sans-serif";

/** Minimal HTML escaping for values interpolated into a template. */
const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface ShellInput {
  readonly title: string;
  readonly preheader: string;
  readonly body: string;
  readonly footerNote?: string;
}

/**
 * The shared frame: logo lockup, white card, footer. `preheader` is the grey preview line a
 * client shows next to the subject — hidden in the body so it is not shown twice.
 */
const shell = ({ title, preheader, body, footerNote }: ShellInput): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:${GROUND};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

<tr><td style="padding:0 4px 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:36px;height:36px;background:${ACCENT};border-radius:10px;text-align:center;vertical-align:middle;font-size:17px;font-weight:700;color:#ffffff;font-family:${FONT};">S</td>
    <td style="padding-left:10px;font-size:19px;font-weight:700;color:${INK};letter-spacing:-0.3px;font-family:${FONT};">Sentra</td>
  </tr></table>
</td></tr>

<tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:16px;padding:36px 34px;">
${body}
</td></tr>

<tr><td style="padding:22px 8px 0;text-align:center;font-size:12px;line-height:19px;color:${FAINT};font-family:${FONT};">
  ${footerNote === undefined ? '' : `<p style="margin:0 0 10px;">${footerNote}</p>`}
  <p style="margin:0;">Sentra — real-time scam prevention.<br>Recommendations are advisory; the bank always makes the final decision.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

/** Primary call-to-action. Uses a table so Outlook renders the padding. */
const button = (href: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;"><tr>
  <td style="background:${ACCENT};border-radius:10px;">
    <a href="${escape(href)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:${FONT};">${escape(label)}</a>
  </td>
</tr></table>`;

/** Fallback for clients that strip links, and for anyone who wants to see the destination. */
const rawLink = (href: string): string => `
<p style="margin:18px 0 0;font-size:12px;line-height:19px;color:${FAINT};font-family:${FONT};">
  If the button doesn’t work, paste this into your browser:<br>
  <span style="color:${MUTED};word-break:break-all;">${escape(href)}</span>
</p>`;

const heading = (text: string): string =>
  `<h1 style="margin:0 0 12px;font-size:23px;line-height:31px;font-weight:700;color:${INK};letter-spacing:-0.4px;font-family:${FONT};">${escape(text)}</h1>`;

const paragraph = (html: string): string =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${MUTED};font-family:${FONT};">${html}</p>`;

/** A quiet detail panel, e.g. "you were invited as ANALYST". */
const detailRows = (rows: readonly { label: string; value: string }[]): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;background:${GROUND};border:1px solid ${LINE};border-radius:12px;">
${rows
  .map(
    (row, index) => `<tr>
  <td style="padding:${index === 0 ? '14px' : '10px'} 16px ${index === rows.length - 1 ? '14px' : '10px'};font-size:13px;color:${FAINT};font-family:${FONT};">${escape(row.label)}</td>
  <td align="right" style="padding:${index === 0 ? '14px' : '10px'} 16px ${index === rows.length - 1 ? '14px' : '10px'};font-size:13px;font-weight:600;color:${INK};font-family:${FONT};">${escape(row.value)}</td>
</tr>`,
  )
  .join('')}
</table>`;

const ROLE_BLURB: Record<string, string> = {
  OWNER: 'full control, including members and billing',
  ADMIN: 'manage members, API keys and settings',
  ANALYST: 'review scam cases and recommendations',
  AUDITOR: 'read-only access to the audit trail',
  OPERATOR: 'day-to-day monitoring of the pipeline',
};

export interface InvitationEmailInput {
  readonly organizationName: string;
  readonly role: string;
  readonly acceptUrl: string;
  readonly inviterName?: string;
  readonly expiresInDays: number;
}

export const renderInvitationEmail = (input: InvitationEmailInput): RenderedEmail => {
  const inviter =
    input.inviterName === undefined || input.inviterName.trim() === ''
      ? 'Your team'
      : escape(input.inviterName);
  const org = escape(input.organizationName);
  const blurb = ROLE_BLURB[input.role] ?? 'access to this organization';

  const body = [
    heading(`Join ${input.organizationName} on Sentra`),
    paragraph(
      `${inviter} invited you to help stop authorized-payment scams in real time. Accepting takes about a minute — you’ll choose a password and you’re in.`,
    ),
    detailRows([
      { label: 'Organization', value: input.organizationName },
      { label: 'Your role', value: input.role },
    ]),
    // Every role name begins with a vowel (owner, admin, analyst, auditor, operator).
    paragraph(
      `<span style="color:${FAINT};font-size:13px;">As an ${escape(input.role.toLowerCase())} you can ${blurb}.</span>`,
    ),
    button(input.acceptUrl, 'Accept invitation'),
    paragraph(
      `<span style="color:${FAINT};font-size:13px;">This invitation expires in ${input.expiresInDays} days and can only be used once.</span>`,
    ),
    rawLink(input.acceptUrl),
  ].join('\n');

  const text = [
    `Join ${input.organizationName} on Sentra`,
    '',
    `${input.inviterName ?? 'Your team'} invited you to help stop authorized-payment scams in real time.`,
    '',
    `Organization: ${input.organizationName}`,
    `Your role: ${input.role} — ${blurb}`,
    '',
    `Accept your invitation: ${input.acceptUrl}`,
    '',
    `This invitation expires in ${input.expiresInDays} days and can only be used once.`,
    'If you weren’t expecting this, you can ignore this email.',
  ].join('\n');

  return {
    subject: `${input.inviterName ?? 'You'} invited you to ${input.organizationName} on Sentra`,
    html: shell({
      title: `Join ${org} on Sentra`,
      preheader: `Accept your invitation to ${input.organizationName} — expires in ${input.expiresInDays} days.`,
      body,
      footerNote: 'If you weren’t expecting this invitation, you can safely ignore this email.',
    }),
    text,
  };
};

export interface WelcomeEmailInput {
  readonly organizationName: string;
  readonly consoleUrl: string;
  readonly docsUrl: string;
}

export const renderWelcomeEmail = (input: WelcomeEmailInput): RenderedEmail => {
  const body = [
    heading(`${input.organizationName} is set up`),
    paragraph(
      'Your organization starts in <strong>sandbox</strong>: synthetic data on an isolated network, so you can integrate and test before a single real payment is at stake.',
    ),
    detailRows([
      { label: 'Environment', value: 'Sandbox' },
      { label: 'Test keys', value: 'Available now' },
      { label: 'Live keys', value: 'After approval' },
    ]),
    paragraph(
      'Create a test key in <strong>API Keys</strong>, then send your first payment for evaluation — you’ll get back a risk score, the reason codes behind it, and a recommended action.',
    ),
    button(input.consoleUrl, 'Open the console'),
    paragraph(
      `<a href="${escape(input.docsUrl)}" style="color:${ACCENT};text-decoration:none;font-weight:600;font-size:14px;">Read the API docs →</a>`,
    ),
  ].join('\n');

  const text = [
    `${input.organizationName} is set up`,
    '',
    'Your organization starts in sandbox: synthetic data on an isolated network, so you can',
    'integrate and test before a single real payment is at stake.',
    '',
    'Environment: Sandbox',
    'Test keys: available now',
    'Live keys: after approval',
    '',
    `Open the console: ${input.consoleUrl}`,
    `API docs: ${input.docsUrl}`,
  ].join('\n');

  return {
    subject: `Welcome to Sentra — ${input.organizationName} is ready`,
    html: shell({
      title: `${input.organizationName} is set up`,
      preheader: 'Your sandbox is ready — create a test key and evaluate your first payment.',
      body,
    }),
    text,
  };
};
