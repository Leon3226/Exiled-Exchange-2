import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import AdmZip from "adm-zip";
import { app } from "electron";
import type { ServerEvents } from "./server";
import type { AssetChannelStatus, AssetUpdaterState } from "../../ipc/types";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/Leon3226/PoeTradeAggregator/data/manifest.json";

interface ManifestChannelEntry {
  version: string;
  url: string;
  sha256: string;
  is_zip: boolean;
  force_update_after?: string;
}

interface Manifest {
  channels: Record<string, ManifestChannelEntry>;
}

interface ChannelDef {
  name: string;
  /** Whether the downloaded asset is a zip that should be extracted, vs. used as a single file. */
  isZip: boolean;
}

interface ActivePointer {
  version: string;
  /** Only set for non-zip channels: the file name within the version directory. */
  fileName?: string;
}

/**
 * Channels this app build knows how to consume. Unknown manifest keys are ignored (forward compat).
 *
 * The model and item-vector-data.json are published together as one "model_bundle" channel
 * (not two independent channels) because they must always match: item-vector-data.json defines
 * the feature layout the model was trained against, so a model paired with the wrong schema
 * version would silently mispredict.
 */
const CHANNELS: ChannelDef[] = [{ name: "model_bundle", isZip: true }];

const KEEP_VERSIONS = 2;

export class AssetUpdater {
  private readonly baseDir: string;
  private state: AssetUpdaterState = {};

  constructor(private server: ServerEvents) {
    this.baseDir = path.join(app.getPath("userData"), "asset-updater");

    this.server.onEventAnyClient("CLIENT->MAIN::user-action", ({ action }) => {
      if (action === "check-for-data-update") {
        this.checkForUpdates().catch((err) => {
          console.error("[AssetUpdater] Check failed:", err);
        });
      }
    });
  }

  checkAtStartup() {
    this.checkForUpdates().catch((err) => {
      console.error("[AssetUpdater] Startup check failed:", err);
    });
  }

  /** Returns the active local path for a channel, or null if nothing has been downloaded yet (caller should use its bundled fallback). */
  getActivePath(channelName: string): string | null {
    const pointer = this.readActivePointer(channelName);
    if (!pointer) return null;

    const versionDir = path.join(this.baseDir, channelName, pointer.version);
    if (!fs.existsSync(versionDir)) return null;

    return pointer.fileName ? path.join(versionDir, pointer.fileName) : versionDir;
  }

  async checkForUpdates(): Promise<AssetUpdaterState> {
    let manifest: Manifest;
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = (await res.json()) as Manifest;
      
    } catch (err) {
      console.error("[AssetUpdater] Failed to fetch manifest:", err);
      return this.state;
    }

    for (const channel of CHANNELS) {
      const entry = manifest.channels?.[channel.name];
      if (!entry) continue;

      const pointer = this.readActivePointer(channel.name);
      if (pointer?.version === entry.version) {
        this.setStatus(channel.name, { state: "up-to-date", version: entry.version });
        continue;
      }

      this.downloadChannel(channel, entry).catch((err) => {
        console.error(`[AssetUpdater] Failed to download ${channel.name}:`, err);
        this.setStatus(channel.name, {
          state: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return this.state;
  }

  private async downloadChannel(channel: ChannelDef, entry: ManifestChannelEntry) {
    this.setStatus(channel.name, { state: "downloading", version: entry.version });

    const res = await fetch(entry.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${entry.url}`);
    const data = Buffer.from(await res.arrayBuffer());

    const actualSha256 = crypto.createHash("sha256").update(data).digest("hex");
    if (actualSha256 !== entry.sha256) {
      throw new Error(
        `Checksum mismatch for ${channel.name} ${entry.version}: expected ${entry.sha256}, got ${actualSha256}`,
      );
    }

    const versionDir = path.join(this.baseDir, channel.name, entry.version);
    fs.mkdirSync(versionDir, { recursive: true });

    let fileName: string | undefined;
    if (channel.isZip) {
      const tmpZipPath = path.join(this.baseDir, `${channel.name}-${entry.version}.zip.tmp`);
      fs.writeFileSync(tmpZipPath, data);
      try {
        new AdmZip(tmpZipPath).extractAllTo(versionDir, true);
      } finally {
        fs.rmSync(tmpZipPath, { force: true });
      }
    } else {
      fileName = path.basename(new URL(entry.url).pathname);
      fs.writeFileSync(path.join(versionDir, fileName), data);
    }

    this.writeActivePointer(channel.name, { version: entry.version, fileName });
    this.pruneOldVersions(channel.name, entry.version);

    this.setStatus(channel.name, { state: "downloaded", version: entry.version });
  }

  private pruneOldVersions(channelName: string, currentVersion: string) {
    const channelDir = path.join(this.baseDir, channelName);
    let versions: string[];
    try {
      versions = fs
        .readdirSync(channelDir)
        .filter((name) => name !== currentVersion && fs.statSync(path.join(channelDir, name)).isDirectory());
    } catch {
      return;
    }

    versions
      .sort()
      .reverse()
      .slice(KEEP_VERSIONS - 1)
      .forEach((name) => {
        fs.rmSync(path.join(channelDir, name), { recursive: true, force: true });
      });
  }

  private readActivePointer(channelName: string): ActivePointer | null {
    const pointerPath = path.join(this.baseDir, channelName, "active.json");
    try {
      return JSON.parse(fs.readFileSync(pointerPath, "utf-8")) as ActivePointer;
    } catch {
      return null;
    }
  }

  private writeActivePointer(channelName: string, pointer: ActivePointer) {
    const channelDir = path.join(this.baseDir, channelName);
    fs.mkdirSync(channelDir, { recursive: true });
    const pointerPath = path.join(channelDir, "active.json");
    const tmpPath = `${pointerPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(pointer));
    fs.renameSync(tmpPath, pointerPath);
  }

  private setStatus(channelName: string, status: AssetChannelStatus) {
    this.state = { ...this.state, [channelName]: status };
    this.server.sendEventTo("broadcast", {
      name: "MAIN->CLIENT::asset-updater-state",
      payload: this.state,
    });
  }
}
