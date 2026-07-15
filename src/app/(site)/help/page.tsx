import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Sparkles, Bell, Star, HelpCircle, Mail } from 'lucide-react';
import { FEEDBACK_MAILTO_HREF } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'ヘルプ',
  description: 'SUNBOO経営ナビの画面の見方・よくある質問。AI参謀・通知・優先度の意味を解説します。',
  alternates: { canonical: '/help' },
};

const SCREEN_GUIDE = [
  {
    Icon: Sparkles,
    title: 'AI参謀',
    desc: '期限・イベントの有無・提出先の重複などから、今なにを最優先すべきかを判断して一言で伝えます。「次に来る予定」「注意すべきリスク」「優先度」もあわせて表示します。',
  },
  {
    Icon: Bell,
    title: '通知',
    desc: '期限超過・当日・3日前・7日前になった手続きをそのままお知らせします。AI参謀のような判断はせず、期限の事実だけを伝えます。',
  },
  {
    Icon: Star,
    title: '優先度',
    desc: '未着手・進行中の手続きの中から、優先度が高いものを星評価つきで並べた一覧です。AI参謀が最優先と判断した1件の詳細情報として見てください。',
  },
];

const FAQ = [
  {
    q: '対応していない地域を選ぶとどうなりますか？',
    a: '「現在未対応です」と表示されます。不具合ではなく、β版として対応エリアを福岡県・東京都渋谷区に限定しているための仕様です。',
  },
  {
    q: '表示された手続き・期限は確定情報ですか？',
    a: 'いいえ、一般的な参考情報です。法改正や個別の事情により内容が変わる場合があるため、実際の提出前には必ず各公式機関の最新情報をご確認ください。',
  },
  {
    q: '入力した会社情報はどこに保存されますか？',
    a: 'アカウント機能はなく、手続きの完了状況などはお使いのブラウザ内（localStorage）にのみ保存されます。他の端末・ブラウザとは共有されません。',
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-10 text-center">
        <span className="tag mx-auto mb-3 inline-flex border-blue-200 text-blue-600">β版</span>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">ヘルプ</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          SUNBOO経営ナビの使い方と、画面の見方をまとめています。
        </p>
      </div>

      <section className="card">
        <h2 className="font-semibold text-gray-900">SUNBOOとは</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          会社の所在地・従業員の有無・決算月などを入力するだけで、対応が必要な届出・申告・手続きと、
          それぞれの期限・提出先を自動で整理して表示するサービスです。会計ソフトや士業の代替ではなく、
          「行政手続きの情報を見る・自動生成する」ことに特化しています。
        </p>
      </section>

      <section className="card mt-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-sunboo-ink-muted" />
          <h2 className="font-semibold text-gray-900">画面の見方</h2>
        </div>
        <div className="mt-4 space-y-4">
          {SCREEN_GUIDE.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <Icon className="h-4 w-4 text-gray-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="font-semibold text-gray-900">よくある質問</h2>
        <div className="mt-4 space-y-4">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-semibold text-gray-900">Q. {q}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">A. {a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-4 text-center">
        <h2 className="font-semibold text-gray-900">ご意見・不具合のご連絡</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          β版のため、使いにくい点・分かりにくい点などお気づきの点があればぜひお知らせください。
        </p>
        <a href={FEEDBACK_MAILTO_HREF} className="btn-primary mt-4 inline-flex text-sm">
          <Mail className="h-4 w-4" />
          ご意見を送る
        </a>
      </section>

      <p className="mt-8 flex items-start justify-center gap-2 text-center text-xs text-sunboo-ink-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
      </p>

      <p className="mt-6 text-center text-sm">
        <Link href="/start" className="font-medium text-blue-600 hover:text-blue-700">
          診断をはじめる →
        </Link>
      </p>
    </div>
  );
}
