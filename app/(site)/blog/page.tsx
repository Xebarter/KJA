import { redirect } from "next/navigation";

export default function BlogPage() {
  redirect("/news?type=blog");
}
