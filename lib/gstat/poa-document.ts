import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

type RowData = Record<string, string | number>;

const representativeRows = [
  ["1.", "CA Yash Dhadda", "Chartered Accountant", "M. No. 412490"],
  ["2.", "CA Princy Dhadda", "Chartered Accountant", "M. No. ____________"],
  ["3.", "CA Mudit Jain", "Chartered Accountant", "M. No. ____________"],
  ["4.", "CA Shuchi Sethi", "Chartered Accountant", "M. No. ____________"],
  ["5.", "CA Shefali Bang", "Chartered Accountant", "M. No. ____________"],
  ["6.", "CA Dheera Khatri", "Chartered Accountant", "M. No. ____________"],
  ["7.", "Adv. Shradha Sareen", "Advocate", "Enrl. No. ____________"]
];

export async function downloadGstatPoa(rowData: RowData) {
  const context = createPoaContext(rowData);
  const doc = new Document({
    creator: "WorkLine Co",
    description: "GSTAT POA-cum-Vakalatnama generated from the WorkLine GSTAT register.",
    sections: [
      {
        properties: {
          page: {
            margin: {
              bottom: 720,
              left: 720,
              right: 720,
              top: 720
            }
          }
        },
        children: [
          heading("PART A", 24),
          heading("POWER OF ATTORNEY-CUM-LETTER OF AUTHORISATION", 22),
          centered("BEFORE THE GOODS AND SERVICES TAX APPELLATE TRIBUNAL,", true),
          centered(`${context.benchLine}`, false),
          smallCentered("(Principal Bench, New Delhi / State Bench at ____________ - strike out whichever is not applicable)"),
          spacer(),
          centered(`Appeal / Application ${context.appealNumber}`, true),
          centered(`(Arising out of Order-in-Appeal No. ${context.oiaNo} dated ${context.oiaDate} passed by ${context.orderAuthority})`, false),
          spacer(),
          caption(`${context.appellant}...Appellant`),
          caption("(Name, GSTIN, principal place of business)"),
          centered("Versus", true),
          caption(`${context.respondent}...Respondent`),
          caption("(Designation and address of the Revenue authority)"),
          spacer(),
          para(
            `KNOW ALL PERSONS by these presents that I / We, the above-named Appellant, acting through ${context.signatoryName}, ${context.signatoryDesignation}, duly authorised in this behalf [in the case of a company, firm, LLP, HUF, trust, society or body corporate, by virtue of the Board Resolution / authorisation dated __________, a certified copy whereof is annexed], DO HEREBY NOMINATE, CONSTITUTE AND APPOINT the following persons, each of whom is qualified to act as an Authorised Representative under Section 116 of the Central Goods and Services Tax Act, 2017, jointly and severally, to be my / our Authorised Representative(s) in the above-noted appeal / proceeding.`
          ),
          representativesTable(),
          para(
            "AND I / We hereby authorise the Authorised Representative(s), jointly and severally, in the above-noted matter and in all proceedings arising therefrom or connected therewith, to do the following acts, deeds and things, namely:"
          ),
          numbered("To act, appear, plead and represent before the Hon'ble Goods and Services Tax Appellate Tribunal and before the Registrar, in the above-noted appeal / proceeding and at every stage thereof, subject to payment of fees separately agreed."),
          numbered("To sign, verify, present and file appeals, cross-objections, applications, replies, rejoinders, written submissions, objections, affidavits, paper-books, additional evidence and all other pleadings and documents, and to receive certified copies and documents."),
          numbered("To file the Memorandum of Appearance in Form GSTAT-04 and to undertake all acts required for electronic filing, authentication and service on the GSTAT e-filing portal, and to receive notices, orders and communications on my / our behalf."),
          numbered("To make, give up, withdraw, compromise or refer to settlement the said matter, and to apply for rectification, review, restoration, recall, condonation of delay, early hearing, adjournment, stay and modification of orders, with my / our prior written instructions."),
          numbered("To make, sign and verify the intimation of pre-deposit, to seek refund of any pre-deposit or sum deposited in excess pursuant to the orders of the Tribunal, and to receive back original documents and records filed in the proceeding."),
          numbered("Generally, to do all such lawful acts, deeds and things as may be necessary, incidental or expedient for the due and effectual prosecution or defence of the said matter."),
          para("AND I / We do hereby agree to ratify and confirm all lawful acts done by the Authorised Representative(s), or by any representative substituted in accordance with Rule 73, in or about the said matter, as my / our own acts to all intents and purposes."),
          para("AND I / We undertake to remain available, and to render such instructions, documents and authorisations as may be required for the conduct of the said matter, and to appear in person whenever the Hon'ble Tribunal so directs."),
          para(`IN WITNESS WHEREOF I / We have, having read and understood the contents hereof, set my / our hand to these presents at ${context.place} on this ______ day of ____________, 20____.`),
          signatureTable(),
          para("WITNESS:", true),
          para("1. Name & Signature: _______________________   Address: _______________________________"),
          para("2. Name & Signature: _______________________   Address: _______________________________"),
          spacer(),
          heading("PART B", 24),
          heading("MEMORANDUM OF APPEARANCE", 22),
          smallCentered("[Form GSTAT-04 - Rule 72 of the GST Appellate Tribunal (Procedure) Rules, 2025]"),
          para("To,\nThe Registrar,\nGoods and Services Tax Appellate Tribunal,\n______________________ Bench at ______________________."),
          para("Sir / Madam,"),
          para("Please take notice that I am authorised to appear, plead and act on behalf of the party named below in the matter detailed hereunder, and I hereby enter appearance accordingly. The instrument of my authority is enclosed as Part A."),
          matterDetailsTable(context),
          para("I declare that I am duly qualified to act as an Authorised Representative within the meaning of Section 116 of the Central Goods and Services Tax Act, 2017, that I am not disqualified under sub-section (3) thereof, and that I am duly authorised to enter appearance and to act for every purpose connected with the above proceeding."),
          para(`Place: ${context.place}`),
          para("Date: ______________"),
          para("___________________________\nSignature of the Authorised Representative\nName: ______________________\nCapacity & Enrl./M. No.: ______________\nE-mail / Mobile: ______________________"),
          para("Enclosures: (i) Stamped Vakalatnama / Letter of Authorisation (Part A); (ii) certified Board Resolution / authorisation (for entities)")
        ]
      }
    ],
    title: `GSTAT POA - ${context.appellant}`
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `GSTAT-POA-${slugify(context.appellant)}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

function createPoaContext(rowData: RowData) {
  const appellant = value(rowData, "Appellant") || value(rowData, "Entity Name") || "____________________";
  const stateName = value(rowData, "State Name") || "____________________";
  const orderAuthority = value(rowData, "State/Centre") || "____________________";
  const oiaNo = value(rowData, "OIA No") || "______________";
  const oiaDate = formatDate(value(rowData, "OIA Date")) || "__________";
  const appealNo = value(rowData, "APL 04 No") || "______________";

  return {
    appealNumber: `${appealNo} of 2026`,
    appellant,
    benchLine: `${stateName} STATE BENCH AT ______________________`,
    oiaDate,
    oiaNo,
    orderAuthority,
    place: stateName,
    respondent: orderAuthority || "____________________",
    signatoryDesignation: "____________________",
    signatoryName: "____________________"
  };
}

function value(rowData: RowData, key: string) {
  return String(rowData[key] ?? "").trim();
}

function formatDate(rawValue: string) {
  if (!rawValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split("-");
    return `${day}-${month}-${year}`;
  }

  return rawValue;
}

function heading(text: string, size: number) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ bold: true, size, text })],
    spacing: { after: 120 }
  });
}

function centered(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ bold, size: 20, text })],
    spacing: { after: 80 }
  });
}

function smallCentered(text: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ italics: true, size: 18, text })],
    spacing: { after: 120 }
  });
}

function caption(text: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ size: 20, text })],
    spacing: { after: 80 }
  });
}

function para(text: string, bold = false) {
  return new Paragraph({
    children: text.split("\n").flatMap((line, index) => [
      ...(index ? [new TextRun({ break: 1, text: "" })] : []),
      new TextRun({ bold, size: 20, text: line })
    ]),
    spacing: { after: 140 },
    alignment: AlignmentType.JUSTIFIED
  });
}

function numbered(text: string) {
  return new Paragraph({
    children: [new TextRun({ size: 20, text })],
    indent: { left: 360, hanging: 180 },
    spacing: { after: 100 },
    text
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 100 } });
}

function representativesTable() {
  return table([
    ["Sl.", "Name of Authorised Representative", "Capacity (Section 116)", "Enrolment / Membership No."],
    ...representativeRows
  ]);
}

function signatureTable() {
  return table([
    [
      "___________________________\nSignature of the Appellant / Authorised Signatory\nName: ______________________\nDesignation: _________________\n(Affix seal of the entity)",
      "___________________________\nAccepted\n(subject to terms as mentioned above)\nAuthorised Representative\nName: ______________________\nM. No. / Enrl. No.: ___________"
    ]
  ]);
}

function matterDetailsTable(context: ReturnType<typeof createPoaContext>) {
  return table([
    ["1. Appeal / Application No.", context.appealNumber],
    ["2. Cause title", `${context.appellant} (Appellant) v. ${context.respondent} (Respondent)`],
    ["3. Name of the party for whom appearance is entered", `${context.appellant} (Appellant)`],
    ["4. Name of the Authorised Representative", "____________________"],
    ["5. Capacity in which appearing (Sec. 116 CGST Act)", "Advocate / Chartered Accountant / Cost Accountant / Company Secretary / GST Practitioner / authorised person"],
    ["6. Enrolment / Membership / CoP / GSTP No.", "____________________"],
    ["7. Address, e-mail and mobile of the Representative", "____________________"],
    ["8. Instrument of authority enclosed", "Stamped Vakalatnama / Letter of Authorisation dated ___________ (Part A)"]
  ]);
}

function table(rows: string[][]) {
  return new Table({
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                borders: cellBorders(),
                children: cell.split("\n").map(
                  (line, lineIndex) =>
                    new Paragraph({
                      children: [new TextRun({ bold: rowIndex === 0, size: 18, text: line })],
                      spacing: { after: lineIndex === cell.split("\n").length - 1 ? 0 : 40 }
                    })
                ),
                margins: {
                  bottom: 80,
                  left: 80,
                  right: 80,
                  top: 80
                }
              })
          )
        })
    ),
    width: { size: 100, type: WidthType.PERCENTAGE }
  });
}

function cellBorders() {
  return {
    bottom: { color: "CBD5E1", size: 1, style: BorderStyle.SINGLE },
    left: { color: "CBD5E1", size: 1, style: BorderStyle.SINGLE },
    right: { color: "CBD5E1", size: 1, style: BorderStyle.SINGLE },
    top: { color: "CBD5E1", size: 1, style: BorderStyle.SINGLE }
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "matter";
}
