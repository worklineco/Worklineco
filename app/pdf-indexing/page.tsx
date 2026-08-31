"use client";

import { Archive, ArrowDown, ArrowLeft, ArrowUp, BookMarked, Download, Eye, FileImage, FileSearch, FolderOpen, Hash, ListOrdered, RefreshCw, Scissors, ShieldCheck, Shuffle, X, type LucideIcon } from "lucide-react";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFStream, StandardFonts, concatTransformationMatrix, degrees, drawObject, popGraphicsState, pushGraphicsState, rgb } from "pdf-lib";
import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import JSZip from "jszip";

type PdfFileRow = {
  annexureLabel: string;
  documentType: string;
  fileKind: SupportedFileKind;
  id: string;
  name: string;
  pages: number | null;
  path: string;
  size: number;
};
type SupportedFileKind = "pdf" | "image";

const DOCUMENT_TYPES = ["POA", "Affidavit", "ASMT-10", "SCN", "SCN Reply", "OIO", "OIA", "Appeal", "Annexure"];
const PDF_PAGE_NUMBER_FONT_SIZE = 12;
const PDF_PAGE_NUMBER_MARGIN = 24;
const DEFAULT_SMART_MERGE_MAX_MB = 19.5;
const SMART_MERGE_MAX_SIZE = DEFAULT_SMART_MERGE_MAX_MB * 1024 * 1024;
const DSC_HELPER_URL = "http://127.0.0.1:48783";
const DSC_HELPER_DOWNLOAD_URL = "/WorkLineDSCHelperSetup.vbs";
const EMSIGNER_DOWNLOAD_URL = "https://tutorial.gst.gov.in/installers/dscemSigner/GSTSigner-v2.8.msi";
const TRUE_COPY_STAMP_URL = "/true-copy-stamp.png";
const PAPERBOOK_TRUE_COPY_DOCUMENT_TYPES = new Set(["SCN", "OIO", "OIA"]);
const MERGE_FILE_ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const IMAGE_FILE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IMAGE_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_FILE_TYPES = new Set(["application/pdf"]);
const A4_PORTRAIT_SIZE: [number, number] = [595.28, 841.89];
const IMAGE_PAGE_MARGIN = 36;

type PageRange = {
  label: string;
  pageIndices: number[];
};

type BookmarkNode = {
  children?: BookmarkNode[];
  pageIndex: number;
  title: string;
};

type BookmarkLevel = {
  count: number;
  firstRef: PDFRef;
  lastRef: PDFRef;
};

type AnnexureStartLabel = {
  pageIndex: number;
  text: string;
};

type DpiIssue = {
  detail: string;
  filename: string;
  pageNumber: number;
};

type ImageDimensions = {
  height: number;
  width: number;
};

type SmartMergeLot = {
  rows: PdfFileRow[];
  size: number;
};

type SmartMergeOutput = {
  bytes: Uint8Array;
  filename: string;
  isOverLimit: boolean;
};

type PageNumberSettings = {
  startNumber: number;
  startPage: number;
};

type PdfPreview = {
  name: string;
  url: string;
};

type DscHelperStatus = "idle" | "checking" | "ready" | "offline" | "emsigner_missing" | "emsigner_not_running" | "unsupported" | "signing";
type DscVisiblePlacement = "all_pages" | "first_page" | "last_page";

const DSC_VISIBLE_PLACEMENTS: { label: string; value: DscVisiblePlacement }[] = [
  { label: "All pages", value: "all_pages" },
  { label: "First page", value: "first_page" },
  { label: "Last page", value: "last_page" },
];

