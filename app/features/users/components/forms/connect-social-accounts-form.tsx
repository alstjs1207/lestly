import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { KakaoLogo } from "~/features/auth/components/logos/kakao";

import {
  ConnectProviderButton,
  DisconnectProviderButton,
} from "../connect-provider-buttons";

const enabledProviders = [
  {
    name: "Kakao",
    key: "kakao",
    logo: <KakaoLogo />,
  },
];

export default function ConnectSocialAccountsForm({
  providers,
}: {
  providers: string[];
}) {
  return (
    <Card className="w-full max-w-screen-md">
      <CardHeader>
        <CardTitle>소셜 계정 연결</CardTitle>
        <CardDescription>
          계정에 추가 인증 방법을 연결하거나 해제합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {enabledProviders.map((provider) => {
          if (providers.includes(provider.key)) {
            return (
              <DisconnectProviderButton
                key={provider.key}
                provider={provider.name}
                logo={provider.logo}
                providerKey={provider.key}
              />
            );
          } else {
            return (
              <ConnectProviderButton
                key={provider.key}
                provider={provider.name}
                logo={provider.logo}
                providerKey={provider.key}
              />
            );
          }
        })}
      </CardContent>
    </Card>
  );
}
