# TECHNICAL_DEBT_SUBMISSION_DIRECTORY.md — Submission Directory 技術的負債（Phase5-4）

**作成日**: 2026-07-17
**目的**: RC1完了時点でSubmission Directoryに残る技術的負債を優先順位付きで列挙する。コード調査（`src/lib/submissionDirectory*`・`src/app/share`・`package.json`）に基づく事実ベースの棚卸しであり、対応方針の決定は行わない（Phase5-4の制約: コード変更禁止）。

---

## 優先度P0（RC1のUAT判定に直結する未検証事項）

### 1. 実ブラウザでのUAT（Phase5-3）が未実施

- 検証用企業データ（`workspace_companies`3社）はSupabase Dashboardでの投入が必要（anon keyのみのため本セッションからは投入不可）
- 手順書・チェックシート（[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md)・[PHASE5_3_BROWSER_CHECKLIST.md](PHASE5_3_BROWSER_CHECKLIST.md)）は準備済み・未記入
- **影響**: Cutoverのユニットテスト（12/12 PASS）はdecision.tsの純粋関数のみを検証しており、Server Component境界・実DB・実画面での動作は未確認のまま

### 2. `/result`（診断エンジン）がCutover未接続

- `src/lib/diagnosis.ts: runDiagnosis` → `resolveOffices`は旧`jurisdictions`のみを参照し、`submissionDirectoryCutover`を一切呼び出していない（コード確認済み）
- **影響**: 診断フロー（未ログインユーザーが最初に触れる画面）経由では、札幌市・福岡市・北九州市の法人市民税・償却資産の提出先が旧結果（`office: null`）のまま表示される。Workspace経由とユーザー体験に一貫性がない

### 3. 共有ページ（Share）がCutover未接続

- `src/app/share/[token]/page.tsx`は`buildAnnualRoadmap`を直接呼び出しており、`workspaceLoader.loadWorkspaceRoadmapContext`（Cutoverが配線されている経路）を経由していない（`grep`で確認済み、`applyCutover`系の呼び出しはこのファイルに0件）
- **影響**: 同じ会社のWorkspace Roadmap画面とShare画面で、法人市民税・償却資産の提出先表示が食い違う可能性がある（Workspace側は新Resolver、Share側は旧Resolver）

---

## 優先度P1（次のCutover対象拡大前に解消すべき運用上のギャップ）

### 4. Preview Route以外から新Resolverの大半のデータへ到達できない

- [RESOLVER_COVERAGE.md](RESOLVER_COVERAGE.md)で確認した通り、新Resolverには`tax_office`/`legal_affairs_bureau`/`pension_office`/`labor_standards`/`hello_work`/`prefectural_tax`（福岡県72市区町村分）のデータが既に存在するが、`PHASE5_2_CUTOVER_TARGETS`に含まれないため、`/admin/submission-directory-preview`（管理画面限定・robots非公開）以外のどの画面からも到達しない
- **影響**: せっかく投入済みの福岡県データが実利用者に一切届いていない。Cutover対象を広げるだけで（データ再調査なしで）UXが改善できる余地がある

### 5. `SALARY_PAYMENT_REPORT`・`RESIDENT_TAX_WITHHOLDING`の`each_employee`ルールが未配線

- 新Resolver側は`requires_employee_address`状態に対応済み（`procedure_submission_rules`に無条件ルール投入済み）だが、`PHASE5_2_CUTOVER_TARGETS`のprocedure一覧（65・66のみ）に含まれないため、Workspace Roadmap上は引き続き旧Resolverの結果（会社所在地の窓口を誤って断定表示するリスクが残る設計）が使われ続けている
- **影響**: 「従業員ごとに提出先が変わる」という重要な業務ルールが、データはあるのに画面に反映されていない

### 6. `official_url_status='unchecked'`（未検証）の窓口が大半

- Migration調査で確認した限り、新Resolver投入済みの窓口の多くが`official_url_status='unchecked'`のまま（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 5-1節の方針通り、内容確認済みでも`'ok'`に格上げしていない）。これは意図的な設計（推測で`'ok'`にしない）だが、運用上は`verificationStatus='unverified'`（`publicVerificationLabel`に「（未確認）」表示）がほぼ全件に付く状態が続く
- **影響**: 機能上の欠陥ではないが、利用者に見える「未確認」表示の割合が高いままだと、機能全体の信頼性が低く見える可能性がある。生存確認（URLチェック）の運用サイクルが未確立

