import { useEffect, useState } from "react";

/**
 * PWA offline indicator.  Hidden by default and only drops down from the top
 * of the viewport once the Service Worker reports the device has lost network
 * connectivity, reassuring the user that the app is gracefully degrading to
 * cached data instead of hard-crashing.
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="offline-indicator" role="status" aria-live="polite">
      <span className="offline-indicator__dot" aria-hidden="true" />
      You are offline. Showing cached travel data.
    </div>
  );
}
