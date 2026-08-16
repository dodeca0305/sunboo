'use server';

import { getAdminSession } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  ingestCurrentEgovCorporateTaxSource,
} from '@/lib/taxIntelligence/egovConnector';

export type TaxSourceIngestionActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  revisionId?: string;
  contentHash?: string;
  taxSourceVersionId?: number;
  supersedesVersionId?: number | null;
  wasInserted?: boolean;
};

export async function ingestCurrentEgovAction(
  _previousState: TaxSourceIngestionActionState,
  _formData: FormData,
): Promise<TaxSourceIngestionActionState> {
  void _previousState;
  void _formData;

  const session = await getAdminSession();

  if (!session) {
    return {
      status: 'error',
      message:
        '管理者セッションを確認できません。再ログインしてください。',
    };
  }

  const supabase = await createServerSupabase();

  if (!supabase) {
    return {
      status: 'error',
      message:
        'Supabaseの環境変数が設定されていません。',
    };
  }

  try {
    const result =
      await ingestCurrentEgovCorporateTaxSource(
        supabase,
      );

    return {
      status: 'success',
      message: result.ingestion.wasInserted
        ? 'e-Govの新版を登録しました。'
        : 'e-Govの内容に変更はありません。',
      revisionId: result.source.revisionId,
      contentHash: result.source.contentHash,
      taxSourceVersionId:
        result.ingestion.taxSourceVersionId,
      supersedesVersionId:
        result.ingestion.supersedesVersionId,
      wasInserted: result.ingestion.wasInserted,
    };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'e-Gov TaxSourceの取り込みに失敗しました。',
    };
  }
}
