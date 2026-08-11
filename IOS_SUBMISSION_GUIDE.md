# iOS App Store 申請手順(あなたご自身で行う作業)

このリポジトリには、App Store申請に必要な以下の準備がすでに済んでいます。

- `vendor/` — React/ReactDOM/Recharts/Babel等をローカル同梱化(CDN依存を解消)
- `icon-1024.png` — App Store掲載用アイコン(1024×1024, アルファなし)
- `privacy.html` — プライバシーポリシー
- `APPSTORE.md` — App Store Connect掲載情報のドラフト
- `package.json` / `capacitor.config.json` / `scripts/sync-www.js` — Capacitor(iOSラッパー)の雛形

ここから先は、開発者アカウント登録・支払い・Xcodeでの署名など、私(Claude Code)が代行できない作業です。順番に進めてください。

## 1. Node.js をインストール

https://nodejs.org からLTS版をダウンロードしてインストールしてください(インストーラのGUIでの操作が必要です)。

```bash
node -v
npm -v
```

で動作確認できればOKです。

## 2. フルXcodeをインストール

現在このMacには Command Line Tools のみが入っており、フルXcodeが入っていません。App Store アプリから「Xcode」を検索してインストールしてください(数GBあるため時間がかかります)。インストール後、初回起動でライセンス同意と追加コンポーネントのインストールが必要です。

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

## 3. 依存パッケージのインストールとiOSプロジェクトの生成

このリポジトリのルートで:

```bash
npm install
npm run ios:add
```

`ios/` フォルダにXcodeプロジェクトが生成されます。今後、`index.html` 等を変更したら

```bash
npm run ios:sync
```

を実行してからXcodeでビルドしてください(`www/` へのコピー→Capacitor同期をまとめて行います)。

## 4. Apple Developer Program に登録

https://developer.apple.com/programs/ から登録(年間$99)。有料アプリとして配信するため、App Store Connect側で「契約/税金/銀行情報(Agreements, Tax, and Banking)」の入力も必要です。

## 5. Bundle ID を確認・登録

`capacitor.config.json` の `appId` は仮に `com.hajime5150.overloadplus` としています。そのまま使う場合も、変更する場合も、developer.apple.com の **Certificates, Identifiers & Profiles → Identifiers** で同じ文字列のApp IDを登録してください。変更する場合は `capacitor.config.json` を編集後、`npm run ios:sync` を再実行してください。

## 6. Xcodeでアイコン・署名を設定

```bash
npm run ios:open
```

でXcodeが開きます。

- `Assets.xcassets` の App Icon に `icon-1024.png` を設定(Xcode 14以降は1024の単一画像を登録すれば他サイズは自動生成されます)
- 「Signing & Capabilities」タブで Team を自分のApple Developerアカウントに設定

## 7. シミュレータで動作確認

Xcodeで実行(▶)し、シミュレータ上でオンボーディング〜記録入力〜グラフ表示まで一通り操作してください。特に**機内モードにしても正常に起動すること**を確認してください(CDN依存を解消済みなので、オフラインでも動くはずです)。

## 8. App Store Connect にアプリを登録

https://appstoreconnect.apple.com → マイApp → ＋ → 新規App

- Bundle ID: 手順5で登録したものを選択
- 名前・サブタイトル・説明文・キーワード等は [APPSTORE.md](APPSTORE.md) の内容を貼り付け
- プライバシーポリシーURL: GitHub Pagesを有効化した上で `https://hk5150.github.io/OVERLOAD-PLUS/privacy.html` を設定
- App Privacy(データ収集)の質問には「データを収集しない」で回答
- 価格帯: 銀行・税務情報の入力完了後に選択可能になります

## 9. スクリーンショットを用意

Xcodeシミュレータ(iPhone 16 Pro Max等、6.9インチ相当)でアプリの主要画面を `Cmd+S` で保存し、App Store Connectの規定枚数分アップロードしてください。

## 10. ビルドをArchiveしてアップロード

Xcodeで **Product → Archive**。完了後に開く Organizer から **Distribute App → App Store Connect** を選んでアップロードします。

## 11. 審査に提出

App Store Connect上でビルドを選択し、「App Review情報」の「メモ」に [APPSTORE.md](APPSTORE.md) 末尾の申し送り文を入力して、審査に提出してください。

---

補足: まずは公開前に **TestFlight** で自分のiPhoneに配布して動作確認するのがおすすめです(App Store Connect → TestFlight タブから、審査提出前でも内部テスターとして自分を追加できます)。
