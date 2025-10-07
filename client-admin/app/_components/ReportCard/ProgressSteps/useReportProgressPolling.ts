import { useEffect, useState } from "react";
import type { stepKeys } from "./ProgressSteps";

type Progress = (typeof stepKeys)[number] | "loading" | "completed";

export function useReportProgressPoll(slug: string) {
  const [progress, setProgress] = useState<Progress>("loading");
  const [isError, setIsError] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  useEffect(() => {
    if (!isPolling) return;

    let cancelled = false;
    // Count of consecutive failed polling attempts
    let consecutiveFailureCount = 0;
    const maxConsecutiveFailures = 10;

    async function poll() {
      if (cancelled) return;

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASEPATH}/admin/reports/${slug}/status/step-json`, {
          headers: {
            "x-api-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY || "",
            "Content-Type": "application/json",
            // キャッシュを防止するためのヘッダーを追加
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        });

        if (response.ok) {
          // Reset failure count on any successful response
          consecutiveFailureCount = 0;
          const data = await response.json();

          if (!data.current_step || data.current_step === "loading") {
            setTimeout(poll, 3000);
            return;
          }

          setProgress(data.current_step);

          if (data.status === "error") {
            setIsError(true);
            setIsPolling(false);
            return;
          }

          if (data.current_step === "completed") {
            setIsPolling(false);
            return;
          }

          // 正常なレスポンスの場合は次のポーリングをスケジュール
          setTimeout(poll, 3000);
        } else {
          consecutiveFailureCount++;
          if (consecutiveFailureCount >= maxConsecutiveFailures) {
            console.error("Maximum retry attempts reached");
            setIsError(true);
            setIsPolling(false);
            return;
          }
          const retryInterval = consecutiveFailureCount < 3 ? 2000 : 5000;
          setTimeout(poll, retryInterval);
        }
      } catch (error) {
        console.error("Polling error:", error);
        consecutiveFailureCount++;
        if (consecutiveFailureCount >= maxConsecutiveFailures) {
          setIsError(true);
          setIsPolling(false);
          return;
        }
        setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      cancelled = true;
    };
  }, [slug, isPolling]);

  return { progress, isError };
}
