import type { Json } from './types';

/** Match the JSON request boundary, including omitted undefined object fields. */
export function toJson(value: unknown): Json {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError('El valor no se puede serializar como JSON.');
  }
  // JSON.parse of the serializer's output can only produce a JSON value.
  return JSON.parse(serialized);
}
