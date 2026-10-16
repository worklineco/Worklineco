import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import XLSX from "xlsx";
import { getCollectorOutputDir, getDefaultWorkbookPath, getWorklineGstHome } from "./gst-helper-home.mjs";

const COLLECTOR_VERSION = "2026-10-14-v65-search-v34-reusefix";
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
    searchEmpty: parseBooleanFlag(args.get("search-empty")),
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
    sources: Array.isArray(payload.sources)
      ? payload.sources.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : [],
  };
}

const CDP_PORT = Number(process.env.WORKLINE_GST_CDP_PORT || 48791);
const CDP_PROFILE_DIR = path.join(WORKLINE_GST_HOME, "chrome-cdp-profile");

// Locate a real Chrome (or Edge) executable to start as a NORMAL browser.
function findBrowserExecutable() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    process.env.WORKLINE_GST_CHROME_PATH,
    path.join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
    path.join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
    localAppData ? path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe") : "",
    path.join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
    path.join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

// Is a Chrome already listening on the DevTools port we use?
async function cdpEndpointReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

// Returns a Playwright browser CONTEXT backed by the user's REAL Chrome.
//
// The GST portal's Akamai firewall returns "The requested URL was rejected" for
// any browser Playwright launches itself, because that browser runs in
// automation mode. Instead we start an ordinary Chrome process (the same
// chrome.exe the user runs by hand) with a DevTools port and ATTACH to it over
// CDP. To Akamai this is a normal Chrome, so it is trusted the same way the
// user's manual browsing is. A dedicated profile folder keeps the portal's
// trust and sign-in between runs. (Chrome blocks the DevTools port on the
// default profile, so a separate --user-data-dir is required.)
async function launchChrome() {
  let ready = await cdpEndpointReady(CDP_PORT);

  if (!ready) {
    const exe = findBrowserExecutable();
    if (!exe) {
      throw new Error(
        "Could not find Chrome or Edge. Install Chrome, or set WORKLINE_GST_CHROME_PATH to the full path of chrome.exe.",
      );
    }
    const child = spawn(
      exe,
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${CDP_PROFILE_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized",
        // Open the login page as a NORMAL Chrome navigation, so the request the
        // firewall inspects most closely is not driven by the automation
        // protocol at all.
        GST_PORTAL_LOGIN_URL,
      ],
      { detached: true, stdio: "ignore", windowsHide: false },
    );
    child.unref();

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      ready = await cdpEndpointReady(CDP_PORT);
      if (ready) {
        break;
      }
    }
  }

  if (!ready) {
    throw new Error("Chrome did not start with the DevTools port. Close any WorkLine GST Chrome window and try again.");
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] ?? (await browser.newContext({ acceptDownloads: true }));
  return context;
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
          // Type like a person: a real mouse click to focus, then character by
          // character with a small delay. The portal's firewall watches for
          // fields that get populated with no keystrokes (a dead giveaway of a
          // bot) and rejects the login, so we never use the instant fill() for
          // the sign-in fields. Fall back to fill() only if typing fails.
          await input.click({ timeout: 2_000 }).catch(() => {});
          await input.fill("").catch(() => {});
          const typed = await input
            .pressSequentially(value, { delay: 70 })
            .then(() => true)
            .catch(() => false);
          if (!typed) {
            await input.fill(value).catch(() => {});
          }
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

  // Settle the page at the top once so it stops bouncing up and down while the
  // user reads the CAPTCHA and types. Everything on the login form fits in one
  // viewport, so we never need to scroll again after this.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" })).catch(() => {});

  // Take the time you need: the login is NOT fired the instant the field has
  // enough characters. It submits only after you have STOPPED typing for a few
  // seconds, so you can type the CAPTCHA at your own pace and correct it freely.
  // The timer resets on every change, so there is never a rush once you start.
  const SETTLE_MS = 4_000;

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const input = locator.nth(index);
      const visible = await input.isVisible({ timeout: 500 }).catch(() => false);

      if (!visible) {
        continue;
      }

      // Focus WITHOUT scrolling the element into view - a plain focus() makes
      // the browser jump to the field, which is part of the up/down movement.
      await input.evaluate((element) => element.focus({ preventScroll: true })).catch(() => {});
      console.log("Focused CAPTCHA field. Type the CAPTCHA in the browser at your own pace; login submits a few seconds after you stop typing.");

      let lastValue = null;
      let stableSince = Date.now();
      while (true) {
        const value = (await input.inputValue().catch(() => "")).trim();
        if (value !== lastValue) {
          // Still typing / correcting - restart the settle timer.
          lastValue = value;
          stableSince = Date.now();
        }
        if (value.length >= 6 && Date.now() - stableSince >= SETTLE_MS) {
          console.log("CAPTCHA entered.");
          return clickGstLoginButton(page, "GST portal login button");
        }
        await page.waitForTimeout(400);
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

// Waits for the user to finish signing in BY HAND in the real Chrome window.
// Landing on an /auth/ URL (or seeing the Dashboard) means we are through. We
// let the person type the CAPTCHA and click LOGIN themselves because the
// portal's firewall rejects a login that was submitted programmatically.
async function waitForManualLogin(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const signedIn = await page
      .evaluate(() => {
        const text = document.body ? document.body.innerText : "";
        return location.href.includes("/auth/") || /dashboard/i.test(text);
      })
      .catch(() => false);
    if (signedIn) {
      console.log("Signed in. Continuing with the scrape.");
      return true;
    }
    await page.waitForTimeout(1_000);
  }
  return false;
}


