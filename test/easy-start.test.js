import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discordInviteUrl, isDiscordApplicationId } from '../web/src/lib/discord-invite.js';

test('Discord invite uses bot + slash commands scopes and only expected permissions', () => {
  const id = '1234567890123456789';
  const url = discordInviteUrl(id);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://discord.com');
  assert.equal(parsed.pathname, '/oauth2/authorize');
  assert.equal(parsed.searchParams.get('client_id'), id);
  assert.equal(parsed.searchParams.get('integration_type'), '0');
  assert.deepEqual(parsed.searchParams.get('scope').split(' ').sort(), ['applications.commands', 'bot']);
  const bits = BigInt(parsed.searchParams.get('permissions'));
  for (const bit of [10n, 11n, 14n, 16n, 20n, 21n, 25n, 35n]) {
    assert.notEqual(bits & (1n << bit), 0n);
  }
  assert.equal(parsed.search.includes('token'), false);
});

test('invalid client ID cannot create a clickable invite link', () => {
  assert.equal(isDiscordApplicationId('not-a-number'), false);
  assert.equal(discordInviteUrl('0".evil.com'), null);
  assert.equal(discordInviteUrl('123'), null);
  assert.equal(discordInviteUrl('1234567890123456789'), 'https://discord.com/oauth2/authorize?client_id=1234567890123456789&permissions=34396523520&scope=bot+applications.commands&integration_type=0');
});

test('Windows portable launcher runs Node directly with no Docker prerequisite', () => {
  const start = readFileSync(new URL('../Start-ReplayMaker.bat', import.meta.url), 'utf8');
  const stop = readFileSync(new URL('../Stop-ReplayMaker.bat', import.meta.url), 'utf8');
  const setup = readFileSync(new URL('../Setup-Local-Whisper.bat', import.meta.url), 'utf8');
  const dockerStart = readFileSync(new URL('../Start-ReplayMaker-Docker.bat', import.meta.url), 'utf8');
  const dockerStop = readFileSync(new URL('../Stop-ReplayMaker-Docker.bat', import.meta.url), 'utf8');
  assert.match(start, /runtime\\node\.exe/);
  assert.match(start, /src\\index\.js/);
  assert.match(start, /WEB_UI_HOST=127\.0\.0\.1/);
  assert.match(start, /DATA_DIR=%~dp0user-data/);
  assert.match(start, /PARLEY_ENV_FILE=%DATA_DIR%\\\.env/);
  assert.match(start, /if not exist "%PARLEY_ENV_FILE%"/);
  assert.match(start, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(start, /npm ci --omit=dev/);
  assert.doesNotMatch(start, /docker compose|docker info|wsl --/i);
  assert.match(stop, /Ctrl\+C/);
  assert.doesNotMatch(stop, /taskkill|Stop-Process/i);
  assert.match(dockerStart, /docker compose up --build -d/);
  assert.match(dockerStop, /docker compose stop/);
  assert.match(setup, /py -3\.11 -m venv/);
  assert.match(setup, /requirements-windows\.txt/);
  for (const source of [start, stop, setup, dockerStart, dockerStop]) {
    assert.doesNotMatch(source, /docker compose down -v|docker volume rm|del \/f/i);
  }
});

test('Windows ZIP workflow bundles runtime + backend and smoke tests HTTP', () => {
  const yaml = readFileSync(new URL('../.github/workflows/windows-portable.yml', import.meta.url), 'utf8');
  assert.match(yaml, /windows-latest/);
  assert.match(yaml, /TRPGReplayMaker-Windows\.zip/);
  assert.match(yaml, /node\.exe/);
  assert.match(yaml, /node_modules/);
  assert.match(yaml, /web\\dist/);
  assert.match(yaml, /\/api\/auth\/me/);
  assert.match(yaml, /user-data/);
  assert.match(yaml, /Test-Path "\$stage\\\.env"/);
  assert.doesNotMatch(yaml, /docker compose|docker build/);
});
