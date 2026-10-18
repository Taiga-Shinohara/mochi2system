# 👛 ふたりペイ (PairPay) - 2人の生活費＆スマート精算アプリ

> **固定費・変動費・按分比率を直感管理。視覚的メーターで「どちらがいくら払うか」が一目でわかる精算アプリ**

---

## ✨ 主な機能

1. **視覚的バランスメーター（シーソーゲージ）**
   - 支出を入力するたびに、2人の天秤メーターがリアルタイムに傾きます。
   - 毎月の精算時に「AさんがBさんに ¥〇〇 支払う」という結論がひと目でわかります。

2. **固定費と変動費のスマート管理**
   - **固定費**: 家賃、インターネット回線、サブスクなど毎月の固定支払いを事前登録。毎月自動で合算されます。
   - **変動費**: スーパーの買い物、外食、日用品、水道光熱費の検針分など、日々のレシートをスマホから10秒でクイック登録。

3. **柔軟な按分比率**
   - 基本比率（例: 5:5折半、6:4、7:3など自由設定）
   - 支出ごとに「基本比率」「折半」「全額A負担」「全額B負担」「カスタム比率」を選択可能。

4. **LINE一発精算テキスト生成**
   - 「LINEで精算を送る」ボタンを押すと、内訳と送金依頼メッセージがクリップボードにコピーされ、LINEアプリが開きます。

5. **2人のスマホ間でリアルタイム同期（Supabase連携）**
   - 無料のSupabaseデータベースと接続すれば、お互いが入力した内容が即座に同期されます。
   - もちろんSupabase未設定でも、ブラウザのローカル保存ですぐ使えます。

---

## 🚀 GitHubへの登録 ＆ Vercelでの公開手順

### STEP 1: GitHubでリポジトリを作成する
1. [GitHub](https://github.com/) にログインし、右上の「＋」から **「New repository」** を選択。
2. リポジトリ名を入力（例: `pairpay` または `household-budget`）。
3. 「Public」または「Private」を選び、**「Create repository」** をクリック。
4. 作成されたリポジトリのURL（例: `https://github.com/ユーザー名/pairpay.git`）をコピー。

### STEP 2: Antigravity（ターミナル）からGitHubへプッシュ
以下のコマンドを実行します：

```bash
cd /Users/apple/.gemini/antigravity-ide/scratch/household-budget
git init
git add .
git commit -m "feat: ふたりペイ初期リリース"
git branch -M main
git remote add origin <コピーしたGitHubのURL>
git push -u origin main
```

### STEP 3: Vercelで世界に公開（デプロイ）
1. [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでログイン。
2. ダッシュボードの **「Add New...」→「Project」** を選択。
3. 先ほどプッシュしたリポジトリ（`pairpay`）の **「Import」** をクリック。
4. 設定は自動認識されるので、そのまま **「Deploy」** をクリック！
5. 約30秒で公開URL（`https://pairpay-xxxx.vercel.app`）が発行されます。
6. このURLを2人のスマートフォンのホーム画面に追加（PWA風）すれば、いつでも手軽に使えます！

---

## ☁️ 2人でリアルタイム同期するための設定（Supabase）

1. [Supabase](https://supabase.com/) にアクセスして無料アカウントを作成し、新しいProjectを作成。
2. 左メニューの **「SQL Editor」** を開く。
3. アプリ右上の「☁️」バッジ →「テーブル作成SQL」をコピーして貼り付け、**「Run」** を押す。
4. **「Project Settings」→「API」** から「Project URL」と「anon public key」をアプリの設定画面に入力して保存。
5. これで2人のスマホ間で入力がリアルタイムに即時反映されます！
