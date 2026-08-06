import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, ChevronDown, ChevronRight, CreditCard, QrCode, X, type LucideIcon } from "lucide-react";
import { buildAvailableTimes, getPeriods } from "../lib/availability";
import { MAX_BOOKING_SERVICES } from "../lib/bookingLimits";
import { addDays, dateKey, dateLong, money } from "../lib/format";
import { adminMutationError } from "../lib/adminError";
import { getCalendarDays, getServices, getSettings } from "../services/adminData";
import { changeBookingStatus, completeBooking, editBookingDetails, rescheduleBooking } from "../services/bookings";
import type { Booking, BookingStatus, DateException, PaymentMethod, PublicSettings, Service } from "../types";
import { RescheduleCalendar } from "./RescheduleCalendar";
import { isBookingOverdue, StatusBadge } from "./StatusBadge";
import "./BookingModal.css";

type ModalView="details"|"payment"|"edit"|"reschedule"|"cancel";

export function BookingModal({booking,interval,close,refresh,initialAction}:{
  booking:Booking;
  interval:number;
  close:()=>void;
  refresh:()=>Promise<void>;
  initialAction?:"payment"|"reschedule"|"cancel";
}){
  const initialView:ModalView=initialAction||"details";
  const[view,setView]=useState<ModalView>(initialView);
  const[busy,setBusy]=useState(false);
  const[payment,setPayment]=useState<PaymentMethod>(booking.paymentMethod||"pix");
  const[name,setName]=useState(booking.clientName);
  const[phone,setPhone]=useState(booking.clientPhone);
  const[note,setNote]=useState(booking.clientNote||"");
  const[newDate,setNewDate]=useState(booking.dateKey);
  const[newStart,setNewStart]=useState(booking.startTime);
  const[services,setServices]=useState<Service[]>([]);
  const[selectedServiceIds,setSelectedServiceIds]=useState<string[]>([]);
  const[servicesLoading,setServicesLoading]=useState(initialView==="payment"||initialView==="reschedule");
  const[servicesExpanded,setServicesExpanded]=useState(false);
  const[settings,setSettings]=useState<PublicSettings>();
  const[rescheduleDays,setRescheduleDays]=useState<Record<string,{occupied:Record<string,boolean>;exception:DateException|null}>>({});
  const[rescheduleLoading,setRescheduleLoading]=useState(initialAction==="reschedule");
  const[error,setError]=useState("");

  useEffect(()=>{
    if(view!=="payment"&&view!=="edit"&&view!=="reschedule")return;
    if(services.length){setServicesLoading(false);return}
    let active=true;
    setServicesLoading(true);
    void getServices().then(items=>{
      if(!active)return;
      setServices(items);
      const storedIds=booking.serviceIds?.length?booking.serviceIds:booking.serviceId.split("+");
      const matched=items.filter(service=>storedIds.includes(service.id));
      const fallback=items.find(service=>service.id===booking.serviceId||service.name===booking.serviceNameSnapshot);
      setSelectedServiceIds(matched.length?matched.map(service=>service.id):fallback?[fallback.id]:[]);
    }).catch(()=>setError("Não foi possível carregar os serviços.")).finally(()=>active&&setServicesLoading(false));
    return()=>{active=false};
  },[booking.serviceId,booking.serviceIds,booking.serviceNameSnapshot,services.length,view]);

  useEffect(()=>{
    if(view!=="reschedule")return;
    let active=true;
    setRescheduleLoading(true);
    void getSettings().then(async publicSettings=>{
      const range=Array.from({length:publicSettings.bookingAdvanceDays+1},(_,index)=>addDays(new Date(),index));
      const days=await getCalendarDays(dateKey(range[0]),dateKey(range[range.length-1]));
      if(!active)return;
      setSettings(publicSettings);
      setRescheduleDays(Object.fromEntries(range.map(date=>{
        const key=dateKey(date);
        return[key,days[key]??{occupied:{},exception:null}];
      })));
    }).catch(()=>active&&setError("Não foi possível carregar os horários disponíveis."))
      .finally(()=>active&&setRescheduleLoading(false));
    return()=>{active=false};
  },[view]);

  const selectedServices=useMemo(()=>selectedServiceIds.map(id=>services.find(service=>service.id===id)).filter((service):service is Service=>Boolean(service)),[selectedServiceIds,services]);
  const selectedDuration=selectedServices.reduce((total,service)=>total+service.durationMinutes,0);
  const selectedPrice=selectedServices.reduce((total,service)=>total+service.priceCents,0);
  const rescheduleDates=useMemo(()=>settings?Array.from({length:settings.bookingAdvanceDays+1},(_,index)=>addDays(new Date(),index)):[],[settings]);
  const selectedRescheduleDate=useMemo(()=>newDate?new Date(`${newDate}T12:00:00-03:00`):undefined,[newDate]);
  const rescheduleStatus=useMemo<Record<string,"available"|"full"|"closed">>(()=>{
    if(!settings)return{};
    return Object.fromEntries(rescheduleDates.map(date=>{
      const key=dateKey(date);
      const day=rescheduleDays[key];
      if(!day)return[key,"closed"];
      const occupied=withoutCurrentBooking(day.occupied,key,booking);
      const status:"available"|"full"|"closed"=!getPeriods(date,settings,day.exception).length
        ?"closed"
        :buildAvailableTimes(date,settings,selectedDuration,occupied,day.exception).length?"available":"full";
      return[key,status];
    }));
  },[booking,rescheduleDates,rescheduleDays,selectedDuration,settings]);
  const availableTimes=useMemo(()=>{
    if(!settings||!selectedRescheduleDate||!selectedDuration)return[];
    const day=rescheduleDays[newDate];
    if(!day)return[];
    return buildAvailableTimes(selectedRescheduleDate,settings,selectedDuration,withoutCurrentBooking(day.occupied,newDate,booking),day.exception);
  },[booking,newDate,rescheduleDays,selectedDuration,selectedRescheduleDate,settings]);
  function toggleService(serviceId:string){
    setSelectedServiceIds(current=>current.includes(serviceId)?current.filter(id=>id!==serviceId):[...current,serviceId]);
    if(view==="reschedule")setNewStart("");
  }

  function back(){setError("");initialAction?close():setView("details")}

  async function status(value:BookingStatus,selectedPayment?:PaymentMethod){
    setBusy(true);setError("");
    try{await changeBookingStatus(booking,value,selectedPayment);await refresh()}
    catch(reason){setError(adminMutationError(reason,"Erro ao atualizar o atendimento."))}
    finally{setBusy(false)}
  }

  async function submitEdit(event:FormEvent){
    event.preventDefault();
    const digits=phone.replace(/\D/g,"");
    if(name.trim().length<2||(digits.length>0&&(digits.length<10||digits.length>11))||note.length>300){
      setError("Revise o nome, o WhatsApp opcional com DDD e o limite de 300 caracteres.");return;
    }
    if(!selectedServices.length){setError("Selecione pelo menos um serviço.");return}
    setBusy(true);setError("");
    try{await editBookingDetails(booking,name,digits,note,selectedServices,interval);await refresh()}
    catch(reason){setError(adminMutationError(reason,"Não foi possível editar o agendamento."))}
    finally{setBusy(false)}
  }

  async function submitPayment(){
    if(!selectedServices.length){setError("Selecione pelo menos um serviço realizado.");return}
    setBusy(true);setError("");
    try{await completeBooking(booking,payment,selectedServices,interval);await refresh()}
    catch(reason){setError(adminMutationError(reason,"Não foi possível concluir o atendimento."))}
    finally{setBusy(false)}
  }

  async function submitReschedule(event:FormEvent){
    event.preventDefault();setError("");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(newDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(newStart)){
      setError("Informe uma data e um horário válidos.");return;
    }
    const startAt=new Date(`${newDate}T${newStart}:00-03:00`).getTime();
    if(startAt<=Date.now()){setError("Escolha um horário futuro.");return}
    if(!selectedServices.length){setError("Selecione pelo menos um serviço.");return}
    if(!availableTimes.includes(newStart)){setError("Escolha um dos horários disponíveis.");return}
    const startMinutes=Number(newStart.slice(0,2))*60+Number(newStart.slice(3));
    const endMinutes=startMinutes+selectedDuration;
    if(endMinutes>=24*60){setError("O atendimento ultrapassa o fim do dia.");return}
    const count=Math.ceil(selectedDuration/interval);
    const slots=Array.from({length:count},(_,index)=>toTime(startMinutes+index*interval));
    setBusy(true);
    try{await rescheduleBooking(booking,newDate,newStart,toTime(endMinutes),slots,selectedServices);await refresh()}
    catch(reason){setError(adminMutationError(reason,"Não foi possível reagendar."))}
    finally{setBusy(false)}
  }

  if(view==="payment")return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&back()}>
    <section className="payment-choice" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <button className="payment-choice__close" onClick={back} aria-label="Fechar"><X size={23}/></button>
      <p>CONCLUIR ATENDIMENTO</p><h3 id="payment-title">Como o cliente pagou?</h3>
      <span className="payment-choice__hint">Escolha uma forma de pagamento para registrar a receita.</span>
      <div className="payment-options">
        <PaymentOption label="PIX" Icon={QrCode} value="pix" selected={payment} onSelect={setPayment}/>
        <PaymentOption label="Dinheiro" Icon={Banknote} value="cash" selected={payment} onSelect={setPayment}/>
        <PaymentOption label="Cartão" Icon={CreditCard} value="card" selected={payment} onSelect={setPayment}/>
      </div>
      <div className={`payment-services ${servicesExpanded ? "is-open" : ""}`}>
        <button type="button" className="payment-services__toggle" aria-expanded={servicesExpanded} onClick={()=>setServicesExpanded(current=>!current)}>
          <span><strong>Serviços realizados</strong><small>{selectedServiceIds.length} {selectedServiceIds.length===1?"serviço":"serviços"} · {money(selectedPrice)}</small></span>
          {servicesExpanded?<ChevronDown size={19}/>:<ChevronRight size={19}/>}
        </button>
        {servicesExpanded&&<ServicePicker compact services={services} selectedIds={selectedServiceIds} loading={servicesLoading} toggle={toggleService} duration={selectedDuration} price={selectedPrice}/>}
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="payment-choice__actions"><button className="secondary" disabled={busy} onClick={back}>Voltar</button><button className="primary" disabled={busy||servicesLoading||!selectedServices.length} onClick={submitPayment}>{busy?"Concluindo…":"Confirmar e concluir"}</button></div>
    </section>
  </div>;

  if(view==="edit")return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&back()}>
    <form className="payment-choice action-dialog" onSubmit={submitEdit}>
      <button type="button" className="payment-choice__close" onClick={back} aria-label="Fechar"><X size={23}/></button>
      <p>EDITAR AGENDAMENTO</p><h3>Dados do cliente</h3><span className="payment-choice__hint">Atualize as informações usadas no atendimento.</span>
      <div className="action-dialog__fields">
        <label>Nome<input required maxLength={80} value={name} onChange={event=>setName(event.target.value)}/></label>
        <label>WhatsApp (opcional)<input inputMode="numeric" maxLength={16} value={phone} onChange={event=>setPhone(event.target.value)}/></label>
        <label>Observação<textarea maxLength={300} value={note} onChange={event=>setNote(event.target.value)}/><small>{note.length}/300</small></label>
      </div>
      <ServicePicker services={services} selectedIds={selectedServiceIds} loading={servicesLoading} toggle={toggleService} duration={selectedDuration} price={selectedPrice}/>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="payment-choice__actions"><button type="button" className="secondary" disabled={busy} onClick={back}>Voltar</button><button className="primary" disabled={busy}>{busy?"Salvando…":"Salvar dados"}</button></div>
    </form>
  </div>;

  if(view==="reschedule")return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&back()}>
    <form className="payment-choice action-dialog reschedule-dialog" onSubmit={submitReschedule}>
      <button type="button" className="payment-choice__close" onClick={back} aria-label="Fechar"><X size={23}/></button>
      <p>REAGENDAR</p><h3>Novo dia e horário</h3><span className="payment-choice__hint">O atendimento voltará para o status pendente após ser reagendado.</span>
      <div className="reschedule-picker">
        <label>Escolha o dia</label>
        <RescheduleCalendar dates={rescheduleDates} selected={selectedRescheduleDate} loading={rescheduleLoading} statusByDate={rescheduleStatus} onSelect={date=>{setNewDate(dateKey(date));setNewStart("");setError("")}}/>
        <label>Horários disponíveis</label>
        {rescheduleLoading?<span className="reschedule-picker__state">Carregando horários…</span>:availableTimes.length?<div className="reschedule-time-grid">
          {availableTimes.map(time=><button type="button" key={time} className={newStart===time?"is-selected":""} aria-pressed={newStart===time} onClick={()=>setNewStart(time)}>{time}</button>)}
        </div>:<span className="reschedule-picker__state">Nenhum horário disponível para este dia.</span>}
      </div>
      <div className="reschedule-services"><ServicePicker services={services} selectedIds={selectedServiceIds} loading={servicesLoading} toggle={toggleService} duration={selectedDuration} price={selectedPrice}/></div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="payment-choice__actions"><button type="button" className="secondary" disabled={busy} onClick={back}>Voltar</button><button className="primary" disabled={busy||rescheduleLoading||!availableTimes.includes(newStart)||!selectedServices.length}>{busy?"Reagendando…":"Confirmar reagendamento"}</button></div>
    </form>
  </div>;

  if(view==="cancel")return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&back()}>
    <section className="payment-choice cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
      <button className="payment-choice__close" onClick={back} aria-label="Fechar"><X size={23}/></button>
      <p>CANCELAR ATENDIMENTO</p><h3 id="cancel-title">Tem certeza?</h3>
      <span className="payment-choice__hint">O horário de <strong>{booking.clientName}</strong>, em {dateLong(booking.dateKey)} às {booking.startTime}, será liberado para outro cliente.</span>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="payment-choice__actions"><button className="secondary" disabled={busy} onClick={back}>Voltar</button><button className="danger-primary" disabled={busy} onClick={()=>status("cancelled")}>{busy?"Cancelando…":"Confirmar cancelamento"}</button></div>
    </section>
  </div>;

  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button className="modal__close" onClick={close} aria-label="Fechar"><X size={24}/></button>
      <p>DETALHES DO AGENDAMENTO</p><h2 id="detail-title">{booking.clientName}</h2><StatusBadge status={booking.status} overdue={isBookingOverdue(booking)}/>
      <dl>
        <div><dt>WhatsApp</dt><dd>{booking.clientPhone?<a href={`https://wa.me/55${booking.clientPhone}`} target="_blank" rel="noreferrer">{booking.clientPhone}</a>:"Não informado"}</dd></div>
        <div><dt>Serviço</dt><dd>{booking.serviceNameSnapshot} · {booking.durationMinutesSnapshot} min</dd></div>
        <div><dt>Data</dt><dd>{dateLong(booking.dateKey)}, {booking.startTime}–{booking.endTime}</dd></div>
        <div><dt>Preço registrado</dt><dd>{money(booking.priceCentsSnapshot)}</dd></div>
        <div><dt>Pagamento</dt><dd>{paymentLabel(booking.paymentMethod)}</dd></div>
        {booking.clientNote&&<div><dt>Observação</dt><dd>{booking.clientNote}</dd></div>}
        <div><dt>Criado em</dt><dd>{booking.createdAt?.toDate?.().toLocaleString("pt-BR")||"—"}</dd></div>
      </dl>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="modal__actions modal__actions--details">
        <button className="details-action details-action--cancel" disabled={busy} onClick={()=>setView("cancel")}>Cancelar</button>
        <button className="details-action" disabled={busy} onClick={()=>setView("edit")}>Editar dados</button>
        <button className="details-action details-action--complete" disabled={busy} onClick={()=>setView("payment")}>Concluir</button>
      </div>
    </section>
  </div>;
}

