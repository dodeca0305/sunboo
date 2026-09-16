'use client';

import { useEffect, useRef, useState } from 'react';
import { parseIntegerInput } from '@/lib/integerInputValidation';

type FormattedIntegerInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel: string;
  onBlur?: () => void;
  className?: string;
  selectZeroOnFocus?: boolean;
  zeroAsBlank?: boolean;
};

function formatIntegerValue(value: number | null, zeroAsBlank: boolean): string {
  return value === null || (zeroAsBlank && value === 0)
    ? ''
    : value.toLocaleString('ja-JP');
}

export default function FormattedIntegerInput({
  value,
  onChange,
  placeholder = '円',
  ariaLabel,
  onBlur,
  className = '',
  selectZeroOnFocus = false,
  zeroAsBlank = false,
}: FormattedIntegerInputProps) {
  const [text, setText] = useState(formatIntegerValue(value, zeroAsBlank));
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) {
      setText(formatIntegerValue(value, zeroAsBlank));
    }
  }, [value, zeroAsBlank]);

  function commit(rawValue: string) {
    const result = parseIntegerInput(rawValue);
    if (result.status === 'unsafe') {
      setText(formatIntegerValue(value, zeroAsBlank));
      return;
    }
    setText(formatIntegerValue(result.value, zeroAsBlank));
    onChange(result.value);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        if (!(event.nativeEvent as InputEvent).isComposing && !composingRef.current) {
          commit(event.target.value);
        }
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        commit(event.currentTarget.value);
      }}
      onFocus={(event) => {
        if (selectZeroOnFocus && value === 0) {
          event.currentTarget.select();
        }
      }}
      onBlur={(event) => {
        if (!composingRef.current) commit(event.currentTarget.value);
        onBlur?.();
      }}
      className={`form-input ${className}`}
    />
  );
}
