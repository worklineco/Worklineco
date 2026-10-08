import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import XLSX from "xlsx";
import { getCollectorOutputDir, getDefaultWorkbookPath, getWorklineGstHome } from "./gst-helper-home.mjs";

const COLLECTOR_VERSION = "2026-10-08-sources-v16";
const GST_PORTAL_LOGIN_URL = "https://services.gst.gov.in/services/login";
const WORKLINE_GST_HOME = getWorklineGstHome();
const DEFAULT_WORKBOOK_PATH = getDefaultWorkbookPath();
const OUTPUT_DIR = getCollectorOutputDir(WORKLINE_GST_HOME);
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
  ["notice/demand order id", "refId"],
  ["notice / demand order id", "refId"],
  ["notice demand order id", "refId"],
  ["demand order id", "refId"],
  ["order id", "refId"],
  ["notice id", "refId"],
  ["notice / order description", "description"],
  ["notice/order description", "description"],
  ["notice order description", "description"],
  ["order description", "description"],
  ["date of issuance", "dateOfIssue"],
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
    sources: String(args.get("sources") || "notices,appeal,spl,payment")
      .split(",")
      .map((source) => source.trim().toLowerCase())
      .filter(Boolean),
    sync: parseBooleanFlag(args.get("sync")),
    workbookPath: path.resolve(args.get("file") || DEFAULT_WORKBOOK_PATH),
    worklineEmail: args.get("workline-email") || process.env.WORKLINE_EMAIL || "",
    worklinePassword: args.get("workline-password") || process.env.WORKLINE_PASSWORD || "",
  };
}

async function loadLocalEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(WORKLINE_GST_HOME, fileName);
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

