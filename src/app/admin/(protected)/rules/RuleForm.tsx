'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { RULE_CONDITION_FIELDS, RULE_OPERATORS, RULE_ACTION_TYPES } from '@/lib/adminConstants';

export type ConditionFormRow = {
  key: string; // React key（保存時は使わない）
  field: string;
  operator: string;
  value: string; // JSON テキストとして編集（例: "kabushiki" / true / 40 / ["40","41"]）
};

export type ActionFormRow = {
  key: string;
  action_type: string;
  procedure_id: string; // select の value は文字列
  payload: string; // JSON テキストとして編集（空欄可）
};

export type RuleFormValues = {
  id?: number;
  name: string;
  description: string;
  priority: number;
  is_active: boolean;
};

const EMPTY_RULE: RuleFormValues = { name: '', description: '', priority: 0, is_active: true };

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `row-${keySeq}`;
}

function emptyCondition(): ConditionFormRow {
  return { key: newKey(), field: 'event_type_code', operator: 'eq', value: '' };
}

function emptyAction(): ActionFormRow {
  return { key: newKey(), action_type: 'add_procedure', procedure_id: '', payload: '' };
}

export default function RuleForm({
  initialRule,
  initialConditions,
  initialActions,
  procedures,
}: {
  initialRule?: RuleFormValues;
  initialConditions?: ConditionFormRow[];
  initialActions?: ActionFormRow[];
  procedures: { id: number; code: string; name: string }[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initialRule?.id);

  const [rule, setRule] = useState<RuleFormValues>(initialRule ?? EMPTY_RULE);
  const [conditions, setConditions] = useState<ConditionFormRow[]>(
    initialConditions && initialConditions.length > 0 ? initialConditions : [emptyCondition()],
  );
  const [actions, setActions] = useState<ActionFormRow[]>(
    initialActions && initialActions.length > 0 ? initialActions : [emptyAction()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRuleField<K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) {
    setRule((v) => ({ ...v, [key]: value }));
  }

  function updateCondition(key: string, patch: Partial<ConditionFormRow>) {
    setConditions((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function updateAction(key: string, patch: Partial<ActionFormRow>) {
    setActions((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function parseJsonField(raw: string, label: string): { ok: true; value: unknown } | { ok: false; error: string } {
    if (!raw.trim()) return { ok: false, error: `${label}を入力してください（JSON形式）` };
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, error: `${label}のJSON形式が正しくありません: ${raw}` };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!rule.name.trim()) {
      setError('ルール名は必須です。');
      return;
    }

    // 条件のバリデーション
    const parsedConditions: { field: string; operator: string; value: unknown; sort_order: number }[] = [];
    for (const [idx, c] of conditions.entries()) {
      if (!c.field.trim()) continue; // 空行は無視
      const parsed = parseJsonField(c.value, `条件「${c.field}」の値`);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      parsedConditions.push({ field: c.field.trim(), operator: c.operator, value: parsed.value, sort_order: idx });
    }

    // 実行内容のバリデーション
    const parsedActions: {
      action_type: string;
      procedure_id: number | null;
      payload: unknown;
      sort_order: number;
    }[] = [];
    for (const [idx, a] of actions.entries()) {
      const meta = RULE_ACTION_TYPES.find((t) => t.value === a.action_type);
      const requiresProcedure = a.action_type !== 'show_warning';
      if (requiresProcedure && !a.procedure_id) {
        setError(`実行内容「${meta?.label ?? a.action_type}」は対象手続きの選択が必須です。`);
        return;
      }
      let payloadValue: unknown = null;
      if (a.payload.trim()) {
        const parsed = parseJsonField(a.payload, `実行内容「${meta?.label ?? a.action_type}」のデータ`);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        payloadValue = parsed.value;
      }
      if (a.action_type === 'show_warning' && !(payloadValue as { message?: string } | null)?.message) {
        setError('「警告を表示」は実行内容データに message を含めてください（例: {"message": "文言"}）。');
        return;
      }
      parsedActions.push({
        action_type: a.action_type,
        procedure_id: requiresProcedure ? Number(a.procedure_id) : null,
        payload: payloadValue,
        sort_order: idx,
      });
    }

    if (parsedActions.length === 0) {
      setError('実行内容を1件以上追加してください。');
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);

    const rulePayload = {
      name: rule.name.trim(),
      description: rule.description.trim() || null,
      priority: rule.priority,
      is_active: rule.is_active,
    };

    let ruleId = rule.id;
    if (isEdit && ruleId) {
      const { error: updateError } = await supabase.from('rules').update(rulePayload).eq('id', ruleId);
      if (updateError) {
        setSaving(false);
        setError(`保存に失敗しました: ${updateError.message}`);
        return;
      }
      // 既存の条件・実行内容を全て削除してから作り直す（MVP: 差分更新はせず全置換）
      await supabase.from('rule_conditions').delete().eq('rule_id', ruleId);
      await supabase.from('rule_actions').delete().eq('rule_id', ruleId);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('rules')
        .insert(rulePayload)
        .select('id')
        .single();
      if (insertError || !inserted) {
        setSaving(false);
        setError(`保存に失敗しました: ${insertError?.message ?? '不明なエラー'}`);
        return;
      }
      ruleId = (inserted as { id: number }).id;
    }

    if (parsedConditions.length > 0) {
      const { error: condError } = await supabase
        .from('rule_conditions')
        .insert(parsedConditions.map((c) => ({ ...c, rule_id: ruleId })));
      if (condError) {
        setSaving(false);
        setError(`条件の保存に失敗しました: ${condError.message}`);
        return;
      }
    }

    const { error: actionError } = await supabase
      .from('rule_actions')
      .insert(parsedActions.map((a) => ({ ...a, rule_id: ruleId })));
    if (actionError) {
      setSaving(false);
      setError(`実行内容の保存に失敗しました: ${actionError.message}`);
      return;
    }

    setSaving(false);
    router.push('/admin/rules');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* ── ルール基本情報 ── */}
      <div className="card space-y-4">
        <p className="text-xs font-semibold text-gray-500">ルール</p>
        <div>
          <label className="form-label">ルール名 *</label>
          <input
            required
            value={rule.name}
            onChange={(e) => setRuleField('name', e.target.value)}
            className="form-input"
            placeholder="例：会社設立：株式会社設立登記"
          />
        </div>
        <div>
          <label className="form-label">説明</label>
          <textarea
            value={rule.description}
            onChange={(e) => setRuleField('description', e.target.value)}
            className="form-input"
            rows={2}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">優先度（小さいほど先に評価）</label>
            <input
              type="number"
              value={rule.priority}
              onChange={(e) => setRuleField('priority', Number(e.target.value))}
              className="form-input"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={rule.is_active}
                onChange={(e) => setRuleField('is_active', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              有効（評価対象にする）
            </label>
          </div>
        </div>
      </div>

      {/* ── 条件 ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500">
            条件（すべてを満たした場合にルールが成立します。AND結合。OR条件が必要な場合は条件違いのルールを複数作成してください）
          </p>
          <button
            type="button"
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            条件を追加
          </button>
        </div>

        {conditions.length === 0 && (
          <p className="text-xs text-gray-400">条件なし（常に成立するルールになります）</p>
        )}

        <datalist id="rule-field-options">
          {RULE_CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value} />
          ))}
        </datalist>

        <div className="space-y-3">
          {conditions.map((c) => (
            <div key={c.key} className="grid gap-2 rounded-xl border border-gray-100 p-3 sm:grid-cols-[1fr_auto_1fr_auto]">
              <div>
                <label className="form-label">フィールド</label>
                <input
                  list="rule-field-options"
                  value={c.field}
                  onChange={(e) => updateCondition(c.key, { field: e.target.value })}
                  className="form-input py-1.5 text-sm"
                  placeholder="例: corporate_type"
                />
              </div>
              <div>
                <label className="form-label">演算子</label>
                <select
                  value={c.operator}
                  onChange={(e) => updateCondition(c.key, { operator: e.target.value })}
                  className="form-select py-1.5 text-sm"
                >
                  {RULE_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">値（JSON）</label>
                <input
                  value={c.value}
                  onChange={(e) => updateCondition(c.key, { value: e.target.value })}
                  className="form-input py-1.5 text-sm font-mono"
                  placeholder='例: "kabushiki" / true / 40'
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setConditions((prev) => prev.filter((row) => row.key !== c.key))}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  aria-label="条件を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          よく使うフィールド：{RULE_CONDITION_FIELDS.map((f) => f.value).join(' / ')}（他のフィールド名も自由に入力できます）
        </p>
      </div>

      {/* ── 実行内容 ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500">実行内容（条件が成立した場合に実行する内容）</p>
          <button
            type="button"
            onClick={() => setActions((prev) => [...prev, emptyAction()])}
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            実行内容を追加
          </button>
        </div>

        <div className="space-y-3">
          {actions.map((a) => {
            const meta = RULE_ACTION_TYPES.find((t) => t.value === a.action_type);
            const requiresProcedure = a.action_type !== 'show_warning';
            return (
              <div key={a.key} className="space-y-2 rounded-xl border border-gray-100 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="form-label">種類</label>
                    <select
                      value={a.action_type}
                      onChange={(e) => updateAction(a.key, { action_type: e.target.value })}
                      className="form-select py-1.5 text-sm"
                    >
                      {RULE_ACTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">対象手続き{requiresProcedure ? ' *' : '（任意）'}</label>
                    <select
                      value={a.procedure_id}
                      onChange={(e) => updateAction(a.key, { procedure_id: e.target.value })}
                      className="form-select py-1.5 text-sm"
                    >
                      <option value="">（選択してください）</option>
                      {procedures.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{p.code}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setActions((prev) => prev.filter((row) => row.key !== a.key))}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      aria-label="実行内容を削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {meta?.hint && <p className="text-xs text-gray-400">{meta.hint}</p>}
                <div>
                  <label className="form-label">実行内容データ（JSON、任意）</label>
                  <textarea
                    value={a.payload}
                    onChange={(e) => updateAction(a.key, { payload: e.target.value })}
                    className="form-input py-1.5 font-mono text-xs"
                    rows={2}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>
        <button type="button" onClick={() => router.push('/admin/rules')} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
