'use client';

import { useEffect, useState } from 'react';
import type { OrganizationApprovalStatus, OrganizationDetailResponse } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { Badge, ErrorNotice, Panel, Skeleton } from '@/components/ui';
import { getCurrentOrg, requestGoLive, type ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

// Your team's contact details, shown to organizations we want to speak with before approving.
// Replace these with your real number and scheduling link.
const SUPPORT_PHONE = '+1 (555) 010-2030';
const BOOKING_URL = 'https://cal.com/sentra/go-live';

const STATUS: Record<
  OrganizationApprovalStatus,
  { label: string; badge: string; title: string; body: string }
> = {
  SANDBOX: {
    label: 'Sandbox',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    title: 'You’re on the sandbox network',
    body: 'Test keys work now against synthetic data. Request production access to process real traffic — our team reviews every applicant.',
  },
  PENDING_REVIEW: {
    label: 'Under review',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    title: 'Your request is under review',
    body: 'Thanks — our team is reviewing your organization for production access. We’ll be in touch shortly.',
  },
  NEEDS_CONTACT: {
    label: 'Action needed',
    badge: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    title: 'Our team would like to talk',
    body: 'Before approving production access we’d like a short call to understand your use case. Book a time or reach us directly below.',
  },
  APPROVED: {
    label: 'Approved · Production',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    title: 'You’re approved for production',
    body: 'Your organization can process real traffic. Live keys are unlocked on the API Keys page.',
  },
  DECLINED: {
    label: 'Declined',
    badge: 'border-red-500/30 bg-red-500/10 text-red-300',
    title: 'Production access wasn’t approved',
    body: 'Your last request wasn’t approved. You can update your details and request again, or talk to our team.',
  },
};

export default function OrganizationPage() {
  const [org, setOrg] = useState<OrganizationDetailResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await getCurrentOrg();
    if (result.data !== undefined) {
      setOrg(result.data);
      setError(null);
    } else if (result.error !== undefined) {
      setError(result.error);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onRequest = async () => {
    setBusy(true);
    setError(null);
    const result = await requestGoLive();
    setBusy(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    void load();
  };

  const status = org === null ? null : STATUS[org.approvalStatus];
  const canRequest =
    org !== null && (org.approvalStatus === 'SANDBOX' || org.approvalStatus === 'DECLINED');
  const showContact =
    org !== null &&
    (org.approvalStatus === 'NEEDS_CONTACT' || org.approvalStatus === 'PENDING_REVIEW');

  return (
    <>
      <PageHeader
        title="Organization"
        description="Your company details and production-access status. New organizations start in sandbox and are approved by the Sentra team."
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorNotice message={error.message} />
        </div>
      )}

      {org === null || status === null ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Production access" className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <Badge className={status.badge}>{status.label}</Badge>
              {org.approvalStatus === 'APPROVED' && (
                <span className="text-xs text-slate-500">Live keys enabled</span>
              )}
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-100">{status.title}</h3>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">{status.body}</p>

            {canRequest && (
              <button
                type="button"
                onClick={onRequest}
                disabled={busy}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-semibold text-white shadow-[var(--t-shadow)] hover:bg-sky-600 disabled:opacity-60"
              >
                {busy
                  ? 'Submitting…'
                  : org.approvalStatus === 'DECLINED'
                    ? 'Request again'
                    : 'Request production access'}
              </button>
            )}

            {showContact && (
              <div className="mt-5 rounded-xl border border-slate-800 bg-[var(--t-card-2)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Talk to our team
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={BOOKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
                      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                    </svg>
                    Book a call
                  </a>
                  <a
                    href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}
                    className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-slate-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" />
                    </svg>
                    {SUPPORT_PHONE}
                  </a>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Company details">
            <dl className="space-y-3 text-sm">
              <Detail label="Name" value={org.legalName} />
              <Detail label="Type" value={org.type === 'BANK' ? 'Bank' : 'Telecom'} />
              <Detail label="Country" value={org.jurisdiction} />
              <Detail label="Currency" value={org.defaultCurrency} />
              <Detail label="Handle" value={org.slug} mono />
              <Detail label="Created" value={formatDateTime(org.createdAt)} />
            </dl>
          </Panel>
        </div>
      )}
    </>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
