const test=require('node:test');
const assert=require('node:assert/strict');
const shopping=require('../shopping-logic.js');

test('shopping categories stay in the intended Trader Joe\'s order',()=>{
  assert.deepEqual(shopping.SHOPPING_CATEGORY_ORDER,['Produce','Meat & Dairy','Pantry','Frozen','Misc']);
});

test('detailed ingredient categories collapse into shopping groups',()=>{
  assert.equal(shopping.shoppingCategory('Produce'),'Produce');
  assert.equal(shopping.shoppingCategory('Meat & Seafood'),'Meat & Dairy');
  assert.equal(shopping.shoppingCategory('Dairy & Eggs'),'Meat & Dairy');
  assert.equal(shopping.shoppingCategory('Bakery'),'Pantry');
  assert.equal(shopping.shoppingCategory('Pantry'),'Pantry');
  assert.equal(shopping.shoppingCategory('Frozen'),'Frozen');
  assert.equal(shopping.shoppingCategory('Other'),'Misc');
  assert.equal(shopping.shoppingCategory('Unknown'),'Misc');
});

test('shopping names remove preparation language without mutating recipe ingredients',()=>{
  /** @type {Array<{ingredients:Array<Partial<import('../types.js').Ingredient>>}>} */
  const meals=[
    {ingredients:[{name:'Garlic, finely grated',quantity:1,unit:'clove',category:'Produce'}]},
    {ingredients:[{name:'minced garlic cloves',quantity:19,unit:'cloves',category:'Produce'}]},
    {ingredients:[{name:'Diced tomatoes',quantity:2,unit:'whole',category:'Produce'}]}
  ];
  const snapshot=structuredClone(meals);
  const groceries=shopping.consolidateGroceries(meals);
  assert.deepEqual(groceries,[
    {name:'garlic',quantity:2,unit:'bulbs',category:'Produce',source_key:'garlic::garlic-count'},
    {name:'tomato',quantity:2,unit:'whole',category:'Produce',source_key:'tomato::count'}
  ]);
  assert.deepEqual(meals,snapshot);
  assert.equal(meals[2].ingredients[0].name,'Diced tomatoes');
});

test('preparation wording and produce sizes combine into one count without changing recipes',()=>{
  /** @type {Array<{ingredients:Array<Partial<import('../types.js').Ingredient>>}>} */
  const meals=[
    {ingredients:[{name:'Diced onions',quantity:1,unit:'large',category:'Produce'}]},
    {ingredients:[{name:'sliced onion',quantity:1,unit:'medium',category:'Produce'}]}
  ];
  const snapshot=structuredClone(meals);
  assert.deepEqual(shopping.consolidateGroceries(meals),[
    {name:'onion',quantity:2,unit:'whole',category:'Produce',source_key:'onion::count'}
  ]);
  assert.deepEqual(meals,snapshot);
});

test('compatible volume and weight units combine across recipes',()=>{
  const groceries=shopping.consolidateGroceries([
    {ingredients:[{name:'olive oil',quantity:1,unit:'tbsp',category:'Pantry'},{name:'chicken breast',quantity:8,unit:'oz',category:'Meat & Seafood'}]},
    {ingredients:[{name:'Olive oil',quantity:3,unit:'tsp',category:'Pantry'},{name:'chicken breasts',quantity:1,unit:'lb',category:'Meat & Seafood'}]}
  ]);
  assert.deepEqual(groceries,[
    {name:'olive oil',quantity:2,unit:'tbsp',category:'Pantry',source_key:'olive oil::volume'},
    {name:'chicken breast',quantity:1.5,unit:'lb',category:'Meat & Seafood',source_key:'chicken breast::weight'}
  ]);
});

test('incompatible package units remain separate and unknown quantities do not undercount',()=>{
  const groceries=shopping.consolidateGroceries([
    {ingredients:[{name:'black beans',quantity:2,unit:'cans',category:'Pantry'},{name:'cilantro, chopped',quantity:null,unit:null,category:'Produce'}]},
    {ingredients:[{name:'black bean',quantity:1,unit:'bag',category:'Pantry'},{name:'fresh cilantro',quantity:1,unit:null,category:'Produce'}]}
  ]);
  assert.deepEqual(groceries,[
    {name:'black bean',quantity:2,unit:'cans',category:'Pantry',source_key:'black bean::cans'},
    {name:'cilantro',quantity:null,unit:null,category:'Produce',source_key:'cilantro::unspecified'},
    {name:'black bean',quantity:1,unit:'bag',category:'Pantry',source_key:'black bean::bag'}
  ]);
});

