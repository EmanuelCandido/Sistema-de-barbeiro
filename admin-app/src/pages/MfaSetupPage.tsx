import { FirebaseError } from "firebase/app";
import { multiFactor, sendEmailVerification, signOut, TotpMultiFactorGenerator, type TotpSecret } from "firebase/auth";
import { ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { Redirect, useLocation } from "wouter";
import { useOwnerAuth } from "../hooks/useOwnerAuth";
import { auth } from "../lib/firebase";
import "./MfaSetupPage.css";

export default function MfaSetupPage(){
  const{user,loading}=useOwnerAuth();
  const[,navigate]=useLocation();
  const[secret,setSecret]=useState<TotpSecret>();
  const[qrCode,setQrCode]=useState("");
  const[code,setCode]=useState("");
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[error,setError]=useState("");

  useEffect(()=>{if(user&&multiFactor(user).enrolledFactors.length)navigate("/",{replace:true})},[navigate,user]);
  if(loading)return <div className="page-state">Verificando sessão segura…</div>;
  if(!user)return <Redirect to="/login" replace/>;
  const currentUser=user;

  async function start(){
    setBusy(true);setError("");setMessage("");
    try{
      await currentUser.reload();
      if(!currentUser.emailVerified){
        await sendEmailVerification(currentUser);
        setMessage("Enviamos um link de confirmação para seu e-mail. Confirme o endereço, volte aqui e clique novamente em configurar.");
        return;
      }
      const session=await multiFactor(currentUser).getSession();
      const generated=await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(generated);
      setQrCode(await QRCode.toDataURL(generated.generateQrCodeUrl(currentUser.email||"proprietario","Barbearia"),{width:240,margin:1}));
    }catch(reason){setError(mfaError(reason));}
    finally{setBusy(false)}
  }

  async function enroll(event:FormEvent){
    event.preventDefault();
    if(!secret||code.length!==6)return;
    setBusy(true);setError("");
    try{
      await multiFactor(currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret,code),"Aplicativo autenticador");
      await currentUser.reload();
      navigate("/",{replace:true});
    }catch(reason){setError(mfaError(reason));}
    finally{setBusy(false)}
  }

  return <main className="mfa-setup"><section><div className="mfa-setup__icon"><ShieldCheck size={30}/></div><p>PROTEÇÃO OBRIGATÓRIA</p><h1>Ative a verificação em duas etapas</h1><span>O painel administrativo exige um código temporário além da senha.</span>{!secret?<><ol><li>Instale ou abra um aplicativo autenticador.</li><li>Confirme seu e-mail e gere o código de configuração.</li><li>Escaneie o QR e informe o código de seis dígitos.</li></ol>{message&&<p className="success-message" role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={start}>{busy?"Preparando…":"Configurar autenticador"}</button></>:<form onSubmit={enroll}>{qrCode&&<img src={qrCode} alt="QR code para configurar o aplicativo autenticador"/>}<label>Chave manual<input readOnly value={secret.secretKey}/></label><label>Código de seis dígitos<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy||code.length!==6}>{busy?"Confirmando…":"Ativar proteção"}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setSecret(undefined);setQrCode("");setCode("");setError("")}}>Gerar outra chave</button></form>}<button className="mfa-setup__logout" onClick={()=>signOut(auth)}>Sair desta conta</button></section></main>;
}

function mfaError(reason:unknown){
  if(reason instanceof FirebaseError){
    if(reason.code==="auth/invalid-verification-code")return "Código inválido ou expirado. Confira o aplicativo e tente novamente.";
    if(reason.code==="auth/requires-recent-login")return "A sessão expirou. Saia, entre novamente e repita a configuração.";
    if(reason.code==="auth/unverified-email")return "Confirme o e-mail da conta antes de ativar a verificação em duas etapas.";
  }
  return "Não foi possível configurar a verificação em duas etapas. Tente novamente.";
}
