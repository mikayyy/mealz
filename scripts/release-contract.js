/** Validate current declarations instead of accepting historical mentions. */
export function validateRelease({pkg,html,readme,changelog}) {
  const version = pkg.version;
  const state = pkg.release?.state;
  const sections = [...readme.matchAll(/^## Current release\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  const current = sections[0]?.[1].trim() || '';
  const heading = [...changelog.matchAll(/^## (.+)$/gm)][0]?.[1].trim() || '';
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match=>match[1]).filter(src=>src.includes('@supabase/supabase-js'));
  return [
    {name:'Valid version and release state',pass:/^\d+\.\d+\.\d+$/.test(version) && ['candidate','released'].includes(state)},
    {name:'Exact HTML title',pass:html.match(/<title>([^<]+)<\/title>/)?.[1] === `mealz v${version}`},
    {name:'Unique Current release declares version',pass:sections.length === 1 && current.startsWith(`**v${version}** `)},
    {name:'README declares intended release state',pass:current.startsWith(`**v${version}** (${state === 'candidate' ? 'release candidate; unreleased' : 'released'})`)},
    {name:'Newest changelog declares version and state',pass:state === 'candidate' ? heading === `v${version} — release candidate (unreleased)` : new RegExp(`^v${version.replaceAll('.', '\\.')} — \\d{4}-\\d{2}-\\d{2}(?: · .+)?$`).test(heading)},
    {name:'All Supabase SDK scripts are pinned',pass:scripts.length > 0 && scripts.every(src=>/@supabase\/supabase-js@\d+\.\d+\.\d+(?:\/|$)/.test(src))}
  ];
}
