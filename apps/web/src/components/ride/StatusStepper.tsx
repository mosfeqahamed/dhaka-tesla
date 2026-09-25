import { RIDE_STEPS, stepIndex } from '@/lib/status';
import type { RideStatus } from '@/lib/types';

export function StatusStepper({ status }: { status: RideStatus }) {
  const current = stepIndex(status);
  return (
    <ol className="space-y-2" aria-label="Ride progress">
      {RIDE_STEPS.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={step.status}
            className="flex items-center gap-3"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                state === 'done'
                  ? 'bg-brand-600 text-white'
                  : state === 'current'
                    ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500'
                    : 'bg-stone-100 text-stone-400'
              }`}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span
              className={`text-sm ${state === 'todo' ? 'text-stone-400' : 'font-medium text-stone-800'}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
