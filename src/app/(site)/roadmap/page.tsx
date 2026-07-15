'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { loadCompanyProfile, type CompanyProfile } from '@/lib/companyProfile';
import { loadTaxReturnProfile } from '@/lib/taxReturnProfile';
import { getBrowserId, fetchCompanyEvents } from '@/lib/events';
import { buildTimelineFromSources } from '@/lib/timelineProducer';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap, type RoadmapYear } from '@/lib/roadmap';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import { CalendarRange, UserCheck, Info } from 'lucide-react';

// ── 年間ロードマップ画面 — MVP（Sprint 21 Phase21.3）───────────────
// buildAnnualRoadmap（src/lib/roadmap.ts）の結果を一覧表示するのみ。AI参謀・通知エンジンとは
// 接続しない（docs/ANNUAL_ROADMAP_ENGINE.md 9-2節、次スプリント以降のスコープ）。
// CompanyProfile・Timelineがブラウザのみに存在するため、このページはサーバーコンポーネントにできず
// 'use client' で構成する（既存の /events と同じ構成）。
// 表示部分（年→月のグループ化・カード表示）は AnnualRoadmapView に共通化し、
// admin/(protected)/workspaces/[id]/roadmap と共有する（Sprint23.3）。

function ProfileGuidanceCard() {
  return (
    <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
      <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">ロードマップの表示には会社情報の登録が必要です</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          所在地・法人形態・決算月などを登録すると、複数年分の手続きスケジュールを計算できます。
        </p>
      </div>
      <Link href="/profile" className="btn-secondary shrink-0 px-3 py-1.5 text-xs whitespace-nowrap">
        入力する
      </Link>
    </div>
  );
}

export default function RoadmapPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [roadmapYears, setRoadmapYears] = useState<RoadmapYear[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile(loadCompanyProfile());
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    if (!profileLoaded || !profile) return;
    if (!supabase) {
      setErrorMessage('データベースに接続できませんでした。');
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const taxReturnProfile = loadTaxReturnProfile();
        const browserId = getBrowserId();
        const companyEvents = await fetchCompanyEvents(supabase!, browserId);
        const timelineEvents = buildTimelineFromSources({
          companyProfile: profile,
          taxReturnProfile,
          companyEvents,
        });
        const state = buildStateFromTimeline(timelineEvents);
        const years = await buildAnnualRoadmap(supabase!, profile!, state, 3);
        if (!cancelled) setRoadmapYears(years);
      } catch {
        if (!cancelled) setErrorMessage('ロードマップの計算中にエラーが発生しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile, profileLoaded]);

  const totalItemCount = useMemo(
    () => roadmapYears?.reduce((sum, y) => sum + y.items.length, 0) ?? 0,
    [roadmapYears],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2.5">
        <CalendarRange className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">年間ロードマップ</h1>
        <span className="tag border-blue-200 text-blue-600">β版</span>
      </div>

      <div className="card mb-6 flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-ink-muted" />
        <p className="text-xs leading-relaxed text-gray-500">
          今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
          必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
          プロフィールや決算情報の入力状況によって内容が変わる可能性があります。
        </p>
      </div>

      {!profileLoaded && <p className="text-sm text-sunboo-ink-muted">読み込み中です…</p>}

      {profileLoaded && !profile && <ProfileGuidanceCard />}

      {profileLoaded && profile && errorMessage && (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">{errorMessage}</div>
      )}

      {profileLoaded && profile && !errorMessage && loading && (
        <p className="text-sm text-sunboo-ink-muted">計算中です…</p>
      )}

      {profileLoaded && profile && !errorMessage && !loading && roadmapYears !== null && totalItemCount === 0 && (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">
          表示できる手続きがありません。プロフィールの決算月などの登録状況をご確認ください。
        </div>
      )}

      {roadmapYears !== null && totalItemCount > 0 && <AnnualRoadmapView roadmapYears={roadmapYears} />}
    </div>
  );
}
