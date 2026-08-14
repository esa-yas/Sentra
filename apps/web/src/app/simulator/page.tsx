'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RecommendationView, SimulatorEvaluateRequest, SimulatorScenario } from '@sentra/contracts';
import { PageHeader } from '@/components/PageHeader';
import { RecommendationDetail } from '@/components/RecommendationDetail';
import { CorrelationTag, ErrorNotice, Panel } from '@/components/ui';
import { evaluate, getScenarios, type ApiError } from '@/lib/api';

const TELECOM_OPTIONS = ['OK', 'OK_NO_SIGNALS', 'NO_CONSENT', 'UNAVAILABLE'] as const;
const REPUTATION_OPTIONS = ['UNKNOWN', 'TRUSTED', 'SUSPECT', 'KNOWN_BAD'] as const;
const IDENTITY_OPTIONS = ['NOT_CHECKED', 'PASS', 'FAIL'] as const;

type FormState = Required<
  Pick<
    SimulatorEvaluateRequest,
    | 'paymentAmount'
    | 'currency'
    | 'payeeAgeDays'
    | 'firstTimePayee'
    | 'paymentVelocity24h'
    | 'telecomEvidence'
    | 'recentSuspiciousCall'
    | 'callerReputation'
    | 'callDurationSeconds'
    | 'deviceChange'
    | 'accountTakeoverIndicators'
    | 'scamCampaignMatch'
    | 'customerVulnerability'
    | 'identityVerificationResult'
    | 'previousWarnings'
  >
>;

const INITIAL: FormState = {
  paymentAmount: 8400,
  currency: 'GBP',
  payeeAgeDays: 0,
  firstTimePayee: true,
  paymentVelocity24h: 2,
  telecomEvidence: 'OK',
  recentSuspiciousCall: true,
  callerReputation: 'KNOWN_BAD',
  callDurationSeconds: 900,
  deviceChange: false,
  accountTakeoverIndicators: false,
  scamCampaignMatch: true,
  customerVulnerability: true,
  identityVerificationResult: 'PASS',
  previousWarnings: 0,
};

export default function SimulatorPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [scenarios, setScenarios] = useState<SimulatorScenario[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationView | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getScenarios().then((result) => {
      if (result.data !== undefined) {
        setScenarios(result.data.items);
      }
    });
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loadScenario = (scenario: SimulatorScenario) => {
    setForm({ ...INITIAL, ...scenario.input } as FormState);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await evaluate(form as SimulatorEvaluateRequest);
    if (result.data !== undefined) {
      setRecommendation(result.data.recommendation);
      setCorrelationId(result.correlationId ?? result.data.recommendation.correlationId);
    } else if (result.error !== undefined) {
      setError(result.error);
    }
    setSubmitting(false);
  };

  return (
    <>
      <PageHeader
        title="Risk Decision Simulator"
        description="Enter synthetic inputs and call the real decision API. The result is an advisory recommendation — the bank always decides."
        actions={
          recommendation !== null ? (
            <Link
              href={`/system-flow?correlationId=${encodeURIComponent(recommendation.correlationId)}`}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              View in System Flow →
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Panel title="Preset scenarios" description="Load a named synthetic case, then tune it.">
            <div className="flex flex-wrap gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => loadScenario(scenario)}
                  title={scenario.description}
                  className="rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-xs text-slate-200 hover:border-sky-500/50 hover:text-sky-200"
                >
                  {scenario.name}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Synthetic inputs">
            <div className="space-y-4">
              <Field label="Payment amount">
                <NumberInput value={form.paymentAmount} onChange={(v) => set('paymentAmount', v)} />
              </Field>
              <Field label="Currency">
                <TextInput value={form.currency} onChange={(v) => set('currency', v.toUpperCase().slice(0, 3))} />
              </Field>
              <Field label="Payee age (days)">
                <NumberInput value={form.payeeAgeDays} onChange={(v) => set('payeeAgeDays', v)} />
              </Field>
              <Field label="Payment velocity (24h)">
                <NumberInput value={form.paymentVelocity24h} onChange={(v) => set('paymentVelocity24h', v)} />
              </Field>
              <Field label="Call duration (seconds)">
                <NumberInput value={form.callDurationSeconds} onChange={(v) => set('callDurationSeconds', v)} />
              </Field>
              <Field label="Previous warnings">
                <NumberInput value={form.previousWarnings} onChange={(v) => set('previousWarnings', v)} />
              </Field>

              <Field label="Telecom evidence">
                <Select
                  value={form.telecomEvidence}
                  options={TELECOM_OPTIONS}
                  onChange={(v) => set('telecomEvidence', v as FormState['telecomEvidence'])}
                />
              </Field>
              <Field label="Caller reputation">
                <Select
                  value={form.callerReputation}
                  options={REPUTATION_OPTIONS}
                  onChange={(v) => set('callerReputation', v as FormState['callerReputation'])}
                />
              </Field>
              <Field label="Identity verification">
                <Select
                  value={form.identityVerificationResult}
                  options={IDENTITY_OPTIONS}
                  onChange={(v) => set('identityVerificationResult', v as FormState['identityVerificationResult'])}
                />
              </Field>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <Toggle label="First-time payee" checked={form.firstTimePayee} onChange={(v) => set('firstTimePayee', v)} />
                <Toggle label="Recent suspicious call" checked={form.recentSuspiciousCall} onChange={(v) => set('recentSuspiciousCall', v)} />
                <Toggle label="Device change" checked={form.deviceChange} onChange={(v) => set('deviceChange', v)} />
                <Toggle label="Account-takeover indicators" checked={form.accountTakeoverIndicators} onChange={(v) => set('accountTakeoverIndicators', v)} />
                <Toggle label="Scam campaign match" checked={form.scamCampaignMatch} onChange={(v) => set('scamCampaignMatch', v)} />
                <Toggle label="Customer vulnerability" checked={form.customerVulnerability} onChange={(v) => set('customerVulnerability', v)} />
              </div>

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {submitting ? 'Evaluating…' : 'Evaluate risk'}
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          {error !== null && <ErrorNotice message={`${error.code}: ${error.message}`} />}
          {recommendation === null ? (
            <Panel>
              <p className="text-sm text-slate-400">
                Submit synthetic inputs to see the explainable recommendation: score, level, reason
                codes, contributing signals, missing providers, rules, versions, processing time,
                correlation id, and the audit events generated.
              </p>
            </Panel>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <CorrelationTag correlationId={correlationId} />
              </div>
              <RecommendationDetail recommendation={recommendation} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
    />
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-sky-500"
      />
    </label>
  );
}
