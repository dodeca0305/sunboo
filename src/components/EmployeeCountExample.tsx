const PEOPLE = { regular: 3, partTime: 2 } as const;

// 装飾用の人型。1体=1人。すべて同じ大きさ。
function Person() {
  return (
    <svg viewBox="0 0 48 72" className="h-[72px] w-12 flex-none fill-black" aria-hidden="true" focusable="false">
      <circle cx="24" cy="14" r="11" />
      <path d="M6 70V40a18 18 0 0 1 18-18a18 18 0 0 1 18 18v30z" />
    </svg>
  );
}

function Group({ label, count }: { label: string; count: number }) {
  return (
    <div className="min-w-0 rounded-lg border-2 border-black bg-white p-3">
      <p className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-black">
        <span>{label}</span>
        <b className="whitespace-nowrap text-xl">{count}人</b>
      </p>
      <div className="flex flex-wrap gap-3" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <Person key={i} />)}
      </div>
    </div>
  );
}

// 表示専用の静的な人数例。入力値・状態・保存には一切関与しない。
export function EmployeeCountExample() {
  const total = PEOPLE.regular + PEOPLE.partTime;
  return (
    <div className="mt-2 text-sm leading-relaxed text-black" data-testid="employee-count-example">
      <span className="mb-1.5 inline-block rounded-sm border border-black bg-white px-1.5 text-sm font-bold">架空の人数例</span>
      <p className="mb-2 font-medium">会社が直接雇っている人を、1人ずつ数えます。</p>
      <div className="grid grid-cols-1 items-stretch gap-2">
        <Group label="正社員" count={PEOPLE.regular} />
        <span className="text-center text-2xl font-bold leading-none" aria-hidden="true">＋</span>
        <Group label="パート・アルバイト" count={PEOPLE.partTime} />
        <span className="text-center text-2xl font-bold leading-none" aria-hidden="true">＝</span>
        <div className="flex min-w-0 flex-col justify-center rounded-lg border-2 border-black bg-black p-3 text-white">
          <span className="text-sm font-semibold">入力例の合計</span>
          <strong className="text-5xl font-bold leading-tight">{total}人</strong>
        </div>
      </div>
      <p className="mt-2">短時間の人も1人と数えます。</p>
    </div>
  );
}
