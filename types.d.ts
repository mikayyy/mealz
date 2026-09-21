type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

type GroceryCategory =
  | 'Produce'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Frozen'
  | 'Bakery'
  | 'Pantry'
  | 'Other';

type ShoppingCategory = 'Produce' | 'Meat & Dairy' | 'Pantry' | 'Frozen' | 'Misc';

type DietPreference =
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

interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  optional: boolean;
}

// AI response contracts mirror api/_lib/schemas.js. Those JSON Schemas remain
// the runtime source of truth; update these declarations whenever a schema changes.
interface Idea {
  id: string;
  title: string;
  emoji: string;
  description: string;
  total_minutes: number;
  protein: string;
  tags: string[];
}

interface Meal {
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

interface Recipe {
  meal: Meal;
}

interface SwapResult {
  alternatives: Meal[];
}

interface Profile {
  adults: number;
  children: number;
  householdSize: number;
  dietTags: string[];
  equipment: string[];
  stores: string[];
}

type ProfileInput = Partial<Pick<Profile, 'adults' | 'children' | 'dietTags' | 'equipment'>>;

type HouseholdRole = 'owner' | 'member';

interface Household {
  id: string;
  name: string;
  role?: HouseholdRole;
  join_code_hint?: string | null;
}

interface HouseholdStatusResult {
  linked: boolean;
  household: Household | null;
  role: HouseholdRole | null;
  needsProfile?: boolean;
}

interface HouseholdMutationResult {
  ok: true;
  household: Household;
  role?: HouseholdRole;
  joinCode?: string;
}

interface WeeklyPlan {
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

interface GroceryItem {
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

interface Conflict {
  preference: DietPreference | string;
  label: string;
  matches: string[];
}

interface TrustedDeviceSetupRequest {
  action: 'setup';
  pin: string;
  label: string;
  previousDeviceToken?: string;
}

interface TrustedDeviceUnlockRequest {
  action: 'unlock';
  deviceToken: string;
  pin: string;
}

interface TrustedDeviceRevokeRequest {
  action: 'revoke';
  deviceToken: string;
}

type TrustedDeviceRequest = TrustedDeviceSetupRequest | TrustedDeviceUnlockRequest | TrustedDeviceRevokeRequest;

interface TrustedDeviceSetupResponse {
  ok: true;
  userId: string;
  email: string;
  label: string;
  deviceToken: string;
}

interface TrustedDeviceUnlockResponse {
  ok: true;
  tokenHash: string;
  label: string;
  email: string;
}

interface TrustedDeviceRevokeResponse {
  ok: true;
}

type TrustedDeviceResponse = TrustedDeviceSetupResponse | TrustedDeviceUnlockResponse | TrustedDeviceRevokeResponse;

interface JsonSchema {
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

type TelemetryData = Record<string, unknown>;

interface Telemetry {
  event(name: string, data?: TelemetryData): void;
  finish(status: number, data?: TelemetryData): void;
  fail(error: unknown, data?: TelemetryData): void;
}

type DatabaseRequestOptions = RequestInit & {timeoutMs?: number};
type DataDb = (path: string, options?: DatabaseRequestOptions) => Promise<any>;

interface ProfileContext {
  db: DataDb;
  householdId: string;
  userId?: string | null;
  owned?: boolean;
  household?: boolean;
  householdRole?: HouseholdRole | string;
}

interface ProfileResult {
  profile: Profile | null;
  id: string | null;
  source: 'profiles';
}
