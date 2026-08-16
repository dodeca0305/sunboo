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
