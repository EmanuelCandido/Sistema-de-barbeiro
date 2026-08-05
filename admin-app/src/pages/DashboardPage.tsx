import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock3, Copy, Settings, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { Link } from "wouter";
import { BookingModal } from "../components/BookingModal";
import { isBookingOverdue, StatusBadge } from "../components/StatusBadge";
import { money, startOfWeek, todayKey } from "../lib/format";
import { getCalendarDays, getSettings } from "../services/adminData";
import { subscribeWeekBookings } from "../services/bookings";
import type { Booking, Period } from "../types";
import "./DashboardPage.css";

export default function DashboardPage() {
  const [now,setClockTick] = useState(() => Date.now());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [agendaBookings, setAgendaBookings] = useState<Booking[]>([]);
  const selectedAgendaDate = todayKey();
  const [selected, setSelected] = useState<Booking>();
  const [selectedAction, setSelectedAction] = useState<"details"|"payment"|"reschedule"|"cancel">("details");
  const [contact, setContact] = useState<Booking>();
  const [slotInterval, setSlotInterval] = useState(30);
  const [agendaPeriods, setAgendaPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active=true;
    let settingsReady=false;
    let bookingsReady=false;
    const finish=()=>{if(active&&settingsReady&&bookingsReady)setLoading(false)};
    setLoading(true);

    void Promise.all([getSettings(),getCalendarDays(selectedAgendaDate,selectedAgendaDate)]).then(([settings,days])=>{
      if(!active)return;
      setSlotInterval(settings.slotIntervalMinutes);
      const weekday=new Date(`${selectedAgendaDate}T12:00:00Z`).getUTCDay();
      const weekKeys=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
      const exception=days[selectedAgendaDate]?.exception;
      setAgendaPeriods(exception?.closed?[]:exception?.customPeriods?.length?exception.customPeriods:settings.weeklySchedule[weekKeys[weekday]]||[]);
    }).finally(()=>{settingsReady=true;finish()});

    const unsubscribe=subscribeWeekBookings(startOfWeek(),items=>{
      if(!active)return;
      setBookings(items);
      setAgendaBookings(items.filter(booking=>booking.dateKey===selectedAgendaDate));
      bookingsReady=true;
      finish();
    },()=>{
      bookingsReady=true;
      finish();
    });
    return()=>{active=false;unsubscribe()};
  }, [selectedAgendaDate]);

  const today = selectedAgendaDate;
  const todayBookings = bookings.filter((booking) => booking.dateKey === today && booking.status !== "cancelled");
  const agendaTimelineBookings = agendaBookings.filter((booking) => booking.status !== "cancelled");
  const currentTime = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
  const currentMinutes = toMinutes(currentTime);
  const actionableBookings = todayBookings
    .filter((booking) => booking.status === "pending" || booking.status === "confirmed")
    .sort((first, second) => first.startTime.localeCompare(second.startTime));
  const current = actionableBookings.find((booking) => {
    const start=toMinutes(booking.startTime);
    const end=toMinutes(booking.endTime);
    return currentMinutes>=start&&currentMinutes<=end+5;
  });
  const next = current||actionableBookings.find((booking) => toMinutes(booking.startTime)>currentMinutes);
  const timeline=useMemo(()=>buildTimeline(agendaTimelineBookings,agendaPeriods),[agendaTimelineBookings,agendaPeriods]);
  const visibleTimeline=useMemo(()=>futureFreeTimeline(timeline,currentMinutes,slotInterval),[currentMinutes,slotInterval,timeline]);

  const numbers = useMemo(() => ({
    todayCompleted: todayBookings.filter((booking) => booking.status === "completed").reduce((sum, booking) => sum + booking.priceCentsSnapshot, 0),
    weekCompleted: bookings.filter((booking) => booking.status === "completed").reduce((sum, booking) => sum + booking.priceCentsSnapshot, 0),
  }), [bookings, todayBookings]);

  function openBooking(booking:Booking,action:"details"|"payment"|"reschedule"|"cancel"="details"){setSelectedAction(action);setSelected(booking)}

  return (
    <>
      <Header
        eyebrow="VISÃO GERAL"
        title="Bom trabalho hoje"
        text={new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Recife" }).format(new Date())}
        action={<Link className="mobile-settings" href="/configuracoes" aria-label="Abrir configurações" title="Configurações"><Settings size={21} /></Link>}
      />
      {loading ? (
        <div className="loading-card">Carregando resumo…</div>
      ) : (
        <>
          <section className="dashboard-grid">
            <article className="next-card">
              <div className="next-card__header"><p>{current?"Atendimento atual":"Próximo Atendimento"}</p></div>
              {next ? (
                <>
                  <div className="next-card__main"><strong>{next.startTime}</strong><span><button className="next-card__client" onClick={()=>setContact(next)}>{next.clientName}</button><small>{next.serviceNameSnapshot} · {next.durationMinutesSnapshot} min</small></span></div>
                  <div className="next-card__actions next-card__actions--quick">
                    <button className="timeline-action--finish" onClick={()=>openBooking(next,"payment")}><CheckCircle2 size={16}/>Finalizar</button>
                    <button className="timeline-action--reschedule" onClick={()=>openBooking(next,"reschedule")}><span className="action-svg action-svg--reschedule" aria-hidden="true"/>Reagendar</button>
                    <button className="timeline-action--cancel" onClick={()=>openBooking(next,"cancel")}><span className="action-svg action-svg--cancel" aria-hidden="true"/>Cancelar</button>
                  </div>
                </>
              ) : <div className="empty-small">Nenhum atendimento próximo hoje.</div>}
            </article>
            <article className="metric accent dashboard-revenue-today"><span className="metric__icon"><img src="/nav-icons/finance.svg" alt="" /></span><span>Hoje</span><strong>{money(numbers.todayCompleted)}</strong></article>
            <article className="metric appointments-card"><span className="metric__icon"><img src="/nav-icons/services.svg" alt="" /></span><span>Atendimentos hoje</span><div className="appointments-card__summary"><strong>{todayBookings.length}</strong></div></article>
            <article className="metric dashboard-revenue-week"><span className="metric__icon"><img src="/nav-icons/finance.svg" alt="" /></span><span>Semana</span><strong>{money(numbers.weekCompleted)}</strong></article>
            <article className="metric mobile-revenue-card">
              <span className="metric__icon"><img src="/nav-icons/finance.svg" alt="" /></span>
              <span>Faturamento diário</span>
              <div className="mobile-revenue-card__values">
                <div><strong>{money(numbers.todayCompleted)}</strong></div>
              </div>
            </article>
          </section>
          <section className="today-agenda">
            <div className="panel__header"><div><h2>Atendimentos de Hoje</h2></div></div>
            <div className="agenda-timeline">
              {visibleTimeline.map((entry,index)=>entry.kind==="free"?(
                <div className="timeline-entry timeline-entry--free" key={`free-${entry.start}-${index}`}>
                  <div className="timeline-time"><strong>{entry.start}</strong><small>{entry.duration} min</small></div>
                  <i className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-free"><Clock3 size={17}/><strong>Livre</strong></div>
                </div>
              ):(
                <article className={`timeline-entry timeline-entry--${entry.booking.status}`} key={entry.booking.id}>
                  <div className="timeline-time"><strong>{entry.booking.startTime}</strong><small>{entry.booking.durationMinutesSnapshot} min</small></div>
                  <i className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-booking">
                    <div className="timeline-booking__details">
                      <span><button className="timeline-client" onClick={()=>setContact(entry.booking)}>{entry.booking.clientName}</button><small>{entry.booking.serviceNameSnapshot} · {money(entry.booking.priceCentsSnapshot)}</small></span>
                      <StatusBadge status={entry.booking.status} overdue={isBookingOverdue(entry.booking,now)}/>
                    </div>
                    {(entry.booking.status==="pending"||entry.booking.status==="confirmed")&&<div className="timeline-actions">
                      <button className="timeline-action timeline-action--finish" onClick={()=>openBooking(entry.booking,"payment")}><CheckCircle2 size={15}/>Finalizar</button>
                      <button className="timeline-action timeline-action--reschedule" onClick={()=>openBooking(entry.booking,"reschedule")}><span className="action-svg action-svg--reschedule" aria-hidden="true"/>Reagendar</button>
                      <button className="timeline-action timeline-action--cancel" onClick={()=>openBooking(entry.booking,"cancel")}><span className="action-svg action-svg--cancel" aria-hidden="true"/>Cancelar</button>
                    </div>}
                  </div>
                </article>
              ))}
              {!visibleTimeline.length&&<div className="empty-small">Não há horários futuros disponíveis hoje.</div>}
            </div>
          </section>
        </>
      )}
      {selected && (
        <BookingModal
          key={`${selected.id}-${selectedAction}`}
          booking={selected}
          interval={slotInterval}
          initialAction={selectedAction==="details"?undefined:selectedAction}
          close={() => {setSelected(undefined);setSelectedAction("details")}}
          refresh={async () => {
            setSelected(undefined);
            setSelectedAction("details");
          }}
        />
      )}
      {contact&&<ContactDialog booking={contact} close={()=>setContact(undefined)}/>}
    </>
  );
}

