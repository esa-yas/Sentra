'use client';

import dynamic from 'next/dynamic';
import '@scalar/api-reference-react/style.css';
import { openApiSpec } from '@/lib/openapi';

// Scalar is a heavy client-only widget; load it without SSR so it hydrates cleanly. It renders
// the full three-panel API reference (guides in the description, endpoints, and an interactive
// "try it" console) from the OpenAPI spec.
const ApiReference = dynamic(
  () => import('@scalar/api-reference-react').then((mod) => mod.ApiReferenceReact),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading API reference…
      </div>
    ),
  },
);

export default function DocsPage() {
  return (
    <div className="fixed inset-0 overflow-auto bg-[#0b0e15]">
      <ApiReference
        configuration={{
          content: openApiSpec,
          hideDownloadButton: false,
          hideTestRequestButton: false,
          metaData: {
            title: 'Sentra API Reference',
            description: 'Integrate real-time scam prevention with the Sentra API.',
          },
        }}
      />
    </div>
  );
}