---

## 優先度P2（開発基盤・CI/CDの負債）

### 7. Playwrightがnpm依存として未導入

- `package.json`に`playwright`関連の依存が無い（`playwright-core`が`node_modules`にキャッシュ経由で存在するのみ、`npx playwright install chromium`相当を都度手動実行する運用）
- **影響**: ブラウザ確認の再現性が低い。新しいセッション・別マシンでは`~/Library/Caches/ms-playwright`のキャッシュが無い限り即座には使えない

### 8. GitHub Actions等のCIが未導入

- `npm run build`・`node --test`（3つの`.test.ts`、計23ケース）はいずれも手動実行のみで、プッシュ・PR時の自動実行が無い
- **影響**: 今後Cutover対象を拡大していく際、既存のテスト（Resolver 8ケース・Adapter 5ケース・Cutover 12ケース）が回帰していないことをコミットのたびに人手で確認する必要がある

### 9. `npm run lint`（`next lint`）が動作しない既知の問題

- CLAUDE.mdに既知の問題として明記されており、ブロッカー扱いにはしない方針だが、放置期間が長くなるほど後から一括修正するコストが増える

### 10. `npm run test`相当のnpm scriptが無い

- `package.json`の`scripts`に`test`エントリが無く、`node --test src/lib/.../*.test.ts`を個別に手動実行する必要がある（decision.tsの相対import排除という技術的制約に起因、[SUBMISSION_DIRECTORY_ARCHITECTURE.md](SUBMISSION_DIRECTORY_ARCHITECTURE.md) 4節参照）
- **影響**: 3つのテストファイルを横断して一括実行する手段が用意されておらず、実行漏れのリスクがある

---

## 優先度P3（設計上の既知の限定事項、影響は小さいが記録しておくべきもの）

### 11. 政令指定都市の「区ごとの集約パターン」が2市分の実績しかない

- [MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 11節が明記する通り、「区ごとではなく市に集約される」というパターンは福岡市・北九州市の2例のみで確認されたものであり、他の18市が同じ構造を持つとは限らない。次の政令指定都市に着手する際、必ずゼロから確認する必要がある（推測適用の禁止）

### 12. 東京都特別区の地理マスタが未投入（22/23区）

- [SUBMISSION_DIRECTORY_ROADMAP.md](SUBMISSION_DIRECTORY_ROADMAP.md) 3節の通り、渋谷区以外の東京22区は`municipalities`に存在しない。特別区は「都税事務所への一本化」という制度差もあり、他の政令指定都市と同じ調査パターンをそのまま適用できない可能性が高い

### 13. `procedure_submission_rules`の評価ロジックが`ruleEngine.ts`と意図的に重複している

- `resolve.ts`の`evaluateCondition`は既存の経営イベントエンジン用`ruleEngine.ts`と同じ演算子語彙を独自実装している（設計判断として意図的、コードコメントに明記）。将来的に演算子を追加する際、2箇所を同時に更新し忘れるリスクが構造的に残る

---

## まとめ表

| # | 項目 | 優先度 | 種別 |
|---|---|---|---|
| 1 | Browser UAT未実施（Phase5-3） | P0 | 検証未実施 |
| 2 | `/result`未切替 | P0 | 未接続 |
| 3 | Share未切替 | P0 | 未接続 |
| 4 | Preview Route以外への新Resolverデータ未到達（6カテゴリ×福岡県72市区町村） | P1 | 未接続（データはあるが未活用） |
| 5 | `each_employee`ルール未配線 | P1 | 未接続 |
| 6 | 窓口の大半が`unverified` | P1 | 運用未確立 |
| 7 | Playwright未導入（npm依存） | P2 | 開発基盤 |
| 8 | GitHub Actions未導入 | P2 | 開発基盤 |
| 9 | `next lint`動作不良 | P2 | 開発基盤（既知・ブロッカー扱いしない） |
| 10 | `npm test`スクリプト不在 | P2 | 開発基盤 |
| 11 | 政令指定都市の集約パターンが2例のみ | P3 | 設計上の限定事項 |
| 12 | 東京特別区の地理マスタ未投入 | P3 | データギャップ（[SUBMISSION_DIRECTORY_ROADMAP.md](SUBMISSION_DIRECTORY_ROADMAP.md)と重複記載） |
| 13 | ルール評価ロジックの意図的重複 | P3 | 設計上の限定事項 |
