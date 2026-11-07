# TRPGリプレイ作成アドオン v0.1.0

ParleyのJSONエクスポートをTRPGリプレイ編集用Markdownと構造化JSONへ変換します。元発言は保持し、AIによる創作・補筆は行いません。

## 機能
- DiscordユーザーIDとGM/PL/キャストの対応づけ
- 長時間セッション用HH:MM:SS表示
- シーン開始時刻による章分け
- 元発言の時系列整列と不完全な文字起こしへの警告
- Markdown/JSON出力

## 実行
Node.js 22以上。追加の依存パッケージはありません。

```bash
cd packages/trpg-replay
npm test
node scripts/replay.mjs examples/parley-meeting.json examples/trpg-config.json ./output
```

Parley管理画面の『Export → JSON』で保存したデータを第1引数に指定します。peopleのキーはDiscordユーザーIDで、scenes[].atはセッション開始からの経過時間です。

## 未対応
リアルタイムのDiscord録音、長時間録音の実機保証、固有名詞の自動校正、PL発言とキャスト台詞の自動判定、AIによる完成稿生成は後続工程です。

**録音や文字起こしは参加者全員の同意のもとで実施してください。実音声や非公開セッションのログを公開GitHubに保存しないでください。**
