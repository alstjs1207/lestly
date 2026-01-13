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

export default function ConfirmEmail() {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>이메일 주소 확인</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            {/* 로고 */}
            <Section className="text-center pt-4 pb-6">
              <table cellPadding="0" cellSpacing="0" className="mx-auto">
                <tr>
                  <td
                    className="bg-black rounded-lg"
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
              이메일 주소를 확인해주세요
            </Heading>

            <Section>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                안녕하세요,
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                아래 버튼을 클릭하여 이메일 주소를 확인해주세요.
              </Text>
              <Button
                className="block rounded-xl bg-[#2563eb] px-6 py-3 text-center text-[15px] font-semibold text-white no-underline"
                href={`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`}
              >
                이메일 확인하기
              </Button>
            </Section>

            <Section>
              <Text className="mt-6 mb-4 text-[15px] leading-relaxed text-black">
                버튼이 작동하지 않으면 아래 링크를 브라우저에 복사하여
                붙여넣으세요:
              </Text>
              <Text className="mb-4 text-[13px] leading-relaxed text-blue-500 break-all">
                {`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`}
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
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
              © 2025 Lestly. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
