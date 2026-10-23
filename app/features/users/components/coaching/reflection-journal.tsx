import { PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { toKSTDateString } from "~/features/schedules/utils/kst";

import {
  type ReflectionEntries,
  parseReflections,
  reflectionStorageKey,
} from "../../utils/reflections";

function useReflections(profileId: string) {
  const key = reflectionStorageKey(profileId);
  const [store, setStore] = useState<{
    key: string;
    entries: ReflectionEntries;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setStore({ key, entries: parseReflections(localStorage.getItem(key)) });
        setError(false);
      } catch {
        setStore({ key, entries: {} });
        setError(true);
      }
    };
    read();
    const listener = (event: StorageEvent) => {
      if (event.key === key || event.key === null) read();
    };
    window.addEventListener("storage", listener);
    window.addEventListener("lestly-reflections", read);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("lestly-reflections", read);
    };
  }, [key]);
  const save = (day: string, text: string) => {
    try {
      const entries = parseReflections(localStorage.getItem(key));
      entries[day] = {
        text: text.trim().slice(0, 500),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(entries));
      setStore({ key, entries });
      setError(false);
      window.dispatchEvent(new Event("lestly-reflections"));
      return true;
    } catch {
      setError(true);
      return false;
    }
  };
  return { entries: store?.key === key ? store.entries : null, save, error };
}

export function ReflectionJournal({
  profileId,
  today: initialToday,
  history = false,
}: {
  profileId: string;
  today: string;
  history?: boolean;
}) {
  const { entries, save, error } = useReflections(profileId);
  const [today, setToday] = useState(initialToday);
  useEffect(() => {
    const update = () => setToday(toKSTDateString(new Date()));
    update();
    const timer = setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border border-violet-100 bg-white p-5 md:p-6 dark:border-violet-900/40 dark:bg-[#191723]"
        aria-label="오늘의 한 줄"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <PencilLine className="size-4 text-violet-600 dark:text-violet-300" />
            오늘의 한 줄
          </h2>
          {!history && (
            <Link
              to="/learning-records?tab=reflections"
              className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
            >
              지난 회고 →
            </Link>
          )}
        </div>
        {entries ? (
          <ReflectionEditor
            key={`${profileId}:${today}`}
            day={today}
            initialText={entries[today]?.text ?? ""}
            onSave={save}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            기록을 불러오는 중이에요.
          </p>
        )}
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          이 계정의 회고는 현재 브라우저에만 저장돼요. 다른 기기에서는 보이지
          않으며, 브라우저 데이터를 지우면 삭제돼요.
        </p>
        {error && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            브라우저에 기록을 저장하거나 불러올 수 없어요. 브라우저의 저장
            설정을 확인해주세요.
          </p>
        )}
      </section>
      {history && (
        <section className="rounded-2xl border border-violet-100 bg-white p-5 md:p-6 dark:border-violet-900/40 dark:bg-[#191723]">
          <h2 className="mb-4 font-semibold">남겨둔 한 줄</h2>
          {!entries ? (
            <p className="text-muted-foreground text-sm">
              기록을 불러오는 중이에요.
            </p>
          ) : Object.keys(entries).length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">
              아직 남긴 회고가 없어요. 오늘의 마음부터 짧게 적어볼까요?
            </p>
          ) : (
            Object.entries(entries)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([day, entry]) => (
                <article
                  key={day}
                  className="border-b border-violet-100 py-4 first:pt-0 last:border-0 last:pb-0 dark:border-violet-900/40"
                >
                  <time
                    className="text-muted-foreground text-sm"
                    dateTime={day}
                  >
                    {day.replaceAll("-", ". ")}
                  </time>
                  <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {entry.text}
                  </p>
                </article>
              ))
          )}
        </section>
      )}
    </div>
  );
}

function ReflectionEditor({
  day,
  initialText,
  onSave,
}: {
  day: string;
  initialText: string;
  onSave: (day: string, text: string) => boolean;
}) {
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState("");
  return (
    <>
      <label
        htmlFor="daily-reflection"
        className="text-muted-foreground mb-3 block text-sm"
      >
        오늘 잘한 것 하나, 기억하고 싶은 것이 있나요?
      </label>
      <Textarea
        id="daily-reflection"
        maxLength={500}
        rows={3}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setMessage("");
        }}
        className="placeholder:text-muted-foreground min-h-24 resize-y border-violet-100 bg-violet-50/40 text-base dark:border-violet-900/40 dark:bg-violet-950/20"
        placeholder="작은 발견도 좋아요. 나에게 한마디 남겨보세요."
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-muted-foreground text-sm">
          {message ||
            (initialText
              ? "오늘의 한 줄을 남겼어요."
              : "짧아도 괜찮아요. 나를 위한 기록이에요.")}
        </p>
        <Button
          variant="outline"
          disabled={!text.trim()}
          onClick={() =>
            setMessage(
              onSave(day, text)
                ? "오늘의 한 줄을 저장했어요."
                : "저장하지 못했어요. 작성한 내용은 이 화면에 남아 있어요.",
            )
          }
        >
          기록 남기기
        </Button>
      </div>
    </>
  );
}
