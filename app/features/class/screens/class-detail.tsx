/**
 * 클래스 소개 페이지 (공개)
 *
 * /class/:slug 경로로 접근
 * 로그인 없이 외부 사용자도 접근 가능
 */
import type { CurriculumItem, InstructorSns } from "../queries";
import type { Route } from "./+types/class-detail";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import ClassCurriculum from "../components/class-curriculum";
import ClassFooter from "../components/class-footer";
import ClassHero from "../components/class-hero";
import ClassInstructor from "../components/class-instructor";
import ClassLocation from "../components/class-location";
import { getNextScheduleForProgram, getPublicProgramBySlug } from "../queries";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.program) {
    return [{ title: "클래스를 찾을 수 없습니다" }];
  }
  return [
    { title: `${data.program.title} | ${import.meta.env.VITE_APP_NAME}` },
    { name: "description", content: data.program.subtitle || "" },
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

    // 다음 스케줄 조회
    let nextSchedule = null;
    try {
      nextSchedule = await getNextScheduleForProgram(client, {
        programId: program.program_id,
      });
    } catch {
      // 스케줄이 없어도 페이지는 표시
    }

    return { program, nextSchedule };
  } catch (error) {
    throw data({ message: "클래스를 찾을 수 없습니다" }, { status: 404 });
  }
}

export default function ClassDetail({ loaderData }: Route.ComponentProps) {
  const { program, nextSchedule } = loaderData;

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

      {/* CTA 버튼 */}
      <div className="relative z-10 mt-6 flex justify-center">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-[#d4a574] px-8 py-3 text-lg font-semibold text-white shadow-lg transition-colors hover:bg-[#c49464]"
        >
          상담 신청하기
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="mx-auto max-w-4xl px-4 pt-12 pb-24">
        {/* 클래스 설명 */}
        {program.description && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-gray-800 mb-4">클래스 소개</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {program.description}
              </p>
            </div>
          </div>
        )}

        {/* 커리큘럼 & 강사 소개 */}
        <div className="grid gap-8 md:grid-cols-2">
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
            />
          )}
        </div>

        {/* 위치 정보 */}
        {program.location_type === "offline" && program.location_address && (
          <ClassLocation address={program.location_address} />
        )}
      </div>

      {/* 하단 고정 바 */}
      <ClassFooter
        maxCapacity={program.max_capacity}
        nextSchedule={nextSchedule}
      />
    </div>
  );
}