async function clickPortalLinkByText(page, text, label) {
  const clicked = await page.evaluate((targetText) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = normalize(targetText);
    const matches = [...document.querySelectorAll("a,button")]
      .filter((element) => normalize(element.innerText || element.textContent) === target);
    // A visible link first - the portal keeps every menu item in the DOM at
    // all times, and clicking a hidden copy can navigate somewhere else.
    const isShown = (element) => Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    const link = matches.find(isShown) || matches[0];

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

const DASHBOARD_URL = "https://services.gst.gov.in/services/auth/dashboard";

// A REAL mouse click, exactly like v65's ActionChains: move the pointer onto
// the element (the hover is what opens the portal's dropdown menus), pause a
// second, then click with the actual mouse. A synthetic JS click on a menu
// GROUP header ("User Services" / "Ledgers") made the browser follow the
// header's own href - the Search HSN Code page - because no real hover ever
// happened; a real hover-click lets the menu script swallow the click and
// keep the dropdown open instead.
async function realClickPortalLink(page, label) {
  try {
    const link = page.locator(`a:text-is("${label}"):visible, button:text-is("${label}"):visible`).first();
    await link.waitFor({ state: "visible", timeout: 6_000 });
    await link.hover({ timeout: 5_000 });
    await page.waitForTimeout(1_000);
    await link.click({ timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// The portal stacks modals after login (Aadhaar / e-KYC, then the Principal
// Place of Business prompt), and they intercept menu clicks. Dismiss politely
// with the labels the Excel tracker used - all of them decline, none changes a
// setting - then hide whatever survives (client-side markup only).
const popupDismissLabels = ["REMIND ME LATER", "NO, THANKS", "NO THANKS", "SKIP FOR NOW", "MAYBE LATER", "CLOSE"];

async function ensureNoModal(page) {
  for (let round = 0; round < 6; round += 1) {
    const clicked = await page.evaluate((labels) => {
      const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
      for (const el of document.querySelectorAll("button, a, input[type=button], input[type=submit]")) {
        if (!(el.offsetWidth || el.offsetHeight)) {
          continue;
        }
        const text = clean(el.innerText || el.value);
        if (labels.some((label) => text.includes(label))) {
          el.click();
          return text.slice(0, 40);
        }
      }
      return "";
    }, popupDismissLabels).catch(() => "");
    if (!clicked) {
      break;
    }
    console.log(`Popup dismissed: ${clicked}.`);
    await page.waitForTimeout(1_500);
  }
  // Force-close leftovers: a lingering backdrop intercepts clicks even when
  // the dialog itself looks gone. Hides markup only - never activates "Yes".
  await page.evaluate(() => {
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.querySelectorAll(".modal, [role=dialog]").forEach((el) => {
      if (getComputedStyle(el).display !== "none" && (el.offsetWidth || el.offsetHeight)) {
        el.style.display = "none";
      }
    });
    document.body.classList.remove("modal-open");
  }).catch(() => undefined);
}

// Reaches a portal page exactly the way the firm's Excel tracker did:
// dashboard first (no breadcrumbs there, so "Services" can only be the top
// menu), clear any modal, click Services, open the group submenu - re-opening
// Services when it does not appear - then find the destination link, keep its
// own href, JS-click it, and if the click did not land NAVIGATE TO THE HREF
// DIRECTLY. Every attempt ends with a check that the destination form really
// loaded; the next attempt starts from the dashboard again.
async function goToPortalPage(page, { groupLabel, hrefFragment, itemLabel, label, ready }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`${label}: menu attempt ${attempt}/3.`);
    await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    await ensureNoModal(page);

    await realClickPortalLink(page, "Services");
    await page.waitForTimeout(2_500);

    // open_submenu: wait for the group entry (real hover + click, the v65
    // way), re-opening Services if the dropdown never appeared (4 x 6s
    // instead of one dead 25s wait).
    let groupOpen = false;
    for (let tries = 0; tries < 4 && !groupOpen; tries += 1) {
      groupOpen = await realClickPortalLink(page, groupLabel);
      if (!groupOpen) {
        console.log(`${label}: submenu not open - reopening Services (${tries + 1}/4).`);
        await realClickPortalLink(page, "Services");
        await page.waitForTimeout(2_000);
      }
    }
    await page.waitForTimeout(2_500);

    // The destination link: found by its own href first (authoritative), by
    // text second; PRESENCE is enough - keep the href, JS-click the link.
    const href = await page.evaluate(({ fragment, wanted }) => {
      const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const anchors = [...document.querySelectorAll("a")];
      const byHref = fragment ? anchors.find((a) => (a.getAttribute("href") || "").includes(fragment)) : null;
      const byText = anchors.find((a) => norm(a.innerText) === norm(wanted));
      const link = byHref || byText;
      if (!link) {
        return "";
      }
      link.scrollIntoView({ block: "center" });
      link.click();
      return link.href || "";
    }, { fragment: hrefFragment, wanted: itemLabel }).catch(() => "");

    await page.waitForTimeout(2_500);
    if (await ready()) {
      console.log(`${label}: page loaded (menu attempt ${attempt}).`);
      return true;
    }

    // Navigating straight to the link's own href, if clicking did not land.
    if (href) {
      console.log(`${label}: trying the link href directly.`);
      await page.goto(href, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await page.waitForTimeout(3_000);
      if (await ready()) {
        console.log(`${label}: page loaded (direct href).`);
        return true;
      }
    }

    const denied = await page
      .evaluate(() => /access denied/i.test(document.body ? document.body.innerText : ""))
      .catch(() => false);
    if (denied) {
      console.log(`${label}: Access Denied - resetting via the dashboard.`);
    }
  }
  console.log(`${label}: page not reachable after 3 attempts.`);
  return false;
}

// The case page's own side tabs, enumerated from what is actually rendered -
// the v65 method. Probing a fixed name list clicked already-active tabs and
// missed anything new; enumerating clicks each real tab exactly once.
const caseTabLabels = new Set([
  "INTIMATIONS", "INTIMATION", "NOTICES", "REPLIES", "REPLY", "ORDERS",
  "RECTIFICATION", "ADDITIONAL DOCUMENT", "WITHDRAWAL APPLICATION",
  "REMAND DETAILS", "APPLICATIONS", "ACK./INTIMATION", "ACK/INTIMATION",
  "ACKNOWLEDGEMENT", "REJOINDER", "PAYMENT DETAILS", "PAYMENTS",
  "PROCEEDINGS", "ADDITIONAL NOTICES AND ORDERS", "REPORT", "REPORTS",
  "APL-04 ORDERS", "APL 04 ORDERS"
]);
const caseTabPrefixes = ["ACK", "ACKNOWLEDGEMENT", "PAYMENT DETAIL", "UPLOAD OFFLINE"];

async function listCaseTabs(page) {
  const found = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("a, li, button, [role='tab'], [ng-click], [data-ng-click]")) {
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 45) {
        continue;
      }
      if (el.querySelectorAll("a, li, button").length) {
        continue; // container, not a leaf
      }
      if (!(el.offsetWidth || el.offsetHeight)) {
        continue; // not visible
      }
      const upper = text.toUpperCase();
      if (seen.has(upper)) {
        continue;
      }
      seen.add(upper);
      const classes = `${el.className || ""} ${el.parentElement ? el.parentElement.className || "" : ""}`;
      out.push({ active: /\bactive\b|\bselected\b/i.test(classes), text });
    }
    return out;
  }).catch(() => []);
  return found.filter((tab) => {
    const upper = tab.text.toUpperCase();
    return caseTabLabels.has(upper) || caseTabPrefixes.some((prefix) => upper.startsWith(prefix));
  });
}

// Cheap signature of the visible tables, used to detect a tab redraw plus
// whether data rows have landed yet.
async function caseTabState(page) {
  return page.evaluate(() => {
    let rows = 0;
    let bodyRows = 0;
    let length = 0;
    for (const table of document.querySelectorAll("table")) {
      const body = table.querySelectorAll("tbody tr");
      bodyRows += body.length;
      length += (table.innerText || "").length;
      for (const tr of body) {
        const text = (tr.innerText || "").replace(/\s+/g, " ").trim();
        if (!text || /no records? found/i.test(text)) {
          continue;
        }
        if (tr.querySelectorAll("td").length >= 2) {
          rows += 1;
        }
      }
    }
    return { fp: `${bodyRows}:${length}`, rows };
  }).catch(() => null);
}

// Clicks a side tab and waits for the panel to actually change: a fixed sleep
// is a guess - some tabs load slower (data would be missed) and empty tabs
// are known empty long before the timeout (time would be wasted). Ported
// from the Excel tracker's click_tab + wait_for_grid.
async function clickSubTab(page, name) {
  const before = await caseTabState(page);
  const clicked = await page.evaluate((label) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const candidates = [...document.querySelectorAll("a, li, button, [role='tab'], [ng-click], [data-ng-click]")]
      .filter((el) => normalize(el.innerText) === label && (el.offsetWidth || el.offsetHeight));
    // innermost match: a wrapper <li> also matches, clicking the leaf bubbles
    candidates.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
    const el = candidates[0];
    if (!el) {
      return false;
    }
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  }, name).catch(() => false);
  if (!clicked) {
    return false;
  }

  // 1. wait for the redraw
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(200);
    const now = await caseTabState(page);
    if (!before || !now || now.fp !== before.fp) {
      break;
    }
  }
  // 2. wait for rows, or for the panel to sit still (an empty tab)
  const started = Date.now();
  let last = null;
  let stableSince = Date.now();
  while (Date.now() - started < 8_000) {
    const state = await caseTabState(page);
    if (!state) {
      break;
    }
    if (state.rows > 0) {
      break;
    }
    if (state.fp !== last) {
      last = state.fp;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 1_200 && Date.now() - started >= 1_000) {
      break;
    }
    await page.waitForTimeout(200);
  }
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
      // Capture EVERY data table on the panel. The sub-tab we are on is already
      // the filter, so restricting to tables whose header matched a fixed word
      // list used to silently drop a tab's grid (e.g. NOTICES) whenever its
      // columns were worded differently. We still skip the tiny banner tables
      // (Legal Name / Trade Name, case header) below by requiring real rows.
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
  const sideTabs = await listCaseTabs(page);
  const activeTab = sideTabs.find((tab) => tab.active);

  // Only name the already-open panel when we actually know which tab is active;
  // guessing "the first tab" used to store one tab's grid under another tab's
  // name and then skip the real one (that is how NOTICES went missing).
  if (activeTab) {
    const mainTables = await captureCaseTables(page);
    if (mainTables.length) {
      const mainName = activeTab.text.toUpperCase();
      const rowTotal = mainTables.reduce((sum, table) => sum + table.rows.length, 0);
      console.log(`    Sub-tab ${mainName} (default view): ${rowTotal} row(s).`);
      tabs.push({ name: mainName, tables: mainTables });
    }
  }

  // Visit every sub-tab the page actually shows, plus the standard ones even if
  // enumeration missed them (a tab that is not in this list just won't be
  // found and is skipped). Click each (except the one already captured), and
  // retry a capture that comes back empty - the panel sometimes redraws slowly.
  const important = [
    "APPLICATIONS", "INTIMATIONS", "INTIMATION", "NOTICES", "REPLIES", "REPLY", "ORDERS",
    "RECTIFICATION", "ADDITIONAL DOCUMENT", "WITHDRAWAL APPLICATION", "REMAND DETAILS",
    "ACK./INTIMATION", "ACK/INTIMATION", "ACKNOWLEDGEMENT", "REJOINDER", "PROCEEDINGS",
  ];
  const targets = [];
  const seenTarget = new Set();
  for (const label of [...sideTabs.map((tab) => tab.text), ...important]) {
    const key = label.toUpperCase();
    if (!seenTarget.has(key)) {
      seenTarget.add(key);
      targets.push(label);
    }
  }

  for (const label of targets) {
    const name = label.toUpperCase();
    if (tabs.some((done) => done.name === name)) {
      continue; // already captured (the active default panel)
    }
    const clicked = await clickSubTab(page, label);
    if (!clicked) {
      continue;
    }
    let tables = await captureCaseTables(page);
    if (!tables.length) {
      await page.waitForTimeout(1_200);
      tables = await captureCaseTables(page);
    }
    const rowTotal = tables.reduce((sum, table) => sum + table.rows.length, 0);
    console.log(`    Sub-tab ${name}: ${rowTotal} row(s).`);
    if (tables.length) {
      tabs.push({ name, tables });
    }
  }

  // Last resort: if no tab was clickable at all, keep whatever is on screen.
  if (!tabs.length) {
    const fallback = await captureCaseTables(page);
    if (fallback.length) {
      tabs.push({ name: "DETAILS", tables: fallback });
    }
  }

  return { caseId: header.caseId, period: header.period, status: header.status, tabs };
}

