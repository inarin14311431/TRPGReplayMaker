# TRPGReplayMaker はじめての使い方（Windows）

**Discordの会話を録音し、AIでリプレイを作り、HTMLで保存する**ための手順です。

設定するのは **Botを動かす人のPCだけ**。ほかの参加者はDiscordだけで大丈夫です。

## 1. アプリをダウンロードする

1. **[Windows版のダウンロードページ](https://github.com/inarin14311431/TRPGReplayMaker/actions/workflows/windows-portable.yml)** を開きます。
2. 一覧から、緑のチェックが付いた新しい **main** の実行を開きます。
3. ページ下部の **Artifacts → TRPGReplayMaker-Windows-Portable** をクリックしてダウンロードします。※GitHubへのログインが必要です。
4. ダウンロードしたZIPを展開し、中にある **TRPGReplayMaker-Windows.zip** も展開します。

**「Code → Download ZIP」は選ばないでください。** こちらはプログラムのソースで、すぐ使える配布版とは異なります。

## 2. 起動する

1. 展開したフォルダーの **Start-ReplayMaker.bat** をダブルクリックします。
2. ブラウザに管理画面が開きます。開かない場合は **http://127.0.0.1:3000** を直接開きます。
3. 最初のログインは次のとおりです。

   - ユーザー名：**admin**
   - パスワード：**admin**

4. ログイン後、**パスワードを必ず変更**します。

**起動時の黒いウィンドウは、録音が終わるまで閉じないでください。** DockerやNode.jsのインストールは不要です。

## 3. Discord Botを登録する（最初の1回だけ）

1. **[Discord Developer Portal](https://discord.com/developers/applications)** を開き、**New Application** から新しいアプリを作ります。
2. **General Information → Application ID** をコピーします。
3. **Bot → Token** からBotのトークンをコピーします。必要なら **Reset Token** で発行します。
4. TRPGReplayMakerの初回設定画面に、**アプリケーションID** と **Botのトークン** を貼り付けます。
5. **保存して接続する** をクリックします。
6. **DiscordサーバーにBotを招待** をクリックして、録音するサーバーへ追加します。

**Botのトークンを他人に送ったり、GitHubへ載せたりしないでください。**

## 4. 文字起こしを設定する（録音前に必要）

画面の **Settings → Transcription** を開き、**どちらか一方**を設定します。

### A. 手軽に始めたい：OpenAI（有料）

1. **[OpenAI APIキー](https://platform.openai.com/api-keys)** を用意します。
2. Transcriptionの **Provider** で **OpenAI** を選びます。
3. APIキーを入力して保存し、文字起こしモデルを選びます。

音声をAPIに送って文字にします。**使用量に応じて料金が発生**します。ChatGPT Plusの契約とは別です。

### B. API料金をかけたくない：ローカルWhisper

1. **[Python 3.11](https://www.python.org/downloads/)** をインストールします。
2. 配布フォルダーの **Setup-Local-Whisper.bat** をダブルクリックし、インストールを終えます。
3. TRPGReplayMakerを再起動します。
4. Transcriptionの **Provider** で **Local sidecar (faster-whisper)** を選びます。

音声を自分のPCで文字にします。**音声認識のAPI料金は0円**ですが、PCの性能によっては処理に時間がかかります。

**ここを設定しないと、録音後の文字起こしに失敗する場合があります。**

## 5. Discordで録音する

1. 録音することを**参加者全員に説明し、同意を得ます**。
2. Discordのボイスチャンネルへ入ります。
3. テキストチャットに **/join** と入力して録音を開始します。
4. セッション終了後、**/leave** と入力します。
5. 文字起こしが終わるまで、TRPGReplayMakerを起動したままにします。

最初は**1～2分のテスト録音**で、音声が文字になることを確認すると安心です。

## 6. リプレイを作って保存する

1. ブラウザで **リプレイ作成** を開き、録音したセッションを選びます。
2. **アクト名・キャスト名・PL名** を設定します。TRPGシステムはトーキョーN◎VAが初期値ですが変更できます。
3. **用語集** を選びます。「自動選択」ならシステムに合う用語が使われます。
4. **文字起こし・原文照合** で誤字やキャストの発言を修正します。
5. 文章生成に使うAIを選びます。**OpenAI・GeminiなどのAPIキーはSettingsで登録**します（API利用料金は各社の規定によります）。
6. シーンごとにAIで原稿を作り、内容を確認・修正します。
7. **完成版HTML (.html)** をクリックして保存します。

完成したHTMLは、**ダブルクリックするだけでブラウザで読めます**。

[完成HTMLの短いサンプルを見る](../examples/nova-short-replay.html)

## 7. 終了する・データを保存する

- **終了**：起動した黒いウィンドウで **Ctrl+C** を押します。録音や文字起こしの途中では終了しないでください。
- **データの保存先**：配布フォルダー内の **user-data** です。録音・リプレイ・設定が入ります。
- **バックアップ**：アプリを終了してから **user-dataフォルダーを丸ごとコピー**します。
- **注意**：user-dataにはAPIキーや録音内容が含まれるので、公開・共有しないでください。

## うまく動かないとき

| 症状 | まず確認すること |
|---|---|
| アプリが起動しない | ZIPを**すべて展開**したか、Start-ReplayMaker.batを実行したか |
| ブラウザが開かない | **http://127.0.0.1:3000** を直接開く。黒いウィンドウのエラーを見る |
| BotがDiscordに現れない | トークン・アプリケーションID・招待先サーバーを確認 |
| /joinが使えない | Botがオンラインか、Discordでコマンド権限を持っているか確認 |
| 文字起こしができない | Settings → TranscriptionでOpenAIまたはローカルWhisperの設定を確認 |

より詳しい情報： [初期設定の補足](first-run-jp.md) ／ [リプレイ編集](replay-studio.md) ／ [用語集](trpg-glossary.md)
