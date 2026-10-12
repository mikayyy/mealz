# v0.23.0 real AI recipe smoke test

Verified 2026-10-11 against the local candidate, real local Supabase Auth/PostgREST, and the real OpenAI Responses API. This is one recipe-generation check; it is not deployed Vercel or full-week timing evidence.

- Result: HTTP 200; all recipe validations passed.
- Generation duration: 8,936 ms, within the 50,000 ms request budget.
- Provider attempts: one; no retry was needed. The runner allowed at most two attempts and at most 3,500 output tokens per attempt.
- Model: `gpt-5.6-luna`, the application's existing default.
- Request ID: `fafa50fa-0b94-484b-ad04-55fe85e08247`.
- Recipe: Chicken and Vegetable Rice Bowls; four servings, 13 ingredients and seven nonempty steps. Requested day and serving count matched. No beef, pork, bacon, ham or mushrooms appeared in the returned ingredient names.
- Usage reported by the provider: 430 input tokens and 719 output tokens.
- Standard token-rate estimate: approximately $0.00095 using $0.20/million input and $1.20/million output tokens. This is an estimate from reported usage, not an invoice. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
- Saved test week: identical before and after generation. No recipe or grocery save was submitted.
- Production database and deployment: unchanged. The ordinary local app remains AI-disabled.
- Temporary key file: deleted after the test; cleanup independently verified. No key value was logged, committed or sent to GitHub.

## Reproducibility and limits

`scripts/verify-live-recipe.mjs` defaults to a readiness check that makes no OpenAI call. A paid run requires explicit `--run`, a temporary ignored credential file, and real local test-account authentication. An ignored one-shot marker prevents another paid invocation without reviewing the prior evidence and renewing authorization. Network destinations are restricted to the local Supabase API and the OpenAI Responses endpoint; credentials are removed in `finally` on success or failure. The script validates the recipe shape and compares the saved week before/after. Detailed output and the readable recipe are retained only under ignored `.local/`.

Vercel's saved sensitive variable did not return a readable key. The user supplied a test key locally after approving temporary secret handling. Earlier credential preparation attempts made zero OpenAI requests; the successful run above made one.

This one result does not establish consistent recipe quality, dietary/allergen safety, culinary results, successful seven-recipe fan-out, swap/ideas performance, a live retry or timeout response, or deployed Vercel timing. Those relevant release checks remain open. Keep PR #22 draft until the remaining acceptance and coordinated production rollout are reviewed.
