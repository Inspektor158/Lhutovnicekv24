const STORAGE_KEY = "lhutovnicek.caseFiles.v2";
const OLD_STORAGE_KEY = "lhutovnicek.caseFiles.v1";
const APP_PIN = "158158";
const $ = (id) => document.getElementById(id);
let cases = loadCases();
let unlocked = false;
let pendingFinishId = null;

const els = {
  appShell: $("appShell"), loginScreen: $("loginScreen"), welcomePin: $("welcomePin"), welcomeError: $("welcomeError"), welcomeUnlockBtn: $("welcomeUnlockBtn"),
  list: $("caseList"), empty: $("emptyState"), addBtn: $("addBtn"), dialog: $("caseDialog"), form: $("caseForm"),
  closeDialog: $("closeDialog"), deleteBtn: $("deleteBtn"), search: $("searchInput"), filter: $("filterSelect"), sort: $("sortSelect"),
  countAll: $("countAll"), countUrgent: $("countUrgent"), countOverdue: $("countOverdue"), countTC: $("countTC"), countPR: $("countPR"), countCJ: $("countCJ"),
  defaultDeadlineBtn: $("defaultDeadlineBtn"), todayBtn: $("todayBtn"), caseTypeInfo: $("caseTypeInfo"),
  helpDialog: $("helpDialog"), helpBtn: $("helpBtn"), closeHelp: $("closeHelp"), okHelp: $("okHelp"),
  backupBtn: $("backupBtn"), backupDialog: $("backupDialog"), closeBackup: $("closeBackup"), exportJsonBtn: $("exportJsonBtn"), importJsonBtn: $("importJsonBtn"), exportCsvBtn: $("exportCsvBtn"), wipeBtn: $("wipeBtn"), importInput: $("importInput"),
  settingsBtn: $("settingsBtn"), settingsDialog: $("settingsDialog"), closeSettings: $("closeSettings"),
  finishConfirmDialog: $("finishConfirmDialog"), closeFinishConfirm: $("closeFinishConfirm"), cancelFinishConfirm: $("cancelFinishConfirm"), confirmFinishBtn: $("confirmFinishBtn"), finishConfirmTarget: $("finishConfirmTarget")
};

const CASE_TYPES = {
  TC: { code:"TC", label:"Trestné činy", short:"TČ", deadlineLabel:"2 měsíce", days:null, months:2 },
  PR: { code:"PR", label:"Přestupky", short:"PŘ", deadlineLabel:"30 dní", days:30, months:null },
  CJ: { code:"CJ", label:"Čísla jednací", short:"ČJ", deadlineLabel:"30 dní", days:30, months:null }
};
const TYPE_ORDER = ["TC", "PR", "CJ"];

