# TRPGReplayMaker 最初の設定（Windows）

**アプリの取得から録音までの簡単な手順**です。詳しい説明は [利用マニュアル](user-manual.md) にあります。

## 1. ダウンロード・起動

1. [Windows版のダウンロードページ](https://github.com/inarin14311431/TRPGReplayMaker/actions/workflows/windows-portable.yml) を開き、緑のチェックが付いた新しい **main** の実行を選びます。
2. **Artifacts → TRPGReplayMaker-Windows-Portable** をダウンロードします（GitHubログインが必要）。
3. ダウンロードしたZIPと、その中の **TRPGReplayMaker-Windows.zip** を順に展開します。
4. **Start-ReplayMaker.bat** をダブルクリックします。ブラウザが開かなければ **http://127.0.0.1:3000** を開きます。
5. 初期ログインは **admin / admin**。**すぐにパスワードを変更**してください。

## 2. Discord Botを追加

1. [Discord Developer Portal](https://discord.com/developers/applications) で **New Application** を作ります。
2. **General Information → Application ID** と **Bot → Token** をコピーします。
3. アプリの初回設定画面へ入力し、**保存して接続する** を押します。
4. **DiscordサーバーにBotを招待** を押します。

## 3. 文字起こしを設定

**Settings → Transcription** でどちらかを選びます。

- **OpenAI**：自分のAPIキーを設定。導入が簡単ですが**従量課金**です（ChatGPTの契約とは別）。
- **Local sidecar (faster-whisper)**：[Python 3.11](https://www.python.org/downloads/) を入れ、**Setup-Local-Whisper.bat** を実行してアプリを再起動。**音声認識API料金は0円**ですが、処理に時間がかかる場合があります。

**文字起こし方式を設定してから録音してください。**

## 4. 録音・リプレイ作成

1. 参加者全員の同意を得てから、Discordで **/join** → 会話 → **/leave** を実行します。
2. 文字起こしが完了するまでアプリを起動したままにします。
3. ブラウザの **リプレイ作成** で原文を確認し、AIで原稿を作ります。文章生成AIを使う場合は、別途SettingsでAPIキーを設定します。
4. **完成版HTML (.html)** で保存します。

**終了**：起動した黒いウィンドウで **Ctrl+C**。録音・設定は **user-data** フォルダーに保存されます。バックアップ時はアプリを終了してからフォルダーごとコピーしてください。

[すべての操作を詳しく見る](user-manual.md)
