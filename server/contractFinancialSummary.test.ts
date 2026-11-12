import {describe,it,expect,vi} from 'vitest';
vi.mock('./storage',()=>({storagePut:vi.fn(),storageGet:vi.fn()}));
import {addNetContractSummary} from './contractGenerator';
const section='<w:document><w:body><w:p><w:r><w:t>المادة (6) – الأتعاب المالية</w:t></w:r></w:p><w:p><w:r><w:t>Government contribution 200,000 USD and original legal wording.</w:t></w:r></w:p></w:body></w:document>';
describe('printed original / discount / net commercial value',()=>{
 it('prints EUR 15000 minus 5000 equals 10000 and preserves all existing legal paragraphs',()=>{
  const s=addNetContractSummary(section,10000,{currency:'EUR',originalValue:15000,discountValue:5000});
  expect(s).toContain('قيمة العقد قبل الخصم: 15,000 يورو');expect(s).toContain('الخصم: 5,000 يورو');expect(s).toContain('قيمة العقد بعد الخصم: 10,000 يورو');expect(s).toContain('Government contribution 200,000 USD and original legal wording.');
  expect(s.replace(/<w:p><w:pPr><w:bidi\/>[\s\S]*?<\/w:p>/,'' )).toBe(section);
 });
 it('prints the selected USD unit, not EUR or a government contribution substitution',()=>expect(addNetContractSummary(section,10000,{currency:'USD',originalValue:15000,discountValue:5000})).toContain('قيمة العقد بعد الخصم: 10,000 دولار أمريكي'));
 it('prints full-discount zero and two-decimal net values correctly',()=>{
  expect(addNetContractSummary(section,0,{currency:'EUR',originalValue:15000,discountValue:15000})).toContain('قيمة العقد بعد الخصم: 0 يورو');
  expect(addNetContractSummary(section,99.99,{currency:'EUR',originalValue:100,discountValue:0.01})).toContain('قيمة العقد بعد الخصم: 99.99 يورو');
 });
 it('preserves the existing not-yet-agreed zero default without inserting a fake agreed fee',()=>expect(addNetContractSummary(section,0,{currency:'EUR',originalValue:0,discountValue:0})).toBe(section));
 it.each([NaN,Infinity,-1])('rejects invalid commercial amounts %s',n=>expect(()=>addNetContractSummary(section,n,{currency:'EUR',originalValue:15000,discountValue:5000})).toThrow('Invalid contract financial summary'));
 it('rejects contradictory original/discount/net values and unknown currencies',()=>{
  expect(()=>addNetContractSummary(section,9999,{currency:'EUR',originalValue:15000,discountValue:5000})).toThrow();
  expect(()=>addNetContractSummary(section,10000,{currency:'GBP',originalValue:15000,discountValue:5000})).toThrow();
 });
 it('fails closed when the approved financial-section heading is absent or duplicated',()=>{
  expect(()=>addNetContractSummary('<w:document/>',10000,{currency:'EUR',originalValue:15000,discountValue:5000})).toThrow('Contract financial section requires review');
  expect(()=>addNetContractSummary(section+section,10000,{currency:'EUR',originalValue:15000,discountValue:5000})).toThrow();
 });
});
