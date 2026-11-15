type RegistryField = 'establishedDate' | 'capital';

const EXAMPLES: Record<RegistryField, { target: string; call: string; inputLabel: string; inputValue: string }> = {
  establishedDate: { target: '会社成立の年月日', call: 'この日付', inputLabel: '設立日', inputValue: '2020年4月1日' },
  capital: { target: '資本金の額', call: 'この金額', inputLabel: '資本金', inputValue: '3,000,000円' },
};

const ROWS: { label: string; value: string; field?: RegistryField }[] = [
  { label: '商号', value: '株式会社サンプル（架空）' },
  { label: '会社成立の年月日', value: '令和2年4月1日', field: 'establishedDate' },
  { label: '資本金の額', value: '金300万円', field: 'capital' },
];

// 表示専用の静的な見本。入力値・状態・保存には一切関与しない。
export function RegistryFieldExample({ field }: { field: RegistryField }) {
  const example = EXAMPLES[field];
  return (
    <div className="mt-1.5 text-xs leading-relaxed text-sunboo-ink" data-testid={`registry-field-example-${field}`}>
      <div className="rounded border border-gray-400 bg-gray-50 p-2">
        <span className="mb-1.5 inline-block rounded-sm border border-black bg-white px-1.5 font-bold">見本・架空・説明用</span>
        <table className="w-full border-separate border-spacing-0 bg-white">
          <caption className="pb-1.5 text-left font-bold">登記簿謄本の見本（説明用の抜粋）</caption>
          <tbody>
            {ROWS.map((row) => {
              const hit = row.field === field;
              const edge = hit ? 'border-y-[3px] border-y-[#d00] bg-[#fff4f4]' : 'border-b border-gray-300';
              return (
                <tr key={row.label}>
                  <th scope="row" className={`w-[42%] break-words border-r border-gray-300 px-2 py-2.5 text-left font-semibold ${hit ? `${edge} border-l-[3px] border-l-[#d00]` : `${edge} bg-gray-100 text-gray-700`}`}>
                    {row.label}
                  </th>
                  <td className={`break-words px-2 py-2.5 text-left font-semibold ${hit ? `${edge} border-r-[3px] border-r-[#d00]` : edge}`}>
                    {row.value}
                    {hit && <span className="ml-2 inline-block whitespace-nowrap rounded-sm bg-[#d00] px-2 py-px font-bold text-white">{example.call}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 rounded-md bg-gray-100 p-2">
        入力例: {example.inputLabel} <strong className="text-sm">{example.inputValue}</strong>
      </p>
      <p className="mt-1.5">書類によって配置は異なります。実際の書類の同じ項目を確認してください。</p>
    </div>
  );
}
