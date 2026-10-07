import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import XLSX from "xlsx";
import { getCollectorOutputDir, getDefaultWorkbookPath, getWorklineGstHome } from "./gst-helper-home.mjs";

const COLLECTOR_VERSION = "2026-10-07-drilldown-v10-xpath";
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

// The GST portal intermittently throws an "Access Denied" / session page that
// clears on a reload. Detect it by URL or visible text.
async function isAccessDenied(page) {
  return page.evaluate(() => {
    const url = (location.href || "").toLowerCase();
    if (url.includes("accessdenied") || url.includes("sessionexpired")) {
      return true;
    }
    const text = document.body ? document.body.innerText : "";
    return /access denied/i.test(text);
  }).catch(() => false);
}

// When Access Denied shows up, refresh the page (then fall back to re-opening
// the given URL) until it clears, as the provided V3 collector did.
async function recoverFromAccessDenied(page, reloadUrl) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!(await isAccessDenied(page))) {
      return true;
    }
    console.log(`Access Denied detected — refreshing the page (attempt ${attempt + 1}).`);
    if (attempt === 0) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    } else if (reloadUrl) {
      await page.goto(reloadUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    } else {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    }
    await page.waitForTimeout(3_000);
  }
  const stillDenied = await isAccessDenied(page);
  if (stillDenied) {
    console.log("Access Denied did not clear after refreshing.");
  }
  return !stillDenied;
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
  await recoverFromAccessDenied(page, "https://services.gst.gov.in/services/auth/dashboard");
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
  await recoverFromAccessDenied(page, NOTICES_URL);
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

const NOTICES_URL = "https://services.gst.gov.in/services/auth/notices";

// Clicks an element in the left area of a detail page whose text matches label.
async function clickLeftTab(page, label) {
  return page.evaluate((target) => {
    const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const width = window.innerWidth;
    const element = [...document.querySelectorAll("a,li,button,[role='tab'],span")].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return norm(candidate.innerText || candidate.textContent) === norm(target) && rect.width > 0 && rect.height > 0 && rect.left < width * 0.5;
    });
    if (!element) {
      return false;
    }
    const clickable = element.tagName === "LI" || element.tagName === "SPAN" ? element.querySelector("a,button") ?? element : element;
    clickable.scrollIntoView({ block: "center" });
    clickable.click();
    return true;
  }, label).catch(() => false);
}

// Captures every visible data table on the current detail view as {headers, rows}.
async function captureDetailTables(page) {
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
      const bodyRows = [...table.querySelectorAll("tbody tr")];
      const dataRows = (bodyRows.length ? bodyRows : [...table.querySelectorAll("tr")]).filter((tr) => !tr.querySelector("th"));
      const rows = [];
      for (const tr of dataRows) {
        const cellNodes = [...tr.querySelectorAll("td")];
        if (tr.querySelector("input,select") && cellNodes.every((td) => !clean(td.innerText || td.textContent))) {
          continue;
        }
        const cells = cellNodes.map((node) => clean(node.innerText || node.textContent));
        if (cells.some(Boolean)) {
          rows.push(cells);
        }
      }
      if (rows.length) {
        out.push({ headers, rows });
      }
    }
    return out;
  }).catch(() => []);
}

