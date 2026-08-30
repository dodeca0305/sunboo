import type { Metadata } from 'next';
import AnalyticsPreferenceButton from '@/components/AnalyticsPreferenceButton';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: 'SUNBOO経営ナビにおける情報の取扱いとアクセス解析について説明します。',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">プライバシーポリシー</h1>
      <p className="mt-2 text-sm text-gray-500">制定日：2026年8月30日</p>

      <div className="mt-10 space-y-8 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">1. 運営者</h2>
          <p className="mt-2">SUNBOO経営ナビは、長谷川 晟弥が運営します。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">2. 取得する情報と利用目的</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>匿名診断で入力した所在地、法人種別、従業員の有無、決算月等は、診断結果の表示に使用し、利用者のブラウザ内に保存します。</li>
            <li>ご意見フォームで入力した氏名、メールアドレス、本文は、問い合わせへの対応に使用します。</li>
            <li>管理画面で登録した会社情報、申告情報、手続き状況等は、契約利用者への機能提供に使用します。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">3. Google Analytics</h2>
          <p className="mt-2">
            利用者が許可した場合に限り、サービス改善のためGoogle Analyticsを使用します。Google Analyticsは、閲覧ページ、利用日時、端末・ブラウザ情報、参照元、概略的な地域等をCookieその他の識別子を用いて収集する場合があります。氏名やフォーム本文はGoogle Analyticsへ送信しません。
          </p>
          <p className="mt-2">
            取得情報のGoogleによる取扱いは、
            <a href="https://policies.google.com/privacy?hl=ja" target="_blank" rel="noreferrer" className="text-blue-600 underline">Googleプライバシーポリシー</a>
            に従います。本サイトでは広告向けのGoogleシグナルと広告パーソナライズを無効にしています。
          </p>
          <AnalyticsPreferenceButton />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">4. 外部サービス</h2>
          <p className="mt-2">本サービスは、ホスティングにVercel、データベースと認証にSupabase、メール送信にResendを利用します。必要な範囲で各サービスへ情報が送信される場合があります。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">5. 安全管理と第三者提供</h2>
          <p className="mt-2">取得した情報について、アクセス制御その他の合理的な安全管理措置を講じます。法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者へ販売しません。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">6. お問い合わせ</h2>
          <p className="mt-2">本ポリシーや情報の取扱いに関するお問い合わせは、sunboo.hasegawa@gmail.comまでご連絡ください。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">7. 改定</h2>
          <p className="mt-2">サービス内容や法令の変更等に応じて本ポリシーを改定することがあります。重要な変更は本サイト上でお知らせします。</p>
        </section>
      </div>
    </div>
  );
}
