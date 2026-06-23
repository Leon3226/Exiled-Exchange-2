import type { Server } from "http";
import type { CatBoostService } from "./CatBoostService";

export interface PredictRequest {
  category: "generic" | "unique";
  itemType: string;
  numericFeatures: number[];
  categoricalFeatures?: string[];
}

export interface PredictBatchRequest {
  category: "generic" | "unique";
  itemType: string;
  featureVectors: number[][];
}

export interface PredictResponse {
  success: boolean;
  prediction?: number | null;
  error?: string;
}

export interface PredictBatchResponse {
  success: boolean;
  predictions?: Array<number | null>;
  error?: string;
}

export interface ModelsResponse {
  generic: string[];
  unique: string[];
}

export function addPredictionRoutes(
  server: Server,
  catboostService: CatBoostService,
) {
  server.addListener("request", (req, res) => {
    if (req.method !== "POST" || req.url !== "/predict") return;

    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += chunk.toString();
    });

    req.once("end", () => {
      res.setHeader("content-type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");

      try {
        const request: PredictRequest = JSON.parse(body);

        if (!request.category || !request.itemType || !request.numericFeatures) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              success: false,
              error: "Missing required fields: category, itemType, numericFeatures",
            } as PredictResponse),
          );
          return;
        }

        const prediction = catboostService.predict(
          request.category,
          request.itemType,
          request.numericFeatures,
          request.categoricalFeatures || [],
        );

        res.end(
          JSON.stringify({
            success: true,
            prediction,
          } as PredictResponse),
        );
      } catch (error) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          } as PredictResponse),
        );
      }
    });
  });


  server.addListener("request", (req, res) => {
    if (req.method !== "GET" || req.url !== "/models") return;

    res.setHeader("content-type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const models = catboostService.getAvailableModels();
    res.end(JSON.stringify(models as ModelsResponse));
  });

  server.addListener("request", (req, res) => {
    if (req.method !== "GET" || !req.url?.startsWith("/models/")) return;

    res.setHeader("content-type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // URL format: /models/{category}/{itemType}
    const parts = req.url.slice("/models/".length).split("/");
    if (parts.length !== 2) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid URL format" }));
      return;
    }

    const [category, itemType] = parts;
    if (category !== "generic" && category !== "unique") {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Category must be 'generic' or 'unique'" }));
      return;
    }

    const exists = catboostService.hasModel(
      category ,
      decodeURIComponent(itemType),
    );
    res.end(JSON.stringify({ exists }));
  });

  server.addListener("request", (req, res) => {
    if (req.method !== "OPTIONS") return;
    if (
      !req.url?.startsWith("/predict") &&
      !req.url?.startsWith("/models")
    ) {
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
  });
}
