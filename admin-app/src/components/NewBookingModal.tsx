import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Calendar, CheckCircle2, X } from "lucide-react";
import { buildAvailableTimes, getPeriods } from "../lib/availability";
import { adminMutationError } from "../lib/adminError";
import { addDays, dateKey } from "../lib/format";
import { getCalendarDays, getServices, getSettings } from "../services/adminData";
import { createAdminBooking, createWalkInBooking } from "../services/bookings";
import type { DateException, PublicSettings, Service } from "../types";
import { ServicePicker } from "./BookingModal";
import { RescheduleCalendar } from "./RescheduleCalendar";
import "./BookingModal.css";

type NewBookingMode="schedule"|"walkin";

export function NewBookingChoice({close,select}:{close:()=>void;select:(mode:NewBookingMode)=>void}){
  return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}>
    <section className="payment-choice new-booking-choice" role="dialog" aria-modal="true" aria-labelledby="new-booking-choice-title">
      <button type="button" className="payment-choice__close" onClick={close} aria-label="Fechar"><X size={23}/></button>
      <p>NOVO ATENDIMENTO</p><h3 id="new-booking-choice-title">Como deseja adicionar?</h3>
      <span className="payment-choice__hint">Escolha um encaixe já realizado ou reserve um horário na agenda.</span>
      <div className="new-booking-choice__options">
        <button type="button" onClick={()=>select("walkin")}>
          <CheckCircle2 size={24} aria-hidden="true"/><span><strong>Encaixar</strong><small>Registrar serviços feitos como concluídos</small></span>
        </button>
        <button type="button" onClick={()=>select("schedule")}>
          <Calendar size={24} aria-hidden="true"/><span><strong>Agendar</strong><small>Escolher uma data e um horário disponíveis</small></span>
        </button>
      </div>
    </section>
  </div>;
}

