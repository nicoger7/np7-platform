import type { Metadata } from "next";
import { BlogIndexView } from "../blog-index";

export const metadata: Metadata = {
  title: "Spotguides — Magazine",
  description: "Windsurf spot guides from the NP7 crew — real conditions, honest calls, destination by destination.",
  alternates: { canonical: "/blog/spotguide" },
};

export const revalidate = 3600;

export default function BlogSpotguideTab() {
  return <BlogIndexView world="experience" />;
}
