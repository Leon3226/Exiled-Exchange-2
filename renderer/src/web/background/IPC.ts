import type {
  IpcEvent,
  IpcEventPayload,
  UpdateInfo,
  HostState,
} from "@ipc/types";
import { shallowRef } from "vue";
import Sockette from "sockette";

class HostTransport {
  private evBus = new EventTarget();
  private socket!: Sockette;
  logs = shallowRef("");
  version = shallowRef("0.0.00000");
  updateInfo = shallowRef<UpdateInfo>({ state: "initial" });

  async init() {
    this.onEvent("MAIN->CLIENT::log-entry", (entry) => {
      this.logs.value += entry.message;
    });
    this.onEvent("MAIN->CLIENT::updater-state", (info) => {
      this.updateInfo.value = info;
    });
    await new Promise((resolve) => {
      this.socket = new Sockette(`ws://${window.location.host}/events`, {
        onmessage: (e) => {
          this.selfDispatch(JSON.parse(e.data));
        },
        onopen: resolve,
      });
    });
  }

  selfDispatch(event: IpcEvent) {
    this.evBus.dispatchEvent(
      new CustomEvent(event.name, {
        detail: event.payload,
      }),
    );
  }

  sendEvent(event: IpcEvent) {
    this.socket.send(JSON.stringify(event));
  }

  onEvent<Name extends IpcEvent["name"]>(
    name: Name,
    cb: (payload: IpcEventPayload<Name>) => void,
  ): AbortController {
    const controller = new AbortController();
    if (!this.isElectron && name.startsWith("MAIN->OVERLAY")) {
      return controller;
    }

    this.evBus.addEventListener(
      name,
      (e) => {
        cb((e as CustomEvent<IpcEventPayload<Name>>).detail);
      },
      { signal: controller.signal },
    );
    return controller;
  }

  async getConfig(): Promise<string | null> {
    const response = await fetch("/config");
    const config = (await response.json()) as HostState;
    // TODO: refactor this
    this.version.value = config.version;
    this.updateInfo.value = config.updater;
    return config.contents;
  }

  async importFile(file: File): Promise<string> {
    const response = await fetch(`/uploads/${file.name}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const body = (await response.json()) as { name: string };
    return body.name;
  }

  proxy: (typeof window)["fetch"] = async (url, init) => {
    return await window.fetch(`/proxy/${url as string}`, init);
  };

  get isElectron() {
    return navigator.userAgent.includes("Electron");
  }

  async predict(
    category: "generic" | "unique",
    itemType: string,
    numericFeatures: number[],
    categoricalFeatures: string[] = [],
  ): Promise<number | null> {
    try {
      const response = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, itemType, numericFeatures, categoricalFeatures }),
      });
      const result = (await response.json()) as {
        success: boolean;
        prediction?: number | null;
        error?: string;
      };
      if (!result.success) {
        console.error("[Predict] Error:", result.error);
        return null;
      }
      return result.prediction ?? null;
    } catch (error) {
      console.error("[Predict] Failed:", error);
      return null;
    }
  }

  async getAvailableModels(): Promise<{ generic: string[]; unique: string[] }> {
    try {
      const response = await fetch("/models");
      return (await response.json()) as { generic: string[]; unique: string[] };
    } catch (error) {
      console.error("[Predict] Failed to get models:", error);
      return { generic: [], unique: [] };
    }
  }
  
  async hasModel(category: "generic" | "unique", itemType: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/models/${category}/${encodeURIComponent(itemType)}`,
      );
      const result = (await response.json()) as { exists: boolean };
      return result.exists;
    } catch (error) {
      console.error("[Predict] Failed to check model:", error);
      return false;
    }
  }
}

export const MainProcess = new HostTransport();
export const Host = MainProcess;