function todayISO(){ return new Date().toISOString().slice(0,10); }
function parseLocalDate(s){ const [y,m,d]=String(s).split("-").map(Number); return new Date(y||1970,(m||1)-1,d||1); }
function toISO(date){ const z=new Date(date.getTime()-date.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
function addMonthsISO(dateISO, months){ const d=parseLocalDate(dateISO); const day=d.getDate(); d.setMonth(d.getMonth()+months); if(d.getDate()!==day)d.setDate(0); return toISO(d); }
function addDaysISO(dateISO, days){ const d=parseLocalDate(dateISO); d.setDate(d.getDate()+days); return toISO(d); }
function diffDays(from,to){ const a=parseLocalDate(from), b=parseLocalDate(to); a.setHours(0,0,0,0); b.setHours(0,0,0,0); return Math.round((b-a)/86400000); }
function fmtDate(s){ return parseLocalDate(s).toLocaleDateString("cs-CZ"); }
function escapeHtml(str=""){ return String(str).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function normalizeText(str=""){ return String(str).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function detectCaseType(caseNumber=""){
  const n = normalizeText(caseNumber);
  if(/(^|[^A-Z0-9])TC($|[^A-Z0-9])|\/TC|TC-/.test(n)) return "TC";
  if(/(^|[^A-Z0-9])PR($|[^A-Z0-9])|\/PR|PR-/.test(n)) return "PR";
  if(/(^|[^A-Z0-9])CJ($|[^A-Z0-9])|\/CJ|CJ-/.test(n)) return "CJ";
  return "CJ";
}
function typeInfo(fileOrNumber){ return CASE_TYPES[detectCaseType(typeof fileOrNumber === "string" ? fileOrNumber : fileOrNumber.caseNumber)] || CASE_TYPES.CJ; }
function defaultDeadlineFor(startDate, caseNumber){
  const t = typeInfo(caseNumber);
  return t.months ? addMonthsISO(startDate, t.months) : addDaysISO(startDate, t.days);
}
function deadlineTextFor(caseNumber){ const t=typeInfo(caseNumber); return `${t.short} – ${t.label}, základní lhůta ${t.deadlineLabel}`; }

function loadCases(){
  try{
    const existing=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(Array.isArray(existing)) return existing;
    const old=JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if(Array.isArray(old)){ localStorage.setItem(STORAGE_KEY, JSON.stringify(old)); return old; }
  }catch{}
  return [];
}
function saveCases(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(cases)); }
function getStatus(file){
  if(file.isFinished) return {text:"Vyřízeno", cls:"done"};
  const r=diffDays(todayISO(), file.deadlineDate);
  if(r<0) return {text:"Po lhůtě", cls:"danger"};
  if(r<=7) return {text:"Nutno řešit", cls:"danger"};
  if(r<=14) return {text:"Blíží se lhůta", cls:"warn"};
  return {text:"V pořádku", cls:"ok"};
}
function visibleCases(){
  const q=els.search.value.trim().toLowerCase();
  const filter=els.filter.value;
  const today=todayISO();
  return cases.filter(file=>{
    const rem=diffDays(today, file.deadlineDate);
    const type=detectCaseType(file.caseNumber);
    const txt=`${file.caseNumber} ${file.title||""} ${file.note||""}`.toLowerCase();
    const matches=!q || txt.includes(q);
    const byFilter=filter==="all" ||
      (filter==="active" && !file.isFinished) ||
      (filter==="urgent" && !file.isFinished && rem>=0 && rem<=7) ||
      (filter==="warning" && !file.isFinished && rem>=0 && rem<=14) ||
      (filter==="overdue" && !file.isFinished && rem<0) ||
      (filter==="finished" && file.isFinished) ||
      (filter==="typeTC" && type==="TC") ||
      (filter==="typePR" && type==="PR") ||
      (filter==="typeCJ" && type==="CJ");
    return matches && byFilter;
  }).sort((a,b)=>{
    if(a.isFinished!==b.isFinished) return Number(a.isFinished)-Number(b.isFinished);
    switch(els.sort.value){
      case "typeAsc": return TYPE_ORDER.indexOf(detectCaseType(a.caseNumber))-TYPE_ORDER.indexOf(detectCaseType(b.caseNumber)) || parseLocalDate(a.deadlineDate)-parseLocalDate(b.deadlineDate);
      case "deadlineDesc": return parseLocalDate(b.deadlineDate)-parseLocalDate(a.deadlineDate);
      case "reviewDesc": return diffDays(b.startDate,todayISO())-diffDays(a.startDate,todayISO());
      case "createdDesc": return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));
      case "titleAsc": return String(a.title||a.caseNumber).localeCompare(String(b.title||b.caseNumber),"cs");
      default: return parseLocalDate(a.deadlineDate)-parseLocalDate(b.deadlineDate);
    }
  });
}
function renderCaseCard(file){
  const today=todayISO(), rem=diffDays(today,file.deadlineDate), review=diffDays(file.startDate,today), status=getStatus(file), t=typeInfo(file);
  const remText=file.isFinished?"uzavřeno":rem<0?`${Math.abs(rem)} dní po lhůtě`:`${rem} dní zbývá`;
  const reminderText=file.isFinished?"—":`T-${file.reminderDays??7} dní`;
  return `<article class="case-card" data-id="${file.id}">
    <div class="case-main"><div><div class="case-number">${escapeHtml(file.caseNumber)}</div><div class="case-title">${escapeHtml(file.title||"Bez názvu")}</div></div><div class="badge-stack"><span class="type-badge ${t.code.toLowerCase()}">${t.short}</span><span class="badge ${status.cls}">${status.text}</span></div></div>
    <div class="meta">
      <div><small>Typ spisu</small><strong>${t.label}</strong></div><div><small>Základní lhůta</small><strong>${t.deadlineLabel}</strong></div>
      <div><small>Do konce lhůty</small><strong>${remText}</strong></div><div><small>Prověřováno</small><strong>${Math.max(0,review)} dní</strong></div>
      <div><small>Zahájeno</small><strong>${fmtDate(file.startDate)}</strong></div><div><small>Lhůta do</small><strong>${fmtDate(file.deadlineDate)}</strong></div>
      <div><small>Upozornění</small><strong>${reminderText}</strong></div><div><small>Upraveno</small><strong>${file.updatedAt?new Date(file.updatedAt).toLocaleDateString("cs-CZ"):"—"}</strong></div>
    </div>${file.note?`<div class="note">${escapeHtml(file.note)}</div>`:""}
    <div class="card-actions"><button class="secondary-btn" data-action="edit" data-id="${file.id}">Upravit</button><button class="secondary-btn" data-action="extend" data-months="1" data-id="${file.id}">+1 měsíc</button><button class="secondary-btn" data-action="extend" data-months="2" data-id="${file.id}">+2 měsíce</button><button class="secondary-btn" data-action="finish" data-id="${file.id}">${file.isFinished?"Vrátit mezi aktivní":"Vyřízeno"}</button></div>
  </article>`;
}
function render(){
  if(!unlocked) return;
  const today=todayISO();
  const active=cases.filter(c=>!c.isFinished);
  els.countAll.textContent=active.length;
  els.countUrgent.textContent=active.filter(c=>{const r=diffDays(today,c.deadlineDate); return r>=0&&r<=7;}).length;
  els.countOverdue.textContent=active.filter(c=>diffDays(today,c.deadlineDate)<0).length;
  els.countTC.textContent=active.filter(c=>detectCaseType(c.caseNumber)==="TC").length;
  els.countPR.textContent=active.filter(c=>detectCaseType(c.caseNumber)==="PR").length;
  els.countCJ.textContent=active.filter(c=>detectCaseType(c.caseNumber)==="CJ").length;
  const items=visibleCases();
  els.empty.hidden=items.length>0;
  const grouped = TYPE_ORDER.map(type=>({type, items:items.filter(c=>detectCaseType(c.caseNumber)===type)})).filter(g=>g.items.length);
  els.list.innerHTML=grouped.map(g=>{
    const t=CASE_TYPES[g.type];
    return `<section class="case-section"><div class="section-head"><h2>${t.short} – ${t.label}</h2><span>${g.items.length}</span></div>${g.items.map(renderCaseCard).join("")}</section>`;
  }).join("");
}
function unlock(){
  if(els.welcomePin.value===APP_PIN){
    unlocked=true;
    els.welcomeError.hidden=true;
    els.loginScreen.hidden=true;
    els.loginScreen.style.display="none";
    els.appShell.hidden=false;
    els.appShell.style.display="block";
    window.scrollTo({top:0, behavior:"instant"});
    render();
    setTimeout(()=>{ if(!localStorage.getItem("lhutovnicek.helpSeen")){ els.helpDialog.showModal(); localStorage.setItem("lhutovnicek.helpSeen","1"); } },500);
  }else{ els.welcomeError.hidden=false; els.welcomePin.select(); }
}
function updateTypeHint(){
  const cn=$("caseNumber").value.trim();
  const start=$("startDate").value || todayISO();
  els.caseTypeInfo.textContent = deadlineTextFor(cn);
  els.defaultDeadlineBtn.textContent = `Nastavit základní lhůtu: ${typeInfo(cn).deadlineLabel}`;
  if(!$("caseId").value && start){ $("deadlineDate").value=defaultDeadlineFor(start, cn); }
}
function openNew(){
  els.form.reset(); $("caseId").value=""; $("dialogTitle").textContent="Přidat spis"; $("startDate").value=todayISO(); $("deadlineDate").value=defaultDeadlineFor(todayISO(), ""); $("reminderDays").value=7; els.deleteBtn.hidden=true; updateTypeHint(); els.dialog.showModal();
}
function openEdit(id){ const f=cases.find(c=>c.id===id); if(!f)return; $("caseId").value=f.id; $("caseNumber").value=f.caseNumber; $("caseTitle").value=f.title||""; $("startDate").value=f.startDate; $("deadlineDate").value=f.deadlineDate; $("reminderDays").value=f.reminderDays??7; $("note").value=f.note||""; $("isFinished").checked=!!f.isFinished; $("dialogTitle").textContent="Upravit spis"; els.deleteBtn.hidden=false; updateTypeHint(); els.dialog.showModal(); }
function downloadFile(name, content, type){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
function csvCell(v){ return `"${String(v??"").replaceAll('"','""')}"`; }

els.welcomeUnlockBtn.addEventListener("click", unlock);
els.welcomePin.addEventListener("keydown", e=>{ if(e.key==="Enter") unlock(); });
els.addBtn.addEventListener("click", openNew);
els.closeDialog.addEventListener("click",()=>els.dialog.close());
els.defaultDeadlineBtn.addEventListener("click",()=>{$("deadlineDate").value=defaultDeadlineFor($("startDate").value||todayISO(), $("caseNumber").value);});
els.todayBtn.addEventListener("click",()=>{$("startDate").value=todayISO(); $("deadlineDate").value=defaultDeadlineFor(todayISO(), $("caseNumber").value); updateTypeHint();});
$("caseNumber").addEventListener("input", updateTypeHint);
$("startDate").addEventListener("change",()=>{ if(!$("caseId").value) $("deadlineDate").value=defaultDeadlineFor($("startDate").value, $("caseNumber").value); updateTypeHint(); });
els.search.addEventListener("input",render); els.filter.addEventListener("change",render); els.sort.addEventListener("change",render);
document.querySelectorAll("[data-quick-filter]").forEach(btn=>btn.addEventListener("click",()=>{els.filter.value=btn.dataset.quickFilter; render();}));
els.form.addEventListener("submit", e=>{ e.preventDefault(); const id=$("caseId").value || (crypto.randomUUID?crypto.randomUUID():String(Date.now())); const previous=cases.find(c=>c.id===id); const now=new Date().toISOString(); const cn=$("caseNumber").value.trim(); const data={id, caseNumber:cn, caseType:detectCaseType(cn), title:$("caseTitle").value.trim(), startDate:$("startDate").value, deadlineDate:$("deadlineDate").value, reminderDays:Number($("reminderDays").value||7), note:$("note").value.trim(), isFinished:$("isFinished").checked, createdAt:previous?.createdAt||now, updatedAt:now}; const idx=cases.findIndex(c=>c.id===id); if(idx>=0) cases[idx]=data; else cases.push(data); saveCases(); render(); els.dialog.close(); });
els.deleteBtn.addEventListener("click",()=>{ const id=$("caseId").value; if(confirm("Opravdu smazat tento spis?")){ cases=cases.filter(c=>c.id!==id); saveCases(); render(); els.dialog.close(); } });
els.list.addEventListener("click", e=>{
  const btn=e.target.closest("button[data-action]");
  if(!btn)return;
  const id=btn.dataset.id;
  const f=cases.find(c=>c.id===id);
  if(!f)return;
  if(btn.dataset.action==="edit") openEdit(id);
  if(btn.dataset.action==="extend"){
    f.deadlineDate=addMonthsISO(f.deadlineDate, Number(btn.dataset.months||1));
    f.updatedAt=new Date().toISOString();
    saveCases(); render();
  }
  if(btn.dataset.action==="finish"){
    if(f.isFinished){
      f.isFinished=false;
      f.updatedAt=new Date().toISOString();
      saveCases(); render();
    } else {
      pendingFinishId=id;
      els.finishConfirmTarget.innerHTML=`<strong>${escapeHtml(f.caseNumber)}</strong><br>${escapeHtml(f.title||"Bez názvu")}`;
      els.finishConfirmDialog.showModal();
    }
  }
});

els.closeFinishConfirm.addEventListener("click",()=>{ pendingFinishId=null; els.finishConfirmDialog.close(); });
els.cancelFinishConfirm.addEventListener("click",()=>{ pendingFinishId=null; els.finishConfirmDialog.close(); });
els.confirmFinishBtn.addEventListener("click",()=>{
  const f=cases.find(c=>c.id===pendingFinishId);
  if(f){ f.isFinished=true; f.updatedAt=new Date().toISOString(); saveCases(); render(); }
  pendingFinishId=null;
  els.finishConfirmDialog.close();
});
els.helpBtn.addEventListener("click",()=>els.helpDialog.showModal()); els.closeHelp.addEventListener("click",()=>els.helpDialog.close()); els.okHelp.addEventListener("click",()=>els.helpDialog.close());
els.backupBtn.addEventListener("click",()=>els.backupDialog.showModal()); els.closeBackup.addEventListener("click",()=>els.backupDialog.close());
els.exportJsonBtn.addEventListener("click",()=>downloadFile(`lhutovnicek-zaloha-${todayISO()}.json`, JSON.stringify({version:"2.4",exportedAt:new Date().toISOString(),cases},null,2),"application/json"));
els.exportCsvBtn.addEventListener("click",()=>{ const rows=[["Typ","CJ","Nazev","Zahajeno","Lhuta do","Dni zbyva","Proverovano dni","Stav","Poznamka"],...cases.map(c=>[typeInfo(c).short,c.caseNumber,c.title,c.startDate,c.deadlineDate,diffDays(todayISO(),c.deadlineDate),diffDays(c.startDate,todayISO()),getStatus(c).text,c.note])]; downloadFile(`lhutovnicek-export-${todayISO()}.csv`, rows.map(r=>r.map(csvCell).join(";")).join("\n"),"text/csv;charset=utf-8"); });
els.importJsonBtn.addEventListener("click",()=>els.importInput.click());
els.importInput.addEventListener("change", async()=>{ const file=els.importInput.files[0]; if(!file)return; try{ const parsed=JSON.parse(await file.text()); const imported=Array.isArray(parsed)?parsed:parsed.cases; if(!Array.isArray(imported)) throw new Error(); if(confirm(`Importovat ${imported.length} spisů? Aktuální data budou nahrazena.`)){ cases=imported.map(c=>({...c, caseType: detectCaseType(c.caseNumber)})); saveCases(); render(); els.backupDialog.close(); } }catch{ alert("Soubor se nepodařilo načíst jako zálohu Lhůtovníčku."); } els.importInput.value=""; });
els.wipeBtn.addEventListener("click",()=>{ if(confirm("Opravdu smazat všechny spisy v tomto zařízení?")){ cases=[]; saveCases(); render(); els.backupDialog.close(); } });
els.settingsBtn.addEventListener("click",()=>els.settingsDialog.showModal()); els.closeSettings.addEventListener("click",()=>els.settingsDialog.close());
els.welcomePin.focus();
