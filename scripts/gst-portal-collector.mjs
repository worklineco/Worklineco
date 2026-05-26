import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import XLSX from "xlsx";

const GST_PORTAL_LOGIN_URL = "https://services.gst.gov.in/services/login";
const DEFAULT_WORKBOOK_PATH = path.join(os.homedir(), "Downloads", "WorkLineCo.xlsx");
const OUTPUT_DIR = path.join(process.cwd(), "collector-output");
const ENV_FILES = [".env.local", ".env"];

const FIELD_NAMES = [
  "sNo",
  "typeOfNotice",
  "description",
  "refId",
  "dateOfIssue",
  "caseId",
  "status",
  "taxPeriod",
  "dueDate",
  "section",
  "replyFiling",
];

const HEADER_ALIASES = new Map([
  ["sno", "sNo"],
  ["s no", "sNo"],
  ["serial no", "sNo"],
  ["sr no", "sNo"],
  ["sl no", "sNo"],
  ["slno", "sNo"],
  ["type of notice", "typeOfNotice"],
  ["notice type", "typeOfNotice"],
  ["notice/order", "typeOfNotice"],
  ["notice order", "typeOfNotice"],
  ["notice/order type", "typeOfNotice"],
  ["notice order type", "typeOfNotice"],
  ["type", "typeOfNotice"],
  ["description", "description"],
  ["details", "description"],
  ["proceeding description", "description"],
  ["ref id", "refId"],
  ["reference id", "refId"],
  ["reference no", "refId"],
  ["reference number", "refId"],
  ["ref no", "refId"],
  ["arn", "refId"],
  ["date of issue", "dateOfIssue"],
  ["issue date", "dateOfIssue"],
  ["date of issuance", "dateOfIssue"],
  ["issued on", "dateOfIssue"],
  ["case id", "caseId"],
  ["case no", "caseId"],
  ["case number", "caseId"],
  ["proceeding id", "caseId"],
  ["status", "status"],
  ["case status", "status"],
  ["proceeding status", "status"],
  ["tax period", "taxPeriod"],
  ["period", "taxPeriod"],
  ["return period", "taxPeriod"],
  ["financial year", "taxPeriod"],
  ["due date", "dueDate"],
  ["reply due date", "dueDate"],
  ["due date for reply", "dueDate"],
  ["due date of reply", "dueDate"],
  ["section", "section"],
  ["section/rule", "section"],
  ["section rule", "section"],
  ["act/section", "section"],
  ["act section", "section"],
  ["reply filing", "replyFiling"],
  ["reply status", "replyFiling"],
  ["reply filing status", "replyFiling"],
  ["reply filed", "replyFiling"],
]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.:#]/g, "")
    .trim()
    .toLowerCase();
}

function cleanCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanFlag(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function parseArgs() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    if (item.startsWith("--")) {
      const next = process.argv[index + 1];
      if (!next || next.startsWith("--")) {
        args.set(item.slice(2), true);
      } else {
        args.set(item.slice(2), next);
        index += 1;
      }
    }
  }

  return {
    clientName: args.get("client-name") || "",
    autoNotices: parseBooleanFlag(args.get("auto-notices")),
    dryRun: parseBooleanFlag(args.get("dry-run")),
    expectedGstin: String(args.get("expect-gstin") || "").trim().toUpperCase(),
    importNoticesFile: args.get("import-notices-file") || "",
    loginOnly: parseBooleanFlag(args.get("login-only")),
    outputDir: path.resolve(args.get("out") || OUTPUT_DIR),
    rowNumber: args.has("row") ? Number(args.get("row")) : null,
    saveHtml: parseBooleanFlag(args.get("save-html")),
    sync: parseBooleanFlag(args.get("sync")),
    workbookPath: path.resolve(args.get("file") || DEFAULT_WORKBOOK_PATH),
    worklineEmail: args.get("workline-email") || process.env.WORKLINE_EMAIL || "",
    worklinePassword: args.get("workline-password") || process.env.WORKLINE_PASSWORD || "",
  };
}

