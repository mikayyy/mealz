import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createDemoWeeks, type SavedWeek } from "./demo";
import { authConfig, household, readWeeks } from "./api";
import {
  enqueue,
  persist,
  readSnapshot,
  type Snapshot,
  type Scope,
} from "./offline";

const AUTH_KEY = "mealz-react-preview-auth-v1";
const CONFIG_KEY = "mealz-react-public-config-v1";
const LAST_SCOPE = "mealz-react-last-scope-v1";
const MODE_KEY = "mealz-react-mode-v1";
const demoScope: Scope = {
  environment: location.origin,
  userId: "sample",
  householdId: "sample",
};
function sample(): Snapshot {
  let cached: Snapshot | null = null;
  try {
    cached = readSnapshot(localStorage, demoScope);
  } catch {
    /* Storage can be unavailable. */
  }
  return (
    cached ?? {
      version: 1,
      scope: demoScope,
      savedAt: Date.now(),
      weeks: createDemoWeeks(),
      pending: [],
    }
  );
}
function preferredLive() {
  try {
    return localStorage.getItem(MODE_KEY) === "live";
  } catch {
    return false;
  }
}
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Mealz could not connect. Try again.";
interface MealzState {
  savedWeeks: SavedWeek[];
  mode: "demo" | "signin" | "loading" | "live" | "offline";
  error: string;
  householdName: string;
  email: string;
  readOnly: boolean;
  setGrocery: (
    week: string,
    item: string,
    changes: { checked?: boolean; needed_this_week?: boolean },
  ) => void;
  connect: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  showDemo: () => void;
}
const Context = createContext<MealzState | null>(null);
export function MealzProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    preferredLive() ? null : sample(),
  );
  const current = useRef(snapshot);
  const [mode, setMode] = useState<MealzState["mode"]>(() =>
    preferredLive() ? "signin" : "demo",
  );
  const [error, setError] = useState(""),
    [householdName, setHouseholdName] = useState(""),
    [email, setEmail] = useState("");
  const client = useRef<SupabaseClient | null>(null),
    unsubscribe = useRef<(() => void) | null>(null),
    epoch = useRef(0);
  const activeUser = useRef<string | null>(null);
  function publish(value: Snapshot | null) {
    current.current = value;
    setSnapshot(value);
  }
  useEffect(() => {
    function storageChanged(event: StorageEvent) {
      const scope = current.current?.scope;
      if (!scope || scope.userId === "sample") return;
      if (event.key !== AUTH_KEY && event.key !== LAST_SCOPE && event.newValue !== null) return;
      if (event.key === AUTH_KEY || event.key === LAST_SCOPE || event.key?.startsWith("mealz:react:v1:")) {
        epoch.current++; activeUser.current = null; publish(null);
        setHouseholdName(""); setEmail(""); setMode("signin");
      }
    }
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, []);
  function clearPrivate() {
    const userId = activeUser.current ?? current.current?.scope.userId;
    if (userId && userId !== "sample") {
      try {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("mealz:react:v1:")) continue;
          let parts: unknown;
          try {
            parts = JSON.parse(key.slice("mealz:react:v1:".length));
          } catch {
            continue;
          }
          if (
            Array.isArray(parts) &&
            parts[0] === location.origin &&
            parts[1] === userId
          )
            localStorage.removeItem(key);
        }
      } catch {
        /* UI is redacted even if this browser denies storage access. */
      }
    }
    try {
      localStorage.removeItem(LAST_SCOPE);
    } catch {
      /* Best effort. */
    }
    publish(null);
    setHouseholdName("");
    setEmail("");
  }
  async function getClient() {
    if (client.current) return client.current;
    let config: Awaited<ReturnType<typeof authConfig>>;
    if (navigator.onLine) {
      config = await authConfig();
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      } catch {
        /* Public config is optional cache. */
      }
    } else {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw)
        throw new Error(
          "Open your household online once before using downloaded data.",
        );
      const value: unknown = JSON.parse(raw);
      if (
        !value ||
        typeof value !== "object" ||
        !("supabaseUrl" in value) ||
        !("publishableKey" in value) ||
        typeof value.supabaseUrl !== "string" ||
        typeof value.publishableKey !== "string" ||
        new URL(value.supabaseUrl).protocol !== "https:"
      )
        throw new Error(
          "Open your household online to refresh sign-in settings.",
        );
      config = {
        supabaseUrl: value.supabaseUrl,
        publishableKey: value.publishableKey,
      };
    }
    const { createClient } = await import("@supabase/supabase-js");
    client.current = createClient(config.supabaseUrl, config.publishableKey, {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              ...(init?.signal ? [init.signal] : []),
              AbortSignal.timeout(12000),
            ]),
          }),
      },
      auth: {
        storageKey: AUTH_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    const { data } = client.current.auth.onAuthStateChange(
      (_event, session) => {
        const next = session?.user.id ?? null;
        if (activeUser.current && activeUser.current !== next) {
          epoch.current++;
          clearPrivate();
          setMode("signin");
        }
        activeUser.current = next;
      },
    );
    unsubscribe.current = () => data.subscription.unsubscribe();
    return client.current;
  }
  async function open(session: Session, sdk: SupabaseClient) {
    const ticket = ++epoch.current;
    // No cached private data can remain visible during a different account load.
    publish(null);
    setMode("loading");
    setError("");
    activeUser.current = session.user.id;
    if (!navigator.onLine) {
      const raw = localStorage.getItem(LAST_SCOPE);
      if (!raw)
        throw new Error(
          "No downloaded household is available. Connect online first.",
        );
      const saved: unknown = JSON.parse(raw);
      if (
        !saved ||
        typeof saved !== "object" ||
        !("householdId" in saved) ||
        typeof saved.householdId !== "string"
      )
        throw new Error("No downloaded household is available.");
      const scope = {
        environment: location.origin,
        userId: session.user.id,
        householdId: saved.householdId,
      };
      const cache = readSnapshot(localStorage, scope);
      if (!cache)
        throw new Error("Your downloaded household expired. Reconnect online.");
      if (ticket !== epoch.current) return;
      publish(cache);
      setEmail(session.user.email ?? "");
      setHouseholdName("Downloaded household");
      setMode("offline");
      return;
    }
    const verified = await sdk.auth.getUser(session.access_token);
    if (verified.error || verified.data.user?.id !== session.user.id)
      throw new Error("Please sign in again.");
    const home = await household(session.access_token);
    if (!home.linked || !home.household)
      throw new Error(
        "This account has no household yet. Create or join one in the current Mealz app, then return here.",
      );
    const data = await readWeeks(session.access_token, home.household.id);
    if (ticket !== epoch.current) return;
    const scope: Scope = {
      environment: location.origin,
      userId: session.user.id,
      householdId: home.household.id,
    };
    const next: Snapshot = {
      version: 1,
      scope,
      savedAt: Date.now(),
      weeks: data,
      pending: [],
    };
    try {
      persist(localStorage, next);
      localStorage.setItem(LAST_SCOPE, JSON.stringify(scope));
    } catch {
      setError(
        "Your household loaded, but this browser could not save an offline copy.",
      );
    }
    publish(next);
    setHouseholdName(home.household.name);
    setEmail(session.user.email ?? "");
    setMode("live");
  }
  async function connect() {
    setError("");
    setMode("loading");
    try {
      localStorage.setItem(MODE_KEY, "live");
      if (!navigator.onLine) {
        const raw = localStorage.getItem(LAST_SCOPE);
        if (!raw)
          throw new Error(
            "No downloaded household is available. Connect online first.",
          );
        const saved: unknown = JSON.parse(raw);
        if (
          !saved ||
          typeof saved !== "object" ||
          !("environment" in saved) ||
          saved.environment !== location.origin ||
          !("userId" in saved) ||
          typeof saved.userId !== "string" ||
          !("householdId" in saved) ||
          typeof saved.householdId !== "string"
        )
          throw new Error("The downloaded household is unavailable.");
        const scope: Scope = {
          environment: location.origin,
          userId: saved.userId,
          householdId: saved.householdId,
        };
        const cache = readSnapshot(localStorage, scope);
        if (!cache)
          throw new Error(
            "Your downloaded household expired. Reconnect online.",
          );
        activeUser.current = scope.userId;
        publish(cache);
        setHouseholdName("Downloaded household");
        setEmail("");
        setMode("offline");
        return;
      }
      const sdk = await getClient();
      const result = await sdk.auth.getSession();
      if (result.error) throw result.error;
      if (result.data.session) await open(result.data.session, sdk);
      else setMode("signin");
    } catch (cause) {
      setError(message(cause));
      setMode("signin");
    }
  }
  async function signIn(address: string, password: string) {
    setError("");
    setMode("loading");
    try {
      const sdk = await getClient();
      const result = await sdk.auth.signInWithPassword({
        email: address,
        password,
      });
      if (result.error) throw result.error;
      if (!result.data.session)
        throw new Error("Sign-in did not return a session.");
      await open(result.data.session, sdk);
    } catch (cause) {
      setError(message(cause));
      setMode("signin");
    }
  }
  async function signOut() {
    epoch.current++;
    clearPrivate();
    activeUser.current = null;
    setMode("signin");
    setError("");
    const sdk = client.current;
    unsubscribe.current?.();
    unsubscribe.current = null;
    if (sdk) {
      sdk.auth.stopAutoRefresh();
      try {
        await sdk.auth.signOut({ scope: "local" });
      } catch {
        /* Local credentials removed below even without network. */
      }
    }
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      setError(
        "This browser could not clear stored sign-in data. Clear this site’s storage before sharing this device.",
      );
    }
    client.current = null;
  }
  function showDemo() {
    epoch.current++;
    publish(sample());
    setMode("demo");
    setError("");
    setEmail("");
    try {
      localStorage.setItem(MODE_KEY, "demo");
    } catch {
      /* No persistence in this browser. */
    }
  }
  function setGrocery(
    week: string,
    item: string,
    changes: { checked?: boolean; needed_this_week?: boolean },
  ) {
    // Live mode is deliberately read-only until isolated write testing is ready.
    if (mode !== "demo" || !current.current) return;
    try {
      const next = {
        ...enqueue(current.current, week, item, changes),
        pending: [],
      };
      persist(localStorage, next);
      publish(next);
      setError("");
    } catch {
      setError(
        "This change could not be saved on your device. Check browser storage and try again.",
      );
    }
  }
  return (
    <Context
      value={{
        savedWeeks: snapshot?.weeks ?? [],
        mode,
        error,
        householdName,
        email,
        readOnly: mode !== "demo",
        setGrocery,
        connect,
        signIn,
        signOut,
        showDemo,
      }}
    >
      {children}
    </Context>
  );
}
export function useMealz() {
  const value = useContext(Context);
  if (!value) throw new Error("MealzProvider is missing.");
  return value;
}
