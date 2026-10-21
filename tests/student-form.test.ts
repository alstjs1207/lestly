import assert from "node:assert/strict";
import test from "node:test";

import {
  addYearsToDateString,
  getDefaultStudentClassDates,
} from "../app/features/admin/lib/student-class-dates.ts";
import {
  normalizePhone,
  parseStudentForm,
} from "../app/features/admin/lib/student-form.server.ts";

function validStudentForm() {
  const formData = new FormData();
  const entries = [
    ["name", "홍길동"],
    ["phone", "010-1234-5678"],
    ["email", ""],
    ["type", "EXAMINEE"],
    ["region", "서울"],
    ["birth_date", ""],
    ["class_start_date", "2026-08-23"],
    ["class_end_date", "2027-08-23"],
    ["parent_name", ""],
    ["parent_phone", ""],
    ["description", ""],
    ["color", "#3B82F6"],
  ] as const;

  for (const [key, value] of entries) formData.append(key, value);
  return formData;
}

test("student form accepts a formatted phone and empty optional fields", () => {
  const result = parseStudentForm(validStudentForm());

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.email, null);
  assert.equal(result.data.birth_date, null);
  assert.equal(normalizePhone(result.data.phone), "01012345678");
});

test("student form rejects an invalid phone number", () => {
  const formData = validStudentForm();
  formData.set("phone", "010-12");

  const result = parseStudentForm(formData);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.error.flatten().fieldErrors.phone, [
    "전화번호 형식을 확인해 주세요.",
  ]);
});

test("student form accepts omitted email but validates a provided address", () => {
  const formData = validStudentForm();
  formData.delete("email");
  const result = parseStudentForm(formData);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, null);
  formData.set("email", "invalid-address");
  assert.equal(parseStudentForm(formData).success, false);
});

test("student form rejects an end date earlier than the start date", () => {
  const formData = validStudentForm();
  formData.set("class_end_date", "2026-08-22");

  const result = parseStudentForm(formData);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.error.flatten().fieldErrors.class_end_date, [
    "수업 종료일은 시작일 이후여야 합니다.",
  ]);
});

test("student form accepts empty class dates", () => {
  const formData = validStudentForm();
  formData.set("class_start_date", "");
  formData.set("class_end_date", "");

  const result = parseStudentForm(formData);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.class_start_date, null);
  assert.equal(result.data.class_end_date, null);
});

test("default class dates use the Korean registration date and one year", () => {
  const result = getDefaultStudentClassDates(
    new Date("2026-08-23T15:30:00.000Z"),
  );

  assert.deepEqual(result, {
    classStartDate: "2026-08-24",
    classEndDate: "2027-08-24",
  });
});

test("one-year class date defaults clamp leap day to February 28", () => {
  assert.equal(addYearsToDateString("2024-02-29"), "2025-02-28");
});
