import type { BrowserComposerMode, BrowserLogger, ChromeClient } from "../types.js";
import { INPUT_SELECTORS, MENU_CONTAINER_SELECTOR, MENU_ITEM_SELECTOR } from "../constants.js";
import { logDomFailure } from "../domDebug.js";
import { buildClickDispatcher } from "./domEvents.js";

type ComposerModeOutcome =
  | { status: "already-selected"; label?: string | null }
  | { status: "switched"; label?: string | null }
  | { status: "switched-best-effort"; label?: string | null }
  | { status: "tool-button-not-found"; availableOptions?: string[] }
  | { status: "option-not-found"; availableOptions?: string[] }
  | { status: "unsupported-mode" };

export async function ensureComposerMode(
  Runtime: ChromeClient["Runtime"],
  mode: BrowserComposerMode,
  logger: BrowserLogger,
): Promise<void> {
  const result = await evaluateComposerModeSelection(Runtime, mode);
  const label = modeLabel(mode);

  switch (result?.status) {
    case "already-selected":
      logger(`Composer mode: ${result.label ?? label} (already selected)`);
      return;
    case "switched":
      logger(`Composer mode: ${result.label ?? label}`);
      return;
    case "switched-best-effort":
      logger(`Composer mode: ${result.label ?? label} (best effort)`);
      return;
    case "tool-button-not-found": {
      await logDomFailure(Runtime, logger, "composer-mode-tool-button");
      throw new Error("Unable to locate the ChatGPT tools/add button for composer mode selection.");
    }
    case "option-not-found": {
      await logDomFailure(Runtime, logger, "composer-mode-option");
      const available =
        result.availableOptions && result.availableOptions.length > 0
          ? ` Available options: ${result.availableOptions.join(", ")}.`
          : "";
      throw new Error(`Unable to find the ${label} option in the ChatGPT tools menu.${available}`);
    }
    case "unsupported-mode":
      throw new Error(`Unsupported ChatGPT composer mode: ${mode}`);
    default: {
      await logDomFailure(Runtime, logger, "composer-mode-unknown");
      throw new Error(`Unknown error selecting ChatGPT composer mode: ${label}`);
    }
  }
}

async function evaluateComposerModeSelection(
  Runtime: ChromeClient["Runtime"],
  mode: BrowserComposerMode,
): Promise<ComposerModeOutcome | undefined> {
  const outcome = await Runtime.evaluate({
    expression: buildComposerModeExpression(mode),
    awaitPromise: true,
    returnByValue: true,
  });
  return outcome.result?.value as ComposerModeOutcome | undefined;
}

function modeLabel(mode: BrowserComposerMode): string {
  if (mode === "deep-research") return "Deep research";
  return mode;
}

