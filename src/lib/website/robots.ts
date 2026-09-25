import "server-only";

/** Eerlijke, herkenbare user-agent — we doen niet alsof we een browser zijn. */
export const BOT_USER_AGENT_HEADER = "OutboundListAI-WebsiteIntelligence/1.0";
const BOT_USER_AGENT_TOKEN = "outboundlistai";

export interface RobotsRules {
  isAllowed(path: string): boolean;
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

export function allowAllRobots(): RobotsRules {
  return ALLOW_ALL;
}

interface RobotsRule {
  path: string;
  allow: boolean;
}

interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

function parseGroups(content: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRuleSinceUserAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      if (current && sawRuleSinceUserAgent) {
        groups.push(current);
        current = null;
      }
      if (!current) {
        current = { userAgents: [], rules: [] };
        sawRuleSinceUserAgent = false;
      }
      current.userAgents.push(value.toLowerCase());
    } else if (key === "disallow" && current) {
      current.rules.push({ path: value, allow: value === "" });
      sawRuleSinceUserAgent = true;
    } else if (key === "allow" && current) {
      current.rules.push({ path: value, allow: true });
      sawRuleSinceUserAgent = true;
    } else if (current) {
      // Overige directives (crawl-delay, sitemap, ...) negeren we bewust.
      sawRuleSinceUserAgent = true;
    }
  }
  if (current) groups.push(current);
  return groups;
}

function patternToRegex(pattern: string): RegExp {
  const endAnchor = pattern.endsWith("$");
  const base = endAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${endAnchor ? "$" : ""}`);
}

/** Standaard robots.txt-precedentie: de langste (meest specifieke) matchende regel wint; bij gelijke lengte wint Allow. */
function isPathAllowed(path: string, rules: RobotsRule[]): boolean {
  let best: RobotsRule | null = null;

  for (const rule of rules) {
    if (rule.path === "") {
      if (!best) best = { path: "", allow: true };
      continue;
    }
    if (!patternToRegex(rule.path).test(path)) continue;

    const isMoreSpecific =
      !best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow && !best.allow);
    if (isMoreSpecific) best = rule;
  }

  return best ? best.allow : true;
}

/**
 * Parseert robots.txt-inhoud en geeft de regels terug die voor óns
 * user-agent gelden: eerst een groep die specifiek onze naam noemt,
 * anders de `*`-groep, anders (geen enkele groep) alles toegestaan.
 */
export function parseRobotsTxt(content: string): RobotsRules {
  const groups = parseGroups(content);
  const specific = groups.find((group) => group.userAgents.some((ua) => ua.includes(BOT_USER_AGENT_TOKEN)));
  const wildcardRules = groups.filter((group) => group.userAgents.includes("*")).flatMap((group) => group.rules);
  const rules = specific ? specific.rules : wildcardRules;

  if (rules.length === 0) return ALLOW_ALL;

  return {
    isAllowed(path: string) {
      return isPathAllowed(path, rules);
    },
  };
}

export interface FetchRobotsDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Haalt robots.txt op voor een origin. Bij elke fout (geen robots.txt,
 * timeout, netwerkfout) is de conventie: alles toegestaan — een
 * ontbrekend of onbereikbaar robots.txt-bestand is geen verbod. Alleen
 * een succesvol opgehaald bestand met een expliciete disallow-regel
 * blokkeert daadwerkelijk.
 */
export async function fetchRobotsTxt(origin: string, deps: FetchRobotsDeps = {}): Promise<RobotsRules> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(new URL("/robots.txt", origin).toString(), {
      signal: controller.signal,
      headers: { "User-Agent": BOT_USER_AGENT_HEADER },
    });
    if (!response.ok) return ALLOW_ALL;
    const text = await response.text();
    return parseRobotsTxt(text);
  } catch {
    return ALLOW_ALL;
  } finally {
    clearTimeout(timer);
  }
}
