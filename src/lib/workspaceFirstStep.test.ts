import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkspaceFirstStep, actionHrefFor } from './workspaceFirstStep.ts';
import { PROFILE_GUIDANCE_FIELDS } from './profileInputGuidance.ts';
import type { WorkspaceDecisionAction } from './workspaceDecisions.ts';

const act = (o: Partial<WorkspaceDecisionAction> = {}): WorkspaceDecisionAction => ({
  priority: 'medium', title: 'A', reason: 'r', dueDate: '2026-12-01', procedureId: 5, ...o,
});
const base = { companyId: 7, readFailed: false, missingInputs: [], todayActions: [] as WorkspaceDecisionAction[] };

test('取得不可は未登録/0件にせず、行動を確定しない', () => {
  const r = selectWorkspaceFirstStep({ ...base, readFailed: true, missingInputs: [...PROFILE_GUIDANCE_FIELDS], todayActions: [act({ priority: 'high' })] });
  assert.deepEqual(r, { kind: 'unavailable' });
});
test('必須未入力は先頭項目の入力欄へ深いリンク', () => {
  const r = selectWorkspaceFirstStep({ ...base, missingInputs: [PROFILE_GUIDANCE_FIELDS[1], PROFILE_GUIDANCE_FIELDS[2]], todayActions: [act()] });
  assert.equal(r.kind, 'profile');
  assert.equal(r.kind === 'profile' && r.href, '/admin/workspaces/7/profile#company-profile-establishedDate');
  assert.equal(r.kind === 'profile' && r.title, 'まず、会社情報を入力してください');
});
test('既存先頭がhighなら未入力より優先して既存の1件を示す', () => {
  const r = selectWorkspaceFirstStep({ ...base, missingInputs: [...PROFILE_GUIDANCE_FIELDS], todayActions: [act({ priority: 'high', title: 'H' }), act({ priority: 'high', title: 'second' })] });
  assert.equal(r.kind, 'urgent');
  assert.equal(r.kind === 'urgent' && r.title, 'H');
});
test('先頭でないhighは新しい優先順位として扱わない', () => {
  const r = selectWorkspaceFirstStep({ ...base, missingInputs: [PROFILE_GUIDANCE_FIELDS[0]], todayActions: [act({ priority: 'medium' }), act({ priority: 'high' })] });
  assert.equal(r.kind, 'profile');
});
test('入力済みなら既存先頭1件と手続き深いリンク', () => {
  const r = selectWorkspaceFirstStep({ ...base, todayActions: [act({ title: 'first' }), act({ title: 'second' })] });
  assert.equal(r.kind, 'action');
  assert.equal(r.kind === 'action' && r.title, 'first');
  assert.equal(r.kind === 'action' && r.href, '/admin/workspaces/7/roadmap?procedureId=5&dueDate=2026-12-01');
});
test('actionHrefを優先し、無ければロードマップ', () => {
  assert.equal(actionHrefFor(7, act({ actionHref: '/admin/workspaces/7/growth?date=2026-11-01' })), '/admin/workspaces/7/growth?date=2026-11-01');
  assert.equal(actionHrefFor(7, act({ procedureId: null })), '/admin/workspaces/7/roadmap');
});
test('候補0件はロードマップ案内で、対応不要とは言わない', () => {
  const r = selectWorkspaceFirstStep(base);
  assert.equal(r.kind, 'roadmap');
  assert.equal(r.kind === 'roadmap' && r.href, '/admin/workspaces/7/roadmap');
  assert.doesNotMatch(JSON.stringify(r), /対応不要|問題なし/);
});
test('別会社IDのリンクは混ざらない', () => {
  const r = selectWorkspaceFirstStep({ ...base, companyId: 99, missingInputs: [PROFILE_GUIDANCE_FIELDS[0]] });
  assert.equal(r.kind === 'profile' && r.href, '/admin/workspaces/99/profile#company-profile-fiscalMonth');
});
