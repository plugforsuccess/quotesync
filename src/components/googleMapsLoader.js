// src/components/googleMapsLoader.js
// One-time Google Maps loader singleton. Ensures the script is loaded once
// and can be awaited from any component.
import { Loader } from "@googlemaps/js-api-loader";

let loaderPromise = null;

export function loadGoogleMaps(apiKey) {
  if (!loaderPromise) {
    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["places"],
    });

    loaderPromise = loader.load().then(() => undefined);
  }
  return loaderPromise;
}
