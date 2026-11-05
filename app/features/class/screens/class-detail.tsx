/**
 * 클래스 소개 페이지 (공개)
 *
 * /class/:slug 경로로 접근
 * 로그인 없이 외부 사용자도 접근 가능
 */
import type { CurriculumItem, InstructorSns } from "../queries";
import type { Route } from "./+types/class-detail";

import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { getSafeHttpUrl } from "~/core/lib/web-url";

import ClassCurriculum from "../components/class-curriculum";
import ClassFooter from "../components/class-footer";
import ClassHero from "../components/class-hero";
import ClassInstructor from "../components/class-instructor";
import ClassLocation from "../components/class-location";
import { getConsultConfig } from "../consult-security.server";
import { getPublicProgramBySlug } from "../queries";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.program) {
    return [{ title: "클래스를 찾을 수 없습니다" }];
  }
  const title = `${data.program.title} | ${import.meta.env.VITE_APP_NAME || "Lestly"}`;
  const description = (
    [data.program.subtitle?.trim(), data.program.description?.trim()]
      .filter(Boolean)
      .join(" · ") || `${data.program.title} 클래스 소개와 상담 신청`
  )
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const image = getSafeHttpUrl(data.program.cover_image_url);
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: data.shareUrl },
    { tagName: "link", rel: "canonical", href: data.shareUrl },
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(image
      ? [
          { property: "og:image", content: image },
          { property: "og:image:alt", content: data.program.title },
          { name: "twitter:image", content: image },
          { name: "twitter:image:alt", content: data.program.title },
        ]
      : []),
  ];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { slug } = params;

  if (!slug) {
    throw data({ message: "클래스를 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const program = await getPublicProgramBySlug(client, { slug });

    if (!program) {
      throw data({ message: "클래스를 찾을 수 없습니다" }, { status: 404 });
    }

    return {
      program,
      shareUrl: new URL(
        `/class/${encodeURIComponent(program.slug || slug)}`,
        request.url,
      ).href,
      consultEnabled: !!getConsultConfig(),
    };
  } catch (error) {
    throw data({ message: "클래스를 찾을 수 없습니다" }, { status: 404 });
  }
}

export default function ClassDetail({ loaderData }: Route.ComponentProps) {
  const { program, consultEnabled } = loaderData;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState("");
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();

  // JSONB 필드 파싱
  const curriculum = (program.curriculum as unknown as CurriculumItem[]) || [];

  // instructor는 join으로 가져옴
  const instructor = program.instructor;
  const instructorCareer = instructor
    ? (instructor.career as string[]) || []
    : [];
  const instructorSns = instructor
    ? (instructor.sns as InstructorSns) || {}
    : {};

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim() || !requestId || fetcher.state !== "idle")
      return;

    fetcher.submit(
      {
        programId: program.program_id,
        name: name.trim(),
        phone: phone.trim(),
        message: message.trim(),
        requestId,
      },
      {
        method: "POST",
        action: "/api/consult-request",
        encType: "application/json",
      },
    );
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.success) setSubmitted(true);
  }, [fetcher.data, fetcher.state]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setMessage("");
    setSubmitted(false);
    setDialogOpen(false);
    setRequestId("");
  };

  const openConsult = () => {
    setRequestId(crypto.randomUUID());
    setSubmitted(false);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      {/* 히어로 섹션 */}
      <ClassHero
        title={program.title}
        subtitle={program.subtitle}
        coverImageUrl={program.cover_image_url}
        locationType={program.location_type}
        durationMinutes={program.duration_minutes}
        totalSessions={program.total_sessions}
      />

      {/* 상담 신청 Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && fetcher.state === "idle") resetForm();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white text-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">상담 신청</DialogTitle>
            <DialogDescription className="text-gray-600">
              {program.title} 클래스에 대해 상담을 신청합니다.
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-900">
                상담 신청이 완료되었습니다
              </p>
              <p className="mt-2 text-sm text-gray-500">
                빠른 시일 내에 연락드리겠습니다.
              </p>
              <Button
                className="mt-6 bg-gray-900 text-white hover:bg-gray-800"
                onClick={resetForm}
              >
                확인
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700">
                  이름 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  maxLength={100}
                  autoComplete="name"
                  placeholder="이름을 입력하세요"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={fetcher.state !== "idle"}
                  className="border-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-gray-700">
                  연락처 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="- 없이 숫자만 입력해주세요"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={fetcher.state !== "idle"}
                  className="border-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-gray-700">
                  문의 내용 (선택)
                </Label>
                <Textarea
                  id="message"
                  maxLength={2000}
                  placeholder="문의 내용을 입력하세요"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={fetcher.state !== "idle"}
                  rows={3}
                  className="border-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <p className="text-xs text-gray-500">
                이름·연락처·문의 내용은 해당 클래스 상담을 위해 관리자에게
                전달됩니다. 민감한 개인정보는 입력하지 마세요.
              </p>

              {fetcher.data?.error && (
                <p className="text-sm text-red-500">{fetcher.data.error}</p>
              )}

              <Button
                className="w-full bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleSubmit}
                disabled={
                  fetcher.state !== "idle" || !name.trim() || !phone.trim()
                }
              >
                {fetcher.state !== "idle" ? "신청 중..." : "상담 신청하기"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 메인 콘텐츠 */}
      <div className="mx-auto max-w-4xl px-4 pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pt-12">
        {/* 클래스 설명 */}
        {program.description && (
          <div className="mb-12">
            <h2 className="mb-4 text-xl font-bold text-gray-800">
              클래스 소개
            </h2>
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <p className="leading-relaxed whitespace-pre-wrap text-gray-700">
                {program.description}
              </p>
            </div>
          </div>
        )}

        {/* 커리큘럼 & 강사 소개 */}
        <div
          className={`grid gap-8 ${curriculum.length > 0 && instructor?.name ? "md:grid-cols-2" : "grid-cols-1"}`}
        >
          {/* 커리큘럼 */}
          {curriculum.length > 0 && <ClassCurriculum curriculum={curriculum} />}

          {/* 강사 소개 */}
          {instructor && (
            <ClassInstructor
              name={instructor.name}
              info={instructor.info}
              photoUrl={instructor.photo_url}
              career={instructorCareer}
              sns={instructorSns}
              wide={curriculum.length === 0}
            />
          )}
        </div>

        {/* 위치 정보 */}
        {program.location_type === "offline" && program.location_address && (
          <ClassLocation address={program.location_address} />
        )}
      </div>

      {/* 하단 고정 바 */}
      <ClassFooter consultEnabled={consultEnabled} onConsult={openConsult} />
    </div>
  );
}
