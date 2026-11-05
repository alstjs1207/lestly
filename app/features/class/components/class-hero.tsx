import { CalendarIcon, ClockIcon, MapPinIcon } from "lucide-react";

interface ClassHeroProps {
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  locationType?: string | null;
  durationMinutes?: number | null;
  totalSessions?: number | null;
}

export default function ClassHero({
  title,
  subtitle,
  coverImageUrl,
  locationType,
  durationMinutes,
  totalSessions,
}: ClassHeroProps) {
  // 시간 포맷팅 (분 -> 시간)
  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    }
    return `${minutes}분`;
  };

  return (
    <div className="relative">
      {/* 커버 이미지 배경 + 타이틀 오버레이 */}
      <div
        className={`relative w-full ${coverImageUrl ? "h-[300px] md:h-[400px]" : "min-h-[180px] md:min-h-[220px]"}`}
      >
        {/* 커버 이미지 또는 기본 배경 */}
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[#8b6f5c]" />
        )}

        {/* 어두운 오버레이 (텍스트 가독성) */}
        <div className="absolute inset-0 bg-black/30" />

        {/* 타이틀/서브타이틀 오버레이 */}
        <div
          className={`flex flex-col items-center justify-center px-4 text-center text-white ${coverImageUrl ? "absolute inset-0" : "relative min-h-[180px] py-10 md:min-h-[220px]"}`}
        >
          <h1 className="mb-4 max-w-4xl text-3xl font-bold break-words md:text-5xl">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-3xl text-lg break-words text-white/90 md:text-2xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* 메타 정보 배지 */}
      <div className="bg-[#8b6f5c] py-4">
        <div className="flex flex-wrap justify-center gap-3 text-sm text-white">
          {/* 위치 타입 */}
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
            <MapPinIcon className="h-4 w-4" />
            <span>
              {locationType === "online" ? "온라인 수업" : "오프라인 수업"}
            </span>
          </div>

          {/* 수업 시간 */}
          {durationMinutes && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
              <ClockIcon className="h-4 w-4" />
              <span>회당 {formatDuration(durationMinutes)}</span>
            </div>
          )}

          {/* 총 회차 */}
          {totalSessions && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
              <CalendarIcon className="h-4 w-4" />
              <span>총 {totalSessions}회</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
