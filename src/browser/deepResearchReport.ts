import CDP from "chrome-remote-interface";
import type { BrowserLogger, ChromeClient } from "./types.js";

export async function captureDeepResearchReportIfAvailable({
  chromeHost,
  chromePort,
  enabled,
  logger,
}: {
  chromeHost?: string;
  chromePort?: number;
  enabled: boolean;
  logger: BrowserLogger;
}): Promise<string | null> {
  if (!enabled || !chromeHost || !chromePort) {
    return null;
  }

  let targets: Array<{ id?: string; url?: string; type?: string }> = [];
  try {
    const response = await fetch(`http://${chromeHost}:${chromePort}/json/list`);
    targets = (await response.json()) as Array<{ id?: string; url?: string; type?: string }>;
  } catch (error) {
    if (logger.verbose) {
      logger(
        `Deep research report capture skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  const deepResearchTargets = targets.filter(
    (target) =>
      target.id &&
      target.type === "iframe" &&
      (target.url ?? "").includes("connector_openai_deep_research"),
  );
  for (const target of deepResearchTargets) {
    let client: ChromeClient | null = null;
    try {
      client = await CDP({ host: chromeHost, port: chromePort, target: target.id });
      const { Runtime } = client;
      await Runtime.enable();
      const { result } = await Runtime.evaluate({
        expression: `(() => {
          const frame = document.querySelector('iframe#root') || document.querySelector('iframe');
          const doc = frame?.contentDocument ?? document;
          const text = doc?.body?.innerText || doc?.body?.textContent || '';
          return text.slice(0, 200000);
        })()`,
        returnByValue: true,
      });
      const raw = typeof result?.value === "string" ? result.value : "";
      const cleaned = cleanDeepResearchReportText(raw);
      if (
        cleaned.length > 200 &&
        (/research completed/i.test(cleaned) ||
          /executive summary/i.test(cleaned) ||
          /deep-research/i.test(cleaned))
      ) {
        logger(
          `Captured ChatGPT Deep research report from sandbox iframe (${cleaned.length} chars).`,
        );
        return cleaned;
      }
    } catch (error) {
      if (logger.verbose) {
        logger(
          `Deep research iframe capture failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      await client?.close().catch(() => undefined);
    }
  }
  return null;
}

export function cleanDeepResearchReportText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\d$/.test(line.trim()));
  const deduped: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed === deduped.at(-1)?.trim()) {
      continue;
    }
    deduped.push(line);
  }
  return deduped
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