async function loadLocalEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(process.cwd(), fileName);
    const content = await fs.readFile(filePath, "utf8").catch(() => "");

    if (!content) {
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readClientFromWorkbook({ expectedGstin, rowNumber, workbookPath }) {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  let resolvedRowNumber = rowNumber;

  if (!resolvedRowNumber && expectedGstin) {
    const matchingIndex = rows.findIndex((row, index) => {
      if (index === 0) {
        return false;
      }

      return String(row?.[0] ?? "").trim().toUpperCase() === expectedGstin;
    });

    if (matchingIndex !== -1) {
      resolvedRowNumber = matchingIndex + 1;
    }
  }

  resolvedRowNumber ||= 2;

  if (!Number.isInteger(resolvedRowNumber) || resolvedRowNumber < 2) {
    throw new Error("Use --row with a valid Excel data row number, for example --row 2.");
  }

  const rowIndex = resolvedRowNumber - 1;
  const clientRow = rows[rowIndex] ?? [];
  const [gstin, userId, password] = clientRow.map((value) =>
    String(value ?? "").trim(),
  );

  if (!gstin || !userId || !password) {
    throw new Error(
      `Missing client credentials in ${workbookPath}. Use row ${resolvedRowNumber}: A = GSTIN, B = GST user ID, C = password.`,
    );
  }

  if (expectedGstin && gstin.toUpperCase() !== expectedGstin) {
    const hint = rowNumber
      ? `Excel row ${resolvedRowNumber} contains GSTIN ${gstin}, but selected client is ${expectedGstin}.`
      : `Could not find GSTIN ${expectedGstin} in column A, so row ${resolvedRowNumber} was checked and contains ${gstin}.`;

    throw new Error(`${hint} Put the selected GSTIN in column A or pass the matching --row number.`);
  }

  return { gstin, rowNumber: resolvedRowNumber, userId, password };
}

function parsePortalDate(value) {
  const text = cleanCell(value);
  if (!text || ["-", "na", "n/a"].includes(text.toLowerCase())) {
    return null;
  }

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime()) && /^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    return directDate.toISOString().slice(0, 10);
  }

  const match = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, yearValue] = match;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeExtractedRow(row, index) {
  return {
    serial_no: Number.parseInt(cleanCell(row.sNo), 10) || index + 1,
    notice_type: cleanCell(row.typeOfNotice) || null,
    description: cleanCell(row.description) || null,
    ref_id: cleanCell(row.refId) || null,
    date_of_issue: parsePortalDate(row.dateOfIssue),
    case_id: cleanCell(row.caseId) || null,
    status: cleanCell(row.status) || null,
    tax_period: cleanCell(row.taxPeriod) || null,
    due_date: parsePortalDate(row.dueDate),
    section: cleanCell(row.section) || null,
    reply_filing_status: cleanCell(row.replyFiling) || null,
  };
}

function isPortalDate(value) {
  return Boolean(parsePortalDate(value));
}

function normalizeNoticeTableRow(row, index) {
  const refId = cleanCell(row.refId ?? row["Ref ID"] ?? row["Column 1"]);
  const noticeType = cleanCell(row.typeOfNotice ?? row["Type of Notice"] ?? row["Column 2"]);
  const description = cleanCell(row.description ?? row.Description ?? row["Column 3"]);
  const dateOfIssue = cleanCell(row.dateOfIssue ?? row["Date of Issue"] ?? row["Date of Issuance"] ?? row["Column 4"]);
  const fifthColumn = cleanCell(row.dueDate ?? row["Due Date"] ?? row["Column 5"]);

  return {
    sNo: row.sNo ?? row["S.No."] ?? String(index + 1),
    typeOfNotice: noticeType,
    description,
    refId,
    dateOfIssue,
    caseId: cleanCell(row.caseId ?? row["Case ID"] ?? ""),
    status: isPortalDate(fifthColumn) ? "" : fifthColumn,
    taxPeriod: cleanCell(row.taxPeriod ?? row["Tax Period"] ?? ""),
    dueDate: isPortalDate(fifthColumn) ? fifthColumn : "",
    section: cleanCell(row.section ?? row.Section ?? ""),
    replyFiling: cleanCell(row.replyFiling ?? row["Reply Filing"] ?? ""),
  };
}

