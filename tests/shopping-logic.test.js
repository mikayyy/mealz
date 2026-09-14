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
