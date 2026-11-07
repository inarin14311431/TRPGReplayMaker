#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { prepareReplay, renderReplayMarkdown } from '../src/replay.js';

const [, , inputPath, configPath, outputDir] = process.argv;
if (!inputPath || !configPath || !outputDir) {
  console.error('Usage: node scripts/replay.mjs <parley-meeting.json> <trpg-config.json> <output-directory>');
  process.exitCode = 2;
} else {
  try {
    const [data, config] = await Promise.all([
      readFile(resolve(inputPath), 'utf8').then(JSON.parse),
      readFile(resolve(configPath), 'utf8').then(JSON.parse),
    ]);
    const replay = prepareReplay(data, config);
    const dir = resolve(outputDir);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, 'replay.md'), renderReplayMarkdown(replay), 'utf8'),
      writeFile(join(dir, 'replay.json'), JSON.stringify(replay, null, 2) + '\n', 'utf8'),
    ]);
    console.log('Saved: ' + join(dir, 'replay.md'));
    console.log('Saved: ' + join(dir, 'replay.json'));
    console.log('Utterances: ' + replay.utterances.length + '; warnings: ' + replay.warnings.length);
  } catch (err) {
    console.error('Replay generation failed: ' + err.message);
    process.exitCode = 1;
  }
}
