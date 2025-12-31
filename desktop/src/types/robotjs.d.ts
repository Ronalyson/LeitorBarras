declare module 'robotjs' {
  export function typeString(text: string): void;
  export function keyTap(key: string, modifier?: string | string[]): void;
  export function setKeyboardDelay(delay: number): void;
}
