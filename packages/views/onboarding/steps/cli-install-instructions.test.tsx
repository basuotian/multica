import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@multica/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enOnboarding from "../../locales/en/onboarding.json";
import { CliInstallInstructions } from "./cli-install-instructions";

const TEST_RESOURCES = { en: { common: enCommon, onboarding: enOnboarding } };

const UNIX_CMD =
  "curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash";
const WINDOWS_CMD =
  "irm https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.ps1 | iex";

function renderCard() {
  return render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <CliInstallInstructions />
    </I18nProvider>,
  );
}

describe("CliInstallInstructions", () => {
  it("defaults to the macOS / Linux installer", () => {
    renderCard();

    expect(screen.getByRole("tab", { name: "macOS / Linux" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(UNIX_CMD)).toBeInTheDocument();
    expect(screen.queryByText(WINDOWS_CMD)).toBeNull();
  });

  it("switches the first step to the PowerShell installer", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("tab", { name: "Windows" }));

    expect(screen.getByText(WINDOWS_CMD)).toBeInTheDocument();
    expect(screen.queryByText(UNIX_CMD)).toBeNull();
  });

  // Step 2 is platform-independent, so it must survive the switch untouched.
  it("keeps the setup step shared across platforms", () => {
    renderCard();
    expect(screen.getByText("multica setup")).toBeInTheDocument();
  });
});