export function Header({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><p>{eyebrow}</p><h1>{title}</h1>{text && <span>{text}</span>}</div>{action}</header>;
}

type TimelineEntry={kind:"booking";booking:Booking}|{kind:"free";start:string;duration:number};
function toMinutes(value:string){const[hours,minutes]=value.split(":").map(Number);return hours*60+minutes}
function toTime(value:number){return`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`}
function buildTimeline(bookings:Booking[],periods:Period[]):TimelineEntry[]{
  const sorted=[...bookings].sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const included=new Set<string>();
  const entries:TimelineEntry[]=[];
  for(const period of periods){
    let cursor=toMinutes(period.start);
    const periodEnd=toMinutes(period.end);
    const items=sorted.filter(item=>!included.has(item.id)&&toMinutes(item.startTime)>=cursor&&toMinutes(item.startTime)<periodEnd);
    for(const booking of items){
      const start=toMinutes(booking.startTime);
      if(start>cursor)entries.push({kind:"free",start:toTime(cursor),duration:start-cursor});
      entries.push({kind:"booking",booking}); included.add(booking.id);
      cursor=Math.max(cursor,toMinutes(booking.endTime));
    }
    if(cursor<periodEnd)entries.push({kind:"free",start:toTime(cursor),duration:periodEnd-cursor});
  }
  sorted.filter(item=>!included.has(item.id)).forEach(booking=>entries.push({kind:"booking",booking}));
  return entries.sort((a,b)=>(a.kind==="booking"?a.booking.startTime:a.start).localeCompare(b.kind==="booking"?b.booking.startTime:b.start));
}

function futureFreeTimeline(timeline:TimelineEntry[],currentMinutes:number,interval:number):TimelineEntry[]{
  const entries:TimelineEntry[]=[];
  for(const entry of timeline){
    if(entry.kind==="booking"){entries.push(entry);continue}
    const start=toMinutes(entry.start);
    const end=start+entry.duration;
    if(end<=currentMinutes)continue;
    if(start>=currentMinutes){entries.push(entry);continue}
    const futureStart=Math.ceil(currentMinutes/interval)*interval;
    if(futureStart<end)entries.push({kind:"free",start:toTime(futureStart),duration:end-futureStart});
  }
  return entries;
}

function ContactDialog({booking,close}:{booking:Booking;close:()=>void}){
  const[copied,setCopied]=useState(false);
  async function copy(){
    try{await navigator.clipboard.writeText(booking.clientPhone);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}
    catch{alert(`Número: ${booking.clientPhone}`)}
  }
  return <div className="payment-choice-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}>
    <section className="payment-choice contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <button className="payment-choice__close" onClick={close} aria-label="Fechar"><X size={23}/></button>
      <p>CONTATO DO CLIENTE</p><h3 id="contact-title">{booking.clientName}</h3>
      <span className="contact-dialog__phone">{booking.clientPhone}</span>
      <div className="contact-dialog__actions">
        <button className="secondary" onClick={copy}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?"Copiado":"Copiar número"}</button>
        <a href={`https://wa.me/55${booking.clientPhone}`} target="_blank" rel="noreferrer"><FaWhatsapp size={18}/>Abrir WhatsApp</a>
      </div>
    </section>
  </div>;
}
