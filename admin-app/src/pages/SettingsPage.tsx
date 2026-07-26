import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { getSettings, saveSettings } from "../services/adminData";
import { ThemeToggle } from "../components/ThemeToggle";
import type { PublicSettings } from "../types";
import { Header } from "./DashboardPage";

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="loading-card">Carregando configurações…</div>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveSettings(settings!);
    setSaved(true);
  }

  return (
    <>
      <Header
        eyebrow="NEGÓCIO"
        title="Configurações"
        text="Dados compartilhados com o site público."
        action={<div className="settings-header-actions"><ThemeToggle /><Link className="settings-back" to="/"><ArrowLeft size={17} />Voltar</Link></div>}
      />
      <form className="panel settings-form" onSubmit={submit}>
        <label>Nome da barbearia<input maxLength={80} required value={settings.businessName} onChange={event => setSettings({ ...settings, businessName:event.target.value })} /></label>
        <label>WhatsApp público<input inputMode="numeric" maxLength={13} required value={settings.publicPhone} onChange={event => setSettings({ ...settings, publicPhone:event.target.value.replace(/\D/g, "") })} /></label>
        <div className="form-grid">
          <label>Intervalo dos horários (min)<input type="number" min="5" max="120" value={settings.slotIntervalMinutes} onChange={event => setSettings({ ...settings, slotIntervalMinutes:Number(event.target.value) })} /></label>
          <label>Antecedência mínima (min)<input type="number" min="0" max="10080" value={settings.minimumNoticeMinutes} onChange={event => setSettings({ ...settings, minimumNoticeMinutes:Number(event.target.value) })} /></label>
          <label>Limite futuro (dias)<input type="number" min="1" max="180" value={settings.bookingAdvanceDays} onChange={event => setSettings({ ...settings, bookingAdvanceDays:Number(event.target.value) })} /></label>
        </div>
        {saved && <p className="success-message" role="status">Configurações salvas.</p>}
        <button className="primary">Salvar configurações</button>
      </form>
    </>
  );
}
