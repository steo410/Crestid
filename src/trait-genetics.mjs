import {SEED} from './catalog-seed.mjs';
import {normalizeGecko,offspring,GENES} from './core.mjs';
// Only curated IDs have a quantitative genetic model; community descriptions cannot alter it.
const MODEL={lilly:{lilly:'lilly'},axanthic:{axanthic:'visual'},cappuccino:{cappuccino:'cappuccino'},'solid-back':{solidBack:'present'},'lilly-axanthic':{lilly:'lilly',axanthic:'visual'},frappuccino:{lilly:'lilly',cappuccino:'cappuccino'},'solid-lilly':{lilly:'lilly',solidBack:'present'},'solid-lilly-axanthic':{lilly:'lilly',axanthic:'visual',solidBack:'present'},'lilly-het':{lilly:'lilly',axanthic:'het100'}};
export const EXTRA_TRAITS=[
 ['슈퍼 릴리',{lilly:'super'}],['슈퍼 카푸치노',{cappuccino:'super'}],
 ['100% 헷 아잔틱',{axanthic:'het100'}],['66% 가능 헷 아잔틱',{axanthic:'het66'}],['50% 가능 헷 아잔틱',{axanthic:'het50'}],
 ['릴리 유전자 없음 확인',{lilly:'normal'}],['아잔틱 비보인 확인',{axanthic:'clear'}],['카푸치노 유전자 없음 확인',{cappuccino:'normal'}],['솔리드백 없음 확인',{solidBack:'absent'}]
];
function binding(name,catalog){
 const extra=EXTRA_TRAITS.find(([n])=>n===name);if(extra)return extra[1];
 const entry=catalog.find(m=>m.name===name)||SEED.find(m=>m.name===name);return MODEL[entry?.id]||{};
}
export function traitsToGenes(traits,catalog=SEED){
 const result={lilly:'unknown',axanthic:'unknown',cappuccino:'unknown',solidBack:'unknown'};
 for(const name of traits)for(const [key,value] of Object.entries(binding(name,catalog))){
  if(result[key]!=='unknown'&&result[key]!==value)throw Error(`${GENES[key]||'솔리드백'} 특징이 서로 충돌합니다. 선택한 항목을 확인하세요.`);
  result[key]=value;
 }return result;
}
export function initialTraits(g,catalog=SEED){
 const selected=new Set(g.customTraits||[]);
 const explicit=traitsToGenes([...selected],catalog);
 // Preserve confirmed legacy genotypes in the same selector, including het and absence states.
 for(const [key,value] of Object.entries(g.genetics||{})){
  if(value==='unknown'||explicit[key]!=='unknown')continue;
  const found=[...catalog.filter(m=>!m.deleted).map(m=>[m.name,MODEL[m.id]||{}]),...EXTRA_TRAITS].find(([,model])=>Object.keys(model).length===1&&model[key]===value);
  if(found)selected.add(found[0]);
 }
 // Display-morph text is not treated as a genotype without an explicit feature selection.
 return [...selected];
}
export function effectiveGecko(g,catalog=SEED){
 const selected=traitsToGenes(g.customTraits||[],catalog),next=normalizeGecko(g);
 for(const [key,value] of Object.entries(selected))if(value!=='unknown')next.genetics[key]=value;
 return next;
}
export function simulateTraits(a,b,catalog=SEED,assumeMissing=false){
 const parents=[effectiveGecko(a,catalog),effectiveGecko(b,catalog)],assumptions=[];
 if(assumeMissing)for(const g of parents)for(const key of Object.keys(GENES))if(g.genetics[key]==='unknown'){
  g.genetics[key]=key==='axanthic'?'clear':'normal';assumptions.push(`${g.name}: ${GENES[key]} ${key==='axanthic'?'비보인':'없음'} 가정`);
 }
 return {...offspring(...parents),assumptions,parents};
}
