import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Apple Calendar requires macOS 14 or newer.');
const native = resolve(import.meta.dirname, '../native');
const directory = join(homedir(), 'Library/Application Support/Bridgething Apple Calendar');
const app = join(directory, 'Bridgething Apple Calendar.app');
const staging = `${app}.new.app`;
const previous = `${app}.old`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
mkdirSync(join(directory, 'responses'), { recursive: true, mode: 0o700 });
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, 'Contents/MacOS'), { recursive: true });
try {
  copyFileSync(join(native, 'Info.plist'), join(staging, 'Contents/Info.plist'));
  execFileSync(
    '/usr/bin/swiftc',
    [
      '-swift-version',
      '5',
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
      join(native, 'CalendarReader.swift'),
      '-o',
      join(staging, 'Contents/MacOS/calendar-reader'),
    ],
    { stdio: 'inherit' },
  );
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', staging], { stdio: 'inherit' });
  rmSync(previous, { recursive: true, force: true });
  try {
    renameSync(app, previous);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    renameSync(staging, app);
  } catch (error) {
    try {
      renameSync(previous, app);
    } catch {}
    throw error;
  }
  rmSync(previous, { recursive: true, force: true });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
const temporary = mkdtempSync(join(directory, 'responses/authorize-'));
try {
  const response = join(temporary, 'result.json');
  execFileSync('/usr/bin/open', ['-W', '-n', '--stdout', response, app, '--args', '--authorize'], { stdio: 'inherit' });
  const result = JSON.parse(readFileSync(response, 'utf8')) as { error: string | null };
  if (result.error) throw new Error(result.error);
  console.log('Calendar helper installed and authorized. Enable the Apple Calendar extension in bridgething.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
