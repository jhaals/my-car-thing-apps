import { afterAll, expect, mock, test } from 'bun:test';
import type { ExtensionContext, ExtensionSpec, MessageListener } from '@bridgething/extension';

const url = 'https://meet.google.com/abc-defg-hij';
const calls: { command: string; args?: string[] }[] = [];
const replies: unknown[] = [];
const removed: string[] = [];
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
      constructor(command: string, options: { args?: string[] }) {
        calls.push({ command, args: options.args });
      }
      async output() {
        return {
          success: true,
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
      log: { error: () => {} },
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
  listener(device, { encoding: 'json', data });
  await Bun.sleep(0);
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
