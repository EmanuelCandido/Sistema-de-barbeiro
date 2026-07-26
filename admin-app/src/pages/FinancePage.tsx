import { useEffect, useState } from "react";
import { money, monthKey } from "../lib/format";
import { rebuildMonthSummary } from "../services/bookings";
import type { FinancialSummary, PaymentMethod } from "../types";
import { Header } from "./DashboardPage";
import "./FinancePage.css";

export default function FinancePage() {
  const [month, setMonth] = useState(monthKey());
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setSummary(await rebuildMonthSummary(month));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const methods: Record<PaymentMethod, number> = {
    pix: summary?.pixRevenueCents || 0,
    cash: summary?.cashRevenueCents || 0,
    card: summary?.cardRevenueCents || 0,
  };

  async function rebuild() {
    setLoading(true);
    try {
      setSummary(await rebuildMonthSummary(month));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header
        eyebrow="FINANCEIRO"
        title="Resultados do mês"
        text="Somente atendimentos concluídos contam como receita recebida."
        action={<label className="month-picker"><span>{monthLabel(month)}</span><img src="/nav-icons/calendar.svg" alt=""/><input aria-label="Mês" type="month" value={month} onClick={event=>event.currentTarget.showPicker?.()} onChange={(event) => setMonth(event.target.value)} /></label>}
      />
      {loading ? (
        <div className="loading-card">Calculando mês…</div>
      ) : (
        <>
          <section className="metric-grid">
            <article className="metric accent finance-received">
              <span>Receita recebida</span>
              <strong>{money(summary?.completedRevenueCents || 0)}</strong>
            </article>
            <article className="metric">
              <span>Atendimentos realizados</span>
              <strong>{summary?.completedAppointments || 0}</strong>
            </article>
            <article className="metric">
              <span>Ticket médio</span>
              <strong>{money(summary?.completedAppointments ? summary.completedRevenueCents / summary.completedAppointments : 0)}</strong>
            </article>
            <article className="metric">
              <span>Cancelamentos</span>
              <strong>{summary?.cancelledAppointments || 0}</strong>
            </article>
          </section>
          <section className="panel finance-breakdown">
            <div className="panel__header">
              <div>
                <p>FORMAS DE PAGAMENTO</p>
                <h2>Receita concluída</h2>
              </div>
            </div>
            {Object.entries(methods).map(([method, value]) => (
              <article className="finance-row" key={method}>
                <span>{paymentLabel(method as PaymentMethod)}</span>
                <div><i style={{ width: `${summary?.completedRevenueCents ? value / summary.completedRevenueCents * 100 : 0}%` }} /></div>
                <b>{money(value)}</b>
              </article>
            ))}
            <footer>
              <button className="secondary" onClick={rebuild}>Recalcular resumo do mês</button>
            </footer>
          </section>
        </>
      )}
    </>
  );
}

function paymentLabel(method: PaymentMethod) {
  if (method === "pix") return "PIX";
  if (method === "cash") return "Dinheiro";
  return "Cartão";
}

function monthLabel(value:string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
