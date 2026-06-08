"use client";

import { ArrowLeft, FileSearch, FolderOpen, ListOrdered, RefreshCw, Scissors, Shuffle } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import Link from "next/link";
import { ChangeEvent, useRef, useState } from "react";
import JSZip from "jszip";

type PdfFileRow = {
  id: string;
  name: string;
  pages: number | null;
  path: string;
  size: number;
};

export default function PdfIndexingPage() {
  const [pdfRows, setPdfRows] = useState<PdfFileRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [folderName, setFolderName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [message, setMessage] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);
  const pdfFileMapRef = useRef<Map<string, File>>(new Map());
  const selectedFilesRef = useRef<File[]>([]);
  const totalSize = pdfRows.reduce((sum, row) => sum + row.size, 0);
  const totalPages = pdfRows.reduce((sum, row) => sum + (row.pages ?? 0), 0);
  const areAllRowsSelected = pdfRows.length > 0 && selectedRowIds.size === pdfRows.length;
  const areSomeRowsSelected = selectedRowIds.size > 0 && selectedRowIds.size < pdfRows.length;

  async function selectFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));

    selectedFilesRef.current = pdfFiles;
    await loadPdfFiles(pdfFiles);
    event.target.value = "";
  }

  async function refreshSelectedFolder() {
    await loadPdfFiles(selectedFilesRef.current);
  }

  async function loadPdfFiles(pdfFiles: File[]) {
    setIsReading(true);
    setMessage(pdfFiles.length ? `Reading ${pdfFiles.length} PDF file${pdfFiles.length === 1 ? "" : "s"}...` : "");
    setPdfRows([]);
    setSelectedRowIds(new Set());

    try {
      const rows: PdfFileRow[] = [];
      const fileMap = new Map<string, File>();

      for (const file of pdfFiles) {
        const id = `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`;

        fileMap.set(id, file);
        rows.push({
          id,
          name: file.name,
          pages: await getPdfPageCount(file),
          path: file.webkitRelativePath || file.name,
          size: file.size
        });
      }

      rows.sort((left, right) =>
        left.path.localeCompare(right.path, undefined, {
          numeric: true,
          sensitivity: "base"
        })
      );

      setFolderName(getSelectedFolderName(rows));
      pdfFileMapRef.current = fileMap;
      setPdfRows(rows);
      setMessage(
        rows.length
          ? `Loaded ${rows.length} PDF file${rows.length === 1 ? "" : "s"}.`
          : "No PDF files found in the selected folder."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the selected folder.");
    } finally {
      setIsReading(false);
    }
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(rowId)) {
        nextIds.delete(rowId);
      } else {
        nextIds.add(rowId);
      }

      return nextIds;
    });
  }

  function toggleAllRows() {
    setSelectedRowIds((currentIds) => {
      if (currentIds.size === pdfRows.length) {
        return new Set();
      }

      return new Set(pdfRows.map((row) => row.id));
    });
  }

  function getActionRows(requireSelection: boolean) {
    if (requireSelection && selectedRowIds.size === 0) {
      return [];
    }

    return selectedRowIds.size
      ? pdfRows.filter((row) => selectedRowIds.has(row.id))
      : pdfRows;
  }

  async function mergeSelectedPdfs() {
    const rows = getActionRows(true);

    if (rows.length < 2) {
      setMessage("Select at least two PDF files to merge.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Merging ${rows.length} PDF files...`);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const sourcePdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const bytes = await mergedPdf.save();
      downloadBlob(createPdfBlob(bytes), "workline-merged.pdf");
      setMessage(`Merged ${rows.length} PDF files.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not merge selected PDFs.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function splitSelectedPdfs() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file to split.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Splitting ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const zip = new JSZip();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const sourcePdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const folder = zip.folder(stripPdfExtension(row.name)) ?? zip;

        for (const pageIndex of sourcePdf.getPageIndices()) {
          const singlePagePdf = await PDFDocument.create();
          const [copiedPage] = await singlePagePdf.copyPages(sourcePdf, [pageIndex]);
          singlePagePdf.addPage(copiedPage);
          folder.file(`page-${String(pageIndex + 1).padStart(3, "0")}.pdf`, await singlePagePdf.save());
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "workline-split-pdfs.zip");
      setMessage(`Split ${rows.length} PDF file${rows.length === 1 ? "" : "s"} into a ZIP.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not split selected PDFs.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function createPdfIndex() {
    const rows = getActionRows(false);

    if (!rows.length) {
      setMessage("Select a folder before creating an index.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Creating index for ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const indexPdf = await PDFDocument.create();
      const font = await indexPdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await indexPdf.embedFont(StandardFonts.HelveticaBold);
      let page = indexPdf.addPage([842, 595]);
      let y = 540;

      page.drawText("PDF Index", { color: rgb(0.02, 0.06, 0.18), font: boldFont, size: 22, x: 36, y });
      y -= 32;
      page.drawText(`Folder: ${folderName || "Selected folder"}`, { color: rgb(0.28, 0.33, 0.42), font, size: 10, x: 36, y });
      y -= 26;
      drawIndexHeader(page, boldFont, y);
      y -= 20;

      rows.forEach((row, index) => {
        if (y < 42) {
          page = indexPdf.addPage([842, 595]);
          y = 540;
          drawIndexHeader(page, boldFont, y);
          y -= 20;
        }

        page.drawText(String(index + 1), { font, size: 9, x: 38, y });
        page.drawText(truncateText(row.name, 72), { font, size: 9, x: 72, y });
        page.drawText(formatFileSize(row.size), { font, size: 9, x: 610, y });
        page.drawText(row.pages === null ? "Unreadable" : String(row.pages), { font, size: 9, x: 710, y });
        y -= 17;
      });

      downloadBlob(createPdfBlob(await indexPdf.save()), "workline-pdf-index.pdf");
      setMessage(`Created index for ${rows.length} PDF file${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create PDF index.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f3ea] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.14),transparent_26%),radial-gradient(circle_at_48%_92%,rgba(245,158,11,0.14),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className="mx-auto w-full max-w-none">
        <header className="workline-frame rounded-[20px] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-slate-950/10 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 shadow-sm"
                href="/"
              >
                <ArrowLeft className="size-3.5" />
                Workspace
              </Link>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-300 via-sky-300 to-teal-300 text-slate-950">
                  <FileSearch className="size-7" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
                    Document workspace
                  </p>
                  <h1 className="mt-1 text-4xl font-black leading-tight text-slate-950">PDF & Indexing</h1>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ToolButton disabled={isProcessing || selectedRowIds.size < 2} icon={Shuffle} label="Merge" onClick={mergeSelectedPdfs} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={Scissors} label="Split" onClick={splitSelectedPdfs} />
              <ToolButton disabled={isProcessing || pdfRows.length === 0} icon={ListOrdered} label="Create Index" onClick={createPdfIndex} />
              <input
                accept="application/pdf,.pdf"
                className="hidden"
                multiple
                onChange={selectFolder}
                ref={folderInputRef}
                type="file"
                {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
              />
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-slate-800"
                onClick={() => folderInputRef.current?.click()}
                type="button"
              >
                <FolderOpen className="size-4" />
                Select Folder
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                disabled={!selectedFilesRef.current.length || isReading}
                onClick={refreshSelectedFolder}
                title="Refresh the currently selected PDF file list"
                type="button"
              >
                <RefreshCw className={`size-4 ${isReading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="workline-frame mt-4 rounded-[20px] p-3 md:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">PDF Files</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {folderName ? folderName : "Select a folder to load PDF files."}
              </p>
              {message ? <p className="mt-1 text-sm font-bold text-indigo-700">{message}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Metric label="Files" value={String(pdfRows.length)} />
              <Metric label="Selected" value={String(selectedRowIds.size)} />
              <Metric label="Pages" value={isReading ? "..." : String(totalPages)} />
              <Metric label="Size" value={formatFileSize(totalSize)} />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-285px)] overflow-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                  <tr>
                    <th className="w-12 border-b border-r border-white/15 px-3 py-3">
                      <input
                        aria-label="Select all PDF files"
                        checked={areAllRowsSelected}
                        className="size-4 rounded border-slate-300 accent-teal-500"
                        onChange={toggleAllRows}
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = areSomeRowsSelected;
                          }
                        }}
                        type="checkbox"
                      />
                    </th>
                    <th className="w-16 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Sno</th>
                    <th className="border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">PDF Name</th>
                    <th className="w-36 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Size</th>
                    <th className="w-32 border-b border-white/15 px-3 py-3 text-xs font-black uppercase">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfRows.length ? (
                    pdfRows.map((row, index) => (
                      <tr className="odd:bg-white even:bg-slate-50/80" key={row.id}>
                        <td className="border-b border-r border-slate-200 px-3 py-2">
                          <input
                            aria-label={`Select ${row.name}`}
                            checked={selectedRowIds.has(row.id)}
                            className="size-4 rounded border-slate-300 accent-teal-600"
                            onChange={() => toggleRowSelection(row.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-bold text-slate-700">
                          {index + 1}
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-bold text-slate-950">
                          {row.name}
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                          {formatFileSize(row.size)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                          {row.pages ?? "Could not read"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-12 text-center text-sm font-bold text-slate-500" colSpan={5}>
                        {isReading ? "Reading PDFs..." : "No PDF folder selected yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ToolButton({
  disabled,
  icon: Icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: typeof Shuffle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm">
      <span className="text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

async function getPdfPageCount(file: File) {
  const buffer = await file.arrayBuffer();
  const loadedPdf = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true }).catch(() => null);

  if (loadedPdf) {
    return loadedPdf.getPageCount();
  }

  const text = new TextDecoder("latin1").decode(buffer);
  const directPageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);

  if (directPageMatches?.length) {
    return directPageMatches.length;
  }

  const countMatches = Array.from(text.matchAll(/\/Count\s+(\d+)/g))
    .map((match) => Number(match[1]))
    .filter((count) => Number.isFinite(count) && count > 0);

  if (countMatches.length) {
    return Math.max(...countMatches);
  }

  const kidsMatch = text.match(/\/Kids\s*\[([\s\S]*?)\]/);

  if (kidsMatch?.[1]) {
    const kids = kidsMatch[1].match(/\d+\s+\d+\s+R/g);
    return kids?.length ?? null;
  }

  return null;
}

function drawIndexHeader(page: ReturnType<PDFDocument["addPage"]>, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, y: number) {
  page.drawText("Sno", { font, size: 9, x: 38, y });
  page.drawText("PDF Name", { font, size: 9, x: 72, y });
  page.drawText("Size", { font, size: 9, x: 610, y });
  page.drawText("Pages", { font, size: 9, x: 710, y });
  page.drawLine({
    color: rgb(0.82, 0.85, 0.9),
    end: { x: 790, y: y - 6 },
    start: { x: 36, y: y - 6 },
    thickness: 1
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function createPdfBlob(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: "application/pdf" });
}

function stripPdfExtension(filename: string) {
  return filename.replace(/\.pdf$/i, "");
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function getSelectedFolderName(rows: PdfFileRow[]) {
  const firstPath = rows[0]?.path;

  if (!firstPath || !firstPath.includes("/")) {
    return "Selected folder";
  }

  return firstPath.split("/")[0] || "Selected folder";
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
