import { randomUUID } from "node:crypto";

// Branded id types: a `PersonId` is not assignable to a `CcoupleId` even though
// both are strings. Prevents whole classes of "passed the wrong id" bugs in
// clinical code without runtime cost.
declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };
export type Id<B extends string> = Brand<string, B>;

export function newId<B extends string>(): Id<B> {
  return randomUUID() as Id<B>;
}

/** Wrap an existing string (e.g. from the DB) as a branded id. */
export function asId<B extends string>(value: string): Id<B> {
  return value as Id<B>;
}
