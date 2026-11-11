export interface Meeting {
  id: string;
  title: string;
  calendar: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  meetUrl?: string;
}

export type CalendarReply = {
  type: 'calendar.snapshot';
  events: Meeting[];
  updatedAt: number;
  error: string | null;
};

export function isSnapshot(value: unknown): value is CalendarReply {
  if (!value || typeof value !== 'object') return false;
  const v = value as CalendarReply;
  return (
    v.type === 'calendar.snapshot' &&
    Number.isFinite(v.updatedAt) &&
    (v.error === null || typeof v.error === 'string') &&
    Array.isArray(v.events) &&
    v.events.every(
      e =>
        e &&
        typeof e.id === 'string' &&
        typeof e.title === 'string' &&
        typeof e.calendar === 'string' &&
        typeof e.location === 'string' &&
        (e.meetUrl === undefined ||
          (typeof e.meetUrl === 'string' &&
            /^(?:https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3})?$/.test(e.meetUrl))) &&
        typeof e.allDay === 'boolean' &&
        Number.isFinite(e.start) &&
        Number.isFinite(e.end) &&
        e.end >= e.start,
    )
  );
}

export function agenda(events: Meeting[], now: number): Meeting[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return events
    .filter(e => e.start < end.getTime() && e.end > now)
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export const time = (date: number) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const day = (date: number) =>
  new Date(date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export function timeUntil(start: number, now: number): string {
  const minutes = Math.ceil((start - now) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
