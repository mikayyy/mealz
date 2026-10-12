import {validCookingDays} from './validation.js';

export class GenerationInputError extends Error{}
function text(value: unknown,label: string,max: number,required=false){
  if(value!=null&&typeof value!=='string')throw new GenerationInputError(`${label} must be text.`);
  const result=String(value??'').trim();
  if(result.length>max||(required&&!result))throw new GenerationInputError(`${label} is invalid.`);
  return result;
}
function integer(value: unknown,label: string,min: number,max: number,fallback: number){
  const result=value??fallback;
  if(typeof result!=='number'||!Number.isInteger(result)||result<min||result>max)throw new GenerationInputError(`${label} is invalid.`);
  return result;
}
function texts(value: unknown,label: string,max: number){
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>max)throw new GenerationInputError(`${label} is invalid.`);
  return value.map(x=>text(x,label,100,true));
}
export function generationInput(body: any){
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>100_000)throw new GenerationInputError('This request is too large or invalid.');
  const householdSize=integer(body.householdSize,'Household size',1,40,5);
  return {householdSize,adults:integer(body.adults,'Adults',0,40,0),children:integer(body.children,'Children',0,40,0),dietTags:texts(body.dietTags,'Dietary preferences',30),equipment:texts(body.equipment,'Equipment',30),useUp:text(body.useUp,'Ingredients to use up',2000),notes:text(body.notes,'Weekly notes',4000)};
}
export function generationDays(days: unknown){
  if(!validCookingDays(days))throw new GenerationInputError('Choose up to seven different cooking days.');
  return days as import('../../types.js').DayName[];
}
export function selectedConcept(value: any){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new GenerationInputError('Choose a valid dinner idea.');
  return {id:text(value.id,'Idea ID',100),title:text(value.title,'Dinner title',200,true),description:text(value.description,'Dinner description',2000),emoji:text(value.emoji,'Emoji',30),total_minutes:integer(value.total_minutes,'Cooking time',1,1440,30)};
}
export function validateRecipe(meal: any,servings?: number){
  try{
    selectedConcept(meal);
    if(!Number.isInteger(meal.servings)||meal.servings<1||meal.servings>40||(servings!=null&&meal.servings!==servings)||!Number.isInteger(meal.total_minutes)||meal.total_minutes<1||meal.total_minutes>1440)throw new Error();
    text(meal.difficulty,'Difficulty',60);text(meal.kid_note,'Child note',2000);
    if(!Array.isArray(meal.tags))throw new Error();texts(meal.tags,'Tags',30);
    if(!Array.isArray(meal.steps)||!meal.steps.length||meal.steps.length>100)throw new Error();
    meal.steps.forEach(x=>text(x,'Recipe step',2000,true));
    if(!Array.isArray(meal.ingredients)||!meal.ingredients.length||meal.ingredients.length>100)throw new Error();
    const categories=new Set(['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other']);
    for(const item of meal.ingredients){
      if(!item||!categories.has(item.category)||typeof item.optional!=='boolean')throw new Error();
      text(item.name,'Ingredient',120,true);text(item.unit,'Unit',40);
      if(item.quantity!=null&&(typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<0||item.quantity>100000))throw new Error();
    }
    return meal;
  }catch{throw Object.assign(new Error('Invalid generated recipe'),{code:'invalid_recipe',retryable:false})}
}
