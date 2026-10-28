import type { Route } from "./+types/student-types";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import { RequestBodyError, readBoundedJson } from "~/core/lib/request-body";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  parseStudentTypePolicy,
  studentTypePolicyFailure,
} from "~/features/organizations/student-type-policy";

import { getStudentTypes } from "../../organizations/student-types.server";
import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  headers.set("Cache-Control", "private, no-store");
  try {
    return data(
      { studentTypes: await getStudentTypes(client, organizationId) },
      { headers },
    );
  } catch {
    return data(
      { error: "최신 유형 목록을 불러오지 못했습니다. 다시 시도해 주세요." },
      { status: 500, headers },
    );
  }
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  let parsed;
  try {
    parsed = parseStudentTypePolicy(await readBoundedJson(request, 65536));
  } catch (error) {
    return data(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "요청 내용을 확인해 주세요.",
      },
      {
        status: error instanceof RequestBodyError ? error.status : 400,
        headers,
      },
    );
  }
  if (!parsed.success)
    return data(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400, headers },
    );
  const { error } = await client.rpc("save_student_types", {
    p_org: organizationId,
    p_types: parsed.data.types,
    p_expected_types: parsed.data.expected,
  });
  if (error) {
    const failure = studentTypePolicyFailure(error);
    return data(
      { success: false, error: failure.error },
      { status: failure.status, headers },
    );
  }
  return data({ success: true, error: null }, { headers });
}
