// ローカル試験環境専用のプレビュー。本番ルートではない。Codexが trial-environment の
// app/src/app/trial/corporate-filing-choice/page.tsx にコピーして、実ブラウザーのキーボード操作を確認する。
// 静的な合成データのみ。データ取得・認証・API・保存は行わない。
import CorporateTaxNextAction from '@/components/CorporateTaxNextAction';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';

const procedure: ScheduleProcedure = {
  id: 1,
  code: 'CORP_TAX_RETURN',
  name: '合成法人税申告',
  description: '',
  category: 'tax',
  timing_label: '',
  timing_type: 'fixed',
  next_deadline: null,
  next_deadline_date: null,
  office: {
    name: '渋谷税務署（合成表示）',
    official_url: 'https://www.nta.go.jp/about/organization/tokyo/location/tokyo/shibuya/index.htm',
    official_url_status: 'ok',
    website_url: null,
    fallback_url: null,
  },
  official_links: [],
  e_filing_system_name: 'e-Tax',
  e_filing_system_url: 'https://www.e-tax.nta.go.jp/',
};

export default function CorporateFilingChoicePreview() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <p className="text-sm font-semibold text-sunboo-ink">合成データ／本番ではありません</p>
      <h1 className="text-base font-semibold text-sunboo-ink">{procedure.name}</h1>
      <CorporateTaxNextAction procedure={procedure} />
    </main>
  );
}
