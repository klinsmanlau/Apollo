import { requireProjectRole } from "@/lib/auth";
import { readWorkbookHeaders } from "@/lib/import/zephyr";
import { suggestMapping } from "@/lib/import/fields";

// Node runtime (ExcelJS needs it). Preflight only reads headers + a few sample
// rows so the client can confirm the column → field mapping before importing.
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  try {
    await requireProjectRole(projectId, "lead");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Please choose a file to import" }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  if (!name.endsWith(".xlsx") && !isCsv) {
    return Response.json(
      { error: "Only .xlsx or .csv files are supported" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const { headers, sampleRows, rowCount } = await readWorkbookHeaders(buffer, {
      csv: isCsv,
    });
    if (headers.length === 0) {
      return Response.json(
        { error: "No columns found in the first row." },
        { status: 400 }
      );
    }
    return Response.json({
      headers,
      sampleRows,
      rowCount,
      suggested: suggestMapping(headers),
    });
  } catch {
    return Response.json(
      { error: "Could not read the file — is it a valid .xlsx or .csv?" },
      { status: 400 }
    );
  }
}
