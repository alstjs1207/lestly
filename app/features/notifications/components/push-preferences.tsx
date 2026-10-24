import { BellRingIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

import {
  disableDevicePush,
  enableDevicePush,
  getPushSettings,
  isDevicePushEnabled,
  pushSettingsChangedEvent,
  pushSupport,
} from "../push/client";

export function PushPreferences() {
  const [state, setState] = useState<
    "loading" | "install" | "unsupported" | "ready" | "unconfigured" | "error"
  >("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      const support = pushSupport();
      if (support !== "supported") {
        if (mounted) setState(support);
        return;
      }
      try {
        const settings = await getPushSettings();
        const active = await isDevicePushEnabled(settings);
        if (mounted) {
          setPublicKey(settings.publicKey);
          setEnabled(active);
          setState(settings.configured ? "ready" : "unconfigured");
        }
      } catch {
        if (mounted) setState("error");
      }
    }
    void load();
    const onSync = () => void load();
    window.addEventListener(pushSettingsChangedEvent, onSync);
    return () => {
      mounted = false;
      window.removeEventListener(pushSettingsChangedEvent, onSync);
    };
  }, []);

  async function toggle() {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      if (enabled) await disableDevicePush();
      else await enableDevicePush(publicKey);
      setEnabled(!enabled);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "알림 설정을 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-screen-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRingIcon className="size-5" />
          예약·취소 푸시 알림
        </CardTitle>
        <CardDescription>
          강사 명부에 이 계정이 연결되어 있으면 담당 수업의 수강생 예약·취소를
          알림으로 받습니다. 사용하는 기기마다 설정해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" && (
          <p role="status" className="text-sm">
            기기 알림 설정을 확인하고 있습니다.
          </p>
        )}
        {state === "install" && (
          <p className="text-sm">
            iPhone·iPad에서는 Safari의 공유 메뉴에서 ‘홈 화면에 추가’를 선택한
            뒤, 홈 화면의 Lestly 앱을 열어 알림을 켜 주세요. iOS·iPadOS 16.4
            이상이 필요합니다.
          </p>
        )}
        {state === "unsupported" && (
          <p className="text-sm">
            이 환경에서는 푸시 알림을 사용할 수 없습니다. 최신 브라우저나 홈
            화면에 설치한 앱에서 확인해 주세요.
          </p>
        )}
        {state === "unconfigured" && (
          <p className="text-sm">
            푸시 알림 준비 중입니다. 설정이 완료되면 이 기기에서 알림을 켤 수
            있습니다.
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="text-destructive text-sm">
            알림 설정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.
          </p>
        )}
        {state === "ready" && (
          <>
            <p className="text-sm" role="status">
              {enabled
                ? "이 기기에서 알림을 받고 있습니다."
                : "이 기기의 알림이 꺼져 있습니다."}
            </p>
            <Button
              type="button"
              variant={enabled ? "outline" : "default"}
              disabled={busy}
              onClick={toggle}
            >
              {busy
                ? "변경 중..."
                : enabled
                  ? "이 기기 알림 끄기"
                  : "이 기기 알림 켜기"}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
