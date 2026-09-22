"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

import { copyText } from "@multica/ui/lib/clipboard";
import { CODE_LIGATURE_CLASS } from "@multica/ui/lib/code-style";
import { cn } from "@multica/ui/lib/utils";

/**
 * The Multica CLI install commands, one per platform family.
 *
 * These live next to the component rather than at each call site because
 * three surfaces render install instructions — the runtimes "add computer"
 * dialog, onboarding's CLI card, and the landing download page. Keeping three
 * copies of a single hardcoded string is how Windows silently went missing
 * from every one of them while scripts/install.ps1 sat in the repo; the
 * commands the scripts document are the source of truth here.
 */
export const CLI_INSTALL_COMMANDS = {
  macosLinux:
    "curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash",
  windows:
    "irm https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.ps1 | iex",
} as const;

export type CliInstallPlatform = keyof typeof CLI_INSTALL_COMMANDS;

export const CLI_INSTALL_PLATFORMS: readonly CliInstallPlatform[] = [
  "macosLinux",
  "windows",
];

export interface CliInstallCommandLabels {
  /** Accessible name for the platform switch. */
  group: string;
  macosLinux: string;
  windows: string;
  /** Landing variant only: the copy button spells the action out in words. */
  copied?: string;
  copy: string;
}

const COPIED_RESET_MS = 2000;

/**
 * Platform switcher + copyable install command.
 *
 * `variant="app"` uses the design tokens (in-product surfaces);
 * `variant="landing"` matches the marketing palette, which deliberately
 * bypasses those tokens on the public pages.
 */
export function CliInstallCommand({
  labels,
  variant = "app",
  defaultPlatform = "macosLinux",
  className,
}: {
  labels: CliInstallCommandLabels;
  variant?: "app" | "landing";
  defaultPlatform?: CliInstallPlatform;
  className?: string;
}) {
  const [platform, setPlatform] = useState<CliInstallPlatform>(defaultPlatform);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const isLanding = variant === "landing";
  const command = CLI_INSTALL_COMMANDS[platform];

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(() => {
    void copyText(command).then((ok) => {
      if (ok) setCopied(true);
    });
  }, [command]);

  const platformLabel: Record<CliInstallPlatform, string> = {
    macosLinux: labels.macosLinux,
    windows: labels.windows,
  };

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      <div
        role="tablist"
        aria-label={labels.group}
        className={cn(
          "inline-flex w-fit items-center rounded-lg p-[3px]",
          isLanding
            ? "gap-1 border border-[#0a0d12]/10 bg-white"
            : "gap-0.5 bg-muted",
        )}
      >
        {CLI_INSTALL_PLATFORMS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${panelId}-${value}`}
            aria-selected={platform === value}
            aria-controls={panelId}
            onClick={() => setPlatform(value)}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-[calc(var(--radius)-3px)] border border-transparent font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isLanding
                ? "px-2.5 py-1 text-caption text-[#0a0d12]/60 hover:text-[#0a0d12] aria-selected:bg-[#0a0d12]/5 aria-selected:text-[#0a0d12]"
                : "px-2 py-0.5 text-caption text-muted-foreground hover:text-foreground aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm",
            )}
          >
            {platformLabel[value]}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${panelId}-${platform}`}
        className={cn(
          "flex w-full min-w-0 items-start font-mono",
          isLanding
            ? "gap-3 rounded-xl border border-[#0a0d12]/10 bg-white px-4 py-3 text-label"
            : "gap-2 rounded-lg bg-muted px-3 py-2.5 text-body",
        )}
      >
        <Terminal
          className={cn(
            "mt-0.5 shrink-0",
            isLanding
              ? "size-4 text-[#0a0d12]/55"
              : "h-3.5 w-3.5 text-muted-foreground",
          )}
          aria-hidden
        />
        <code
          className={cn(
            "min-w-0 flex-1 break-all whitespace-pre-wrap tabular-nums",
            CODE_LIGATURE_CLASS,
          )}
        >
          {command}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={labels.copy}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isLanding
              ? "rounded-md px-2 py-1 font-sans text-caption font-medium text-[#0a0d12]/70 hover:bg-[#0a0d12]/5 hover:text-[#0a0d12]"
              : "rounded-xs p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {copied ? (
            <Check
              className={cn(
                isLanding ? "size-3.5" : "h-3.5 w-3.5",
                "text-success",
              )}
              aria-hidden
            />
          ) : (
            <Copy
              className={isLanding ? "size-3.5" : "h-3.5 w-3.5"}
              aria-hidden
            />
          )}
          {isLanding ? (
            <span>{copied ? labels.copied ?? labels.copy : labels.copy}</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
