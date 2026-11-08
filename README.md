# TRPGReplayMaker

Discordのボイスチャットを録音・文字起こしし、TRPGリプレイの編集用原稿を作成するプロジェクトです。

## まず使う（Windows）

1. **[Windows版をダウンロード（ZIP）](https://inarin14311431.github.io/TRPGReplayMaker/TRPGReplayMaker-Windows.zip)**。クリックすると保存が始まります。
2. ZIPを右クリックして **すべて展開** を選び、**Start-ReplayMaker.bat** をダブルクリックします。
3. ブラウザの画面に沿ってDiscord Botと文字起こしを設定します。
4. Discordで **/join → セッション → /leave**。ブラウザでリプレイを編集し、**HTMLで保存**します。

**[初めての方はこちら：クリックする場所から説明したマニュアル](docs/user-manual.md)**

`admin / admin` の初期パスワードは必ず変更してください。配布ZIPではDockerやNode.jsの別途導入は不要です。

## 目的

- 8〜12時間以上のセッションを想定した録音・復旧
- Discord参加者別の音声と発言タイムスタンプの保持
- GM・プレイヤー・キャラクターの対応づけ
- セッションをシーンごとに整理し、原文と照合可能なリプレイを作成

## トーキョーN◎VA向け・自分のAIで使う

このツールは**各自が自分のPCで動かす**ことを基本とし、トーキョーN◎VAを既定のTRPGシステムとして扱います。
導入時に専用クラウドやサービス加入は不要です。Windowsの簡易起動手順は下のクイックスタートを参照してください。

- **生成AIの持ち込み（BYOK）**：設定画面に各自のAPIキーを登録し、Replay Studioの「自分のAI API・モデルを指定」で `Gemini` / `OpenAI` / `OpenRouter` / `OpenCode` / `Ollama` から選択。モデルIDも各自で指定可能
- **低価格**：固定低価格モードやローカルOllamaも引き続き利用可能。プロバイダー指定時の料金計算は非対応なので、利用料金はサービスごとに確認
- **完成原稿**：Markdown・JSONに加え、外部画像やJavaScriptに依存しない**単体HTML**をダウンロード。N◎VA設定時は独自のサイバーパンク風読書レイアウト
- **N◎VA用語**：RL／キャスト／神業などの用語をプロンプトに補足。ただし発言や判定結果の捏造を許さず、原文との照合を前提
- **他のTRPGにも対応**：アクト設定のTRPGシステム名を変更すれば一般向けの文章指示・HTML見出しに切替可能

使い方と制約は [N◎VA・BYOK・HTMLガイド](docs/nova-replay.md) にまとめています。

**公式のタロット、ルールブック本文、キャスト画像、商標ロゴは配布ファイルに含みません。** 利用者が権利を持つ画像のみを別途使用してください。
## 完成リプレイの見本・共通用語集

- [短編サンプル『硝子の目撃者』の単体HTML](examples/nova-short-replay.html) — 架空の二つのシーン、RLの描写・キャスト台詞・PL会話を含みます。ファイルをダウンロードしてブラウザで開いてください。
- [サンプルHTML生成スクリプト](scripts/generate-replay-sample.mjs) — 実際のエクスポーターを呼び出し、同じ題材のHTMLを再生成します。`node scripts/generate-replay-sample.mjs`
- [TRPG共通・システム別の用語集](docs/trpg-glossary.md) — N◎VA、クトゥルフ神話TRPG、ダブルクロス、ソード・ワールド2.5、D&D、共通用語を収録。プリセットはアクトのシステム名から自動選択されます。

用語集は**文章生成AIの補助情報**です。Whisperの音声認識に単語登録する機能や、録音の自動書換え機能ではありません。
正式表記・読み・説明をアクトごとに追加できます。公式ルール本文や画像は同梱していません。

## 構成

- **Bot・録音・文字起こし**: [Parley](https://github.com/SakethKanchi/parley) のソースをベースに拡張
- **リプレイ編集**: WebのReplay Studioで会話校正、キャスト設定、シーン編集、AI生成、出力を実施
- **CLI互換**: `packages/trpg-replay/` に既存のJSON変換ツールを保持
- **設計・ロードマップ**: `packages/trpg-replay/docs/development-plan.md`

## 操作マニュアル

**[はじめての使い方（Windows）](docs/user-manual.md)**

ダウンロード、Bot登録、文字起こし、録音、リプレイ作成、HTML保存まで順番に説明しています。

- [リプレイ編集の詳しい説明](docs/replay-studio.md)
- [TRPG用語集の使い方](docs/trpg-glossary.md)

### ソースコードから起動する場合

ソースZIPから使う場合は **Node.js 24以上（npmを含む）** を用意し、`Start-ReplayMaker.bat` を実行します。初回の依存ライブラリ導入とWeb画面ビルドは自動で行われます。

Windowsの配布ZIPを使う場合は、[操作マニュアル](docs/user-manual.md)の順番どおりに進めてください。

## CLI変換（補助ツール）

Parley互換JSONをリプレイ原稿へ変換する機能も残しています。

```bash
cd packages/trpg-replay
npm test
node scripts/replay.mjs examples/parley-meeting.json examples/trpg-config.json ./output
```

## データの取り扱い

録音・文字起こしは参加者全員の同意を得て行います。音声・会話ログ・トークン・実セッションの個人情報をこの公開リポジトリにコミットしないでください。

## ライセンスと由来

録音・文字起こしBotのベースは [Parley](https://github.com/SakethKanchi/parley)（© 2026 Saketh Kanchi、ISCライセンス）です。アップストリームの著作権表示とライセンスを維持します。詳細は `UPSTREAM.md` を参照してください。

## Long-session recording and recovery (Phase 2)

Speech-turn PCM is journaled, track-by-track transcription is checkpointed in SQLite, and completed-session audio is retained for replay proofreading. The default retention policy is `AUDIO_RETENTION_DAYS=30` (`0` keeps successful audio indefinitely). Failed or partial sessions are retained for recovery. See [long-session operations](docs/long-session-operations.md) for detailed instructions and limitations. Discord recording for 12 hours has **not** yet been validated on a live server.

## 完成状況

録音・文字起こし・Web編集・シーン単位AI生成・一括生成・Markdown/JSON出力はソースコード上で接続済みです。自動テストとWebビルドを通過させた後も、Discord実機での録音・復旧確認と、生成文の人間による確認は必要です。長時間の実機負荷テストは後工程に回します。
