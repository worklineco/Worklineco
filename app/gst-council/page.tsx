import { redirect } from "next/navigation";

// The 57th GST Council brief is a self-contained static page that scrolls
// natively on every device. We keep this route (it was shared with clients)
// but send it straight to the static file instead of embedding it in an iframe.
export default function GstCouncilPage() {
  redirect("/gst-council-artifact.html");
}