async function readNoticeRowsFromOutput(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(content);
  const rows = [];

  for (const table of payload.tables ?? []) {
    for (const row of table.rows ?? []) {
      rows.push(
        normalizeNoticeTableRow(
          {
            ...row,
            sourceSection: table.section,
          },
          rows.length,
        ),
      );
    }
  }

  return {
    extractedAt: payload.extractedAt || new Date().toISOString(),
    gstin: String(payload.gstin || "").trim().toUpperCase(),
    rows,
  };
}

async function launchChrome() {
  const launchOptions = {
    headless: false,
    args: ["--start-maximized"],
  };

  try {
    return await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: "msedge" });
    } catch (error) {
      throw new Error(
        `Could not launch Chrome or Edge through Playwright. Install Chrome/Edge and try again. Original error: ${error.message}`,
      );
    }
  }
}

async function fillFirstVisible(page, selectors, value, label) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      for (let index = 0; index < Math.min(count, 5); index += 1) {
        const input = locator.nth(index);
        const visible = await input.isVisible({ timeout: 500 }).catch(() => false);

        if (visible) {
          await input.fill(value);
          await input.evaluate((element) => {
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("blur", { bubbles: true }));
          }).catch(() => {});
          console.log(`Filled ${label}.`);
          return true;
        }
      }
    }

    await page.waitForTimeout(500);
  }

  console.log(`Could not auto-fill ${label}. Please type it manually in the browser.`);
  return false;
}

async function clickFirstVisible(page, selectors, label) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      for (let index = 0; index < Math.min(count, 5); index += 1) {
        const element = locator.nth(index);
        const visible = await element.isVisible({ timeout: 500 }).catch(() => false);
        const enabled = await element.isEnabled({ timeout: 500 }).catch(() => false);

        if (visible && enabled) {
          await element.click();
          console.log(`Clicked ${label}.`);
          return true;
        }
      }
    }

    await page.waitForTimeout(500);
  }

  console.log(`Could not auto-click ${label}. Please click it manually in the browser.`);
  return false;
}

async function clickGstLoginButton(page, label) {
  return clickFirstVisible(
    page,
    [
      "button[type='submit']:has-text('LOGIN')",
      "button[type='submit']:has-text('Login')",
      "button:has-text('LOGIN')",
      "button:has-text('Login')",
      "input[type='submit'][value='LOGIN']",
      "input[type='submit'][value='Login']",
      "input[type='button'][value='LOGIN']",
      "input[type='button'][value='Login']",
      "a:has-text('LOGIN')",
      "a:has-text('Login')",
    ],
    label,
  );
}

async function waitForCaptchaAndSubmit(page) {
  const selectors = [
    "input#captcha",
    "input[name='captcha']",
    "input[formcontrolname='captcha']",
    "input[ng-model*='captcha' i]",
    "input[placeholder*='characters' i]",
    "input[placeholder*='Captcha' i]",
    "input[aria-label*='Captcha' i]",
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const input = locator.nth(index);
      const visible = await input.isVisible({ timeout: 500 }).catch(() => false);

      if (!visible) {
        continue;
      }

      await input.focus();
      console.log("Focused CAPTCHA field. Type CAPTCHA in the browser; login will submit automatically.");

      while (true) {
        const value = await input.inputValue().catch(() => "");
        if (value.trim().length >= 6) {
          console.log("CAPTCHA entered.");
          return clickGstLoginButton(page, "GST portal login button");
        }

        await page.waitForTimeout(500);
      }
    }
  }

  console.log("Could not find a CAPTCHA field. Please solve CAPTCHA and click Login manually.");
  return false;
}

async function waitForAuthenticatedPortal(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await page.waitForFunction(
    () =>
      location.href.includes("/auth/") ||
      document.body.innerText.includes("Dashboard") ||
      document.body.innerText.includes("Services"),
    null,
    { timeout: 45_000 },
  ).catch(() => {});
}

async function clickPortalLinkByText(page, text, label) {
  const clicked = await page.evaluate((targetText) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = normalize(targetText);
    const link = [...document.querySelectorAll("a,button")]
      .find((element) => normalize(element.innerText || element.textContent) === target);

    if (!link) {
      return false;
    }

    link.scrollIntoView({ block: "center", inline: "center" });
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
    link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    link.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    link.click();
    return true;
  }, text).catch(() => false);

  if (clicked) {
    console.log(`Clicked ${label}.`);
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    return true;
  }

  console.log(`Could not click ${label}.`);
  return false;
}

