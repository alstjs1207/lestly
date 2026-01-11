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

interface InviteStudentProps {
  organizationName: string;
  studentName: string;
  inviteLink: string;
}

export default function InviteStudent({
  organizationName,
  studentName,
  inviteLink,
}: InviteStudentProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>{organizationName}에서 초대되었습니다</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-center text-2xl leading-tight font-normal tracking-[-0.5px] text-black">
              {organizationName}에 오신 것을 환영합니다
            </Heading>
            <Section>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                안녕하세요, {studentName}님!
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                {organizationName}에서 수강생으로 초대되었습니다.
                아래 버튼을 클릭하여 비밀번호를 설정하고 로그인하세요.
              </Text>
              <Button
                className="block rounded-xl bg-black px-6 py-3 text-center text-[15px] font-semibold text-white no-underline"
                href={inviteLink}
              >
                비밀번호 설정하기
              </Button>
            </Section>
            <Section>
              <Text className="mb-4 mt-6 text-[15px] leading-relaxed text-black">
                버튼이 작동하지 않으면 아래 링크를 브라우저에 복사하여 붙여넣으세요:
              </Text>
              <Text className="mb-4 text-[13px] leading-relaxed text-blue-500 break-all">
                {inviteLink}
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                이 초대를 요청하지 않으셨다면 이 이메일을 무시해도 됩니다.
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                감사합니다,
              </Text>
              <Text className="mb-4 text-[15px] leading-relaxed text-black">
                Lestly 팀
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

InviteStudent.PreviewProps = {
  organizationName: "테스트 학원",
  studentName: "홍길동",
  inviteLink: "https://lestly.io/auth/set-password?token=abc123",
};