async function readNoticeRowsFromOutput(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(content);

  // New format stores field-keyed rows directly under `rows`.
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

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

// Reads the notices table on the current page. It picks the table whose header
// row maps best to our known fields, then pulls each body row by column
// position (the robust approach proven in the V3 collector). Filter-input rows
// and header rows are skipped.
async function extractNoticeTableRows(page) {
  return page.evaluate(
    ({ aliases, fieldNames, sectionLabel }) => {
      const aliasMap = new Map(aliases);

      function clean(value) {
        return String(value ?? "").replace(/\s+/g, " ").trim();
      }

      function normalizeHeader(value) {
        return clean(value).replace(/[.:#]/g, "").trim().toLowerCase();
      }

      function mapHeader(header) {
        return aliasMap.get(normalizeHeader(header)) ?? null;
      }

      function isVisible(node) {
        return Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      }

      // The portal header often has two rows: the column labels and a row of
      // filter inputs. Pick whichever header row actually carries text.
      function pickHeaderCells(table) {
        const candidates = [...table.querySelectorAll("thead tr")];
        const firstTr = table.querySelector("tr");
        if (!candidates.length && firstTr) {
          candidates.push(firstTr);
        }
        let bestCells = [];
        let bestCount = -1;
        for (const tr of candidates) {
          const cells = [...tr.querySelectorAll("th,td")].map((node) => clean(node.innerText || node.textContent));
          const count = cells.filter(Boolean).length;
          if (count > bestCount) {
            bestCount = count;
            bestCells = cells;
          }
        }
        return bestCells;
      }

      // Choose the visible table with the most header cells mapping to our fields.
      let best = null;
      let bestScore = 0;
      for (const table of document.querySelectorAll("table")) {
        if (!isVisible(table)) {
          continue;
        }
        const headerCells = pickHeaderCells(table);
        const score = headerCells.map(mapHeader).filter(Boolean).length;
        if (score > bestScore) {
          bestScore = score;
          best = { headerCells, table };
        }
      }

      if (!best || bestScore < 2) {
        return [];
      }

      const bodyRows = [...best.table.querySelectorAll("tbody tr")];
      const dataRows = bodyRows.length ? bodyRows : [...best.table.querySelectorAll("tr")];
      const out = [];

      for (const row of dataRows) {
        if (row.querySelector("th")) {
          continue; // header row
        }
        const cellNodes = [...row.querySelectorAll("td")];
        if (!cellNodes.length) {
          continue;
        }
        // Skip the filter row (cells that only hold inputs/selects, no text).
        if (row.querySelector("input,select") && cellNodes.every((node) => !clean(node.innerText || node.textContent))) {
          continue;
        }
        const cells = cellNodes.map((node) => clean(node.innerText || node.textContent));
        if (!cells.some(Boolean)) {
          continue;
        }

        const record = Object.fromEntries(fieldNames.map((name) => [name, ""]));
        best.headerCells.forEach((header, index) => {
          const field = mapHeader(header);
          if (field && !record[field]) {
            record[field] = cells[index] ?? "";
          }
        });
        record.section = record.section || sectionLabel;

        // Keep only rows that carry a real identifier or content.
        if (record.refId || record.caseId || record.typeOfNotice || record.description) {
          out.push(record);
        }
      }

      return out;
    },
    { aliases: [...HEADER_ALIASES.entries()], fieldNames: FIELD_NAMES, sectionLabel: "" },
  );
}

// Logs the header row of every visible table so we can see what the portal returned.
async function logVisibleTableHeaders(page) {
  const tables = await page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    const pickHeaderCells = (table) => {
      const candidates = [...table.querySelectorAll("thead tr")];
      const firstTr = table.querySelector("tr");
      if (!candidates.length && firstTr) {
        candidates.push(firstTr);
      }
      let bestCells = [];
      let bestCount = -1;
      for (const tr of candidates) {
        const cells = [...tr.querySelectorAll("th,td")].map((node) => clean(node.innerText || node.textContent));
        const count = cells.filter(Boolean).length;
        if (count > bestCount) {
          bestCount = count;
          bestCells = cells;
        }
      }
      return bestCells;
    };
    return [...document.querySelectorAll("table")].filter(isVisible).map((table) => {
      const headers = pickHeaderCells(table);
      const bodyRowCount = table.querySelectorAll("tbody tr").length;
      return { bodyRowCount, headers };
    });
  }).catch(() => []);

  console.log(`Found ${tables.length} visible table(s) on the notices page.`);
  tables.forEach((table, index) => {
    console.log(`  Table ${index + 1} (${table.bodyRowCount} body rows): ${table.headers.join(" | ")}`);
  });
}

// Collects the merged notices table, then drills into each row's View page to
// capture Case ID, Period, Status and every left sub-tab's table.
// Opens the Case Details page for data row `index` by clicking its View link
// (6th cell). Returns true once the Case Details page is showing.
async function openCaseDetail(page, index) {
  const viewLinks = page.locator("xpath=//table/tbody/tr/td[6]//a");
  const total = await viewLinks.count().catch(() => 0);
  if (index >= total) {
    return false;
  }
  await viewLinks.nth(index).scrollIntoViewIfNeeded().catch(() => {});
  await viewLinks.nth(index).click({ timeout: 8_000 }).catch(() => {});
  return page
    .waitForFunction(
      () => {
        const text = document.body ? document.body.innerText : "";
        return /case\s*id/i.test(text) || /case details/i.test(text);
      },
      null,
      { timeout: 12_000 }
    )
    .then(() => true)
    .catch(() => false);
}

// Clicks a left sub-tab (INTIMATIONS / NOTICES / REPLIES / ORDERS) by exact text.
async function clickSubTab(page, name) {
  const locator = page.getByText(name, { exact: true }).first();
  const count = await locator.count().catch(() => 0);
  if (!count) {
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 6_000 }).catch(() => {});
  return true;
}

