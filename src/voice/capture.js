import { createWriteStream, mkdirSync, fsyncSync } from 'node:fs';
import prism from 'prism-media';
import { EndBehaviorType } from '@discordjs/voice';
import { pcmName } from './audio.js';
import { appendTrackEvent } from './track-journal.js';

// Pure bookkeeping of per-user tracks for a single meeting; unit-testable.
export class TrackRegistry {
  constructor() { this.active = new Map(); this.done = []; }
  isActive(userId) { return this.active.has(userId); }
  begin(userId, displayName, startMs, pcmPath, handles = {}) {
    this.active.set(userId, { userId, displayName, startMs, pcmPath, ...handles });
  }
  finish(userId, { incomplete = false } = {}) {
    const t = this.active.get(userId);
    if (!t) return null;
    this.active.delete(userId);
    this.done.push({ userId: t.userId, displayName: t.displayName, startMs: t.startMs, pcmPath: t.pcmPath, ...(incomplete ? { incomplete: true } : {}) });
    return t;
  }
  list() { return [...this.done]; }
}

// Side-effecting wiring used by MeetingManager. Not unit-tested (needs a live
// voice connection); validated by the manual integration checklist.
// `onSpeaker(userId, displayName)` fires the first time a member speaks, so the
// caller can record latecomers who joined after the meeting started.
export function attachCapture({ connection, guild, audioDir, registry, now = () => Date.now(), onSpeaker = null, journal = appendTrackEvent,
  createDecoder = () => new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 320 }) }) {
  mkdirSync(audioDir, { recursive: true });

  const onStart = (userId) => {
    // The whole body is guarded: this runs inside a Discord voice event
    // emitter, so ANY synchronous throw here (e.g. a native opus module that
    // fails to load after a system libc upgrade) becomes an uncaught exception
    // that kills the entire process mid-meeting. Never let one bad speaking
    // turn take the bot down — log it and skip just that track.
    try {
      if (registry.isActive(userId)) return;
      const member = guild.members.cache.get(userId);
      if (!member || member.user.bot) return;

      const startMs = now();
      const pcmPath = `${audioDir}/${pcmName(userId, startMs)}`;

      const opusStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } });
      const decoder = createDecoder();
      const out = createWriteStream(pcmPath, { flags: 'wx', mode: 0o600 });
      let ending = false;
      let finished = false;
      let captureError = false;

      const logEvent = (event) => {
        try { journal(audioDir, { file: pcmName(userId, startMs), userId, displayName: member.displayName, ...event }); }
        catch (err) { console.error('[capture] journal write failed:', err.message); }
      };
      const finalizeTrack = (interrupted) => {
        if (finished) return;
        finished = true;
        const incomplete = interrupted || captureError;
        // On failure we still register a partially written file for best-effort
        // transcription, but processMeeting will mark transcript incomplete.
        registry.finish(userId, { incomplete });
        logEvent({ type: incomplete ? 'interrupted' : 'completed', bytes: out.bytesWritten });
      };
      const end = () => {
        if (ending) return;
        ending = true;
        // Explicit stop may arrive mid-speech. Flush the decoder via .end()
        // rather than destroying it: destroying would lose buffered final PCM.
        // Keep decoder -> out piped until its readable end closes the WAV source.
        captureError = true; // final utterance may have been interrupted
        opusStream.unpipe?.(decoder);
        try { opusStream.destroy(); } catch { /* ignored */ }
        try { if (!decoder.destroyed && !decoder.writableEnded) decoder.end(); }
        catch (err) { console.error('[capture] decoder flush failed:', err.message); if (!out.destroyed) out.end(); }
      };
      const fail = (err) => {
        captureError = true;
        if (err) console.error('[capture] track error:', err.message || String(err));
        if (decoder.destroyed) {
          if (!out.destroyed && !out.writableEnded) out.end();
          return;
        }
        end();
      };
      out.on('finish', () => {
        // Crash safety: fsync PCM before writing a durable completion record.
        try { if (typeof out.fd === 'number' && out.fd >= 0) fsyncSync(out.fd); }
        catch (err) { captureError = true; console.error('[capture] PCM fsync failed:', err.message); }
        finalizeTrack(false);
      });
      out.on('close', () => finalizeTrack(!out.writableFinished));
      out.on('error', fail);
      // A natural end already propagates through both pipes and must be left
      // to flush without force-destroying the decoder.
      opusStream.on('end', () => { ending = true; });
      opusStream.on('error', fail);
      decoder.on('error', fail);

      registry.begin(userId, member.displayName, startMs, pcmPath, { opusStream, decoder, out, end });
      logEvent({ type: 'started' });
      opusStream.pipe(decoder).pipe(out);
      // Record anyone who actually speaks as an attendee (covers latecomers who
      // joined after the start-of-meeting snapshot). Idempotent downstream.
      if (onSpeaker) { try { onSpeaker(userId, member.displayName); } catch { /* ignore */ } }

      opusStream.on('end', end);
      opusStream.on('error', end);
      decoder.on('error', end);
    } catch (err) {
      console.error(`[capture] failed to start recording track for user ${userId}: ${err.message}`);
    }
  };

  connection.receiver.speaking.on('start', onStart);

  return {
    // End every still-active speaking turn and wait for its PCM to flush, so a
    // manual /leave or auto-leave never loses the final in-flight utterance.
    // Detach the listener FIRST so a new speaking-start between here and the
    // connection being destroyed can't open an untracked stream (leaked handle
    // + orphan .pcm + lost audio, since registry.list() was already snapshotted).
    async stopAll() {
      connection.receiver.speaking.off('start', onStart);
      const actives = [...registry.active.values()];
      await Promise.all(actives.map((t) => new Promise((resolve) => {
        if (t.out.writableFinished) { resolve(); return; }
        t.out.once('finish', resolve);
        t.out.once('close', resolve);
        t.end();
      })));
    },
  };
}
