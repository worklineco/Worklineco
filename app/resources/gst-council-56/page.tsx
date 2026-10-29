import { redirect } from "next/navigation";

// Kept so the old URL still works; the 56th council page is served as its own
// static page (native scrolling) rather than in an iframe.
export default function GstCouncil56Page() {
  redirect("/gst-council-56/index.html");
}
