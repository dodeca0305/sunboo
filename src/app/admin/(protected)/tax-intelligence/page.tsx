import { loadControlReadiness, type ControlReadiness } from '@/lib/taxIntelligence/controlReadiness';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  loadTaxSourceChangeReviewItems,
  type TaxSourceChangeReviewItem,
} from '@/lib/taxIntelligence/sourceChangeReviews';

import IngestionPanel from './IngestionPanel';
import SourceReviewList from './SourceReviewList';

export default async function TaxIntelligencePage() {
  const supabase = await createServerSupabase();

  let items: TaxSourceChangeReviewItem[] = [];
  let loadError: string | null = null;

  if (!supabase) {
    loadError =
      'Supabaseの環境変数が設定されていません。';
  } else {
    try {
      items =
        await loadTaxSourceChangeReviewItems(
          supabase,
        );
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : 'TaxSource変更レビューの取得に失敗しました。';
    }
  }

  let controls: ControlReadiness[] = [];
  let controlError = false;
  if (supabase) {
    try { controls = await loadControlReadiness(supabase); }
    catch { controlError = true; }
  } else { controlError = true; }

  const statusLabel = (status: string) => ({ draft: '下書き', approved: '承認済み', retired: '廃止' }[status] ?? status);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Tax Intelligence
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          公式税務ソースの現在版を確認・取り込みします
        </p>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">税務チェックの承認・有効化状況</h2>
        <p className="text-sm text-gray-600">チェックと根拠ルールの登録状況です。承認状態だけで実行の成功や税務上の正しさを保証するものではありません。</p>
        {controlError ? <p role="alert">承認状況を取得できませんでした。再読み込みしてください。</p> : controls.length === 0 ? (
          <p className="text-sm">税務ルールに基づくチェックは登録されていません。</p>
        ) : <ul className="space-y-3">{controls.map(control => (
          <li key={control.id} className="rounded border p-3 text-sm break-words">
            <h3 className="font-semibold">{control.control_code}：{control.title}</h3>
            <p>チェック：{statusLabel(control.status)} ／ {control.is_enabled ? '有効' : '無効'}</p>
            <p>根拠ルール：{control.rules.length ? control.rules.map(rule => `${rule.rule_code}（${statusLabel(rule.status)}）`).join('、') : 'なし'}</p>
            <p className="mt-2">{control.blockers.length ? `確認が必要：${control.blockers.join('・')}` : '承認・有効化・根拠紐付けの基本条件を満たしています。'}</p>
            {control.rules.map(rule => (
              <details key={rule.id} className="mt-3 border-t pt-3">
                <summary className="cursor-pointer font-medium">根拠ルール本文を確認（第{rule.version_no}版）</summary>
                <dl className="mt-3 space-y-2">
                  <dt className="font-medium">保存されているルール本文</dt>
                  <dd className="whitespace-pre-wrap">{rule.rule_statement || '未登録'}</dd>
                  <dt className="font-medium">適用範囲・留意事項</dt>
                  <dd className="whitespace-pre-wrap">{rule.applicability_note || '未登録'}</dd>
                  <dt className="font-medium">適用期間</dt>
                  <dd>{rule.effective_from || '開始日未設定'} ～ {rule.effective_to || '終了日未設定'}</dd>
                </dl>
              </details>
            ))}
          </li>
        ))}</ul>}
      </section>

      <IngestionPanel />

      {loadError ? (
        <div className="card border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {loadError}
        </div>
      ) : (
        <SourceReviewList items={items} />
      )}
    </div>
  );
}
