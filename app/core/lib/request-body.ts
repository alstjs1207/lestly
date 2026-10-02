export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Bound streamed bodies too, rather than trusting Content-Length alone. */
export async function readBoundedJson(
  request: Request,
  maxBytes = 8192,
): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  ) {
    throw new RequestBodyError("JSON 요청이 필요합니다.", 415);
  }
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > maxBytes) {
    throw new RequestBodyError("요청 내용이 너무 큽니다.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("요청 내용을 확인해주세요.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("요청 내용이 너무 큽니다.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new RequestBodyError("요청 내용을 확인해주세요.", 400);
    }
  } finally {
    reader.releaseLock();
  }
}