export function NewBookingModal({close,onCreated,mode="schedule"}:{close:()=>void;onCreated:()=>void;mode?:NewBookingMode}){
  const[name,setName]=useState("");
  const[phone,setPhone]=useState("");
  const[note,setNote]=useState("");
  const[services,setServices]=useState<Service[]>([]);
  const[selectedServiceIds,setSelectedServiceIds]=useState<string[]>([]);
  const[settings,setSettings]=useState<PublicSettings>();
  const[days,setDays]=useState<Record<string,{occupied:Record<string,boolean>;exception:DateException|null}>>({});
  const[selectedDateKey,setSelectedDateKey]=useState("");
  const[selectedTime,setSelectedTime]=useState("");
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    if(mode==="walkin"){
      void getServices().then(items=>{
        if(active)setServices(items.filter(service=>service.active));
      }).catch(()=>active&&setError("Não foi possível carregar os serviços."))
        .finally(()=>active&&setLoading(false));
      return()=>{active=false};
    }
    void Promise.all([getSettings(),getServices()]).then(async([publicSettings,items])=>{
      const range=Array.from({length:publicSettings.bookingAdvanceDays+1},(_,index)=>addDays(new Date(),index));
      const calendarDays=await getCalendarDays(dateKey(range[0]),dateKey(range[range.length-1]));
      if(!active)return;
      setSettings(publicSettings);
      setServices(items.filter(service=>service.active));
      setDays(Object.fromEntries(range.map(date=>{
        const key=dateKey(date);
        return[key,calendarDays[key]??{occupied:{},exception:null}];
      })));
    }).catch(()=>active&&setError("Não foi possível carregar a agenda."))
      .finally(()=>active&&setLoading(false));
    return()=>{active=false};
  },[mode]);

  const selectedServices=useMemo(()=>selectedServiceIds.map(id=>services.find(service=>service.id===id)).filter((service):service is Service=>Boolean(service)),[selectedServiceIds,services]);
  const duration=selectedServices.reduce((total,service)=>total+service.durationMinutes,0);
  const price=selectedServices.reduce((total,service)=>total+service.priceCents,0);
  const dates=useMemo(()=>settings?Array.from({length:settings.bookingAdvanceDays+1},(_,index)=>addDays(new Date(),index)):[],[settings]);
  const selectedDate=useMemo(()=>selectedDateKey?new Date(`${selectedDateKey}T12:00:00-03:00`):undefined,[selectedDateKey]);
  const statusByDate=useMemo<Record<string,"available"|"full"|"closed">>(()=>{
    if(!settings||!duration)return Object.fromEntries(dates.map(date=>[dateKey(date),"closed"]));
    return Object.fromEntries(dates.map(date=>{
      const key=dateKey(date);
      const day=days[key];
      if(!day)return[key,"closed"];
      const status:"available"|"full"|"closed"=!getPeriods(date,settings,day.exception).length
        ?"closed"
        :buildAvailableTimes(date,settings,duration,day.occupied,day.exception).length?"available":"full";
      return[key,status];
    }));
  },[dates,days,duration,settings]);
  const availableTimes=useMemo(()=>{
    if(!settings||!selectedDate||!duration)return[];
    const day=days[selectedDateKey];
    return day?buildAvailableTimes(selectedDate,settings,duration,day.occupied,day.exception):[];
  },[days,duration,selectedDate,selectedDateKey,settings]);

  function toggleService(id:string){
    setSelectedServiceIds(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
    setSelectedTime("");
    setError("");
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!selectedServices.length){setError("Selecione pelo menos um serviço.");return}
    if(mode==="walkin"){
      if(name.trim().length===1){setError("Informe pelo menos 2 caracteres no nome ou deixe o campo vazio.");return}
      setBusy(true);setError("");
      try{
        await createWalkInBooking({clientName:name,services:selectedServices});
        onCreated();
      }catch(reason){setError(adminMutationError(reason,"Não foi possível registrar o encaixe."))}
      finally{setBusy(false)}
      return;
    }
    const digits=phone.replace(/\D/g,"");
    if(name.trim().length<2||(digits.length>0&&(digits.length<10||digits.length>11))||note.trim().length>300){
      setError("Revise o nome, o WhatsApp opcional com DDD e o limite de 300 caracteres.");return;
    }
    if(!selectedDateKey||!availableTimes.includes(selectedTime)){setError("Escolha um dia e um horário disponíveis.");return}
    setBusy(true);setError("");
    try{
      await createAdminBooking({date:selectedDateKey,startTime:selectedTime,clientName:name,clientPhone:digits,clientNote:note,services:selectedServices});
      onCreated();
    }catch(reason){setError(adminMutationError(reason,"Não foi possível criar o agendamento."))}
    finally{setBusy(false)}
  }

  return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}>
    <form className="payment-choice action-dialog reschedule-dialog new-booking-dialog" onSubmit={submit}>
      <button type="button" className="payment-choice__close" onClick={close} aria-label="Fechar"><X size={23}/></button>
      <p>{mode==="walkin"?"NOVO ENCAIXE":"NOVO AGENDAMENTO"}</p><h3>{mode==="walkin"?"Registrar encaixe":"Agendar atendimento"}</h3><span className="payment-choice__hint">{mode==="walkin"?"Informe apenas os serviços realizados. O atendimento será salvo como concluído.":"Escolha o serviço, o melhor horário e informe os dados do cliente."}</span>
      <div className="new-booking-dialog__section">
        <ServicePicker services={services} selectedIds={selectedServiceIds} loading={loading} toggle={toggleService} duration={duration} price={price}/>
      </div>
      {mode==="schedule"&&<div className="reschedule-picker">
        <label>Escolha o dia</label>
        {!duration&&!loading&&<span className="reschedule-picker__state">Selecione um serviço para consultar os dias disponíveis.</span>}
        <RescheduleCalendar dates={dates} selected={selectedDate} loading={loading||!duration} statusByDate={statusByDate} onSelect={date=>{setSelectedDateKey(dateKey(date));setSelectedTime("");setError("")}}/>
        <label>Horários disponíveis</label>
        {loading?<span className="reschedule-picker__state">Carregando horários…</span>:availableTimes.length?<div className="reschedule-time-grid">
          {availableTimes.map(time=><button type="button" key={time} className={selectedTime===time?"is-selected":""} aria-pressed={selectedTime===time} onClick={()=>{setSelectedTime(time);setError("")}}>{time}</button>)}
        </div>:<span className="reschedule-picker__state">{selectedDateKey?"Nenhum horário disponível para este dia.":"Escolha um dia disponível."}</span>}
      </div>}
      <div className="action-dialog__fields new-booking-dialog__client">
        <label>Nome do cliente {mode==="walkin"&&<small>opcional</small>}<input required={mode==="schedule"} autoComplete="name" maxLength={80} value={name} onChange={event=>setName(event.target.value)}/></label>
        {mode==="schedule"&&<><label>WhatsApp (opcional)<input autoComplete="tel" inputMode="numeric" maxLength={16} value={phone} onChange={event=>setPhone(event.target.value)}/></label>
        <label>Observação <small>opcional</small><textarea maxLength={300} value={note} onChange={event=>setNote(event.target.value)}/><small>{note.length}/300</small></label></>}
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="payment-choice__actions"><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button><button className="primary" disabled={busy||loading||!selectedServices.length||(mode==="schedule"&&!availableTimes.includes(selectedTime))}>{busy?(mode==="walkin"?"Registrando…":"Agendando…"):(mode==="walkin"?"Registrar encaixe":"Confirmar agendamento")}</button></div>
    </form>
  </div>;
}
