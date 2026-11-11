// Short, static orientation for the tax check page. No state, no saving.
export default function TaxCheckInputHelp() {
  return (
    <div className="space-y-1 text-sm" data-testid="tax-check-input-help">
      <p className="text-xs text-sunboo-ink-muted">法人税の申告時期を確認する画面です。</p>
      <p className="text-neutral-800">決算日と申告した日を入力してください。</p>
      <p className="text-neutral-800">申告済みの決算がある場合だけ入力してください。</p>
    </div>
  );
}
