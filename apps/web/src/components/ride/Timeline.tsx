import { formatDateTime } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/status';
import type { TimelineEvent } from '@/lib/types';

const WHO: Record<string, string> = {
  YOU: 'You',
  DRIVER: 'Driver',
  SYSTEM: 'Dhaka Tesla Pool',
  PASSENGER: 'Passenger',
};

// A ride's or trip's audit log. `labels` turns status codes into words.
export function Timeline({
  events,
  labels = STATUS_LABEL,
}: {
  events: TimelineEvent[];
  labels?: Record<string, string>;
}) {
  return (
    <ol className="relative space-y-4 border-l border-stone-200 pl-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-brand-500"
            aria-hidden
          />
          <p className="text-sm font-semibold">{labels[e.toStatus] ?? e.toStatus}</p>
          <p className="text-xs text-stone-500">
            {formatDateTime(e.at)}
            {e.by && ` · ${WHO[e.by] ?? e.by}`}
          </p>
          {e.reason && <p className="mt-0.5 text-sm text-stone-600">{e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
