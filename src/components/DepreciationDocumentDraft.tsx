'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Plus, Trash2 } from 'lucide-react';
import {
  ACQUISITION_REASONS,
  ASSET_CATEGORIES,
  DRAFT_NOTICE,
  FORM_FIELDS_NOT_FILLED_NOTE,
  MAX_ROWS,
  addRow,
  buildCompanySource,
  buildDraftModel,
  createBlankRow,
  formatYen,
  freezeInput,
  removeRow,
  rowWarnings,
  updateRow,
  type AssetRowInput,
} from '@/lib/depreciationDocumentDraft';
import AssetSubmissionDestination from '@/components/AssetSubmissionDestination';

// ── 償却資産申告の下書き（管理画面・書類ページ）───────────────────
// 画面内の入力だけで「種類別明細書（下書き）」「償却資産申告書（下書き）」を即時プレビューし、
// XLSX1ファイルをダウンロードする。保存・送信・提出はしない（メモリ上のみ。storage/ネットワーク書込なし）。
// 親（Server Component）が取得済みの会社名・登録住所・対象年の提案だけをpropsで受け取る。
// 課税対象の判定・分類・償却/税額計算はしない。

const FIELD = 'form-input w-full min-h-11 text-base';
const LABEL = 'block text-sm font-bold text-sunboo-ink mb-1';

