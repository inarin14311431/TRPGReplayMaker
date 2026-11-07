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
  assert.equal(discordInviteUrl('1234567890123456789'), 'https://discord.com/oauth2/authorize?client_id=1234567890123456789&permissions=34396358784&scope=bot+applications.commands&integration_type=0');
});

test('Windows launcher does not modify saved configuration or delete recordings', () => {
  const start = readFileSync(new URL('../Start-ReplayMaker.bat', import.meta.url), 'utf8');
  const stop = readFileSync(new URL('../Stop-ReplayMaker.bat', import.meta.url), 'utf8');
  assert.match(start, /docker compose up --build -d/);
  assert.match(start, /if not exist "\.env"/);
  assert.match(start, /http:\/\/127\.0\.0\.1:3000/);
  assert.doesNotMatch(start, /docker compose down -v|docker volume rm|del \/f/i);
  assert.match(stop, /docker compose stop/);
  assert.doesNotMatch(stop, /docker compose down -v|docker volume rm/i);
});
