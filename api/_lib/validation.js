const DAYS=new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
export function validCookingDays(days){return Array.isArray(days)&&days.length>0&&days.length<=7&&new Set(days).size===days.length&&days.every(day=>DAYS.has(day))}
