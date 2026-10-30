'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSession } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { executeManualTaxControl } from '@/lib/taxIntelligence/manualExecution';

export type EvaluationActionState = { status: 'idle' | 'success' | 'error'; message: string };

export async function runTaxControlAction(
  _previous: EvaluationActionState,
  form: FormData,
): Promise<EvaluationActionState> {
  const session = await getAdminSession();
  if (!session) return { status: 'error', message: '管理者として再ログインしてください。' };
  const companyId = Number(form.get('companyId'));
  const taxControlId = Number(form.get('taxControlId'));
  const context = form.get('liquidationResidualAssetsCase');
  if (!Number.isSafeInteger(companyId) || companyId <= 0 ||
      !Number.isSafeInteger(taxControlId) || taxControlId <= 0 ||
      !['unknown', 'applicable', 'not_applicable'].includes(String(context))) {
    return { status: 'error', message: '会社・チェック・清算特則の選択を確認してください。' };
  }
  const supabase = await createServerSupabase();
  if (!supabase) return { status: 'error', message: 'データベースに接続できません。' };
  try {
    // 評価基準日はサーバーの日本時間。承認・有効状態と根拠は既存executorで再検証する。
    const asOfDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    const result = await executeManualTaxControl(supabase, session.email, {
      companyId, taxControlId, asOfDate,
      corporateTaxFilingContext: {
        liquidationResidualAssetsCase: context as 'unknown' | 'applicable' | 'not_applicable',
      },
    });
    revalidatePath(`/admin/workspaces/${companyId}`);
    revalidatePath(`/admin/workspaces/${companyId}/tax-review`);
    return { status: 'success', message: `評価結果を保存しました。${result.evaluation.reasonSummary}` };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : '評価に失敗しました。' };
  }
}
