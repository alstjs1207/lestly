import type { Route } from "./+types/bulk-create";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { getStudentTypes } from "../../../organizations/student-types.server";
import { requireAdminRole } from "../../guards.server";
import { parseBulkStudents } from "../../lib/student-bulk";
import {
  createBulkStudents,
  findBulkStudentDuplicates,
} from "../../lib/student-bulk.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const formData = await request.formData();
  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("students") ?? ""));
  } catch {
    return data({ error: "수강생 명단을 확인해 주세요." }, { status: 400 });
  }
  const studentTypes = await getStudentTypes(client, organizationId);
  const parsed = parseBulkStudents(input, studentTypes);
  if (!parsed.success) {
    return data(
      {
        error:
          "입력 오류를 수정한 후 다시 등록해 주세요. 아직 등록된 수강생은 없습니다.",
        results: Array.isArray(input)
          ? input.flatMap((row, index) => {
              const errors = parsed.error.issues.filter(
                (issue) => issue.path[0] === index,
              );
              return errors.length && typeof row?.id === "string"
                ? [
                    {
                      id: row.id,
                      success: false,
                      error: errors.map((issue) => issue.message).join(" "),
                    },
                  ]
                : [];
            })
          : [],
      },
      { status: 400 },
    );
  }
  try {
    const duplicates = await findBulkStudentDuplicates(
      client,
      organizationId,
      parsed.data,
    );
    if (duplicates.length) {
      return data(
        {
          error:
            "중복 전화번호를 확인해 주세요. 아직 등록된 수강생은 없습니다.",
          results: duplicates,
        },
        { status: 409 },
      );
    }
  } catch (error) {
    console.error("Failed to check bulk student duplicates", error);
    return data(
      {
        error:
          "전화번호 중복 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
  return data({
    results: await createBulkStudents(client, organizationId, parsed.data),
  });
}
