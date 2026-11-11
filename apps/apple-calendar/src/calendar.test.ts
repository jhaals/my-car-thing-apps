import { describe, expect, test } from 'bun:test';
import { agenda, isSnapshot, time, timeUntil, type Meeting } from './calendar';

const now = new Date(2026, 10, 9, 12).getTime();
const at = (date: number, hour: number) => new Date(2026, 10, date, hour).getTime();
const meeting = (id: string, start: number, end: number): Meeting => ({
  id,
  start,
  end,
  title: id,
  calendar: 'Work',
  location: '',
  allDay: false,
});

describe('today’s agenda', () => {
  test('keeps ongoing and upcoming meetings today, hides ended meetings and tomorrow', () => {
    const events = [
      meeting('tomorrow', at(10, 9), at(10, 10)),
      meeting('afternoon', at(9, 14), at(9, 15)),
      meeting('morning', at(9, 9), at(9, 10)),
      meeting('ongoing', at(9, 11), at(9, 13)),
      meeting('just-ended', at(9, 11), now),
      meeting('overnight', at(8, 23), at(9, 1)),
      meeting('yesterday', at(8, 22), at(9, 0)),
      { ...meeting('all-day', at(9, 0), at(10, 0)), allDay: true },
    ];
    expect(agenda(events, now).map(e => e.id)).toEqual(['all-day', 'ongoing', 'afternoon']);
    expect(events[0].id).toBe('tomorrow');
  });

  test('uses the new local day after midnight', () => {
    expect(agenda([meeting('next', at(10, 9), at(10, 10))], at(10, 0))).toHaveLength(1);
    expect(agenda([], now)).toEqual([]);
    const instant = meeting('instant', at(9, 13), at(9, 13));
    expect(agenda([instant], now)).toEqual([instant]);
    expect(agenda([instant], at(9, 13))).toEqual([]);
    expect(isSnapshot({ type: 'calendar.snapshot', updatedAt: now, error: null, events: [instant] })).toBe(true);
  });
});

test('validates every forwarded event and error response', () => {
  const snapshot = { type: 'calendar.snapshot', updatedAt: now, error: null, events: [meeting('ok', now, now + 1)] };
  expect(isSnapshot(snapshot)).toBe(true);
  expect(isSnapshot({ ...snapshot, events: [], error: 'Access denied' })).toBe(true);
  for (const value of [
    null,
    {},
    { ...snapshot, updatedAt: 'today' },
    { ...snapshot, events: [null] },
    { ...snapshot, events: [{ ...snapshot.events[0], end: now - 1 }] },
    { ...snapshot, events: [{ ...snapshot.events[0], start: 'invalid' }] },
  ]) {
    expect(isSnapshot(value)).toBe(false);
  }
});

test('accepts Google Meet links and older helpers, rejects malformed links', () => {
  const event = meeting('meet', now, now + 1);
  const snapshot = { type: 'calendar.snapshot', updatedAt: now, error: null, events: [event] };
  for (const meetUrl of [undefined, '', 'https://meet.google.com/abc-defg-hij']) {
    expect(isSnapshot({ ...snapshot, events: [{ ...event, meetUrl }] })).toBe(true);
  }
  for (const meetUrl of [null, 42, 'javascript:alert(1)', 'https://meet.google.com.evil.test/abc-defg-hij']) {
    expect(isSnapshot({ ...snapshot, events: [{ ...event, meetUrl }] })).toBe(false);
  }
});

test('formats times in 24-hour format including midnight', () => {
  expect(time(at(9, 0))).toBe('00:00');
  expect(time(at(9, 9))).toBe('09:00');
  expect(time(at(9, 13))).toBe('13:00');
});

test('formats meeting countdowns with minutes below an hour and hours above', () => {
  expect(timeUntil(now + 1, now)).toBe('1 min');
  expect(timeUntil(now + 47 * 60_000, now)).toBe('47 min');
  expect(timeUntil(now + 59 * 60_000, now)).toBe('59 min');
  expect(timeUntil(now + 60 * 60_000, now)).toBe('1h');
  expect(timeUntil(now + 61 * 60_000, now)).toBe('1h 1m');
  expect(timeUntil(now + 120 * 60_000, now)).toBe('2h');
  expect(timeUntil(now + 167 * 60_000, now)).toBe('2h 47m');
});
