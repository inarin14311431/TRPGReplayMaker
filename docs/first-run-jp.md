# TRPGReplayMaker 初回セットアップガイド（Windows）

## 1. Dockerなしで起動
1. [Windows版ビルド（GitHub Actions）](https://github.com/inarin14311431/TRPGReplayMaker/actions/workflows/windows-portable.yml)の成功した最新の`main`実行から `TRPGReplayMaker-Windows-Portable` を取得します（GitHubログインが必要）。中の `TRPGReplayMaker-Windows.zip` を通常のフォルダーに展開します。タグ付き公開版があるときは [GitHub Releases](https://github.com/inarin14311431/TRPGReplayMaker/releases) から取得できます。
2. `Start-ReplayMaker.bat` をダブルクリックします。Node.jsやDockerのインストールは不要です。
3. ブラウザで `http://127.0.0.1:3000` を開きます。初回は `admin / admin` でログインし、すぐパスワードを変更します。
4. 起動中のウィンドウは閉じないでください。閉じるとBotも停止します。

**必ず配布ZIPとソースZIPを区別してください。** ソースZIPで始める場合：GitHubのCode → Download ZIPには実行環境が入っていません。Node.js 24以上をインストールし、同じ起動ファイルを使います。初回だけ依存ライブラリとWeb画面を構築します。

## 2. Discord Botを作成する（初回のみ）
1. [Discord Developer Portal](https://discord.com/developers/applications) で `New Application` を作成します。
2. `Bot` ページでBotのTokenを取得し、`General Information` ページでApplication IDをコピーします。
3. 起動後の初回設定画面にそれぞれ貼り付け、画面の招待リンクで使用するDiscordサーバーにBotを追加します。
4. `保存して接続する` を押します。Botのトークンは他者に共有しないでください。

## 3. 文字起こしを設定する（録音前に必須）
**簡単に始める場合：OpenAIの音声認識API**
1. OpenAIのAPIキーを用意します。ChatGPTの有料プランとAPI利用料金は別です。
2. Web管理画面の Settings → Transcription で `OpenAI (cloud)` を選び、APIキーを保存します。
3. 使用する音声認識モデルを選択します。API利用時のみ音声分数などに応じて料金がかかります。キーの登録だけで自動課金を開始することはありません。

**API利用料なしで始める場合：ローカルfaster-whisper**
1. [Python 3.11](https://www.python.org/downloads/) をインストールします。
2. 配布フォルダーの `Setup-Local-Whisper.bat` を実行します。インターネット接続が必要です。
3. 起動ウィンドウを閉じて `Start-ReplayMaker.bat` を再実行します。
4. Settings → Transcriptionで `Local sidecar (faster-whisper)` を選択します。初回使用時はモデルをダウンロードします。CPU環境では時間がかかります。

**重要**：ZIP版にはPython本体もWhisperのモデルも含まれていません。何も設定しないまま録音すると文字起こしに失敗します。録音データは原則保持されますが、成功を保証するものではありません。

## 4. セッションを録音してリプレイへ
1. 参加者全員の録音同意を確認します。
2. DiscordのVCに入り `/join` で録音を開始します。
3. 終了後 `/leave`。バックエンドで文字起こしが完了するまで起動ウィンドウを閉じないでください。
4. Web画面の「リプレイ作成」でログを修正し、必要なAIを設定して原稿を生成します。
5. `完成版HTML (.html)` をクリックし、ブラウザで開ける単体HTMLとして保存します。

## 5. 停止・保存とトラブル対応
- 起動中のコマンド画面で `Ctrl+C` で停止します。セッション中の強制停止は録音の一部欠落につながるため避けてください。
- 録音・SQLiteデータベース・APIキーは配布フォルダーの `user-data` に保存します。バックアップはアプリ停止後に実施してください。
- `user-data`、`.env`、録音データは公開GitHubにアップロードしないでください。
- 保存フォルダーを書込み不可の場所（Program Filesなど）にしないでください。
- ブラウザが起動直後につながらない場合は再読み込みし、起動ウィンドウのログを確認してください。
- Docker方式が必要な場合は `Start-ReplayMaker-Docker.bat`、停止は `Stop-ReplayMaker-Docker.bat` を使用します。

実際の画面・設定項目に沿った説明は [初心者向け利用マニュアル](user-manual.md)、ZIPの仕組みは [Windowsポータブル導入ガイド](portable-windows.md) にあります。
