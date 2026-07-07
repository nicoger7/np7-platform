import type { Metadata } from "next";
import { BlogIndexView } from "../blog-index";

export const metadata: Metadata = {
  title: "Gear — NP7 Magazine",
  description: "Gear guides, reviews and comparisons — windsurf equipment explained by Nico Prien (GER-7) and the NP7 crew.",
};

export const revalidate = 60;

export default function BlogGearTab() {
  return <BlogIndexView world="hardware" />;
}
