# SUNBOO Handbook

**ステータス：ドラフト（Phase6「SUNBOO Handbook」成果物）**
コードは一切変更していない。READMEでも仕様書でもない。**運営者・新しい開発者・将来の自分が
最初に読む「最初の5分」の入口**だけを書く。詳細はすべてリンク先に委ね、ここでは重複記載しない。

---

## 1. SUNBOOとは

SUNBOOは行政手続きを管理するソフトではない。経営者と税理士が、一年を安心して過ごすための
「行政手帳」である。会社情報を入力するだけで、提出すべき書類・期限・提出先が分かる。
会計ソフトでも士業の代替でもなく、**行政手続きの「情報を見る／自動生成する」サービス**（詳細は
[CLAUDE.md](../CLAUDE.md)）。迷わせない、不安を煽らない、必要なことだけを必要なタイミングで届ける
——これがSUNBOOの思想のすべて（7節に全文を掲載）。

---

## 2. まず読むもの

この順番で読む。

1. **[PROJECT_STATUS.md](PROJECT_STATUS.md)** — 今どこまで完成しているかを5分で把握するダッシュボード。最初の1つ
2. **[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md)** — Version 1.0を公開できる状態かのチェックリスト
3. **[LAUNCH_OPERATIONS.md](LAUNCH_OPERATIONS.md)** — 公開後、日々の運営（問い合わせ・障害対応・バックアップ）をどう回すかの手順書
4. **[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)** — プロダクト全体の背景・想定ユーザー・これまでの経緯

---

## 3. 今のフェーズ

**現在フェーズの正本は[PROJECT_STATUS.md](PROJECT_STATUS.md)。** 本ドキュメントでは値を書き写さず、
フェーズの並び（[PROJECT_STATUS.md](PROJECT_STATUS.md) §3）だけを示す。

```
Closed Beta（現在地） → Open Beta → 正式リリース → Version 2
```

「今どの段階か」は必ず[PROJECT_STATUS.md](PROJECT_STATUS.md)を見て確認すること。本ハンドブックの
記述が古くなっていても、[PROJECT_STATUS.md](PROJECT_STATUS.md)側が更新されていれば後者を信じる。

---

## 4. 困ったら

| 知りたいこと | 見る場所 |
|---|---|
| 仕様（何のためのサービスか、想定ユーザーは誰か） | [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) |
| 設計（各機能がどのバージョンで実装されたか、実装状況） | [ROADMAP.md](ROADMAP.md) |
| Beta（β参加者から出た問題・要望の一覧） | [BETA_BACKLOG.md](BETA_BACKLOG.md) |
| 品質（公開前の最終監査結果） | [CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md) |

---

## 5. 新機能を作る前に

以下を確認してから着手する（詳細な開発フローは[CLAUDE.md](../CLAUDE.md)を参照）。

- [ ] [BETA_BACKLOG.md](BETA_BACKLOG.md)にBlockerが残っていないか
- [ ] 同じくHighが残っていないか
- [ ] その機能はBeta Feedback（[BETA_BACKLOG.md](BETA_BACKLOG.md)）で実際に要望が出ているものか、
      それとも思いつきか（[VISION.md](../VISION.md)「現場が正しい」原則）
- [ ] [PROJECT_STATUS.md](PROJECT_STATUS.md) §2「現在の優先順位」と矛盾しないか
- [ ] それはVersion 1.0のスコープ対象か、それとも6節の対象（Version 2送り）か

---

## 6. Version 2

**Version 1.0を壊さない。Betaで要望が多いものだけを採用する。**
新機能の要求受付・優先順位・採用/保留/却下の判断ルールは新設せず、
[LAUNCH_OPERATIONS.md](LAUNCH_OPERATIONS.md) §7にすでに定義済みのものをそのまま使う。

---

## 7. SUNBOO Principles

---

SUNBOOは

行政手続きを管理するためのソフトではない。

経営者と税理士が、

一年を安心して過ごすための

「行政手帳」である。

迷わせない。

不安を煽らない。

必要なことだけを、

必要なタイミングで届ける。

---