export default function DepreciationDocumentDraft({
  companyName,
  prefectureName,
  municipalityName,
  street,
  suggestedYear,
}: {
  companyName: string;
  prefectureName: string;
  municipalityName: string;
  street: string | null;
  suggestedYear: string;
}) {
  const source = useMemo(
    () => buildCompanySource(companyName, prefectureName, municipalityName, street),
    [companyName, prefectureName, municipalityName, street],
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(source.companyName);
  const [address, setAddress] = useState(source.address);
  const [representative, setRepresentative] = useState('');
  const [targetYear, setTargetYear] = useState(suggestedYear);
  const [ownership, setOwnership] = useState(false);
  const idCounter = useRef(1);
  const [assets, setAssets] = useState<AssetRowInput[]>(() => [createBlankRow('asset-1')]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    mounted.current = true;
    const u = urls.current;
    const t = timers.current;
    return () => {
      mounted.current = false;
      t.forEach(clearTimeout);
      t.clear();
      u.forEach((x) => URL.revokeObjectURL(x));
      u.clear();
    };
  }, []);

  const input = useMemo(
    () => ({
      companyName: name,
      address,
      addressBase: source.addressBase,
      representative,
      targetYear,
      ownershipConfirmed: ownership,
      assets,
    }),
    [name, address, source.addressBase, representative, targetYear, ownership, assets],
  );
  const model = useMemo(() => buildDraftModel(input), [input]);

  const addAsset = () => {
    idCounter.current += 1;
    setAssets((rows) => addRow(rows, `asset-${idCounter.current}`));
  };
  const patch = useCallback(
    (id: string, p: Partial<Omit<AssetRowInput, 'id'>>) => setAssets((rows) => updateRow(rows, id, p)),
    [],
  );

  async function download() {
    if (lock.current) return; // 同期ロック（二重クリック対策）
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const snapshot = freezeInput(input); // 出力中に入力が変わっても内容を固定
    try {
      const mod = await import('@/lib/depreciationDocumentDraftExcel');
      if (!mounted.current) return; // 会社切替/離脱後は旧会社のファイルを出さない
      const createdAt = new Date();
      const buffer = await mod.buildDepreciationDraftBuffer(snapshot, createdAt);
      if (!mounted.current) return;
      const filename = mod.buildDepreciationDraftFilename(snapshot.companyName, createdAt);
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        timers.current.delete(timer);
      }, 10000);
      timers.current.add(timer);
      if (mounted.current) setNotice('ダウンロードを開始しました。入力内容は保存されていません。');
    } catch {
      if (mounted.current) setError('下書きのダウンロードに失敗しました。入力内容はそのまま残っています。もう一度お試しください。');
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="card p-4 space-y-4" data-testid="depreciation-draft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base">償却資産申告の下書きを作る</h2>
        <button
          type="button"
          className="btn-secondary min-h-11 text-sm"
          aria-expanded={open}
          aria-controls="depreciation-draft-body"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '閉じる' : '開く'}
        </button>
      </div>
      {!open && (
        <p className="text-sm text-sunboo-ink">
          会社情報を使って、2つの書類の下書きを画面で確認しながら作れます。
        </p>
      )}

      {open && (
        <div id="depreciation-draft-body" className="space-y-5">
          <p className="text-sm text-sunboo-ink">
            この画面の入力は保存されません。必要なら下書きをダウンロードしてください。
            下書きの作成だけを行い、課税の対象かどうかの判定や提出はしません。登記簿などの添付も不要です。
          </p>

          <AssetSubmissionDestination disabled={busy} />

          <fieldset className="space-y-3" disabled={busy}>
            <legend className="text-sm font-bold text-sunboo-ink">会社の情報（この下書きだけで修正できます）</legend>
            <div>
              <label className={LABEL} htmlFor="dd-company">
                会社名 <span className="font-normal">（登録済み）</span>
              </label>
              <input id="dd-company" className={FIELD} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="dd-address">
                所在地 <span className="font-normal">（{source.addressComplete ? '登録済み' : '登録済みは市区町村まで。番地以降を追記'}）</span>
              </label>
              <input id="dd-address" className={FIELD} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="dd-rep">
                代表者名 <span className="font-normal">（未登録）</span>
              </label>
              <input id="dd-rep" className={FIELD} value={representative} maxLength={100} onChange={(e) => setRepresentative(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="dd-year">
                対象年 <span className="font-normal">（西暦・予定から表示）</span>
              </label>
              <input
                id="dd-year"
                className={`${FIELD} sm:max-w-40`}
                inputMode="numeric"
                value={targetYear}
                maxLength={8}
                placeholder="例：西暦4桁"
                onChange={(e) => setTargetYear(e.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={busy}>
            <legend className="text-sm font-bold text-sunboo-ink">
              資産（まとめて入力します。取得価額は「その行の合計」です）
            </legend>
            {assets.map((row, i) => (
              <div key={row.id} className="rounded-lg border border-sunboo-mist p-3 space-y-3" data-testid="dd-asset-row">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">資産 {i + 1}</p>
                  <button
                    type="button"
                    className="btn-secondary min-h-11 gap-1 text-sm"
                    onClick={() => setAssets((rows) => removeRow(rows, row.id))}
                    disabled={busy || assets.length <= 1}
                    aria-label={`資産${i + 1}を削除`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    削除
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL} htmlFor={`dd-name-${row.id}`}>資産名</label>
                    <input id={`dd-name-${row.id}`} className={FIELD} value={row.name} maxLength={200} placeholder="例：資産の名称" onChange={(e) => patch(row.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-qty-${row.id}`}>数量</label>
                    <input id={`dd-qty-${row.id}`} className={FIELD} inputMode="numeric" value={row.quantity} maxLength={20} placeholder="数字" onChange={(e) => patch(row.id, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-date-${row.id}`}>取得年月日</label>
                    <input id={`dd-date-${row.id}`} type="date" className={FIELD} value={row.acquiredOn} onChange={(e) => patch(row.id, { acquiredOn: e.target.value })} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-cost-${row.id}`}>取得価額（この行の合計・円）</label>
                    <input id={`dd-cost-${row.id}`} className={FIELD} inputMode="numeric" value={row.totalCost} maxLength={30} placeholder="この行の合計額（円）" onChange={(e) => patch(row.id, { totalCost: e.target.value })} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-life-${row.id}`}>耐用年数（年）</label>
                    <input id={`dd-life-${row.id}`} className={FIELD} inputMode="numeric" value={row.usefulLife} maxLength={10} placeholder="数字" onChange={(e) => patch(row.id, { usefulLife: e.target.value })} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-cat-${row.id}`}>種類</label>
                    <select id={`dd-cat-${row.id}`} className={FIELD} value={row.category} onChange={(e) => patch(row.id, { category: e.target.value })}>
                      <option value="">選択してください</option>
                      {ASSET_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`dd-reason-${row.id}`}>取得区分</label>
                    <select id={`dd-reason-${row.id}`} className={FIELD} value={row.reason} onChange={(e) => patch(row.id, { reason: e.target.value })}>
                      <option value="">選択してください</option>
                      {ACQUISITION_REASONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary min-h-11 gap-1 text-sm" onClick={addAsset} disabled={busy || assets.length >= MAX_ROWS}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              資産を追加
            </button>
          </fieldset>

          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={ownership} disabled={busy} onChange={(e) => setOwnership(e.target.checked)} />
            <span>入力した資産は、対象年の1月1日時点で所有していたものです（入力者の確認。制度上の判定ではありません）</span>
          </label>

          <div className="space-y-4" aria-live="polite">
            <div className="rounded-lg border border-sunboo-mist p-3" data-testid="dd-banner">
              <p className="text-lg font-bold text-sunboo-ink">{DRAFT_NOTICE}</p>
              {model.hasMissing ? (
                <details className="mt-1 text-sm" data-testid="dd-missing">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">
                    未入力・要確認（{model.missing.length}項目）
                  </summary>
                  <ul className="list-disc pl-5 pb-2">
                    {model.missing.map((m) => (<li key={m}>{m}</li>))}
                  </ul>
                </details>
              ) : (
                <p className="mt-2 text-sm">未入力の項目はありません。内容は提出前に必ず確認してください。</p>
              )}
            </div>

            <div className="space-y-2" data-testid="dd-preview-detail">
              <h3 className="text-base font-bold">種類別明細書（下書き）</h3>
              <ul className="space-y-2">
                {model.rows.map((r) => (
                  <li key={r.id} className="rounded-lg border border-sunboo-mist p-3 text-sm space-y-1">
                    <p className="font-bold break-words">{r.index + 1}. {r.name || '資産名：未入力'}</p>
                    <p>数量：{r.quantity ?? (r.quantityRaw || '未入力')}　取得：{r.acquiredOn ?? (r.acquiredOnRaw || '未入力')}</p>
                    <p>取得価額（この行の合計）：{r.totalCost !== null ? formatYen(r.totalCost) : (r.totalCostRaw || '未入力')}　耐用年数：{r.usefulLife ?? (r.usefulLifeRaw || '未入力')}</p>
                    <p>種類：{r.categoryLabel ?? '未入力'}　取得区分：{r.reasonLabel ?? '未入力'}</p>
                    {(r.issues.length > 0 || r.blank) && (
                      <details data-testid="dd-row-warnings">
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">
                          この資産の要確認（{rowWarnings(r).length}項目）
                        </summary>
                        <ul className="list-disc pl-5 pb-1">
                          {rowWarnings(r).map((w) => (<li key={w}>{w}</li>))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2" data-testid="dd-preview-form">
              <h3 className="text-base font-bold">償却資産申告書（下書き）</h3>
              <p className="text-sm break-words">
                {model.companyName || '会社名：未入力'}／{model.address || '所在地：未入力'}／代表者：{model.representative || '未入力'}／対象年：{model.targetYear === null ? '未入力' : `${model.targetYear}年`}
              </p>
              <p className="text-sm font-bold">入力した資産の取得価額集計</p>
              <ul className="space-y-1 text-sm">
                {model.categoryTotals.every((c) => c.rowCount === 0) && (
                  <li>資産を入力すると、種類ごとに集計します。</li>
                )}
                {model.categoryTotals.filter((c) => c.rowCount > 0).map((c) => (
                  <li key={c.category} className="flex flex-wrap justify-between gap-x-3">
                    <span>{c.label}（{c.rowCount}件）</span>
                    <span>
                      {c.total === null ? (c.rowCount === 0 ? '未入力' : '要確認') : formatYen(c.total)}
                      {c.incompleteRows > 0 && c.total !== null ? '（一部未入力）' : ''}
                    </span>
                  </li>
                ))}
                <li className="flex flex-wrap justify-between gap-x-3 font-bold">
                  <span>入力分の総合計</span>
                  <span>{formatYen(model.grandTotal)}</span>
                </li>
              </ul>
              <p className="text-sm">{FORM_FIELDS_NOT_FILLED_NOTE}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button type="button" className="btn-primary min-h-11 gap-2 text-sm disabled:opacity-60" onClick={download} disabled={busy}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy ? '作成中…' : '下書きをダウンロード（Excel）'}
            </button>
            {error && (
              <p role="alert" className="flex items-start gap-1 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            {notice && <p role="status" className="text-sm">{notice}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
