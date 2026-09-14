/**
 * Browser-side PDF preparation for DSC signing.
 *
 * WorkLine signs PDFs in two halves:
 *   1. (here, in the browser) draw the visible signature boxes, add the
 *      signature field with a /ByteRange + /Contents placeholder, and write
 *      the final byte range values into the saved bytes.
 *   2. (local WorkLine DSC helper on Windows) hash the byte range, create a
 *      detached CMS/PKCS#7 signature with the DSC token via the Windows
 *      certificate store (the token shows its PIN prompt), and embed the
 *      signature into the /Contents placeholder.
 *
 * The result is a standard `adbe.pkcs7.detached` signature that Adobe
 * Reader and government portals recognise.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";

export type DscSignaturePlacement = "all_pages" | "first_page" | "last_page";

export type DscSignatureOptions = {
  location?: string;
  placement: DscSignaturePlacement;
  reason: string;
  signedAt: Date;
  signerName: string;
};

/** Space reserved inside the PDF for the CMS signature (bytes of DER). */
export const DSC_SIGNATURE_PLACEHOLDER_BYTES = 16384;

const BYTE_RANGE_PLACEHOLDER_NUMBER = 9999999999;

const SIGNATURE_BOX = {
  height: 54,
  margin: 16,
  padding: 6,
  width: 200
};

class PdfSigningError extends Error {}

function formatSignatureTimestamp(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function targetPageIndexes(placement: DscSignaturePlacement, pageCount: number) {
  if (placement === "all_pages") {
    return Array.from({ length: pageCount }, (_, index) => index);
  }
  if (placement === "last_page") {
    return [pageCount - 1];
  }
  return [0];
}

/**
 * Prepare a PDF for DSC signing: draw the visible signature boxes, register
 * the signature field with placeholders, and write real /ByteRange values.
 * Returns bytes ready to send to the local DSC helper's /sign endpoint.
 */
export async function preparePdfForDscSigning(input: ArrayBuffer, options: DscSignatureOptions): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(input);
  } catch {
    throw new PdfSigningError("Could not open this PDF. Password-protected or corrupted PDFs cannot be DSC signed.");
  }

  const pages = pdfDoc.getPages();
  if (!pages.length) {
    throw new PdfSigningError("This PDF has no pages to sign.");
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const indexes = targetPageIndexes(options.placement, pages.length);
  const timestamp = formatSignatureTimestamp(options.signedAt);

  const fitText = (value: string, size: number, bold: boolean, maxWidth: number) => {
    const face = bold ? boldFont : font;
    if (face.widthOfTextAtSize(value, size) <= maxWidth) {
      return value;
    }
    let text = value;
    while (text.length > 1 && face.widthOfTextAtSize(`${text}...`, size) > maxWidth) {
      text = text.slice(0, -1);
    }
    return `${text}...`;
  };

  // 1. Draw the visible signature box on every target page. The drawing is
  //    ordinary page content, so it is covered by the digital signature.
  const boxRects = indexes.map((pageIndex) => {
    const page = pages[pageIndex];
    const { width } = page.getSize();
    const x = width - SIGNATURE_BOX.width - SIGNATURE_BOX.margin;
    const y = SIGNATURE_BOX.margin;
    const innerWidth = SIGNATURE_BOX.width - SIGNATURE_BOX.padding * 2;

    page.drawRectangle({
      borderColor: rgb(0.12, 0.2, 0.45),
      borderWidth: 1,
      color: rgb(1, 1, 1),
      height: SIGNATURE_BOX.height,
      opacity: 0.85,
      width: SIGNATURE_BOX.width,
      x,
      y
    });
    page.drawText("Digitally signed by", {
      font,
      size: 7,
      x: x + SIGNATURE_BOX.padding,
      y: y + SIGNATURE_BOX.height - 13,
      color: rgb(0.25, 0.3, 0.4)
    });
    page.drawText(fitText(options.signerName, 10, true, innerWidth), {
      font: boldFont,
      size: 10,
      x: x + SIGNATURE_BOX.padding,
      y: y + SIGNATURE_BOX.height - 25,
      color: rgb(0.05, 0.1, 0.25)
    });
    page.drawText(fitText(`Date: ${timestamp} IST`, 7.5, false, innerWidth), {
      font,
      size: 7.5,
      x: x + SIGNATURE_BOX.padding,
      y: y + SIGNATURE_BOX.height - 36,
      color: rgb(0.25, 0.3, 0.4)
    });
    page.drawText(fitText(`Reason: ${options.reason}`, 7.5, false, innerWidth), {
      font,
      size: 7.5,
      x: x + SIGNATURE_BOX.padding,
      y: y + SIGNATURE_BOX.height - 46,
      color: rgb(0.25, 0.3, 0.4)
    });

    return { pageIndex, rect: [x, y, x + SIGNATURE_BOX.width, y + SIGNATURE_BOX.height] as const };
  });

  // 2. Signature dictionary with byte range + contents placeholders.
  const signatureDict = pdfDoc.context.obj({
    ByteRange: [0, BYTE_RANGE_PLACEHOLDER_NUMBER, BYTE_RANGE_PLACEHOLDER_NUMBER, BYTE_RANGE_PLACEHOLDER_NUMBER],
    Contents: PDFHexString.of("0".repeat(DSC_SIGNATURE_PLACEHOLDER_BYTES * 2)),
    Filter: "Adobe.PPKLite",
    M: PDFString.fromDate(options.signedAt),
    Name: PDFString.of(options.signerName),
    Reason: PDFString.of(options.reason),
    SubFilter: "adbe.pkcs7.detached",
    Type: "Sig",
    ...(options.location ? { Location: PDFString.of(options.location) } : {})
  });
  const signatureDictRef = pdfDoc.context.register(signatureDict);

  // 3. Signature widget over the box on the primary placement page.
  const primary = boxRects[0];
  const primaryPage = pages[primary.pageIndex];
  const widgetDict = pdfDoc.context.obj({
    F: 132,
    FT: "Sig",
    P: primaryPage.ref,
    Rect: [...primary.rect],
    Subtype: "Widget",
    T: PDFString.of("WorkLine DSC Signature"),
    Type: "Annot",
    V: signatureDictRef
  });
  const widgetRef = pdfDoc.context.register(widgetDict);

  const existingAnnots = primaryPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (existingAnnots) {
    existingAnnots.push(widgetRef);
  } else {
    primaryPage.node.set(PDFName.of("Annots"), pdfDoc.context.obj([widgetRef]));
  }

  // 4. AcroForm registration.
  const acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (acroForm) {
    acroForm.set(PDFName.of("SigFlags"), pdfDoc.context.obj(3));
    const fields = acroForm.lookupMaybe(PDFName.of("Fields"), PDFArray);
    if (fields) {
      fields.push(widgetRef);
    } else {
      acroForm.set(PDFName.of("Fields"), pdfDoc.context.obj([widgetRef]));
    }
  } else {
    pdfDoc.catalog.set(PDFName.of("AcroForm"), pdfDoc.context.obj({ Fields: [widgetRef], SigFlags: 3 }));
  }

  // 5. Save without object streams so the placeholders sit in plain view,
  //    then replace the byte range placeholder with real offsets.
  const saved = await pdfDoc.save({ useObjectStreams: false });
  return writeSignatureByteRange(saved);
}

