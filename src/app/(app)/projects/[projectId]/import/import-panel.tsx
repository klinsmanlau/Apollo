"use client";

import { useRouter } from "next/navigation";
import { ImportForm } from "./import-form";
import { useImport } from "../use-import";

export function ImportPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const imp = useImport(projectId, () => router.refresh());
  return <ImportForm projectId={projectId} imp={imp} />;
}
