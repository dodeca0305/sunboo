export function EmployeeCountHelp({ employeeCount }: { employeeCount: number }) {
  return (
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-sunboo-ink-muted" data-testid="employee-count-help">
      <p className="font-medium text-sunboo-ink">パート・アルバイトも含めた人数です。</p>
      <p>会社が直接雇用している従業員を、1人ずつ数えてください。例：正社員3人＋パート・アルバイト2人なら「5人」です。勤務時間で0.5人などに換算しません。</p>
      <p>この合計だけで、社会保険への加入や納期の特例の対象を確定するものではありません。制度ごとに確認する人数や条件が異なります。</p>
      {employeeCount === 0 && <p className="text-amber-800">0人でも、役員報酬などによって税務・社会保険の手続きが必要になる場合があります。0人だから手続き不要とは判断しないでください。</p>}
      <details className="rounded-lg border border-sunboo-mist p-3 text-xs">
        <summary className="cursor-pointer font-semibold">役員だけ・派遣・出向などで迷う場合</summary>
        <div className="mt-2 space-y-2">
          <p>役員を兼ねる従業員、派遣・出向がある場合は、給与を支払った人の一覧（給与台帳）や雇用契約書を、税理士・社労士と確認してください。人数を推測して変更しないでください。</p>
          <a className="underline" href="https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/20150518.html" target="_blank" rel="noopener noreferrer">日本年金機構の公式案内を見る</a>
        </div>
      </details>
    </div>
  );
}

export function OfficerChangeDateHelp() {
  return (
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-sunboo-ink-muted" data-testid="officer-change-date-help">
      <p className="font-medium text-sunboo-ink">役員の変更が実際に効力を生じる日（予定日）を入れます。</p>
      <p>登記を申請する日や、申請の締切日を入れる欄ではありません。</p>
      <p>例：6月20日に就任を承諾し、その日から役員になるなら「6月20日」です。株主総会の日と就任日が同じとは限りません。</p>
      <p>株主総会議事録・就任承諾書などで確認してください。未定なら空欄のまま保存できます。</p>
      <details className="rounded-lg border border-sunboo-mist p-3 text-xs">
        <summary className="cursor-pointer font-semibold">任期満了・再任・辞任などで迷う場合</summary>
        <div className="mt-2 space-y-2">
          <p>変更の種類に応じた日付を、司法書士や法務局に確認してください。役員の任期から日付を推測して入力しないでください。</p>
          <p>SUNBOOは、入力した日を使って既存の登記申請期限の目安を表示します。個別の期限は、公式案内や専門家に確認してください。</p>
          <a className="underline" href="https://houmukyoku.moj.go.jp/homu/static/shougyou.html" target="_blank" rel="noopener noreferrer">法務局の役員変更の公式Q＆Aを見る</a>
        </div>
      </details>
    </div>
  );
}
