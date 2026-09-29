import { useEffect, useState } from "react";

export type Route =
  | { view: "home" }
  | { view: "lesson"; id: string }
  | { view: "drill"; id: number }
  | { view: "drills" }
  | { view: "gotchas"; lang?: string }
  | { view: "timed" }
  | { view: "progress" };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { view: "home" };

  switch (parts[0]) {
    case "lesson":
      return parts[1] ? { view: "lesson", id: parts[1] } : { view: "home" };
    case "drill": {
      const n = Number(parts[1]);
      return Number.isInteger(n) ? { view: "drill", id: n } : { view: "drills" };
    }
    case "drills":
      return { view: "drills" };
    case "gotchas":
      return { view: "gotchas", lang: parts[1] };
    case "timed":
      return { view: "timed" };
    case "progress":
      return { view: "progress" };
    default:
      return { view: "home" };
  }
}

export function href(r: Route): string {
  switch (r.view) {
    case "home":
      return "#/";
    case "lesson":
      return `#/lesson/${encodeURIComponent(r.id)}`;
    case "drill":
      return `#/drill/${r.id}`;
    case "drills":
      return "#/drills";
    case "gotchas":
      return r.lang ? `#/gotchas/${encodeURIComponent(r.lang)}` : "#/gotchas";
    case "timed":
      return "#/timed";
    case "progress":
      return "#/progress";
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function go(r: Route): void {
  window.location.hash = href(r);
}
