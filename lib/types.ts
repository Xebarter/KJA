export type Slide = { image_url: string; title: string };
export type Feature = { title: string; icon: string; href?: string };
export type Counter = { value: number; label: string; icon: string };
export type Social = { label: string; href: string; icon: string };

export type Settings = {
  phone: string;
  email: string;
  address: string;
  map_url: string;
  footer_text: string;
  video_url: string;
  about_title: string;
  about_body: string;
  vision: string;
  mission: string;
  campuses_intro: string;
  counters: Counter[];
  hero_slides: Slide[];
  features: Feature[];
  choose_items: Feature[];
  socials: Social[];
  popup_enabled: boolean;
  popup_title: string;
  popup_body: string;
  popup_cta_label: string;
  popup_cta_href: string;
};

export type Article = {
  id?: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  author?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  published?: boolean;
  featured?: boolean | null;
  role?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
};

export type GalleryItem = {
  id?: string;
  title: string;
  image_url?: string | null;
  sort_order?: number;
  published?: boolean;
};

export type CampusSection = {
  id?: string;
  campus_slug?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  image_url?: string | null;
  sort_order?: number;
};

export type Testimonial = {
  id?: string;
  name: string;
  quote?: string | null;
  role?: string | null;
  published?: boolean;
};

export type Vacancy = {
  id?: string;
  title: string;
  body?: string | null;
  location?: string | null;
  closes_on?: string | null;
  published?: boolean;
};

export type SiteContent = {
  settings: Settings;
  pages: Article[];
  campuses: Article[];
  teachers: Article[];
  events: Article[];
  news: Article[];
  posts: Article[];
  gallery: GalleryItem[];
  testimonials: Testimonial[];
  alumni_news: Article[];
  alumni_events: Article[];
  alumni_stories: Article[];
  alumni_profiles: Article[];
  alumni_photos: GalleryItem[];
  campus_sections: CampusSection[];
  vacancies: Vacancy[];
};
