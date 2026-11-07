# Windowsポータブル版（Dockerなし）

## 利用者向け
初回導入のためにDocker DesktopやWSL2をインストールする必要はありません。
配布版ZIPには、Windows x64向けNode.js 24実行ファイル、Bot本体、npm依存ライブラリ、ビルド済みWeb画面が含まれます。

1. [Releases](https://github.com/inarin14311431/TRPGReplayMaker/releases) から `TRPGReplayMaker-Windows.zip` をダウンロード。
2. ZIP内をすべて展開。通常のユーザーフォルダーなど書き込み可能な場所を使用。
3. `Start-ReplayMaker.bat` をダブルクリック。ブラウザが起動したらログインし、初期パスワードを変更。
4. Discord Botを接続して招待。
5. **文字起こし方式を必ず先に選択**。APIならOpenAIキーをSettingsで登録してOpenAIを選択、オフラインならPython 3.11と `Setup-Local-Whisper.bat` でWhisperを追加。
6. `/join` → `/leave` で録音。Webのリプレイ編集画面で文章を生成しHTMLを書き出し。

停止は起動コンソールで `Ctrl+C` を押します。録音中・文字起こし中の強制終了には注意してください。

## 配布ZIPとソースZIPの違い
| パッケージ | Docker | Node.js別途導入 | Python |
|---|---|---|---|
| Releases / Actions Windows Portable ZIP | 不要 | 不要（同梱） | ローカルWhisper時のみ必要 |
| Code → Download ZIP（ソース） | 不要 | 必要（Node.js 24＋npm） | ローカルWhisper時のみ必要 |
| Docker Compose | 必要 | 不要 | コンテナーが同梱 |

**API文字起こしの料金**：ChatGPTのPlus契約とは別のAPI請求になります。録音だけではなく文字起こしAPI呼び出しに料金が発生します。利用したい場合にのみSettingsで選択してください。

## 個人データと更新
Windows版の録音、SQLite DB、APIキー、ユーザー設定は `user-data` フォルダーに保存されます。配布ZIP自体に個人データやAPIキーは入りません。
バージョンアップ時はアプリを停止し、`user-data` をバックアップした後、新しいフォルダーへコピーしてください。
以前Docker版を使っていた場合、データはDockerボリュームに保存されているため、ポータブル版へ自動移行しません。単純なフォルダーコピーでは移行できません。

## GitHub配布を行う仕組み
`.github/workflows/windows-portable.yml` がWindows上でNode.js本体と本体の依存ライブラリをまとめ、Web画面をビルドしてZIPを作ります。
ビルド後に実際のWindows環境で `/api/auth/me` が200を返すことを確認するスモークテストを実行します。
mainへの変更でGitHub ActionsのArtifactに保存し、`v*` タグの公開時にはGitHub ReleasesへプレリリースとしてZIPを添付します。
これはインストーラーのexeではなく、実行環境を同梱したフォルダー型のポータブルアプリです。デジタル署名付きの実行ファイルではないため、Windowsの警告や企業PCの実行制限により利用できない場合があります。

## 別方式
- 任意：`Setup-Local-Whisper.bat` はPython 3.11が必要。STT API料金を避けられる代わりにCPU/RAMを使用します。
- 任意：Dockerが使える環境なら `Start-ReplayMaker-Docker.bat` も引き続き利用できます。
- macOS/Linux：Node.js 24またはDocker Composeでセルフホスト可能です。Windows用ZIPは使用できません。

## 制約
ブラウザは自身のPCからのみアクセスできるlocalhostで稼働します。Discord録音Botの起動にはDiscord接続が必要です。
8〜12時間のDiscord実録音やWindows利用者の環境ごとのGPU/音声認識性能はまだ十分に検証されていません。
