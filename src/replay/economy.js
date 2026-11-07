// Small, explicit pricing table for a fixed, opt-in economy model.
// Estimates are indicative. Official billing, taxes, model pricing and FX can change.
export const REPLAY_ENGINES = ['inherit', 'luna', 'local', 'custom'];
export const LUNA_MODEL = 'gpt-6-luna';
export const LUNA_PRICES = Object.freeze({ inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.50 });
export const MAX_OUTPUT_TOKENS = 4000;
export const DEFAULT_BUDGET_USD = 0.50;

const cleanNumber = v => Number.isFinite(v) && v >= 0 ? v : 0;
const rounded = n => Math.round(n * 1e8) / 1e8;

// Rough quote only. It may undercount non-Japanese text, emoji, special tokens,
// or the provider's tokenization. Never use it to enforce a spending ceiling.
export function approximateTokens(text) {
  return Math.ceil(Buffer.byteLength(String(text), 'utf8') / 3) + 100;
}

export function lunaCostUsd(inputTokens, outputTokens) {
  return rounded(
    (cleanNumber(inputTokens) * LUNA_PRICES.inputUsdPerMillion +
     cleanNumber(outputTokens) * LUNA_PRICES.outputUsdPerMillion) / 1_000_000
  );
}

// The conservative request reservation uses byte length (normally >= text
// token count) plus padding, and caps output by max_completion_tokens.
// It is a preflight guard, not an official API-level dollar spending cap.
export function reserveCostUsd(prompt, maxOutputTokens = MAX_OUTPUT_TOKENS) {
  const upperInput = Buffer.byteLength(prompt, 'utf8') + 2048;
  return lunaCostUsd(upperInput, maxOutputTokens);
}

export function quoteScene(prompt, maxOutputTokens = MAX_OUTPUT_TOKENS) {
  return {
    approximateInputTokens: approximateTokens(prompt),
    maxOutputTokens,
    estimatedUsd: lunaCostUsd(approximateTokens(prompt), Math.min(2000, maxOutputTokens)),
    reservedUsd: reserveCostUsd(prompt, maxOutputTokens),
  };
}

export function installReplayUsageTable(db) {
  const cols = db.sql.prepare('PRAGMA table_info(replay_projects)').all().map(x => x.name);
  if (!cols.includes('engine')) db.sql.exec("ALTER TABLE replay_projects ADD COLUMN engine TEXT NOT NULL DEFAULT 'inherit'");
  if (!cols.includes('local_model')) db.sql.exec("ALTER TABLE replay_projects ADD COLUMN local_model TEXT NOT NULL DEFAULT 'qwen2.5:7b'");
  if (!cols.includes('budget_usd')) db.sql.exec('ALTER TABLE replay_projects ADD COLUMN budget_usd REAL NOT NULL DEFAULT 0.5');
  if (!cols.includes('ai_provider')) db.sql.exec("ALTER TABLE replay_projects ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'gemini'");
  if (!cols.includes('ai_model')) db.sql.exec("ALTER TABLE replay_projects ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash'");
  if (!cols.includes('glossary_preset')) db.sql.exec("ALTER TABLE replay_projects ADD COLUMN glossary_preset TEXT NOT NULL DEFAULT 'auto'");
  db.sql.exec('CREATE TABLE IF NOT EXISTS replay_ai_usage (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, scene_id INTEGER NOT NULL,' +
    'engine TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL,' +
    'output_tokens INTEGER NOT NULL, usd REAL NOT NULL, estimated INTEGER NOT NULL DEFAULT 0,' +
    'created_at TEXT NOT NULL)');
  db.sql.exec('CREATE INDEX IF NOT EXISTS replay_ai_usage_meeting ON replay_ai_usage(meeting_id)');
}

export function replaySpentUsd(db, meetingId) {
  return rounded(db.sql.prepare('SELECT COALESCE(SUM(usd),0) AS n FROM replay_ai_usage WHERE meeting_id=?').get(meetingId).n);
}

export function spendGuard(db, meetingId, budgetUsd, reservationUsd) {
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
    throw Object.assign(new Error('Budget is invalid.'), { status: 400 });
  }
  const spent = replaySpentUsd(db, meetingId);
  if (spent + reservationUsd > budgetUsd + 0.00000001) {
    const err = new Error('Estimated request allowance exceeds the replay budget. Increase the budget, use the local engine, or divide the scene.');
    err.status = 402;
    err.details = { spentUsd: spent, budgetUsd, reservedUsd: reservationUsd };
    throw err;
  }
  return spent;
}

export function recordReplayUsage(db, { meetingId, sceneId, engine, model, inputTokens, outputTokens, estimated = false }) {
  const usd = engine === 'luna' ? lunaCostUsd(inputTokens, outputTokens) : 0;
  db.sql.prepare('INSERT INTO replay_ai_usage (meeting_id,scene_id,engine,model,input_tokens,output_tokens,usd,estimated,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(meetingId, sceneId, engine, model, inputTokens, outputTokens, usd, estimated ? 1 : 0, new Date().toISOString());
  return usd;
}

export async function requestLuna(prompt, {
  fetchImpl = fetch, apiKey, baseUrl = 'https://api.openai.com/v1',
  model = LUNA_MODEL, maxCompletionTokens = MAX_OUTPUT_TOKENS,
} = {}) {
  if (!apiKey) throw Object.assign(new Error('OPENAI_API_KEY is not configured. Select local or set your key.'), { status: 400 });
  const response = await fetchImpl(baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model, messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: maxCompletionTokens,
      reasoning_effort: 'none',
    }),
  });
  if (!response.ok) {
    const info = await response.text().catch(() => '');
    throw Object.assign(new Error('Low-cost model request failed (' + response.status + '): ' + info.slice(0, 200)), { status: 502 });
  }
  const body = await response.json();
  const output = body.choices?.[0]?.message?.content;
  if (typeof output !== 'string' || !output.trim()) {
    throw Object.assign(new Error('Low-cost model returned an empty draft.'), { status: 502 });
  }
  const usage = body.usage;
  const measured = Number.isSafeInteger(usage?.prompt_tokens) && Number.isSafeInteger(usage?.completion_tokens);
  // If usage metadata was unavailable, reserve conservatively in the ledger.
  return {
    text: output,
    inputTokens: measured ? usage.prompt_tokens : Buffer.byteLength(prompt, 'utf8') + 2048,
    outputTokens: measured ? usage.completion_tokens : maxCompletionTokens,
    estimated: !measured,
  };
}
