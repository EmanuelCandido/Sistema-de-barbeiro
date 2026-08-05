import { Redirect, Link } from "wouter";
import { Check, MessageCircle, Pencil } from "lucide-react";
import { formatDateLong, money } from "../lib/date";
import type { BookingConfirmation } from "../types";

export function ConfirmationPage() {
  let confirmation: BookingConfirmation | null = null;
  try { confirmation = JSON.parse(sessionStorage.getItem("bookingConfirmation") || "null"); } catch { /* noop */ }
  if (!confirmation) return <Redirect to="/" replace />;
  const whatsapp = `https://wa.me/55${confirmation.publicPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá! Agendei ${confirmation.serviceName} para ${formatDateLong(confirmation.dateKey)}, às ${confirmation.startTime}.`)}`;
  return <main className="shell"><section className="success"><div className="success__icon" aria-hidden="true"><Check size={31}/></div><p>AGENDAMENTO CONFIRMADO</p><h1>Seu horário está reservado!</h1><span>Enviaremos novidades pelo WhatsApp informado.</span><dl className="review"><div><dt>Serviços</dt><dd>{confirmation.serviceName}<small>{confirmation.durationMinutes} minutos · {money(confirmation.priceCents)}</small></dd></div><div><dt>Data e horário</dt><dd>{formatDateLong(confirmation.dateKey)}<small>{confirmation.startTime} às {confirmation.endTime}</small></dd></div><div><dt>Cliente</dt><dd>{confirmation.clientName}</dd></div></dl><aside>Chegue com 5 minutos de antecedência para aproveitarmos seu horário.</aside><div className="success__actions"><Link className="button button--primary" href={`/agendamento/${confirmation.bookingId}`}><Pencil size={17}/>Editar agendamento</Link><a className="button button--whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Abrir WhatsApp</a><Link href="/" onClick={() => sessionStorage.removeItem("bookingConfirmation")}>Voltar ao início</Link></div></section></main>;
}
