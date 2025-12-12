declare module 'is-plain-object/dist/is-plain-object.mjs' {
  export function isPlainObject(value: unknown): value is Record<string, unknown>;
  const isPlainObjectDefault: typeof isPlainObject;
  export default isPlainObjectDefault;
}

declare module 'is-plain-object' {
  export * from 'is-plain-object/dist/is-plain-object.mjs';
  export { default } from 'is-plain-object/dist/is-plain-object.mjs';
}
