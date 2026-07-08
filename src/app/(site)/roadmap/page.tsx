'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { loadCompanyProfile, type CompanyProfile } from '@/lib/companyProfile';
import { loadTaxReturnProfile } from '@/lib/taxReturnProfile';
import { getBrowserId, fetchCompanyEvents } from '@/lib/events';
import { buildTimelineFromSources } from '@/lib/timelineProducer';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap, type RoadmapItem, type RoadmapYear } from '@/lib/roadmap';
import type { ProcedureCategory } from '@/lib/types';
import { CalendarRange, UserCheck, Info } from 'lucide-react';

// ── 年間ロードマップ画面 — MVP（Sprint 21 Phase21.3）───────────────
// buildAnnualRoadmap（src/lib/roadmap.ts）の結果を一覧表示するのみ。AI参謀・通知エンジンとは
// 接続しない（docs/ANNUAL_ROADMAP_ENGINE.md 9-2節、次スプリント以降のスコープ）。
// CompanyProfile・Timelineがブラウザのみに存在するため、このページはサーバーコンポーネントにできず
// 'use client' で構成する（既存の /events と同じ構成）。

const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  local_tax: '地方税',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const MONTH_LABEL = (m: number) => `${m}月`;

function groupByMonth(items: RoadmapItem[]): { month: number; items: RoadmapItem[] }[] {
  const byMonth = new Map<number, RoadmapItem[]>();
  for (const item of items) {
    const month = Number(item.dueDate.slice(5, 7));
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(item);
    else byMonth.set(month, [item]);
  }
  return Array.from(byMonth.entries()).sort(([a], [b]) => a - b).map(([month, monthItems]) => ({ month, items: monthItems }));
}

function formatDueDate(dueDate: string): string {
  const [, m, d] = dueDate.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

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
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
          必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
          プロフィールや決算情報の入力状況によって内容が変わる可能性があります。
        </p>
      </div>

      {!profileLoaded && <p className="text-sm text-gray-400">読み込み中です…</p>}

      {profileLoaded && !profile && <ProfileGuidanceCard />}

      {profileLoaded && profile && errorMessage && (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">{errorMessage}</div>
      )}

      {profileLoaded && profile && !errorMessage && loading && (
        <p className="text-sm text-gray-400">計算中です…</p>
      )}

      {profileLoaded && profile && !errorMessage && !loading && roadmapYears !== null && totalItemCount === 0 && (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">
          表示できる手続きがありません。プロフィールの決算月などの登録状況をご確認ください。
        </div>
      )}

      {roadmapYears !== null && totalItemCount > 0 && (
        <div className="space-y-10">
          {roadmapYears.map((yearBlock) => (
            <section key={yearBlock.year}>
              <h2 className="mb-4 text-lg font-bold text-gray-900">{yearBlock.year}年</h2>
              <div className="space-y-5">
                {groupByMonth(yearBlock.items).map(({ month, items }) => (
                  <div key={month}>
                    <h3 className="mb-2 text-sm font-semibold text-gray-500">{MONTH_LABEL(month)}</h3>
                    <ul className="space-y-2">
                      {items.map((item, idx) => (
                        <li
                          key={`${item.procedure.id}-${item.dueDate}-${idx}`}
                          className="card flex flex-wrap items-center gap-2 py-3"
                        >
                          <span className="text-sm font-medium text-gray-900">{item.procedure.name}</span>
                          <span className="tag">{CATEGORY_LABEL[item.procedure.category] ?? 'その他'}</span>
                          <span className="text-xs text-gray-400">{formatDueDate(item.dueDate)}</span>
                          {item.confidence === 'estimated' && (
                            <span className="tag border-amber-200 text-amber-700">推定</span>
                          )}
                          {item.confidence === 'incomplete' && (
                            <span className="tag border-amber-200 text-amber-700">情報不足</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
