/** Shared class strings for capture-flow buttons (pill system, docs/DESIGN.md section 4). */
const base = "group/button h-11 rounded-full px-5 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.97]";

export const pillPrimary = `${base} bg-ink text-paper hover:bg-ink-2`;
export const pillOnInk = `${base} bg-lime text-ink hover:bg-lime/90`;
export const pillOutline = `${base} border border-hairline bg-transparent text-ink hover:bg-paper-3`;
export const pillOutlineOnInk = `${base} border border-ink-3 bg-transparent text-paper hover:bg-ink-2 hover:text-paper`;
/** Arrow icon that nudges right on hover of the parent button. */
export const arrowNudge = "transition-transform duration-150 group-hover/button:translate-x-1";
