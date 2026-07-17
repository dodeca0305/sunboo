# PHASE5_3_BROWSER_CHECKLIST.md — Phase5-3 検証チェックシート

未記入のテンプレート。[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md)の
手順に従って実際にブラウザで確認した結果をこのファイルに追記していく。

検証実施日: _____________
実施者: _____________
環境（local / staging等）: _____________
投入した`workspace_companies.id`（[PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md) 3節の結果を転記）:
- 札幌: id=____
- 福岡: id=____
- 北九州: id=____

---

## 手続き単位のチェック（Cutoverの中核確認）

| # | 企業名 | municipality_code | 手続き | 期待status | 期待提出先 | 実結果 | PASS/FAIL | Screenshot path | Console error件数 | HTTP 500件数 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [E2E] 札幌提出先検証株式会社 | 011011 | 法人市民税申告（MUNICIPAL_RESIDENT_TAX_RETURN） | resolved（新Resolver採用） | 中央市税事務所諸税課法人市民税係 | | | | | |
| 2 | [E2E] 札幌提出先検証株式会社 | 011011 | 償却資産申告（DEPRECIABLE_ASSET_TAX_RETURN） | resolved（新Resolver採用） | 中央市税事務所固定資産税課償却資産担当 | | | | | |
| 3 | [E2E] 福岡提出先検証株式会社 | 401331 | 法人市民税申告（MUNICIPAL_RESIDENT_TAX_RETURN） | resolved（新Resolver採用） | 財政局法人税務課法人市民税係 | | | | | |
| 4 | [E2E] 北九州提出先検証株式会社 | 401013 | 法人市民税申告（MUNICIPAL_RESIDENT_TAX_RETURN） | resolved（新Resolver採用） | 財政・変革局税務部課税第一課 | | | | | |
| 5 | [E2E] 北九州提出先検証株式会社 | 401013 | 償却資産申告（DEPRECIABLE_ASSET_TAX_RETURN） | 旧結果維持（Cutover対象外） | 窓口欄が空／情報なし相当（`not_supported`という文言がWorkspace画面に出現しないこと） | | | | | |

## 画面単位のチェック

### Dashboard

| 企業名 | HTTP 500エラー | Hydrationエラー | Console error件数 | Screenshot path | PASS/FAIL |
|---|---|---|---|---|---|
| [E2E] 札幌提出先検証株式会社 | | | | `test-results/phase5-3/A-sapporo-dashboard.png` | |
| [E2E] 福岡提出先検証株式会社 | | | | `test-results/phase5-3/B-fukuoka-dashboard.png` | |
| [E2E] 北九州提出先検証株式会社 | | | | `test-results/phase5-3/C-kitakyushu-dashboard.png` | |

### Roadmap

| 企業名 | 正常表示 | 提出先情報表示 | 従来表示が壊れていないか | Console error件数 | HTTP 500件数 | Screenshot path | PASS/FAIL |
|---|---|---|---|---|---|---|---|
| [E2E] 札幌提出先検証株式会社 | | | | | | `test-results/phase5-3/A-sapporo-roadmap.png` | |
| [E2E] 福岡提出先検証株式会社 | | | | | | `test-results/phase5-3/B-fukuoka-roadmap.png` | |
| [E2E] 北九州提出先検証株式会社 | | | | | | `test-results/phase5-3/C-kitakyushu-roadmap.png` | |

### PDF Export

| 企業名 | 生成成功 | 提出先表示が崩れていないか | Console error件数 | Screenshot path | PASS/FAIL |
|---|---|---|---|---|---|
| [E2E] 札幌提出先検証株式会社 | | | | `test-results/phase5-3/A-sapporo-pdf.png` | |

（PDF/Excelは代表1社での確認で可、[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md) 6節・7節の通り。他社でも確認した場合は行を追加する）

### Excel Export

| 企業名 | 生成成功 | 提出先表示が崩れていないか | Console error件数 | Screenshot path | PASS/FAIL |
|---|---|---|---|---|---|
| [E2E] 札幌提出先検証株式会社 | | | | `test-results/phase5-3/A-sapporo-excel.png` | |

---

## サマリー

- 手続き単位チェック（5件）: PASS ___ / FAIL ___
- 画面単位チェック（Dashboard3・Roadmap3・PDF1・Excel1 = 8件）: PASS ___ / FAIL ___
- Console error合計件数: ___
- HTTP 500系合計件数: ___
- 発見した不具合: _____________
- Phase5-3完了判定: _____________

---

## 検証完了後

[PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md) 4節のロールバックSQLを実行し、
削除後に`/admin/workspaces`一覧から3社が消えていることを確認したら、その旨をここに記録する。

- ロールバックSQL実行日時: _____________
- 削除後の確認: _____________
