# Chat Navigator Minimap

ChatGPT / Gemini などのチャット画面右側に「ミニマップ（縦ナビ）」を出して、長い会話でもサクッと移動できる拡張機能です。

## できること

- 右端に会話の「ミニマップ」を表示（ユーザー/アシスタントの発言をラインで一覧）
- ラインをクリックして該当メッセージへスクロール
- ホバーでプレビュー（短い内容をツールチップ表示）
- 上下ボタンで「前/次のアシスタント返信」にジャンプ
- ライト/ダークを自動追従

対応サイト:
- ChatGPT（`chatgpt.com` / `chat.openai.com`）
- Gemini（`gemini.google.com` / `bard.google.com`）

## 導入（開発者モードで読み込み）

1. このリポジトリを取得（zip 展開でもOK）
2. Chrome/Edge/Brave で `chrome://extensions` を開く
3. 右上の「デベロッパー モード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」→ このフォルダ（`chat-navigator-ext`）を選択

## 使い方

ChatGPT / Gemini を開くと、右側にミニマップが出ます。ラインをクリックして移動、上下ボタンで前後の返信にジャンプできます。
