import Link from 'next/link';
import { FileText, Building2, Clock, ExternalLink, ArrowRight, Zap, Shield } from 'lucide-react';

const FEATURES = [
  {
    Icon: FileText,
    title: '提出書類を網羅',
    desc: '税務・労務・社会保険など、あなたの会社に必要な手続きをすべて洗い出します。',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  {
    Icon: Clock,
    title: '期限を自動計算',
    desc: '決算月をもとに、次回の申告期限・届出期限をリアルタイムに算出します。',
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
  },
  {
    Icon: Building2,
    title: '管轄機関を特定',
    desc: '税務署・年金事務所・ハローワークなど、どこへ何を出すかを明確にします。',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  {
    Icon: ExternalLink,
    title: '公式リンク付き',
    desc: '国税庁・厚生労働省など各手続きの公式サイトへ直接アクセスできます。',
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
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
      <section className="relative overflow-hidden bg-white pt-16 pb-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-blue-50 opacity-70" />
          <div className="absolute -bottom-24 -left-24 h-[320px] w-[320px] rounded-full bg-blue-50 opacity-50" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700">
            <Zap className="h-3.5 w-3.5" />
            法人向け 無料手続きナビ
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-5xl">
            出す書類、<span className="text-blue-600">全部わかる</span>
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-gray-500">
            会社情報を3つ入力するだけで
            <br className="hidden sm:inline" />
            提出書類・期限・管轄機関が一覧に
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/start" className="btn-primary py-3.5 px-8 text-base">
              無料で調べる
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/procedures"
              className="btn-secondary py-3.5 px-6 text-sm"
            >
              手続き一覧を見る
            </Link>
          </div>

          <p className="mt-5 text-xs text-gray-400">登録不要・無料・30秒</p>
        </div>
      </section>

      {/* ── Steps ─────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-4xl px-4">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-blue-600">
            How it works
          </p>
          <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">
            たった3ステップで完了
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="card text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
                  {step.num}
                </span>
                <h3 className="font-bold text-gray-900">{step.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────── */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-4">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-blue-600">
            Features
          </p>
          <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">
            こんな情報がすべて分かります
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ Icon, title, desc, iconColor, iconBg }) => (
              <div key={title} className="card flex items-start gap-4">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
                >
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-lg px-4">
          <div
            className="rounded-2xl p-10 text-center shadow-lg shadow-blue-600/15"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}
          >
            <Shield className="mx-auto mb-4 h-10 w-10 text-blue-200" />
            <h2 className="text-xl font-bold text-white">今すぐ確認しましょう</h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-200">
              申告漏れ・届出忘れを防ぐために、
              <br />
              まず自社の手続きを把握することが重要です。
            </p>
            <Link
              href="/start"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
            >
              会社情報を入力して診断する
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 注意書き ───────────────────────────────────── */}
      <section className="bg-white pb-16 pt-8">
        <div className="mx-auto max-w-2xl px-4">
          <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-xs text-amber-700">
            ⚠️ 本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
          </p>
        </div>
      </section>
    </>
  );
}
