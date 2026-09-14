import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoadmapYear } from './roadmap.ts';
import { buildWorkspaceRequiredDocuments } from './workspaceRequiredDocuments.ts';

function roadmap(): RoadmapYear[] {
  return [{
    year: 2026,
    items: [
      {
        dueDate: '2026-10-01',
        confidence: 'confirmed',
        procedure: {
          id: 1,
          name: '法人設立届出書',
          procedure_documents: [
            { name: '定款の写し', form_number: null, is_required: true, notes: null, item_type: 'document', sort_order: 1 },
            { name: '提出前に押印を確認', form_number: null, is_required: true, notes: null, item_type: 'checklist', sort_order: 2 },
          ],
        },
      },
      {
        dueDate: '2026-09-20',
        confidence: 'confirmed',
        procedure: {
          id: 2,
          name: '法人設立申告書',
          procedure_documents: [
            { name: '定款の写し', form_number: null, is_required: true, notes: null, item_type: 'document', sort_order: 1 },
            { name: '任意資料', form_number: null, is_required: false, notes: null, item_type: 'document', sort_order: 2 },
          ],
        },
      },
    ],
  }] as RoadmapYear[];
}

test('未完了手続きの必須書類を重複なく集約する', () => {
  assert.deepEqual(buildWorkspaceRequiredDocuments(roadmap(), {}), [{
    name: '定款の写し',
    formNumber: null,
    nearestDueDate: '2026-09-20',
    procedures: ['法人設立申告書', '法人設立届出書'],
  }]);
});

test('完了した手続きの書類を集約対象から除外する', () => {
  assert.deepEqual(
    buildWorkspaceRequiredDocuments(roadmap(), {
      '1:2026-10-01': 'done',
      '2:2026-09-20': 'done',
    }),
    [],
  );
});