export default function PdfIndexingPage() {
  const [pdfRows, setPdfRows] = useState<PdfFileRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [folderName, setFolderName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [bookmarkShouldPaginate, setBookmarkShouldPaginate] = useState(true);
  const [smartSplitShouldLimitSize, setSmartSplitShouldLimitSize] = useState(true);
  const [message, setMessage] = useState("");
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);
  const [isDscModalOpen, setIsDscModalOpen] = useState(false);
  const [isCompressModalOpen, setIsCompressModalOpen] = useState(false);
  const [compressionTargetMb, setCompressionTargetMb] = useState("10");
  const [compressionMessage, setCompressionMessage] = useState("");
  const [dscHelperStatus, setDscHelperStatus] = useState<DscHelperStatus>("idle");
  const [dscMessage, setDscMessage] = useState("");
  const [dscVisiblePlacement, setDscVisiblePlacement] = useState<DscVisiblePlacement>("all_pages");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const pdfFileMapRef = useRef<Map<string, File>>(new Map());
  const selectedFilesRef = useRef<File[]>([]);
  const totalSize = pdfRows.reduce((sum, row) => sum + row.size, 0);
  const totalPages = pdfRows.reduce((sum, row) => sum + (row.pages ?? 0), 0);
  const selectedRows = pdfRows.filter((row) => selectedRowIds.has(row.id));
  const selectedSize = selectedRows.reduce((sum, row) => sum + row.size, 0);
  const selectedPages = selectedRows.reduce((sum, row) => sum + (row.pages ?? 0), 0);
  const areAllRowsSelected = pdfRows.length > 0 && selectedRowIds.size === pdfRows.length;
  const areSomeRowsSelected = selectedRowIds.size > 0 && selectedRowIds.size < pdfRows.length;

  const startDscFiling = () => {
    setIsDscModalOpen(true);
    void checkDscHelper();
  };

  async function checkDscHelper() {
    setDscHelperStatus("checking");
    setDscMessage("Checking local DSC helper...");

    try {
      const response = await fetch(`${DSC_HELPER_URL}/health`, {
        cache: "no-store",
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Local DSC helper did not respond correctly.");
      }

      const payload = await response.json().catch(() => null);
      const helperEngine = String(payload?.engine || "");
      const helperMessage = String(payload?.message || "");
      const canSignPdfs = payload?.canSignPdfs !== false;
      const hasNicSigner = helperEngine === "nic-digital-signer-service-detected";
      const signerNotReachable =
        helperEngine === "emsigner-installed-not-running" ||
        /(?:GSTSigner|emSigner).*(?:not running|not reachable)|(?:not running|not reachable).*(?:GSTSigner|emSigner)/i.test(helperMessage);
      const needsEmSigner =
        (helperEngine === "emsigner-missing" && !signerNotReachable) ||
        helperEngine === "pending" ||
        /signing engine is not connected/i.test(helperMessage);

      setDscHelperStatus(
        needsEmSigner
          ? "emsigner_missing"
          : signerNotReachable
            ? "emsigner_not_running"
            : canSignPdfs && !hasNicSigner
              ? "ready"
              : "unsupported"
      );
      setDscMessage(
        needsEmSigner
          ? payload?.message || "WorkLine DSC helper is installed. Install or start GSTSigner/emSigner, then click Check again."
        : signerNotReachable
            ? payload?.message || "GSTSigner is running, but WorkLine cannot reach its local signing service. Fully exit GSTSigner/emSigner, reopen it, allow any firewall prompt, then click Check again."
          : hasNicSigner
            ? payload?.message || "NIC Digital Signer Service is running on this computer. WorkLine can use it after the signing request connector is mapped."
          : !canSignPdfs
            ? payload?.message || "emSigner is detected. WorkLine PDF signing connector is not enabled yet."
          : payload?.message || "Local DSC helper is reachable."
      );
    } catch {
      setDscHelperStatus("offline");
      setDscMessage("Local DSC helper is not running on this computer.");
    }
  }

  async function signSelectedPdfsWithDsc() {
    if (!selectedRows.length) {
      setDscMessage("Select PDFs before signing.");
      return;
    }

    setDscHelperStatus("signing");
    setDscMessage("Sending selected PDFs to local DSC helper...");

    try {
      const formData = new FormData();

      for (const row of selectedRows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
        }

        formData.append("files", file, row.name);
      }

      formData.append("visiblePlacement", dscVisiblePlacement);
      formData.append("signatureMode", "single_document_signature");

      const response = await fetch(`${DSC_HELPER_URL}/sign`, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 501) {
          setDscHelperStatus("unsupported");
        }
        throw new Error(
          [payload?.error || "DSC helper could not sign the selected PDFs.", payload?.nextStep]
            .filter(Boolean)
            .join(" ")
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      downloadBlob(blob, filenameMatch?.[1] || "workline-dsc-signed.pdf");
      setDscHelperStatus("ready");
      setDscMessage("Signed PDF downloaded.");
    } catch (error) {
      setDscHelperStatus((status) => (status === "unsupported" ? "unsupported" : "ready"));
      setDscMessage(error instanceof Error ? error.message : "Could not complete DSC filing.");
    }
  }

  async function downloadManualDscPack() {
    if (!selectedRows.length) {
      setDscMessage("Select PDFs before preparing the manual signing pack.");
      return;
    }

    setDscMessage(`Preparing ${selectedRows.length} PDF${selectedRows.length === 1 ? "" : "s"} for manual DSC signing...`);

    try {
      if (selectedRows.length === 1) {
        const row = selectedRows[0];
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
        }

        downloadBlob(file, row.name);
        setDscMessage("Downloaded the selected PDF. Sign it manually in Digital Signing Tool/NIC signer.");
        return;
      }

      const zip = new JSZip();

      for (const row of selectedRows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
        }

        zip.file(row.name, file);
      }

      zip.file(
        "README-manual-dsc.txt",
        [
          "Manual DSC signing pack from WorkLine.",
          "",
          "1. Extract this ZIP.",
          "2. Open NIC Digital Signing Tool / Digital Signing Tool.",
          "3. Select these PDFs for bulk signing.",
          "4. Save the signed PDFs for filing.",
        ].join("\r\n")
      );

      downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-manual-dsc-pack.zip");
      setDscMessage("Downloaded manual DSC signing pack. Extract it and sign the PDFs in Digital Signing Tool/NIC signer.");
    } catch (error) {
      setDscMessage(error instanceof Error ? error.message : "Could not prepare manual DSC signing pack.");
    }
  }

  async function duplicateDscSignOnSelectedPdfs() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one signed PDF.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Duplicating visible DSC mark on ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const outputs: { bytes: Uint8Array; filename: string }[] = [];

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
        }

        const result = await duplicateVisibleDscSignature(await file.arrayBuffer());

        outputs.push({
          bytes: result.bytes,
          filename: `${stripPdfExtension(row.name)}-dsc-visual-duplicated.pdf`,
        });
      }

      if (outputs.length === 1) {
        downloadBlob(createPdfBlob(outputs[0].bytes), outputs[0].filename);
      } else {
        const zip = new JSZip();

        outputs.forEach((output) => {
          zip.file(output.filename, output.bytes);
        });

        downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-dsc-visual-duplicated.zip");
      }

      setMessage(
        "Duplicated the visible DSC mark. If no formal signature box is found, WorkLine copies the first page top-left signature area. Note: editing an already signed PDF can invalidate the real digital signature."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not duplicate visible DSC mark.");
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    if (!isCompressModalOpen) {
      return;
    }

    function closeCompressionOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isProcessing) {
        setIsCompressModalOpen(false);
      }
    }

    window.addEventListener("keydown", closeCompressionOnEscape);
    return () => window.removeEventListener("keydown", closeCompressionOnEscape);
  }, [isCompressModalOpen, isProcessing]);

  useEffect(() => {
    if (!pdfPreview) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePdfPreview();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pdfPreview]);

  async function selectFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const documentFiles = files.filter(isSupportedMergeFile);

    selectedFilesRef.current = [...selectedFilesRef.current, ...documentFiles];
    await loadDocumentFiles(documentFiles, "folder");
    event.target.value = "";
  }

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const documentFiles = Array.from(event.target.files ?? []).filter(isSupportedMergeFile);

    selectedFilesRef.current = [...selectedFilesRef.current, ...documentFiles];
    await loadDocumentFiles(documentFiles, "files");
    event.target.value = "";
  }

  async function refreshSelectedFolder() {
    await loadDocumentFiles(selectedFilesRef.current, folderName === "Selected files" ? "files" : "folder");
  }

  async function loadDocumentFiles(documentFiles: File[], source: "files" | "folder") {
    setIsReading(true);
    setMessage(documentFiles.length ? `Reading ${documentFiles.length} file${documentFiles.length === 1 ? "" : "s"}...` : "");

    const wasEmpty = pdfFileMapRef.current.size === 0;

    try {
      const newRows: PdfFileRow[] = [];

      for (const file of documentFiles) {
        const id = `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`;
        const fileKind = getSupportedFileKind(file);

        if (!fileKind || pdfFileMapRef.current.has(id)) {
          continue;
        }

        pdfFileMapRef.current.set(id, file);
        newRows.push({
          annexureLabel: "",
          documentType: "",
          fileKind,
          id,
          name: file.name,
          pages: fileKind === "pdf" ? await getPdfPageCount(file) : 1,
          path: file.webkitRelativePath || file.name,
          size: file.size
        });
      }

      setPdfRows((current) => {
        const byId = new Map(current.map((existing) => [existing.id, existing]));
        for (const row of newRows) {
          byId.set(row.id, row);
        }
        return Array.from(byId.values()).sort((left, right) =>
          left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" })
        );
      });

      setFolderName(wasEmpty ? (source === "files" ? "Selected files" : getSelectedFolderName(newRows)) : "Selected files");
      const totalCount = pdfFileMapRef.current.size;
      setMessage(
        newRows.length
          ? `Added ${newRows.length} file${newRows.length === 1 ? "" : "s"} — ${totalCount} file${totalCount === 1 ? "" : "s"} ready. Select more from any folder to keep adding.`
          : documentFiles.length
            ? "Those files are already added, or not supported (PDF, JPG, JPEG, PNG, WebP)."
            : source === "files"
              ? "No supported files selected. Choose PDF, JPG, JPEG, PNG, or WebP files."
              : "No supported files found in the selected folder."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the selected files.");
    } finally {
      setIsReading(false);
    }
  }

  function clearAllFiles() {
    pdfFileMapRef.current = new Map();
    selectedFilesRef.current = [];
    setPdfRows([]);
    setSelectedRowIds(new Set());
    setFolderName("");
    setMessage("Cleared all files.");
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

  function movePdfRow(rowId: string, direction: -1 | 1) {
    setPdfRows((currentRows) => {
      const currentIndex = currentRows.findIndex((row) => row.id === rowId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentRows.length) {
        return currentRows;
      }

      const nextRows = [...currentRows];
      [nextRows[currentIndex], nextRows[nextIndex]] = [nextRows[nextIndex], nextRows[currentIndex]];

      return nextRows;
    });
  }

  function updateDocumentType(rowId: string, documentType: string) {
    setPdfRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? { ...row, annexureLabel: documentType === "Annexure" ? row.annexureLabel : "", documentType }
          : row
      )
    );
  }

  function updateAnnexureLabel(rowId: string, annexureLabel: string) {
    setPdfRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, annexureLabel } : row)));
  }

  function previewPdfRow(row: PdfFileRow) {
    const file = pdfFileMapRef.current.get(row.id);

    if (!file) {
      setMessage("Could not find the selected file for preview.");
      return;
    }

    setPdfPreview((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview.url);
      }

      return {
        name: row.name,
        url: URL.createObjectURL(file)
      };
    });
  }

  function closePdfPreview() {
    setPdfPreview((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview.url);
      }

      return null;
    });
  }

  function openCompressionDialog() {
    const rows = getActionRows(true).filter((row) => row.fileKind === "pdf");

    if (!rows.length) {
      setMessage("Select at least one PDF file to compress.");
      return;
    }

    setCompressionMessage("");
    setIsCompressModalOpen(true);
  }

  async function compressSelectedPdfs() {
    const rows = getActionRows(true).filter((row) => row.fileKind === "pdf");
    const targetMb = Number(compressionTargetMb);
    const targetBytes = Math.floor(targetMb * 1024 * 1024);

    if (!rows.length) {
      setCompressionMessage("Select at least one PDF file to compress.");
      return;
    }

    if (!Number.isFinite(targetMb) || targetMb <= 0) {
      setCompressionMessage("Enter a target size greater than 0 MB.");
      return;
    }

    setIsProcessing(true);
    setCompressionMessage(`Preparing ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const outputs: Array<{ bytes: Uint8Array; filename: string; metTarget: boolean }> = [];
      const signedFiles: string[] = [];

      for (const [index, row] of rows.entries()) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
        }

        const sourceBytes = new Uint8Array(await file.arrayBuffer());

        if (hasDigitalSignature(sourceBytes)) {
          signedFiles.push(row.name);
          continue;
        }

        setCompressionMessage(`Compressing ${row.name} (${index + 1} of ${rows.length})...`);
        await waitForUiUpdate();
        const result = await compressUnsignedPdfToTarget(sourceBytes, targetBytes, (detail) => {
          setCompressionMessage(`${row.name}: ${detail}`);
        });

        outputs.push({
          bytes: result.bytes,
          filename: `${stripPdfExtension(row.name)}-compressed.pdf`,
          metTarget: result.metTarget,
        });
      }

      if (outputs.length === 1) {
        downloadBlob(createPdfBlob(outputs[0].bytes), outputs[0].filename);
      } else if (outputs.length > 1) {
        const zip = new JSZip();

        outputs.forEach((output) => zip.file(output.filename, output.bytes));
        downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-compressed-pdfs.zip");
      }

      const missedTargets = outputs.filter((output) => !output.metTarget).length;
      const resultParts = [
        outputs.length
          ? `Compressed ${outputs.length} PDF file${outputs.length === 1 ? "" : "s"}.`
          : "",
        missedTargets
          ? `${missedTargets} file${missedTargets === 1 ? "" : "s"} reached the smallest supported output but remained above ${targetMb} MB.`
          : outputs.length
            ? `Each output is at or below ${targetMb} MB.`
            : "",
        signedFiles.length
          ? `Skipped ${signedFiles.length} digitally signed PDF${signedFiles.length === 1 ? "" : "s"} because changing them would invalidate the signature: ${signedFiles.join(", ")}.`
          : "",
      ].filter(Boolean);

      const resultMessage = resultParts.join(" ");
      setCompressionMessage(resultMessage);
      setMessage(resultMessage);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not compress the selected PDFs.";
      setCompressionMessage(detail);
      setMessage(detail);
    } finally {
      setIsProcessing(false);
    }
  }

  async function mergeSelectedPdfs() {
    const rows = getActionRows(true);

    if (rows.length < 2) {
      setMessage("Select at least two files to merge.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Merging ${rows.length} files into one PDF...`);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        await appendFileToMergedPdf(mergedPdf, file);
        // give the browser a tick to reclaim the source file's memory before the next one
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const bytes = await mergedPdf.save();
      downloadBlob(createPdfBlob(bytes), "workline-merged.pdf");
      setMessage(`Merged ${rows.length} files into one PDF.`);
    } catch (error) {
      setMessage(
        isAllocationError(error)
          ? "These files are too large to merge into a single PDF in the browser (ran out of memory). Use ‘Smart Merge’ to split them into smaller parts, or merge fewer files at a time."
          : error instanceof Error ? error.message : "Could not merge selected files."
      );
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

    const rangeInput = window.prompt("Enter ranges to split, for example 1-5,6-10.");

    if (rangeInput === null) {
      return;
    }

    const normalizedRange = rangeInput.trim();

    if (!normalizedRange) {
      setMessage("Enter a page range before splitting.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Splitting ranges ${normalizedRange} from ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const zip = new JSZip();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const sourcePdf = await loadPdfWithVisibleSignatures(file);
        const pageRanges = parsePageRanges(normalizedRange, sourcePdf.getPageCount(), row.name);
        const folder = zip.folder(stripPdfExtension(row.name)) ?? zip;

        for (const pageRange of pageRanges) {
          const extractedPdf = await PDFDocument.create();

          for (const pageIndex of pageRange.pageIndices) {
            await appendPortraitPage(extractedPdf, sourcePdf.getPage(pageIndex));
          }

          folder.file(`${stripPdfExtension(row.name)}-pages-${pageRange.label}.pdf`, await extractedPdf.save());
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "workline-split-pdfs.zip");
      setMessage(`Split ranges ${normalizedRange} from ${rows.length} PDF file${rows.length === 1 ? "" : "s"} into a ZIP.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not split selected PDFs.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function startSmartSplit() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file before using Smart Split.");
      return;
    }

    const shouldAddPageNumbers = window.confirm("Add page numbering to Smart Split PDFs?");
    const pageNumberSettings = shouldAddPageNumbers ? promptForPageNumberSettings() : null;

    if (shouldAddPageNumbers && !pageNumberSettings) {
      return;
    }

    setIsProcessing(true);
    setMessage(`Smart Split: preparing ${rows.length} PDF file${rows.length === 1 ? "" : "s"} into docket parts...`);

    try {
      const stampResponse = await fetch(TRUE_COPY_STAMP_URL);

      if (!stampResponse.ok) {
        throw new Error("Could not load the TRUE COPY stamp.");
      }

      const stampBuffer = await stampResponse.arrayBuffer();
      const zip = new JSZip();
      const outputs: { filename: string; label: string }[] = [];
      const smartSplitGroups = createSmartSplitGroups(rows);

      for (const group of smartSplitGroups) {
        const groupRows = group.rows;

        setMessage(`Smart Split: creating ${group.label} from ${groupRows.length} PDF file${groupRows.length === 1 ? "" : "s"}...`);
        await waitForUiUpdate();

        const partPdf = await PDFDocument.create();
        const bookmarks: BookmarkNode[] = [];
        const annexureStartLabels: AnnexureStartLabel[] = [];
        const trueCopyPageIndices: number[] = [];

        for (const row of groupRows) {
          const file = pdfFileMapRef.current.get(row.id);

          if (!file) {
            throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
          }

          const startPageIndex = partPdf.getPageCount();
          const sourcePdf = await loadPdfWithVisibleSignatures(file);
          const copiedPages = await partPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

          copiedPages.forEach((page) => partPdf.addPage(page));
          const endPageIndex = partPdf.getPageCount() - 1;

          if (PAPERBOOK_TRUE_COPY_DOCUMENT_TYPES.has(row.documentType)) {
            for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
              trueCopyPageIndices.push(pageIndex);
            }
          }

          bookmarks.push({
            pageIndex: startPageIndex,
            title: row.documentType === "Annexure" ? getAnnexureBookmarkTitle(row) : getDocumentBookmarkTitle(row),
          });

          if (row.documentType === "Annexure") {
            annexureStartLabels.push({
              pageIndex: startPageIndex,
              text: getAnnexurePageLabel(row),
            });
          }
        }

        addPdfBookmarks(partPdf, bookmarks);
        if (pageNumberSettings) {
          await drawPageNumbers(partPdf, pageNumberSettings);
        }
        await drawAnnexureStartLabels(partPdf, annexureStartLabels);
        await drawTrueCopyStampOnPages(partPdf, stampBuffer, trueCopyPageIndices);

        const groupOutputs = smartSplitShouldLimitSize
          ? await createSmartSplitSizedOutputs(partPdf, group.filename, group.label, setMessage)
          : [{ bytes: await partPdf.save(), filename: group.filename, isOverLimit: false }];

        groupOutputs.forEach((output) => {
          zip.file(output.filename, output.bytes);
          outputs.push({
            filename: output.filename,
            label: output.isOverLimit ? `${group.label} over 19.5 MB` : group.label,
          });
        });
      }

      if (!outputs.length) {
        throw new Error("Select at least one document type before using Smart Split.");
      }

      downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-smart-split-docket.zip");
      setMessage(`Smart Split created ${outputs.length} file${outputs.length === 1 ? "" : "s"} for ${smartSplitGroups.length} document type${smartSplitGroups.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create Smart Split docket parts.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function addPageNumbersToPdfs() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file to add page numbers.");
      return;
    }

    const pageNumberSettings = promptForPageNumberSettings();

    if (!pageNumberSettings) {
      return;
    }

    setIsProcessing(true);
    setMessage(
      `Adding page numbers to ${rows.length} PDF file${rows.length === 1 ? "" : "s"} from page ${pageNumberSettings.startPage}, starting at ${pageNumberSettings.startNumber}...`
    );

    try {
      if (rows.length === 1) {
        const file = pdfFileMapRef.current.get(rows[0].id);

        if (!file) {
          throw new Error("Could not find the selected PDF file.");
        }

        const sourcePdf = await loadPdfWithVisibleSignatures(file);
        const numberedPdf = await createPortraitPdf(sourcePdf);
        await drawPageNumbers(numberedPdf, pageNumberSettings);
        downloadBlob(createPdfBlob(await numberedPdf.save()), `${stripPdfExtension(rows[0].name)}-page-numbered.pdf`);
        setMessage(`Added page numbers to ${rows[0].name}.`);
        return;
      }

      const zip = new JSZip();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const sourcePdf = await loadPdfWithVisibleSignatures(file);
        const numberedPdf = await createPortraitPdf(sourcePdf);
        await drawPageNumbers(numberedPdf, pageNumberSettings);
        zip.file(`${stripPdfExtension(row.name)}-page-numbered.pdf`, await numberedPdf.save());
      }

      downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-page-numbered-pdfs.zip");
      setMessage(`Added page numbers to ${rows.length} PDF files.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add page numbers.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function applyTrueCopyStampToPdfs() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file before applying TRUE COPY.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Applying TRUE COPY stamp to ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const stampResponse = await fetch(TRUE_COPY_STAMP_URL);

      if (!stampResponse.ok) {
        throw new Error("Could not load the TRUE COPY stamp.");
      }

      const stampBuffer = await stampResponse.arrayBuffer();

      if (rows.length === 1) {
        const file = pdfFileMapRef.current.get(rows[0].id);

        if (!file) {
          throw new Error("Could not find the selected PDF file.");
        }

        const pdf = await loadPdfWithVisibleSignatures(file);
        await drawTrueCopyStampOnEachPage(pdf, stampBuffer);
        downloadBlob(createPdfBlob(await pdf.save()), `${stripPdfExtension(rows[0].name)}-true-copy.pdf`);
        setMessage(`Applied TRUE COPY stamp to ${rows[0].name}.`);
        return;
      }

      const zip = new JSZip();

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const pdf = await loadPdfWithVisibleSignatures(file);
        await drawTrueCopyStampOnEachPage(pdf, stampBuffer);
        zip.file(`${stripPdfExtension(row.name)}-true-copy.pdf`, await pdf.save());
      }

      downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-true-copy-pdfs.zip");
      setMessage(`Applied TRUE COPY stamp to ${rows.length} PDF files.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply TRUE COPY stamp.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function checkSelectedPdfDpi() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file to check DPI.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Checking 300 DPI on ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const lowDpiIssues: DpiIssue[] = [];
      const unconfirmedIssues: DpiIssue[] = [];

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });

        pdf.getPages().forEach((page, pageIndex) => {
          const images = getPageImageDimensions(pdf, page.node.Resources());

          if (!images.length) {
            unconfirmedIssues.push({
              detail: "No raster image found; DPI cannot be confirmed.",
              filename: row.name,
              pageNumber: pageIndex + 1
            });
            return;
          }

          const { height, width } = page.getSize();
          const largestImage = images.reduce((largest, image) =>
            image.width * image.height > largest.width * largest.height ? image : largest
          );
          const dpiX = largestImage.width / (width / 72);
          const dpiY = largestImage.height / (height / 72);
          const effectiveDpi = Math.floor(Math.min(dpiX, dpiY));

          if (effectiveDpi < 300) {
            lowDpiIssues.push({
              detail: `Estimated ${effectiveDpi} DPI.`,
              filename: row.name,
              pageNumber: pageIndex + 1
            });
          }
        });
      }

      showDpiCheckResult(lowDpiIssues, unconfirmedIssues);
      setMessage(
        lowDpiIssues.length
          ? `DPI check found ${lowDpiIssues.length} page${lowDpiIssues.length === 1 ? "" : "s"} below 300 DPI.`
          : "DPI check completed."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check PDF DPI.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function createBookmarkedPdf() {
    const rows = getActionRows(true);

    if (rows.length < 2) {
      setMessage("Select at least two PDF files to create a bookmarked PDF.");
      return;
    }

    setIsProcessing(true);
    setMessage(`Creating bookmarked PDF from ${rows.length} files...`);

    try {
      const mergedPdf = await PDFDocument.create();
      const bookmarks: BookmarkNode[] = [];
      const annexureStartLabels: AnnexureStartLabel[] = [];
      let annexureBookmark: BookmarkNode | null = null;

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const startPageIndex = mergedPdf.getPageCount();
        const sourcePdf = await loadPdfWithVisibleSignatures(file);
        await appendPortraitPages(mergedPdf, sourcePdf);

        if (row.documentType === "Annexure") {
          if (!annexureBookmark) {
            annexureBookmark = { children: [], pageIndex: startPageIndex, title: "Annexure" };
            bookmarks.push(annexureBookmark);
          }

          annexureBookmark.children?.push({
            pageIndex: startPageIndex,
            title: getAnnexureBookmarkTitle(row)
          });
          annexureStartLabels.push({
            pageIndex: startPageIndex,
            text: getAnnexurePageLabel(row)
          });
        } else {
          bookmarks.push({
            pageIndex: startPageIndex,
            title: getDocumentBookmarkTitle(row)
          });
        }
      }

      if (!mergedPdf.getPageCount()) {
        throw new Error("Could not merge the selected PDF files.");
      }

      addPdfBookmarks(mergedPdf, bookmarks);

      if (bookmarkShouldPaginate) {
        await drawPageNumbers(mergedPdf);
      }

      await drawAnnexureStartLabels(mergedPdf, annexureStartLabels);

      downloadBlob(createPdfBlob(await mergedPdf.save()), "workline-bookmarked.pdf");
      setMessage(`Created bookmarked PDF from ${rows.length} files${bookmarkShouldPaginate ? " with page numbers" : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create bookmarked PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function createPaperBookPdf() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file to create PaperBook.");
      return;
    }

    const shouldAddPageNumbers = window.confirm("Add page numbering to PaperBook?");
    const pageNumberSettings = shouldAddPageNumbers ? promptForPageNumberSettings() : null;

    if (shouldAddPageNumbers && !pageNumberSettings) {
      return;
    }

    setIsProcessing(true);
    setMessage(`Creating PaperBook from ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const stampResponse = await fetch(TRUE_COPY_STAMP_URL);

      if (!stampResponse.ok) {
        throw new Error("Could not load the TRUE COPY stamp.");
      }

      const stampBuffer = await stampResponse.arrayBuffer();
      const paperBookPdf = await PDFDocument.create();
      const bookmarks: BookmarkNode[] = [];
      const annexureStartLabels: AnnexureStartLabel[] = [];
      const trueCopyPageIndices: number[] = [];
      let annexureBookmark: BookmarkNode | null = null;

      for (const row of rows) {
        const file = pdfFileMapRef.current.get(row.id);

        if (!file) {
          continue;
        }

        const startPageIndex = paperBookPdf.getPageCount();
        const sourcePdf = await loadPdfWithVisibleSignatures(file);
        const copiedPages = await paperBookPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

        copiedPages.forEach((page) => paperBookPdf.addPage(page));
        const endPageIndex = paperBookPdf.getPageCount() - 1;

        if (PAPERBOOK_TRUE_COPY_DOCUMENT_TYPES.has(row.documentType)) {
          for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
            trueCopyPageIndices.push(pageIndex);
          }
        }

        if (row.documentType === "Annexure") {
          if (!annexureBookmark) {
            annexureBookmark = { children: [], pageIndex: startPageIndex, title: "Annexure" };
            bookmarks.push(annexureBookmark);
          }

          annexureBookmark.children?.push({
            pageIndex: startPageIndex,
            title: getAnnexureBookmarkTitle(row)
          });
          annexureStartLabels.push({
            pageIndex: startPageIndex,
            text: getAnnexurePageLabel(row)
          });
        } else {
          bookmarks.push({
            pageIndex: startPageIndex,
            title: getDocumentBookmarkTitle(row)
          });
        }
      }

      if (!paperBookPdf.getPageCount()) {
        throw new Error("Could not merge the selected PDF files.");
      }

      addPdfBookmarks(paperBookPdf, bookmarks);
      if (pageNumberSettings) {
        await drawPageNumbers(paperBookPdf, pageNumberSettings);
      }
      await drawAnnexureStartLabels(paperBookPdf, annexureStartLabels);
      await drawTrueCopyStampOnPages(paperBookPdf, stampBuffer, trueCopyPageIndices);

      downloadBlob(createPdfBlob(await paperBookPdf.save()), "workline-paperbook.pdf");
      setMessage(
        `Created PaperBook with${pageNumberSettings ? "" : "out"} page numbers, bookmarks, merged PDFs, and TRUE COPY stamp on ${trueCopyPageIndices.length} page${trueCopyPageIndices.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create PaperBook.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function startSmartMerge() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select PDFs before using Smart Merge.");
      return;
    }

    const smartMergeMaxSize = promptForSmartMergeMaxSize();

    if (smartMergeMaxSize === null) {
      return;
    }

    setIsProcessing(true);
    setMessage(`Smart merging ${rows.length} PDF file${rows.length === 1 ? "" : "s"} into ${formatFileSize(smartMergeMaxSize)} lots...`);

    try {
      const lots = createSmartMergeLots(rows, smartMergeMaxSize);
      const outputs: SmartMergeOutput[] = [];

      for (let lotIndex = 0; lotIndex < lots.length; lotIndex += 1) {
        const lot = lots[lotIndex];
        setMessage(
          `Smart Merge: processing lot ${lotIndex + 1} of ${lots.length} (${lot.rows.length} PDF${lot.rows.length === 1 ? "" : "s"}, ${formatFileSize(lot.size)})...`
        );
        await waitForUiUpdate();

        if (lot.rows.length === 1 && lot.size > smartMergeMaxSize) {
          outputs.push(...await createSmartMergePartsForOversizedPdf(lot.rows[0], pdfFileMapRef.current, setMessage, smartMergeMaxSize));
          continue;
        }

        outputs.push({
          bytes: await createMergedPdfBytes(lot.rows, pdfFileMapRef.current),
          filename: `workline-smart-merge-lot-${String(outputs.length + 1).padStart(2, "0")}.pdf`,
          isOverLimit: false
        });
      }

      const overLimitOutputs = outputs.filter((output) => output.isOverLimit);

      if (outputs.length === 1) {
        downloadBlob(createPdfBlob(outputs[0].bytes), outputs[0].filename);
      } else {
        const zip = new JSZip();

        outputs.forEach((output) => zip.file(output.filename, output.bytes));

        downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-smart-merge-lots.zip");
      }

      setMessage(
        `Smart Merge created ${outputs.length} file${outputs.length === 1 ? "" : "s"} with a ${formatFileSize(smartMergeMaxSize)} target${
          overLimitOutputs.length
            ? `; ${overLimitOutputs.length} single-page part${overLimitOutputs.length === 1 ? " is" : "s are"} still over the limit.`
            : "."
        }`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create Smart Merge lots.");
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

    const shouldUsePageNumberSettings = window.confirm("Is page numbering required?");
    const pageNumberSettings = shouldUsePageNumberSettings ? promptForPageNumberSettings() : null;

    if (shouldUsePageNumberSettings && !pageNumberSettings) {
      return;
    }

    setIsProcessing(true);
    setMessage(`Creating index for ${rows.length} PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const pageNumberState = createIndexPageNumberState(pageNumberSettings);
      const indexDoc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [new TextRun({ bold: true, size: 32, text: "PDF Index" })],
                spacing: { after: 240 }
              }),
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      createIndexCell("Sno", { bold: true, width: 900 }),
                      createIndexCell("Particulars", { bold: true, width: 6200 }),
                      createIndexCell("Page", { alignment: AlignmentType.CENTER, bold: true, width: 1100 }),
                      createIndexCell("Document", { alignment: AlignmentType.CENTER, bold: true, width: 1500 })
                    ],
                    tableHeader: true
                  }),
                  ...rows.map(
                    (row, index) =>
                      new TableRow({
                        children: [
                          createIndexCell(String(index + 1), { alignment: AlignmentType.CENTER, width: 900 }),
                          createIndexCell(row.name, { width: 6200 }),
                          createIndexCell(getStartingPageText(row.pages, pageNumberState), {
                            alignment: AlignmentType.CENTER,
                            width: 1100
                          }),
                          createIndexCell(row.documentType || "", { alignment: AlignmentType.CENTER, width: 1500 })
                        ]
                      })
                  )
                ],
                width: { size: 9700, type: WidthType.DXA }
              })
            ]
          }
        ]
      });

      downloadBlob(await Packer.toBlob(indexDoc), "workline-pdf-index.docx");
      setMessage(`Created index for ${rows.length} PDF file${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create Word index.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function openGstatDocket() {
    const rows = getActionRows(true);

    if (!rows.length) {
      setMessage("Select at least one PDF file before creating GSTAT Docket.");
      return;
    }

    const shouldAddPageNumbers = window.confirm("Is page numbering required?");
    const pageNumberSettings = shouldAddPageNumbers ? promptForPageNumberSettings() : null;

    if (shouldAddPageNumbers && !pageNumberSettings) {
      return;
    }

    const shouldApplyTrueCopy = window.confirm("Is TRUE COPY required for OIO, OIA and SCN?");
    const shouldSmartSplit = window.confirm("Is smart merge required?");
    const smartMergeMaxSize = shouldSmartSplit ? promptForSmartMergeMaxSize("Enter GSTAT Docket split size limit in MB") : null;

    if (shouldSmartSplit && smartMergeMaxSize === null) {
      return;
    }

    setIsProcessing(true);
    setMessage(`Creating GSTAT Docket from ${rows.length} selected PDF file${rows.length === 1 ? "" : "s"}...`);

    try {
      const stampBuffer = shouldApplyTrueCopy ? await loadTrueCopyStamp() : null;
      const zip = new JSZip();
      const outputs: SmartMergeOutput[] = [];
      const pageNumberState = pageNumberSettings ? createContinuousPageNumberState(pageNumberSettings) : null;
      const preparedRows = await createGstatDocketPreparedRows(rows, pageNumberState, pdfFileMapRef.current);
      const groups = createGstatDocketGroups(preparedRows);

      for (const group of groups) {
        setMessage(`GSTAT Docket: merging ${group.label}...`);
        await waitForUiUpdate();

        const docketPdf = await createGstatDocketPdf(group.rows, {
          stampBuffer,
        });
        const filename = `${String(outputs.length + 1).padStart(2, "0")}-${sanitizeFilenamePart(group.label)}.pdf`;
        const groupOutputs = shouldSmartSplit
          ? await createSmartSplitSizedOutputs(docketPdf, filename, group.label, setMessage, smartMergeMaxSize ?? SMART_MERGE_MAX_SIZE)
          : [{ bytes: await docketPdf.save(), filename, isOverLimit: false }];

        outputs.push(...groupOutputs);
      }

      outputs.forEach((output) => zip.file(output.filename, output.bytes));
      downloadBlob(await zip.generateAsync({ type: "blob" }), "workline-gstat-docket.zip");
      setMessage(`Created GSTAT Docket with ${outputs.length} output file${outputs.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create GSTAT Docket.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] px-2 py-3 text-slate-950 sm:px-3 lg:px-4">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 " />
        <div className="absolute inset-0  bg-[size:48px_48px]" />
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
                <span className="flex size-14 items-center justify-center rounded-2xl bg-navy-700 text-white">
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
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={Archive} label="Compress PDF" onClick={openCompressionDialog} />
              <ToolButton disabled={isProcessing || selectedRowIds.size < 2} icon={Shuffle} label="Merge" onClick={mergeSelectedPdfs} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={BookMarked} label="Smart Merge" onClick={startSmartMerge} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={Scissors} label="Split" onClick={splitSelectedPdfs} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={Scissors} label="Smart Split" onClick={startSmartSplit} />
              <label className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm">
                <input
                  checked={smartSplitShouldLimitSize}
                  className="size-4 rounded border-slate-300 accent-navy-500"
                  disabled={isProcessing}
                  onChange={(event) => setSmartSplitShouldLimitSize(event.target.checked)}
                  type="checkbox"
                />
                19.5 MB Split
              </label>
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={Hash} label="Page No." onClick={addPageNumbersToPdfs} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={FileImage} label="TRUE COPY" onClick={applyTrueCopyStampToPdfs} />
              <ToolButton disabled={isProcessing || selectedRowIds.size === 0} icon={BookMarked} label="PaperBook" onClick={createPaperBookPdf} />
              <ToolButton disabled={isProcessing || selectedRowIds.size < 2} icon={BookMarked} label="Bookmarks" onClick={createBookmarkedPdf} />
              <ToolButton disabled={isProcessing || pdfRows.length === 0} icon={ListOrdered} label="Create Index" onClick={createPdfIndex} />
              <ToolButton disabled={isProcessing} icon={FileSearch} label="GSTAT Docket" onClick={openGstatDocket} />
              <input
                accept={MERGE_FILE_ACCEPT}
                className="hidden"
                multiple
                onChange={selectFiles}
                ref={fileInputRef}
                type="file"
              />
              <input
                accept={MERGE_FILE_ACCEPT}
                className="hidden"
                multiple
                onChange={selectFolder}
                ref={folderInputRef}
                type="file"
                {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
              />
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-navy-800"
                onClick={() => folderInputRef.current?.click()}
                type="button"
              >
                <FolderOpen className="size-4" />
                Select Folder
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-4 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:bg-slate-100"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <FileImage className="size-4" />
                Select Files
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={pdfRows.length === 0}
                onClick={clearAllFiles}
                type="button"
              >
                <X className="size-4" />
                Clear
              </button>
            </div>
          </div>
        </header>

        <section className="workline-frame mt-4 rounded-[20px] p-3 md:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">PDF & Image Files</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {folderName ? folderName : "Select a folder or files to load PDFs and images."}
              </p>
              {message ? <p className="mt-1 text-sm font-bold text-indigo-700">{message}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Metric label="Files" value={String(pdfRows.length)} />
              <Metric label="Selected" value={String(selectedRowIds.size)} />
              <Metric label="Total Page" value={isReading ? "..." : String(totalPages)} />
              <Metric label="Selected Page" value={isReading ? "..." : String(selectedPages)} />
              <Metric label="Total Size" value={formatFileSize(totalSize)} />
              <Metric label="Selected Size" value={formatFileSize(selectedSize)} />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-950/10 bg-white">
            <div className="max-h-[calc(100vh-285px)] overflow-auto">
              <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-navy-700 text-white">
                  <tr>
                    <th className="w-12 border-b border-r border-white/15 px-3 py-3">
                      <input
                        aria-label="Select all files"
                        checked={areAllRowsSelected}
                        className="size-4 rounded border-slate-300 accent-navy-500"
                        onChange={toggleAllRows}
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = areSomeRowsSelected;
                          }
                        }}
                        type="checkbox"
                      />
                    </th>
                    <th className="w-24 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Move</th>
                    <th className="w-16 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Sno</th>
                    <th className="w-20 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Preview</th>
                    <th className="border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">File Name</th>
                    <th className="w-36 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Size</th>
                    <th className="w-32 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Page</th>
                    <th className="w-44 border-b border-r border-white/15 px-3 py-3 text-xs font-black uppercase">Document</th>
                    <th className="w-48 border-b border-white/15 px-3 py-3 text-xs font-black uppercase">Annexure</th>
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
                            className="size-4 rounded border-slate-300 accent-navy-600"
                            onChange={() => toggleRowSelection(row.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              aria-label={`Move ${row.name} up`}
                              className="flex size-8 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                              disabled={index === 0 || isProcessing}
                              onClick={() => movePdfRow(row.id, -1)}
                              title="Move up"
                              type="button"
                            >
                              <ArrowUp className="size-4" />
                            </button>
                            <button
                              aria-label={`Move ${row.name} down`}
                              className="flex size-8 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                              disabled={index === pdfRows.length - 1 || isProcessing}
                              onClick={() => movePdfRow(row.id, 1)}
                              title="Move down"
                              type="button"
                            >
                              <ArrowDown className="size-4" />
                            </button>
                          </div>
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-bold text-slate-700">
                          {index + 1}
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-center">
                            <button
                              aria-label={`Preview ${row.name}`}
                              className="flex size-8 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100"
                              onClick={() => previewPdfRow(row)}
                              title={row.fileKind === "pdf" ? "Preview PDF" : "Preview image"}
                              type="button"
                            >
                              <Eye className="size-4" />
                            </button>
                          </div>
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-bold text-slate-950">
                          <div className="flex flex-col gap-1">
                            <span>{row.name}</span>
                            {row.fileKind === "image" ? (
                              <span className="w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase text-sky-700">Image converts on merge</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                          {formatFileSize(row.size)}
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-700">
                          {row.pages ?? "Could not read"}
                        </td>
                        <td className="border-b border-r border-slate-200 px-3 py-2">
                          <select
                            aria-label={`Select document type for ${row.name}`}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                            onChange={(event) => updateDocumentType(row.id, event.target.value)}
                            value={row.documentType}
                          >
                            <option value="">Select</option>
                            {DOCUMENT_TYPES.map((documentType) => (
                              <option key={documentType} value={documentType}>
                                {documentType}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <input
                            aria-label={`Annexure number or text for ${row.name}`}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-transparent disabled:placeholder:text-transparent focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                            disabled={row.documentType !== "Annexure"}
                            onChange={(event) => updateAnnexureLabel(row.id, event.target.value)}
                            placeholder="No. / text"
                            value={row.annexureLabel}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-12 text-center text-sm font-bold text-slate-500" colSpan={9}>
                        {isReading ? "Reading files..." : "No PDF or image files selected yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
      {isCompressModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-700/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isProcessing) {
              setIsCompressModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-black uppercase text-slate-950">Compress PDF</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">
                  {selectedRows.filter((row) => row.fileKind === "pdf").length} selected PDF file{selectedRows.filter((row) => row.fileKind === "pdf").length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                aria-label="Close PDF compression"
                className="flex size-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100 disabled:opacity-45"
                disabled={isProcessing}
                onClick={() => setIsCompressModalOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <label className="block">
                <span className="text-xs font-black uppercase text-slate-600">Target size per PDF (MB)</span>
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
                  disabled={isProcessing}
                  min="0.1"
                  onChange={(event) => setCompressionTargetMb(event.target.value)}
                  step="0.1"
                  type="number"
                  value={compressionTargetMb}
                />
              </label>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">
                Digitally signed PDFs are detected and skipped. WorkLine will never alter a signed PDF because any PDF compression would invalidate its digital signature.
              </div>
              <p className="text-xs font-semibold leading-relaxed text-slate-600">
                Strong compression may reduce image quality and convert searchable page content into page images. The original file on your computer is never changed.
              </p>
              {compressionMessage ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-relaxed text-slate-700">
                  {compressionMessage}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-950/10 bg-white px-4 text-xs font-black uppercase text-slate-800 transition hover:bg-slate-100 disabled:opacity-45"
                  disabled={isProcessing}
                  onClick={() => setIsCompressModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isProcessing}
                  onClick={compressSelectedPdfs}
                  type="button"
                >
                  <Archive className="size-4" />
                  {isProcessing ? "Compressing..." : "Compress & download"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {pdfPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-700/70 p-4">
          <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-black text-slate-950">{pdfPreview.name}</p>
              <button
                aria-label="Close PDF preview"
                className="flex size-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100"
                onClick={closePdfPreview}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-slate-100">
              <iframe
                className="h-full w-full bg-slate-100"
                src={pdfPreview.url}
                title={`Preview ${pdfPreview.name}`}
              />
            </div>
          </div>
        </div>
      ) : null}
      {isDscModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-700/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-black uppercase text-slate-950">DSC filing</p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">
                  {selectedRows.length} selected file{selectedRows.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                aria-label="Close DSC filing"
                className="flex size-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white text-slate-700 transition hover:bg-slate-100"
                onClick={() => setIsDscModalOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase text-slate-500">Local helper</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{dscMessage || "Not checked yet."}</p>
                {dscHelperStatus === "offline" ? (
                  <a
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-navy-700 px-3 text-xs font-black uppercase text-white shadow-sm transition hover:bg-navy-800"
                    download
                    href={DSC_HELPER_DOWNLOAD_URL}
                  >
                    Install DSC helper
                  </a>
                ) : null}
                {dscHelperStatus === "emsigner_missing" ? (
                  <>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">
                      If GSTSigner is already installed, open it from the Start Menu and click Check again. Use the download only when GSTSigner is not installed on this computer.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:bg-slate-100"
                        download
                        href={DSC_HELPER_DOWNLOAD_URL}
                      >
                        Update helper
                      </a>
                      <a
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:bg-slate-100"
                        href={EMSIGNER_DOWNLOAD_URL}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Download GSTSigner
                      </a>
                    </div>
                  </>
                ) : null}
                {dscHelperStatus === "emsigner_not_running" ? (
                  <>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">
                      GSTSigner appears to be installed, but its local service is not reachable. Fully exit GSTSigner/emSigner from the taskbar or Task Manager, reopen it, allow any Windows firewall prompt, then click Check again.
                    </p>
                    <a
                      className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:bg-slate-100"
                      download
                      href={DSC_HELPER_DOWNLOAD_URL}
                    >
                      Update helper
                    </a>
                  </>
                ) : null}
                {dscHelperStatus === "unsupported" ? (
                  <p className="mt-2 text-xs font-bold leading-relaxed text-amber-700">
                    Setup is complete on this computer, but automatic PDF signing still needs the final WorkLine connector. Use the manual pack below to sign in NIC Digital Signing Tool for now.
                  </p>
                ) : null}
              </div>
              {!selectedRows.length ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                  Select one or more PDFs in the table before signing.
                </p>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-black uppercase text-slate-500">Visible signature</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {DSC_VISIBLE_PLACEMENTS.map((placement) => (
                    <button
                      className={`h-10 rounded-lg border px-2 text-xs font-black uppercase transition ${
                        dscVisiblePlacement === placement.value
                          ? "border-slate-950 bg-navy-700 text-white"
                          : "border-slate-950/10 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={placement.value}
                      onClick={() => setDscVisiblePlacement(placement.value)}
                      type="button"
                    >
                      {placement.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">
                  WorkLine will apply one DSC to the whole PDF and repeat the visible mark on the selected pages.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                  disabled={selectedRows.length === 0}
                  onClick={downloadManualDscPack}
                  type="button"
                >
                  <Download className="size-4" />
                  Manual pack
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-950/10 bg-white px-3 text-xs font-black uppercase text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                  disabled={dscHelperStatus === "checking" || dscHelperStatus === "signing"}
                  onClick={checkDscHelper}
                  type="button"
                >
                  <RefreshCw className={`size-4 ${dscHelperStatus === "checking" ? "animate-spin" : ""}`} />
                  Check
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy-700 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={dscHelperStatus !== "ready" || selectedRows.length === 0}
                  onClick={signSelectedPdfsWithDsc}
                  type="button"
                >
                  <ShieldCheck className="size-4" />
                  Sign selected
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
  icon: LucideIcon;
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

type SignatureRect = {
  detectedBy: "annotation" | "first_page_top_left";
  height: number;
  pageIndex: number;
  width: number;
  x: number;
  y: number;
};

async function duplicateVisibleDscSignature(buffer: ArrayBuffer) {
  const pdf = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
  const signatureRect = findVisibleSignatureRect(pdf);

  if (!signatureRect) {
    throw new Error("Could not find a visible DSC mark in this PDF.");
  }

  const pages = pdf.getPages();
  const sourcePage = pages[signatureRect.pageIndex];
  const embeddedSignature = await pdf.embedPage(sourcePage, {
    bottom: signatureRect.y,
    left: signatureRect.x,
    right: signatureRect.x + signatureRect.width,
    top: signatureRect.y + signatureRect.height,
  });

  pages.forEach((page, pageIndex) => {
    if (pageIndex === signatureRect.pageIndex) {
      return;
    }

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const width = Math.min(signatureRect.width, Math.max(48, pageWidth - 24));
    const height = Math.min(signatureRect.height, Math.max(24, pageHeight - 24));
    const x = Math.min(Math.max(signatureRect.x, 12), Math.max(12, pageWidth - width - 12));
    const y = Math.min(Math.max(signatureRect.y, 12), Math.max(12, pageHeight - height - 12));

    page.drawPage(embeddedSignature, {
      height,
      width,
      x,
      y,
    });
  });

  return {
    bytes: await pdf.save(),
    rect: signatureRect,
  };
}

function findVisibleSignatureRect(pdf: PDFDocument, allowFallback = true): SignatureRect | null {
  const pages = pdf.getPages();

  for (const [pageIndex, page] of pages.entries()) {
    const annots = page.node.Annots();

    if (!annots) {
      continue;
    }

    const annotCount = typeof annots.size === "function" ? annots.size() : 0;

    for (let index = 0; index < annotCount; index += 1) {
      const annot = annots.lookup(index);

      if (!(annot instanceof PDFDict) || !isLikelySignatureAnnotation(annot)) {
        continue;
      }

      const rect = readAnnotationRect(annot);

      if (rect) {
        return { ...rect, detectedBy: "annotation", pageIndex };
      }
    }
  }

  return allowFallback ? createFirstPageTopLeftSignatureFallback(pages) : null;
}

function flattenVisibleSignatureAppearances(pdf: PDFDocument) {
  pdf.getPages().forEach((page) => {
    const annots = page.node.Annots();

    if (!annots) {
      return;
    }

    const annotCount = typeof annots.size === "function" ? annots.size() : 0;

    for (let index = 0; index < annotCount; index += 1) {
      const annot = annots.lookup(index);

      if (!(annot instanceof PDFDict) || !isLikelySignatureAnnotation(annot)) {
        continue;
      }

      const rect = readAnnotationRect(annot);
      const appearance = getNormalAnnotationAppearance(annot);

      if (!rect || !appearance) {
        continue;
      }

      const appearanceName = page.node.newXObject("VisibleSignature", appearance.ref);
      const bbox = readAppearanceBBox(appearance.stream) ?? { bottom: 0, left: 0, right: rect.width, top: rect.height };
      const bboxWidth = Math.abs(bbox.right - bbox.left) || rect.width;
      const bboxHeight = Math.abs(bbox.top - bbox.bottom) || rect.height;
      const scaleX = rect.width / bboxWidth;
      const scaleY = rect.height / bboxHeight;

      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(scaleX, 0, 0, scaleY, rect.x - bbox.left * scaleX, rect.y - bbox.bottom * scaleY),
        drawObject(appearanceName),
        popGraphicsState()
      );
    }
  });
}

function getNormalAnnotationAppearance(annot: PDFDict) {
  const appearanceDict = annot.lookup(PDFName.of("AP"));

  if (!(appearanceDict instanceof PDFDict)) {
    return null;
  }

  const normalAppearance = appearanceDict.get(PDFName.of("N"));
  const resolvedAppearance = appearanceDict.context.lookup(normalAppearance);

  if (normalAppearance instanceof PDFRef && resolvedAppearance instanceof PDFStream) {
    return { ref: normalAppearance, stream: resolvedAppearance };
  }

  if (resolvedAppearance instanceof PDFDict) {
    for (const [, appearanceState] of resolvedAppearance.entries()) {
      const resolvedState = resolvedAppearance.context.lookup(appearanceState);

      if (appearanceState instanceof PDFRef && resolvedState instanceof PDFStream) {
        return { ref: appearanceState, stream: resolvedState };
      }
    }
  }

  return null;
}

function readAppearanceBBox(stream: PDFStream) {
  const bbox = stream.dict.lookup(PDFName.of("BBox")) as unknown as {
    lookup?: (index: number) => unknown;
    size?: () => number;
  };

  if (!bbox || typeof bbox.size !== "function" || bbox.size() < 4 || typeof bbox.lookup !== "function") {
    return null;
  }

  const left = readPdfNumber(bbox.lookup(0));
  const bottom = readPdfNumber(bbox.lookup(1));
  const right = readPdfNumber(bbox.lookup(2));
  const top = readPdfNumber(bbox.lookup(3));

  if ([left, bottom, right, top].some((value) => value === null)) {
    return null;
  }

  return {
    bottom: bottom as number,
    left: left as number,
    right: right as number,
    top: top as number,
  };
}

function createFirstPageTopLeftSignatureFallback(pages: ReturnType<PDFDocument["getPages"]>): SignatureRect {
  const firstPage = pages[0];

  if (!firstPage) {
    throw new Error("Could not read the first page of this PDF.");
  }

  const { height: pageHeight, width: pageWidth } = firstPage.getSize();
  const width = Math.min(440, pageWidth * 0.74);
  const height = Math.min(165, pageHeight * 0.2);

  return {
    detectedBy: "first_page_top_left",
    height,
    pageIndex: 0,
    width,
    x: 0,
    y: pageHeight - height,
  };
}

function isLikelySignatureAnnotation(annot: PDFDict) {
  const subtype = annot.lookup(PDFName.of("Subtype"))?.toString();
  const fieldType = annot.lookup(PDFName.of("FT"))?.toString();
  const parent = annot.lookup(PDFName.of("Parent"));
  const parentFieldType = parent instanceof PDFDict ? parent.lookup(PDFName.of("FT"))?.toString() : "";
  const hasSignatureValue = Boolean(annot.lookup(PDFName.of("V")) || (parent instanceof PDFDict && parent.lookup(PDFName.of("V"))));

  return subtype === "/Widget" && (fieldType === "/Sig" || parentFieldType === "/Sig" || hasSignatureValue);
}

function readAnnotationRect(annot: PDFDict) {
  const rect = annot.lookup(PDFName.of("Rect")) as unknown as {
    lookup?: (index: number) => unknown;
    size?: () => number;
  };

  if (!rect || typeof rect.size !== "function" || rect.size() < 4 || typeof rect.lookup !== "function") {
    return null;
  }

  const left = readPdfNumber(rect.lookup(0));
  const bottom = readPdfNumber(rect.lookup(1));
  const right = readPdfNumber(rect.lookup(2));
  const top = readPdfNumber(rect.lookup(3));

  if ([left, bottom, right, top].some((value) => value === null)) {
    return null;
  }

  const x = Math.min(left as number, right as number);
  const y = Math.min(bottom as number, top as number);
  const width = Math.abs((right as number) - (left as number));
  const height = Math.abs((top as number) - (bottom as number));

  if (width < 20 || height < 12) {
    return null;
  }

  return { height, width, x, y };
}

function readPdfNumber(value: unknown) {
  if (value instanceof PDFNumber) {
    return value.asNumber();
  }

  if (typeof value === "number") {
    return value;
  }

  return null;
}

function isSupportedMergeFile(file: File) {
  return getSupportedFileKind(file) !== null;
}

function getSupportedFileKind(file: File): SupportedFileKind | null {
  const extension = getFileExtension(file.name);
  const type = file.type.toLowerCase();

  if (extension === ".pdf" || PDF_FILE_TYPES.has(type)) {
    return "pdf";
  }

  if (IMAGE_FILE_EXTENSIONS.has(extension) || IMAGE_FILE_TYPES.has(type)) {
    return "image";
  }

  return null;
}

function getFileExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");

  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
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

function hasDigitalSignature(bytes: Uint8Array) {
  const pdfSource = new TextDecoder("latin1").decode(bytes);

  return (
    /\/ByteRange\s*\[/.test(pdfSource) ||
    /\/Type\s*\/Sig\b/.test(pdfSource) ||
    /\/FT\s*\/Sig\b/.test(pdfSource)
  );
}

async function compressUnsignedPdfToTarget(
  sourceBytes: Uint8Array,
  targetBytes: number,
  reportProgress: (message: string) => void
) {
  if (sourceBytes.byteLength <= targetBytes) {
    return { bytes: sourceBytes, metTarget: true };
  }

  const sourcePdf = await PDFDocument.load(sourceBytes.slice(), { ignoreEncryption: true });
  const losslessBytes = await sourcePdf.save({ useObjectStreams: true });

  if (losslessBytes.byteLength <= targetBytes) {
    return { bytes: losslessBytes, metTarget: true };
  }

  let bestBytes = losslessBytes.byteLength < sourceBytes.byteLength ? losslessBytes : sourceBytes;
  const compressionRatio = targetBytes / sourceBytes.byteLength;
  const startScale = Math.max(0.55, Math.min(1.5, 1.5 * Math.sqrt(compressionRatio)));
  const profiles = [
    { quality: 0.84, scale: startScale },
    { quality: 0.72, scale: Math.max(0.5, startScale * 0.86) },
    { quality: 0.60, scale: Math.max(0.45, startScale * 0.72) },
    { quality: 0.48, scale: Math.max(0.4, startScale * 0.60) },
    { quality: 0.36, scale: Math.max(0.35, startScale * 0.50) },
  ];

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: sourceBytes.slice() });
  const renderedPdf = await loadingTask.promise;

  try {
    for (const [profileIndex, profile] of profiles.entries()) {
      reportProgress(`compression pass ${profileIndex + 1} of ${profiles.length}...`);
      await waitForUiUpdate();
      const candidatePdf = await PDFDocument.create();

      for (let pageNumber = 1; pageNumber <= renderedPdf.numPages; pageNumber += 1) {
        const sourcePage = await renderedPdf.getPage(pageNumber);
        const pageSize = sourcePage.getViewport({ scale: 1 });
        const renderViewport = sourcePage.getViewport({ scale: profile.scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("This browser could not prepare the PDF page for compression.");
        }

        canvas.width = Math.max(1, Math.round(renderViewport.width));
        canvas.height = Math.max(1, Math.round(renderViewport.height));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await sourcePage.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;

        const jpegBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", profile.quality));

        if (!jpegBlob) {
          throw new Error("This browser could not create the compressed PDF page.");
        }

        const embeddedPage = await candidatePdf.embedJpg(await jpegBlob.arrayBuffer());
        const outputPage = candidatePdf.addPage([pageSize.width, pageSize.height]);

        outputPage.drawImage(embeddedPage, {
          height: pageSize.height,
          width: pageSize.width,
          x: 0,
          y: 0,
        });

        canvas.width = 1;
        canvas.height = 1;
      }

      const candidateBytes = await candidatePdf.save({ useObjectStreams: true });

      if (candidateBytes.byteLength < bestBytes.byteLength) {
        bestBytes = candidateBytes;
      }

      if (candidateBytes.byteLength <= targetBytes) {
        return { bytes: candidateBytes, metTarget: true };
      }
    }
  } finally {
    await renderedPdf.destroy();
  }

  return { bytes: bestBytes, metTarget: bestBytes.byteLength <= targetBytes };
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

async function loadPdfWithVisibleSignatures(file: File) {
  let pdf: PDFDocument;

  try {
    pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown PDF parsing error.";

    throw new Error(`Could not read "${file.name}". This PDF appears to be damaged or not fully valid. Re-save or print it as a new PDF, then try again. Details: ${detail}`);
  }

  flattenVisibleSignatureAppearances(pdf);

  return pdf;
}

async function appendFileToMergedPdf(targetPdf: PDFDocument, file: File) {
  const fileKind = getSupportedFileKind(file);

  if (fileKind === "pdf") {
    const sourcePdf = await loadPdfWithVisibleSignatures(file);
    await appendPortraitPages(targetPdf, sourcePdf);
    return;
  }

  if (fileKind === "image") {
    await appendImageAsPdfPage(targetPdf, file);
    return;
  }

  throw new Error(`"${file.name}" is not supported for merge. Choose PDF, JPG, JPEG, PNG, or WebP files.`);
}

async function appendImageAsPdfPage(targetPdf: PDFDocument, file: File) {
  const imageBytes = await imageFileToPngBytes(file);
  const embeddedImage = await targetPdf.embedPng(imageBytes);
  const [pageWidth, pageHeight] = A4_PORTRAIT_SIZE;
  const page = targetPdf.addPage(A4_PORTRAIT_SIZE);
  const maxWidth = pageWidth - IMAGE_PAGE_MARGIN * 2;
  const maxHeight = pageHeight - IMAGE_PAGE_MARGIN * 2;
  const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height);
  const width = embeddedImage.width * scale;
  const height = embeddedImage.height * scale;

  page.drawImage(embeddedImage, {
    height,
    width,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2
  });
}

async function imageFileToPngBytes(file: File) {
  const image = await decodeImageFile(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    image.close?.();
    throw new Error(`Could not prepare "${file.name}" for PDF merge.`);
  }

  canvas.width = image.width;
  canvas.height = image.height;
  context.drawImage(image.source, 0, 0);
  image.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

  if (!blob) {
    throw new Error(`Could not convert "${file.name}" to a PDF page.`);
  }

  return blob.arrayBuffer();
}

async function decodeImageFile(file: File): Promise<{ close?: () => void; height: number; source: CanvasImageSource; width: number }> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);

    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      source: bitmap,
      width: bitmap.width
    };
  }

  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read "${file.name}" as an image.`));
      element.src = url;
    });

    return {
      close: () => URL.revokeObjectURL(url),
      height: image.naturalHeight || image.height,
      source: image,
      width: image.naturalWidth || image.width
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function stripPdfExtension(filename: string) {
  return filename.replace(/\.pdf$/i, "");
}

function getDocumentBookmarkTitle(row: PdfFileRow) {
  return row.documentType || stripPdfExtension(row.name);
}

function getAnnexureBookmarkTitle(row: PdfFileRow) {
  const label = row.annexureLabel.trim();

  return label ? `Annexure - ${label}` : stripPdfExtension(row.name);
}

function getAnnexurePageLabel(row: PdfFileRow) {
  const label = row.annexureLabel.trim();

  if (!label) {
    return "Annexure";
  }

  return /^annexure\b/i.test(label) ? label : `Annexure ${label}`;
}

async function loadTrueCopyStamp() {
  const stampResponse = await fetch(TRUE_COPY_STAMP_URL);

  if (!stampResponse.ok) {
    throw new Error("Could not load the TRUE COPY stamp.");
  }

  return stampResponse.arrayBuffer();
}

type GstatDocketPreparedRow = {
  bytes: Uint8Array;
  row: PdfFileRow;
};

async function createGstatDocketPreparedRows(
  rows: PdfFileRow[],
  pageNumberState: ContinuousPageNumberState | null,
  fileMap: Map<string, File>
): Promise<GstatDocketPreparedRow[]> {
  const preparedRows: GstatDocketPreparedRow[] = [];

  for (const row of rows) {
    const file = fileMap.get(row.id);

    if (!file) {
      throw new Error(`Missing file data for ${row.name}. Refresh the folder and try again.`);
    }

    const sourcePdf = await loadPdfWithVisibleSignatures(file);

    const rowPdf = await PDFDocument.create();
    const copiedPages = await rowPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

    copiedPages.forEach((page) => rowPdf.addPage(page));

    if (pageNumberState) {
      await drawContinuousPageNumbers(rowPdf, pageNumberState);
    }

    preparedRows.push({
      bytes: await rowPdf.save(),
      row,
    });
  }

  return preparedRows;
}

function createGstatDocketGroups(rows: GstatDocketPreparedRow[]) {
  const groupedRows = new Map<string, GstatDocketPreparedRow[]>();
  const orderedTypes: string[] = [];

  rows.forEach((preparedRow) => {
    const documentType = preparedRow.row.documentType.trim() || "Unclassified";
    const currentRows = groupedRows.get(documentType) ?? [];

    if (!groupedRows.has(documentType)) {
      orderedTypes.push(documentType);
    }

    currentRows.push(preparedRow);
    groupedRows.set(documentType, currentRows);
  });

  return orderedTypes.map((documentType) => ({
    label: documentType === "Annexure" ? "Annexures" : documentType,
    rows: groupedRows.get(documentType) ?? [],
  }));
}

async function createGstatDocketPdf(
  rows: GstatDocketPreparedRow[],
  options: {
    stampBuffer: ArrayBuffer | null;
  }
) {
  const docketPdf = await PDFDocument.create();
  const bookmarks: BookmarkNode[] = [];
  const trueCopyPageIndices: number[] = [];

  for (const preparedRow of rows) {
    const row = preparedRow.row;
    const startPageIndex = docketPdf.getPageCount();
    const sourcePdf = await PDFDocument.load(preparedRow.bytes.slice(0), { ignoreEncryption: true });
    const copiedPages = await docketPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

    copiedPages.forEach((page) => docketPdf.addPage(page));

    const endPageIndex = docketPdf.getPageCount() - 1;

    if (options.stampBuffer && PAPERBOOK_TRUE_COPY_DOCUMENT_TYPES.has(row.documentType)) {
      for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
        trueCopyPageIndices.push(pageIndex);
      }
    }

    bookmarks.push({
      pageIndex: startPageIndex,
      title: row.documentType === "Annexure" ? getAnnexureBookmarkTitle(row) : getDocumentBookmarkTitle(row),
    });
  }

  if (!docketPdf.getPageCount()) {
    throw new Error("Could not merge the selected PDF files.");
  }

  addPdfBookmarks(docketPdf, bookmarks);

  if (options.stampBuffer) {
    await drawTrueCopyStampOnPages(docketPdf, options.stampBuffer, trueCopyPageIndices);
  }

  return docketPdf;
}

function createSmartSplitGroups(rows: PdfFileRow[]) {
  const selectedTypes = new Set(rows.map((row) => row.documentType.trim()).filter(Boolean));
  const orderedTypes = [
    ...DOCUMENT_TYPES.filter((documentType) => selectedTypes.has(documentType)),
    ...Array.from(selectedTypes).filter((documentType) => !DOCUMENT_TYPES.includes(documentType)).sort(),
  ];

  return orderedTypes.map((documentType, index) => {
    const label = documentType === "Annexure" ? "Annexures" : documentType;

    return {
      filename: `${String(index + 1).padStart(2, "0")}-${sanitizeFilenamePart(label)}.pdf`,
      label,
      rows: rows.filter((row) => row.documentType === documentType),
    };
  });
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "Document";
}

async function createSmartSplitSizedOutputs(
  sourcePdf: PDFDocument,
  filename: string,
  label: string,
  reportProgress: (message: string) => void,
  maxSize = SMART_MERGE_MAX_SIZE
) {
  const fullBytes = await sourcePdf.save();

  if (fullBytes.byteLength <= maxSize) {
    return [{ bytes: fullBytes, filename, isOverLimit: false }];
  }

  const outputs: SmartMergeOutput[] = [];
  const pageCount = sourcePdf.getPageCount();
  const baseName = stripPdfExtension(filename);
  let startPageIndex = 0;

  while (startPageIndex < pageCount) {
    let endPageIndex = startPageIndex;
    let bestEndPageIndex = startPageIndex;
    let bestBytes = await createPdfBytesForCopiedPageRange(sourcePdf, startPageIndex, startPageIndex);
    let singlePageWasTooLarge = bestBytes.byteLength > maxSize;

    while (endPageIndex < pageCount) {
      reportProgress(`Smart Split: ${label} is over ${formatFileSize(maxSize)}, testing pages ${startPageIndex + 1}-${endPageIndex + 1}...`);
      await waitForUiUpdate();

      const candidateBytes = await createPdfBytesForCopiedPageRange(sourcePdf, startPageIndex, endPageIndex);

      if (candidateBytes.byteLength <= maxSize) {
        bestBytes = candidateBytes;
        bestEndPageIndex = endPageIndex;
        endPageIndex += 1;
        continue;
      }

      if (endPageIndex === startPageIndex) {
        bestBytes = candidateBytes;
        bestEndPageIndex = endPageIndex;
        singlePageWasTooLarge = true;
      }

      break;
    }

    outputs.push({
      bytes: bestBytes,
      filename: `${baseName}-part-${String(outputs.length + 1).padStart(2, "0")}.pdf`,
      isOverLimit: singlePageWasTooLarge || bestBytes.byteLength > maxSize,
    });

    startPageIndex = bestEndPageIndex + 1;
  }

  return outputs;
}

async function createPdfBytesForCopiedPageRange(sourcePdf: PDFDocument, startPageIndex: number, endPageIndex: number) {
  const pdf = await PDFDocument.create();

  for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
    await appendPortraitPage(pdf, sourcePdf.getPage(pageIndex));
  }

  return pdf.save();
}

function createSmartMergeLots(rows: PdfFileRow[], maxSize = SMART_MERGE_MAX_SIZE) {
  const lots: SmartMergeLot[] = [];
  let currentLot: SmartMergeLot = { rows: [], size: 0 };

  rows.forEach((row) => {
    const shouldStartNewLot =
      currentLot.rows.length > 0 && currentLot.size + row.size > maxSize;

    if (shouldStartNewLot) {
      lots.push(currentLot);
      currentLot = { rows: [], size: 0 };
    }

    currentLot.rows.push(row);
    currentLot.size += row.size;
  });

  if (currentLot.rows.length) {
    lots.push(currentLot);
  }

  return lots;
}

async function createMergedPdfBytes(rows: PdfFileRow[], fileMap: Map<string, File>) {
  const mergedPdf = await PDFDocument.create();

  for (const row of rows) {
    const file = fileMap.get(row.id);

    if (!file) {
      continue;
    }

    const sourcePdf = await loadPdfWithVisibleSignatures(file);
    await appendPortraitPages(mergedPdf, sourcePdf);
  }

  if (!mergedPdf.getPageCount()) {
    throw new Error("Could not merge the selected PDF files.");
  }

  return mergedPdf.save();
}

async function createSmartMergePartsForOversizedPdf(
  row: PdfFileRow,
  fileMap: Map<string, File>,
  reportProgress: (message: string) => void,
  maxSize = SMART_MERGE_MAX_SIZE
) {
  const file = fileMap.get(row.id);

  if (!file) {
    return [];
  }

  const sourcePdf = await loadPdfWithVisibleSignatures(file);
  const pageCount = sourcePdf.getPageCount();
  const outputs: SmartMergeOutput[] = [];
  let startPageIndex = 0;

  while (startPageIndex < pageCount) {
    let endPageIndex = startPageIndex;
    let bestBytes: Uint8Array | null = null;
    let bestEndPageIndex = startPageIndex;
    let singlePageWasTooLarge = false;

    while (endPageIndex < pageCount) {
      reportProgress(
        `Smart Merge: splitting ${row.name}, testing pages ${startPageIndex + 1}-${endPageIndex + 1} of ${pageCount}...`
      );
      await waitForUiUpdate();
      const candidateBytes = await createPdfBytesForPageRange(sourcePdf, startPageIndex, endPageIndex);

      if (candidateBytes.byteLength <= maxSize) {
        bestBytes = candidateBytes;
        bestEndPageIndex = endPageIndex;
        endPageIndex += 1;
        continue;
      }

      if (bestBytes === null) {
        bestBytes = candidateBytes;
        bestEndPageIndex = endPageIndex;
        singlePageWasTooLarge = true;
      }

      break;
    }

    if (!bestBytes) {
      break;
    }

    outputs.push({
      bytes: bestBytes,
      filename: `${stripPdfExtension(row.name)}-pages-${formatPageRangeLabel(startPageIndex + 1, bestEndPageIndex + 1)}.pdf`,
      isOverLimit: singlePageWasTooLarge || bestBytes.byteLength > maxSize
    });
    reportProgress(
      `Smart Merge: created ${stripPdfExtension(row.name)} pages ${startPageIndex + 1}-${bestEndPageIndex + 1} (${formatFileSize(bestBytes.byteLength)}).`
    );
    await waitForUiUpdate();
    startPageIndex = bestEndPageIndex + 1;
  }

  return outputs;
}

async function createPdfBytesForPageRange(sourcePdf: PDFDocument, startPageIndex: number, endPageIndex: number) {
  const pdf = await PDFDocument.create();

  for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
    await appendPortraitPage(pdf, sourcePdf.getPage(pageIndex));
  }

  return pdf.save();
}

function getPageImageDimensions(pdf: PDFDocument, resources: PDFDict | undefined, visitedRefs = new Set<string>()): ImageDimensions[] {
  const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);

  if (!xObjects) {
    return [];
  }

  const images: ImageDimensions[] = [];

  for (const [, object] of xObjects.entries()) {
    const refKey = object instanceof PDFRef ? object.toString() : "";

    if (refKey && visitedRefs.has(refKey)) {
      continue;
    }

    if (refKey) {
      visitedRefs.add(refKey);
    }

    const xObject = pdf.context.lookup(object);

    if (!(xObject instanceof PDFStream)) {
      continue;
    }

    const subtype = xObject.dict.lookupMaybe(PDFName.of("Subtype"), PDFName);

    if (subtype?.asString() === "/Image") {
      const width = xObject.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber();
      const height = xObject.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber();

      if (width && height) {
        images.push({ height, width });
      }

      continue;
    }

    if (subtype?.asString() === "/Form") {
      images.push(...getPageImageDimensions(pdf, xObject.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), visitedRefs));
    }
  }

  return images;
}

function showDpiCheckResult(lowDpiIssues: DpiIssue[], unconfirmedIssues: DpiIssue[]) {
  if (!lowDpiIssues.length && !unconfirmedIssues.length) {
    window.alert("300 DPI check passed. No selected PDF pages were found below 300 DPI.");
    return;
  }

  const lines = ["300 DPI check result:"];

  if (lowDpiIssues.length) {
    lines.push("", "Pages below 300 DPI:");
    lowDpiIssues.slice(0, 40).forEach((issue) => {
      lines.push(`- ${issue.filename}, page ${issue.pageNumber}: ${issue.detail}`);
    });
  }

  if (unconfirmedIssues.length) {
    lines.push("", "Pages where DPI could not be confirmed:");
    unconfirmedIssues.slice(0, 40).forEach((issue) => {
      lines.push(`- ${issue.filename}, page ${issue.pageNumber}: ${issue.detail}`);
    });
  }

  if (lowDpiIssues.length + unconfirmedIssues.length > 80) {
    lines.push("", "Showing first 80 results only.");
  }

  window.alert(lines.join("\n"));
}

function waitForUiUpdate() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

async function createPortraitPdf(sourcePdf: PDFDocument) {
  const portraitPdf = await PDFDocument.create();

  await appendPortraitPages(portraitPdf, sourcePdf);

  return portraitPdf;
}

async function appendPortraitPages(targetPdf: PDFDocument, sourcePdf: PDFDocument) {
  for (const sourcePage of sourcePdf.getPages()) {
    await appendPortraitPage(targetPdf, sourcePage);
  }
}

async function appendPortraitPage(targetPdf: PDFDocument, sourcePage: ReturnType<PDFDocument["getPage"]>) {
  const { height, width } = sourcePage.getSize();
  const rotation = normalizePageRotation(sourcePage.getRotation().angle);

  sourcePage.setRotation(degrees(0));
  const embeddedPage = await targetPdf.embedPage(sourcePage);

  // Dimensions as the page is actually DISPLAYED (the viewer applies /Rotate).
  const sideways = rotation === 90 || rotation === 270;
  const viewedWidth = sideways ? height : width;
  const viewedHeight = sideways ? width : height;

  // Drawing the embedded page with this rotation reproduces exactly what the
  // viewer showed (the inverse of the /Rotate flag).
  const viewRotation: 0 | 90 | 180 | 270 = rotation === 90 ? 270 : rotation === 270 ? 90 : (rotation as 0 | 180);

  if (viewedWidth <= viewedHeight) {
    // Displayed portrait already - keep the viewed orientation as-is.
    const page = targetPdf.addPage([viewedWidth, viewedHeight]);
    drawRotatedEmbeddedPage(page, embeddedPage, width, height, viewRotation);
    return;
  }

  // Displayed landscape - additionally turn it 90 degrees so the output page
  // is portrait (same convention as before for plain landscape scans).
  const page = targetPdf.addPage([viewedHeight, viewedWidth]);
  drawRotatedEmbeddedPage(page, embeddedPage, width, height, ((viewRotation + 90) % 360) as 0 | 90 | 180 | 270);
}

function drawRotatedEmbeddedPage(
  page: ReturnType<PDFDocument["addPage"]>,
  embeddedPage: Awaited<ReturnType<PDFDocument["embedPage"]>>,
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270
) {
  if (rotation === 90) {
    page.drawPage(embeddedPage, {
      height,
      rotate: degrees(90),
      width,
      x: height,
      y: 0
    });
    return;
  }

  if (rotation === 180) {
    page.drawPage(embeddedPage, {
      height,
      rotate: degrees(180),
      width,
      x: width,
      y: height
    });
    return;
  }

  if (rotation === 270) {
    page.drawPage(embeddedPage, {
      height,
      rotate: degrees(270),
      width,
      x: 0,
      y: width
    });
    return;
  }

  page.drawPage(embeddedPage, {
    height,
    width,
    x: 0,
    y: 0
  });
}

function promptForPageNumberSettings(): PageNumberSettings | null {
  const startPage = promptForPositiveInteger("Start page numbering from which PDF page?", "1");

  if (startPage === null) {
    return null;
  }

  const startNumber = promptForPositiveInteger("Start page numbering from which number?", "1");

  if (startNumber === null) {
    return null;
  }

  return { startNumber, startPage };
}

function promptForPositiveInteger(message: string, defaultValue: string) {
  const input = window.prompt(message, defaultValue);

  if (input === null) {
    return null;
  }

  const value = Number(input.trim());

  if (!Number.isInteger(value) || value < 1) {
    window.alert("Enter a whole number greater than 0.");
    return null;
  }

  return value;
}

function promptForSmartMergeMaxSize(message = "Enter Smart Merge size limit in MB") {
  const input = window.prompt(message, String(DEFAULT_SMART_MERGE_MAX_MB));

  if (input === null) {
    return null;
  }

  const value = Number(input.trim());

  if (!Number.isFinite(value) || value <= 0) {
    window.alert("Enter a valid MB limit greater than 0.");
    return null;
  }

  return value * 1024 * 1024;
}

async function drawPageNumbers(pdf: PDFDocument, settings: PageNumberSettings = { startNumber: 1, startPage: 1 }) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const startPageIndex = settings.startPage - 1;

  pages.forEach((page, index) => {
    if (index < startPageIndex) {
      return;
    }

    const text = String(settings.startNumber + index - startPageIndex);
    drawPageNumberText(page, text, font);
  });
}

type ContinuousPageNumberState = {
  nextPageNumber: number;
  processedPages: number;
  startPage: number;
};

function createContinuousPageNumberState(settings: PageNumberSettings): ContinuousPageNumberState {
  return {
    nextPageNumber: settings.startNumber,
    processedPages: 0,
    startPage: settings.startPage,
  };
}

async function drawContinuousPageNumbers(pdf: PDFDocument, state: ContinuousPageNumberState) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  pdf.getPages().forEach((page) => {
    state.processedPages += 1;

    if (state.processedPages < state.startPage) {
      return;
    }

    drawPageNumberText(page, String(state.nextPageNumber), font);
    state.nextPageNumber += 1;
  });
}

function drawPageNumberText(
  page: ReturnType<PDFDocument["getPages"]>[number],
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  lineIndex = 0
) {
  // Draws `text` so it reads upright in the top-right corner of the page AS
  // DISPLAYED, whatever /Rotate flag the page carries (scanners commonly emit
  // landscape pages with /Rotate 90 or 270). `lineIndex` moves the text down
  // by whole lines in the viewed orientation.
  const { height, width } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, PDF_PAGE_NUMBER_FONT_SIZE);
  const rotation = normalizePageRotation(page.getRotation().angle);
  const topOffset = PDF_PAGE_NUMBER_MARGIN + PDF_PAGE_NUMBER_FONT_SIZE + lineIndex * (PDF_PAGE_NUMBER_FONT_SIZE + 4);
  const baseOptions = {
    color: rgb(0, 0, 0),
    font,
    size: PDF_PAGE_NUMBER_FONT_SIZE,
  };

  if (rotation === 90) {
    // Viewed top-right corner is at page-space (x: 0, y: height); viewed
    // "rightward" runs along +y, so the text is rotated +90 (counterclockwise).
    page.drawText(text, {
      ...baseOptions,
      rotate: degrees(90),
      x: topOffset,
      y: height - PDF_PAGE_NUMBER_MARGIN - textWidth,
    });
    return;
  }

  if (rotation === 180) {
    page.drawText(text, {
      ...baseOptions,
      rotate: degrees(180),
      x: PDF_PAGE_NUMBER_MARGIN + textWidth,
      y: topOffset,
    });
    return;
  }

  if (rotation === 270) {
    // Viewed top-right corner is at page-space (x: width, y: 0); viewed
    // "rightward" runs along -y, so the text is rotated -90 (clockwise).
    page.drawText(text, {
      ...baseOptions,
      rotate: degrees(-90),
      x: width - topOffset,
      y: PDF_PAGE_NUMBER_MARGIN + textWidth,
    });
    return;
  }

  page.drawText(text, {
    ...baseOptions,
    x: width - PDF_PAGE_NUMBER_MARGIN - textWidth,
    y: height - topOffset,
  });
}

async function drawTrueCopyStampOnEachPage(pdf: PDFDocument, stampBuffer: ArrayBuffer) {
  await drawTrueCopyStampOnPages(
    pdf,
    stampBuffer,
    Array.from({ length: pdf.getPageCount() }, (_, pageIndex) => pageIndex)
  );
}

async function drawTrueCopyStampOnPages(pdf: PDFDocument, stampBuffer: ArrayBuffer, pageIndices: number[]) {
  if (!pageIndices.length) {
    return;
  }

  const stamp = await pdf.embedPng(stampBuffer.slice(0));
  const margin = 26;

  pageIndices.forEach((pageIndex) => {
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      return;
    }

    const page = pdf.getPage(pageIndex);
    const { height, width } = page.getSize();
    const rotation = normalizePageRotation(page.getRotation().angle);
    const sideways = rotation === 90 || rotation === 270;

    // Size and position against the page AS DISPLAYED (respecting /Rotate),
    // so the stamp always sits upright in the viewed bottom-left corner.
    const viewedWidth = sideways ? height : width;
    const viewedHeight = sideways ? width : height;
    const maxWidth = Math.min(210, viewedWidth * 0.34);
    const maxHeight = Math.min(95, viewedHeight * 0.14);
    const scale = Math.min(maxWidth / stamp.width, maxHeight / stamp.height, 1);
    const scaledWidth = stamp.width * scale;
    const scaledHeight = stamp.height * scale;

    if (rotation === 90) {
      page.drawImage(stamp, {
        height: scaledHeight,
        rotate: degrees(90),
        width: scaledWidth,
        x: width - margin,
        y: margin
      });
    } else if (rotation === 180) {
      page.drawImage(stamp, {
        height: scaledHeight,
        rotate: degrees(180),
        width: scaledWidth,
        x: width - margin,
        y: height - margin
      });
    } else if (rotation === 270) {
      page.drawImage(stamp, {
        height: scaledHeight,
        rotate: degrees(-90),
        width: scaledWidth,
        x: margin,
        y: height - margin
      });
    } else {
      page.drawImage(stamp, {
        height: scaledHeight,
        width: scaledWidth,
        x: margin,
        y: margin
      });
    }
  });
}

async function drawAnnexureStartLabels(pdf: PDFDocument, labels: AnnexureStartLabel[]) {
  if (!labels.length) {
    return;
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);

  labels.forEach((label) => {
    const page = pdf.getPage(label.pageIndex);

    // One line below the page number, rotation-aware like the numbers.
    drawPageNumberText(page, label.text, font, 1);
  });
}

function normalizePageRotation(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function addPdfBookmarks(pdf: PDFDocument, bookmarks: BookmarkNode[]) {
  if (!bookmarks.length) {
    return;
  }

  const rootRef = pdf.context.nextRef();
  const rootLevel = createBookmarkLevel(pdf, bookmarks, rootRef);

  pdf.context.assign(
    rootRef,
    pdf.context.obj({
      Count: rootLevel.count,
      First: rootLevel.firstRef,
      Last: rootLevel.lastRef,
      Type: PDFName.of("Outlines")
    })
  );
  pdf.catalog.set(PDFName.of("Outlines"), rootRef);
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

function createBookmarkLevel(pdf: PDFDocument, nodes: BookmarkNode[], parentRef: PDFRef): BookmarkLevel {
  const refs = nodes.map(() => pdf.context.nextRef());
  const childLevels: Array<BookmarkLevel | null> = nodes.map((node, index) =>
    node.children?.length ? createBookmarkLevel(pdf, node.children, refs[index]) : null
  );

  nodes.forEach((node, index) => {
    const page = pdf.getPage(Math.max(0, Math.min(node.pageIndex, pdf.getPageCount() - 1)));
    const childLevel = childLevels[index];
    const outlineItem = pdf.context.obj({
      Dest: pdf.context.obj([page.ref, PDFName.of("Fit")]),
      Parent: parentRef,
      Title: PDFHexString.fromText(node.title)
    });

    if (index > 0) {
      outlineItem.set(PDFName.of("Prev"), refs[index - 1]);
    }

    if (index < refs.length - 1) {
      outlineItem.set(PDFName.of("Next"), refs[index + 1]);
    }

    if (childLevel) {
      outlineItem.set(PDFName.of("First"), childLevel.firstRef);
      outlineItem.set(PDFName.of("Last"), childLevel.lastRef);
      outlineItem.set(PDFName.of("Count"), pdf.context.obj(node.title === "Annexure" ? -childLevel.count : childLevel.count));
    }

    pdf.context.assign(refs[index], outlineItem);
  });

  return {
    count: nodes.length + childLevels.reduce((sum: number, childLevel, index) => {
      if (!childLevel || nodes[index].title === "Annexure") {
        return sum;
      }

      return sum + childLevel.count;
    }, 0),
    firstRef: refs[0],
    lastRef: refs[refs.length - 1]
  };
}

type IndexPageNumberState = {
  nextPageNumber: number;
  processedPages: number;
  startPage: number;
};

function createIndexPageNumberState(settings: PageNumberSettings | null): IndexPageNumberState {
  return {
    nextPageNumber: settings?.startNumber ?? 1,
    processedPages: 0,
    startPage: settings?.startPage ?? 1,
  };
}

function getStartingPageText(pages: number | null, state: IndexPageNumberState) {
  if (pages === null) {
    return "Unreadable";
  }

  const rowStartPage = state.processedPages + 1;
  const rowEndPage = state.processedPages + pages;
  const firstNumberedPage = Math.max(rowStartPage, state.startPage);
  const numberedPages = Math.max(0, rowEndPage - firstNumberedPage + 1);
  const startText = numberedPages > 0 ? String(state.nextPageNumber) : "";

  state.nextPageNumber += numberedPages;
  state.processedPages += pages;

  return startText;
}

function createIndexCell(
  text: string,
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    width: number;
  }
) {
  return new TableCell({
    borders: {
      bottom: { color: "1F2937", size: 6, style: BorderStyle.SINGLE },
      left: { color: "1F2937", size: 6, style: BorderStyle.SINGLE },
      right: { color: "1F2937", size: 6, style: BorderStyle.SINGLE },
      top: { color: "1F2937", size: 6, style: BorderStyle.SINGLE }
    },
    children: [
      new Paragraph({
        alignment: options.alignment,
        children: [new TextRun({ bold: options.bold, size: 20, text })],
        spacing: { after: 0, before: 0 }
      })
    ],
    margins: { bottom: 120, left: 120, right: 120, top: 120 },
    width: { size: options.width, type: WidthType.DXA }
  });
}

function isAllocationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof RangeError || /allocation failed|array ?buffer|out of memory|invalid array length|maximum call stack/i.test(message);
}

function parsePageRanges(input: string, pageCount: number, filename: string): PageRange[] {
  const pageRanges: PageRange[] = [];
  const rangeParts = input.split(",").map((part) => part.trim()).filter(Boolean);

  if (!rangeParts.length) {
    throw new Error("Enter at least one page number or range.");
  }

  for (const part of rangeParts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

    if (!match) {
      throw new Error("Use valid page ranges, for example 1-5,6-10.");
    }

    const startPage = Number(match[1]);
    const endPage = Number(match[2] ?? match[1]);

    if (startPage < 1 || endPage < startPage || endPage > pageCount) {
      throw new Error(`${filename}: page range must be between 1 and ${pageCount}.`);
    }

    const pageIndices: number[] = [];

    for (let page = startPage; page <= endPage; page += 1) {
      pageIndices.push(page - 1);
    }

    pageRanges.push({
      label: formatPageRangeLabel(startPage, endPage),
      pageIndices
    });
  }

  return pageRanges;
}

function formatPageRangeLabel(startPage: number, endPage: number) {
  const startLabel = String(startPage).padStart(3, "0");
  const endLabel = String(endPage).padStart(3, "0");

  return startPage === endPage ? startLabel : `${startLabel}-${endLabel}`;
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
