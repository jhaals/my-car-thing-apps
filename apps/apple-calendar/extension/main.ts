import { asJson, defineExtension, json } from '@bridgething/extension';
import { join } from 'node:path';
import { isSnapshot, type CalendarReply } from '../src/calendar';

let controller: AbortController | undefined;

await defineExtension({
  start(ctx) {
    let snapshot: CalendarReply | undefined;
    let pending: Promise<void> | undefined;
    let lastAttempt = 0;
    let openingMeet = false;

    function refresh(force = false): Promise<void> {
      if (pending) return pending;
      if (!force && snapshot && Date.now() - lastAttempt < 60_000) return Promise.resolve();
      lastAttempt = Date.now();
      controller = new AbortController();
      pending = (async () => {
        try {
          if (Deno.build.os !== 'darwin') throw new Error('This app needs a Mac running macOS 14 or newer.');
          const home = process.env.HOME;
          if (!home) throw new Error('The desktop extension could not find your home directory.');
          // shortcut: helper needs per-mac setup, bundle a signed helper before store distribution
          const directory = join(home, 'Library/Application Support/Bridgething Apple Calendar');
          const response = await Deno.makeTempFile({ dir: join(directory, 'responses'), prefix: 'calendar-' });
          let value: unknown;
          try {
            const output = await new Deno.Command('/usr/bin/open', {
              args: ['-W', '-n', '--stdout', response, join(directory, 'Bridgething Apple Calendar.app')],
              clearEnv: true,
              env: { HOME: home },
              stdin: 'null',
              stdout: 'null',
              stderr: 'piped',
              signal: AbortSignal.any([controller!.signal, AbortSignal.timeout(90_000)]),
            }).output();
            if (!output.success) throw new Error('Calendar helper could not launch. Run bun run calendar:setup.');
            value = JSON.parse(await Deno.readTextFile(response));
          } finally {
            await Deno.remove(response);
          }
          if (!isSnapshot(value)) throw new Error('Calendar helper returned an invalid response.');
          snapshot = value;
        } catch (error) {
          const missing = error instanceof Deno.errors.NotFound;
          snapshot = {
            type: 'calendar.snapshot',
            events: [],
            updatedAt: Date.now(),
            error: missing
              ? 'Set up Calendar on your Mac: run bun run calendar:setup in this repo.'
              : 'Could not read Calendar. Check the Mac extension and Calendar permissions, then refresh.',
          };
          ctx.log.error(missing ? 'Calendar helper is not installed. Run bun run calendar:setup.' : String(error));
        }
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    }

    async function openMeet(id: string): Promise<string | null> {
      const url = snapshot?.events.find(event => event.id === id)?.meetUrl;
      if (!url) return 'This event has no Google Meet link. Refresh your calendar and try again.';
      if (openingMeet) return 'A meeting link is already opening.';
      openingMeet = true;
      try {
        const output = await new Deno.Command('/usr/bin/open', {
          args: [url],
          clearEnv: true,
          env: { HOME: process.env.HOME! },
          stdin: 'null',
          stdout: 'null',
          stderr: 'piped',
          signal: AbortSignal.timeout(10_000),
        }).output();
        if (!output.success) throw new Error('macOS could not open the meeting link.');
        return null;
      } catch (error) {
        ctx.log.error(String(error));
        return 'Could not open Google Meet. Check the extension on your Mac and try again.';
      } finally {
        openingMeet = false;
      }
    }

    ctx.on('message', (device, message) => {
      const request = asJson<{ type?: string; force?: boolean; id?: string }>(message);
      if (!device.active) return;
      if (request?.type === 'calendar.openMeet' && typeof request.id === 'string') {
        const id = request.id;
        void openMeet(id).then(error => device.send(json({ type: 'calendar.meetOpened', id, error })));
        return;
      }
      if (request?.type !== 'calendar.refresh') return;
      void refresh(request.force === true).then(() => {
        if (snapshot && device.active) device.send(json(snapshot));
      });
    });
  },
  stop() {
    controller?.abort();
  },
});
