// VK community messages for users who allowed messages from the UniShare
// community (VKWebAppAllowMessagesFromGroup) and VK API helpers.
import { randomInt } from "node:crypto";
import { config } from "../config";

const VK_API_VERSION = "5.199";

export async function vkApi<T>(method: string, params: Record<string, string | number>, token: string): Promise<T> {
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token, v: VK_API_VERSION });
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json()) as { response?: T; error?: { error_code: number; error_msg: string } };
  if (payload.error) throw new Error(`VK ${method} failed: ${payload.error.error_code} ${payload.error.error_msg}`);
  return payload.response as T;
}

export function vkNotificationsEnabled(): boolean {
  return Boolean(config.vk.groupToken && config.vk.groupId && config.vk.appId);
}

export async function sendVkNotification(vkUserId: string, text: string, buttonText: string, hash: string): Promise<void> {
  if (!vkNotificationsEnabled()) return;
  const keyboard = {
    inline: true,
    buttons: [[{
      action: {
        type: "open_app",
        app_id: config.vk.appId,
        owner_id: -Number(config.vk.groupId),
        hash,
        label: buttonText.slice(0, 40),
      },
    }]],
  };
  try {
    await vkApi("messages.send", {
      user_id: vkUserId,
      random_id: randomInt(1, 2 ** 31 - 1),
      message: text,
      keyboard: JSON.stringify(keyboard),
    }, config.vk.groupToken!);
  } catch (error) {
    console.warn("vk notification failed:", (error as Error).message);
  }
}
