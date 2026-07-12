import type { LinkStatus } from '@/lib/types';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';

// ── Roadmap 提出先情報 — 共通変換関数（Sprint 50）───────────────────
// 設計: docs/ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md（Sprint50設計レビュー承認済み）。
//
// 「提出先のどのURLを・どんな文言で表示するか」という判定ロジックを、JSX（AnnualRoadmapView）から
// 独立したプレーンなデータを返す純粋関数に集約する。DOM/Reactに一切依存しないため、表示コンポーネント
// だけでなく将来のExcel/PDF出力（未実装、docs/ROADMAP.md構想）からもこの関数の戻り値をそのまま
// 再利用できる。新しいDBクエリ・新しい判定材料は追加しない（ScheduleProcedureが既に持つ値のみを読む）。

export type SubmissionLinkKind = 'official' | 'website' | 'fallback' | 'none';
export type SubmissionUrlStatus = 'verified' | 'unchecked' | 'broken' | null;

export type RoadmapSubmissionInfo = {
  officeName: string | null;
  url: string | null;
  linkKind: SubmissionLinkKind;
  urlStatus: SubmissionUrlStatus;
  label: string;
  submissionMethods: string[];
};

const LINK_KIND_LABEL: Record<Exclude<SubmissionLinkKind, 'none'>, string> = {
  official: '公式ページ',
  website: '関連ページ',
  fallback: '関連ページ',
};

// official_links.status（LinkStatus、'ok'|'broken'|'redirected'|'unchecked'）を、
// 呼び出し側が判定しやすい3値に正規化する（'ok'/'redirected'はいずれも「一度は確認できた」ことを
// 意味するため'verified'にまとめる）。
function normalizeStatus(status: LinkStatus | undefined): SubmissionUrlStatus {
  if (status === 'ok' || status === 'redirected') return 'verified';
  if (status === 'unchecked') return 'unchecked';
  if (status === 'broken') return 'broken';
  return null;
}

// URL選択: ① official_url_statusが'broken'でなければofficial_urlを最優先
// ② official_urlが利用不可（無い or broken）ならwebsite_url ③それも無ければfallback_url
// ④いずれも無ければnull。brokenと判定されたofficial_urlはリンクとして採用しない
// （既存のOfficialSiteLink/ProcedureLink、result/page.tsx・ScheduleList.tsxと同じ規約）。
// urlStatusは「今回選ばれたリンクの検証状態」のみを返す。website_url/fallback_urlは
// DB上に個別の検証ステータスを持たないため、選ばれた場合はurlStatus=nullとする
// （official_urlが原因でbrokenだったという情報を、無関係なURLに引き継いで誤解させないため）。
function selectLink(office: NonNullable<ScheduleProcedure['office']>): {
  url: string | null;
  linkKind: SubmissionLinkKind;
  urlStatus: SubmissionUrlStatus;
} {
  const officialStatus = normalizeStatus(office.official_url_status);
  if (office.official_url && officialStatus !== 'broken') {
    return { url: office.official_url, linkKind: 'official', urlStatus: officialStatus };
  }
  if (office.website_url) {
    return { url: office.website_url, linkKind: 'website', urlStatus: null };
  }
  if (office.fallback_url) {
    return { url: office.fallback_url, linkKind: 'fallback', urlStatus: null };
  }
  return { url: null, linkKind: 'none', urlStatus: null };
}

// 提出方法をProcedure Masterの既存フィールドから安全に判定できる範囲だけ抽出する。
// 新しい判定材料は追加しない・推測しない（根拠となる文言が無ければ何も追加しない＝空配列）。
// - e-Tax/eLTAX: e_filing_system_name（構造化フィールド）に文言があれば採用。念のため
//   submission_method（自由記述）側にも同じ文言があれば同様に採用する（e_filing_system_nameが
//   未設定でも submission_method 側だけに明記されているケースを取りこぼさないため）
// - 電子申請（汎用）: e-Tax/eLTAXいずれにも一致しないが、e_filing_system_urlが存在する場合
//   （例: 登記・供託オンライン申請システム）
// - 郵送・窓口: submission_method（自由記述）に該当の語があれば採用
function detectSubmissionMethods(proc: ScheduleProcedure): string[] {
  const methods: string[] = [];
  const filingName = proc.e_filing_system_name ?? '';
  const method = proc.submission_method ?? '';
  const combined = `${filingName} ${method}`;

  if (combined.includes('e-Tax')) methods.push('e-Tax');
  if (combined.includes('eLTAX')) methods.push('eLTAX');
  if (methods.length === 0 && proc.e_filing_system_url) methods.push('電子申請');

  if (method.includes('郵送')) methods.push('郵送');
  if (method.includes('窓口')) methods.push('窓口');

  return methods;
}

export function buildRoadmapSubmissionInfo(proc: ScheduleProcedure): RoadmapSubmissionInfo {
  const office = proc.office;
  const submissionMethods = detectSubmissionMethods(proc);

  if (!office) {
    return { officeName: null, url: null, linkKind: 'none', urlStatus: null, label: '', submissionMethods };
  }

  const { url, linkKind, urlStatus } = selectLink(office);
  return {
    officeName: office.name,
    url,
    linkKind,
    urlStatus,
    label: linkKind === 'none' ? '' : LINK_KIND_LABEL[linkKind],
    submissionMethods,
  };
}
