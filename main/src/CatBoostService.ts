import { Model } from "catboost";
import * as path from "path";
import * as fs from "fs";

interface ModelCache {
  generic: Map<string, Model>;
  unique: Map<string, Model>;
}

export class CatBoostService {
  private models: ModelCache = {
    generic: new Map(),
    unique: new Map(),
  };

  private modelsBasePath: string;
  private initialized: boolean = false;

  constructor(modelsBasePath: string) {
    this.modelsBasePath = modelsBasePath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const genericPath = path.join(this.modelsBasePath, "generic");
    const uniquePath = path.join(this.modelsBasePath, "unique");

    if (fs.existsSync(genericPath)) {
      const genericModels = fs.readdirSync(genericPath);
      console.log(
        `[CatBoost] Found ${genericModels.length} generic model(s): ${genericModels.join(", ")}`,
      );
    }

    if (fs.existsSync(uniquePath)) {
      const uniqueModels = fs.readdirSync(uniquePath);
      console.log(
        `[CatBoost] Found ${uniqueModels.length} unique model(s): ${uniqueModels.join(", ")}`,
      );
    }

    this.initialized = true;
    console.log("[CatBoost] Service initialized");
  }

  private loadModel(
    category: "generic" | "unique",
    itemType: string,
  ): Model | null {
    const cache = category === "generic" ? this.models.generic : this.models.unique;

    if (cache.has(itemType)) {
      return cache.get(itemType)!;
    }

    const modelPath = path.join(this.modelsBasePath, category, itemType);

    if (!fs.existsSync(modelPath)) {
      console.warn(`[CatBoost] Model not found: ${modelPath}`);
      return null;
    }

    try {
      const model = new Model();
      model.loadModel(modelPath);
      cache.set(itemType, model);
      console.log(`[CatBoost] Loaded model: ${category}/${itemType}`);
      return model;
    } catch (error) {
      console.error(`[CatBoost] Failed to load model ${modelPath}:`, error);
      return null;
    }
  }

  predict(
    category: "generic" | "unique",
    itemType: string,
    featureVector: number[],
    categoricalFeatures: string[] = []
  ): number | null {
    const model = this.loadModel(category, itemType);
    if (!model) {
      return null;
    }

    try {
      const predictions = model.predict([featureVector], [categoricalFeatures]);
      return predictions[0] ;
    } catch (error) {
      console.error(
        `[CatBoost] Prediction failed forcc ${category}/${itemType}:`,
        error,
      );
      return null;
    }
  }

  getAvailableModels(): { generic: string[]; unique: string[] } {
    const genericPath = path.join(this.modelsBasePath, "generic");
    const uniquePath = path.join(this.modelsBasePath, "unique");

    return {
      generic: fs.existsSync(genericPath) ? fs.readdirSync(genericPath) : [],
      unique: fs.existsSync(uniquePath) ? fs.readdirSync(uniquePath) : [],
    };
  }

  hasModel(category: "generic" | "unique", itemType: string): boolean {
    const modelPath = path.join(this.modelsBasePath, category, itemType);
    return fs.existsSync(modelPath);
  }

  preloadModels(models: Array<{ category: "generic" | "unique"; itemType: string }>): void {
    for (const { category, itemType } of models) {
      this.loadModel(category, itemType);
    }
  }

  clearCache(): void {
    this.models.generic.clear();
    this.models.unique.clear();
    console.log("[CatBoost] Model cache cleared");
  }
}
