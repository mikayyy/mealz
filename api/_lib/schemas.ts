/// <reference types="../../types.d.ts" />

/** @type {GroceryCategory[]} */
const CATEGORIES=['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other'];

/** @type {JsonSchema} */
const ingredientSchema={
  type:'object',
  additionalProperties:false,
  required:['name','quantity','unit','category','optional'],
  properties:{
    name:{type:'string'},
    quantity:{type:['number','null']},
    unit:{type:['string','null']},
    category:{type:'string',enum:CATEGORIES},
    optional:{type:'boolean'}
  }
};

/** @type {JsonSchema} */
const mealSchema={
  type:'object',
  additionalProperties:false,
  required:['id','day','title','emoji','description','servings','total_minutes','difficulty','tags','kid_note','ingredients','steps'],
  properties:{
    id:{type:'string'},
    day:{type:'string'},
    title:{type:'string'},
    emoji:{type:'string'},
    description:{type:'string'},
    servings:{type:'integer',minimum:1},
    total_minutes:{type:'integer',minimum:1},
    difficulty:{type:'string'},
    tags:{type:'array',items:{type:'string'},maxItems:4},
    kid_note:{type:['string','null']},
    ingredients:{type:'array',minItems:1,items:ingredientSchema},
    steps:{type:'array',minItems:1,items:{type:'string'}}
  }
};

/**
 * Runtime schema for an exact-size idea response.
 * @param {number} count
 * @returns {JsonSchema}
 */
export function ideasSchema(count){
  return {
    type:'object',
    additionalProperties:false,
    required:['ideas'],
    properties:{
      ideas:{
        type:'array',minItems:count,maxItems:count,
        items:{
          type:'object',additionalProperties:false,
          required:['id','title','emoji','description','total_minutes','protein','tags'],
          properties:{
            id:{type:'string'},
            title:{type:'string'},
            emoji:{type:'string'},
            description:{type:'string'},
            total_minutes:{type:'integer',minimum:1},
            protein:{type:'string'},
            tags:{type:'array',items:{type:'string'},maxItems:3}
          }
        }
      }
    }
  };
}

/** @type {JsonSchema} */
export const recipeSchema={
  type:'object',
  additionalProperties:false,
  required:['meal'],
  properties:{meal:mealSchema}
};

/** @type {JsonSchema} */
export const swapSchema={
  type:'object',
  additionalProperties:false,
  required:['alternatives'],
  properties:{alternatives:{type:'array',minItems:2,maxItems:2,items:mealSchema}}
};
