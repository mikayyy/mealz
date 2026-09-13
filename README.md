# Mealz v0.1 Prototype

This is a simple mobile-first prototype for the Mealz meal-planning app.

## What works
- Select cooking days
- Enter ingredients to use up
- Enter weekly notes
- View a sample meal plan
- Open recipes
- Check grocery items off
- Navigate between Plan, Meals, and Groceries

## What is intentionally fake in v0.1
- Meals are sample data, not AI-generated
- No database or login
- No persistent storage after page refresh
- Swap-a-meal and cooking mode are placeholders

## How to run
Simplest option:
1. Unzip the folder.
2. Open `index.html` in a browser.

For a better local experience, run a simple static server from the folder:
- Python: `python -m http.server 8000`
Then visit `http://localhost:8000`.

## Next milestone
v0.2 should connect the planning form to the OpenAI API and return structured meal-plan data.
