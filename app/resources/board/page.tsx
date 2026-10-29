import { redirect } from "next/navigation";

// Kept so the old URL still works; the compendium is served as its own static
// page (native scrolling on iPhone/Android/desktop) rather than in an iframe.
export default function ResourceBoardPage() {
  redirect("/resource-board-artifact.html");
}