// Returns to the notices list: click the "View Notices and Orders" breadcrumb,
// and if that doesn't land on the list, go the Services route again.
// How many data rows the notices list currently shows (-1 = not on the list).
async function countNoticeListRows(page) {
  return page.evaluate(() => {
    if (!/notice\s*\/?\s*demand order id/i.test(document.body ? document.body.innerText : "")) {
      return -1;
    }
    let best = 0;
    for (const table of document.querySelectorAll("table")) {
      let count = 0;
      for (const tr of table.querySelectorAll("tbody tr")) {
        if (tr.querySelectorAll("td").length >= 2 && !/no records found/i.test(tr.innerText || "")) {
          count += 1;
        }
      }
      if (count > best) {
        best = count;
      }
    }
    return best;
  }).catch(() => -1);
}

async function returnToNoticesList(page, expectedRows = 0) {
  // Already on the list with the rows intact? Nothing to do - the old flow
  // re-clicked the breadcrumb and "100 rows per page" after EVERY row, which
  // forced a pointless re-render each time.
  let rows = await countNoticeListRows(page);
  if (rows > 0 && (!expectedRows || rows >= expectedRows)) {
    return;
  }

  await clickPortalLinkByText(page, "View Notices and Orders", "View Notices and Orders (breadcrumb)").catch(() => false);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await page.waitForTimeout(400);
    rows = await countNoticeListRows(page);
    if (rows >= 0) {
      break;
    }
  }

  if (rows < 0) {
    await goToPortalPage(page, {
      groupLabel: "User Services",
      hrefFragment: "auth/viewnotice",
      itemLabel: "View Notices and Orders",
      label: "Notices & Orders (return)",
      ready: async () => (await countNoticeListRows(page)) >= 0
    });
    rows = await countNoticeListRows(page);
  }

  // Reapply the page size only when it actually reverted - the subtle failure
  // is a non-empty 10-row table that silently stops the drill at row 10.
  if (expectedRows && rows >= 0 && rows < expectedRows) {
    await clickPortalLinkByText(page, "100", "100 rows per page").catch(() => false);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await page.waitForTimeout(400);
      rows = await countNoticeListRows(page);
      if (rows >= expectedRows) {
        break;
      }
    }
  }
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

