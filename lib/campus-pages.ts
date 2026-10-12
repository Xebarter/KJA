import { readFileSync } from "fs";
import path from "path";

export type CampusCard = { title: string; href: string; image_url: string };
export type CampusDetailItem = { title: string; body_html: string };

export type CampusSectionBlock =
  | { kind: "welcome"; title_html: string; body_html: string; image_url: string | null }
  | { kind: "clubs"; title_html: string; intro_html: string; items: CampusCard[] }
  | { kind: "facilities"; title_html: string; items: CampusCard[] }
  | {
      kind: "culture";
      title_html: string;
      body_html: string;
      image_url: string | null;
      ratio_label: string;
      ratio_value: string;
    }
  | {
      kind: "details";
      padding: string;
      title_html: string | null;
      title_class: string | null;
      intro: string | null;
      image_url: string | null;
      items: CampusDetailItem[];
    };

export type CampusPage = { hero_images: string[]; sections: CampusSectionBlock[]; closing_html: string };

export type CampusPost = {
  slug: string;
  title: string;
  published_at: string | null;
  updated_at: string | null;
  author: string | null;
  image_url: string | null;
  body_html: string;
  prev: string | null;
  next: string | null;
};

export type CampusPostKind = "campus-co-curricular" | "campus-facility";

export type CampusDataFile = {
  campuses: Record<string, CampusPage>;
  "campus-co-curricular": Record<string, CampusPost>;
  "campus-facility": Record<string, CampusPost>;
};

export function campusDataPath() {
  return path.join(process.cwd(), "data", "campus-pages.json");
}

export function loadCampusData(): CampusDataFile {
  return JSON.parse(readFileSync(campusDataPath(), "utf8")) as CampusDataFile;
}

export function getCampusPage(slug: string): CampusPage | null {
  return loadCampusData().campuses[slug] ?? null;
}

export function getCampusPost(kind: CampusPostKind, slug: string): CampusPost | null {
  return loadCampusData()[kind][slug] ?? null;
}
