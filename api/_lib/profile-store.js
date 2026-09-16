import {sb,enc} from './supabase.js';

export const PROFILE_KEY='default';
const LEGACY_PROFILE_DATE='1970-01-01';
const DEFAULT_STORES=["Trader Joe's",'Wegmans'];

function parseMeta(notes){try{return notes?JSON.parse(notes):{}}catch{return {}}}
function profilesTableUnavailable(error){
  const message=String(error?.message||error||'');
  return /profiles|relation .* does not exist|schema cache/i.test(message)&&/not find|does not exist|schema cache|unknown/i.test(message);
}
function normalizeProfile(input={}){
  const adults=Math.max(0,Number(input.adults||0));
  const children=Math.max(0,Number(input.children||0));
  return {
    adults,
    children,
    householdSize:Math.max(1,adults+children||Number(input.householdSize||5)),
    dietTags:Array.isArray(input.dietTags)?input.dietTags:[],
    equipment:Array.isArray(input.equipment)?input.equipment:[],
    stores:Array.isArray(input.stores)&&input.stores.length?input.stores:DEFAULT_STORES
  };
}
function profileFromRow(row){
  if(!row)return null;
  return normalizeProfile({adults:row.adults,children:row.children,householdSize:row.household_size,dietTags:row.diet_tags,equipment:row.equipment,stores:row.stores});
}
function legacyProfileFromRow(row){
  if(!row)return null;
  const meta=parseMeta(row.notes);
  return normalizeProfile({adults:meta.adults,children:meta.children,householdSize:row.household_size,dietTags:meta.dietTags,equipment:row.equipment,stores:meta.stores});
}
async function readLegacyProfile(db=sb){
  const rows=await db(`weekly_plans?select=*&status=eq.profile&week_start=eq.${LEGACY_PROFILE_DATE}&order=created_at.desc&limit=1`);
  return rows?.[0]?legacyProfileFromRow(rows[0]):null;
}
async function writeLegacyProfile(profile,db=sb){
  const p=normalizeProfile(profile);
  const meta={adults:p.adults,children:p.children,dietTags:p.dietTags,stores:p.stores};
  await db(`weekly_plans?status=eq.profile&week_start=eq.${LEGACY_PROFILE_DATE}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  const rows=await db('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{week_start:LEGACY_PROFILE_DATE,household_size:p.householdSize,cooking_days:[],equipment:p.equipment,use_up:null,notes:JSON.stringify(meta),status:'profile'}])});
  return {profile:p,id:rows?.[0]?.id||null,source:'legacy'};
}
async function writeProfilesTable(profile,{db=sb,userId=null,owned=false,household=false,householdId=null}={}){
  const p=normalizeProfile(profile);
  const now=new Date().toISOString();
  const existing=await db(`profiles?select=id&profile_key=eq.${enc(PROFILE_KEY)}&limit=1`);
  const row={profile_key:PROFILE_KEY,adults:p.adults,children:p.children,household_size:p.householdSize,diet_tags:p.dietTags,equipment:p.equipment,stores:p.stores,updated_at:now};
  if(household){
    if(!householdId)throw new Error('Your account is not linked to a household yet.');
    row.household_id=householdId;
  }else if(owned&&userId){
    row.owner_user_id=userId;
  }
  let id;
  if(existing?.length){
    id=existing[0].id;
    await db(`profiles?id=eq.${enc(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
  }else{
    const rows=await db('profiles',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([row])});
    id=rows?.[0]?.id||null;
  }
  if(!owned&&!household)await db(`weekly_plans?status=eq.profile&week_start=eq.${LEGACY_PROFILE_DATE}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  return {profile:p,id,source:'profiles'};
}

export async function readProfile(context={}){
  const {db=sb,owned=false,household=false}=context;
  try{
    const rows=await db(`profiles?select=*&profile_key=eq.${enc(PROFILE_KEY)}&limit=1`);
    if(rows?.length)return {profile:profileFromRow(rows[0]),id:rows[0].id,source:'profiles'};
    if(owned||household)return {profile:null,id:null,source:'profiles'};
    const legacy=await readLegacyProfile(db);
    if(!legacy)return {profile:null,id:null,source:'profiles'};
    try{return await writeProfilesTable(legacy,context)}catch{return {profile:legacy,id:null,source:'legacy'}}
  }catch(error){
    if(!profilesTableUnavailable(error))throw error;
    if(owned||household)throw error;
    const legacy=await readLegacyProfile(db);
    return {profile:legacy,id:null,source:legacy?'legacy':'none'};
  }
}

export async function writeProfile(input,context={}){
  const profile=normalizeProfile(input);
  try{return await writeProfilesTable(profile,context)}
  catch(error){
    if(context.owned||context.household||!profilesTableUnavailable(error))throw error;
    return writeLegacyProfile(profile,context.db||sb);
  }
}
