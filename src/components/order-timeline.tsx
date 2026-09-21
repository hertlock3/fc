import { CheckCircle2, Circle, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { OrderEvent } from "@/lib/types";

/** Vertical timeline of everything that has happened to an order. */
export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {events.map((event, index) => {
        const isLatest = index === events.length - 1;
        return (
          <li key={event.id} className="relative">
            <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-white">
              {isLatest ? (
                <Clock className="h-4 w-4 text-brand-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-brand-500" />
              )}
            </span>
            <p className="text-sm font-medium text-slate-800">{event.message}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDateTime(event.created_at)} · {event.actor}
            </p>
          </li>
        );
      })}
      <li className="relative">
        <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-white">
          <Circle className="h-3 w-3 text-slate-300" />
        </span>
        <p className="text-sm text-slate-400">Tracking updates appear here.</p>
      </li>
    </ol>
  );
}