async function clickPortalLinkByHref(page, hrefPart, text, label) {
  const clicked = await page.evaluate(
    ({ hrefPart: targetHrefPart, text: targetText }) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const target = normalize(targetText);
      const link = [...document.querySelectorAll("a")]
        .find((element) => {
          const href = element.getAttribute("href") || element.getAttribute("data-ng-href") || "";
          const textMatches = !target || normalize(element.innerText || element.textContent) === target;
          return href.includes(targetHrefPart) && textMatches;
        });

      if (!link) {
        return false;
      }

      link.scrollIntoView({ block: "center", inline: "center" });
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
      link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      link.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      link.click();
      return true;
    },
    { hrefPart, text },
  ).catch(() => false);

  if (clicked) {
    console.log(`Clicked ${label}.`);
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    return true;
  }

  console.log(`Could not click ${label}.`);
  return false;
}

async function handlePortalPopups(page) {
  for (const label of ["Remind me later", "No-Remind me later", "No, Remind me later", "Remind Me Later"]) {
    await clickPortalLinkByText(page, label, label).catch(() => false);
  }
}

async function navigateToNoticesAndOrders(page) {
  console.log("Navigating to Services > User Services > View Notices and Orders.");
  await waitForAuthenticatedPortal(page);
  await handlePortalPopups(page);

  console.log("Opening View Notices and Orders directly in the authenticated GST session.");
  await page.goto("https://services.gst.gov.in/services/auth/notices", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  }).catch(() => {});
  await page.waitForTimeout(2_000);

  const directReached = await page.waitForFunction(
    () =>
      location.href.includes("/auth/notices") ||
      document.body.innerText.includes("Additional Notices") ||
      document.body.innerText.includes("Notices and Orders"),
    null,
    { timeout: 15_000 },
  ).then(() => true).catch(() => false);

  if (directReached) {
    console.log("Opened View Notices and Orders.");
    return;
  }

  console.log("Direct navigation did not reach notices page. Trying GST menu clicks.");
  await clickPortalLinkByText(page, "Services", "Services");
  await page.waitForTimeout(3_000);

  const clickedUserServices =
    await clickPortalLinkByText(page, "User Services", "User Services") ||
    await clickPortalLinkByHref(page, "/services/auth/quicklinks/userservices", "User Services", "User Services");

  if (!clickedUserServices) {
    await page.goto("https://services.gst.gov.in/services/auth/quicklinks/userservices", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  await page.waitForTimeout(1_000);

  const clickedNotices =
    await clickPortalLinkByText(page, "View Notices and Orders", "View Notices and Orders") ||
    await clickPortalLinkByHref(page, "/services/auth/notices", "View Notices and Orders", "View Notices and Orders");

  const reached = await page.waitForFunction(
    () =>
      location.href.includes("/auth/notices") ||
      document.body.innerText.includes("Additional Notices") ||
      document.body.innerText.includes("Notices and Orders"),
    null,
    { timeout: 20_000 },
  ).then(() => true).catch(() => false);

  if (!clickedNotices || !reached) {
    console.log("Menu navigation did not reach notices page. Opening View Notices and Orders directly.");
    await page.goto("https://services.gst.gov.in/services/auth/notices", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
}

async function extractAllVisibleTables(page) {
  return page.evaluate(() => {
    function visibleText(node) {
      return String(node?.innerText ?? node?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isVisible(node) {
      return Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    }

    return [...document.querySelectorAll("table")]
      .filter(isVisible)
      .map((table, tableIndex) => {
        const headerRows = [...table.querySelectorAll("thead tr")];
        const fallbackHeaderRow = table.querySelector("tr");
        const headerCells = [
          ...(headerRows.at(-1)?.querySelectorAll("th,td") ?? fallbackHeaderRow?.querySelectorAll("th,td") ?? []),
        ].map(visibleText);
        const bodyRows = [...table.querySelectorAll("tbody tr")];
        const fallbackRows = [...table.querySelectorAll("tr")].slice(headerCells.length ? 1 : 0);
        const dataRows = bodyRows.length ? bodyRows : fallbackRows;
        const rows = dataRows
          .map((row) => {
            const cells = [...row.querySelectorAll("td,th")].map(visibleText);
            if (!cells.some(Boolean)) {
              return null;
            }

            if (!headerCells.length) {
              return cells;
            }

            return Object.fromEntries(headerCells.map((header, index) => [header || `Column ${index + 1}`, cells[index] ?? ""]));
          })
          .filter(Boolean);

        return {
          tableIndex: tableIndex + 1,
          caption: visibleText(table.querySelector("caption")),
          headers: headerCells,
          rows,
        };
      })
      .filter((table) => table.rows.length);
  });
}

async function collectNoticesAndOrders(page) {
  await navigateToNoticesAndOrders(page);

  const possibleTabs = ["Additional Notices and Orders", "Notices and Orders"];
  const tables = [];

  for (const tabName of possibleTabs) {
    await clickPortalLinkByText(page, tabName, `${tabName} tab`).catch(() => false);
    await page.waitForTimeout(1_500);

    await clickPortalLinkByText(page, "100", "100 rows per page").catch(() => false);
    await page.waitForTimeout(1_000);

    const extractedTables = await extractAllVisibleTables(page);
    for (const table of extractedTables) {
      tables.push({
        section: tabName,
        ...table,
      });
    }
  }

  if (!tables.length) {
    const extractedTables = await extractAllVisibleTables(page);
    for (const table of extractedTables) {
      tables.push({
        section: "View Notices and Orders",
        ...table,
      });
    }
  }

  return tables;
}

async function extractBestTableFromFrame(frame) {
  return frame.evaluate(
    ({ aliases, fieldNames }) => {
      const aliasMap = new Map(aliases);

      function clean(value) {
        return String(value ?? "")
          .replace(/\s+/g, " ")
          .replace(/[.:#]/g, "")
          .trim()
          .toLowerCase();
      }

      function visibleText(node) {
        return String(node?.innerText ?? node?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function mapHeader(header) {
        const normalized = clean(header);
        return aliasMap.get(normalized) ?? null;
      }

      const candidates = [...document.querySelectorAll("table, [role='table']")]
        .map((table) => {
          const headerNodes = [
            ...table.querySelectorAll("thead th"),
            ...table.querySelectorAll("[role='columnheader']"),
            ...table.querySelectorAll("tr:first-child th"),
            ...table.querySelectorAll("tr:first-child td"),
          ];
          const headerTexts = [...new Set(headerNodes.map(visibleText).filter(Boolean))];
          const mappedHeaders = headerTexts.map(mapHeader);
          const score = mappedHeaders.filter(Boolean).length;

          return {
            table,
            headerTexts,
            mappedHeaders,
            score,
          };
        })
        .filter((candidate) => candidate.score >= 3)
        .sort((left, right) => right.score - left.score);

      const best = candidates[0];
      if (!best) {
        return { headers: [], rows: [] };
      }

      const bodyRows = [...best.table.querySelectorAll("tbody tr, [role='rowgroup'] [role='row']")];
      const allRows = [...best.table.querySelectorAll("tr, [role='row']")];
      const dataRows = bodyRows.length ? bodyRows : allRows.slice(1);

      const rows = dataRows
        .map((row) => {
          const cells = [...row.querySelectorAll("td, th, [role='cell'], [role='gridcell']")].map(visibleText);
          const record = Object.fromEntries(fieldNames.map((name) => [name, ""]));

          best.headerTexts.forEach((header, index) => {
            const field = mapHeader(header);
            if (field) {
              record[field] = cells[index] ?? "";
            }
          });

          return record;
        })
        .filter((row) => Object.values(row).some(Boolean));

      return { headers: best.headerTexts, rows };
    },
    {
      aliases: [...HEADER_ALIASES.entries()],
      fieldNames: FIELD_NAMES,
    },
  );
}

async function extractLitigationRows(page) {
  const frameResults = [];

  for (const frame of page.frames()) {
    try {
      const result = await extractBestTableFromFrame(frame);
      if (result.rows.length) {
        frameResults.push(result);
      }
    } catch {
      // Some portal frames can be inaccessible while navigating. Skip and keep scanning.
    }
  }

  frameResults.sort((left, right) => right.rows.length - left.rows.length);
  return frameResults[0] ?? { headers: [], rows: [] };
}

async function saveDebugHtml(page, outputDir, gstin) {
  const debugDir = path.join(outputDir, "debug");
  await fs.mkdir(debugDir, { recursive: true });

  for (const [index, frame] of page.frames().entries()) {
    const html = await frame.content().catch(() => "");
    if (!html) {
      continue;
    }

    await fs.writeFile(
      path.join(debugDir, `gst-${gstin}-frame-${index + 1}.html`),
      html,
    );
  }
}

async function saveCollectorOutput({ client, extractedAt, outputDir, payload, prefix }) {
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `${prefix}-${client.gstin}-${extractedAt.slice(0, 10)}.json`,
  );

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  return outputPath;
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function promptForWorkLineLogin(rl, options) {
  if (!options.sync || options.dryRun) {
    return options;
  }

  const worklineEmail = options.worklineEmail || (await rl.question("WorkLine email for Supabase sync: "));
  const worklinePassword =
    options.worklinePassword || (await rl.question("WorkLine password for this sync only: "));

  return {
    ...options,
    worklineEmail: worklineEmail.trim(),
    worklinePassword,
  };
}

async function syncRowsToSupabase({ client, extractedAt, options, rows }) {
  if (!rows.length) {
    return { insertedOrUpdated: 0, registrationId: "" };
  }

  const supabase = createSupabaseClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: options.worklineEmail,
    password: options.worklinePassword,
  });

  if (signInError || !signInData.user) {
    throw new Error(`Could not sign in to WorkLine for Supabase sync: ${signInError?.message ?? "No user returned."}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("organisation_id")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile?.organisation_id) {
    throw new Error(`Could not resolve WorkLine organisation: ${profileError?.message ?? "Missing organisation_id."}`);
  }

  const organisationId = profile.organisation_id;
  const { data: existingRegistration, error: registrationError } = await supabase
    .from("gst_registrations")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("gstin", client.gstin)
    .maybeSingle();

  if (registrationError) {
    throw new Error(`Could not find GST registration: ${registrationError.message}`);
  }

  let registrationId = existingRegistration?.id;

  if (!registrationId) {
    const { data: createdRegistration, error: createError } = await supabase
      .from("gst_registrations")
      .insert({
        organisation_id: organisationId,
        client_name: options.clientName || client.gstin,
        gstin: client.gstin,
      })
      .select("id")
      .single();

    if (createError || !createdRegistration?.id) {
      throw new Error(`Could not create GST registration for ${client.gstin}: ${createError?.message ?? "No id returned."}`);
    }

    registrationId = createdRegistration.id;
  }

  const payload = rows.map((row, index) => {
    const normalized = normalizeExtractedRow(row, index);
    const fallbackCaseId = normalized.case_id || normalized.ref_id || `row-${index + 1}`;

    return {
      ...normalized,
      case_id: fallbackCaseId,
      organisation_id: organisationId,
      gst_registration_id: registrationId,
      source: "gst-portal-local-collector",
      raw_payload: row,
      scraped_at: extractedAt,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from("gst_litigation_cases")
    .upsert(payload, {
      onConflict: "organisation_id,gst_registration_id,ref_id,case_id",
    });

  if (upsertError) {
    throw new Error(`Could not sync litigation rows to WorkLine: ${upsertError.message}`);
  }

  return { insertedOrUpdated: payload.length, registrationId };
}

async function main() {
  await loadLocalEnv();
  let options = parseArgs();

  if (options.importNoticesFile) {
    const imported = await readNoticeRowsFromOutput(path.resolve(options.importNoticesFile));
    options = {
      ...options,
      expectedGstin: options.expectedGstin || imported.gstin,
      sync: true,
    };

    if (!options.expectedGstin) {
      throw new Error("The notices file does not include a GSTIN. Pass --expect-gstin with the matching GSTIN.");
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    options = await promptForWorkLineLogin(rl, options);
    const client = {
      gstin: options.expectedGstin,
      rowNumber: options.rowNumber || 2,
      userId: "",
      password: "",
    };

    const result = await syncRowsToSupabase({
      client,
      extractedAt: imported.extractedAt,
      options,
      rows: imported.rows,
    });

    console.log(`Imported ${result.insertedOrUpdated} notice rows into WorkLine registration ${result.registrationId}.`);
    await rl.close();
    return;
  }

  const client = readClientFromWorkbook(options);
  options = { ...options, rowNumber: client.rowNumber };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  options = await promptForWorkLineLogin(rl, options);

  console.log(`Loaded GSTIN ${client.gstin} from ${options.workbookPath}, row ${options.rowNumber}.`);
  console.log("Password stays local and is not written to WorkLine or Git.");
  if (options.sync && !options.dryRun) {
    console.log("Supabase sync is enabled. Only extracted litigation rows will be sent to WorkLine.");
  }

  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  await page.goto(GST_PORTAL_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});

  await fillFirstVisible(
    page,
    [
      "input#username",
      "input[name='user_name']",
      "input[name='username']",
      "input[formcontrolname='username']",
      "input[placeholder*='Username' i]",
      "input[type='text']",
    ],
    client.userId,
    "GST user ID",
  );

  await fillFirstVisible(
    page,
    [
      "input#user_pass",
      "input#password",
      "input[name='user_pass']",
      "input[name='password']",
      "input[placeholder*='Password' i]",
      "input[type='password']",
    ],
    client.password,
    "GST password",
  );

  if (options.loginOnly) {
    console.log("");
    console.log("GST portal opened and credentials were filled from Excel.");
    console.log("Clicking GST portal login button so CAPTCHA can load.");
    await clickGstLoginButton(page, "GST portal login button");
    await waitForCaptchaAndSubmit(page);

    if (options.autoNotices) {
      await waitForAuthenticatedPortal(page);
      const tables = await collectNoticesAndOrders(page);
      const extractedAt = new Date().toISOString();
      const outputPath = await saveCollectorOutput({
        client,
        extractedAt,
        outputDir: options.outputDir,
        prefix: "gst-notices-orders",
        payload: {
          gstin: client.gstin,
          source: "gst-portal-local-browser",
          extractedAt,
          tables,
        },
      });

      console.log("");
      console.log(`Extracted ${tables.reduce((total, table) => total + table.rows.length, 0)} table rows from ${tables.length} table(s).`);
      console.log(`Saved local output: ${outputPath}`);
    }

    console.log("Keep this process running while the browser is in use.");
    await new Promise(() => {});
    return;
  }

  console.log("");
  console.log("In the browser: solve CAPTCHA, sign in, and open the GST litigation/notices/proceedings table.");
  await rl.question("When the table is visible, return here and press Enter to extract rows...");

  const extraction = await extractLitigationRows(page);
  const extractedAt = new Date().toISOString();

  if (options.saveHtml) {
    await saveDebugHtml(page, options.outputDir, client.gstin);
  }

  const outputPath = await saveCollectorOutput({
    client,
    extractedAt,
    outputDir: options.outputDir,
    prefix: "gst-litigation",
    payload: {
      gstin: client.gstin,
      source: "gst-portal-local-browser",
      extractedAt,
      headers: extraction.headers,
      rows: extraction.rows,
    },
  });

  console.log("");
  console.log(`Extracted ${extraction.rows.length} rows.`);
  console.log(`Saved local output: ${outputPath}`);

  if (options.sync && !options.dryRun) {
    const result = await syncRowsToSupabase({
      client,
      extractedAt,
      options,
      rows: extraction.rows,
    });
    console.log(`Synced ${result.insertedOrUpdated} rows to WorkLine registration ${result.registrationId}.`);
  } else if (options.sync && options.dryRun) {
    console.log("Dry run enabled, so no rows were sent to WorkLine.");
  }

  console.log("Keep the browser open if you want to inspect the portal page. Close it manually when done.");

  await rl.close();
}

main().catch((error) => {
  console.error("");
  console.error(error.message);
  process.exitCode = 1;
});
