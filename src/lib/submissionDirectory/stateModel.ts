import type { CandidateMatch, OfficeSource, ResolutionStatus, SubmissionOffice, VerificationStatus } from './types';

// ── 状態変換（Phase2: 福岡県パイロット）─────────────────────────────
// resolve.ts が返す CandidateMatch（中間結果）を、呼び出し元へ返す最終的な ResolutionStatus・
// VerificationStatus へ変換する。resolve.ts と責務を分離しているのは、「どの窓口候補が該当するか」
// （データの一致判定）と「それを利用者にどう見せる状態として扱うか」（表示・運用上の分類）が
// 別の関心事だから（docs/NATIONAL_SUBMISSION_DIRECTORY.md ⑥節、D4の決定）。

// D4: 判定不能時の状態設計。5状態はいずれも排他的（同時に複数は成立しない）。
export function decideStatus(match: CandidateMatch): ResolutionStatus {
  switch (match.kind) {
    case 'insufficient_profile':
      return 'insufficient_profile';
    case 'requires_employee_address':
      return 'requires_employee_address';
    case 'not_supported':
      return 'not_supported';
    case 'found':
      return match.alternatives.length > 0 ? 'multiple_candidates' : 'resolved';
  }
}

// D11: unverifiedは排他的な状態ではなく、resolved/multiple_candidatesに付随する副次フラグとして扱う。
// 判定基準:
//   - official_url_status === 'unchecked' → 未検証（内容がそもそも一度も確認されていない）
//   - verification_due_at を過ぎている → 再検証期限超過（過去には確認済みでも鮮度が切れている）
//   - office_sources の「現在の正本」行が status !== 'active'（撤回・世代交代の記録漏れ、防御的）
// のいずれかに該当すれば 'unverified'。該当窓口が無い場合（insufficient_profile/not_supported/
// requires_employee_address）は呼び出し側で null を返す（このファイルでは判定対象外）。
export function decideVerification(
  office: SubmissionOffice,
  currentSource: OfficeSource | undefined,
  today: Date = new Date(),
): VerificationStatus {
  if (office.officialUrlStatus === 'unchecked') return 'unverified';

  if (office.verificationDueAt) {
    const due = new Date(`${office.verificationDueAt}T00:00:00`);
    if (today > due) return 'unverified';
  }

  if (currentSource && currentSource.status !== 'active') return 'unverified';

  return 'verified';
}
