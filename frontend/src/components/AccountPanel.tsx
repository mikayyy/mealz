import { useState, type FormEvent } from "react";
import { useMealz } from "../data/MealzProvider";
export function AccountPanel() {
  const {
    mode,
    connect,
    signIn,
    signOut,
    showDemo,
    error,
    householdName,
    email,
  } = useMealz();
  const [working, setWorking] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setWorking(true);
    try {
      await signIn(
        String(data.get("email") ?? ""),
        String(data.get("password") ?? ""),
      );
      form.reset();
    } finally {
      setWorking(false);
    }
  }
  if (mode === "demo")
    return (
      <aside className="preview-banner">
        <strong>Sample household</strong>
        <span>
          Changes save on this device. No real household data is connected.
        </span>
        <button className="text-button" onClick={() => void connect()}>
          Open my household
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </aside>
    );
  if (mode === "loading")
    return (
      <aside className="preview-banner" role="status">
        Opening your household…
      </aside>
    );
  if (mode === "live" || mode === "offline")
    return (
      <aside className="preview-banner">
        <strong>{householdName} · read-only preview</strong>
        <span>
          {email} ·{" "}
          {mode === "offline"
            ? "Downloaded data; reconnect to refresh."
            : "Recipes downloaded for up to 7 days. Changes stay in the current Mealz app."}
        </span>
        <button className="text-button" onClick={() => void signOut()}>
          Sign out
        </button>
        <button className="text-button" onClick={showDemo}>
          Sample household
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </aside>
    );
  return (
    <section className="card signin">
      <h1>Open your household</h1>
      <p className="muted">
        Use your existing Mealz account. This preview reads your saved weeks; it
        does not change them.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={working}>
          {working ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button className="text-button" onClick={() => void connect()}>
        Open remembered or downloaded household
      </button>
      <button className="text-button" onClick={showDemo}>
        Back to sample household
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
