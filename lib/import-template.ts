// Builds the Excel import templates with WorkLine branding: a navy-and-white
// header row, a highlighted Import Action column with an Add/Update/Delete
// dropdown, and conditional formatting on the mandatory columns — red while a
// started row leaves them empty, green once they are filled.

export type ImportTemplateOptions = {
  actionOptions: string[];
  fileName: string;
  /** All template headers, with the Import Action column first. */
  headers: string[];
  /** Headers whose columns are hidden (e.g. internal ids kept for Update/Delete). */
  hiddenHeaders?: string[];
  /** Headers (besides the action column) that must be filled on every row. */
  mandatoryHeaders: string[];
  /** When set, the sheet is protected: data cells stay editable, but headers and hidden columns are locked behind this password. */
  protectionPassword?: string;
  sheetName: string;
};

const headerNavy = "FF1B2A5B"; // tailwind navy-700 — the WorkLine blue
const headerWhite = "FFFFFFFF";
const actionColumnFill = "FFEEF1F8"; // navy-50
const emptyFill = "FFFFC7CE";
const emptyFont = "FF9C0006";
const filledFill = "FFC6EFCE";
const filledFont = "FF006100";
const templateRows = 500;

function columnLetter(index: number) {
  let result = "";
  let value = index;
  while (value >= 0) {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  }
  return result;
}

export async function downloadImportTemplate(options: ImportTemplateOptions) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(options.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  const lastDataRow = templateRows + 1;

  worksheet.columns = options.headers.map((header) => ({
    header,
    key: header,
    width: Math.max(18, Math.min(32, header.length + 10))
  }));

  // Hidden columns (internal ids) stay locked; every other data column is
  // unlocked so sheet protection never blocks data entry. This runs before
  // the header styling so the header row's own lock wins afterwards.
  const hiddenHeaders = new Set(options.hiddenHeaders ?? []);
  options.headers.forEach((header, index) => {
    const column = worksheet.getColumn(index + 1);
    if (hiddenHeaders.has(header)) {
      column.hidden = true;
    } else {
      column.protection = { locked: false };
    }
  });

  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = { pattern: "solid", type: "pattern", fgColor: { argb: headerNavy } };
    cell.font = { bold: true, color: { argb: headerWhite }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.protection = { locked: true };
  });

  // The Import Action column leads every row: highlighted, bold, with the
  // action dropdown on every data cell, and it turns green once an action is
  // chosen.
  worksheet.getCell("A2").value = options.actionOptions[0] ?? "Add";
  for (let rowNumber = 2; rowNumber <= lastDataRow; rowNumber += 1) {
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.fill = { pattern: "solid", type: "pattern", fgColor: { argb: actionColumnFill } };
    cell.font = { bold: true };
    cell.protection = { locked: false };
    cell.dataValidation = {
      allowBlank: false,
      formulae: [`"${options.actionOptions.join(",")}"`],
      prompt: `Choose ${options.actionOptions.join(", ")}`,
      promptTitle: "Import Action",
      showInputMessage: true,
      type: "list"
    };
  }
  worksheet.addConditionalFormatting({
    ref: `A2:A${lastDataRow}`,
    rules: [
      {
        formulae: ['NOT(ISBLANK(A2))'],
        priority: 1,
        style: { fill: { bgColor: { argb: filledFill }, pattern: "solid", type: "pattern" }, font: { color: { argb: filledFont } } },
        type: "expression"
      }
    ]
  });

  // Mandatory columns: once a row has an Import Action, an empty mandatory
  // cell shows red; any filled cell shows green.
  for (const header of options.mandatoryHeaders) {
    const index = options.headers.indexOf(header);
    if (index <= 0) {
      continue;
    }
    const letter = columnLetter(index);
    worksheet.addConditionalFormatting({
      ref: `${letter}2:${letter}${lastDataRow}`,
      rules: [
        {
          formulae: [`AND($A2<>"",ISBLANK(${letter}2))`],
          priority: 1,
          style: { fill: { bgColor: { argb: emptyFill }, pattern: "solid", type: "pattern" }, font: { color: { argb: emptyFont } } },
          type: "expression"
        },
        {
          formulae: [`NOT(ISBLANK(${letter}2))`],
          priority: 2,
          style: { fill: { bgColor: { argb: filledFill }, pattern: "solid", type: "pattern" }, font: { color: { argb: filledFont } } },
          type: "expression"
        }
      ]
    });
  }

  if (options.protectionPassword) {
    await worksheet.protect(options.protectionPassword, {
      autoFilter: true,
      formatCells: true,
      formatRows: true,
      selectLockedCells: true,
      selectUnlockedCells: true,
      sort: true
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as unknown as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = options.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
