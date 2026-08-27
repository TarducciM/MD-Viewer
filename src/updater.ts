import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
}

let pendingUpdate: Update | null = null;

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (update) {
      pendingUpdate = update;
      return { available: true, version: update.version };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

export async function installPendingUpdate(onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  if (!pendingUpdate) return;
  let downloaded = 0;
  let total = 0;
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    }
  });
  await relaunch();
}
