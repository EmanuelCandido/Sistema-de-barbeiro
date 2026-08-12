import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CalendarClock, CircleAlert, Pencil, Scissors, ShieldCheck } from "lucide-react";
import { addDays, buildAvailableTimes, dateKey, formatDateLong, getPeriods, minutesToTime, money, timeToMinutes } from "../lib/date";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { getActiveServices, getAvailabilityForDate, getCalendarDayForDate, getCalendarDays, getPublicSettings } from "../services/publicData";
import { createBooking, getActiveCustomerBooking, SlotUnavailableError } from "../services/booking";
import type { ClientDetails, CustomerBooking, DateException, PublicSettings, Service } from "../types";
import { Progress } from "../components/Progress";
import { Calendar } from "../components/Calendar";
import { ServicePicker } from "../components/ServicePicker";
import { MAX_BOOKING_SERVICES } from "../lib/bookingLimits";

const initialClient: ClientDetails = { name: "", phone: "", note: "" };
const businessMapsUrl = "https://maps.app.goo.gl/JGVtd689e9CUkFBLA";

export function BookingPage() {
  const [, navigate] = useLocation();
  const authState = useAnonymousAuth();
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<PublicSettings>();
  const [activeBooking, setActiveBooking] = useState<CustomerBooking | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [client, setClient] = useState<ClientDetails>(() => {
    try { return JSON.parse(sessionStorage.getItem("bookingDraft") || "null")?.client ?? initialClient; }
    catch { return initialClient; }
  });
  const [occupied, setOccupied] = useState<Record<string, boolean>>({});
  const [exception, setException] = useState<DateException | null>();
  const [loading, setLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<Record<string,"available"|"full"|"closed">>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<1 | 2 | 4 | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<{
    selectedServices: Service[];
    selectedDate?: Date;
    selectedTime: string;
    client: ClientDetails;
    occupied: Record<string, boolean>;
    exception: DateException | null | undefined;
  } | null>(null);
  const dateRequestId = useRef(0);

  useEffect(() => {
    if (!authState.ready) return;
    Promise.all([getPublicSettings(), getActiveServices(), getActiveCustomerBooking()])
      .then(([publicSettings, activeServices, currentBooking]) => { setSettings(publicSettings); setServices(activeServices); setActiveBooking(currentBooking); })
      .catch(() => setError("Não foi possível carregar a agenda. Verifique sua conexão e tente novamente."))
      .finally(() => setLoading(false));
  }, [authState.ready]);

  useEffect(() => {
    sessionStorage.setItem("bookingDraft", JSON.stringify({ client }));
  }, [client]);

  const dates = useMemo(() => settings ? Array.from({ length: settings.bookingAdvanceDays + 1 }, (_, index) => addDays(new Date(), index)) : [], [settings]);
  const selectedDuration = useMemo(() => selectedServices.reduce((total, service) => total + service.durationMinutes, 0), [selectedServices]);
  const selectedPrice = useMemo(() => selectedServices.reduce((total, service) => total + service.priceCents, 0), [selectedServices]);
  const selectedServiceName = useMemo(() => selectedServices.map((service) => service.name).join(" + "), [selectedServices]);
  const times = useMemo(() => selectedDate && settings && selectedDuration ? buildAvailableTimes(selectedDate, settings, selectedDuration, occupied, exception) : [], [selectedDate, settings, selectedDuration, occupied, exception]);

  useEffect(()=>{
    if(step!==2||!settings||!selectedDuration||!authState.ready)return;
    let active=true;
    setError("");
    const firstKey=dateKey(dates[0]);
    const lastKey=dateKey(dates[dates.length-1]);
    getCalendarDays(firstKey,lastKey).then(days=>dates.map(date=>{
      const key=dateKey(date);
      const availability=days[key]?.availability??{occupiedSlots:{}};
      const dayException=days[key]?.exception??null;
      const periods=getPeriods(date,settings,dayException);
      const status: "available"|"full"|"closed"=!periods.length?"closed":buildAvailableTimes(date,settings,selectedDuration,availability.occupiedSlots,dayException).length?"available":"full";
      return[key,status] as const;
    })).then(entries=>{if(active)setCalendarStatus(Object.fromEntries(entries))})
      .catch(()=>{if(active)setError("Não foi possível verificar as vagas do calendário. Tente novamente.")});
    return()=>{active=false};
  },[step,settings,selectedDuration,dates,authState.ready]);

  async function chooseDate(date: Date) {
    const requestId = ++dateRequestId.current;
    setSelectedDate(date); setSelectedTime(""); setDateLoading(true); setError("");
    try {
      const key = dateKey(date);
      const { availability, exception: dayException } = await getCalendarDayForDate(key);
      if (requestId !== dateRequestId.current) return;
      setOccupied(availability.occupiedSlots); setException(dayException); setStep(3);
    } catch {
      if (requestId === dateRequestId.current) setError("Não foi possível consultar os horários desta data.");
    }
    finally {
      if (requestId === dateRequestId.current) setDateLoading(false);
    }
  }

  function validateClient() {
    if (client.name.trim().length < 2 || client.name.trim().length > 80) return "Informe um nome entre 2 e 80 caracteres.";
    const digits = client.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) return "Informe um WhatsApp com DDD.";
    if (client.note.length > 300) return "A observação deve ter no máximo 300 caracteres.";
    return "";
  }

  async function confirm() {
    if (!selectedServices.length || !selectedDate || !selectedTime || !settings) return;
    const validation = validateClient();
    if (validation) return setError(validation);
    setSubmitting(true); setError("");
    try {
      const result = await createBooking(selectedServices, dateKey(selectedDate), selectedTime, client);
      sessionStorage.removeItem("bookingDraft");
      sessionStorage.setItem("bookingConfirmation", JSON.stringify({
        bookingId: result.bookingId, serviceName: result.serviceName,
        durationMinutes: result.durationMinutes, priceCents: result.priceCents,
        dateKey: dateKey(selectedDate), startTime: selectedTime, endTime: result.endTime,
        clientName: client.name.trim(), businessName: settings.businessName, publicPhone: settings.publicPhone,
      }));
      navigate("/confirmacao", { replace: true });
    } catch (reason) {
      if (reason instanceof SlotUnavailableError) {
        setError("Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário disponível.");
        setEditSnapshot({
          selectedServices: [...selectedServices],
          selectedDate,
          selectedTime,
          client: { ...client },
          occupied,
          exception,
        });
        setEditing(2);
        setSelectedTime("");
        setStep(3);
        try {
          const latest = await getAvailabilityForDate(dateKey(selectedDate));
          setOccupied(latest.occupiedSlots);
        } catch {
          // A tela de edição continua disponível com a última agenda carregada.
        }
      } else setError(reason instanceof Error ? reason.message : "Não foi possível concluir o agendamento.");
    } finally { setSubmitting(false); }
  }

  const closed = (date: Date) => settings ? getPeriods(date, settings, null).length === 0 : true;
  function startEdit(target: 1 | 2 | 4) {
    setEditSnapshot({ selectedServices: [...selectedServices], selectedDate, selectedTime, client: { ...client }, occupied, exception });
    setError("");
    setEditing(target);
    setStep(target);
  }

  function cancelEdit() {
    if (editSnapshot) {
      setSelectedServices(editSnapshot.selectedServices);
      setSelectedDate(editSnapshot.selectedDate);
      setSelectedTime(editSnapshot.selectedTime);
      setClient(editSnapshot.client);
      setOccupied(editSnapshot.occupied);
      setException(editSnapshot.exception);
    }
    setError("");
    setEditing(null);
    setEditSnapshot(null);
    setStep(5);
  }

  function saveEdit() {
    setError("");
    setEditing(null);
    setEditSnapshot(null);
    setStep(5);
  }

  function saveServiceEdit() {
    const beforeIds = editSnapshot?.selectedServices.map((service) => service.id).join("|") ?? "";
    const afterIds = selectedServices.map((service) => service.id).join("|");
    if (beforeIds === afterIds) {
      saveEdit();
      return;
    }
    setSelectedTime("");
    setError("");
    setEditing(2);
    setStep(2);
  }

  function toggleService(service: Service) {
    setError("");
    setSelectedServices((current) => {
      if (current.some((item) => item.id === service.id)) return current.filter((item) => item.id !== service.id);
      if (current.length >= MAX_BOOKING_SERVICES) {
        setError(`Selecione no máximo ${MAX_BOOKING_SERVICES} serviços por agendamento.`);
        return current;
      }
      return [...current, service];
    });
  }

  if (authState.error) return <main className="shell"><State title="Configuração necessária" text={authState.error} /></main>;
  if (loading) return <main className="shell"><div className="skeleton" aria-label="Carregando agenda" /></main>;
  if (error && !settings) return <main className="shell"><State title="Agenda indisponível" text={error} retry={() => location.reload()} /></main>;
  if (activeBooking) return <ExistingBooking booking={activeBooking} businessName={settings?.businessName || "Barbearia"} />;
  if (!services.length) return <main className="shell"><State title="Nenhum serviço disponível" text="A barbearia ainda não publicou serviços para agendamento." /></main>;

  return (
    <main className="shell">
      <header className="brand"><span className="brand__mark" aria-hidden="true"><Scissors size={22} /></span><div><small>AGENDE SEU HORÁRIO COM</small><h1>{settings?.businessName || "Barbearia"}</h1></div></header>
      <section className={`booking-card ${editing ? "booking-card--editing" : ""}`} aria-busy={submitting}>
        {editing ? <EditToolbar cancel={cancelEdit} /> : <Progress step={step} />}
        <div className={`step ${step === 1 ? "step--fixed-action" : ""}`} key={step}>
          {step === 1 && <>
            <div className="heading">{editing && <p>EDITAR AGENDAMENTO</p>}<h2>{editing ? "Editar serviços" : "Escolha os serviços"}</h2><span>{editing ? `Adicione, remova ou troque até ${MAX_BOOKING_SERVICES} serviços deste atendimento.` : `Selecione até ${MAX_BOOKING_SERVICES} serviços para o mesmo horário.`}</span></div>
            <ServicePicker services={services} selectedIds={selectedServices.map((service) => service.id)} toggle={toggleService}/>
          </>}
          {step === 2 && <>
            <div className="heading">{editing && <p>EDITAR AGENDAMENTO</p>}<h2>{editing ? "Editar data" : "Escolha o dia"}</h2><span>{editing ? "Escolha uma nova data disponível." : "Os dias com vaga estão disponíveis no calendário."}</span></div>
            <Calendar dates={dates} selected={selectedDate} loading={dateLoading} isClosed={closed} statusByDate={calendarStatus} onSelect={chooseDate} />
            {!editing && <Footer back={() => setStep(1)} />}
          </>}
          {step === 3 && <>
            <div className="heading">{editing && <p>EDITAR AGENDAMENTO</p>}<h2>{editing ? "Editar horário" : "Qual horário fica melhor?"}</h2><span>{selectedDate && formatDateLong(dateKey(selectedDate))}</span></div>
            {dateLoading ? <div className="skeleton skeleton--short" /> : exception?.closed ? <State title="Dia fechado" text={exception.reason || "Não haverá atendimento nesta data."} /> : times.length ? <div className="time-grid">{times.map((time) => <button key={time} className={selectedTime === time ? "is-selected" : ""} onClick={() => setSelectedTime(time)} aria-pressed={selectedTime === time}>{time}</button>)}</div> : <State title="Sem horários livres" text="Escolha outro dia para encontrar novos horários." />}
            <Footer back={() => setStep(2)} backLabel={editing ? "Trocar dia" : "Voltar"} next={editing ? saveEdit : () => setStep(4)} disabled={!selectedTime} nextLabel={editing ? "Salvar alterações" : "Continuar"} />
          </>}
          {step === 4 && <>
            <div className="heading">{editing && <p>EDITAR AGENDAMENTO</p>}<h2>{editing ? "Editar seus dados" : "Seus dados para contato"}</h2><span>O WhatsApp será usado apenas sobre este atendimento.</span></div>
            <div className="fields">
              <label>Nome completo<input autoFocus autoComplete="name" maxLength={80} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></label>
              <label>WhatsApp<input inputMode="numeric" autoComplete="tel" maxLength={16} value={formatPhone(client.phone)} onChange={(e) => setClient({ ...client, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="(81) 99999-9999" /></label>
              <label>Observação <small>(opcional)</small><textarea maxLength={300} value={client.note} onChange={(e) => setClient({ ...client, note: e.target.value })} /><span className="counter">{client.note.length}/300</span></label>
            </div>
            <Footer back={editing ? undefined : () => setStep(3)} next={() => { const message = validateClient(); message ? setError(message) : (editing ? saveEdit() : (setError(""), setStep(5))); }} nextLabel={editing ? "Salvar alterações" : "Continuar"} />
          </>}
          {step === 5 && selectedServices.length > 0 && selectedDate && <>
            <div className="heading"><h2>Confira os detalhes</h2><span>Se precisar mudar algo, toque no lápis ao lado.</span></div>
            <dl className="review">
              <div className="review__row"><span><dt>Serviços</dt><dd>{selectedServiceName}<small>{selectedDuration} minutos · {money(selectedPrice)}</small></dd></span><ReviewEditButton label="Editar serviços" onClick={() => startEdit(1)} /></div>
              <div className="review__row"><span><dt>Data e horário</dt><dd>{formatDateLong(dateKey(selectedDate))}<small>{selectedTime} até {minutesToTime(timeToMinutes(selectedTime) + selectedDuration)}</small></dd></span><ReviewEditButton label="Editar data e horário" onClick={() => startEdit(2)} /></div>
              <div className="review__row"><span><dt>Cliente</dt><dd>{client.name}<small>{formatPhone(client.phone)}</small></dd></span><ReviewEditButton label="Editar dados do cliente" onClick={() => startEdit(4)} /></div>
              <div className="review__row"><span><dt>Localização</dt><dd>Barbearia DaVinci<small>Av. Senador Arêa Leão, Jóquei<br/>Teresina - PI, 64049-110</small></dd></span><a className="review__edit review__map" href={businessMapsUrl} target="_blank" rel="noreferrer" aria-label="Abrir localização da Barbearia DaVinci no Google Maps" title="Abrir no Google Maps"><img src="/action-icons/map.svg" alt="" aria-hidden="true" /></a></div>
              {client.note && <div><dt>Observação</dt><dd>{client.note}</dd></div>}
            </dl>
            <Footer back={() => setStep(4)} roundedBack next={confirm} nextLabel={submitting ? "Confirmando…" : "Confirmar agendamento"} disabled={submitting || !authState.ready} />
          </>}
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
      </section>
      {step === 1 && <Footer fixed next={editing ? saveServiceEdit : () => setStep(2)} disabled={!selectedServices.length} />}
      <p className="secure-note"><ShieldCheck size={15} aria-hidden="true" /> Seus dados são protegidos e usados apenas para o agendamento.</p>
    </main>
  );
}

function ExistingBooking({ booking, businessName }: { booking: CustomerBooking; businessName: string }) {
  const [, navigate] = useLocation();
  const canEdit = booking.startAt.toMillis() > Date.now();
  return <main className="shell">
    <header className="brand"><span className="brand__mark" aria-hidden="true"><Scissors size={22} /></span><div><small>SEU AGENDAMENTO</small><h1>{businessName}</h1></div></header>
    <section className="booking-card existing-booking">
      <div className="existing-booking__icon" aria-hidden="true"><CalendarClock size={30}/></div>
      <div className="heading"><p>HORÁRIO RESERVADO</p><h2>Você já tem um agendamento</h2><span>{canEdit ? "O acesso fica vinculado com segurança a este navegador." : "Este atendimento aguarda a finalização pela barbearia antes de liberar uma nova reserva."}</span></div>
      <dl className="review">
        <div><dt>Serviços</dt><dd>{booking.serviceNameSnapshot}<small>{booking.durationMinutesSnapshot} minutos · {money(booking.priceCentsSnapshot)}</small></dd></div>
        <div><dt>Data e horário</dt><dd>{formatDateLong(booking.dateKey)}<small>{booking.startTime} às {booking.endTime}</small></dd></div>
        <div><dt>Cliente</dt><dd>{booking.clientName}</dd></div>
      </dl>
      <div className="existing-booking__actions">
        {canEdit&&<button className="button button--primary" onClick={() => navigate(`/agendamento/${booking.id}`)}><Pencil size={17}/>Editar agendamento</button>}
      </div>
    </section>
    <p className="secure-note"><ShieldCheck size={15} aria-hidden="true" /> Só este navegador autenticado pode abrir ou alterar os dados.</p>
  </main>;
}

function Footer({ back, next, disabled, fixed = false, roundedBack = false, backLabel = "Voltar", nextLabel = "Continuar" }: { back?: () => void; next?: () => void; disabled?: boolean; fixed?: boolean; roundedBack?: boolean; backLabel?: string; nextLabel?: string }) {
  return <div className={`actions ${fixed ? "actions--fixed" : ""}`}>{back && <button className={`button button--ghost ${roundedBack ? "button--rounded-back" : ""}`} onClick={back}>{!roundedBack && <ArrowLeft size={17} aria-hidden="true" />}{backLabel}</button>}{next && <button className="button button--primary" onClick={next} disabled={disabled}>{nextLabel}</button>}</div>;
}

function EditToolbar({ cancel }: { cancel: () => void }) {
  return <header className="edit-toolbar"><div><small>EDIÇÃO</small><strong>Editar agendamento</strong></div><button type="button" onClick={cancel}>Cancelar</button></header>;
}

function State({ title, text, retry }: { title: string; text: string; retry?: () => void }) {
  return <div className="empty"><span aria-hidden="true"><CircleAlert size={28} /></span><h3>{title}</h3><p>{text}</p>{retry && <button className="button button--primary" onClick={retry}>Tentar novamente</button>}</div>;
}

function ReviewEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="review__edit" onClick={onClick} aria-label={label} title={label}><img className="review__edit-icon" src="/action-icons/iconsax-edit.svg" alt="" aria-hidden="true" /></button>;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