function asciiIndexOf(haystack: Uint8Array, needle: string, fromIndex = 0) {
  const first = needle.charCodeAt(0);
  const limit = haystack.length - needle.length;

  outer: for (let index = Math.max(0, fromIndex); index <= limit; index += 1) {
    if (haystack[index] !== first) {
      continue;
    }
    for (let offset = 1; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle.charCodeAt(offset)) {
        continue outer;
      }
    }
    return index;
  }
  return -1;
}

function asciiLastIndexOf(haystack: Uint8Array, needle: string) {
  let found = -1;
  for (let index = asciiIndexOf(haystack, needle); index >= 0; index = asciiIndexOf(haystack, needle, index + 1)) {
    found = index;
  }
  return found;
}

function writeSignatureByteRange(bytes: Uint8Array): Uint8Array {
  // Always target the LAST occurrence: the placeholder just added is the
  // newest object in the file, so any pre-existing signature is untouched.
  const contentsNeedle = `/Contents <${"0".repeat(64)}`;
  const contentsKeyIndex = asciiLastIndexOf(bytes, contentsNeedle);
  if (contentsKeyIndex < 0) {
    throw new PdfSigningError("Could not locate the signature placeholder in the prepared PDF.");
  }

  const contentsStart = contentsKeyIndex + "/Contents ".length;
  const contentsEnd = contentsStart + DSC_SIGNATURE_PLACEHOLDER_BYTES * 2 + 2; // include < and >
  if (bytes[contentsStart] !== 0x3c || bytes[contentsEnd - 1] !== 0x3e) {
    throw new PdfSigningError("The signature placeholder in the prepared PDF is malformed.");
  }

  const byteRangeNeedle = `/ByteRange [ 0 ${BYTE_RANGE_PLACEHOLDER_NUMBER} ${BYTE_RANGE_PLACEHOLDER_NUMBER} ${BYTE_RANGE_PLACEHOLDER_NUMBER} ]`;
  const byteRangeIndex = asciiLastIndexOf(bytes, byteRangeNeedle);
  if (byteRangeIndex < 0) {
    throw new PdfSigningError("Could not locate the signature byte range in the prepared PDF.");
  }

  const actual = `/ByteRange [ 0 ${contentsStart} ${contentsEnd} ${bytes.length - contentsEnd} ]`;
  if (actual.length > byteRangeNeedle.length) {
    throw new PdfSigningError("The signature byte range does not fit the reserved space.");
  }

  const padded = actual.padEnd(byteRangeNeedle.length, " ");
  const result = new Uint8Array(bytes);
  for (let offset = 0; offset < padded.length; offset += 1) {
    result[byteRangeIndex + offset] = padded.charCodeAt(offset);
  }
  return result;
}
