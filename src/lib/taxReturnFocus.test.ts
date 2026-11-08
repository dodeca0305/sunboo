import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaxReturnFocus, resolveTaxReturnFocus } from './taxReturnFocus.ts';
import type { TaxReturnEntry } from './taxReturnProfile';

test('only explicit supported field links open a form', () => {
  assert.deepEqual(parseTaxReturnFocus({entry:'new',field:'fiscalYearEndDate'}),{entry:'new',field:'fiscalYearEndDate'});
  assert.deepEqual(parseTaxReturnFocus({entry:'7',field:'filedDate'}),{entry:'7',field:'filedDate'});
  for(const params of [{}, {entry:'0',field:'filedDate'}, {entry:'99999999999999999999',field:'filedDate'}, {entry:['7'],field:'filedDate'}, {entry:'new',field:'filedDate'}, {entry:'7',field:'delete'}])
    assert.equal(parseTaxReturnFocus(params),null);
});
test('an entry outside the loaded company never opens an editor or becomes a new registration', () => {
  const entries = [{id:'7'}] as TaxReturnEntry[];
  assert.equal(resolveTaxReturnFocus(entries,{entry:'8',field:'filedDate'}),null);
  assert.equal(resolveTaxReturnFocus(entries,{entry:'7',field:'filedDate'})?.entry,entries[0]);
  assert.equal(resolveTaxReturnFocus(entries,{entry:'new',field:'fiscalYearEndDate'})?.entry,null);
});
