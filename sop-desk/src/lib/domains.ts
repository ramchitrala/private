import { parse } from "tldts";

/**
 * Sites that list or discuss programs but are not the university itself.
 * A link on one of these is never accepted as the official program page.
 */
const AGGREGATOR_DOMAINS = [
  "yocket.com",
  "yocket.in",
  "shiksha.com",
  "leverageedu.com",
  "reddit.com",
  "quora.com",
  "collegedunia.com",
  "careers360.com",
  "gradcafe.com",
  "thegradcafe.com",
  "mastersportal.com",
  "bachelorsportal.com",
  "phdportal.com",
  "studyportals.com",
  "topuniversities.com",
  "timeshighereducation.com",
  "usnews.com",
  "niche.com",
  "petersons.com",
  "gradschools.com",
  "idp.com",
  "hotcourses.com",
  "hotcoursesabroad.com",
  "collegevine.com",
  "collegeboard.org",
  "princetonreview.com",
  "findamasters.com",
  "educations.com",
  "keystoneacademic.com",
  "masterstudies.com",
  "edx.org",
  "coursera.org",
  "linkedin.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "medium.com",
  "substack.com",
  "wikipedia.org",
  "wordpress.com",
  "blogspot.com",
  "github.io",
  "google.com",
  "bing.com",
  "amberstudent.com",
  "upgrad.com",
  "gyandhan.com",
  "admitkard.com",
  "ambitio.club",
  "zollege.in",
  "getmyuni.com",
  "applyboard.com",
  "studyabroad.com",
  "crimsoneducation.org",
];

export type LinkCheck =
  | { ok: true; url: string; domain: string }
  | { ok: false; reason: "invalid" | "aggregator" | "unsure"; message: string };

function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** The registrable domain ("grad.unh.edu" -> "unh.edu"), or null when there is none. */
export function registrableDomain(raw: string): string | null {
  const u = toUrl(raw);
  if (!u) return null;
  const p = parse(u.hostname);
  if (!p.domain || p.isIp || !p.isIcann) return null;
  return p.domain.toLowerCase();
}

export function isAggregator(domain: string): boolean {
  return AGGREGATOR_DOMAINS.includes(domain.toLowerCase());
}

/** Academic suffixes and name patterns that mark a university's own site. */
function looksAcademic(hostname: string, domain: string): boolean {
  const suffix = parse(hostname).publicSuffix ?? "";
  if (/(^|\.)(edu|ac)(\.|$)/.test(suffix)) return true; // .edu, .edu.au, .ac.uk, .ac.in
  const label = domain.split(".")[0];
  if (/universit|univ|college|institut|polytech|hochschule|school|academy/.test(label)) return true;
  if (/^(uni|tu|fh|hs)-/.test(label)) return true; // uni-heidelberg.de, tu-berlin.de
  return false;
}

/**
 * Decide whether a link can be used as the official program page.
 * Unknown commercial-looking domains are refused rather than guessed at:
 * the user can add the domain as an extra official link to confirm it.
 */
export function checkProgramLink(raw: string, confirmedDomains: string[] = []): LinkCheck {
  const u = toUrl(raw);
  const domain = u ? registrableDomain(u.href) : null;
  if (!u || !domain) {
    return { ok: false, reason: "invalid", message: "That doesn't look like a web link. Paste the full address of the program page." };
  }
  if (isAggregator(domain)) {
    return {
      ok: false,
      reason: "aggregator",
      message: `${domain} is a listing or discussion site, not the university. Paste the program page from the university's own website.`,
    };
  }
  if (looksAcademic(u.hostname, domain) || confirmedDomains.includes(domain)) {
    return { ok: true, url: u.href, domain };
  }
  return {
    ok: false,
    reason: "unsure",
    message: `I can't tell whether ${domain} is the university's own website. Paste the official program page, or confirm this domain is official.`,
  };
}

/** Parse the "extra official links" box: one link per line or comma-separated. */
export function parseExtraLinks(raw: string): { urls: string[]; rejected: string[] } {
  const urls: string[] = [];
  const rejected: string[] = [];
  for (const part of raw.split(/[\s,]+/).filter(Boolean)) {
    const u = toUrl(part);
    const d = u ? registrableDomain(u.href) : null;
    if (!u || !d || isAggregator(d)) rejected.push(part);
    else urls.push(u.href);
  }
  return { urls, rejected };
}

/** Official domains: the program link's registrable domain plus those of the extra links. */
export function officialDomains(programUrl: string, extraUrls: string[]): string[] {
  const out: string[] = [];
  for (const raw of [programUrl, ...extraUrls]) {
    const d = registrableDomain(raw);
    if (d && !isAggregator(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

export function isOnDomains(url: string, domains: string[]): boolean {
  const d = registrableDomain(url);
  return !!d && domains.includes(d);
}
