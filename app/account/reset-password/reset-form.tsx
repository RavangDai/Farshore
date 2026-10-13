"use client";
import { useState } from "react";
export function PasswordReset() {
  const [password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[done,setDone]=useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const token = new URL(window.location.href).searchParams.get("token");
    if (!token) { setMessage("Open a valid reset link from your email first."); setBusy(false); return; }
    try { const r=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"password",password,token})});const body=await r.json();setMessage(body.error||body.message);if(r.ok){setDone(true);setPassword("");window.history.replaceState(null,"","/account/reset-password");} }
    catch { setMessage("The connection failed. Try again."); } finally { setBusy(false); }
  }
  return <main className="o-auth-page"><section className="o-card"><a className="o-brand" href="/">FARSHORE</a><h1>Choose a new password</h1>{done?<p>{message} <a href="/">Return to your voyage</a></p>:<form onSubmit={submit}><label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="o-muted">Use at least 12 characters.</p>{message&&<p role="alert" className="o-error">{message}</p>}<button className="a-btn a-primary" disabled={busy}>{busy?"Updating...":"Update password"}</button></form>}</section></main>;
}
