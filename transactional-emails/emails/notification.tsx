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

interface NotificationEmailProps {
  title: string;
  content: string;
}

export default function NotificationEmail({
  title,
  content,
}: NotificationEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>{title}</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="text-center text-2xl leading-tight font-normal tracking-[-0.5px] text-black">
              {title}
            </Heading>

            <Section className="mt-6">
              {/* Content with line breaks preserved */}
              {content.split("\n").map((line, index) => (
                <Text
                  key={index}
                  className="mb-1 text-[15px] leading-relaxed text-black"
                  style={{ margin: line.trim() === "" ? "16px 0" : "4px 0" }}
                >
                  {line || "\u00A0"}
                </Text>
              ))}
            </Section>

            {/* Footer */}
            <Section className="mt-8 pt-6">
              <Text className="text-center text-[13px] text-gray-400">
                이 메일은 Lestly를 통해 발송되었습니다.
              </Text>
              <Text className="mt-4 text-center text-[13px] text-gray-400">
                © 2026 Lestly. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

NotificationEmail.PreviewProps = {
  title: "[수업 예약] 홍길동님이 예약하였습니다",
  content: `[수업 예약 알림]

홍길동님이 수업을 예약하였습니다.

■ 클래스: 필라테스 기초반
■ 일시: 2025-01-25 10:00

※ 테스트 학원`,
};