// Reads Case ID, Period, Status and each left sub-tab's tables from a notice's View page.
async function extractViewDetail(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  await recoverFromAccessDenied(page);
  await page.waitForTimeout(500);

  const header = await page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const valueFor = (labels) => {
      const want = labels.map((label) => label.toLowerCase());
      const els = [...document.querySelectorAll("span,label,td,th,div,strong,p,b")];
      const labelEl = els.find((el) => {
        const text = clean(el.innerText || el.textContent).toLowerCase().replace(/[:\s]+$/, "");
        return want.includes(text);
      });
      if (!labelEl) {
        return "";
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let passed = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node === labelEl) {
          passed = true;
          continue;
        }
        if (passed && (node.tagName === "B" || node.tagName === "STRONG")) {
          const text = clean(node.innerText || node.textContent);
          if (text) {
            return text;
          }
        }
      }
      return "";
    };
    return {
      caseId: valueFor(["case id"]),
      period: valueFor(["period", "tax period", "financial year"]),
      status: valueFor(["status", "case status"])
    };
  }).catch(() => ({ caseId: "", period: "", status: "" }));

  const tabLabels = await page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const width = window.innerWidth;
    const candidates = [...document.querySelectorAll("a,li,button,[role='tab']")].filter((el) => {
      const rect = el.getBoundingClientRect();
      const text = clean(el.innerText || el.textContent);
      return text && text.length <= 30 && rect.width > 0 && rect.height > 0 && rect.left < width * 0.45;
    });
    return [...new Set(candidates.map((el) => clean(el.innerText || el.textContent)))];
  }).catch(() => []);

  console.log(`    Detail caseId="${header.caseId}" period="${header.period}" status="${header.status}"`);
  console.log(`    Left items: ${tabLabels.join(" | ")}`);

  const knownTabs = [
    "Notice", "Notices", "Notices and Demand Orders", "Reply", "Replies", "Order", "Orders",
    "Proceedings", "Reminder", "Reminders", "Personal Hearing", "Adjournment", "Rectification",
    "Appeal", "Refund", "Documents", "Attachments", "Drop Proceedings"
  ];
  const tabsToTry = knownTabs.filter((known) => tabLabels.some((label) => label.toLowerCase() === known.toLowerCase()));

  const tabs = [];
  const defaultTables = await captureDetailTables(page);
  if (defaultTables.length) {
    tabs.push({ name: "Summary", tables: defaultTables });
  }

  for (const tab of tabsToTry) {
    const clicked = await clickLeftTab(page, tab);
    if (!clicked) {
      continue;
    }
    await page.waitForTimeout(1_200);
    const captured = await captureDetailTables(page);
    const rowTotal = captured.reduce((sum, table) => sum + table.rows.length, 0);
    console.log(`    Sub-tab "${tab}": ${rowTotal} row(s).`);
    if (captured.length) {
      tabs.push({ name: tab, tables: captured });
    }
  }

  return { caseId: header.caseId, period: header.period, status: header.status, tabs };
}

// Counts the data rows in the main notices table on the list page.
async function noticeDataRowCount(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    let bestCount = -1;
    for (const table of document.querySelectorAll("table")) {
      const bodyRows = [...table.querySelectorAll("tbody tr")].filter(
        (tr) => !tr.querySelector("th") && [...tr.querySelectorAll("td")].some((td) => clean(td.innerText || td.textContent))
      );
      if (bodyRows.length > bestCount) {
        bestCount = bodyRows.length;
      }
    }
    return bestCount < 0 ? 0 : bestCount;
  }).catch(() => 0);
}

