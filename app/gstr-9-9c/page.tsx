import workbookData from "@/lib/data/gstr-9-9c-25-26.json";
import { GstrNineNineCRegister, type GstrWorkbookData } from "@/components/gstr-9-9c/gstr-9-9c-register";

export const dynamic = "force-dynamic";

export default function GstrNineNineCPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <section className="mx-auto w-full max-w-none">
        <GstrNineNineCRegister workbook={workbookData as GstrWorkbookData} />
      </section>
    </main>
  );
}
