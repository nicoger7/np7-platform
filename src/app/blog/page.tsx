import type { Metadata } from "next";
import { BlogIndexView } from "./blog-index";

export const metadata: Metadata = {
  title: "Magazine — NP7",
  description:
    "Spotguides, gear reviews, technique guides and stories from the water — by Nico Prien (GER-7) and the NP7 crew.",
};

export const revalidate = 60;

// The world tabs are real routes (/blog/spotguide, /blog/gear, /blog/technique)
// rather than ?world= params, so each tab — including this "All" landing — is
// statically cached (ISR) instead of re-rendered per visit.
export default function BlogIndexPage() {
  return <BlogIndexView world="" />;
}
