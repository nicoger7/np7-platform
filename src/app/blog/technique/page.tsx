import type { Metadata } from "next";
import { BlogIndexView } from "../blog-index";

export const metadata: Metadata = {
  title: "Technique — NP7 Magazine",
  description: "Technique guides and masterclasses — learn windsurfing skills step by step with the NP7 crew.",
};

export const revalidate = 60;

export default function BlogTechniqueTab() {
  return <BlogIndexView world="technique" />;
}
