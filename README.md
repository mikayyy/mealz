# Mealz v0.2

## New in v0.2
- Editable weekly household size
- Toggle kitchen equipment on/off
- AI-generated meals and recipes
- Grocery list derived from recipe ingredients
- Checked grocery items move to the bottom of their category
- Browser persistence for settings, plan, and checked items
- Secure Vercel API function for OpenAI

## Equipment seeded
Instant Pot, air fryer attachment, oven, Tovala smart oven, standalone griddle, cast iron pans, KitchenAid mixer, food processor.

## Configure AI in Vercel
Go to Settings → Environment Variables and add `OPENAI_API_KEY` with your OpenAI API key, then redeploy. Optional: set `OPENAI_MODEL` to `gpt-5.6-luna`.

Never place an API key in browser code or GitHub.

## Current limitations
- No login/Supabase yet
- Settings persist only in the current browser/device
- No meal swap yet
- No live retailer inventory or prices
