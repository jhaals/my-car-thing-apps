# My Car Thing Apps

Webapps for the Spotify Car Thing running [bridgething](https://bridgething.com).

## Apple Calendar

Shows **today’s meetings only** from the Calendar app on your Mac, including synced iCloud, Exchange and other accounts. Meetings disappear once they end; the selection starts at the current or next timed event. All-day and recurring events are included. Times use the 24-hour clock. Meeting details show Google Meet links found in event descriptions, URLs or locations. No Apple ID password or public calendar URL is needed.

### Set up on your Mac

Requires macOS 14+, Bun, and Apple’s Command Line Tools (`xcode-select --install` if needed).

```sh
bun install
bun run calendar:setup
bun run dev
```

`calendar:setup` compiles and signs a small local EventKit helper into `~/Library/Application Support/Bridgething Apple Calendar/Bridgething Apple Calendar.app`, then asks macOS for full calendar access. This is Apple’s permission level for reading existing events; the helper never writes events. If access was denied, enable it in **System Settings → Privacy & Security → Calendars** for **Bridgething Apple Calendar**, then refresh the calendar. The helper launches as its own app so its Calendar permission is independent of bridgething and Terminal.

The desktop extension may run `/usr/bin/open`, read `HOME`, and read/write only the helper’s private `responses` directory. It opens only Google Meet links from the loaded calendar events. The helper sends event titles, times, calendar names, locations and Google Meet links to the connected Car Thing. Meet links are extracted from event descriptions, URL fields and locations; the rest of the description stays on the Mac. The helper does not read attendees or use a cloud service. Each read writes a temporary response file in a private local directory; the extension deletes it after reading. Upcoming events on the screen remain visible when the Mac disconnects, with a disconnected indicator; restarting the screen requires the Mac to load them again.

Keep bridgething open on the Mac with this app’s extension enabled. During development, disable the installed copy of the extension so only the dev copy runs. Run setup on each Mac that hosts the extension; this initial version does not bundle a distributable native helper. After changing the Swift helper, rerun setup.

### Controls

- Turn the wheel to select a meeting; press it or tap a meeting for details.
- In meeting details, press the wheel again or tap **Open Google Meet on Mac** to open the link in your Mac’s default browser.
- The Back button below the wheel refreshes immediately and returns to the agenda. Mode toggles meeting details.
- Preset 1/2 selects the previous/next meeting. Preset 3 returns to today’s current/next meeting.
- Calendar updates automatically every minute while the app is open; ended meetings disappear within a second.

The screen uses its local timezone for today’s view and event times; keep the Mac and device timezones aligned. All calendars visible to EventKit are included.

### Develop and check

```sh
bun run dev:device                  # hot reload on the connected Car Thing
bun run --cwd apps/apple-calendar test
bun run check                      # typecheck, build, bundle and catalog validation
bun run shot apple-calendar         # capture the connected device for the listing
```

`bun run push` installs onto a connected Car Thing. Nothing is published by setup, development, or checks.

Publishing is deliberately left for later. The source targets `jhaals/my-car-thing-apps`; pushing main publishes the catalog through the included workflow once GitHub Pages is configured. Before releasing a changed published version, use `bun run bump apple-calendar patch -m "Release note"`.
