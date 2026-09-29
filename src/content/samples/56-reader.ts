// Unchanged. A bounded, single-process demo with at most 100 distinct keys.
// The three supplied files are the complete cache API and all its callers.
import { get } from "./cache";
export function sessionUser(token: string) {
  return get("session:" + token);
}
export function searchResult(query: string) {
  return get("search:" + query);
}
