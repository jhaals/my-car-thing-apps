import { closeSettings } from '@bridgething/client/form';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function Settings() {
  const [error, setError] = useState('');
  return (
    <main>
      <h1>Apple Calendar</h1>
      <p>Shows today’s events from all calendars synced to Calendar on your Mac.</p>
      <ol>
        <li>
          On your Mac, open this source repo in Terminal and run <code>bun run calendar:setup</code>.
        </li>
        <li>
          Allow full calendar access for Bridgething Apple Calendar when macOS asks. If denied, enable that helper in
          System Settings → Privacy &amp; Security → Calendars.
        </li>
        <li>Keep bridgething open on your Mac with the Apple Calendar extension enabled.</li>
      </ol>
      <p>
        The helper reads event titles, times, calendar names, locations and Google Meet links. Descriptions are read on
        the Mac only to extract Meet links. It does not change events or send data to a cloud service. From meeting
        details, press the wheel to open Google Meet in your Mac’s browser.
      </p>
      <p>
        Calendar updates every minute while the app is open. Press the Back button below the wheel to refresh
        immediately.
      </p>
      <div className="row">
        <button onClick={() => void closeSettings(null).catch((err: unknown) => setError(String(err)))}>Done</button>
      </div>
      <p className="status" role="status">
        {error}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
