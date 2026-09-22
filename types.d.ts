export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type GroceryCategory =
  | 'Produce'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Frozen'
  | 'Bakery'
  | 'Pantry'
  | 'Other';

export type ShoppingCategory = 'Produce' | 'Meat & Dairy' | 'Pantry' | 'Frozen' | 'Misc';

export type DietPreference =
  | 'Vegetarian'
  | 'Vegan'
  | 'Pescatarian'
  | 'Mediterranean'
  | 'Plant-Forward'
  | 'Keto'
  | 'Low Carb'
  | 'High Protein'
  | 'Whole30'
  | 'Low Sodium'
  | 'Low Added Sugar'
  | 'Gluten-Free'
  | 'Dairy-Free'
  | 'Nut-Free'
  | 'No Dietary Restrictions';

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  optional: boolean;
}

// AI response contracts mirror api/_lib/schemas.js. Those JSON Schemas remain
// the runtime source of truth; update these declarations whenever a schema changes.
export interface Idea {
  id: string;
  title: string;
  emoji: string;
  description: string;
  total_minutes: number;
  protein: string;
  tags: string[];
}

export interface Meal {
  id: string;
  day: string;
  title: string;
  emoji: string;
  description: string;
  servings: number;
  total_minutes: number;
  difficulty: string;
  tags: string[];
  kid_note: string | null;
  ingredients: Ingredient[];
  steps: string[];
}

export interface Recipe {
  meal: Meal;
}

export interface SwapResult {
  alternatives: Meal[];
}

export interface Profile {
  adults: number;
  children: number;
  householdSize: number;
  dietTags: string[];
  equipment: string[];
  stores: string[];
}

export type ProfileInput = Partial<Pick<Profile, 'adults' | 'children' | 'dietTags' | 'equipment'>>;

export type HouseholdRole = 'owner' | 'member';

export interface Household {
  id: string;
  name: string;
  role?: HouseholdRole;
  join_code_hint?: string | null;
}

export interface HouseholdStatusResult {
  linked: boolean;
  household: Household | null;
  role: HouseholdRole | null;
  needsProfile?: boolean;
}

export interface HouseholdMutationResult {
  ok: true;
  household: Household;
  role?: HouseholdRole;
  joinCode?: string;
}

export interface WeeklyPlan {
  id: string;
  week_start: string;
  household_id: string;
  household_size: number;
  cooking_days: DayName[];
  equipment: string[];
  use_up: string | null;
  notes: string | null;
  status: 'active' | 'ideas' | string;
  created_at: string;
  updated_at: string;
}

export interface GroceryItem {
  id: string;
  weekly_plan_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  checked: boolean;
  source: 'generated' | 'manual';
  source_key: string | null;
  user_modified: boolean;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conflict {
  preference: DietPreference | string;
  label: string;
  matches: string[];
}

export interface TrustedDeviceSetupRequest {
  action: 'setup';
  pin: string;
  label: string;
  previousDeviceToken?: string;
}

export interface TrustedDeviceUnlockRequest {
  action: 'unlock';
  deviceToken: string;
  pin: string;
}

export interface TrustedDeviceRevokeRequest {
  action: 'revoke';
  deviceToken: string;
}

export type TrustedDeviceRequest = TrustedDeviceSetupRequest | TrustedDeviceUnlockRequest | TrustedDeviceRevokeRequest;

export interface TrustedDeviceSetupResponse {
  ok: true;
  userId: string;
  email: string;
  label: string;
  deviceToken: string;
}

export interface TrustedDeviceUnlockResponse {
  ok: true;
  tokenHash: string;
  label: string;
  email: string;
}

export interface TrustedDeviceRevokeResponse {
  ok: true;
}

export type TrustedDeviceResponse = TrustedDeviceSetupResponse | TrustedDeviceUnlockResponse | TrustedDeviceRevokeResponse;

export interface JsonSchema {
  type: string | string[];
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  minimum?: number;
  minItems?: number;
  maxItems?: number;
}

export type TelemetryData = Record<string, unknown>;

export interface Telemetry {
  event(name: string, data?: TelemetryData): void;
  finish(status: number, data?: TelemetryData): void;
  fail(error: unknown, data?: TelemetryData): void;
}

export type DatabaseRequestOptions = RequestInit & {timeoutMs?: number};
export type DataDb = (path: string, options?: DatabaseRequestOptions) => Promise<any>;

export interface ProfileContext {
  db: DataDb;
  householdId: string;
  userId?: string | null;
  owned?: boolean;
  household?: boolean;
  householdRole?: HouseholdRole | string;
}

export interface ProfileResult {
  profile: Profile | null;
  id: string | null;
  source: 'profiles';
}
