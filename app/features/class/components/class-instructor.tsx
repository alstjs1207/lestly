import type { InstructorSns } from "../queries";

interface ClassInstructorProps {
  name?: string | null;
  info?: string | null;
  photoUrl?: string | null;
  career: string[];
  sns: InstructorSns;
}

// SNS 아이콘 컴포넌트
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export default function ClassInstructor({
  name,
  info,
  photoUrl,
  career,
  sns,
}: ClassInstructorProps) {
  if (!name) return null;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* 강사 사진 */}
      {photoUrl && (
        <div className="mb-4 flex justify-center">
          <div className="h-80 w-80 overflow-hidden rounded-full border-2 border-gray-100">
            <img
              src={photoUrl}
              alt={`${name} 강사`}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      )}

      {/* 강사 이름 & 타이틀 */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-800">
          {name}
          <span className="ml-1 font-normal text-gray-500">강사</span>
        </h3>
        {info && <p className="mt-1 text-sm text-gray-600">{info}</p>}
      </div>

      {/* 경력 */}
      {career.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {career.map((item, index) => (
            <li key={index} className="flex items-start text-sm text-gray-600">
              <span className="mr-2">&#x2022;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {/* SNS 링크 */}
      {(sns.instagram || sns.youtube) && (
        <div className="flex gap-3 pt-2">
          {sns.instagram && (
            <a
              href={sns.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white transition-opacity hover:opacity-90"
            >
              <InstagramIcon className="h-5 w-5" />
            </a>
          )}
          {sns.youtube && (
            <a
              href={sns.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white transition-opacity hover:opacity-90"
            >
              <YoutubeIcon className="h-5 w-5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