function buildComposerModeExpression(mode: BrowserComposerMode): string {
  const modeLiteral = JSON.stringify(mode);
  const targetLabelLiteral = JSON.stringify(modeLabel(mode));
  const menuContainerLiteral = JSON.stringify(MENU_CONTAINER_SELECTOR);
  const menuItemLiteral = JSON.stringify(MENU_ITEM_SELECTOR);
  const inputSelectorsLiteral = JSON.stringify(INPUT_SELECTORS);

  return `(async () => {
    ${buildClickDispatcher()}

    const MODE = ${modeLiteral};
    const TARGET_LABEL = ${targetLabelLiteral};
    const MENU_CONTAINER_SELECTOR = ${menuContainerLiteral};
    const MENU_ITEM_SELECTOR = ${menuItemLiteral};
    const INPUT_SELECTORS = ${inputSelectorsLiteral};
    const TARGET_TEXT = 'deep research';
    const MAX_WAIT_MS = 15000;
    const POLL_MS = 150;

    if (MODE !== 'deep-research') {
      return { status: 'unsupported-mode' };
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalizeText = (value) => String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const disabled = (node) => {
      if (!(node instanceof HTMLElement)) return true;
      return Boolean(node.closest('[aria-disabled="true"], [disabled]')) ||
        node.getAttribute('aria-disabled') === 'true' ||
        node.hasAttribute('disabled');
    };
    const labelFor = (node) => {
      if (!(node instanceof HTMLElement)) return '';
      const parts = [
        node.getAttribute('aria-label'),
        node.getAttribute('data-testid'),
        node.textContent,
      ].filter(Boolean);
      return parts.join(' ').trim();
    };
    const normalizedLabelFor = (node) => normalizeText(labelFor(node));
    const matchesTarget = (node) => normalizedLabelFor(node).includes(TARGET_TEXT);
    const nearestClickable = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      return node.closest('button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [data-testid]') ?? node;
    };
    const getComposerRoot = () => {
      for (const selector of INPUT_SELECTORS) {
        const input = document.querySelector(selector);
        if (input instanceof HTMLElement) {
          return input.closest('form') ?? input.closest('[data-testid*="composer"]') ?? input.parentElement ?? document.body;
        }
      }
      return document.querySelector('form') ?? document.body;
    };
    const composerRoot = getComposerRoot();
    const isMenuNode = (node) => Boolean(node instanceof HTMLElement && node.closest(MENU_CONTAINER_SELECTOR));
    const collectMenuOptions = () => {
      const selector = [
        MENU_ITEM_SELECTOR,
        '[role="option"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
        'button',
      ].join(', ');
      const labels = [];
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement) || !visible(node) || !isMenuNode(node)) continue;
        const text = (node.textContent ?? node.getAttribute('aria-label') ?? '').trim();
        if (text && !labels.includes(text)) labels.push(text);
      }
      return labels.slice(0, 20);
    };
    const findActiveMode = () => {
      const roots = [composerRoot, document.body].filter(Boolean);
      const selector = [
        'button',
        '[role="button"]',
        '[aria-pressed="true"]',
        '[aria-selected="true"]',
        '[data-state="on"]',
        '[data-state="checked"]',
        '[data-selected="true"]',
        '[data-testid*="deep" i]',
        '[data-testid*="research" i]',
      ].join(', ');
      for (const root of roots) {
        for (const node of Array.from(root.querySelectorAll(selector))) {
          if (!(node instanceof HTMLElement) || !visible(node) || isMenuNode(node)) continue;
          if (!matchesTarget(node)) continue;
          return node;
        }
      }
      return null;
    };
    const findDeepResearchOption = () => {
      const selector = [
        MENU_ITEM_SELECTOR,
        '[role="option"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
        'button',
        '[data-testid*="deep" i]',
        '[data-testid*="research" i]',
      ].join(', ');
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement) || !visible(node) || !matchesTarget(node)) continue;
        const clickable = nearestClickable(node);
        if (clickable instanceof HTMLElement && !disabled(clickable)) {
          return clickable;
        }
      }
      return null;
    };
    const findToolsButton = () => {
      const roots = [composerRoot, document.body].filter(Boolean);
      const selector = [
        'button',
        '[role="button"]',
        '[data-testid*="composer-plus"]',
        '[data-testid*="plus"]',
        '[data-testid*="tool"]',
      ].join(', ');
      const scored = [];
      for (const root of roots) {
        for (const node of Array.from(root.querySelectorAll(selector))) {
          if (!(node instanceof HTMLElement) || !visible(node) || disabled(node)) continue;
          const text = normalizedLabelFor(node);
          if (!text) continue;
          if (text.includes('send') || text.includes('stop') || text.includes('model switcher')) continue;
          let score = 0;
          if (text.includes('composer plus')) score += 120;
          if (text.includes('tools') || text.includes('tool')) score += 110;
          if (text.includes('choose tool')) score += 100;
          if (text.includes('add')) score += 85;
          if (text.includes('attach') || text.includes('upload')) score += 70;
          if (text === '+' || text.includes(' plus')) score += 70;
          if (text.includes('more')) score += 40;
          if (composerRoot.contains(node)) score += 30;
          if (score > 0) scored.push({ node, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.node ?? null;
    };
    const click = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      node.scrollIntoView?.({ block: 'center', inline: 'center' });
      if (dispatchClickSequence(node)) return true;
      try {
        node.click();
        return true;
      } catch {
        return false;
      }
    };

    const active = findActiveMode();
    if (active) {
      return { status: 'already-selected', label: (active.textContent ?? TARGET_LABEL).trim() || TARGET_LABEL };
    }

    const alreadyOpenOption = findDeepResearchOption();
    if (alreadyOpenOption) {
      click(alreadyOpenOption);
      await sleep(500);
      const selected = findActiveMode();
      return {
        status: selected ? 'switched' : 'switched-best-effort',
        label: (selected?.textContent ?? TARGET_LABEL).trim() || TARGET_LABEL,
      };
    }

    const toolsButton = findToolsButton();
    if (!toolsButton) {
      return { status: 'tool-button-not-found', availableOptions: collectMenuOptions() };
    }
    click(toolsButton);

    const deadline = Date.now() + MAX_WAIT_MS;
    let availableOptions = [];
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      availableOptions = collectMenuOptions();
      const option = findDeepResearchOption();
      if (option) {
        click(option);
        await sleep(600);
        const selected = findActiveMode();
        return {
          status: selected ? 'switched' : 'switched-best-effort',
          label: (selected?.textContent ?? TARGET_LABEL).trim() || TARGET_LABEL,
        };
      }
    }

    return { status: 'option-not-found', availableOptions };
  })()`;
}

export function buildComposerModeExpressionForTest(mode: BrowserComposerMode): string {
  return buildComposerModeExpression(mode);
}