// Captures the Case Details tables currently shown (Type / Reference Number /
// Issue Date / Due Date to Reply / Section / Attachment). Skips "No Records Found".
async function captureCaseTables(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    const pickHeader = (table) => {
      const candidates = [...table.querySelectorAll("thead tr")];
      const firstTr = table.querySelector("tr");
      if (!candidates.length && firstTr) {
        candidates.push(firstTr);
      }
      let best = [];
      let bestCount = -1;
      for (const tr of candidates) {
        const cells = [...tr.querySelectorAll("th,td")].map((node) => clean(node.innerText || node.textContent));
        const count = cells.filter(Boolean).length;
        if (count > bestCount) {
          bestCount = count;
          best = cells;
        }
      }
      return best;
    };

    const out = [];
    for (const table of document.querySelectorAll("table")) {
      if (!isVisible(table)) {
        continue;
      }
      const headers = pickHeader(table);
      const headerText = headers.join(" ").toLowerCase();
      if (!/type|reference|issue date|due date|section|attachment|order|notice|reply/.test(headerText)) {
        continue;
      }
      const bodyRows = [...table.querySelectorAll("tbody tr")];
      const dataRows = (bodyRows.length ? bodyRows : [...table.querySelectorAll("tr")]).filter((tr) => !tr.querySelector("th"));
      const rows = [];
      for (const tr of dataRows) {
        const cells = [...tr.querySelectorAll("td")].map((node) => clean(node.innerText || node.textContent));
        if (!cells.some(Boolean)) {
          continue;
        }
        if (/no records found/i.test(cells.join(" "))) {
          continue;
        }
        rows.push(cells);
      }
      if (rows.length) {
        out.push({ headers, rows });
      }
    }
    return out;
  }).catch(() => []);
}

// Reads Case ID, Tax Period, Status and each sub-tab's table from a Case Details page.
async function extractCaseDetail(page) {
  await page.waitForTimeout(1_000);

  const header = await page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const norm = (value) => clean(value).toLowerCase().replace(/[:*]+$/, "").trim();
    const valueFor = (variants) => {
      const wants = variants.map(norm);
      const els = [...document.querySelectorAll("div,span,p,td,th,label,b,strong")];
      for (const el of els) {
        const text = norm(el.innerText || el.textContent);
        if (!wants.includes(text)) {
          continue;
        }
        const sibling = el.nextElementSibling;
        if (sibling) {
          const value = clean(sibling.innerText || sibling.textContent);
          if (value && norm(value) !== text) {
            return value;
          }
        }
        const parent = el.parentElement;
        if (parent) {
          const full = clean(parent.innerText || parent.textContent);
          const label = clean(el.innerText || el.textContent);
          const value = full.replace(label, "").trim();
          if (value) {
            return value;
          }
        }
      }
      return "";
    };
    return {
      caseId: valueFor(["Case ID"]),
      period: valueFor(["Tax Periods(s)", "Tax Period(s)", "Tax Periods", "Tax Period", "Period"]),
      status: valueFor(["Status"])
    };
  }).catch(() => ({ caseId: "", period: "", status: "" }));

  console.log(`    Detail caseId="${header.caseId}" period="${header.period}" status="${header.status}"`);

  const tabs = [];
  for (const name of [
    "INTIMATIONS", "NOTICES", "REPLIES", "ORDERS",
    "APPLICATIONS", "ACK./INTIMATION", "ACK/INTIMATION", "ACKNOWLEDGEMENT", "INTIMATION", "REJOINDER"
  ]) {
    const clicked = await clickSubTab(page, name);
    if (!clicked) {
      continue;
    }
    await page.waitForTimeout(1_200);
    const tables = await captureCaseTables(page);
    const rowTotal = tables.reduce((sum, table) => sum + table.rows.length, 0);
    console.log(`    Sub-tab ${name}: ${rowTotal} row(s).`);
    if (tables.length) {
      tabs.push({ name, tables });
    }
  }

  return { caseId: header.caseId, period: header.period, status: header.status, tabs };
}

