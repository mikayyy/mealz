import type { GroceryItem, Meal } from "../../../types";
import { shopping, weeks } from "../domain/legacy";

export interface SavedWeek {
  id: string;
  weekStart: string;
  householdSize: number;
  meals: Meal[];
  groceries: GroceryItem[];
}

const meals: Meal[] = [
  {
    id: "lemon-chicken",
    day: "Monday",
    title: "Lemon chicken pita bowls",
    description:
      "Roasted chicken, crisp cucumber, and lemon yogurt. Everything at the table, ready to build your own.",
    emoji: "",
    servings: 5,
    total_minutes: 30,
    difficulty: "Easy",
    tags: ["Sheet pan", "Kid friendly"],
    kid_note:
      "Serve chicken, pita, and cucumber separately, with yogurt on the side.",
    ingredients: [
      {
        name: "chicken thighs",
        quantity: 1.5,
        unit: "lb",
        category: "Meat & Seafood",
        optional: false,
      },
      {
        name: "diced cucumber",
        quantity: 1,
        unit: "whole",
        category: "Produce",
        optional: false,
      },
      {
        name: "Greek yogurt",
        quantity: 1,
        unit: "cup",
        category: "Dairy & Eggs",
        optional: false,
      },
      {
        name: "lemon",
        quantity: 1,
        unit: "whole",
        category: "Produce",
        optional: false,
      },
      {
        name: "pita bread",
        quantity: 5,
        unit: "whole",
        category: "Bakery",
        optional: false,
      },
      {
        name: "olive oil",
        quantity: 1,
        unit: "tbsp",
        category: "Pantry",
        optional: false,
      },
    ],
    steps: [
      "Heat the oven to 425°F. Toss chicken with olive oil, half the lemon juice, salt, and pepper.",
      "Roast chicken until the thickest part reaches 165°F, about 20–25 minutes. Rest, then slice.",
      "Mix yogurt with the remaining lemon juice. Chop the cucumber and warm the pita.",
      "Serve everything in bowls, with lemon yogurt alongside.",
    ],
  },
  {
    id: "teriyaki-salmon",
    day: "Wednesday",
    title: "Teriyaki salmon & rice",
    description:
      "A quick salmon dinner with broccoli and a cool cucumber salad.",
    emoji: "",
    servings: 5,
    total_minutes: 25,
    difficulty: "Easy",
    tags: ["Quick dinner"],
    kid_note: "Offer sauce separately for a milder plate.",
    ingredients: [
      {
        name: "salmon fillets",
        quantity: 1.5,
        unit: "lb",
        category: "Meat & Seafood",
        optional: false,
      },
      {
        name: "sliced cucumber",
        quantity: 1,
        unit: "whole",
        category: "Produce",
        optional: false,
      },
      {
        name: "broccoli",
        quantity: 2,
        unit: "whole",
        category: "Produce",
        optional: false,
      },
      {
        name: "rice",
        quantity: 2,
        unit: "cup",
        category: "Pantry",
        optional: false,
      },
      {
        name: "teriyaki sauce",
        quantity: 0.25,
        unit: "cup",
        category: "Pantry",
        optional: false,
      },
    ],
    steps: [
      "Cook rice according to the package instructions.",
      "Heat the oven to 400°F. Place salmon and broccoli on a sheet pan and brush salmon with sauce.",
      "Roast until salmon reaches 145°F and broccoli is tender, about 12–18 minutes.",
      "Slice cucumber and serve with the salmon, broccoli, and rice.",
    ],
  },
  {
    id: "turkey-meatballs",
    day: "Friday",
    title: "Turkey meatballs & couscous",
    description:
      "Golden meatballs, fluffy couscous, and a little extra time back in your evening.",
    emoji: "",
    servings: 5,
    total_minutes: 35,
    difficulty: "Easy",
    tags: ["Family favorite"],
    kid_note: null,
    ingredients: [
      {
        name: "ground turkey",
        quantity: 1.5,
        unit: "lb",
        category: "Meat & Seafood",
        optional: false,
      },
      {
        name: "egg",
        quantity: 1,
        unit: "whole",
        category: "Dairy & Eggs",
        optional: false,
      },
      {
        name: "breadcrumbs",
        quantity: 0.5,
        unit: "cup",
        category: "Pantry",
        optional: false,
      },
      {
        name: "couscous",
        quantity: 1.5,
        unit: "cup",
        category: "Pantry",
        optional: false,
      },
      {
        name: "carrots",
        quantity: 1,
        unit: "lb",
        category: "Produce",
        optional: false,
      },
      {
        name: "olive oil",
        quantity: 1,
        unit: "tbsp",
        category: "Pantry",
        optional: false,
      },
    ],
    steps: [
      "Heat the oven to 425°F. Mix turkey, egg, breadcrumbs, salt, and pepper; shape into small meatballs.",
      "Arrange meatballs and sliced carrots on a sheet pan. Drizzle carrots with olive oil.",
      "Bake until meatballs reach 165°F and carrots are tender, about 20–25 minutes.",
      "Prepare couscous following the package instructions and serve alongside.",
    ],
  },
];

export function createDemoWeeks(): SavedWeek[] {
  return [weeks.currentWeekStart(), weeks.nextWeekStart()].map(
    (weekStart, index) => {
      const weekMeals = structuredClone(
        index === 0 ? meals : meals.slice(0, 2),
      );
      const id = `demo-${weekStart}`;
      return {
        id,
        weekStart,
        householdSize: 5,
        meals: weekMeals,
        groceries: shopping
          .consolidateGroceries(weekMeals)
          .map((item, itemIndex) => ({
            ...item,
            id: `${id}-item-${itemIndex}`,
            weekly_plan_id: id,
            checked: false,
            needed_this_week: false,
            source: "generated",
            user_modified: false,
            deleted: false,
            created_at: "",
            updated_at: "",
          })),
      };
    },
  );
}
