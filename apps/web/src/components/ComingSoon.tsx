import { PageHeader } from './PageHeader';
import { Panel } from './ui';

/** Honest placeholder for screens scheduled in a later slice. No fabricated data. */
export function ComingSoon({
  title,
  slice,
  summary,
  planned,
}: {
  title: string;
  slice: string;
  summary: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={summary} />
      <Panel title={`Planned for ${slice}`}>
        <p className="text-sm text-slate-400">
          This screen is intentionally not implemented yet. It will be built when its backing
          capability lands, rather than shown with fabricated data now.
        </p>
        <ul className="mt-4 space-y-2">
          {planned.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
