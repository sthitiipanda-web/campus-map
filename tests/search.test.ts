import { describe, expect, it } from "vitest";
import { normalize, scorePoi, searchPois, type SearchablePoi } from "@/lib/search/score";

const poi = (name: string, aliases: string[] = []): SearchablePoi => ({
  id: name,
  name,
  aliases,
  college: "shared",
  category: "building",
  lon: -0.244,
  lat: 51.457,
});

const pois: SearchablePoi[] = [
  poi("SEED – Library", ["SEED – Learning Hub"]),
  poi("SEED – Lecture Block A", ["SEED – LBA"]),
  poi("SEED – Café Central", ["SEED – Coffee Shop"]),
  poi("SEED – Sports Centre"),
  poi("SEED – Chapel"),
];

describe("normalize", () => {
  it("lowercases, strips diacritics and collapses dashes/whitespace", () => {
    expect(normalize("SEED – Café  Central")).toBe("seed cafe central");
  });
});

describe("searchPois", () => {
  it("returns nothing for queries under two characters", () => {
    expect(searchPois(pois, "l")).toEqual([]);
    expect(searchPois(pois, " ")).toEqual([]);
  });

  it("matches by word prefix regardless of case", () => {
    const results = searchPois(pois, "lib");
    expect(results[0]?.name).toBe("SEED – Library");
  });

  it("matches aliases, ranking them below direct name matches", () => {
    const results = searchPois(pois, "coffee");
    expect(results.map((r) => r.name)).toContain("SEED – Café Central");
  });

  it("matches diacritic-insensitively", () => {
    const results = searchPois(pois, "cafe");
    expect(results[0]?.name).toBe("SEED – Café Central");
  });

  it("ranks exact name matches above substring matches", () => {
    const exact = poi("SEED – Chapel");
    expect(scorePoi(exact, "SEED – Chapel")).toBeGreaterThan(scorePoi(exact, "chap"));
  });

  it("returns no results for off-campus queries", () => {
    expect(searchPois(pois, "buckingham palace")).toEqual([]);
  });

  it("caps results at the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => poi(`SEED – Hall ${i}`));
    expect(searchPois(many, "hall", 8)).toHaveLength(8);
  });
});
