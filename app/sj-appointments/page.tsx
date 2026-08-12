import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SJAppointments } from "@/components/sj-appointments/sj-appointments";

const allowedEmails = new Set(["jatinshah.dco@gmail.com", "somya.dco@gmail.com"]);

export default async function SJAppointmentsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server components cannot write refreshed cookies.
        }
      }
    }
  );
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!allowedEmails.has(String(user.email ?? "").trim().toLowerCase())) redirect("/partner-dashboard");

  return <SJAppointments />;
}
