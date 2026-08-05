import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { BookingModal } from "../components/BookingModal";
import { isBookingOverdue, StatusBadge } from "../components/StatusBadge";
import { addDays, dateKey, dateLong, money, startOfWeek } from "../lib/format";
import { getSettings } from "../services/adminData";
import { subscribeWeekBookings } from "../services/bookings";
import type { Booking } from "../types";
import { Header } from "./DashboardPage";
import "./AgendaPage.css";

type StatusFilter="all"|"pending"|"completed"|"cancelled";

export default function AgendaPage() {
  const [week, setWeek] = useState(startOfWeek());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotInterval, setSlotInterval] = useState(30);
  const [selected, setSelected] = useState<Booking>();
  const [loading, setLoading] = useState(true);
  const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");
  const [now,setNow]=useState(()=>Date.now());
  const statusFilterCard=useRef<HTMLDetailsElement>(null);

  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),30_000);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(() => {
    void getSettings().then(settings=>setSlotInterval(settings.slotIntervalMinutes));
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubscribe=subscribeWeekBookings(week,items=>{
      setBookings(items);
      setLoading(false);
    },()=>setLoading(false));
    return unsubscribe;
  }, [week]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => dateKey(addDays(week, index))),
    [week],
  );
  const filteredBookings=useMemo(()=>bookings.filter(booking=>{
    if(statusFilter==="all")return true;
    if(statusFilter==="pending")return booking.status==="pending"||booking.status==="confirmed";
    return booking.status===statusFilter;
  }),[bookings,statusFilter]);
  const statusOptions:{key:StatusFilter;label:string}[]=[
    {key:"all",label:"Todos"},
    {key:"pending",label:"Pendentes"},
    {key:"completed",label:"Concluídos"},
    {key:"cancelled",label:"Cancelados"},
  ];
  const statusCounts=useMemo(()=>({
    all:bookings.length,
    pending:bookings.filter(booking=>booking.status==="pending"||booking.status==="confirmed").length,
    completed:bookings.filter(booking=>booking.status==="completed").length,
    cancelled:bookings.filter(booking=>booking.status==="cancelled").length,
  }),[bookings]);
  const selectedStatusOption=statusOptions.find(option=>option.key===statusFilter)!;

  function selectStatusFilter(filter:StatusFilter){
    setStatusFilter(filter);
    statusFilterCard.current?.removeAttribute("open");
  }

  return (
    <>
      <Header
        eyebrow="AGENDA"
        title="Semana de atendimentos"
        text={`${dateLong(days[0])} — ${dateLong(days[6])}`}
      />
      <div className="week-controls">
        <button onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={19} strokeWidth={2}/><span>Semana Anterior</span></button>
        <button onClick={() => setWeek(startOfWeek())}><span>Hoje</span></button>
        <button onClick={() => setWeek(addDays(week, 7))}><span>Próxima Semana</span><ChevronRight size={19} strokeWidth={2}/></button>
      </div>
      <details className="agenda-filter-card" ref={statusFilterCard}>
        <summary aria-label={`Filtro atual: ${selectedStatusOption.label}`}>
          <span className="agenda-filter-card__icon" aria-hidden="true" />
          <span className="agenda-filter-card__copy"><small>FILTRAR STATUS</small><strong>{selectedStatusOption.label}</strong></span>
          <span className="agenda-filter-card__count">{statusCounts[statusFilter]}</span>
          <ChevronDown className="agenda-filter-card__chevron" size={18} aria-hidden="true" />
        </summary>
        <div className="agenda-filter-card__options" role="group" aria-label="Filtrar agenda por status">
          {statusOptions.map(option=><button type="button" key={option.key} className={statusFilter===option.key?"is-selected":""} aria-pressed={statusFilter===option.key} onClick={()=>selectStatusFilter(option.key)}>
            <span><strong>{option.label}</strong><small>{statusCounts[option.key]} {statusCounts[option.key]===1?"agendamento":"agendamentos"}</small></span>
            {statusFilter===option.key&&<Check size={17} strokeWidth={2.5} aria-hidden="true" />}
          </button>)}
        </div>
      </details>
      {loading ? (
        <div className="loading-card">Carregando agenda…</div>
      ) : (
        <div className="week-list">
          {days.map((day) => (
            <section key={day}>
              <header>
                <span>{dateLong(day)}</span>
                <small>{filteredBookings.filter((booking) => booking.dateKey === day).length} atendimentos</small>
              </header>
              {filteredBookings.filter((booking) => booking.dateKey === day).map((item) => (
                <button className="appointment appointment--button" key={item.id} onClick={() => setSelected(item)}>
                  <time>{item.startTime}</time>
                  <span><strong>{item.clientName}</strong><small>{item.serviceNameSnapshot} · {item.durationMinutesSnapshot} min</small></span>
                  <b>{money(item.priceCentsSnapshot)}</b>
                  <StatusBadge status={item.status} overdue={isBookingOverdue(item,now)} />
                </button>
              ))}
              {!filteredBookings.some((booking) => booking.dateKey === day) && <p className="empty-row">Sem atendimentos neste filtro</p>}
            </section>
          ))}
        </div>
      )}
      {selected && (
        <BookingModal
          booking={selected}
          interval={slotInterval}
          close={() => setSelected(undefined)}
          refresh={async () => {
            setSelected(undefined);
          }}
        />
      )}
    </>
  );
}
