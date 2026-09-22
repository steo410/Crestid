import test from 'node:test';import assert from 'node:assert/strict';
import {SEED} from '../src/catalog-seed.mjs';
import {normalizeGecko,publicProjection,offspring,offspringName,validateGecko,mergeCatalog,filterMorphs,INHERITANCE} from '../src/core.mjs';
test('46 seed entries distinguish genetic types and visual/het combinations',()=>{assert.equal(SEED.length,46);assert.equal(new Set(SEED.map(m=>m.id)).size,46);assert.notEqual(INHERITANCE.codominant,INHERITANCE.incomplete_dominant);assert.equal(SEED.find(m=>m.id==='lilly').inheritance,'incomplete_dominant');assert.equal(SEED.find(m=>m.id==='axanthic').inheritance,'recessive');for(const id of ['lilly','axanthic','lilly-axanthic','lilly-het'])assert(SEED.some(m=>m.id===id));assert(filterMorphs(SEED,'릴잔틱').some(m=>m.id==='lilly-axanthic'));});
test('public projection excludes notes, parents, breeder and acquisition',()=>{const g=normalizeGecko({id:'g',name:'개체',notes:'secret',breeder:'private',breederNotation:'private',parent1Id:'private-parent',acquiredDate:'2026-01-01'});const p=publicProjection(g,'owner');for(const k of ['notes','breeder','breederNotation','parent1Id','acquiredDate'])assert(!(k in p));assert.equal(g.isPublic,false);});
test('unknown genes are not treated as gene-free',()=>{const a=normalizeGecko({id:'a'}),b=normalizeGecko({id:'b'});assert.equal(offspring(a,b).rows.length,0);a.genetics.lilly='lilly';b.genetics.lilly='normal';const r=offspring(a,b);assert.deepEqual(r.unknown,['axanthic','cappuccino']);assert.deepEqual(r.rows.map(x=>x.p),[.5,.5]);});
test('cross conserves probability and includes super Lilly and visual axanthic',()=>{const a=normalizeGecko({id:'a',genetics:{lilly:'lilly',axanthic:'het100',cappuccino:'normal'}});const r=offspring(a,normalizeGecko({...a,id:'b'}));assert.equal(r.rows.length,9);assert.equal(r.rows.reduce((s,x)=>s+x.p,0),1);assert.equal(r.rows.filter(x=>x.genes.lilly===2).reduce((s,x)=>s+x.p,0),.25);assert.equal(r.rows.find(x=>x.genes.lilly===1&&x.genes.axanthic===2).p,.125);assert.equal(offspringName({lilly:1,axanthic:2,cappuccino:1}),'릴리아잔틱 + 카푸치노');});
test('possible het uses exact two-thirds',()=>{const a=normalizeGecko({id:'a',genetics:{axanthic:'het66'}}),b=normalizeGecko({id:'b',genetics:{axanthic:'visual'}});assert.equal(offspring(a,b).rows.find(x=>x.genes.axanthic===2).p,1/3);});
test('pedigree cycles and duplicate parents rejected',()=>{const p=normalizeGecko({id:'p',name:'부모'}),c=normalizeGecko({id:'c',name:'자손',parent1Id:'p'});assert.throws(()=>validateGecko({...p,parent1Id:'c'},[p,c]),/후손/);assert.throws(()=>validateGecko({...c,parent2Id:'p'},[p,c]),/서로 다른/);});
test('deletion overrides seed; restoration does not duplicate',()=>{const initial=SEED[0];const rows=mergeCatalog(SEED,[{...initial,deleted:true,revision:1}]);assert.equal(rows.length,46);assert.equal(filterMorphs(rows).length,45);assert.equal(mergeCatalog(SEED,[{...initial,deleted:false,revision:2}]).length,46);});

test('legacy migration preserves links and measurements, makes all geckos private and rejects dangling records',async()=>{
 const {convertLegacy,sourceUrl}=await import('../src/legacy-import.mjs');
 const source={geckos:[{id:'a',name:'부모',isPublic:true},{id:'b',name:'자손',parent1Id:'a',notes:'메모'}],growth:[{id:'r',geckoId:'b',date:'2026-09-20',weight:3.5,length:'',note:'기록'}],pairings:[],photos:[]};
 const result=convertLegacy(source);
 assert.equal(result.geckos[1].parent1Id,result.geckos[0].id);assert(result.geckos.every(g=>g.isPublic===false));assert.equal(result.geckos[1].notes,'메모');
 assert.equal(result.growth[0].geckoId,result.geckos[1].id);assert.equal(result.growth[0].weight,3.5);assert.equal(result.growth[0].length,0);
 assert.deepEqual(convertLegacy(source).geckos.map(g=>g.id),result.geckos.map(g=>g.id));
 assert.throws(()=>convertLegacy({...source,growth:[{...source.growth[0],geckoId:'missing'}]}));
 assert.throws(()=>sourceUrl('https://example.com'));assert.equal(sourceUrl('owner/repo'),'https://raw.githubusercontent.com/owner/repo/crestie-data/data/cresties.json');
});

test('catalog combinations and het selections drive simulation with explicit assumptions',async()=>{
 const {traitsToGenes,simulateTraits,initialTraits}=await import('../src/trait-genetics.mjs');
 assert.deepEqual(traitsToGenes(['솔리드 릴리아잔틱']),{lilly:'lilly',axanthic:'visual',cappuccino:'unknown',solidBack:'present'});
 assert.equal(traitsToGenes(['프라푸치노']).cappuccino,'cappuccino');
 assert.equal(traitsToGenes(['66% 가능 헷 아잔틱']).axanthic,'het66');
 assert.throws(()=>traitsToGenes(['아잔틱','100% 헷 아잔틱']),/충돌/);
 const a=normalizeGecko({name:'A',customTraits:['릴리아잔틱']}),b=normalizeGecko({name:'B',customTraits:['노멀']});
 assert.equal(simulateTraits(a,b).rows.length,0);
 const r=simulateTraits(a,b,SEED,true);assert.equal(r.rows.length,2);assert(r.assumptions.length>0);assert(r.rows.every(row=>row.genes.axanthic===1));assert.equal(r.rows.find(row=>row.genes.lilly===1).p,.5);
 assert.equal(b.genetics.axanthic,'unknown');
 const old=normalizeGecko({genetics:{lilly:'super',axanthic:'het50',cappuccino:'normal',solidBack:'absent'}});
 assert.deepEqual(traitsToGenes(initialTraits(old)),old.genetics);
 const renamed=SEED.map(m=>m.id==='lilly'?{...m,name:'이름을 바꾼 릴리'}:m);
 assert.equal(traitsToGenes(['이름을 바꾼 릴리'],renamed).lilly,'lilly');
 assert.equal(traitsToGenes(['세이블']).lilly,'unknown');
});
