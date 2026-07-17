import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveSubmissionOfficeForCompany } from '@/lib/submissionDirectory';
import { toPreviewView, type PreviewOfficeView } from '@/lib/submissionDirectoryAdapter';

// ── Submission Directory Preview（Phase5-1、内部確認用）─────────────────────
// 設計: docs/PHASE5_UI_CUTOVER_PLAN.md B-3〜B-4節。
//
// 目的: resolveSubmissionOfficeForCompany()（src/lib/submissionDirectory/、変更禁止）を
// 実DBに対して直接呼び出し、結果を確認するための隔離ルート。既存の /result・
// Workspace Roadmap・共有ページ・PDF/Excel出力のいずれにも接続しない・リンクも追加しない
// （このURLを直接知っている場合のみ到達する）。入力は固定4ケース（本ファイル下部）。
//
// Server Componentのみで完結させる（'use client'は使わない）。過去の実インシデント
// （memory: incident_result_500_rsc_boundary）を踏まえ、変換ロジック（toPreviewView）は
// 'use client'を持たない src/lib/submissionDirectoryAdapter/ に置き、本ファイルはそれを
// 呼び出すだけの配線に徹する。

export const metadata: Metadata = {
  title: '提出先ディレクトリ Preview（内部確認用）',
  robots: { index: false, follow: false },
};

type FixedCase = {
  label: string;
  municipalityCode: string;
  prefectureCode: string;
  procedureId: number;
  procedureLabel: string;
};

// Phase4-2 Sapporo Pilotの検証ケース（前回セッションでResolver直接検証済み）に、
// 福岡市・北九州市の回帰ケースを加えた最低4ケース。
const FIXED_CASES: FixedCase[] = [
  {
    label: '札幌市中央区 × 法人市民税申告',
    municipalityCode: '011011',
    prefectureCode: '01',
    procedureId: 65,
    procedureLabel: 'MUNICIPAL_RESIDENT_TAX_RETURN（法人市民税申告）',
  },
  {
    label: '札幌市清田区 × 償却資産申告',
    municipalityCode: '011100',
    prefectureCode: '01',
    procedureId: 66,
    procedureLabel: 'DEPRECIABLE_ASSET_TAX_RETURN（償却資産申告）',
  },
  {
    label: '福岡市中央区 × 法人市民税申告',
    municipalityCode: '401331',
    prefectureCode: '40',
    procedureId: 65,
    procedureLabel: 'MUNICIPAL_RESIDENT_TAX_RETURN（法人市民税申告）',
  },
  {
    label: '北九州市門司区 × 償却資産申告',
    municipalityCode: '401013',
    prefectureCode: '40',
    procedureId: 66,
    procedureLabel: 'DEPRECIABLE_ASSET_TAX_RETURN（償却資産申告）',
  },
];

type CaseResult = {
  fixedCase: FixedCase;
  view: PreviewOfficeView | null;
  errorMessage: string | null;
};

export default async function SubmissionDirectoryPreviewPage() {
  const supabase = await createServerSupabase();

  const results: CaseResult[] = [];

  if (supabase) {
    for (const fixedCase of FIXED_CASES) {
      try {
        const resolution = await resolveSubmissionOfficeForCompany(supabase, {
          procedureId: fixedCase.procedureId,
          municipalityCode: fixedCase.municipalityCode,
          prefectureCode: fixedCase.prefectureCode,
        });
        results.push({ fixedCase, view: toPreviewView(resolution), errorMessage: null });
      } catch (err) {
        results.push({
          fixedCase,
          view: null,
          errorMessage: err instanceof Error ? err.message : '不明なエラー',
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">提出先ディレクトリ Preview（内部確認用）</h1>
        <p className="mt-1 text-sm text-gray-500">
          resolveSubmissionOfficeForCompany()（src/lib/submissionDirectory/）を固定
          {FIXED_CASES.length}ケースで直接呼び出した結果。Phase5-1の隔離ルートであり、
          既存の /result・Workspace・共有ページ・PDF/Excel出力とは接続していない。
        </p>
      </div>

      {!supabase && (
        <p className="text-sm text-red-600">Supabaseに接続できませんでした（環境変数未設定）。</p>
      )}

      <div className="space-y-4">
        {results.map(({ fixedCase, view, errorMessage }) => (
          <div key={fixedCase.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">{fixedCase.label}</h2>

            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline font-medium text-gray-700">所在地: </dt>
                <dd className="inline text-gray-600">
                  municipalityCode={fixedCase.municipalityCode} / prefectureCode={fixedCase.prefectureCode}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-gray-700">procedure: </dt>
                <dd className="inline text-gray-600">{fixedCase.procedureLabel}</dd>
              </div>

              {errorMessage && (
                <div className="sm:col-span-2">
                  <dt className="inline font-medium text-red-700">エラー: </dt>
                  <dd className="inline text-red-600">{errorMessage}</dd>
                </div>
              )}

              {view && (
                <>
                  <div>
                    <dt className="inline font-medium text-gray-700">status: </dt>
                    <dd className="inline text-gray-600">{view.status}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-700">提出先: </dt>
                    <dd className="inline text-gray-600">{view.officeName ?? '（該当窓口なし）'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-700">verificationStatus: </dt>
                    <dd className="inline text-gray-600">{view.verificationStatus ?? '（該当なし）'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-700">matchedRuleId: </dt>
                    <dd className="inline text-gray-600">{view.matchedRuleId ?? '（なし）'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-gray-700">reason: </dt>
                    <dd className="inline text-gray-600">{view.reason}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
