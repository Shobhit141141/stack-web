export const FILE_PIPELINE_RULE = "─".repeat(62);

function trimVal(v: string, max = 96): string {
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}…`;
}

type FieldValue = string | number | boolean | undefined | null;

export function filePipelinePanel(
  stage: string,
  fileId: string,
  fields: Record<string, FieldValue>
): string {
  const lines: string[] = [
    FILE_PIPELINE_RULE,
    `  ${stage}`,
    `  fileId   ${fileId}`,
  ];
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null || val === "") continue;
    const s = typeof val === "boolean" ? (val ? "true" : "false") : String(val);
    lines.push(`  ${key.padEnd(10)} ${trimVal(s, 120)}`);
  }
  lines.push(FILE_PIPELINE_RULE);
  return lines.join("\n");
}
