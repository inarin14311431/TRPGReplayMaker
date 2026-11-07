import { convertPcmToWav } from '../voice/audio.js';
import { getSTT, resolveSttModel } from '../adapters/stt/index.js';
import { unlink, stat } from 'node:fs/promises';

// Transcribes each track through a small worker pool instead of one at a
// time. Cloud STT (openai) tolerates much higher concurrency than the local
// sidecar, which is why the default differs by provider (S3 in the speed
// plan). Concurrency is always injectable via deps for tests/tuning.
//
// A failed track (bad PCM, STT hiccup, etc.) must not sink the whole
// meeting (audit A2): failures are caught per-track and collected instead
// of thrown, and the good utterances are still returned. Callers decide
// whether "some/all tracks failed" is fatal.
export async function transcribeTracks(tracks, cfg = {}, deps = {}) {
  const convert = deps.convert || convertPcmToWav;
  // Resolve the configured STT provider (sidecar | openai) once per
  // meeting. The provider default can be overridden via deps.stt in tests.
  const transcribe = getSTT(cfg, deps.env, deps.sttDeps);
  const model = resolveSttModel(cfg);
  const stt = deps.stt || ((wav) => transcribe(wav, { model, language: cfg.language }));
  const cleanup = deps.cleanup || (async (p) => { try { await unlink(p); } catch { /* ignore */ } });
  const checkpoint = deps.checkpoint || null;
  const concurrency = Math.max(1, deps.concurrency ?? (cfg.sttProvider === 'openai' ? 4 : 2));

  // Results are written by index so track order is preserved regardless of
  // which worker finishes first.
  const results = new Array(tracks.length);
  const failures = [];

  async function worker(start) {
    for (let i = start; i < tracks.length; i += concurrency) {
      const t = tracks[i];
      const wavPath = t.pcmPath.replace(/\.pcm$/, '.wav');
      try {
        // Only a checkpoint with an identical PCM size, user and startMs is
        // reusable. The saved text is an exact STT result, not an AI summary.
        const bytes = checkpoint ? (await stat(t.pcmPath)).size : null;
        const cached = checkpoint ? await checkpoint.get(t, bytes) : null;
        if (cached !== null && cached !== undefined) {
          if (cached.text) results[i] = cached; // empty speech was saved too
          continue;
        }
        await convert(t.pcmPath, wavPath);
        const { text, words } = await stt(wavPath, cfg);
        const clean = (text || '').trim();
        const lastEnd = words && words.length ? words[words.length - 1].end : 0;
        const record = {
          userId: t.userId,
          displayName: t.displayName,
          startMs: t.startMs,
          endMs: t.startMs + Math.round(lastEnd * 1000),
          text: clean,
        };
        // Persist BEFORE returning the utterance, including a silent result.
        // If storage fails, mark the track failed and keep source audio.
        if (checkpoint) await checkpoint.save(t, bytes, record);
        if (clean) results[i] = record;
      } catch (err) {
        failures.push({ userId: t.userId, displayName: t.displayName, error: err.message || String(err) });
      } finally {
        await cleanup(wavPath);
      }
    }
  }

  const workerCount = Math.min(concurrency, tracks.length);
  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

  const utterances = results.filter(Boolean);
  return { utterances, failures };
}
