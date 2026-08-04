// 중장기 보수계획 파서·판정 엔진을 실제 파일로 검증한다.
// TS를 직접 못 import하니 같은 로직을 여기서 재현하지 않고, 파서가 뽑은 결과를
// API를 통해 확인하는 방식(verify.html)과 별개로, 여기서는 원시 데이터 통계만 낸다.
import fs from "node:fs";
import * as XLSX from "xlsx";

const FILE = process.argv[2] ??
  "C:/Users/minig/OneDrive/바탕 화면/콰엿민/AI PIONEER/팀 과제(예전)/오버홀 공정관리/기초자료/전기설비 중장기 유지보수 관리계획.xlsx";
const TARGET = Number(process.argv[3] ?? 2026);

const norm = v => (v == null ? "" : String(v).trim());
const squash = v => norm(v).replace(/\s+/g, "");
const GRADES = new Set(["A","B","C"]);

function parseCycle(raw) {
  const t = norm(raw);
  if (!t || t === "-") return { kind:"none", raw:t };
  if (t.includes("필요시")) return { kind:"asneeded", raw:t };
  const nums = [...new Set([...t.matchAll(/(\d+)\s*년/g)].map(m=>+m[1]))];
  if (!nums.length) return { kind:"none", raw:t };
  return nums.length===1 ? {kind:"fixed",years:nums[0],raw:t} : {kind:"ambiguous",options:nums,raw:t};
}
function findCol(headerRows, cands) {
  for (const row of headerRows) for (let c=0;c<row.length;c++) {
    const t = squash(row[c]); if (!t) continue;
    if (cands.some(k => t===k || t.includes(k))) return c;
  }
  return null;
}
function judge(cycle, lastDoneYear, targetYear) {
  if (cycle.kind==="ambiguous") return {cls:"선택", reason:"cycle_ambiguous"};
  if (cycle.kind==="asneeded")  return {cls:"선택", reason:"as_needed"};
  if (cycle.kind==="none")      return {cls:"불필요", reason:"no_cycle"};
  if (lastDoneYear==null)       return {cls:"선택", reason:"no_history"};
  const next = lastDoneYear + cycle.years;
  if (next===targetYear) return {cls:"필수", reason:"due", next};
  if (next<targetYear)   return {cls:"필수", reason:"overdue", next};
  return {cls:"불필요", reason:"not_due", next};
}
const isOH = m => ["O/H","OH"].includes((m??"").replace(/\s+/g,"").toUpperCase());

const wb = XLSX.read(new Uint8Array(fs.readFileSync(FILE)), { type:"array" });
let all = [];
const parsed=[], skipped=[];

for (const sheetName of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1,blankrows:true,defval:""});
  let yhr=-1, best=0;
  for (let i=0;i<Math.min(rows.length,8);i++){
    const n=(rows[i]??[]).filter(c=>/^(19|20)\d{2}$/.test(norm(c))).length;
    if(n>=3&&n>best){best=n;yhr=i;}
  }
  if (yhr===-1){ skipped.push(sheetName); continue; }
  const years=[]; (rows[yhr]??[]).forEach((c,j)=>{const t=norm(c); if(/^(19|20)\d{2}$/.test(t)) years.push({col:j,year:+t});});
  const hdr = rows.slice(0,yhr+1);
  const col = {
    category:findCol(hdr,["설비구분"]), name:findCol(hdr,["기기명"]), tagNo:findCol(hdr,["기기번호"]),
    spec:findCol(hdr,["사양"]), cycle:findCol(hdr,["정밀점검주기"]), method:findCol(hdr,["시행방법"]),
  };
  if (col.name==null){ skipped.push(sheetName); continue; }
  parsed.push(sheetName);

  let cat=null;
  for (let r=yhr+1;r<rows.length;r++){
    const row=rows[r]??[];
    const cands=[col.category!=null?row[col.category]:"", (col.category??0)>0?row[col.category-1]:""];
    const hit=cands.find(c=>/^\s*\d+\.\s/.test(norm(c)));
    if(hit){cat=norm(hit);continue;}
    const name=norm(col.name!=null?row[col.name]:"");
    if(!name||/^\s*\d+\.\s/.test(name)||name.startsWith("[")) continue;
    const gcells=years.map(y=>norm(row[y.col]));
    const cycleRaw=col.cycle!=null?norm(row[col.cycle]):"";
    if(gcells.every(v=>!v)&&!cycleRaw) continue;
    const grades=[]; years.forEach((y,k)=>{const g=gcells[k].toUpperCase(); if(GRADES.has(g)) grades.push({year:y.year,grade:g});});
    // A·B·C 모두 "그 해 보수 실시" — 강도만 다르다 (src/modules/overhaul/lib/maintenancePlanParser.ts 주석 참고)
    const priorA=grades.filter(g=>g.year<TARGET).map(g=>g.year);
    all.push({
      sheet:sheetName, category:cat, name, tagNo:col.tagNo!=null?norm(row[col.tagNo]):null,
      spec:col.spec!=null?norm(row[col.spec]):null,
      cycle:parseCycle(cycleRaw), method:col.method!=null?norm(row[col.method]):null,
      lastDoneYear: priorA.length?Math.max(...priorA):null, grades,
    });
  }
}

console.log(`파일: ${FILE.split("/").pop()}`);
console.log(`시트 ${wb.SheetNames.length}개 → 파싱 ${parsed.length} / 건너뜀 ${skipped.length}`);
console.log(`  파싱: ${parsed.join(", ")}`);
console.log(`  건너뜀: ${skipped.join(", ") || "(없음)"}`);
console.log(`총 설비: ${all.length}건\n`);

const kinds={}, methods={};
for (const it of all){ kinds[it.cycle.kind]=(kinds[it.cycle.kind]||0)+1; const m=it.method||"(미지정)"; methods[m]=(methods[m]||0)+1; }
console.log("주기 해석:", JSON.stringify(kinds));
console.log("시행방법:", JSON.stringify(methods));

console.log(`\n=== ${TARGET}년 판정 ===`);
const cls={필수:0,선택:0,불필요:0}, reasons={};
const ohCls={필수:0,선택:0,불필요:0};
for (const it of all){
  const j=judge(it.cycle,it.lastDoneYear,TARGET);
  cls[j.cls]++; reasons[j.reason]=(reasons[j.reason]||0)+1;
  if (isOH(it.method)) ohCls[j.cls]++;
}
console.log("전체:", JSON.stringify(cls));
console.log("근거별:", JSON.stringify(reasons));
console.log("O/H만:", JSON.stringify(ohCls), "← 수량산출서 대상");

console.log(`\n=== O/H 필수 항목 샘플 10건 ===`);
let n=0;
for (const it of all){
  if(!isOH(it.method)) continue;
  const j=judge(it.cycle,it.lastDoneYear,TARGET);
  if(j.cls!=="필수") continue;
  if(n++>=10) break;
  console.log(`  [${(it.category??"-").slice(0,14).padEnd(14)}] ${it.name.slice(0,30).padEnd(30)} tag=${(it.tagNo??"-").padEnd(14)} ${it.cycle.years}년 직전=${it.lastDoneYear} ${j.reason}`);
}

console.log(`\n=== 선택(사용자 판단 필요) 항목 ===`);
for (const it of all){
  const j=judge(it.cycle,it.lastDoneYear,TARGET);
  if(j.cls!=="선택") continue;
  console.log(`  ${it.name.slice(0,34).padEnd(34)} 주기="${it.cycle.raw}" 방법=${it.method} → ${j.reason}`);
}
