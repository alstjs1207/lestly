import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export default function Welcome({ name }: { name: string }) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>Lestly에 오신 것을 환영합니다</Preview>
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
              Lestly에 오신 것을 환영합니다!
            </Heading>

            <Section>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                안녕하세요, {name}님!
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                Lestly에 가입해주셔서 감사합니다.
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                이제 레슨 일정을 손쉽게 관리하고, 수강생들과 효율적으로 소통할
                수 있습니다.
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                궁금한 점이 있으시면 언제든지 문의해주세요.
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

Welcome.PreviewProps = {
  name: "홍길동",
};
