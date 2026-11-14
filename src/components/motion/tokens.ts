export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;
export const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
export const DUR = { micro: 0.15, base: 0.4, reveal: 0.6, draw: 1.2, count: 1.4 } as const;
export const STAGGER = 0.06;
