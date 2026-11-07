# TRPGReplayMaker

Discordのボイスチャットを録音・文字起こしし、TRPGリプレイの編集用原稿を作成するプロジェクトです。

## 目的

- 8〜12時間以上のセッションを想定した録音・復旧
- Discord参加者別の音声と発言タイムスタンプの保持
- GM・プレイヤー・キャラクターの対応づけ
- セッションをシーンごとに整理し、原文と照合可能なリプレイを作成

## 構成

- **Bot・録音・文字起こし**: [Parley](https://github.com/SakethKanchi/parley) のソースをベースに拡張
- **リプレイ編集**: WebのReplay Studioで会話校正、キャスト設定、シーン編集、AI生成、出力を実施
- **CLI互換**: `packages/trpg-replay/` に既存のJSON変換ツールを保持
- **設計・ロードマップ**: `packages/trpg-replay/docs/development-plan.md`

## クイックスタート

Docker Desktop / Docker Composeが動作するPCで以下を実行します。

```bash
git clone https://github.com/inarin14311431/TRPGReplayMaker.git
cd TRPGReplayMaker
cp .env.example .env
docker compose up --build -d
```

ローカルPCの `http://127.0.0.1:3000` を開きます。初回アカウントは `admin` / `admin` で、必ず新しいパスワードを設定します。画面からDiscord Botを接続し、文字起こしモデルと文章生成プロバイダーを設定します。セッションの録音は `/join`、終了は `/leave` です。録音後は左メニューの **Replay studio** から編集できます。

操作手順・制限は [リプレイ編集ガイド](docs/replay-studio.md) を参照してください。

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
