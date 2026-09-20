import { vi } from "vitest";

// `server-only` gooit altijd buiten Next.js' eigen "react-server"
// bundler-conditie (dus ook in Vitest). We vervangen het hier door een
// no-op zodat server-only modules getest kunnen worden; de echte
// build-time garantie in de Next.js-app blijft intact.
vi.mock("server-only", () => ({}));
