import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "../lib/format";
import "./RescheduleCalendar.css";

type CalendarStatus = "available" | "full" | "closed";

export function RescheduleCalendar({
  dates,
  selected,
  loading,
  statusByDate,
  onSelect,
}: {
  dates: Date[];
  selected?: Date;
  loading: boolean;
  statusByDate: Record<string, CalendarStatus>;
  onSelect: (date: Date) => void;
}) {
  const firstAllowed = dates[0];
  const lastAllowed = dates[dates.length - 1];
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selected || firstAllowed || new Date()));
  useEffect(() => { if (selected) setVisibleMonth(monthStart(selected)); }, [selected]);

  const allowedKeys = useMemo(() => new Set(dates.map(dateKey)), [dates]);
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const firstMonth = firstAllowed ? monthStart(firstAllowed) : visibleMonth;
  const lastMonth = lastAllowed ? monthStart(lastAllowed) : visibleMonth;
  const canGoBack = monthNumber(visibleMonth) > monthNumber(firstMonth);
  const canGoForward = monthNumber(visibleMonth) < monthNumber(lastMonth);

  return <div className="reschedule-calendar" aria-label="Escolha uma nova data">
    <header>
      <div><CalendarDays size={17}/><strong>{monthLabel(visibleMonth)}</strong></div>
      <nav aria-label="Navegar entre meses">
        <button type="button" disabled={!canGoBack||loading} onClick={()=>setVisibleMonth(current=>new Date(current.getFullYear(),current.getMonth()-1,1,12))} aria-label="Mês anterior"><ChevronLeft size={18}/></button>
        <button type="button" disabled={!canGoForward||loading} onClick={()=>setVisibleMonth(current=>new Date(current.getFullYear(),current.getMonth()+1,1,12))} aria-label="Próximo mês"><ChevronRight size={18}/></button>
      </nav>
    </header>
    <div className="reschedule-calendar__weekdays" aria-hidden="true">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(day=><span key={day}>{day}</span>)}</div>
    <div className="reschedule-calendar__grid">
      {cells.map((date,index)=>{
        if(!date)return <span key={`empty-${index}`}/>;
        const key=dateKey(date);
        const status=statusByDate[key];
        const allowed=allowedKeys.has(key);
        const unavailable=!allowed||status==="closed"||status==="full";
        const isSelected=selected?dateKey(selected)===key:false;
        return <button type="button" key={key} disabled={loading||unavailable} className={isSelected?"is-selected":""} aria-pressed={isSelected} onClick={()=>onSelect(date)}>
          <span>{date.getDate()}</span>
          {allowed&&status==="available"&&<i aria-hidden="true"/>}
        </button>;
      })}
    </div>
    <footer><span><i/>Disponível</span><span><i/>Indisponível</span></footer>
  </div>;
}

function monthStart(date:Date){return new Date(date.getFullYear(),date.getMonth(),1,12)}
function monthNumber(date:Date){return date.getFullYear()*12+date.getMonth()}
function monthLabel(date:Date){const value=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(date);return value.charAt(0).toUpperCase()+value.slice(1)}
function calendarCells(month:Date){
  const firstWeekDay=(month.getDay()+6)%7;
  const totalDays=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const cells:Array<Date|null>=Array.from({length:firstWeekDay},()=>null);
  for(let day=1;day<=totalDays;day++)cells.push(new Date(month.getFullYear(),month.getMonth(),day,12));
  while(cells.length%7)cells.push(null);
  return cells;
}
