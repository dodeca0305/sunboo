import Link from 'next/link';
import { FileText, Building2, Clock, ExternalLink, ArrowRight, Search, AlertTriangle, Eye } from 'lucide-react';
import TrackedLink from '@/components/TrackedLink';

// ユーザーテスト用デモ導線（Sprint 10）。福岡市中央区・合同会社・従業員あり・3月決算の
// 入力例で /result に直接遷移し、フォーム入力なしで結果画面をすぐに見てもらえるようにする。
const DEMO_RESULT_URL = '/result?pref=40&muni=401331&emp=true&fm=3&corp=godo';

const FEATURES = [
  {
    Icon: FileText,
    title: '提出書類を網羅',
    desc: '税務・労務・社会保険など、あなたの会社に必要な手続きをすべて洗い出します。',
  },
  {
    Icon: Clock,
    title: '期限を自動計算',
    desc: '決算月をもとに、次回の申告期限・届出期限をリアルタイムに算出します。',
  },
  {
    Icon: Building2,
    title: '管轄機関を特定',
    desc: '税務署・年金事務所・ハローワークなど、どこへ何を出すかを明確にします。',
  },
  {
    Icon: ExternalLink,
    title: '公式リンク付き',
    desc: '国税庁・厚生労働省など各手続きの公式サイトへ直接アクセスできます。',
  },
];

const STEPS = [
  { num: '1', label: '会社情報を入力', desc: '所在地・従業員の有無・決算月の3項目だけ' },
  { num: '2', label: '診断を実行',     desc: '条件に合った手続きと管轄機関を自動で抽出' },
  { num: '3', label: '期限と提出先を確認', desc: '一覧でまとめて把握・公式リンクへ直行' },
];

export default function TopPage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────── */}
      <section className="bg-white pt-20 pb-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-5xl">
            経営者の参謀。
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-500 md:text-lg">
            会社ごとに必要な手続き・提出期限・提出先を整理し、
            <br className="hidden sm:inline" />
            経営者が本業に集中できる環境をつくります。
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedLink href="/start" eventName="start_clicked" className="btn-primary btn-primary-lg text-sm">
              はじめる
              <ArrowRight className="h-4 w-4" />
            </TrackedLink>
            <TrackedLink
              href={DEMO_RESULT_URL}
              eventName="demo_view_clicked"
              className="btn-secondary gap-2 px-6 py-2.5 text-sm"
            >
              <Eye className="h-4 w-4" />
              デモとして試す
            </TrackedLink>
            <Link href="/search" className="btn-secondary gap-2 px-6 py-2.5 text-sm">
              <Search className="h-4 w-4" />
              手続きを検索
            </Link>
          </div>

          <p className="mx-auto mt-5 flex max-w-md items-center justify-center gap-1.5 text-center text-xs text-sunboo-ink-muted">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            現在は福岡県・東京都渋谷区対応のβ版です。実際の提出前には必ず公式情報をご確認ください。
          </p>
        </div>
      </section>

      {/* ── Steps ─────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-white py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-xl font-bold text-gray-900">
            たった3ステップで完了
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="card text-center">
                <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                  {step.num}
                </span>
                <h3 className="font-semibold text-gray-900">{step.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────── */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-xl font-bold text-gray-900">
            こんな情報がすべて分かります
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="card flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                  <Icon className="h-5 w-5 text-gray-600" />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-white py-20">
        <div className="mx-auto max-w-lg px-4">
          <div className="card text-center">
            <h2 className="text-lg font-bold text-gray-900">今すぐ確認しましょう</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              申告漏れ・届出忘れを防ぐために、
              <br />
              まず自社の手続きを把握することが重要です。
            </p>
            <Link href="/start" className="btn-primary btn-primary-lg mt-6 text-sm">
              会社情報を入力して診断する
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 注意書き ───────────────────────────────────── */}
      <section className="bg-white pb-16">
        <div className="mx-auto max-w-2xl px-4">
          <p className="flex items-center justify-center gap-2 text-center text-xs text-sunboo-ink-muted">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
          </p>
        </div>
      </section>
    </>
  );
}
