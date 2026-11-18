'use client';

import { useId, useState } from 'react';
import {
  ASSET_DESTINATION_COVERAGE,
  ASSET_WARDS,
  KITAKYUSHU_WARDS,
  OTHER_REGION_VALUE,
  lookupAssetSubmissionDestination,
} from '@/lib/assetSubmissionDestination';

// 資産の所在地を明示選択したときだけ、償却資産の提出先を表示する案内。
// 選択はメモリ上のみ（保存・送信なし）。会社所在地からの自動選択はしない。
export default function AssetSubmissionDestination({ disabled = false }: { disabled?: boolean }) {
  const uid = useId();
  const selectId = `${uid}-asset-region`;
  const hintId = `${uid}-asset-region-hint`;
  const [value, setValue] = useState('');
  const destination = lookupAssetSubmissionDestination(value);
  const isOther = value === OTHER_REGION_VALUE;

  return (
    <section className="space-y-2" aria-label="提出先の案内" data-testid="asset-submission-destination">
      <h3 className="text-sm font-semibold text-sunboo-ink">提出先を確認する</h3>
      <p id={hintId} className="text-sm text-sunboo-ink">
        会社の住所ではなく、資産がある場所を選びます。選択は保存されません。
      </p>
      <label htmlFor={selectId} className="block text-sm font-bold text-sunboo-ink">資産の所在地</label>
      <select
        id={selectId}
        className="form-input min-h-11 w-full text-sm sm:max-w-xs"
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">選択してください</option>
        <optgroup label="福岡市">
          {ASSET_WARDS.map((w) => (
            <option key={w.code} value={w.code}>福岡市{w.label}</option>
          ))}
        </optgroup>
        <optgroup label="北九州市">
          {KITAKYUSHU_WARDS.map((w) => (
            <option key={w.code} value={w.code}>北九州市{w.label}</option>
          ))}
        </optgroup>
        <option value={OTHER_REGION_VALUE}>その他の地域</option>
      </select>
      <div aria-live="polite">
        {destination && (
          <div className="space-y-1 rounded-lg border border-sunboo-mist p-3 text-sm text-sunboo-ink" data-testid="asset-destination-result">
            <p className="font-bold">{destination.officeName}</p>
            <p>〒{destination.postalCode}　{destination.address}</p>
            <p>電話：{destination.phone}</p>
            <p>{destination.note}</p>
            <a
              href={destination.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex min-h-11 items-center text-sm"
            >
              {destination.cityLabel}の公式案内を開く（別タブ）
            </a>
            {destination.formNotice && (
              <div className="space-y-1" data-testid="asset-destination-form-notice">
                <p className="font-medium">{destination.formNotice.text}</p>
                <a
                  href={destination.formNotice.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex min-h-11 items-center text-sm"
                >
                  {destination.formNotice.actionLabel}（別タブ）
                </a>
              </div>
            )}
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">出典と確認日</summary>
              <p>出典：{destination.cityLabel}公式サイト（確認日 {destination.sourceCheckedOn}）。提出前に公式案内をご確認ください。</p>
            </details>
          </div>
        )}
        {isOther && (
          <p className="text-sm text-sunboo-ink" data-testid="asset-destination-unavailable">
            この地域の案内はまだありません。資産がある市区町村の公式案内でご確認ください。
          </p>
        )}
      </div>
      <p className="text-sm text-sunboo-ink-muted">対応している地域：{ASSET_DESTINATION_COVERAGE}。この案内は下書きのExcelには含まれません。</p>
    </section>
  );
}
