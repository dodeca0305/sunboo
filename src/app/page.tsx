import Link from 'next/link';

const FEATURES = [
  {
    icon: '📋',
    title: '提出書類を網羅',
    desc: '税務・労務・社会保険など、あなたの会社に必要な手続きをすべて洗い出します。',
  },
  {
    icon: '⏰',
    title: '期限を自動計算',
    desc: '決算月をもとに、次回の申告期限・届出期限をリアルタイムに算出します。',
  },
  {
    icon: '🏛',
    title: '管轄機関を特定',
    desc: '税務署・年金事務所・ハローワークなど、どこへ何を出すかを明確にします。',
  },
  {
    icon: '🔗',
    title: '公式リンク付き',
    desc: '国税庁・厚生労働省など各手続きの公式サイトへ直接アクセスできます。',
  },
];

const STEPS = [
  {
    num: '1',
    label: '会社情報を入力',
    desc: '所在地・従業員の有無・決算月の3項目だけ',
  },
  {
    num: '2',
    label: '診断を実行',
    desc: '条件に合った手続きと管轄機関を自動で抽出',
  },
  {
    num: '3',
    label: '期限と提出先を確認',
    desc: '一覧でまとめて把握・公式リンクへ直行',
  },
];

export default function TopPage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand-navy to-brand-navy-dark py-20 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="mb-5 inline-block rounded-full bg-white/10 px-4 py-1 text-xs font-semibold tracking-widest text-white/80 uppercase">
            法人向け 無料手続きナビ
          </div>

          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            出す書類、全部わかる
          </h1>

          <p className="mt-5 text-lg text-blue-100">
            会社情報を3つ入力するだけで
            <br className="hidden sm:inline" />
            提出書類・期限・管轄機関が一覧に
          </p>

          <div className="mt-8">
            <Link
              href="/start"
              className="inline-block rounded-lg bg-brand-gold px-10 py-4 text-base font-bold text-brand-navy shadow-lg transition hover:bg-brand-gold-light"
            >
              無料で調べる →
            </Link>
          </div>

          <p className="mt-4 text-xs text-blue-200">登録不要・無料・30秒</p>
        </div>
      </section>

      {/* ── Steps ───────────────────────────────── */}
      <section className="border-y border-amber-100 bg-amber-50 py-12">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-xl font-bold text-gray-800">
            たった3ステップで完了
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-lg font-bold text-white">
                  {step.num}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{step.label}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────── */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">
            こんな情報がすべて分かります
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="card flex items-start gap-4">
                <span className="text-3xl">{f.icon}</span>
                <div>
                  <h3 className="font-bold text-gray-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────── */}
      <section className="pb-12">
        <div className="mx-auto max-w-xl px-4 text-center">
          <div className="rounded-xl bg-brand-navy p-8 text-white shadow-lg">
            <h2 className="text-xl font-bold">今すぐ確認しましょう</h2>
            <p className="mt-2 text-sm text-blue-200">
              申告漏れ・届出忘れを防ぐために、
              <br />
              まず自社の手続きを把握することが重要です。
            </p>
            <Link
              href="/start"
              className="mt-6 inline-block rounded-lg bg-brand-gold px-8 py-3 text-sm font-bold text-brand-navy transition hover:bg-brand-gold-light"
            >
              会社情報を入力して診断する →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 注意書き ─────────────────────────────── */}
      <section className="pb-20">
        <div className="mx-auto max-w-2xl px-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs text-amber-700">
            ⚠️ 本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
          </p>
        </div>
      </section>
    </>
  );
}
