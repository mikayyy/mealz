import {enc} from './supabase.js';

export const PROFILE_KEY='default';
const DEFAULT_STORES=["Trader Joe's",'Wegmans'];
/** @param {ProfileInput} [input] @returns {Profile} */
function normalizeProfile(input={}){
  /** @param {unknown} value @returns {number} */
  const count=value=>Math.max(0,Math.min(20,Math.floor(Number(value)||0)));
  const adults=count(input.adults),children=count(input.children);
  /** @param {unknown} value @returns {string[]} */
  const list=value=>Array.isArray(value)?value.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,100)):[];
  return {adults,children,householdSize:Math.max(1,adults+children),dietTags:list(input.dietTags),equipment:list(input.equipment),stores:DEFAULT_STORES};
}
/** @param {ProfileContext | null | undefined} context */
function requireScope(context){
  if(!context?.db||!context.householdId)throw new Error('Your account is not linked to a household yet.');
}
/** @param {ProfileContext} context @returns {Promise<ProfileResult>} */
export async function readProfile(context){
  requireScope(context);
  const rows=await context.db(`profiles?select=*&household_id=eq.${enc(context.householdId)}&profile_key=eq.${enc(PROFILE_KEY)}&limit=1`);
  const row=rows?.[0];
  return {profile:row?normalizeProfile({adults:row.adults,children:row.children,dietTags:row.diet_tags,equipment:row.equipment}):null,id:row?.id||null,source:'profiles'};
}
/** @param {ProfileInput} input @param {ProfileContext} context @returns {Promise<ProfileResult>} */
export async function writeProfile(input,context){
  requireScope(context);
  const {db,householdId,userId}=context;
  const p=normalizeProfile(input);
  /** @type {Record<string, unknown>} */
  const row={profile_key:PROFILE_KEY,adults:p.adults,children:p.children,household_size:p.householdSize,diet_tags:p.dietTags,equipment:p.equipment,stores:p.stores,updated_at:new Date().toISOString()};
  row.household_id=householdId;
  if(userId)row.owner_user_id=userId;
  // Atomic upsert handles two household members completing setup together.
  const rows=await db('profiles?on_conflict=household_id,profile_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([row])});
  return {profile:p,id:rows?.[0]?.id||null,source:'profiles'};
}
