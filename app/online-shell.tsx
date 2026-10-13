"use client";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { z } from "zod/v3";
import { ARCADE_PREFS, ARCADE_SAVE, readArcade } from "../src/lib/arcade";
import { mutationSchema, preferencesSchema, type OnlineGame, type OnlinePlayer, type OnlineRecord, type ProgressCommand } from "../src/lib/online";
import { providerDetails, type ModelProvider, type ModelSettings } from "../src/lib/ai-account";

type Pending = z.infer<typeof mutationSchema>;
type Status = "device" | "loading" | "saved" | "saving" | "pending" | "conflict" | "expired";
type AuthView = "login" | "signup" | "recover";
type Game = ComponentType<{ online?: OnlineGame }>;
async function api(path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, { method, credentials: "same-origin", ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: signal || AbortSignal.timeout(18000) });
  const data = await response.json();
  return { response, data };
}
function storedQueue(key: string): Pending[] {
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return z.array(mutationSchema).max(64).parse(value); } catch { return []; }
}

export function OnlineShell() {
  const [player, setPlayer] = useState<OnlinePlayer | null>(null), [sessionReady, setSessionReady] = useState(false), [configured, setConfigured] = useState(false), [local, setLocal] = useState(false);
  const [GameComponent, setGameComponent] = useState<Game | null>(null), [mode, setMode] = useState("arcade");
  const [initial, setInitial] = useState<OnlineRecord | null>(null), [gameReady, setGameReady] = useState(false), [gameKey, setGameKey] = useState(0);
  const [status, setStatus] = useState<Status>("loading"), [saveError, setSaveError] = useState(""), [cacheError, setCacheError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false), [accountTab, setAccountTab] = useState<"account" | "ai">("account"), [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [displayName, setDisplayName] = useState(""), [authBusy, setAuthBusy] = useState(false), [authMessage, setAuthMessage] = useState("");
  const [settings, setSettings] = useState<ModelSettings | null>(null), [provider, setProvider] = useState<ModelProvider>("openai"), [model, setModel] = useState(""), [apiKey, setApiKey] = useState(""), [enabled, setEnabled] = useState(true), [aiBusy, setAiBusy] = useState(false), [aiMessage, setAiMessage] = useState("");
  const record = useRef<OnlineRecord | null>(null), queue = useRef<Pending[]>([]), flushing = useRef(false), generation = useRef(0), active = useRef<AbortController | null>(null);
  const storageKey = player ? `farshore-online:${player.id}` : "farshore-guest", pendingKey = `${storageKey}:pending`;
  const persist = useCallback(() => { try { localStorage.setItem(pendingKey, JSON.stringify(queue.current)); setCacheError(""); } catch { setCacheError("This device cannot keep pending saves after reload. Keep this tab open until the voyage is saved."); } }, [pendingKey]);

  const flush = useCallback(async () => {
    if (!player || flushing.current || !record.current) return;
    const token = generation.current;
    flushing.current = true;
    try {
      while (queue.current.length && token === generation.current) {
        setStatus("saving"); setSaveError("");
        const controller = new AbortController(); active.current = controller;
        const result = await api("/api/account", "POST", queue.current[0], AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]));
        if (token !== generation.current) return;
        if (!result.response.ok) {
          setStatus(result.response.status === 401 ? "expired" : result.data.code === "revision_conflict" ? "conflict" : "pending");
          setSaveError(result.data.error || "The voyage has not been saved online. Retry when the connection returns.");
          if (result.data.record) record.current = result.data.record;
          return;
        }
        record.current = result.data.record; queue.current.shift(); persist();
      }
      if (token === generation.current) setStatus("saved");
    } catch {
      if (token === generation.current) { setStatus("pending"); setSaveError("The connection failed. This voyage is still on this device. Retry the online save."); }
    } finally { if (token === generation.current) { flushing.current = false; active.current = null; } }
  }, [player, persist]);
  const enqueue = useCallback((command: ProgressCommand) => {
    if (!record.current || !player) return;
    if (queue.current.length >= 64) { setSaveError("There are too many pending saves. Retry saving before starting another round."); setStatus("pending"); return; }
    queue.current.push({ requestId: crypto.randomUUID(), expectedRevision: record.current.revision + queue.current.length, command });
    persist();
    if (status !== "conflict" && status !== "expired") void flush();
  }, [player, persist, status, flush]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search), selected = params.has("voyage") ? "voyage" : params.has("mystery") ? "mystery" : "arcade";
    setMode(selected);
    (selected === "voyage" ? import("../src/App") : selected === "mystery" ? import("../src/MysteryApp") : import("../src/ArcadeApp")).then(module => { if (alive) setGameComponent(() => module.default as Game); });
    const note = params.get("auth"), linkError = params.get("error");
    if (note || linkError) { setAccountOpen(true); setAuthMessage(note === "confirmed" && !linkError ? "Email confirmed. You can sign in." : "That link is unavailable or expired. Sign in or request a new reset link."); }
    void api("/api/auth/session").then(({ response, data }) => {
      if (!alive) return;
      if (!response.ok) { setAuthMessage(data.error); setConfigured(true); }
      else { setPlayer(data.player); setConfigured(data.configured); setLocal(data.local); }
      setSessionReady(true);
    }).catch(() => { if (alive) { setSessionReady(true); setAuthMessage("The sign-in service could not be reached. You can still play on this device."); } });
    return () => { alive = false; generation.current++; active.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!sessionReady) return;
    generation.current++; active.current?.abort(); flushing.current = false; setGameReady(false);
    if (!player) { queue.current = []; record.current = null; setInitial(null); setStatus("device"); setGameReady(true); return; }
    const token = generation.current;
    void (async () => {
      setStatus("loading");
      try {
        const result = await api("/api/account");
        if (token !== generation.current) return;
        if (!result.response.ok) throw new Error(result.data.error || "Online saving is unavailable.");
        record.current = result.data.record; queue.current = storedQueue(pendingKey);
        if (queue.current.length) await flush(); else setStatus("saved");
        if (token !== generation.current) return;
        const loaded = record.current!;
        let save = loaded.save, preferences = loaded.preferences;
        if (queue.current.length) {
          try { save = readArcade(localStorage.getItem(`${storageKey}:voyage`)) || save; preferences = preferencesSchema.parse(JSON.parse(localStorage.getItem(`${storageKey}:preferences`) || JSON.stringify(preferences))); } catch { /* Use the valid online record. */ }
        }
        setInitial({ ...loaded, save, preferences }); setGameReady(true);
      } catch (error) { if (token === generation.current) { setSaveError(error instanceof Error ? error.message : "Online saving is unavailable."); setStatus("pending"); } }
    })();
    return () => { generation.current++; active.current?.abort(); };
    // The account identity owns this bootstrap. Saving does not restart a round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, player?.id, gameKey]);
  useEffect(() => {
    if (!player) return;
    const retry = () => { if (queue.current.length && status === "pending") void flush(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [player, status, flush]);

  function openAccount(tab: "account" | "ai" = "account") {
    window.dispatchEvent(new Event("farshore:account-open")); setAccountTab(tab); setAccountOpen(true);
  }
  function closeAccount() { setAccountOpen(false); setPassword(""); setApiKey(""); }
  useEffect(() => {
    if (!accountOpen) return;
    const root = document.getElementById("farshore-account-dialog");
    root?.querySelector<HTMLElement>("button,input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAccount();
      if (e.key !== "Tab") return;
      const items = Array.from(root?.querySelectorAll<HTMLElement>("button,input,select,a[href]") || []).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length);
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [accountOpen]);
  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      const body = authView === "signup" ? { action: "signup", email, password, displayName } : authView === "recover" ? { action: "recover", email } : { action: "login", email, password };
      const result = await api("/api/auth", "POST", body);
      setPassword("");
      if (!result.response.ok) setAuthMessage(result.data.error);
      else if (result.data.player) window.location.assign("/");
      else setAuthMessage(result.data.message);
    } catch { setAuthMessage("The connection failed. Try again."); } finally { setAuthBusy(false); }
  }
  async function signOut() {
    if (queue.current.length && !window.confirm("Sign out with unsaved changes? They will be retried when you sign in again on this device.")) return;
    generation.current++; active.current?.abort(); setAuthBusy(true);
    try { const result = await api("/api/auth", "POST", { action: "logout" }); if (!result.response.ok) { setAuthMessage(result.data.error); return; } window.location.assign("/"); }
    catch { setAuthMessage("Sign-out failed. Try again."); } finally { setAuthBusy(false); }
  }
  async function reloadVoyage() {
    if (queue.current.length && !window.confirm("Load the latest online voyage? Pending changes from this tab will be discarded.")) return;
    generation.current++; active.current?.abort(); queue.current = []; persist(); setSaveError(""); setGameKey(k => k + 1); closeAccount();
  }
  async function retrySaving() { if (!record.current) { setGameKey(k => k + 1); return; } await flush(); if (!queue.current.length && record.current && !gameReady) { setInitial(record.current); setGameReady(true); } }
  async function importDeviceVoyage() {
    if (!record.current || record.current.save.started || queue.current.length) return;
    let save, preferences;
    try { save = readArcade(localStorage.getItem(ARCADE_SAVE)); preferences = preferencesSchema.parse(JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null")); }
    catch { setAuthMessage("No compatible device voyage was found."); return; }
    if (!save?.started) { setAuthMessage("No device voyage has been started."); return; }
    enqueue({ type: "import", save, preferences }); await flush();
    if (!queue.current.length) { setGameKey(k => k + 1); setAuthMessage("Your device voyage is saved to this account."); }
  }
  useEffect(() => {
    if (!accountOpen || accountTab !== "ai" || !player) return;
    let alive = true; setAiBusy(true); setAiMessage(""); setApiKey("");
    void api("/api/ai-settings").then(({ response, data }) => {
      if (!alive) return;
      if (!response.ok) { setAiMessage(data.error); return; }
      const next: ModelSettings | null = data.settings; setSettings(next); setProvider(next?.provider || "openai"); setModel(next?.model || ""); setEnabled(next?.enabled ?? true);
    }).catch(() => { if (alive) setAiMessage("The connection settings could not be loaded."); }).finally(() => { if (alive) setAiBusy(false); });
    return () => { alive = false; };
  }, [accountOpen, accountTab, player]);
  async function saveAi(event: React.FormEvent) {
    event.preventDefault(); setAiBusy(true); setAiMessage("");
    try { const result = await api("/api/ai-settings", "POST", { provider, model, apiKey, enabled }); if (!result.response.ok) setAiMessage(result.data.error); else { setSettings(result.data.settings); setApiKey(""); setAiMessage("Connection saved. Check it before preparing a rival."); } }
    catch { setAiMessage("The settings could not be saved. Try again."); } finally { setAiBusy(false); }
  }
  async function checkAi() {
    setAiBusy(true); setAiMessage("");
    try { const result = await api("/api/arcade"); setAiMessage(result.data.message || result.data.error || "The connection could not be checked."); }
    catch { setAiMessage("The provider could not be reached."); } finally { setAiBusy(false); }
  }
  async function removeAi() {
    if (!window.confirm("Remove your saved AI connection and API key?")) return;
    setAiBusy(true);
    try { const result = await api("/api/ai-settings", "DELETE", {}); if (!result.response.ok) setAiMessage(result.data.error); else { setSettings(null); setApiKey(""); setModel(""); setAiMessage("The connection has been removed."); } }
    catch { setAiMessage("The connection could not be removed."); } finally { setAiBusy(false); }
  }
  const gameOnline: OnlineGame | undefined = player && initial && mode === "arcade" ? { initialSave: initial.save, initialPreferences: initial.preferences, storageKey, command: enqueue } : undefined;
  const label = mode !== "arcade" ? "Earlier mode · saved on this device" : ({ device: "Saved on this device", loading: "Loading your voyage", saved: "Saved to your account", saving: "Saving your voyage...", pending: "Online save pending", conflict: "Another device changed this voyage", expired: "Sign in again to save" } as const)[status];

  return <div className="o-shell">
    <header className="o-account-bar"><span className="o-wordmark">FARSHORE <small>ONLINE</small></span><span className={`o-save-status o-${status}`} role="status"><i/>{label}</span><button className="o-account-button" onClick={() => openAccount()}>{player ? player.displayName : "Sign in"}<span aria-hidden="true">↗</span></button></header>
    <div inert={accountOpen}>{gameReady && GameComponent ? <GameComponent key={`${player?.id || "guest"}:${gameKey}:${mode}`} online={gameOnline}/> : <main className="o-loading"><h1>Loading Farshore</h1><p>{saveError || "Loading your voyage..."}</p>{saveError && <button className="a-btn" onClick={() => setGameKey(k => k + 1)}>Try again</button>}</main>}</div>
    {(saveError || cacheError) && <aside className="o-save-notice" role="status"><p>{saveError || cacheError}</p>{status === "conflict" ? <button onClick={() => void reloadVoyage()}>Load latest online voyage</button> : status === "expired" ? <button onClick={() => openAccount()}>Sign in again</button> : player ? <button onClick={() => void retrySaving()}>Retry save</button> : null}</aside>}
    {accountOpen && <div className="o-backdrop"><section className="o-card o-account-dialog" id="farshore-account-dialog" role="dialog" aria-modal="true" aria-labelledby="o-account-title"><div className="o-dialog-top"><span className="a-eyebrow">YOUR FARSHORE ACCOUNT</span><button className="o-close" onClick={closeAccount} aria-label="Close account">×</button></div>
      <h2 id="o-account-title">{player ? "Your account" : authView === "signup" ? "Create an account" : authView === "recover" ? "Reset your password" : "Welcome back"}</h2>
      {player ? <><div className="o-tabs"><button aria-pressed={accountTab === "account"} onClick={() => setAccountTab("account")}>Account</button><button aria-pressed={accountTab === "ai"} onClick={() => setAccountTab("ai")}>AI connection</button></div>
        {accountTab === "account" ? <div><p className="o-player-name">{player.displayName}<small>{player.email}</small></p><p>Arcade progress is saved to your account. Earlier game modes keep their progress on this device.</p><p className="o-muted">{label}</p>{initial && !initial.save.started && <button className="a-btn" onClick={() => void importDeviceVoyage()}>Bring this device's voyage</button>}{status === "pending" && <button className="a-btn" onClick={() => void retrySaving()}>Retry online save</button>}{status === "conflict" && <button className="a-btn" onClick={() => void reloadVoyage()}>Load latest online voyage</button>}{authMessage && <p role="status">{authMessage}</p>}<button className="a-btn o-sign-out" disabled={authBusy} onClick={() => void signOut()}>{authBusy ? "Signing out..." : "Sign out"}</button></div> : <form onSubmit={saveAi}>
          <p>Add your provider and model when you're ready. Local rivals work without an API key.</p><label>Provider<select value={provider} onChange={e => { setProvider(e.target.value as ModelProvider); setApiKey(""); }} disabled={aiBusy}>{Object.entries(providerDetails).filter(([key]) => local || key !== "ollama").map(([key,detail]) => <option key={key} value={key}>{detail.name}</option>)}</select></label><label>Model<input required maxLength={120} autoComplete="off" value={model} placeholder={providerDetails[provider].modelHint} onChange={e => setModel(e.target.value)} disabled={aiBusy}/></label>
          {provider !== "ollama" && <label>{settings?.hasKey && settings.provider === provider ? `Replace API key (saved key ends in ${settings.keySuffix})` : "API key"}<input type="password" autoComplete="off" maxLength={4096} required={!settings?.hasKey || settings.provider !== provider} value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={aiBusy} placeholder={settings?.hasKey && settings.provider === provider ? "Leave empty to keep the saved key" : "Paste your provider's API key"}/></label>}
          <label className="o-checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={aiBusy}/>Use this connection for model preparation</label><p className="o-muted">{provider === "ollama" ? "Ollama must be running on this computer. Local setup does not carry over to the hosted website." : "Your key is encrypted on the server and is never returned to the browser. Your provider bills API usage."}</p>{aiMessage && <p role="status" className="o-form-message">{aiMessage}</p>}<div className="o-form-actions"><button className="a-btn a-primary" disabled={aiBusy}>{aiBusy ? "Working..." : "Save connection"}</button><button type="button" className="a-btn" disabled={aiBusy || !settings} onClick={() => void checkAi()}>Check connection</button></div>{settings && <button type="button" className="o-text-button o-remove" disabled={aiBusy} onClick={() => void removeAi()}>Remove saved connection</button>}
        </form>}</> : <><p>{authView === "signup" ? "Keep your arcade progress across devices." : authView === "recover" ? "We'll email a link to choose a new password." : "Sign in to continue your saved voyage."}</p>{!configured && <p role="status" className="o-form-message">Accounts are being set up. You can play on this device now.</p>}<form onSubmit={authenticate}>{authView === "signup" && <label>Display name<input required minLength={2} maxLength={40} autoComplete="nickname" value={displayName} onChange={e => setDisplayName(e.target.value)} disabled={authBusy}/></label>}<label>Email<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={authBusy}/></label>{authView !== "recover" && <label>Password<input type="password" required minLength={authView === "signup" ? 12 : 1} maxLength={128} autoComplete={authView === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} disabled={authBusy}/></label>}{authView === "signup" && <p className="o-muted">Use at least 12 characters. Confirm your email before signing in.</p>}{authMessage && <p role="status" className="o-form-message">{authMessage}</p>}<button className="a-btn a-primary o-auth-submit" disabled={authBusy || !configured}>{authBusy ? "Working..." : authView === "signup" ? "Create account" : authView === "recover" ? "Send reset link" : "Sign in"}</button></form><div className="o-auth-links">{authView === "login" ? <><button className="o-text-button" onClick={() => { setAuthView("signup"); setPassword(""); setAuthMessage(""); }}>Create an account</button><button className="o-text-button" onClick={() => { setAuthView("recover"); setPassword(""); setAuthMessage(""); }}>Forgot password?</button></> : <button className="o-text-button" onClick={() => { setAuthView("login"); setPassword(""); setAuthMessage(""); }}>Back to sign in</button>}</div><button className="o-text-button o-guest" onClick={closeAccount}>Keep playing on this device</button></>}
    </section></div>}
  </div>;
}