// Returns to the notices list: click the "View Notices and Orders" breadcrumb,
// and if that doesn't land on the list, go the Services route again.
async function returnToNoticesList(page) {
  await clickPortalLinkByText(page, "View Notices and Orders", "View Notices and Orders (breadcrumb)").catch(() => false);
  await page.waitForTimeout(2_000);

  const onList = await page
    .evaluate(() => /notice\s*\/?\s*demand order id/i.test(document.body ? document.body.innerText : ""))
    .catch(() => false);

  if (!onList) {
    await clickPortalLinkByText(page, "Services", "Services");
    await page.waitForTimeout(1_500);
    await clickPortalLinkByText(page, "User Services", "User Services");
    await page.waitForTimeout(1_500);
    await clickPortalLinkByText(page, "View Notices and Orders", "View Notices and Orders");
    await page.waitForTimeout(2_000);
  }

  await clickPortalLinkByText(page, "100", "100 rows per page").catch(() => false);
  await page.waitForTimeout(1_200);
}

const APPEAL_TYPE = "Appeal to Appellate Authority";
const APPEAL_START_DATE = "01/07/2017";
const APPEAL_WINDOW_DAYS = 90;

// Splits 01/07/2017..today into <= `days` windows (the form caps the range).
function buildDateWindows(startDmy, days) {
  const [d, m, y] = startDmy.split("/").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fmt = (date) =>
    `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  const windows = [];
  while (cursor <= end) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + days - 1);
    const winEnd = next > end ? end : next;
    windows.push([fmt(cursor), fmt(winEnd)]);
    cursor = new Date(winEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows.length ? windows : [[startDmy, fmt(end)]];
}

// Services > User Services > My Applications.
async function goToMyApplications(page) {
  await clickPortalLinkByText(page, "Services", "Services");
  await page.waitForTimeout(2_000);
  await clickPortalLinkByText(page, "User Services", "User Services");
  await page.waitForTimeout(2_000);

  const clicked = await page.evaluate(() => {
    const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const link = [...document.querySelectorAll("a")].find((anchor) => {
      const href = anchor.getAttribute("href") || "";
      return norm(anchor.innerText || anchor.textContent) === "my applications" || href.includes("litserv/auth/case/search");
    });
    if (!link) {
      return false;
    }
    link.scrollIntoView({ block: "center" });
    link.click();
    return true;
  }).catch(() => false);

  await page.waitForTimeout(2_500);
  const ready = await page.locator("#up_type, select").first().count().catch(() => 0);
  return clicked && ready > 0;
}

// Selects an application type in the My Applications dropdown.
async function selectAppealType(page, label) {
  if (await page.locator("#up_type").count().catch(() => 0)) {
    try {
      await page.selectOption("#up_type", { label });
      await page.waitForTimeout(1_500);
      return true;
    } catch {
      // fall through to the generic search
    }
  }
  const ok = await page.evaluate((wanted) => {
    for (const select of document.querySelectorAll("select")) {
      const option = [...select.options].find(
        (o) => o.text.trim() === wanted || o.text.toLowerCase().includes("appeal to appellate")
      );
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, label).catch(() => false);
  await page.waitForTimeout(1_500);
  return ok;
}

// Fills the From/To date fields (Angular inputs need value + events set).
async function setApplicationDates(page, from, to) {
  await page.evaluate(({ from: fromValue, to: toValue }) => {
    const setValue = (names, value) => {
      for (const name of names) {
        const el = document.querySelector(`[name='${name}']`) || document.getElementById(name);
        if (el) {
          el.removeAttribute("readonly");
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
          return true;
        }
      }
      return false;
    };
    setValue(["fromdate", "fmdt", "from_date"], fromValue);
    setValue(["todate", "todt", "to_date"], toValue);
  }, { from, to }).catch(() => {});
  await page.waitForTimeout(600);
}

async function clickApplicationSearch(page) {
  const clicked = await page.evaluate(() => {
    const up = (value) => String(value ?? "").toUpperCase();
    const el = [...document.querySelectorAll("button,a,input[type=submit],button[type=submit]")].find((candidate) =>
      up(candidate.innerText || candidate.value || "").includes("SEARCH")
    );
    if (!el) {
      return false;
    }
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }).catch(() => false);
  await page.waitForTimeout(2_500);
  return clicked;
}

// Reads the application result rows (skips "No Records Found").
async function extractAppealResultRows(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const out = [];
    for (const table of document.querySelectorAll("table")) {
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.innerText || td.textContent));
        if (cells.length < 2 || !cells.some(Boolean)) {
          continue;
        }
        if (/no records found/i.test(cells.join(" "))) {
          continue;
        }
        const anchor = tr.querySelector("a");
        out.push({ arn: clean(anchor?.innerText || anchor?.textContent || cells[0]), cells });
      }
    }
    return out;
  }).catch(() => []);
}

// Clicks the ARN link of an application in the results table.
async function openAppealRow(page, arn) {
  const clicked = await page.evaluate((arnText) => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const links = [...document.querySelectorAll("table tbody tr a")];
    const target =
      links.find((a) => clean(a.innerText || a.textContent) === arnText) ||
      links.find((a) => arnText && clean(a.innerText || a.textContent).includes(arnText));
    if (!target) {
      return false;
    }
    target.scrollIntoView({ block: "center" });
    target.click();
    return true;
  }, arn).catch(() => false);
  if (!clicked) {
    return false;
  }
  return page
    .waitForFunction(() => /case\s*id/i.test(document.body ? document.body.innerText : ""), null, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
}

async function returnToMyApplications(page) {
  await clickPortalLinkByText(page, "My Applications", "My Applications (breadcrumb)").catch(() => false);
  await page.waitForTimeout(2_000);
  const ready = await page.locator("#up_type").count().catch(() => 0);
  if (!ready) {
    await goToMyApplications(page);
  }
}

// Searches My Applications for a given application type across 90-day windows,
// then drills into each application's case page and captures its sub-tabs.
async function collectApplications(page, appType) {
  console.log(`Applications (${appType}): navigating to Services > User Services > My Applications.`);
  const reached = await goToMyApplications(page);
  if (!reached) {
    console.log(`Applications (${appType}): My Applications page not reachable — skipping.`);
    return [];
  }

  await selectAppealType(page, appType);
  const windows = buildDateWindows(APPEAL_START_DATE, APPEAL_WINDOW_DAYS);
  console.log(`Applications (${appType}): searching ${windows.length} window(s) of ${APPEAL_WINDOW_DAYS} days from ${APPEAL_START_DATE}.`);

  const found = [];
  const seen = new Set();
  for (const [from, to] of windows) {
    await setApplicationDates(page, from, to);
    await clickApplicationSearch(page);
    await page.waitForTimeout(1_200);
    const rows = await extractAppealResultRows(page);
    if (rows.length) {
      console.log(`  Appeals ${from}-${to}: ${rows.length} application(s).`);
    }
    for (const row of rows) {
      const key = row.arn || row.cells.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ arn: row.arn, cells: row.cells, from, to });
      }
    }
  }

  console.log(`Applications (${appType}): ${found.length} unique application(s) found. Opening each...`);

  const results = [];
  for (let index = 0; index < found.length; index += 1) {
    const app = found[index];
    if (!(await page.locator("#up_type").count().catch(() => 0))) {
      await returnToMyApplications(page);
    }
    await selectAppealType(page, appType);
    await setApplicationDates(page, app.from, app.to);
    await clickApplicationSearch(page);
    await page.waitForTimeout(1_200);

    const opened = await openAppealRow(page, app.arn);
    console.log(`  ${appType} ${index + 1}/${found.length} ${app.arn}: ${opened ? "opened" : "not opened"}`);
    if (opened) {
      const detail = await extractCaseDetail(page);
      const dateCell = app.cells.find((cell) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell)) || "";
      results.push({
        caseId: detail.caseId || app.arn,
        dateOfIssue: dateCell,
        description: app.cells.slice(1).find(Boolean) || "",
        detail: { tabs: detail.tabs },
        refId: app.arn,
        replyFiling: "",
        section: "",
        sNo: "",
        status: detail.status || "",
        taxPeriod: detail.period || "",
        typeOfNotice: appType
      });
    }
    await returnToMyApplications(page);
  }

  console.log(`Applications (${appType}): captured ${results.length} application(s) with detail.`);
  return results;
}

// Services > Ledgers > Payment towards Demand: captures each notice/order number
// and its demand amount, so the tracker can show the demand against a case.
async function collectPaymentTowardsDemand(page) {
  console.log("Payment towards Demand: navigating to Services > Ledgers > Payment towards Demand.");
  await waitForAuthenticatedPortal(page);
  await clickPortalLinkByText(page, "Services", "Services");
  await page.waitForTimeout(2_000);
  await clickPortalLinkByText(page, "Ledgers", "Ledgers");
  await page.waitForTimeout(2_000);
  const opened =
    (await clickPortalLinkByText(page, "Payment towards Demand", "Payment towards Demand").catch(() => false)) ||
    (await clickPortalLinkByText(page, "Payment Towards Demand", "Payment Towards Demand").catch(() => false));
  if (!opened) {
    console.log("Payment towards Demand: menu item not found — skipping.");
    return [];
  }
  await page.waitForTimeout(2_500);

  await logVisibleTableHeaders(page);

  const demands = await page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    const idPattern = /\b[A-Z]{2}\d{13,15}\b/; // demand / order ids like ZD0809..., AD0809...
    const amountPattern = /^-?[₹\s]*[\d,]+(\.\d+)?$/;
    const out = [];
    for (const table of document.querySelectorAll("table")) {
      if (!isVisible(table)) {
        continue;
      }
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.innerText || td.textContent));
        if (cells.length < 2 || !cells.some(Boolean)) {
          continue;
        }
        if (/no records found/i.test(cells.join(" "))) {
          continue;
        }
        const idCell = cells.find((cell) => idPattern.test(cell));
        // The demand amount is the largest numeric cell on the row.
        const amounts = cells
          .filter((cell) => amountPattern.test(cell.replace(/[₹\s]/g, "")) && /\d/.test(cell))
          .map((cell) => ({ raw: cell, value: Number(cell.replace(/[^\d.]/g, "")) }))
          .filter((entry) => Number.isFinite(entry.value));
        amounts.sort((a, b) => b.value - a.value);
        if (idCell && amounts.length) {
          out.push({ amount: amounts[0].raw, noticeNo: idCell, row: cells });
        }
      }
    }
    return out;
  }).catch(() => []);

  console.log(`Payment towards Demand: captured ${demands.length} demand row(s).`);

  return demands.map((demand) => ({
    caseId: demand.noticeNo,
    dateOfIssue: "",
    demandAmount: demand.amount,
    description: "Payment towards Demand",
    detail: { tabs: [] },
    refId: demand.noticeNo,
    replyFiling: "",
    section: "",
    sNo: "",
    status: "",
    taxPeriod: "",
    typeOfNotice: "Demand"
  }));
}

// Services > User Services > View Notices and Orders, show 100 rows, read the
// list, then open each View one by one to capture its Case Details.
async function collectNoticesAndOrders(page) {
  await waitForAuthenticatedPortal(page);

  await clickPortalLinkByText(page, "Services", "Services");
  await page.waitForTimeout(2_000);

  await clickPortalLinkByText(page, "User Services", "User Services");
  await page.waitForTimeout(2_000);

  await clickPortalLinkByText(page, "View Notices and Orders", "View Notices and Orders");
  await page.waitForTimeout(2_500);

  await clickPortalLinkByText(page, "100", "100 rows per page");
  await page.waitForTimeout(1_500);

  await logVisibleTableHeaders(page);
  const listRows = await extractNoticeTableRows(page);
  console.log(`Main table: ${listRows.length} row(s). Opening each View one by one...`);

  for (let index = 0; index < listRows.length; index += 1) {
    const opened = await openCaseDetail(page, index);
    console.log(`  Row ${index + 1}/${listRows.length}: ${opened ? "opened case details" : "no detail page"}`);

    if (opened) {
      const detail = await extractCaseDetail(page);
      listRows[index].caseId = detail.caseId || listRows[index].caseId;
      listRows[index].taxPeriod = detail.period || listRows[index].taxPeriod;
      listRows[index].status = detail.status || listRows[index].status;
      listRows[index].detail = { tabs: detail.tabs };
    }

    await returnToNoticesList(page);
  }

  console.log(`Finished. Collected ${listRows.length} notice row(s) with detail.`);
  return listRows;
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

const CLIENT_RECORDS_SOURCE = "client_records_register";

function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Reads the GST login (GST-ID / GST-PASS) for a GSTIN straight from the
// Client Records register in Supabase, so credentials live in WorkLine and
// never need a local Excel file.
async function readClientFromClientRecords(gstin) {
  const expectedGstin = String(gstin ?? "").trim().toUpperCase();
  if (!expectedGstin) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("clients")
    .select("name,organisation_id,custom_values")
    .eq("custom_values->>source", CLIENT_RECORDS_SOURCE)
    .limit(5000);

  if (error) {
    throw new Error(`Could not read Client Records from WorkLine: ${error.message}`);
  }

  const match = (data ?? []).find((row) => {
    const values = row.custom_values ?? {};
    return String(values["GSTIN/UIN"] ?? "").trim().toUpperCase() === expectedGstin;
  });

  if (!match) {
    throw new Error(`No client in Client Records has GSTIN ${expectedGstin}.`);
  }

  const values = match.custom_values ?? {};
  const userId = String(values["GST-ID"] ?? "").trim();
  const password = String(values["GST-PASS"] ?? "").trim();
  const clientName = String(values["Particulars"] ?? "").trim() || String(match.name ?? "").trim();

  if (!userId || !password) {
    throw new Error(`GST-ID / GST-PASS are missing for GSTIN ${expectedGstin} in Client Records. Add them on the Client Records tab.`);
  }

  return {
    clientName,
    gstin: expectedGstin,
    organisationId: match.organisation_id,
    password,
    rowNumber: null,
    userId,
  };
}

// Writes extracted notice tables straight into gst_litigation_cases using the
// service-role key (no interactive WorkLine sign-in needed).
async function syncRowsWithServiceRole({ clientName, extractedAt, gstin, organisationId, rows, sources }) {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    return { insertedOrUpdated: 0, registrationId: "", skipped: true };
  }

  const dataRows = Array.isArray(rows) ? rows : [];
  // Only these source tabs get replaced; anything else (e.g. manual) is kept.
  const sourceTags =
    sources && sources.length ? sources : [...new Set(dataRows.map((row) => row.sourceTab).filter(Boolean))];

  const existing = await admin
    .from("gst_registrations")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("gstin", gstin)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Could not find GST registration: ${existing.error.message}`);
  }

  let registrationId = existing.data?.id;
  if (!registrationId) {
    if (!dataRows.length) {
      return { insertedOrUpdated: 0, registrationId: "", skipped: false };
    }
    const created = await admin
      .from("gst_registrations")
      .insert({ client_name: clientName || gstin, gstin, organisation_id: organisationId })
      .select("id")
      .single();

    if (created.error || !created.data?.id) {
      throw new Error(`Could not create GST registration for ${gstin}: ${created.error?.message ?? "No id returned."}`);
    }

    registrationId = created.data.id;
  }

  // Replace only the selected sources' rows; leave the un-ticked ones intact.
  if (sourceTags.length) {
    const { error: deleteError } = await admin
      .from("gst_litigation_cases")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("gst_registration_id", registrationId)
      .in("source", sourceTags);

    if (deleteError) {
      throw new Error(`Could not clear previous rows for the selected sources: ${deleteError.message}`);
    }
  }

  if (!dataRows.length) {
    return { insertedOrUpdated: 0, registrationId, skipped: false };
  }

  const payload = dataRows.map((row, index) => {
    const normalized = normalizeExtractedRow(row, index);
    return {
      ...normalized,
      case_id: normalized.case_id || normalized.ref_id || `row-${index + 1}`,
      gst_registration_id: registrationId,
      organisation_id: organisationId,
      raw_payload: row,
      scraped_at: extractedAt,
      source: row.sourceTab || "gst-portal-local-collector",
      updated_at: new Date().toISOString(),
    };
  });

  const { error: insertError } = await admin.from("gst_litigation_cases").insert(payload);

  if (insertError) {
    throw new Error(`Could not save litigation rows to WorkLine: ${insertError.message}`);
  }

  return { insertedOrUpdated: payload.length, registrationId, skipped: false };
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
  console.log(`WorkLine GST collector build: ${COLLECTOR_VERSION}`);
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

  // Prefer credentials from the WorkLine Client Records register (looked up by
  // GSTIN). Fall back to the local Excel workbook only if that is unavailable.
  let client = null;
  let credentialSource = "";

  if (options.expectedGstin) {
    try {
      client = await readClientFromClientRecords(options.expectedGstin);
      if (client) {
        credentialSource = "Client Records";
      }
    } catch (clientRecordsError) {
      if (!createAdminSupabaseClient()) {
        // No service role configured locally — silently fall back to Excel.
        client = null;
      } else {
        throw clientRecordsError;
      }
    }
  }

  if (!client) {
    client = readClientFromWorkbook(options);
    credentialSource = `Excel row ${client.rowNumber}`;
    options = { ...options, rowNumber: client.rowNumber };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  options = await promptForWorkLineLogin(rl, options);

  console.log(`Loaded GSTIN ${client.gstin} from ${credentialSource}.`);
  console.log("Password stays local and is not written to WorkLine or Git.");
  if (options.sync && !options.dryRun) {
    console.log("Supabase sync is enabled. Only extracted litigation rows will be sent to WorkLine.");
  }

  const browser = await launchChrome();
  const context = await browser.newContext({ acceptDownloads: true, viewport: null });
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

      const selectedSources = new Set(options.sources);
      console.log(`Selected sources: ${[...selectedSources].join(", ") || "none"}`);
      const rows = [];

      const runSource = async (key, label, collector) => {
        if (!selectedSources.has(key)) {
          return;
        }
        try {
          const sourceRows = await collector();
          sourceRows.forEach((row) => {
            row.sourceTab = key;
          });
          rows.push(...sourceRows);
        } catch (sourceError) {
          console.error(`${label} collection failed: ${sourceError.message}`);
        }
      };

      await runSource("notices", "Notices & Orders", () => collectNoticesAndOrders(page));
      await runSource("appeal", "Appeal to Appellate Authority", () => collectApplications(page, "Appeal to Appellate Authority"));
      await runSource("spl", "SPL (Waiver Scheme 128A)", () => collectApplications(page, "Application for Waiver Scheme under Section 128A"));
      await runSource("payment", "Payment towards Demand", () => collectPaymentTowardsDemand(page));

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
          rows,
        },
      });

      console.log("");
      console.log(`Extracted ${rows.length} notice row(s).`);
      console.log(`Saved local output: ${outputPath}`);

      // Push straight into WorkLine so the GST Tracker shows the notices firm-wide.
      if (client.organisationId) {
        try {
          const synced = await syncRowsWithServiceRole({
            clientName: client.clientName || options.clientName,
            extractedAt,
            gstin: client.gstin,
            organisationId: client.organisationId,
            rows,
            sources: options.sources,
          });
          if (synced.skipped) {
            console.log("Supabase service role not configured locally, so rows were not saved to WorkLine.");
          } else {
            console.log(`Saved ${synced.insertedOrUpdated} notice rows to WorkLine registration ${synced.registrationId}.`);
          }
        } catch (syncError) {
          console.error(`Could not save notices to WorkLine: ${syncError.message}`);
        }
      } else {
        console.log("No WorkLine organisation resolved for this client, so rows were not saved to WorkLine.");
      }
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