test('optional ingredients and salt or pepper staples stay off the grocery list',()=>{
  assert.deepEqual(shopping.consolidateGroceries([{ingredients:[
    {name:'kosher salt',quantity:1,unit:'tsp',category:'Pantry'},
    {name:'black pepper',quantity:1,unit:'tsp',category:'Pantry'},
    {name:'parsley, chopped',quantity:1,unit:'bunch',category:'Produce',optional:true}
  ]}]),[]);
});

test('plan rebuild refreshes generated amounts while preserving checked state',()=>{
  const groceries=shopping.reconcileGroceries([{
    id:'old',weekly_plan_id:'old-plan',name:'tomato',quantity:2,unit:'whole',category:'Produce',
    checked:true,source:'generated',source_key:'tomato::count',user_modified:false,deleted:false
  }],[{ingredients:[{name:'Diced tomatoes',quantity:3,unit:'whole',category:'Produce'}]}]);
  assert.deepEqual(groceries,[{
    name:'tomato',quantity:3,unit:'whole',category:'Produce',source_key:'tomato::count',
    checked:true,source:'generated',user_modified:false,deleted:false
  }]);
});

test('plan rebuild consolidates duplicate legacy rows with no source keys',()=>{
  /** @type {Array<Partial<import('../types.js').GroceryItem> & {source:string,source_key:string|null,user_modified:boolean,deleted:boolean}>} */
  const previous=[
    {name:'Fresh garlic, grated',quantity:2,unit:'cloves',category:'Produce',checked:true,source:'generated',source_key:null,user_modified:false,deleted:false},
    {name:'Garlic',quantity:3,unit:'cloves',category:'Produce',checked:true,source:'generated',source_key:null,user_modified:false,deleted:false},
    {name:'Garlic, minced',quantity:13,unit:'cloves',category:'Produce',checked:false,source:'generated',source_key:null,user_modified:false,deleted:false}
  ];
  const groceries=shopping.reconcileGroceries(previous,[{ingredients:[
    {name:'Fresh garlic, grated',quantity:2,unit:'cloves',category:'Produce'},
    {name:'Garlic',quantity:3,unit:'cloves',category:'Produce'},
    {name:'Garlic, minced',quantity:13,unit:'cloves',category:'Produce'}
  ]}]);
  assert.deepEqual(groceries,[{
    name:'garlic',quantity:2,unit:'bulbs',category:'Produce',source_key:'garlic::garlic-count',
    checked:false,source:'generated',user_modified:false,deleted:false
  }]);
});

test('plan rebuild keeps edits, manual additions, and deletion markers',()=>{
  /** @type {Array<Partial<import('../types.js').GroceryItem> & {source:string,source_key:string|null,user_modified:boolean,deleted:boolean}>} */
  const previous=[
    {name:'tomatoes for salsa',quantity:4,unit:'whole',category:'Produce',checked:false,source:'generated',source_key:'tomato::count',user_modified:true,deleted:false},
    {name:'olive oil',quantity:2,unit:'tbsp',category:'Pantry',checked:false,source:'generated',source_key:'olive oil::volume',user_modified:false,deleted:true},
    {name:'sparkling water',quantity:2,unit:'packs',category:'Other',checked:true,source:'manual',source_key:null,user_modified:true,deleted:false}
  ];
  const groceries=shopping.reconcileGroceries(previous,[{ingredients:[
    {name:'Diced tomatoes',quantity:2,unit:'whole',category:'Produce'},
    {name:'olive oil',quantity:1,unit:'tbsp',category:'Pantry'}
  ]}]);
  assert.deepEqual(groceries,previous);
});

test('edited generated item becomes manual if its recipe ingredient disappears',()=>{
  const groceries=shopping.reconcileGroceries([{
    name:'extra limes',quantity:6,unit:'whole',category:'Produce',checked:false,
    source:'generated',source_key:'lime::count',user_modified:true,deleted:false
  }],[]);
  assert.deepEqual(groceries,[{
    name:'extra limes',quantity:6,unit:'whole',category:'Produce',checked:false,
    source:'manual',source_key:null,user_modified:true,deleted:false
  }]);
});
