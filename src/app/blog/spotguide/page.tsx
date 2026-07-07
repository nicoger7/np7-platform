import type { Metadata } from "next";
import { BlogIndexView } from "../blog-index";

export const metadata: Metadata = {
  title: "Spotguides — NP7 Magazine",
  description: "Windsurf spot guides from the NP7 crew — real conditions, honest calls, destination by destination.",
};

export const revalidate = 60;

export default function BlogSpotguideTab() {
  return <BlogIndexView world="experience" />;
}
