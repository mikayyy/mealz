/// <reference types="../../types.d.ts" />
/** @param {unknown} tags @returns {string} */
export function dietaryInstruction(tags){
  if(!Array.isArray(tags)||!tags.length)return 'No special dietary style is selected.';
  return `Household dietary preferences: ${tags.join(', ')}. Enforce restrictive tags. Vegetarian means no meat or seafood. Vegan means no animal products. Pescatarian allows seafood but no poultry or other meat. Gluten-Free, Dairy-Free and Nut-Free must exclude those ingredients. Keto and Low Carb should keep carbohydrate load appropriately low. Whole30 should remain Whole30-compatible. Low Sodium and Low Added Sugar should minimize those components. High Protein should emphasize protein. Mediterranean and Plant-Forward are style preferences unless paired with a stricter tag.`;
}
/** @param {unknown} equipment @returns {string} */
export function equipmentInstruction(equipment){
  return Array.isArray(equipment)&&equipment.length
    ?`Special equipment available: ${equipment.join(', ')}. Use only selected special appliances or tools when a recipe depends on them.`
    :'No special equipment is selected. Use ordinary broadly available kitchen methods and do not require an air fryer, pressure cooker, slow cooker, grill, sous vide, or other special appliance.';
}
/** @param {unknown} children @returns {string} */
export function kidInstruction(children){
  const count=Number(children||0);
  return count>0?`${count} child${count===1?'':'ren'} are eating, so keep meals adaptable for children without making the adult version bland.`:'No children are listed in the household.';
}
