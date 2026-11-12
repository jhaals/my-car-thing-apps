import { afterAll, expect, mock, test } from 'bun:test';
import type { ExtensionContext, ExtensionSpec, MessageListener } from '@bridgething/extension';

const url = 'https://meet.google.com/abc-defg-hij';
const calls: { command: string; args?: string[] }[] = [];
const replies: unknown[] = [];
const removed: string[] = [];
const launchResults: number[] = [];
const errors: string[] = [];
let listener: MessageListener;
const event = {
  id: 'known',
  title: 'Meeting',
  calendar: 'Work',
  start: 1,
  end: 2,
  allDay: false,
  location: '',
  meetUrl: url,
};
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
Object.defineProperty(globalThis, 'Deno', {
  configurable: true,
  value: {
    build: { os: 'darwin' },
    errors: { NotFound: class extends Error {} },
    makeTempFile: async () => '/private/calendar-test-response.json',
    readTextFile: async () =>
      JSON.stringify({ type: 'calendar.snapshot', events: [event], updatedAt: Date.now(), error: null }),
    remove: async (path: string) => {
      removed.push(path);
    },
    Command: class {
      constructor(
        private command: string,
        private options: { args?: string[] },
      ) {}
      async output() {
        calls.push({ command: this.command, args: this.options.args });
        const code = this.options.args?.includes('-W') ? (launchResults.shift() ?? 0) : 0;
        return {
          success: code === 0,
          code,
          stderr: new TextEncoder().encode(code ? 'LaunchServices unavailable' : ''),
          stdout: new TextEncoder().encode(
            JSON.stringify({
              type: 'calendar.snapshot',
              events: [event],
              updatedAt: Date.now(),
              error: null,
            }),
          ),
        };
      }
    },
  },
});
mock.module('@bridgething/extension', () => ({
  asJson: (message: { data: unknown }) => message.data,
  json: (value: unknown) => value,
  defineExtension: async (spec: ExtensionSpec) =>
    spec.start({
      on: (_name: string, fn: MessageListener) => {
        listener = fn;
      },
      log: { error: (error: string) => errors.push(error) },
    } as unknown as ExtensionContext),
}));
await import('./main');
const device = {
  id: 'test',
  name: 'Test',
  connected: true,
  config: {},
  active: true,
  send: (message: unknown) => {
    replies.push(message);
  },
};
async function request(data: unknown) {
  const previousReplies = replies.length;
  listener(device, { encoding: 'json', data });
  if (device.active) {
    const deadline = Date.now() + 3_000;
    while (replies.length === previousReplies && Date.now() < deadline) await Bun.sleep(5);
    expect(replies.length).toBeGreaterThan(previousReplies);
  }
}

afterAll(() => {
  mock.restore();
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

test('opens only the stored Meet link for an active device, and never a supplied URL', async () => {
  await request({ type: 'calendar.refresh' });
  expect(calls).toHaveLength(1);
  expect(calls[0].command).toBe('/usr/bin/open');
  expect(calls[0].args?.slice(0, 4)).toEqual(['-W', '-n', '--stdout', '/private/calendar-test-response.json']);
  expect(calls[0].args?.at(-1)).toEndWith('/Bridgething Apple Calendar.app');
  expect(removed).toEqual(['/private/calendar-test-response.json']);
  await request({ type: 'calendar.openMeet', id: 'known', url: 'https://evil.test' });
  expect(calls[1]).toEqual({ command: '/usr/bin/open', args: [url] });
  expect(replies.at(-1)).toEqual({ type: 'calendar.meetOpened', id: 'known', error: null });
  await request({ type: 'calendar.openMeet', id: 'unknown', url });
  expect(calls).toHaveLength(2);
  expect(replies.at(-1)).toMatchObject({ type: 'calendar.meetOpened', id: 'unknown', error: expect.any(String) });
  device.active = false;
  await request({ type: 'calendar.openMeet', id: 'known' });
  expect(calls).toHaveLength(2);
});

test('retries a transient launch failure automatically and shares the pending refresh', async () => {
  device.active = true;
  const previousCalls = calls.length;
  const previousRemoved = removed.length;
  launchResults.push(1, 0);
  await Promise.all([
    request({ type: 'calendar.refresh', force: true }),
    request({ type: 'calendar.refresh', force: true }),
  ]);
  expect(calls.length - previousCalls).toBe(2);
  expect(removed.length - previousRemoved).toBe(1);
  expect(replies.at(-1)).toMatchObject({ error: null, events: [event] });
  expect(errors).toHaveLength(0);
  await request({ type: 'calendar.refresh' });
  expect(calls.length - previousCalls).toBe(2);
});

test('reports macOS launch details after one retry and lets the next heartbeat recover', async () => {
  const previousCalls = calls.length;
  const previousRemoved = removed.length;
  launchResults.push(1, 1);
  await request({ type: 'calendar.refresh', force: true });
  expect(calls.length - previousCalls).toBe(2);
  expect(removed.length - previousRemoved).toBe(1);
  expect(replies.at(-1)).toMatchObject({ error: expect.any(String), events: [] });
  expect(errors.at(-1)).toContain('exit 1');
  expect(errors.at(-1)).toContain('LaunchServices unavailable');
  expect(errors.at(-1)).not.toContain('calendar:setup');
  await request({ type: 'calendar.refresh' });
  expect(calls.length - previousCalls).toBe(3);
  expect(replies.at(-1)).toMatchObject({ error: null, events: [event] });
});
