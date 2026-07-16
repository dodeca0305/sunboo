import type { JurisdictionScopeTier, RequiredAction, ResolutionStatus, VerificationStatus } from './types';

// ── 公開表示用の説明生成（Phase2: 福岡県パイロット）─────────────────
// 判定結果（status・スコープ階層・窓口名等）から、人間向けの説明文（reason）・
// 定性的な検証ラベル（publicVerificationLabel）・機械可読な次アクション（requiredAction）を
// 組み立てる。DOM/JSXに一切依存しないプレーンな文字列を返す純粋関数
//（既存 buildRoadmapSubmissionInfo と同じ設計思想）。
//
// D7: 判定理由（reason）は一般公開する。最終確認日の生の日付は公開せず、
// publicVerificationLabel は定性ラベル（「（未確認）」等）のみを返す。

export type ExplainInput = {
  status: ResolutionStatus;
  scopeTier: JurisdictionScopeTier | null;
  locationLabel: string | null; // 例:「福岡市中央区」。市区町村スコープで確定した場合に使う
  prefectureLabel: string | null; // 例:「福岡県」。都道府県スコープで確定した場合に使う
  officeName: string | null;
  ruleApplied: boolean; // procedure_submission_rulesの上書きルールが適用されたか
  hasAlternatives: boolean;
  verificationStatus: VerificationStatus | null;
};

export function buildReason(input: ExplainInput): string {
  const ruleNote = input.ruleApplied ? '（手続き別の判定ルールを適用）' : '';

  switch (input.status) {
    case 'resolved':
    case 'multiple_candidates': {
      let base: string;
      if (input.scopeTier === 'municipality') {
        base = `${input.locationLabel ?? '会社所在地'}の管轄として${input.officeName}が確定しました${ruleNote}`;
      } else if (input.scopeTier === 'prefecture') {
        base = `${input.prefectureLabel ?? '都道府県'}単位の管轄として${input.officeName}が確定しました${ruleNote}`;
      } else {
        base = `全国共通の窓口として${input.officeName}が確定しました${ruleNote}`;
      }
      if (input.status === 'multiple_candidates') {
        base += '。ただし、住所によっては別の窓口が対象になる場合があります。詳しくは公式サイトでご確認ください。';
      }
      return base;
    }
    case 'insufficient_profile':
      return '会社所在地（市区町村）が未入力のため、提出先を判定できません。会社情報の入力を完了してください。';
    case 'requires_employee_address':
      return 'この手続きは会社所在地ではなく、従業員ごとの1月1日時点の住所地市区町村が提出先になります。';
    case 'not_supported':
      return `${input.locationLabel ?? input.prefectureLabel ?? 'お住まいの地域'}はまだ対応エリア外のため、提出先情報がありません。`;
  }
}

// D7: 生の確認日付は公開しない。定性ラベルのみ返す（既存 official_url_status の「（未確認）」表示を踏襲）。
export function buildPublicVerificationLabel(verificationStatus: VerificationStatus | null): string | null {
  if (verificationStatus === 'unverified') return '（未確認）';
  return null;
}

export function buildRequiredAction(status: ResolutionStatus, verificationStatus: VerificationStatus | null): RequiredAction {
  switch (status) {
    case 'insufficient_profile':
      return 'complete_company_profile';
    case 'requires_employee_address':
      return 'check_each_employee_address';
    case 'multiple_candidates':
      return 'review_alternative_offices';
    case 'not_supported':
      return 'contact_support_or_wait_for_coverage';
    case 'resolved':
      return verificationStatus === 'unverified' ? 'confirm_with_official_source' : null;
  }
}
