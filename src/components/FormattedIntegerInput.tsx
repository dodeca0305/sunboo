'use client';

type FormattedIntegerInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  onBlur?: () => void;
};

function normalizeDigits(value: string): string {
  return value
    .replace(/[０-９]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '');
}

export default function FormattedIntegerInput({
  value,
  onChange,
  placeholder = '円',
  ariaLabel,
  onBlur,
}: FormattedIntegerInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value === null ? '' : value.toLocaleString('ja-JP')}
      onChange={(event) => {
        const digits = normalizeDigits(event.target.value);

        if (digits === '') {
          onChange(null);
          return;
        }

        const nextValue = Number(digits);

        if (Number.isSafeInteger(nextValue)) {
          onChange(nextValue);
        }
      }}
      onBlur={onBlur}
      className="form-input"
    />
  );
}
