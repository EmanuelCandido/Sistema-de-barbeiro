import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Header } from "./DashboardPage";
import { getExceptions, getSettings, removeException, saveException, saveSettings } from "../services/adminData";
import { adminMutationError } from "../lib/adminError";
import type { DateException, Period, PublicSettings } from "../types";
import "./SchedulePage.css";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const labels = { monday:"Segunda", tuesday:"Terça", wednesday:"Quarta", thursday:"Quinta", friday:"Sexta", saturday:"Sábado", sunday:"Domingo" };
type WeekDay=typeof days[number];

export default function SchedulePage() {
  const [settings, setSettings] = useState<PublicSettings>();
  const [exceptions, setExceptions] = useState<DateException[]>([]);
  const [specialDate, setSpecialDate] = useState("");
  const [closed, setClosed] = useState(true);
  const [reason, setReason] = useState("");
  const [specialPeriods, setSpecialPeriods] = useState<Period[]>([]);
  const [exceptionSaving, setExceptionSaving] = useState(false);
  const [exceptionError, setExceptionError] = useState("");
  const [exceptionSaved, setExceptionSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copyingDay, setCopyingDay] = useState<WeekDay|null>(null);
  useEffect(() => { Promise.all([getSettings(), getExceptions()]).then(([config, items]) => { setSettings(config); setExceptions(items); }); }, []);
  if (!settings) return <div className="loading-card">Carregando horários…</div>;

  function update(day:string, index:number, period:Period) {
    setSaved(false); setSaveError("");
    setSettings(s => s && ({ ...s, weeklySchedule:{ ...s.weeklySchedule, [day]:(s.weeklySchedule[day]||[]).map((item,i) => i===index ? period : item) } }));
  }
  function add(day:string) {
    const periods=settings!.weeklySchedule[day]||[];
    if(periods.length>=3){setSaveError("Cada dia pode ter no máximo três períodos de atendimento.");return;}
    setSaved(false); setSaveError(""); setCopyingDay(null);
    setSettings(s => s && ({ ...s, weeklySchedule:{ ...s.weeklySchedule, [day]:[...(s.weeklySchedule[day]||[]), {start:"08:00",end:"18:00"}] } }));
  }
  function remove(day:string, index:number) {
    setSaved(false); setSaveError("");
    setSettings(s => s && ({ ...s, weeklySchedule:{ ...s.weeklySchedule, [day]:(s.weeklySchedule[day]||[]).filter((_,i)=>i!==index) } }));
  }
  function copySchedule(target:WeekDay,source:WeekDay) {
    const periods=settings!.weeklySchedule[source]||[];
    if(!periods.length)return;
    setSettings(current=>current&&({
      ...current,
      weeklySchedule:{
        ...current.weeklySchedule,
        [target]:periods.map(period=>({...period})),
      },
    }));
    setSaved(false);setSaveError("");setCopyingDay(null);
  }
  async function save() {
    const validation=validateSchedule(settings!.weeklySchedule);
    if(validation){setSaved(false);setSaveError(validation);return;}
    setSaving(true); setSaved(false); setSaveError("");
    try{
      await saveSettings(settings!);
      setSettings(await getSettings());
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    }catch(reason){
      console.error("Falha ao salvar horários",reason);
      setSaveError(adminMutationError(reason,"Não foi possível salvar os horários."));
    }finally{setSaving(false);}
  }
  async function addException() {
    if (!specialDate) return;
    const validation=closed?"":validatePeriods(specialPeriods,"Os horários especiais");
    if(validation){setExceptionError(validation);return;}
    setExceptionSaving(true);setExceptionError("");setExceptionSaved(false);
    try{
      await saveException(specialDate, { closed, ...(closed ? {} : {customPeriods:specialPeriods}), reason });
      setExceptions(await getExceptions()); setSpecialDate(""); setReason(""); setSpecialPeriods([]); setClosed(true);setExceptionSaved(true);
      setTimeout(()=>setExceptionSaved(false),2500);
    }catch(reason){
      console.error("Falha ao salvar exceção",reason);
      setExceptionError(adminMutationError(reason,"Não foi possível salvar a exceção."));
    }finally{setExceptionSaving(false);}
  }
  async function deleteException(key:string) {
    setExceptionError("");setExceptionSaved(false);
    try{await removeException(key);setExceptions(await getExceptions());}
    catch(reason){console.error("Falha ao remover exceção",reason);setExceptionError(adminMutationError(reason,"Não foi possível remover a exceção."));}
  }

  return <>
    <Header eyebrow="DISPONIBILIDADE" title="Horários de atendimento" text="Use mais de um período para representar o intervalo de almoço." />
    <section className="panel schedule">{days.map(day => {
      const periods=settings.weeklySchedule[day]||[];
      const sourceDays=days.filter(source=>source!==day&&(settings.weeklySchedule[source]||[]).length);
      return <article key={day}>
        <header><div><strong>{labels[day]}</strong><small>{periods.length ? "Aberto" : "Fechado"}</small></div><button onClick={()=>add(day)}>+ Período</button></header>
        {periods.map((period,index) => <div className="period" key={index}>
          <label>Abre<input type="time" value={period.start} onChange={e=>update(day,index,{...period,start:e.target.value})}/></label><span>até</span>
          <label>Fecha<input type="time" value={period.end} onChange={e=>update(day,index,{...period,end:e.target.value})}/></label>
          <button aria-label="Remover período" title="Remover período" onClick={()=>remove(day,index)}><X size={23}/></button>
        </div>)}
        {!periods.length&&<div className="schedule-copy">
          <button type="button" className="schedule-copy__toggle" aria-expanded={copyingDay===day} onClick={()=>setCopyingDay(current=>current===day?null:day)}>Copiar horários de outro dia</button>
          {copyingDay===day&&(sourceDays.length
            ?<div className="schedule-copy__options" role="group" aria-label={`Copiar horários para ${labels[day]}`}>{sourceDays.map(source=><button type="button" key={source} onClick={()=>copySchedule(day,source)}>{labels[source]}</button>)}</div>
            :<small className="schedule-copy__empty">Cadastre horários em outro dia primeiro.</small>)}
        </div>}
      </article>;
    })}</section>
    <div className="schedule-save-area">
      {saved && <p className="success-message" role="status">Horários salvos.</p>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      <div className="page-bottom-action"><button type="button" className="primary compact pill-primary" disabled={saving} onClick={save}>{saving?"Salvando…":"Salvar alterações"}</button></div>
    </div>

    <section className="panel exceptions">
      <div className="panel__header"><div><p>EXCEÇÕES</p><h2>Bloqueios e horários especiais</h2></div></div>
      <div className="exception-form">
        <label>Data<input type="date" value={specialDate} onChange={e=>{setSpecialDate(e.target.value);setExceptionError("");}}/></label>
        <label className="check"><input type="checkbox" checked={closed} onChange={e=>{setClosed(e.target.checked);setExceptionError("");}}/> Dia fechado</label>
        <label>Motivo opcional<input maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {!closed && <div className="special-periods">{specialPeriods.map((period,index)=><div className="period" key={index}><input aria-label="Início" type="time" value={period.start} onChange={e=>{setExceptionError("");setSpecialPeriods(items=>items.map((item,i)=>i===index?{...item,start:e.target.value}:item));}}/><span>até</span><input aria-label="Fim" type="time" value={period.end} onChange={e=>{setExceptionError("");setSpecialPeriods(items=>items.map((item,i)=>i===index?{...item,end:e.target.value}:item));}}/><button type="button" aria-label="Remover período especial" title="Remover período" onClick={()=>setSpecialPeriods(items=>items.filter((_,i)=>i!==index))}><X size={23}/></button></div>)}<button type="button" className="secondary" disabled={specialPeriods.length>=3} onClick={()=>setSpecialPeriods(items=>items.length<3?[...items,{start:"08:00",end:"12:00"}]:items)}>+ Período especial</button></div>}
        {exceptionError&&<p className="form-error" role="alert">{exceptionError}</p>}
        {exceptionSaved&&<p className="success-message" role="status">Exceção salva.</p>}
        <button type="button" className="primary compact" disabled={exceptionSaving||!specialDate || (!closed && !specialPeriods.length)} onClick={addException}>{exceptionSaving?"Salvando…":"Adicionar exceção"}</button>
      </div>
      <div className="exception-list">{exceptions.map(item=><article key={item.id}><div><strong>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",dateStyle:"long"}).format(new Date(`${item.id}T12:00:00Z`))}</strong><small>{item.closed ? "Fechado" : item.customPeriods?.map(p=>`${p.start}–${p.end}`).join(", ")}{item.reason ? ` · ${item.reason}` : ""}</small></div><button className="text-danger" onClick={()=>deleteException(item.id)}>Remover</button></article>)}{!exceptions.length&&<p className="empty-row">Nenhuma exceção cadastrada.</p>}</div>
    </section>
  </>;
}

function validateSchedule(schedule:PublicSettings["weeklySchedule"]){
  for(const day of days){
    const periods=schedule[day]||[];
    if(periods.length>3)return `${labels[day]} tem mais de três períodos.`;
    const validation=periods.length?validatePeriods(periods,`Os períodos de ${labels[day]}`):"";
    if(validation)return validation;
  }
  return "";
}

function validatePeriods(periods:Period[],label:string){
  const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
  if(periods.length<1)return `${label} precisam ter pelo menos um período.`;
  if(periods.length>3)return `${label} não podem ter mais de três períodos.`;
  for(let index=0;index<periods.length;index++){
    const period=periods[index];
    if(!timePattern.test(period.start)||!timePattern.test(period.end)||period.start>=period.end)return `${label} precisam ter horários válidos e abertura anterior ao fechamento.`;
    if(index>0&&period.start<periods[index-1].end)return `${label} estão sobrepostos ou fora de ordem.`;
  }
  return "";
}