// Clicks the "View" link in data row `index` with a real (trusted) click, then
// detects what the portal did: opened a new tab (popup), navigated the current
// tab, or started a document download. Returns the detail page when there is
// one, plus a descriptive reason for the log.
async function openNoticeDetail(page, index, previousUrl) {
  // The View link lives in the 6th cell (Action column) of each data row:
  // //table/tbody/tr[N]/td[6]/div/a. Selecting td[6] anchors gives one per row
  // in row order, matching the extracted list rows.
  const viewLinks = page.locator("xpath=//table/tbody/tr/td[6]//a");
  const total = await viewLinks.count().catch(() => 0);
  if (index >= total) {
    return { detailPage: null, reason: `no-view-link (found ${total})` };
  }
  const viewLink = viewLinks.nth(index);

  const popupPromise = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
  const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  const navPromise = page
    .waitForFunction(
      (prev) => location.href !== prev || /case\s*id/i.test(document.body ? document.body.innerText : ""),
      previousUrl,
      { timeout: 5_000 }
    )
    .then(() => true)
    .catch(() => false);

  let clickError = "";
  try {
    await viewLink.scrollIntoViewIfNeeded({ timeout: 5_000 });
    await viewLink.click({ timeout: 8_000 });
  } catch (error) {
    clickError = String(error?.message || error).split("\n")[0];
  }

  const [popup, download, navigated] = await Promise.all([popupPromise, downloadPromise, navPromise]);

  if (download) {
    const name = (() => {
      try {
        return download.suggestedFilename();
      } catch {
        return "file";
      }
    })();
    await download.cancel().catch(() => {});
    return { detailPage: null, reason: `download(${name})`, clickError };
  }

  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    return { detailPage: popup, isPopup: true, reason: `popup(${popup.url()})`, clickError };
  }

  if (navigated && !(await isAccessDenied(page))) {
    return { detailPage: page, isPopup: false, reason: `navigated(${page.url()})`, clickError };
  }

  return { detailPage: null, reason: clickError ? `click-failed: ${clickError}` : "nothing-happened", clickError };
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
async function collectNoticesAndOrders(page) {
  await navigateToNoticesAndOrders(page);
  await logVisibleTableHeaders(page);
  await clickPortalLinkByText(page, "100", "100 rows per page").catch(() => false);
  await page.waitForTimeout(1_200);

  const listRows = await extractNoticeTableRows(page);
  const rowCount = await noticeDataRowCount(page);
  const count = Math.min(listRows.length, rowCount);
  console.log(`Main table: ${listRows.length} list row(s), ${rowCount} data row(s). Drilling into ${count} View page(s)...`);

  for (let index = 0; index < count; index += 1) {
    const previousUrl = page.url();
    const opened = await openNoticeDetail(page, index, previousUrl);
    console.log(`  Row ${index + 1}/${count}: ${opened.reason}`);

    if (opened.detailPage) {
      const detail = await extractViewDetail(opened.detailPage);
      if (listRows[index]) {
        listRows[index].caseId = detail.caseId || listRows[index].caseId;
        listRows[index].taxPeriod = detail.period || listRows[index].taxPeriod;
        listRows[index].status = detail.status || listRows[index].status;
        listRows[index].detail = { tabs: detail.tabs };
      }

      if (opened.isPopup) {
        await opened.detailPage.close().catch(() => {});
      } else {
        // Return to the list within the session (Back avoids the Access Denied
        // a fresh URL load triggers).
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1_200);
      }
    }

    // Make sure we are back on a working notices list before the next row.
    if (await isAccessDenied(page)) {
      console.log(`  Access Denied — re-opening via User Services > View Notices and Orders.`);
      await navigateToNoticesAndOrders(page);
      await clickPortalLinkByText(page, "100", "100 rows per page").catch(() => false);
      await page.waitForTimeout(600);
    }
  }

  console.log(`Finished drilling. Collected ${listRows.length} notice row(s) with detail.`);
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
async function syncRowsWithServiceRole({ clientName, extractedAt, gstin, organisationId, rows }) {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    return { insertedOrUpdated: 0, registrationId: "", skipped: true };
  }

  const noticeRows = Array.isArray(rows) ? rows : [];

  if (!noticeRows.length) {
    return { insertedOrUpdated: 0, registrationId: "", skipped: false };
  }

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

  const payload = noticeRows.map((row, index) => {
    const normalized = normalizeExtractedRow(row, index);
    return {
      ...normalized,
      case_id: normalized.case_id || normalized.ref_id || `row-${index + 1}`,
      gst_registration_id: registrationId,
      organisation_id: organisationId,
      raw_payload: row,
      scraped_at: extractedAt,
      source: "gst-portal-local-collector",
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await admin
    .from("gst_litigation_cases")
    .upsert(payload, { onConflict: "organisation_id,gst_registration_id,ref_id,case_id" });

  if (upsertError) {
    throw new Error(`Could not save litigation rows to WorkLine: ${upsertError.message}`);
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
      const rows = await collectNoticesAndOrders(page);
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
