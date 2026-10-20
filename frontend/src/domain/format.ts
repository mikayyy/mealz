import type { Ingredient } from "../../../types";

export function weekLabel(start: string) {
  const [year = 2000, month = 1, day = 1] = start.split("-").map(Number);
  const first = new Date(year, month - 1, day);
  const last = new Date(year, month - 1, day + 6);
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${format.format(first)} – ${format.format(last)}`;
}

export function ingredientLabel(
  item: Pick<Ingredient, "quantity" | "unit" | "name">,
) {
  return [item.quantity, item.unit, item.name]
    .filter((value) => value !== null && value !== "")
    .join(" ");
}
