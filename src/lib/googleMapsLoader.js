// src/components/googleMapsLoader.js
// One-time Google Maps loader singleton. Ensures the script is loaded once
// and can be awaited from any component.
// On failure the promise is reset so a subsequent call can retry.
import { Loader } from "@googlemaps/js-api-loader";

let loaderPromise = null;

const LOAD_TIMEOUT_MS = 15_000;

export function loadGoogleMaps(apiKey) {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["places"],
    });

    loaderPromise = Promise.race([
      loader.load().then(() => undefined),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Google Maps load timeout")), LOAD_TIMEOUT_MS)
      ),
    ]).catch((err) => {
      // Reset so the next caller can retry instead of caching a rejected promise
      loaderPromise = null;
      throw err;
    });
  }
  return loaderPromise;
}
