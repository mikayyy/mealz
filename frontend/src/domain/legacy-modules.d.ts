// Narrow declarations for existing UMD/CommonJS boundaries. Behavior remains
// covered by the root domain tests and the frontend's served-build tests.
declare module "@mealz/week-logic" {
  const logic: {
    currentWeekStart(date?: Date): string;
    nextWeekStart(date?: Date): string;
    addDays(date: Date, days: number): Date;
    isoLocal(date: Date): string;
  };
  export default logic;
}

declare module "@mealz/shopping-logic" {
  const shopping: {
    consolidateGroceries(meals: import("../../../types").Meal[]): Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      category: import("../../../types").GroceryCategory;
      source_key: string;
    }>;
    shoppingCategory(
      category: string,
    ): import("../../../types").ShoppingCategory;
    isSundry(name: string): boolean;
    SHOPPING_CATEGORY_ORDER: import("../../../types").ShoppingCategory[];
  };
  export default shopping;
}
