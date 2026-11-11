import { ChevronDown } from 'lucide-react';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';

export default function FiscalEmployeeCountField({ value, onChange }: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-2" data-testid="fiscal-employee-count-field">
      <label htmlFor="fiscal-employee-count" className="form-label">決算日の従業員数（任意）</label>
      <FormattedIntegerInput
        id="fiscal-employee-count"
        value={value}
        onChange={onChange}
        placeholder="例: 5"
        ariaLabel="決算日の従業員数"
      />
      <p className="text-xs text-neutral-600">パート・アルバイトを含みます。不明なら空欄で保存できます。</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="underline underline-offset-4">誰を数える？</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
        </summary>
        <div className="space-y-3 pb-2 text-sm text-neutral-700">
          <p>上で入力した決算日に、会社が直接雇用していた人を1人ずつ数えます。</p>
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">この欄で数える人の範囲</caption>
            <thead><tr className="border-b border-neutral-200"><th scope="col" className="px-2 py-2 font-medium">人の区分</th><th scope="col" className="px-2 py-2 font-medium">数え方</th></tr></thead>
            <tbody>
              <tr className="border-b border-neutral-200"><th scope="row" className="px-2 py-3 font-normal">直接雇用の正社員・パート・アルバイト</th><td className="px-2 py-3">含める</td></tr>
              <tr className="border-b border-neutral-200"><th scope="row" className="px-2 py-3 font-normal">役員だけの人</th><td className="px-2 py-3">含めない</td></tr>
              <tr className="border-b border-neutral-200"><th scope="row" className="px-2 py-3 font-normal">従業員も兼ねる役員・派遣・出向</th><td className="px-2 py-3">担当者に確認</td></tr>
            </tbody>
          </table>
          <p className="text-xs">例：正社員3人＋パート2人なら5人。勤務時間で0.5人などに換算しません。</p>
          <p className="text-xs">この欄は人数の記録用です。税務・社会保険の人数条件は別に確認します。迷う場合は給与台帳や雇用契約書を担当者に確認し、不明な人数を0にしないでください。</p>
        </div>
      </details>
    </div>
  );
}
