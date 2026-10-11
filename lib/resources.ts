export type Field = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "checkbox" | "number";
};

export const resources: Record<string, { label: string; fields: Field[] }> = {
  pages: { label: "Pages", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" },
    { name: "excerpt", label: "Excerpt", type: "textarea" }, { name: "body", label: "Body", type: "textarea" },
    { name: "image_url", label: "Image URL" }, { name: "seo_description", label: "SEO description", type: "textarea" },
    { name: "author", label: "Author" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  campuses: { label: "Campuses", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" },
    { name: "excerpt", label: "Excerpt", type: "textarea" }, { name: "body", label: "Body", type: "textarea" },
    { name: "image_url", label: "Image URL" }, { name: "seo_description", label: "SEO description", type: "textarea" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  campus_sections: { label: "Campus sections", fields: [
    { name: "title", label: "Title" }, { name: "campus_slug", label: "Campus slug" }, { name: "kind", label: "Kind" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "sort_order", label: "Order", type: "number" },
  ]},
  teachers: { label: "Teachers", fields: [
    { name: "title", label: "Name" }, { name: "slug", label: "Slug" }, { name: "role", label: "Role" },
    { name: "excerpt", label: "Excerpt", type: "textarea" }, { name: "body", label: "Bio", type: "textarea" },
    { name: "image_url", label: "Image URL" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  events: { label: "Events", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "location", label: "Campus / location" },
    { name: "starts_on", label: "Date", type: "date" }, { name: "start_time", label: "Start time" }, { name: "end_time", label: "End time" },
    { name: "excerpt", label: "Excerpt", type: "textarea" }, { name: "body", label: "Body", type: "textarea" },
    { name: "image_url", label: "Image URL" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  news: { label: "News", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "author", label: "Author" },
    { name: "published_at", label: "Published at" }, { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "seo_description", label: "SEO description", type: "textarea" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  posts: { label: "Blog", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "author", label: "Author" },
    { name: "published_at", label: "Published at" }, { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  gallery_items: { label: "Gallery", fields: [
    { name: "title", label: "Title" }, { name: "image_url", label: "Image URL" },
    { name: "sort_order", label: "Order", type: "number" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  testimonials: { label: "Testimonials", fields: [
    { name: "name", label: "Name" }, { name: "role", label: "Role" }, { name: "quote", label: "Quote", type: "textarea" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  alumni_news: { label: "Alumni news", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  alumni_events: { label: "Alumni events", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "starts_on", label: "Date", type: "date" },
    { name: "location", label: "Location" }, { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  alumni_stories: { label: "Alumni stories", fields: [
    { name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "body", label: "Body", type: "textarea" }, { name: "image_url", label: "Image URL" },
    { name: "published", label: "Published", type: "checkbox" },
  ]},
  alumni_profiles: { label: "Alumni profiles", fields: [
    { name: "title", label: "Name" }, { name: "slug", label: "Slug" }, { name: "role", label: "Role" },
    { name: "excerpt", label: "Excerpt", type: "textarea" }, { name: "body", label: "Body", type: "textarea" },
    { name: "image_url", label: "Image URL" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  alumni_photos: { label: "Alumni photos", fields: [
    { name: "title", label: "Title" }, { name: "image_url", label: "Image URL" },
    { name: "sort_order", label: "Order", type: "number" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
  vacancies: { label: "Vacancies", fields: [
    { name: "title", label: "Title" }, { name: "location", label: "Location" }, { name: "closes_on", label: "Closes", type: "date" },
    { name: "body", label: "Body", type: "textarea" }, { name: "published", label: "Published", type: "checkbox" },
  ]},
};

export const resourceOrder = Object.keys(resources);
