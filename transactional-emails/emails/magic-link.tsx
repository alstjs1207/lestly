import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export default function MagicLink() {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>이메일 인증 코드</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            {/* 로고 */}
            <Section className="pt-4 pb-6 text-center">
              <table cellPadding="0" cellSpacing="0" className="mx-auto">
                <tr>
                  <td
                    className="rounded-lg bg-black"
                    style={{
                      width: "40px",
                      height: "40px",
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>📅</span>
                  </td>
                  <td style={{ paddingLeft: "8px" }}>
                    <span className="text-2xl font-bold text-black">
                      Lestly
                    </span>
                  </td>
                </tr>
              </table>
            </Section>

            <Heading className="text-center text-2xl leading-tight font-normal tracking-[-0.5px] text-black">
              이메일 인증 코드
            </Heading>

            <Section>
              <Text className="mt-10 mb-4 text-[15px] leading-relaxed text-black">
                안녕하세요. <br /> 아래 인증 코드를 입력해주세요:
              </Text>
              <div className="flex justify-center">
                <code className="mx-auto inline-block rounded bg-[#dfe1e4] px-4 py-3 text-center font-mono text-[24px] font-bold tracking-[2px] text-black uppercase">
                  {`{{ .Token }}`}
                </code>
              </div>
              <Text className="mt-6 mb-4 text-[15px] leading-relaxed text-black">
                본인이 요청하지 않으셨다면 이 이메일을 무시해주세요.
              </Text>
              <Text className="mb-2 text-[15px] leading-relaxed text-black">
                감사합니다,
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                Lestly 팀
              </Text>
            </Section>

            {/* 푸터 */}
            <Text className="mt-8 text-center text-[13px] text-gray-400">
              © 2026 Lestly. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
