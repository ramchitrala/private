import { describe, expect, it } from "vitest";
import { checkProgramLink, isAggregator, isOnDomains, officialDomains, parseExtraLinks, registrableDomain } from "@/lib/domains";

describe("registrable domain", () => {
  it("reduces hosts to their registrable domain", () => {
    expect(registrableDomain("https://www.unh.edu/programs")).toBe("unh.edu");
    expect(registrableDomain("https://grad.unh.edu/apply")).toBe("unh.edu");
    expect(registrableDomain("https://www.scu.edu/business/ms/ms-information-systems/")).toBe("scu.edu");
    expect(registrableDomain("https://www.cs.ox.ac.uk/admissions")).toBe("ox.ac.uk");
    expect(registrableDomain("https://study.unimelb.edu.au/find/courses")).toBe("unimelb.edu.au");
    expect(registrableDomain("newhaven.edu/engineering")).toBe("newhaven.edu");
  });
  it("rejects things that are not public web hosts", () => {
    expect(registrableDomain("")).toBeNull();
    expect(registrableDomain("not a link")).toBeNull();
    expect(registrableDomain("http://192.168.1.4/page")).toBeNull();
    expect(registrableDomain("http://localhost:3000")).toBeNull();
    expect(registrableDomain("ftp://unh.edu/file")).toBeNull();
  });
});

describe("aggregator detection", () => {
  it.each(["yocket.com", "shiksha.com", "leverageedu.com", "reddit.com", "medium.com", "wordpress.com"])("flags %s", (d) => {
    expect(isAggregator(d)).toBe(true);
  });
  it("refuses aggregator links, including subdomains", () => {
    for (const url of ["https://yocket.com/universities/scu", "https://www.shiksha.com/studyabroad/usa", "https://old.reddit.com/r/gradadmissions", "https://someone.medium.com/my-sop"]) {
      const r = checkProgramLink(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("aggregator");
    }
  });
  it("accepts university sites", () => {
    for (const url of ["https://www.scu.edu/business/ms/ms-information-systems/", "https://www.newhaven.edu/engineering/graduate-programs/cybersecurity/", "https://www.imperial.ac.uk/study/courses/", "https://www.uni-heidelberg.de/en/study"]) {
      expect(checkProgramLink(url).ok).toBe(true);
    }
  });
  it("stops and asks when it cannot tell, until the user confirms the domain", () => {
    const r = checkProgramLink("https://www.mcgill.ca/gradapplicants/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsure");
    expect(checkProgramLink("https://www.mcgill.ca/gradapplicants/", ["mcgill.ca"]).ok).toBe(true);
    // Confirming never unlocks an aggregator.
    expect(checkProgramLink("https://yocket.com/x", ["yocket.com"]).ok).toBe(false);
  });
  it("rejects invalid links", () => {
    const r = checkProgramLink("hello there");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
  });
});

describe("official domains", () => {
  it("is the program link's domain plus the extra official links' domains", () => {
    expect(officialDomains("https://www.unh.edu/x", ["https://grad.unh.edu/y", "https://catalog.example.edu/z", "https://reddit.com/r/x"])).toEqual(["unh.edu", "example.edu"]);
  });
  it("parses the extra links box and rejects aggregators", () => {
    const r = parseExtraLinks("https://grad.unh.edu/apply\nyocket.com/unh, https://www.unh.edu/faq");
    expect(r.urls).toEqual(["https://grad.unh.edu/apply", "https://www.unh.edu/faq"]);
    expect(r.rejected).toEqual(["yocket.com/unh"]);
  });
  it("checks page URLs against the official list", () => {
    expect(isOnDomains("https://grad.unh.edu/a.pdf", ["unh.edu"])).toBe(true);
    expect(isOnDomains("https://unh.edu.evil.com/a", ["unh.edu"])).toBe(false);
  });
});