// dd/mm/yyyy -> UTC millis, for comparing window boundaries.
function dmyToUtc(dmy) {
  const [d, m, y] = String(dmy || "").split("/").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

// Appeal / SPL "empty window" memory. The My Applications search is run in
// 90-day windows; most come back with no records. We remember the windows that
// returned nothing (per application type, per GSTIN) so later runs skip them,
// unless the user asks to re-check them. The file lives next to the scrape
// output so it travels with the helper.
function emptyWindowsFile(outputDir, gstin) {
  return path.join(outputDir, `application-empty-windows-${String(gstin || "").trim().toUpperCase()}.json`);
}

async function loadEmptyWindows(outputDir, gstin) {
  try {
    const raw = await fs.readFile(emptyWindowsFile(outputDir, gstin), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveEmptyWindows(outputDir, gstin, store) {
  try {
    await fs.writeFile(emptyWindowsFile(outputDir, gstin), `${JSON.stringify(store, null, 2)}\n`, "utf8");
  } catch (error) {
    console.log(`Could not save empty-window memory: ${error.message}`);
  }
}

// Services > User Services > My Applications.
async function goToMyApplications(page) {
  const reached = await goToPortalPage(page, {
    groupLabel: "User Services",
    hrefFragment: "litserv/auth/case/search",
    itemLabel: "My Applications",
    label: "My Applications",
    // #up_type is the application-type dropdown - the one element that only
    // the real My Applications search form has.
    ready: async () => (await page.locator("#up_type").count().catch(() => 0)) > 0
  });
  if (!reached) {
    return false;
  }
  // The page is up; give Angular a moment to fill the type dropdown.
  for (let poll = 0; poll < 20; poll += 1) {
    if (await page.locator("#up_type option").count().catch(() => 0)) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return true;
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

// Writes one date into a My Applications picker field THE v65 WAY. Setting
// the DOM value is not enough: these inputs are driven by a datepicker
// widget, and the AngularJS ng-model can stay EMPTY while the field looks
// right - the search then runs with no dates and returns nothing. v65 hit and
// documented exactly this, and fixed it by pushing the value into the ngModel
// controller itself and verifying it stuck (sync_angular_model).
async function setAngularDate(page, names, value) {
  return page.evaluate(({ names: wanted, value: dmy }) => {
    let el = null;
    for (const name of wanted) {
      el = document.querySelector(`[name='${name}']`) || document.getElementById(name);
      if (el && (el.offsetWidth || el.offsetHeight)) {
        break;
      }
      el = null;
    }
    if (!el) {
      return "no-field";
    }
    el.removeAttribute("readonly");
    el.value = dmy;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    try {
      if (window.angular) {
        const ngEl = window.angular.element(el);
        const ctrl = ngEl.controller("ngModel");
        if (ctrl) {
          if (String(ctrl.$viewValue ?? "").trim() !== dmy) {
            ctrl.$setViewValue(dmy);
            ctrl.$render();
            const scope = ngEl.scope();
            if (scope && !scope.$$phase) {
              scope.$apply();
            }
          }
          const view = String(ctrl.$viewValue ?? "").trim();
          if (view !== dmy) {
            return `model-not-set:${view}`;
          }
        }
      }
    } catch (error) {
      return `model-error:${String(error).slice(0, 60)}`;
    }
    return "ok";
  }, { names, value }).catch(() => "error");
}

async function setApplicationDates(page, from, to) {
  const fromResult = await setAngularDate(page, ["fromdate", "fmdt", "from_date"], from);
  const toResult = await setAngularDate(page, ["todate", "todt", "to_date"], to);
  if (fromResult !== "ok" || toResult !== "ok") {
    console.log(`  Date fields ${from}-${to}: from=${fromResult} to=${toResult}.`);
  }
  // Blur the picker so its popup closes before Search is clicked (v65 does
  // the same; an open calendar intercepts the Search click).
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }).catch(() => undefined);
  await page.waitForTimeout(800);
  return fromResult === "ok" && toResult === "ok";
}

async function clickApplicationSearch(page) {
  return page.evaluate(() => {
    const up = (value) => String(value ?? "").toUpperCase();
    const isShown = (el) => Boolean(el.offsetWidth || el.offsetHeight);
    // v65's order: BUTTONS first, anchors second, submit inputs last. The
    // page header's "Search Taxpayer" menu LINK also contains "SEARCH" and
    // sits earlier in the DOM - scanning buttons and links together clicked
    // that link, navigated away from the form, and left every later window
    // with no date fields (the exact "no-field" trail in the log).
    const groups = [
      [...document.querySelectorAll("button")].filter((el) => up(el.innerText).includes("SEARCH")),
      [...document.querySelectorAll("a")].filter((el) => up(el.innerText).includes("SEARCH")),
      [...document.querySelectorAll("input[type=submit]")],
      [...document.querySelectorAll("button[type=submit]")]
    ];
    for (const group of groups) {
      const el = group.find(isShown);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);
}

// ---------------------------------------------------------------------------
// Waiting for a search response, the v65 way. Waiting for "rows appear" is
// wrong in BOTH directions: an empty window burns the whole timeout, and the
// PREVIOUS search's rows still in the DOM read as a hit before the response
// has even arrived (that is how a type inherits another type's results). So
// completed XHRs are counted instead: the search is done when the count moves
// and Angular's $http queue is idle.

async function installXhrCounter(page) {
  return page.evaluate(() => {
    if (!window.__gst) {
      window.__gst = { done: 0 };
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (...args) {
        try {
          this.addEventListener("loadend", () => {
            window.__gst.done += 1;
          });
        } catch {
          // counting only - never let the hook break the page's own XHR
        }
        return send.apply(this, args);
      };
    }
    return window.__gst.done;
  }).catch(() => null);
}

async function waitForSearchResponse(page, before, timeoutMs = 20_000) {
  if (before === null || before === undefined) {
    return { hooked: false };
  }
  const deadline = Date.now() + timeoutMs;
  let landed = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      let pending = -1;
      try {
        if (window.angular) {
          pending = window.angular.element(document.body).injector().get("$http").pendingRequests.length;
        }
      } catch {
        pending = -1;
      }
      return { done: window.__gst ? window.__gst.done : null, pending };
    }).catch(() => null);
    if (!state || state.done === null || state.done < before) {
      // the page navigated and took the hook with it
      return { hooked: false, navigated: true };
    }
    if (state.done > before) {
      landed = true;
      if ((state.pending ?? -1) <= 0) {
        await page.waitForTimeout(400); // let the $digest paint the table
        return { hooked: true, responded: true };
      }
    }
    await page.waitForTimeout(150);
  }
  return { hooked: true, responded: landed, timeout: true };
}

// One search cycle: dates in (model-verified), counter armed, Search clicked,
// response awaited, rows read only when the portal actually answered.
async function runApplicationSearch(page, from, to) {
  await setApplicationDates(page, from, to);
  const before = await installXhrCounter(page);
  if (!(await clickApplicationSearch(page))) {
    console.log(`  ${from}-${to}: search button not found.`);
    return { responded: false, rows: [] };
  }
  const outcome = await waitForSearchResponse(page, before);
  if (outcome.hooked && !outcome.responded) {
    console.log(`  ${from}-${to}: the portal did not answer - ignoring stale rows.`);
    return { responded: false, rows: [] };
  }
  if (!outcome.hooked) {
    await page.waitForTimeout(2_500); // hook unavailable; the old fixed wait
  }
  return { responded: true, rows: await extractAppealResultRows(page) };
}

// Reads the application result rows (skips "No Records Found").
// Reads the My Applications results grid by its column headers, the same way
// the firm's Excel tracker did: every application comes back as named fields
// (ARN, filing date, status, and the order it was filed against) instead of
// an unlabeled list of cells. The order number is what makes an appeal
// traceable to the demand it contests.
async function extractAppealResultRows(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const normalize = (value) => clean(value).replace(/[.:#*]/g, "").trim().toLowerCase();
    const isVisible = (node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);

    const fieldFor = (header) => {
      const name = normalize(header);
      if (!name) {
        return null;
      }
      if (name === "arn" || name.includes("application reference")) {
        return "arn";
      }
      if (name.includes("against") || (name.includes("order") && (name.includes("no") || name.includes("number") || name.includes("id")))) {
        return "orderNo";
      }
      if (name.includes("date")) {
        return "filedOn";
      }
      if (name.includes("status")) {
        return "status";
      }
      if (name.includes("type") || name.includes("category") || name.includes("description") || name.includes("form")) {
        return "kind";
      }
      return null;
    };

    // Choose the visible table whose headers map best to the fields above.
    let best = null;
    let bestScore = 0;
    for (const table of document.querySelectorAll("table")) {
      if (!isVisible(table)) {
        continue;
      }
      const headerRow = table.tHead ? table.tHead.rows[0] : table.querySelector("tr");
      if (!headerRow) {
        continue;
      }
      const headers = [...headerRow.cells].map((cell) => clean(cell.innerText));
      const score = headers.map(fieldFor).filter(Boolean).length;
      if (score > bestScore) {
        bestScore = score;
        best = { headers, table };
      }
    }
    if (!best) {
      return [];
    }

    const fields = best.headers.map(fieldFor);
    const out = [];
    for (const body of best.table.tBodies) {
      for (const tr of body.rows) {
        const cells = [...tr.cells].map((td) => clean(td.innerText || td.textContent));
        if (cells.length < 2 || !cells.some(Boolean)) {
          continue;
        }
        if (/no records found/i.test(cells.join(" "))) {
          continue;
        }
        const record = { arn: "", cells, filedOn: "", kind: "", orderNo: "", status: "" };
        fields.forEach((field, index) => {
          if (field && !record[field] && cells[index]) {
            record[field] = cells[index];
          }
        });
        const anchor = tr.querySelector("a");
        if (!record.arn) {
          record.arn = clean(anchor?.innerText || anchor?.textContent || cells[0]);
        }
        out.push(record);
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

// Applications already absorbed in this run, across ALL types - an ARN seen
// under Appeal must not be re-absorbed when a stale row survives into the
// SPL searches (v65 dedupes against its global APPLICATIONS list this way).
const harvestedApplicationKeys = new Set();

// Searches My Applications for a given application type across 90-day windows,
// then drills into each application's case page and captures its sub-tabs.
// Pulls the order number an appeal is filed against out of its Case Details.
// On the Applications tab the portal shows "Order Under Appeal - Assessment
// Demand Order" with the order's document, whose name carries the order number
// (e.g. DRC07_ORDER_ZD080224058591E_...). We return that ZD number so the
// tracker can link the appeal to the order's case.
function extractOrderUnderAppeal(detail) {
  const orderPattern = /ZD\d{8,}[A-Z0-9]*/g;
  for (const tab of detail?.tabs ?? []) {
    for (const table of tab.tables ?? []) {
      const blob = [...(table.headers ?? []), ...(table.rows ?? []).flat()].join(" ");
      if (!/order under appeal|assessment demand order|order under rectification/i.test(blob)) {
        continue;
      }
      const matches = blob.toUpperCase().match(orderPattern);
      if (matches && matches.length) {
        return matches[0];
      }
    }
  }
  return "";
}

async function collectApplications(page, appType, startDmy, options = {}) {
  const { gstin = "", outputDir = OUTPUT_DIR, searchEmpty = false } = options;
  console.log(`Applications (${appType}): navigating to Services > User Services > My Applications.`);
  const reached = await goToMyApplications(page);
  if (!reached) {
    console.log(`Applications (${appType}): My Applications page not reachable — skipping.`);
    return [];
  }

  await selectAppealType(page, appType);
  // Start the 90-day windows from the earliest notice this run has seen
  // instead of July 2017 - an application cannot predate the proceedings it
  // belongs to, and this turns ~38 searches into a handful for most clients.
  const startFrom = startDmy || APPEAL_START_DATE;
  // Build the windows on a FIXED grid from 01/07/2017 and drop the ones that
  // end before the earliest notice. Fixing the grid keeps each window's
  // from|to key stable between runs, which is what the empty-window memory
  // below is keyed on - otherwise a shifting start date would never match a
  // remembered window.
  const startBound = dmyToUtc(startFrom);
  const gridWindows = buildDateWindows(APPEAL_START_DATE, APPEAL_WINDOW_DAYS).filter(
    ([, to]) => dmyToUtc(to) >= startBound
  );

  // Remembered empty windows for this application type: skip them unless the
  // user asked (via the Get data popup) to re-check the known-empty ranges.
  const emptyStore = await loadEmptyWindows(outputDir, gstin);
  const emptySet = new Set(Array.isArray(emptyStore[appType]) ? emptyStore[appType] : []);
  const windows = searchEmpty ? gridWindows : gridWindows.filter(([from, to]) => !emptySet.has(`${from}|${to}`));
  const skipped = gridWindows.length - windows.length;
  console.log(
    `Applications (${appType}): ${gridWindows.length} window(s) of ${APPEAL_WINDOW_DAYS} days from ${startFrom}. ${
      searchEmpty ? "Re-checking all ranges" : `Skipping ${skipped} previously-empty window(s)`
    }.`
  );

  const found = [];
  for (const [from, to] of windows) {
    const { rows } = await runApplicationSearch(page, from, to);
    // Update the memory: a window that returned nothing is remembered as empty
    // (skipped next time); one that now has rows is cleared from the memory.
    const windowKey = `${from}|${to}`;
    if (rows.length === 0) {
      emptySet.add(windowKey);
    } else {
      emptySet.delete(windowKey);
    }
    let fresh = 0;
    for (const row of rows) {
      const key = row.arn || row.cells.join("|");
      // The dedupe set spans ALL application types (v65's absorb rule): rows
      // still on screen from the previous type's last search would otherwise
      // be absorbed again as this type's results.
      if (!harvestedApplicationKeys.has(key)) {
        harvestedApplicationKeys.add(key);
        found.push({ arn: row.arn, cells: row.cells, filedOn: row.filedOn, from, kind: row.kind, orderNo: row.orderNo, status: row.status, to });
        fresh += 1;
      }
    }
    if (rows.length) {
      console.log(`  ${from}-${to}: ${rows.length} row(s) on screen, ${fresh} new.`);
    }
  }

  // Persist the updated empty-window memory for next time.
  emptyStore[appType] = [...emptySet];
  await saveEmptyWindows(outputDir, gstin, emptyStore);

  console.log(`Applications (${appType}): ${found.length} unique application(s) found. Opening each...`);

  const results = [];
  for (let index = 0; index < found.length; index += 1) {
    const app = found[index];
    if (!(await page.locator("#up_type").count().catch(() => 0))) {
      await returnToMyApplications(page);
    }
    await selectAppealType(page, appType);
    // Re-search the exact window that returned this application - that window
    // is KNOWN to return it (v65's drill-down rule).
    await runApplicationSearch(page, app.from, app.to);

    const opened = await openAppealRow(page, app.arn);
    console.log(`  ${appType} ${index + 1}/${found.length} ${app.arn}: ${opened ? "opened" : "not opened"}`);
    if (opened) {
      const detail = await extractCaseDetail(page);
      const dateCell = app.filedOn || app.cells.find((cell) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell)) || "";
      // The order the appeal is filed against: its number (e.g. ZD080224058591E)
      // sits in the "Order Under Appeal" row of the Applications tab. Capturing
      // it lets the tracker fold this appeal under that order's case.
      const orderUnderAppeal = extractOrderUnderAppeal(detail);
      if (orderUnderAppeal) {
        console.log(`    Order under appeal: ${orderUnderAppeal}`);
      }
      results.push({
        againstOrderNo: orderUnderAppeal || app.orderNo || "",
        caseId: detail.caseId || app.arn,
        dateOfIssue: dateCell,
        description: app.kind || app.cells.slice(1).find(Boolean) || "",
        detail: { tabs: detail.tabs },
        refId: app.arn,
        replyFiling: "",
        section: "",
        sNo: "",
        status: detail.status || app.status || "",
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
// ---------------------------------------------------------------------------
// Payment towards Demand (Services > Ledgers > Payment towards Demand).
// Ported from the firm's Excel tracker (v65): the outstanding-demand grid is
// read by its column headers across every pager page, and each non-zero tax
// head's blue amount link is opened so the Tax / Interest / Penalty / Fee /
// Others breakup comes along. Anything that does not parse cleanly is kept as
// a problem note on the row rather than silently becoming a zero.

const DEMAND_TAX_HEADS = ["Integrated Tax", "Central Tax", "State/UT Tax", "Cess"];
const DEMAND_BREAKUP_FIELDS = ["Tax", "Interest", "Penalty", "Fee", "Others", "Total"];
const MAX_DEMAND_PAGES = 20;

function demandHeaderIndex(headers, ...names) {
  const low = headers.map((header) => String(header || "").toLowerCase());
  for (const name of names) {
    const exact = low.indexOf(name.toLowerCase());
    if (exact >= 0) {
      return exact;
    }
  }
  for (const name of names) {
    const loose = low.findIndex((header) => header.includes(name.toLowerCase()));
    if (loose >= 0) {
      return loose;
    }
  }
  return -1;
}

// "5,00,911" -> 500911 ; "" / "-" / "NA" -> 0 ; anything else -> null so the
// row is flagged instead of a guessed figure landing in a money column.
function demandAmountValue(text) {
  const trimmed = String(text ?? "").replace(/₹/g, "").trim();
  if (["", "-", "--", "NA", "N/A"].includes(trimmed)) {
    return 0;
  }
  const plain = trimmed.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) {
    return null;
  }
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

// One round trip returns the whole grid: headers, every cell's text, and per
// cell whether it holds the blue amount link plus which tax head that link
// names in its own ng-click (authoritative - column order cannot drift).
// GST renders ONE TBODY PER DEMAND, so all tBodies are walked, not just the
// first.
async function readDemandGrid(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const tables = [...document.querySelectorAll("table")];
    const grid = tables.find((table) => ((table.tHead ? table.tHead.innerText : "").toLowerCase().includes("demand id")));
    if (!grid) {
      return null;
    }
    const headers = [];
    const headerRow = grid.tHead ? grid.tHead.rows[0] : null;
    if (headerRow) {
      for (const cell of headerRow.cells) {
        headers.push(clean(cell.innerText));
      }
    }
    const amountSelector = 'a[data-ng-click^="openModal"], a[ng-click^="openModal"]';
    const headOf = (link) => {
      const attr = link.getAttribute("data-ng-click") || link.getAttribute("ng-click") || "";
      const match = attr.match(/openModal\([^,]*,\s*'([^']+)'/);
      return match ? match[1] : "";
    };
    const rows = [];
    let index = 0;
    for (const body of grid.tBodies) {
      for (const tr of body.rows) {
        if (!tr.offsetWidth && !tr.offsetHeight) {
          continue;
        }
        const cells = [...tr.cells].map((td) => {
          const link = td.querySelector(amountSelector);
          return { clickable: Boolean(link), head: link ? headOf(link) : "", text: clean(td.innerText) };
        });
        rows.push({ cells, index });
        index += 1;
      }
    }
    return { headers, rows };
  }).catch(() => null);
}

async function readDemandModal(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    for (const modal of document.querySelectorAll(".modal, [role=dialog]")) {
      if (getComputedStyle(modal).display === "none" || !(modal.offsetWidth || modal.offsetHeight)) {
        continue;
      }
      const titleEl = modal.querySelector(".modal-title, h3, h4, h2");
      const table = modal.querySelector("table");
      if (!table || table.rows.length < 2) {
        continue;
      }
      // This popup can put both the header row and the value row inside
      // <thead> with no <tbody> at all - so headers come from row 0 and the
      // values from the first tbody row when present, else row 1.
      const headers = [...table.rows[0].cells].map((cell) => clean(cell.innerText));
      const valueRow = table.tBodies.length && table.tBodies[0].rows.length ? table.tBodies[0].rows[0] : table.rows[1];
      const values = [...valueRow.cells].map((cell) => clean(cell.innerText));
      return { headers, title: titleEl ? clean(titleEl.innerText) : "", values };
    }
    return null;
  }).catch(() => null);
}

async function waitForDemandModal(page, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const modal = await readDemandModal(page);
    if (modal && modal.values && modal.values.length) {
      return modal;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

async function closeDemandModal(page) {
  await page.evaluate(() => {
    for (const modal of document.querySelectorAll(".modal, [role=dialog]")) {
      if (getComputedStyle(modal).display === "none" || !(modal.offsetWidth || modal.offsetHeight)) {
        continue;
      }
      const close = modal.querySelector(".close, [data-dismiss=modal], button.close, .modal-header button");
      if (close) {
        close.click();
        return;
      }
    }
  }).catch(() => undefined);
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (!(await readDemandModal(page))) {
      return;
    }
    await page.waitForTimeout(200);
  }
  // Last resort: hide leftover client-side markup so the next click lands.
  await page.evaluate(() => {
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.querySelectorAll(".modal, [role=dialog]").forEach((el) => {
      if (getComputedStyle(el).display !== "none") {
        el.style.display = "none";
      }
    });
    document.body.classList.remove("modal-open");
  }).catch(() => undefined);
  await page.waitForTimeout(400);
}

// Located fresh on every click: Angular re-renders the grid after a popup
// closes, so a handle kept from before the popup is stale.
async function clickDemandAmount(page, rowIndex, colIndex) {
  return page.evaluate(({ col, row }) => {
    const grid = [...document.querySelectorAll("table")].find((table) =>
      ((table.tHead ? table.tHead.innerText : "").toLowerCase().includes("demand id"))
    );
    if (!grid) {
      return "no-grid";
    }
    const rows = [];
    for (const body of grid.tBodies) {
      for (const tr of body.rows) {
        if (tr.offsetWidth || tr.offsetHeight) {
          rows.push(tr);
        }
      }
    }
    const tr = rows[row];
    if (!tr) {
      return "no-row";
    }
    const td = tr.cells[col];
    if (!td) {
      return "no-cell";
    }
    const link = td.querySelector('a[data-ng-click^="openModal"], a[ng-click^="openModal"]');
    if (!link) {
      return "not-clickable";
    }
    const attr = link.getAttribute("data-ng-click") || link.getAttribute("ng-click") || "";
    const match = attr.match(/openModal\([^,]*,\s*'([^']+)'/);
    link.scrollIntoView({ block: "center" });
    link.click();
    return `ok:${match ? match[1] : ""}`;
  }, { col: colIndex, row: rowIndex }).catch((error) => `error: ${String(error && error.message).slice(0, 80)}`);
}

// The Demand IDs on screen - changing IDs is the only proof the page turned.
async function demandFingerprint(page) {
  const grid = await readDemandGrid(page);
  if (!grid) {
    return "";
  }
  const idIndex = demandHeaderIndex(grid.headers, "Demand ID", "Demand Id");
  if (idIndex < 0) {
    return "";
  }
  return grid.rows.map((row) => (row.cells[idIndex] ? row.cells[idIndex].text : "")).join("|");
}

// Scoped to the grid's own pager - an unscoped sweep for numeric links also
// finds the language list, the footer and the breadcrumb.
const DEMAND_PAGER_SELECTOR = "ul.ng-table-pagination a.page-link, ul.pagination a.page-link, .ng-table-pager a";

async function demandPageNumbers(page) {
  const numbers = await page.evaluate((selector) => {
    const out = [];
    for (const link of document.querySelectorAll(selector)) {
      const text = (link.innerText || "").trim();
      if (/^[0-9]+$/.test(text)) {
        out.push(Number.parseInt(text, 10));
      }
    }
    return out;
  }, DEMAND_PAGER_SELECTOR).catch(() => []);
  return [...new Set(numbers.filter((n) => n >= 1 && n <= MAX_DEMAND_PAGES))].sort((a, b) => a - b);
}

async function goToDemandPage(page, number) {
  const before = await demandFingerprint(page);
  const result = await page.evaluate(({ selector, wanted }) => {
    for (const link of document.querySelectorAll(selector)) {
      const text = (link.innerText || "").replace(/\s+/g, " ").trim();
      if (text !== String(wanted)) {
        continue;
      }
      const item = link.closest ? link.closest("li") : null;
      const classes = `${link.className || ""} ${item ? item.className : ""}`.toLowerCase();
      if (classes.includes("disabled")) {
        return "disabled";
      }
      if (!link.offsetWidth && !link.offsetHeight) {
        continue;
      }
      link.scrollIntoView({ block: "center" });
      link.click();
      return "ok";
    }
    return "not-found";
  }, { selector: DEMAND_PAGER_SELECTOR, wanted: number }).catch(() => "error");
  if (result !== "ok") {
    console.log(`Payment towards Demand: page ${number}: ${result}.`);
    return false;
  }
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.waitForTimeout(400);
    const now = await demandFingerprint(page);
    if (now && now !== before) {
      return true;
    }
  }
  console.log(`Payment towards Demand: clicked page ${number} but the rows did not change.`);
  return false;
}

async function harvestDemandPage(page, pageNo, demands) {
  const grid = await readDemandGrid(page);
  if (!grid || !grid.headers.length) {
    console.log(`Payment towards Demand: no demand grid on page ${pageNo}.`);
    return 0;
  }

  const idIndex = demandHeaderIndex(grid.headers, "Demand ID", "Demand Id");
  const dateIndex = demandHeaderIndex(grid.headers, "Demand Date", "Date");
  if (idIndex < 0) {
    console.log(`Payment towards Demand: Demand ID column missing (${grid.headers.join(", ")}).`);
    return 0;
  }
  const headColumns = {};
  for (const head of DEMAND_TAX_HEADS) {
    headColumns[head] = demandHeaderIndex(grid.headers, head);
  }

  console.log(`Payment towards Demand: page ${pageNo}: ${grid.rows.length} demand(s).`);
  let count = 0;

  for (const row of grid.rows) {
    const cellText = (index) => (index >= 0 && index < row.cells.length ? row.cells[index].text : "");
    const demandId = cellText(idIndex);
    if (!demandId) {
      continue;
    }

    // Prefer the column each amount link declares in its own ng-click over
    // the column the header happened to sit in.
    const byAttr = {};
    row.cells.forEach((cell, index) => {
      if (cell.head) {
        byAttr[cell.head] = index;
      }
    });

    const record = { demandDate: cellText(dateIndex), demandId, grandTotal: 0, heads: {}, problems: [] };

    for (const head of DEMAND_TAX_HEADS) {
      const col = byAttr[head] ?? headColumns[head] ?? -1;
      const shown = col >= 0 ? cellText(col) : "";
      let amount = demandAmountValue(shown);
      if (amount === null) {
        record.problems.push(`${head}: grid amount unreadable (${shown})`);
        amount = 0;
      }
      if (amount !== 0 || shown) {
        record.heads[head] = { Amount: amount };
      }
      record.grandTotal += amount;

      const clickable = col >= 0 && col < row.cells.length ? row.cells[col].clickable : false;
      if (amount === 0 || !clickable) {
        if (amount !== 0 && !clickable) {
          record.problems.push(`${head}: ${shown} is not clickable`);
        }
        continue;
      }

      console.log(`Payment towards Demand: breakup ${demandId} - ${head} (${shown}).`);
      const clickResult = await clickDemandAmount(page, row.index, col);
      if (!String(clickResult).startsWith("ok")) {
        record.problems.push(`${head}: could not click amount (${clickResult})`);
        continue;
      }
      const clickedHead = String(clickResult).slice(3);
      if (clickedHead && clickedHead !== head) {
        record.problems.push(`${head}: clicked the ${clickedHead} link instead`);
        await closeDemandModal(page);
        continue;
      }

      await page.waitForTimeout(400);
      const modal = await waitForDemandModal(page);
      if (!modal) {
        record.problems.push(`${head}: breakup popup never appeared`);
        await closeDemandModal(page);
        continue;
      }

      // The popup title names its head - verify this is not a leftover popup.
      const title = (modal.title || "").toLowerCase();
      if (title && !title.includes(head.split("/")[0].toLowerCase())) {
        record.problems.push(`${head}: popup title says ${modal.title}`);
        await closeDemandModal(page);
        continue;
      }

      for (const field of DEMAND_BREAKUP_FIELDS) {
        const fieldIndex = demandHeaderIndex(modal.headers, field);
        if (fieldIndex < 0 || fieldIndex >= modal.values.length) {
          continue;
        }
        const value = demandAmountValue(modal.values[fieldIndex]);
        if (value === null) {
          record.problems.push(`${head} ${field}: unreadable (${modal.values[fieldIndex]})`);
          continue;
        }
        if (field !== "Total") {
          record.heads[head][field] = value;
        } else if (Math.abs(value - amount) > 0.51) {
          // the popup Total must equal the figure printed in the grid
          record.problems.push(`${head}: popup total ${value} != grid ${amount}`);
        }
      }

      await closeDemandModal(page);
      await page.waitForTimeout(900);
    }

    demands.push(record);
    count += 1;
  }

  return count;
}

async function collectPaymentTowardsDemand(page) {
  console.log("Payment towards Demand: navigating to Services > Ledgers > Payment towards Demand.");
  await waitForAuthenticatedPortal(page);
  const opened = await goToPortalPage(page, {
    groupLabel: "Ledgers",
    hrefFragment: "paymenttowardsdemand",
    itemLabel: "Payment towards Demand",
    label: "Payment towards Demand",
    // the outstanding-demand grid, identified by its own header
    ready: async () => (await readDemandGrid(page)) !== null
  });
  if (!opened) {
    console.log("Payment towards Demand: page not reachable — skipping.");
    return [];
  }
  await page.waitForTimeout(1_000);

  await logVisibleTableHeaders(page);

  const demands = [];
  let taken = await harvestDemandPage(page, 1, demands);

  const pages = await demandPageNumbers(page);
  console.log(`Payment towards Demand: pages found: ${pages.length ? pages.join(", ") : "[single page]"}.`);
  for (const number of pages.filter((n) => n > 1)) {
    if (!(await goToDemandPage(page, number))) {
      break;
    }
    await page.waitForTimeout(1_000);
    taken += await harvestDemandPage(page, number, demands);
  }

  console.log(`Payment towards Demand: captured ${taken} demand row(s).`);
  const flagged = demands.filter((demand) => demand.problems.length);
  if (flagged.length) {
    console.log(`Payment towards Demand: ${flagged.length} row(s) carry a check note.`);
  }

  return demands.map((demand) => ({
    caseId: demand.demandId,
    dateOfIssue: "",
    demandAmount: String(demand.grandTotal),
    demandBreakup: demand.heads,
    demandDate: demand.demandDate,
    demandProblems: demand.problems,
    description: "Payment towards Demand",
    detail: { tabs: [] },
    refId: demand.demandId,
    replyFiling: "",
    section: "",
    sNo: "",
    status: "",
    taxPeriod: "",
    typeOfNotice: "Demand"
  }));
}

// Categories and descriptions with no case page worth opening - Registration
// and Return-Default notices, and rows whose View only holds a PDF. Matched
// as lowercase substrings against Type + Description, same as the firm's
// Excel tracker did.
const skipDetailDescriptions = [
  "summary order",
  "notice for itc mismatch",
  "drc-01c",
  "notice to return defaulter"
];

function skipDetailReason(row) {
  const blob = `${row.typeOfNotice || ""} ${row.description || ""}`.toLowerCase();
  if (blob.includes("registration certificate") || blob.includes("amendment")) {
    return "Registration";
  }
  if (blob.includes("return defaulter") || blob.includes("not filing return")) {
    return "Return Default";
  }
  for (const text of skipDetailDescriptions) {
    if (blob.includes(text)) {
      return `PDF-only: ${text}`;
    }
  }
  return "";
}

// Services > User Services > View Notices and Orders, show 100 rows, read the
// list, then open each View one by one to capture its Case Details.
async function collectNoticesAndOrders(page) {
  await waitForAuthenticatedPortal(page);

  const reachedNotices = await goToPortalPage(page, {
    groupLabel: "User Services",
    hrefFragment: "auth/viewnotice",
    itemLabel: "View Notices and Orders",
    label: "Notices & Orders",
    ready: async () => (await countNoticeListRows(page)) >= 0
  });
  if (!reachedNotices) {
    console.log("Notices & Orders: list not reachable — skipping.");
    return [];
  }

  await clickPortalLinkByText(page, "100", "100 rows per page");
  await page.waitForTimeout(1_500);

  await logVisibleTableHeaders(page);
  const listRows = await extractNoticeTableRows(page);
  console.log(`Main table: ${listRows.length} row(s). Opening each View one by one...`);

  // Siblings share a case page: once a case is drilled, every other list row
  // whose reference that page mentions is served from memory instead of
  // reopening the same page (~a third of all drills on real data). Ported
  // from the Excel tracker, with its poisoning guards: a page with no Case ID
  // is never cached, and a "case page" mentioning more than 25 known notices
  // is the list page itself, not a case.
  const caseCache = new Map();
  const knownIds = new Set(listRows.map((row) => String(row.refId || "").trim()).filter(Boolean));
  let reused = 0;

  for (let index = 0; index < listRows.length; index += 1) {
    // Some rows have nothing worth drilling (ported from the firm's Excel
    // tracker): Registration and Return-Default notices land back on the list
    // page or a page with no grid, and a few descriptions only carry a PDF
    // behind View - no case page, no tabs. Skipping them keeps the row but
    // saves most of the runtime.
    const skipReason = skipDetailReason(listRows[index]);
    if (skipReason) {
      console.log(`  Row ${index + 1}/${listRows.length}: detail skipped (${skipReason})`);
      continue;
    }

    const ownRef = String(listRows[index].refId || "").trim();
    const cached = ownRef ? caseCache.get(ownRef) : null;
    if (cached) {
      listRows[index].caseId = cached.caseId || listRows[index].caseId;
      listRows[index].taxPeriod = cached.period || listRows[index].taxPeriod;
      listRows[index].status = cached.status || listRows[index].status;
      listRows[index].detail = { tabs: cached.tabs };
      reused += 1;
      console.log(`  Row ${index + 1}/${listRows.length}: reused case page (${cached.caseId})`);
      continue;
    }

    const opened = await openCaseDetail(page, index);
    console.log(`  Row ${index + 1}/${listRows.length}: ${opened ? "opened case details" : "no detail page"}`);

    if (opened) {
      const detail = await extractCaseDetail(page);
      listRows[index].caseId = detail.caseId || listRows[index].caseId;
      listRows[index].taxPeriod = detail.period || listRows[index].taxPeriod;
      listRows[index].status = detail.status || listRows[index].status;
      listRows[index].detail = { tabs: detail.tabs };

      // Cache this case page against every known notice it mentions.
      if (detail.caseId) {
        const siblings = new Set();
        for (const tab of detail.tabs) {
          for (const table of tab.tables) {
            for (const cells of table.rows) {
              for (const cell of cells) {
                const value = String(cell).trim();
                if (knownIds.has(value)) {
                  siblings.add(value);
                }
              }
            }
          }
        }
        if (siblings.size > 25) {
          console.log(`    Not caching ${detail.caseId}: page mentions ${siblings.size} notices - looks like the list page.`);
        } else {
          for (const sibling of siblings) {
            if (!caseCache.has(sibling)) {
              caseCache.set(sibling, detail);
            }
          }
        }
      }
    }

    await returnToNoticesList(page, listRows.length);
  }

  if (reused) {
    console.log(`Case pages reused from cache: ${reused}.`);
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

  // Supabase caps a single response at 1,000 rows, so page through the whole
  // Client Records register. A single .limit(5000) silently stopped at 1,000,
  // which made clients past that point look missing (the collector then failed
  // with "No client in Client Records has GSTIN ...").
  let match = null;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("clients")
      .select("name,organisation_id,custom_values")
      .eq("custom_values->>source", CLIENT_RECORDS_SOURCE)
      .order("id", { ascending: true })
      .range(from, from + 999);

    if (error) {
      throw new Error(`Could not read Client Records from WorkLine: ${error.message}`);
    }

    const page = data ?? [];
    match = page.find((row) => {
      const values = row.custom_values ?? {};
      return String(values["GSTIN/UIN"] ?? "").trim().toUpperCase() === expectedGstin;
    });

    if (match || page.length < 1000) {
      break;
    }
  }

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
  // Only replace a source that actually produced rows in this run. The GST
  // portal is flaky - the Notices page sometimes fails to load mid-run - and a
  // source that scraped zero rows is almost always a failed fetch, not a
  // genuine "nothing there". Deleting it would wipe good data (e.g. notices)
  // and leave the client showing whatever source did succeed (e.g. appeal).
  // So intersect the requested sources with the ones present in the batch.
  const presentSources = new Set(dataRows.map((row) => row.sourceTab).filter(Boolean));
  const requestedTags = sources && sources.length ? sources : [...presentSources];
  const sourceTags = requestedTags.filter((tag) => presentSources.has(tag));

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
    const rowSource = row.sourceTab || "gst-portal-local-collector";
    // A demand shares its reference number with the order it belongs to, and
    // (organisation_id, gst_registration_id, ref_id, case_id) is unique - so a
    // payment row stores a prefixed reference to avoid colliding with that
    // order. This mirrors the server sync path in app/api/gst/route.ts; without
    // it the insert fails on a duplicate key AFTER the delete above has already
    // cleared the rows, leaving the client empty.
    const refId = rowSource === "payment" && normalized.ref_id ? `DMD-${normalized.ref_id}` : normalized.ref_id;
    return {
      ...normalized,
      ref_id: refId,
      case_id: normalized.case_id || normalized.ref_id || `row-${index + 1}`,
      gst_registration_id: registrationId,
      organisation_id: organisationId,
      raw_payload: row,
      scraped_at: extractedAt,
      source: rowSource,
      updated_at: new Date().toISOString(),
    };
  });

  // Collapse any rows that still share the conflict key within this batch -
  // Postgres rejects an upsert that would touch the same row twice in one
  // command, so keep the last occurrence of each (ref_id, case_id).
  const dedupedPayload = Array.from(
    payload
      .reduce((map, entry) => map.set(`${entry.ref_id ?? ""}||${entry.case_id ?? ""}`, entry), new Map())
      .values()
  );

  // Upsert rather than a plain insert so that, even if two scraped rows share a
  // reference and case id, the save still succeeds instead of failing and
  // leaving the client empty after the delete above.
  const { error: insertError } = await admin
    .from("gst_litigation_cases")
    .upsert(dedupedPayload, { onConflict: "organisation_id,gst_registration_id,ref_id,case_id" });

  if (insertError) {
    throw new Error(`Could not save litigation rows to WorkLine: ${insertError.message}`);
  }

  return { insertedOrUpdated: dedupedPayload.length, registrationId, skipped: false };
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
    const gstin = String(options.expectedGstin || imported.gstin || "").trim().toUpperCase();

    if (!gstin) {
      throw new Error("The notices file does not include a GSTIN. Pass --expect-gstin with the matching GSTIN.");
    }

    // Preferred path: write straight to the database with the local
    // service-role key - no WorkLine sign-in needed. This tags each row by its
    // own source (notices / appeal / spl / payment) and prefixes demand
    // references, exactly like a live scrape, so the restored data matches.
    let organisationId = "";
    let clientName = options.clientName || "";
    try {
      const record = await readClientFromClientRecords(gstin);
      if (record) {
        organisationId = record.organisationId || "";
        clientName = clientName || record.clientName || "";
      }
    } catch (recordError) {
      console.log(`Could not read organisation from Client Records: ${recordError.message}`);
    }

    if (organisationId && createAdminSupabaseClient()) {
      const result = await syncRowsWithServiceRole({
        clientName,
        extractedAt: imported.extractedAt,
        gstin,
        organisationId,
        rows: imported.rows,
        sources: imported.sources && imported.sources.length ? imported.sources : undefined,
      });
      console.log(
        `Imported ${result.insertedOrUpdated} rows into WorkLine registration ${result.registrationId} using the service-role key.`,
      );
      return;
    }

    // Fallback: no service-role key locally - sign in to WorkLine and upsert.
    options = { ...options, expectedGstin: gstin, sync: true };
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    options = await promptForWorkLineLogin(rl, options);
    const client = {
      gstin,
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

  // Credentials handed over by the WorkLine app (via the local helper) come
  // first: with them, no Supabase key file or Excel workbook is needed on
  // this computer. Then Client Records (needs local keys), then Excel.
  let client = null;
  let credentialSource = "";

  const providedUserId = cleanCell(process.env.WORKLINE_GST_LOGIN_ID || "");
  const providedPassword = String(process.env.WORKLINE_GST_LOGIN_PASSWORD || "");
  if (options.expectedGstin && providedUserId && providedPassword) {
    client = {
      clientName: cleanCell(process.env.WORKLINE_GST_CLIENT_NAME || ""),
      gstin: options.expectedGstin,
      organisationId: "",
      password: providedPassword,
      rowNumber: null,
      userId: providedUserId,
    };
    credentialSource = "WorkLine (sent by the app)";
  }

  if (!client && options.expectedGstin) {
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

  const context = await launchChrome();
  // Prefer a tab already on the GST portal; otherwise the first tab, or a new
  // one. A reused window may have several tabs open from earlier runs.
  const page =
    context.pages().find((candidate) => /services\.gst\.gov\.in/.test(candidate.url())) ??
    context.pages()[0] ??
    (await context.newPage());
  await page.bringToFront().catch(() => {});

  // Reusing a window that is already signed in? Skip the whole login step.
  const alreadyAuthenticated = /\/services\/auth\//.test(page.url());

  // Make sure we are on the login page before signing in. On a fresh launch
  // Chrome already opened it; on a reused window sitting on another page (or the
  // firewall's reject page) navigate there now - the profile is warm by then,
  // so the navigation is accepted.
  if (!alreadyAuthenticated && !/\/services\/login/.test(page.url())) {
    await page.goto(GST_PORTAL_LOGIN_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});

  if (!alreadyAuthenticated) {
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
  }

  if (options.loginOnly) {
    if (alreadyAuthenticated) {
      console.log("Chrome is already signed in to the portal — continuing without a fresh login.");
    } else {
      console.log("");
      console.log("GST portal opened. The user ID and password have been typed in for you.");
      console.log("In the Chrome window: type the CAPTCHA and click LOGIN yourself.");
      console.log("Signing in by hand is what keeps the portal firewall from blocking the login.");
    }

    if (options.autoNotices) {
      if (!alreadyAuthenticated) {
        const signedIn = await waitForManualLogin(page, 6 * 60_000);
        if (!signedIn) {
          console.log("Login was not completed in time — nothing was scraped. Click Get data again when ready.");
          process.exit(0);
        }
      }
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

      // Earliest notice date gathered so far (dd/mm/yyyy) - the application
      // searches start from it rather than from July 2017.
      const earliestNoticeDmy = () => {
        let best = null;
        for (const row of rows) {
          const match = String(row.dateOfIssue || "").match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
          if (!match) {
            continue;
          }
          const when = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
          if (!best || when < best) {
            best = when;
          }
        }
        if (!best) {
          return null;
        }
        return `${String(best.getUTCDate()).padStart(2, "0")}/${String(best.getUTCMonth() + 1).padStart(2, "0")}/${best.getUTCFullYear()}`;
      };

      await runSource("notices", "Notices & Orders", () => collectNoticesAndOrders(page));
      const appOptions = { gstin: client.gstin, outputDir: options.outputDir, searchEmpty: options.searchEmpty };
      await runSource("appeal", "Appeal to Appellate Authority", () => collectApplications(page, "Appeal to Appellate Authority", earliestNoticeDmy(), appOptions));
      await runSource("spl", "SPL (Waiver Scheme 128A)", () => collectApplications(page, "Application for Waiver Scheme under Section 128A", earliestNoticeDmy(), appOptions));
      await runSource("payment", "Payment towards Demand", () => collectPaymentTowardsDemand(page));

      // Join each demand to the case that references it, the way the firm's
      // Excel tracker did: a Demand ID that appears in any other row's
      // reference, case id, description or sub-tab cells belongs to that
      // row's case. Unmatched demands stay as their own rows.
      const tokenOwners = new Map();
      const tokenPattern = /\b[A-Z]{2}\d{10,}[A-Z0-9]*\b/g;
      for (const row of rows) {
        if (row.sourceTab === "payment") {
          continue;
        }
        const texts = [row.refId, row.caseId, row.description, row.againstOrderNo];
        for (const tab of row.detail?.tabs ?? []) {
          for (const table of tab.tables ?? []) {
            for (const cells of table.rows ?? []) {
              texts.push(cells.join(" "));
            }
          }
        }
        for (const text of texts) {
          for (const token of String(text || "").toUpperCase().match(tokenPattern) ?? []) {
            if (!tokenOwners.has(token)) {
              tokenOwners.set(token, row.caseId || row.refId || "");
            }
          }
        }
      }
      let demandsMatched = 0;
      for (const row of rows) {
        if (row.sourceTab !== "payment") {
          continue;
        }
        const owner = tokenOwners.get(String(row.refId || "").toUpperCase());
        if (owner) {
          row.matchedCaseId = owner;
          demandsMatched += 1;
        }
      }
      const demandRows = rows.filter((row) => row.sourceTab === "payment").length;
      if (demandRows) {
        console.log(`Payment towards Demand: ${demandsMatched} of ${demandRows} demand(s) matched a case in this run.`);
      }

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
          sources: options.sources,
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

    // The scrape is done. DISCONNECT from the real Chrome but leave the window
    // open: keeping it alive preserves the portal's trust for the next run (so
    // the firewall does not have to be won over again) and lets the next run
    // attach instantly instead of starting a new browser.
    console.log("Done. Leaving the Chrome window open so the next run reuses this trusted session.");
    try {
      await context.browser()?.close();
    } catch {
      // disconnect only - the real Chrome process keeps running
    }
    process.exit(0);
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
