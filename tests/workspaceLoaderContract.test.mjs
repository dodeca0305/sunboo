import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file = new URL('../src/lib/workspaceLoader.ts', import.meta.url),
  text = readFileSync(file, 'utf8'),
  ast = ts.createSourceFile(file.pathname, text, ts.ScriptTarget.Latest, true);
let source;
ts.forEachChild(ast, (n) => {
  if (
    ts.isFunctionDeclaration(n) &&
    n.name?.text === 'loadWorkspaceRoadmapContext'
  )
    source = n.getText(ast).replace('export ', '');
});
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const kind of ['legacy', 'legacy-no-status', 'checked-inputs'])
  test('shared roadmap loader contract ' + kind, async () => {
    const calls = [],
      profile = { prefectureName: 'known' },
      tax = { entries: [] },
      statuses = { known: 'done' },
      state = { known: true },
      years = [{ year: 2026, items: [] }];
    const context = {
      loadWorkspaceCompanyProfile: async () => {
        calls.push('profile');
        return profile;
      },
      loadWorkspaceTaxReturnProfile: async () => {
        calls.push('returns');
        return tax;
      },
      loadWorkspaceProcedureStatusMap: async () => {
        calls.push('statuses');
        return statuses;
      },
      deriveWorkspaceState: (p, t) => {
        assert.equal(p, profile);
        assert.equal(t, tax);
        return state;
      },
      buildAnnualRoadmap: async () => years,
      applyCutoverToRoadmapYears: async (_c, y) => y,
    };
    vm.createContext(context);
    vm.runInContext(code + ';this.load=loadWorkspaceRoadmapContext', context);
    const options =
      kind === 'checked-inputs'
        ? {
            readInputs: {
              companyProfile: profile,
              taxReturnProfile: tax,
              procedureStatusMap: statuses,
            },
          }
        : kind === 'legacy-no-status'
          ? { loadProcedureStatuses: false }
          : {};
    const r = await context.load({}, { id: 23 }, 3, options);
    assert.deepEqual(
      calls,
      kind === 'checked-inputs'
        ? []
        : kind === 'legacy-no-status'
          ? ['profile', 'returns']
          : ['profile', 'returns', 'statuses'],
    );
    assert.equal(r.roadmapYears, years);
    assert.equal(r.state, state);
    assert.equal(r.companyProfile, profile);
  });
