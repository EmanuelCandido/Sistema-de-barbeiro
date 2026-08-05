import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "../lib/date";
import "./Calendar.css";

type CalendarProps = {
  dates: Date[];
  selected?: Date;
  loading: boolean;
  isClosed: (date: Date) => boolean;
  statusByDate: Record<string,"available"|"full"|"closed">;
  onSelect: (date: Date) => void;
};

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function Calendar({ dates, selected, loading, isClosed, statusByDate, onSelect }: CalendarProps) {
  const firstAllowed = dates[0];
  const lastAllowed = dates[dates.length - 1];
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selected || firstAllowed || new Date()));

  const allowedKeys = useMemo(() => new Set(dates.map(dateKey)), [dates]);
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const firstMonth = firstAllowed ? monthStart(firstAllowed) : visibleMonth;
  const lastMonth = lastAllowed ? monthStart(lastAllowed) : visibleMonth;
  const canGoBack = monthNumber(visibleMonth) > monthNumber(firstMonth);
  const canGoForward = monthNumber(visibleMonth) < monthNumber(lastMonth);

  function changeMonth(amount: number) {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  return (
    <div className="calendar" aria-label="Escolha uma data" aria-busy={loading}>
      <header className="calendar__header">
        <div><CalendarDays size={18} aria-hidden="true" /><strong>{monthLabel(visibleMonth)}</strong></div>
        <nav aria-label="Navegar entre meses">
          <button type="button" disabled={!canGoBack} onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={19} /></button>
          <button type="button" disabled={!canGoForward} onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight size={19} /></button>
        </nav>
      </header>
      <div className="calendar__weekdays" aria-hidden="true">
        {weekDays.map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar__grid">
        {cells.map((date, index) => {
          if (!date) return <span className="calendar__empty" key={`empty-${index}`} />;
          const key = dateKey(date);
          const allowed = allowedKeys.has(key);
          const status=statusByDate[key];
          const closed = allowed && (status==="closed"||(!status&&isClosed(date)));
          const full=allowed&&status==="full";
          const available=allowed&&status==="available";
          const selectedDay = selected ? dateKey(selected) === key : false;
          return (
            <button
              type="button"
              key={key}
              disabled={!allowed || closed || full}
              className={`${selectedDay ? "is-selected" : ""} ${closed ? "is-closed" : ""}`}
              onClick={() => onSelect(date)}
              aria-label={`${date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}${closed ? ", fechado" : full ? ", sem vagas" : available ? ", disponível" : ""}`}
              aria-pressed={selectedDay}
            >
              <span>{date.getDate()}</span>
              {closed && <small>Fechado</small>}
              {!closed&&available&&<i className="calendar__status calendar__status--available" aria-hidden="true"/>}
              {!closed&&full&&<i className="calendar__status calendar__status--full" aria-hidden="true"/>}
            </button>
          );
        })}
      </div>
      <footer><span><i />Disponível</span><span><i />Cheio</span></footer>
    </div>
  );
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function monthNumber(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function monthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function calendarCells(month: Date) {
  const firstWeekDay = (month.getDay() + 6) % 7;
  const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const values: Array<Date | null> = Array.from({ length: firstWeekDay }, () => null);
  for (let day = 1; day <= totalDays; day += 1) values.push(new Date(month.getFullYear(), month.getMonth(), day, 12));
  while (values.length % 7) values.push(null);
  return values;
}
