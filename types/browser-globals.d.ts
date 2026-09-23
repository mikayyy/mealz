// Global browser type declarations for @ts-nocheck files
// This file provides type declarations for ONLY cross-file globals (defined in one file, used in another)

interface Window {
  /** Supabase createClient function */
  supabase?: {
    createClient: (url: string, key: string, options?: Record<string, unknown>) => unknown;
  };
  /** MealzAuth namespace for authentication (defined in auth-client.js) */
  MealzAuth: {
    ready: Promise<unknown>;
    get session(): unknown;
    get user(): unknown;
    get recovering(): boolean;
    get quickLoginEnabled(): boolean;
    changePassword(): void;
    setupQuickLogin(): void;
    forgetQuickLogin(): Promise<void>;
    signOut(options?: { forgetDevice?: boolean }): Promise<void>;
  };
  /** MealzLogic namespace for shared logic (defined in shared-logic.js, published to globalThis.MealzLogic) */
  MealzLogic: {
    DAY_ORDER: string[];
    GROCERY_STAPLES: Set<string>;
    DIET_CONFLICT_RULES: Record<string, Array<{ label: string; terms: string[] }>>;
    sortDays: (days: string[] | null | undefined) => string[];
    ideaCountForDays: (n: number) => number;
    mondayStart: (date?: Date) => Date;
    addDays: (date: Date, n: number) => Date;
    isoLocal: (date: Date) => string;
    currentWeekStart: (date?: Date) => string;
    nextWeekStart: (date?: Date) => string;
    normalizeIngredientName: (name: unknown) => string;
    isPantryStaple: (name: unknown) => boolean;
    groceryKey: (item: { category?: string; name?: string; unit?: string }) => string;
    householdUseUpConflicts: (text: unknown, dietTags: Array<string> | null | undefined) => Array<{ preference: string; label: string; matches: string[] }>;
  };
  /** MealzShopping namespace for shopping logic (defined in shopping-logic.js, published to globalThis.MealzShopping) */
  MealzShopping: {
    SHOPPING_CATEGORY_ORDER: string[];
    shoppingCategory: (category: unknown) => string;
    categoryRank: (category: unknown) => number;
    normalizeUnit: (unit: unknown) => string;
    cleanGroceryName: (name: unknown) => string;
    grocerySourceKey: (item: { name?: string; unit?: string; category?: string; source_key?: string }) => string;
    consolidateGroceries: (meals: Array<{ ingredients?: Array<{ name?: string; quantity?: unknown; unit?: string; category?: string; optional?: boolean }> }> | null | undefined) => Array<{ name: string; quantity: number | null; unit: string | null; category: string; source_key: string }>;
    reconcileGroceries: (
      previous: Array<{ source?: string; source_key?: string; user_modified?: boolean; deleted?: boolean; name?: string; quantity?: number | null; unit?: string | null; category?: string; id?: string; weekly_plan_id?: string; created_at?: string; updated_at?: string }> | null | undefined,
      meals: Array<{ ingredients?: Array<{ name?: string; quantity?: unknown; unit?: string; category?: string; optional?: boolean }> }> | null | undefined
    ) => Array<{ name: string; quantity: number | null; unit: string | null; category: string; source_key: string; checked?: boolean; source: string; user_modified?: boolean; deleted?: boolean }>;
  };
}

// Cross-file global variables (defined in one browser file, used in others)
// app is defined in HTML but used across all files
declare const app: HTMLElement;

