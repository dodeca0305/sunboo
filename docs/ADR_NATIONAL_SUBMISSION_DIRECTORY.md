# ADR: National Submission Directory — Phase2 福岡県パイロット 確定方針

- ステータス: **Accepted**（Version 1.0として凍結。D1〜D11採用、D12のみ保留）
- 決定日: 2026-07-16
- 詳細な選択肢・利点・リスクの比較表は [NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md)
  「意思決定章（Decision Register）」（D1〜D12）を正本とする。本ADRはPhase2実装に踏み込むにあたり、
  特に実装へ直結する7項目を簡潔に記録したものであり、詳細な比較検討はDecision Register側を参照すること。

## 1. 郵便番号を判定に使用しない（D1）

会社側の提出先判定キーとして郵便番号は採用しない。既存調査
（[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md) Sprint54）で
「`municipality_code`の直接選択方式が既に最適で、郵便番号経由の変換は精度を上げない」と結論済み。
`submission_offices.postal_code`は窓口側の表示情報としてのみ保持する。

## 2. 会社所在地（`municipality_code`）を第一キーとする

`CompanyLocation`（`municipalityId`/`prefectureId`）が判定の唯一の入力。市区町村スコープ→都道府県
スコープ→全国スコープの順に降格探索する（`resolve.ts` `findAtScope`）。住所番地・郵便番号は使わない。

## 3. 新4テーブルをPhase2以降の正本とする（D5）

`submission_offices` / `office_sources` / `submission_jurisdictions` / `procedure_submission_rules`
をPhase2〜4の間の正本とし、既存`organizations`/`organization_offices`/`jurisdictions`は
「Phase1.5時点のスナップショットとして凍結・更新しない」。福岡県未整備分（`municipal_tax`/
`prefectural_tax`、[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02）を含む今後のデータ整備は、新4テーブル側にのみ行う。

## 4. 旧organization系は凍結する

`organization_types`（office_categoryのFK先としてのみ再利用）を除き、`organizations`/
`organization_offices`/`jurisdictions`/`procedure_organizations`は本Phaseで一切変更していない
（Migrationファイル・データとも無変更、`git diff`で確認可能）。既存(site)診断エンジン・`/offices`・
既存admin CRUDは引き続きこれらを参照し、動作に影響はない。

## 5. 物理削除せずstatusで履歴管理する（D6）

`office_sources.status`（`active`/`superseded`/`retracted`）で情報源の世代交代・撤回を区別し、
行の物理削除は行わない。`submission_jurisdictions`も`effective_to`による論理失効のみで、UPDATEでの
上書き削除は行わない設計。

## 6. 従業員住所依存手続きは断定しない（D2）

`procedure_submission_rules.recipient_scope='each_employee'`が適用された手続き（給与支払報告書・
特別徴収税額の納付等）は、会社所在地の窓口を一切解決せず`requires_employee_address`を返す
（`resolve.ts` `matchSubmissionOfficeCandidate`が、ジャリスディクション探索そのものを行わずに
即座に返す設計）。会社所在地の市区町村役場等を代替表示することはしない。

## 7. `unverified`は副次フラグとして扱う（D11・D4）

`ResolutionStatus`の5値（`resolved`/`multiple_candidates`/`insufficient_profile`/
`requires_employee_address`/`not_supported`）は排他的な状態。`VerificationStatus`
（`verified`/`unverified`）はこれとは独立した軸で、`resolved`/`multiple_candidates`にのみ付随する。
`official_url_status='unchecked'`または`verification_due_at`超過のいずれかで`unverified`になる
（`stateModel.ts` `decideVerification`）。

---

## 実装への反映箇所

| 決定事項 | 反映箇所 |
|---|---|
| 1・2 | `src/lib/submissionDirectory/dataAccess.ts`（`resolveCompanyLocation`）・`resolve.ts`（`findAtScope`） |
| 3・4 | `supabase/migration_national_submission_directory.sql`（既存4テーブルへの変更なし、新4テーブルのみ追加） |
| 5 | `supabase/migration_national_submission_directory.sql`（`office_sources.status`列） |
| 6 | `src/lib/submissionDirectory/resolve.ts`（`matchSubmissionOfficeCandidate`の`each_employee`早期return） |
| 7 | `src/lib/submissionDirectory/types.ts`（`ResolutionStatus`/`VerificationStatus`を別軸の型として定義）・`stateModel.ts` |

## 未確定のまま残す事項

D12（全国展開データ調査体制）はPhase2実装の対象外。Phase2完了後の実工数実績を踏まえて別途判断する
（詳細は[NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md)参照）。
