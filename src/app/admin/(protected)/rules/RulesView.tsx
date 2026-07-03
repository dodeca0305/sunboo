'use client';

import { useState } from 'react';
import { List, Workflow } from 'lucide-react';
import RulesTable from './RulesTable';
import RuleFlowView from './RuleFlowView';

export type RuleConditionDetail = {
  id: number;
  field: string;
  operator: string;
  value: unknown;
  sort_order: number;
};

export type RuleActionDetail = {
  id: number;
  action_type: string;
  procedure_id: number | null;
  payload: Record<string, unknown> | null;
  sort_order: number;
};

export type RuleWithDetails = {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  rule_conditions: RuleConditionDetail[];
  rule_actions: RuleActionDetail[];
};

export default function RulesView({
  rules,
  procedures,
}: {
  rules: RuleWithDetails[];
  procedures: { id: number; name: string }[];
}) {
  const [view, setView] = useState<'table' | 'flow'>('table');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm">
        <button
          type="button"
          onClick={() => setView('table')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
            view === 'table' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <List className="h-3.5 w-3.5" />
          一覧表示
        </button>
        <button
          type="button"
          onClick={() => setView('flow')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
            view === 'flow' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <Workflow className="h-3.5 w-3.5" />
          構造ビュー
        </button>
      </div>

      {view === 'table' ? <RulesTable rules={rules} /> : <RuleFlowView rules={rules} procedures={procedures} />}
    </div>
  );
}
