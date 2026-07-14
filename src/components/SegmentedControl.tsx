'use client';

// トグル・セグメントコントロール共通部品（Sprint83「Interactive Controls & Status Foundation」）。
// /profile・/start・/events で個別に実装されていた「border-blue-600 bg-blue-600 text-white」の
// 選択状態を、この1コンポーネントに集約する。
//
// - 選択状態はMorningSun塗り＋Ink文字（globals.cssの.segmented-option参照）
// - 色だけで選択状態を表現しないよう、aria-pressedを併用する（CSS側もこの属性をセレクタに使う）
// - 素の<button type="button">を使うため、Tab/Enter/Spaceによるキーボード操作はブラウザ標準のまま維持される

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth = false,
  className = '',
}: {
  options: SegmentedControlOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** true: 選択肢が横幅いっぱいに等分される（/start・/eventsの「はい/いいえ」型）。
   *  false（既定）: 選択肢の内容に応じて折り返す（/profileの多肢選択型） */
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex ${fullWidth ? 'gap-3' : 'flex-wrap gap-2'}${className ? ` ${className}` : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`segmented-option${fullWidth ? ' flex-1' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