function PaymentOption({label,Icon,value,selected,onSelect}:{label:string;Icon:LucideIcon;value:PaymentMethod;selected:PaymentMethod;onSelect:(value:PaymentMethod)=>void}){
  return <button className={selected===value?"selected":""} aria-pressed={selected===value} onClick={()=>onSelect(value)}><Icon size={24} strokeWidth={1.8}/><span>{label}</span></button>;
}
export function ServicePicker({services,selectedIds,loading,toggle,duration,price,compact=false}:{services:Service[];selectedIds:string[];loading:boolean;toggle:(id:string)=>void;duration:number;price:number;compact?:boolean}){
  const visible=services.filter(service=>service.active||selectedIds.includes(service.id));
  return <fieldset className={`booking-service-picker ${compact?"booking-service-picker--compact":""}`}>
    {!compact&&<legend>Serviços <small>selecione até {MAX_BOOKING_SERVICES}</small></legend>}
    {loading?<span className="booking-service-picker__loading">Carregando serviços…</span>:<div className="booking-service-picker__options">
      {visible.map(service=>{const selected=selectedIds.includes(service.id);return <button type="button" key={service.id} disabled={!selected&&selectedIds.length>=MAX_BOOKING_SERVICES} className={selected?"booking-service-option selected":"booking-service-option"} aria-pressed={selected} onClick={()=>toggle(service.id)}>
        <span><strong>{service.name}</strong>{!compact&&<small>{service.durationMinutes} min</small>}</span><b>{money(service.priceCents)}</b>
      </button>})}
    </div>}
    <div className="booking-service-total"><span>{selectedIds.length} de {MAX_BOOKING_SERVICES} {selectedIds.length===1?"serviço":"serviços"}</span><strong>{compact?money(price):`${duration} min · ${money(price)}`}</strong></div>
  </fieldset>;
}
function paymentLabel(payment?:PaymentMethod){if(payment==="pix")return"PIX";if(payment==="cash")return"Dinheiro";if(payment==="card")return"Cartão";return"Não informado"}
function toTime(value:number){return`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`}
function withoutCurrentBooking(occupied:Record<string,boolean>,date:string,booking:Booking){
  const available={...occupied};
  if(date===booking.dateKey)booking.occupiedSlotKeys.forEach(slot=>delete available[slot]);
  return available;
}
