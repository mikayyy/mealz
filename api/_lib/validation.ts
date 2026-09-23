/// <reference types="../../types.d.ts" />
const DAYS=new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
/**
 * @param {unknown} days
 * @returns {days is DayName[]}
 */
export function validCookingDays(days){return Array.isArray(days)&&days.length>0&&days.length<=7&&new Set(days).size===days.length&&days.every(day=>DAYS.has(day))}
