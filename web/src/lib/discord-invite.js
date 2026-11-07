// The invite URL is derived solely from the public Discord Application ID.
// Never place a bot token or secret in an invite URL.
const PERMISSIONS = [
  1n << 10n, // View Channel
  1n << 11n, // Send Messages
  1n << 14n, // Embed Links
  1n << 16n, // Read Message History
  1n << 20n, // Connect
  1n << 21n, // Speak
  1n << 25n, // Use Voice Activity
  1n << 35n, // Create Public Threads
].reduce((a, b) => a | b, 0n).toString();

export function isDiscordApplicationId(value) {
  return typeof value === 'string' && /^\d{16,22}$/.test(value.trim());
}

export function discordInviteUrl(applicationId) {
  if (!isDiscordApplicationId(applicationId)) return null;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', applicationId.trim());
  url.searchParams.set('permissions', PERMISSIONS);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('integration_type', '0');
  return url.href;
}
