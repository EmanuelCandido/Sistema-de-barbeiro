import { useEffect, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { EmailAuthProvider, getMultiFactorResolver, reauthenticateWithCredential, TotpMultiFactorGenerator, updatePassword, type MultiFactorError, type MultiFactorResolver } from "firebase/auth";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useOwnerAuth } from "../hooks/useOwnerAuth";
import { auth } from "../lib/firebase";
import { getSettings, saveSettings } from "../services/adminData";
import type { PublicSettings } from "../types";
import { Header } from "./DashboardPage";
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from "../lib/passwordPolicy";
import "./SettingsPage.css";

type PasswordFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyPasswordFields: PasswordFields = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function SettingsPage() {
  const { user } = useOwnerAuth();
  const [settings, setSettings] = useState<PublicSettings>();
  const [saved, setSaved] = useState(false);
  const [passwords, setPasswords] = useState<PasswordFields>(emptyPasswordFields);
  const [passwordError, setPasswordError] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordResolver, setPasswordResolver] = useState<MultiFactorResolver|null>(null);
  const [passwordOtp, setPasswordOtp] = useState("");

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="loading-card">Carregando configurações…</div>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveSettings(settings!);
    setSaved(true);
  }

  function setPasswordField(field: keyof PasswordFields, value: string) {
    setPasswords(current => ({ ...current, [field]: value }));
    setPasswordError("");
    setPasswordChanged(false);
    setPasswordResolver(null);
    setPasswordOtp("");
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordChanged(false);

    if (!user?.email) {
      setPasswordError("Não foi possível identificar o e-mail desta conta.");
      return;
    }
    const policyError = passwordPolicyError(passwords.newPassword);
    if (policyError) {
      setPasswordError(policyError);
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    if (passwords.currentPassword === passwords.newPassword) {
      setPasswordError("A nova senha precisa ser diferente da senha atual.");
      return;
    }

    setChangingPassword(true);
    try {
      if(passwordResolver){
        const hint=passwordResolver.hints.find(item=>item.factorId===TotpMultiFactorGenerator.FACTOR_ID);
        if(!hint)throw new Error("Segundo fator incompatível.");
        await passwordResolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid,passwordOtp));
      }else{
        const credential = EmailAuthProvider.credential(user.email, passwords.currentPassword);
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, passwords.newPassword);
      setPasswords(emptyPasswordFields);
      setPasswordResolver(null);
      setPasswordOtp("");
      setPasswordChanged(true);
    } catch (error) {
      if(error instanceof FirebaseError&&error.code==="auth/multi-factor-auth-required"){
        setPasswordResolver(getMultiFactorResolver(auth,error as MultiFactorError));
        setPasswordError("Confirme o código do aplicativo autenticador para concluir a troca.");
      }else{
        setPasswordError(passwordErrorMessage(error));
      }
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <>
      <Header
        eyebrow="NEGÓCIO"
        title="Configurações"
        text="Dados compartilhados com o site público."
        action={<div className="settings-header-actions"><ThemeToggle /><Link className="settings-back" href="/"><ArrowLeft size={17} />Voltar</Link></div>}
      />
      <div className="settings-stack">
        <form className="panel settings-form" onSubmit={submit}>
          <div className="settings-section-heading">
            <h2>Dados da barbearia</h2>
            <p>Informações exibidas no site e regras dos agendamentos.</p>
          </div>
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

        <form className="panel settings-form" onSubmit={changePassword}>
          <div className="settings-section-heading">
            <h2>Senha de acesso</h2>
            <p>Altere a senha usada para entrar no painel.</p>
          </div>
          <label>
            Senha atual
            <input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={event => setPasswordField("currentPassword", event.target.value)} />
          </label>
          <div className="form-grid">
            <label>
              Nova senha
              <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={passwords.newPassword} onChange={event => setPasswordField("newPassword", event.target.value)} />
            </label>
            <label>
              Confirmar nova senha
              <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={passwords.confirmPassword} onChange={event => setPasswordField("confirmPassword", event.target.value)} />
            </label>
          </div>
          <small className="settings-hint">Use pelo menos {MIN_PASSWORD_LENGTH} caracteres, com maiúscula, minúscula, número e símbolo. Não reutilize a senha atual.</small>
          {passwordResolver&&<label>
            Código do autenticador
            <input inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} pattern="[0-9]{6}" value={passwordOtp} onChange={event=>{setPasswordOtp(event.target.value.replace(/\D/g,"").slice(0,6));setPasswordError("");}} />
          </label>}
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          {passwordChanged && <p className="success-message" role="status">Senha alterada com sucesso.</p>}
          <button className="primary" disabled={changingPassword||(passwordResolver!==null&&passwordOtp.length!==6)}>{changingPassword ? "Alterando…" : passwordResolver?"Confirmar código e alterar":"Alterar senha"}</button>
        </form>
      </div>
    </>
  );
}

function passwordErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) return "Não foi possível alterar a senha. Tente novamente.";
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "A senha atual está incorreta.";
    case "auth/weak-password":
      return "A nova senha é muito fraca. Escolha uma senha mais segura.";
    case "auth/invalid-verification-code":
      return "O código do autenticador é inválido ou expirou.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "auth/network-request-failed":
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    default:
      return "Não foi possível alterar a senha. Tente novamente.";
  }
}
