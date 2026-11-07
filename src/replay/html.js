// Self-contained replay HTML: no remote assets, scripts or proprietary artwork.
import { clock, rowsForScene } from './render.js';
import { getReplayOverview } from './store.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function isNovaSystem(systemName) {
  return /[NＮ][◎oＯ][VＶ][AＡ]/iu.test(String(systemName || ''));
}
export function renderInlineMarkdown(value) {
  // No raw HTML, external images, or hyperlinks. Markdown emphasis only.
  return esc(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}
export function renderSafeMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [], paragraph = [], bullets = [];
  const flushParagraph = () => {
    if (paragraph.length) html.push('<p>' + paragraph.splice(0).map(renderInlineMarkdown).join('<br>') + '</p>');
  };
  const flushBullets = () => {
    if (bullets.length) html.push('<ul>' + bullets.splice(0).map(x => '<li>' + renderInlineMarkdown(x) + '</li>').join('') + '</ul>');
  };
  for (const line of lines) {
    const s = line.trim();
    if (!s) { flushParagraph(); flushBullets(); continue; }
    const heading = /^(#{1,4})\s+(.+)$/.exec(s);
    const bullet = /^[-*]\s+(.+)$/.exec(s);
    const quote = /^>\s?(.+)$/.exec(s);
    if (heading) {
      flushParagraph(); flushBullets();
      const level = Math.min(heading[1].length + 2, 6);
      html.push('<h' + level + '>' + renderInlineMarkdown(heading[2]) + '</h' + level + '>');
    } else if (bullet) {
      flushParagraph(); bullets.push(bullet[1]);
    } else if (quote) {
      flushParagraph(); flushBullets();
      html.push('<blockquote>' + renderInlineMarkdown(quote[1]) + '</blockquote>');
    } else {
      flushBullets(); paragraph.push(s);
    }
  }
  flushParagraph(); flushBullets();
  return html.join('\n');
}
function speakerLabel(speakers, row) {
  const s = speakers.find(x => x.userId === row.userId);
  const character = row.speechKind === 'character' && s?.characterName;
  const name = character ? s.characterName : s?.playerName || row.originalName || row.userId;
  const role = row.speechKind === 'character' ? 'CAST' : row.speechKind === 'gm' ? 'RL / GM'
    : row.speechKind === 'table' ? 'TABLE' : row.speechKind === 'system' ? 'SYSTEM' : 'LOG';
  return { name, role };
}
function sceneTranscript(speakers, rows) {
  const visible = rows.filter(x => !x.hidden);
  if (!visible.length) return '<p class="muted">表示対象の発言はありません。</p>';
  return visible.map(row => {
    const who = speakerLabel(speakers, row);
    const kind = ['unknown', 'character', 'gm', 'table', 'system'].includes(row.speechKind) ? row.speechKind : 'unknown';
    return '<article class="speech speech-' + kind + '"><div class="speech-meta"><b>' + esc(who.name) + '</b>' +
      '<span class="speech-type">' + esc(who.role) + '</span><time>' + esc(clock(row.elapsedMs)) +
      '</time></div><p>' + esc(row.correctedText ?? row.originalText).replace(/\r?\n/g, '<br>') + '</p></article>';
  }).join('\n');
}

const CSS = [
  ':root{color-scheme:dark;--bg:#0a0f19;--panel:#111d2e;--line:#355068;--txt:#e9f0f6;--dim:#b6c2cf;--red:#f27c93;--cyan:#73e0ef}',
  '*{box-sizing:border-box}html{scroll-behavior:smooth}',
  'body{margin:0;background:radial-gradient(ellipse at 10% 0%,#243447,transparent 45%),var(--bg);color:var(--txt);font:16px/1.85 system-ui,-apple-system,"Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif;overflow-wrap:anywhere}',
  'a{color:var(--cyan);text-underline-offset:.2em}.hero{padding:clamp(2rem,8vw,5rem) max(1.3rem,calc((100vw - 1000px)/2));border-bottom:1px solid var(--line)}',
  '.label{color:var(--cyan);font:700 .76rem monospace;letter-spacing:.2em}.hero h1{font-size:clamp(2rem,5vw,3.8rem);line-height:1.3;margin:.8rem 0}',
  '.accent{height:3px;width:90px;background:linear-gradient(90deg,var(--red),var(--cyan))}.muted,.subtitle{color:var(--dim)}.subtitle{font-size:.9rem}',
  '.layout{max-width:1300px;margin:auto;display:grid;grid-template-columns:210px minmax(0,1fr);gap:3rem;padding:3rem 2rem 6rem}',
  '.toc{position:sticky;top:2rem;align-self:start;border-left:2px solid var(--line);padding-left:1rem}.toc h2{font:700 .76rem monospace;letter-spacing:.2em;color:var(--red)}',
  '.toc ol{list-style:none;padding:0}.toc li{padding:.25rem 0;font-size:.87rem}.toc a{color:var(--dim);text-decoration:none}.toc a:hover{text-decoration:underline;color:var(--cyan)}',
  '.chapter{margin:0 0 4rem;scroll-margin-top:2rem;min-width:0}.chapter-head{border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1.8rem}',
  '.number{font:700 .76rem monospace;letter-spacing:.15em;color:var(--red)}.chapter h2{font-size:clamp(1.4rem,3vw,2.1rem);margin:.5rem 0;line-height:1.4}',
  '.chapter time{color:var(--dim);font:.76rem monospace}.prose p{margin:0 0 1.3rem}.prose h3,.prose h4,.prose h5,.prose h6{color:var(--cyan);margin:1.8rem 0 .7rem}',
  '.prose ul{padding-left:1.6rem;margin:0 0 1.4rem}.prose blockquote{border-left:3px solid var(--cyan);margin:1rem 0;padding:.6rem 1.1rem;background:var(--panel);color:var(--dim)}',
  '.speech{border:1px solid var(--line);border-left:3px solid var(--cyan);background:#0f1a2b;border-radius:4px;margin:0 0 .8rem;padding:.9rem 1.2rem}',
  '.speech-gm{border-left-color:var(--red)}.speech-table{border-left-color:var(--dim)}.speech-meta{display:flex;gap:.9rem;flex-wrap:wrap;align-items:baseline}',
  '.speech-type{font:700 .68rem monospace;color:var(--cyan)}.speech-meta time{margin-left:auto}.speech p{margin:.45rem 0 0}',
  '.notice{font-size:.85rem;color:var(--red)}footer{border-top:1px solid var(--line);padding:2rem;text-align:center;color:var(--dim);font-size:.8rem}',
  '@media(max-width:780px){.layout{display:block;padding:1.5rem 1rem}.toc{position:static;margin:0 0 3rem}.hero{padding:2rem 1.2rem}}',
  '@media print{:root{color-scheme:light;--bg:#fff;--panel:#f4f5f8;--line:#ccc;--txt:#111;--dim:#333;--red:#8a2a43;--cyan:#125f71}body{background:#fff;font-size:11pt}.hero{padding:1cm}.layout{display:block;padding:0 1cm}.toc{display:none}.chapter{break-before:page}.speech{background:#fff;break-inside:avoid}}',
].join('\n');

export function exportReplayHtml(db, meetingId, { mode = 'draft' } = {}) {
  const overview = getReplayOverview(db, meetingId);
  if (!overview) return null;
  const { meeting, project, scenes, speakers } = overview;
  const nova = isNovaSystem(project.system_name);
  const toc = scenes.map((s, i) => '<li><a href="#scene-' + (i + 1) + '">' + esc(s.title) + '</a></li>').join('\n');
  const chapters = scenes.map((s, i) => {
    const body = mode === 'draft' && s.draft_text?.trim()
      ? '<div class="prose">' + renderSafeMarkdown(s.draft_text) + '</div>'
      : '<div class="script">' + sceneTranscript(speakers, rowsForScene(db, meetingId, s.id)) + '</div>';
    return '<section class="chapter" id="scene-' + (i + 1) + '"><header class="chapter-head"><span class="number">SCENE ' +
      String(i + 1).padStart(2, '0') + '</span><h2>' + esc(s.title) + '</h2><time>' + esc(clock(s.start_ms)) +
      '</time></header>' + body + '</section>';
  }).join('\n');
  const caution = meeting.transcription_complete === 0 ? '<p class="notice">文字起こしが不完全です。原音声と照合してください。</p>' : '';
  return [
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    '<title>' + esc(project.title) + ' | TRPG Replay</title><style>' + CSS + '</style></head><body>',
    '<header class="hero"><span class="label">' + (nova ? 'TOKYO N◎VA / ACT REPLAY' : 'TRPG / SESSION REPLAY') +
      '</span><h1>' + esc(project.title) + '</h1><div class="accent"></div><p class="subtitle">' +
      esc(project.system_name || 'TRPG') + ' · ' + esc(meeting.started_at || '') + '</p></header>',
    '<div class="layout"><nav class="toc" aria-label="シーン目次"><h2>CONTENTS</h2><ol>' + toc + '</ol></nav>',
    '<main>' + caution + chapters + '</main></div>',
    '<footer>TRPGReplayMaker · 原音声と原文を確認したうえで公開してください。</footer></body></html>',
  ].join('\n');
}
