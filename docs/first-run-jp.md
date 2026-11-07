# TRPGReplayMaker 初回セットアップガイド（Windows）

## 必要なもの
- Windows PC とDocker Desktop（無料で利用可能な範囲はDockerの利用条件に従う）
- Discordアカウントと、自分がBotを追加できるDiscordサーバー
- 初回のダウンロードと音声認識モデル取得にインターネット接続

## 1. アプリをダブルクリックで起動
1. [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) を導入し、起動します。Windows環境によってはWSL2の有効化が必要です。
2. [TRPGReplayMaker](https://github.com/inarin14311431/TRPGReplayMaker) 右上の `Code` → `Download ZIP` から取得します。
3. ZIPの中身を普通のフォルダーへすべて展開します。ZIP内から直接バッチファイルを実行しないでください。
4. `Start-ReplayMaker.bat` をダブルクリックします。最初はDockerイメージなどをダウンロードするので、インターネット接続が必要です。
5. ブラウザの `http://127.0.0.1:3000` が開きます。ページが表示されない場合、Docker Desktopでコンテナーの起動状態を確認し、ブラウザを再読み込みします。
6. 初期アカウント `admin` / `admin` でログインし、すぐにパスワードを変更します。

## 2. Discord Botを一度だけ登録
1. [Discord Developer Portal](https://discord.com/developers/applications) を開き、`New Application` でBot用のアプリを作成します。
2. 左の `Bot` でトークンを発行／リセットし、**Bot Token** をコピーします。トークンを他人やDiscordのチャットへ送らないでください。
3. 左の `General Information` にある **Application ID** をコピーします。
4. TRPGReplayMakerの初回セットアップ画面に両方を貼り付けます。
5. `DiscordサーバーにBotを招待` をクリックして招待を承認します。Botを追加できるサーバー管理権限が必要です。
6. `保存して接続する` を押します。順序が逆になっても、画面の `使い方ガイド` から再度Botを招待できます。
7. 初回設定後のダッシュボードでは `使い方ガイド` を開いて接続状態を確認できます。サーバー一覧がまだ表示されないときは `状態を更新` を押してください。

## 3. 音声を録音する
1. 管理者は画面の `Settings` で文字起こし方式が `Local sidecar` になっていることを確認します。ローカルのfaster-whisperなら音声認識のAPI料金はかかりません。
2. 参加者全員に録音することを説明し、同意を得ます。
3. Discordのボイスチャンネルへ参加して、テキストチャットから `/join` を実行します。
4. セッション終了後 `/leave` を実行します。文字起こしが終わるとリプレイ編集に進めます。

## 4. リプレイを作成する
1. Web画面左メニューの `リプレイ作成` をクリックします。
2. 録音を選び、アクト名、キャスト名、TRPGシステム、必要なら用語辞書を設定します。
3. 発言ログと原音声で誤認識を修正し、必要なら `長いログを自動分割` を使用します。
4. 文章生成方式で `GPT-6 Luna`（低価格API）または `Ollama`（PC内で文章生成）を選択します。LunaにはOpenAI APIキー、Ollamaには別途モデル導入が必要です。
5. 料金プレビューと文章の品質を確認しながらシーンを生成し、Markdownの原稿を書き出します。

## 終了・保存・安全
- `Stop-ReplayMaker.bat` はコンテナーを停止するだけです。録音・DBのDockerボリュームは消しません。
- `docker compose down -v` のようなコマンドは保存データを削除するため使用しないでください。
- Web画面はローカルPCの `127.0.0.1:3000` に限定して公開しています。外部公開する場合は認証・TLS・データ保護の追加設計が必要です。
- PC停止中のセッション音声は記録されません。長時間録音の実機負荷試験は未実施です。

## よくある問題
- `docker is not installed`：Docker Desktopをインストールします。
- `Docker Desktop is not running`：Docker Desktopを起動してからバッチファイルを再実行します。
- ブラウザに接続できない：Docker Desktopでbotとsidecarのコンテナー状態を確認します。必要なら `docker compose logs --tail 80` で原因を確認できます。
- DiscordのBotがいない：アプリケーションIDを確認し、`使い方ガイド` からBotをサーバーに招待します。
- Botはいるが録音できない：ボイスチャンネルへの接続権限、DiscordサーバーでのBotの権限を確認します。
