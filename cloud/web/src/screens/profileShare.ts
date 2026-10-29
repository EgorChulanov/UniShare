// Helpers shared by the profile, nearby and link screens.
import { telegramAppLink, vkAppLink, webLink, type DeepLink, type PublicConfig } from "@unishare/shared";
import { api } from "../lib/api";
import { platform } from "../platform/platform";

/** Best link to a deep link target for the platform the user is on right now. */
export function bestLink(config: PublicConfig | null, link: DeepLink): string {
  if (platform.kind === "telegram" && config?.telegramBotUsername) {
    return telegramAppLink(config.telegramBotUsername, config.telegramAppShortName, link);
  }
  if (platform.kind === "vk" && config?.vkAppId) return vkAppLink(config.vkAppId, link);
  if (config?.telegramBotUsername && platform.kind === "web") {
    return telegramAppLink(config.telegramBotUsername, config.telegramAppShortName, link);
  }
  return webLink(config?.publicUrl ?? window.location.origin, link);
}

export async function shareProfile(config: PublicConfig | null, uid: string, text: string): Promise<boolean> {
  const url = bestLink(config, { kind: "profile", uid });
  let preparedMessageId: string | null = null;
  if (platform.kind === "telegram") {
    preparedMessageId = await api
      .prepareTelegramShare()
      .then((result) => result.preparedMessageId)
      .catch(() => null);
  }
  return platform.share({ url, text, preparedMessageId });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