// Cross-file functions (defined in app.js, used in other files)
declare function apiJson(url: string, options?: RequestInit): Promise<unknown>;
declare function esc(x: unknown): string;
declare function fmt(i: { quantity?: number; unit?: string; name?: string }): string;
declare function sortDays(days: string[]): string[];
declare function sortMealsByDay(meals: unknown[]): unknown[];
declare function householdTotal(): number;
declare function ideaCountForDays(n: number): number;
declare function groceryKey(i: { category?: string; name?: string; unit?: string }): string;
declare function planningWeekStart(): string;
declare function friendlyClientError(message: unknown): string;
declare function profilePayload(): { householdSize: number; adults: number; children: number; dietTags: string[]; equipment: string[] };
declare function captureWeeklyDraft(): void;
declare function hasWeeklyOverrides(): boolean;
declare function preparedIdeasAvailable(count: number): boolean;
declare function canUsePreparedIdeas(count: number): boolean;
declare function cloudNote(): string;
declare function view(v: string): void;
declare function toggleDietTag(tag: string): void;
declare function profile(): void;
declare function generateIdeas(): Promise<void>;
declare function selectionNumber(id: string): string;
declare function toggleIdea(id: string): void;
declare function ideaPicker(): void;
declare function refreshMealIdeas(): Promise<void>;
declare function buildSelectedWeek(): Promise<void>;
declare function isMakeAgain(m: { tags?: string[] }): boolean;
declare function mealCard(m: { id: string; day: string; title: string; description: string; total_minutes?: number; tags?: string[]; servings?: number; protein?: string; kid_note?: string }): string;
declare function meals(): void;
declare function recipe(id: string): void;
declare function toggleMakeAgain(id: string): Promise<void>;
declare function swapMeal(id: string): Promise<void>;
declare function showSwapChoices(original: unknown, alts: unknown[]): void;
declare function applySwap(originalId: string, replacement: unknown): Promise<void>;
declare function groceryData(): unknown[];
declare function syncGrocery(item: { id?: string; key?: string }, checked: boolean): Promise<void>;
declare function groceries(animateKey?: string): void;
declare function boot(): Promise<void>;
declare function devTools(): string;
declare function wireDevTools(): void;
declare function loadProfile(): Promise<void>;
declare function saveProfileCloud(): Promise<void>;
declare function loadActivePlan(): Promise<void>;
declare function loadReadyIdeas(): Promise<void>;
declare function syncPlan(): Promise<void>;
declare function currentWeekStart(): string;
declare function nextWeekStart(): string;
declare function parseLocalDate(iso: string): Date;
declare function weekLabel(start: string): string;
declare function weekKind(start: string): string;
declare function mealPreview(w: { meals?: Array<{ title: string }> }): string;
declare function weekCard(title: string, w: { weekStart?: string; mealCount?: number; meals?: unknown[] }, options?: { actions?: Array<{ action: string; label: string }>; emptyText?: string }): string;
declare function profileCard(): string;
declare function loadWeeksOverview(force?: boolean): Promise<unknown>;
declare function applyWeekData(start: string, d: { plan?: { id: string; cooking_days?: string[]; use_up?: string; notes?: string }; meals?: unknown[]; groceryItems?: unknown[] }): boolean;
declare function cacheCurrentState(start: string): void;
declare function hydrateWeek(start: string, options?: { force?: boolean }): Promise<boolean>;
declare function prefetchWeek(start: string): void;
declare function scheduleDashboardPrefetch(o: { next?: { weekStart: string }; current?: { weekStart: string } }): void;
declare function cancelTransientNavigation(): void;
declare function backToWeeks(): void;
declare function addWeekContext(): void;
declare function addEditorBack(): void;
declare function addProfileBack(): void;
declare function startNextWeekPlanning(prefill?: boolean): Promise<void>;
declare function openWeekMeals(start: string): Promise<void>;
declare function openWeekGroceries(start: string): Promise<void>;
declare function handleWeekAction(button: HTMLElement): Promise<void>;
declare function wireWeekActions(): void;
declare function dashboard(): Promise<void>;
declare function renderDashboard(o: { next?: { weekStart: string }; current?: { weekStart: string }; past?: unknown[] }): void;
declare function crumbButton(label: string, onClick: () => void): HTMLButtonElement;
declare function crumbText(label: string, kind?: string): HTMLSpanElement;
declare function sep(): HTMLSpanElement;
declare function installCrumbs(parts: Array<{ label: string; action?: () => void; kind?: string }>, options?: { switchTo?: { label: string; ariaLabel?: string; action: () => void } }): void;
declare function weekParts(section: string, options?: { sectionAction?: () => void }): Array<{ label: string; action?: () => void; kind?: string }>;
declare function planningParts(current: string): Array<{ label: string; action?: () => void; kind?: string }>;
declare function itemKey(item: { id?: string; key?: string; source_key?: string }): string;
declare function currentItems(): unknown[];
declare function formFields(item: { name?: string; quantity?: number | null; unit?: string; category?: string }): string;
declare function groceryForm(options?: { item?: unknown }): string;
declare function row(item: { id?: string; name?: string; key?: string; checked?: boolean; category?: string }): string;
declare function render(animateKey?: string): void;
declare function localizeDerivedItems(): void;
declare function formPayload(form: HTMLFormElement): { name: string; quantity: number | null; unit: string; category: string };
declare function mutate(method: string, payload: Record<string, unknown>): Promise<unknown>;
declare function toggle(item: { id?: string; key?: string; checked?: boolean }, checked: boolean): Promise<void>;
declare function submit(form: HTMLFormElement): Promise<void>;
declare function remove(item: { id?: string; key?: string; name?: string }): Promise<void>;
declare function wire(): void;