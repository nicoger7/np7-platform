// Destinations are part of the Experience world — hidden in production until
// SHOW_EXPERIENCE=true. Members can already see it, so a logged-out visitor is
// asked to sign in rather than told the page does not exist.
export default async function DestinationsLayout({ children }: { children: React.ReactNode }) {
  // Deliberately NOT gated here: the layout cannot see which destination was
  // asked for, so redirecting from it would drop the link the visitor
  // followed. The page below does the check and keeps the slug.
  return <>{children}</>;
}
