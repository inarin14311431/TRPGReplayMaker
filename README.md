# TRPGReplayMaker

Discordのボイスチャットを録音・文字起こしし、TRPGリプレイの編集用原稿を作成するプロジェクトです。

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

## 導入手順：Docker不要のWindowsポータブル版（推奨）

**一番簡単な導入**：GitHubの [Releases](https://github.com/inarin14311431/TRPGReplayMaker/releases) にあるWindows用 `TRPGReplayMaker-Windows.zip` をダウンロードして展開し、**`Start-ReplayMaker.bat` をダブルクリック**します。
配布ZIPにはWindows x64用のNode.js本体と依存ライブラリ、Web画面を同梱するため、Docker Desktop・WSL2・Node.jsの別途インストールは不要です。
GitHub Actionsの [Windows Portable ZIP](https://github.com/inarin14311431/TRPGReplayMaker/actions/workflows/windows-portable.yml) からもビルド成果物を取得できます（GitHubログインが必要な場合があります）。

1. ZIPを通常の書き込み可能なフォルダーへ**すべて展開**します。ZIP内部から直接実行しないでください。
2. `Start-ReplayMaker.bat` を開くと、ローカルのWeb管理画面 `http://127.0.0.1:3000` が開きます。コンソールを開いたままにしてください。
3. 初期ログイン `admin / admin` は直ちに変更します。
4. 画面に従いDiscord Botを作成し、BotトークンとApplication IDを登録してサーバーへ招待します。
5. **録音する前に文字起こしを設定**します。標準ZIP版にPython Whisperは同梱しません。OpenAI APIキーを入力し、Settingsで `Transcription → OpenAI` を明示的に選ぶとクラウド文字起こしが使えます（API従量課金）。
6. API料金を避ける場合は、Python 3.11をインストールして `Setup-Local-Whisper.bat` を実行します。再起動後にSettingsでローカル文字起こしを選びます（CPUでは処理が遅くなる場合があります）。
7. Discordで `/join` → セッション → `/leave`。ブラウザの「リプレイ作成」で原稿を編集し、単体HTMLで保存できます。

**終了**：起動したコンソールで `Ctrl+C` を押します。録音・DB・設定は配布フォルダー内の `user-data` に残ります。アプリを更新するときは `user-data` のバックアップを取ってください。
詳細は [Docker不要のWindowsポータブル導入ガイド](docs/portable-windows.md) と [初回セットアップ](docs/first-run-jp.md) を参照してください。

### GitHubの「Code → Download ZIP」でソースコードを取得した場合

ソースZIPにはNode.jsと依存ライブラリは含まれません。**Node.js 24以上（npm同梱）**をインストールしてから `Start-ReplayMaker.bat` を実行すると、初回のみ自動的に依存ライブラリを導入し、Web画面をビルドします。Gitに慣れた開発者向けの方法です。

### 従来のDocker方式（引き続き選択可能）

Docker Desktopがある場合は `Start-ReplayMaker-Docker.bat` / `Stop-ReplayMaker-Docker.bat` を使用できます。
CLIでは `docker compose up --build -d` で起動できます。Docker版のDBはDockerボリューム内にあり、ポータブル版の `user-data` とは**自動同期しません**。

### macOS / Linux

Node.js 24とnpmで `npm ci --omit=dev`、`npm --prefix web ci`、`npm --prefix web run build`、`node src/index.js` の順に起動できます（手動で `.env` とデータ保存先を設定）。
または従来通り `docker compose up --build -d` を利用します。

**注意**：GitHub Pagesで動くホスト型サービスではありません。Discord Botを作成する初回の操作と、文字起こし方式の設定は必要です。Discord録音の長時間実機テストは未実施です。

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
