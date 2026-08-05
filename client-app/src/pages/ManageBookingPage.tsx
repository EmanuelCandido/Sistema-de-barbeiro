import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { CalendarClock, CircleAlert, Pencil, Scissors, ShieldCheck, Trash2 } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { Calendar } from "../components/Calendar";
import { ServicePicker } from "../components/ServicePicker";
import { MAX_BOOKING_SERVICES } from "../lib/bookingLimits";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import {
  addDays,
  buildAvailableTimes,
  dateKey,
  formatDateLong,
  getPeriods,
  money,
  slotsForRange,
} from "../lib/date";
import {
  cancelCustomerBooking,
  getCustomerBooking,
  rescheduleCustomerBooking,
  SlotUnavailableError,
} from "../services/booking";
import {
  getAvailabilityForDate,
  getActiveServices,
  getCalendarDays,
  getCachedCalendarDay,
  getExceptionForDate,
  getPublicSettings,
  updateCachedCalendarAvailability,
} from "../services/publicData";
import type { CustomerBooking, DateException, PublicSettings, Service } from "../types";

type View = "overview" | "services" | "date" | "time" | "cancel" | "rescheduled" | "cancelled";
type EditMode = "schedule" | "services";

export function ManageBookingPage() {
  const { bookingId = "" } = useParams<{bookingId:string}>();
  const authState = useAnonymousAuth();
  const [booking, setBooking] = useState<CustomerBooking>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [editMode, setEditMode] = useState<EditMode>("schedule");
  const [view, setView] = useState<View>("overview");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [occupied, setOccupied] = useState<Record<string, boolean>>({});
  const [exception, setException] = useState<DateException | null>();
  const [calendarStatus, setCalendarStatus] = useState<Record<string, "available" | "full" | "closed">>({});
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [dateLoading, setDateLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dateRequestId = useRef(0);

  useEffect(() => {
    if (!authState.ready) return;
    Promise.all([getCustomerBooking(bookingId), getPublicSettings(), getActiveServices()])
      .then(([current, publicSettings, activeServices]) => {
        if (!current) throw new Error("Acesso ao agendamento não encontrado neste navegador.");
        setBooking(current);
        setSettings(publicSettings);
        setServices(activeServices);
        const currentIds = current.serviceIds?.length ? current.serviceIds : current.serviceId.split("+");
        setSelectedServiceIds(activeServices.filter((service) => currentIds.includes(service.id)).map((service) => service.id));
      })
      .catch((reason) => setError(
        reason instanceof Error && reason.message.includes("não encontrado")
          ? reason.message
          : "Não foi possível abrir este agendamento neste navegador.",
      ))
      .finally(() => setLoading(false));
  }, [authState.ready, bookingId]);

  const dates = useMemo(
    () => settings ? Array.from({ length: settings.bookingAdvanceDays + 1 }, (_, index) => addDays(new Date(), index)) : [],
    [settings],
  );
  const selectedServices = useMemo(
    () => selectedServiceIds
      .map((id) => services.find((service) => service.id === id))
      .filter((service): service is Service => Boolean(service)),
    [selectedServiceIds, services],
  );
  const selectedDuration = selectedServices.reduce((total, service) => total + service.durationMinutes, 0);
  const currentServiceIds = booking?.serviceIds?.length ? booking.serviceIds : booking?.serviceId.split("+") ?? [];
  const serviceSelectionChanged = selectedServiceIds.join("|") !== currentServiceIds.join("|");
  const targetDuration = editMode === "services" && serviceSelectionChanged
    ? selectedDuration
    : booking?.durationMinutesSnapshot ?? 0;
  const times = useMemo(
    () => selectedDate && settings && booking && targetDuration
      ? buildAvailableTimes(selectedDate, settings, targetDuration, occupied, exception)
      : [],
    [selectedDate, settings, booking, targetDuration, occupied, exception],
  );

  useEffect(() => {
    if (view !== "date" || !settings || !booking || !dates.length) return;
    let active = true;
    setCalendarLoading(true);
    const firstKey = dateKey(dates[0]);
    const lastKey = dateKey(dates[dates.length - 1]);
    getCalendarDays(firstKey, lastKey)
      .then((days) => dates.map((date) => {
        const key = dateKey(date);
        const day = days[key];
        const dayOccupied = { ...(day?.availability.occupiedSlots ?? {}) };
        if (key === booking.dateKey) booking.occupiedSlotKeys.forEach((slot) => { delete dayOccupied[slot]; });
        const dayException = day?.exception ?? null;
        const periods = getPeriods(date, settings, dayException);
        const status: "available" | "full" | "closed" = !periods.length
          ? "closed"
          : buildAvailableTimes(date, settings, targetDuration, dayOccupied, dayException).length
            ? "available"
            : "full";
        return [key, status] as const;
      }))
      .then((entries) => { if (active) setCalendarStatus(Object.fromEntries(entries)); })
      .catch(() => { if (active) setError("Não foi possível verificar as vagas do calendário."); })
      .finally(() => { if (active) setCalendarLoading(false); });
    return () => { active = false; };
  }, [view, settings, booking, dates, targetDuration]);

  async function chooseDate(date: Date) {
    if (!booking) return;
    const requestId = ++dateRequestId.current;
    setSelectedDate(date);
    setSelectedTime("");
    setDateLoading(true);
    setError("");
    try {
      const key = dateKey(date);
      const cached = getCachedCalendarDay(key);
      const [availability, dayException] = await Promise.all([
        getAvailabilityForDate(key),
        cached ? Promise.resolve(cached.exception) : getExceptionForDate(key),
      ]);
      if (requestId !== dateRequestId.current) return;
      const availableSlots = { ...availability.occupiedSlots };
      if (key === booking.dateKey) booking.occupiedSlotKeys.forEach((slot) => { delete availableSlots[slot]; });
      updateCachedCalendarAvailability(key, availability);
      setOccupied(availableSlots);
      setException(dayException);
      setView("time");
    } catch {
      if (requestId === dateRequestId.current) setError("Não foi possível consultar os horários desta data.");
    } finally {
      if (requestId === dateRequestId.current) setDateLoading(false);
    }
  }

  async function reschedule() {
    if (!booking || !selectedDate || !selectedTime) return;
    if (editMode === "services" && !selectedServices.length) {
      setError("Selecione pelo menos um serviço.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await rescheduleCustomerBooking(
        booking.id,
        dateKey(selectedDate),
        selectedTime,
        editMode === "services" && serviceSelectionChanged ? selectedServices : undefined,
      );
      setBooking({
        ...booking,
        ...(result.service ?? {}),
        dateKey: result.dateKey,
        startTime: result.startTime,
        endTime: result.endTime,
        startAt: Timestamp.fromMillis(result.startAtMillis),
        occupiedSlotKeys: result.occupiedSlotKeys ?? (settings
          ? slotsForRange(result.startTime, targetDuration, settings.slotIntervalMinutes)
          : booking.occupiedSlotKeys),
        status: "pending",
      });
      setView("rescheduled");
    } catch (reason) {
      if (reason instanceof SlotUnavailableError) {
        setError("Esse horário acabou de ser reservado. Escolha outro horário disponível.");
        try {
          const availability = await getAvailabilityForDate(dateKey(selectedDate));
          const availableSlots = { ...availability.occupiedSlots };
          if (dateKey(selectedDate) === booking.dateKey) booking.occupiedSlotKeys.forEach((slot) => { delete availableSlots[slot]; });
          setOccupied(availableSlots);
        } catch {
          // Mantém a tela aberta com a última disponibilidade carregada.
        }
      } else {
        setError(reason instanceof Error ? reason.message : "Não foi possível reagendar.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      await cancelCustomerBooking(booking.id);
      setBooking({ ...booking, status: "cancelled" });
      setView("cancelled");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cancelar o agendamento.");
    } finally {
      setBusy(false);
    }
  }

  function toggleService(service: Service) {
    setError("");
    setSelectedServiceIds((current) => {
      if (current.includes(service.id)) return current.filter((id) => id !== service.id);
      if (current.length >= MAX_BOOKING_SERVICES) {
        setError(`Selecione no máximo ${MAX_BOOKING_SERVICES} serviços por agendamento.`);
        return current;
      }
      return [...current, service.id];
    });
    setSelectedDate(undefined);
    setSelectedTime("");
  }

  function beginScheduleEdit() {
    setEditMode("schedule");
    setSelectedDate(undefined);
    setSelectedTime("");
    setError("");
    setView("date");
  }

  function beginServiceEdit() {
    setEditMode("services");
    setSelectedDate(undefined);
    setSelectedTime("");
    setError("");
    setView("services");
  }

  if (authState.error) return <PageState title="Configuração necessária" text={authState.error} />;
  if (loading) return <main className="shell"><div className="skeleton" aria-label="Carregando agendamento" /></main>;
  if (!booking || !settings) return <PageState title="Acesso não encontrado" text={error || "Este agendamento não está disponível neste navegador."} />;

  const manageable = (booking.status === "pending" || booking.status === "confirmed") && booking.startAt.toMillis() > Date.now();
  return <main className="shell">
    <header className="brand"><span className="brand__mark" aria-hidden="true"><Scissors size={22}/></span><div><small>SEU AGENDAMENTO</small><h1>{settings.businessName}</h1></div></header>
    <section className="booking-card manage-booking" aria-busy={busy || dateLoading || calendarLoading}>
      {view === "overview" && <>
        <div className="step">
          <div className="heading"><p>GERENCIAR AGENDAMENTO</p><h2>{manageable ? "Seu horário está reservado" : "Agendamento encerrado"}</h2><span>{manageable ? "Use os lápis para editar os serviços ou o horário." : "Este agendamento não pode mais ser alterado."}</span></div>
          <BookingDetails
            booking={booking}
            editServices={manageable ? beginServiceEdit : undefined}
            editSchedule={manageable ? beginScheduleEdit : undefined}
          />
          {manageable && <div className="manage-actions">
            <button className="button button--danger" onClick={() => { setView("cancel"); setError(""); }}><Trash2 size={17}/>Cancelar agendamento</button>
          </div>}
          <Link className="manage-back-link" href="/">Voltar ao início</Link>
        </div>
      </>}

      {view === "services" && <div className="step">
        <div className="heading"><p>EDITAR AGENDAMENTO</p><h2>Escolha os serviços</h2><span>Adicione, remova ou troque até {MAX_BOOKING_SERVICES} serviços deste atendimento.</span></div>
        <ServicePicker services={services} selectedIds={selectedServiceIds} toggle={toggleService}/>
        <div className="actions">
          <button className="button button--ghost" onClick={() => setView("overview")}>Voltar</button>
          <button className="button button--primary" disabled={!selectedServices.length} onClick={() => setView("date")}>Continuar</button>
        </div>
      </div>}

      {view === "date" && <div className="step">
        <div className="heading"><p>{editMode === "services" ? "EDITAR SERVIÇOS" : "REAGENDAR"}</p><h2>Escolha o dia</h2><span>Seu agendamento atual só muda depois da confirmação.</span></div>
        <Calendar dates={dates} selected={selectedDate} loading={dateLoading} isClosed={(date) => getPeriods(date, settings, null).length === 0} statusByDate={calendarStatus} onSelect={chooseDate}/>
        <div className="actions"><button className="button button--ghost" onClick={() => setView(editMode === "services" ? "services" : "overview")}>Voltar</button></div>
      </div>}

      {view === "time" && <div className="step">
        <div className="heading"><p>{editMode === "services" ? "EDITAR SERVIÇOS" : "REAGENDAR"}</p><h2>Escolha o horário</h2><span>{selectedDate && formatDateLong(dateKey(selectedDate))}</span></div>
        {dateLoading ? <div className="skeleton skeleton--short"/> : times.length
          ? <div className="time-grid">{times.map((time) => <button key={time} className={selectedTime === time ? "is-selected" : ""} onClick={() => setSelectedTime(time)} aria-pressed={selectedTime === time}>{time}</button>)}</div>
          : <InlineState title="Sem horários livres" text="Volte e escolha outro dia."/>}
        <div className="actions">
          <button className="button button--ghost" onClick={() => { setView("date"); setSelectedTime(""); }}>Trocar dia</button>
          <button className="button button--primary" disabled={!selectedTime || busy} onClick={reschedule}>{busy ? "Salvando…" : editMode === "services" ? "Confirmar alterações" : "Confirmar novo horário"}</button>
        </div>
      </div>}

      {view === "cancel" && <div className="step cancel-confirmation">
        <span className="cancel-confirmation__icon" aria-hidden="true"><Trash2 size={27}/></span>
        <div className="heading"><p>CANCELAR AGENDAMENTO</p><h2>Deseja mesmo cancelar?</h2><span>O horário será liberado para outra pessoa e esta ação não poderá ser desfeita por aqui.</span></div>
        <BookingDetails booking={booking}/>
        <div className="actions">
          <button className="button button--ghost" disabled={busy} onClick={() => setView("overview")}>Manter agendamento</button>
          <button className="button button--danger" disabled={busy} onClick={cancelBooking}>{busy ? "Cancelando…" : "Sim, cancelar"}</button>
        </div>
      </div>}

      {view === "rescheduled" && <ResultState icon={<CalendarClock size={30}/>} eyebrow="AGENDAMENTO ATUALIZADO" title="Novo horário confirmado" text="A barbearia verá a alteração na agenda." booking={booking}/>}
      {view === "cancelled" && <ResultState icon={<Trash2 size={29}/>} eyebrow="AGENDAMENTO CANCELADO" title="Seu horário foi cancelado" text="O horário já foi liberado na agenda."/>}
      {error && <p className="alert" role="alert">{error}</p>}
    </section>
    <p className="secure-note"><ShieldCheck size={15} aria-hidden="true"/> O acesso é protegido pela sessão salva neste navegador; o código da página não autoriza alterações sozinho.</p>
  </main>;
}

function BookingDetails({
  booking,
  editServices,
  editSchedule,
}: {
  booking: CustomerBooking;
  editServices?: () => void;
  editSchedule?: () => void;
}) {
  return <dl className="review">
    <div className={editServices ? "review__row" : undefined}><span><dt>Serviços</dt><dd>{booking.serviceNameSnapshot}<small>{booking.durationMinutesSnapshot} minutos · {money(booking.priceCentsSnapshot)}</small></dd></span>{editServices && <ReviewEditButton label="Editar serviços" onClick={editServices}/>}</div>
    <div className={editSchedule ? "review__row" : undefined}><span><dt>Data e horário</dt><dd>{formatDateLong(booking.dateKey)}<small>{booking.startTime} às {booking.endTime}</small></dd></span>{editSchedule && <ReviewEditButton label="Editar data e horário" onClick={editSchedule}/>}</div>
    <div><dt>Cliente</dt><dd>{booking.clientName}</dd></div>
  </dl>;
}

function ReviewEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="review__edit" onClick={onClick} aria-label={label} title={label}><Pencil size={16} aria-hidden="true"/></button>;
}

function ResultState({ icon, eyebrow, title, text, booking }: { icon: React.ReactNode; eyebrow: string; title: string; text: string; booking?: CustomerBooking }) {
  return <div className="step manage-result">
    <span className="manage-result__icon" aria-hidden="true">{icon}</span>
    <div className="heading"><p>{eyebrow}</p><h2>{title}</h2><span>{text}</span></div>
    {booking && <BookingDetails booking={booking}/>}
    <Link className="button button--primary" href="/">Voltar ao início</Link>
  </div>;
}

function PageState({ title, text }: { title: string; text: string }) {
  return <main className="shell"><section className="booking-card"><div className="empty"><span aria-hidden="true"><ShieldCheck size={28}/></span><h1>{title}</h1><p>{text}</p><Link className="button button--primary" href="/">Voltar ao início</Link></div></section></main>;
}

function InlineState({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span aria-hidden="true"><CircleAlert size={28}/></span><h3>{title}</h3><p>{text}</p></div>;
}
