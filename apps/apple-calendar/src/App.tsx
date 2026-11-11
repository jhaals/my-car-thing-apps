import { BridgethingClient, type ConnectionState } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agenda, day, isSnapshot, time, timeUntil, type CalendarReply, type Meeting } from './calendar';
import { daemonUrl } from './daemon';

function when(meeting: Meeting) {
  return meeting.allDay ? 'All day' : `${time(meeting.start)} – ${time(meeting.end)}`;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [connection, setConnection] = useState<ConnectionState>(client.connectionState);
  const [snapshot, setSnapshot] = useState<CalendarReply | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [meetStatus, setMeetStatus] = useState('');
  const [refreshing, setRefreshing] = useState(0);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const meetings = agenda(snapshot?.events ?? [], now);
  const selectedIndex = meetings.findIndex(e => e.id === selectedId);
  const index =
    selectedIndex >= 0
      ? selectedIndex
      : Math.max(
          0,
          meetings.findIndex(e => !e.allDay && e.end > now),
        );
  const selected = meetings[index];
  const selectedIdRef = useRef<string | undefined>(undefined);
  selectedIdRef.current = selected?.id;
  const offline = connection !== 'open' || (receivedAt > 0 && now - receivedAt > 45_000);
  const waiting = !snapshot && now - receivedAt < 20_000;

  const refresh = useCallback(
    (force = false) => {
      if (force) setRefreshing(Date.now());
      return client.forward.json({ type: 'calendar.refresh', force }).catch(() => setRefreshing(0));
    },
    [client],
  );

  const openMeet = useCallback(() => {
    if (!selected?.meetUrl || meetStatus === 'Opening Google Meet…') return;
    setMeetStatus('Opening Google Meet…');
    void client.forward.json({ type: 'calendar.openMeet', id: selected.id }).catch(() => {
      setMeetStatus('Could not reach your Mac. Check the connection and try again.');
    });
  }, [client, selected, meetStatus]);

  useEffect(() => {
    setMeetStatus('');
  }, [selected?.id]);
  useEffect(() => {
    if (meetStatus !== 'Opening Google Meet…') return;
    const timer = setTimeout(
      () => setMeetStatus('No response from your Mac. Check the connection and try again.'),
      20_000,
    );
    return () => clearTimeout(timer);
  }, [meetStatus]);

  useEffect(() => {
    setReceivedAt(Date.now());
    const offConnection = client.on(event => {
      if (event.type === 'open' || event.type === 'close' || event.type === 'connecting') {
        setConnection(client.connectionState);
        if (event.type === 'open') void refresh();
      }
    });
    const offMessage = client.forward.onJson(value => {
      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'calendar.meetOpened' &&
        'id' in value &&
        typeof value.id === 'string' &&
        'error' in value &&
        (value.error === null || typeof value.error === 'string')
      ) {
        if (value.id === selectedIdRef.current) setMeetStatus(value.error ?? 'Google Meet opened on your Mac.');
        return;
      }
      if (!isSnapshot(value)) return;
      setSnapshot(value);
      setReceivedAt(Date.now());
      setRefreshing(0);
    });
    void refresh();
    const heartbeat = setInterval(() => void refresh(), 15_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      offConnection();
      offMessage();
      clearInterval(heartbeat);
      clearInterval(tick);
    };
  }, [client, refresh]);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  useEffect(() => {
    function move(direction: number) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const next = meetings[Math.max(0, Math.min(meetings.length - 1, index + direction))];
      if (next) setSelectedId(next.id);
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Enter' && event.repeat) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
      if (['1', '2', '3', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'm'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '1' || event.key === 'ArrowUp') move(-1);
        if (event.key === '2' || event.key === 'ArrowDown') move(1);
        if (event.key === '3') {
          setSelectedId(null);
          setDetails(false);
        }
        if (event.key === 'Enter' && selected && !event.repeat) {
          if (details) openMeet();
          else setDetails(true);
        }
        if (event.key === 'm' && selected) setDetails(v => !v);
        if (event.key === 'Escape') {
          setDetails(false);
          void refresh(true);
        }
      }
    }
    function wheel(event: WheelEvent) {
      if (!event.deltaX) return;
      event.preventDefault();
      move(Math.sign(event.deltaX));
    }
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
    };
  }, [meetings, index, selected, refresh, details, openMeet]);

  const status = offline
    ? 'Mac disconnected'
    : snapshot?.error
      ? 'Setup needed'
      : snapshot
        ? 'Calendar synced'
        : 'Connecting to Mac';
  const error =
    snapshot?.error ??
    (!snapshot && !waiting ? 'Open bridgething on your Mac and enable the Apple Calendar extension.' : null);

  return (
    <main className="calendar-app">
      <header>
        <div className="date-heading">
          <span className="date-tile">{new Date(now).getDate()}</span>
          <div>
            <h1>Today</h1>
            <p>{day(now)}</p>
          </div>
        </div>
        <div className="clock">
          <time>{time(now)}</time>
          <p className={offline || error ? 'status warning' : 'status'}>{status}</p>
        </div>
      </header>

      {error || !snapshot || !meetings.length ? (
        <section className="empty" aria-live="polite">
          <span className="empty-mark" aria-hidden="true">
            {error ? '!' : '—'}
          </span>
          <h2>
            {error
              ? 'Connect your calendar'
              : !snapshot
                ? waiting
                  ? 'Loading today’s meetings…'
                  : 'Waiting for your Mac'
                : offline
                  ? 'Mac disconnected'
                  : 'Your day is clear'}
          </h2>
          <p>
            {error ??
              (!snapshot || offline
                ? 'Keep bridgething open on your Mac to load today’s meetings.'
                : 'No more meetings today. New meetings appear automatically.')}
          </p>
          <button className="refresh-button" onClick={() => void refresh(true)}>
            Refresh calendar
          </button>
        </section>
      ) : details && selected ? (
        <section className="meeting-detail">
          <button className="back" onClick={() => setDetails(false)}>
            Back to today
          </button>
          <p className="detail-time">
            {when(selected)}
            {selected.start <= now && selected.end > now && !selected.allDay ? ' · In progress' : ''}
          </p>
          <h2>{selected.title}</h2>
          <p className="calendar-name">{selected.calendar}</p>
          {selected.location && <p className="detail-location">{selected.location}</p>}
          {selected.meetUrl && (
            <>
              <p className="detail-location">Google Meet: {selected.meetUrl}</p>
              <button
                className="details-button"
                disabled={offline || meetStatus === 'Opening Google Meet…'}
                onClick={openMeet}>
                {meetStatus === 'Opening Google Meet…' ? 'Opening…' : 'Open Google Meet on Mac'}
              </button>
              <p className="calendar-name" role="status">
                {meetStatus}
              </p>
            </>
          )}
          {offline && <p className="warning">Mac disconnected. Showing the last calendar update.</p>}
        </section>
      ) : (
        <section className="agenda-layout" aria-label="Today’s meetings">
          <div className="meeting-list">
            {meetings.map((meeting, i) => (
              <button
                key={meeting.id}
                ref={i === index ? selectedRow : undefined}
                className={`meeting-row ${i === index ? 'selected' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  setSelectedId(meeting.id);
                  setDetails(true);
                }}>
                <span className="row-time">
                  {meeting.allDay ? 'All day' : time(meeting.start)}
                  <small>{meeting.allDay ? '' : time(meeting.end)}</small>
                </span>
                <span className="row-content">
                  <strong>{meeting.title}</strong>
                  <small>{meeting.calendar}</small>
                </span>
                {meeting.start <= now && meeting.end > now && !meeting.allDay && (
                  <span className="live-dot" aria-label="In progress" />
                )}
              </button>
            ))}
          </div>
          {selected && (
            <aside>
              <p className="countdown">
                {selected.allDay
                  ? 'All day'
                  : selected.start <= now
                    ? 'In progress'
                    : `In ${timeUntil(selected.start, now)}`}
              </p>
              <h2>{selected.title}</h2>
              <p>{when(selected)}</p>
              {selected.location && <p className="location">{selected.location}</p>}
              <button className="details-button" onClick={() => setDetails(true)}>
                Meeting details
              </button>
            </aside>
          )}
        </section>
      )}

      <footer>
        <span>
          {details && selected?.meetUrl
            ? 'Press wheel to open Google Meet on Mac'
            : 'Wheel to browse · Press for details'}
        </span>
        <button onClick={() => void refresh(true)}>
          {refreshing > 0 && now - refreshing < 25_000 ? 'Refreshing…' : 'Back · Refresh'}
        </button>
      </footer>
    </main>
  );
}
